package com.storytail.adventures.ui.screens.onboarding

import com.storytail.adventures.api.OnboardingFunction
import com.storytail.adventures.api.OnboardingRepository
import com.storytail.adventures.api.OnboardingResult
import com.storytail.adventures.domain.onboarding.WizardStep
import com.storytail.adventures.domain.validation.CompanionValidation
import com.storytail.adventures.domain.validation.CompanionValidation.Messages
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import androidx.lifecycle.viewModelScope
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/**
 * A companion as the list holds it. Never carries a passport number — there is none.
 *
 * `TravelCompanion` rather than `TravelCompanion`, because the latter resolves to the inherited
 * `companion object` inside any subclass of [OnboardingViewModel] and the compiler reports
 * it as an unrelated visibility error.
 */
data class TravelCompanion(
    val id: String,
    val firstName: String = "",
    val lastName: String = "",
    val relationship: String = "",
    val dateOfBirth: String = "",
    val passportExpiry: String = "",
    val passportCountry: String = "",
)

/** The add/edit form, and which row it is editing. */
data class CompanionDraft(
    val editingId: String? = null,
    val firstName: String = "",
    val lastName: String = "",
    val relationship: String = "",
    val dateOfBirth: String = "",
    val passportExpiry: String = "",
    val passportCountry: String = "",

    val firstNameError: String? = null,
    val lastNameError: String? = null,
    val relationshipError: String? = null,
    val dateOfBirthError: String? = null,
    val passportExpiryError: String? = null,
    val passportCountryError: String? = null,
    val passportError: String? = null,
) {
    fun cleared(): CompanionDraft = copy(
        firstNameError = null,
        lastNameError = null,
        relationshipError = null,
        dateOfBirthError = null,
        passportExpiryError = null,
        passportCountryError = null,
        passportError = null,
    )
}

data class CompanionsForm(
    val companions: List<TravelCompanion> = emptyList(),
    /** Null when the form is closed. */
    val draft: CompanionDraft? = null,
    val isSavingCompanion: Boolean = false,
)

/**
 * Screen 2.1m.12 Travel Companions — see docs/Screen-Inventory.md §2.1.12.
 *
 * A LIST, not a form, and that changes the shape: each traveler is saved as they are added,
 * so a household half-entered when the app is killed is still half-entered tomorrow.
 * "Save & continue" therefore saves nothing — it only moves the wizard on.
 *
 * There is no "invite them to the platform" control. The Inventory asks for one and the
 * schema cannot honour it: `companion` has no email column, and a client-initiated invite
 * would write a record into an agent's book of business. Setting the boolean without the
 * workflow only puts a lie in the database.
 */
class CompanionsViewModel(
    private val onboarding: OnboardingRepository,
    private val today: String,
) : OnboardingViewModel(onboarding, WizardStep.COMPANIONS) {

    private val _form = MutableStateFlow(CompanionsForm())
    val form: StateFlow<CompanionsForm> = _form.asStateFlow()

    fun startAdding() = _form.update { it.copy(draft = CompanionDraft()) }

    fun startEditing(companion: TravelCompanion) = _form.update {
        it.copy(
            draft = CompanionDraft(
                editingId = companion.id,
                firstName = companion.firstName,
                lastName = companion.lastName,
                relationship = companion.relationship,
                dateOfBirth = companion.dateOfBirth,
                passportExpiry = companion.passportExpiry,
                passportCountry = companion.passportCountry,
            ),
        )
    }

    fun cancelDraft() = _form.update { it.copy(draft = null) }

    fun updateDraft(transform: (CompanionDraft) -> CompanionDraft) = _form.update { form ->
        form.draft?.let { form.copy(draft = transform(it).cleared()) } ?: form
    }

    fun saveDraft() {
        val form = _form.value
        val draft = form.draft ?: return
        if (form.isSavingCompanion) return

        val first = CompanionValidation.validateName(draft.firstName, Messages.FIRST_NAME_REQUIRED)
        val last = CompanionValidation.validateName(draft.lastName, Messages.LAST_NAME_REQUIRED)
        val relationship = CompanionValidation.validateRelationship(draft.relationship)
        val dob = CompanionValidation.validateBirthDate(draft.dateOfBirth, today)
        val expiry = CompanionValidation.validateExpiry(draft.passportExpiry)
        val country = CompanionValidation.validateCountry(draft.passportCountry)
        val group =
            CompanionValidation.validatePassportGroup(draft.passportExpiry, draft.passportCountry)

        if (listOf(first, last, relationship, dob, expiry, country, group).any { !it.isValid }) {
            _form.update {
                it.copy(
                    draft = draft.copy(
                        firstNameError = first.errorMessage,
                        lastNameError = last.errorMessage,
                        relationshipError = relationship.errorMessage,
                        dateOfBirthError = dob.errorMessage,
                        passportExpiryError = expiry.errorMessage,
                        passportCountryError = country.errorMessage,
                        passportError = group.errorMessage,
                    ),
                )
            }
            return
        }

        _form.update { it.copy(isSavingCompanion = true) }
        clearError()

        viewModelScope.launch {
            val result = onboarding.call(OnboardingFunction.COMPANIONS, body(draft))
            _form.update { it.copy(isSavingCompanion = false) }

            if (result is OnboardingResult.Ok) {
                // Closed only on a save that LANDED. Closing on submit would empty the form
                // the moment a name failed validation, which is the one thing a rejected
                // submit must never do.
                applyLocally(draft)
                _form.update { it.copy(draft = null) }
            } else {
                setError(
                    (result as? OnboardingResult.Rejected)?.detail
                        ?: "That didn't save. Give it another go — nothing was lost.",
                )
            }
        }
    }

    fun remove(companion: TravelCompanion) {
        viewModelScope.launch {
            val result = onboarding.call(
                OnboardingFunction.COMPANIONS,
                buildJsonObject {
                    put("action", "remove")
                    put("id", companion.id)
                },
            )
            if (result is OnboardingResult.Ok) {
                _form.update { it.copy(companions = it.companions - companion) }
            } else {
                setError("We couldn't remove them just now. Try again in a moment.")
            }
        }
    }

    private fun body(draft: CompanionDraft): JsonObject = buildJsonObject {
        put("action", if (draft.editingId != null) "edit" else "add")
        draft.editingId?.let { put("id", it) }
        put("firstName", draft.firstName.trim())
        put("lastName", draft.lastName.trim())
        put("relationship", draft.relationship.trim())
        put("dateOfBirth", draft.dateOfBirth.trim())
        put("passportExpiry", draft.passportExpiry.trim())
        put("passportCountry", draft.passportCountry.trim().uppercase())
    }

    /**
     * Reflect the write in the list.
     *
     * The id for an ADD comes back from the function, which mints a v7 uuid — Data-Model
     * §21.6 wants client-side uuids for offline drafts, and a form post has no offline
     * concern. Until the read-back path exists the local id is the one the response carried.
     */
    private fun applyLocally(draft: CompanionDraft) = _form.update { form ->
        val row = TravelCompanion(
            id = draft.editingId ?: "local-${form.companions.size}",
            firstName = draft.firstName.trim(),
            lastName = draft.lastName.trim(),
            relationship = draft.relationship.trim(),
            dateOfBirth = draft.dateOfBirth.trim(),
            passportExpiry = draft.passportExpiry.trim(),
            passportCountry = draft.passportCountry.trim().uppercase(),
        )
        val companions =
            if (draft.editingId != null) {
                form.companions.map { if (it.id == draft.editingId) row else it }
            } else {
                form.companions + row
            }
        form.copy(companions = companions)
    }

    private fun setError(message: String) = _state.update { it.copy(formError = message) }
}
