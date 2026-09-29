package com.storytail.adventures.ui.screens.agent

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.storytail.adventures.api.WorklistMessage
import com.storytail.adventures.api.WorklistPayment
import com.storytail.adventures.api.WorklistSnapshot
import com.storytail.adventures.api.WorklistTrip
import com.storytail.adventures.domain.agent.AGENT_BAR_DESTINATIONS
import com.storytail.adventures.domain.agent.AgentCopy
import com.storytail.adventures.domain.agent.isOverdue
import com.storytail.adventures.domain.agent.label
import com.storytail.adventures.domain.agent.needsYouLine
import com.storytail.adventures.domain.agent.paymentDueLabel
import com.storytail.adventures.domain.trip.Loadable
import com.storytail.adventures.ui.components.StoryTailGlyph
import com.storytail.adventures.ui.components.StoryTailMark
import com.storytail.adventures.ui.components.agent.AgentScaffold
import com.storytail.adventures.ui.components.agent.AgentTopBar
import com.storytail.adventures.ui.components.client.formatMoney
import com.storytail.adventures.ui.theme.LocalStoryTailBrandTypography

/**
 * Screen 3.2.1 — the advisor's worklist, on a phone.
 *
 * PATTERN D (§4.4): vertically stacked sections, KPI cards in a horizontal carousel near the
 * top, a "See all" per section rather than exhaustive data. Five tiles across a 400pt screen
 * gives each one 72pt, which is narrower than the amounts inside them — hence the carousel.
 *
 * ── WHAT THIS SCREEN DELIBERATELY DOES NOT DO ──────────────────────────────────
 *
 * §6.6 keeps the agent's phone narrow: "on-the-go tasks rather than deep work". The line
 * inside this screen is that it answers "does anything need me?" and nothing else. So:
 *
 *  * NO MONTH-OVER-MONTH DELTAS. Every desktop KPI carries one and nothing stores a
 *    prior-period snapshot; last month's pipeline value cannot be reconstructed from current
 *    rows at all. Cut, not drawn-and-disabled — a number-shaped hole is worse than no line.
 *  * NO FILTER CONTROL. It filters a five-column board, and the board is web-only.
 *  * NO QUICK-ADD. New trip is §3.4.3 and new client is §3.3.9; both are forms, which is the
 *    definition of deep work. Web has them disabled-with-a-reason because it has the room.
 *  * ROWS TAP THROUGH NOW, which they did not at first delivery. Trip detail (§3.4.2) and
 *    client detail (§3.3.2) are both built on this stack, so the three trip sections push
 *    §3.4.2 and the deferral that stood at the foot of each of them is gone. What is still
 *    NOT tappable is a MESSAGE row: §3.10 is unbuilt, and that section keeps its sentence.
 *    A payment row is not tappable either — it names a milestone, and §3.4.15's editor is
 *    web-only, so the trip behind it is reached from the trip sections above.
 *
 * Every row is a NAMED PERSON, not a record — Design-System §2.6's conviction, on the side
 * of the product where it is easiest to forget.
 */
@Composable
fun WorklistScreen(
    state: Loadable<WorklistUiState>,
    onSelectTab: (String) -> Unit,
    /** Screen 3.4.2, from the three sections whose rows are trips. */
    onOpenTrip: (String) -> Unit,
    /**
     * THE ONLY WAY OFF THIS SURFACE until §3.12 builds More — see [AgentTopBar] for why it
     * rides the top bar rather than a tab. Required rather than defaulted: a second agent
     * screen must decide where its sign-out lives, not inherit a silent no-op.
     */
    onSignOut: () -> Unit,
    modifier: Modifier = Modifier,
) {
    AgentScaffold(
        modifier = modifier,
        topBar = {
            AgentTopBar(
                // Off the same registry the bottom bar draws, so the two names cannot
                // disagree — one destination, one label, on both ends of the screen.
                title = AGENT_BAR_DESTINATIONS.first { it.id == "worklist" }.label,
                onSignOut = onSignOut,
            )
        },
        activeTab = "worklist",
        onSelectTab = onSelectTab,
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 14.dp),
    ) {
        when (state) {
            is Loadable.Loading -> WorklistSkeleton()
            is Loadable.Failed -> WorklistMessagePanel(
                title = "That didn't load",
                body = "Something went wrong on our side, not yours. Trying again usually sorts it.",
            )
            // Produced, not merely consumed. TripRepository collapses "threw" and "decoded
            // nothing" into one null so this state has never been reachable on §2.2;
            // AgentRepository keeps the three-way, so a revoked agent sees the right thing.
            is Loadable.Unauthorized -> WorklistMessagePanel(
                title = "This is the advisor's side",
                body = "Your account does not have access to the worklist.",
            )
            is Loadable.Empty -> WorklistMessagePanel(title = state.title, body = state.body)
            is Loadable.Ready -> WorklistBody(state.value, onOpenTrip)
        }
    }
}

@Composable
private fun WorklistBody(ui: WorklistUiState, onOpenTrip: (String) -> Unit) {
    val type = LocalStoryTailBrandTypography.current
    val scheme = MaterialTheme.colorScheme

    Text(
        text = ui.periodLabel.uppercase(),
        style = type.labelXS,
        color = scheme.onSurfaceVariant,
    )
    Text(
        text = "${ui.partOfDay.label()}, ${ui.firstName}.",
        style = MaterialTheme.typography.headlineSmall,
        color = scheme.onSurface,
        modifier = Modifier.padding(top = 4.dp),
    )
    Text(
        text = needsYouLine(ui.needsYouCount),
        style = MaterialTheme.typography.headlineSmall,
        color = scheme.onSurface,
    )
    // The one place the worldview earns a line on this side: when nothing is urgent, say so
    // and stop. No call to action underneath it.
    if (ui.needsYouCount == 0) {
        Text(
            text = AgentCopy.GREETING_ZERO_SUB,
            style = MaterialTheme.typography.bodySmall,
            color = scheme.onSurfaceVariant,
            modifier = Modifier.padding(top = 4.dp),
        )
    }

    Spacer(Modifier.height(14.dp))
    KpiRail(ui)

    // THREE OF THE FIVE LOST THEIR FOOTER, and the two that kept one are the two whose
    // rows still go nowhere. `footer` is nullable now rather than every section carrying a
    // sentence: a section whose rows are tappable has nothing left to explain, and printing
    // "Agent messaging arrives with §3.10." under a list of trips would be answering a
    // question about a different screen.
    Section(AgentCopy.PROPOSALS_TITLE, ui.snapshot.awaitingResponse.size, AgentCopy.PROPOSALS_EMPTY) {
        ui.snapshot.awaitingResponse.forEachIndexed { i, trip ->
            TripRow(trip, first = i == 0, onOpen = onOpenTrip)
        }
    }
    // The payment rows name a MILESTONE, not a trip, and §3.4.15's editor is web-only — so
    // these stay untapped. The trip behind one is in the sections above and below.
    Section(AgentCopy.PAYMENTS_TITLE, ui.snapshot.paymentsDue.size, AgentCopy.PAYMENTS_EMPTY) {
        ui.payments.forEachIndexed { i, p -> PaymentRow(p, first = i == 0) }
    }
    Section(AgentCopy.INQUIRIES_TITLE, ui.snapshot.newInquiries.size, AgentCopy.INQUIRIES_EMPTY, AgentCopy.LEADS_DEFERRED) {
        ui.snapshot.newInquiries.forEachIndexed { i, trip ->
            TripRow(trip, first = i == 0, onOpen = onOpenTrip)
        }
    }
    Section(AgentCopy.DEPARTING_TITLE, ui.departing.size, AgentCopy.DEPARTING_EMPTY) {
        ui.departing.forEachIndexed { i, trip ->
            TripRow(trip, first = i == 0, onOpen = onOpenTrip)
        }
    }
    Section(AgentCopy.MESSAGES_TITLE, ui.snapshot.recentMessages.size, AgentCopy.MESSAGES_EMPTY, AgentCopy.MESSAGES_DEFERRED) {
        ui.snapshot.recentMessages.forEachIndexed { i, m -> MessageRow(m, first = i == 0) }
    }
    Spacer(Modifier.height(12.dp))
}

@Composable
private fun KpiRail(ui: WorklistUiState) {
    val type = LocalStoryTailBrandTypography.current
    val scheme = MaterialTheme.colorScheme
    val k = ui.snapshot.kpis

    data class Tile(
        val label: String,
        val value: String?,
        val sub: String?,
        val unavailable: String?,
        val bg: Color,
        val fg: Color,
        val mark: StoryTailMark,
    )

    val tiles = listOf(
        Tile("Pipeline value", formatMoney(k.pipelineValueCents, k.currency),
            "${k.activeTrips + k.newInquiries} open trips", null,
            scheme.primaryContainer, scheme.onPrimaryContainer, StoryTailMark.BRIEFCASE),
        Tile("Booked · month", formatMoney(k.bookedMonthCents, k.currency), null, null,
            scheme.secondaryContainer, scheme.onSecondaryContainer, StoryTailMark.CHECK),
        Tile("Commission expected", formatMoney(k.commissionExpectedCents, k.currency),
            // NULL, not 0%. An empty pipeline has nothing to be confident about.
            k.commissionConfidencePct?.let { "$it% confidence" }, null,
            scheme.tertiaryContainer, scheme.onTertiaryContainer, StoryTailMark.DOLLAR),
        Tile("Inquiry → book",
            k.inquiryToBookDays?.let { "${(it * 10).toInt() / 10.0} d" },
            k.inquiryToBookSample.takeIf { it > 0 }?.let { "over $it trips" },
            // Data-Model §8.8's honest state: the figure accumulates forward.
            if (k.inquiryToBookDays == null) AgentCopy.CYCLE_TIME_UNAVAILABLE else null,
            scheme.surfaceContainerHigh, scheme.onSurface, StoryTailMark.CLOCK),
        Tile("Active clients", k.activeClients.toString(), null, null,
            scheme.surfaceContainerHigh, scheme.onSurface, StoryTailMark.USERS),
    )

    Row(
        modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        for (t in tiles) {
            Column(
                modifier = Modifier
                    .widthIn(min = 150.dp)
                    .clip(RoundedCornerShape(14.dp))
                    .background(t.bg)
                    .padding(horizontal = 12.dp, vertical = 11.dp),
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(t.label, style = type.labelXS, color = t.fg)
                    StoryTailGlyph(mark = t.mark, size = 13.dp, color = t.fg)
                }
                if (t.value == null) {
                    Text(t.unavailable.orEmpty(), style = MaterialTheme.typography.bodySmall, color = t.fg,
                        modifier = Modifier.padding(top = 4.dp))
                } else {
                    Text(t.value, style = MaterialTheme.typography.titleLarge, color = t.fg,
                        modifier = Modifier.padding(top = 4.dp))
                    if (t.sub != null) Text(t.sub, style = MaterialTheme.typography.bodySmall, color = t.fg)
                }
            }
        }
    }
}

@Composable
private fun Section(
    title: String,
    count: Int,
    empty: String,
    /**
     * A sentence under the rows, or null when there is nothing to say.
     *
     * It was required and named `seeAll` until §3.4.2 landed, when three of the five
     * sections stopped needing one — their rows became links. Nullable rather than an empty
     * string so the divider goes with it: a rule above nothing is a rule with a gap under
     * it, which reads as content that failed to load.
     */
    footer: String? = null,
    rows: @Composable () -> Unit,
) {
    val type = LocalStoryTailBrandTypography.current
    val scheme = MaterialTheme.colorScheme
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = 12.dp)
            .clip(RoundedCornerShape(14.dp))
            .background(scheme.surfaceContainerLowest),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 11.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(title, style = MaterialTheme.typography.titleSmall, color = scheme.onSurface,
                modifier = Modifier.weight(1f))
            if (count > 0) Text("$count", style = type.labelXS, color = scheme.onSurfaceVariant)
        }
        HorizontalDivider(color = scheme.outlineVariant)
        if (count == 0) {
            Text(empty, style = MaterialTheme.typography.bodySmall, color = scheme.onSurfaceVariant,
                modifier = Modifier.padding(horizontal = 14.dp, vertical = 12.dp))
        } else {
            rows()
        }
        if (footer != null) {
            HorizontalDivider(color = scheme.outlineVariant)
            Text(footer, style = MaterialTheme.typography.bodySmall, color = scheme.onSurfaceVariant,
                modifier = Modifier.padding(horizontal = 14.dp, vertical = 9.dp).alpha(0.7f))
        }
    }
}

@Composable
private fun TripRow(trip: WorklistTrip, first: Boolean, onOpen: (String) -> Unit) {
    val type = LocalStoryTailBrandTypography.current
    val scheme = MaterialTheme.colorScheme
    if (!first) HorizontalDivider(color = scheme.outlineVariant)
    Row(
        // `clickable` BEFORE `padding`, so the ripple and the touch target cover the whole
        // row including its padding. The other way round gives a 48dp-tall row whose
        // pressable area is the text inside it, which is the commonest Compose miss.
        modifier = Modifier
            .fillMaxWidth()
            .clickable { onOpen(trip.tripId) }
            .padding(horizontal = 14.dp, vertical = 11.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text(trip.clientName, style = MaterialTheme.typography.titleSmall, color = scheme.onSurface)
            Text(trip.title, style = MaterialTheme.typography.bodySmall, color = scheme.onSurfaceVariant)
        }
        Text(formatMoney(trip.totalValueCents, trip.currency),
            style = type.labelXS, color = scheme.onSurface)
    }
}

@Composable
private fun PaymentRow(payment: WorklistPayment, first: Boolean) {
    val type = LocalStoryTailBrandTypography.current
    val scheme = MaterialTheme.colorScheme
    val late = isOverdue(payment)
    if (!first) HorizontalDivider(color = scheme.outlineVariant)
    Row(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 11.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text(payment.clientName, style = MaterialTheme.typography.titleSmall, color = scheme.onSurface)
            Text("${payment.tripTitle} · ${payment.label}", style = MaterialTheme.typography.bodySmall, color = scheme.onSurfaceVariant)
        }
        Column(horizontalAlignment = Alignment.End) {
            Text(formatMoney(payment.amountCents, payment.currency),
                style = type.labelXS, color = scheme.onSurface)
            val days = payment.daysUntil
            if (days != null) {
                Text(
                    // "Today", "Tomorrow", "5 days", "1 day late" — the web twin's words
                    // exactly. One plural template printed "in 0 days" and "1 days late".
                    text = paymentDueLabel(days),
                    style = MaterialTheme.typography.bodySmall,
                    // Lateness is the real signal — no risk dots, see WorklistSections.
                    color = if (late) scheme.error else scheme.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
private fun MessageRow(message: WorklistMessage, first: Boolean) {
    val type = LocalStoryTailBrandTypography.current
    val scheme = MaterialTheme.colorScheme
    if (!first) HorizontalDivider(color = scheme.outlineVariant)
    Column(Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 11.dp)) {
        Text(message.clientName, style = MaterialTheme.typography.titleSmall, color = scheme.onSurface)
        Text(message.preview, style = MaterialTheme.typography.bodySmall, color = scheme.onSurfaceVariant)
    }
}

@Composable
private fun WorklistSkeleton() {
    val scheme = MaterialTheme.colorScheme
    // A layout-shaped skeleton, never a spinner on blank (§5).
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        repeat(4) {
            Column(
                Modifier
                    .fillMaxWidth()
                    .height(if (it == 0) 78.dp else 96.dp)
                    .clip(RoundedCornerShape(14.dp))
                    .background(scheme.surfaceContainerHigh),
            ) {}
        }
    }
}

@Composable
private fun WorklistMessagePanel(title: String, body: String) {
    val type = LocalStoryTailBrandTypography.current
    val scheme = MaterialTheme.colorScheme
    Column(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(scheme.surfaceContainerLowest)
            .padding(18.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Text(title, style = MaterialTheme.typography.titleMedium, color = scheme.onSurface)
        Text(body, style = MaterialTheme.typography.bodySmall, color = scheme.onSurfaceVariant)
    }
}
