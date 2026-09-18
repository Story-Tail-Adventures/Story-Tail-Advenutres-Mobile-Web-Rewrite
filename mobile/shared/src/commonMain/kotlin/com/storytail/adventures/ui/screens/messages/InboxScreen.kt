package com.storytail.adventures.ui.screens.messages

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.storytail.adventures.domain.messages.InboxRowView
import com.storytail.adventures.domain.messages.MessagesMessages
import com.storytail.adventures.domain.trip.Loadable
import com.storytail.adventures.ui.components.StoryTailGlyph
import com.storytail.adventures.ui.components.StoryTailMark
import com.storytail.adventures.ui.components.client.ClientEmptyState
import com.storytail.adventures.ui.components.client.ClientErrorState
import com.storytail.adventures.ui.components.client.ClientScaffold
import com.storytail.adventures.ui.theme.PillShape
import com.storytail.adventures.ui.theme.StoryTailBrand
import com.storytail.adventures.ui.theme.StoryTailRadius

/**
 * Screen 2.6.1 Messages Inbox — docs/Screen-Inventory.md §2.6.1, §4.4 (Pattern **B**: on mobile
 * the list only, the thread is a push), and
 * design/source-prototype/screens/client-messaging-mobile.jsx (M261_Inbox). P1.
 *
 * THE TAB ROOT, so it carries `MClientTabs` — the only §2.6 frame that does. 2.6.2 and 2.6.3
 * are pushed on top of it with a back bar.
 *
 * WHAT THE DESKTOP FRAME HAS THAT THIS DOES NOT, all of it recorded as departures in the
 * artboard rather than quietly dropped:
 *
 *  · The `All / Unread · 2 / By trip` filter chips. `conversation.client_unread_count` is
 *    granted and IS rendered as the badge below, but no runtime path in this repo ever raises
 *    it: `trip-message` sets it to 0 at creation and only ever increments the agent's side, and
 *    the one place it is non-zero is `seed.sql`. So an "Unread" filter sorts nothing in a real
 *    account. It arrives with the agent send path in §3.x, and so does clearing the badge.
 *  · The two "System" threads (departure 5). `conversation.agent_id` is NOT NULL and
 *    `user_role` is ('client','agent','admin') — there is no system sender, so those rows
 *    cannot exist.
 *  · An archive action (departure 9). This one departs from the SPEC rather than the frame:
 *    `conversation_self_select` carries `archived_at IS NULL`, so a client cannot read an
 *    archived thread at all — archiving from here would make it vanish with no way back.
 *  · Gyasi's photograph, which is a stock portrait of a stranger. Initials, everywhere.
 */
@Composable
fun InboxScreen(
    state: Loadable<List<InboxRowView>>,
    query: String,
    onQueryChange: (String) -> Unit,
    onOpenThread: (String) -> Unit,
    onNewMessage: () -> Unit,
    onSelectTab: (String) -> Unit,
    onRetry: () -> Unit,
    modifier: Modifier = Modifier,
) {
    ClientScaffold(
        modifier = modifier,
        activeTab = "messages",
        onSelectTab = onSelectTab,
        // A LazyColumn owns the scrolling. Nesting it in the scaffold's own scroll would give
        // the list an infinite height constraint and windowing would stop working entirely.
        scrollable = false,
    ) {
        InboxHeader(
            query = query,
            onQueryChange = onQueryChange,
            onNewMessage = onNewMessage,
            // Search earns its place only once there is something to search. One thread and a
            // search field is furniture.
            showSearch = (state as? Loadable.Ready)?.value?.size?.let { it > 1 } == true,
        )

        when (state) {
            is Loadable.Loading ->
                Box(Modifier.fillMaxWidth().weight(1f), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = MaterialTheme.colorScheme.primary)
                }

            is Loadable.Failed ->
                Column(Modifier.fillMaxWidth().weight(1f).padding(horizontal = 16.dp)) {
                    ClientErrorState(
                        title = "We could not open your messages",
                        body = "The connection dropped on the way. Try again in a moment.",
                        retryLabel = "Try again",
                        onRetry = onRetry,
                    )
                }

            // Listed rather than folded into an `else` — see the note in DocumentsScreen.
            is Loadable.Unauthorized, is Loadable.Empty ->
                Column(Modifier.fillMaxWidth().weight(1f).padding(16.dp)) {
                    ClientEmptyState(
                        title = MessagesMessages.EMPTY_TITLE,
                        body = MessagesMessages.EMPTY_BODY,
                        mark = StoryTailMark.MESSAGE,
                    )
                }

            is Loadable.Ready -> {
                val rows = state.value
                if (rows.isEmpty()) {
                    // A SEARCH MISS IS NOT AN EMPTY INBOX. Offering "Send Gyasi a message" to
                    // somebody who typed three letters that matched nothing answers a question
                    // they did not ask.
                    if (query.isNotBlank()) {
                        Text(
                            MessagesMessages.SEARCH_EMPTY,
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.fillMaxWidth().padding(24.dp),
                        )
                    } else {
                        Column(Modifier.fillMaxWidth().weight(1f).padding(16.dp)) {
                            ClientEmptyState(
                                title = MessagesMessages.EMPTY_TITLE,
                                body = MessagesMessages.EMPTY_BODY,
                                mark = StoryTailMark.MESSAGE,
                            )
                        }
                    }
                } else {
                    LazyColumn(Modifier.fillMaxWidth().weight(1f)) {
                        items(rows, key = { it.id }) { row ->
                            InboxRow(row = row, onOpen = { onOpenThread(row.id) })
                            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun InboxHeader(
    query: String,
    onQueryChange: (String) -> Unit,
    onNewMessage: () -> Unit,
    showSearch: Boolean,
) {
    val scheme = MaterialTheme.colorScheme
    Column(Modifier.fillMaxWidth().padding(start = 16.dp, end = 16.dp, top = 14.dp)) {
        Text(
            MessagesMessages.TITLE,
            style = MaterialTheme.typography.headlineSmall,
            color = scheme.onSurface,
        )
        Text(
            MessagesMessages.SUBTITLE,
            style = MaterialTheme.typography.bodySmall,
            color = scheme.onSurfaceVariant,
        )

        Spacer(Modifier.height(12.dp))

        // The artboard draws this full-width, and it is the ONLY route into 2.6.3 on either
        // stack — the desktop frame draws no entry point at all, which would leave a built
        // screen reachable only by typing a URL.
        Row(
            Modifier
                .fillMaxWidth()
                // §4.2's touch floor. Material3's default height is 40dp, which is under it.
                .heightIn(min = 48.dp)
                .background(scheme.primary, PillShape)
                .clickable(onClick = onNewMessage),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.Center,
        ) {
            StoryTailGlyph(StoryTailMark.MESSAGE, 16.dp, scheme.onPrimary)
            Spacer(Modifier.width(8.dp))
            Text(
                MessagesMessages.NEW_CTA,
                style = MaterialTheme.typography.labelLarge,
                color = scheme.onPrimary,
            )
        }

        if (showSearch) {
            Spacer(Modifier.height(10.dp))
            OutlinedTextField(
                value = query,
                onValueChange = onQueryChange,
                singleLine = true,
                placeholder = {
                    Text(
                        MessagesMessages.SEARCH_PLACEHOLDER,
                        style = MaterialTheme.typography.bodyMedium,
                    )
                },
                shape = RoundedCornerShape(StoryTailRadius.lg),
                modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp),
            )
        }

        Spacer(Modifier.height(10.dp))
    }
}

@Composable
private fun InboxRow(row: InboxRowView, onOpen: () -> Unit) {
    val scheme = MaterialTheme.colorScheme
    Row(
        Modifier
            .fillMaxWidth()
            .heightIn(min = 48.dp)
            .clickable(onClick = onOpen)
            .padding(horizontal = 16.dp, vertical = 12.dp),
    ) {
        Box(
            Modifier.size(34.dp).background(StoryTailBrand.Burgundy, PillShape),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                MessagesMessages.ADVISOR_INITIALS,
                color = Color.White,
                fontSize = 12.sp,
                fontWeight = FontWeight.Bold,
            )
        }

        Spacer(Modifier.width(10.dp))

        Column(Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    row.title,
                    style = MaterialTheme.typography.titleSmall,
                    fontSize = 13.sp,
                    color = scheme.onSurface,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f),
                )
                Spacer(Modifier.width(8.dp))
                Text(
                    row.time,
                    style = MaterialTheme.typography.bodySmall,
                    color = scheme.onSurfaceVariant,
                )
            }

            if (row.preview.isNotEmpty()) {
                Text(
                    row.preview,
                    style = MaterialTheme.typography.bodySmall,
                    color = scheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }

            // Dropped when the title IS the trip, which is the common case: `trip-message`
            // copies the trip title into `subject` and `inboxTitle` prefers the live trip
            // name, so printing it twice is noise.
            if (row.tripLabel != null && row.tripLabel != row.title) {
                Spacer(Modifier.height(4.dp))
                Text(
                    row.tripLabel,
                    style = MaterialTheme.typography.labelSmall,
                    fontSize = 9.5.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = StoryTailBrand.Orange,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }

        if (row.unreadCount > 0) {
            Spacer(Modifier.width(8.dp))
            Box(
                Modifier
                    .heightIn(min = 20.dp)
                    .background(StoryTailBrand.Orange, PillShape)
                    .padding(horizontal = 7.dp, vertical = 2.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    row.unreadCount.toString(),
                    color = Color.White,
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Bold,
                )
            }
        }
    }
}
