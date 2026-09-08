package com.storytail.adventures.ui.screens.trip

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.storytail.adventures.api.TripFilter
import com.storytail.adventures.api.TripsList
import com.storytail.adventures.domain.trip.Loadable
import com.storytail.adventures.ui.components.StoryTailMark
import com.storytail.adventures.ui.components.client.ClientEmptyState
import com.storytail.adventures.ui.components.client.ClientErrorState
import com.storytail.adventures.ui.components.client.ClientScaffold
import com.storytail.adventures.ui.components.client.SkeletonBlock
import com.storytail.adventures.ui.components.client.TripCard
import com.storytail.adventures.ui.components.client.formatMoney

/**
 * Screen 2.2.2 All Trips List — see docs/Screen-Inventory.md §2.2.2 and §4.4 (Pattern B:
 * "vertical list of cards" on mobile) and design/source-prototype/screens/client-trip.jsx
 * (C222_AllTrips) + client-trip-mobile.jsx (M222_AllTrips). P1.
 *
 * The desktop artboard's `200px | 1fr | auto` row with a bordered TRIP VALUE column cannot
 * survive 400pt, so the card goes image-top and the value becomes a quiet line under the
 * dates — which is what M222 draws.
 *
 * Search and sort are ABSENT rather than inert. Pattern B's mobile guidance collapses them
 * behind icon buttons, but BRD §4.3 sizes an account at a handful of trips: a search field
 * over four rows is furniture, and nobody has asked for a second sort order. The filter
 * chips carry the whole job.
 */
@Composable
fun AllTripsScreen(
    state: Loadable<TripsList>,
    filter: TripFilter,
    onSelectFilter: (TripFilter) -> Unit,
    onOpenTrip: (tripId: String) -> Unit,
    onSelectTab: (String) -> Unit,
    onRetry: () -> Unit,
    modifier: Modifier = Modifier,
) {
    ClientScaffold(
        modifier = modifier,
        activeTab = "trips",
        onSelectTab = onSelectTab,
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 14.dp),
    ) {
        Text(
            AllTripsMessages.TITLE,
            style = MaterialTheme.typography.headlineSmall,
            color = MaterialTheme.colorScheme.onSurface,
        )
        Spacer(Modifier.height(4.dp))
        Text(
            AllTripsMessages.SUBTITLE,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(12.dp))

        val counts = (state as? Loadable.Ready)?.value?.counts ?: emptyMap()
        Row(
            Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            for (f in TripFilter.entries) {
                FilterChip(
                    selected = f == filter,
                    onClick = { onSelectFilter(f) },
                    label = { Text("${labelFor(f)} · ${counts[f] ?: 0}") },
                )
            }
        }
        Spacer(Modifier.height(14.dp))

        when (state) {
            is Loadable.Loading -> Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                repeat(3) { SkeletonBlock(Modifier.fillMaxWidth().height(200.dp)) }
            }

            is Loadable.Failed -> ClientErrorState(
                title = AllTripsMessages.ERROR_TITLE,
                body = AllTripsMessages.ERROR_BODY,
                retryLabel = AllTripsMessages.RETRY,
                onRetry = onRetry,
            )

            is Loadable.Unauthorized -> ClientEmptyState(
                title = AllTripsMessages.UNAUTHORIZED_TITLE,
                body = AllTripsMessages.UNAUTHORIZED_BODY,
                mark = StoryTailMark.USER,
            )

            is Loadable.Empty -> ClientEmptyState(state.title, state.body)

            is Loadable.Ready -> {
                val trips = state.value.trips
                if (trips.isEmpty()) {
                    ClientEmptyState(
                        title = if (filter == TripFilter.ALL) {
                            AllTripsMessages.EMPTY_ALL_TITLE
                        } else {
                            AllTripsMessages.EMPTY_FILTERED_TITLE
                        },
                        body = if (filter == TripFilter.ALL) {
                            AllTripsMessages.EMPTY_ALL_BODY
                        } else {
                            AllTripsMessages.EMPTY_FILTERED_BODY
                        },
                    )
                } else {
                    Column(
                        Modifier.padding(bottom = 8.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        for (trip in trips) {
                            TripCard(
                                trip = trip,
                                onClick = { onOpenTrip(trip.id) },
                                valueLine = formatMoney(trip.totalValueCents, trip.currency) +
                                    " " + AllTripsMessages.ALL_IN,
                            )
                        }
                    }
                }
            }
        }
    }
}

private fun labelFor(filter: TripFilter): String = when (filter) {
    TripFilter.ALL -> AllTripsMessages.TAB_ALL
    TripFilter.UPCOMING -> AllTripsMessages.TAB_UPCOMING
    TripFilter.PLANNING -> AllTripsMessages.TAB_PLANNING
    TripFilter.PAST -> AllTripsMessages.TAB_PAST
    TripFilter.CANCELLED -> AllTripsMessages.TAB_CANCELLED
}

/** Copy for 2.2.2, mirroring web/app/(client)/trips/content.ts. */
object AllTripsMessages {
    const val TITLE = "My trips"
    const val SUBTITLE = "Everything Story-Tail has built for you — past, present, and in motion."
    const val TAB_ALL = "All"
    const val TAB_UPCOMING = "Upcoming"
    const val TAB_PLANNING = "In planning"
    const val TAB_PAST = "Past"
    const val TAB_CANCELLED = "Cancelled"
    const val ALL_IN = "all-in"
    const val EMPTY_ALL_TITLE = "No trips yet"
    const val EMPTY_ALL_BODY =
        "Tell Gyasi roughly when and where, and the first one will show up here as soon as he starts on it."
    const val EMPTY_FILTERED_TITLE = "Nothing here"
    const val EMPTY_FILTERED_BODY =
        "Try another tab — your other trips are still where you left them."
    const val ERROR_TITLE = "We couldn’t load your trips"
    const val ERROR_BODY = "Something went wrong on our side, not yours. Try again in a moment."
    const val RETRY = "Try again"
    const val UNAUTHORIZED_TITLE = "You don’t have access to this view"
    const val UNAUTHORIZED_BODY = "This is the traveler’s side of Story-Tail."
}
