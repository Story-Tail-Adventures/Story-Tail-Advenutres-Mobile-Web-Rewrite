package com.storytail.adventures.domain.validation

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * The Screen 2.1m.11 rules that are not enforceable by the widget alone.
 *
 * The chip UI cannot produce an unknown slug today, which is exactly why these live in the
 * domain layer: the vocabularies are closed by a CHECK constraint, the web twin enforces
 * them because a form posts arbitrary strings, and the next writer to this table — an
 * import, a deep link, a restored draft — will not be a chip.
 */
class PreferencesValidationTest {

    @Test
    fun `accepts every value the vocabulary holds`() {
        val all = PreferencesValidation.TRAVEL_STYLES.map { it.value }
        assertTrue(PreferencesValidation.validateClosed(all, PreferencesValidation.TRAVEL_STYLES).isValid)
    }

    @Test
    fun `refuses a slug the constraint would refuse`() {
        // "Honeymoon" is what a person calls the trip; `romantic` is what the column stores.
        // A straight transcription of the prototype's label is the failure this catches.
        val result = PreferencesValidation.validateClosed(
            listOf("Honeymoon"), PreferencesValidation.TRAVEL_STYLES,
        )
        assertFalse(result.isValid)
        assertEquals(PreferencesValidation.Messages.UNKNOWN_OPTION, result.errorMessage)
    }

    @Test
    fun `lets the none sentinel through every closed group`() {
        assertTrue(
            PreferencesValidation.validateClosed(
                listOf(PreferencesValidation.NONE), PreferencesValidation.DIETARY,
            ).isValid,
        )
    }

    @Test
    fun `treats an unanswered budget as fine and a wrong one as not`() {
        // Every step here is skippable, so blank must never be an error.
        assertTrue(PreferencesValidation.validateBudget("").isValid)
        assertTrue(PreferencesValidation.validateBudget("budget").isValid)

        val bad = PreferencesValidation.validateBudget("lavish")
        assertFalse(bad.isValid)
        assertEquals(PreferencesValidation.Messages.BUDGET_UNKNOWN, bad.errorMessage)
    }

    @Test
    fun `caps a loyalty program name`() {
        val long = "a".repeat(PreferencesValidation.Limits.LOYALTY_PROGRAM + 1)
        val result = PreferencesValidation.validateLoyalty(long, "")
        assertFalse(result.isValid)
        assertEquals(PreferencesValidation.Messages.LOYALTY_PROGRAM_TOO_LONG, result.errorMessage)

        val exact = "a".repeat(PreferencesValidation.Limits.LOYALTY_PROGRAM)
        assertTrue(PreferencesValidation.validateLoyalty(exact, "").isValid)
    }

    @Test
    fun `caps the number of loyalty rows`() {
        assertTrue(
            PreferencesValidation.validateLoyaltyCount(
                PreferencesValidation.Limits.LOYALTY_ROWS,
            ).isValid,
        )
        val over = PreferencesValidation.validateLoyaltyCount(
            PreferencesValidation.Limits.LOYALTY_ROWS + 1,
        )
        assertFalse(over.isValid)
        assertEquals(PreferencesValidation.Messages.LOYALTY_TOO_MANY, over.errorMessage)
    }

    @Test
    fun `an empty repeater row is the last blank line, not a mistake`() {
        assertTrue(PreferencesValidation.validateLoyalty("", "").isValid)
    }

    @Test
    fun `a number without a program has nothing to belong to`() {
        val result = PreferencesValidation.validateLoyalty("", "AA12345")
        assertFalse(result.isValid)
        assertEquals(PreferencesValidation.Messages.LOYALTY_NEEDS_PROGRAM, result.errorMessage)
    }

    @Test
    fun `caps a free-text note`() {
        val long = "x".repeat(PreferencesValidation.Limits.NOTES + 1)
        val result = PreferencesValidation.validateNotes(
            long, PreferencesValidation.Limits.NOTES, PreferencesValidation.Messages.NOTES_TOO_LONG,
        )
        assertFalse(result.isValid)
    }

    @Test
    fun `the none sentinel cannot travel with a real answer or with a note`() {
        val withOther = PreferencesValidation.validateSentinelGroup(
            listOf(PreferencesValidation.NONE, "vegetarian"), "",
            PreferencesValidation.Messages.DIETARY_NONE_ALONE,
            PreferencesValidation.Messages.DIETARY_NONE_WITH_NOTE,
        )
        assertEquals(PreferencesValidation.Messages.DIETARY_NONE_ALONE, withOther.errorMessage)

        // The likelier contradiction: the vocabulary has no slug for an allergy, so a real
        // one arrives in the note under a ticked "No restrictions".
        val withNote = PreferencesValidation.validateSentinelGroup(
            listOf(PreferencesValidation.NONE), "severe shellfish allergy",
            PreferencesValidation.Messages.DIETARY_NONE_ALONE,
            PreferencesValidation.Messages.DIETARY_NONE_WITH_NOTE,
        )
        assertEquals(PreferencesValidation.Messages.DIETARY_NONE_WITH_NOTE, withNote.errorMessage)
    }
}
