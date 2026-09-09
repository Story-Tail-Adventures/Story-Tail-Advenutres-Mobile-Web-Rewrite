/**
 * The parts every Screen Inventory §2.1.9–2.1.14 onboarding endpoint needs.
 *
 * Six screens write through five functions, and every one of them has to do the same four
 * things: prove the caller is a client, find the client row they own, advance the wizard
 * cursor, and refuse anything that names a row belonging to somebody else. Doing that four
 * times in five files is how one of them ends up subtly different.
 */
import { badRequest, forbidden } from "./problem.ts";
import { serviceClient, type Db } from "./db.ts";
import type { TablesUpdate } from "./database.types.ts";
import { requireRole, type AuthContext } from "./auth.ts";

/**
 * The wizard's steps, in order.
 *
 * Must match the CHECK constraint in
 * supabase/migrations/20260903230000_onboarding_step.sql. The database is the one that
 * refuses a typo; this is what decides what comes next.
 */
export const ONBOARDING_STEPS = [
  "profile", // 2.1.10
  "preferences", // 2.1.11
  "companions", // 2.1.12
  "connect", // 2.1.13
  "complete", // 2.1.14 — the summary. Reaching it is not the same as finishing.
] as const;

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

export function isOnboardingStep(value: unknown): value is OnboardingStep {
  return typeof value === "string" &&
    (ONBOARDING_STEPS as readonly string[]).includes(value);
}

/** The step after `step`, or null when there is none left. */
export function nextStep(step: OnboardingStep): OnboardingStep | null {
  const index = ONBOARDING_STEPS.indexOf(step);
  return ONBOARDING_STEPS[index + 1] ?? null;
}

/**
 * The client row this caller owns, or a 403.
 *
 * Every onboarding write is scoped by this and never by an id from the request body. A
 * function that accepted a `client_id` would be an IDOR with a friendly name: these run as
 * the service role, so RLS is not there to catch the mistake.
 */
export function requireClientId(ctx: AuthContext): string {
  requireRole(ctx, "client");
  if (!ctx.clientId) {
    throw forbidden("This account is not linked to a traveler record.");
  }
  return ctx.clientId;
}

/**
 * Move the wizard cursor on.
 *
 * `completed` clears the cursor and stamps `onboarding_completed_at`, which is what the
 * route gate reads. The two are mutually exclusive at the database level — a finished
 * wizard keeping a step slug would give any later "where are they up to" read an answer
 * for somebody who is not in the wizard at all.
 *
 * Idempotent on completion: a second "finish" must not re-stamp the timestamp, or a
 * double-submit rewrites when somebody joined.
 */
export async function advanceOnboarding(
  db: Db,
  platformUserId: string,
  to: OnboardingStep | null,
  options: { complete?: boolean } = {},
): Promise<void> {
  // Typed rather than inferred: a union of two object literals trips the generated
  // client's excess-property check, which reads as a type error about `never`.
  const patch: TablesUpdate<"platform_user"> = options.complete
    ? { onboarding_step: null, onboarding_completed_at: new Date().toISOString() }
    : { onboarding_step: to };

  let query = db.from("platform_user").update(patch).eq("id", platformUserId);

  // Only when completing: leave an already-finished wizard's timestamp alone.
  if (options.complete) query = query.is("onboarding_completed_at", null);

  const { error } = await query;
  if (error) {
    throw new Error(`Could not advance onboarding for ${platformUserId}: ${error.message}`);
  }
}

/**
 * The service-role client these functions run as.
 *
 * WHY NOT `userClient`: every table this touches has SELECT-only RLS for `authenticated`
 * and no write policy at all, deliberately — `client` is sensitive under CLAUDE.md rule 3
 * and must be audited, `platform_user` carries `role` and a self-service UPDATE would let a
 * client make themselves an agent, and `travel_document`/`companion` hold column-encrypted
 * fields. So the caller's own permissions cannot perform these writes by design, and the
 * scoping RLS would have done is done explicitly by [requireClientId] instead.
 */
export function onboardingDb(): Db {
  return serviceClient();
}

/** Parse a JSON body, or a 400 that does not echo what was sent. */
export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    if (body === null || typeof body !== "object" || Array.isArray(body)) {
      throw new Error("not an object");
    }
    return body as Record<string, unknown>;
  } catch {
    throw badRequest("Expected a JSON object.");
  }
}

/**
 * A trimmed string, or null.
 *
 * The tri-state matters and is easy to lose: a key that is ABSENT means "leave this alone",
 * an explicit `null` means "clear it", and `""` is treated as clearing too — an emptied
 * input is a person removing a value, not a person sending nothing.
 */
export function optionalText(
  body: Record<string, unknown>,
  key: string,
): string | null | undefined {
  if (!(key in body)) return undefined;
  const value = body[key];
  if (value === null) return null;
  if (typeof value !== "string") throw badRequest(`${key} must be a string or null.`);
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/** An ISO date (`YYYY-MM-DD`), or null. Rejects anything Postgres would reject anyway. */
export function optionalDate(
  body: Record<string, unknown>,
  key: string,
): string | null | undefined {
  const value = optionalText(body, key);
  if (value === undefined || value === null) return value;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw badRequest(`${key} must be a date in YYYY-MM-DD form.`);
  }
  // Catches 2026-02-30, which the regex is happy with.
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || !parsed.toISOString().startsWith(value)) {
    throw badRequest(`${key} is not a real date.`);
  }
  return value;
}

/**
 * A phone number as E.164, or null.
 *
 * PARALLEL IMPLEMENTATION of `normalizePhone` in web/lib/validation/profile.ts. Deno cannot
 * import from `web/` — CLAUDE.md makes the stack directories a hard boundary — and this
 * endpoint is reachable without the form, so the rule cannot live only there. Data-Model
 * §6.1 specifies E.164 and no column enforces it; without this, `+1 (305) 555-0184` and
 * `3055550184` are two different values for one traveler's phone.
 *
 * The guess-at-+1 rule is the same P1 decision the form documents: a number that already
 * carries a `+` is taken as given, a bare North American ten digits is assumed to be
 * American because the practice is, and anything else is refused rather than mangled.
 * If either side changes, change both.
 */
export function optionalPhone(
  body: Record<string, unknown>,
  key: string,
  /** What to call the field in an error. Nested objects reuse the key `phone`. */
  label: string = key,
): string | null | undefined {
  const value = optionalText(body, key);
  if (value === undefined || value === null) return value;

  const cleaned = value.replace(/[\s().-]/g, "");
  if (!/^\+?\d+$/.test(cleaned)) {
    throw badRequest(`${label} does not look like a phone number.`);
  }

  if (cleaned.startsWith("+")) {
    const digits = cleaned.slice(1);
    // E.164 caps the whole number at 15 digits; the shortest real one is seven.
    if (digits.length < 7 || digits.length > 15) {
      throw badRequest(`${label} does not look like a phone number.`);
    }
    return `+${digits}`;
  }

  // The +1 guess is CHECKED, not assumed: a NANP area code and exchange code both begin
  // 2-9, so "1234567890" is ten digits that cannot ring anywhere and would be stored as a
  // well-formed `+11234567890` nobody could tell from a real number.
  const national =
    cleaned.length === 11 && cleaned.startsWith("1") ? cleaned.slice(1) : cleaned;
  if (national.length !== 10) {
    throw badRequest(`${label} needs a country code unless it is a US number.`);
  }
  if (!NANP.test(national)) {
    throw badRequest(`${label} does not look like a phone number.`);
  }
  return `+1${national}`;
}

/** Area code and exchange code, both of which begin 2-9 in the North American plan. */
const NANP = /^[2-9]\d{2}[2-9]\d{6}$/;

/** A two-letter ISO 3166-1 country code, uppercased, or null. */
export function optionalCountry(
  body: Record<string, unknown>,
  key: string,
): string | null | undefined {
  const value = optionalText(body, key);
  if (value === undefined || value === null) return value;
  const upper = value.toUpperCase();
  if (!/^[A-Z]{2}$/.test(upper)) {
    throw badRequest(`${key} must be a two-letter country code.`);
  }
  return upper;
}

/** A list of short free-text tags — the chip pickers on 2.1.11. */
export function optionalTags(
  body: Record<string, unknown>,
  key: string,
  { max = 40, maxLength = 60 }: { max?: number; maxLength?: number } = {},
): string[] | undefined {
  if (!(key in body)) return undefined;
  const value = body[key];
  if (value === null) return [];
  if (!Array.isArray(value)) throw badRequest(`${key} must be an array.`);
  if (value.length > max) throw badRequest(`${key} has too many entries.`);

  const out: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string") throw badRequest(`${key} must contain only strings.`);
    const trimmed = entry.trim();
    if (trimmed === "") continue;
    if (trimmed.length > maxLength) throw badRequest(`An entry in ${key} is too long.`);
    // Deduplicated here rather than in the database: these are text[] columns with no
    // constraint, and a chip list that shows "Caribbean" twice looks broken.
    if (!out.includes(trimmed)) out.push(trimmed);
  }
  return out;
}
