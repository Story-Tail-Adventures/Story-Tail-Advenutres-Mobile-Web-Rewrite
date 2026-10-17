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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import com.storytail.adventures.api.DashboardSnapshot
import com.storytail.adventures.config.SupabaseConfig
import com.storytail.adventures.domain.agent.avatarUrlFor
import com.storytail.adventures.domain.trip.AdvisorCard
import com.storytail.adventures.ui.components.AdvisorPhoto
import com.storytail.adventures.ui.nav.rememberPlatformLinks
import com.storytail.adventures.api.NextPayment
import com.storytail.adventures.api.TripSummary
import com.storytail.adventures.domain.trip.Loadable
import com.storytail.adventures.domain.trip.StatusChip
import com.storytail.adventures.domain.trip.TripStatus
import com.storytail.adventures.domain.trip.imageKeyForTrip
import com.storytail.adventures.domain.trip.isPayable
import com.storytail.adventures.ui.components.StoryTailGlyph
import com.storytail.adventures.ui.components.StoryTailMark
import com.storytail.adventures.ui.components.client.ClientEmptyState
import com.storytail.adventures.ui.components.client.ClientErrorState
import com.storytail.adventures.ui.components.client.ClientScaffold
import com.storytail.adventures.ui.components.client.IvePaidState
import com.storytail.adventures.ui.components.client.PayLinkBlock
import com.storytail.adventures.ui.components.client.SectionHeading
import com.storytail.adventures.ui.components.client.SkeletonBlock
import com.storytail.adventures.ui.components.client.StatusChipPill
import com.storytail.adventures.ui.components.client.TripCard
import com.storytail.adventures.ui.components.client.formatDay
import com.storytail.adventures.ui.components.client.formatMoney
import com.storytail.adventures.ui.components.client.formatTripDates
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
 * The desktop artboard's right rail — the next-payment card and the advisor card — becomes
 * the first two cards BELOW the hero, in the same order, because both are things to act on.
 *
 * Departures from the artboard, matching the web twin exactly so the two screens agree:
 * no "Saved searches" tab (Phase 2 entity) and the countdown shows DAYS only rather than
 * days/hours/minutes.
 *
 * "Authorize a card" is gone with §2.4 (retired 2026-10-16: the app never holds a card). The
 * next-payment card now carries §2.2.3's pay block when the advisor gave that milestone a
 * pay link, and is calm unless the milestone is really overdue (Design-System §2: no red
 * unless a supplier date has truly passed). Tapping the card opens the trip, whose payment
 * timeline has the rest.
 */
@Composable
fun DashboardScreen(
    state: DashboardUiState,
    onSelectTab: (String) -> Unit,
    onOpenTrip: (tripId: String) -> Unit,
    onOpenItinerary: (tripId: String) -> Unit,
    onSeeAllTrips: () -> Unit,
    onMessageAgent: (tripId: String) -> Unit,
    /** §2.2.3's "I've paid" for the next payment, on the upcoming trip's thread. */
    onIvePaid: (tripId: String) -> Unit,
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

            is Loadable.Failed -> ClientErrorState(
                title = DashboardMessages.ERROR_TITLE,
                body = DashboardMessages.ERROR_BODY,
                retryLabel = DashboardMessages.RETRY,
                onRetry = onRetry,
            )

            // An agent reaching a client route. §5 asks for a real permissions state rather
            // than the empty state RLS would otherwise produce.
            is Loadable.Unauthorized -> ClientEmptyState(
                title = "You don’t have access to this view",
                body = "This is the traveler’s side of Story-Tail.",
                mark = StoryTailMark.USER,
            )

            is Loadable.Empty -> ClientEmptyState(snapshot.title, snapshot.body)

            is Loadable.Ready -> DashboardBody(
                data = snapshot.value,
                firstName = state.firstName,
                advisor = state.advisor,
                onOpenTrip = onOpenTrip,
                onOpenItinerary = onOpenItinerary,
                onSeeAllTrips = onSeeAllTrips,
                onMessageAgent = onMessageAgent,
                ivePaid = state.ivePaid,
                onIvePaid = onIvePaid,
            )
        }
    }
}

@Composable
private fun DashboardBody(
    data: DashboardSnapshot,
    firstName: String?,
    advisor: AdvisorCard?,
    onOpenTrip: (String) -> Unit,
    onOpenItinerary: (String) -> Unit,
    onSeeAllTrips: () -> Unit,
    onMessageAgent: (String) -> Unit,
    ivePaid: IvePaidState,
    onIvePaid: (String) -> Unit,
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
            NextPaymentCard(
                payment = it,
                ivePaid = ivePaid,
                onOpen = { onOpenTrip(upcoming.id) },
                onIvePaid = { onIvePaid(upcoming.id) },
            )
        }
        Spacer(Modifier.height(10.dp))
        AdvisorCard(
            // Only the advisor's own words are quoted here. When the traveler spoke last the
            // card drops the quote and keeps the reply-window line, which is exactly what
            // somebody waiting for an answer wants to see.
            preview = data.latestMessage?.takeIf { it.fromAgent }?.body,
            advisor = advisor,
            onMessage = { onMessageAgent(upcoming.id) },
        )
    } else {
        ClientEmptyState(DashboardMessages.NO_TRIP_TITLE, DashboardMessages.NO_TRIP_BODY)
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
                    formatTripDates(trip.startDate, trip.endDate),
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

/**
 * The next unpaid milestone on the upcoming trip, as the M221 artboard draws it (redrawn
 * 2026-10-16): an overline with the due date, the label and the amount still open, a calm
 * "whenever it suits you" line while the date is ahead, and §2.2.3's pay block when the
 * milestone has a pay link. No countdown and no red (Design-System §2); the money goes to
 * the supplier, never to Story-Tail. It was "ACTION NEEDED" with an "Authorize a card"
 * button into §2.4.3, retired with the rest of the card screens. Mirrors `NextPayment` in
 * web/app/(client)/dashboard/page.tsx.
 */
@Composable
private fun NextPaymentCard(
    payment: NextPayment,
    ivePaid: IvePaidState,
    onOpen: () -> Unit,
    onIvePaid: () -> Unit,
) {
    val scheme = MaterialTheme.colorScheme
    val ahead = payment.daysUntilDue != null && payment.daysUntilDue >= 0
    val open = payment.amountCents - payment.paidCents
    Column(
        Modifier
            .fillMaxWidth()
            .background(scheme.surfaceContainer, RoundedCornerShape(StoryTailRadius.lg))
            .clickable(onClick = onOpen)
            .padding(14.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            StoryTailGlyph(StoryTailMark.CARD, 15.dp, scheme.onSurfaceVariant)
            Spacer(Modifier.width(8.dp))
            Text(
                buildString {
                    append(DashboardMessages.NEXT_PAYMENT_LABEL)
                    payment.dueDate?.let { append(" · DUE ${formatDay(it).uppercase()}") }
                },
                style = LocalStoryTailBrandTypography.current.labelXS,
                color = scheme.onSurfaceVariant,
            )
        }
        Spacer(Modifier.height(6.dp))
        Text(
            "${payment.label} · ${formatMoney(if (open > 0) open else payment.amountCents, payment.currency)}",
            style = MaterialTheme.typography.titleSmall,
            color = scheme.onSurface,
        )
        if (ahead) {
            Spacer(Modifier.height(2.dp))
            Text(
                DashboardMessages.NEXT_PAYMENT_WHENEVER,
                style = MaterialTheme.typography.bodySmall,
                color = scheme.onSurfaceVariant,
            )
        }
        // §2.2.3's pay block, only for an open milestone with a link. No link: nothing here
        // at all, not an empty space for a button that is not coming.
        val payUrl = payment.payUrl
        if (isPayable(payment.status, payUrl) && payUrl != null) {
            Spacer(Modifier.height(10.dp))
            PayLinkBlock(
                label = payment.label,
                payUrl = payUrl,
                ivePaid = ivePaid,
                onIvePaid = onIvePaid,
            )
        }
    }
}

/**
 * "Your advisor" (§3.12 PR 3, Q11), from the advisor's own profile: photo, name, pronouns, the
 * reply-time promise (or "Away until…" while they rest), a short bio and their links. [advisor]
 * is null when the read failed; the card then keeps its long-standing fixed words.
 */
@Composable
private fun AdvisorCard(preview: String?, advisor: AdvisorCard?, onMessage: () -> Unit) {
    val scheme = MaterialTheme.colorScheme
    val links = rememberPlatformLinks()
    Column(
        Modifier
            .fillMaxWidth()
            .background(scheme.surfaceContainerLowest, RoundedCornerShape(StoryTailRadius.lg))
            .padding(14.dp),
    ) {
        Text(
            DashboardMessages.ADVISOR_LABEL,
            style = LocalStoryTailBrandTypography.current.labelXS,
            color = scheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(6.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            // Their own photo once they have uploaded one, else initials: never a stock
            // portrait standing in for a real person.
            AdvisorPhoto(
                url = avatarUrlFor(advisor?.avatarPath, SupabaseConfig.URL),
                initials = advisor?.initials ?: "GS",
                size = 40.dp,
                background = StoryTailBrand.Burgundy,
            )
            Spacer(Modifier.width(10.dp))
            Column(Modifier.weight(1f)) {
                Text(
                    buildString {
                        append("${advisor?.firstName ?: DashboardMessages.ADVISOR_NAME} · ${DashboardMessages.ADVISOR_ROLE}")
                        advisor?.pronouns?.let { append(" ($it)") }
                    },
                    style = MaterialTheme.typography.titleSmall,
                    color = scheme.onSurface,
                )
                val away = advisor?.awayLabel
                Text(
                    away ?: advisor?.replyLabel ?: DashboardMessages.ADVISOR_REPLY_TIME,
                    style = MaterialTheme.typography.bodySmall,
                    color = if (away != null) scheme.onSurface else scheme.onSurfaceVariant,
                    fontWeight = if (away != null) FontWeight.SemiBold else null,
                )
            }
        }
        advisor?.bio?.let {
            Spacer(Modifier.height(8.dp))
            Text(
                it,
                style = MaterialTheme.typography.bodyMedium,
                color = scheme.onSurface,
                maxLines = 3,
                overflow = TextOverflow.Ellipsis,
            )
        }
        if (advisor != null && advisor.links.isNotEmpty()) {
            Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                for (link in advisor.links) {
                    TextButton(
                        onClick = { links.openUrl(link.href) },
                        contentPadding = PaddingValues(horizontal = 6.dp),
                        modifier = Modifier.heightIn(min = 48.dp),
                    ) { Text(link.label, style = MaterialTheme.typography.labelMedium) }
                }
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
    SectionHeading(
        heading = heading,
        actionLabel = if (trips.isNotEmpty()) DashboardMessages.SEE_ALL_TRIPS else null,
        onAction = if (trips.isNotEmpty()) onSeeAll else null,
    )
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
