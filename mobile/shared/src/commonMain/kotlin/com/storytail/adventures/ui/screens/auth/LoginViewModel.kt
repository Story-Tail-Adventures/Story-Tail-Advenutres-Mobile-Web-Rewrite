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

/** Screen 2.1.1 Login — see docs/Screen-Inventory.md §2.1.1. */
class LoginViewModel(private val auth: AuthRepository) : ViewModel() {

    private val _state = MutableStateFlow(LoginUiState())
    val state: StateFlow<LoginUiState> = _state.asStateFlow()

    private val _events = Channel<LoginEvent>(Channel.BUFFERED)
    val events = _events.receiveAsFlow()

    fun onEmailChange(value: String) =
        _state.update { it.copy(email = value, emailError = null, formError = null) }

    fun onPasswordChange(value: String) =
        _state.update { it.copy(password = value, passwordError = null, formError = null) }

    fun togglePasswordVisibility() =
        _state.update { it.copy(isPasswordVisible = !it.isPasswordVisible) }

    fun onForgotPassword() {
        viewModelScope.launch { _events.send(LoginEvent.NavigateToForgotPassword) }
    }

    fun onCreateAccount() {
        viewModelScope.launch { _events.send(LoginEvent.NavigateToRegister) }
    }

    fun submit() {
        val current = _state.value
        if (current.isSubmitting) return

        val emailResult = AuthValidation.validateEmail(current.email)
        val passwordResult = AuthValidation.validateLoginPassword(current.password)

        if (!emailResult.isValid || !passwordResult.isValid) {
            _state.update {
                it.copy(
                    emailError = emailResult.errorMessage,
                    passwordError = passwordResult.errorMessage,
                    formError = null,
                )
            }
            return
        }

        _state.update { it.copy(isSubmitting = true, formError = null) }

        viewModelScope.launch {
            auth.signInWithPassword(current.email, current.password)
                .onSuccess {
                    // Wipe the credentials rather than just clearing isSubmitting.
                    //
                    // viewModel() in App.kt resolves against the Activity's
                    // ViewModelStore, so this instance outlives the Login route. Without
                    // this reset, signing out and returning to Login re-displays the
                    // previous user's email and their password — on a shared device that
                    // is a real disclosure, and the password has no reason to stay in
                    // memory past a successful exchange.
                    _state.value = LoginUiState()
                    _events.send(LoginEvent.NavigateToDashboard)
                }
                .onFailure { throwable ->
                    _state.update {
                        it.copy(isSubmitting = false, formError = throwable.asAuthError())
                    }
                }
        }
    }
}
