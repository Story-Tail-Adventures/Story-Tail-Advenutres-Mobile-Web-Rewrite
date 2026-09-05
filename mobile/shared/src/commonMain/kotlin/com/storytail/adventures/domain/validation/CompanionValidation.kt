package com.storytail.adventures.domain.validation

import com.storytail.adventures.domain.onboarding.Countries

/**
 * Screen 2.1m.12 Travel Companions — the rules for one traveler.
 *
 * PARALLEL IMPLEMENTATION of web/lib/validation/companion.ts. Two required fields and four
 * optional ones, which makes this the simplest form in §2.1 — and the one most likely to be
 * filled in for somebody who is not sitting at the keyboard. Both names are required and
 * split rather than one "full name" box, because both columns are NOT NULL and suppliers
 * need them separately for ticketing.
 *
 * NO PASSPORT NUMBER, and here it is for two reasons rather than one. The first is 2.1.10's:
 * no column encryption yet. The second survives that being fixed — the onboarding migration
 * re-granted `authenticated` every column of `companion` EXCEPT
 * `passport_number_encrypted`, and Postgres checks column privilege on ANY reference, so the
 * client surface cannot even ask whether a number is on file.
 */
object CompanionValidation {

    object Messages {
        const val FIRST_NAME_REQUIRED = "Tell us their first name"
        const val LAST_NAME_REQUIRED = "And their last name — suppliers need both for ticketing"
        const val NAME_TOO_LONG = "Keep it to 80 characters or fewer"
        const val INVALID_CHARS = "Some of those characters won't work here"
        const val RELATIONSHIP_TOO_LONG = "Keep it to 40 characters or fewer"
        const val DOB_INVALID = "Check that date — it should be in the past"
        const val DATE_INVALID = "Use the date picker, or type it as YYYY-MM-DD"
        const val COUNTRY_INVALID = "Pick a country from the list"
        const val PASSPORT_NEEDS_EXPIRY =
            "Add the expiry date too — that's the part I use to remind you"
    }

    object Limits {
        const val NAME = 80
        const val RELATIONSHIP = 40
        /** Enough for a household. Past this, an agent should be doing the adding. */
        const val MAX_COMPANIONS = 12
    }

    private val NO_CONTROL_CHARS = Regex("""^[^\p{Cc}]*$""")

    fun validateName(raw: String, requiredMessage: String): ValidationResult {
        val value = raw.trim()
        return when {
            value.isEmpty() -> ValidationResult.Invalid(requiredMessage)
            value.length > Limits.NAME -> ValidationResult.Invalid(Messages.NAME_TOO_LONG)
            !NO_CONTROL_CHARS.matches(value) ->
                ValidationResult.Invalid(Messages.INVALID_CHARS)
            else -> ValidationResult.Valid
        }
    }

    fun validateRelationship(raw: String): ValidationResult {
        val value = raw.trim()
        return when {
            value.length > Limits.RELATIONSHIP ->
                ValidationResult.Invalid(Messages.RELATIONSHIP_TOO_LONG)
            !NO_CONTROL_CHARS.matches(value) ->
                ValidationResult.Invalid(Messages.INVALID_CHARS)
            else -> ValidationResult.Valid
        }
    }

    /** No minimum age: a household's children have records too. */
    fun validateBirthDate(raw: String, today: String): ValidationResult {
        val value = raw.trim()
        if (value.isEmpty()) return ValidationResult.Valid
        return if (!ProfileValidation.isRealDate(value) || value >= today) {
            ValidationResult.Invalid(Messages.DOB_INVALID)
        } else {
            ValidationResult.Valid
        }
    }

    /** An expired passport is exactly the record that makes the renewal reminder fire. */
    fun validateExpiry(raw: String): ValidationResult {
        val value = raw.trim()
        if (value.isEmpty()) return ValidationResult.Valid
        return if (ProfileValidation.isRealDate(value)) ValidationResult.Valid
               else ValidationResult.Invalid(Messages.DATE_INVALID)
    }

    fun validateCountry(raw: String): ValidationResult {
        val value = raw.trim()
        if (value.isEmpty()) return ValidationResult.Valid
        return if (Countries.isCode(value.uppercase())) ValidationResult.Valid
               else ValidationResult.Invalid(Messages.COUNTRY_INVALID)
    }

    /**
     * A country of issue with no expiry is a passport record with nothing to do — and it
     * makes the card lie, because the card's line keys off the expiry.
     */
    fun validatePassportGroup(expiry: String, country: String): ValidationResult =
        if (country.isNotBlank() && expiry.isBlank()) {
            ValidationResult.Invalid(Messages.PASSPORT_NEEDS_EXPIRY)
        } else {
            ValidationResult.Valid
        }

    /**
     * Whether a passport runs out soon enough to be worth mentioning.
     *
     * Six months is the validity most countries want on entry, so a passport good for five is
     * a problem the traveler does not know they have. A warning, never a block.
     */
    /**
     * Today plus six months, as `YYYY-MM-DD`, for [expiresWithinSixMonths] to compare against.
     *
     * Clamped to the end of the target month, because 31 August plus six months has no 31st
     * to land on. Web gets this from `Date.setUTCMonth`, which rolls over to 3 March instead
     * — a day either way does not change whether a passport is worth mentioning, and
     * clamping is the answer that never names a date that does not exist.
     */
    fun sixMonthsFrom(todayIso: String): String {
        val parts = todayIso.split("-")
        if (parts.size != 3) return todayIso
        val year = parts[0].toIntOrNull() ?: return todayIso
        val month = parts[1].toIntOrNull() ?: return todayIso
        val day = parts[2].toIntOrNull() ?: return todayIso

        val shifted = month + 6
        val targetYear = year + (shifted - 1) / 12
        val targetMonth = (shifted - 1) % 12 + 1
        val targetDay = minOf(day, daysIn(targetMonth, targetYear))
        return "$targetYear-${targetMonth.pad()}-${targetDay.pad()}"
    }

    private fun daysIn(month: Int, year: Int): Int = when (month) {
        1, 3, 5, 7, 8, 10, 12 -> 31
        4, 6, 9, 11 -> 30
        else -> if ((year % 4 == 0 && year % 100 != 0) || year % 400 == 0) 29 else 28
    }

    private fun Int.pad(): String = toString().padStart(2, '0')

    fun expiresWithinSixMonths(expiry: String, sixMonthsFromToday: String): Boolean =
        expiry.isNotBlank() &&
            ProfileValidation.isRealDate(expiry) &&
            expiry <= sixMonthsFromToday
}
