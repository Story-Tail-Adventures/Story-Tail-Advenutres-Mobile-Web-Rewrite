package com.storytail.adventures.ui.screens.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.storytail.adventures.api.AuthRepository
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
 * Screen 2.1m.5 Reset Password — see docs/Screen-Inventory.md §2.1.5.
 *
 * Reached on the recovery session the emailed link produces, which is a real session: by the
 * time this screen renders, whoever opened the link is signed in. That is why the full
 * password policy applies here and not the sign-in screen's presence-only rule — this is
 * setting a credential, not offering one.
 *
 * The confirmation is checked with the same shared rule registration uses, so "those two
 * don't match yet" is the same sentence in both places and on both platforms.
 */
class ResetPasswordViewModel(private val auth: AuthRepository) : ViewModel() {

    private val _state = MutableStateFlow(ResetPasswordUiState())
    val state: StateFlow<ResetPasswordUiState> = _state.asStateFlow()

    private val _events = Channel<ResetPasswordEvent>(Channel.BUFFERED)
    val events = _events.receiveAsFlow()

    fun onPasswordChange(value: String) = _state.update {
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

    fun togglePasswordVisibility() =
        _state.update { it.copy(isPasswordVisible = !it.isPasswordVisible) }

    fun onSignIn() {
        viewModelScope.launch { _events.send(ResetPasswordEvent.NavigateToSignIn) }
    }

    fun submit() {
        val current = _state.value
        if (current.isSubmitting) return

        val password = AuthValidation.validateNewPassword(current.password)
        val confirm = RegistrationValidation.validateConfirmPassword(
            current.password,
            current.confirmPassword,
        )

        if (!password.isValid || !confirm.isValid) {
            _state.update {
                it.copy(
                    passwordError = password.errorMessage,
                    confirmPasswordError = confirm.errorMessage,
                    formError = null,
                )
            }
            return
        }

        _state.update { it.copy(isSubmitting = true, formError = null) }

        viewModelScope.launch {
            auth.updatePassword(current.password).fold(
                onSuccess = {
                    // Cleared before navigating: this state object holds a plaintext
                    // password, and a ViewModel outlives the screen that made it.
                    _state.value = ResetPasswordUiState()
                    _events.send(ResetPasswordEvent.NavigateToDashboard)
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
