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
 */

export type AuthErrorKind =
  | "invalid_credentials"
  | "email_not_confirmed"
  | "rate_limited"
  | "account_locked"
  | "network"
  | "not_configured"
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
