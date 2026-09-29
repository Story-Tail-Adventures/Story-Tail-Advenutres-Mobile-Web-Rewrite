package com.storytail.adventures.ui.screens.agent

import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.storytail.adventures.domain.agent.AgentCopy
import com.storytail.adventures.domain.agent.TripItineraryCopy
import com.storytail.adventures.domain.trip.Loadable
import com.storytail.adventures.ui.components.agent.AgentScaffold
import com.storytail.adventures.ui.components.agent.AgentTopBar
import com.storytail.adventures.ui.components.client.StatusChipPill
import com.storytail.adventures.ui.theme.LocalStoryTailBrandTypography

/**
 * Screen 3.4.2 — one trip, on a phone, read-only. §4.4 Pattern C mobile: "a horizontally
 * scrolling tab strip, each tab a full screen."
 *
 * ── WHY THERE ARE EIGHT TABS HERE AND SIX AT §3.3.2 ─────────────────────────────
 *
 * All eight, read-only (Gyasi, asked at approval 2026-09-29). §6.6 says the agent's phone
 * is "intentionally narrower than web", and §3.3.2 already settled what narrower means on
 * this surface: its mobile client detail kept every real tab and dropped only the one that
 * was disabled on the web too. Narrower is about WRITES and about navigational depth, not
 * about how much an advisor may look at. Someone standing at a gate needs to read anything
 * about a trip; what they will not do on a phone is build one.
 *
 * ── NO WRITE CONTROLS AT ALL, AND THE SCREEN SAYS SO ────────────────────────────
 *
 * The web header carries a stage menu, "Save as template" (§3.4.13), "Cancel trip"
 * (§3.4.16) and a link into the builder (§3.4.4). Every one of those exists and §6.6 keeps
 * it in a browser. So this draws none of them — not disabled, not dimmed — and prints one
 * sentence saying where they are. A row of controls that cannot be pressed is worse than
 * the sentence: it invites four taps to find out.
 *
 * That is also why [AgentCopy.TRIP_READ_ONLY_NOTE] is not written as a deferral. Nothing
 * here is missing. It is somewhere else on purpose.
 *
 * ── WHAT THIS SCREEN RETIRES ────────────────────────────────────────────────────
 *
 * `AgentCopy.TRIP_DETAIL_DEFERRED` — "Trip detail arrives with §3.4." — rendered on three
 * worklist sections and the client detail's Trips tab since §3.2.1 shipped. Those four row
 * sets now push here, so the sentence went with this screen rather than being left to name
 * a section that had been built.
 */
@Composable
fun AgentTripDetailScreen(
    state: Loadable<AgentTripDetailUiState>,
    activeTab: String,
    onSelectTab: (String) -> Unit,
    onBack: () -> Unit,
    /** The client whose trip this is, for the one link out of a read-only screen. */
    onOpenClient: (String) -> Unit,
    onSelectBarTab: (String) -> Unit,
    onSignOut: () -> Unit,
    modifier: Modifier = Modifier,
) {
    AgentScaffold(
        modifier = modifier,
        topBar = {
            // A CONSTANT, not the trip's name — see AgentCopy.TRIP_TITLE. §3.3.2's bar
            // shows the client's name because a person's name fits in one line beside a
            // button; a trip title does not.
            AgentTopBar(title = AgentCopy.TRIP_TITLE, onSignOut = onSignOut)
        },
        // The bar stays on Worklist, because that is the tab this screen was pushed from in
        // every case but one — and §6.6 has no Trips tab for it to belong to. Reached from
        // the client detail it is a second level down inside Clients, which the bar cannot
        // express; Worklist is the honest answer for the commonest path rather than a
        // correct one for both.
        activeTab = "worklist",
        onSelectTab = onSelectBarTab,
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 14.dp),
    ) {
        BackLine(AgentCopy.TRIP_BACK, onBack)

        when (state) {
            is Loadable.Loading -> TripSkeleton()
            is Loadable.Failed -> TripPanel(
                title = "That didn't load",
                body = "Something went wrong on our side, not yours. Trying again usually sorts it.",
            )
            is Loadable.Unauthorized -> TripPanel(
                title = "This is the advisor's side",
                body = "Your account does not have access to this trip.",
            )
            is Loadable.Empty -> TripPanel(
                title = state.title,
                body = state.body,
                action = AgentCopy.TRIP_NOT_FOUND_ACTION,
                onAction = onBack,
            )
            is Loadable.Ready -> TripBody(state.value, activeTab, onSelectTab, onOpenClient)
        }
    }
}

/**
 * The back affordance, and why it is a line of text rather than the top bar's arrow: the
 * same reason `ClientDetailScreen.BackRow` gives — `AgentTopBar` carries the title and
 * sign-out and has no navigation slot, and adding one would change the bar on both agent
 * tab roots, where there is nothing to go back to.
 */
@Composable
private fun BackLine(label: String, onBack: () -> Unit) {
    Text(
        text = "← $label",
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier.clickable(onClick = onBack).padding(bottom = 10.dp),
    )
}

@Composable
private fun TripBody(
    ui: AgentTripDetailUiState,
    activeTab: String,
    onSelectTab: (String) -> Unit,
    onOpenClient: (String) -> Unit,
) {
    val type = LocalStoryTailBrandTypography.current
    val scheme = MaterialTheme.colorScheme

    // ── Header ───────────────────────────────────────────────────────────────
    // THE CLIENT'S NAME ABOVE THE TITLE, and tappable. Design-System §2.6's conviction on
    // the agent's side is that a traveler stays a named person rather than a row; this is
    // also the one navigation a read-only screen legitimately offers, since §3.3.2 is built
    // on this stack and is where the phone number lives.
    Text(
        text = ui.clientName,
        style = MaterialTheme.typography.bodySmall,
        color = scheme.primary,
        modifier = Modifier.clickable { onOpenClient(ui.clientId) },
    )
    Text(
        text = ui.title,
        style = MaterialTheme.typography.titleLarge,
        color = scheme.onSurface,
        maxLines = 3,
        overflow = TextOverflow.Ellipsis,
        modifier = Modifier.padding(top = 2.dp),
    )
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        modifier = Modifier.padding(top = 8.dp),
    ) {
        if (ui.statusChip != null) {
            StatusChipPill(ui.statusChip, ui.statusLabel)
        } else {
            // An unrecognised stage. Neutral type, no colour — see the field.
            Text(ui.statusLabel, style = type.labelXS, color = scheme.onSurfaceVariant)
        }
        Text(ui.subLine, style = MaterialTheme.typography.bodySmall, color = scheme.onSurfaceVariant)
    }

    // ── The three figures ────────────────────────────────────────────────────
    // NO ASTERISK AND NO CURRENCY NOTE. §3.2 and §3.3 both drew a marker beside a money
    // figure and a footnote naming the currency it left out; `trip_currency_usd`
    // (20260930100000) makes a second currency impossible to store and the accessors
    // stopped scoping. A figure that cannot exclude anything must not carry a mark saying
    // it did.
    Card(
        colors = CardDefaults.cardColors(containerColor = scheme.surfaceContainerLow),
        modifier = Modifier.fillMaxWidth().padding(top = 12.dp),
    ) {
        Row(Modifier.padding(horizontal = 12.dp, vertical = 10.dp)) {
            ui.money.forEach { (label, value) ->
                Column(Modifier.weight(1f)) {
                    Text(label.uppercase(), style = type.labelXS, color = scheme.onSurfaceVariant)
                    Text(
                        value,
                        style = MaterialTheme.typography.titleSmall,
                        color = scheme.onSurface,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.padding(top = 2.dp),
                    )
                }
            }
        }
    }

    // ── The strip: eight, scrolling, never wrapping ──────────────────────────
    Spacer(Modifier.height(12.dp))
    Row(
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        modifier = Modifier.horizontalScroll(rememberScrollState()),
    ) {
        ui.tabs.forEach { tab ->
            FilterChip(
                selected = tab.id == activeTab,
                onClick = { onSelectTab(tab.id) },
                label = { Text(tab.label) },
            )
        }
    }
    Spacer(Modifier.height(12.dp))

    when (activeTab) {
        "components" -> ComponentsTab(ui)
        "itinerary" -> ItineraryTab(ui)
        "payments" -> PaymentsTab(ui)
        "documents" -> DocumentsTab(ui)
        "messages" -> MessagesTab(ui)
        "notes" -> NotesTab(ui)
        "activity" -> ActivityTab(ui)
        else -> OverviewTab(ui)
    }
}

@Composable
private fun OverviewTab(ui: AgentTripDetailUiState) {
    val type = LocalStoryTailBrandTypography.current
    val scheme = MaterialTheme.colorScheme

    Text("AT A GLANCE", style = type.labelXS, color = scheme.onSurfaceVariant)
    Spacer(Modifier.height(4.dp))
    ui.glance.forEachIndexed { i, (label, value) ->
        if (i > 0) HorizontalDivider(color = scheme.outlineVariant)
        Row(
            Modifier.fillMaxWidth().padding(vertical = 9.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(
                label,
                style = MaterialTheme.typography.bodySmall,
                color = scheme.onSurfaceVariant,
                modifier = Modifier.weight(0.42f),
            )
            Text(
                value,
                style = MaterialTheme.typography.bodyMedium,
                color = scheme.onSurface,
                modifier = Modifier.weight(0.58f),
            )
        }
    }
    NoteLine(AgentCopy.TRIP_READ_ONLY_NOTE)
}

@Composable
private fun ComponentsTab(ui: AgentTripDetailUiState) {
    val type = LocalStoryTailBrandTypography.current
    val scheme = MaterialTheme.colorScheme
    if (ui.components.isEmpty()) {
        EmptyLine(AgentCopy.TRIP_COMPONENTS_EMPTY)
        return
    }
    ui.components.forEach { c ->
        RowCard {
            Row(
                verticalAlignment = Alignment.Top,
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Column(Modifier.weight(1f)) {
                    // THE KIND AS AN OVERLINE, where the web puts a glyph. `icon-paths.ts`
                    // has a plane and a ship; Compose's StoryTailMark set does not, and
                    // adding seven marks to the design system for a read-only row is a
                    // change to shared tokens for one screen. The word is also more precise
                    // than the glyph: "Hotel or resort" and "Tour or activity" are the
                    // advisor's own vocabulary from §3.4.4's sheets.
                    Text(c.kindLabel.uppercase(), style = type.labelXS, color = scheme.onSurfaceVariant)
                    Text(
                        c.title,
                        style = MaterialTheme.typography.bodyMedium,
                        color = scheme.onSurface,
                        modifier = Modifier.padding(top = 1.dp),
                    )
                    c.line?.let {
                        Text(it, style = MaterialTheme.typography.bodySmall, color = scheme.onSurfaceVariant)
                    }
                }
                Text(c.costLabel, style = type.labelXS, color = scheme.onSurface)
            }
        }
    }
}

@Composable
private fun ItineraryTab(ui: AgentTripDetailUiState) {
    val type = LocalStoryTailBrandTypography.current
    val scheme = MaterialTheme.colorScheme

    // PUBLISHED OR DRAFT, FIRST. The fact an advisor most needs before telling a client to
    // go and look — and the one this tab would otherwise silently withhold, since a draft
    // day-by-day looks exactly like a published one.
    Text(
        ui.itineraryStateLabel.uppercase(),
        style = type.labelXS,
        color = if (ui.itineraryStateLabel == AgentCopy.ITINERARY_PUBLISHED) scheme.primary
        else scheme.onSurfaceVariant,
    )
    Spacer(Modifier.height(8.dp))

    if (ui.days.isEmpty()) {
        EmptyLine(AgentCopy.TRIP_ITINERARY_EMPTY)
        return
    }

    ui.days.forEach { d ->
        Column(Modifier.fillMaxWidth().padding(bottom = 14.dp)) {
            Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Day ${d.dayNumber}", style = MaterialTheme.typography.titleSmall, color = scheme.onSurface)
                Text(d.dateLabel, style = MaterialTheme.typography.bodySmall, color = scheme.onSurfaceVariant)
            }
            d.label?.let {
                Text(
                    it,
                    style = MaterialTheme.typography.bodyMedium,
                    color = scheme.onSurface,
                    modifier = Modifier.padding(top = 2.dp),
                )
            }
            d.summary?.let {
                Text(it, style = MaterialTheme.typography.bodySmall, color = scheme.onSurfaceVariant)
            }

            if (d.activities.isEmpty()) {
                // A DAY WITH NOTHING IN IT IS A REAL STATE, not a gap to hide. Two of the
                // seeded trip's four days are empty, and a day-by-day being written is
                // mostly empty — a screen that only renders the finished article is how an
                // empty state ships unconsidered.
                Text(
                    TripItineraryCopy.DAY_EMPTY,
                    style = MaterialTheme.typography.bodySmall,
                    color = scheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = 6.dp),
                )
            } else {
                d.activities.forEachIndexed { i, a ->
                    if (i > 0) HorizontalDivider(color = scheme.outlineVariant)
                    Column(Modifier.fillMaxWidth().padding(vertical = 8.dp)) {
                        a.line?.let {
                            Text(it, style = type.labelXS, color = scheme.onSurfaceVariant)
                        }
                        Text(
                            a.title,
                            style = MaterialTheme.typography.bodyMedium,
                            color = scheme.onSurface,
                        )
                        a.body?.let {
                            Text(it, style = MaterialTheme.typography.bodySmall, color = scheme.onSurfaceVariant)
                        }
                        // ITS OWN BLOCK, never folded into the body. `gyasis_tip` is a
                        // distinct column and Design-System §2 makes "Gyasi's Tip" a named
                        // thing — it is what an advisor reaches for when a client rings from
                        // the resort, and a paragraph would lose it.
                        a.gyasisTip?.let {
                            Surface(
                                color = scheme.tertiaryContainer,
                                shape = MaterialTheme.shapes.small,
                                modifier = Modifier.fillMaxWidth().padding(top = 5.dp),
                            ) {
                                Column(Modifier.padding(horizontal = 10.dp, vertical = 7.dp)) {
                                    Text(
                                        TripItineraryCopy.TIP_LABEL,
                                        style = type.labelXS,
                                        color = scheme.onTertiaryContainer,
                                    )
                                    Text(
                                        it,
                                        style = MaterialTheme.typography.bodySmall,
                                        color = scheme.onTertiaryContainer,
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    NoteLine(AgentCopy.TRIP_ITINERARY_WEB_NOTE)
}

@Composable
private fun PaymentsTab(ui: AgentTripDetailUiState) {
    val type = LocalStoryTailBrandTypography.current
    val scheme = MaterialTheme.colorScheme

    Text(
        ui.paymentsSummary,
        style = MaterialTheme.typography.bodyMedium,
        color = scheme.onSurface,
        modifier = Modifier.padding(bottom = 10.dp),
    )
    if (ui.payments.isEmpty()) return

    ui.payments.forEach { p ->
        RowCard {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(p.label, style = MaterialTheme.typography.bodyMedium, color = scheme.onSurface)
                    Text(
                        // "Paid" needs no date; anything else needs the date more than the
                        // word, so the date leads. A milestone the supplier has not dated
                        // says so rather than showing a blank half-line.
                        if (p.paid) p.statusLabel
                        else listOfNotNull(p.dueLabel, p.statusLabel).joinToString(" · "),
                        style = MaterialTheme.typography.bodySmall,
                        color = if (p.paid) scheme.onSurfaceVariant else scheme.error,
                    )
                }
                Text(p.amountLabel, style = type.labelXS, color = scheme.onSurface)
            }
        }
    }
}

@Composable
private fun DocumentsTab(ui: AgentTripDetailUiState) {
    val scheme = MaterialTheme.colorScheme
    if (ui.documents.isEmpty()) {
        EmptyLine(AgentCopy.TRIP_DOCUMENTS_EMPTY)
        return
    }
    ui.documents.forEach { d ->
        RowCard {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Column(Modifier.weight(1f)) {
                    Text(
                        d.filename,
                        style = MaterialTheme.typography.bodyMedium,
                        color = scheme.onSurface,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Text(d.line, style = MaterialTheme.typography.bodySmall, color = scheme.onSurfaceVariant)
                }
                // No download and no preview. Storage is signed-URL gated and §3.6 owns the
                // audited reveal; a tap that opened a passport scan from a lock screen is
                // not a read-only affordance.
                if (d.sensitive) {
                    Text(
                        "Sensitive",
                        style = MaterialTheme.typography.labelSmall,
                        color = scheme.onSurfaceVariant,
                    )
                }
            }
        }
    }
}

@Composable
private fun MessagesTab(ui: AgentTripDetailUiState) {
    val type = LocalStoryTailBrandTypography.current
    val scheme = MaterialTheme.colorScheme
    if (ui.messages.isEmpty()) {
        EmptyLine(AgentCopy.TRIP_MESSAGES_EMPTY)
        return
    }
    ui.messages.forEach { m ->
        Card(
            colors = CardDefaults.cardColors(
                // INTERNAL NOTES ARE DISTINGUISHED, NOT HIDDEN — the agent's read, unlike
                // the client's. An advisor scrolling a thread has to be able to tell what
                // the traveler can see from what they cannot, and a different surface is
                // how the web draws the same distinction.
                containerColor = if (m.internalNote) scheme.surfaceContainerHigh
                else scheme.surfaceContainerLow,
            ),
            modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp),
        ) {
            Column(Modifier.padding(12.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(m.who, style = type.labelXS, color = scheme.onSurfaceVariant)
                    if (m.internalNote) {
                        Text("Internal note", style = type.labelXS, color = scheme.onSurfaceVariant)
                    }
                    Spacer(Modifier.weight(1f))
                    Text(m.whenLabel, style = MaterialTheme.typography.bodySmall, color = scheme.onSurfaceVariant)
                }
                Text(
                    m.body,
                    style = MaterialTheme.typography.bodySmall,
                    color = scheme.onSurface,
                    modifier = Modifier.padding(top = 3.dp),
                )
            }
        }
    }
    NoteLine(AgentCopy.MESSAGES_DEFERRED)
}

@Composable
private fun NotesTab(ui: AgentTripDetailUiState) {
    val scheme = MaterialTheme.colorScheme
    if (ui.notes == null) {
        EmptyLine(AgentCopy.TRIP_NOTES_EMPTY)
        return
    }
    RowCard {
        Text(ui.notes, style = MaterialTheme.typography.bodyMedium, color = scheme.onSurface)
    }
    NoteLine(AgentCopy.TRIP_READ_ONLY_NOTE)
}

@Composable
private fun ActivityTab(ui: AgentTripDetailUiState) {
    val scheme = MaterialTheme.colorScheme
    if (ui.activity.isEmpty()) {
        EmptyLine(AgentCopy.TRIP_ACTIVITY_EMPTY)
        return
    }
    ui.activity.forEach { e ->
        Row(Modifier.fillMaxWidth().padding(vertical = 7.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Column(Modifier.weight(1f)) {
                Text(e.description, style = MaterialTheme.typography.bodyMedium, color = scheme.onSurface)
                e.actorName?.let {
                    Text(it, style = MaterialTheme.typography.bodySmall, color = scheme.onSurfaceVariant)
                }
            }
            Text(e.whenLabel, style = MaterialTheme.typography.bodySmall, color = scheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun RowCard(content: @Composable ColumnScope.() -> Unit) {
    Card(
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerLow),
        modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp),
    ) {
        Column(Modifier.padding(12.dp), content = content)
    }
}

/**
 * A tinted line saying where a capability lives.
 *
 * NOT [EmptyLine]'s treatment, because it is not an empty state — it answers "where is the
 * button?" rather than "why is this blank?". It renders whether the tab holds rows or not,
 * for the reason the worklist's `Section` prints its own: this is a permanent property of
 * the surface, not a comment on the data.
 */
@Composable
private fun NoteLine(text: String) {
    Surface(
        color = MaterialTheme.colorScheme.surfaceContainerHigh,
        shape = MaterialTheme.shapes.small,
        modifier = Modifier.fillMaxWidth().padding(top = 6.dp, bottom = 4.dp),
    ) {
        Text(
            text,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 9.dp),
        )
    }
}

/**
 * ONLY WHERE THERE IS NOTHING. A tab that has already said "No components added yet." does
 * not then need a sentence about where the builder is — §3.3.2's Trips tab settled that.
 * The Overview and Itinerary tabs carry a [NoteLine] because they always have content.
 */
@Composable
private fun EmptyLine(text: String) {
    Text(
        text,
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier.padding(vertical = 12.dp),
    )
}

@Composable
private fun TripPanel(
    title: String,
    body: String,
    action: String? = null,
    onAction: (() -> Unit)? = null,
) {
    val scheme = MaterialTheme.colorScheme
    Card(
        colors = CardDefaults.cardColors(containerColor = scheme.surfaceContainerLow),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(Modifier.padding(16.dp)) {
            Text(title, style = MaterialTheme.typography.titleMedium, color = scheme.onSurface)
            Text(
                body,
                style = MaterialTheme.typography.bodySmall,
                color = scheme.onSurfaceVariant,
                modifier = Modifier.padding(top = 4.dp),
            )
            if (action != null && onAction != null) {
                Text(
                    action,
                    style = MaterialTheme.typography.bodySmall,
                    color = scheme.primary,
                    modifier = Modifier.padding(top = 10.dp).clickable(onClick = onAction),
                )
            }
        }
    }
}

/** A layout-shaped skeleton, never a spinner on blank (§5). */
@Composable
private fun TripSkeleton() {
    val scheme = MaterialTheme.colorScheme
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        repeat(4) {
            Surface(
                color = scheme.surfaceContainerLow,
                shape = MaterialTheme.shapes.medium,
                modifier = Modifier.fillMaxWidth().height(if (it == 0) 96.dp else 72.dp),
            ) {}
        }
    }
}
