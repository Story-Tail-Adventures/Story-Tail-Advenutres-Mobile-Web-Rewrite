package com.storytail.adventures.ui.screens.onboarding

import com.storytail.adventures.api.OnboardingFunction
import com.storytail.adventures.api.OnboardingRepository
import com.storytail.adventures.domain.onboarding.WizardStep
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update

/**
 * Screen 2.1m.10 Profile Completion — see docs/Screen-Inventory.md §2.1.10.
 *
 * NO PASSPORT NUMBER, matching the web twin and for the same reason:
 * `travel_document.document_number_encrypted` is Sensitive PII that Data-Model §18.2 wants
 * encrypted under a backend-held key, and nothing implements that. The expiry is what drives
 * the renewal reminder, which is the part travelers feel. The Edge Function refuses a
 * `passport.number` key loudly rather than ignoring it.
 *
 * The rules and the JSON body live in [validateProfileForm], shared with Screen 2.5.2 — see
 * FormSubmissions.kt for why that had to leave this class.
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
        when (val result = validateProfileForm(_form.value, today)) {
            is ProfileSubmission.Invalid -> _form.value = result.form
            is ProfileSubmission.Valid -> save(OnboardingFunction.PROFILE, result.body)
        }
    }
}
