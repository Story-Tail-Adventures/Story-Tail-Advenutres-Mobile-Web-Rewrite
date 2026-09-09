package com.storytail.adventures.ui.screens.auth

import com.storytail.adventures.api.AuthError

/**
 * Screen 2.1m.3 Email Verification.
 *
 * [email] can be null. Straight after registering it is passed along the route, because
 * GoTrue withholds a session until the address is confirmed and there is nothing to read it
 * from. Arriving here any other way — a cold start on an unconfirmed account — leaves the
 * screen without one, and it says so rather than guessing.
 */
data class VerifyEmailUiState(
    val email: String? = null,
    val isResending: Boolean = false,
    /** Set after a successful resend. Cleared the moment anything else happens. */
    val resent: Boolean = false,
    val formError: AuthError? = null,
)

sealed interface VerifyEmailEvent {
    /** "Change email" goes back to the form that set it, not to a new screen. */
    data object NavigateToRegister : VerifyEmailEvent
    data object NavigateToSignIn : VerifyEmailEvent
}
