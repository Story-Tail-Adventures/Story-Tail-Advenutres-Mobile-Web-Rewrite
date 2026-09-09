package com.storytail.adventures.ui.screens.auth

import com.storytail.adventures.api.AuthError

/**
 * Screen 2.1m.7 MFA Challenge.
 *
 * [factorId] is resolved when the screen opens, from the account's verified factors. Null
 * means there is nothing to challenge — a state that should be impossible to reach, since
 * the router only sends somebody here when their assurance is REQUIRED, and which is
 * reported rather than left as a dead form.
 */
data class MfaChallengeUiState(
    val factorId: String? = null,
    val code: String = "",
    val codeError: String? = null,
    val formError: AuthError? = null,
    val isResolving: Boolean = true,
    val isVerifying: Boolean = false,
)

sealed interface MfaChallengeEvent {
    /** Answered. The session is now at aal2 and the router takes it from here. */
    data object Verified : MfaChallengeEvent
    data object SignedOut : MfaChallengeEvent
}
