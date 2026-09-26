// Screen 2.1m.11 Travel Preferences — see docs/Screen-Inventory.md §2.1.11 (Pattern G,
// §4.4) and design/source-prototype/screens/client-auth-mobile.jsx
// `M2111_PreferencesCapture`. P1.
package com.storytail.adventures.ui.screens.onboarding

import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import com.storytail.adventures.domain.onboarding.WizardStep
import com.storytail.adventures.ui.components.AuthPrimaryButton
import com.storytail.adventures.ui.components.FormErrorCard
import com.storytail.adventures.ui.components.OnboardingScaffold

/**
 * The wizard's chrome around [PreferencesFields].
 *
 * The controls themselves moved to PreferencesFields.kt when §2.5.3 arrived — that screen is
 * the same chips and the same repeater with Save and Cancel instead of Save-and-continue and
 * Skip, and a save that does not move the onboarding cursor.
 */
@Composable
fun PreferencesScreen(
    state: OnboardingUiState,
    form: PreferencesForm,
    onChange: ((PreferencesForm) -> PreferencesForm) -> Unit,
    onToggleSentinel: (Set<String>, String) -> Set<String>,
    onSubmit: () -> Unit,
    onSkip: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val busy = state.isSaving || state.isSkipping

    OnboardingScaffold(
        step = WizardStep.PREFERENCES,
        title = PreferencesCopy.TITLE,
        sub = PreferencesCopy.SUB,
        modifier = modifier,
        footer = {
            AuthPrimaryButton(
                label = PreferencesCopy.PRIMARY,
                pendingLabel = PreferencesCopy.PENDING,
                onClick = onSubmit,
                enabled = !busy,
                isSubmitting = state.isSaving,
            )
            TextButton(onClick = onSkip, modifier = Modifier.fillMaxWidth()) {
                Text(PreferencesCopy.SKIP)
            }
        },
    ) {
        if (state.formError != null) FormErrorCard(message = state.formError)

        PreferencesFields(
            form = form,
            onChange = onChange,
            onToggleSentinel = onToggleSentinel,
            busy = busy,
        )
    }
}
