package com.storytail.adventures.ui.screens.trip

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.storytail.adventures.api.PaymentMilestoneView
import com.storytail.adventures.api.TripDetailSnapshot
import com.storytail.adventures.domain.trip.Loadable
import com.storytail.adventures.domain.trip.TripStatus
import com.storytail.adventures.ui.components.StoryTailGlyph
import com.storytail.adventures.ui.components.StoryTailMark
import com.storytail.adventures.ui.components.client.ClientEmptyState
import com.storytail.adventures.ui.components.client.ClientErrorState
import com.storytail.adventures.ui.components.client.ClientScaffold
import com.storytail.adventures.ui.components.client.KeyGrid
import com.storytail.adventures.ui.components.client.SkeletonBlock
import com.storytail.adventures.ui.components.client.StatusChipPill
import com.storytail.adventures.ui.components.client.TonalCard
import com.storytail.adventures.ui.components.client.TripHeroPhoto
import com.storytail.adventures.ui.components.client.formatDay
import com.storytail.adventures.ui.components.client.formatMoney
import com.storytail.adventures.ui.components.client.formatTripDates
import com.storytail.adventures.ui.components.client.humaniseTripType
import com.storytail.adventures.ui.components.client.nightsBetween
import com.storytail.adventures.ui.theme.LocalStoryTailBrandTypography
import com.storytail.adventures.ui.theme.PillShape
import com.storytail.adventures.ui.theme.StoryTailRadius

/**
 * Screen 2.2.3 Trip Detail / Overview — see docs/Screen-Inventory.md §2.2.3 and §4.4
 * (Pattern C: full-screen detail, back to the list, sub-sections stacked) and
 * design/source-prototype/screens/client-trip.jsx (C223_TripDetail) + client-trip-mobile.jsx
 * (M223_TripDetail). P1.
 *
 * Also Screen 2.2.10 Trip Cancellation View, which §4.4 calls a "Pattern C variant" — the
 * same screen with a cancellation summary in place of the tiles.
 *
 * The desktop right rail (advisor card, payment timeline) becomes the last two cards, in the
 * same order, because both are things to act on. The four quick tiles go 2×2.
 *
 * "Card on file · VISA •••• 4242" is dropped from At a glance: that lives on `payment_card`
 * and belongs to §2.4, where a client can actually manage it.
 */
@Composable
fun TripDetailScreen(
    state: Loadable<TripDetailSnapshot>,
    onBack: () -> Unit,
    onOpenItinerary: (tripId: String) -> Unit,
    onOpenDocuments: (tripId: String) -> Unit,
    onOpenThread: (tripId: String) -> Unit,
    onRetry: () -> Unit,
    modifier: Modifier = Modifier,
) {
    ClientScaffold(modifier = modifier) {
        when (state) {
            is Loadable.Loading -> Column(
                Modifier.padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                SkeletonBlock(Modifier.fillMaxWidth().height(220.dp))
                SkeletonBlock(Modifier.fillMaxWidth().height(96.dp))
                SkeletonBlock(Modifier.fillMaxWidth().height(140.dp))
            }

            is Loadable.Failed -> Box(Modifier.padding(16.dp)) {
                ClientErrorState(
                    title = TripDetailMessages.NOT_FOUND_TITLE,
                    body = TripDetailMessages.NOT_FOUND_BODY,
                    retryLabel = TripDetailMessages.RETRY,
                    onRetry = onRetry,
                )
            }

            is Loadable.Unauthorized, is Loadable.Empty -> Box(Modifier.padding(16.dp)) {
                ClientEmptyState(
                    title = TripDetailMessages.NOT_FOUND_TITLE,
                    body = TripDetailMessages.NOT_FOUND_BODY,
                    mark = StoryTailMark.USER,
                )
            }

            is Loadable.Ready -> Body(
                detail = state.value,
                onBack = onBack,
                onOpenItinerary = onOpenItinerary,
                onOpenDocuments = onOpenDocuments,
                onOpenThread = onOpenThread,
            )
        }
    }
}

@Composable
private fun Body(
    detail: TripDetailSnapshot,
    onBack: () -> Unit,
    onOpenItinerary: (String) -> Unit,
    onOpenDocuments: (String) -> Unit,
    onOpenThread: (String) -> Unit,
) {
    val scheme = MaterialTheme.colorScheme
    val trip = detail.trip
    val cancelled = trip.status == TripStatus.CANCELLED

    TripHeroPhoto(trip = trip, height = 240, grayscale = cancelled) {
        Column {
            // The back control sits over the photograph, so it carries its own scrim — the
            // registry is half bright sand and pale rock, where white at 85% disappears.
            Row(
                Modifier
                    .background(Color(0x8C0D2137), PillShape)
                    .clickable(onClick = onBack)
                    .padding(horizontal = 10.dp, vertical = 5.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                StoryTailGlyph(StoryTailMark.ARROW_LEFT, 13.dp, Color.White)
                Spacer(Modifier.width(6.dp))
                Text(
                    TripDetailMessages.BACK,
                    style = MaterialTheme.typography.bodySmall,
                    color = Color.White,
                )
            }
            Spacer(Modifier.height(10.dp))
            StatusChipPill(trip.chip, trip.statusLabel)
            Spacer(Modifier.height(8.dp))
            Text(trip.title, style = MaterialTheme.typography.titleLarge, color = Color.White)
            Text(
                listOfNotNull(
                    formatTripDates(trip.startDate, trip.endDate),
                    trip.destinations.firstOrNull(),
                    trip.daysUntil?.takeIf { !cancelled }?.let { "$it days to go" },
                ).joinToString(" · "),
                style = MaterialTheme.typography.bodySmall,
                color = Color.White.copy(alpha = 0.9f),
            )
        }
    }

    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        if (cancelled) {
            CancellationSummary(detail)
        } else {
            QuickTiles(
                detail = detail,
                onOpenItinerary = { onOpenItinerary(trip.id) },
                onOpenDocuments = { onOpenDocuments(trip.id) },
                onOpenThread = { onOpenThread(trip.id) },
            )
        }

        Glance(detail)

        if (!cancelled) {
            TonalCard(scheme.surfaceContainerLowest) {
                Text(
                    TripDetailMessages.NOTE_HEADING,
                    style = MaterialTheme.typography.titleSmall,
                    color = scheme.onSurface,
                )
                Spacer(Modifier.height(6.dp))
                Text(
                    detail.introNote ?: TripDetailMessages.NOTE_PENDING,
                    style = MaterialTheme.typography.bodyMedium,
                    color = scheme.onSurfaceVariant,
                )
            }
        }

        AdvisorCard(onMessage = { onOpenThread(trip.id) })

        if (cancelled) {
            TonalCard(scheme.secondaryContainer) {
                Text(
                    TripDetailMessages.CANCELLED_AGAIN_HEADING,
                    style = MaterialTheme.typography.titleSmall,
                    color = scheme.onSecondaryContainer,
                )
                Spacer(Modifier.height(5.dp))
                Text(
                    TripDetailMessages.CANCELLED_AGAIN_BODY,
                    style = MaterialTheme.typography.bodySmall,
                    color = scheme.onSecondaryContainer.copy(alpha = 0.9f),
                )
            }
        } else {
            PaymentTimeline(detail.milestones)
        }
    }
}

@Composable
private fun QuickTiles(
    detail: TripDetailSnapshot,
    onOpenItinerary: () -> Unit,
    onOpenDocuments: () -> Unit,
    onOpenThread: () -> Unit,
) {
    val next = detail.milestones.firstOrNull { it.status != "paid" && it.status != "waived" }
    val tiles = listOf(
        Tile(
            mark = StoryTailMark.PLANE,
            label = TripDetailMessages.TILE_ITINERARY,
            sub = if (detail.itineraryReady) {
                if (detail.dayCount > 0) "${detail.dayCount} days, day by day" else "Day-by-day"
            } else {
                TripDetailMessages.TILE_ITINERARY_PENDING
            },
            onClick = if (detail.itineraryReady) onOpenItinerary else null,
        ),
        Tile(
            mark = StoryTailMark.CARD,
            label = TripDetailMessages.TILE_PAYMENTS,
            sub = next?.let {
                formatMoney(it.amountCents, it.currency) +
                    (it.dueDate?.let { d -> " due ${formatDay(d)}" } ?: "")
            } ?: if (detail.milestones.isEmpty()) "Nothing scheduled" else "All paid",
            // §2.4, which lands next. Disabled rather than pointed at a screen that is not
            // there — the tile keeps its place so the 2×2 does not reflow later.
            onClick = null,
        ),
        Tile(
            mark = StoryTailMark.PASSPORT,
            label = TripDetailMessages.TILE_DOCUMENTS,
            sub = if (detail.documentCount == 1) "1 file" else "${detail.documentCount} files",
            onClick = onOpenDocuments,
        ),
        Tile(
            mark = StoryTailMark.MESSAGE,
            label = TripDetailMessages.TILE_MESSAGES,
            sub = when (detail.unreadCount) {
                0 -> "Open the thread"
                1 -> "1 unread"
                else -> "${detail.unreadCount} unread"
            },
            onClick = onOpenThread,
        ),
    )

    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        for (pair in tiles.chunked(2)) {
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                for (tile in pair) QuickTile(tile, Modifier.weight(1f))
                if (pair.size == 1) Spacer(Modifier.weight(1f))
            }
        }
    }
}

private data class Tile(
    val mark: StoryTailMark,
    val label: String,
    val sub: String,
    val onClick: (() -> Unit)?,
)

@Composable
private fun QuickTile(tile: Tile, modifier: Modifier) {
    val scheme = MaterialTheme.colorScheme
    Row(
        modifier
            .background(scheme.surfaceContainerLowest, RoundedCornerShape(StoryTailRadius.lg))
            .then(if (tile.onClick != null) Modifier.clickable(onClick = tile.onClick) else Modifier.alpha(0.6f))
            .padding(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            Modifier.size(36.dp).background(scheme.secondaryContainer, RoundedCornerShape(10.dp)),
            contentAlignment = Alignment.Center,
        ) {
            StoryTailGlyph(tile.mark, 16.dp, scheme.onSecondaryContainer)
        }
        Spacer(Modifier.width(10.dp))
        Column(Modifier.weight(1f)) {
            Text(tile.label, style = MaterialTheme.typography.titleSmall, color = scheme.onSurface)
            Text(
                tile.sub,
                style = MaterialTheme.typography.bodySmall,
                color = scheme.onSurfaceVariant,
                maxLines = 1,
            )
        }
    }
}

@Composable
private fun Glance(detail: TripDetailSnapshot) {
    val scheme = MaterialTheme.colorScheme
    val trip = detail.trip
    val nights = nightsBetween(trip.startDate, trip.endDate)
    val rows = buildList {
        add(Triple(TripDetailMessages.GLANCE_TRIP_TYPE, humaniseTripType(trip.tripType), false))
        nights?.let { add(Triple(TripDetailMessages.GLANCE_NIGHTS, "$it nights", false)) }
        add(
            Triple(
                TripDetailMessages.GLANCE_DESTINATION,
                trip.destinations.joinToString(", ").ifBlank { "To be decided" },
                true,
            ),
        )
        add(Triple(TripDetailMessages.GLANCE_TRAVELERS, "${trip.travelerCount} travelers", false))
        add(
            Triple(
                TripDetailMessages.GLANCE_TOTAL,
                formatMoney(trip.totalValueCents, trip.currency) + " all-in",
                false,
            ),
        )
        add(Triple(TripDetailMessages.GLANCE_COMPONENTS, "${detail.componentCount} booked", false))
    }

    TonalCard(scheme.surfaceContainerLowest) {
        Text(
            TripDetailMessages.GLANCE,
            style = MaterialTheme.typography.titleSmall,
            color = scheme.onSurface,
        )
        Spacer(Modifier.height(12.dp))
        KeyGrid(rows)
    }
}

@Composable
private fun CancellationSummary(detail: TripDetailSnapshot) {
    val scheme = MaterialTheme.colorScheme
    TonalCard(scheme.surfaceContainerLowest) {
        Text(
            TripDetailMessages.CANCELLED_HEADING,
            style = MaterialTheme.typography.titleSmall,
            color = scheme.onSurface,
        )
        Spacer(Modifier.height(12.dp))
        KeyGrid(
            buildList {
                add(
                    Triple(
                        TripDetailMessages.CANCELLED_REASON,
                        detail.cancellationReason ?: TripDetailMessages.CANCELLED_NO_REASON,
                        true,
                    ),
                )
                detail.refundStatus?.let {
                    add(Triple(TripDetailMessages.CANCELLED_REFUND, it, true))
                }
            },
        )
    }
}

@Composable
private fun AdvisorCard(onMessage: () -> Unit) {
    val scheme = MaterialTheme.colorScheme
    TonalCard(scheme.surfaceContainerLowest) {
        Text(
            TripDetailMessages.ADVISOR_LABEL,
            style = LocalStoryTailBrandTypography.current.labelXS,
            color = scheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(8.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(
                Modifier.size(40.dp).background(scheme.secondaryContainer, PillShape),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    "GS",
                    style = LocalStoryTailBrandTypography.current.labelXS,
                    color = scheme.onSecondaryContainer,
                )
            }
            Spacer(Modifier.width(10.dp))
            Column(Modifier.weight(1f)) {
                Text(
                    TripDetailMessages.ADVISOR_NAME,
                    style = MaterialTheme.typography.titleSmall,
                    color = scheme.onSurface,
                )
                Text(
                    TripDetailMessages.ADVISOR_REPLY_TIME,
                    style = MaterialTheme.typography.bodySmall,
                    color = scheme.onSurfaceVariant,
                )
            }
        }
        Spacer(Modifier.height(10.dp))
        Button(
            onClick = onMessage,
            modifier = Modifier.fillMaxWidth(),
            colors = ButtonDefaults.buttonColors(
                containerColor = scheme.secondaryContainer,
                contentColor = scheme.onSecondaryContainer,
            ),
        ) {
            Text(TripDetailMessages.MESSAGE)
        }
    }
}

/**
 * `payment_milestone`, which exists because of this card. A supplier payment schedule the
 * client is kept informed about — never an invoice, and with no action on it at all.
 */
@Composable
private fun PaymentTimeline(milestones: List<PaymentMilestoneView>) {
    val scheme = MaterialTheme.colorScheme
    TonalCard(scheme.surfaceContainerLowest) {
        Text(
            TripDetailMessages.PAYMENT_TIMELINE,
            style = LocalStoryTailBrandTypography.current.labelXS,
            color = scheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(8.dp))
        if (milestones.isEmpty()) {
            Text(
                TripDetailMessages.NO_SCHEDULE,
                style = MaterialTheme.typography.bodySmall,
                color = scheme.onSurfaceVariant,
            )
        } else {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                for (m in milestones) {
                    val paid = m.status == "paid"
                    val overdue = m.status == "overdue"
                    val waived = m.status == "waived"
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(
                            Modifier
                                .size(8.dp)
                                .background(
                                    when {
                                        paid -> scheme.tertiary
                                        overdue -> scheme.error
                                        else -> scheme.outline
                                    },
                                    PillShape,
                                ),
                        )
                        Spacer(Modifier.width(9.dp))
                        Text(
                            text = m.label + " · " + when {
                                waived -> TripDetailMessages.WAIVED
                                paid -> "${TripDetailMessages.PAID} ${formatMoney(m.paidCents, m.currency)}"
                                else -> formatMoney(m.amountCents, m.currency) + " " +
                                    (if (overdue) TripDetailMessages.OVERDUE else TripDetailMessages.DUE) +
                                    (m.dueDate?.let { " ${formatDay(it)}" } ?: "")
                            },
                            style = MaterialTheme.typography.bodySmall,
                            color = if (overdue) scheme.error else scheme.onSurface,
                        )
                    }
                }
            }
            Spacer(Modifier.height(10.dp))
            Text(
                TripDetailMessages.PAYMENT_TIMELINE_NOTE,
                style = MaterialTheme.typography.bodySmall,
                color = scheme.onSurfaceVariant,
            )
        }
    }
}

/** Copy for 2.2.3 and 2.2.10, mirroring web/app/(client)/trips/[tripId]/content.ts. */
object TripDetailMessages {
    const val BACK = "All trips"
    const val TILE_ITINERARY = "Itinerary"
    const val TILE_ITINERARY_PENDING = "Not published yet"
    const val TILE_PAYMENTS = "Payments"
    const val TILE_DOCUMENTS = "Documents"
    const val TILE_MESSAGES = "Messages"
    const val GLANCE = "At a glance"
    const val GLANCE_TRIP_TYPE = "Trip type"
    const val GLANCE_NIGHTS = "Nights"
    const val GLANCE_DESTINATION = "Destination"
    const val GLANCE_TRAVELERS = "Travelers"
    const val GLANCE_TOTAL = "Total value"
    const val GLANCE_COMPONENTS = "Booked pieces"
    const val NOTE_HEADING = "A note from Gyasi"
    const val NOTE_PENDING = "Gyasi hasn’t written the introduction yet. It arrives with the itinerary."
    const val ADVISOR_LABEL = "YOUR ADVISOR"
    const val ADVISOR_NAME = "Gyasi Story"
    const val ADVISOR_REPLY_TIME = "Usually replies the same day"
    const val MESSAGE = "Message"
    const val PAYMENT_TIMELINE = "PAYMENT TIMELINE"
    const val PAYMENT_TIMELINE_NOTE =
        "What the resort expects, and when. Story-Tail never charges you a fee."
    const val PAID = "paid"
    const val DUE = "due"
    const val WAIVED = "waived by the supplier"
    const val OVERDUE = "overdue"
    const val NO_SCHEDULE = "No payment schedule yet."
    const val CANCELLED_HEADING = "Cancellation summary"
    const val CANCELLED_REASON = "Reason"
    const val CANCELLED_REFUND = "Refund"
    const val CANCELLED_NO_REASON = "Not recorded"
    const val CANCELLED_AGAIN_HEADING = "When you’re ready"
    const val CANCELLED_AGAIN_BODY =
        "There’s no hurry. Tell Gyasi when the timing feels right and he’ll pick it up from here."
    const val NOT_FOUND_TITLE = "We couldn’t find that trip"
    const val NOT_FOUND_BODY =
        "It may have been archived, or the link may belong to a different account."
    const val RETRY = "Try again"
}
