package com.storytail.adventures.ui.screens.trip

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.storytail.adventures.api.TripDetailSnapshot
import com.storytail.adventures.api.TripFilter
import com.storytail.adventures.api.TripRepository
import com.storytail.adventures.api.TripsList
import com.storytail.adventures.domain.trip.Loadable
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
