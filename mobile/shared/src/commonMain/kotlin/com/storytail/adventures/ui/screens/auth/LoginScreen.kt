// Screen 2.1.1 Login — see docs/Screen-Inventory.md §2.1.1 (and §4.4: Pattern A,
// no deviations) and design/source-prototype/screens/client-auth.jsx (C211_Login).
//
// There is no mobile login artboard in the prototype, so the copy and content come
// from C211_Login and the layout follows Pattern A's mobile rules: single full-width
// column, branded header, CTA reachable above the keyboard, stacked social buttons,
// 56dp tap targets, keyboard-aware scroll, autofill-friendly fields.
package com.storytail.adventures.ui.screens.auth

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeContentPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.autofill.ContentType
import androidx.compose.ui.focus.FocusDirection
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.semantics.contentType
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.storytail.adventures.ui.components.BrandWordmark
import com.storytail.adventures.ui.theme.PillShape
import com.storytail.adventures.ui.theme.StoryTailBrand

/** Pattern A mobile: 56dp minimum, which exceeds the 48dp accessibility floor. */
private val TapTarget = 56.dp

@Composable
fun LoginScreen(
    modifier: Modifier = Modifier,
    state: LoginUiState,
    onEmailChange: (String) -> Unit,
    onPasswordChange: (String) -> Unit,
    onTogglePasswordVisibility: () -> Unit,
    onSubmit: () -> Unit,
    onForgotPassword: () -> Unit,
    onCreateAccount: () -> Unit,
    googleEnabled: Boolean = false,
    appleEnabled: Boolean = false,
) {
    val focusManager = LocalFocusManager.current

    Surface(modifier = modifier, color = MaterialTheme.colorScheme.background) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .safeContentPadding()
                // Lifts the CTA clear of the keyboard — Pattern A's "primary CTA fixed
                // near the keyboard" and "keyboard-aware scroll" in one modifier.
                .imePadding()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 24.dp, vertical = 16.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            BrandWordmark(size = 32.dp)

            Spacer(Modifier.height(8.dp))

            Text(
                text = "WELCOME BACK",
                style = MaterialTheme.typography.labelSmall,
                color = StoryTailBrand.Orange,
            )
            Text(
                text = "Sign in",
                style = MaterialTheme.typography.headlineMedium,
                color = MaterialTheme.colorScheme.onSurface,
            )
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = "New traveler?",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                TextButton(onClick = onCreateAccount) {
                    // Trailing period matches the web twin and the prototype's
                    // "New traveler? Create your account." — it sits outside the link there.
                    Text(
                        text = "Create your account.",
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.SemiBold,
                    )
                }
            }

            state.formError?.let { error ->
                FormErrorCard(message = error.message, actionLabel = error.action?.label)
            }

            OutlinedButton(
                onClick = { /* 2.1.8 — wired when the OAuth client exists */ },
                enabled = googleEnabled,
                shape = PillShape,
                modifier = Modifier.fillMaxWidth().heightIn(min = TapTarget),
            ) { Text("Continue with Google") }

            OutlinedButton(
                onClick = { /* 2.1.8 — wired when the Apple Service ID exists */ },
                enabled = appleEnabled,
                shape = PillShape,
                modifier = Modifier.fillMaxWidth().heightIn(min = TapTarget),
            ) { Text("Continue with Apple") }

            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                HorizontalDivider(Modifier.weight(1f))
                Text(
                    text = "OR",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                HorizontalDivider(Modifier.weight(1f))
            }

            Column {
                Text(
                    text = "Email",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                OutlinedTextField(
                    value = state.email,
                    onValueChange = onEmailChange,
                    singleLine = true,
                    isError = state.emailError != null,
                    supportingText = state.emailError?.let { { Text(it) } },
                    enabled = !state.isSubmitting,
                    keyboardOptions = KeyboardOptions(
                        keyboardType = KeyboardType.Email,
                        imeAction = ImeAction.Next,
                        autoCorrectEnabled = false,
                    ),
                    // ImeAction.Next without this is a no-op key.
                    keyboardActions = KeyboardActions(
                        onNext = { focusManager.moveFocus(FocusDirection.Down) },
                    ),
                    modifier = Modifier
                        .fillMaxWidth()
                        .semantics { contentType = ContentType.EmailAddress },
                )
            }

            Column {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = "Password",
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    TextButton(onClick = onForgotPassword) { Text("Forgot?") }
                }

                OutlinedTextField(
                    value = state.password,
                    onValueChange = onPasswordChange,
                    singleLine = true,
                    isError = state.passwordError != null,
                    supportingText = state.passwordError?.let { { Text(it) } },
                    enabled = !state.isSubmitting,
                    visualTransformation =
                        if (state.isPasswordVisible) VisualTransformation.None
                        else PasswordVisualTransformation(),
                    keyboardOptions = KeyboardOptions(
                        keyboardType = KeyboardType.Password,
                        imeAction = ImeAction.Done,
                    ),
                    keyboardActions = KeyboardActions(onDone = {
                        focusManager.clearFocus()
                        onSubmit()
                    }),
                    trailingIcon = {
                        TextButton(onClick = onTogglePasswordVisibility) {
                            Text(if (state.isPasswordVisible) "Hide" else "Show")
                        }
                    },
                    modifier = Modifier
                        .fillMaxWidth()
                        .semantics { contentType = ContentType.Password },
                )
            }

            Button(
                onClick = onSubmit,
                enabled = state.canSubmit,
                shape = PillShape,
                modifier = Modifier.fillMaxWidth().heightIn(min = TapTarget),
            ) {
                if (state.isSubmitting) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(18.dp),
                        strokeWidth = 2.dp,
                        color = MaterialTheme.colorScheme.onPrimary,
                    )
                    Spacer(Modifier.size(10.dp))
                    // Never freeze the label — "Signing you in…" tells them it is working.
                    Text("Signing you in…")
                } else {
                    Text("Continue to my trips")
                }
            }

            // The prototype colours "terms" and "privacy policy" as primary links.
            // They have no destination until the 2.1.x legal screens exist, but the
            // colour is part of the visual match.
            Text(
                text = buildAnnotatedString {
                    append("By signing in you agree to our ")
                    withStyle(SpanStyle(color = MaterialTheme.colorScheme.primary)) {
                        append("terms")
                    }
                    append(" & ")
                    withStyle(SpanStyle(color = MaterialTheme.colorScheme.primary)) {
                        append("privacy policy")
                    }
                    append(".")
                },
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth().padding(top = 4.dp),
            )
        }
    }
}

@Composable
private fun FormErrorCard(message: String, actionLabel: String?) {
    Surface(
        color = MaterialTheme.colorScheme.errorContainer,
        contentColor = MaterialTheme.colorScheme.onErrorContainer,
        shape = MaterialTheme.shapes.medium,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(Modifier.padding(horizontal = 14.dp, vertical = 12.dp)) {
            Text(text = message, style = MaterialTheme.typography.bodySmall)
            if (actionLabel != null) {
                Text(
                    text = actionLabel,
                    style = MaterialTheme.typography.bodySmall,
                    fontWeight = FontWeight.SemiBold,
                )
            }
        }
    }
}
