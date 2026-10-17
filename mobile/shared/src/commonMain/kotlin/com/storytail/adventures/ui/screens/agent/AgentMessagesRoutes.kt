package com.storytail.adventures.ui.screens.agent

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import com.storytail.adventures.api.AgentArchiveOutcome
import com.storytail.adventures.api.AgentInboxQuery
import com.storytail.adventures.api.AgentInboxRead
import com.storytail.adventures.api.AgentMessageTargetRead
import com.storytail.adventures.api.AgentMessagesRepository
import com.storytail.adventures.api.AgentSendOutcome
import com.storytail.adventures.api.AgentSendRequest
import com.storytail.adventures.api.AgentThreadRead
import com.storytail.adventures.domain.agent.AgentMessagesCopy
import com.storytail.adventures.push.LocalAgentPush
import com.storytail.adventures.domain.agent.agentInboxRow
import com.storytail.adventures.domain.agent.initialsOf
import com.storytail.adventures.domain.agent.messagesHeadline
import com.storytail.adventures.domain.agent.messagesNewTo
import com.storytail.adventures.domain.agent.messagesNoLogin
import com.storytail.adventures.domain.agent.messagesReplyBy
import com.storytail.adventures.domain.agent.replyDueDay
import com.storytail.adventures.domain.trip.Loadable
import com.storytail.adventures.domain.uuidV7
import com.storytail.adventures.ui.nav.AppRoute
import com.storytail.adventures.ui.nav.Navigator
import kotlinx.coroutines.launch

/**
 * §3.10 Stage 3's three routes, the logic `AgentRoute` hands them to: the inbox (Messages
 * tab root), a thread, and a message to a client with no live thread yet.
 *
 * NO LIVE FEED (Gyasi, 2026-10-14): each screen reloads when it is (re)entered and on
 * pull-to-refresh. [onMessagesChanged] tells the host to re-read the tab's badge after anything
 * that can move it (opening a thread reads it; archive files it).
 */

private const val INBOX_PAGE = 25

@Composable
internal fun AgentInboxRoute(
    messages: AgentMessagesRepository,
    nav: Navigator,
    timeZone: String,
    onSelectTab: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    // SAVEABLE, so a search survives opening a thread and coming Back, and a rotation.
    var search by rememberSaveable { mutableStateOf("") }
    var unreadOnly by rememberSaveable { mutableStateOf(false) }
    var overdueOnly by rememberSaveable { mutableStateOf(false) }
    var archived by rememberSaveable { mutableStateOf(false) }
    var limit by rememberSaveable { mutableIntStateOf(INBOX_PAGE) }
    var reload by remember { mutableIntStateOf(0) }
    var refreshing by remember { mutableStateOf(false) }
    var state by remember { mutableStateOf<Loadable<AgentInboxUiState>>(Loadable.Loading) }

    LaunchedEffect(messages, search, unreadOnly, overdueOnly, archived, limit, reload) {
        val query = AgentInboxQuery(
            archived = archived,
            unread = unreadOnly && !archived,
            overdue = overdueOnly && !archived,
            search = search,
            limit = limit,
        )
        state = when (val read = messages.inbox(query)) {
            is AgentInboxRead.Ok -> Loadable.Ready(
                AgentInboxUiState(
                    headline = messagesHeadline(read.summary.unreadThreads, read.summary.overdueThreads),
                    archivedCount = read.summary.archivedThreads,
                    rows = read.rows.map { agentInboxRow(it, timeZone) },
                    total = read.total,
                ),
            )
            AgentInboxRead.Forbidden -> Loadable.Unauthorized
            AgentInboxRead.Failed -> Loadable.Failed()
        }
        refreshing = false
    }

    AgentMessagesScreen(
        state = state,
        refreshing = refreshing,
        onRefresh = {
            refreshing = true
            reload++
        },
        search = search,
        onSearchChange = {
            search = it
            limit = INBOX_PAGE
        },
        unreadOnly = unreadOnly,
        overdueOnly = overdueOnly,
        onToggleFilter = {
            when (it) {
                "unread" -> unreadOnly = !unreadOnly
                "overdue" -> overdueOnly = !overdueOnly
            }
            limit = INBOX_PAGE
        },
        archived = archived,
        onToggleArchived = {
            archived = !archived
            limit = INBOX_PAGE
        },
        onLoadMore = { limit += INBOX_PAGE },
        onOpenThread = { nav.push(AppRoute.AgentThread(it)) },
        onSelectTab = onSelectTab,
        modifier = modifier,
    )
}

/**
 * One draft's id, minted on its first send and reused for a retry of the SAME words in the same
 * mode, so a double tap or a retry after a send that landed but answered with an error is
 * stored once (the repeat is refused as already sent). The web reply box's rule.
 */
private data class DraftId(val id: String, val body: String, val note: Boolean)

private fun idFor(previous: DraftId?, body: String, note: Boolean): DraftId =
    if (previous != null && previous.body == body && previous.note == note) previous else DraftId(uuidV7(), body, note)

@Composable
internal fun AgentThreadRoute(
    conversationId: String,
    messages: AgentMessagesRepository,
    nav: Navigator,
    timeZone: String,
    onMessagesChanged: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val scope = rememberCoroutineScope()
    var reload by remember(conversationId) { mutableIntStateOf(0) }
    var refreshing by remember(conversationId) { mutableStateOf(false) }
    var read by remember(conversationId) { mutableStateOf<AgentThreadRead?>(null) }
    val push = LocalAgentPush.current
    var draft by remember(conversationId) { mutableStateOf("") }
    var noteMode by remember(conversationId) { mutableStateOf(false) }
    var sending by remember(conversationId) { mutableStateOf(false) }
    var sendError by remember(conversationId) { mutableStateOf<String?>(null) }
    var archiving by remember(conversationId) { mutableStateOf(false) }
    var status by remember(conversationId) { mutableStateOf<String?>(null) }
    var statusIsError by remember(conversationId) { mutableStateOf(false) }
    var draftId by remember(conversationId) { mutableStateOf<DraftId?>(null) }

    // A reply that failed from a notification waits here as the draft (§3.10.7, ruling 4), with
    // the id it was first sent under: sending the same words again is the same message.
    LaunchedEffect(push, conversationId) {
        val pending = push.draftFor(conversationId) ?: return@LaunchedEffect
        if (draft.isEmpty()) {
            draft = pending.text
            draftId = DraftId(pending.messageId, pending.text, false)
        }
    }

    LaunchedEffect(messages, conversationId, reload) {
        val result = messages.thread(conversationId)
        // A failed REFRESH keeps the thread already on screen (and the draft under it) rather
        // than swapping the whole screen for a retry panel on weak signal.
        val previous = read
        if (result is AgentThreadRead.Failed && previous is AgentThreadRead.Ok) {
            status = AgentMessagesCopy.LOAD_FAILED_TITLE
            statusIsError = true
        } else {
            read = result
        }
        refreshing = false
        // Opening a thread reads it, but only up to the newest message on screen: one that
        // lands after stays unread. Passed as PostgREST wrote it, microseconds intact. Only
        // when the client spoke last: the advisor's own newest message leaves nothing unread.
        if (result is AgentThreadRead.Ok) {
            result.messages.lastOrNull()?.takeIf { !it.fromAgent }?.let { newest ->
                if (messages.markRead(conversationId, newest.createdAt)) onMessagesChanged()
            }
        }
    }

    val state: Loadable<AgentThreadSurface> = when (val r = read) {
        null -> Loadable.Loading
        is AgentThreadRead.Ok -> Loadable.Ready(
            AgentThreadSurface(
                title = r.header.clientName,
                subtitle = r.header.tripTitle ?: AgentMessagesCopy.GENERAL_THREAD,
                initials = initialsOf(r.header.clientName),
                overdue = r.header.overdue,
                replyByLabel = if (r.header.replyDueAt != null && !r.header.overdue) {
                    replyDueDay(r.header.replyDueAt, timeZone)?.let(::messagesReplyBy)
                } else {
                    null
                },
                archived = r.header.archived,
                headerAction = if (r.header.tripId != null) {
                    AgentThreadSurface.HeaderAction.OPEN_TRIP
                } else {
                    AgentThreadSurface.HeaderAction.OPEN_CLIENT
                },
                messages = r.messages,
                emptyBody = AgentMessagesCopy.EMPTY_THREAD,
                allowNote = true,
                noLoginLine = if (r.header.clientCanSignIn) null else messagesNoLogin(r.header.clientFirstName),
            ),
        )
        AgentThreadRead.NotFound -> Loadable.Empty(
            title = AgentMessagesCopy.THREAD_NOT_FOUND_TITLE,
            body = AgentMessagesCopy.THREAD_NOT_FOUND_BODY,
        )
        AgentThreadRead.Forbidden -> Loadable.Unauthorized
        AgentThreadRead.Failed -> Loadable.Failed()
    }
    val ok = read as? AgentThreadRead.Ok

    AgentThreadScreen(
        state = state,
        draft = draft,
        noteMode = noteMode,
        sending = sending,
        sendError = sendError,
        status = status,
        statusIsError = statusIsError,
        archiving = archiving,
        refreshing = refreshing,
        onRefresh = {
            refreshing = true
            reload++
        },
        onDraftChange = {
            draft = it
            sendError = null
        },
        onNoteModeChange = { noteMode = it },
        onSend = {
            val body = draft
            if (body.isBlank() || sending || ok == null) return@AgentThreadScreen
            val isNote = noteMode
            val id = idFor(draftId, body, isNote).also { draftId = it }
            sending = true
            sendError = null
            scope.launch {
                val outcome = messages.send(
                    AgentSendRequest(
                        messageId = id.id,
                        body = body,
                        internalNote = isNote,
                        conversationId = conversationId,
                        seenUpTo = ok.messages.lastOrNull()?.createdAt,
                    ),
                )
                sending = false
                when (outcome) {
                    is AgentSendOutcome.Sent -> {
                        // Every word kept until here: a refused send loses nothing.
                        draft = ""
                        draftId = null
                        noteMode = false
                        push.clearDraft(conversationId)
                        reload++
                        onMessagesChanged()
                    }
                    is AgentSendOutcome.Failed -> {
                        sendError = outcome.detail ?: AgentMessagesCopy.SEND_FAILED
                        // A send can land and lose its answer; the retry is then refused as
                        // already sent. Re-reading shows the message if it is there.
                        reload++
                    }
                }
            }
        },
        onBack = { if (!nav.pop()) nav.selectTab(AppRoute.AgentMessages) },
        onHeaderAction = {
            val header = ok?.header ?: return@AgentThreadScreen
            if (header.tripId != null) {
                nav.push(AppRoute.AgentTripDetail(header.tripId))
            } else {
                nav.push(AppRoute.AgentClientDetail(header.clientId))
            }
        },
        onToggleArchived = {
            val header = ok?.header ?: return@AgentThreadScreen
            if (archiving) return@AgentThreadScreen
            archiving = true
            status = null
            statusIsError = false
            scope.launch {
                val restore = header.archived
                when (val outcome = messages.setArchived(conversationId, archived = !restore)) {
                    AgentArchiveOutcome.Done -> {
                        status = if (restore) AgentMessagesCopy.RESTORED_DONE else AgentMessagesCopy.ARCHIVED_DONE
                        reload++
                        onMessagesChanged()
                    }
                    is AgentArchiveOutcome.Failed -> {
                        status = outcome.detail ?: AgentMessagesCopy.ARCHIVE_FAILED
                        statusIsError = true
                    }
                }
                archiving = false
            }
        },
        modifier = modifier,
    )
}

@Composable
internal fun AgentNewMessageRoute(
    clientId: String,
    tripId: String?,
    messages: AgentMessagesRepository,
    nav: Navigator,
    onMessagesChanged: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val scope = rememberCoroutineScope()
    var reload by remember(clientId, tripId) { mutableIntStateOf(0) }
    var read by remember(clientId, tripId) { mutableStateOf<AgentMessageTargetRead?>(null) }
    var draft by remember(clientId, tripId) { mutableStateOf("") }
    var sending by remember(clientId, tripId) { mutableStateOf(false) }
    var sendError by remember(clientId, tripId) { mutableStateOf<String?>(null) }
    var draftId by remember(clientId, tripId) { mutableStateOf<DraftId?>(null) }

    LaunchedEffect(messages, clientId, tripId, reload) {
        val result = messages.target(clientId, tripId)
        // A thread already exists: go to it. REPLACE, so Back never lands on an empty composer.
        if (result is AgentMessageTargetRead.Ok && result.target.conversationId != null) {
            nav.replace(AppRoute.AgentThread(result.target.conversationId))
            return@LaunchedEffect
        }
        read = result
    }

    val state: Loadable<AgentThreadSurface> = when (val r = read) {
        null -> Loadable.Loading
        is AgentMessageTargetRead.Ok -> Loadable.Ready(
            AgentThreadSurface(
                title = messagesNewTo(r.target.clientFirstName),
                subtitle = "${r.target.clientName} · ${r.target.tripTitle ?: AgentMessagesCopy.GENERAL_THREAD}",
                initials = initialsOf(r.target.clientName),
                overdue = false,
                replyByLabel = null,
                archived = false,
                headerAction = null,
                messages = emptyList(),
                emptyBody = AgentMessagesCopy.NEW_THREAD_EMPTY,
                // A thread cannot START with a note: the client would see a thread with nothing in it.
                allowNote = false,
                noLoginLine = if (r.target.clientCanSignIn) null else messagesNoLogin(r.target.clientFirstName),
            ),
        )
        AgentMessageTargetRead.NotFound -> Loadable.Empty(
            title = AgentMessagesCopy.THREAD_NOT_FOUND_TITLE,
            body = AgentMessagesCopy.NOT_FOUND,
        )
        AgentMessageTargetRead.Failed -> Loadable.Failed()
    }

    AgentThreadScreen(
        state = state,
        draft = draft,
        noteMode = false,
        sending = sending,
        sendError = sendError,
        status = null,
        statusIsError = false,
        archiving = false,
        refreshing = false,
        onRefresh = { reload++ },
        onDraftChange = {
            draft = it
            sendError = null
        },
        onNoteModeChange = {},
        onSend = {
            val body = draft
            if (body.isBlank() || sending) return@AgentThreadScreen
            val id = idFor(draftId, body, false).also { draftId = it }
            sending = true
            sendError = null
            scope.launch {
                val outcome = messages.send(
                    AgentSendRequest(
                        messageId = id.id,
                        body = body,
                        internalNote = false,
                        clientId = clientId,
                        tripId = tripId,
                    ),
                )
                sending = false
                when (outcome) {
                    is AgentSendOutcome.Sent -> {
                        onMessagesChanged()
                        nav.replace(AppRoute.AgentThread(outcome.conversationId))
                    }
                    is AgentSendOutcome.Failed -> {
                        sendError = outcome.detail ?: AgentMessagesCopy.SEND_FAILED
                        // If the send landed and only its answer was lost, the thread now
                        // exists: re-reading the target finds it and replaces this screen.
                        reload++
                    }
                }
            }
        },
        onBack = { if (!nav.pop()) nav.selectTab(AppRoute.AgentMessages) },
        onHeaderAction = {},
        onToggleArchived = {},
        modifier = modifier,
    )
}
