package com.storytail.adventures.ui.screens.dashboard

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
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.storytail.adventures.api.DashboardSnapshot
import com.storytail.adventures.api.NextPayment
import com.storytail.adventures.api.TripSummary
import com.storytail.adventures.domain.trip.Loadable
import com.storytail.adventures.domain.trip.StatusChip
import com.storytail.adventures.domain.trip.TripStatus
import com.storytail.adventures.domain.trip.imageKeyForTrip
import com.storytail.adventures.ui.components.StoryTailGlyph
import com.storytail.adventures.ui.components.StoryTailMark
import com.storytail.adventures.ui.components.client.ClientScaffold
import com.storytail.adventures.ui.components.public.PublicPhoto
import com.storytail.adventures.ui.theme.LocalStoryTailBrandTypography
import com.storytail.adventures.ui.theme.LocalStoryTailStatusColors
import com.storytail.adventures.ui.theme.PillShape
import com.storytail.adventures.ui.theme.StoryTailBrand
import com.storytail.adventures.ui.theme.StoryTailRadius
import kotlinx.datetime.LocalDate
import kotlinx.datetime.number

/**
 * Screen 2.2.1 Client Dashboard / Home — see docs/Screen-Inventory.md §2.2.1 and §4.4
 * (Pattern D: "mobile hero countdown is full-width"; the tablet/web weather widget beside
 * it is explicitly a larger-viewport affordance and so is absent here) and
 * design/source-prototype/screens/client-trip-mobile.jsx (M221_Dashboard). P1.
 *
 * The desktop artboard's right rail — the action-needed card and the advisor card — becomes
 * the first two cards BELOW the hero, in the same order, because both are things to act on.
 *
 * Departures from the artboard, matching the web twin exactly so the two screens agree:
 * no "Saved searches" tab (Phase 2 entity), "Authorize a card" renders disabled (§2.4 is
 * next), and the countdown shows DAYS only rather than days/hours/minutes.
 */
@Composable
fun DashboardScreen(
    state: DashboardUiState,
    onSelectTab: (String) -> Unit,
    onOpenTrip: (tripId: String) -> Unit,
    onOpenItinerary: (tripId: String) -> Unit,
    onSeeAllTrips: () -> Unit,
    onMessageAgent: (tripId: String) -> Unit,
    onRetry: () -> Unit,
    modifier: Modifier = Modifier,
) {
    ClientScaffold(
        modifier = modifier,
        activeTab = "trips",
        onSelectTab = onSelectTab,
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 14.dp),
    ) {
        when (val snapshot = state.snapshot) {
            is Loadable.Loading -> DashboardSkeleton()

            is Loadable.Failed -> ErrorBlock(onRetry = onRetry)

            is Loadable.Unauthorized -> ErrorBlock(onRetry = onRetry)

            is Loadable.Empty -> EmptyBlock(snapshot.title, snapshot.body)

            is Loadable.Ready -> DashboardBody(
                data = snapshot.value,
                firstName = state.firstName,
                onOpenTrip = onOpenTrip,
                onOpenItinerary = onOpenItinerary,
                onSeeAllTrips = onSeeAllTrips,
                onMessageAgent = onMessageAgent,
            )
        }
    }
}

@Composable
private fun DashboardBody(
    data: DashboardSnapshot,
    firstName: String?,
    onOpenTrip: (String) -> Unit,
    onOpenItinerary: (String) -> Unit,
    onSeeAllTrips: () -> Unit,
    onMessageAgent: (String) -> Unit,
) {
    val scheme = MaterialTheme.colorScheme
    val brandType = LocalStoryTailBrandTypography.current
    val upcoming = data.upcoming
    val traveling = upcoming?.status == TripStatus.IN_PROGRESS
    val leisure = upcoming != null && isLeisure(upcoming.tripType)
    val name = firstName ?: "there"

    Text(
        text = if (leisure && !traveling) {
            DashboardMessages.OVERLINE_REST
        } else {
            DashboardMessages.OVERLINE_NEUTRAL
        },
        style = brandType.labelXS,
        color = scheme.secondary,
    )
    Spacer(Modifier.height(6.dp))
    Text(
        text = greeting(name, upcoming?.daysUntil, traveling, leisure),
        style = MaterialTheme.typography.headlineSmall,
        color = scheme.onSurface,
    )

    if (traveling) {
        Spacer(Modifier.height(4.dp))
        Text(
            DashboardMessages.SUBTITLE_TRAVELING,
            style = MaterialTheme.typography.bodySmall,
            color = scheme.onSurfaceVariant,
        )
    }
    if (upcoming == null) {
        Spacer(Modifier.height(8.dp))
        Text(
            DashboardMessages.SUBTITLE_NO_TRIP,
            style = MaterialTheme.typography.bodyMedium,
            color = scheme.onSurfaceVariant,
        )
    }

    Spacer(Modifier.height(14.dp))

    if (upcoming != null) {
        HeroCountdown(
            trip = upcoming,
            itineraryReady = data.itineraryReady,
            onOpenItinerary = { onOpenItinerary(upcoming.id) },
        )
        data.nextPayment?.let {
            Spacer(Modifier.height(10.dp))
            ActionNeededCard(it)
        }
        Spacer(Modifier.height(10.dp))
        AdvisorCard(
            preview = data.latestMessage?.body,
            onMessage = { onMessageAgent(upcoming.id) },
        )
    } else {
        EmptyBlock(DashboardMessages.NO_TRIP_TITLE, DashboardMessages.NO_TRIP_BODY)
    }

    TripSection(
        heading = "In planning · ${data.inPlanning.size}",
        trips = data.inPlanning,
        emptyTitle = DashboardMessages.EMPTY_PLANNING_TITLE,
        emptyBody = DashboardMessages.EMPTY_PLANNING_BODY,
        onOpenTrip = onOpenTrip,
        onSeeAll = onSeeAllTrips,
    )
    TripSection(
        heading = "Past trips · ${data.past.size}",
        trips = data.past,
        emptyTitle = DashboardMessages.EMPTY_PAST_TITLE,
        emptyBody = DashboardMessages.EMPTY_PAST_BODY,
        onOpenTrip = onOpenTrip,
        onSeeAll = onSeeAllTrips,
    )
}

/** Design-System §9.4: "the single highest-value moment on the client side." */
@Composable
private fun HeroCountdown(
    trip: TripSummary,
    itineraryReady: Boolean,
    onOpenItinerary: () -> Unit,
) {
    Box(
        Modifier
            .fillMaxWidth()
            .heightIn(min = 268.dp)
            .clip(RoundedCornerShape(StoryTailRadius.xl)),
    ) {
        PublicPhoto(
            imageKey = imageKeyForTrip(trip.id, trip.tripType, trip.destinations),
            modifier = Modifier.fillMaxWidth().heightIn(min = 268.dp),
            contentDescription = null,
        ) {
            // The artboard's burgundy-to-navy wash, which is what makes white text legible
            // over an arbitrary photograph.
            Box(
                Modifier
                    .fillMaxWidth()
                    .heightIn(min = 268.dp)
                    .background(
                        Brush.linearGradient(
                            listOf(
                                StoryTailBrand.Burgundy.copy(alpha = 0.82f),
                                StoryTailBrand.Navy.copy(alpha = 0.70f),
                            ),
                        ),
                    ),
            )
        }

        Column(Modifier.padding(16.dp).heightIn(min = 236.dp)) {
            StatusChipPill(trip.chip, trip.statusLabel)
            Spacer(Modifier.height(10.dp))
            Text(
                trip.title,
                style = MaterialTheme.typography.titleLarge,
                color = Color.White,
            )
            Text(
                listOfNotNull(
                    formatDates(trip.startDate, trip.endDate),
                    trip.destinations.firstOrNull(),
                    "${trip.travelerCount} travelers",
                ).joinToString(" · "),
                style = MaterialTheme.typography.bodySmall,
                color = Color.White.copy(alpha = 0.9f),
            )

            Spacer(Modifier.weight(1f))

            Row(verticalAlignment = Alignment.Bottom) {
                trip.daysUntil?.let { days ->
                    Column(
                        modifier = Modifier
                            .background(
                                Color.White.copy(alpha = 0.15f),
                                RoundedCornerShape(StoryTailRadius.md),
                            )
                            .padding(horizontal = 14.dp, vertical = 8.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                    ) {
                        Text(
                            days.toString(),
                            style = MaterialTheme.typography.headlineSmall,
                            color = Color.White,
                        )
                        Text(
                            DashboardMessages.DAYS_UNIT,
                            style = LocalStoryTailBrandTypography.current.labelXS,
                            color = Color.White.copy(alpha = 0.85f),
                        )
                    }
                }
                Spacer(Modifier.weight(1f))
                if (itineraryReady) {
                    Button(
                        onClick = onOpenItinerary,
                        colors = ButtonDefaults.buttonColors(
                            containerColor = StoryTailBrand.Orange,
                            contentColor = Color.White,
                        ),
                    ) {
                        Text(DashboardMessages.VIEW_ITINERARY)
                    }
                } else {
                    Text(
                        DashboardMessages.ITINERARY_NOT_READY,
                        style = MaterialTheme.typography.bodySmall,
                        color = Color.White.copy(alpha = 0.8f),
                    )
                }
            }
        }
    }
}

@Composable
private fun StatusChipPill(chip: StatusChip, label: String) {
    val colors = LocalStoryTailStatusColors.current
    val (bg, fg) = when (chip) {
        StatusChip.PROPOSAL -> colors.proposalBg to colors.proposalFg
        StatusChip.BOOKED -> colors.bookedBg to colors.bookedFg
        StatusChip.DUE -> colors.dueBg to colors.dueFg
        StatusChip.TRAVELING -> colors.travelingBg to colors.travelingFg
        StatusChip.PAST -> colors.pastBg to colors.pastFg
        StatusChip.INQUIRY -> colors.inquiryBg to colors.inquiryFg
        StatusChip.CANCELLED -> colors.cancelledBg to colors.cancelledFg
    }
    Text(
        text = label.uppercase(),
        style = LocalStoryTailBrandTypography.current.labelXS,
        color = fg,
        modifier = Modifier
            .background(bg, PillShape)
            .padding(horizontal = 9.dp, vertical = 4.dp),
    )
}

@Composable
private fun ActionNeededCard(payment: NextPayment) {
    val scheme = MaterialTheme.colorScheme
    Column(
        Modifier
            .fillMaxWidth()
            .background(scheme.errorContainer, RoundedCornerShape(StoryTailRadius.lg))
            .padding(14.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            StoryTailGlyph(StoryTailMark.CARD, 15.dp, scheme.onErrorContainer)
            Spacer(Modifier.width(8.dp))
            Text(
                buildString {
                    append(DashboardMessages.ACTION_NEEDED_LABEL)
                    payment.daysUntilDue?.takeIf { it >= 0 }?.let { append(" · $it DAYS") }
                },
                style = LocalStoryTailBrandTypography.current.labelXS,
                color = scheme.onErrorContainer,
            )
        }
        Spacer(Modifier.height(6.dp))
        Text(payment.label, style = MaterialTheme.typography.titleSmall, color = scheme.onErrorContainer)
        Text(
            buildString {
                append(formatMoney(payment.amountCents, payment.currency))
                payment.dueDate?.let { append(" due ${formatDay(it)}") }
            },
            style = MaterialTheme.typography.bodySmall,
            color = scheme.onErrorContainer.copy(alpha = 0.85f),
        )
        Spacer(Modifier.height(10.dp))
        // §2.4 lands next. Disabled rather than pointed at a screen that does not exist —
        // the button keeps its place so the card does not reflow when it goes live.
        Button(
            onClick = {},
            enabled = false,
            modifier = Modifier.fillMaxWidth(),
            colors = ButtonDefaults.buttonColors(
                disabledContainerColor = scheme.onErrorContainer.copy(alpha = 0.5f),
                disabledContentColor = scheme.errorContainer,
            ),
        ) {
            Text(DashboardMessages.AUTHORIZE_CARD)
        }
    }
}

@Composable
private fun AdvisorCard(preview: String?, onMessage: () -> Unit) {
    val scheme = MaterialTheme.colorScheme
    Column(
        Modifier
            .fillMaxWidth()
            .background(scheme.surfaceContainerLowest, RoundedCornerShape(StoryTailRadius.lg))
            .padding(14.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            // Gyasi has no licensed photograph, so initials — the same call §2.0's About
            // page made for his portrait.
            Box(
                Modifier.size(32.dp).background(scheme.secondaryContainer, PillShape),
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
                    "${DashboardMessages.ADVISOR_NAME} · ${DashboardMessages.ADVISOR_ROLE}",
                    style = MaterialTheme.typography.titleSmall,
                    color = scheme.onSurface,
                )
                Text(
                    DashboardMessages.ADVISOR_REPLY_TIME,
                    style = MaterialTheme.typography.bodySmall,
                    color = scheme.onSurfaceVariant,
                )
            }
        }
        preview?.let {
            Spacer(Modifier.height(8.dp))
            Text(
                "“$it”",
                style = MaterialTheme.typography.bodySmall,
                color = scheme.onSurfaceVariant,
            )
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
            Text(DashboardMessages.MESSAGE_AGENT)
        }
    }
}

@Composable
private fun TripSection(
    heading: String,
    trips: List<TripSummary>,
    emptyTitle: String,
    emptyBody: String,
    onOpenTrip: (String) -> Unit,
    onSeeAll: () -> Unit,
) {
    val scheme = MaterialTheme.colorScheme
    Spacer(Modifier.height(24.dp))
    Row(verticalAlignment = Alignment.CenterVertically) {
        Text(
            heading,
            style = MaterialTheme.typography.titleSmall,
            color = scheme.onSurface,
            modifier = Modifier.weight(1f),
        )
        if (trips.isNotEmpty()) {
            TextButton(onClick = onSeeAll) { Text(DashboardMessages.SEE_ALL_TRIPS) }
        }
    }
    HorizontalDivider(color = scheme.outlineVariant)
    Spacer(Modifier.height(12.dp))

    if (trips.isEmpty()) {
        Text(emptyTitle, style = MaterialTheme.typography.titleSmall, color = scheme.onSurface)
        Text(emptyBody, style = MaterialTheme.typography.bodySmall, color = scheme.onSurfaceVariant)
    } else {
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            for (trip in trips) TripCard(trip, onClick = { onOpenTrip(trip.id) })
        }
    }
}

@Composable
private fun TripCard(trip: TripSummary, onClick: () -> Unit) {
    val scheme = MaterialTheme.colorScheme
    Column(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(StoryTailRadius.lg))
            .background(scheme.surfaceContainerLowest)
            .clickable(onClick = onClick),
    ) {
        Box(Modifier.fillMaxWidth().height(132.dp)) {
            PublicPhoto(
                imageKey = imageKeyForTrip(trip.id, trip.tripType, trip.destinations),
                modifier = Modifier.fillMaxWidth().height(132.dp),
                contentDescription = null,
            )
            Box(Modifier.padding(10.dp)) { StatusChipPill(trip.chip, trip.statusLabel) }
        }
        Column(Modifier.padding(12.dp)) {
            Text(trip.title, style = MaterialTheme.typography.titleSmall, color = scheme.onSurface)
            Text(
                listOfNotNull(
                    formatDates(trip.startDate, trip.endDate),
                    "${trip.travelerCount} travelers",
                ).joinToString(" · "),
                style = MaterialTheme.typography.bodySmall,
                color = scheme.onSurfaceVariant,
            )
        }
    }
}

/** §5: a skeleton shaped like the screen, never a spinner on blank. */
@Composable
private fun DashboardSkeleton() {
    val scheme = MaterialTheme.colorScheme
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        SkeletonBlock(Modifier.width(160.dp).height(12.dp))
        SkeletonBlock(Modifier.fillMaxWidth(0.8f).height(28.dp))
        SkeletonBlock(Modifier.fillMaxWidth().height(268.dp))
        SkeletonBlock(Modifier.fillMaxWidth().height(96.dp))
    }
}

@Composable
private fun SkeletonBlock(modifier: Modifier) {
    Box(
        modifier.background(
            MaterialTheme.colorScheme.surfaceContainerHigh,
            RoundedCornerShape(StoryTailRadius.sm),
        ),
    )
}

@Composable
private fun ErrorBlock(onRetry: () -> Unit) {
    val scheme = MaterialTheme.colorScheme
    Column(Modifier.fillMaxWidth().padding(vertical = 24.dp)) {
        Text(
            DashboardMessages.ERROR_TITLE,
            style = MaterialTheme.typography.titleLarge,
            color = scheme.error,
        )
        Spacer(Modifier.height(6.dp))
        Text(
            DashboardMessages.ERROR_BODY,
            style = MaterialTheme.typography.bodyMedium,
            color = scheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(14.dp))
        Button(onClick = onRetry) { Text(DashboardMessages.RETRY) }
    }
}

@Composable
private fun EmptyBlock(title: String, body: String) {
    val scheme = MaterialTheme.colorScheme
    Column(
        Modifier
            .fillMaxWidth()
            .background(scheme.surfaceContainer, RoundedCornerShape(StoryTailRadius.lg))
            .padding(22.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        StoryTailGlyph(StoryTailMark.PLANE, 26.dp, scheme.onSurfaceVariant)
        Spacer(Modifier.height(10.dp))
        Text(title, style = MaterialTheme.typography.titleLarge, color = scheme.onSurface)
        Spacer(Modifier.height(6.dp))
        Text(
            body,
            style = MaterialTheme.typography.bodyMedium,
            color = scheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
        )
    }
}

private val MONTHS = listOf(
    "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
)

/** "Nov 13 – 20, 2026", or a single date, or "Dates to come" for an undated inquiry. */
internal fun formatDates(start: LocalDate?, end: LocalDate?): String {
    if (start == null) return "Dates to come"
    val s = "${MONTHS[start.month.number - 1]} ${start.day}"
    if (end == null) return "$s, ${start.year}"
    return if (start.year == end.year && start.month == end.month) {
        "$s – ${end.day}, ${end.year}"
    } else {
        "$s – ${MONTHS[end.month.number - 1]} ${end.day}, ${end.year}"
    }
}

internal fun formatDay(date: LocalDate): String = "${MONTHS[date.month.number - 1]} ${date.day}"

/**
 * Money, formatted without `java.text` — this is commonMain and has to work on iOS too.
 *
 * Whole dollars when the cents are zero, which every seeded amount is; two places otherwise.
 * Integer arithmetic throughout (CLAUDE.md rule 5): the cents never become a Double, so
 * nothing rounds.
 */
internal fun formatMoney(amountCents: Long, currency: String): String {
    val symbol = if (currency == "USD") "$" else "$currency "
    val whole = amountCents / 100
    val cents = (amountCents % 100).toInt()
    val grouped = whole.toString().reversed().chunked(3).joinToString(",").reversed()
    return if (cents == 0) "$symbol$grouped" else "$symbol$grouped.${cents.toString().padStart(2, '0')}"
}
