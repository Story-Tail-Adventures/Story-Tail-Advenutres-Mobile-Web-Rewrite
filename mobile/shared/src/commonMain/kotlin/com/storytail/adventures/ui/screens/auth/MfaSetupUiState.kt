package com.storytail.adventures.ui.screens.auth

import com.storytail.adventures.api.AuthError
import com.storytail.adventures.api.TotpEnrollment

/**
 * Screen 2.1m.6 MFA Setup.
 *
 * Two phases in one state: [enrollment] is null while the factor is being created, and
 * non-null once there is a secret to show and a code to check against it.
 */
data class MfaSetupUiState(
    val enrollment: TotpEnrollment? = null,
    val code: String = "",
    val codeError: String? = null,
    val formError: AuthError? = null,
    val isEnrolling: Boolean = true,
    val isVerifying: Boolean = false,
    /** Set once the secret has been copied, so the button can say it worked. */
    val secretCopied: Boolean = false,
)

sealed interface MfaSetupEvent {
    /** Enrolled and verified — the session is now at aal2. */
    data object Done : MfaSetupEvent
    data object Cancelled : MfaSetupEvent
}
