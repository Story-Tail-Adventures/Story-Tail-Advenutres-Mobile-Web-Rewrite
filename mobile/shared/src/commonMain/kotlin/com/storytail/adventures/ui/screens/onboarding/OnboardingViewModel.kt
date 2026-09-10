package com.storytail.adventures.ui.screens.onboarding

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.storytail.adventures.api.OnboardingFunction
import com.storytail.adventures.api.OnboardingRepository
import com.storytail.adventures.api.OnboardingResult
import com.storytail.adventures.domain.onboarding.WizardStep
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/**
 * The shared behaviour of Screens 2.1m.9 through 2.1m.14.
 *
 * Every step does the same three things and differs only in the body it sends: write through
 * an Edge Function, move the cursor, and go to the next screen. Doing that six times in six
 * files is how one of them ends up subtly different — the web side learned the same lesson
 * and put it in supabase/functions/_shared/onboarding.ts.
 */
open class OnboardingViewModel(
    private val onboarding: OnboardingRepository,
    step: WizardStep,
) : ViewModel() {

    /**
     * What to say when this step's save fails.
     *
     * Overridable, because each step's web twin has its own reviewed sentence and one shared
     * fallback would put the Profile wording on every screen — losing, for instance,
     * Preferences' "your answers are still here", which is the specific reassurance that
     * matters on a screen full of chips somebody just spent two minutes filling in.
     */
    protected open val saveError: String = GENERIC_ERROR

    /**
     * What to say when `finish()` fails.
     *
     * Separate from [saveError] because failing to END the wizard is a different problem
     * from failing to save a step — the way out is the dashboard, not another try at the
     * form. Welcome overrides it: its "Skip the tour" is the only button that reaches
     * `finish()` without the traveler having filled in anything to reassure them about.
     */
    protected open val finishError: String = FINISH_ERROR

    protected val _state = MutableStateFlow(OnboardingUiState(step = step))
    val state: StateFlow<OnboardingUiState> = _state.asStateFlow()

    private val _events = Channel<OnboardingEvent>(Channel.BUFFERED)
    val events = _events.receiveAsFlow()

    fun clearError() = _state.update { it.copy(formError = null) }

    /**
     * Save this step's answers and move on.
     *
     * `advance` is set on the body so the function moves the cursor in the same call that
     * writes: two round trips would leave a window where the answers are saved and the
     * wizard still thinks it is on the step that saved them.
     */
    protected fun save(function: OnboardingFunction, body: JsonObject) {
        if (_state.value.isSaving) return
        _state.update { it.copy(isSaving = true, formError = null) }

        viewModelScope.launch {
            val withAdvance = JsonObject(body + ("advance" to JsonPrimitive(true)))
            when (val result = onboarding.call(function, withAdvance)) {
                is OnboardingResult.Ok -> {
                    _state.update { it.copy(isSaving = false) }
                    advanceLocally()
                }
                is OnboardingResult.Rejected -> _state.update {
                    it.copy(isSaving = false, formError = result.detail ?: saveError)
                }
                // The router watches sessionStatus and will move the stack itself; there is
                // nothing useful to say on a screen that is about to disappear.
                OnboardingResult.Unauthenticated -> _state.update { it.copy(isSaving = false) }
                OnboardingResult.Unavailable -> _state.update {
                    it.copy(isSaving = false, formError = saveError)
                }
            }
        }
    }

    /**
     * Skip this step.
     *
     * Writes only the cursor, through `onboarding-step`, never the step's own function: a
     * profile call with an empty body would spend an `audit_event` row saying somebody
     * changed nothing.
     *
     * Best effort, deliberately. If the cursor write fails the traveler still moves on; the
     * only cost is that an abandoned wizard resumes one step earlier than it should, and
     * holding somebody on a screen they just asked to leave would cost more.
     */
    fun skip() {
        if (_state.value.isSkipping) return
        val next = _state.value.step.next ?: return finish()

        _state.update { it.copy(isSkipping = true, formError = null) }
        viewModelScope.launch {
            onboarding.call(
                OnboardingFunction.STEP,
                buildJsonObject { put("step", next.slug) },
            )
            _state.update { it.copy(isSkipping = false) }
            advanceLocally()
        }
    }

    /** The last step: stamp `onboarding_completed_at` and leave the wizard for good. */
    fun finish() {
        if (_state.value.isSaving) return
        _state.update { it.copy(isSaving = true, formError = null) }

        viewModelScope.launch {
            val result = onboarding.call(
                OnboardingFunction.STEP,
                buildJsonObject { put("complete", true) },
            )
            _state.update { it.copy(isSaving = false) }
            if (result is OnboardingResult.Ok) {
                _events.send(OnboardingEvent.Finished)
            } else {
                // NOT swallowed, unlike a skip. The whole point of this button is the write:
                // if it silently failed they would meet the wizard again on every sign-in
                // with no idea why.
                _state.update { it.copy(formError = finishError) }
            }
        }
    }

    private suspend fun advanceLocally() {
        val next = _state.value.step.next
        if (next == null) _events.send(OnboardingEvent.Finished)
        else _events.send(OnboardingEvent.Advance(next))
    }

    /**
     * PUBLIC, not protected. Screens 2.5.2 and 2.5.3 write through the same two Edge
     * Functions and have to fail in the same words — the web twin reuses `PROFILE_TEXT`
     * and `PREFERENCES_TEXT` from the wizard for exactly that reason, and a second
     * "something went wrong" sentence is how the two stacks start disagreeing.
     */
    companion object {
        const val GENERIC_ERROR =
            "That didn't save — nothing's lost. Give it another try, or skip for now and " +
                "we'll pick this up later."
        const val FINISH_ERROR =
            "We couldn't finish that just now — but everything you entered is saved. Try " +
                "again, or head straight to your dashboard."
    }
}
