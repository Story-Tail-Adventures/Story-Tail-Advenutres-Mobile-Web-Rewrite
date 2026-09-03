import type { MappedAuthError } from "@/lib/auth-errors";

/**
 * Screen 2.1.4 Forgot Password — form state and copy.
 *
 * Separate from actions.ts because a `"use server"` module may only export async
 * functions; every other export is treated as a Server Action and rejected at runtime.
 */
export interface ForgotPasswordState {
  fieldErrors?: { email?: string[] };
  formError?: MappedAuthError;
  /** Swaps the form for the "check your inbox" panel. See actions.ts for why it is
   *  returned whether or not the address has an account. */
  outcome?: "sent";
  /** Echoed back so a failed submit does not clear the field. */
  email?: string;
}

export const initialForgotPasswordState: ForgotPasswordState = {};

export const FORGOT_TEXT = {
  metaTitle: "Reset your password",
  metaDescription: "We'll email you a link to set a new password.",
  overline: "PASSWORD HELP",
  title: "Forgot your password?",
  sub: "Tell us your email and we'll send a reset link.",
  email: "Email",
  submit: "Send reset link",
  pending: "Sending the link…",
  // The prototype says "Links expire after 30 minutes"; GoTrue's otp_expiry is an hour
  // (supabase/config.toml), so the number is corrected rather than the config — a
  // reassurance that is wrong is worse than one that is vague.
  help:
    "You'll receive an email within a minute. Check your spam folder if you don't see it. " +
    "Links expire after an hour.",
  sentTitle: "Check your inbox",
  sentBefore: "If ",
  sentAfter: " has an account, a reset link is on its way.",
  backToSignIn: "← Back to sign in",
} as const;
