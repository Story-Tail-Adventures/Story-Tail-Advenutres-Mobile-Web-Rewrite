import { z } from "zod";

/**
 * The six-digit code from an authenticator app (Screens 2.1.6 and 2.1.7).
 *
 * Normalised before it is checked, because of how people actually copy these: authenticator
 * apps display "483 921" with a space in the middle, and that space comes along on paste.
 * Rejecting it would be rejecting the app's own formatting.
 *
 * Web-only copy until mobile builds 2.1.6/2.1.7 — when it does, these need Kotlin twins and
 * entries in .github/scripts/check_copy_parity.py's key map.
 */

export const MFA_MESSAGES = {
  codeRequired: "Enter the code from your authenticator app",
  codeShape: "That code is six digits",
} as const;

export const MFA_CODE_LENGTH = 6;

/** Strips everything that is not a digit — spaces, dashes, non-breaking spaces. */
export function normalizeMfaCode(raw: string): string {
  return raw.replace(/\D/g, "");
}

export const mfaCodeSchema = z
  .string()
  .transform(normalizeMfaCode)
  .pipe(
    z
      .string()
      .min(1, MFA_MESSAGES.codeRequired)
      .length(MFA_CODE_LENGTH, MFA_MESSAGES.codeShape),
  );

export const mfaFormSchema = z.object({ code: mfaCodeSchema });

export const MFA_FIELDS = ["code"] as const;
export type MfaField = (typeof MFA_FIELDS)[number];
