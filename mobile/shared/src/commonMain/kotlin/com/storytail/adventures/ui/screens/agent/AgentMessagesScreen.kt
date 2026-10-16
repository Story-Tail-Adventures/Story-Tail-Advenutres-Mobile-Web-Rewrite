package com.storytail.adventures.ui.screens.agent

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.storytail.adventures.domain.agent.AgentInboxRowUi
import com.storytail.adventures.domain.agent.AgentMessagesCopy
import com.storytail.adventures.domain.trip.Loadable
import com.storytail.adventures.ui.components.ChipRow
import com.storytail.adventures.ui.components.StoryTailGlyph
import com.storytail.adventures.ui.components.StoryTailMark
import com.storytail.adventures.ui.components.agent.AgentScaffold
import com.storytail.adventures.ui.components.agent.AgentTopBar
import com.storytail.adventures.ui.theme.LocalStoryTailBrandTypography
import com.storytail.adventures.ui.theme.PillShape
import com.storytail.adventures.ui.theme.StoryTailBrand

/** What the inbox draws, already mapped (`agentInboxRow`). */
data class AgentInboxUiState(
    /** "2 unread · 1 overdue", or "All caught up". */
    val headline: String,
    val archivedCount: Int,
    val rows: List<AgentInboxRowUi>,
    val total: Int,
) {
    val hasMore: Boolean get() = rows.size < total
}

/**
 * Screen 3.10.1 on the phone (3.10m.1, `M3101_Inbox` in agent-messages-mobile.jsx). The root
 * of the Messages tab, §6.6's third destination. Pattern B: the list only; a thread is a push.
 *
 * SEARCH IS VISIBLE, as on the Clients tab: finding one client's thread by name is the task.
 * Two chips (Unread, Overdue) and an Archived link, nothing else. NO BULK SELECT (desk work)
 * and NO SWIPE-TO-ARCHIVE (a swipe is easy to do by accident): archive lives in the thread's
 * header. The rows APPEND (load more) rather than page, and pull-to-refresh plus a reload on
 * return stand in for the live feed this stack does not have (Gyasi, 2026-10-14).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AgentMessagesScreen(
    state: Loadable<AgentInboxUiState>,
    refreshing: Boolean,
    onRefresh: () -> Unit,
    search: String,
    onSearchChange: (String) -> Unit,
    unreadOnly: Boolean,
    overdueOnly: Boolean,
    onToggleFilter: (String) -> Unit,
    archived: Boolean,
    onToggleArchived: () -> Unit,
    onLoadMore: () -> Unit,
    onOpenThread: (String) -> Unit,
    onSelectTab: (String) -> Unit,
    onSignOut: () -> Unit,
    modifier: Modifier = Modifier,
) {
    AgentScaffold(
        modifier = modifier,
        topBar = {
            AgentTopBar(
                title = if (archived) AgentMessagesCopy.VIEW_ARCHIVED else AgentMessagesCopy.TITLE,
                onSignOut = onSignOut,
            )
        },
        activeTab = "messages",
        onSelectTab = onSelectTab,
        // A LazyColumn owns the scrolling, so the scaffold's own must be off (ThreadScreen's note).
        scrollable = false,
    ) {
        PullToRefreshBox(
            isRefreshing = refreshing,
            onRefresh = onRefresh,
            modifier = Modifier.fillMaxSize(),
        ) {
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 14.dp, bottom = 16.dp),
            ) {
                // §3.10.7, ruling 7: the opt-in sits at the top of the inbox until answered.
                if (!archived) item(key = "notify") { AgentNotifyCard() }
                item(key = "controls") {
                    InboxControls(
                        search = search,
                        onSearchChange = onSearchChange,
                        unreadOnly = unreadOnly,
                        overdueOnly = overdueOnly,
                        onToggleFilter = onToggleFilter,
                        archived = archived,
                        archivedCount = (state as? Loadable.Ready)?.value?.archivedCount ?: 0,
                        onToggleArchived = onToggleArchived,
                    )
                }
                when (state) {
                    is Loadable.Loading -> item(key = "loading") {
                        Box(Modifier.fillMaxWidth().padding(32.dp), contentAlignment = Alignment.Center) {
                            CircularProgressIndicator(color = MaterialTheme.colorScheme.primary)
                        }
                    }
                    is Loadable.Failed -> item(key = "failed") {
                        InboxPanel(AgentMessagesCopy.LOAD_FAILED_TITLE, AgentMessagesCopy.LOAD_FAILED_BODY, onRetry = onRefresh)
                    }
                    is Loadable.Unauthorized -> item(key = "unauthorized") {
                        InboxPanel("This is the advisor's side", "Your account does not have access to the inbox.")
                    }
                    is Loadable.Empty -> item(key = "empty") { InboxPanel(state.title, state.body) }
                    is Loadable.Ready -> {
                        val ui = state.value
                        item(key = "headline") {
                            Text(
                                ui.headline,
                                style = LocalStoryTailBrandTypography.current.labelXS,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.padding(bottom = 8.dp),
                            )
                        }
                        if (ui.rows.isEmpty()) {
                            item(key = "none") {
                                InboxPanel(
                                    title = when {
                                        archived -> AgentMessagesCopy.EMPTY_ARCHIVED
                                        search.isNotBlank() || unreadOnly || overdueOnly -> AgentMessagesCopy.EMPTY_NARROWED
                                        else -> AgentMessagesCopy.CAUGHT_UP
                                    },
                                    body = if (archived || search.isNotBlank() || unreadOnly || overdueOnly) "" else AgentMessagesCopy.EMPTY_INBOX,
                                )
                            }
                        }
                        inboxRowItems(ui.rows, onOpenThread)
                        if (ui.hasMore) {
                            item(key = "more") {
                                OutlinedButton(
                                    onClick = onLoadMore,
                                    modifier = Modifier.fillMaxWidth().padding(top = 12.dp),
                                ) {
                                    Text("${AgentMessagesCopy.LOAD_MORE} · ${ui.rows.size} of ${ui.total}")
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

/** Rows as one card, divided, as M3101 draws them. */
private fun androidx.compose.foundation.lazy.LazyListScope.inboxRowItems(
    rows: List<AgentInboxRowUi>,
    onOpenThread: (String) -> Unit,
) {
    items(rows, key = { it.conversationId }) { row ->
        val first = rows.firstOrNull()?.conversationId == row.conversationId
        val last = rows.lastOrNull()?.conversationId == row.conversationId
        val shape = RoundedCornerShape(
            topStart = if (first) 16.dp else 0.dp,
            topEnd = if (first) 16.dp else 0.dp,
            bottomStart = if (last) 16.dp else 0.dp,
            bottomEnd = if (last) 16.dp else 0.dp,
        )
        Column(Modifier.fillMaxWidth().background(MaterialTheme.colorScheme.surfaceContainerLow, shape)) {
            if (!first) HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
            InboxRow(row, onOpenThread)
        }
    }
}

@Composable
private fun InboxControls(
    search: String,
    onSearchChange: (String) -> Unit,
    unreadOnly: Boolean,
    overdueOnly: Boolean,
    onToggleFilter: (String) -> Unit,
    archived: Boolean,
    archivedCount: Int,
    onToggleArchived: () -> Unit,
) {
    TextField(
        value = search,
        onValueChange = onSearchChange,
        singleLine = true,
        placeholder = { Text(AgentMessagesCopy.SEARCH_PLACEHOLDER) },
        leadingIcon = { StoryTailGlyph(StoryTailMark.SEARCH, 15.dp, MaterialTheme.colorScheme.onSurfaceVariant) },
        shape = PillShape,
        colors = TextFieldDefaults.colors(
            focusedIndicatorColor = Color.Transparent,
            unfocusedIndicatorColor = Color.Transparent,
            disabledIndicatorColor = Color.Transparent,
        ),
        modifier = Modifier.fillMaxWidth(),
    )
    Spacer(Modifier.height(10.dp))
    Row(verticalAlignment = Alignment.CenterVertically) {
        if (!archived) {
            ChipRow(
                options = listOf(
                    AgentMessagesCopy.FILTER_UNREAD to "unread",
                    AgentMessagesCopy.FILTER_OVERDUE to "overdue",
                ),
                selected = buildSet {
                    if (unreadOnly) add("unread")
                    if (overdueOnly) add("overdue")
                },
                onToggle = onToggleFilter,
                modifier = Modifier.weight(1f),
            )
        } else {
            Spacer(Modifier.weight(1f))
        }
        TextButton(onClick = onToggleArchived, modifier = Modifier.heightIn(min = 48.dp)) {
            Text(
                if (archived) {
                    AgentMessagesCopy.VIEW_INBOX
                } else if (archivedCount > 0) {
                    "${AgentMessagesCopy.VIEW_ARCHIVED} ($archivedCount)"
                } else {
                    AgentMessagesCopy.VIEW_ARCHIVED
                },
            )
        }
    }
    Spacer(Modifier.height(4.dp))
}

@Composable
private fun InboxRow(row: AgentInboxRowUi, onOpenThread: (String) -> Unit) {
    val scheme = MaterialTheme.colorScheme
    val type = LocalStoryTailBrandTypography.current
    Row(
        Modifier
            .fillMaxWidth()
            .clickable { onOpenThread(row.conversationId) }
            .padding(horizontal = 14.dp, vertical = 13.dp),
        horizontalArrangement = Arrangement.spacedBy(11.dp),
        verticalAlignment = Alignment.Top,
    ) {
        Surface(shape = CircleShape, color = scheme.secondaryContainer, modifier = Modifier.size(38.dp)) {
            Box(contentAlignment = Alignment.Center) {
                Text(row.initials, style = type.labelXS, color = scheme.onSecondaryContainer)
            }
        }
        Column(Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    row.clientName,
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = if (row.unread > 0) FontWeight.Bold else FontWeight.SemiBold,
                    color = scheme.onSurface,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f),
                )
                Text(row.timeLabel, style = MaterialTheme.typography.bodySmall, color = scheme.onSurfaceVariant)
            }
            Text(
                row.preview,
                style = MaterialTheme.typography.bodySmall,
                color = if (row.unread > 0) scheme.onSurface else scheme.onSurfaceVariant,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.padding(top = 2.dp),
            )
            Row(
                Modifier.padding(top = 7.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    row.tripLabel.uppercase(),
                    style = type.labelXS,
                    color = StoryTailBrand.Orange,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f, fill = false),
                )
                DueChip(overdue = row.overdue, replyBy = row.replyByLabel)
            }
        }
        if (row.unread > 0) {
            Box(
                Modifier
                    .padding(top = 2.dp)
                    .widthIn(min = 20.dp)
                    .height(20.dp)
                    .background(StoryTailBrand.Orange, PillShape)
                    .padding(horizontal = 6.dp)
                    .semantics { contentDescription = "${row.unread} unread" },
                contentAlignment = Alignment.Center,
            ) {
                Text("${row.unread}", style = type.labelXS, color = Color.White)
            }
        }
    }
}

/** Overdue reads as an error; "Reply by Tue" is a quiet outline. Shared with the thread header. */
@Composable
internal fun DueChip(overdue: Boolean, replyBy: String?) {
    val scheme = MaterialTheme.colorScheme
    val type = LocalStoryTailBrandTypography.current
    when {
        overdue -> Box(
            Modifier.background(scheme.errorContainer, PillShape).padding(horizontal = 8.dp, vertical = 3.dp),
        ) {
            Text(AgentMessagesCopy.OVERDUE, style = type.labelXS, color = scheme.onErrorContainer)
        }
        replyBy != null -> Box(
            Modifier
                .background(scheme.surfaceContainerHigh, PillShape)
                .padding(horizontal = 8.dp, vertical = 3.dp),
        ) {
            Text(replyBy, style = type.labelXS, color = scheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun InboxPanel(title: String, body: String, onRetry: (() -> Unit)? = null) {
    val scheme = MaterialTheme.colorScheme
    Column(
        Modifier
            .fillMaxWidth()
            .padding(top = 8.dp)
            .background(scheme.surfaceContainerLow, RoundedCornerShape(16.dp))
            .padding(20.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        StoryTailGlyph(StoryTailMark.MESSAGE, 22.dp, scheme.onSurfaceVariant)
        Spacer(Modifier.height(10.dp))
        Text(title, style = MaterialTheme.typography.titleSmall, color = scheme.onSurface)
        if (body.isNotEmpty()) {
            Spacer(Modifier.height(4.dp))
            Text(body, style = MaterialTheme.typography.bodySmall, color = scheme.onSurfaceVariant)
        }
        if (onRetry != null) {
            Spacer(Modifier.height(10.dp))
            OutlinedButton(onClick = onRetry) { Text(AgentMessagesCopy.TRY_AGAIN) }
        }
    }
}
