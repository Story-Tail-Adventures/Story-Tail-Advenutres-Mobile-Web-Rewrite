/**
 * §3.8 Leads (revived 2026-10-21, BRD §6.5, Data-Model §11): what the public form and the
 * advisor's lead actions accept.
 *
 * Pure: no network, no database. `lead-message` and `agent-lead` hand it the parsed body and
 * the request headers, so every rule below is testable in CI.
 *
 * ── THE TWO SPAM CHECKS THAT STORE NOTHING ───────────────────────────────────
 *
 * The form carries a hidden field (`website`) that a person never sees and a bot fills, and
 * the moment it was drawn (`startedAt`, epoch milliseconds). A filled hidden field, or a send
 * less than three seconds after the form was drawn, is answered like a success and writes
 * nothing, so a bot learns nothing. The third check, five sends an hour per network address,
 * lives in the database (`lead_throttle_check`), because it has to remember.
 *
 * ── WHOSE ADDRESS ────────────────────────────────────────────────────────────
 *
 * The web form posts through a Next.js server action, so the address this function sees is the
 * web server's, and every visitor would share one limit. The server passes the visitor's
 * address in `x-sta-client-ip` beside a shared key (`x-sta-form-key`, `LEAD_FORM_KEY` here and
 * `STA_LEAD_FORM_KEY` on the web). Without the right key the header is ignored and the
 * connection's own address is used, so a caller who calls this function directly cannot pick
 * a fresh address for every send.
 */
import { hasCardNumber } from "./cardDigits.ts";
import { badRequest } from "./problem.ts";

export const LEAD_PAGES = [
  "landing",
  "how-it-works",
  "about",
  "topic",
  "results",
  "detail",
  "join",
  "app",
] as const;
export type LeadPage = (typeof LEAD_PAGES)[number];

/** 3.8.5's sources. `website` is the form's alone. */
export const MANUAL_LEAD_SOURCES = ["email", "phone", "referral", "social", "other"] as const;
export type ManualLeadSource = (typeof MANUAL_LEAD_SOURCES)[number];

export const LEAD_CLOSE_REASONS = ["not_a_fit", "no_reply", "went_elsewhere", "other"] as const;
export type LeadCloseReason = (typeof LEAD_CLOSE_REASONS)[number];

export const LEAD_OPS = ["mark_contacted", "close", "reopen", "convert", "delete_spam"] as const;
export type LeadOp = (typeof LEAD_OPS)[number];

export const MAX_NAME = 80;
export const MAX_EMAIL = 254;
export const MAX_PHONE = 40;
export const MAX_BODY = 2000;
export const MAX_ABOUT = 120;
export const MAX_UTM = 100;
export const MAX_CLOSE_NOTE = 500;
/** Faster than this from drawing the form to sending it, and it was not a person. */
export const MIN_FILL_MS = 3000;

/**
 * WHO IS READING THE 400. The same parsers serve the public form (a visitor, so the sentence
 * speaks about Gyasi) and the advisor's Add lead and Close (Gyasi himself, who should not be
 * told "Please tell Gyasi your first name"). Each sentence comes in both voices.
 */
export type Audience = "visitor" | "advisor";

/** What the form, or the advisor's screen, shows when a text holds a card number. */
export const CARD_NUMBER_REFUSAL = "Please leave card numbers out. Gyasi will never ask for one here.";
export const CARD_NUMBER_REFUSAL_ADVISOR = "Card numbers can't be saved here. Please take it out and try again.";

const SAY: Record<Audience, { firstName: string; body: string; bodyLong: string; card: string }> = {
  visitor: {
    firstName: "Please tell Gyasi your first name.",
    body: "Please write a few words for Gyasi.",
    bodyLong: "Your note is a little long. Please keep it under 2,000 characters.",
    card: CARD_NUMBER_REFUSAL,
  },
  advisor: {
    firstName: "Add a first name.",
    body: "Add a few words about what they're looking for.",
    bodyLong: "That's a little long. Please keep it under 2,000 characters.",
    card: CARD_NUMBER_REFUSAL_ADVISOR,
  },
};

const EMAIL = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[^\s@<>()",;:]+$/;
const PHONE = /^[0-9+().\-\s]{3,40}$/;
const SLUG = /^[a-z0-9][a-z0-9-]{0,119}$/;
// Control characters (other than newline and tab in a message body) never belong in a field.
// deno-lint-ignore no-control-regex
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const LINE_BREAKS = /[\r\n\t\u2028\u2029]+/g;

/** One line of text, trimmed, or null when empty. Too long is the caller's 400. */
function line(value: unknown, max: number, label: string): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") throw badRequest(`${label} must be text.`);
  const cleaned = value.replace(CONTROL, "").replace(LINE_BREAKS, " ").replace(/\s+/g, " ").trim();
  if (cleaned === "") return null;
  if (cleaned.length > max) throw badRequest(`${label} is too long.`);
  return cleaned;
}

/** A message body: newlines kept, other control characters dropped, trimmed. */
function body(value: unknown, audience: Audience): string {
  if (typeof value !== "string") throw badRequest(SAY[audience].body);
  const cleaned = value.replace(/\r\n?/g, "\n").replace(CONTROL, "").trim();
  if (cleaned === "") throw badRequest(SAY[audience].body);
  if (cleaned.length > MAX_BODY) throw badRequest(SAY[audience].bodyLong);
  return cleaned;
}

function requiredName(value: unknown, audience: Audience): string {
  const first = line(value, MAX_NAME, "First name");
  if (!first) throw badRequest(SAY[audience].firstName);
  return first;
}

function email(value: unknown): string {
  const e = line(value, MAX_EMAIL, "Email");
  if (!e || !EMAIL.test(e)) throw badRequest("Please check your email address.");
  return e;
}

function phone(value: unknown): string | null {
  const p = line(value, MAX_PHONE, "Phone");
  if (p && !PHONE.test(p)) throw badRequest("Please check your phone number.");
  return p;
}

function refuseCard(audience: Audience, ...texts: (string | null)[]): void {
  if (texts.some((t) => t !== null && hasCardNumber(t))) throw badRequest(SAY[audience].card);
}

export interface LeadFormInput {
  firstName: string;
  lastName: string | null;
  email: string;
  phone: string | null;
  message: string;
  page: LeadPage | null;
  aboutKind: "trip" | "topic" | null;
  aboutSlug: string | null;
  aboutLabel: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
}

/**
 * Whether a send is a bot's: the hidden field filled, or sent too fast. `startedAt` missing or
 * not a number is a malformed request (a 400), not a bot: every caller we wrote sends it.
 */
export function looksAutomated(payload: Record<string, unknown>, now: number): boolean {
  const honeypot = payload.website;
  if (typeof honeypot === "string" && honeypot.trim() !== "") return true;
  if (honeypot !== undefined && honeypot !== null && typeof honeypot !== "string") return true;
  const started = payload.startedAt;
  if (typeof started !== "number" || !Number.isFinite(started)) {
    throw badRequest("Send startedAt, the moment the form was drawn.");
  }
  return now - started < MIN_FILL_MS;
}

/** The public form's fields, checked. Throws a 400 a person can read. */
export function parseLeadForm(payload: Record<string, unknown>): LeadFormInput {
  const firstName = requiredName(payload.firstName, "visitor");
  const lastName = line(payload.lastName, MAX_NAME, "Last name");
  const e = email(payload.email);
  const p = phone(payload.phone);
  const message = body(payload.message, "visitor");
  refuseCard("visitor", message, p);

  const page = typeof payload.page === "string" && (LEAD_PAGES as readonly string[]).includes(payload.page)
    ? payload.page as LeadPage
    : null;

  // What they were viewing. Dropped (not refused) when malformed: it is context for Gyasi,
  // and a visitor should never be stopped by something they did not type.
  let aboutKind: "trip" | "topic" | null = null;
  let aboutSlug: string | null = null;
  let aboutLabel: string | null = null;
  const about = payload.about;
  if (about && typeof about === "object" && !Array.isArray(about)) {
    const a = about as Record<string, unknown>;
    if ((a.kind === "trip" || a.kind === "topic") && typeof a.slug === "string" && SLUG.test(a.slug)) {
      aboutKind = a.kind;
      aboutSlug = a.slug;
      try {
        aboutLabel = line(a.label, MAX_ABOUT, "About");
      } catch {
        aboutLabel = null;
      }
    }
  }

  const utm = payload.utm && typeof payload.utm === "object" && !Array.isArray(payload.utm)
    ? payload.utm as Record<string, unknown>
    : {};
  const tag = (v: unknown): string | null => {
    try {
      return line(v, MAX_UTM, "Campaign tag");
    } catch {
      return null;
    }
  };

  return {
    firstName,
    lastName,
    email: e,
    phone: p,
    message,
    page,
    aboutKind,
    aboutSlug,
    aboutLabel,
    utmSource: tag(utm.source),
    utmMedium: tag(utm.medium),
    utmCampaign: tag(utm.campaign),
  };
}

export interface ManualLeadInput {
  firstName: string;
  lastName: string | null;
  email: string;
  phone: string | null;
  source: ManualLeadSource;
  message: string;
}

/** 3.8.5 Add lead. */
export function parseManualLead(payload: Record<string, unknown>): ManualLeadInput {
  const source = payload.source;
  if (typeof source !== "string" || !(MANUAL_LEAD_SOURCES as readonly string[]).includes(source)) {
    throw badRequest(`source must be one of: ${MANUAL_LEAD_SOURCES.join(", ")}.`);
  }
  const firstName = requiredName(payload.firstName, "advisor");
  const lastName = line(payload.lastName, MAX_NAME, "Last name");
  const e = email(payload.email);
  const p = phone(payload.phone);
  const message = body(payload.message, "advisor");
  refuseCard("advisor", message, p);
  return { firstName, lastName, email: e, phone: p, source: source as ManualLeadSource, message };
}

export interface CloseInput {
  reason: LeadCloseReason;
  note: string | null;
}

/** 3.8.4 Close: a reason from the list and an optional private note. */
export function parseClose(payload: Record<string, unknown>): CloseInput {
  const reason = payload.reason;
  if (typeof reason !== "string" || !(LEAD_CLOSE_REASONS as readonly string[]).includes(reason)) {
    throw badRequest(`reason must be one of: ${LEAD_CLOSE_REASONS.join(", ")}.`);
  }
  let note: string | null = null;
  if (payload.note !== undefined && payload.note !== null) {
    if (typeof payload.note !== "string") throw badRequest("note must be text.");
    const n = payload.note.replace(/\r\n?/g, "\n").replace(CONTROL, "").trim();
    if (n.length > MAX_CLOSE_NOTE) throw badRequest("That note is too long.");
    note = n === "" ? null : n;
  }
  refuseCard("advisor", note);
  return { reason: reason as LeadCloseReason, note };
}

export function requireLeadOp(value: unknown): LeadOp | "create" {
  if (value === "create") return "create";
  if (typeof value === "string" && (LEAD_OPS as readonly string[]).includes(value)) return value as LeadOp;
  throw badRequest(`op must be create or one of: ${LEAD_OPS.join(", ")}.`);
}

/** Constant-time string comparison, for the form key. */
export function sameSecret(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

/**
 * The address the per-address limit counts. The web server's forwarded visitor address when it
 * holds the shared key. Otherwise the connection's own: `cf-connecting-ip` when the edge set it
 * (a caller cannot), else the left-most `x-forwarded-for` entry, the rule hotel search's limiter
 * already uses (`_shared/hotels/ratelimit.ts`). NOT `x-real-ip`: on the local stack that is the
 * gateway's own address, which would put every visitor in one bucket. Null when none is there:
 * the database then counts all such sends together.
 */
export function clientAddress(headers: Headers, formKey: string | null): string | null {
  const offered = headers.get("x-sta-form-key");
  const forwarded = headers.get("x-sta-client-ip")?.trim();
  if (formKey && offered && forwarded && sameSecret(offered, formKey) && forwarded.length <= 64) {
    return forwarded;
  }
  const candidates = [
    headers.get("cf-connecting-ip"),
    headers.get("x-forwarded-for")?.split(",")[0],
  ];
  for (const c of candidates) {
    const v = c?.trim();
    if (v && v.length <= 64) return v;
  }
  return null;
}
