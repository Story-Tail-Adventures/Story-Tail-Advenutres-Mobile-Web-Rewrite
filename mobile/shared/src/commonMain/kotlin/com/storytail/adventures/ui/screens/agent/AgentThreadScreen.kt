package com.storytail.adventures.ui.screens.agent

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.storytail.adventures.api.AgentThreadMessage
import com.storytail.adventures.domain.agent.AgentMessagesCopy
import com.storytail.adventures.domain.trip.Loadable
import com.storytail.adventures.domain.trip.formatMessageTime
import com.storytail.adventures.domain.trip.groupMessagesByDay
import com.storytail.adventures.domain.trip.localToday
import com.storytail.adventures.ui.components.ChatBubble
import com.storytail.adventures.ui.components.ChatDaySeparator
import com.storytail.adventures.ui.components.dashedBorder
import com.storytail.adventures.ui.components.StoryTailGlyph
import com.storytail.adventures.ui.components.StoryTailMark
import com.storytail.adventures.ui.components.agent.AgentScaffold
import com.storytail.adventures.ui.theme.LocalStoryTailBrandTypography
import com.storytail.adventures.ui.theme.PillShape
import kotlinx.datetime.LocalDate

/** What a thread (or a new message) draws. */
data class AgentThreadSurface(
    val title: String,
    /** The trip, "General", or on a new message "Pri Raghunathan · Kyoto in the spring". */
    val subtitle: String,
    val initials: String,
    val overdue: Boolean,
    val replyByLabel: String?,
    val archived: Boolean,
    /** Null on a new message, which has no header actions yet. */
    val headerAction: HeaderAction?,
    val messages: List<AgentThreadMessage>,
    val emptyBody: String,
    /** A new thread cannot START with a note: the client would see a thread with nothing in it. */
    val allowNote: Boolean,
    /** "Pri can't sign in yet…", under the box in Reply mode; null when they can sign in. */
    val noLoginLine: String?,
) {
    enum class HeaderAction { OPEN_TRIP, OPEN_CLIENT }
}

/**
 * Screens 3.10.2 and the new-message state on the phone (3.10m.2 `M3102_ThreadReply` /
 * `M3102_ThreadNote`, 3.10m.3 `M3103_NewMessage`). Pattern C, full screen, pushed over the
 * Messages tab, so no tab bar.
 *
 * THE BUBBLES ARE THE TRAVELER'S (ChatParts.kt) WITH THE SIDES SWAPPED: the advisor's own on
 * the right. AN INTERNAL NOTE IS A DASHED, TINTED CARD labelled every time, so it can never be
 * mistaken for a reply; it moves nothing the client reads (the SQL decides that).
 *
 * THE HEADER is the client, the trip, the due chip, Open trip (or Open client on a general
 * thread) and Archive, and nothing else (Gyasi, 2026-10-14). Archive lives ONLY here on the
 * phone: no swipe on inbox rows.
 *
 * A REPLY / NOTE TOGGLE above the box, easier to hit than the web's switch. In Note mode the
 * composer takes the note card's dashed, tinted look before anything is sent, because typing a
 * private note into what looks like a reply box is the mistake this screen most needs to stop.
 *
 * NO TEMPLATE PICKER (templates stay on the web) and attachments are NAMES, not downloads:
 * nothing on the advisor's side can open a client's document yet.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AgentThreadScreen(
    state: Loadable<AgentThreadSurface>,
    draft: String,
    noteMode: Boolean,
    sending: Boolean,
    sendError: String?,
    /** "Archived" / "Moved to inbox" after the header's action, announced politely. */
    status: String?,
    /** True when [status] reports a failure, so it reads in the error colour. */
    statusIsError: Boolean = false,
    archiving: Boolean,
    refreshing: Boolean,
    onRefresh: () -> Unit,
    onDraftChange: (String) -> Unit,
    onNoteModeChange: (Boolean) -> Unit,
    onSend: () -> Unit,
    onBack: () -> Unit,
    onHeaderAction: () -> Unit,
    onToggleArchived: () -> Unit,
    modifier: Modifier = Modifier,
    today: LocalDate = localToday(),
) {
    AgentScaffold(modifier = modifier, scrollable = false) {
        when (state) {
            is Loadable.Loading -> {
                ThreadHeader(null, onBack, onHeaderAction, onToggleArchived, archiving)
                Box(Modifier.fillMaxWidth().weight(1f), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = MaterialTheme.colorScheme.primary)
                }
            }
            is Loadable.Failed -> {
                ThreadHeader(null, onBack, onHeaderAction, onToggleArchived, archiving)
                ThreadPanel(AgentMessagesCopy.LOAD_FAILED_TITLE, AgentMessagesCopy.LOAD_FAILED_BODY, onRetry = onRefresh)
            }
            is Loadable.Unauthorized -> {
                ThreadHeader(null, onBack, onHeaderAction, onToggleArchived, archiving)
                ThreadPanel("This is the advisor's side", "Your account does not have access to messages.")
            }
            is Loadable.Empty -> {
                ThreadHeader(null, onBack, onHeaderAction, onToggleArchived, archiving)
                ThreadPanel(state.title, state.body)
            }
            is Loadable.Ready -> {
                val thread = state.value
                ThreadHeader(thread, onBack, onHeaderAction, onToggleArchived, archiving)
                if (status != null) {
                    Text(
                        status,
                        style = MaterialTheme.typography.bodySmall,
                        color = if (statusIsError) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier
                            .padding(horizontal = 16.dp, vertical = 6.dp)
                            .semantics { liveRegion = LiveRegionMode.Polite },
                    )
                }
                PullToRefreshBox(
                    isRefreshing = refreshing,
                    onRefresh = onRefresh,
                    modifier = Modifier.fillMaxWidth().weight(1f),
                ) {
                    ThreadList(thread, today)
                }
                Composer(
                    draft = draft,
                    noteMode = noteMode && thread.allowNote,
                    allowNote = thread.allowNote,
                    sending = sending,
                    sendError = sendError,
                    noLoginLine = thread.noLoginLine,
                    onDraftChange = onDraftChange,
                    onNoteModeChange = onNoteModeChange,
                    onSend = onSend,
                )
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ThreadHeader(
    thread: AgentThreadSurface?,
    onBack: () -> Unit,
    onHeaderAction: () -> Unit,
    onToggleArchived: () -> Unit,
    archiving: Boolean,
) {
    val scheme = MaterialTheme.colorScheme
    val type = LocalStoryTailBrandTypography.current
    Column(Modifier.fillMaxWidth().background(scheme.background)) {
        Row(
            Modifier.fillMaxWidth().padding(start = 6.dp, end = 10.dp, top = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            // A NAME, not just a click label: the arrow is a glyph with no text, so without this
            // a screen reader announces an unlabelled button (found on the emulator).
            Box(
                Modifier
                    .size(48.dp)
                    .clickable(role = Role.Button, onClick = onBack)
                    .semantics { contentDescription = AgentMessagesCopy.BACK_TO_MESSAGES },
                contentAlignment = Alignment.Center,
            ) {
                StoryTailGlyph(StoryTailMark.ARROW_LEFT, 18.dp, scheme.onSurfaceVariant)
            }
            if (thread != null) {
                Surface(shape = CircleShape, color = scheme.secondaryContainer, modifier = Modifier.size(34.dp)) {
                    Box(contentAlignment = Alignment.Center) {
                        Text(thread.initials, style = type.labelXS, color = scheme.onSecondaryContainer)
                    }
                }
                Spacer(Modifier.width(10.dp))
                Column(Modifier.weight(1f)) {
                    Text(
                        thread.title,
                        style = MaterialTheme.typography.titleSmall,
                        color = scheme.onSurface,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Text(
                        thread.subtitle,
                        style = MaterialTheme.typography.bodySmall,
                        color = scheme.onSurfaceVariant,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
        }
        if (thread?.headerAction != null) {
            // WRAPS on a narrow phone: an archived, overdue thread carries two chips and two
            // buttons, which do not fit one 360dp row.
            FlowRow(
                Modifier.fillMaxWidth().padding(start = 54.dp, end = 10.dp, bottom = 8.dp),
                itemVerticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                if (thread.archived) {
                    Box(
                        Modifier.background(scheme.surfaceContainerHigh, PillShape).padding(horizontal = 8.dp, vertical = 3.dp),
                    ) {
                        Text(AgentMessagesCopy.ARCHIVED_TAG, style = type.labelXS, color = scheme.onSurfaceVariant)
                    }
                }
                DueChip(overdue = thread.overdue, replyBy = thread.replyByLabel)
                FilledTonalButton(onClick = onHeaderAction, modifier = Modifier.heightIn(min = 40.dp)) {
                    StoryTailGlyph(
                        if (thread.headerAction == AgentThreadSurface.HeaderAction.OPEN_TRIP) StoryTailMark.BRIEFCASE else StoryTailMark.USER,
                        13.dp,
                        scheme.onSecondaryContainer,
                    )
                    Spacer(Modifier.width(6.dp))
                    Text(
                        if (thread.headerAction == AgentThreadSurface.HeaderAction.OPEN_TRIP) {
                            AgentMessagesCopy.OPEN_TRIP
                        } else {
                            AgentMessagesCopy.OPEN_CLIENT
                        },
                    )
                }
                TextButton(onClick = onToggleArchived, enabled = !archiving, modifier = Modifier.heightIn(min = 40.dp)) {
                    Text(if (thread.archived) AgentMessagesCopy.RESTORE_THREAD else AgentMessagesCopy.ARCHIVE_THREAD)
                }
            }
        } else {
            Spacer(Modifier.height(8.dp))
        }
        HorizontalDivider(color = scheme.outlineVariant)
    }
}

@Composable
private fun ThreadList(thread: AgentThreadSurface, today: LocalDate) {
    val listState = rememberLazyListState()
    val days = groupMessagesByDay(thread.messages, today) { it.createdAt }

    // Open at the NEWEST message, and follow a send to it.
    LaunchedEffect(thread.messages.size) {
        if (thread.messages.isNotEmpty()) listState.scrollToItem(thread.messages.size + days.size - 1)
    }

    if (thread.messages.isEmpty()) {
        Column(
            Modifier.fillMaxSize().padding(horizontal = 28.dp, vertical = 40.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Box(
                Modifier.size(52.dp).background(MaterialTheme.colorScheme.surfaceContainerHigh, CircleShape),
                contentAlignment = Alignment.Center,
            ) {
                StoryTailGlyph(StoryTailMark.MESSAGE, 22.dp, MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Spacer(Modifier.height(12.dp))
            Text(
                thread.emptyBody,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
            )
        }
        return
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        state = listState,
        contentPadding = PaddingValues(start = 14.dp, end = 14.dp, top = 16.dp, bottom = 12.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        for (day in days) {
            item(key = "day-${day.key}") { ChatDaySeparator(day.label) }
            items(count = day.messages.size, key = { day.messages[it].id }) { index ->
                val message = day.messages[index]
                if (message.internalNote) NoteCard(message) else AdvisorSideBubble(message)
            }
        }
    }
}

/** The advisor's own on the right in primary; the client's on the left, outlined. */
@Composable
private fun AdvisorSideBubble(message: AgentThreadMessage) {
    val scheme = MaterialTheme.colorScheme
    val mine = message.fromAgent
    Row(
        Modifier
            .fillMaxWidth()
            // Who spoke, for a screen reader: the sides alone carry it visually.
            .semantics(mergeDescendants = true) { contentDescription = if (mine) AgentMessagesCopy.YOU_SAID else AgentMessagesCopy.CLIENT_SAID },
        horizontalArrangement = if (mine) Arrangement.End else Arrangement.Start,
    ) {
        Column(Modifier.fillMaxWidth(0.78f), horizontalAlignment = if (mine) Alignment.End else Alignment.Start) {
            ChatBubble(body = message.body, mine = mine)
            for (name in message.attachmentNames) {
                Spacer(Modifier.height(6.dp))
                Box(
                    Modifier
                        .background(scheme.surfaceContainerHigh, PillShape)
                        .padding(horizontal = 10.dp, vertical = 6.dp),
                ) {
                    Text(
                        name,
                        style = MaterialTheme.typography.bodySmall,
                        color = scheme.onSurface,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
            Spacer(Modifier.height(4.dp))
            Text(
                bubbleMeta(formatMessageTime(message.createdAt), message),
                style = MaterialTheme.typography.labelSmall,
                color = scheme.onSurfaceVariant,
            )
        }
    }
}

/** Every time, so a private note can never be mistaken for a reply. */
@Composable
private fun NoteCard(message: AgentThreadMessage) {
    val scheme = MaterialTheme.colorScheme
    val type = LocalStoryTailBrandTypography.current
    val shape = RoundedCornerShape(14.dp)
    Column(
        Modifier
            .fillMaxWidth()
            .background(scheme.surfaceContainerHigh, shape)
            .dashedBorder(scheme.outline, shape)
            .padding(horizontal = 12.dp, vertical = 10.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            StoryTailGlyph(StoryTailMark.LOCK, 11.dp, scheme.onSurfaceVariant)
            Spacer(Modifier.width(6.dp))
            Text(AgentMessagesCopy.INTERNAL_NOTE_TAG.uppercase(), style = type.labelXS, color = scheme.onSurfaceVariant)
        }
        Spacer(Modifier.height(6.dp))
        Text(message.body, style = MaterialTheme.typography.bodyMedium, color = scheme.onSurface)
        Spacer(Modifier.height(6.dp))
        Text(
            formatMessageTime(message.createdAt),
            style = MaterialTheme.typography.labelSmall,
            color = scheme.onSurfaceVariant,
            textAlign = TextAlign.End,
            modifier = Modifier.fillMaxWidth(),
        )
    }
}

@Composable
private fun Composer(
    draft: String,
    noteMode: Boolean,
    allowNote: Boolean,
    sending: Boolean,
    sendError: String?,
    noLoginLine: String?,
    onDraftChange: (String) -> Unit,
    onNoteModeChange: (Boolean) -> Unit,
    onSend: () -> Unit,
) {
    val scheme = MaterialTheme.colorScheme
    val type = LocalStoryTailBrandTypography.current
    val empty = draft.isBlank()
    val boxShape = RoundedCornerShape(18.dp)

    Column(
        Modifier
            .fillMaxWidth()
            .background(if (noteMode) scheme.surfaceContainerHigh else scheme.surfaceContainerLow)
            // Above the soft keyboard, and clear of the gesture bar: this screen has no tab bar.
            .imePadding()
            .navigationBarsPadding(),
    ) {
        HorizontalDivider(color = if (noteMode) scheme.outline else scheme.outlineVariant)
        Column(Modifier.padding(start = 12.dp, end = 12.dp, top = 10.dp, bottom = 12.dp)) {
            if (sendError != null) {
                Text(
                    sendError,
                    style = MaterialTheme.typography.bodySmall,
                    color = scheme.error,
                    modifier = Modifier.padding(bottom = 8.dp).semantics { liveRegion = LiveRegionMode.Assertive },
                )
            }
            if (allowNote) {
                Row(
                    Modifier
                        .padding(bottom = 8.dp)
                        .background(scheme.surfaceContainerHighest, PillShape)
                        .padding(3.dp)
                        .selectableGroup(),
                ) {
                    ModeOption(AgentMessagesCopy.REPLY_LABEL, selected = !noteMode, lock = false) { onNoteModeChange(false) }
                    ModeOption(AgentMessagesCopy.NOTE_MODE, selected = noteMode, lock = true) { onNoteModeChange(true) }
                }
            }
            Row(verticalAlignment = Alignment.Bottom) {
                OutlinedTextField(
                    value = draft,
                    onValueChange = onDraftChange,
                    readOnly = sending,
                    placeholder = {
                        Text(
                            when {
                                noteMode -> AgentMessagesCopy.NOTE_PLACEHOLDER
                                allowNote -> AgentMessagesCopy.REPLY_PLACEHOLDER
                                else -> AgentMessagesCopy.MESSAGE_PLACEHOLDER
                            },
                        )
                    },
                    label = { Text(if (noteMode) AgentMessagesCopy.NOTE_SWITCH else AgentMessagesCopy.REPLY_LABEL) },
                    maxLines = 5,
                    shape = boxShape,
                    // In Note mode the dashed outline IS the border; the field's own solid one
                    // drawn inside it read as two boxes (found on the emulator).
                    colors = if (noteMode) {
                        OutlinedTextFieldDefaults.colors(
                            focusedBorderColor = Color.Transparent,
                            unfocusedBorderColor = Color.Transparent,
                        )
                    } else {
                        OutlinedTextFieldDefaults.colors()
                    },
                    modifier = Modifier
                        .weight(1f)
                        .heightIn(min = 52.dp)
                        .then(if (noteMode) Modifier.dashedBorder(scheme.outline, boxShape) else Modifier),
                )
                Spacer(Modifier.width(8.dp))
                val enabled = !empty && !sending
                if (noteMode) {
                    FilledTonalButton(onClick = onSend, enabled = enabled, modifier = Modifier.heightIn(min = 48.dp)) {
                        if (sending) SendingSpinner() else Text(AgentMessagesCopy.ADD_NOTE)
                    }
                } else {
                    Button(onClick = onSend, enabled = enabled, modifier = Modifier.heightIn(min = 48.dp)) {
                        if (sending) SendingSpinner() else Text(AgentMessagesCopy.SEND)
                    }
                }
            }
            if (noteMode) {
                Row(Modifier.padding(top = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                    StoryTailGlyph(StoryTailMark.LOCK, 11.dp, scheme.onSurfaceVariant)
                    Spacer(Modifier.width(5.dp))
                    Text(AgentMessagesCopy.NOTE_HINT, style = MaterialTheme.typography.bodySmall, color = scheme.onSurfaceVariant)
                }
            } else if (noLoginLine != null) {
                Text(
                    noLoginLine,
                    style = MaterialTheme.typography.bodySmall,
                    color = scheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = 6.dp),
                )
            }
        }
    }
}

@Composable
private fun ModeOption(label: String, selected: Boolean, lock: Boolean, onSelect: () -> Unit) {
    val scheme = MaterialTheme.colorScheme
    Row(
        Modifier
            .heightIn(min = 48.dp)
            .background(if (selected) scheme.secondaryContainer else scheme.surfaceContainerHighest, PillShape)
            .selectable(selected = selected, role = Role.RadioButton, onClick = onSelect)
            .padding(horizontal = 16.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (lock) {
            StoryTailGlyph(StoryTailMark.LOCK, 11.dp, if (selected) scheme.onSecondaryContainer else scheme.onSurfaceVariant)
            Spacer(Modifier.width(5.dp))
        }
        Text(
            label,
            style = MaterialTheme.typography.labelLarge,
            color = if (selected) scheme.onSecondaryContainer else scheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun SendingSpinner() {
    CircularProgressIndicator(Modifier.size(16.dp), strokeWidth = 2.dp, color = MaterialTheme.colorScheme.onSurfaceVariant)
}

@Composable
private fun ThreadPanel(title: String, body: String, onRetry: (() -> Unit)? = null) {
    val scheme = MaterialTheme.colorScheme
    Column(
        Modifier.fillMaxWidth().padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(title, style = MaterialTheme.typography.titleSmall, color = scheme.onSurface, textAlign = TextAlign.Center)
        Spacer(Modifier.height(4.dp))
        Text(body, style = MaterialTheme.typography.bodySmall, color = scheme.onSurfaceVariant, textAlign = TextAlign.Center)
        if (onRetry != null) {
            Spacer(Modifier.height(12.dp))
            OutlinedButton(onClick = onRetry) { Text(AgentMessagesCopy.TRY_AGAIN) }
        }
    }
}

/**
 * The line under a bubble: its time, then §3.10 Stage 4's mark when there is one. "Emailed" on
 * the advisor's reply an email carried; "By email" on a client message that came by email.
 */
internal fun bubbleMeta(time: String, message: AgentThreadMessage): String = when {
    message.fromAgent && message.emailed -> "$time · ${AgentMessagesCopy.EMAILED_MARK}"
    !message.fromAgent && message.byEmail -> "$time · ${AgentMessagesCopy.BY_EMAIL}"
    else -> time
}
