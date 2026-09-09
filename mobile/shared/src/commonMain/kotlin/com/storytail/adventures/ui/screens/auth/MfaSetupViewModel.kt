package com.storytail.adventures.ui.screens.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.storytail.adventures.api.AuthRepository
import com.storytail.adventures.api.asAuthError
import com.storytail.adventures.domain.validation.MfaValidation
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * Screen 2.1m.6 MFA Setup — see docs/Screen-Inventory.md §2.1.6.
 *
 * Enrolment starts the moment the screen opens rather than on a button, because there is
 * nothing to show until it has: the secret IS the screen. A failure there is reported in
 * place, with retry, instead of leaving somebody looking at an empty frame.
 *
 * `supabase/config.toml` has `[auth.mfa.totp]` enrolment and verification on and
 * `[auth.mfa.phone]` explicitly off, so the SMS tile the artboard draws renders visibly
 * unavailable rather than as a button that fails.
 */
class MfaSetupViewModel(private val auth: AuthRepository) : ViewModel() {

    private val _state = MutableStateFlow(MfaSetupUiState())
    val state: StateFlow<MfaSetupUiState> = _state.asStateFlow()

    private val _events = Channel<MfaSetupEvent>(Channel.BUFFERED)
    val events = _events.receiveAsFlow()

    init {
        enroll()
    }

    fun enroll() {
        _state.update { it.copy(isEnrolling = true, formError = null) }
        viewModelScope.launch {
            auth.enrollTotp().fold(
                onSuccess = { enrollment ->
                    _state.update { it.copy(isEnrolling = false, enrollment = enrollment) }
                },
                onFailure = { throwable ->
                    _state.update {
                        it.copy(isEnrolling = false, formError = throwable.asAuthError())
                    }
                },
            )
        }
    }

    fun onCodeChange(value: String) = _state.update {
        // Normalised as it is typed, not on submit: authenticator apps display "483 921"
        // with a space, and that space comes along on paste.
        it.copy(
            code = MfaValidation.normalize(value).take(MfaValidation.CODE_LENGTH),
            codeError = null,
            formError = null,
        )
    }

    fun onSecretCopied() = _state.update { it.copy(secretCopied = true) }

    fun onCancel() {
        viewModelScope.launch { _events.send(MfaSetupEvent.Cancelled) }
    }

    fun verify() {
        val current = _state.value
        val enrollment = current.enrollment ?: return
        if (current.isVerifying) return

        val code = MfaValidation.validateCode(current.code)
        if (!code.isValid) {
            _state.update { it.copy(codeError = code.errorMessage, formError = null) }
            return
        }

        _state.update { it.copy(isVerifying = true, formError = null) }

        viewModelScope.launch {
            auth.verifyTotp(enrollment.factorId, current.code).fold(
                onSuccess = {
                    // Cleared before leaving: the secret is a credential, and this ViewModel
                    // outlives the screen that made it.
                    _state.value = MfaSetupUiState(isEnrolling = false)
                    _events.send(MfaSetupEvent.Done)
                },
                onFailure = { throwable ->
                    _state.update {
                        it.copy(isVerifying = false, formError = throwable.asAuthError())
                    }
                },
            )
        }
    }
}
