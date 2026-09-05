package com.storytail.adventures.ui.screens.auth

import com.storytail.adventures.api.AuthError

/**
 * Screen 2.1m.4 Forgot Password.
 *
 * [sent] swaps the form for the confirmation panel, and it is reached whether or not the
 * address has an account — see [ForgotPasswordViewModel.submit].
 */
data class ForgotPasswordUiState(
    val email: String = "",
    val emailError: String? = null,
    val formError: AuthError? = null,
    val isSubmitting: Boolean = false,
    val sent: Boolean = false,
)

sealed interface ForgotPasswordEvent {
    data object NavigateToSignIn : ForgotPasswordEvent
}
