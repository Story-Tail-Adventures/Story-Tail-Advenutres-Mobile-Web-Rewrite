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
import { plusAddress } from "./emailInbound.ts";

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
  /** The web app's origin, for "Open the conversation" and the opt-out page. */
  siteUrl: string;
  /** The `email-unsubscribe` function's URL, for the one-click header. */
  unsubscribeUrl: string;
}

/** Hosts that may be reached without TLS: the local stack's Mailpit, never anything real. */
const LOCAL_CATCHER = /^(localhost|127\.0\.0\.1|host\.docker\.internal|supabase_inbucket_[a-z0-9_-]+|inbucket|mailpit|greenmail)$/i;

const ADDRESS = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

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
  if (!/^https?:\/\/[^\s/]+$/.test(siteUrl) || (!local && !siteUrl.startsWith("https://"))) {
    throw new Error("EMAIL_SITE_URL must be the app's origin, e.g. https://storytailadventures.vercel.app.");
  }
  if (!/^https?:\/\/\S+$/.test(unsubscribeUrl) || (!local && !unsubscribeUrl.startsWith("https://"))) {
    throw new Error("EMAIL_UNSUBSCRIBE_URL must be the email-unsubscribe function's URL.");
  }
  return { host, port, secure: port === 465, user, password, fromAddress, siteUrl, unsubscribeUrl };
}

// ── Reading replies (IMAP) ─────────────────────────────────────────────────────

export interface InboxConfig {
  host: string;
  port: number;
  /** TLS from the first byte (993). False only for a local test server. */
  secure: boolean;
  user: string;
  password: string;
  /** The mailbox replies come back to; its plus addresses carry the reply tokens. */
  mailbox: string;
}

/**
 * The IMAP settings for `email-inbox`, or null when replies are not set up. The login is the
 * sending mailbox's own (`EMAIL_SMTP_USER` / `EMAIL_SMTP_PASSWORD`): it is the same mailbox, and
 * docs/IMAP-Library-Security-Review.md §1 explains why that adds no exposure. Port 993 with TLS
 * only, except a local test server (which, unlike SMTP's catcher, needs a throwaway login).
 */
export function inboxConfigFromEnv(env: (name: string) => string | undefined): InboxConfig | null {
  const host = (env("EMAIL_IMAP_HOST")?.trim() || "imap.ionos.com");
  // Optional overrides, for a local test server whose login differs from the (credential-free)
  // local SMTP catcher. Production leaves them unset and reuses the sending login.
  const user = env("EMAIL_IMAP_USER")?.trim() || env("EMAIL_SMTP_USER")?.trim() || "";
  const password = env("EMAIL_IMAP_PASSWORD") || env("EMAIL_SMTP_PASSWORD") || "";
  const mailbox = (env("EMAIL_FROM_ADDRESS")?.trim() || "").toLowerCase();
  if (!user || !password || !mailbox) return null;

  const port = Number(env("EMAIL_IMAP_PORT")?.trim() || "993");
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error("EMAIL_IMAP_PORT must be a port number.");
  }
  const local = LOCAL_CATCHER.test(host);
  if (port !== 993 && !local) {
    throw new Error("Replies are read on port 993 only (a local test server is the one exception).");
  }
  if (!ADDRESS.test(mailbox)) throw new Error("EMAIL_FROM_ADDRESS must be an email address.");
  return { host, port, secure: port === 993, user, password, mailbox };
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
  // Character codes rather than a regex: deno lint (no-control-regex) refuses control characters
  // in a pattern.
  const title = value
    ? [...value].map((c) => (c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127 ? " " : c)).join("")
      .replace(/\s+/g, " ").trim()
    : null;
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
// ── §3.12.4 The advisor's signature ──────────────────────────────────────────

/** The line under every signature (Q18). Not stored and not editable: the host agency's. */
export const LOCKED_SIGNATURE_LINE = "Story-Tail Adventures · Hosted by Inteletravel";

/** What `agent_signature_for_conversation` hands back. */
export interface SignatureSource {
  signature: string | null;
  display_name: string | null;
  phone: string | null;
  email: string | null;
}

/**
 * The signature as lines of plain text: the three merge fields filled, the separators a missing
 * phone leaves behind tidied away ("· gyasi@…" becomes "gyasi@…"), a line left empty by that
 * dropped, and the locked line always last. Card numbers are masked like the body.
 */
export function renderSignature(src: SignatureSource | null): string[] {
  const text = (src?.signature ?? "").trim();
  const filled = text
    .replace(/\{\{\s*agent\.name\s*\}\}/g, src?.display_name?.trim() ?? "")
    .replace(/\{\{\s*agent\.phone\s*\}\}/g, src?.phone?.trim() ?? "")
    .replace(/\{\{\s*agent\.email\s*\}\}/g, src?.email?.trim() ?? "");
  const sourceLines = text.split("\n");
  const lines: string[] = [];
  for (const [i, raw] of filled.split("\n").entries()) {
    const hadField = /\{\{/.test(sourceLines[i] ?? "");
    // Only the "·" a missing field leaves stranded is tidied: doubled, leading or trailing.
    // Anything else the advisor typed stays exactly as typed.
    const line = raw
      .replace(/\s*·\s*(?:·\s*)+/g, " · ")
      .replace(/^\s*·\s*/, "")
      .replace(/\s*·\s*$/, "")
      .trimEnd();
    // A line that only held merge fields with nothing behind them disappears; a blank line the
    // advisor typed on purpose (between blocks) stays.
    if (line.trim() === "" && hadField) continue;
    lines.push(maskCardNumbers(line));
  }
  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return [...lines, "", LOCKED_SIGNATURE_LINE];
}

/** Links typed into a signature become clickable: https URLs, bare story-tail style domains, and email addresses. Input is already escaped. */
function linkify(escaped: string): string {
  return escaped.replace(
    // A bare domain only with a common web ending, so "St.Lucia" or "e.g." never becomes a link.
    /\b(https?:\/\/[^\s<&]+|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}|(?:[a-z0-9-]+\.)+(?:com|net|org|travel|co|us|ca|mx|io|info|biz)\b(?:\/[^\s<&]*)?)/gi,
    (m) => {
      const href = m.includes("@") && !m.startsWith("http") ? `mailto:${m}` : /^https?:/i.test(m) ? m : `https://${m}`;
      return `<a href="${href}" style="color:${BURGUNDY}">${m}</a>`;
    },
  );
}

function signatureHtml(lines: string[]): string {
  const body = lines.map((l) => (l === "" ? "" : linkify(escapeHtml(l)))).join("<br>");
  return `<div style="margin:18px 0 0;padding:14px 0 0;border-top:1px solid ${SAND};color:${MUTED};font-size:14px;line-height:1.5">${body}</div>`;
}

export function buildEmail(
  row: ClaimedEmail,
  tokens: { reply: string; unsubscribe: string },
  cfg: EmailConfig,
  signature: SignatureSource | null = null,
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
  // The mailbox's own plus address (docs/IMAP-Library-Security-Review.md §3a): `email-inbox`
  // reads replies out of that mailbox and matches them by this token.
  const replyTo = headerSafe(plusAddress(cfg.fromAddress, tokens.reply), "reply address");
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

  // §3.12.4: under the advisor's words, above the button.
  const sigLines = renderSignature(signature);

  // No greeting of ours: the advisor's own words open the email, and they usually greet already.
  const text = [
    bodies.map((b) => b.text).join("\n\n---\n\n"),
    "",
    "-- ",
    ...sigLines,
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
${signatureHtml(sigLines)}
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

// ── §3.12.3 The advisor's alert emails ───────────────────────────────────────

/** A row `agent_alert_email_claim` hands out. Never a client's words: there is no body field. */
export interface ClaimedAlert {
  alert_id: string;
  kind: "client_message" | "quote_request" | "lead_message";
  recipient: string;
  agent_first_name: string | null;
  client_name: string | null;
  trip_title: string | null;
  conversation_id: string | null;
  trip_id: string | null;
  /** §3.8 (2026-10-21): set for a lead's message; `client_name` is then the lead's name. */
  lead_id: string | null;
}

/** Where "Open in Story-Tail" goes: the thread, the inquiry trip, or the lead. Plain links. */
export function alertUrl(cfg: EmailConfig, row: ClaimedAlert): string {
  if (row.kind === "client_message" && row.conversation_id) {
    return `${cfg.siteUrl}/agent/messages/${row.conversation_id}`;
  }
  if (row.kind === "lead_message") return `${cfg.siteUrl}/agent/leads/${row.lead_id}`;
  return `${cfg.siteUrl}/agent/trips/${row.trip_id}`;
}

/**
 * The advisor's own alert (Q15): who, which trip, and a link. The client's words never appear,
 * so they (and any card number a client types) stay out of the advisor's mail provider.
 */
export function buildAlertEmail(row: ClaimedAlert, cfg: EmailConfig): Omit<BuiltEmail, "replyTo" | "inReplyTo" | "references"> {
  const to = row.recipient?.trim() ?? "";
  if (!ADDRESS.test(to)) throw new Error("recipient is not a single email address");
  if (row.kind === "client_message" && !row.conversation_id) throw new Error("no thread to open");
  if (row.kind === "quote_request" && !row.trip_id) throw new Error("no trip to open");
  if (row.kind === "lead_message" && !row.lead_id) throw new Error("no lead to open");

  const isMessage = row.kind === "client_message";
  const isLead = row.kind === "lead_message";
  const client = cleanTitle(row.client_name) || (isLead ? "Someone new" : "A client");
  const trip = cleanTitle(row.trip_title);
  const link = alertUrl(cfg, row);

  const subject = headerSafe(
    isMessage
      ? `New message from ${client}`
      : isLead
      ? `${client} wrote to you from the website`
      : `New trip request from ${client}`,
    "subject",
  );
  // A lead's words stay out of the mail provider exactly as a client's do (§3.8).
  const line = isMessage
    ? trip ? `${client} wrote to you about ${trip}.` : `${client} wrote to you.`
    : isLead
    ? `${client} doesn't have an account yet and sent you a note from the website.`
    : trip ? `${client} asked about a trip: ${trip}.` : `${client} sent a trip request.`;
  // The quote-request switch covers leads too since 2026-10-21, and reads "New inquiries and
  // messages" (Screen Inventory 3.12.3).
  const why = isMessage
    ? "You get this because client-message emails are on in your notification settings."
    : "You get this because \"New inquiries and messages\" emails are on in your notification settings.";

  const text = [line, "", `Open in Story-Tail: ${link}`, "", why].join("\n");
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:${CREAM};color:${INK};font-family:Poppins,Helvetica,Arial,sans-serif;font-size:16px">
<div style="max-width:560px;margin:0 auto;padding:28px 18px">
<p style="margin:0 0 22px;font-weight:600;color:${BURGUNDY};letter-spacing:0.02em">Story-Tail Adventures</p>
<p style="margin:0 0 18px;line-height:1.55">${escapeHtml(line)}</p>
<p style="margin:22px 0"><a href="${escapeHtml(link)}" style="display:inline-block;background:${BURGUNDY};color:#FFFFFF;text-decoration:none;padding:12px 22px;border-radius:999px;font-weight:600">Open in Story-Tail</a></p>
<p style="margin:0;color:${MUTED};font-size:12px">${escapeHtml(why)}</p>
</div></body></html>`;

  return {
    from: { name: "Story-Tail Adventures", address: cfg.fromAddress },
    to,
    subject,
    text,
    html,
    messageId: messageIdFor(row.alert_id, cfg.fromAddress),
    headers: { "Auto-Submitted": "auto-generated" },
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
