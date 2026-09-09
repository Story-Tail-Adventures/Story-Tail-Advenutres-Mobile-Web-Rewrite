package com.storytail.adventures.domain.trip

import kotlinx.datetime.LocalDate
import kotlinx.datetime.LocalDateTime
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toInstant
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * The Kotlin half of the 2.2.7 spine.
 *
 * These assertions are LOCAL-TIME assertions, which is the whole point of the code they
 * cover: a message sent at 11:14 in Jamaica must read 11:14 to the traveler who sent it. So
 * the fixtures are built as a local wall-clock time and converted to an instant through the
 * system zone — the inverse of what the production code does. Writing them as literal `…Z`
 * strings would make the file pass in UTC and fail anywhere else, which is worse than not
 * testing it.
 */
class TripThreadTest {

    private val zone = TimeZone.currentSystemDefault()

    /** A local wall-clock time, as the ISO instant the database would hand back. */
    private fun at(year: Int, month: Int, day: Int, hour: Int, minute: Int = 0): String =
        LocalDateTime(year, month, day, hour, minute).toInstant(zone).toString()

    private val today = LocalDate(2026, 9, 7)

    @Test
    fun `prints the artboards compact twelve-hour format`() {
        assertEquals("11:14a", formatMessageTime(at(2026, 8, 12, 11, 14)))
        assertEquals("2:14p", formatMessageTime(at(2026, 8, 12, 14, 14)))
    }

    @Test
    fun `calls midnight and noon twelve not zero`() {
        assertEquals("12:05a", formatMessageTime(at(2026, 8, 12, 0, 5)))
        assertEquals("12:00p", formatMessageTime(at(2026, 8, 12, 12, 0)))
    }

    @Test
    fun `pads the minutes so nine oh five does not read as nine five`() {
        assertEquals("9:05a", formatMessageTime(at(2026, 8, 12, 9, 5)))
    }

    @Test
    fun `returns nothing rather than a placeholder for an unparseable value`() {
        assertEquals("", formatMessageTime("not a timestamp"))
        assertEquals("", formatDaySeparator("not a timestamp", today))
    }

    @Test
    fun `says today and yesterday before it says a date`() {
        assertEquals(ThreadMessages.TODAY, formatDaySeparator(at(2026, 9, 7, 9), today))
        assertEquals(ThreadMessages.YESTERDAY, formatDaySeparator(at(2026, 9, 6, 23, 30), today))
    }

    @Test
    fun `falls back to a short date further out`() {
        assertEquals("Mar 14", formatDaySeparator(at(2026, 3, 14, 9), today))
    }

    @Test
    fun `treats a late-evening message as its own local day`() {
        // 11:30pm local is the same calendar day to the person who sent it. Keying on the
        // UTC date would push it into tomorrow for anybody west of Greenwich and split one
        // evening across two separators.
        assertEquals(ThreadMessages.TODAY, formatDaySeparator(at(2026, 9, 7, 23, 30), today))
    }

    @Test
    fun `crosses a month boundary correctly`() {
        assertEquals(
            ThreadMessages.YESTERDAY,
            formatDaySeparator(at(2026, 9, 30, 12), LocalDate(2026, 10, 1)),
        )
    }

    private data class Msg(val createdAt: String)

    private fun days(vararg messages: Msg) =
        groupMessagesByDay(messages.toList(), today) { it.createdAt }

    @Test
    fun `keeps the thread oldest-first and buckets consecutive days`() {
        val grouped = days(
            Msg(at(2026, 9, 6, 11, 14)),
            Msg(at(2026, 9, 6, 11, 32)),
            Msg(at(2026, 9, 7, 14, 14)),
        )
        assertEquals(
            listOf(ThreadMessages.YESTERDAY, ThreadMessages.TODAY),
            grouped.map { it.label },
        )
        assertEquals(listOf(2, 1), grouped.map { it.messages.size })
    }

    @Test
    fun `gives each day a stable key so the list does not remount`() {
        assertEquals("2026-09-06", days(Msg(at(2026, 9, 6, 11, 14)))[0].key)
    }

    @Test
    fun `opens a new bucket when a day repeats after a gap`() {
        // Not a real thread ordering, but merging non-adjacent same-day runs would reorder
        // somebody's messages.
        val grouped = days(
            Msg(at(2026, 9, 5, 9)),
            Msg(at(2026, 9, 6, 9)),
            Msg(at(2026, 9, 5, 10)),
        )
        assertEquals(listOf("2026-09-05", "2026-09-06", "2026-09-05"), grouped.map { it.key })
    }

    @Test
    fun `skips an unparseable timestamp instead of dropping the thread`() {
        val grouped = days(Msg("nonsense"), Msg(at(2026, 9, 7, 9)))
        assertEquals(1, grouped.size)
        assertEquals(1, grouped[0].messages.size)
    }

    @Test
    fun `returns nothing for an empty thread`() {
        assertEquals(emptyList(), days())
    }

    @Test
    fun `offers four distinct quick replies all from the shared table`() {
        assertEquals(4, QUICK_REPLIES.size)
        assertEquals(4, QUICK_REPLIES.toSet().size)
        val table = listOf(
            ThreadMessages.QUICK_SOUNDS_GOOD,
            ThreadMessages.QUICK_ADD_PARTNER,
            ThreadMessages.QUICK_SEND_PASSPORT,
            ThreadMessages.QUICK_SCHEDULE_CALL,
        )
        for (reply in QUICK_REPLIES) {
            assertTrue(reply in table, "$reply is not in the shared copy table")
        }
    }
}
