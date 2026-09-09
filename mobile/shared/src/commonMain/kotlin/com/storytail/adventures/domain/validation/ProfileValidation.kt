package com.storytail.adventures.domain.validation

import com.storytail.adventures.domain.onboarding.Countries

/**
 * Screen 2.1m.10 Profile Completion — the rules.
 *
 * PARALLEL IMPLEMENTATION of web/lib/validation/profile.ts. Every field is optional and the
 * whole step is skippable, so almost none of this is "you must". What it is instead is three
 * GROUP rules — address, emergency contact, passport — where a half-filled group is worse
 * than an empty one, and the columns say so: `address.line1`, `.city` and `.country` are all
 * NOT NULL, an emergency contact with no phone cannot be called, and a passport row whose
 * only reason to exist is the expiry reminder needs an expiry.
 *
 * The same rules run again in supabase/functions/onboarding-profile, because that endpoint
 * is reachable without this form and a rule that lives only in a form is a suggestion.
 */
object ProfileValidation {

    /** Messages are user-facing copy. Keep them byte-identical across platforms. */
    object Messages {
        const val PHONE_INVALID = "That doesn't look like a phone number yet"
        const val PHONE_NEEDS_COUNTRY_CODE =
            "Add a country code — like +44 — for a number outside the US"
        const val DOB_INVALID = "Check that date — it should be in the past"
        const val DOB_TOO_EARLY = "Check that year"
        const val DATE_INVALID = "Use the date picker, or type it as YYYY-MM-DD"
        const val COUNTRY_INVALID = "Pick a country from the list"
        const val POSTAL_INVALID = "Letters, numbers, spaces and hyphens only"
        const val TOO_LONG = "That's longer than this field can hold"
        const val INVALID_CHARS = "Some of those characters won't work here"
        const val ADDRESS_INCOMPLETE = "An address needs at least a street, a city and a country"
        const val EMERGENCY_INCOMPLETE =
            "Add both a name and a phone, so we know who to call and how"
        const val PASSPORT_INCOMPLETE =
            "Add the expiry date too — that's the part I use to remind you"
    }

    /** Column widths from supabase/migrations/20260514120000_initial.sql. */
    object Limits {
        const val ADDRESS_LINE = 200
        const val CITY = 120
        const val REGION = 120
        const val POSTAL_CODE = 20
        const val EMERGENCY_NAME = 160
        const val EMERGENCY_RELATIONSHIP = 60
    }

    /**
     * The oldest date of birth accepted.
     *
     * Not an age check. Data-Model §6.1 has no minimum and there must not be one — clients
     * travel with minors on their own accounts, and Gyasi creates records for whole
     * households. This only catches the year somebody's finger slipped on.
     */
    private const val EARLIEST_BIRTH_DATE = "1900-01-01"

    private val ISO_DATE = Regex("""^\d{4}-\d{2}-\d{2}$""")
    private val POSTAL = Regex("""^[A-Za-z0-9 -]*$""")
    private val NO_CONTROL_CHARS = Regex("""^[^\p{Cc}]*$""")

    /** Area code and exchange code, both of which begin 2-9 in the North American plan. */
    private val NANP = Regex("""^[2-9]\d{2}[2-9]\d{6}$""")

    /** Whether [value] is a real calendar date, not merely a well-shaped one (2026-02-30). */
    fun isRealDate(value: String): Boolean {
        if (!ISO_DATE.matches(value)) return false
        val year = value.substring(0, 4).toIntOrNull() ?: return false
        val month = value.substring(5, 7).toIntOrNull() ?: return false
        val day = value.substring(8, 10).toIntOrNull() ?: return false
        if (month !in 1..12 || day < 1) return false
        return day <= daysIn(month, year)
    }

    private fun daysIn(month: Int, year: Int): Int = when (month) {
        1, 3, 5, 7, 8, 10, 12 -> 31
        4, 6, 9, 11 -> 30
        else -> if (isLeap(year)) 29 else 28
    }

    private fun isLeap(year: Int): Boolean =
        (year % 4 == 0 && year % 100 != 0) || year % 400 == 0

    sealed interface PhoneResult {
        data class Ok(val value: String?) : PhoneResult
        data class Invalid(val message: String) : PhoneResult
    }

    /**
     * A phone number as E.164, or a reason it is not one.
     *
     * Data-Model §6.1 specifies E.164 and nothing in the database enforces it. Doing it fully
     * means libphonenumber — a third-party dependency that CLAUDE.md sends through security
     * review — so this is the defensible subset: a number that already carries a `+` is taken
     * as given, and a bare ten digits is assumed American because the practice is. The hint
     * on the field says so out loud rather than assuming silently.
     *
     * The +1 guess is CHECKED, not assumed: a NANP area code and exchange both begin 2-9, so
     * "1234567890" is refused rather than stored as a well-formed `+11234567890` nobody could
     * tell from a real number — on, among other fields, an emergency contact.
     */
    fun normalizePhone(raw: String): PhoneResult {
        val trimmed = raw.trim()
        if (trimmed.isEmpty()) return PhoneResult.Ok(null)

        val cleaned = trimmed.filterNot { it == ' ' || it == '(' || it == ')' || it == '.' || it == '-' }
        if (!Regex("""^\+?\d+$""").matches(cleaned)) {
            return PhoneResult.Invalid(Messages.PHONE_INVALID)
        }

        if (cleaned.startsWith("+")) {
            val digits = cleaned.drop(1)
            // E.164 caps the whole number at 15 digits; the shortest real one is seven.
            if (digits.length !in 7..15) return PhoneResult.Invalid(Messages.PHONE_INVALID)
            return PhoneResult.Ok("+$digits")
        }

        val national = if (cleaned.length == 11 && cleaned.startsWith("1")) cleaned.drop(1)
                       else cleaned
        if (national.length != 10) {
            return PhoneResult.Invalid(Messages.PHONE_NEEDS_COUNTRY_CODE)
        }
        if (!NANP.matches(national)) return PhoneResult.Invalid(Messages.PHONE_INVALID)
        return PhoneResult.Ok("+1$national")
    }

    fun validateBirthDate(raw: String, today: String): ValidationResult {
        val value = raw.trim()
        if (value.isEmpty()) return ValidationResult.Valid
        if (!isRealDate(value) || value >= today) {
            return ValidationResult.Invalid(Messages.DOB_INVALID)
        }
        if (value < EARLIEST_BIRTH_DATE) {
            return ValidationResult.Invalid(Messages.DOB_TOO_EARLY)
        }
        return ValidationResult.Valid
    }

    /** A passport expiry: real, and allowed to be past — an expired one still needs renewing. */
    fun validateDate(raw: String): ValidationResult {
        val value = raw.trim()
        if (value.isEmpty()) return ValidationResult.Valid
        return if (isRealDate(value)) ValidationResult.Valid
               else ValidationResult.Invalid(Messages.DATE_INVALID)
    }

    fun validateCountry(raw: String): ValidationResult {
        val value = raw.trim()
        if (value.isEmpty()) return ValidationResult.Valid
        return if (Countries.isCode(value.uppercase())) ValidationResult.Valid
               else ValidationResult.Invalid(Messages.COUNTRY_INVALID)
    }

    /**
     * A postal code.
     *
     * Deliberately not a five-digit US pattern: K1A 0B1 and SW1A 1AA are postal codes too,
     * and this field is reachable from every country in the list.
     */
    fun validatePostalCode(raw: String): ValidationResult {
        val value = raw.trim()
        return when {
            value.length > Limits.POSTAL_CODE -> ValidationResult.Invalid(Messages.TOO_LONG)
            !POSTAL.matches(value) -> ValidationResult.Invalid(Messages.POSTAL_INVALID)
            else -> ValidationResult.Valid
        }
    }

    fun validateText(raw: String, max: Int): ValidationResult {
        val value = raw.trim()
        return when {
            value.length > max -> ValidationResult.Invalid(Messages.TOO_LONG)
            !NO_CONTROL_CHARS.matches(value) ->
                ValidationResult.Invalid(Messages.INVALID_CHARS)
            else -> ValidationResult.Valid
        }
    }

    /**
     * The address group, checked as a unit.
     *
     * COUNTRY IS NOT PART OF THE "touched" TEST. The picker starts on US because most of the
     * practice's clients are American, so its value is evidence of a default rather than of
     * intent — counting it would mean an untouched form failing with "an address needs at
     * least a street, a city and a country".
     */
    fun validateAddressGroup(
        line1: String,
        line2: String,
        city: String,
        region: String,
        postalCode: String,
        country: String,
    ): ValidationResult {
        val typed = listOf(line1, line2, city, region, postalCode).any { it.isNotBlank() }
        if (!typed) return ValidationResult.Valid
        val complete = line1.isNotBlank() && city.isNotBlank() && country.isNotBlank()
        return if (complete) ValidationResult.Valid
               else ValidationResult.Invalid(Messages.ADDRESS_INCOMPLETE)
    }

    fun validateEmergencyGroup(
        name: String,
        phone: String,
        relationship: String,
    ): ValidationResult {
        val touched = listOf(name, phone, relationship).any { it.isNotBlank() }
        if (!touched) return ValidationResult.Valid
        return if (name.isNotBlank() && phone.isNotBlank()) ValidationResult.Valid
               else ValidationResult.Invalid(Messages.EMERGENCY_INCOMPLETE)
    }

    /** Expiry without a country is fine — the reminder still works. The reverse is not. */
    fun validatePassportGroup(expiry: String, country: String): ValidationResult =
        if (country.isNotBlank() && expiry.isBlank()) {
            ValidationResult.Invalid(Messages.PASSPORT_INCOMPLETE)
        } else {
            ValidationResult.Valid
        }

    /**
     * Whether a passport has already run out.
     *
     * A WARNING, NEVER A BLOCK. An expired passport is exactly the record we want on file —
     * it is what makes the renewal reminder fire — so this only decides whether to say
     * something, and `validatePassportGroup` stays silent about it.
     *
     * "Today" is a parameter rather than a `Clock` read for the same reason
     * `CompanionValidation.expiresWithinSixMonths` takes one: a function that asks the
     * system what day it is cannot be tested, and both sides compare ISO strings so the
     * comparison is lexical and needs no date arithmetic.
     */
    fun hasExpired(expiry: String, todayIso: String): Boolean =
        expiry.isNotBlank() && isRealDate(expiry) && expiry < todayIso
}
