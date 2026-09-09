// Screen 2.1m.13 Connect with Agent — see docs/Screen-Inventory.md §2.1.13 (Pattern G,
// §4.4) and design/source-prototype/screens/client-auth-mobile.jsx `M2113_ConnectAgent`. P1.
package com.storytail.adventures.ui.screens.onboarding

import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import com.storytail.adventures.domain.onboarding.ConnectBanner
import com.storytail.adventures.domain.onboarding.WizardStep
import com.storytail.adventures.ui.components.AuthNoteCard
import com.storytail.adventures.ui.components.AuthSuccessCard
import com.storytail.adventures.ui.components.AuthPrimaryButton
import com.storytail.adventures.ui.components.AuthTextField
import com.storytail.adventures.ui.components.FormErrorCard
import com.storytail.adventures.ui.components.OnboardingScaffold

/**
 * THE PROTOTYPE PROMISES SOMETHING THAT HAS ALREADY HAPPENED.
 *
 * Its subtitle says "skip — we'll find them automatically by email", but the automatic match
 * is not future work: `handle_user_email_confirmed()` runs at email confirmation, and by the
 * time this screen renders it has either succeeded or not. This screen exists precisely
 * because it did not — the traveler signed up with a different address, or two records
 * matched and the trigger deliberately claimed neither. Telling somebody the match is coming,
 * on the screen that exists because it did not come, is the one thing this copy must not do.
 *
 * The prototype also calls Gyasi "her". Four artboards further up the same file the copy says
 * "him", and supabase/seed.sql and web/content/public/proof.ts both say he/him.
 */
private object ConnectCopy {
    const val TITLE = "Have I already started planning a trip for you?"
    const val SUB =
        "If I've already sent you an invitation code, paste it below and I'll link those " +
            "trips to your account. No code? Skip this — you can add one later from your " +
            "account settings."
    const val FIELD = "Invite code (optional)"
    const val HELP = "Codes look like STA-7HX2J9. Spaces, dashes and lowercase are all fine."
    const val PRIMARY = "Connect my trips"
    const val PRIMARY_EMPTY = "Continue"
    const val PENDING = "Connecting…"
    const val SKIP = "Skip for now"
}

@Composable
fun ConnectScreen(
    state: OnboardingUiState,
    code: String,
    /** What the automatic match found, or null while we are still looking. */
    banner: ConnectBanner?,
    onCodeChange: (String) -> Unit,
    onSubmit: () -> Unit,
    onSkip: () -> Unit,
    modifier: Modifier = Modifier,
) {
    OnboardingScaffold(
        step = WizardStep.CONNECT,
        title = ConnectCopy.TITLE,
        sub = ConnectCopy.SUB,
        modifier = modifier,
        footer = {
            AuthPrimaryButton(
                // Two labels because the button does two things: with a code it redeems
                // one, empty it simply carries on. One fixed label would be a small lie in
                // whichever state it was wrong for.
                label = if (code.isBlank()) ConnectCopy.PRIMARY_EMPTY else ConnectCopy.PRIMARY,
                pendingLabel = ConnectCopy.PENDING,
                onClick = onSubmit,
                enabled = !state.isSaving && !state.isSkipping,
                isSubmitting = state.isSaving,
            )
            TextButton(onClick = onSkip, modifier = Modifier.fillMaxWidth()) {
                Text(ConnectCopy.SKIP)
            }
        },
    ) {
        // Nothing until the read answers. The no-match wording is a claim about this
        // account, and showing it while we have not looked would tell somebody whose trip IS
        // linked that it is not — on the one screen whose whole premise is being honest
        // about what has already happened.
        when {
            banner == null -> Unit
            banner.matched -> AuthSuccessCard(body = banner.message)
            else -> AuthNoteCard(body = banner.message)
        }

        if (state.formError != null) FormErrorCard(message = state.formError)

        AuthTextField(
            label = ConnectCopy.FIELD,
            value = code,
            onValueChange = onCodeChange,
            supportingText = ConnectCopy.HELP,
            enabled = !state.isSaving,
            keyboardType = KeyboardType.Ascii,
            imeAction = ImeAction.Done,
            keyboardActions = KeyboardActions(onDone = { onSubmit() }),
            modifier = Modifier.fillMaxWidth(),
        )
    }
}
