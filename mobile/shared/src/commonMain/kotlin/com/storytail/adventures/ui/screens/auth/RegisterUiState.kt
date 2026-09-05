package com.storytail.adventures.ui.screens.auth

import com.storytail.adventures.api.AuthError

/**
 * Screen 2.1m.2 Registration — everything it renders.
 *
 * `outcome` is what swaps the form for the check-your-inbox panel, and it is reached by BOTH
 * a real sign-up and an address that already has an account. See [RegisterViewModel.submit]
 * for why those must be indistinguishable.
 */
data class RegisterUiState(
    val firstName: String = "",
    val lastName: String = "",
    val email: String = "",
    val password: String = "",
    val confirmPassword: String = "",
    val termsAccepted: Boolean = false,
    val firstNameError: String? = null,
    val lastNameError: String? = null,
    val emailError: String? = null,
    val passwordError: String? = null,
    val confirmPasswordError: String? = null,
    val termsError: String? = null,
    val formError: AuthError? = null,
    val isSubmitting: Boolean = false,
    val isPasswordVisible: Boolean = false,
) {
    val canSubmit: Boolean get() = !isSubmitting
}

/** One-shot signals. A Channel, not state — these must not replay on rotation. */
sealed interface RegisterEvent {
    /** Sign-up produced a session outright: confirmations are off (local dev). */
    data object NavigateToDashboard : RegisterEvent

    /** A link was mailed — or the address was taken, which looks identical from here. */
    data class NavigateToVerifyEmail(val email: String) : RegisterEvent

    data object NavigateToSignIn : RegisterEvent
}
