package com.storytail.adventures.ui.screens.onboarding

import com.storytail.adventures.api.OnboardingFunction
import com.storytail.adventures.api.OnboardingRepository
import com.storytail.adventures.domain.onboarding.WizardStep
import com.storytail.adventures.domain.validation.PreferencesValidation
import com.storytail.adventures.domain.validation.ValidationResult
import com.storytail.adventures.domain.validation.PreferencesValidation.Messages
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray

/** One row of the loyalty repeater. */
data class LoyaltyRow(val program: String = "", val number: String = "")

/** Screen 2.1m.11's controls. */
data class PreferencesForm(
    val destinations: Set<String> = emptySet(),
    val destinationOther: String = "",
    val travelStyles: Set<String> = emptySet(),
    val dietary: Set<String> = emptySet(),
    val dietaryNotes: String = "",
    val accessibility: Set<String> = emptySet(),
    val accessibilityNotes: String = "",
    val loyalty: List<LoyaltyRow> = listOf(LoyaltyRow(), LoyaltyRow()),
    val budgetBand: String = "",
    val favouritePastTrips: String = "",

    val destinationsError: String? = null,
    val dietaryError: String? = null,
    val accessibilityError: String? = null,
    val loyaltyError: String? = null,
    val favouritesError: String? = null,
) {
    fun cleared(): PreferencesForm = copy(
        destinationsError = null,
        dietaryError = null,
        accessibilityError = null,
        loyaltyError = null,
        favouritesError = null,
    )
}

/**
 * Screen 2.1m.11 Travel Preferences — see docs/Screen-Inventory.md §2.1.11.
 *
 * One `travel_preference` row, which is 1:1 with `client`. The vocabularies are closed at the
 * database, so the chips carry the slug and never the label they display.
 */
class PreferencesViewModel(
    onboarding: OnboardingRepository,
) : OnboardingViewModel(onboarding, WizardStep.PREFERENCES) {

    override val saveError =
        "That didn't save — nothing's lost, your answers are still here. Try again, or " +
            "skip for now and we'll pick this up later."

    private val _form = MutableStateFlow(PreferencesForm())
    val form: StateFlow<PreferencesForm> = _form.asStateFlow()

    fun update(transform: (PreferencesForm) -> PreferencesForm) {
        _form.update { transform(it).cleared() }
        clearError()
    }

    /** Ticking the sentinel clears everything else; ticking anything else clears it. */
    fun toggleSentinel(current: Set<String>, value: String): Set<String> = when {
        value in current -> current - value
        value == PreferencesValidation.NONE -> setOf(PreferencesValidation.NONE)
        else -> current - PreferencesValidation.NONE + value
    }

    fun submit() {
        val f = _form.value
        val destinations =
            PreferencesValidation.mergeDestinations(f.destinations.toList(), f.destinationOther)

        val destinationsResult = PreferencesValidation.validateDestinations(destinations)
        // Each group answers three questions, and the first failure is the one shown: is
        // every value one the CHECK constraint accepts, does the sentinel contradict them,
        // and is the note short enough for the column. The web twin runs all three too —
        // dropping the length check here would let the Edge Function refuse a note this
        // screen said nothing about.
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
            _form.update {
                it.copy(
                    destinationsError = destinationsResult.errorMessage,
                    dietaryError = dietaryResult.errorMessage,
                    accessibilityError = accessibilityResult.errorMessage,
                    favouritesError = favouritesResult.errorMessage,
                    // The style and budget rules cannot fail from the chip UI, so they have
                    // no field of their own to sit under — they surface as the form error,
                    // which is where an impossible answer belongs.
                    loyaltyError = loyaltyResult.errorMessage,
                )
            }
            val orphan = styleResult.errorMessage ?: budgetResult.errorMessage
            if (orphan != null) _state.update { it.copy(formError = orphan) }
            return
        }

        save(OnboardingFunction.PREFERENCES, body(f, destinations))
    }

    /** The first rule that failed, or Valid if none did. */
    private fun firstProblem(vararg results: ValidationResult): ValidationResult =
        results.firstOrNull { !it.isValid } ?: ValidationResult.Valid

    /**
     * EVERY KEY IS ALWAYS SENT, including the empty ones. The function reads an absent key as
     * "leave it alone", so a group somebody cleared has to arrive as an empty array or their
     * old answers stay put.
     */
    private fun body(f: PreferencesForm, destinations: List<String>): JsonObject =
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
}
