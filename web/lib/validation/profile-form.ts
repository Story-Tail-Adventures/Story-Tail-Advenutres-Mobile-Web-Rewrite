import type { ProfileFormValues } from "@/app/(onboarding)/onboarding/profile/state";

/**
 * Reads Screen 2.1.10 / 2.5.2's form post.
 *
 * EXTRACTED so the wizard and the account screen share one reader — it was private to the
 * wizard's actions module, and a `"use server"` file can export only async functions. The
 * comment below is the original and is the reason this must not be reimplemented: the
 * values are RAW on purpose, and normalising them here would silently desync the eleven
 * uncontrolled inputs after a failed submit.
 */
/**
 * Every input as a trimmed-of-nothing string; the schema does the trimming.
 *
 * RAW, and the form depends on that. Eleven of its thirteen inputs are uncontrolled, and
 * React does not re-apply `defaultValue` to a DOM node that is already mounted — so after a
 * failed submit those inputs show whatever the browser kept, not what this echoes back.
 * That is only invisible because the two agree. Normalise anything here — trim it,
 * uppercase it, turn `(305) 555-0184` into `+13055550184` — and the uncontrolled fields
 * will quietly keep showing the old text while the controlled ones update.
 */
export function readProfileForm(formData: FormData): ProfileFormValues {
  return {
    phone: text(formData.get("phone")),
    dateOfBirth: text(formData.get("dateOfBirth")),
    addressLine1: text(formData.get("addressLine1")),
    addressLine2: text(formData.get("addressLine2")),
    addressCity: text(formData.get("addressCity")),
    addressRegion: text(formData.get("addressRegion")),
    addressPostalCode: text(formData.get("addressPostalCode")),
    addressCountry: text(formData.get("addressCountry")),
    emergencyName: text(formData.get("emergencyName")),
    emergencyPhone: text(formData.get("emergencyPhone")),
    emergencyRelationship: text(formData.get("emergencyRelationship")),
    passportExpiry: text(formData.get("passportExpiry")),
    passportCountry: text(formData.get("passportCountry")),
  };
}

/** A File — from a multipart post that has no business here — is not a value. */
export function text(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value : "";
}
