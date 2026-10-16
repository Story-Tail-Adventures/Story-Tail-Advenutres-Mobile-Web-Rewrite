/**
 * §3.10 Stage 4: a client's reply by email lands in their thread (Data-Model §12.10).
 *
 * CALLED BY RESEND, not a person. Mail to `reply.story-tail.com` is received by Resend, which
 * posts an `email.received` webhook here. verify_jwt is OFF for this function (config.toml):
 * Resend sends no Supabase token. THE SIGNATURE IS THE GATE: an unsigned, mis-signed or stale
 * request is a 401 before anything is read, fetched or written.
 *
 * One webhook:
 *   1. Verify the Svix signature over the raw body (`RESEND_WEBHOOK_SECRET`).
 *   2. Find our reply token in the recipients. The webhook carries metadata only, so the words
 *      are fetched over Resend's API (`RESEND_API_KEY`): the webhook is a doorbell.
 *   3. Reduce the mail to the new words (quoted history and signatures cut, HTML never
 *      rendered) and hand everything to `email_inbound_record`, which checks the token, the
 *      verified sender and the thread, and writes the message, the thread bump and the audit row
 *      in one transaction. A retried webhook is a no-op there.
 *      An out-of-office or other automatic answer is recorded and dropped, never posted.
 *   4. An accepted reply that carried files gets ONE short note, to the verified sender only,
 *      saying files go in the app. A rejected one gets nothing: answering a forged sender is
 *      backscatter.
 *
 * Answers 200 for anything decided (accepted or rejected), so Resend does not retry a verdict;
 * 500 only when something failed on our side (the fetch, the database), so it does.
 */
import { corsHeaders } from "../_shared/cors.ts";
import { problem } from "../_shared/problem.ts";
import { serviceClient } from "../_shared/db.ts";
import { uuidV7 } from "../_shared/uuid.ts";
import { emailConfigFromEnv, tokenHashParam } from "../_shared/email.ts";
import {
  bareAddress,
  countFiles,
  isAutoReply,
  newWordsOnly,
  replyTokenFrom,
  senderVerified,
  verifySvix,
} from "../_shared/emailInbound.ts";
import { smtpTransport } from "../_shared/smtp.ts";

const RESEND_API = (Deno.env.get("RESEND_API_BASE") ?? "https://api.resend.com").replace(/\/+$/, "");
/** Ten times the message ceiling: anything longer is not a reply worth reading. */
const MAX_FETCHED_TEXT = 80_000;

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") return json({ error: "Use POST." }, 405);

    const secret = Deno.env.get("RESEND_WEBHOOK_SECRET") ?? "";
    const apiKey = Deno.env.get("RESEND_API_KEY") ?? "";
    const replyDomain = (Deno.env.get("EMAIL_REPLY_DOMAIN") ?? "").trim().toLowerCase();
    if (!secret || !apiKey || !replyDomain) {
      throw new Error("Set RESEND_WEBHOOK_SECRET, RESEND_API_KEY and EMAIL_REPLY_DOMAIN. See supabase/README.md.");
    }

    const raw = await req.text();
    if (raw.length > 256_000) return json({ error: "Too large." }, 413);
    const signed = await verifySvix(secret, {
      id: req.headers.get("svix-id"),
      timestamp: req.headers.get("svix-timestamp"),
      signature: req.headers.get("svix-signature"),
    }, raw);
    if (!signed) return json({ error: "Bad signature." }, 401);

    let event: { type?: unknown; data?: Record<string, unknown> };
    try {
      event = JSON.parse(raw);
    } catch {
      return json({ ignored: "not json" });
    }
    if (event.type !== "email.received" || !event.data) return json({ ignored: String(event.type) });

    const emailId = typeof event.data.email_id === "string" ? event.data.email_id : "";
    if (!/^[A-Za-z0-9-]{1,200}$/.test(emailId)) return json({ ignored: "no email id" });

    const recipients = [
      ...(Array.isArray(event.data.to) ? event.data.to : []),
      ...(Array.isArray(event.data.received_for) ? event.data.received_for : []),
    ];
    const token = replyTokenFrom(recipients, replyDomain);

    const db = serviceClient();
    // Not ours at all: record it (as an unknown token) without fetching a stranger's mail.
    if (!token) {
      await record(db, emailId, await tokenHashParam(""), null, false, "", 0);
      return json({ outcome: "unknown_token" });
    }

    const res = await fetch(`${RESEND_API}/emails/receiving/${encodeURIComponent(emailId)}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`fetching the email failed: ${res.status}`);
    const mail = await res.json() as Record<string, unknown>;

    const text = typeof mail.text === "string" ? mail.text.slice(0, MAX_FETCHED_TEXT) : null;
    const html = typeof mail.html === "string" ? mail.html.slice(0, MAX_FETCHED_TEXT * 4) : null;
    const from = bareAddress(mail.from);
    const files = countFiles(mail.attachments);

    const result = await record(
      db,
      emailId,
      await tokenHashParam(token),
      from,
      senderVerified(mail.authentication),
      newWordsOnly(text, html),
      files,
      isAutoReply(mail.headers, mail.subject),
    );

    if (result.outcome === "accepted" && !result.duplicate && files > 0 && result.reply_to) {
      await filesNote(result.reply_to, mail).catch((err) =>
        console.error("email-inbound: files note failed", (err as Error)?.message ?? err)
      );
    }
    return json({ outcome: result.outcome, duplicate: result.duplicate });
  } catch (err) {
    return problem(err);
  }
});

interface Recorded {
  outcome: string;
  message_id: string | null;
  duplicate: boolean;
  reply_to: string | null;
}

async function record(
  db: ReturnType<typeof serviceClient>,
  emailId: string,
  tokenHash: string,
  from: string | null,
  verified: boolean,
  body: string,
  files: number,
  autoReply = false,
): Promise<Recorded> {
  const { data, error } = await db.rpc("email_inbound_record", {
    p_provider_email_id: emailId,
    p_token_hash: tokenHash,
    p_from: from ?? "",
    p_sender_verified: verified,
    p_body: body,
    p_files: files,
    p_message_id: uuidV7(),
    p_auto_reply: autoReply,
  });
  if (error) throw new Error(`recording the reply failed: ${error.message}`);
  const row = (data ?? [])[0] as Recorded | undefined;
  if (!row) throw new Error("recording the reply returned nothing");
  return row;
}

/** The one automatic answer: files were left off, add them in the app. Verified sender only. */
async function filesNote(to: string, mail: Record<string, unknown>): Promise<void> {
  const cfg = emailConfigFromEnv((name) => Deno.env.get(name));
  if (!cfg) return;
  const subject = typeof mail.subject === "string" && !/[\r\n]/.test(mail.subject)
    ? `Re: ${mail.subject.replace(/^(re:\s*)+/i, "").slice(0, 150)}`
    : "Your files";
  const inReplyTo = typeof mail.message_id === "string" && /^<[^<>\s\r\n]+>$/.test(mail.message_id)
    ? mail.message_id
    : undefined;
  const transport = smtpTransport(cfg);
  try {
    await transport.sendMail({
      from: { name: "Story-Tail Adventures", address: cfg.fromAddress },
      to,
      subject,
      ...(inReplyTo ? { inReplyTo, references: inReplyTo } : {}),
      text: "Thanks for your reply. It's in your conversation now.\n\n" +
        "Files don't come through email, so the ones you attached didn't make it. " +
        `You can add them in the app here: ${cfg.siteUrl}/messages`,
      headers: { "Auto-Submitted": "auto-replied" },
      disableFileAccess: true,
      disableUrlAccess: true,
    });
  } finally {
    transport.close();
  }
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}
