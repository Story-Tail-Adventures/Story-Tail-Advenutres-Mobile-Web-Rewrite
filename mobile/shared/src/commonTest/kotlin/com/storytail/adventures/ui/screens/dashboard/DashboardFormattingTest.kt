package com.storytail.adventures.ui.screens.dashboard

import kotlinx.datetime.LocalDate
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * The TypeScript twin is `web/app/(client)/dashboard/content.test.ts`. The greeting and the
 * leisure conditional are compared string-for-string by check_copy_parity.py; these cover
 * the behaviour around them.
 */
class DashboardFormattingTest {

    @Test
    fun `a cruise and an all-inclusive get the rest framing`() {
        assertTrue(isLeisure("cruise"))
        assertTrue(isLeisure("all_inclusive"))
    }

    @Test
    fun `the trip types a wedding or a funeral would use do NOT`() {
        // "You can finally breathe out" would be badly wrong on a bereavement trip.
        assertFalse(isLeisure("group"))
        assertFalse(isLeisure("multi_destination"))
        assertFalse(isLeisure("custom"))
        assertFalse(isLeisure("bereavement"))
        assertFalse(isLeisure(""))
    }

    @Test
    fun `the greeting never says 0 days or 1 days`() {
        assertEquals("Today’s the day, Jordan.", greeting("Jordan", 0, traveling = false, leisure = true))
        assertEquals("One more day, Jordan.", greeting("Jordan", 1, traveling = false, leisure = true))
        assertEquals("Today’s the day, Jordan.", greeting("Jordan", 0, traveling = false, leisure = false))
    }

    @Test
    fun `the rest framing appears only in the leisure variant`() {
        assertTrue(greeting("Jordan", 67, traveling = false, leisure = true).contains("breathe out"))
        assertEquals(
            "Hey Jordan — 67 days to go.",
            greeting("Jordan", 67, traveling = false, leisure = false),
        )
    }

    @Test
    fun `travelling and undated trips get their own greetings`() {
        assertEquals("You’re there, Jordan.", greeting("Jordan", 3, traveling = true, leisure = true))
        assertEquals("Hello, Jordan.", greeting("Jordan", null, traveling = false, leisure = true))
    }

    @Test
    fun `dates collapse the month when a trip does not cross one`() {
        assertEquals(
            "Nov 13 – 20, 2026",
            formatDates(LocalDate(2026, 11, 13), LocalDate(2026, 11, 20)),
        )
        assertEquals(
            "Dec 28 – Jan 4, 2027",
            formatDates(LocalDate(2026, 12, 28), LocalDate(2027, 1, 4)),
        )
        assertEquals("Nov 13, 2026", formatDates(LocalDate(2026, 11, 13), null))
        assertEquals("Dates to come", formatDates(null, null))
    }

    @Test
    fun `copy uses typographic apostrophes, matching the web twin`() {
        // check_copy_parity.py compares these strings byte-for-byte against content.ts, so a
        // straight quote here is a CI failure — but it is also just wrong, and it was wrong
        // for two strings until the parity table was completed.
        for (s in listOf(
            DashboardMessages.SUBTITLE_NO_TRIP,
            DashboardMessages.EMPTY_PAST_BODY,
            DashboardMessages.ERROR_TITLE,
            greeting("Jordan", 0, traveling = false, leisure = true),
            greeting("Jordan", 3, traveling = true, leisure = true),
        )) {
            assertFalse(s.contains('\''), "straight apostrophe in: $s")
        }
    }

    @Test
    fun `money is grouped and never rounds`() {
        // Integer arithmetic throughout — the cents never become a Double (CLAUDE.md rule 5).
        assertEquals("$7,845", formatMoney(784_500, "USD"))
        assertEquals("$100", formatMoney(10_000, "USD"))
        assertEquals("$1,284.50", formatMoney(128_450, "USD"))
        assertEquals("$0", formatMoney(0, "USD"))
        assertEquals("$0.07", formatMoney(7, "USD"))
    }

    @Test
    fun `an unfamiliar currency is prefixed rather than mislabelled as dollars`() {
        assertEquals("EUR 1,000", formatMoney(100_000, "EUR"))
    }
}
