package com.storytail.adventures.ui.screens.onboarding

import com.storytail.adventures.domain.validation.PreferencesValidation
import com.storytail.adventures.domain.validation.PreferencesValidation.Messages
import com.storytail.adventures.domain.validation.ProfileValidation
import com.storytail.adventures.domain.validation.ProfileValidation.PhoneResult
import com.storytail.adventures.domain.validation.ValidationResult
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.add
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import kotlinx.serialization.json.putJsonObject

/**
 * Validate-and-encode for the two forms §2.1 and §2.5 share, as pure functions.
 *
 * WHY THEY LEFT THE VIEW MODELS. `OnboardingViewModel.save` appends `advance: true` to every
 * body, which is correct for a wizard step and wrong for an account screen: 2.5.2 and 2.5.3
 * write the same columns through the same functions, and moving somebody's onboarding cursor
 * because they edited their phone number would put the wizard back in front of them.
 *
 * The alternative was a flag on the base view model, and it was rejected: it would put a
 * branch on the one path every wizard step depends on to reach the next screen. Extracting
 * the part that is genuinely common — the rules and the JSON — leaves the wizard's save
 * exactly as it was and lets the account screens call `OnboardingRepository.call` directly
 * with no `advance` key at all.
 *
 * Pure, so both are covered by ordinary unit tests rather than only through a view model.
 */
sealed interface ProfileSubmission {
    /** The form back with every error set at once — six failures over six submits is an
     * interrogation. */
    data class Invalid(val form: ProfileForm) : ProfileSubmission

    data class Valid(val body: JsonObject) : ProfileSubmission
}

sealed interface PreferencesSubmission {
    /**
     * [formError] carries the rules that have no field to sit under.
     *
     * The travel-style and budget vocabularies cannot fail from the chip UI at all, so an
     * error about them belongs at the form level rather than under an input nobody typed in.
     */
    data class Invalid(val form: PreferencesForm, val formError: String?) : PreferencesSubmission

    data class Valid(val body: JsonObject) : PreferencesSubmission
}

/** [today] in UTC, hoisted so the date-of-birth rule is testable. */
fun validateProfileForm(f: ProfileForm, today: String): ProfileSubmission {
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
        return ProfileSubmission.Invalid(
            f.copy(
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
            ),
        )
    }

    return ProfileSubmission.Valid(profileBody(f, phone, emergencyPhone))
}

/**
 * The body `supabase/functions/onboarding-profile` expects.
 *
 * EVERY KEY IS ALWAYS PRESENT, and that is the point: the function reads an ABSENT key as
 * "leave it alone" and an explicit null as "clear it". Both screens show all of these fields
 * at once, so a field left empty is somebody saying they do not have one.
 *
 * WHICH IS WHY 2.5.2 MUST PREFILL THE PASSPORT. An empty expiry and country arrive here as
 * `passport: null`, and the function archives the existing `travel_document` row on null — so
 * a screen that rendered those two boxes blank would destroy a passport record on a save that
 * only changed a phone number.
 */
private fun profileBody(
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

fun validatePreferencesForm(f: PreferencesForm): PreferencesSubmission {
    val destinations =
        PreferencesValidation.mergeDestinations(f.destinations.toList(), f.destinationOther)

    val destinationsResult = PreferencesValidation.validateDestinations(destinations)
    // Each group answers three questions, and the first failure is the one shown: is every
    // value one the CHECK constraint accepts, does the sentinel contradict them, and is the
    // note short enough for the column. The web twin runs all three too — dropping the
    // length check here would let the Edge Function refuse a note this screen said nothing
    // about.
    val dietaryResult = firstProblem(
        PreferencesValidation.validateClosed(
            f.dietary.toList(), PreferencesValidation.DIETARY,
        ),
        PreferencesValidation.validateSentinelGroup(
            f.dietary.toList(), f.dietaryNotes,
            Messages.DIETARY_NONE_ALONE, Messages.DIETARY_NONE_WITH_NOTE,
        ),
        PreferencesValidation.validateNotes(
            f.dietaryNotes, PreferencesValidation.Limits.NOTES, Messages.NOTES_TOO_LONG,
        ),
    )
    val accessibilityResult = firstProblem(
        PreferencesValidation.validateClosed(
            f.accessibility.toList(), PreferencesValidation.ACCESSIBILITY,
        ),
        PreferencesValidation.validateSentinelGroup(
            f.accessibility.toList(), f.accessibilityNotes,
            Messages.ACCESSIBILITY_NONE_ALONE, Messages.ACCESSIBILITY_NONE_WITH_NOTE,
        ),
        PreferencesValidation.validateNotes(
            f.accessibilityNotes,
            PreferencesValidation.Limits.NOTES,
            Messages.NOTES_TOO_LONG,
        ),
    )
    val styleResult = PreferencesValidation.validateClosed(
        f.travelStyles.toList(), PreferencesValidation.TRAVEL_STYLES,
    )
    val budgetResult = PreferencesValidation.validateBudget(f.budgetBand)
    val favouritesResult = PreferencesValidation.validateNotes(
        f.favouritePastTrips,
        PreferencesValidation.Limits.FAVOURITES,
        Messages.FAVOURITES_TOO_LONG,
    )
    val loyaltyResult = firstProblem(
        PreferencesValidation.validateLoyaltyCount(f.loyalty.size),
        *f.loyalty
            .map { PreferencesValidation.validateLoyalty(it.program, it.number) }
            .toTypedArray(),
    )

    val problems = listOf(
        destinationsResult, dietaryResult, accessibilityResult, favouritesResult,
        styleResult, budgetResult, loyaltyResult,
    ).any { !it.isValid }

    if (problems) {
        return PreferencesSubmission.Invalid(
            form = f.copy(
                destinationsError = destinationsResult.errorMessage,
                dietaryError = dietaryResult.errorMessage,
                accessibilityError = accessibilityResult.errorMessage,
                favouritesError = favouritesResult.errorMessage,
                loyaltyError = loyaltyResult.errorMessage,
            ),
            formError = styleResult.errorMessage ?: budgetResult.errorMessage,
        )
    }

    return PreferencesSubmission.Valid(preferencesBody(f, destinations))
}

/** The first rule that failed, or Valid if none did. */
private fun firstProblem(vararg results: ValidationResult): ValidationResult =
    results.firstOrNull { !it.isValid } ?: ValidationResult.Valid

/**
 * EVERY KEY IS ALWAYS SENT, including the empty ones. The function reads an absent key as
 * "leave it alone", so a group somebody cleared has to arrive as an empty array or their old
 * answers stay put.
 */
private fun preferencesBody(f: PreferencesForm, destinations: List<String>): JsonObject =
    buildJsonObject {
        putJsonArray("destinations") { destinations.forEach { add(JsonPrimitive(it)) } }
        putJsonArray("travelStyles") { f.travelStyles.forEach { add(JsonPrimitive(it)) } }
        putJsonArray("dietary") { f.dietary.forEach { add(JsonPrimitive(it)) } }
        putJsonArray("accessibility") {
            f.accessibility.forEach { add(JsonPrimitive(it)) }
        }
        put("dietaryNotes", f.dietaryNotes.trim().ifBlank { null }?.let(::JsonPrimitive) ?: JsonNull)
        put(
            "accessibilityNotes",
            f.accessibilityNotes.trim().ifBlank { null }?.let(::JsonPrimitive) ?: JsonNull,
        )
        put("budgetBand", f.budgetBand.ifBlank { null }?.let(::JsonPrimitive) ?: JsonNull)
        put(
            "favoritePastTrips",
            f.favouritePastTrips.trim().ifBlank { null }?.let(::JsonPrimitive) ?: JsonNull,
        )
        putJsonArray("loyalty") {
            f.loyalty
                .filter { it.program.isNotBlank() || it.number.isNotBlank() }
                .forEach { row ->
                    add(
                        buildJsonObject {
                            put("program", row.program.trim())
                            put("number", row.number.trim())
                        },
                    )
                }
        }
    }
