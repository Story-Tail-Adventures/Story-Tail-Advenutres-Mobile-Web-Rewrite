package com.storytail.adventures.agent

import com.storytail.adventures.domain.agent.AgentMessagesCopy
import com.storytail.adventures.domain.agent.AgentThreadListRow
import com.storytail.adventures.domain.agent.agentInboxRow
import com.storytail.adventures.domain.agent.initialsOf
import com.storytail.adventures.domain.agent.messageClientLabel
import com.storytail.adventures.domain.agent.messagesHeadline
import com.storytail.adventures.domain.agent.messagesNoLogin
import com.storytail.adventures.domain.agent.replyDueDay
import kotlinx.datetime.LocalDate
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

/**
 * §3.10 Stage 3: the phone inbox's mapping. Every expectation mirrors the web's
 * (`web/lib/agent/messages.test.ts`), so the two stacks show an advisor the same row.
 */
class AgentMessagesTest {

    private val today = LocalDate(2026, 10, 15)

    private fun row(
        preview: String? = "Is the airport transfer included?",
        lastSender: String? = "client",
        tripTitle: String? = "Saint Lucia · Between Semesters",
        replyDueAt: String? = null,
        overdue: Boolean = false,
    ) = AgentThreadListRow(
        conversationId = "c1",
        clientId = "k1",
        clientName = "Maya Carter",
        tripId = if (tripTitle == null) null else "t1",
        tripTitle = tripTitle,
        lastMessageAt = "2026-10-12T14:00:00+00:00",
        lastMessagePreview = preview,
        lastSenderRole = lastSender,
        unread = 2,
        replyDueAt = replyDueAt,
        overdue = overdue,
        archived = false,
        totalCount = 1,
    )

    @Test
    fun the_advisor_speaking_last_reads_You() {
        assertEquals("You: Booked!", agentInboxRow(row(preview = "Booked!", lastSender = "agent"), "America/Chicago", today).preview)
        assertEquals("Is the airport transfer included?", agentInboxRow(row(), "America/Chicago", today).preview)
        // An empty preview never gets a bare "You: ".
        assertEquals("", agentInboxRow(row(preview = null, lastSender = "agent"), "America/Chicago", today).preview)
    }

    @Test
    fun a_thread_about_no_trip_is_General() {
        assertEquals(AgentMessagesCopy.GENERAL_THREAD, agentInboxRow(row(tripTitle = null), "America/Chicago", today).tripLabel)
    }

    @Test
    fun reply_by_names_the_day_that_ENDS_at_the_due_midnight_in_the_advisors_zone() {
        // 2026-10-14 00:00 in Chicago is the END of Tuesday the 13th.
        val due = "2026-10-14T05:00:00+00:00"
        assertEquals("Tue", replyDueDay(due, "America/Chicago"))
        assertEquals("Reply by Tue", agentInboxRow(row(replyDueAt = due), "America/Chicago", today).replyByLabel)
        // Overdue shows its own chip, never a "Reply by" beside it.
        assertNull(agentInboxRow(row(replyDueAt = due, overdue = true), "America/Chicago", today).replyByLabel)
        // A bad zone string falls back to UTC rather than throwing inside a composition.
        assertEquals("Wed", replyDueDay("2026-10-15T00:00:00Z", "Not/AZone"))
    }

    @Test
    fun headline_and_copy_match_the_web() {
        assertEquals("All caught up", messagesHeadline(0, 0))
        assertEquals("2 unread · 1 overdue", messagesHeadline(2, 1))
        assertEquals("1 overdue", messagesHeadline(0, 1))
        assertEquals("Message Kai", messageClientLabel("Kai"))
        assertEquals("Pri hasn't set up a login yet. This will be waiting for them.", messagesNoLogin("Pri"))
    }

    @Test
    fun initials_never_more_than_two() {
        assertEquals("JH", initialsOf("Jordan Hayes"))
        assertEquals("BF", initialsOf("Belle Fitzwilliam-Castellanos"))
        assertEquals("P", initialsOf("Pri"))
    }
}
