import { z } from "zod";
import { isCountryCode } from "@/lib/countries";
import { optionalTextSchema } from "./text";

/**
 * Screen 2.1.10 Profile Completion — the rules.
 *
 * Every field on this screen is optional and the whole step is skippable, so almost none of
 * this is "you must". What it is instead is three GROUP rules — address, emergency contact,
 * passport — where a half-filled group is worse than an empty one, and the columns behind
 * them say so: `address.line1`, `.city` and `.country` are all NOT NULL (Data-Model §6.3),
 * an emergency contact with no phone number cannot be called, and a passport row whose only
 * reason to exist is the expiry reminder needs an expiry.
 *
 * The same three rules are enforced again in supabase/functions/onboarding-profile — that
 * endpoint is reachable without this form, and a rule that lives only in a form is a
 * suggestion. This copy is what makes the message land next to the right group.
 *
 * Web-only copy until mobile builds 2.1m.10 — when it does, these need Kotlin twins and
 * entries in .github/scripts/check_copy_parity.py's key map, which only compares the keys
 * it is told about.
 */

export const PROFILE_MESSAGES = {
  phoneInvalid: "That doesn't look like a phone number yet",
  phoneNeedsCountryCode: "Add a country code — like +44 — for a number outside the US",
  dobInvalid: "Check that date — it should be in the past",
  dobTooEarly: "Check that year",
  dateInvalid: "Use the date picker, or type it as YYYY-MM-DD",
  countryInvalid: "Pick a country from the list",
  postalInvalid: "Letters, numbers, spaces and hyphens only",
  tooLong: "That's longer than this field can hold",
  invalidChars: "Some of those characters won't work here",
  addressIncomplete: "An address needs at least a street, a city and a country",
  emergencyIncomplete: "Add both a name and a phone, so we know who to call and how",
  passportIncomplete: "Add the expiry date too — that's the part I use to remind you",
} as const;

/** Column widths from supabase/migrations/20260514120000_initial.sql. */
export const PROFILE_LIMITS = {
  addressLine: 200,
  city: 120,
  region: 120,
  postalCode: 20,
  emergencyName: 160,
  emergencyRelationship: 60,
} as const;

/**
 * The oldest date of birth we will accept.
 *
 * Not an age check. Data-Model §6.1 has no minimum age and there must not be one — clients
 * travel with minors on their own accounts, and Gyasi creates records for whole households.
 * This only catches the year somebody's finger slipped on.
 */
const EARLIEST_BIRTH_DATE = "1900-01-01";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Whether `value` is a real calendar date, not merely a well-shaped one (2026-02-30). */
export function isRealDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
}

/**
 * Today in UTC as `YYYY-MM-DD`, for comparing against a date-only column.
 *
 * Called during render on the client, so in principle the server and the browser can
 * disagree — but only across the instant of UTC midnight, and only about the `max` on a
 * date input and whether a passport is shown as expired. Neither blocks a save and neither
 * is stored, so the mismatch is accepted rather than designed around. This is deliberately
 * NOT the same class of problem as the `Intl.DisplayNames` hydration bug that
 * lib/countries.ts documents: that one differed on every render, this one on one second a
 * day and only for a warning.
 */
export function todayIso(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export type PhoneResult =
  | { ok: true; value: string | null }
  | { ok: false; message: string };

/**
 * A phone number as E.164, or a reason it is not one.
 *
 * P1 SCOPE DECISION, September 2026. Data-Model §6.1 specifies E.164 and nothing in the
 * database enforces it, so it is enforced here and in the Edge Function. Doing it *fully*
 * means libphonenumber — a third-party dependency that CLAUDE.md sends through security
 * review — so this does the defensible subset instead: a number that already carries a `+`
 * is taken as given, and a bare ten-digit number is assumed to be American because the
 * practice is. The hint on the field says so out loud rather than assuming silently.
 *
 * `""` is a successful parse of "nothing", because on this screen an emptied field means
 * "remove this", not "you made a mistake".
 */
export function normalizePhone(raw: string): PhoneResult {
  const trimmed = raw.trim();
  if (trimmed === "") return { ok: true, value: null };

  // Everything people actually type: (305) 555-0184, 305.555.0184, +44 20 7946 0958.
  const cleaned = trimmed.replace(/[\s().-]/g, "");
  if (!/^\+?\d+$/.test(cleaned)) {
    return { ok: false, message: PROFILE_MESSAGES.phoneInvalid };
  }

  if (cleaned.startsWith("+")) {
    const digits = cleaned.slice(1);
    // E.164 caps the whole number at 15 digits. The floor is the shortest real one:
    // Niue's +683 xxxx is seven.
    if (digits.length < 7 || digits.length > 15) {
      return { ok: false, message: PROFILE_MESSAGES.phoneInvalid };
    }
    return { ok: true, value: `+${digits}` };
  }

  // No country code. North America is the only place we will guess for, and the guess is
  // CHECKED rather than assumed: a NANP area code and exchange code both begin 2-9, so
  // "1234567890" is ten digits that cannot ring anywhere. Storing it would produce a
  // well-formed `+11234567890` indistinguishable from a real number — on, among other
  // fields, the one whose entire job is being reachable in an emergency.
  const national =
    cleaned.length === 11 && cleaned.startsWith("1") ? cleaned.slice(1) : cleaned;
  if (national.length !== 10) {
    return { ok: false, message: PROFILE_MESSAGES.phoneNeedsCountryCode };
  }
  if (!NANP.test(national)) {
    return { ok: false, message: PROFILE_MESSAGES.phoneInvalid };
  }
  return { ok: true, value: `+1${national}` };
}

/** Area code and exchange code, both of which begin 2-9 in the North American plan. */
const NANP = /^[2-9]\d{2}[2-9]\d{6}$/;

const phoneSchema = z
  .string()
  .transform(normalizePhone)
  .superRefine((result, ctx) => {
    if (!result.ok) ctx.addIssue({ code: "custom", message: result.message });
  })
  .transform((result) => (result.ok ? result.value : null));

/** An optional ISO date that must be real, but may be in the future (a passport expiry). */
const dateSchema = z
  .string()
  .trim()
  .transform((value) => (value === "" ? null : value))
  .superRefine((value, ctx) => {
    if (value !== null && !isRealDate(value)) {
      ctx.addIssue({ code: "custom", message: PROFILE_MESSAGES.dateInvalid });
    }
  });

/** A date of birth: real, in the past, and this side of 1900. */
const birthDateSchema = z
  .string()
  .trim()
  .transform((value) => (value === "" ? null : value))
  .superRefine((value, ctx) => {
    if (value === null) return;
    if (!isRealDate(value) || value >= todayIso()) {
      ctx.addIssue({ code: "custom", message: PROFILE_MESSAGES.dobInvalid });
      return;
    }
    if (value < EARLIEST_BIRTH_DATE) {
      ctx.addIssue({ code: "custom", message: PROFILE_MESSAGES.dobTooEarly });
    }
  });

/** Alpha-2, uppercased, checked against the assigned list — `char(2)` truncates silently. */
const countrySchema = z
  .string()
  .trim()
  .transform((value) => (value === "" ? null : value.toUpperCase()))
  .superRefine((value, ctx) => {
    if (value !== null && !isCountryCode(value)) {
      ctx.addIssue({ code: "custom", message: PROFILE_MESSAGES.countryInvalid });
    }
  });

/**
 * A postal code.
 *
 * Deliberately not a five-digit US pattern: K1A 0B1 and SW1A 1AA are postal codes too, and
 * this field is reachable from every country in the list.
 */
const postalCodeSchema = z
  .string()
  .trim()
  .max(PROFILE_LIMITS.postalCode, PROFILE_MESSAGES.tooLong)
  .regex(/^[A-Za-z0-9 -]*$/, PROFILE_MESSAGES.postalInvalid)
  .transform((value) => (value === "" ? null : value));

function text(max: number) {
  return optionalTextSchema(max, {
    tooLong: PROFILE_MESSAGES.tooLong,
    invalid: PROFILE_MESSAGES.invalidChars,
  });
}

/**
 * The three groups, checked as units.
 *
 * Reported on a pseudo-field named for the group rather than on one of its inputs, so the
 * message renders under the group heading. Marking `addressCity` red when the real problem
 * is "this address has no country" points at the wrong box.
 */
function checkGroups(v: ProfileValues, ctx: z.RefinementCtx): void {
  // Country is deliberately NOT part of this test. The picker starts on US because most of
  // the practice's clients are American, so its value is evidence of a default rather than
  // of intent — counting it would mean an untouched form failed with "an address needs at
  // least a street, a city and a country". Everything here is something a person typed.
  const addressTouched = [
    v.addressLine1,
    v.addressLine2,
    v.addressCity,
    v.addressRegion,
    v.addressPostalCode,
  ].some((part) => part !== null);
  if (addressTouched && !(v.addressLine1 && v.addressCity && v.addressCountry)) {
    ctx.addIssue({
      code: "custom",
      path: ["address"],
      message: PROFILE_MESSAGES.addressIncomplete,
    });
  }

  const emergencyTouched =
    v.emergencyName !== null ||
    v.emergencyPhone !== null ||
    v.emergencyRelationship !== null;
  if (emergencyTouched && !(v.emergencyName && v.emergencyPhone)) {
    ctx.addIssue({
      code: "custom",
      path: ["emergencyContact"],
      message: PROFILE_MESSAGES.emergencyIncomplete,
    });
  }

  // Expiry without a country is fine — the reminder still works. A country without an
  // expiry is a row with nothing to do.
  if (v.passportCountry !== null && v.passportExpiry === null) {
    ctx.addIssue({
      code: "custom",
      path: ["passport"],
      message: PROFILE_MESSAGES.passportIncomplete,
    });
  }
}

const profileShape = z.object({
  phone: phoneSchema,
  dateOfBirth: birthDateSchema,
  addressLine1: text(PROFILE_LIMITS.addressLine),
  addressLine2: text(PROFILE_LIMITS.addressLine),
  addressCity: text(PROFILE_LIMITS.city),
  addressRegion: text(PROFILE_LIMITS.region),
  addressPostalCode: postalCodeSchema,
  addressCountry: countrySchema,
  emergencyName: text(PROFILE_LIMITS.emergencyName),
  emergencyPhone: phoneSchema,
  emergencyRelationship: text(PROFILE_LIMITS.emergencyRelationship),
  passportExpiry: dateSchema,
  passportCountry: countrySchema,
});

export type ProfileValues = z.output<typeof profileShape>;

export const profileSchema = profileShape.superRefine(checkGroups);

/**
 * Every key an error can be reported on: the inputs, plus the three group pseudo-fields.
 *
 * `flattenIssues` keeps only the issues whose first path segment is in this list, so a group
 * name missing from it would refuse the submit and render nothing.
 */
export const PROFILE_FIELDS = [
  "phone",
  "dateOfBirth",
  "address",
  "addressLine1",
  "addressLine2",
  "addressCity",
  "addressRegion",
  "addressPostalCode",
  "addressCountry",
  "emergencyContact",
  "emergencyName",
  "emergencyPhone",
  "emergencyRelationship",
  "passport",
  "passportExpiry",
  "passportCountry",
] as const;

export type ProfileField = (typeof PROFILE_FIELDS)[number];

export interface ProfilePayload {
  phone: string | null;
  dateOfBirth: string | null;
  address: {
    line1: string;
    line2: string | null;
    city: string;
    region: string | null;
    postalCode: string | null;
    country: string;
  } | null;
  emergencyContact: {
    name: string;
    phone: string;
    relationship: string | null;
  } | null;
  passport: { expiresOn: string | null; issuingCountry: string | null } | null;
}

/**
 * The body `supabase/functions/onboarding-profile` expects.
 *
 * Every key is always present, and that is the point: the function treats an ABSENT key as
 * "leave it alone" and an explicit `null` as "clear it". This screen shows all of these
 * fields at once, so a field left empty is a person saying they do not have one — which is
 * how somebody who came back to this step removes an emergency contact they no longer want
 * on their itinerary, and what 2.5.2 Personal Info Edit will need when it reuses these rules.
 */
export function toProfilePayload(v: ProfileValues): ProfilePayload {
  return {
    phone: v.phone,
    dateOfBirth: v.dateOfBirth,
    address:
      v.addressLine1 && v.addressCity && v.addressCountry
        ? {
            line1: v.addressLine1,
            line2: v.addressLine2,
            city: v.addressCity,
            region: v.addressRegion,
            postalCode: v.addressPostalCode,
            country: v.addressCountry,
          }
        : null,
    emergencyContact:
      v.emergencyName && v.emergencyPhone
        ? {
            name: v.emergencyName,
            phone: v.emergencyPhone,
            relationship: v.emergencyRelationship,
          }
        : null,
    passport:
      v.passportExpiry || v.passportCountry
        ? { expiresOn: v.passportExpiry, issuingCountry: v.passportCountry }
        : null,
  };
}
