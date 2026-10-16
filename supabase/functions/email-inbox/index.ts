/**
 * §3.10 Stage 4: client replies by email, read out of the app's own IONOS mailbox over IMAP
 * (Data-Model §12.10; Gyasi, 2026-10-16: IMAP on info@, not Resend).
 *
 * NO HUMAN CALLER. pg_cron's `email_inbox_tick()` posts here every two minutes with the service
 * role key; any user token is 403. One run:
 *   1. Log in to the mailbox (imapflow 2.2.1, used as docs/IMAP-Library-Security-Review.md §3
 *      requires: TLS on 993 with certificates checked, no logger, no proxy).
 *   2. Take up to 25 messages from INBOX: headers, size and structure only.
 *   3. Per message: find the reply token (the `info+<token>@` recipient, or our Message-ID in
 *      In-Reply-To / References), read the TOPMOST Authentication-Results, download only the text
 *      part, keep only the new words (card numbers masked), and hand it all to
 *      `email_inbound_record`, which checks token, verified sender and thread and writes the
 *      message, the thread bump and its audit row in one transaction. A message seen before is a
 *      no-op there (keyed on its Message-ID, or the mailbox UID without one).
 *   4. Move it to `Processed` (accepted) or `Rejected` (everything else). Nothing is deleted.
 *   5. An accepted reply that carried files gets one short note, to the verified sender only.
 *
 * A message is moved only AFTER it is recorded, so a crash leaves it in INBOX for the next run,
 * where the dedupe makes the second pass harmless.
 */
import { ImapFlow } from "imapflow";
import { requireServiceRole } from "../_shared/auth.ts";
import { corsHeaders, handlePreflight } from "../_shared/cors.ts";
import { forbidden, problem } from "../_shared/problem.ts";
import { serviceClient } from "../_shared/db.ts";
import { uuidV7 } from "../_shared/uuid.ts";
import { maskCardNumbers } from "../_shared/push.ts";
import { emailConfigFromEnv, inboxConfigFromEnv, tokenHashParam } from "../_shared/email.ts";
import {
  type BodyNode,
  countFiles,
  dedupeKey,
  fromOf,
  isAutoReply,
  newWordsOnly,
  outboxIdFrom,
  parseHeaders,
  recipientsOf,
  replyTokenFrom,
  senderVerified,
  textPart,
} from "../_shared/emailInbound.ts";
import { smtpTransport } from "../_shared/smtp.ts";

const BATCH = 25;
/** Anything bigger is not a reply worth reading; it is moved aside without being downloaded. */
const MAX_MESSAGE_BYTES = 1_000_000;
/** The most of a text part read: ten times the message ceiling. */
const MAX_TEXT_BYTES = 80_000;
/** Stop starting new messages after this long; the rest wait for the next run. */
const TIME_BUDGET_MS = 60_000;
const PROCESSED = "Processed";
const REJECTED = "Rejected";

interface Fetched {
  uid: number;
  size: number;
  headers: [string, string][];
  structure: BodyNode | undefined;
  subject: string;
}

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  try {
    if (req.method !== "POST") return problem(forbidden("Use POST to read the inbox."));
    requireServiceRole(req, "The email inbox reader");

    const cfg = inboxConfigFromEnv((name) => Deno.env.get(name));
    if (!cfg) throw new Error("Set EMAIL_SMTP_USER, EMAIL_SMTP_PASSWORD and EMAIL_FROM_ADDRESS. See supabase/README.md.");
    const domain = cfg.mailbox.split("@")[1];

    const client = new ImapFlow({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.secure,
      // Never downgrade: TLS from the first byte on 993, certificates checked. A local test server
      // (inboxConfigFromEnv) is the only plain connection allowed.
      doSTARTTLS: cfg.secure ? undefined : false,
      tls: { rejectUnauthorized: true, servername: cfg.host },
      auth: { user: cfg.user, pass: cfg.password },
      // Its logger can print message contents.
      logger: false,
      disableAutoIdle: true,
    });

    const db = serviceClient();
    const started = Date.now();
    const counts: Record<string, number> = {};
    let skipped = 0;

    await client.connect();
    try {
      await ensureFolders(client, [PROCESSED, REJECTED]);
      const lock = await client.getMailboxLock("INBOX");
      try {
        const mailbox = client.mailbox;
        const exists = mailbox && typeof mailbox === "object" ? Number(mailbox.exists ?? 0) : 0;
        const uidValidity = mailbox && typeof mailbox === "object" ? String(mailbox.uidValidity ?? "0") : "0";
        if (exists === 0) return json({ read: 0 });

        // Collect first: imapflow runs no other command while a fetch is being iterated.
        const batch: Fetched[] = [];
        for await (
          const m of client.fetch(`1:${Math.min(exists, BATCH)}`, {
            uid: true,
            size: true,
            bodyStructure: true,
            headers: true,
          })
        ) {
          const headers = parseHeaders(m.headers ? new TextDecoder().decode(m.headers) : "");
          batch.push({
            uid: m.uid,
            size: Number(m.size ?? 0),
            headers,
            structure: m.bodyStructure as BodyNode | undefined,
            subject: headers.find(([n]) => n === "subject")?.[1] ?? "",
          });
        }

        for (const m of batch) {
          if (Date.now() - started > TIME_BUDGET_MS) {
            skipped += 1;
            continue;
          }
          let outcome: string;
          let label: string;
          if (m.size > MAX_MESSAGE_BYTES) {
            outcome = label = "too_large";
          } else {
            const result = await handle(client, db, cfg.mailbox, domain, uidValidity, m);
            outcome = result.outcome;
            // A re-delivered copy answers the first copy's outcome; the summary says what it was.
            label = result.duplicate ? "duplicate" : result.outcome;
            if (result.outcome === "accepted" && !result.duplicate && result.files > 0 && result.replyTo) {
              await filesNote(result.replyTo, m).catch((err) =>
                console.error("email-inbox: files note failed", (err as Error)?.message ?? err)
              );
            }
          }
          await client.messageMove(String(m.uid), outcome === "accepted" ? PROCESSED : REJECTED, { uid: true });
          counts[label] = (counts[label] ?? 0) + 1;
        }
      } finally {
        lock.release();
      }
    } finally {
      await client.logout().catch(() => undefined);
    }

    return json({ read: Object.values(counts).reduce((a, b) => a + b, 0), outcomes: counts, skipped });
  } catch (err) {
    return problem(err);
  }
});

/** Create the two folders on the first run; a mailbox with them already is left alone. */
async function ensureFolders(client: ImapFlow, names: string[]): Promise<void> {
  const have = new Set((await client.list()).map((b: { path: string }) => b.path));
  for (const name of names) {
    if (!have.has(name)) await client.mailboxCreate(name).catch(() => undefined);
  }
}

async function handle(
  client: ImapFlow,
  db: ReturnType<typeof serviceClient>,
  mailbox: string,
  domain: string,
  uidValidity: string,
  m: Fetched,
): Promise<{ outcome: string; duplicate: boolean; files: number; replyTo: string | null }> {
  const token = replyTokenFrom(recipientsOf(m.headers), mailbox);
  const outboxId = token ? null : outboxIdFrom(m.headers, domain);
  const files = countFiles(m.structure);

  // Mail that names neither is not a reply to us: recorded (as an unknown token) without reading it.
  let body = "";
  if (token || outboxId) {
    const part = textPart(m.structure);
    if (part) {
      const text = await downloadText(client, m.uid, part.part);
      body = maskCardNumbers(newWordsOnly(part.html ? null : text, part.html ? text : null));
    }
  }

  const { data, error } = await db.rpc("email_inbound_record", {
    p_provider_email_id: dedupeKey(m.headers, uidValidity, m.uid),
    // No token: the hash of "", which no 26-character token can have, so the SQL falls through to
    // the email-it-answers match.
    p_token_hash: await tokenHashParam(token ?? ""),
    p_from: fromOf(m.headers) ?? "",
    p_sender_verified: senderVerified(m.headers),
    p_body: body,
    p_files: files,
    p_message_id: uuidV7(),
    p_auto_reply: isAutoReply(m.headers, m.subject),
    p_reply_outbox_id: outboxId ?? undefined,
  });
  if (error) throw new Error(`recording the reply failed: ${error.message}`);
  const row = (data ?? [])[0] as { outcome: string; duplicate: boolean; reply_to: string | null } | undefined;
  if (!row) throw new Error("recording the reply returned nothing");
  return { outcome: row.outcome, duplicate: row.duplicate, files, replyTo: row.reply_to };
}

/** One text part, decoded, and never more than MAX_TEXT_BYTES of it. */
async function downloadText(client: ImapFlow, uid: number, part: string): Promise<string> {
  const { content, meta } = await client.download(String(uid), part, { uid: true, maxBytes: MAX_TEXT_BYTES });
  const chunks: Uint8Array[] = [];
  let total = 0;
  for await (const chunk of content as AsyncIterable<Uint8Array>) {
    chunks.push(chunk);
    total += chunk.length;
    if (total >= MAX_TEXT_BYTES) break;
  }
  const bytes = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    bytes.set(c.subarray(0, Math.min(c.length, total - at)), at);
    at += c.length;
    if (at >= total) break;
  }
  const charset = typeof meta?.charset === "string" ? meta.charset : "utf-8";
  try {
    return new TextDecoder(charset).decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
}

/** The one automatic answer: files were left off, add them in the app. Verified sender only. */
async function filesNote(to: string, m: Fetched): Promise<void> {
  const cfg = emailConfigFromEnv((name) => Deno.env.get(name));
  if (!cfg) return;
  const subject = m.subject && !/[\r\n]/.test(m.subject)
    ? `Re: ${m.subject.replace(/^(re:\s*)+/i, "").slice(0, 150)}`
    : "Your files";
  const messageId = m.headers.find(([n]) => n === "message-id")?.[1];
  const inReplyTo = messageId && /^<[^<>\s\r\n]+>$/.test(messageId) ? messageId : undefined;
  const transport = smtpTransport(cfg);
  try {
    await transport.sendMail({
      from: { name: "Story-Tail Adventures", address: cfg.fromAddress },
      to,
      subject,
      ...(inReplyTo ? { inReplyTo, references: inReplyTo } : {}),
      text: "Thanks for your reply. It's in your conversation now.\n\n" +
        "Your attachments couldn't come along by email. " +
        `You can add them in the app whenever you're ready: ${cfg.siteUrl}/messages`,
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
