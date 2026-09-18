package com.storytail.adventures.ui.screens.wallet

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.storytail.adventures.api.AuthorizeOutcome
import com.storytail.adventures.api.TripRepository
import com.storytail.adventures.api.WalletRepository
import com.storytail.adventures.api.WalletSnapshot
import com.storytail.adventures.domain.trip.Loadable
import com.storytail.adventures.domain.trip.localToday
import com.storytail.adventures.domain.wallet.WalletMessages
import com.storytail.adventures.domain.wallet.defaultExpiryIso
import com.storytail.adventures.domain.wallet.limitPresets
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * The read side of §2.4, shared by 2.4.1, 2.4.5, 2.4.6, 2.4.4 and 2.4.7.
 *
 * ONE SNAPSHOT, FIVE SCREENS, because every one of them needs at least two of the three
 * lists: 2.4.1 shows a card and what it is authorized for, 2.4.5 shows an event and which
 * card took it, 2.4.7 shows an authorization and how much of it is left. Splitting the call
 * would mean each screen reassembling the same join from separate responses.
 *
 * [refresh] exists for the same reason §2.6's inbox needed one: these view models are
 * obtained through `viewModel(key = …)` against an app-scoped store, so returning to a screen
 * returns the same instance with the same data. A create on 2.4.3 and a revoke on 2.4.7 both
 * happen on screens pushed above 2.4.1, and neither would otherwise reach it — the web twin
 * calls `revalidatePath`; native has nothing like it. The refetch is silent when there is
 * already something on screen, because a list that blanks itself on every return reads as a
 * fault.
 */
class WalletViewModel(
    private val wallet: WalletRepository,
    private val cardFilter: String? = null,
) : ViewModel() {

    private val _state = MutableStateFlow<Loadable<WalletSnapshot>>(Loadable.Loading)
    val state: StateFlow<Loadable<WalletSnapshot>> = _state.asStateFlow()

    fun load() {
        _state.value = Loadable.Loading
        read()
    }

    fun refresh() {
        if (_state.value !is Loadable.Ready) _state.value = Loadable.Loading
        read()
    }

    private fun read() {
        viewModelScope.launch {
            val snapshot = wallet.wallet(cardId = cardFilter)
            // Null is a FAILED read. An empty wallet is "no cards yet", which is a different
            // thing and gets the empty state — telling somebody their cards are gone because
            // a request timed out is the lie this distinction exists to prevent.
            _state.value = snapshot?.let { Loadable.Ready(it) } ?: Loadable.Failed()
        }
    }
}

/**
 * Screen 2.4.3.
 *
 * The form state lives here rather than in the composable so it survives a rotation — a
 * traveler who has picked a card, set a custom limit and ticked the mandate should not lose
 * all three to turning the phone.
 */
class AuthorizeViewModel(
    private val wallet: WalletRepository,
    private val trips: TripRepository,
    private val tripId: String,
) : ViewModel() {

    private val _state = MutableStateFlow<Loadable<WalletSnapshot>>(Loadable.Loading)
    val state: StateFlow<Loadable<WalletSnapshot>> = _state.asStateFlow()

    private val _tripTitle = MutableStateFlow("")
    val tripTitle: StateFlow<String> = _tripTitle.asStateFlow()

    private val _balanceDueCents = MutableStateFlow(0L)
    val balanceDueCents: StateFlow<Long> = _balanceDueCents.asStateFlow()

    private val _presets = MutableStateFlow<List<Pair<String, Long>>>(emptyList())
    val presets: StateFlow<List<Pair<String, Long>>> = _presets.asStateFlow()

    private val _selectedCardId = MutableStateFlow<String?>(null)
    val selectedCardId: StateFlow<String?> = _selectedCardId.asStateFlow()

    private val _selectedLimitCents = MutableStateFlow(0L)
    val selectedLimitCents: StateFlow<Long> = _selectedLimitCents.asStateFlow()

    private val _expiryIso = MutableStateFlow("")
    val expiryIso: StateFlow<String> = _expiryIso.asStateFlow()

    private val _consented = MutableStateFlow(false)
    val consented: StateFlow<Boolean> = _consented.asStateFlow()

    private val _sending = MutableStateFlow(false)
    val sending: StateFlow<Boolean> = _sending.asStateFlow()

    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()

    /** The new authorization's id, which the route watches to push into 2.4.4. */
    private val _authorized = MutableStateFlow<String?>(null)
    val authorized: StateFlow<String?> = _authorized.asStateFlow()

    init {
        load()
    }

    fun load() {
        _state.value = Loadable.Loading
        viewModelScope.launch {
            val today = localToday()
            val detail = trips.tripDetail(tripId, today)
            val snapshot = wallet.wallet()

            if (detail != null) {
                _tripTitle.value = detail.trip.title
                val due = detail.trip.totalValueCents - detail.trip.totalPaidCents
                _balanceDueCents.value = due.coerceAtLeast(0)
                _presets.value = limitPresets(_balanceDueCents.value)
                // The +10% preset, which is what the artboard pre-selects: an exact limit
                // leaves no room for a supplier's resort fee or a currency swing.
                _selectedLimitCents.value = _presets.value.getOrNull(1)?.second
                    ?: _balanceDueCents.value
                _expiryIso.value = defaultExpiryIso(detail.trip.endDate?.toString(), today)
            }

            _state.value = snapshot?.let { Loadable.Ready(it) } ?: Loadable.Failed()
            _selectedCardId.value = snapshot?.cards?.firstOrNull { it.isActive }?.id
        }
    }

    fun selectCard(id: String) { _selectedCardId.value = id }
    fun selectLimit(cents: Long) { _selectedLimitCents.value = cents }

    fun toggleConsent(next: Boolean) {
        _consented.value = next
        if (_error.value != null) _error.value = null
    }

    fun submit() {
        val cardId = _selectedCardId.value ?: return
        val cents = _selectedLimitCents.value
        // The consent gate is here AND on the server. This one stops a mis-tap; the server's
        // is what makes consent_payload mean anything, because a mandate recorded for
        // somebody who never agreed is worse than no record at all.
        if (!_consented.value || cents <= 0 || _sending.value) return

        _sending.value = true
        _error.value = null
        viewModelScope.launch {
            when (val outcome = wallet.authorize(cardId, tripId, cents, _expiryIso.value)) {
                is AuthorizeOutcome.Done -> _authorized.value = outcome.authorizationId
                is AuthorizeOutcome.Failed ->
                    _error.value = outcome.detail ?: WalletMessages.AUTHORIZE_FAILED
            }
            _sending.value = false
        }
    }
}

/** Screen 2.4.7. Removes an AUTHORIZATION — never a card. */
class RemoveAuthorizationViewModel(
    private val wallet: WalletRepository,
    private val authorizationId: String,
) : ViewModel() {

    private val _state = MutableStateFlow<Loadable<WalletSnapshot>>(Loadable.Loading)
    val state: StateFlow<Loadable<WalletSnapshot>> = _state.asStateFlow()

    private val _sending = MutableStateFlow(false)
    val sending: StateFlow<Boolean> = _sending.asStateFlow()

    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()

    private val _removed = MutableStateFlow(false)
    val removed: StateFlow<Boolean> = _removed.asStateFlow()

    init {
        load()
    }

    fun load() {
        _state.value = Loadable.Loading
        viewModelScope.launch {
            val snapshot = wallet.wallet()
            _state.value = snapshot?.let { Loadable.Ready(it) } ?: Loadable.Failed()
        }
    }

    fun confirm() {
        if (_sending.value) return
        _sending.value = true
        _error.value = null
        viewModelScope.launch {
            when (val outcome = wallet.removeAuthorization(authorizationId)) {
                is AuthorizeOutcome.Done -> _removed.value = true
                is AuthorizeOutcome.Failed ->
                    _error.value = outcome.detail ?: WalletMessages.REMOVE_FAILED
            }
            _sending.value = false
        }
    }
}
