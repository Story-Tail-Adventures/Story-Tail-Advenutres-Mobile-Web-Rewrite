// Screen 2.1m.10 Profile Completion — see docs/Screen-Inventory.md §2.1.10 (Pattern G,
// §4.4) and design/source-prototype/screens/client-auth-mobile.jsx
// `M2110_ProfileCompletion`. P1.
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
 * The wizard's chrome around [ProfileFields].
 *
 * The fields themselves moved to ProfileFields.kt when §2.5.2 arrived: that screen is the
 * same thirteen inputs with Save and Cancel instead of Save-and-continue and Skip, and with a
 * save that does not move the onboarding cursor. `ProfileCopy` moved with them, since the
 * labels belong to the fields rather than to either screen.
 */
@Composable
fun ProfileScreen(
    state: OnboardingUiState,
    form: ProfileForm,
    onChange: ((ProfileForm) -> ProfileForm) -> Unit,
    onSubmit: () -> Unit,
    onSkip: () -> Unit,
    /** Today in UTC, hoisted so the expired-passport warning is testable. */
    today: String,
    modifier: Modifier = Modifier,
) {
    val busy = state.isSaving || state.isSkipping

    OnboardingScaffold(
        step = WizardStep.PROFILE,
        title = ProfileCopy.TITLE,
        sub = ProfileCopy.SUB,
        modifier = modifier,
        footer = {
            AuthPrimaryButton(
                label = ProfileCopy.PRIMARY,
                pendingLabel = ProfileCopy.PENDING,
                onClick = onSubmit,
                enabled = !busy,
                isSubmitting = state.isSaving,
            )
            TextButton(onClick = onSkip, modifier = Modifier.fillMaxWidth()) {
                Text(ProfileCopy.SKIP)
            }
        },
    ) {
        if (state.formError != null) FormErrorCard(message = state.formError)

        ProfileFields(form = form, onChange = onChange, busy = busy, today = today)
    }
}
