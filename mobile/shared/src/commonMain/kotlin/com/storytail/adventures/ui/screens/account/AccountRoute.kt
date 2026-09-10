package com.storytail.adventures.ui.screens.account

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.lifecycle.viewmodel.compose.viewModel
import com.storytail.adventures.api.AccountRepository
import com.storytail.adventures.api.AuthRepository
import com.storytail.adventures.api.OnboardingRepository
import com.storytail.adventures.api.TripRepository
import com.storytail.adventures.domain.account.CloseMessages
import com.storytail.adventures.domain.account.HelpMessages
import com.storytail.adventures.ui.nav.AppRoute
import com.storytail.adventures.ui.nav.Navigator
import com.storytail.adventures.ui.nav.rememberPlatformLinks
import com.storytail.adventures.ui.screens.onboarding.toggleSentinelValue

/**
 * The §2.5 section host.
 *
 * App.kt hands over a route and gets a screen, the same contract `PublicRoute`,
 * `OnboardingRoute` and `TripRoute` have. Ten screens' wiring belongs together because it is
 * one hub and nine things pushed from it, and App.kt should not have to know which.
 *
 * THE BACK BEHAVIOUR IS `pop`, NOT `selectTab(Account)`. Every sub-screen was pushed onto the
 * Account tab's stack, so popping lands on the hub — and if somebody arrived at 2.5.10 from
 * 2.5.9 rather than from the hub, back returns them to 2.5.9, which is where they came from.
 * `selectTab` would throw the stack away and skip that intermediate screen.
 *
 * TWO HAND-OFFS LEAVE THIS SECTION, both deliberately:
 *
 *  · 2.5.7's "Turn on two-factor" pushes [AppRoute.MfaSetup], which is 2.1.6. That screen
 *    already exists, already works, and pops back here when it is done — growing a second
 *    enrolment flow inside §2.5 would be two implementations of a security-critical path.
 *  · 2.5.9 and 2.5.11 push [AppRoute.PublicLegal], which renders inside the PUBLIC chrome.
 *    The web twin links to the same public `/legal/…` pages, so this is parity rather than an
 *    oversight — the legal documents are one set of documents, signed in or out. The seam is
 *    real and is recorded: back from a legal page returns here, but the page itself wears the
 *    public menu. A signed-in legal shell is §2.0's to grow, not §2.5's to fork.
 *
 * The mailto hand-offs go through [rememberPlatformLinks], the same launcher §2.2.6 uses for
 * a signed document URL. Both `mailto:` strings are pre-encoded and are passed through
 * verbatim for the same reason a signed URL is.
 */
@Composable
fun AccountRoute(
    route: AppRoute,
    nav: Navigator,
    account: AccountRepository,
    onboarding: OnboardingRepository,
    trips: TripRepository,
    auth: AuthRepository,
    /** Today in UTC, for 2.5.2's expired-passport warning. */
    today: String,
    onSignOut: () -> Unit,
) {
    val links = rememberPlatformLinks()

    val onSelectTab: (String) -> Unit = { id ->
        when (id) {
            "trips" -> nav.selectTab(AppRoute.Dashboard)
            "account" -> nav.selectTab(AppRoute.Account)
            else -> Unit
        }
    }

    when (route) {
        AppRoute.Account -> {
            val viewModel = viewModel { AccountHubViewModel(account) }
            val state by viewModel.state.collectAsState()
            AccountScreen(
                state = state,
                onSelectTab = onSelectTab,
                onOpenPersonal = { nav.push(AppRoute.AccountPersonal) },
                onOpenPreferences = { nav.push(AppRoute.AccountPreferences) },
                onOpenDocuments = { nav.push(AppRoute.AccountDocuments) },
                onOpenSecurity = { nav.push(AppRoute.AccountSecurity) },
                onOpenConnected = { nav.push(AppRoute.AccountConnected) },
                onOpenHelp = { nav.push(AppRoute.AccountHelp) },
                onOpenPrivacy = { nav.push(AppRoute.AccountPrivacy) },
                onSignOut = onSignOut,
            )
        }

        AppRoute.AccountPersonal -> {
            val viewModel = viewModel { AccountProfileViewModel(account, onboarding, today) }
            val state by viewModel.state.collectAsState()
            val form by viewModel.form.collectAsState()
            val identity by viewModel.identity.collectAsState()

            // A saved form goes BACK, it does not stay put with a green tick. The web twin
            // redirects to /account for the same reason: an edit screen that has nothing
            // left to edit is a screen with no next step on it.
            LaunchedEffect(viewModel) {
                viewModel.events.collect { nav.pop() }
            }

            PersonalInfoScreen(
                state = state,
                form = form,
                identity = identity,
                onChange = viewModel::update,
                onSubmit = viewModel::submit,
                onBack = { nav.pop() },
                today = today,
            )
        }

        AppRoute.AccountPreferences -> {
            val viewModel = viewModel { AccountPreferencesViewModel(account, onboarding) }
            val state by viewModel.state.collectAsState()
            val form by viewModel.form.collectAsState()

            LaunchedEffect(viewModel) {
                viewModel.events.collect { nav.pop() }
            }

            AccountPreferencesScreen(
                state = state,
                form = form,
                onChange = viewModel::update,
                // The sentinel rule as a free function: 2.5.3 has no wizard view model to
                // borrow it from, and a second copy of "No restrictions clears the group"
                // is a second chance to disagree with the CHECK constraint.
                onToggleSentinel = ::toggleSentinelValue,
                onSubmit = viewModel::submit,
                onBack = { nav.pop() },
            )
        }

        AppRoute.AccountDocuments -> {
            val viewModel = viewModel { AccountDocumentsViewModel(account, trips) }
            val state by viewModel.state.collectAsState()
            val signing by viewModel.signing.collectAsState()
            val openError by viewModel.openError.collectAsState()

            AccountDocumentsScreen(
                state = state,
                signing = signing,
                openError = openError,
                onBack = { nav.pop() },
                onOpen = { document -> viewModel.open(document, links::openUrl) },
                onOpenTrips = { nav.selectTab(AppRoute.Dashboard) },
                onRetry = viewModel::load,
            )
        }

        AppRoute.AccountNotifications -> NotificationsScreen(onBack = { nav.pop() })

        AppRoute.AccountSecurity -> {
            val viewModel = viewModel { SecurityViewModel(account, auth) }
            val loading by viewModel.loading.collectAsState()
            val provider by viewModel.provider.collectAsState()
            val mfaOn by viewModel.mfaOn.collectAsState()

            SecurityScreen(
                loading = loading,
                provider = provider,
                mfaOn = mfaOn,
                onBack = { nav.pop() },
                onOpenConnected = { nav.push(AppRoute.AccountConnected) },
                onEnableMfa = { nav.push(AppRoute.MfaSetup) },
            )
        }

        AppRoute.AccountConnected -> {
            val viewModel = viewModel { ConnectedAccountsViewModel(account) }
            val loading by viewModel.loading.collectAsState()
            val provider by viewModel.provider.collectAsState()

            ConnectedAccountsScreen(
                loading = loading,
                provider = provider,
                onBack = { nav.pop() },
            )
        }

        AppRoute.AccountPrivacy -> PrivacyScreen(
            onBack = { nav.pop() },
            onOpenLegal = { slug -> nav.push(AppRoute.PublicLegal(slug)) },
            onOpenClose = { nav.push(AppRoute.AccountClose) },
        )

        AppRoute.AccountClose -> {
            val viewModel = viewModel { CloseAccountViewModel(account) }
            val email by viewModel.email.collectAsState()

            CloseAccountScreen(
                email = email,
                onBack = { nav.pop() },
                onMessageGyasi = { links.openUrl(CloseMessages.MAILTO) },
                // "Keep my account" is the same movement as Back, and says so in words —
                // §4.4 Pattern J wants the non-destructive choice named, not just available
                // as a chevron in the corner.
                onKeepAccount = { nav.pop() },
            )
        }

        AppRoute.AccountHelp -> HelpScreen(
            onBack = { nav.pop() },
            onMessageGyasi = { links.openUrl(HelpMessages.MAILTO) },
            onOpenLegal = { slug -> nav.push(AppRoute.PublicLegal(slug)) },
        )

        // Every other route belongs to another host. Unreachable — App.kt only sends the ten
        // above — but Kotlin cannot know that, and an `else -> Unit` would render a blank
        // screen if App.kt's list and this one ever disagreed.
        else -> Unit
    }
}
