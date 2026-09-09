import type { MappedAuthError } from "@/lib/auth-errors";

/**
 * Screen 2.1.3 Email Verification — form state and copy.
 *
 * Separate from actions.ts because a `"use server"` module may only export async
 * functions; every other export is treated as a Server Action and rejected at runtime.
 */

export interface ResendState {
  fieldErrors?: { email?: string[] };
  formError?: MappedAuthError;
  outcome?: "sent";
  email?: string;
}

export const initialResendState: ResendState = {};

export interface ChangeEmailState {
  fieldErrors?: { email?: string[] };
  formError?: MappedAuthError;
  outcome?: "sent";
  email?: string;
}

export const initialChangeEmailState: ChangeEmailState = {};

export const VERIFY_TEXT = {
  metaTitle: "Check your email",
  metaDescription: "Confirm your email address to finish setting up your account.",
  overline: "ONE MORE STEP",
  title: "Check your email",
  subKnown: "We sent a verification link to ",
  subUnknown: "Tell us the address you signed up with and we'll send the link again.",
  whyTitle: "Why verify?",
  whyBody:
    "It links any trips Gyasi has already started planning for you, so you'll see them " +
    "as soon as you sign in.",
  resend: "Resend verification email",
  resendPending: "Sending it again…",
  resendSent: "Sent — it should land within a minute. Check your spam folder too.",
  email: "Email",
  signOut: "Sign out",
  changeEmailToggle: "Need to update your email?",
  changeEmailLabel: "New email",
  changeEmailSubmit: "Send the link there instead",
  changeEmailPending: "Updating your email…",
  changeEmailSent:
    "Check both inboxes — we sent a confirmation to the old address as well as the new " +
    "one, so nobody can move your account without you.",
  useDifferent: "Use a different address",
} as const;
