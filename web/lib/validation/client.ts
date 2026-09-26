import { z } from "zod";

import { isCountryCode } from "@/lib/countries";
import { isRealDate, normalizePhone, todayIso } from "@/lib/validation/profile";

/**
 * Screens 3.3.9 and 3.3.10 — the client form, both halves.
 *
 * ONE SCHEMA FOR CREATE AND EDIT. They are the same record with the same rules; §3.3.10's
 * own Screen Inventory entry says "Same as Create Client". What differs is the copy and
 * where the buttons sit, which is the form component's business, not the schema's.
 *
 * VALIDATION IS DUPLICATED HERE AND IN THE EDGE FUNCTION, deliberately. The browser copy
 * exists so a mistake is caught before a round trip; the server copy exists because the
 * browser's can be skipped entirely. `check_copy_parity.py`'s header makes the same argument
 * about web/mobile: the duplication is right, and nothing but discipline keeps the two
 * honest — so the MESSAGES live here and the server's are deliberately terser, since the
 * only way to see them is to have bypassed this.
 */

export const CLIENT_LIMITS = {
  name: 120,
  email: 200,
  phone: 40,
  notes: 4000,
  tag: 40,
  tags: 20,
  dates: 12,
  dateLabel: 60,
  addressLine: 200,
  city: 120,
  region: 120,
  postalCode: 20,
} as const;

export const CLIENT_MESSAGES = {
  firstNameRequired: "A first name, so the roster has something to sort by.",
  lastNameRequired: "A last name, for the same reason.",
  nameTooLong: "That name is longer than the field allows.",
  emailRequired: "An email — it's how the portal invitation and every update reaches them.",
  emailShape: "That doesn't look like an email address.",
  emailTooLong: "That email is longer than the field allows.",
  phoneShape: "That phone number isn't one I can dial. US numbers unless you add a country code.",
  dobShape: "That isn't a date.",
  dobFuture: "That date of birth is in the future.",
  notesTooLong: "That's longer than the notes field holds.",
  tagTooLong: "That tag is too long.",
  tooManyTags: "That's more tags than one client can carry.",
  dateLabelRequired: "Give the date a name — Anniversary, Passport renewal, whatever it is.",
  dateRequired: "That entry needs a date.",
  dateShape: "That isn't a date.",
  tooManyDates: "That's more dates than the record holds.",
  countryShape: "Pick a country from the list.",
  addressTooLong: "That's longer than the field allows.",
} as const;

const optionalText = (max: number, message: string) =>
  z.string().trim().max(max, message).optional().default("");

export const importantDateSchema = z.object({
  label: z.string().trim().min(1, CLIENT_MESSAGES.dateLabelRequired)
    .max(CLIENT_LIMITS.dateLabel, CLIENT_MESSAGES.dateLabelRequired),
  date: z.string().trim().min(1, CLIENT_MESSAGES.dateRequired)
    .refine(isRealDate, CLIENT_MESSAGES.dateShape),
  recurring: z.boolean().default(false),
});

export const clientSchema = z.object({
  firstName: z.string().trim().min(1, CLIENT_MESSAGES.firstNameRequired)
    .max(CLIENT_LIMITS.name, CLIENT_MESSAGES.nameTooLong),
  lastName: z.string().trim().min(1, CLIENT_MESSAGES.lastNameRequired)
    .max(CLIENT_LIMITS.name, CLIENT_MESSAGES.nameTooLong),
  preferredName: optionalText(CLIENT_LIMITS.name, CLIENT_MESSAGES.nameTooLong),

  // NOT `z.string().email()`. The authoritative test is whether mail reaches them, a
  // stricter pattern rejects addresses that are legal and real (new TLDs, plus-addressing
  // in unusual places), and this field is typed by the advisor about someone they have
  // already spoken to. The Edge Function applies the same loose rule.
  email: z.string().trim().min(1, CLIENT_MESSAGES.emailRequired)
    .max(CLIENT_LIMITS.email, CLIENT_MESSAGES.emailTooLong)
    .refine(
      (v) => v.includes("@") && !v.startsWith("@") && !v.endsWith("@") && !/\s/.test(v),
      CLIENT_MESSAGES.emailShape,
    ),

  phone: optionalText(CLIENT_LIMITS.phone, CLIENT_MESSAGES.phoneShape)
    .refine((v) => v === "" || normalizePhone(v).ok, CLIENT_MESSAGES.phoneShape),

  dateOfBirth: optionalText(10, CLIENT_MESSAGES.dobShape)
    .refine((v) => v === "" || isRealDate(v), CLIENT_MESSAGES.dobShape)
    // A birth date in the future is a typo every time, and it would drive a birthday
    // reminder that never fires.
    .refine((v) => v === "" || v <= todayIso(), CLIENT_MESSAGES.dobFuture),

  tags: z.array(z.string().trim().max(CLIENT_LIMITS.tag, CLIENT_MESSAGES.tagTooLong))
    .max(CLIENT_LIMITS.tags, CLIENT_MESSAGES.tooManyTags)
    .default([]),

  importantDates: z.array(importantDateSchema)
    .max(CLIENT_LIMITS.dates, CLIENT_MESSAGES.tooManyDates)
    .default([]),

  notes: optionalText(CLIENT_LIMITS.notes, CLIENT_MESSAGES.notesTooLong),

  addressLine1: optionalText(CLIENT_LIMITS.addressLine, CLIENT_MESSAGES.addressTooLong),
  addressLine2: optionalText(CLIENT_LIMITS.addressLine, CLIENT_MESSAGES.addressTooLong),
  addressCity: optionalText(CLIENT_LIMITS.city, CLIENT_MESSAGES.addressTooLong),
  addressRegion: optionalText(CLIENT_LIMITS.region, CLIENT_MESSAGES.addressTooLong),
  addressPostalCode: optionalText(CLIENT_LIMITS.postalCode, CLIENT_MESSAGES.addressTooLong),
  addressCountry: optionalText(2, CLIENT_MESSAGES.countryShape)
    .refine((v) => v === "" || isCountryCode(v), CLIENT_MESSAGES.countryShape),
});

export type ClientValues = z.output<typeof clientSchema>;

/** Every field a form error can be keyed to. `flattenIssues` needs the list. */
export const CLIENT_FIELDS = [
  "firstName", "lastName", "preferredName", "email", "phone", "dateOfBirth",
  "tags", "importantDates", "notes",
  "addressLine1", "addressLine2", "addressCity", "addressRegion",
  "addressPostalCode", "addressCountry",
] as const;

export type ClientField = (typeof CLIENT_FIELDS)[number];

/**
 * The Edge Function's payload shape.
 *
 * The phone is NORMALISED to E.164 here rather than stored as typed, matching what
 * `onboarding-profile` does with the traveler's own number — two records for one person
 * should not differ by whether somebody typed the dashes.
 */
export function toClientPayload(v: ClientValues): Record<string, unknown> {
  const phone = v.phone === "" ? null : normalizePhone(v.phone);
  return {
    firstName: v.firstName,
    lastName: v.lastName,
    preferredName: v.preferredName || null,
    email: v.email,
    phone: phone && phone.ok ? phone.value : null,
    dateOfBirth: v.dateOfBirth || null,
    tags: v.tags.filter((t) => t.trim() !== ""),
    importantDates: v.importantDates,
    notes: v.notes || null,
    address: {
      line1: v.addressLine1 || null,
      line2: v.addressLine2 || null,
      city: v.addressCity || null,
      region: v.addressRegion || null,
      postalCode: v.addressPostalCode || null,
      country: v.addressCountry || null,
    },
  };
}
