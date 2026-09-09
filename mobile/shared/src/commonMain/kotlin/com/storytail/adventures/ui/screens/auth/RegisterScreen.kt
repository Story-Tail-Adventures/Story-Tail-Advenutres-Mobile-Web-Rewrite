// Screen 2.1m.2 Registration — see docs/Screen-Inventory.md §2.1.2 (Pattern A, §4.3) and
// design/source-prototype/screens/client-auth-mobile.jsx `M212_Registration`. P1.
package com.storytail.adventures.ui.screens.auth

import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.material3.Checkbox
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.autofill.ContentType
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.storytail.adventures.ui.components.AuthHeader
import com.storytail.adventures.ui.components.AuthPrimaryButton
import com.storytail.adventures.ui.components.AuthScaffold
import com.storytail.adventures.ui.components.AuthTapTarget
import com.storytail.adventures.ui.components.AuthTextField
import com.storytail.adventures.ui.components.FormErrorCard
import com.storytail.adventures.ui.components.LabeledDivider
import com.storytail.adventures.ui.components.PasswordStrengthMeter
import com.storytail.adventures.ui.theme.PillShape

/**
 * Copy, in one object rather than scattered through the tree.
 *
 * The mobile sub is SHORTER than the web one — "60 seconds. No planning fees, ever." against
 * "Takes about 60 seconds. No planning fees, ever." — because the artboard is, and a phone
 * header has less room to spend. The strings that must match the web verbatim are the ones
 * the copy-parity script is told about; a subtitle written for a narrower column is not one
 * of them.
 */
private object RegisterCopy {
    const val OVERLINE = "JOIN STORY-TAIL"
    const val TITLE = "Create your account"
    const val SUB = "60 seconds. No planning fees, ever."
    const val GOOGLE = "Sign up with Google"
    const val APPLE = "Sign up with Apple"
    const val SOCIAL_DISABLED = "Social sign-up isn't switched on yet — use your email below."
    const val DIVIDER = "OR EMAIL"
    const val FIRST_NAME = "First name"
    const val LAST_NAME = "Last name"
    const val EMAIL = "Email"
    const val PASSWORD = "Password"
    const val CONFIRM = "Confirm password"
    const val TERMS = "I agree to the Terms & Privacy policy"
    const val SUBMIT = "Create account"
    const val PENDING = "Creating your account…"
    const val HAVE_ACCOUNT = "Already a member?"
    const val SIGN_IN = "Sign in"
}

@Composable
fun RegisterScreen(
    state: RegisterUiState,
    onFirstNameChange: (String) -> Unit,
    onLastNameChange: (String) -> Unit,
    onEmailChange: (String) -> Unit,
    onPasswordChange: (String) -> Unit,
    onConfirmPasswordChange: (String) -> Unit,
    onTermsChange: (Boolean) -> Unit,
    onTogglePasswordVisibility: () -> Unit,
    onSubmit: () -> Unit,
    onSignIn: () -> Unit,
    googleEnabled: Boolean = false,
    appleEnabled: Boolean = false,
    modifier: Modifier = Modifier,
) {
    AuthScaffold(
        modifier = modifier,
        footer = {
            // Pinned: this form is six fields tall and the CTA would otherwise sit below the
            // fold on every phone the app supports.
            AuthPrimaryButton(
                label = RegisterCopy.SUBMIT,
                pendingLabel = RegisterCopy.PENDING,
                onClick = onSubmit,
                enabled = state.canSubmit,
                isSubmitting = state.isSubmitting,
            )
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.Center,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = RegisterCopy.HAVE_ACCOUNT,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                TextButton(onClick = onSignIn) { Text(RegisterCopy.SIGN_IN) }
            }
        },
    ) {
        AuthHeader(overline = RegisterCopy.OVERLINE, title = RegisterCopy.TITLE, sub = RegisterCopy.SUB)

        if (state.formError != null) {
            FormErrorCard(
                message = state.formError.message,
                actionLabel = state.formError.action?.label,
            )
        }

        // Rendered but disabled until the OAuth clients exist and supabase/config.toml
        // carries the [auth.external.*] blocks. A hidden option cannot be asked about; a
        // visibly-off one explains itself.
        OutlinedButton(
            onClick = {},
            enabled = googleEnabled,
            shape = PillShape,
            modifier = Modifier.fillMaxWidth().heightIn(min = AuthTapTarget),
        ) { Text(RegisterCopy.GOOGLE) }
        OutlinedButton(
            onClick = {},
            enabled = appleEnabled,
            shape = PillShape,
            modifier = Modifier.fillMaxWidth().heightIn(min = AuthTapTarget),
        ) { Text(RegisterCopy.APPLE) }
        if (!googleEnabled && !appleEnabled) {
            Text(
                text = RegisterCopy.SOCIAL_DISABLED,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }

        LabeledDivider(RegisterCopy.DIVIDER)

        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            AuthTextField(
                label = RegisterCopy.FIRST_NAME,
                value = state.firstName,
                onValueChange = onFirstNameChange,
                error = state.firstNameError,
                enabled = !state.isSubmitting,
                contentType = ContentType.PersonFirstName,
                modifier = Modifier.weight(1f),
            )
            AuthTextField(
                label = RegisterCopy.LAST_NAME,
                value = state.lastName,
                onValueChange = onLastNameChange,
                error = state.lastNameError,
                enabled = !state.isSubmitting,
                contentType = ContentType.PersonLastName,
                modifier = Modifier.weight(1f),
            )
        }

        AuthTextField(
            label = RegisterCopy.EMAIL,
            value = state.email,
            onValueChange = onEmailChange,
            error = state.emailError,
            enabled = !state.isSubmitting,
            keyboardType = KeyboardType.Email,
            contentType = ContentType.EmailAddress,
        )

        Column {
            AuthTextField(
                label = RegisterCopy.PASSWORD,
                value = state.password,
                onValueChange = onPasswordChange,
                error = state.passwordError,
                enabled = !state.isSubmitting,
                keyboardType = KeyboardType.Password,
                // NewPassword, not Password: it tells the platform manager to OFFER one
                // rather than to fill the account's existing credential in.
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
            label = RegisterCopy.CONFIRM,
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

        Row(
            modifier = Modifier
                .fillMaxWidth()
                // The whole row toggles, not just the 20dp box — Pattern A's 56dp tap
                // target applies to a checkbox as much as to a button.
                .heightIn(min = AuthTapTarget)
                // `toggleable`, not `clickable`: the latter carries no role and no checked
                // state, so a screen reader reads the label and never says it is a checkbox
                // or whether it is ticked — on the one control that gates the submit.
                .toggleable(
                    value = state.termsAccepted,
                    onValueChange = onTermsChange,
                    role = Role.Checkbox,
                    enabled = !state.isSubmitting,
                ),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Checkbox(
                checked = state.termsAccepted,
                // Null, and the row above owns the click: two overlapping targets would
                // read to a screen reader as two separate controls for one choice.
                onCheckedChange = null,
                enabled = !state.isSubmitting,
                modifier = Modifier.clearAndSetSemantics {},
            )
            Text(
                text = RegisterCopy.TERMS,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        if (state.termsError != null) {
            Text(
                text = state.termsError,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.error,
            )
        }
    }
}
