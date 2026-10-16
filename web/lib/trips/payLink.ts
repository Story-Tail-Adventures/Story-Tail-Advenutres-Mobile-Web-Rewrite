/**
 * Pay links on a payment milestone (Screen-Inventory §2.2.3 and §3.6, Data-Model §9.5). P1.
 *
 * Ruled 2026-10-16: the app never holds a card. Each `payment_milestone` may carry one
 * `pay_url`, the supplier's own payment page or a Travefy invoice, and the client pays the
 * supplier there. These helpers are shared by the client pay block and the agent's §3.6
 * screens, and they are pure so the tests can pin them.
 *
 * Pure data only: no React, MUI or Next imports, so a Server Component, a client component
 * and a server action can all use it.
 */

/** Data-Model §9.5's CHECK: at most 2,048 characters. */
export const PAY_URL_MAX = 2048;

/** Data-Model §9.5's CHECKs on the two paid-record fields. */
export const PAID_REFERENCE_MAX = 100;
export const PAID_NOTE_MAX = 1000;

/**
 * The site name a client sees under the pay button, worked out from the link itself.
 *
 * Lower case, a leading `www.` removed, and in its ASCII (punycode) form. `new URL()` does
 * both the lower-casing and the punycode for us: a look-alike host such as `sаndals.com`
 * (with a Cyrillic "а") comes back as `xn--sndals-...`, so it cannot pass as the real site.
 * A stored label could say one site while the link went to another; a name read from the
 * link cannot.
 *
 * Null for anything that is not a parseable `https:` link with a host, so a bad value never
 * renders as a trustworthy-looking name.
 */
export function paySiteName(url: string | null | undefined): string | null {
  if (!url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" || !parsed.hostname) return null;
  return parsed.hostname.toLowerCase().replace(/^www\./, "");
}

/** A milestone the client can still pay: the same two statuses the pay button appears for. */
export function isOpenMilestone(status: string): boolean {
  return status === "scheduled" || status === "overdue";
}

/** "Deposit" → "Pay deposit", "Final balance" → "Pay final balance". */
export function payButtonLabel(label: string): string {
  const trimmed = label.trim();
  return `Pay ${trimmed.charAt(0).toLowerCase()}${trimmed.slice(1)}`;
}

/** The message "I've paid" posts in the trip thread: "I've paid the final balance ($4,180)." */
export function paidNoteBody(label: string, amountText: string): string {
  return `I've paid the ${label.trim().toLowerCase()} (${amountText}).`;
}

/**
 * The same card-shaped run `maskCardNumbers` in supabase/functions/_shared/push.ts uses:
 * 13 to 19 digits, optionally split by spaces, dots or dashes.
 */
const CARD_LIKE = /\b\d(?:[ . -]?\d){12,18}\b/g;

function passesLuhn(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let d = digits.charCodeAt(i) - 48;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

/**
 * True when the text holds something that looks like a card number: a 13-19 digit run that
 * also passes the Luhn check (Data-Model §9.5). The Luhn step lets a long supplier reference
 * through when it is not a card number. The database and the Edge Function refuse the same
 * thing; this is the first of three checks, so the advisor hears why before a round trip.
 */
export function looksLikeCardNumber(text: string): boolean {
  for (const match of text.matchAll(CARD_LIKE)) {
    if (passesLuhn(match[0].replace(/\D/g, ""))) return true;
  }
  return false;
}

export type PayUrlCheck =
  | { ok: true; url: string | null }
  | { ok: false; reason: "https" | "length" | "card" };

/**
 * Check a pay link the advisor typed. An empty value means "remove the link" (`url: null`).
 *
 * Mirrors Data-Model §9.5: `https:` only, a host, no user name or password part, at most
 * 2,048 characters, no spaces, and never a card-shaped number. What comes back is the
 * parsed `href`, so what is saved is what was checked.
 */
export function checkPayUrl(raw: string): PayUrlCheck {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return { ok: true, url: null };
  if (looksLikeCardNumber(trimmed)) return { ok: false, reason: "card" };
  if (/\s/.test(trimmed)) return { ok: false, reason: "https" };
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { ok: false, reason: "https" };
  }
  if (parsed.protocol !== "https:" || !parsed.hostname || parsed.username || parsed.password) {
    return { ok: false, reason: "https" };
  }
  const href = parsed.href;
  if (href.length > PAY_URL_MAX) return { ok: false, reason: "length" };
  if (looksLikeCardNumber(href)) return { ok: false, reason: "card" };
  return { ok: true, url: href };
}
