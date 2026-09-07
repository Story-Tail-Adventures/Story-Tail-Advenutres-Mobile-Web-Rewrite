package com.storytail.adventures.ui.screens.trip

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.collectAsState
import androidx.lifecycle.viewmodel.compose.viewModel
import com.storytail.adventures.api.TripRepository
import com.storytail.adventures.ui.nav.AppRoute
import com.storytail.adventures.ui.nav.Navigator
import com.storytail.adventures.ui.screens.dashboard.DashboardScreen
import com.storytail.adventures.ui.screens.dashboard.DashboardViewModel
import kotlinx.datetime.LocalDate

/**
 * The §2.2 section host.
 *
 * App.kt hands over a route and gets a screen, the same contract `PublicRoute` and
 * `OnboardingRoute` have. The reason it is a host rather than nine more branches in App.kt
 * is that the tab semantics and the trip-stack wiring belong together: every screen in this
 * section either IS a tab root or was pushed from one, and App.kt should not have to know
 * which.
 *
 * [onSignOut] is threaded through but not yet rendered: the real 2.2.1 has no sign-out
 * control — that belongs to §2.5.1 Account, which is the tab it lives under. It stays on
 * this signature because App.kt owns the session and the Account tab will need it from
 * here, and dropping it would mean re-plumbing it in a stage's time.
 *
 * [onSelectTab] maps a tab id from `CLIENT_BAR_DESTINATIONS` to a route. Only `trips` is
 * built; the other three are dimmed and unpressable in the bar, so they cannot arrive here
 * — but the `else` branch is a no-op rather than a throw, because a bar that crashes the
 * app when a future tab is half-wired is worse than one that does nothing.
 */
@Composable
fun TripRoute(
    route: AppRoute,
    nav: Navigator,
    trips: TripRepository,
    today: LocalDate,
    onSignOut: () -> Unit,
) {
    val onSelectTab: (String) -> Unit = { id ->
        when (id) {
            "trips" -> nav.selectTab(AppRoute.Dashboard)
            else -> Unit
        }
    }

    when (route) {
        is AppRoute.AllTrips -> {
            val viewModel = viewModel { AllTripsViewModel(trips, today) }
            val state by viewModel.state.collectAsState()
            val filter by viewModel.filter.collectAsState()
            AllTripsScreen(
                state = state,
                filter = filter,
                onSelectFilter = viewModel::selectFilter,
                onOpenTrip = { tripId -> nav.push(AppRoute.TripDetail(tripId)) },
                onSelectTab = onSelectTab,
                onRetry = viewModel::load,
            )
        }

        is AppRoute.TripDetail -> {
            // Keyed on the trip id, so opening a second trip builds a second view model
            // rather than showing the first one's data under the new title.
            val viewModel = viewModel(key = "trip-${route.tripId}") {
                TripDetailViewModel(trips, route.tripId, today)
            }
            val state by viewModel.state.collectAsState()
            TripDetailScreen(
                state = state,
                onBack = { nav.pop() },
                onOpenItinerary = { tripId -> nav.push(AppRoute.Itinerary(tripId)) },
                onOpenDocuments = { tripId -> nav.push(AppRoute.TripDocuments(tripId)) },
                onOpenThread = { tripId -> nav.push(AppRoute.TripThread(tripId)) },
                onRetry = viewModel::load,
            )
        }

        is AppRoute.Itinerary -> {
            val viewModel = viewModel(key = "itin-${route.tripId}") {
                ItineraryViewModel(trips, route.tripId, today)
            }
            val state by viewModel.state.collectAsState()
            val selectedDay by viewModel.selectedDay.collectAsState()
            ItineraryScreen(
                state = state,
                selectedDay = selectedDay,
                onSelectDay = viewModel::selectDay,
                onOpenDay = { day -> nav.push(AppRoute.ItineraryDay(route.tripId, day)) },
                onBack = { nav.pop() },
                onAskGyasi = { nav.push(AppRoute.TripThread(route.tripId)) },
                onRetry = viewModel::load,
            )
        }

        is AppRoute.ItineraryDay -> {
            // Shares the itinerary view model with 2.2.4 by key, so opening a day off the
            // viewer does not re-fetch the whole itinerary it already has.
            val viewModel = viewModel(key = "itin-${route.tripId}") {
                ItineraryViewModel(trips, route.tripId, today, initialDay = route.dayNumber)
            }
            val state by viewModel.state.collectAsState()
            DayDetailScreen(
                state = state,
                dayNumber = route.dayNumber,
                onBack = { nav.pop() },
                onOpenDay = { day -> nav.replace(AppRoute.ItineraryDay(route.tripId, day)) },
            )
        }

        // 2.2.6 through 2.2.11 land in the stages after this one.
        else -> {
            val viewModel = viewModel { DashboardViewModel(trips, today) }
            val state by viewModel.state.collectAsState()
            DashboardScreen(
                state = state,
                onSelectTab = onSelectTab,
                onOpenTrip = { tripId -> nav.push(AppRoute.TripDetail(tripId)) },
                onOpenItinerary = { tripId -> nav.push(AppRoute.Itinerary(tripId)) },
                onSeeAllTrips = { nav.push(AppRoute.AllTrips) },
                onMessageAgent = { tripId -> nav.push(AppRoute.TripThread(tripId)) },
                onRetry = viewModel::load,
            )
        }
    }
}
