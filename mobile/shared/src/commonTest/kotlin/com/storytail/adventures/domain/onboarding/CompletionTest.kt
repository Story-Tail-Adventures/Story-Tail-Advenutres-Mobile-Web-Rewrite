package com.storytail.adventures.domain.onboarding

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * What Screen 2.1m.14 says about what was saved.
 *
 * Twin of web/app/(onboarding)/onboarding/complete/summary.test.ts, case for case. The rule
 * being defended is that a traveler is never congratulated for finishing something they
 * skipped, and never told nothing was saved while a trip sits on their dashboard.
 */
class CompletionTest {

    private fun summary(
        firstName: String? = null,
        hasProfile: Boolean = false,
        hasPreferences: Boolean = false,
        hasCompanions: Boolean = false,
        trip: LinkedTrip? = null,
    ) = CompletionSummary(firstName, hasProfile, hasPreferences, hasCompanions, trip)

    private val sandals = LinkedTrip("Sandals", "2026-08-12")

    @Test
    fun `celebrates everything only when everything is actually there`() {
        val all = summary(hasProfile = true, hasPreferences = true, hasCompanions = true)
        assertEquals(CompletionCopy.SUB_NO_TRIP, completionSubtitle(all))
    }

    @Test
    fun `names the trip when one is linked`() {
        val all = summary(
            hasProfile = true, hasPreferences = true, hasCompanions = true, trip = sandals,
        )
        assertEquals(CompletionCopy.subWithTrip("Sandals"), completionSubtitle(all))
    }

    @Test
    fun `lists only what was saved when steps were skipped`() {
        val partial = summary(hasProfile = true)
        assertEquals(
            CompletionCopy.subPartial(CompletionCopy.SHORT_PROFILE),
            completionSubtitle(partial),
        )
    }

    @Test
    fun `joins two with 'and', not a comma`() {
        val partial = summary(hasProfile = true, hasPreferences = true)
        assertEquals(
            CompletionCopy.subPartial("your details and how you like to travel"),
            completionSubtitle(partial),
        )
    }

    @Test
    fun `says nothing was saved when nothing was, rather than congratulating them`() {
        assertEquals(CompletionCopy.SUB_NOTHING, completionSubtitle(summary()))
    }

    @Test
    fun `does not claim a trip is linked just because the profile is complete`() {
        val all = summary(hasProfile = true, hasPreferences = true, hasCompanions = true)
        assertFalse(completionSubtitle(all).contains("linked and waiting"))
    }

    @Test
    fun `names the trip even when every step was skipped`() {
        // The ordinary shape for an existing client moved onto the portal: the email match
        // attached a trip before they filled in anything.
        assertEquals(
            CompletionCopy.subOnlyTrip("Sandals"),
            completionSubtitle(summary(trip = sandals)),
        )
    }

    @Test
    fun `names the trip alongside a partial list`() {
        assertEquals(
            CompletionCopy.subPartialWithTrip(CompletionCopy.SHORT_PROFILE, "Sandals"),
            completionSubtitle(summary(hasProfile = true, trip = sandals)),
        )
    }

    @Test
    fun `never says nothing was saved while a trip is on file`() {
        // The contradiction this whole screen exists to avoid: "nothing to save yet" three
        // lines above a checklist reading "your trip with Gyasi, linked".
        assertFalse(completionSubtitle(summary(trip = sandals)) == CompletionCopy.SUB_NOTHING)
    }

    @Test
    fun `lists all four steps whatever happened, so a skip is visible`() {
        assertEquals(4, completionChecklist(summary()).size)
    }

    @Test
    fun `says skipped in words, not only in an icon`() {
        // A colour is decoration. Somebody who cannot see it must still learn the option is
        // still open.
        completionChecklist(summary()).take(3).forEach {
            assertTrue(it.label.contains("skipped"), it.label)
            assertFalse(it.done)
        }
    }

    @Test
    fun `marks what was done`() {
        val done = completionChecklist(
            summary(hasProfile = true, hasPreferences = true, hasCompanions = true),
        )
        assertEquals(CompletionCopy.PROFILE_DONE, done[0].label)
        assertEquals(CompletionCopy.PREFERENCES_DONE, done[1].label)
        assertEquals(CompletionCopy.COMPANIONS_DONE, done[2].label)
        assertTrue(done.take(3).all { it.done })
    }

    @Test
    fun `says there is no trip rather than leaving the line off`() {
        assertEquals(CompletionCopy.TRIP_NONE, completionChecklist(summary())[3].label)
        assertFalse(completionChecklist(summary())[3].done)
        assertEquals(
            CompletionCopy.TRIP_DONE,
            completionChecklist(summary(trip = sandals))[3].label,
        )
    }
}
