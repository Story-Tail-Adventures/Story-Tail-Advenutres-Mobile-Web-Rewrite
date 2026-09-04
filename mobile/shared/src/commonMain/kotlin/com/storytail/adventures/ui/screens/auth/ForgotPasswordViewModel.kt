package com.storytail.adventures.ui.screens.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.storytail.adventures.api.AuthRepository
import com.storytail.adventures.api.asAuthError
import com.storytail.adventures.domain.validation.AuthValidation
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * Screen 2.1m.4 Forgot Password — see docs/Screen-Inventory.md §2.1.4.
 *
 * ANTI-ENUMERATION, and here it is stronger than on registration: a request for an address
 * with no account reports success exactly as one for an address with an account does. Its
 * web twin (web/app/(auth)/forgot-password/actions.ts) does the same. Telling somebody
 * "no account with that address" turns this form into a tool for testing a list of
 * addresses against the platform.
 *
 * Note what is NOT swallowed: a transport failure. "We could not reach the mail server" is
 * about us, not about whether they have an account, and hiding it would leave somebody
 * waiting for a message that was never sent.
 */
class ForgotPasswordViewModel(private val auth: AuthRepository) : ViewModel() {

    private val _state = MutableStateFlow(ForgotPasswordUiState())
    val state: StateFlow<ForgotPasswordUiState> = _state.asStateFlow()

    private val _events = Channel<ForgotPasswordEvent>(Channel.BUFFERED)
    val events = _events.receiveAsFlow()

    fun onEmailChange(value: String) =
        _state.update { it.copy(email = value, emailError = null, formError = null) }

    fun onSignIn() {
        viewModelScope.launch { _events.send(ForgotPasswordEvent.NavigateToSignIn) }
    }

    fun submit() {
        val current = _state.value
        if (current.isSubmitting) return

        val email = AuthValidation.validateEmail(current.email)
        if (!email.isValid) {
            _state.update { it.copy(emailError = email.errorMessage, formError = null) }
            return
        }

        _state.update { it.copy(isSubmitting = true, formError = null) }

        viewModelScope.launch {
            auth.requestPasswordReset(current.email.trim()).fold(
                onSuccess = { _state.update { it.copy(isSubmitting = false, sent = true) } },
                onFailure = { throwable ->
                    _state.update {
                        it.copy(isSubmitting = false, formError = throwable.asAuthError())
                    }
                },
            )
        }
    }
}
