import type { MappedAuthError } from "@/lib/auth-errors";
import type { MfaField } from "@/lib/validation/mfa";

/**
 * Screen 2.1.6 MFA Setup — form state and copy.
 *
 * Separate from actions.ts because a `"use server"` module may only export async
 * functions; every other export is treated as a Server Action and rejected at runtime.
 */

/** What `enroll` hands back for the person to scan or type into their app. */
export interface Enrollment {
  factorId: string;
  /** An SVG data URI Supabase renders for us. */
  qrCode: string;
  /** The same secret in text, for anyone who cannot scan. */
  secret: string;
}

/**
 * Two states, because there are two actions — see actions.ts for why the QR code must not
 * ride along in the state that gets submitted again.
 */
export interface MfaEnrollState {
  enrollment?: Enrollment;
  formError?: MappedAuthError;
}

export const initialMfaEnrollState: MfaEnrollState = {};

export interface MfaVerifyState {
  fieldErrors?: Partial<Record<MfaField, string[]>>;
  formError?: MappedAuthError;
}

export const initialMfaVerifyState: MfaVerifyState = {};

export const MFA_SETUP_TEXT = {
  metaTitle: "Set up two-factor",
  metaDescription: "Add a second step to signing in.",
  overline: "EXTRA SECURITY",
  title: "Set up two-factor auth",
  sub: "Recommended if you'll be storing payment cards.",
  methodAppTitle: "Authenticator app",
  methodAppSub: "Recommended",
  methodSmsTitle: "SMS code",
  // The prototype offers this as a backup method. It is switched off in
  // supabase/config.toml ([auth.mfa.phone]), so it says so rather than pretending.
  methodSmsSub: "Not available yet",
  begin: "Show my setup code",
  beginPending: "Getting your code…",
  scanTitle: "Scan this with your authenticator app",
  scanBody:
    "Authy, 1Password and Google Authenticator all work. Can't scan? Type the key below " +
    "into your app instead.",
  secretLabel: "Setup key",
  codeLabel: "Enter the 6-digit code",
  codeHint: "It changes every 30 seconds — if it expires, just use the next one.",
  verify: "Verify & turn on two-factor",
  verifyPending: "Checking that code…",
  skip: "Not right now",
  // Deliberately not in the flow: backup codes. See actions.ts.
  recoveryTitle: "If you lose your phone",
  recoveryBody:
    "Message Gyasi and he'll get you back in. Keep your authenticator app backed up if " +
    "you can — most of them offer that.",
} as const;
