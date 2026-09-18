package com.storytail.adventures.ui.screens.onboarding

import com.storytail.adventures.api.OnboardingFunction
import com.storytail.adventures.api.OnboardingRepository
import com.storytail.adventures.domain.onboarding.WizardStep
import com.storytail.adventures.domain.validation.LoyaltyRow
import com.storytail.adventures.domain.validation.PreferencesValidation
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update

/**
 * What to say when a preferences save fails, on either screen that does one.
 *
 * Its specific reassurance — "your answers are still here" — is what a screen full of chips
 * somebody just spent two minutes on needs, and it is the reason this step overrides the
 * generic sentence at all. Screen 2.5.3 makes the same write and gets the same words.
 */
const val PREFERENCES_SAVE_ERROR =
    "That didn't save — nothing's lost, your answers are still here. Try again, or " +
        "skip for now and we'll pick this up later."

/** Screen 2.1m.11's controls. Screen 2.5.3 holds the same shape. */
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
 *
 * The rules and the JSON body live in [validatePreferencesForm], shared with Screen 2.5.3.
 */
class PreferencesViewModel(
    onboarding: OnboardingRepository,
) : OnboardingViewModel(onboarding, WizardStep.PREFERENCES) {

    override val saveError = PREFERENCES_SAVE_ERROR

    private val _form = MutableStateFlow(PreferencesForm())
    val form: StateFlow<PreferencesForm> = _form.asStateFlow()

    fun update(transform: (PreferencesForm) -> PreferencesForm) {
        _form.update { transform(it).cleared() }
        clearError()
    }

    /** Ticking the sentinel clears everything else; ticking anything else clears it. */
    fun toggleSentinel(current: Set<String>, value: String): Set<String> =
        toggleSentinelValue(current, value)

    fun submit() {
        when (val result = validatePreferencesForm(_form.value)) {
            is PreferencesSubmission.Invalid -> {
                _form.value = result.form
                if (result.formError != null) {
                    _state.update { it.copy(formError = result.formError) }
                }
            }
            is PreferencesSubmission.Valid ->
                save(OnboardingFunction.PREFERENCES, result.body)
        }
    }
}

/**
 * The sentinel rule, as a free function so Screen 2.5.3 can apply it without a wizard view
 * model. A CHECK constraint forbids "No restrictions" beside a real answer, so the pair
 * cannot be selected in the first place rather than being refused afterwards.
 */
fun toggleSentinelValue(current: Set<String>, value: String): Set<String> = when {
    value in current -> current - value
    value == PreferencesValidation.NONE -> setOf(PreferencesValidation.NONE)
    else -> current - PreferencesValidation.NONE + value
}
