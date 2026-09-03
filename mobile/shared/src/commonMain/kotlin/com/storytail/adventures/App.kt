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
import com.storytail.adventures.ui.screens.auth.LoginEvent
import com.storytail.adventures.ui.screens.auth.LoginScreen
import com.storytail.adventures.ui.screens.auth.LoginViewModel
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

            // Screens 2.1.2-2.1.7 have their routes and their shared rules
            // (RegistrationValidation, MfaValidation, PasswordStrength) but not yet their
            // Compose screens. Rendering the splash rather than nothing keeps an
            // accidental navigation from showing a blank frame.
            AppRoute.Register,
            is AppRoute.VerifyEmail,
            AppRoute.ForgotPassword,
            AppRoute.ResetPassword,
            AppRoute.MfaSetup,
            AppRoute.MfaChallenge,
            -> {
                LaunchedEffect(route) { nav.pop() }
                SplashScreen()
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
