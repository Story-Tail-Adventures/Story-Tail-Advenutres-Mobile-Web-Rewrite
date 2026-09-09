import { z } from "zod";
import { isCountryCode } from "@/lib/countries";
import { isRealDate, todayIso } from "./profile";
import { optionalTextSchema } from "./text";

/**
 * Screen 2.1.12 Travel Companions — the rules for one traveler.
 *
 * Two required fields and four optional ones, which makes this the simplest form in §2.1 —
 * and the one most likely to be filled in for somebody who is not sitting at the keyboard.
 * `first_name` and `last_name` are both NOT NULL and are split rather than one "full name"
 * box because suppliers need them separately for ticketing.
 *
 * NO PASSPORT NUMBER. Same decision as 2.1.10, and here it also closes a second problem:
 * `companion.passport_number_encrypted` is outside the client's SELECT grant, so the screen
 * could not tell somebody what is on file even to ask them to confirm it.
 *
 * Web-only copy until mobile builds 2.1m.12 — when it does, these need Kotlin twins and
 * entries in .github/scripts/check_copy_parity.py's key map.
 */

export const COMPANION_MESSAGES = {
  firstNameRequired: "Tell us their first name",
  lastNameRequired: "And their last name — suppliers need both for ticketing",
  nameTooLong: "Keep it to 80 characters or fewer",
  invalidChars: "Some of those characters won't work here",
  relationshipTooLong: "Keep it to 40 characters or fewer",
  dobInvalid: "Check that date — it should be in the past",
  dateInvalid: "Use the date picker, or type it as YYYY-MM-DD",
  countryInvalid: "Pick a country from the list",
  passportNeedsExpiry:
    "Add the expiry date too — that's the part I use to remind you",
} as const;

export const COMPANION_LIMITS = { name: 80, relationship: 40 } as const;

const nameSchema = (required: string) =>
  z
    .string()
    .trim()
    .min(1, required)
    .max(COMPANION_LIMITS.name, COMPANION_MESSAGES.nameTooLong)
    .regex(/^[^\p{Cc}]*$/u, COMPANION_MESSAGES.invalidChars);

/** A date of birth: real and in the past. No minimum age — households include children. */
const birthDateSchema = z
  .string()
  .trim()
  .transform((value) => (value === "" ? null : value))
  .superRefine((value, ctx) => {
    if (value === null) return;
    if (!isRealDate(value) || value >= todayIso()) {
      ctx.addIssue({ code: "custom", message: COMPANION_MESSAGES.dobInvalid });
    }
  });

/** A passport expiry: real, and allowed to be in the past — an expired one still needs renewing. */
const expirySchema = z
  .string()
  .trim()
  .transform((value) => (value === "" ? null : value))
  .superRefine((value, ctx) => {
    if (value !== null && !isRealDate(value)) {
      ctx.addIssue({ code: "custom", message: COMPANION_MESSAGES.dateInvalid });
    }
  });

const countrySchema = z
  .string()
  .trim()
  .transform((value) => (value === "" ? null : value.toUpperCase()))
  .superRefine((value, ctx) => {
    if (value !== null && !isCountryCode(value)) {
      ctx.addIssue({
        code: "custom",
        message: COMPANION_MESSAGES.countryInvalid,
      });
    }
  });

/**
 * A country of issue with no expiry is a passport record with nothing to do.
 *
 * The same rule 2.1.10 applies to the traveler's own passport, and here it also keeps the
 * card honest: the meta line keys off the expiry, so a country-only row would render as
 * "No passport details yet" while quietly holding one.
 */
function checkPassportGroup(
  value: { passportExpiry: string | null; passportCountry: string | null },
  ctx: z.RefinementCtx,
): void {
  if (value.passportCountry !== null && value.passportExpiry === null) {
    ctx.addIssue({
      code: "custom",
      path: ["passportExpiry"],
      message: COMPANION_MESSAGES.passportNeedsExpiry,
    });
  }
}

export const companionSchema = z
  .object({
    firstName: nameSchema(COMPANION_MESSAGES.firstNameRequired),
    lastName: nameSchema(COMPANION_MESSAGES.lastNameRequired),
    relationship: optionalTextSchema(COMPANION_LIMITS.relationship, {
      tooLong: COMPANION_MESSAGES.relationshipTooLong,
      invalid: COMPANION_MESSAGES.invalidChars,
    }),
    dateOfBirth: birthDateSchema,
    passportExpiry: expirySchema,
    passportCountry: countrySchema,
  })
  .superRefine(checkPassportGroup);

export const COMPANION_FIELDS = [
  "firstName",
  "lastName",
  "relationship",
  "dateOfBirth",
  "passportExpiry",
  "passportCountry",
] as const;

/**
 * Whether a passport expires soon enough to be worth mentioning.
 *
 * Six months is the rule most countries apply on entry, so a passport valid for five is a
 * problem the traveler does not know they have yet. A warning, never a block.
 */
export function expiresWithinSixMonths(
  expiry: string,
  now: Date = new Date(),
): boolean {
  if (!isRealDate(expiry)) return false;
  const horizon = new Date(now);
  horizon.setUTCMonth(horizon.getUTCMonth() + 6);
  return expiry <= horizon.toISOString().slice(0, 10);
}
