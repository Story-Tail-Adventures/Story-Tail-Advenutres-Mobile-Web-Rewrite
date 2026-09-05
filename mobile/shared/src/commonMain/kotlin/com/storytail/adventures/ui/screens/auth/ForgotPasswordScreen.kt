// Screen 2.1m.4 Forgot Password — see docs/Screen-Inventory.md §2.1.4 (Pattern A, §4.3) and
// design/source-prototype/screens/client-auth-mobile.jsx `M214_ForgotPassword`. P1.
package com.storytail.adventures.ui.screens.auth

import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.autofill.ContentType
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import com.storytail.adventures.ui.components.AuthHeader
import com.storytail.adventures.ui.components.AuthNoteCard
import com.storytail.adventures.ui.components.AuthPrimaryButton
import com.storytail.adventures.ui.components.AuthScaffold
import com.storytail.adventures.ui.components.AuthTextField
import com.storytail.adventures.ui.components.FormErrorCard

private object ForgotPasswordCopy {
    // Verbatim from the web twin (web/app/(auth)/forgot-password/state.ts) and the M214
    // artboard, which agree. My first draft invented its own and would have shown two
    // different headings to the same person on two devices.
    const val OVERLINE = "PASSWORD HELP"
    const val TITLE = "Forgot your password?"
    const val SUB = "Tell us your email and we'll send a reset link."
    const val EMAIL = "Email"
    const val SUBMIT = "Send reset link"
    const val PENDING = "Sending the link…"
    const val BACK = "Back to sign in"

    const val SENT_TITLE = "Check your email"
    // Deliberately says "if" — the screen does not know, and must not appear to. An account
    // that does not exist gets this same panel, because the alternative hands somebody a
    // way to test a list of addresses against the platform.
    const val SENT_BODY =
        "If there's an account for that address, a reset link is on its way. It's good for " +
            "an hour."
}

@Composable
fun ForgotPasswordScreen(
    state: ForgotPasswordUiState,
    onEmailChange: (String) -> Unit,
    onSubmit: () -> Unit,
    onSignIn: () -> Unit,
    modifier: Modifier = Modifier,
) {
    AuthScaffold(
        modifier = modifier,
        footer = {
            // `MStickyBottom`, like every other artboard in the set. The CTA is pinned even
            // though this screen's content is short, because "reachable above the keyboard"
            // is about the keyboard being open — which on a one-field form it always is.
            if (!state.sent) {
                AuthPrimaryButton(
                    label = ForgotPasswordCopy.SUBMIT,
                    pendingLabel = ForgotPasswordCopy.PENDING,
                    onClick = onSubmit,
                    enabled = !state.isSubmitting,
                    isSubmitting = state.isSubmitting,
                )
            }
            TextButton(onClick = onSignIn, modifier = Modifier.fillMaxWidth()) {
                Text(ForgotPasswordCopy.BACK, style = MaterialTheme.typography.bodyMedium)
            }
        },
    ) {
        AuthHeader(
            overline = ForgotPasswordCopy.OVERLINE,
            title = if (state.sent) ForgotPasswordCopy.SENT_TITLE else ForgotPasswordCopy.TITLE,
            sub = if (state.sent) null else ForgotPasswordCopy.SUB,
        )

        if (state.sent) {
            AuthNoteCard(body = ForgotPasswordCopy.SENT_BODY)
            return@AuthScaffold
        }

        if (state.formError != null) {
            FormErrorCard(
                message = state.formError.message,
                actionLabel = state.formError.action?.label,
            )
        }

        AuthTextField(
            label = ForgotPasswordCopy.EMAIL,
            value = state.email,
            onValueChange = onEmailChange,
            error = state.emailError,
            enabled = !state.isSubmitting,
            keyboardType = KeyboardType.Email,
            contentType = ContentType.EmailAddress,
            imeAction = ImeAction.Done,
            keyboardActions = KeyboardActions(onDone = { onSubmit() }),
        )
    }
}
