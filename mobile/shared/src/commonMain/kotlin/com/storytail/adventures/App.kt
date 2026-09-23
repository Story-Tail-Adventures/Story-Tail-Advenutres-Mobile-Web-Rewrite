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
import com.storytail.adventures.api.AccountRepository
import com.storytail.adventures.api.AuthRepository
import com.storytail.adventures.api.OnboardingRepository
import com.storytail.adventures.api.TripRepository
import com.storytail.adventures.api.AgentRepository
import com.storytail.adventures.ui.screens.agent.AgentRoute
import com.storytail.adventures.api.WalletRepository
import com.storytail.adventures.api.OnboardingStatus
import com.storytail.adventures.domain.onboarding.WizardStep
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
import com.storytail.adventures.ui.screens.account.AccountRoute
import com.storytail.adventures.ui.screens.messages.MessagesRoute
import com.storytail.adventures.ui.screens.wallet.WalletRoute
import com.storytail.adventures.ui.screens.trip.TripRoute
import com.storytail.adventures.ui.screens.public.PublicRoute
import com.storytail.adventures.ui.screens.onboarding.OnboardingRoute
import com.storytail.adventures.ui.screens.onboarding.todayIsoUtc
import com.storytail.adventures.ui.theme.StoryTailTheme
import io.github.jan.supabase.auth.status.SessionStatus
import kotlinx.coroutines.launch
import kotlinx.datetime.LocalDate

@Composable
fun App() {
    StoryTailTheme {
        // Built off the main thread — see SupabaseClientProvider.authRepository(). Null
        // until it is ready, which is what the Resolving route renders.
        var authRepository by remember { mutableStateOf<AuthRepository?>(null) }
        var onboardingRepository by remember { mutableStateOf<OnboardingRepository?>(null) }
        var tripRepository by remember { mutableStateOf<TripRepository?>(null) }
        var accountRepository by remember { mutableStateOf<AccountRepository?>(null) }
        var walletRepository by remember { mutableStateOf<WalletRepository?>(null) }
        var agentRepository by remember { mutableStateOf<AgentRepository?>(null) }
        LaunchedEffect(Unit) {
            authRepository = SupabaseClientProvider.authRepository()
            onboardingRepository = SupabaseClientProvider.onboardingRepository()
            tripRepository = SupabaseClientProvider.tripRepository()
            accountRepository = SupabaseClientProvider.accountRepository()
            walletRepository = SupabaseClientProvider.walletRepository()
            agentRepository = SupabaseClientProvider.agentRepository()
        }

        // Today, as the date-only columns see it. Computed once per composition rather than
        // per keystroke: the only thing it decides is whether a date of birth is in the past,
        // and asking the clock on every character typed is work for no answer that changes.
        val today = remember { todayIsoUtc() }

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
         * The row the gate below resolves, KEPT rather than dropped.
         *
         * `platform_user` carries `display_name` and `time_zone`, both added to this read
         * for §3.2's greeting, and the gate used to throw the whole status away after
         * reading the role off it — so [AgentWorklistHost] issued a second identical select
         * behind a full-screen splash, serialised ahead of the four worklist RPCs, with its
         * own independent way to fail. One read, one failure point.
         */
        var onboardingStatus by remember { mutableStateOf<OnboardingStatus?>(null) }

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
        LaunchedEffect(sessionStatus, onboardingRepository) {
            when (sessionStatus) {
                is SessionStatus.Authenticated ->
                    // A password login is not the whole of signing in once a second factor
                    // exists. Same three-way gate the web proxy applies in
                    // web/lib/supabase/middleware.ts, and then the same onboarding gate the
                    // (client) layout applies after it.
                    nav.resetTo(
                        when {
                            repo.assurance() == Assurance.REQUIRED -> AppRoute.MfaChallenge
                            else -> onboardingRepository?.let { onboarding ->
                                // Assigned BEFORE the route is chosen, so anything the
                                // route then renders already has it.
                                val status = onboarding.status()
                                onboardingStatus = status
                                destinationFor(status)
                            } ?: AppRoute.Dashboard
                        },
                    )

                SessionStatus.Initializing -> nav.resetTo(AppRoute.Resolving)

                // The front door is 2.0.1 now, not Login. Before §2.0 existed, opening the
                // app without a session put a password form in front of somebody who had
                // just installed it and had nothing to sign in with.
                else -> nav.onSignedOut(AppRoute.PublicLanding)
            }
        }

        // Android's system back. Disabled at the root of the stack so it falls through to
        // leaving the app rather than being swallowed.
        PlatformBackHandler(enabled = nav.canGoBack) { nav.pop() }

        when (val route = nav.current) {
            AppRoute.Resolving -> SplashScreen()

            // Screen Inventory §3.2. A SIBLING host, not a wrapper — see AgentRoute.
            AppRoute.Worklist -> {
                val scope = rememberCoroutineScope()
                val agent = agentRepository
                if (agent == null) {
                    SplashScreen()
                } else {
                    AgentWorklistHost(
                        agent = agent,
                        status = onboardingStatus,
                        nav = nav,
                        // The same call the client shell's Account tab makes. Worklist is
                        // the whole agent shell in this slice, so without this an agent who
                        // signs in on a phone has no way to sign out — and before §3.2 they
                        // landed in the client shell, which has one.
                        onSignOut = { scope.launch { repo.signOut() } },
                    )
                }
            }

            // Screen Inventory §2.0. One host for all nine screens — see PublicRoute.
            AppRoute.PublicLanding,
            AppRoute.PublicHowItWorks,
            AppRoute.PublicExplore,
            AppRoute.PublicAbout,
            is AppRoute.PublicResults,
            is AppRoute.PublicTripDetail,
            is AppRoute.PublicJoin,
            is AppRoute.PublicTopic,
            is AppRoute.PublicLegal,
            -> PublicRoute(
                route = route,
                onNavigate = nav::push,
                // Falls back to the landing page rather than exiting: the gate and the
                // legal pages are reachable from the menu, so "back" from one of them with
                // an empty stack must still leave somewhere to be.
                onBack = { if (!nav.pop()) nav.resetTo(AppRoute.PublicLanding) },
                onSignIn = { nav.push(AppRoute.Login) },
                onCreateAccount = { nav.push(AppRoute.Register) },
            )

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

            is AppRoute.Onboarding -> {
                val onboarding = onboardingRepository
                if (onboarding == null) {
                    SplashScreen()
                    return@StoryTailTheme
                }
                OnboardingRoute(
                    step = route.step,
                    onboarding = onboarding,
                    today = today,
                    onAdvance = { nav.resetTo(AppRoute.Onboarding(it)) },
                    // Finishing stamps `onboarding_completed_at`, which is what stops the
                    // gate routing every future sign-in back into the wizard.
                    onFinished = { nav.resetTo(AppRoute.Dashboard) },
                )
            }

            // Every §2.2 route goes to one host. Listing them here rather than using an
            // `else` is deliberate: the `when` stays exhaustive, so adding a route to
            // AppRoute without deciding where it renders is a compile error rather than a
            // screen that silently falls through to the dashboard.
            AppRoute.Dashboard,
            AppRoute.AllTrips,
            is AppRoute.TripDetail,
            is AppRoute.Itinerary,
            is AppRoute.ItineraryDay,
            is AppRoute.TripDocuments,
            is AppRoute.TripThread,
            is AppRoute.PastTrip,
            is AppRoute.TripUpdate,
            -> {
                // The §2.2 section host, matching how PublicRoute and OnboardingRoute are
                // handed a route rather than App.kt branching per screen.
                val trips = tripRepository
                if (trips == null) {
                    // The same splash the auth repository gets, for the same reason: the
                    // client is built off the main thread and there is nothing to read
                    // until it exists.
                    SplashScreen()
                } else {
                    TripRoute(
                        route = route,
                        nav = nav,
                        trips = trips,
                        // The §2.2 derivations are date arithmetic, so the date is passed
                        // in rather than read from the clock inside them — see
                        // domain/trip/TripStatus.kt.
                        today = LocalDate.parse(today),
                    )
                }
            }

            // §2.6, listed for the same reason: the `when` stays exhaustive.
            AppRoute.Messages,
            is AppRoute.ConversationThread,
            AppRoute.NewConversation,
            -> {
                val trips = tripRepository
                if (trips == null) {
                    SplashScreen()
                } else {
                    // No `today` parameter: §2.6's dates are all rendered in the DEVICE zone
                    // through `localToday()` at the point of use, not derived from App.kt's
                    // UTC date. The thread's separators and the inbox's timestamps have to
                    // agree with each other, and the device is the only clock that knows where
                    // the traveler is.
                    MessagesRoute(route = route, nav = nav, trips = trips)
                }
            }

            // §2.4, listed for the same reason: the `when` stays exhaustive, so a route added to
            // AppRoute without a home is a compile error rather than a screen that silently
            // falls through. That is not hypothetical — it caught these six.
            AppRoute.Wallet,
            is AppRoute.WalletAuthorize,
            is AppRoute.WalletAuthorization,
            is AppRoute.WalletRemoveAuthorization,
            is AppRoute.WalletActivity,
            is AppRoute.WalletUseDetail,
            -> {
                val walletRepo = walletRepository
                val trips = tripRepository
                if (walletRepo == null || trips == null) {
                    SplashScreen()
                } else {
                    // `trips` is here for 2.4.3 alone, which needs the trip's balance due to
                    // derive its limit presets. Everything else in §2.4 comes from the wallet.
                    WalletRoute(route = route, nav = nav, wallet = walletRepo, trips = trips)
                }
            }

            // Every §2.5 route goes to one host, listed for the same reason §2.2's are: the
            // `when` stays exhaustive, so a route added to AppRoute without a home fails to
            // compile rather than falling through to whatever branch happened to be last.
            AppRoute.Account,
            AppRoute.AccountPersonal,
            AppRoute.AccountPreferences,
            AppRoute.AccountDocuments,
            AppRoute.AccountNotifications,
            AppRoute.AccountSecurity,
            AppRoute.AccountConnected,
            AppRoute.AccountPrivacy,
            AppRoute.AccountClose,
            AppRoute.AccountHelp,
            -> {
                val scope = rememberCoroutineScope()
                val account = accountRepository
                val onboarding = onboardingRepository
                val trips = tripRepository
                if (account == null || onboarding == null || trips == null) {
                    SplashScreen()
                } else {
                    AccountRoute(
                        route = route,
                        nav = nav,
                        account = account,
                        // 2.5.2 and 2.5.3 write through the wizard's own Edge Functions,
                        // minus the `advance` flag — see AccountRoute.
                        onboarding = onboarding,
                        // 2.5.4 opens a file through `trip-document-url`, which is the only
                        // door into the bucket and works for an account-scoped document
                        // too: it checks `client_id` before it looks at `trip_id`.
                        trips = trips,
                        // 2.5.7 reads MFA state from GoTrue rather than the dead
                        // `mfa_device` table, exactly as 2.1.6 writes it.
                        auth = repo,
                        today = today,
                        onSignOut = { scope.launch { repo.signOut() } },
                    )
                }
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

/**
 * Where an authenticated traveler belongs.
 *
 * PURE, so the rule is assertable without a Supabase client — the same reason
 * `onboardingRedirectFor` was split out of the web gate. Null status means the read failed
 * or Supabase is unconfigured, and it FAILS OPEN: a bookkeeping query going wrong must not
 * lock somebody out of their own dashboard.
 *
 * An agent has no wizard, and a finished one is not sent back into it — the step slug is
 * cleared on completion, but the gate does not depend on that having happened.
 */
fun destinationFor(status: OnboardingStatus?): AppRoute = when {
    // FAILS OPEN TO THE CLIENT SHELL, and with two shells that direction is the security
    // property rather than a convenience. A bookkeeping query going wrong must not lock
    // somebody out of their own dashboard — but rendering the WORKLIST on a failed read
    // would put an unknown visitor in front of somebody else's book. A client who lands on
    // the dashboard by accident sees their own trips; an agent who does sees an empty one
    // and a way back. The web gate (web/lib/agent/role.ts) records the same asymmetry.
    status == null -> AppRoute.Dashboard

    status.role == "agent" -> AppRoute.Worklist

    // An admin has neither a client_id nor an agent_id in the general case — the
    // platform_user CHECK permits it — so `current_agent_id()` refuses them and every §3.x
    // read returns nothing. The client dashboard is the same dead end, but it is the one
    // that already has an unauthorized state; §3.9 is agent tooling, not an admin console.
    status.role == "admin" -> AppRoute.Dashboard

    !status.isClient -> AppRoute.Dashboard
    status.completed -> AppRoute.Dashboard
    // Started but unfinished: resume where they stopped. Never started: the cover page.
    else -> AppRoute.Onboarding(WizardStep.ofSlug(status.step) ?: WizardStep.WELCOME)
}

/**
 * §3.1.6 MANDATORY AGENT MFA IS NOT ENFORCED HERE, and that is a known gap rather than an
 * oversight. Data-Model §5.1 requires it and `account.mfa_required` is true for the seeded
 * agent, but nothing in this gate sends an agent without a verified factor to [AppRoute.MfaSetup]
 * — the MFA challenge only fires when `repo.assurance()` already says REQUIRED. Closing it
 * belongs with §3.1, which builds the agent activation wizard. Left visible in the gate
 * rather than discovered later.
 */

/**
 * Resolves who the advisor is before handing off to [AgentRoute].
 *
 * NO READ OF ITS OWN, and the comment used to claim that while the code did the opposite.
 * The display name and the time zone both come off `platform_user`, which the session gate
 * has already read to pick this route — so the row is threaded in rather than fetched
 * again. Re-reading cost a second uncached select, a full-screen splash in front of it, and
 * a second independent way to fail, all serialised ahead of the four worklist RPCs.
 *
 * [status] IS NON-NULL IN PRACTICE: [destinationFor] only answers [AppRoute.Worklist] for
 * `status.role == "agent"`, which needs a row. The defaults are the cross-platform
 * convention for a status that could not be read — `agentIdentity()` on the web returns the
 * same two — so the screen degrades to "there" and Central rather than hanging on a splash
 * that nothing will resolve.
 */
@Composable
private fun AgentWorklistHost(
    agent: AgentRepository,
    status: OnboardingStatus?,
    nav: Navigator,
    onSignOut: () -> Unit,
) {
    AgentRoute(
        route = AppRoute.Worklist,
        nav = nav,
        agent = agent,
        displayName = status?.displayName.orEmpty(),
        timeZone = status?.timeZone ?: "America/Chicago",
        onSignOut = onSignOut,
    )
}

/** Plain branded ground while the session resolves. Milliseconds in the common case. */
@Composable
private fun SplashScreen(modifier: Modifier = Modifier) {
    Surface(color = MaterialTheme.colorScheme.background) {
        Box(modifier.fillMaxSize())
    }
}
