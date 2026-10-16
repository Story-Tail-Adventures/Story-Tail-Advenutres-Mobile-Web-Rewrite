/**
 * §3.10 Stage 4: reading a client's reply by email out of the app's IONOS mailbox (Data-Model
 * §12.10, docs/IMAP-Library-Security-Review.md §3 and §3a). Pure: no network, no database, so CI
 * tests every rule. `email-inbox` fetches mail over IMAP and hands the pieces here.
 *
 * Everything in a mailbox is a stranger's input until two locks agree: a live reply token (in the
 * `info+<token>@` address, or found from the email the reply answers) and a sender the SQL matches
 * to that token's verified account, vouched for by the receiving server. This file finds the
 * token, reads the server's verdict, and reduces the mail to the new words only. It never renders
 * HTML.
 */

// ── Headers ─────────────────────────────────────────────────────────────────

/**
 * Raw header lines as IMAP returns them, unfolded, in ORDER (the topmost first) and with names
 * lowercased. Order matters: the receiving server prepends its own trace headers, so the first
 * `Authentication-Results` is the one IONOS wrote and any later one came with the mail.
 */
export function parseHeaders(raw: string): [string, string][] {
  const out: [string, string][] = [];
  const unfolded = raw.replace(/\r\n/g, "\n").replace(/\n[ \t]+/g, " ");
  for (const line of unfolded.split("\n")) {
    const i = line.indexOf(":");
    if (i <= 0) continue;
    out.push([line.slice(0, i).trim().toLowerCase(), line.slice(i + 1).trim()]);
  }
  return out;
}

function values(headers: [string, string][], name: string): string[] {
  return headers.filter(([n]) => n === name).map(([, v]) => v);
}

// ── Addresses and the reply token ───────────────────────────────────────────

/**
 * A bare address out of `Name <addr>` or `addr`, lowercased; null when there is none, or when
 * the header names more than one address. Found in review (2026-10-16): taking the FIRST `<…>`
 * let a display name spoof the sender (`"<jordan@…>" <attacker@…>` read as Jordan). A From with
 * two `@`s is refused outright; a real client's From has one.
 */
export function bareAddress(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if ((value.match(/@/g) ?? []).length !== 1) return null;
  const angles = [...value.matchAll(/<([^<>\s]+@[^<>\s]+)>/g)];
  const addr = (angles.length > 0 ? angles[angles.length - 1][1] : value).trim().toLowerCase();
  return /^[^\s@<>"]+@[^\s@<>"]+\.[a-z]{2,}$/.test(addr) ? addr : null;
}

/** The mailbox's own plus address for a token: `info` + `abc…` → `info+abc…@domain`. */
export function plusAddress(mailbox: string, token: string): string {
  const [local, domain] = mailbox.toLowerCase().split("@");
  return `${local}+${token}@${domain}`;
}

/**
 * The reply token from the first recipient shaped `<local>+<token>@<domain>` of OUR mailbox. Any
 * other plus address, or a lookalike domain, is not ours. Null when none matches; the reply may
 * still be matched by the email it answers (`outboxIdFrom`).
 */
export function replyTokenFrom(recipients: string[], mailbox: string): string | null {
  const [local, domain] = mailbox.toLowerCase().split("@");
  for (const r of recipients) {
    const addr = bareAddress(r);
    if (!addr) continue;
    const m = addr.match(/^([^+@]+)\+([a-z2-7]{26})@(.+)$/);
    if (m && m[1] === local && m[3] === domain) return m[2];
  }
  return null;
}

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

/**
 * The outbox id of OUR email that a reply answers: our Message-IDs are `<outbox-id@domain>`.
 * In-Reply-To first (the email answered directly), else the LAST of ours in References (the most
 * recent in the thread). Ids on any other domain are ignored.
 */
export function outboxIdFrom(headers: [string, string][], mailboxDomain: string): string | null {
  const domain = mailboxDomain.toLowerCase();
  const ours = (value: string) =>
    [...value.matchAll(new RegExp(`<(${UUID})@([^<>\\s]+)>`, "gi"))]
      .filter((m) => m[2].toLowerCase() === domain)
      .map((m) => m[1].toLowerCase());
  for (const v of values(headers, "in-reply-to")) {
    const found = ours(v);
    if (found.length > 0) return found[found.length - 1];
  }
  const refs = values(headers, "references").flatMap(ours);
  return refs.length > 0 ? refs[refs.length - 1] : null;
}

/** Every recipient address a delivered message names: the server's delivery headers, To and Cc. */
export function recipientsOf(headers: [string, string][]): string[] {
  const out: string[] = [];
  for (const name of ["delivered-to", "x-original-to", "to", "cc"]) {
    for (const v of values(headers, name)) {
      for (const part of v.split(",")) {
        const a = bareAddress(part.trim());
        if (a) out.push(a);
      }
    }
  }
  return out;
}

/** The From header's single address (null when it names none, or several). */
export function fromOf(headers: [string, string][]): string | null {
  const from = values(headers, "from");
  return from.length === 1 ? bareAddress(from[0]) : null;
}

/**
 * The key a delivered message is recorded under, so it is handled once. A hash of the From address
 * and the message's own Message-ID when it has a usable one: a server that re-delivers an email (a
 * retry, a forward loop) gives it a NEW mailbox UID but the same Message-ID. Found in testing
 * (2026-10-16): keyed on the UID, one reply delivered twice posted twice. Scoped to the sender and
 * case kept (review, 2026-10-16), so another sender reusing an id cannot pre-empt a client's reply.
 * Without a Message-ID, the mailbox UID.
 */
export async function dedupeKey(
  headers: [string, string][],
  uidValidity: string,
  uid: number,
): Promise<string> {
  const id = values(headers, "message-id")[0]?.trim();
  if (!id || !/^<[^<>\s]{3,190}>$/.test(id)) return `imap:${uidValidity}:${uid}`;
  const from = values(headers, "from")[0] ? (bareAddress(values(headers, "from")[0]) ?? "") : "";
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${from}\n${id}`));
  return "mid:" + [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ── Was the sender vouched for? ─────────────────────────────────────────────

/** One parsed Authentication-Results header: who wrote it, and each method's result and properties. */
export interface AuthResults {
  authservId: string;
  methods: { method: string; result: string; props: Record<string, string> }[];
}

/**
 * RFC 8601 parsing, strictly: comments `( … )` and quoted strings are removed FIRST, so nothing a
 * sender put in a property value (`smtp.mailfrom="a;dmarc=pass"@evil.com`) can read as a result.
 * Then the header splits on `;`: the first piece is the authserv-id (who wrote it), each later piece
 * starts with `method=result` and may carry `ptype.property=value` pairs. Found in review
 * (2026-10-16): a substring match accepted `dmarc=pass` from inside a quoted value.
 */
export function parseAuthResults(value: string): AuthResults {
  let clean = "";
  let depth = 0;
  let quoted = false;
  for (let i = 0; i < value.length; i++) {
    const c = value[i];
    if (quoted) {
      if (c === "\\") i++;
      else if (c === '"') quoted = false;
      continue;
    }
    if (c === '"' && depth === 0) {
      quoted = true;
      clean += '""';
      continue;
    }
    if (c === "(") {
      depth++;
      continue;
    }
    if (c === ")" && depth > 0) {
      depth--;
      continue;
    }
    if (depth === 0) clean += c;
  }
  const [head, ...rest] = clean.split(";");
  const authservId = (head ?? "").trim().split(/\s+/)[0]?.toLowerCase() ?? "";
  const methods = rest.map((segment) => {
    const words = segment.trim().split(/\s+/).filter(Boolean);
    const [method, result] = (words[0] ?? "").toLowerCase().split("=");
    const props: Record<string, string> = {};
    for (const w of words.slice(1)) {
      const i = w.indexOf("=");
      if (i > 0) props[w.slice(0, i).toLowerCase()] = w.slice(i + 1).toLowerCase();
    }
    return { method: method ?? "", result: result ?? "", props };
  }).filter((m) => m.method !== "" && m.result !== "");
  return { authservId, methods };
}

/** The domain part of an address or a bare domain, lowercased, without a trailing dot. */
function domainOf(value: string | undefined): string {
  const v = (value ?? "").toLowerCase().replace(/\.$/, "");
  return v.includes("@") ? v.slice(v.lastIndexOf("@") + 1) : v;
}

/**
 * Whether the receiving server vouched for the From address. Three rules, each from review
 * (2026-10-16):
 *
 *   1. Only the TOPMOST Authentication-Results counts, and only when its authserv-id is OUR
 *      server's (`authservId`, pinned in settings). A sender can write any number of these headers;
 *      if the server added none, the sender's own would otherwise be on top. No pinned id, no
 *      matching header: not verified (fail closed).
 *   2. `dmarc=fail` always fails. `dmarc=pass` passes: DMARC itself checks that SPF or DKIM is
 *      aligned with the From domain.
 *   3. Without DMARC (`none`), SPF and DKIM must BOTH pass AND both be for the From address's own
 *      domain (`smtp.mailfrom`, `header.d`). An attacker's own domain passing proves nothing about
 *      someone else's From. `strict` (the match-by-the-email-it-answers path) accepts DMARC only.
 */
export function senderVerified(
  headers: [string, string][],
  from: string | null,
  authservId: string | null,
  strict = false,
): boolean {
  if (!from || !authservId) return false;
  const top = values(headers, "authentication-results")[0];
  if (!top) return false;
  const ar = parseAuthResults(top);
  if (ar.authservId !== authservId.toLowerCase()) return false;

  const find = (name: string) => ar.methods.find((m) => m.method === name);
  const dmarc = find("dmarc");
  if (dmarc?.result === "fail") return false;
  if (dmarc?.result === "pass") return true;
  if (strict) return false;

  const fromDomain = domainOf(from);
  const spf = find("spf");
  const dkim = ar.methods.find((m) => m.method === "dkim" && m.result === "pass" && domainOf(m.props["header.d"]) === fromDomain);
  const spfAligned = spf?.result === "pass" &&
    domainOf(spf.props["smtp.mailfrom"] ?? spf.props["smtp.helo"]) === fromDomain;
  return spfAligned && Boolean(dkim);
}

// ── Automatic answers ───────────────────────────────────────────────────────

/**
 * An out-of-office or other machine answer (RFC 3834's Auto-Submitted, the common Precedence and
 * X-Autoreply headers, or an "Automatic reply:" subject). Our own emails say Auto-Submitted, so
 * most responders stay quiet; this catches the ones that answer anyway, which would otherwise
 * post "I'm away until Monday" into the client's thread as if they wrote it.
 */
export function isAutoReply(headers: [string, string][], subject: unknown): boolean {
  const auto = values(headers, "auto-submitted")[0];
  if (auto !== undefined && auto.trim().toLowerCase() !== "no") return true;
  const precedence = values(headers, "precedence")[0]?.trim().toLowerCase();
  if (precedence && ["bulk", "junk", "list", "auto_reply"].includes(precedence)) return true;
  if (values(headers, "x-autoreply").length > 0 || values(headers, "x-autorespond").length > 0) return true;
  return typeof subject === "string" &&
    /^\s*(automatic reply|auto(matic)?[- ]?reply|out of (the )?office)\b/i.test(subject);
}

// ── The message's parts ─────────────────────────────────────────────────────

/** The fields of imapflow's bodyStructure this file reads. */
export interface BodyNode {
  part?: string;
  type?: string;
  disposition?: string;
  dispositionParameters?: Record<string, string>;
  parameters?: Record<string, string>;
  id?: string;
  childNodes?: BodyNode[];
}

function leaves(node: BodyNode | undefined): BodyNode[] {
  if (!node) return [];
  if (node.childNodes && node.childNodes.length > 0) return node.childNodes.flatMap(leaves);
  return [node];
}

function isFile(n: BodyNode): boolean {
  const disposition = n.disposition?.toLowerCase();
  if (disposition === "attachment") return true;
  if (disposition === "inline" && n.id) return false; // an image in a signature
  const named = Boolean(n.dispositionParameters?.filename || n.parameters?.name);
  return named && !(n.type ?? "").toLowerCase().startsWith("text/");
}

/** Files on the reply, not counting images inlined in a signature. Never downloaded. */
export function countFiles(structure: BodyNode | undefined): number {
  return leaves(structure).filter(isFile).length;
}

/**
 * The part to read: the first `text/plain` that is not a file, else the first `text/html`. A
 * single-part message has no part id; IMAP calls its body part "1".
 */
export function textPart(structure: BodyNode | undefined): { part: string; html: boolean } | null {
  const candidates = leaves(structure).filter((n) => !isFile(n));
  const plain = candidates.find((n) => (n.type ?? "").toLowerCase() === "text/plain");
  if (plain) return { part: plain.part ?? "1", html: false };
  const html = candidates.find((n) => (n.type ?? "").toLowerCase() === "text/html");
  return html ? { part: html.part ?? "1", html: true } : null;
}

// ── The new words only ───────────────────────────────────────────────────────

/** Lines that start the quoted history or a signature in the common mail apps. */
const CUT_AT: RegExp[] = [
  /^On .{4,200}wrote:\s*$/i, // Gmail, Apple Mail
  /^-{2,}\s*Original Message\s*-{2,}/i, // Outlook
  /^_{10,}\s*$/, // Outlook's rule before "From:"
  /^From:\s.+/i, // Outlook / Yahoo header block
  /^Sent from my (iPhone|iPad|Android|Galaxy|phone)/i,
  /^Get Outlook for /i,
  /^-- ?$/, // RFC 3676 signature delimiter
];

/** A crude, safe HTML-to-text for mail with no text part: tags dropped, never rendered. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, "")
    .replace(/<blockquote[\s\S]*?<\/blockquote>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
}

/**
 * What the client actually wrote: everything above the first quoted-history or signature line,
 * with `>` lines dropped, blank runs collapsed and the ends trimmed. The SQL refuses an empty
 * result and anything over the message ceiling.
 */
export function newWordsOnly(text: string | null | undefined, html: string | null | undefined): string {
  const source = (typeof text === "string" && text.trim() !== "")
    ? text
    : typeof html === "string" ? htmlToText(html) : "";
  const kept: string[] = [];
  for (const line of source.replace(/\r\n?/g, "\n").split("\n")) {
    if (CUT_AT.some((re) => re.test(line.trim()))) break;
    if (/^\s*>/.test(line)) continue;
    kept.push(line.replace(/\s+$/, ""));
  }
  return kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
