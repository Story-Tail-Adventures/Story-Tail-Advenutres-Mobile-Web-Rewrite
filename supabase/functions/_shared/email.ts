/**
 * §3.10 Stage 4: what an email to a client says, and how its secrets are made (Data-Model
 * §12.8 / §12.9, docs/Email-Provider-Review.md §6, docs/SMTP-Library-Security-Review.md §5).
 *
 * Pure apart from WebCrypto: no network, no database. `email-dispatch` claims rows and hands
 * them here, then gives the result to nodemailer. Every rule below is testable in CI, where Deno
 * runs with `--allow-env` only.
 *
 * ── WHAT THE LIBRARY IS NEVER GIVEN ──────────────────────────────────────────
 *
 * The security review binds this file: every header value is built here, from constants and
 * ids, and refused if it holds CR or LF; the To is a bare address with no display name, so a
 * client's chosen name never reaches a header; no file, path or URL is ever content. Bodies have
 * card numbers masked to the last four before anything else sees them.
 */

import { maskCardNumbers } from "./push.ts";

/** A row `email_claim_due` hands out. */
export interface ClaimedEmail {
  outbox_id: string;
  conversation_id: string;
  recipient: string;
  client_first_name: string | null;
  agent_first_name: string | null;
  trip_title: string | null;
  previous_outbox_id: string | null;
  messages: { message_id: string; body: string; created_at: string; attachments: string[] }[];
}

export interface EmailConfig {
  host: string;
  port: number;
  /** Implicit TLS (465). False only for the local mail catcher, with no credentials. */
  secure: boolean;
  user: string | null;
  password: string | null;
  /** The app-only mailbox, e.g. gyasi.messages@adventures.story-tail.com. */
  fromAddress: string;
  /** Where replies go: reply+<token>@<replyDomain>. */
  replyDomain: string;
  /** The web app's origin, for "Open the conversation" and the opt-out page. */
  siteUrl: string;
  /** The `email-unsubscribe` function's URL, for the one-click header. */
  unsubscribeUrl: string;
}

/** Hosts that may be reached without TLS: the local stack's Mailpit, never anything real. */
const LOCAL_CATCHER = /^(localhost|127\.0\.0\.1|host\.docker\.internal|supabase_inbucket_[a-z0-9_-]+|inbucket|mailpit)$/i;

const ADDRESS = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
const DOMAIN = /^(?=.{1,253}$)([a-z0-9-]+\.)+[a-z]{2,}$/i;

/**
 * The SMTP settings, or null when email is not set up (the dispatcher then refuses before
 * claiming, so rows wait rather than burn their tries). Throws on a setting that would send a
 * password in the clear: port 465 only, unless it is the local catcher with no credentials.
 */
export function emailConfigFromEnv(env: (name: string) => string | undefined): EmailConfig | null {
  const host = env("EMAIL_SMTP_HOST")?.trim();
  const fromAddress = env("EMAIL_FROM_ADDRESS")?.trim();
  if (!host || !fromAddress) return null;

  const port = Number(env("EMAIL_SMTP_PORT")?.trim() || "465");
  const user = env("EMAIL_SMTP_USER")?.trim() || null;
  const password = env("EMAIL_SMTP_PASSWORD") || null;
  const replyDomain = (env("EMAIL_REPLY_DOMAIN")?.trim() || "").toLowerCase();
  const siteUrl = (env("EMAIL_SITE_URL")?.trim() || "").replace(/\/+$/, "");
  const unsubscribeUrl = env("EMAIL_UNSUBSCRIBE_URL")?.trim() || "";

  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error("EMAIL_SMTP_PORT must be a port number.");
  }
  const local = LOCAL_CATCHER.test(host);
  if (port !== 465 && !(local && !user && !password)) {
    // Supabase blocks 25 and 587 anyway; anything but implicit TLS would send the login in
    // the clear or rely on STARTTLS, which the review rules out.
    throw new Error("Email goes out on port 465 only (the local mail catcher is the one exception).");
  }
  if ((user === null) !== (password === null)) {
    throw new Error("Set both EMAIL_SMTP_USER and EMAIL_SMTP_PASSWORD, or neither.");
  }
  if (!local && (!user || !password)) {
    throw new Error("A real SMTP server needs EMAIL_SMTP_USER and EMAIL_SMTP_PASSWORD.");
  }
  if (!ADDRESS.test(fromAddress)) throw new Error("EMAIL_FROM_ADDRESS must be an email address.");
  if (!DOMAIN.test(replyDomain)) throw new Error("EMAIL_REPLY_DOMAIN must be a domain, e.g. reply.story-tail.com.");
  if (!/^https?:\/\/[^\s/]+$/.test(siteUrl) || (!local && !siteUrl.startsWith("https://"))) {
    throw new Error("EMAIL_SITE_URL must be the app's origin, e.g. https://app.story-tail.com.");
  }
  if (!/^https?:\/\/\S+$/.test(unsubscribeUrl) || (!local && !unsubscribeUrl.startsWith("https://"))) {
    throw new Error("EMAIL_UNSUBSCRIBE_URL must be the email-unsubscribe function's URL.");
  }
  return { host, port, secure: port === 465, user, password, fromAddress, replyDomain, siteUrl, unsubscribeUrl };
}

// ── Tokens ─────────────────────────────────────────────────────────────────────

const BASE32 = "abcdefghijklmnopqrstuvwxyz234567";

/** 128 random bits as 26 lowercase base32 characters: safe in an email local part and a URL. */
export function newToken(random: (bytes: Uint8Array) => Uint8Array = (b) => crypto.getRandomValues(b)): string {
  const bytes = random(new Uint8Array(16));
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

/** A token as it may arrive: 26 base32 characters, any case. */
export function isToken(value: unknown): value is string {
  return typeof value === "string" && /^[a-z2-7]{26}$/i.test(value);
}

/** SHA-256 of a token, as the `\x…` hex PostgREST takes for a bytea parameter. */
export async function tokenHashParam(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token.toLowerCase()));
  return "\\x" + [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ── The email ─────────────────────────────────────────────────────────────────

export interface BuiltEmail {
  from: { name: string; address: string };
  to: string;
  replyTo: string;
  subject: string;
  text: string;
  html: string;
  messageId: string;
  inReplyTo?: string;
  references?: string;
  headers: Record<string, string>;
}

/** Refuse any header value that could start a new header (CRLF injection). */
function headerSafe(value: string, what: string): string {
  if (/[\r\n]/.test(value)) throw new Error(`${what} would break a mail header`);
  return value;
}

/** The domain Message-IDs are minted under: the sending mailbox's own. */
function messageIdFor(outboxId: string, fromAddress: string): string {
  return `<${outboxId}@${fromAddress.split("@")[1]}>`;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** One display line for names that may be missing. */
function firstName(value: string | null, fallback: string): string {
  const name = value?.trim().split(/\s+/)[0];
  return name || fallback;
}

/** For the start of a sentence: "your advisor" becomes "Your advisor"; a name is unchanged. */
function sentenceStart(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * A trip title as it may appear in a subject: control characters (a pasted line break) become
 * spaces rather than failing the email, and a card number in it is masked like the body.
 */
function cleanTitle(value: string | null): string | null {
  const title = value?.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
  return title ? maskCardNumbers(title) : null;
}

/** The thread on the web app. A plain link: it carries no token and signs no one in. */
export function threadUrl(cfg: EmailConfig, conversationId: string): string {
  return `${cfg.siteUrl}/messages/${encodeURIComponent(conversationId)}`;
}

/** The opt-out page on the web app, and the one-click endpoint mail apps POST to. */
export function unsubscribeLinks(cfg: EmailConfig, token: string): { page: string; oneClick: string } {
  const t = encodeURIComponent(token);
  const sep = cfg.unsubscribeUrl.includes("?") ? "&" : "?";
  return { page: `${cfg.siteUrl}/email/unsubscribe?t=${t}`, oneClick: `${cfg.unsubscribeUrl}${sep}t=${t}` };
}

// Design-System §3 light scheme: burgundy primary, cream ground, sand surface.
const BURGUNDY = "#7A1A1F";
const CREAM = "#FBF6EE";
const SAND = "#F1E7D5";
const INK = "#2B2B2B";
const MUTED = "#6B6259";

/**
 * The email for one claimed row. Throws when the row cannot honestly be sent (no replies left
 * to carry, a recipient that is not one address), so the caller fails it rather than mailing
 * something wrong.
 */
export function buildEmail(
  row: ClaimedEmail,
  tokens: { reply: string; unsubscribe: string },
  cfg: EmailConfig,
): BuiltEmail {
  const to = row.recipient?.trim() ?? "";
  if (!ADDRESS.test(to)) throw new Error("recipient is not a single email address");
  if (row.messages.length === 0) throw new Error("no replies left to send");
  if (!isToken(tokens.reply) || !isToken(tokens.unsubscribe)) throw new Error("bad token");

  // Lowercase unless it starts a sentence (brand review): "A note from your advisor".
  const agent = firstName(row.agent_first_name, "your advisor");
  const trip = cleanTitle(row.trip_title);

  const subject = headerSafe(trip ? `${sentenceStart(agent)} wrote about ${trip}` : `A note from ${agent}`, "subject");
  const fromName = headerSafe(`${sentenceStart(agent)} at Story-Tail Adventures`, "sender name");
  const replyTo = headerSafe(`reply+${tokens.reply}@${cfg.replyDomain}`, "reply address");
  const link = threadUrl(cfg, row.conversation_id);
  const unsub = unsubscribeLinks(cfg, tokens.unsubscribe);

  const bodies = row.messages.map((m) => ({
    text: maskCardNumbers(m.body.trim()),
    files: (m.attachments ?? []).map((f) => String(f)).filter((f) => f.trim() !== ""),
  }));
  const files = bodies.flatMap((b) => b.files);
  const fileLine = files.length === 0
    ? null
    : files.length === 1
    ? `${sentenceStart(agent)} shared a file with you: ${files[0]}. You'll find it in the conversation.`
    : `${sentenceStart(agent)} shared ${files.length} files with you: ${files.join(", ")}. You'll find them in the conversation.`;
  const replyLine = `Reply to this email and ${agent} will see it in your conversation. Files are best added in the app.`;

  // No greeting of ours: the advisor's own words open the email, and they usually greet already.
  const text = [
    bodies.map((b) => b.text).join("\n\n---\n\n"),
    ...(fileLine ? ["", fileLine] : []),
    "",
    `Open the conversation: ${link}`,
    "",
    replyLine,
    "",
    `Stop emailing me about messages: ${unsub.page}`,
  ].join("\n");

  const para = (t: string) =>
    t.split(/\n{2,}/).map((p) =>
      `<p style="margin:0 0 14px;line-height:1.55">${escapeHtml(p).replace(/\n/g, "<br>")}</p>`
    ).join("");
  const messageBlocks = bodies.map((b) =>
    `<div style="background:#FFFFFF;border-radius:12px;padding:18px 20px;margin:0 0 12px;border:1px solid ${SAND}">${para(b.text)}</div>`
  ).join("");

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:${CREAM};color:${INK};font-family:Poppins,Helvetica,Arial,sans-serif;font-size:16px">
<div style="max-width:560px;margin:0 auto;padding:28px 18px">
<p style="margin:0 0 22px;font-weight:600;color:${BURGUNDY};letter-spacing:0.02em">Story-Tail Adventures</p>
${messageBlocks}
${fileLine ? `<p style="margin:4px 0 16px;color:${MUTED};font-size:14px">${escapeHtml(fileLine)}</p>` : ""}
<p style="margin:22px 0"><a href="${escapeHtml(link)}" style="display:inline-block;background:${BURGUNDY};color:#FFFFFF;text-decoration:none;padding:12px 22px;border-radius:999px;font-weight:600">Open the conversation</a></p>
<p style="margin:0 0 28px;color:${MUTED};font-size:14px;line-height:1.5">${escapeHtml(replyLine)}</p>
<p style="margin:0;color:${MUTED};font-size:12px"><a href="${escapeHtml(unsub.page)}" style="color:${MUTED}">Stop emailing me about messages</a></p>
</div></body></html>`;

  const messageId = messageIdFor(row.outbox_id, cfg.fromAddress);
  const previous = row.previous_outbox_id ? messageIdFor(row.previous_outbox_id, cfg.fromAddress) : undefined;

  return {
    from: { name: fromName, address: cfg.fromAddress },
    to,
    replyTo,
    subject,
    text,
    html,
    messageId,
    ...(previous ? { inReplyTo: previous, references: previous } : {}),
    // RFC 8058 one-click. Built here (not through nodemailer's `list` option) so no comment
    // syntax is ever parsed, the shape its List-* advisory was about.
    headers: {
      "List-Unsubscribe": headerSafe(`<${unsub.oneClick}>`, "unsubscribe header"),
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      "Auto-Submitted": "auto-generated",
    },
  };
}

// ── SMTP outcomes ────────────────────────────────────────────────────────────

/**
 * What an SMTP error means for the row: a 5xx reply (or a rejected recipient) will not get
 * better by retrying; anything else (4xx, timeouts, a dropped connection) is worth another try.
 * The text kept is the code and the server's words, with any address removed and cut to 200
 * characters (Data-Model §12.8 `last_error`).
 */
export function classifySmtpError(err: unknown): { permanent: boolean; error: string } {
  const e = (err ?? {}) as { responseCode?: unknown; response?: unknown; message?: unknown; code?: unknown };
  const code = typeof e.responseCode === "number" ? e.responseCode : null;
  const raw = [code ?? (typeof e.code === "string" ? e.code : null), typeof e.response === "string" ? e.response : typeof e.message === "string" ? e.message : "send failed"]
    .filter((x) => x !== null && x !== "").join(" ");
  const scrubbed = raw.replace(/[^\s<>"']+@[^\s<>"']+/g, "[address]").replace(/\s+/g, " ").trim();
  return { permanent: code !== null && code >= 500 && code < 600, error: scrubbed.slice(0, 200) };
}
