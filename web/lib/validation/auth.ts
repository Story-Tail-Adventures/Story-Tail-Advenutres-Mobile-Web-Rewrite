import { z } from "zod";

/**
 * Auth field validation for the web app.
 *
 * PARALLEL IMPLEMENTATION — this deliberately duplicates
 * mobile/shared/src/commonMain/kotlin/com/storytail/adventures/domain/validation/AuthValidation.kt
 * rather than importing it. CLAUDE.md makes the stack directories a hard boundary and
 * the KMP shared module does not run on web.
 *
 * The two are kept honest by a shared table of test vectors asserted on both sides:
 *   web/lib/validation/auth.test.ts
 *   mobile/shared/src/commonTest/kotlin/com/storytail/adventures/domain/validation/AuthValidationTest.kt
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
  passwordNeedsLowercase: "Add at least one lowercase letter",
} as const;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const emailSchema = z
  .string()
  .trim()
  .min(1, AUTH_MESSAGES.emailRequired)
  .regex(EMAIL_RE, AUTH_MESSAGES.emailInvalid);

/**
 * The one-field email form: Screen 2.1.4 Forgot Password, and 2.1.3's resend and
 * change-email forms.
 *
 * An object schema rather than bare `emailSchema`, and that is not cosmetic. A string
 * schema's issues carry an EMPTY path, so `flattenIssues` — which keys errors by their
 * first path segment — drops every one of them and the form renders no error at all while
 * still refusing to submit. Parsing an object gives the issue a `["email"]` path and the
 * message reaches the field.
 */
export const emailFormSchema = z.object({ email: emailSchema });

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
/**
 * REGISTRATION / RESET password rule — 2.1.2 and 2.1.5.
 *
 * These checks must stay in step with `password_requirements` in supabase/config.toml
 * ("lower_upper_letters_digits") and with AuthValidation.validateNewPassword on mobile.
 * A client-side rule looser than the server's means the user is told their password is
 * fine and then GoTrue rejects it as weak_password — which is why the lowercase check
 * is here even though it is the one people forget.
 */
export const newPasswordSchema = z
  .string()
  .min(12, AUTH_MESSAGES.passwordTooShort)
  .regex(/\d/, AUTH_MESSAGES.passwordNeedsDigit)
  .regex(/[A-Z]/, AUTH_MESSAGES.passwordNeedsUppercase)
  .regex(/[a-z]/, AUTH_MESSAGES.passwordNeedsLowercase);

export type LoginInput = z.infer<typeof loginSchema>;
