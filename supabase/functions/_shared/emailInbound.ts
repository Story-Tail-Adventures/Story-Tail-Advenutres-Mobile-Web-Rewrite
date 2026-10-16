/**
 * §3.10 Stage 4: reading a client's reply by email (Data-Model §12.10,
 * docs/Email-Provider-Review.md §4.3). Pure apart from WebCrypto, so CI tests every rule.
 *
 * An inbound email is a stranger's input until three things agree: a valid webhook signature
 * (Resend signs with Svix), a live reply token in the address it was sent to, and a sender the
 * SQL matches to that token's verified account. This file does the first, finds the second, and
 * reduces the mail to the new words only. It never renders HTML.
 */

// ── Webhook signature (Svix, as Resend uses it) ────────────────────────────────

/** How old a signed webhook may be: Svix's own default tolerance. */
export const SVIX_TOLERANCE_SECONDS = 5 * 60;

function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

/** Constant-time string comparison, so a forged signature learns nothing from timing. */
function sameString(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Svix's scheme: HMAC-SHA256 over `${id}.${timestamp}.${rawBody}`, keyed by the base64 part of a
 * `whsec_…` secret; the header holds one or more space-separated `v1,<base64>` signatures. The
 * timestamp must be within the tolerance either way, which stops a captured request being
 * replayed later. Uses the RAW body: re-serialising JSON changes the bytes and every check fails.
 */
export async function verifySvix(
  secret: string,
  headers: { id: string | null; timestamp: string | null; signature: string | null },
  rawBody: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): Promise<boolean> {
  const { id, timestamp, signature } = headers;
  if (!secret.startsWith("whsec_") || !id || !timestamp || !signature) return false;
  if (!/^\d{1,12}$/.test(timestamp)) return false;
  if (Math.abs(nowSeconds - Number(timestamp)) > SVIX_TOLERANCE_SECONDS) return false;

  let keyBytes: Uint8Array<ArrayBuffer>;
  try {
    keyBytes = base64ToBytes(secret.slice("whsec_".length));
  } catch {
    return false;
  }
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${id}.${timestamp}.${rawBody}`));
  const expected = bytesToBase64(new Uint8Array(mac));

  return signature.split(" ").some((part) => {
    const [version, sig] = part.split(",", 2);
    return version === "v1" && typeof sig === "string" && sameString(sig, expected);
  });
}

// ── The token in the address ────────────────────────────────────────────────

/** A bare address out of `Name <addr>` or `addr`, lowercased; null when there is none. */
export function bareAddress(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const angle = value.match(/<([^<>\s]+@[^<>\s]+)>/);
  const addr = (angle ? angle[1] : value).trim().toLowerCase();
  return /^[^\s@<>]+@[^\s@<>]+\.[a-z]{2,}$/.test(addr) ? addr : null;
}

/**
 * The reply token from the first recipient shaped `reply+<token>@<replyDomain>`. Null when no
 * recipient is ours, which the SQL records as an unknown token.
 */
export function replyTokenFrom(recipients: unknown[], replyDomain: string): string | null {
  const domain = replyDomain.toLowerCase();
  for (const r of recipients) {
    const addr = bareAddress(r);
    if (!addr) continue;
    const m = addr.match(/^reply\+([a-z2-7]{26})@(.+)$/);
    if (m && m[2] === domain) return m[1];
  }
  return null;
}

/**
 * Whether the sending domain is vouched for. DMARC pass means the From domain itself
 * authenticated; without a DMARC policy (many small domains), both SPF and DKIM passing is the
 * best evidence available. Anything else is a sender we cannot trust, whatever From says. This is
 * the second lock: the reply token, which only the client's inbox holds, is the first.
 */
export function senderVerified(auth: unknown): boolean {
  if (!auth || typeof auth !== "object") return false;
  const a = auth as Record<string, unknown>;
  return a.dmarc === "pass" || (a.spf === "pass" && a.dkim === "pass");
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

/** Files on the reply, not counting images inlined in a signature. */
export function countFiles(attachments: unknown): number {
  if (!Array.isArray(attachments)) return 0;
  return attachments.filter((a) => {
    const x = (a ?? {}) as Record<string, unknown>;
    return !(x.content_disposition === "inline" && typeof x.content_id === "string" && x.content_id !== "");
  }).length;
}

// ── Automatic answers ───────────────────────────────────────────────────────

/** A header's value from Resend's `headers`, which may be an object or a list of name/value. */
function headerValue(headers: unknown, name: string): string | null {
  const want = name.toLowerCase();
  if (Array.isArray(headers)) {
    for (const h of headers) {
      const x = (h ?? {}) as Record<string, unknown>;
      if (typeof x.name === "string" && x.name.toLowerCase() === want) return String(x.value ?? "");
    }
    return null;
  }
  if (headers && typeof headers === "object") {
    for (const [k, v] of Object.entries(headers as Record<string, unknown>)) {
      if (k.toLowerCase() === want) return Array.isArray(v) ? String(v[0] ?? "") : String(v ?? "");
    }
  }
  return null;
}

/**
 * An out-of-office or other machine answer (RFC 3834's Auto-Submitted, the common Precedence and
 * X-Autoreply headers, or an "Automatic reply:" subject). Our own emails say Auto-Submitted, so
 * most responders stay quiet; this catches the ones that answer anyway, which would otherwise
 * post "I'm away until Monday" into the client's thread as if they wrote it.
 */
export function isAutoReply(headers: unknown, subject: unknown): boolean {
  const auto = headerValue(headers, "auto-submitted");
  if (auto !== null && auto.trim().toLowerCase() !== "no") return true;
  const precedence = headerValue(headers, "precedence")?.trim().toLowerCase();
  if (precedence && ["bulk", "junk", "list", "auto_reply"].includes(precedence)) return true;
  if (headerValue(headers, "x-autoreply") !== null || headerValue(headers, "x-autorespond") !== null) return true;
  return typeof subject === "string" && /^\s*(automatic reply|auto(matic)?[- ]?reply|out of (the )?office)\b/i.test(subject);
}
