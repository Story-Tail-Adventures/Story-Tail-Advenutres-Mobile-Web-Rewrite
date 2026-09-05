package com.storytail.adventures.api

/**
 * Supabase auth failures, in Story-Tail's voice.
 *
 * Two rules this type exists to hold:
 *
 *  1. Never distinguish "no such account" from "wrong password". Supabase already
 *     collapses both into invalid_credentials; re-expanding that would hand an
 *     unauthenticated caller an account-enumeration oracle.
 *  2. Copy follows docs/Design-System.md §2.6 — warm, not accusatory, and it always
 *     offers a next move. A failed sign-in is a small moment of friction for someone
 *     who just wants to see their trip, not a security event to scold them about.
 *
 * The web twin is web/lib/auth-errors.ts. Keep the strings identical.
 */
sealed interface AuthError {
    val message: String

    /** Where to send someone who is stuck, if there is somewhere useful. */
    val action: Action?
        get() = null

    data class Action(val label: String, val route: String)

    data object InvalidCredentials : AuthError {
        override val message = "That email and password don't match."
        override val action = Action("Reset your password", "/forgot-password")
    }

    data object EmailNotConfirmed : AuthError {
        override val message = "Almost there — check your email for the verification link."
        override val action = Action("Resend it", "/verify-email")
    }

    data object RateLimited : AuthError {
        override val message = "That's a few too many tries. Give it a minute, then try again."
    }

    data object AccountLocked : AuthError {
        override val message = "This account is on hold."
        override val action = Action("Message Gyasi", "/support")
    }

    /**
     * A rejected authenticator code — Screens 2.1.6 and 2.1.7.
     *
     * The ordinary case, not an error condition: codes expire every thirty seconds and
     * people type the one that just rolled over. It reads as a nudge.
     */
    data object MfaCodeRejected : AuthError {
        override val message =
            "That code didn't match. Codes roll over every 30 seconds — try the current one."
    }

    /** Screen 2.1.2 — see SignUpOutcome for why this must never be shown differently. */
    data object EmailTaken : AuthError {
        override val message = "Check your inbox for a link to finish up."
        override val action = Action("Sign in", "/login")
    }

    data object WeakPassword : AuthError {
        override val message = "That password is a little too easy to guess."
        override val action = Action("See what's needed", "/register")
    }

    data object Network : AuthError {
        override val message = "We couldn't reach Story-Tail. Check your connection and try again."
    }

    /**
     * Raised by us, never mapped from a GoTrue code — when a screen that needs a live
     * session finds none. A password-reset link opened tomorrow, or opened in a different
     * browser than the one that asked for it, which is nearly always what this is.
     */
    data object SessionExpired : AuthError {
        override val message = "That link has expired — reset links are only good for an hour."
        override val action = Action("Send a new one", "/forgot-password")
    }

    data object Unknown : AuthError {
        override val message = "Something went sideways on our end. Try again in a moment."
    }

    /**
     * Client-facing wording only.
     *
     * The actionable detail — add `supabase.url` and `supabase.anonKey` to
     * mobile/local.properties — is printed by UnconfiguredAuthRepository rather than
     * shown: this renders in the same card as a real auth failure, and a Gradle file
     * path in front of a traveler is jargon, not help.
     */
    data object NotConfigured : AuthError {
        override val message = "We're not quite ready to sign you in yet — check back shortly."
    }
}
