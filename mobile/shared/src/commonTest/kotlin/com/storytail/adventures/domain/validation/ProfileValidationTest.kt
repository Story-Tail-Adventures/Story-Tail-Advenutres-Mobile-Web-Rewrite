package com.storytail.adventures.domain.validation

import com.storytail.adventures.domain.validation.ProfileValidation.PhoneResult
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * Screen 2.1m.10's rules, asserted with the SAME vectors as
 * web/lib/validation/profile.test.ts. The two implementations are deliberately parallel —
 * Kotlin does not run on the web and CLAUDE.md makes the directories a hard boundary — so
 * the only thing keeping them honest is the same cases on both sides.
 */
class ProfileValidationTest {

    @Test
    fun an_empty_phone_is_nothing_rather_than_a_mistake() {
        assertEquals(PhoneResult.Ok(null), ProfileValidation.normalizePhone("   "))
    }

    @Test
    fun normalises_the_formats_people_actually_type() {
        val cases = listOf(
            "+1 (305) 555-0184" to "+13055550184",
            "(305) 555-0184" to "+13055550184",
            "305.555.0184" to "+13055550184",
            "1 305 555 0184" to "+13055550184",
            "+44 20 7946 0958" to "+442079460958",
        )
        for ((input, expected) in cases) {
            assertEquals(PhoneResult.Ok(expected), ProfileValidation.normalizePhone(input), input)
        }
    }

    @Test
    fun asks_for_a_country_code_rather_than_guessing_at_a_foreign_number() {
        // A London number typed the way a Londoner types it: eleven digits starting 0.
        assertEquals(
            PhoneResult.Invalid(ProfileValidation.Messages.PHONE_NEEDS_COUNTRY_CODE),
            ProfileValidation.normalizePhone("020 7946 0958"),
        )
    }

    @Test
    fun refuses_ten_digits_that_cannot_ring_anywhere() {
        // A NANP area code and exchange both begin 2-9. Guessing +1 at these would store a
        // well-formed number nobody could tell from a real one.
        for (input in listOf("1234567890", "0234567890", "3050550184", "3051550184")) {
            assertEquals(
                PhoneResult.Invalid(ProfileValidation.Messages.PHONE_INVALID),
                ProfileValidation.normalizePhone(input),
                input,
            )
        }
    }

    @Test
    fun takes_an_explicit_country_code_at_its_word() {
        // We guess only for North America; a +1 somebody typed is their claim to make.
        assertEquals(
            PhoneResult.Ok("+11234567890"),
            ProfileValidation.normalizePhone("+11234567890"),
        )
    }

    @Test
    fun refuses_what_is_not_a_phone_number_at_all() {
        for (input in listOf("not a phone", "+", "+1234", "+1234567890123456")) {
            assertTrue(
                ProfileValidation.normalizePhone(input) is PhoneResult.Invalid,
                input,
            )
        }
    }

    @Test
    fun catches_a_day_that_does_not_exist() {
        assertFalse(ProfileValidation.isRealDate("2026-02-30"))
        assertTrue(ProfileValidation.isRealDate("2024-02-29"))
        assertFalse(ProfileValidation.isRealDate("2026-02-29"))
        assertFalse(ProfileValidation.isRealDate("2026-13-01"))
    }

    @Test
    fun has_no_minimum_age_because_households_travel_together() {
        assertTrue(ProfileValidation.validateBirthDate("2019-06-12", "2026-09-04").isValid)
    }

    @Test
    fun refuses_a_birthday_in_the_future() {
        assertEquals(
            ProfileValidation.Messages.DOB_INVALID,
            ProfileValidation.validateBirthDate("2999-01-01", "2026-09-04").errorMessage,
        )
    }

    @Test
    fun refuses_the_prototypes_three_letter_country() {
        assertEquals(
            ProfileValidation.Messages.COUNTRY_INVALID,
            ProfileValidation.validateCountry("USA").errorMessage,
        )
        assertTrue(ProfileValidation.validateCountry("us").isValid)
    }

    @Test
    fun accepts_postal_codes_that_are_not_five_digits() {
        for (postal in listOf("33131", "K1A 0B1", "SW1A 1AA")) {
            assertTrue(ProfileValidation.validatePostalCode(postal).isValid, postal)
        }
    }

    @Test
    fun does_not_treat_the_preselected_country_as_a_typed_address() {
        // The picker starts on US. If that counted as intent, an untouched form would fail.
        assertTrue(
            ProfileValidation.validateAddressGroup("", "", "", "", "", "US").isValid,
        )
    }

    @Test
    fun refuses_a_half_written_address() {
        assertEquals(
            ProfileValidation.Messages.ADDRESS_INCOMPLETE,
            ProfileValidation
                .validateAddressGroup("1240 Brickell Bay Dr", "", "", "", "", "US")
                .errorMessage,
        )
    }

    @Test
    fun refuses_an_emergency_contact_with_no_way_to_reach_them() {
        assertEquals(
            ProfileValidation.Messages.EMERGENCY_INCOMPLETE,
            ProfileValidation.validateEmergencyGroup("Sam Hayes", "", "").errorMessage,
        )
        assertTrue(
            ProfileValidation.validateEmergencyGroup("Sam Hayes", "3055550186", "").isValid,
        )
    }

    @Test
    fun refuses_a_passport_country_with_no_expiry() {
        assertEquals(
            ProfileValidation.Messages.PASSPORT_INCOMPLETE,
            ProfileValidation.validatePassportGroup("", "US").errorMessage,
        )
        // The reverse is fine: the expiry is what drives the reminder.
        assertTrue(ProfileValidation.validatePassportGroup("2031-08-14", "").isValid)
    }
}
