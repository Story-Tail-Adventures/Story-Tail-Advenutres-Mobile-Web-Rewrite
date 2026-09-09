package com.storytail.adventures.ui.components

import kotlin.test.Test
import kotlin.test.assertEquals

/**
 * `isoDate` — the date picker's millis-to-`YYYY-MM-DD` conversion.
 *
 * THIS EXISTS BECAUSE THE FIRST VERSION WAS WRONG BELOW 1970. It walked years forward from
 * the epoch and broke out of that loop immediately whenever the day count was negative, so
 * every pre-1970 date came back as a January 1970 day with a negative day number. The field
 * it feeds is date of birth, where pre-1970 is not an edge case but the majority of adults.
 */
class DateFieldTest {

    private fun millis(days: Long) = days * 86_400_000L

    @Test
    fun `converts the epoch itself`() {
        assertEquals("1970-01-01", isoDate(0L))
    }

    @Test
    fun `converts a date after the epoch`() {
        // 2026-09-04, the day this was written.
        assertEquals("2026-09-04", isoDate(millis(20_700)))
    }

    @Test
    fun `converts a date before the epoch`() {
        // The regression. One day before the epoch is 1969-12-31, not "1970-01-00".
        assertEquals("1969-12-31", isoDate(millis(-1)))
    }

    @Test
    fun `converts the earliest birth date the profile rules accept`() {
        // ProfileValidation allows back to 1900-01-01; the picker must be able to say it.
        assertEquals("1900-01-01", isoDate(millis(-25_567)))
    }

    @Test
    fun `handles a negative instant that is not midnight`() {
        // Floor division, not truncation: one millisecond before the epoch is still the day
        // before it. Truncating toward zero would call it 1970-01-01.
        assertEquals("1969-12-31", isoDate(-1L))
    }

    @Test
    fun `pads single-digit months and days`() {
        assertEquals("1970-02-03", isoDate(millis(33)))
    }

    @Test
    fun `gets leap days right on both sides of the epoch`() {
        assertEquals("1972-02-29", isoDate(millis(789)))
        assertEquals("1968-02-29", isoDate(millis(-672)))
    }
}
