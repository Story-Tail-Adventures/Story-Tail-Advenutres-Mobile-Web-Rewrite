/**
 * §3.6 pay links and the paid record (Data-Model §9.5), server-free so they are tested on
 * their own (`payLink_test.ts`). The SQL CHECKs on `payment_milestone` refuse all of this
 * again; these answer in English first, so a refused save is a 400 with a sentence rather
 * than a 500 off a constraint.
 *
 * NO CARD NUMBERS, EVER. A pay link, a confirmation number or a note holding a 13 to 19
 * digit run that passes Luhn is REFUSED, not masked: the advisor is typing, so the right
 * answer is to say no and say why. `public.text_has_card_digits` is the SQL twin.
 */
import { badRequest } from "./problem.ts";

export const MAX_PAY_URL = 2048;
export const MAX_PAID_REFERENCE = 100;
export const MAX_PAID_NOTE = 1000;

/**
 * The same card-shaped run `push.ts`'s CARD_LIKE masks: a digit, then 12 to 18 more, each
 * optionally after one space, dot, dash or no-break space.
 */
const CARD_LIKE = /\b\d(?:[ . -]?\d){12,18}\b/g;

export function luhnValid(digits: string): boolean {
  let total = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    total += d;
    double = !double;
  }
  return total % 10 === 0;
}

/** True when the text holds a 13 to 19 digit card-shaped run that passes Luhn. */
export function hasCardNumber(text: string): boolean {
  for (const match of text.matchAll(CARD_LIKE)) {
    const digits = match[0].replace(/\D/g, "");
    if (digits.length >= 13 && digits.length <= 19 && luhnValid(digits)) return true;
  }
  return false;
}

const CARD_REFUSAL = "That looks like a card number. Card numbers never go in the app.";

/**
 * A pay link as the advisor typed it, or null to remove one (null, undefined or blank).
 *
 * Parsed with `new URL()` and stored as its `href`, so what is saved is what was checked:
 * the host comes back lower-cased and in its ASCII (punycode) form, which is what the client
 * is shown as the site name. Refused: anything not `https:`, a user name or password, no
 * host, a card number, or more than 2,048 characters.
 */
export function readPayUrl(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") throw badRequest("The pay link must be text.");
  const raw = value.trim();
  if (raw === "") return null;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw badRequest(
      "That doesn't look like a link. Paste the full address, starting https://",
    );
  }
  if (url.protocol !== "https:") {
    throw badRequest(
      "Pay links must start with https:// so the client's payment is secure.",
    );
  }
  if (url.username !== "" || url.password !== "") {
    throw badRequest("A pay link can't carry a user name or password.");
  }
  if (url.hostname === "") throw badRequest("That link has no site in it.");

  const href = url.href;
  if (href.length > MAX_PAY_URL) throw badRequest("That link is too long.");
  if (hasCardNumber(href) || hasCardNumber(raw)) throw badRequest(CARD_REFUSAL);
  return href;
}

/**
 * Optional free text for Mark Paid. `undefined` and `null` mean "not sent" (keep what is
 * stored); a blank string means "clear it" and is passed through as "" for the SQL to clear.
 */
function readPaidText(value: unknown, field: string, max: number): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") throw badRequest(`${field} must be text.`);
  const trimmed = value.trim();
  if (trimmed.length > max) throw badRequest(`${field} is too long.`);
  if (hasCardNumber(trimmed)) throw badRequest(CARD_REFUSAL);
  return trimmed;
}

export function readPaidReference(value: unknown): string | null {
  return readPaidText(value, "Confirmation number", MAX_PAID_REFERENCE);
}

export function readPaidNote(value: unknown): string | null {
  return readPaidText(value, "Note", MAX_PAID_NOTE);
}

/**
 * Mark Paid's "Date paid", as `yyyy-mm-dd`, or null to keep the stored date. A real calendar
 * date, and not after tomorrow in UTC: the advisor's own today can run up to a day ahead of
 * or behind UTC, and the SQL refuses anything after the advisor's today exactly.
 */
export function readPaidOn(value: unknown, now: Date = new Date()): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw badRequest("Date paid must be a date.");
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw badRequest("Date paid must be a date.");
  }
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString().slice(
    0,
    10,
  );
  if (value > tomorrow) throw badRequest("The date paid can't be in the future.");
  return value;
}
