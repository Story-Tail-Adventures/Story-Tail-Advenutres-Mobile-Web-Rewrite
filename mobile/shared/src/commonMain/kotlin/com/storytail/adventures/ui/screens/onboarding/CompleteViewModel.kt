package com.storytail.adventures.ui.screens.onboarding

import androidx.lifecycle.viewModelScope
import com.storytail.adventures.api.OnboardingRepository
import com.storytail.adventures.domain.onboarding.CompletionSummary
import com.storytail.adventures.domain.onboarding.WizardStep
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * Screen 2.1m.14 Onboarding Complete — see docs/Screen-Inventory.md §2.1.14.
 *
 * The only step with nothing to save. What it needs instead is what the earlier steps
 * actually wrote, because every one of them was skippable and this screen must not
 * congratulate somebody for finishing something they skipped.
 */
class CompleteViewModel(
    private val onboarding: OnboardingRepository,
) : OnboardingViewModel(onboarding, WizardStep.COMPLETE) {

    /**
     * Null until the four reads answer.
     *
     * The screen shows the heading and the button meanwhile and holds back the summary. An
     * unread summary looks exactly like an empty one — every step skipped, no trip — and
     * rendering that first would flash "nothing to save yet" at somebody who filled in
     * everything.
     */
    private val _summary = MutableStateFlow<CompletionSummary?>(null)
    val summary: StateFlow<CompletionSummary?> = _summary.asStateFlow()

    init {
        viewModelScope.launch { _summary.value = onboarding.completionSummary() }
    }
}
