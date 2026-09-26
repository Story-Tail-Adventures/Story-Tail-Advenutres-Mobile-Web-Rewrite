package com.storytail.adventures.ui.screens.agent

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.storytail.adventures.domain.agent.AGENT_BAR_DESTINATIONS
import com.storytail.adventures.domain.agent.ClientCopy
import com.storytail.adventures.domain.trip.Loadable
import com.storytail.adventures.ui.components.ChipRow
import com.storytail.adventures.ui.components.agent.AgentScaffold
import com.storytail.adventures.ui.components.agent.AgentTopBar
import com.storytail.adventures.ui.theme.LocalStoryTailBrandTypography
import com.storytail.adventures.ui.theme.PillShape

/**
 * Screen 3.3.1 — the client roster, on a phone. The second agent screen, and the second
 * destination on §6.6's bar.
 *
 * PATTERN B MOBILE (§4.4): a vertical list of cards, one client per row, each carrying
 * primary info, secondary info and one figure. The web half of the same pattern is a true
 * data table with five columns and a paginator; this is not that table restyled, and
 * `ClientRosterTable.tsx` records why the two are separate trees rather than one.
 *
 * ── SEARCH IS VISIBLE, NOT BEHIND AN ICON ──────────────────────────────────────
 *
 * §4.4's Pattern B mobile says "filter and search collapsed behind icon buttons", and this
 * screen departs from it deliberately. §6.6 scopes the agent's phone to "on-the-go tasks
 * rather than deep work", and for a roster the on-the-go task IS the search: an advisor
 * reaching for their phone wants one client, by name, now. Putting the only control that
 * serves that behind a tap to save 56dp inverts the section's own purpose. The FILTERS are
 * collapsed as the pattern asks — two status chips, no tag facets, because a twelve-chip
 * facet row is the desk half's affordance.
 *
 * ── NO PAGINATOR ───────────────────────────────────────────────────────────────
 *
 * The web build pages with Previous/Next, which is Pattern B's desk half. Here the list
 * appends. Paging a book of business back and forth on a phone is deep work by another
 * name, and the count line plus search already answer "is the one I want in here".
 *
 * ── WHAT IS NOT HERE, AND WHY IT IS CUT RATHER THAN DISABLED ───────────────────
 *
 *  * ROWS TAP INTO §3.3.2 as of 2026-09-26. Until the detail screen existed they were
 *    plain list items, on the worklist's rule that a row wired to nothing is worse than a
 *    row that is plainly not tappable. It exists now.
 *  * NO "NEW CLIENT". §3.3.9 is a form, which is the definition of deep work. Web has it
 *    disabled-with-a-reason because it has the room for the sentence.
 *  * NO TAG FILTER, NO BULK SELECT. Desk affordances both.
 *
 * Every row is a NAMED PERSON, not a record — Design-System §2.6's conviction.
 */
@Composable
fun ClientRosterScreen(
    state: Loadable<ClientRosterUiState>,
    onOpenClient: (String) -> Unit,
    search: String,
    onSearchChange: (String) -> Unit,
    status: String,
    onStatusChange: (String) -> Unit,
    onLoadMore: () -> Unit,
    onSelectTab: (String) -> Unit,
    /**
     * Carried here as well as on the worklist, and that is a decision rather than a copy.
     *
     * [AgentTopBar]'s own note says the second agent screen must decide where its sign-out
     * lives rather than inherit a silent no-op. §3.12 still has not built More, so this is
     * still the only place an advisor can end a session — and a tab that could strand them
     * with no way out would be worse on iOS, where `PlatformBackHandler` is a deliberate
     * no-op and there is no system exit at all. When More lands, both bars lose it together.
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
                title = AGENT_BAR_DESTINATIONS.first { it.id == "clients" }.label,
                onSignOut = onSignOut,
            )
        },
        activeTab = "clients",
        onSelectTab = onSelectTab,
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 14.dp),
    ) {
        RosterControls(
            search = search,
            onSearchChange = onSearchChange,
            status = status,
            onStatusChange = onStatusChange,
        )

        when (state) {
            is Loadable.Loading -> RosterSkeleton()
            is Loadable.Failed -> RosterPanel(
                title = "That didn't load",
                body = "Something went wrong on our side, not yours. Trying again usually sorts it.",
            )
            is Loadable.Unauthorized -> RosterPanel(
                title = "This is the advisor's side",
                body = "Your account does not have access to the roster.",
            )
            is Loadable.Empty -> RosterPanel(title = state.title, body = state.body)
            is Loadable.Ready -> RosterBody(
                ui = state.value,
                searching = search.isNotBlank(),
                status = status,
                onLoadMore = onLoadMore,
                onOpenClient = onOpenClient,
            )
        }
    }
}

@Composable
private fun RosterControls(
    search: String,
    onSearchChange: (String) -> Unit,
    status: String,
    onStatusChange: (String) -> Unit,
) {
    TextField(
        value = search,
        onValueChange = onSearchChange,
        singleLine = true,
        placeholder = { Text(ClientCopy.SEARCH_PLACEHOLDER) },
        shape = PillShape,
        colors = TextFieldDefaults.colors(
            // The underline is the one Material default that reads as a seam here: the field
            // sits directly above a chip row and a card list, and a rule under it makes the
            // three look like one control.
            focusedIndicatorColor = androidx.compose.ui.graphics.Color.Transparent,
            unfocusedIndicatorColor = androidx.compose.ui.graphics.Color.Transparent,
            disabledIndicatorColor = androidx.compose.ui.graphics.Color.Transparent,
        ),
        modifier = Modifier.fillMaxWidth(),
    )
    Spacer(Modifier.height(10.dp))
    ChipRow(
        // (label, value), and asserted as such — see ROSTER_STATUS_OPTIONS.
        options = ROSTER_STATUS_OPTIONS,
        // A radio pair, not two checkboxes: a client is active or archived and never both,
        // and a control that can express an impossible state will be asked to.
        selected = setOf(status),
        onToggle = { onStatusChange(it) },
    )
    Spacer(Modifier.height(12.dp))
}

@Composable
private fun RosterBody(
    ui: ClientRosterUiState,
    searching: Boolean,
    status: String,
    onLoadMore: () -> Unit,
    onOpenClient: (String) -> Unit,
) {
    val type = LocalStoryTailBrandTypography.current
    val scheme = MaterialTheme.colorScheme

    if (ui.rows.isEmpty()) {
        RosterPanel(
            title = when {
                searching -> ClientCopy.EMPTY_FILTERED_TITLE
                status == "archived" -> ClientCopy.EMPTY_ARCHIVED_TITLE
                else -> ClientCopy.EMPTY_TITLE
            },
            body = when {
                searching -> ClientCopy.EMPTY_FILTERED_BODY
                status == "archived" -> ClientCopy.EMPTY_ARCHIVED_BODY
                else -> ClientCopy.EMPTY_BODY
            },
        )
        return
    }

    Text(
        text = ui.subtitle,
        style = type.labelXS,
        color = scheme.onSurfaceVariant,
        modifier = Modifier.padding(bottom = 10.dp),
    )

    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        ui.rows.forEach { row -> RosterRow(row, onOpenClient) }
    }

    // The note §3.2's currency rule requires: one figure names one currency, and where it
    // left others out the screen says so rather than letting a number imply a total.
    ui.currencyNote?.let { note ->
        Text(
            text = "* $note",
            style = MaterialTheme.typography.bodySmall,
            color = scheme.onSurfaceVariant,
            modifier = Modifier.padding(top = 10.dp),
        )
    }

    if (ui.hasMore) {
        OutlinedButton(
            onClick = onLoadMore,
            modifier = Modifier.fillMaxWidth().padding(top = 12.dp),
        ) {
            Text("${ClientCopy.LOAD_MORE} · ${ui.rows.size} of ${ui.total}")
        }
    }
}

@Composable
private fun RosterRow(row: RosterRowUi, onOpenClient: (String) -> Unit) {
    val type = LocalStoryTailBrandTypography.current
    val scheme = MaterialTheme.colorScheme

    Card(
        colors = CardDefaults.cardColors(containerColor = scheme.surfaceContainerLow),
        modifier = Modifier.fillMaxWidth().clickable { onOpenClient(row.clientId) },
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            modifier = Modifier.padding(horizontal = 14.dp, vertical = 12.dp),
        ) {
            Surface(
                shape = CircleShape,
                color = scheme.secondaryContainer,
                modifier = Modifier.size(36.dp),
            ) {
                Row(
                    horizontalArrangement = Arrangement.Center,
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(
                        text = row.initials,
                        style = type.labelXS,
                        color = scheme.onSecondaryContainer,
                    )
                }
            }

            Column(Modifier.weight(1f)) {
                Text(
                    text = row.displayName,
                    style = MaterialTheme.typography.titleSmall,
                    color = scheme.onSurface,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    text = row.contactLine,
                    style = MaterialTheme.typography.bodySmall,
                    color = scheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                row.tripLine?.let { line ->
                    Text(
                        text = line,
                        style = MaterialTheme.typography.bodySmall,
                        // A client who is travelling right now is the one thing on this
                        // screen worth a colour.
                        color = if (row.travellingNow) scheme.primary else scheme.onSurfaceVariant,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.padding(top = 2.dp),
                    )
                }
            }

            Text(
                text = row.lifetimeLabel?.let { if (row.lifetimeExcludesACurrency) "$it*" else it }
                    ?: ClientCopy.NO_LIFETIME,
                style = type.labelXS,
                color = scheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun RosterPanel(title: String, body: String) {
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
private fun RosterSkeleton() {
    val scheme = MaterialTheme.colorScheme
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        repeat(5) {
            Surface(
                color = scheme.surfaceContainerLow,
                shape = MaterialTheme.shapes.medium,
                modifier = Modifier.fillMaxWidth().height(68.dp),
            ) {}
        }
    }
}
