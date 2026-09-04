import { z } from "zod";
import { emailSchema, newPasswordSchema } from "./auth";
import { NO_CONTROL_CHARS } from "./text";

/**
 * The rules shared by every screen that creates an account.
 *
 * Two of them exist: Screen 2.1.2 Registration (`/register`) and Screen 2.0.6 Sign-up Gate
 * (`/join`), which carries the same fields inside a intent-aware card so a visitor can
 * sign up without losing the trip they were looking at. They differ only in that 2.1.2
 * asks for password confirmation. Everything else lives here so the two cannot drift —
 * the gate shipped first and had already grown its own copy of the name rules.
 *
 * Email and password rules come from ./auth.ts, whose messages have Kotlin twins checked
 * by .github/scripts/check_copy_parity.py. The name, terms and confirmation messages below
 * are web-only until mobile builds 2.1.2; when it does, they need Kotlin twins and entries
 * in that script's key map — it only compares the keys it is told about, so a missing entry
 * is a silent gap rather than a failure.
 */

export const REGISTRATION_MESSAGES = {
  nameRequired: "Tell us your name",
  nameTooLong: "Keep it to 80 characters or fewer",
  nameInvalid: "Some of those characters won't work here",
  termsRequired: "Check the box to agree to our terms",
  confirmRequired: "Type your password once more",
  confirmMismatch: "Those two don't match yet",
} as const;

export const NAME_MAX = 80;

export const nameSchema = z
  .string()
  .trim()
  .min(1, REGISTRATION_MESSAGES.nameRequired)
  .max(NAME_MAX, REGISTRATION_MESSAGES.nameTooLong)
  .regex(NO_CONTROL_CHARS, REGISTRATION_MESSAGES.nameInvalid);

/**
 * A checked `<input type="checkbox" name="terms">` posts the literal "on"; an unchecked one
 * posts nothing at all. Screen Inventory 2.1.2 makes acceptance a required checkbox, and
 * both actions are reachable without their form, so the rule lives here and not only in
 * the markup.
 */
export const termsSchema = z.literal("on", { error: REGISTRATION_MESSAGES.termsRequired });

/** Everything both screens ask for. */
export const registrationSchema = z.object({
  firstName: nameSchema,
  lastName: nameSchema,
  email: emailSchema,
  password: newPasswordSchema,
  terms: termsSchema,
});

/**
 * The "type it twice" rule, shared by 2.1.2 Registration and 2.1.5 Reset Password.
 *
 * The mismatch is reported on `confirmPassword`, never on `password`: the field a person is
 * looking at is the one they just typed, and marking the first field red suggests the first
 * field is the wrong one.
 *
 * `.superRefine` rather than `.refine` so the check still runs when `password` itself failed
 * the policy. Otherwise someone whose password is both too short AND mistyped is told about
 * one problem, fixes it, and is then told about the second.
 */
export const confirmPasswordSchema = z
  .string()
  .min(1, REGISTRATION_MESSAGES.confirmRequired);

function checkConfirmMatches(
  value: { password: string; confirmPassword: string },
  ctx: z.RefinementCtx,
): void {
  if (value.confirmPassword && value.confirmPassword !== value.password) {
    ctx.addIssue({
      code: "custom",
      path: ["confirmPassword"],
      message: REGISTRATION_MESSAGES.confirmMismatch,
    });
  }
}

/** Screen 2.1.5 Reset Password — the two fields, and nothing else. */
export const passwordPairSchema = z
  .object({ password: newPasswordSchema, confirmPassword: confirmPasswordSchema })
  .superRefine(checkConfirmMatches);

/** Screen 2.1.2 Registration — the gate's fields plus the confirmation it has no room for. */
export const registrationWithConfirmSchema = registrationSchema
  .extend({ confirmPassword: confirmPasswordSchema })
  .superRefine(checkConfirmMatches);

export const PASSWORD_PAIR_FIELDS = ["password", "confirmPassword"] as const;
export type PasswordPairField = (typeof PASSWORD_PAIR_FIELDS)[number];

export type RegistrationInput = z.infer<typeof registrationSchema>;
export type RegistrationWithConfirmInput = z.infer<typeof registrationWithConfirmSchema>;

export const REGISTRATION_FIELDS = [
  "firstName",
  "lastName",
  "email",
  "password",
  "terms",
] as const satisfies readonly (keyof RegistrationInput)[];

export const REGISTRATION_WITH_CONFIRM_FIELDS = [
  ...REGISTRATION_FIELDS,
  "confirmPassword",
] as const;

export type RegistrationField = (typeof REGISTRATION_FIELDS)[number];
export type RegistrationWithConfirmField = (typeof REGISTRATION_WITH_CONFIRM_FIELDS)[number];
