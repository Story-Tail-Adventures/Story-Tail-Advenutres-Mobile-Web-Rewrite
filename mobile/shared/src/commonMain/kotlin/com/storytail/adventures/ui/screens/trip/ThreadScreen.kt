package com.storytail.adventures.ui.screens.trip

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.storytail.adventures.api.ThreadMessageView
import com.storytail.adventures.api.TripThreadSnapshot
import com.storytail.adventures.domain.trip.DocumentBadge
import com.storytail.adventures.domain.trip.Loadable
import com.storytail.adventures.domain.trip.MessageSender
import com.storytail.adventures.domain.trip.QUICK_REPLIES
import com.storytail.adventures.domain.trip.ThreadMessages
import com.storytail.adventures.domain.trip.documentBadge
import com.storytail.adventures.domain.trip.formatFileSize
import com.storytail.adventures.domain.trip.formatMessageTime
import com.storytail.adventures.domain.trip.groupMessagesByDay
import com.storytail.adventures.ui.components.StoryTailGlyph
import com.storytail.adventures.ui.components.StoryTailMark
import com.storytail.adventures.ui.components.client.ClientEmptyState
import com.storytail.adventures.ui.components.client.ClientErrorState
import com.storytail.adventures.ui.components.client.ClientScaffold
import com.storytail.adventures.ui.theme.PillShape
import com.storytail.adventures.ui.theme.StoryTailBrand
import com.storytail.adventures.ui.theme.StoryTailRadius
import kotlinx.datetime.LocalDate

/**
 * Screen 2.2.7 Trip Messages / Conversation Thread — docs/Screen-Inventory.md §2.2.7, §4.4
 * ("mobile is full-screen"), and design/source-prototype/screens/client-trip-mobile.jsx
 * (M227_TripThread). P1.
 *
 * THE COMPOSE BAR IS THE LAST CHILD OF THE COLUMN, not an overlay on the list — the same
 * structural rule `ClientScaffold` documents for the bottom bar, and for the same reason: a
 * sibling cannot cover content, because the list's `weight(1f)` already excludes it. The web
 * twin had to be talked into this with a `.client-fill` opt-in because the DOM had no
 * definite height to work from; Compose gives it for free, and this is the version that
 * cannot regress.
 *
 * `scrollable = false` on the scaffold, because a LazyColumn owns the scrolling here. Nesting
 * one inside the scaffold's own `verticalScroll` would give the list an infinite height
 * constraint and it would render every message with no windowing at all.
 *
 * NO TAB BAR. This is a pushed screen — §4.4 says "mobile is full-screen" — so `activeTab`
 * stays null and the compose bar owns the bottom.
 *
 * TWO NAMED PRIMARY ELEMENTS ARE ABSENT, and see TripThread.kt for the full reasoning: the
 * typing indicator needs Realtime presence that nothing backs, and read receipts would need
 * `message.read_by_other_at`, which is withheld from the client column grant on purpose.
 */
@Composable
fun ThreadScreen(
    state: Loadable<TripThreadSnapshot>,
    draft: String,
    sending: Boolean,
    sendError: String?,
    today: LocalDate,
    onDraftChange: (String) -> Unit,
    onSend: () -> Unit,
    onBack: () -> Unit,
    onOpenTrip: () -> Unit,
    onRetry: () -> Unit,
    modifier: Modifier = Modifier,
) {
    ClientScaffold(modifier = modifier, scrollable = false) {
        when (state) {
            is Loadable.Loading -> {
                ThreadHeader(title = null, subtitle = null, onBack = onBack, onOpenTrip = null)
                Box(Modifier.fillMaxWidth().weight(1f), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = MaterialTheme.colorScheme.primary)
                }
            }

            is Loadable.Failed -> {
                ThreadHeader(title = null, subtitle = null, onBack = onBack, onOpenTrip = null)
                Column(Modifier.fillMaxWidth().weight(1f).padding(horizontal = 16.dp)) {
                    ClientErrorState(
                        title = "We could not open this conversation",
                        body = "The connection dropped on the way. Try again in a moment.",
                        retryLabel = "Try again",
                        onRetry = onRetry,
                    )
                }
            }

            // Listed rather than folded into an `else` — see the note in DocumentsScreen.
            is Loadable.Unauthorized, is Loadable.Empty -> {
                ThreadHeader(title = null, subtitle = null, onBack = onBack, onOpenTrip = null)
                Column(Modifier.fillMaxWidth().weight(1f).padding(16.dp)) {
                    ClientEmptyState(
                        title = ThreadMessages.EMPTY_TITLE,
                        body = ThreadMessages.EMPTY_BODY,
                        mark = StoryTailMark.MESSAGE,
                    )
                }
            }

            is Loadable.Ready -> {
                val thread = state.value
                ThreadHeader(
                    title = "Gyasi · ${thread.tripTitle}",
                    subtitle = if (thread.unreadCount > 0) {
                        if (thread.unreadCount == 1) "1 new message" else "${thread.unreadCount} new messages"
                    } else {
                        ThreadMessages.REPLY_WINDOW
                    },
                    onBack = onBack,
                    onOpenTrip = onOpenTrip,
                )
                ThreadList(thread = thread, today = today, modifier = Modifier.weight(1f))
                Composer(
                    draft = draft,
                    sending = sending,
                    sendError = sendError,
                    onDraftChange = onDraftChange,
                    onSend = onSend,
                )
            }
        }
    }
}

@Composable
private fun ThreadHeader(
    title: String?,
    subtitle: String?,
    onBack: () -> Unit,
    onOpenTrip: (() -> Unit)?,
) {
    val scheme = MaterialTheme.colorScheme
    Column {
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                Modifier.size(40.dp).clickable(onClick = onBack),
                contentAlignment = Alignment.Center,
            ) {
                StoryTailGlyph(StoryTailMark.ARROW_LEFT, 18.dp, scheme.onSurfaceVariant)
            }

            // Initials, matching the artboards' MAdvisorAvatar. A photograph would be the
            // real thing and the design has one, but the only asset behind it is a stock
            // portrait — and putting a stranger's face on Gyasi is worse than initials.
            AdvisorAvatar(size = 34.dp, background = StoryTailBrand.Burgundy)
            Spacer(Modifier.width(10.dp))

            Column(Modifier.weight(1f)) {
                if (title != null) {
                    Text(
                        title,
                        style = MaterialTheme.typography.titleSmall,
                        fontSize = 13.sp,
                        color = scheme.onSurface,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                if (subtitle != null) {
                    Text(
                        subtitle,
                        style = MaterialTheme.typography.bodySmall,
                        color = scheme.onSurfaceVariant,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }

            if (onOpenTrip != null) {
                Spacer(Modifier.width(8.dp))
                Box(
                    Modifier
                        .background(scheme.secondaryContainer, PillShape)
                        .clickable(onClick = onOpenTrip)
                        .padding(horizontal = 12.dp, vertical = 8.dp),
                ) {
                    Text(
                        ThreadMessages.OPEN_TRIP,
                        style = MaterialTheme.typography.labelLarge,
                        color = scheme.onSecondaryContainer,
                    )
                }
            }
        }
        HorizontalDivider(color = scheme.outlineVariant)
    }
}

@Composable
private fun ThreadList(
    thread: TripThreadSnapshot,
    today: LocalDate,
    modifier: Modifier = Modifier,
) {
    val days = groupMessagesByDay(thread.messages, today) { it.createdAt }
    val listState = rememberLazyListState()

    // Open at the NEWEST message. A thread that opens at the top shows somebody the oldest
    // thing their advisor said and asks them to scroll to find out what is happening. Keyed
    // on the message count so a send scrolls the new bubble into view too.
    LaunchedEffect(thread.messages.size) {
        if (thread.messages.isNotEmpty()) {
            listState.scrollToItem(thread.messages.size + days.size)
        }
    }

    if (thread.messages.isEmpty()) {
        Column(modifier.fillMaxWidth().padding(16.dp)) {
            ClientEmptyState(
                title = ThreadMessages.EMPTY_TITLE,
                body = ThreadMessages.EMPTY_BODY,
                mark = StoryTailMark.MESSAGE,
            )
        }
        return
    }

    LazyColumn(
        modifier = modifier.fillMaxWidth(),
        state = listState,
        contentPadding = PaddingValues(start = 14.dp, end = 14.dp, top = 12.dp, bottom = 16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        for (day in days) {
            item(key = "day-${day.key}") { DaySeparator(day.label) }
            items(
                count = day.messages.size,
                key = { index -> day.messages[index].id },
            ) { index ->
                MessageBubble(day.messages[index])
            }
        }
    }
}

@Composable
private fun DaySeparator(label: String) {
    Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
        Box(
            Modifier
                .background(MaterialTheme.colorScheme.surfaceContainerHigh, PillShape)
                .padding(horizontal = 12.dp, vertical = 5.dp),
        ) {
            Text(
                label,
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun MessageBubble(message: ThreadMessageView) {
    val scheme = MaterialTheme.colorScheme
    val mine = message.sender == MessageSender.CLIENT

    Row(
        Modifier.fillMaxWidth(),
        horizontalArrangement = if (mine) Arrangement.End else Arrangement.Start,
    ) {
        if (!mine) {
            AdvisorAvatar(
                size = 26.dp,
                background = StoryTailBrand.Orange,
                modifier = Modifier.align(Alignment.Bottom),
            )
            Spacer(Modifier.width(8.dp))
        }

        // 78% rather than the desktop twin's 70%: on a 375pt frame a 70% cap breaks a
        // two-clause sentence onto four lines. The artboard uses 78% for the same reason.
        Column(Modifier.fillMaxWidth(0.78f)) {
            Box(
                Modifier
                    .background(
                        if (mine) scheme.primary else scheme.surfaceContainer,
                        // The tail corner sits on the sender's side, matching the artboards.
                        if (mine) {
                            RoundedCornerShape(18.dp, 18.dp, 4.dp, 18.dp)
                        } else {
                            RoundedCornerShape(18.dp, 18.dp, 18.dp, 4.dp)
                        },
                    )
                    .padding(horizontal = 13.dp, vertical = 10.dp),
            ) {
                Text(
                    message.body,
                    style = MaterialTheme.typography.bodyMedium,
                    fontSize = 14.sp,
                    color = if (mine) scheme.onPrimary else scheme.onSurface,
                )
            }

            for (attachment in message.attachments) {
                Spacer(Modifier.height(6.dp))
                Row(
                    Modifier
                        .background(scheme.surfaceContainer, RoundedCornerShape(StoryTailRadius.xs))
                        .border(
                            1.dp,
                            scheme.outlineVariant,
                            RoundedCornerShape(StoryTailRadius.xs),
                        )
                        .padding(horizontal = 8.dp, vertical = 5.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Box(
                        Modifier
                            .width(14.dp)
                            .height(17.dp)
                            .background(
                                if (documentBadge(attachment.mimeType) == DocumentBadge.PDF) {
                                    StoryTailBrand.Burgundy
                                } else {
                                    StoryTailBrand.Orange
                                },
                                RoundedCornerShape(2.dp),
                            ),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(
                            documentBadge(attachment.mimeType).name,
                            color = Color.White,
                            fontSize = 5.sp,
                            fontWeight = FontWeight.ExtraBold,
                        )
                    }
                    Spacer(Modifier.width(6.dp))
                    Text(
                        attachment.filename,
                        style = MaterialTheme.typography.bodySmall,
                        color = scheme.onSurface,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f, fill = false),
                    )
                    Spacer(Modifier.width(6.dp))
                    Text(
                        formatFileSize(attachment.sizeBytes),
                        style = MaterialTheme.typography.bodySmall,
                        color = scheme.onSurfaceVariant,
                    )
                }
            }

            Spacer(Modifier.height(4.dp))
            Text(
                formatMessageTime(message.createdAt),
                style = MaterialTheme.typography.labelSmall,
                color = scheme.onSurfaceVariant,
                textAlign = if (mine) TextAlign.End else TextAlign.Start,
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}

/**
 * The compose bar: quick-reply chips, the field, and send.
 *
 * `imePadding` is what keeps it above the soft keyboard. Without it the field the traveler is
 * typing into sits behind the keyboard that appeared to let them type — which is the mobile
 * equivalent of the bug the web twin shipped, arriving by a completely different route.
 *
 * `navigationBarsPadding` because this screen has no bottom nav to own that inset — on a
 * gesture-navigation device the bar would otherwise sit under the home pill.
 */
@Composable
private fun Composer(
    draft: String,
    sending: Boolean,
    sendError: String?,
    onDraftChange: (String) -> Unit,
    onSend: () -> Unit,
) {
    val scheme = MaterialTheme.colorScheme
    val empty = draft.isBlank()

    Column(
        Modifier
            .fillMaxWidth()
            .background(scheme.surfaceContainerLow)
            .imePadding()
            .navigationBarsPadding(),
    ) {
        HorizontalDivider(color = scheme.outlineVariant)

        if (sendError != null) {
            Text(
                sendError,
                style = MaterialTheme.typography.bodySmall,
                color = scheme.error,
                modifier = Modifier.padding(start = 12.dp, end = 12.dp, top = 8.dp),
            )
        }

        Row(
            Modifier
                .horizontalScroll(rememberScrollState())
                .padding(start = 12.dp, end = 12.dp, top = 8.dp),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            for (reply in QUICK_REPLIES) {
                Box(
                    Modifier
                        .background(scheme.surfaceContainerHigh, PillShape)
                        // Fills the field rather than sending, so nothing leaves for Gyasi
                        // that the traveler has not seen sitting in their own box first.
                        .clickable { onDraftChange(reply) }
                        .padding(horizontal = 12.dp, vertical = 7.dp),
                ) {
                    Text(
                        reply,
                        style = MaterialTheme.typography.labelLarge,
                        color = scheme.onSurface,
                    )
                }
            }
        }

        Row(
            Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp),
            verticalAlignment = Alignment.Bottom,
        ) {
            OutlinedTextField(
                value = draft,
                onValueChange = onDraftChange,
                placeholder = {
                    Text(
                        ThreadMessages.COMPOSE_PLACEHOLDER,
                        style = MaterialTheme.typography.bodyMedium,
                    )
                },
                // Grows to four lines and then scrolls, so a long message is writable without
                // the bar eating the thread it is about.
                maxLines = 4,
                shape = RoundedCornerShape(StoryTailRadius.lg),
                modifier = Modifier.weight(1f).heightIn(min = 48.dp),
            )

            Spacer(Modifier.width(8.dp))

            Box(
                Modifier
                    .size(48.dp)
                    .background(
                        if (empty || sending) scheme.surfaceContainerHighest else scheme.primary,
                        PillShape,
                    )
                    .clickable(enabled = !empty && !sending, onClick = onSend),
                contentAlignment = Alignment.Center,
            ) {
                if (sending) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(18.dp),
                        strokeWidth = 2.dp,
                        color = scheme.onSurfaceVariant,
                    )
                } else {
                    StoryTailGlyph(
                        StoryTailMark.PLANE,
                        16.dp,
                        if (empty) scheme.onSurfaceVariant else scheme.onPrimary,
                    )
                }
            }
        }
    }
}

/** Gyasi's initials on a brand disc. */
@Composable
private fun AdvisorAvatar(
    size: Dp,
    background: Color,
    modifier: Modifier = Modifier,
) {
    Box(
        modifier.size(size).background(background, PillShape),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            "GS",
            color = Color.White,
            fontSize = (size.value * 0.36f).sp,
            fontWeight = FontWeight.Bold,
        )
    }
}
