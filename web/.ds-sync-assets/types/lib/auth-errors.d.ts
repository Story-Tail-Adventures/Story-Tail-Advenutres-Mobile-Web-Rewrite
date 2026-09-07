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
export type AuthErrorKind = "invalid_credentials" | "email_not_confirmed" | "email_taken" | "email_invalid" | "rate_limited" | "account_locked" | "network" | "not_configured" | "weak_password" | "session_expired" | "unknown";
export interface MappedAuthError {
    kind: AuthErrorKind;
    message: string;
    /** Where to send someone who is stuck, if there is somewhere useful. */
    action?: {
        label: string;
        href: string;
    };
}
export declare function mapAuthError(error: AuthError): MappedAuthError;
export declare const authErrorByKind: Record<AuthErrorKind, MappedAuthError>;
/**
 * Map an untrusted `?error=` value to a mapped error, or undefined.
 *
 * `startOAuthAction` redirects to `/login?error=<kind>` when the provider handshake never
 * starts, so this value reaches us through the address bar and is attacker-controlled. It
 * is used as a KEY into a closed table and never rendered: an unrecognised kind produces
 * undefined and no alert, so there is no way to put chosen text on the sign-in screen.
 */
export declare function authErrorFromParam(value: string | undefined): MappedAuthError | undefined;
