package com.storytail.adventures.ui.screens.messages

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.storytail.adventures.api.ConversationThreadSnapshot
import com.storytail.adventures.api.SendMessageOutcome
import com.storytail.adventures.api.StartConversationOutcome
import com.storytail.adventures.api.TripRepository
import com.storytail.adventures.domain.messages.InboxRowView
import com.storytail.adventures.domain.messages.MessagesMessages
import com.storytail.adventures.domain.messages.filterInboxRows
import com.storytail.adventures.domain.messages.inboxRows
import com.storytail.adventures.domain.trip.Loadable
import com.storytail.adventures.domain.trip.ThreadMessages
import com.storytail.adventures.ui.components.client.ThreadSurface
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * Screen 2.6.1.
 *
 * The search query lives here rather than in the screen so it survives a rotation, and the
 * filtering is applied to the state the screen reads — so a miss is an empty Ready list and
 * NOT `Loadable.Empty`, which the screen has to distinguish: one wants "nothing matched that"
 * and the other wants a call to action.
 */
class InboxViewModel(private val trips: TripRepository) : ViewModel() {

    private val loaded = MutableStateFlow<Loadable<List<InboxRowView>>>(Loadable.Loading)

    private val _query = MutableStateFlow("")
    val query: StateFlow<String> = _query.asStateFlow()

    private val _state = MutableStateFlow<Loadable<List<InboxRowView>>>(Loadable.Loading)
    val state: StateFlow<Loadable<List<InboxRowView>>> = _state.asStateFlow()

    /**
     * NO `init { load() }`, and NOT because loading eagerly is wrong — because it is not
     * ENOUGH. This view model is obtained through `viewModel { … }` against an app-scoped
     * store, so it outlives the screen: coming back to the Messages tab returns the same
     * instance, `init` does not run again, and the list stays exactly as it was when the tab
     * was last left.
     *
     * That is not a theoretical staleness. It cost a real bug, found on the emulator: sending
     * a message from 2.6.3 creates a conversation, and the inbox behind it did not have the
     * thread in it — the row was in Postgres and not on the screen. The same gap swallows
     * every `last_message_preview` change a send from 2.6.2 makes.
     *
     * The web twin has `revalidatePath("/messages")` for exactly this and native has no
     * equivalent, so [refresh] is called when the screen enters composition instead.
     */
    fun load() {
        loaded.value = Loadable.Loading
        _state.value = Loadable.Loading
        read()
    }

    /**
     * Re-read on entering the screen, WITHOUT flashing a spinner over a list that is already
     * on screen. A tab return that blanks its own content for a moment reads as a fault, so
     * the refetch is silent whenever there is something to keep; only a first load or a
     * previous failure shows the loading state.
     */
    fun refresh() {
        if (loaded.value !is Loadable.Ready) {
            loaded.value = Loadable.Loading
            _state.value = Loadable.Loading
        }
        read()
    }

    private fun read() {
        viewModelScope.launch {
            val rows = trips.inbox()
            // Null is a FAILED read. An empty list is "no conversations yet", which is a
            // different thing and gets the empty state rather than §5's error state — telling
            // somebody their messages are gone because a query timed out is the lie this
            // distinction exists to prevent.
            loaded.value = rows?.let { Loadable.Ready(inboxRows(it)) } ?: Loadable.Failed()
            applyQuery()
        }
    }

    fun changeQuery(next: String) {
        _query.value = next
        applyQuery()
    }

    private fun applyQuery() {
        val base = loaded.value
        _state.value = if (base is Loadable.Ready) {
            Loadable.Ready(filterInboxRows(base.value, _query.value))
        } else {
            base
        }
    }
}

/**
 * Screen 2.6.2.
 *
 * KEYED ON THE CONVERSATION, not the trip — which is the whole reason this is a separate
 * view model from `ThreadViewModel` rather than a parameter on it. It produces a
 * [ThreadSurface], the same type 2.2.7 produces, so the screen they share cannot tell them
 * apart and has no way to render them differently.
 */
class ConversationThreadViewModel(
    private val trips: TripRepository,
    private val conversationId: String,
) : ViewModel() {

    private val _state = MutableStateFlow<Loadable<ThreadSurface>>(Loadable.Loading)
    val state: StateFlow<Loadable<ThreadSurface>> = _state.asStateFlow()

    /** Null until loaded. What suppresses "Open trip" on the general thread. */
    private val _tripId = MutableStateFlow<String?>(null)
    val tripId: StateFlow<String?> = _tripId.asStateFlow()

    /**
     * THE DRAFT LIVES HERE, and that is what makes a half-typed message survive. The view
     * model is obtained through `viewModel(key = "…")` against an app-scoped store, so it
     * outlives the composable: switching tabs mid-sentence and coming back leaves the words in
     * the box. See the note in AppRoute.kt — this, not a per-tab stack, is the mechanism.
     */
    private val _draft = MutableStateFlow("")
    val draft: StateFlow<String> = _draft.asStateFlow()

    private val _sending = MutableStateFlow(false)
    val sending: StateFlow<Boolean> = _sending.asStateFlow()

    private val _sendError = MutableStateFlow<String?>(null)
    val sendError: StateFlow<String?> = _sendError.asStateFlow()

    init {
        load()
    }

    fun load() {
        _state.value = Loadable.Loading
        viewModelScope.launch {
            val result = trips.conversationThread(conversationId)
            // Null covers no such row, not yours, and archived alike — the policy makes all
            // three invisible, so none of them can be told apart.
            _state.value = result?.let { Loadable.Ready(it.toSurface()) } ?: Loadable.Failed()
            _tripId.value = result?.tripId
        }
    }

    fun changeDraft(next: String) {
        _draft.value = next
        if (_sendError.value != null) _sendError.value = null
    }

    fun send() {
        val body = _draft.value.trim()
        if (body.isEmpty() || _sending.value) return

        _sending.value = true
        _sendError.value = null
        viewModelScope.launch {
            when (val outcome = trips.sendToConversation(conversationId, body)) {
                SendMessageOutcome.Sent -> {
                    _draft.value = ""
                    // Reload rather than appending locally: the thread is the server's record,
                    // and a locally-appended bubble would show a message that might not have
                    // the id, timestamp or ordering the server gave it.
                    val refreshed = trips.conversationThread(conversationId)
                    if (refreshed != null) _state.value = Loadable.Ready(refreshed.toSurface())
                }

                is SendMessageOutcome.Failed ->
                    _sendError.value = outcome.detail ?: ThreadMessages.SEND_FAILED
            }
            _sending.value = false
        }
    }
}

/**
 * Screen 2.6.3.
 *
 * [started] is the conversation id once the message is away, which the route watches to push
 * into the thread. An EMPTY string means sent with no id in the response — the message is gone
 * either way, so the route lands on the inbox rather than reporting a failure that did not
 * happen.
 */
class NewConversationViewModel(private val trips: TripRepository) : ViewModel() {

    private val _draft = MutableStateFlow("")
    val draft: StateFlow<String> = _draft.asStateFlow()

    private val _sending = MutableStateFlow(false)
    val sending: StateFlow<Boolean> = _sending.asStateFlow()

    private val _sendError = MutableStateFlow<String?>(null)
    val sendError: StateFlow<String?> = _sendError.asStateFlow()

    private val _started = MutableStateFlow<String?>(null)
    val started: StateFlow<String?> = _started.asStateFlow()

    fun changeDraft(next: String) {
        _draft.value = next
        if (_sendError.value != null) _sendError.value = null
    }

    fun send() {
        val body = _draft.value.trim()
        if (body.isEmpty() || _sending.value) return

        _sending.value = true
        _sendError.value = null
        viewModelScope.launch {
            when (val outcome = trips.startConversation(body)) {
                is StartConversationOutcome.Started -> {
                    // The draft is NOT cleared here. This screen is leaving, and clearing it
                    // would flash an empty field during the push; if the navigation somehow
                    // does not happen, the words are still there.
                    _started.value = outcome.conversationId
                }

                is StartConversationOutcome.Failed ->
                    _sendError.value = outcome.detail ?: MessagesMessages.NEW_FAILED
            }
            _sending.value = false
        }
    }
}

/**
 * 2.6.2's header, flattened for the shared screen.
 *
 * The subtitle is the reply-window promise rather than 2.2.7's unread line: the inbox row this
 * screen was opened from already carried a badge for that number, and repeating it in the
 * header of the thread somebody is now reading says nothing.
 */
private fun ConversationThreadSnapshot.toSurface(): ThreadSurface = ThreadSurface(
    title = title,
    subtitle = MessagesMessages.REPLY_WINDOW,
    messages = messages,
    // `ThreadMessages.EMPTY_BODY` says "about this trip", which is wrong on the one thread
    // that has none. Reachable, because `trip-message` is not atomic.
    emptyBody = if (tripId == null) {
        MessagesMessages.THREAD_EMPTY_BODY
    } else {
        ThreadMessages.EMPTY_BODY
    },
)
