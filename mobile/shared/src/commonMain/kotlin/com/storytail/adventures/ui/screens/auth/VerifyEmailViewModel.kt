package com.storytail.adventures.ui.screens.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.storytail.adventures.api.AuthRepository
import com.storytail.adventures.api.asAuthError
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * Screen 2.1m.3 Email Verification — see docs/Screen-Inventory.md §2.1.3.
 *
 * The resend is the only thing this screen does, and it is deliberately quiet about what it
 * found: GoTrue answers the same way for an address awaiting confirmation and one that was
 * never registered, and nothing here adds a branch that tells them apart. Somebody who
 * mistyped their address at sign-up is helped by "Change email", not by being told the
 * address they typed has no account.
 */
class VerifyEmailViewModel(
    private val auth: AuthRepository,
    email: String?,
) : ViewModel() {

    private val _state = MutableStateFlow(VerifyEmailUiState(email = email))
    val state: StateFlow<VerifyEmailUiState> = _state.asStateFlow()

    private val _events = Channel<VerifyEmailEvent>(Channel.BUFFERED)
    val events = _events.receiveAsFlow()

    fun resend() {
        val address = _state.value.email
        if (_state.value.isResending || address.isNullOrBlank()) return

        _state.update { it.copy(isResending = true, resent = false, formError = null) }

        viewModelScope.launch {
            auth.resendVerification(address).fold(
                onSuccess = { _state.update { it.copy(isResending = false, resent = true) } },
                onFailure = { throwable ->
                    _state.update {
                        it.copy(isResending = false, formError = throwable.asAuthError())
                    }
                },
            )
        }
    }

    fun onChangeEmail() {
        viewModelScope.launch { _events.send(VerifyEmailEvent.NavigateToRegister) }
    }

    /**
     * Signs the half-made session out before leaving.
     *
     * With confirmations on there is usually no session at all here, so this is mostly a
     * no-op — but "mostly" is not "always" (a cold start on an unconfirmed account can
     * carry one), and leaving a session behind on the way to the sign-in screen is how
     * somebody ends up looking at a form they are already past.
     */
    fun onSignOut() {
        viewModelScope.launch {
            auth.signOut()
            _events.send(VerifyEmailEvent.NavigateToSignIn)
        }
    }
}
