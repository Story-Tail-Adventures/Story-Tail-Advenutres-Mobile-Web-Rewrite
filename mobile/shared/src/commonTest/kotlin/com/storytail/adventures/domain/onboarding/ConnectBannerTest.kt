package com.storytail.adventures.domain.onboarding

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * What Screen 2.1m.13 tells somebody about trips already on their account.
 *
 * The screen used to render the no-match copy unconditionally, which told a traveler whose
 * trip HAD been auto-matched at email confirmation that nothing was linked — on the one
 * screen whose whole premise is honesty about what has already happened.
 */
class ConnectBannerTest {

    private fun banner(trips: List<LinkedTrip>, email: String? = null) =
        connectBanner(trips, email) { formatTripDate(it.startDate) }

    @Test
    fun `says nothing is linked when nothing is`() {
        val result = banner(emptyList())
        assertEquals(ConnectBannerCopy.NO_MATCH, result.message)
        assertFalse(result.matched)
    }

    @Test
    fun `names the one trip that matched`() {
        val result = banner(listOf(LinkedTrip("Sandals", "2026-08-12")))
        assertTrue(result.matched)
        assertEquals(ConnectBannerCopy.matchedOne("Sandals", "12 Aug 2026"), result.message)
    }

    @Test
    fun `counts and lists several`() {
        val result = banner(
            listOf(LinkedTrip("Sandals", "2026-08-12"), LinkedTrip("Athens", "2026-11-02")),
        )
        assertEquals(ConnectBannerCopy.matchedMany(2, "Sandals, Athens"), result.message)
    }

    @Test
    fun `adds the address the match keyed on`() {
        val result = banner(listOf(LinkedTrip("Sandals", null)), email = "sam@example.com")
        assertTrue(result.message.endsWith(ConnectBannerCopy.matchedFooter("sam@example.com")))
    }

    @Test
    fun `leaves the footer off when there is no address`() {
        assertFalse(banner(listOf(LinkedTrip("Sandals", null))).message.contains("Linked to"))
        assertFalse(banner(listOf(LinkedTrip("Sandals", null)), "").message.contains("Linked to"))
    }

    @Test
    fun `says the dates are coming rather than printing nothing`() {
        // A trip Gyasi has started but not dated is the common case for an early link.
        assertEquals(ConnectBannerCopy.DATES_TO_COME, formatTripDate(null))
        assertEquals(ConnectBannerCopy.DATES_TO_COME, formatTripDate(""))
        assertEquals(ConnectBannerCopy.DATES_TO_COME, formatTripDate("not-a-date"))
        assertEquals(ConnectBannerCopy.DATES_TO_COME, formatTripDate("2026-13-01"))
    }

    @Test
    fun `formats dates the way the web twin does`() {
        assertEquals("12 Aug 2026", formatTripDate("2026-08-12"))
        assertEquals("1 Jan 2027", formatTripDate("2027-01-01"))
        assertEquals("11 March 1990", formatLongDate("1990-03-11"))
        assertEquals("Feb 2031", formatMonthYear("2031-02-01"))
    }
}
