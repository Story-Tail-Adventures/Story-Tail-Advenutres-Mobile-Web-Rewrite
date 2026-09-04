package com.storytail.adventures.ui.screens.onboarding

import com.storytail.adventures.domain.onboarding.Countries

/**
 * Screen 2.1m.10's thirteen inputs, and the errors that hang off them.
 *
 * The three group keys — [addressError], [emergencyError], [passportError] — are not fields.
 * They carry rules about a COMBINATION, where marking any single input red would be a lie:
 * "an address needs a city" is about the address, not about the city box.
 */
data class ProfileForm(
    val phone: String = "",
    val dateOfBirth: String = "",
    val addressLine1: String = "",
    val addressLine2: String = "",
    val addressCity: String = "",
    val addressRegion: String = "",
    val addressPostalCode: String = "",
    val addressCountry: String = Countries.DEFAULT,
    val emergencyName: String = "",
    val emergencyPhone: String = "",
    val emergencyRelationship: String = "",
    val passportExpiry: String = "",
    val passportCountry: String = "",

    val phoneError: String? = null,
    val dateOfBirthError: String? = null,
    val addressError: String? = null,
    val addressPostalCodeError: String? = null,
    val addressCountryError: String? = null,
    val emergencyError: String? = null,
    val emergencyPhoneError: String? = null,
    val passportError: String? = null,
    val passportExpiryError: String? = null,
    val passportCountryError: String? = null,
) {
    /** Cleared whenever anything changes: an error about old input marks an untouched field. */
    fun cleared(): ProfileForm = copy(
        phoneError = null,
        dateOfBirthError = null,
        addressError = null,
        addressPostalCodeError = null,
        addressCountryError = null,
        emergencyError = null,
        emergencyPhoneError = null,
        passportError = null,
        passportExpiryError = null,
        passportCountryError = null,
    )
}
