package com.storytail.adventures.ui.screens.onboarding

import com.storytail.adventures.api.OnboardingFunction
import com.storytail.adventures.api.OnboardingRepository
import com.storytail.adventures.domain.onboarding.WizardStep
import com.storytail.adventures.domain.validation.ProfileValidation
import com.storytail.adventures.domain.validation.ProfileValidation.PhoneResult
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonObject

/**
 * Screen 2.1m.10 Profile Completion — see docs/Screen-Inventory.md §2.1.10.
 *
 * NO PASSPORT NUMBER, matching the web twin and for the same reason:
 * `travel_document.document_number_encrypted` is Sensitive PII that Data-Model §18.2 wants
 * encrypted under a backend-held key, and nothing implements that. The expiry is what drives
 * the renewal reminder, which is the part travelers feel. The Edge Function refuses a
 * `passport.number` key loudly rather than ignoring it.
 */
class ProfileViewModel(
    onboarding: OnboardingRepository,
    private val today: String,
) : OnboardingViewModel(onboarding, WizardStep.PROFILE) {

    private val _form = MutableStateFlow(ProfileForm())
    val form: StateFlow<ProfileForm> = _form.asStateFlow()

    fun update(transform: (ProfileForm) -> ProfileForm) {
        _form.update { transform(it).cleared() }
        clearError()
    }

    fun submit() {
        val f = _form.value

        val phone = ProfileValidation.normalizePhone(f.phone)
        val emergencyPhone = ProfileValidation.normalizePhone(f.emergencyPhone)
        val dob = ProfileValidation.validateBirthDate(f.dateOfBirth, today)
        val postal = ProfileValidation.validatePostalCode(f.addressPostalCode)
        val addressCountry = ProfileValidation.validateCountry(f.addressCountry)
        val passportCountry = ProfileValidation.validateCountry(f.passportCountry)
        val passportExpiry = ProfileValidation.validateDate(f.passportExpiry)
        val addressGroup = ProfileValidation.validateAddressGroup(
            f.addressLine1, f.addressLine2, f.addressCity,
            f.addressRegion, f.addressPostalCode, f.addressCountry,
        )
        val emergencyGroup = ProfileValidation.validateEmergencyGroup(
            f.emergencyName, f.emergencyPhone, f.emergencyRelationship,
        )
        val passportGroup =
            ProfileValidation.validatePassportGroup(f.passportExpiry, f.passportCountry)

        val problems = listOf(
            dob, postal, addressCountry, passportCountry, passportExpiry,
            addressGroup, emergencyGroup, passportGroup,
        ).any { !it.isValid } ||
            phone is PhoneResult.Invalid ||
            emergencyPhone is PhoneResult.Invalid

        if (problems) {
            // Everything at once. Six failures over six submits is an interrogation.
            _form.update {
                it.copy(
                    phoneError = (phone as? PhoneResult.Invalid)?.message,
                    emergencyPhoneError = (emergencyPhone as? PhoneResult.Invalid)?.message,
                    dateOfBirthError = dob.errorMessage,
                    addressPostalCodeError = postal.errorMessage,
                    addressCountryError = addressCountry.errorMessage,
                    passportCountryError = passportCountry.errorMessage,
                    passportExpiryError = passportExpiry.errorMessage,
                    addressError = addressGroup.errorMessage,
                    emergencyError = emergencyGroup.errorMessage,
                    passportError = passportGroup.errorMessage,
                )
            }
            return
        }

        save(OnboardingFunction.PROFILE, body(f, phone, emergencyPhone))
    }

    /**
     * The body `supabase/functions/onboarding-profile` expects.
     *
     * EVERY KEY IS ALWAYS PRESENT, and that is the point: the function reads an ABSENT key as
     * "leave it alone" and an explicit null as "clear it". This screen shows all of these
     * fields at once, so a field left empty is somebody saying they do not have one.
     */
    private fun body(
        f: ProfileForm,
        phone: PhoneResult,
        emergencyPhone: PhoneResult,
    ): JsonObject = buildJsonObject {
        put("phone", (phone as PhoneResult.Ok).value?.let(::JsonPrimitive) ?: JsonNull)
        put("dateOfBirth", f.dateOfBirth.trim().ifBlank { null }?.let(::JsonPrimitive) ?: JsonNull)

        val hasAddress = f.addressLine1.isNotBlank() &&
            f.addressCity.isNotBlank() &&
            f.addressCountry.isNotBlank()
        if (hasAddress) {
            putJsonObject("address") {
                put("line1", f.addressLine1.trim())
                put("line2", f.addressLine2.trim().ifBlank { null }?.let(::JsonPrimitive) ?: JsonNull)
                put("city", f.addressCity.trim())
                put("region", f.addressRegion.trim().ifBlank { null }?.let(::JsonPrimitive) ?: JsonNull)
                put("postalCode", f.addressPostalCode.trim().ifBlank { null }?.let(::JsonPrimitive) ?: JsonNull)
                put("country", f.addressCountry.uppercase())
            }
        } else {
            put("address", JsonNull)
        }

        val emergencyNumber = (emergencyPhone as PhoneResult.Ok).value
        if (f.emergencyName.isNotBlank() && emergencyNumber != null) {
            putJsonObject("emergencyContact") {
                put("name", f.emergencyName.trim())
                put("phone", emergencyNumber)
                put(
                    "relationship",
                    f.emergencyRelationship.trim().ifBlank { null }?.let(::JsonPrimitive) ?: JsonNull,
                )
            }
        } else {
            put("emergencyContact", JsonNull)
        }

        if (f.passportExpiry.isNotBlank() || f.passportCountry.isNotBlank()) {
            putJsonObject("passport") {
                put("expiresOn", f.passportExpiry.trim().ifBlank { null }?.let(::JsonPrimitive) ?: JsonNull)
                put(
                    "issuingCountry",
                    f.passportCountry.trim().ifBlank { null }?.uppercase()?.let(::JsonPrimitive) ?: JsonNull,
                )
            }
        } else {
            put("passport", JsonNull)
        }
    }
}
