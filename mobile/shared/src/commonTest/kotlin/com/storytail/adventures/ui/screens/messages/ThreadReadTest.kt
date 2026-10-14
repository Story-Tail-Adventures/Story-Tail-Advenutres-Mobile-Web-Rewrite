package com.storytail.adventures.ui.screens.messages

import com.storytail.adventures.api.ConversationThreadSnapshot
import com.storytail.adventures.api.SendMessageOutcome
import com.storytail.adventures.api.ThreadMessageView
import com.storytail.adventures.api.TripRepository
import com.storytail.adventures.api.TripThreadSnapshot
import com.storytail.adventures.api.UnconfiguredTripRepository
import com.storytail.adventures.domain.trip.MessageSender
import com.storytail.adventures.domain.trip.Loadable
import com.storytail.adventures.ui.screens.trip.ThreadViewModel
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs

/**
 * §3.10 Stage 1: opening a thread reads it. 2.2.7 (the trip thread) and 2.6.2 (any thread)
 * clear the traveler's unread count once the thread is on screen, only when there is one, and
 * naming the newest message shown, so a reply that lands after it stays unread.
 *
 * The view models outlive their screens (app-scoped), so "opening" is every entry, not the
 * first: each entry re-reads and clears again (mobile review).
 */
class ThreadReadTest {

    private fun message(id: String, at: String) =
        ThreadMessageView(id, MessageSender.AGENT, "hi", at, emptyList())

    private fun trip(unread: Int, vararg at: String, conversationId: String? = "c1") =
        TripThreadSnapshot("t1", "Negril", conversationId, unread, at.mapIndexed { i, t -> message("m$i", t) })

    /** Everything else answers as an unconfigured app would; the thread reads and the clear are real. */
    private class Trips(
        var tripThread: TripThreadSnapshot? = null,
        var conversation: ConversationThreadSnapshot? = null,
        val clearReturns: Boolean = true,
        val clearGate: CompletableDeferred<Unit>? = null,
    ) : TripRepository by UnconfiguredTripRepository() {
        val marked = mutableListOf<Pair<String, String>>()
        override suspend fun tripThread(tripId: String): TripThreadSnapshot? = tripThread
        override suspend fun conversationThread(conversationId: String): ConversationThreadSnapshot? = conversation
        override suspend fun sendMessage(tripId: String, body: String): SendMessageOutcome = SendMessageOutcome.Sent
        override suspend fun markConversationRead(conversationId: String, seenUpTo: String): Boolean {
            clearGate?.await()
            marked += conversationId to seenUpTo
            return clearReturns
        }
    }

    @BeforeTest
    fun setUp() {
        Dispatchers.setMain(StandardTestDispatcher())
    }

    @AfterTest
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun the_trip_thread_clears_its_unread_count_naming_the_newest_message_shown() = runTest {
        val trips = Trips(tripThread = trip(2, "2026-10-12T18:00:00Z", "2026-10-12T19:00:00Z"))
        ThreadViewModel(trips, "t1")
        advanceUntilIdle()
        assertEquals(listOf<Pair<String, String>>("c1" to "2026-10-12T19:00:00Z"), trips.marked)
    }

    @Test
    fun the_thread_is_on_screen_before_the_clear_and_stays_there_whatever_it_answers() = runTest {
        val gate = CompletableDeferred<Unit>()
        val trips = Trips(tripThread = trip(1, "2026-10-12T18:00:00Z"), clearReturns = false, clearGate = gate)
        val vm = ThreadViewModel(trips, "t1")
        advanceUntilIdle()
        // The clear is still waiting, and the thread already shows.
        assertIs<Loadable.Ready<*>>(vm.state.value)
        assertEquals(0, trips.marked.size)
        gate.complete(Unit)
        advanceUntilIdle()
        assertIs<Loadable.Ready<*>>(vm.state.value)
        assertEquals(1, trips.marked.size)
    }

    @Test
    fun nothing_unread_no_conversation_or_nothing_on_screen_marks_nothing() = runTest {
        val read = Trips(tripThread = trip(0, "2026-10-12T18:00:00Z"))
        ThreadViewModel(read, "t1")
        val none = Trips(tripThread = trip(0, conversationId = null))
        ThreadViewModel(none, "t1")
        val general = Trips(conversation = ConversationThreadSnapshot("c9", "General", null, 0, emptyList()))
        ConversationThreadViewModel(general, "c9")
        // A count with no message on screen: the server needs the newest one seen, so no call.
        val empty = Trips(tripThread = trip(1))
        ThreadViewModel(empty, "t1")
        advanceUntilIdle()
        assertEquals(0, read.marked.size)
        assertEquals(0, none.marked.size)
        assertEquals(0, general.marked.size)
        assertEquals(0, empty.marked.size)
    }

    @Test
    fun coming_back_after_a_new_reply_shows_it_and_clears_again() = runTest {
        val trips = Trips(tripThread = trip(1, "2026-10-12T18:00:00Z"))
        val vm = ThreadViewModel(trips, "t1")
        advanceUntilIdle()
        // The advisor replies while the screen is away; the traveler comes back.
        trips.tripThread = trip(1, "2026-10-12T18:00:00Z", "2026-10-13T09:00:00Z")
        vm.refresh()
        advanceUntilIdle()
        assertEquals(listOf<Pair<String, String>>("c1" to "2026-10-12T18:00:00Z", "c1" to "2026-10-13T09:00:00Z"), trips.marked)
        assertEquals(2, (vm.state.value as Loadable.Ready).value.messages.size)
    }

    @Test
    fun a_failed_re_read_keeps_the_thread_on_screen() = runTest {
        val trips = Trips(tripThread = trip(0, "2026-10-12T18:00:00Z"))
        val vm = ThreadViewModel(trips, "t1")
        advanceUntilIdle()
        trips.tripThread = null
        vm.refresh()
        advanceUntilIdle()
        assertIs<Loadable.Ready<*>>(vm.state.value)
    }

    @Test
    fun the_reload_after_a_send_clears_a_reply_that_came_in_while_typing() = runTest {
        val trips = Trips(tripThread = trip(0, "2026-10-12T18:00:00Z"))
        val vm = ThreadViewModel(trips, "t1")
        advanceUntilIdle()
        trips.tripThread = trip(1, "2026-10-12T18:00:00Z", "2026-10-13T09:00:00Z", "2026-10-13T09:01:00Z")
        vm.changeDraft("Thanks!")
        vm.send()
        advanceUntilIdle()
        assertEquals(listOf<Pair<String, String>>("c1" to "2026-10-13T09:01:00Z"), trips.marked)
    }

    @Test
    fun any_thread_opened_from_the_inbox_clears_its_count_too() = runTest {
        val trips = Trips(
            conversation = ConversationThreadSnapshot("c9", "General", null, 1, listOf(message("m1", "2026-10-12T18:00:00Z"))),
        )
        ConversationThreadViewModel(trips, "c9")
        advanceUntilIdle()
        assertEquals(listOf<Pair<String, String>>("c9" to "2026-10-12T18:00:00Z"), trips.marked)
    }
}
