package com.storytail.adventures.ui.screens.auth

import com.storytail.adventures.api.AuthError

/** Screen 2.1m.5 Reset Password, on the recovery session the emailed link produces. */
data class ResetPasswordUiState(
    val password: String = "",
    val confirmPassword: String = "",
    val passwordError: String? = null,
    val confirmPasswordError: String? = null,
    val formError: AuthError? = null,
    val isSubmitting: Boolean = false,
    val isPasswordVisible: Boolean = false,
)

sealed interface ResetPasswordEvent {
    /** Changed. The session is already a full one, so this lands on the dashboard. */
    data object NavigateToDashboard : ResetPasswordEvent
    data object NavigateToSignIn : ResetPasswordEvent
}
