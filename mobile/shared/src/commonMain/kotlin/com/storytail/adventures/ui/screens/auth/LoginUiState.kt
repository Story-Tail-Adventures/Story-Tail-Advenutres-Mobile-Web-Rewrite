package com.storytail.adventures.ui.screens.auth

import com.storytail.adventures.api.AuthError

/** Everything 2.1.1 renders. Kept separate from the ViewModel so it is trivially testable. */
data class LoginUiState(
    val email: String = "",
    val password: String = "",
    val emailError: String? = null,
    val passwordError: String? = null,
    val formError: AuthError? = null,
    val isSubmitting: Boolean = false,
    val isPasswordVisible: Boolean = false,
) {
    val canSubmit: Boolean get() = !isSubmitting
}

/** One-shot navigation signals. A Channel, not state — these must not replay on rotation. */
sealed interface LoginEvent {
    data object NavigateToDashboard : LoginEvent
    data object NavigateToRegister : LoginEvent
    data object NavigateToForgotPassword : LoginEvent
}
