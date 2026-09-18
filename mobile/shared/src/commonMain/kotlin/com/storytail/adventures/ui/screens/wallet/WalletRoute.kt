package com.storytail.adventures.ui.screens.wallet

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.lifecycle.viewmodel.compose.viewModel
import com.storytail.adventures.api.TripRepository
import com.storytail.adventures.api.WalletRepository
import com.storytail.adventures.ui.nav.AppRoute
import com.storytail.adventures.ui.nav.Navigator

/**
 * The §2.4 section host.
 *
 * Same contract as `TripRoute`, `AccountRoute` and `MessagesRoute`: App.kt hands over a route
 * and gets a screen.
 *
 * NO TAB WIRING, which is what makes this host different from the other three. §2.4 has no
 * tab — Wallet is rail-only on web and absent from the mobile bar — so every screen here is
 * pushed from 2.5.1's "Payment methods" row and pops back to it. There is no `onSelectTab`
 * because there is no bar on any of these screens to select from.
 *
 * 2.4.2 Add Card has no branch at all: it is deferred until a Stripe account exists, and
 * 2.4.1 renders its CTA disabled with the reason rather than routing anywhere.
 */
@Composable
fun WalletRoute(
    route: AppRoute,
    nav: Navigator,
    wallet: WalletRepository,
    trips: TripRepository,
) {
    when (route) {
        is AppRoute.WalletAuthorize -> {
            val viewModel = viewModel(key = "authorize-${route.tripId}") {
                AuthorizeViewModel(wallet, trips, route.tripId)
            }
            val state by viewModel.state.collectAsState()
            val tripTitle by viewModel.tripTitle.collectAsState()
            val balanceDue by viewModel.balanceDueCents.collectAsState()
            val presets by viewModel.presets.collectAsState()
            val selectedCard by viewModel.selectedCardId.collectAsState()
            val selectedLimit by viewModel.selectedLimitCents.collectAsState()
            val expiry by viewModel.expiryIso.collectAsState()
            val consented by viewModel.consented.collectAsState()
            val sending by viewModel.sending.collectAsState()
            val error by viewModel.error.collectAsState()
            val authorized by viewModel.authorized.collectAsState()

            // REPLACE, not push: once the authorization exists this screen has nothing left
            // to show, and Back from the confirmation should return to the wallet rather than
            // to a form whose submission already happened.
            //
            // CONSUMED BEFORE NAVIGATING, because this view model is app-scoped and outlives
            // the screen — see `consumeAuthorized`. Leaving the id set made a second visit to
            // this trip's form skip straight back to the first authorization.
            LaunchedEffect(authorized) {
                val id = authorized ?: return@LaunchedEffect
                viewModel.consumeAuthorized()
                nav.replace(AppRoute.WalletAuthorization(id, justAuthorized = true))
            }

            AuthorizeScreen(
                state = state,
                tripTitle = tripTitle,
                balanceDueCents = balanceDue,
                presets = presets,
                selectedCardId = selectedCard,
                selectedLimitCents = selectedLimit,
                expiryIso = expiry,
                consented = consented,
                sending = sending,
                error = error,
                onSelectCard = viewModel::selectCard,
                onSelectLimit = viewModel::selectLimit,
                onToggleConsent = viewModel::toggleConsent,
                onSubmit = viewModel::submit,
                onBack = { nav.pop() },
                onRetry = viewModel::load,
            )
        }

        is AppRoute.WalletAuthorization -> {
            val viewModel = viewModel(key = "wallet") { WalletViewModel(wallet) }
            val state by viewModel.state.collectAsState()

            // The authorization was created on the screen below this one, so the shared
            // snapshot is a request older than the row it needs to render.
            LaunchedEffect(route.authorizationId) { viewModel.refresh() }

            AuthorizationConfirmedScreen(
                state = state,
                authorizationId = route.authorizationId,
                justAuthorized = route.justAuthorized,
                onBack = { nav.pop() },
                onOpenActivity = { nav.push(AppRoute.WalletActivity()) },
                // `replace`, so Back from the trip returns to the wallet rather than walking
                // through a confirmation the traveler has already read.
                onOpenTrip = { tripId -> nav.replace(AppRoute.TripDetail(tripId)) },
                onRemove = { id -> nav.push(AppRoute.WalletRemoveAuthorization(id)) },
                onRetry = viewModel::load,
            )
        }

        is AppRoute.WalletRemoveAuthorization -> {
            val viewModel = viewModel(key = "remove-${route.authorizationId}") {
                RemoveAuthorizationViewModel(wallet, route.authorizationId)
            }
            val state by viewModel.state.collectAsState()
            val sending by viewModel.sending.collectAsState()
            val error by viewModel.error.collectAsState()
            val removed by viewModel.removed.collectAsState()

            // Back to the wallet, not to the confirmation screen that may be beneath this —
            // that screen describes an authorization which no longer exists.
            LaunchedEffect(removed) {
                if (removed) nav.resetTo(AppRoute.Wallet)
            }

            RemoveAuthorizationScreen(
                state = state,
                authorizationId = route.authorizationId,
                sending = sending,
                error = error,
                onBack = { nav.pop() },
                onConfirm = viewModel::confirm,
                onRetry = viewModel::load,
            )
        }

        is AppRoute.WalletActivity -> {
            // Keyed on the filter, so switching cards builds a view model that asks the
            // function for that card rather than filtering a stale list in memory.
            val viewModel = viewModel(key = "activity-${route.cardId ?: "all"}") {
                WalletViewModel(wallet, cardFilter = route.cardId)
            }
            val state by viewModel.state.collectAsState()
            LaunchedEffect(Unit) { viewModel.refresh() }

            CardActivityScreen(
                state = state,
                cardFilter = route.cardId,
                onBack = { nav.pop() },
                onSelectCard = { id -> nav.replace(AppRoute.WalletActivity(id)) },
                onOpenEvent = { id -> nav.push(AppRoute.WalletUseDetail(id)) },
                onRetry = viewModel::load,
            )
        }

        is AppRoute.WalletUseDetail -> {
            val viewModel = viewModel(key = "wallet") { WalletViewModel(wallet) }
            val state by viewModel.state.collectAsState()
            LaunchedEffect(Unit) { viewModel.refresh() }

            CardUseDetailScreen(
                state = state,
                eventId = route.eventId,
                onBack = { nav.pop() },
                // §2.6.3, which is built — the one fully live action on that screen.
                onAskGyasi = { nav.push(AppRoute.NewConversation) },
                onRetry = viewModel::load,
            )
        }

        // 2.4.1, and the fallback. Every §2.4 route is listed above; anything else App.kt
        // sends here lands on the wallet rather than throwing.
        else -> {
            val viewModel = viewModel(key = "wallet") { WalletViewModel(wallet) }
            val state by viewModel.state.collectAsState()

            // Re-read on entry. A create on 2.4.3 and a revoke on 2.4.7 both happen above
            // this screen and neither would otherwise reach it — the same gap §2.6's inbox
            // had, and the web twin covers with revalidatePath.
            LaunchedEffect(Unit) { viewModel.refresh() }

            WalletScreen(
                state = state,
                onBack = { nav.pop() },
                onOpenActivity = { cardId -> nav.push(AppRoute.WalletActivity(cardId)) },
                onRemoveAuthorization = { id -> nav.push(AppRoute.WalletRemoveAuthorization(id)) },
                onRetry = viewModel::load,
            )
        }
    }
}
