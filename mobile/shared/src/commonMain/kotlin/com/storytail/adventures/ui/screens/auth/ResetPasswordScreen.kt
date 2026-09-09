// Screen 2.1m.5 Reset Password — see docs/Screen-Inventory.md §2.1.5 (Pattern A, §4.3) and
// design/source-prototype/screens/client-auth-mobile.jsx `M215_ResetPassword`. P1.
package com.storytail.adventures.ui.screens.auth

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.autofill.ContentType
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.storytail.adventures.ui.components.AuthHeader
import com.storytail.adventures.ui.components.AuthPrimaryButton
import com.storytail.adventures.ui.components.AuthScaffold
import com.storytail.adventures.ui.components.AuthTextField
import com.storytail.adventures.ui.components.FormErrorCard
import com.storytail.adventures.ui.components.PasswordStrengthMeter

private object ResetPasswordCopy {
    // Verbatim from the web twin (web/app/(auth)/reset-password/state.ts) and the M215
    // artboard, which agree.
    const val OVERLINE = "RESET PASSWORD"
    const val TITLE = "Set a new password"
    const val SUB = "Use at least 12 characters with a number."
    const val PASSWORD = "New password"
    const val CONFIRM = "Confirm new password"
    const val SUBMIT = "Update password"
    const val PENDING = "Updating your password…"
    const val BACK = "Back to sign in"
}

@Composable
fun ResetPasswordScreen(
    state: ResetPasswordUiState,
    onPasswordChange: (String) -> Unit,
    onConfirmPasswordChange: (String) -> Unit,
    onTogglePasswordVisibility: () -> Unit,
    onSubmit: () -> Unit,
    onSignIn: () -> Unit,
    modifier: Modifier = Modifier,
) {
    AuthScaffold(
        modifier = modifier,
        footer = {
            // `MStickyBottom`, as M215 draws it: two password fields plus a strength meter
            // is exactly the height at which an inline CTA disappears under the keyboard.
            AuthPrimaryButton(
                label = ResetPasswordCopy.SUBMIT,
                pendingLabel = ResetPasswordCopy.PENDING,
                onClick = onSubmit,
                enabled = !state.isSubmitting,
                isSubmitting = state.isSubmitting,
            )
            TextButton(onClick = onSignIn, modifier = Modifier.fillMaxWidth()) {
                Text(ResetPasswordCopy.BACK)
            }
        },
    ) {
        AuthHeader(overline = ResetPasswordCopy.OVERLINE, title = ResetPasswordCopy.TITLE, sub = ResetPasswordCopy.SUB)

        if (state.formError != null) {
            FormErrorCard(
                message = state.formError.message,
                actionLabel = state.formError.action?.label,
            )
        }

        Column {
            AuthTextField(
                label = ResetPasswordCopy.PASSWORD,
                value = state.password,
                onValueChange = onPasswordChange,
                error = state.passwordError,
                enabled = !state.isSubmitting,
                keyboardType = KeyboardType.Password,
                contentType = ContentType.NewPassword,
                isPassword = true,
                isPasswordVisible = state.isPasswordVisible,
                onTogglePasswordVisibility = onTogglePasswordVisibility,
            )
            PasswordStrengthMeter(
                password = state.password,
                modifier = Modifier.padding(top = 6.dp),
            )
        }

        AuthTextField(
            label = ResetPasswordCopy.CONFIRM,
            value = state.confirmPassword,
            onValueChange = onConfirmPasswordChange,
            error = state.confirmPasswordError,
            enabled = !state.isSubmitting,
            keyboardType = KeyboardType.Password,
            contentType = ContentType.NewPassword,
            isPassword = true,
            isPasswordVisible = state.isPasswordVisible,
            imeAction = ImeAction.Done,
            keyboardActions = KeyboardActions(onDone = { onSubmit() }),
        )

    }
}
