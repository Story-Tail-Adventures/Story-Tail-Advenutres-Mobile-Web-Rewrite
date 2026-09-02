import { z } from "zod";

/**
 * Auth field validation for the web app.
 *
 * PARALLEL IMPLEMENTATION — this deliberately duplicates
 * mobile/shared/src/commonMain/kotlin/com/storytail/adventures/util/AuthValidation.kt
 * rather than importing it. CLAUDE.md makes the stack directories a hard boundary and
 * the KMP shared module does not run on web.
 *
 * The two are kept honest by a shared table of test vectors asserted on both sides:
 *   web/lib/validation/auth.test.ts
 *   mobile/shared/src/commonTest/kotlin/com/storytail/adventures/util/AuthValidationTest.kt
 * If you change a rule or a message here, change it there and update both tests.
 */

/** Messages are user-facing copy. Keep them byte-identical across platforms. */
export const AUTH_MESSAGES = {
  emailRequired: "Don't forget your email",
  emailInvalid: "That doesn't look like an email address",
  passwordRequired: "Don't forget your password",
  passwordTooShort: "Use at least 12 characters",
  passwordNeedsDigit: "Add at least one number",
  passwordNeedsUppercase: "Add at least one capital letter",
} as const;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const emailSchema = z
  .string()
  .trim()
  .min(1, AUTH_MESSAGES.emailRequired)
  .regex(EMAIL_RE, AUTH_MESSAGES.emailInvalid);

/**
 * SIGN-IN password rule: presence only.
 *
 * Deliberately NOT the 12-character policy. That rule governs registration and reset
 * (Screen Inventory 2.1.2 / 2.1.5). Enforcing it at the sign-in boundary would lock
 * out anyone whose password predates the policy, and it leaks the policy to an
 * unauthenticated caller. Let the auth server decide whether the password is right.
 */
export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, AUTH_MESSAGES.passwordRequired),
});

/** REGISTRATION / RESET password rule — 2.1.2 and 2.1.5. */
export const newPasswordSchema = z
  .string()
  .min(12, AUTH_MESSAGES.passwordTooShort)
  .regex(/\d/, AUTH_MESSAGES.passwordNeedsDigit)
  .regex(/[A-Z]/, AUTH_MESSAGES.passwordNeedsUppercase);

export type LoginInput = z.infer<typeof loginSchema>;
