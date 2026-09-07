package com.storytail.adventures.ui.screens.trip

import androidx.compose.runtime.Composable
import com.storytail.adventures.ui.nav.AppRoute
import com.storytail.adventures.ui.nav.Navigator
import com.storytail.adventures.ui.screens.dashboard.DashboardScreen

/**
 * The §2.2 section host.
 *
 * App.kt hands over a route and gets a screen, the same contract `PublicRoute` and
 * `OnboardingRoute` have. The reason it is a host rather than nine more branches in App.kt
 * is that the tab semantics and the trip-stack wiring belong together: every screen in this
 * section either IS a tab root or was pushed from one, and App.kt should not have to know
 * which.
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
    onSignOut: () -> Unit,
) {
    val onSelectTab: (String) -> Unit = { id ->
        when (id) {
            "trips" -> nav.selectTab(AppRoute.Dashboard)
            else -> Unit
        }
    }

    // 2.2.2 through 2.2.11 land in the stages after this one. They are declared in
    // AppRoute already so the tab semantics and the back stack could be built and tested
    // against the real route set rather than a placeholder one — every route below
    // currently resolves to the dashboard.
    when (route) {
        else -> DashboardScreen(
            onSelectTab = onSelectTab,
            onOpenTrip = { tripId -> nav.push(AppRoute.TripDetail(tripId)) },
            onSeeAllTrips = { nav.push(AppRoute.AllTrips) },
            onMessageAgent = { tripId -> nav.push(AppRoute.TripThread(tripId)) },
            onSignOut = onSignOut,
        )
    }
}
