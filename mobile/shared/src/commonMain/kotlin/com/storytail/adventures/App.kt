package com.storytail.adventures

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.lifecycle.viewmodel.compose.viewModel
import com.storytail.adventures.api.Assurance
import com.storytail.adventures.api.AuthRepository
import com.storytail.adventures.api.SupabaseClientProvider
import com.storytail.adventures.ui.nav.AppRoute
import com.storytail.adventures.ui.nav.Navigator
import com.storytail.adventures.ui.nav.PlatformBackHandler
import com.storytail.adventures.ui.nav.rememberNavigator
import com.storytail.adventures.ui.screens.auth.ForgotPasswordEvent
import com.storytail.adventures.ui.screens.auth.ForgotPasswordScreen
import com.storytail.adventures.ui.screens.auth.ForgotPasswordViewModel
import com.storytail.adventures.ui.screens.auth.LoginEvent
import com.storytail.adventures.ui.screens.auth.LoginScreen
import com.storytail.adventures.ui.screens.auth.LoginViewModel
import com.storytail.adventures.ui.screens.auth.MfaChallengeEvent
import com.storytail.adventures.ui.screens.auth.MfaChallengeScreen
import com.storytail.adventures.ui.screens.auth.MfaChallengeViewModel
import com.storytail.adventures.ui.screens.auth.MfaSetupEvent
import com.storytail.adventures.ui.screens.auth.MfaSetupScreen
import com.storytail.adventures.ui.screens.auth.MfaSetupViewModel
import com.storytail.adventures.ui.screens.auth.RegisterEvent
import com.storytail.adventures.ui.screens.auth.RegisterScreen
import com.storytail.adventures.ui.screens.auth.RegisterViewModel
import com.storytail.adventures.ui.screens.auth.ResetPasswordEvent
import com.storytail.adventures.ui.screens.auth.ResetPasswordScreen
import com.storytail.adventures.ui.screens.auth.ResetPasswordViewModel
import com.storytail.adventures.ui.screens.auth.VerifyEmailEvent
import com.storytail.adventures.ui.screens.auth.VerifyEmailScreen
import com.storytail.adventures.ui.screens.auth.VerifyEmailViewModel
import com.storytail.adventures.ui.screens.dashboard.DashboardScreen
import com.storytail.adventures.ui.theme.StoryTailTheme
import io.github.jan.supabase.auth.status.SessionStatus
import kotlinx.coroutines.launch

@Composable
fun App() {
    StoryTailTheme {
        // Built off the main thread — see SupabaseClientProvider.authRepository(). Null
        // until it is ready, which is what the Resolving route renders.
        var authRepository by remember { mutableStateOf<AuthRepository?>(null) }
        LaunchedEffect(Unit) {
            authRepository = SupabaseClientProvider.authRepository()
        }

        val repo = authRepository
        if (repo == null) {
            SplashScreen()
            return@StoryTailTheme
        }

        val nav = rememberNavigator()
        val sessionStatus by repo.sessionStatus.collectAsState(
            initial = SessionStatus.Initializing,
        )

        /**
         * The session decides the stack, not the other way round.
         *
         * Signing in resets rather than pushes, so the sign-in form is not one back gesture
         * behind the dashboard; signing out resets for the same reason in reverse. Signing
         * out only resets when the screen on top actually needed a session — see
         * [Navigator.onSignedOut].
         *
         * Restoring a persisted session lands straight on the dashboard, which is what
         * proves the round trip survived an app kill. Initializing has its own route so a
         * returning user does not see Login flash before the session resolves.
         */
        LaunchedEffect(sessionStatus) {
            when (sessionStatus) {
                is SessionStatus.Authenticated ->
                    // A password login is not the whole of signing in once a second factor
                    // exists. Same three-way gate the web proxy applies in
                    // web/lib/supabase/middleware.ts.
                    nav.resetTo(
                        if (repo.assurance() == Assurance.REQUIRED) AppRoute.MfaChallenge
                        else AppRoute.Dashboard,
                    )

                SessionStatus.Initializing -> nav.resetTo(AppRoute.Resolving)

                else -> nav.onSignedOut()
            }
        }

        // Android's system back. Disabled at the root of the stack so it falls through to
        // leaving the app rather than being swallowed.
        PlatformBackHandler(enabled = nav.canGoBack) { nav.pop() }

        when (val route = nav.current) {
            AppRoute.Resolving -> SplashScreen()

            AppRoute.Login -> {
                val viewModel = viewModel { LoginViewModel(repo) }
                val state by viewModel.state.collectAsState()

                LaunchedEffect(viewModel) {
                    viewModel.events.collect { event ->
                        when (event) {
                            // Authentication drives the stack through sessionStatus above,
                            // so this needs no navigation of its own.
                            LoginEvent.NavigateToDashboard -> Unit
                            LoginEvent.NavigateToRegister -> nav.push(AppRoute.Register)
                            LoginEvent.NavigateToForgotPassword ->
                                nav.push(AppRoute.ForgotPassword)
                        }
                    }
                }

                LoginScreen(
                    state = state,
                    onEmailChange = viewModel::onEmailChange,
                    onPasswordChange = viewModel::onPasswordChange,
                    onTogglePasswordVisibility = viewModel::togglePasswordVisibility,
                    onSubmit = viewModel::submit,
                    onForgotPassword = viewModel::onForgotPassword,
                    onCreateAccount = viewModel::onCreateAccount,
                    // Social sign-in stays disabled until the OAuth clients exist and
                    // supabase/config.toml carries the [auth.external.*] blocks.
                    googleEnabled = false,
                    appleEnabled = false,
                )
            }

            AppRoute.Dashboard -> {
                val scope = rememberCoroutineScope()
                DashboardScreen(
                    onSignOut = { scope.launch { repo.signOut() } },
                )
            }

            AppRoute.Register -> {
                val viewModel = viewModel { RegisterViewModel(repo) }
                val state by viewModel.state.collectAsState()

                LaunchedEffect(viewModel) {
                    viewModel.events.collect { event ->
                        when (event) {
                            // Sign-up with confirmations off produces a session, and
                            // sessionStatus above drives the stack — nothing to do here.
                            RegisterEvent.NavigateToDashboard -> Unit
                            is RegisterEvent.NavigateToVerifyEmail ->
                                nav.push(AppRoute.VerifyEmail(event.email))
                            // pop rather than push: Login is the screen underneath, and
                            // pushing it would leave two of them in the stack.
                            RegisterEvent.NavigateToSignIn -> nav.pop()
                        }
                    }
                }

                RegisterScreen(
                    state = state,
                    onFirstNameChange = viewModel::onFirstNameChange,
                    onLastNameChange = viewModel::onLastNameChange,
                    onEmailChange = viewModel::onEmailChange,
                    onPasswordChange = viewModel::onPasswordChange,
                    onConfirmPasswordChange = viewModel::onConfirmPasswordChange,
                    onTermsChange = viewModel::onTermsChange,
                    onTogglePasswordVisibility = viewModel::togglePasswordVisibility,
                    onSubmit = viewModel::submit,
                    onSignIn = viewModel::onSignIn,
                    googleEnabled = false,
                    appleEnabled = false,
                )
            }

            is AppRoute.VerifyEmail -> {
                // Keyed on the address: arriving here for a different sign-up must not reuse
                // the previous one's ViewModel, which holds the address in its constructor.
                val viewModel = viewModel(key = "verify-${route.email}") {
                    VerifyEmailViewModel(repo, route.email)
                }
                val state by viewModel.state.collectAsState()

                LaunchedEffect(viewModel) {
                    viewModel.events.collect { event ->
                        when (event) {
                            VerifyEmailEvent.NavigateToRegister -> nav.pop()
                            VerifyEmailEvent.NavigateToSignIn -> nav.resetTo(AppRoute.Login)
                        }
                    }
                }

                VerifyEmailScreen(
                    state = state,
                    onResend = viewModel::resend,
                    onChangeEmail = viewModel::onChangeEmail,
                    onSignOut = viewModel::onSignOut,
                )
            }

            AppRoute.ForgotPassword -> {
                val viewModel = viewModel { ForgotPasswordViewModel(repo) }
                val state by viewModel.state.collectAsState()

                LaunchedEffect(viewModel) {
                    viewModel.events.collect { event ->
                        when (event) {
                            ForgotPasswordEvent.NavigateToSignIn -> nav.pop()
                        }
                    }
                }

                ForgotPasswordScreen(
                    state = state,
                    onEmailChange = viewModel::onEmailChange,
                    onSubmit = viewModel::submit,
                    onSignIn = viewModel::onSignIn,
                )
            }

            AppRoute.ResetPassword -> {
                val viewModel = viewModel { ResetPasswordViewModel(repo) }
                val state by viewModel.state.collectAsState()

                LaunchedEffect(viewModel) {
                    viewModel.events.collect { event ->
                        when (event) {
                            // The recovery session is a real one, so saving a password
                            // leaves an authenticated session and sessionStatus routes it.
                            ResetPasswordEvent.NavigateToDashboard -> Unit
                            ResetPasswordEvent.NavigateToSignIn -> nav.resetTo(AppRoute.Login)
                        }
                    }
                }

                ResetPasswordScreen(
                    state = state,
                    onPasswordChange = viewModel::onPasswordChange,
                    onConfirmPasswordChange = viewModel::onConfirmPasswordChange,
                    onTogglePasswordVisibility = viewModel::togglePasswordVisibility,
                    onSubmit = viewModel::submit,
                    onSignIn = viewModel::onSignIn,
                )
            }

            AppRoute.MfaSetup -> {
                val viewModel = viewModel { MfaSetupViewModel(repo) }
                val state by viewModel.state.collectAsState()

                LaunchedEffect(viewModel) {
                    viewModel.events.collect { event ->
                        when (event) {
                            // Verifying raises the session to aal2; sessionStatus routes it.
                            MfaSetupEvent.Done -> nav.pop()
                            MfaSetupEvent.Cancelled -> nav.pop()
                        }
                    }
                }

                MfaSetupScreen(
                    state = state,
                    onCodeChange = viewModel::onCodeChange,
                    onSecretCopied = viewModel::onSecretCopied,
                    onRetry = viewModel::enroll,
                    onSubmit = viewModel::verify,
                    onCancel = viewModel::onCancel,
                )
            }

            AppRoute.MfaChallenge -> {
                val viewModel = viewModel { MfaChallengeViewModel(repo) }
                val state by viewModel.state.collectAsState()

                LaunchedEffect(viewModel) {
                    viewModel.events.collect { event ->
                        when (event) {
                            // Both outcomes change the session, and the LaunchedEffect on
                            // sessionStatus above is what moves the stack — verifying raises
                            // assurance to SATISFIED, signing out drops it entirely.
                            MfaChallengeEvent.Verified -> Unit
                            MfaChallengeEvent.SignedOut -> Unit
                        }
                    }
                }

                MfaChallengeScreen(
                    state = state,
                    onCodeChange = viewModel::onCodeChange,
                    onSubmit = viewModel::verify,
                    onSignOut = viewModel::onSignOut,
                )
            }
        }
    }
}

/** Plain branded ground while the session resolves. Milliseconds in the common case. */
@Composable
private fun SplashScreen(modifier: Modifier = Modifier) {
    Surface(color = MaterialTheme.colorScheme.background) {
        Box(modifier.fillMaxSize())
    }
}
