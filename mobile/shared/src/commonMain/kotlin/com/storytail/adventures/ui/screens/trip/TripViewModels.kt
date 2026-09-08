package com.storytail.adventures.ui.screens.trip

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.storytail.adventures.api.ItineraryView
import com.storytail.adventures.api.TripDetailSnapshot
import com.storytail.adventures.api.TripFilter
import com.storytail.adventures.api.TripRepository
import com.storytail.adventures.api.SendMessageOutcome
import com.storytail.adventures.api.SignedDocument
import com.storytail.adventures.api.TripDocumentsSnapshot
import com.storytail.adventures.api.TripThreadSnapshot
import com.storytail.adventures.api.TripsList
import com.storytail.adventures.domain.trip.DocumentMessages
import com.storytail.adventures.domain.trip.Loadable
import com.storytail.adventures.domain.trip.ThreadMessages
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.datetime.LocalDate

/**
 * The §2.2 loaders.
 *
 * All of them FAIL CLOSED: a read that returns null becomes [Loadable.Failed] and §5's error
 * state with a retry, never an empty state. Telling a traveler they have no trips because a
 * query timed out is a lie that looks like data loss — the distinction OnboardingRepository
 * deliberately makes the other way, because a failed *bookkeeping* read should not lock
 * anybody out of their own dashboard.
 *
 * [today] is injected rather than read from a clock, because every §2.2 derivation is date
 * arithmetic and a screen whose output depends on an ambient clock cannot be tested.
 */
class AllTripsViewModel(
    private val trips: TripRepository,
    private val today: LocalDate,
) : ViewModel() {

    private val _state = MutableStateFlow<Loadable<TripsList>>(Loadable.Loading)
    val state: StateFlow<Loadable<TripsList>> = _state.asStateFlow()

    private val _filter = MutableStateFlow(TripFilter.ALL)
    val filter: StateFlow<TripFilter> = _filter.asStateFlow()

    init {
        load()
    }

    /**
     * Changing the filter reloads rather than filtering the held list.
     *
     * The repository computes the tab counts from the same snapshot it returns, so a
     * client-side filter would hold counts from an older read than the rows beside them.
     * One extra query per tap against a handful of rows is the cheaper mistake.
     */
    fun selectFilter(next: TripFilter) {
        if (next == _filter.value) return
        _filter.value = next
        load()
    }

    fun load() {
        _state.value = Loadable.Loading
        viewModelScope.launch {
            val result = trips.trips(_filter.value, today)
            _state.value = result?.let { Loadable.Ready(it) } ?: Loadable.Failed()
        }
    }
}

class TripDetailViewModel(
    private val trips: TripRepository,
    private val tripId: String,
    private val today: LocalDate,
) : ViewModel() {

    private val _state = MutableStateFlow<Loadable<TripDetailSnapshot>>(Loadable.Loading)
    val state: StateFlow<Loadable<TripDetailSnapshot>> = _state.asStateFlow()

    init {
        load()
    }

    fun load() {
        _state.value = Loadable.Loading
        viewModelScope.launch {
            val result = trips.tripDetail(tripId, today)
            // A null here means either "no such trip" or "not yours" — RLS makes those the
            // same answer, deliberately, and the screen says so without guessing which.
            _state.value = result?.let { Loadable.Ready(it) } ?: Loadable.Failed()
        }
    }
}


class ItineraryViewModel(
    private val trips: TripRepository,
    private val tripId: String,
    private val today: LocalDate,
    /** 2.2.5 opens straight onto a day; 2.2.4 opens onto the first. */
    initialDay: Int? = null,
) : ViewModel() {

    private val _state = MutableStateFlow<Loadable<ItineraryView>>(Loadable.Loading)
    val state: StateFlow<Loadable<ItineraryView>> = _state.asStateFlow()

    private val _selectedDay = MutableStateFlow(initialDay ?: 1)
    val selectedDay: StateFlow<Int> = _selectedDay.asStateFlow()

    init {
        load()
    }

    fun selectDay(dayNumber: Int) {
        _selectedDay.value = dayNumber
    }

    fun load() {
        _state.value = Loadable.Loading
        viewModelScope.launch {
            val result = trips.itinerary(tripId, today)
            _state.value = result?.let { Loadable.Ready(it) } ?: Loadable.Failed()
            // Snap the selection to a day that exists. An itinerary the agent renumbered, or
            // a deep link to a day that was removed, would otherwise show an empty screen
            // with a valid-looking day chip.
            val days = result?.days.orEmpty()
            if (days.none { it.dayNumber == _selectedDay.value }) {
                days.firstOrNull()?.let { _selectedDay.value = it.dayNumber }
            }
        }
    }
}

/**
 * Screen 2.2.6.
 *
 * Holds THREE pieces of state beyond the list, and each is here rather than in the screen
 * because a rotation must not lose them: which document is mid-signature, the last open
 * failure, and nothing else. The signed URL itself is deliberately NOT held — it expires in
 * five minutes, so keeping it would mean handing a traveler a dead link on their second tap.
 */
class DocumentsViewModel(
    private val trips: TripRepository,
    private val tripId: String,
) : ViewModel() {

    private val _state = MutableStateFlow<Loadable<TripDocumentsSnapshot>>(Loadable.Loading)
    val state: StateFlow<Loadable<TripDocumentsSnapshot>> = _state.asStateFlow()

    /** The id being signed, so one row shows a spinner rather than the whole list. */
    private val _signing = MutableStateFlow<String?>(null)
    val signing: StateFlow<String?> = _signing.asStateFlow()

    private val _openError = MutableStateFlow<String?>(null)
    val openError: StateFlow<String?> = _openError.asStateFlow()

    init {
        load()
    }

    fun load() {
        _state.value = Loadable.Loading
        viewModelScope.launch {
            val result = trips.tripDocuments(tripId)
            _state.value = result?.let { Loadable.Ready(it) } ?: Loadable.Failed()
        }
    }

    /**
     * Sign on demand and hand the URL to [onSigned], which opens it in the platform browser.
     *
     * ON NOT PRE-SIGNING THE WHOLE LIST: the TTL is five minutes and every signature writes
     * an `audit_event`. Signing five documents to render the screen would put five access
     * records on the trail for a traveler who opened none of them, and four of the URLs
     * would be dead before anybody tapped. Signing on demand keeps the trail honest about
     * what was actually opened, which is its whole purpose (Data-Model §18.3).
     */
    fun open(documentId: String, onSigned: (String) -> Unit) {
        if (_signing.value != null) return
        _signing.value = documentId
        _openError.value = null
        viewModelScope.launch {
            when (val signed = trips.signDocumentUrl(documentId)) {
                is SignedDocument.Ok -> onSigned(signed.url)
                SignedDocument.Failed -> _openError.value = DocumentMessages.OPEN_FAILED
            }
            _signing.value = null
        }
    }
}

/**
 * Screen 2.2.7.
 *
 * THE DRAFT LIVES HERE, not in the composable, and that is the point of putting it in a view
 * model at all: a rotation or a trip to the camera roll must not throw away a paragraph
 * somebody typed. On a failed send it is kept for the same reason — losing the message is a
 * small betrayal that stops people using a thread.
 */
class ThreadViewModel(
    private val trips: TripRepository,
    private val tripId: String,
) : ViewModel() {

    private val _state = MutableStateFlow<Loadable<TripThreadSnapshot>>(Loadable.Loading)
    val state: StateFlow<Loadable<TripThreadSnapshot>> = _state.asStateFlow()

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
            val result = trips.tripThread(tripId)
            _state.value = result?.let { Loadable.Ready(it) } ?: Loadable.Failed()
        }
    }

    fun changeDraft(next: String) {
        _draft.value = next
        // Clear a stale failure the moment they start fixing it, rather than leaving a red
        // line under a message they have already rewritten.
        if (_sendError.value != null) _sendError.value = null
    }

    fun send() {
        val body = _draft.value.trim()
        if (body.isEmpty() || _sending.value) return

        _sending.value = true
        _sendError.value = null
        viewModelScope.launch {
            when (val outcome = trips.sendMessage(tripId, body)) {
                SendMessageOutcome.Sent -> {
                    _draft.value = ""
                    // Reload rather than appending locally: the thread is the server's
                    // record, and a locally-appended bubble would show a message that might
                    // not have the id, timestamp or ordering the server gave it.
                    val refreshed = trips.tripThread(tripId)
                    if (refreshed != null) _state.value = Loadable.Ready(refreshed)
                }

                is SendMessageOutcome.Failed ->
                    _sendError.value = outcome.detail ?: ThreadMessages.SEND_FAILED
            }
            _sending.value = false
        }
    }
}
