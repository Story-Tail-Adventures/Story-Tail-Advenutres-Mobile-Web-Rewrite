// Screen 2.1m.7 MFA Challenge — see docs/Screen-Inventory.md §2.1.7 (Pattern A, §4.3) and
// design/source-prototype/screens/client-auth-mobile.jsx `M217_MFAChallenge`. P1.
package com.storytail.adventures.ui.screens.auth

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.storytail.adventures.domain.validation.MfaValidation
import com.storytail.adventures.ui.components.AuthHeader
import com.storytail.adventures.ui.components.AuthNoteCard
import com.storytail.adventures.ui.components.AuthPrimaryButton
import com.storytail.adventures.ui.components.AuthScaffold
import com.storytail.adventures.ui.components.CodeInput
import com.storytail.adventures.ui.components.FormErrorCard

private object MfaChallengeCopy {
    const val OVERLINE = "TWO-FACTOR"
    const val TITLE = "Enter your code"
    const val SUB = "The six digits from your authenticator app."
    const val SUBMIT = "Verify"
    const val PENDING = "Checking…"
    const val SIGN_OUT = "Sign out instead"
    const val RESOLVING = "One moment…"
    // Reached only if the account has no verified factor, which the router should make
    // impossible. Said plainly rather than left as a form that cannot be submitted.
    const val NO_FACTOR_TITLE = "No authenticator on this account"
    const val NO_FACTOR_BODY =
        "Two-factor is switched on for you, but there's no app registered to answer with. " +
            "Sign out and message Gyasi — he can clear it and you can set it up again."
}

@Composable
fun MfaChallengeScreen(
    state: MfaChallengeUiState,
    onCodeChange: (String) -> Unit,
    onSubmit: () -> Unit,
    onSignOut: () -> Unit,
    modifier: Modifier = Modifier,
) {
    AuthScaffold(
        modifier = modifier,
        footer = {
            if (state.factorId != null) {
                AuthPrimaryButton(
                    label = MfaChallengeCopy.SUBMIT,
                    pendingLabel = MfaChallengeCopy.PENDING,
                    onClick = onSubmit,
                    enabled = !state.isVerifying,
                    isSubmitting = state.isVerifying,
                )
            }
            TextButton(onClick = onSignOut, modifier = Modifier.fillMaxWidth()) {
                Text(MfaChallengeCopy.SIGN_OUT)
            }
        },
    ) {
        AuthHeader(
            overline = MfaChallengeCopy.OVERLINE,
            title = MfaChallengeCopy.TITLE,
            sub = if (state.factorId != null) MfaChallengeCopy.SUB else null,
        )

        if (state.formError != null) {
            FormErrorCard(
                message = state.formError.message,
                actionLabel = state.formError.action?.label,
            )
        }

        when {
            state.isResolving -> Row(
                modifier = Modifier.fillMaxWidth().padding(vertical = 12.dp),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                CircularProgressIndicator(Modifier.padding(2.dp))
                Text(
                    text = MfaChallengeCopy.RESOLVING,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            state.factorId == null -> AuthNoteCard(
                title = MfaChallengeCopy.NO_FACTOR_TITLE,
                body = MfaChallengeCopy.NO_FACTOR_BODY,
            )

            else -> {
                CodeInput(
                    value = state.code,
                    onValueChange = onCodeChange,
                    length = MfaValidation.CODE_LENGTH,
                    enabled = !state.isVerifying,
                    isError = state.codeError != null,
                    onSubmit = onSubmit,
                )
                if (state.codeError != null) {
                    Text(
                        text = state.codeError,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.error,
                    )
                }
            }
        }
    }
}
