import type { AuthError } from "@supabase/supabase-js";

/**
 * Supabase auth failures, in Story-Tail's voice.
 *
 * Two rules this file exists to hold:
 *
 *  1. Never distinguish "no such account" from "wrong password". Supabase already
 *     collapses both into `invalid_credentials`; re-expanding that would hand an
 *     unauthenticated caller an account-enumeration oracle.
 *  2. Copy follows docs/Design-System.md §2.6 — warm, not accusatory, and it always
 *     offers the next move. A failed sign-in is a small moment of friction for someone
 *     who just wants to see their trip; it should not read like a security warning.
 *
 * The Kotlin twin is com.storytail.adventures.api.AuthError — keep the strings in sync.
 * `email_taken` and `email_invalid` are sign-up kinds (Screen 2.0.6, web-only until
 * mobile builds 2.1.2 Registration) and `session_expired` is a reset/MFA kind (2.1.5,
 * 2.1.7); .github/scripts/check_copy_parity.py compares only the kinds both platforms
 * share, so add them there when the Kotlin twins land.
 *
 * On sign-up, rule 1 has a twin: the caller must never show `email_taken` differently
 * from a successful sign-up that is waiting on email confirmation. The gate action
 * (web/app/(public)/(plain)/join/actions.ts) returns the same state for both.
 */

export type AuthErrorKind =
  | "invalid_credentials"
  | "email_not_confirmed"
  | "email_taken"
  | "email_invalid"
  | "rate_limited"
  | "account_locked"
  | "network"
  | "not_configured"
  | "weak_password"
  | "session_expired"
  | "unknown";

export interface MappedAuthError {
  kind: AuthErrorKind;
  message: string;
  /** Where to send someone who is stuck, if there is somewhere useful. */
  action?: { label: string; href: string };
}

const BY_KIND: Record<AuthErrorKind, MappedAuthError> = {
  invalid_credentials: {
    kind: "invalid_credentials",
    message: "That email and password don't match.",
    action: { label: "Reset your password", href: "/forgot-password" },
  },
  email_not_confirmed: {
    kind: "email_not_confirmed",
    message: "Almost there — check your email for the verification link.",
    action: { label: "Resend it", href: "/verify-email" },
  },
  rate_limited: {
    kind: "rate_limited",
    message: "That's a few too many tries. Give it a minute, then try again.",
  },
  account_locked: {
    kind: "account_locked",
    message: "This account is on hold.",
    action: { label: "Message Gyasi", href: "/support" },
  },
  network: {
    kind: "network",
    message: "We couldn't reach Story-Tail. Check your connection and try again.",
  },
  weak_password: {
    kind: "weak_password",
    message: "That password is a little too easy to guess.",
    action: { label: "See what's needed", href: "/register" },
  },
  email_taken: {
    kind: "email_taken",
    // Deliberately reads like the success path. If a caller ever surfaces this message
    // instead of the shared "check your inbox" state, it still must not confirm that an
    // account exists.
    message: "Check your inbox for a link to finish up.",
    action: { label: "Sign in", href: "/login" },
  },
  session_expired: {
    kind: "session_expired",
    // Never produced by mapAuthError — this one is ours, raised when a screen that needs a
    // live session (2.1.5's recovery session, 2.1.7's MFA challenge) finds none. It reads
    // as an expiry rather than a failure because that is nearly always what it is: a link
    // opened tomorrow, or opened in a different browser than the one that requested it.
    message: "That link has expired — reset links are only good for an hour.",
    action: { label: "Send a new one", href: "/forgot-password" },
  },
  email_invalid: {
    kind: "email_invalid",
    message: "We can't send email to that address — try a different one.",
  },
  not_configured: {
    kind: "not_configured",
    // Client-facing wording only. The actionable detail (copy web/.env.example to
    // web/.env.local, values from `supabase status`) is logged server-side in the
    // sign-in action — an env-var path in front of a traveler is jargon, not help.
    message: "We're not quite ready to sign you in yet — check back shortly.",
  },
  unknown: {
    kind: "unknown",
    message: "Something went sideways on our end. Try again in a moment.",
  },
};

export function mapAuthError(error: AuthError): MappedAuthError {
  switch (error.code) {
    case "invalid_credentials":
    case "invalid_grant":
      return BY_KIND.invalid_credentials;
    case "email_not_confirmed":
      return BY_KIND.email_not_confirmed;
    case "over_request_rate_limit":
    case "over_email_send_rate_limit":
      return BY_KIND.rate_limited;
    case "user_banned":
      return BY_KIND.account_locked;
    case "weak_password":
      return BY_KIND.weak_password;
    // Sign-up (GoTrue /signup). `user_already_exists` is what the server says with
    // email confirmations OFF; with them ON it returns an obfuscated user and no error.
    // `email_exists` is the admin-API spelling of the same condition.
    case "user_already_exists":
    case "email_exists":
      return BY_KIND.email_taken;
    case "email_address_invalid":
      return BY_KIND.email_invalid;
    // Sign-ups switched off in supabase/config.toml — same traveler-facing meaning as an
    // auth server that is not set up yet.
    case "signup_disabled":
      return BY_KIND.not_configured;
    default:
      break;
  }

  if (error.status === 429) return BY_KIND.rate_limited;
  // AuthRetryableFetchError — the request never reached the auth server.
  if (error.status === 0 || error.name === "AuthRetryableFetchError") {
    return BY_KIND.network;
  }
  if (error.status === 400 || error.status === 401) {
    return BY_KIND.invalid_credentials;
  }
  return BY_KIND.unknown;
}

export const authErrorByKind = BY_KIND;

/**
 * Map an untrusted `?error=` value to a mapped error, or undefined.
 *
 * `startOAuthAction` redirects to `/login?error=<kind>` when the provider handshake never
 * starts, so this value reaches us through the address bar and is attacker-controlled. It
 * is used as a KEY into a closed table and never rendered: an unrecognised kind produces
 * undefined and no alert, so there is no way to put chosen text on the sign-in screen.
 */
export function authErrorFromParam(
  value: string | undefined,
): MappedAuthError | undefined {
  if (!value) return undefined;
  return Object.hasOwn(BY_KIND, value)
    ? BY_KIND[value as AuthErrorKind]
    : undefined;
}
