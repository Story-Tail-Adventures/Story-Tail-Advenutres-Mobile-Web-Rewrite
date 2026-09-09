package com.storytail.adventures.ui.screens.onboarding

import androidx.lifecycle.viewModelScope
import com.storytail.adventures.api.OnboardingRepository
import com.storytail.adventures.domain.onboarding.WizardStep
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * Screen 2.1m.9 Welcome / First Login — see docs/Screen-Inventory.md §2.1.9.
 *
 * The cover page of the wizard and the first authenticated screen a new traveler sees. It
 * collects nothing; its only write is "Skip the tour", which ends the wizard.
 */
class WelcomeViewModel(
    private val onboarding: OnboardingRepository,
) : OnboardingViewModel(onboarding, WizardStep.WELCOME) {

    /**
     * The failure copy for "Skip the tour" — the button that calls `finish()`.
     *
     * The default `finishError` reassures somebody that "everything you entered is saved",
     * which on this screen is a sentence about nothing: Welcome collects no input. Its web
     * twin says something true instead — web/app/(onboarding)/welcome/state.ts `skipError`.
     */
    override val finishError =
        "We couldn't save that just now — but nothing is lost. Try again, or head straight " +
            "to your dashboard."

    /** Null until the read answers, and null for good if there is no name worth using. */
    private val _firstName = MutableStateFlow<String?>(null)
    val firstName: StateFlow<String?> = _firstName.asStateFlow()

    init {
        viewModelScope.launch { _firstName.value = onboarding.greetableFirstName() }
    }
}
