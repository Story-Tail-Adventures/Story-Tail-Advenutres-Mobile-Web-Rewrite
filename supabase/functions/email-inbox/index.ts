/**
 * §3.10 Stage 4: client replies by email, read out of the app's own IONOS mailbox over IMAP
 * (Data-Model §12.10; Gyasi, 2026-10-16: IMAP on info@, not Resend).
 *
 * NO HUMAN CALLER. pg_cron's `email_inbox_tick()` posts here every two minutes with the service
 * role key; any user token is 403. One run:
 *   1. Log in to the mailbox (imapflow 2.2.1, used as docs/IMAP-Library-Security-Review.md §3
 *      requires: TLS on 993 with certificates checked, no logger, no proxy, deadlines set).
 *   2. Take up to 25 messages from INBOX: size, structure and only the headers this file reads.
 *   3. Per message: find the reply token (the `info+<token>@` recipient, or our Message-ID in
 *      In-Reply-To / References), read OUR server's Authentication-Results (pinned by
 *      EMAIL_AUTHSERV_ID), download only the text part, keep only the new words (card numbers
 *      masked), and hand it all to `email_inbound_record`, which checks token, verified sender and
 *      thread and writes the message, the thread bump and its audit row in one transaction. A
 *      message seen before is a no-op there.
 *   4. Move it to `Processed` (accepted) or `Rejected` (everything else). A message that cannot be
 *      read goes to `Failed`, so one bad email never jams the inbox (review, 2026-10-16).
 *   5. An accepted reply that carried files gets one short note, to the verified sender only.
 *   6. Handled mail older than 30 days is deleted from those folders: a client may have pasted a
 *      card number into a reply, and the mailbox must not keep it (CLAUDE.md rule 1).
 *
 * A message is moved only AFTER it is recorded, so a crash leaves it in INBOX for the next run,
 * where the dedupe makes the second pass harmless. A database error stops the run (the next one
 * retries); a message-specific error moves that message to `Failed` and the run goes on.
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
/** Handled mail is deleted from the folders below after this many days. */
const KEEP_DAYS = 30;
const PROCESSED = "Processed";
const REJECTED = "Rejected";
const FAILED = "Failed";
/** Only the headers this function reads: never a whole header block from an unknown sender. */
const HEADERS = [
  "from",
  "to",
  "cc",
  "delivered-to",
  "x-original-to",
  "subject",
  "message-id",
  "in-reply-to",
  "references",
  "authentication-results",
  "auto-submitted",
  "precedence",
  "x-autoreply",
  "x-autorespond",
];

interface Fetched {
  uid: number;
  size: number;
  headers: [string, string][];
  structure: BodyNode | undefined;
  subject: string;
}

/** A failure that is the database's, not the message's: stop the run and let the next one retry. */
class RecordError extends Error {}

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  try {
    if (req.method !== "POST") return problem(forbidden("Use POST to read the inbox."));
    requireServiceRole(req, "The email inbox reader");

    const cfg = inboxConfigFromEnv((name) => Deno.env.get(name));
    if (!cfg) throw new Error("Set EMAIL_SMTP_USER, EMAIL_SMTP_PASSWORD and EMAIL_FROM_ADDRESS. See supabase/README.md.");
    const domain = cfg.mailbox.split("@")[1];
    // OUR server's name in Authentication-Results. Unset: no sender can be verified, so every reply
    // is Rejected (fail closed) until it is read off a real reply. See supabase/README.md.
    const authservId = Deno.env.get("EMAIL_AUTHSERV_ID")?.trim() || null;

    try {
      return json(await readInbox(cfg, domain, authservId));
    } catch (err) {
      // imapflow errors carry the server's response and sometimes the command; keep only the gist.
      const e = err as { message?: string; code?: string };
      throw new Error(`email-inbox: ${e.code ?? "error"}: ${(e.message ?? "failed").slice(0, 200)}`);
    }
  } catch (err) {
    return problem(err);
  }
});

async function readInbox(
  cfg: NonNullable<ReturnType<typeof inboxConfigFromEnv>>,
  domain: string,
  authservId: string | null,
): Promise<Record<string, unknown>> {
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
    // A hung server cannot hold a run (or overlap the next tick) for long.
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 45_000,
  });

  const db = serviceClient();
  const started = Date.now();
  const counts: Record<string, number> = {};
  const bump = (k: string) => (counts[k] = (counts[k] ?? 0) + 1);
  let skipped = 0;
  let purged = 0;

  await client.connect();
  try {
    await ensureFolders(client, [PROCESSED, REJECTED, FAILED]);
    const lock = await client.getMailboxLock("INBOX");
    try {
      const mailbox = client.mailbox;
      const exists = mailbox && typeof mailbox === "object" ? Number(mailbox.exists ?? 0) : 0;
      const uidValidity = mailbox && typeof mailbox === "object" ? String(mailbox.uidValidity ?? "0") : "0";

      // Collect first: imapflow runs no other command while a fetch is being iterated.
      const batch: Fetched[] = [];
      if (exists > 0) {
        for await (
          const m of client.fetch(`1:${Math.min(exists, BATCH)}`, {
            uid: true,
            size: true,
            bodyStructure: true,
            headers: HEADERS,
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
      }

      for (const m of batch) {
        if (Date.now() - started > TIME_BUDGET_MS) {
          skipped += 1;
          continue;
        }
        let folder: string;
        try {
          if (m.size > MAX_MESSAGE_BYTES) {
            folder = REJECTED;
            bump("too_large");
          } else {
            const result = await handle(client, db, cfg.mailbox, domain, authservId, uidValidity, m);
            folder = result.outcome === "accepted" ? PROCESSED : REJECTED;
            // A re-delivered copy answers the first copy's outcome; the summary says what it was.
            bump(result.duplicate ? "duplicate" : result.outcome);
            if (result.outcome === "accepted" && !result.duplicate && result.files > 0 && result.replyTo) {
              await filesNote(result.replyTo, m).catch((err) =>
                console.error("email-inbox: files note failed", (err as Error)?.message ?? "error")
              );
            }
          }
        } catch (err) {
          if (err instanceof RecordError) throw err;
          // Something about THIS message (a part that will not download, odd structure): set it
          // aside for a person to look at, rather than retry it at the head of every run.
          console.error("email-inbox: message failed", (err as Error)?.message?.slice(0, 200) ?? "error");
          folder = FAILED;
          bump("failed");
        }
        await client.messageMove(String(m.uid), folder, { uid: true });
      }
    } finally {
      lock.release();
    }

    if (Date.now() - started < TIME_BUDGET_MS) purged = await purgeOld(client, [PROCESSED, REJECTED, FAILED]);
  } finally {
    await client.logout().catch(() => undefined);
  }

  return { read: Object.values(counts).reduce((a, b) => a + b, 0), outcomes: counts, skipped, purged };
}

/** Create the folders on the first run; one that already exists is left alone. */
async function ensureFolders(client: ImapFlow, names: string[]): Promise<void> {
  const have = new Set((await client.list()).map((b: { path: string }) => b.path));
  for (const name of names) {
    if (!have.has(name)) await client.mailboxCreate(name);
  }
}

/**
 * Delete handled mail older than KEEP_DAYS from the given folders. The thread already holds what
 * the client wrote (card numbers masked); the original, which may hold an unmasked one, goes.
 */
async function purgeOld(client: ImapFlow, folders: string[]): Promise<number> {
  const before = new Date(Date.now() - KEEP_DAYS * 24 * 60 * 60 * 1000);
  let total = 0;
  for (const folder of folders) {
    const lock = await client.getMailboxLock(folder);
    try {
      const uids = await client.search({ before }, { uid: true });
      if (Array.isArray(uids) && uids.length > 0) {
        await client.messageDelete(uids.join(","), { uid: true });
        total += uids.length;
      }
    } finally {
      lock.release();
    }
  }
  return total;
}

async function handle(
  client: ImapFlow,
  db: ReturnType<typeof serviceClient>,
  mailbox: string,
  domain: string,
  authservId: string | null,
  uidValidity: string,
  m: Fetched,
): Promise<{ outcome: string; duplicate: boolean; files: number; replyTo: string | null }> {
  const token = replyTokenFrom(recipientsOf(m.headers), mailbox);
  const outboxId = token ? null : outboxIdFrom(m.headers, domain);
  const files = countFiles(m.structure);
  const from = fromOf(m.headers);

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
    p_provider_email_id: await dedupeKey(m.headers, uidValidity, m.uid),
    // No token: the hash of "", which no 26-character token can have, so the SQL falls through to
    // the email-it-answers match.
    p_token_hash: await tokenHashParam(token ?? ""),
    p_from: from ?? "",
    // The email-it-answers match rests on a Message-ID, which travels in forwards and CCs, so it
    // needs DMARC itself; the token path also accepts aligned SPF and DKIM (review, 2026-10-16).
    p_sender_verified: senderVerified(m.headers, from, authservId, !token),
    p_body: body,
    p_files: files,
    p_message_id: uuidV7(),
    p_auto_reply: isAutoReply(m.headers, m.subject),
    p_reply_outbox_id: outboxId ?? undefined,
  });
  if (error) throw new RecordError(`recording the reply failed: ${error.message}`);
  const row = (data ?? [])[0] as { outcome: string; duplicate: boolean; reply_to: string | null } | undefined;
  if (!row) throw new RecordError("recording the reply returned nothing");
  return { outcome: row.outcome, duplicate: row.duplicate, files, replyTo: row.reply_to };
}

/** One text part, decoded, and never more than MAX_TEXT_BYTES of it. */
async function downloadText(client: ImapFlow, uid: number, part: string): Promise<string> {
  const downloaded = await client.download(String(uid), part, { uid: true, maxBytes: MAX_TEXT_BYTES });
  if (!downloaded?.content) throw new Error(`part ${part} has no content`);
  const chunks: Uint8Array[] = [];
  let total = 0;
  for await (const chunk of downloaded.content as AsyncIterable<Uint8Array>) {
    const room = MAX_TEXT_BYTES - total;
    chunks.push(chunk.length > room ? chunk.subarray(0, room) : chunk);
    total += Math.min(chunk.length, room);
    if (total >= MAX_TEXT_BYTES) break;
  }
  const bytes = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    bytes.set(c, at);
    at += c.length;
  }
  const charset = typeof downloaded.meta?.charset === "string" ? downloaded.meta.charset : "utf-8";
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
