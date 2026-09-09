package com.storytail.adventures.ui.screens.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.storytail.adventures.api.AuthRepository
import com.storytail.adventures.api.SignUpOutcome
import com.storytail.adventures.api.asAuthError
import com.storytail.adventures.domain.validation.AuthValidation
import com.storytail.adventures.domain.validation.RegistrationValidation
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * Screen 2.1m.2 Registration — see docs/Screen-Inventory.md §2.1.2.
 *
 * The web twin is web/app/(auth)/register/actions.ts, and the two rules worth repeating
 * because getting either wrong is a security bug rather than a bug:
 *
 * ANTI-ENUMERATION. A taken address and a fresh sign-up both end on the same
 * "check your email" panel. `SupabaseAuthRepository.signUp` maps GoTrue's
 * `user_already_exists` to [SignUpOutcome.ConfirmEmail] for exactly this reason; nothing
 * here may add a branch that tells them apart.
 *
 * NOTHING FROM THE FORM REACHES THE METADATA except the two validated names. The
 * `handle_new_user()` trigger trusts `raw_user_meta_data`, so a spread of arbitrary form
 * fields into it would let a self-registering traveler attach themselves to an agent's book
 * of business.
 */
class RegisterViewModel(private val auth: AuthRepository) : ViewModel() {

    private val _state = MutableStateFlow(RegisterUiState())
    val state: StateFlow<RegisterUiState> = _state.asStateFlow()

    private val _events = Channel<RegisterEvent>(Channel.BUFFERED)
    val events = _events.receiveAsFlow()

    fun onFirstNameChange(value: String) =
        _state.update { it.copy(firstName = value, firstNameError = null, formError = null) }

    fun onLastNameChange(value: String) =
        _state.update { it.copy(lastName = value, lastNameError = null, formError = null) }

    fun onEmailChange(value: String) =
        _state.update { it.copy(email = value, emailError = null, formError = null) }

    fun onPasswordChange(value: String) = _state.update {
        // The confirmation error clears too: it was about a password that no longer exists,
        // and leaving it up marks a field the person has not touched.
        it.copy(
            password = value,
            passwordError = null,
            confirmPasswordError = null,
            formError = null,
        )
    }

    fun onConfirmPasswordChange(value: String) = _state.update {
        it.copy(confirmPassword = value, confirmPasswordError = null, formError = null)
    }

    fun onTermsChange(accepted: Boolean) =
        _state.update { it.copy(termsAccepted = accepted, termsError = null, formError = null) }

    fun togglePasswordVisibility() =
        _state.update { it.copy(isPasswordVisible = !it.isPasswordVisible) }

    fun onSignIn() {
        viewModelScope.launch { _events.send(RegisterEvent.NavigateToSignIn) }
    }

    fun submit() {
        val current = _state.value
        if (current.isSubmitting) return

        val firstName = RegistrationValidation.validateName(current.firstName)
        val lastName = RegistrationValidation.validateName(current.lastName)
        val email = AuthValidation.validateEmail(current.email)
        val password = AuthValidation.validateNewPassword(current.password)
        val confirm = RegistrationValidation.validateConfirmPassword(
            current.password,
            current.confirmPassword,
        )
        val terms = RegistrationValidation.validateTermsAccepted(current.termsAccepted)

        val results = listOf(firstName, lastName, email, password, confirm, terms)
        if (results.any { !it.isValid }) {
            // Every field at once, not the first failure: making somebody submit six times
            // to be told six things is the difference between a form and an interrogation.
            _state.update {
                it.copy(
                    firstNameError = firstName.errorMessage,
                    lastNameError = lastName.errorMessage,
                    emailError = email.errorMessage,
                    passwordError = password.errorMessage,
                    confirmPasswordError = confirm.errorMessage,
                    termsError = terms.errorMessage,
                    formError = null,
                )
            }
            return
        }

        _state.update { it.copy(isSubmitting = true, formError = null) }

        viewModelScope.launch {
            auth.signUp(
                email = current.email.trim(),
                password = current.password,
                firstName = current.firstName.trim(),
                lastName = current.lastName.trim(),
            ).fold(
                onSuccess = { outcome ->
                    // Reset, not just `isSubmitting = false`. This ViewModel is resolved
                    // from the Activity's store and outlives the screen, so keeping the
                    // state would leave a plaintext password in memory indefinitely — and
                    // re-fill the whole form for whoever navigates back to Register next.
                    // Same reason ResetPasswordViewModel clears itself.
                    _state.value = RegisterUiState()
                    when (outcome) {
                        is SignUpOutcome.SignedIn ->
                            _events.send(RegisterEvent.NavigateToDashboard)
                        is SignUpOutcome.ConfirmEmail ->
                            _events.send(RegisterEvent.NavigateToVerifyEmail(outcome.email))
                    }
                },
                onFailure = { throwable ->
                    _state.update {
                        it.copy(isSubmitting = false, formError = throwable.asAuthError())
                    }
                },
            )
        }
    }
}
