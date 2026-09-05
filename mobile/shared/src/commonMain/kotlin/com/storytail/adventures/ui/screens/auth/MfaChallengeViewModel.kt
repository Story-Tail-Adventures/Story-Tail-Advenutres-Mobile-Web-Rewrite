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
 * Screen 2.1m.7 MFA Challenge — see docs/Screen-Inventory.md §2.1.7.
 *
 * The second half of signing in. Reached BECAUSE the session is incomplete rather than
 * despite it: `App.kt` sends anybody whose [com.storytail.adventures.api.Assurance] is
 * REQUIRED here, mirroring the gate the web proxy applies in web/lib/supabase/middleware.ts.
 *
 * TWO CONTROLS THE ARTBOARD DRAWS ARE ABSENT. "Resend SMS" has nothing to resend —
 * `[auth.mfa.phone]` is disabled in supabase/config.toml. "Use a backup code" has nothing to
 * use: recovery codes are not part of the TOTP flow this repository implements, and a link
 * that leads nowhere is worse on this screen than on any other, because the person tapping
 * it is already locked out. Sign out is the honest escape, and it is offered.
 */
class MfaChallengeViewModel(private val auth: AuthRepository) : ViewModel() {

    private val _state = MutableStateFlow(MfaChallengeUiState())
    val state: StateFlow<MfaChallengeUiState> = _state.asStateFlow()

    private val _events = Channel<MfaChallengeEvent>(Channel.BUFFERED)
    val events = _events.receiveAsFlow()

    init {
        viewModelScope.launch {
            val factorId = auth.verifiedTotpFactorId()
            _state.update { it.copy(isResolving = false, factorId = factorId) }
        }
    }

    fun onCodeChange(value: String) = _state.update {
        it.copy(
            code = MfaValidation.normalize(value).take(MfaValidation.CODE_LENGTH),
            codeError = null,
            formError = null,
        )
    }

    /**
     * Leaves rather than stays.
     *
     * Somebody who cannot produce a code is stuck: there is no route onward from here, and
     * the only thing worse than signing them out is holding them on a screen with nothing
     * they can do. Signing out lets them start again, or reach the forgotten-password flow.
     */
    fun onSignOut() {
        viewModelScope.launch {
            auth.signOut()
            _events.send(MfaChallengeEvent.SignedOut)
        }
    }

    fun verify() {
        val current = _state.value
        val factorId = current.factorId ?: return
        if (current.isVerifying) return

        val code = MfaValidation.validateCode(current.code)
        if (!code.isValid) {
            _state.update { it.copy(codeError = code.errorMessage, formError = null) }
            return
        }

        _state.update { it.copy(isVerifying = true, formError = null) }

        viewModelScope.launch {
            auth.verifyTotp(factorId, current.code).fold(
                onSuccess = {
                    _state.update { it.copy(isVerifying = false, code = "") }
                    _events.send(MfaChallengeEvent.Verified)
                },
                onFailure = { throwable ->
                    // The code is cleared on a wrong answer. A six-digit code is only valid
                    // for thirty seconds, so the one in the boxes is already stale by the
                    // time the server rejects it — leaving it there invites somebody to
                    // press Verify again on a code that cannot work.
                    _state.update {
                        it.copy(
                            isVerifying = false,
                            code = "",
                            formError = throwable.asAuthError(),
                        )
                    }
                },
            )
        }
    }
}
