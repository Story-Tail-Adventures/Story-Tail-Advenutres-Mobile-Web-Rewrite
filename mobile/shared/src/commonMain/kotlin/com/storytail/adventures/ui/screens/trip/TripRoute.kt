package com.storytail.adventures.ui.screens.trip

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.collectAsState
import androidx.lifecycle.viewmodel.compose.viewModel
import com.storytail.adventures.api.TripRepository
import com.storytail.adventures.domain.trip.Loadable
import com.storytail.adventures.domain.trip.TripStatus
import com.storytail.adventures.ui.nav.AppRoute
import com.storytail.adventures.ui.nav.Navigator
import com.storytail.adventures.domain.trip.localToday
import com.storytail.adventures.ui.nav.rememberPlatformLinks
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
    val links = rememberPlatformLinks()

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

            // A COMPLETED trip belongs on 2.2.11, not here. The web twin does this as a
            // server-side redirect in `/trips/[tripId]/page.tsx`; native has to wait for the
            // read, so it is a LaunchedEffect on the loaded status instead.
            //
            // Caught by eye on the emulator: without it the same tap gave a memory view on
            // web and the ordinary overview on a phone — tiles and a payment timeline for a
            // trip that finished two years ago, which is the screen 2.2.11 exists to replace.
            //
            // `replace`, so BACK from the memory view returns to the trips list rather than
            // to a detail screen the traveler never chose to look at.
            val completed = (state as? Loadable.Ready)?.value?.trip?.status == TripStatus.COMPLETED
            LaunchedEffect(completed) {
                if (completed) nav.replace(AppRoute.PastTrip(route.tripId))
            }

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

        is AppRoute.TripDocuments -> {
            val viewModel = viewModel(key = "docs-${route.tripId}") {
                DocumentsViewModel(trips, route.tripId)
            }
            val state by viewModel.state.collectAsState()
            val signing by viewModel.signing.collectAsState()
            val openError by viewModel.openError.collectAsState()
            DocumentsScreen(
                state = state,
                signing = signing,
                openError = openError,
                onBack = { nav.pop() },
                // The signature is minted on tap and handed straight to the platform
                // browser. `links` is captured from the composition here because
                // `rememberPlatformLinks` needs an Android Context and a main-thread iOS
                // call — see PlatformLinks.kt.
                onOpen = { document -> viewModel.open(document.id, links::openUrl) },
                onRetry = viewModel::load,
            )
        }

        is AppRoute.TripThread -> {
            val viewModel = viewModel(key = "thread-${route.tripId}") {
                ThreadViewModel(trips, route.tripId)
            }
            val state by viewModel.state.collectAsState()
            val draft by viewModel.draft.collectAsState()
            val sending by viewModel.sending.collectAsState()
            val sendError by viewModel.sendError.collectAsState()
            ThreadScreen(
                state = state,
                draft = draft,
                sending = sending,
                sendError = sendError,
                // `localToday()`, NOT the section's `today`, which App.kt derives in UTC.
                // The thread's date separators are grouped against timestamps rendered in
                // the device zone, and mixing the two puts every separator a day out after
                // 8pm Eastern. See localToday's own note.
                today = localToday(),
                onDraftChange = viewModel::changeDraft,
                onSend = viewModel::send,
                onBack = { nav.pop() },
                // `replace`, not `push`: the thread is usually reached FROM the trip detail,
                // so pushing it would put a second copy of that screen on the stack and the
                // back button would walk through the thread again to get out.
                onOpenTrip = { nav.replace(AppRoute.TripDetail(route.tripId)) },
                onRetry = viewModel::load,
            )
        }

        is AppRoute.PastTrip -> {
            val viewModel = viewModel(key = "past-${route.tripId}") {
                PastTripViewModel(trips, route.tripId, today)
            }
            val state by viewModel.state.collectAsState()
            val draft by viewModel.draft.collectAsState()
            val saving by viewModel.saving.collectAsState()
            val notice by viewModel.notice.collectAsState()
            MemoriesScreen(
                state = state,
                draft = draft,
                saving = saving,
                notice = notice,
                onDraftChange = viewModel::changeDraft,
                onSave = viewModel::save,
                onBack = { nav.pop() },
                onOpenDocuments = { nav.push(AppRoute.TripDocuments(route.tripId)) },
                onOpenItinerary = { nav.push(AppRoute.Itinerary(route.tripId)) },
                onMessageGyasi = { nav.push(AppRoute.TripThread(route.tripId)) },
                onRetry = viewModel::load,
            )
        }

        is AppRoute.TripUpdate -> {
            val viewModel = viewModel(key = "update-${route.tripId}") {
                StatusChangeViewModel(trips, route.tripId, today)
            }
            val state by viewModel.state.collectAsState()
            StatusChangeScreen(
                state = state,
                onBack = { nav.pop() },
                // `replace`, not `push`: this screen is a notification landing, so the trip
                // it points at should be where BACK goes rather than a second thing on the
                // stack behind the update the traveler has already read.
                onOpenTrip = { nav.replace(AppRoute.TripDetail(route.tripId)) },
                onOpenItinerary = { nav.replace(AppRoute.Itinerary(route.tripId)) },
                onOpenMemories = { nav.replace(AppRoute.PastTrip(route.tripId)) },
                onRetry = viewModel::load,
            )
        }

        // Every §2.2 route is listed above. This branch is the non-§2.2 routes App.kt does
        // not send here — it renders the dashboard rather than throwing, because a bar that
        // crashes the app on an unexpected route is worse than one that lands home.
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
