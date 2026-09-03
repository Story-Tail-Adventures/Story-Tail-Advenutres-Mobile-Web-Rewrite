import type { MappedAuthError } from "@/lib/auth-errors";
import type { MfaField } from "@/lib/validation/mfa";

/** Screen 2.1.7 MFA Challenge — form state and copy. */
export interface MfaChallengeState {
  fieldErrors?: Partial<Record<MfaField, string[]>>;
  formError?: MappedAuthError;
}

export const initialMfaChallengeState: MfaChallengeState = {};

export const MFA_CHALLENGE_TEXT = {
  metaTitle: "Enter your code",
  metaDescription: "Finish signing in with your authenticator app.",
  overline: "TWO-FACTOR",
  title: "Enter your code",
  sub: "From your authenticator app. It changes every 30 seconds.",
  codeLabel: "6-digit code",
  verify: "Verify",
  pending: "Checking that code…",
  // The prototype offers "Use a backup code" and "Resend SMS". Neither exists: Supabase has
  // no backup-code factor, and SMS MFA is off in supabase/config.toml. Rather than link to
  // nothing, the screen says what actually works — see actions.ts.
  stuckTitle: "Lost your authenticator?",
  stuckBody:
    "Message Gyasi and he'll send you a fresh sign-in link. He can't see your password " +
    "or your codes, so this is the way back in.",
  stuckCta: "Message Gyasi",
  signOut: "Sign in as someone else",
} as const;
