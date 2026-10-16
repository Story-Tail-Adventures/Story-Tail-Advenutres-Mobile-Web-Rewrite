package com.storytail.adventures.ui.screens.dashboard

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.storytail.adventures.api.SendMessageOutcome
import com.storytail.adventures.api.TripRepository
import com.storytail.adventures.domain.trip.Loadable
import com.storytail.adventures.domain.trip.ivePaidMessage
import com.storytail.adventures.domain.trip.openAmountCents
import com.storytail.adventures.ui.components.client.IvePaidState
import com.storytail.adventures.ui.components.client.formatMoney
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.datetime.LocalDate

/**
 * Screen 2.2.1's loader.
 *
 * [today] is injected rather than read from the clock here, for the same reason the
 * derivation in `domain/trip/TripStatus.kt` takes it as a parameter: the countdown and the
 * "final payment due" window are both date arithmetic, and a screen whose output depends on
 * an ambient clock cannot be tested and cannot be reasoned about across a midnight boundary.
 *
 * THE TWO READS FAIL SEPARATELY. A trip read that throws shows §5's error state; a name read
 * that throws costs the greeting its name and nothing else. Failing them together would put
 * an error page in front of somebody whose trips loaded fine.
 */
class DashboardViewModel(
    private val trips: TripRepository,
    private val today: LocalDate,
) : ViewModel() {

    private val _state = MutableStateFlow(DashboardUiState())
    val state: StateFlow<DashboardUiState> = _state.asStateFlow()

    init {
        load()
    }

    /** Also the retry, which is why it resets to Loading rather than holding the old error. */
    fun load() {
        // "I've paid" belongs to ONE payment. Remember which, so a refresh that brings a
        // different next payment (the last one was marked paid, or the trip changed) does not
        // keep showing the thanks line in place of the new payment's button.
        val before = (_state.value.snapshot as? Loadable.Ready)?.value?.nextPayment
        _state.update { it.copy(snapshot = Loadable.Loading) }
        viewModelScope.launch {
            val name = trips.greetableFirstName()
            val snapshot = trips.dashboard(today)
            _state.update {
                it.copy(
                    ivePaid = if (snapshot?.nextPayment == before) it.ivePaid else IvePaidState.IDLE,
                    firstName = name,
                    // FAILS CLOSED. A null snapshot is a failed read, and showing the empty
                    // state instead would tell a traveler they have no trips — a lie that
                    // looks like data loss. §5 asks for a real error state with a retry.
                    snapshot = snapshot?.let { s -> Loadable.Ready(s) } ?: Loadable.Failed(),
                )
            }
        }
    }

    /**
     * The next-payment card's "I've paid": a note in [tripId]'s thread, never a write to the
     * milestone. Same path and same rule as TripDetailViewModel.sendIvePaid.
     */
    fun sendIvePaid(tripId: String) {
        val payment = (_state.value.snapshot as? Loadable.Ready)?.value?.nextPayment ?: return
        if (_state.value.ivePaid == IvePaidState.SENDING || _state.value.ivePaid == IvePaidState.SENT) return
        _state.update { it.copy(ivePaid = IvePaidState.SENDING) }
        viewModelScope.launch {
            val body = ivePaidMessage(payment.label, formatMoney(openAmountCents(payment.amountCents, payment.paidCents), payment.currency))
            val next = when (trips.sendMessage(tripId, body)) {
                SendMessageOutcome.Sent -> IvePaidState.SENT
                is SendMessageOutcome.Failed -> IvePaidState.FAILED
            }
            _state.update { it.copy(ivePaid = next) }
        }
    }
}
