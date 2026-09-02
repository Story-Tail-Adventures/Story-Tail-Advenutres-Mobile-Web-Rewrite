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
import com.storytail.adventures.api.AuthRepository
import com.storytail.adventures.api.SupabaseClientProvider
import com.storytail.adventures.ui.screens.auth.LoginEvent
import com.storytail.adventures.ui.screens.auth.LoginScreen
import com.storytail.adventures.ui.screens.auth.LoginViewModel
import com.storytail.adventures.ui.screens.dashboard.DashboardScreen
import com.storytail.adventures.ui.theme.StoryTailTheme
import io.github.jan.supabase.auth.status.SessionStatus
import kotlinx.coroutines.launch

/**
 * Destinations.
 *
 * A sealed interface rather than navigation-compose: there are two screens, no deep
 * links yet, and the Compose Multiplatform navigation artifact is still alpha. Swap it
 * in at the third destination, when Screen Inventory §2.1.1's "deep link to an
 * authenticated screen" entry point actually needs handling.
 */
sealed interface AppRoute {
    /** Session restore hasn't finished. Distinct from Login so we don't flash it. */
    data object Resolving : AppRoute
    data object Login : AppRoute
    data object Dashboard : AppRoute
}

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

        val sessionStatus by repo.sessionStatus.collectAsState(
            initial = SessionStatus.Initializing,
        )

        var route by remember { mutableStateOf<AppRoute>(AppRoute.Resolving) }

        // Restoring a persisted session lands straight on the dashboard — that is what
        // proves the round trip survived an app kill. Initializing gets its own route so
        // a returning user doesn't see Login flash before the session resolves.
        LaunchedEffect(sessionStatus) {
            route = when (sessionStatus) {
                is SessionStatus.Authenticated -> AppRoute.Dashboard
                SessionStatus.Initializing -> AppRoute.Resolving
                else -> AppRoute.Login
            }
        }

        when (route) {
            AppRoute.Resolving -> SplashScreen()

            AppRoute.Login -> {
                val viewModel = viewModel { LoginViewModel(repo) }
                val state by viewModel.state.collectAsState()

                LaunchedEffect(viewModel) {
                    viewModel.events.collect { event ->
                        when (event) {
                            LoginEvent.NavigateToDashboard -> route = AppRoute.Dashboard
                            // 2.1.2 and 2.1.4 are not built yet. The controls are live so
                            // the screen matches the prototype, but they go nowhere.
                            LoginEvent.NavigateToRegister -> Unit
                            LoginEvent.NavigateToForgotPassword -> Unit
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
