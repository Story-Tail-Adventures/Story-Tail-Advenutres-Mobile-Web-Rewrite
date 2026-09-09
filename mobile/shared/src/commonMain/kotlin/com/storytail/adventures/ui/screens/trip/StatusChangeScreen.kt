package com.storytail.adventures.ui.screens.trip

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.storytail.adventures.api.StatusChangeSnapshot
import com.storytail.adventures.domain.trip.Loadable
import com.storytail.adventures.domain.trip.StatusChangeMessages
import com.storytail.adventures.domain.trip.TripStatus
import com.storytail.adventures.domain.trip.paymentLine
import com.storytail.adventures.domain.trip.proposalLine
import com.storytail.adventures.domain.trip.statusChangeNarrative
import com.storytail.adventures.domain.trip.statusChangeNextSteps
import com.storytail.adventures.ui.components.StoryTailGlyph
import com.storytail.adventures.ui.components.StoryTailMark
import com.storytail.adventures.ui.components.client.ClientEmptyState
import com.storytail.adventures.ui.components.client.ClientErrorState
import com.storytail.adventures.ui.components.client.ClientScaffold
import com.storytail.adventures.ui.components.client.formatMoney
import com.storytail.adventures.ui.components.client.formatTripDates
import com.storytail.adventures.ui.theme.PillShape
import com.storytail.adventures.ui.theme.StoryTailRadius
import kotlinx.datetime.Instant
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime
import kotlinx.datetime.LocalDate

/**
 * Screen 2.2.9 Trip Status Change Notification View — docs/Screen-Inventory.md §2.2.9, and
 * design/source-prototype/screens/client-trip-mobile.jsx (M229_StatusChange). P1.
 *
 * A ROUTE, NOT A SHEET, and that is the one place this departs from both artboards. They draw
 * it as a bottom sheet over a dimmed dashboard, which is right when a status changes while
 * somebody is already in the app. But §2.2.9's entry points are "push or email notification",
 * so the first thing that has to work is arriving COLD — from a notification tap, on a device
 * where the app was not running. A sheet has nothing to arrive at. So it is a pushed screen,
 * and the sheet presentation belongs to §2.6's notification centre.
 *
 * WHAT IT CAN HONESTLY SAY is the real design work — see the note in TripStatusChange.kt.
 * Nothing records a status DIFF, so the narrative comes from the status it landed on and every
 * supporting fact is a real row rendered only when it exists.
 */
@Composable
fun StatusChangeScreen(
    state: Loadable<StatusChangeSnapshot>,
    onBack: () -> Unit,
    onOpenTrip: () -> Unit,
    onOpenItinerary: () -> Unit,
    onOpenMemories: () -> Unit,
    onRetry: () -> Unit,
    modifier: Modifier = Modifier,
) {
    ClientScaffold(modifier = modifier) {
        when (state) {
            is Loadable.Loading -> Box(
                Modifier.fillMaxWidth().padding(40.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    "…",
                    style = MaterialTheme.typography.headlineSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            is Loadable.Failed -> Column(Modifier.padding(horizontal = 16.dp)) {
                ClientErrorState(
                    title = "We could not open this update",
                    body = "The connection dropped on the way. Try again in a moment.",
                    retryLabel = "Try again",
                    onRetry = onRetry,
                )
            }

            // Listed rather than folded into an `else` — see the note in DocumentsScreen.
            is Loadable.Unauthorized, is Loadable.Empty -> Column(Modifier.padding(16.dp)) {
                ClientEmptyState(
                    title = "We could not find that trip",
                    body = "It may have been archived, or the link may belong to someone else.",
                    mark = StoryTailMark.USER,
                )
            }

            is Loadable.Ready -> Body(
                snapshot = state.value,
                onBack = onBack,
                onOpenTrip = onOpenTrip,
                onOpenItinerary = onOpenItinerary,
                onOpenMemories = onOpenMemories,
            )
        }
    }
}

@Composable
private fun Body(
    snapshot: StatusChangeSnapshot,
    onBack: () -> Unit,
    onOpenTrip: () -> Unit,
    onOpenItinerary: () -> Unit,
    onOpenMemories: () -> Unit,
) {
    val scheme = MaterialTheme.colorScheme
    val trip = snapshot.trip
    val narrative = statusChangeNarrative(trip.status, trip.title)
    val steps = statusChangeNextSteps(trip.status)

    // Only facts with a row behind them. An empty list hides the card rather than printing a
    // heading over nothing.
    val facts = buildList {
        snapshot.proposal?.let { add(proposalLine(it.versionNumber, it.coverTitle)) }
        if (snapshot.itineraryReady) add(StatusChangeMessages.ITINERARY_LINE)
        snapshot.nextPayment?.let {
            add(
                paymentLine(
                    it.label,
                    formatMoney(it.amountCents, it.currency),
                    it.dueDate?.let { due -> formatTripDates(due, null) },
                ),
            )
        }
    }

    Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp)) {
        Spacer(Modifier.height(12.dp))
        Row(
            Modifier.clickable(onClick = onBack),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            StoryTailGlyph(StoryTailMark.ARROW_LEFT, 14.dp, scheme.onSurfaceVariant)
            Spacer(Modifier.width(6.dp))
            Text(
                "Back to trip",
                style = MaterialTheme.typography.bodySmall,
                color = scheme.onSurfaceVariant,
            )
        }

        Spacer(Modifier.height(16.dp))
        Box(
            Modifier.size(54.dp).background(scheme.secondaryContainer, PillShape),
            contentAlignment = Alignment.Center,
        ) {
            StoryTailGlyph(StoryTailMark.SUN, 26.dp, scheme.onSecondaryContainer)
        }

        Spacer(Modifier.height(12.dp))
        Text(
            // An ABSOLUTE date, not "2 min ago". The artboard says "STATUS UPDATED · 2 MIN
            // AGO", which is true when the notification fires and a confident lie by the time
            // somebody opens the email next morning. A date cannot go stale.
            "${narrative.overline} · ${
                snapshot.changedAt
                    // The DEVICE's calendar date, not the UTC one. `take(10)` on the
                    // timestamptz string reads the UTC date, which is a day ahead of a
                    // traveler west of Greenwich all evening — the same bug the thread's
                    // separators had, missed here because this string is assembled rather
                    // than going through TripThread.kt's helpers.
                    ?.let { localDateOf(it) }
                    ?.let { formatTripDates(it, null) }
                    ?: StatusChangeMessages.CHANGED_UNKNOWN
            }".uppercase(),
            style = MaterialTheme.typography.labelSmall,
            color = scheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(4.dp))
        Text(narrative.heading, style = MaterialTheme.typography.titleLarge, color = scheme.onSurface)
        Spacer(Modifier.height(6.dp))
        Text(narrative.body, style = MaterialTheme.typography.bodyMedium, color = scheme.onSurfaceVariant)

        if (facts.isNotEmpty()) {
            Spacer(Modifier.height(14.dp))
            Column(
                Modifier
                    .fillMaxWidth()
                    .background(scheme.surfaceContainer, RoundedCornerShape(StoryTailRadius.md))
                    .padding(14.dp),
            ) {
                Text(
                    StatusChangeMessages.WHAT_CHANGED,
                    style = MaterialTheme.typography.titleSmall,
                    color = scheme.onSurface,
                )
                Spacer(Modifier.height(6.dp))
                for (fact in facts) {
                    Text(
                        fact,
                        style = MaterialTheme.typography.bodySmall,
                        color = scheme.onSurfaceVariant,
                    )
                }
            }
        }

        Spacer(Modifier.height(10.dp))
        Column(
            Modifier
                .fillMaxWidth()
                .background(scheme.surfaceContainer, RoundedCornerShape(StoryTailRadius.md))
                .padding(14.dp),
        ) {
            Text(
                StatusChangeMessages.WHATS_NEXT,
                style = MaterialTheme.typography.titleSmall,
                color = scheme.onSurface,
            )
            Spacer(Modifier.height(6.dp))
            steps.forEachIndexed { index, step ->
                Text(
                    "${index + 1}. $step",
                    style = MaterialTheme.typography.bodySmall,
                    color = scheme.onSurfaceVariant,
                )
                if (index < steps.lastIndex) Spacer(Modifier.height(3.dp))
            }
        }

        Spacer(Modifier.height(16.dp))
        val primary = primaryAction(trip.status, snapshot.itineraryReady, snapshot.proposal != null)
        Button(
            onClick = when (primary.second) {
                PrimaryTarget.MEMORIES -> onOpenMemories
                PrimaryTarget.ITINERARY -> onOpenItinerary
                PrimaryTarget.TRIP -> onOpenTrip
            },
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text(primary.first)
        }

        // §2.4 is Phase 1 and next, so the payment CTA the artboard shows renders disabled
        // rather than being dropped — the plan's "build them visually, disabled" decision.
        if (snapshot.nextPayment != null) {
            Spacer(Modifier.height(8.dp))
            OutlinedButton(onClick = {}, enabled = false, modifier = Modifier.fillMaxWidth()) {
                Text(StatusChangeMessages.AUTHORIZE_CARD)
            }
            Spacer(Modifier.height(4.dp))
            Text(
                StatusChangeMessages.AUTHORIZE_DEFERRED,
                style = MaterialTheme.typography.bodySmall,
                color = scheme.onSurfaceVariant,
            )
        }

        Spacer(Modifier.height(24.dp))
    }
}

private enum class PrimaryTarget { MEMORIES, ITINERARY, TRIP }

/**
 * The single CTA §2.2.9 asks for: "CTA to view the relevant section".
 *
 * Relevant means the thing that just changed, and it falls back to the overview rather than
 * to a screen that would be empty — a proposal CTA with no sent proposal behind it is the
 * exact kind of dead end this screen exists to resolve. Mirrors `primaryAction` in the web
 * twin.
 */
private fun primaryAction(
    status: TripStatus,
    itineraryReady: Boolean,
    hasProposal: Boolean,
): Pair<String, PrimaryTarget> = when {
    // §2.2.12 Proposal Viewer is not built, so this lands on the overview, which already
    // shows the proposal's own facts.
    status == TripStatus.PROPOSAL && hasProposal ->
        StatusChangeMessages.VIEW_PROPOSAL to PrimaryTarget.TRIP

    status == TripStatus.COMPLETED ->
        StatusChangeMessages.VIEW_MEMORIES to PrimaryTarget.MEMORIES

    status == TripStatus.CANCELLED ->
        StatusChangeMessages.VIEW_SUMMARY to PrimaryTarget.TRIP

    itineraryReady -> StatusChangeMessages.VIEW_ITINERARY to PrimaryTarget.ITINERARY

    else -> StatusChangeMessages.VIEW_TRIP to PrimaryTarget.TRIP
}

/**
 * A timestamptz string as the date it falls on in the DEVICE's zone.
 *
 * The counterpart of `localToday()` in TripThread.kt, and here for the same reason: an
 * instant rendered against a UTC calendar date is wrong for most of the world for part of
 * every day.
 */
private fun localDateOf(iso: String): LocalDate? =
    runCatching {
        Instant.parse(iso).toLocalDateTime(TimeZone.currentSystemDefault()).date
    }.getOrNull()
