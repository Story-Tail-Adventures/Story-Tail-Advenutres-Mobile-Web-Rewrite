package com.storytail.adventures.ui.screens.onboarding

import com.storytail.adventures.domain.onboarding.WizardStep

/**
 * What every wizard step shares.
 *
 * One state class rather than six, because the six screens differ in what they collect and
 * agree on everything else: whether a write is in flight, whether it failed, and what the
 * failure said. The per-screen fields hang off [ProfileForm], [PreferencesForm] and the rest.
 */
data class OnboardingUiState(
    val step: WizardStep = WizardStep.WELCOME,
    val isSaving: Boolean = false,
    val isSkipping: Boolean = false,
    /** The Edge Function's own sentence about what was wrong, or our generic one. */
    val formError: String? = null,
)

sealed interface OnboardingEvent {
    /** Move to [step] — the cursor has already been advanced server-side. */
    data class Advance(val step: WizardStep) : OnboardingEvent

    /** The wizard is over: `onboarding_completed_at` is stamped. */
    data object Finished : OnboardingEvent
}
