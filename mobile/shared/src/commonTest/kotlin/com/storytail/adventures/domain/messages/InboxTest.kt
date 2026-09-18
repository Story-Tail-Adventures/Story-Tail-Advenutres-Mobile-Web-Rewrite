package com.storytail.adventures.domain.messages

import com.storytail.adventures.api.InboxConversationView
import kotlinx.datetime.LocalDate
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * The twin of `web/lib/messages/inbox.test.ts`.
 *
 * `today` is passed explicitly in every case. A relative-time formatter tested against the real
 * clock passes at 3pm and fails at midnight, which is the worst kind of flake — it lands in CI
 * on somebody else's branch.
 *
 * `formatInboxTime`'s clock-time branch is NOT asserted against an exact string here, and that
 * is deliberate rather than lazy: unlike the web twin, which is handed
 * `platform_user.time_zone`, the native side reads the DEVICE zone, so "1:30a" depends on where
 * the machine running the test is. What is asserted is the branch taken — a time for today, a
 * date for anything older — which is the logic this file owns.
 */
class InboxTest {

    private val today = LocalDate(2026, 3, 15)

    private fun conversation(
        id: String = "0195a2c0-1a00-7000-8000-00000000abcd",
        subject: String? = null,
        tripId: String? = null,
        tripTitle: String? = null,
        lastMessageAt: String = "2026-03-15T12:00:00.000Z",
        preview: String? = "Locked. Final balance authorization is in your dashboard.",
        unread: Int = 0,
    ) = InboxConversationView(
        id = id,
        subject = subject,
        tripId = tripId,
        tripTitle = tripTitle,
        lastMessageAt = lastMessageAt,
        lastMessagePreview = preview,
        unreadCount = unread,
    )

    @Test
    fun `names a thread by trip, then subject, then the advisor`() {
        val rows = inboxRows(
            listOf(
                conversation(id = "a", tripTitle = "Sandals · Aug", subject = "Stale old subject"),
                conversation(id = "b", subject = "New family cruise idea"),
                conversation(id = "c"),
            ),
            today,
        )

        // The trip can be renamed after the thread was created, so the header follows the trip.
        assertEquals("Sandals · Aug", rows[0].title)
        assertEquals("New family cruise idea", rows[1].title)
        // The general thread is named for the person, not described as "General".
        assertEquals(MessagesMessages.GENERAL_THREAD_TITLE, rows[2].title)
    }

    @Test
    fun `shows a date rather than a clock time for an older message`() {
        val rows = inboxRows(
            listOf(conversation(lastMessageAt = "2026-03-01T12:00:00.000Z")),
            today,
        )
        assertEquals("Mar 1", rows[0].time)
    }

    @Test
    fun `shows a clock time for today, which is never a date`() {
        val rows = inboxRows(listOf(conversation(lastMessageAt = "2026-03-15T12:00:00.000Z")), today)
        val time = rows[0].time
        // Mid-day UTC is the same calendar day in every zone from UTC-11 to UTC+11, so this is
        // "today" wherever the test runs — and today renders as a clock time, which carries a
        // meridiem suffix and no month name.
        assertTrue(time.endsWith("a") || time.endsWith("p"), "expected a clock time, got '$time'")
        assertTrue(time.contains(":"), "expected a clock time, got '$time'")
    }

    @Test
    fun `renders a row whose preview column is null`() {
        // `last_message_preview` is nullable, and `trip-message` is not atomic — a conversation
        // exists for a moment before its first message lands. A thread that vanishes because
        // one column is null is worse than a thread with a quiet line under it.
        val rows = inboxRows(listOf(conversation(preview = null)), today)
        assertEquals("", rows[0].preview)
        assertEquals(1, rows.size)
    }

    @Test
    fun `returns an empty string rather than throwing on an unusable timestamp`() {
        assertEquals("", formatInboxTime("not a date", today))
    }

    @Test
    fun `carries the unread count through untouched`() {
        assertEquals(3, inboxRows(listOf(conversation(unread = 3)), today)[0].unreadCount)
    }

    @Test
    fun `search matches the title and the preview, ignoring case`() {
        val rows = inboxRows(
            listOf(
                conversation(id = "a", tripTitle = "Sandals · Aug", preview = "Bungalow held"),
                conversation(id = "b", subject = "Aruba honeymoon", preview = "Mid-October?"),
            ),
            today,
        )

        assertEquals(listOf("Sandals · Aug"), filterInboxRows(rows, "SANDALS").map { it.title })
        assertEquals(listOf("Sandals · Aug"), filterInboxRows(rows, "bungalow").map { it.title })
        assertEquals(listOf("Aruba honeymoon"), filterInboxRows(rows, "aruba").map { it.title })
    }

    @Test
    fun `search returns everything for a blank query and nothing for a miss`() {
        val rows = inboxRows(listOf(conversation(id = "a"), conversation(id = "b")), today)
        assertEquals(2, filterInboxRows(rows, "").size)
        assertEquals(2, filterInboxRows(rows, "   ").size)
        // The screen renders SEARCH_EMPTY off this. Returning the unfiltered list on a miss
        // would read as "search is broken" rather than "no results".
        assertEquals(0, filterInboxRows(rows, "zzz").size)
    }
}
