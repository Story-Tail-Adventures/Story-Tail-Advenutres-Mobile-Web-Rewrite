import type { MappedAuthError } from "@/lib/auth-errors";
import type { PasswordPairField } from "@/lib/validation/registration";

/** Screen 2.1.5 Reset Password — form state and copy. */
export interface ResetPasswordState {
  fieldErrors?: Partial<Record<PasswordPairField, string[]>>;
  formError?: MappedAuthError;
}

export const initialResetPasswordState: ResetPasswordState = {};

export const RESET_TEXT = {
  metaTitle: "Set a new password",
  metaDescription: "Choose a new password for your Story-Tail account.",
  overline: "RESET PASSWORD",
  title: "Set a new password",
  sub: "Use at least 12 characters with a number.",
  password: "New password",
  passwordHint: "12+ characters with a number, a capital and a lowercase letter",
  confirm: "Confirm new password",
  submit: "Update password",
  pending: "Updating your password…",
  // Shown when the page is opened without a recovery session — an expired link, a link
  // opened in a different browser, or someone who navigated here directly.
  expiredTitle: "That link has expired",
  expiredBody:
    "Reset links are good for an hour, and only in the browser you opened them in. " +
    "Ask for a fresh one and you'll be set.",
  expiredCta: "Send a new one",
} as const;
