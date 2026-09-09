package com.storytail.adventures.ui.screens.onboarding

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.lifecycle.viewmodel.compose.viewModel
import com.storytail.adventures.api.OnboardingRepository
import com.storytail.adventures.domain.onboarding.WizardStep
import kotlinx.datetime.Clock
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime

/**
 * The wizard's six faces behind one route.
 *
 * Each step gets its own ViewModel, keyed by the step so moving on does not reuse the
 * previous one's answers — and so that going BACK to a step gets a fresh form rather than a
 * half-submitted one.
 *
 * The cursor is server-side, so `onAdvance` resets the stack rather than pushing: the wizard
 * is a sequence somebody is walked through, not a pile of screens to back out of one at a
 * time. Back out of step three and you should be at the dashboard's door, not at step two
 * with a cursor that says three.
 */
@Composable
fun OnboardingRoute(
    step: WizardStep,
    onboarding: OnboardingRepository,
    today: String,
    onAdvance: (WizardStep) -> Unit,
    onFinished: () -> Unit,
) {
    when (step) {
        WizardStep.WELCOME -> {
            val vm = viewModel(key = "onboarding-welcome") { WelcomeViewModel(onboarding) }
            val state by vm.state.collectAsState()
            val firstName by vm.firstName.collectAsState()
            Events(vm, onAdvance, onFinished)
            WelcomeScreen(
                state = state,
                firstName = firstName,
                onStart = { vm.skip() },
                onSkip = { vm.finish() },
            )
        }

        WizardStep.PROFILE -> {
            val vm = viewModel(key = "onboarding-profile") {
                ProfileViewModel(onboarding, today)
            }
            val state by vm.state.collectAsState()
            val form by vm.form.collectAsState()
            Events(vm, onAdvance, onFinished)
            ProfileScreen(
                state = state,
                form = form,
                onChange = vm::update,
                onSubmit = vm::submit,
                onSkip = vm::skip,
                today = today,
            )
        }

        WizardStep.PREFERENCES -> {
            val vm = viewModel(key = "onboarding-preferences") {
                PreferencesViewModel(onboarding)
            }
            val state by vm.state.collectAsState()
            val form by vm.form.collectAsState()
            Events(vm, onAdvance, onFinished)
            PreferencesScreen(
                state = state,
                form = form,
                onChange = vm::update,
                onToggleSentinel = vm::toggleSentinel,
                onSubmit = vm::submit,
                onSkip = vm::skip,
            )
        }

        WizardStep.COMPANIONS -> {
            val vm = viewModel(key = "onboarding-companions") {
                CompanionsViewModel(onboarding, today)
            }
            val state by vm.state.collectAsState()
            val form by vm.form.collectAsState()
            Events(vm, onAdvance, onFinished)
            CompanionsScreen(
                state = state,
                form = form,
                onStartAdding = vm::startAdding,
                onStartEditing = vm::startEditing,
                onDraftChange = vm::updateDraft,
                onSaveDraft = vm::saveDraft,
                onCancelDraft = vm::cancelDraft,
                onRemove = vm::remove,
                // Everything is already saved by the time this is pressed; it only moves
                // the cursor.
                onContinue = vm::skip,
                onSkip = vm::skip,
                today = today,
            )
        }

        WizardStep.CONNECT -> {
            val vm = viewModel(key = "onboarding-connect") { ConnectViewModel(onboarding) }
            val state by vm.state.collectAsState()
            val code by vm.code.collectAsState()
            val banner by vm.banner.collectAsState()
            Events(vm, onAdvance, onFinished)
            ConnectScreen(
                state = state,
                code = code,
                banner = banner,
                onCodeChange = vm::onCodeChange,
                onSubmit = vm::submit,
                onSkip = vm::skip,
            )
        }

        WizardStep.COMPLETE -> {
            val vm = viewModel(key = "onboarding-complete") {
                CompleteViewModel(onboarding)
            }
            val state by vm.state.collectAsState()
            val summary by vm.summary.collectAsState()
            Events(vm, onAdvance, onFinished)
            CompleteScreen(state = state, summary = summary, onFinish = vm::finish)
        }
    }
}

@Composable
private fun Events(
    vm: OnboardingViewModel,
    onAdvance: (WizardStep) -> Unit,
    onFinished: () -> Unit,
) {
    LaunchedEffect(vm) {
        vm.events.collect { event ->
            when (event) {
                is OnboardingEvent.Advance -> onAdvance(event.step)
                OnboardingEvent.Finished -> onFinished()
            }
        }
    }
}

/** Today as `YYYY-MM-DD` in UTC, which is how the date-only columns see it. */
fun todayIsoUtc(): String {
    val date = Clock.System.now().toLocalDateTime(TimeZone.UTC).date
    return "${date.year}-${date.monthNumber.pad()}-${date.dayOfMonth.pad()}"
}

private fun Int.pad(): String = toString().padStart(2, '0')
