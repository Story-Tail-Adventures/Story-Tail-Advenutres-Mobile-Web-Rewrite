package com.storytail.adventures.domain.onboarding

import com.storytail.adventures.domain.validation.CompanionValidation
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * The six-month passport horizon Screen 2.1m.12 warns on.
 *
 * Six months is the validity most countries want on entry, so a passport good for five is a
 * problem the traveler does not know they have.
 */
class SixMonthsTest {

    @Test
    fun `adds six months within the year`() {
        assertEquals("2026-09-04", CompanionValidation.sixMonthsFrom("2026-03-04"))
    }

    @Test
    fun `rolls into the next year`() {
        assertEquals("2027-03-04", CompanionValidation.sixMonthsFrom("2026-09-04"))
        assertEquals("2027-01-15", CompanionValidation.sixMonthsFrom("2026-07-15"))
    }

    @Test
    fun `clamps a day the target month does not have`() {
        // 31 August plus six months has no 31 February to land on. Clamping never names a
        // date that does not exist; a day either way cannot change the answer.
        assertEquals("2027-02-28", CompanionValidation.sixMonthsFrom("2026-08-31"))
        assertEquals("2028-02-29", CompanionValidation.sixMonthsFrom("2027-08-31"))
        assertEquals("2026-11-30", CompanionValidation.sixMonthsFrom("2026-05-31"))
    }

    @Test
    fun `warns on a passport inside the horizon and not on one beyond it`() {
        val horizon = CompanionValidation.sixMonthsFrom("2026-09-04")
        assertTrue(CompanionValidation.expiresWithinSixMonths("2027-01-01", horizon))
        assertTrue(CompanionValidation.expiresWithinSixMonths("2020-01-01", horizon))
        assertFalse(CompanionValidation.expiresWithinSixMonths("2031-02-01", horizon))
    }

    @Test
    fun `says nothing about a blank or unparseable expiry`() {
        val horizon = CompanionValidation.sixMonthsFrom("2026-09-04")
        assertFalse(CompanionValidation.expiresWithinSixMonths("", horizon))
        assertFalse(CompanionValidation.expiresWithinSixMonths("soon", horizon))
    }

    @Test
    fun `hands back what it was given rather than inventing a date`() {
        assertEquals("nonsense", CompanionValidation.sixMonthsFrom("nonsense"))
    }
}
