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
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.TextButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.storytail.adventures.domain.agent.AgentCopy
import com.storytail.adventures.domain.agent.ClientCopy
import com.storytail.adventures.domain.trip.Loadable
import com.storytail.adventures.ui.components.agent.AgentScaffold
import com.storytail.adventures.ui.components.agent.AgentTopBar
import com.storytail.adventures.ui.theme.LocalStoryTailBrandTypography

/**
 * Screens 3.3.2 – 3.3.8 — one client, on a phone. §4.4 Pattern C mobile: "Full-screen
 * detail; back button to list; tabs as a horizontal scrollable strip near the top."
 *
 * THE TAB STRIP SCROLLS RATHER THAN WRAPS, which is the one place this screen follows
 * Pattern C literally where the roster departed from Pattern B. Six labels with counts do
 * not fit a 400dp line, and wrapping them to two rows pushes the content below the fold on
 * the screen whose content IS the point. §4.4 asks for a scroller here by name.
 *
 * SWITCHING A TAB COSTS NOTHING. `AgentRepository.clientDetail` fetches all seven reads at
 * once and this screen holds them, so the strip is local state rather than a route. The web
 * build does the opposite — `?tab=` and a fetch per tab — and its doc comment says why that
 * is right there: a tab there is a navigation, and shareability and the back button matter
 * on a desk. On a phone a tab is a thumb moving two centimetres.
 *
 * NO WRITES. The Notes tab lists notes and does not compose them. §6.6 keeps the agent's
 * phone to "on-the-go tasks rather than deep work", and the write path exists (§3.3.7's
 * Edge Function shipped with the web build) — so this is a scope line rather than a missing
 * capability, and it is the easiest one to move if Gyasi wants notes on the phone.
 */
@Composable
fun ClientDetailScreen(
    state: Loadable<ClientDetailUiState>,
    activeTab: String,
    onSelectTab: (String) -> Unit,
    onBack: () -> Unit,
    onSelectBarTab: (String) -> Unit,
    onSignOut: () -> Unit,
    modifier: Modifier = Modifier,
) {
    AgentScaffold(
        modifier = modifier,
        topBar = {
            AgentTopBar(
                title = when (state) {
                    is Loadable.Ready -> state.value.displayName
                    else -> ClientCopy.TITLE
                },
                onSignOut = onSignOut,
            )
        },
        activeTab = "clients",
        onSelectTab = onSelectBarTab,
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 14.dp),
    ) {
        BackRow(onBack)

        when (state) {
            is Loadable.Loading -> DetailSkeleton()
            is Loadable.Failed -> DetailPanel(
                title = "That didn't load",
                body = "Something went wrong on our side, not yours. Trying again usually sorts it.",
            )
            is Loadable.Unauthorized -> DetailPanel(
                title = "This is the advisor's side",
                body = "Your account does not have access to this client.",
            )
            is Loadable.Empty -> DetailPanel(title = state.title, body = state.body)
            is Loadable.Ready -> DetailBody(state.value, activeTab, onSelectTab)
        }
    }
}

/**
 * The back affordance, and the reason it is a row of text rather than the top bar's arrow.
 *
 * `AgentTopBar` carries the screen title and sign-out and has no navigation slot — adding
 * one would change the bar on both agent tab roots, where there is nothing to go back to.
 * A tappable line under the bar costs nothing and leaves the shared bar alone.
 */
@Composable
private fun BackRow(onBack: () -> Unit) {
    val scheme = MaterialTheme.colorScheme
    Text(
        text = "\u2190 ${ClientCopy.BACK_TO_ROSTER}",
        style = MaterialTheme.typography.bodySmall,
        color = scheme.onSurfaceVariant,
        modifier = Modifier
            .clickable(onClick = onBack)
            .padding(bottom = 10.dp),
    )
}

@Composable
private fun DetailBody(ui: ClientDetailUiState, activeTab: String, onSelectTab: (String) -> Unit) {
    val type = LocalStoryTailBrandTypography.current
    val scheme = MaterialTheme.colorScheme

    // ── Header ───────────────────────────────────────────────────────────────
    Card(
        colors = CardDefaults.cardColors(containerColor = scheme.primaryContainer),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            modifier = Modifier.padding(14.dp),
        ) {
            Surface(shape = CircleShape, color = scheme.secondaryContainer, modifier = Modifier.size(44.dp)) {
                Row(Modifier.fillMaxWidth(), Arrangement.Center, Alignment.CenterVertically) {
                    Text(ui.initials, style = type.labelXS, color = scheme.onSecondaryContainer)
                }
            }
            Column(Modifier.weight(1f)) {
                Text(
                    ui.displayName,
                    style = MaterialTheme.typography.titleMedium,
                    color = scheme.onPrimaryContainer,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    ui.contactLine,
                    style = MaterialTheme.typography.bodySmall,
                    color = scheme.onPrimaryContainer,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    "Since ${ui.sinceLabel}",
                    style = MaterialTheme.typography.bodySmall,
                    color = scheme.onPrimaryContainer,
                )
            }
        }
    }

    if (ui.archived) {
        Text(
            ClientCopy.ARCHIVED_BANNER,
            style = MaterialTheme.typography.bodySmall,
            color = scheme.onSurfaceVariant,
            modifier = Modifier.padding(top = 8.dp),
        )
    }

    // ── Tabs: a scroller, per §4.4 ───────────────────────────────────────────
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
        "trips" -> TripsTab(ui)
        "messages" -> ThreadsTab(ui)
        "documents" -> DocumentsTab(ui)
        "notes" -> NotesTab(ui)
        "activity" -> ActivityTab(ui)
        else -> OverviewTab(ui)
    }
}

@Composable
private fun SectionCard(title: String, content: @Composable ColumnScope.() -> Unit) {
    val scheme = MaterialTheme.colorScheme
    Card(
        colors = CardDefaults.cardColors(containerColor = scheme.surfaceContainerLow),
        modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp),
    ) {
        Column(Modifier.padding(14.dp)) {
            Text(title, style = MaterialTheme.typography.titleSmall, color = scheme.onSurface)
            Spacer(Modifier.height(6.dp))
            content()
        }
    }
}

@Composable
private fun OverviewTab(ui: ClientDetailUiState) {
    val scheme = MaterialTheme.colorScheme

    SectionCard(ClientCopy.SNAPSHOT_TITLE) {
        ui.snapshot.forEach { (label, value) ->
            Text(label, style = MaterialTheme.typography.labelSmall, color = scheme.onSurfaceVariant)
            Text(
                value,
                style = MaterialTheme.typography.bodyMedium,
                color = scheme.onSurface,
                modifier = Modifier.padding(bottom = 6.dp),
            )
        }
        ui.snapshotNote?.let {
            Text(it, style = MaterialTheme.typography.bodySmall, color = scheme.onSurfaceVariant)
        }
    }

    SectionCard(ClientCopy.PREFERENCES_TITLE) {
        if (ui.preferences.isEmpty() && ui.preferenceNotes.isEmpty()) {
            Text(
                ClientCopy.NO_PREFERENCES,
                style = MaterialTheme.typography.bodySmall,
                color = scheme.onSurfaceVariant,
            )
        } else {
            Text(
                ui.preferences.joinToString(" · "),
                style = MaterialTheme.typography.bodyMedium,
                color = scheme.onSurface,
            )
            ui.preferenceNotes.forEach {
                Text(
                    it,
                    style = MaterialTheme.typography.bodySmall,
                    color = scheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = 4.dp),
                )
            }
        }
    }

    SectionCard("At a glance") {
        ui.stats.forEach { (label, value) ->
            Row(Modifier.fillMaxWidth().padding(bottom = 4.dp)) {
                Text(
                    label,
                    style = MaterialTheme.typography.bodySmall,
                    color = scheme.onSurfaceVariant,
                    modifier = Modifier.weight(1f),
                )
                Text(value, style = MaterialTheme.typography.bodyMedium, color = scheme.onSurface)
            }
        }
        ui.currencyNote?.takeIf { ui.moneyExcludesACurrency }?.let {
            Text(
                "* $it",
                style = MaterialTheme.typography.bodySmall,
                color = scheme.onSurfaceVariant,
                modifier = Modifier.padding(top = 4.dp),
            )
        }
    }

    SectionCard(ClientCopy.HOUSEHOLD_TITLE) {
        if (ui.household.isEmpty()) {
            Text(
                ClientCopy.NO_HOUSEHOLD,
                style = MaterialTheme.typography.bodySmall,
                color = scheme.onSurfaceVariant,
            )
        } else {
            ui.household.forEach { h ->
                Text(h.name, style = MaterialTheme.typography.bodyMedium, color = scheme.onSurface)
                h.line?.let {
                    Text(
                        if (h.passportExpiringSoon) "$it · ${ClientCopy.PASSPORT_EXPIRING_SOON}" else it,
                        style = MaterialTheme.typography.bodySmall,
                        color = if (h.passportExpiringSoon) scheme.error else scheme.onSurfaceVariant,
                        modifier = Modifier.padding(bottom = 6.dp),
                    )
                }
            }
        }
    }
}

@Composable
private fun TripsTab(ui: ClientDetailUiState) {
    val scheme = MaterialTheme.colorScheme
    if (ui.trips.isEmpty()) {
        EmptyLine(ClientCopy.TRIPS_EMPTY)
        return
    }
    ui.trips.forEach { t ->
        Card(
            colors = CardDefaults.cardColors(containerColor = scheme.surfaceContainerLow),
            modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp),
        ) {
            Column(Modifier.padding(14.dp)) {
                Text(t.title, style = MaterialTheme.typography.titleSmall, color = scheme.onSurface)
                Text(t.line, style = MaterialTheme.typography.bodySmall, color = scheme.onSurfaceVariant)
                Text(
                    "${t.valueLabel} · ${ClientCopy.TRIP_COMMISSION_PREFIX} ${t.commissionLabel}",
                    style = MaterialTheme.typography.bodySmall,
                    color = scheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = 4.dp),
                )
            }
        }
    }
    // These cards are a dead end until §3.4 builds trip detail on this stack, and the
    // worklist already says so under its own trip rows. A reader who taps one here and gets
    // nothing had no way to tell whether that was the design or a bug.
    DeferralLine(AgentCopy.TRIP_DETAIL_DEFERRED)
}

@Composable
private fun ThreadsTab(ui: ClientDetailUiState) {
    val scheme = MaterialTheme.colorScheme
    if (ui.threads.isEmpty()) {
        EmptyLine(ClientCopy.THREADS_EMPTY)
        return
    }
    ui.threads.forEach { t ->
        Card(
            colors = CardDefaults.cardColors(containerColor = scheme.surfaceContainerLow),
            modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp),
        ) {
            Column(Modifier.padding(14.dp)) {
                Text(t.subject, style = MaterialTheme.typography.titleSmall, color = scheme.onSurface)
                t.preview?.let {
                    Text(it, style = MaterialTheme.typography.bodySmall, color = scheme.onSurfaceVariant)
                }
                Text(
                    if (t.unread > 0) "${t.whenLabel} · ${t.unread} unread" else t.whenLabel,
                    style = MaterialTheme.typography.bodySmall,
                    color = if (t.unread > 0) scheme.primary else scheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = 4.dp),
                )
            }
        }
    }
}

@Composable
private fun DocumentsTab(ui: ClientDetailUiState) {
    val scheme = MaterialTheme.colorScheme
    if (ui.documents.isEmpty()) {
        EmptyLine(ClientCopy.DOCUMENTS_EMPTY)
        return
    }
    ui.documents.forEach { d ->
        Card(
            colors = CardDefaults.cardColors(containerColor = scheme.surfaceContainerLow),
            modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp),
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp),
                modifier = Modifier.padding(14.dp),
            ) {
                Text(d.badge, style = LocalStoryTailBrandTypography.current.labelXS, color = scheme.primary)
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
                if (d.sensitive) {
                    Text(
                        ClientCopy.DOCUMENT_SENSITIVE,
                        style = MaterialTheme.typography.labelSmall,
                        color = scheme.onSurfaceVariant,
                    )
                }
            }
        }
    }
}

@Composable
private fun NotesTab(ui: ClientDetailUiState) {
    val scheme = MaterialTheme.colorScheme
    if (ui.notes.isEmpty()) {
        EmptyLine(ClientCopy.NOTES_EMPTY)
        return
    }
    ui.notes.forEach { n ->
        Card(
            colors = CardDefaults.cardColors(containerColor = scheme.surfaceContainerLow),
            modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp),
        ) {
            Column(Modifier.padding(14.dp)) {
                Text(
                    if (n.edited) "${n.whenLabel} · ${n.authorName} · ${ClientCopy.NOTE_EDITED_MARKER}"
                    else "${n.whenLabel} · ${n.authorName}",
                    style = MaterialTheme.typography.labelSmall,
                    color = scheme.onSurfaceVariant,
                )
                Text(
                    n.body,
                    style = MaterialTheme.typography.bodyMedium,
                    color = scheme.onSurface,
                    modifier = Modifier.padding(top = 4.dp),
                )
            }
        }
    }
}

@Composable
private fun ActivityTab(ui: ClientDetailUiState) {
    val scheme = MaterialTheme.colorScheme
    if (ui.activity.isEmpty()) {
        EmptyLine(ClientCopy.ACTIVITY_EMPTY)
        return
    }
    ui.activity.forEach { e ->
        Row(Modifier.fillMaxWidth().padding(vertical = 6.dp)) {
            Column(Modifier.weight(1f)) {
                Text(e.description, style = MaterialTheme.typography.bodyMedium, color = scheme.onSurface)
                e.actorName?.let {
                    Text(it, style = MaterialTheme.typography.bodySmall, color = scheme.onSurfaceVariant)
                }
            }
            Text(e.whenLabel, style = MaterialTheme.typography.bodySmall, color = scheme.onSurfaceVariant)
        }
    }
    Text(
        ClientCopy.ACTIVITY_NOTE,
        style = MaterialTheme.typography.bodySmall,
        color = scheme.onSurfaceVariant,
        modifier = Modifier.padding(top = 10.dp),
    )
}

@Composable
private fun DeferralLine(text: String) {
    Text(
        text,
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier.padding(top = 4.dp, bottom = 8.dp).alpha(0.7f),
    )
}

/**
 * ONLY WHERE THERE IS SOMETHING TO EXPLAIN. This is where the tab departs from the
 * worklist, whose `Section` prints its deferral whether it holds rows or not: those
 * sections are permanent fixtures, and this is a tab that has already said "No trips yet".
 * Following that with "Trip detail arrives with §3.4." answers a question nobody asked
 * about rows that are not on screen.
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
private fun DetailPanel(title: String, body: String) {
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
        }
    }
}

/** A layout-shaped skeleton, never a spinner on blank (§5). */
@Composable
private fun DetailSkeleton() {
    val scheme = MaterialTheme.colorScheme
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        repeat(4) {
            Surface(
                color = scheme.surfaceContainerLow,
                shape = MaterialTheme.shapes.medium,
                modifier = Modifier.fillMaxWidth().height(72.dp),
            ) {}
        }
    }
}
