// Screen 2.1m.6 MFA Setup — see docs/Screen-Inventory.md §2.1.6 (Pattern A, §4.3) and
// design/source-prototype/screens/client-auth-mobile.jsx `M216_MFASetup`. P1.
package com.storytail.adventures.ui.screens.auth

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.storytail.adventures.domain.validation.MfaValidation
import com.storytail.adventures.ui.components.AuthHeader
import com.storytail.adventures.ui.components.AuthPrimaryButton
import com.storytail.adventures.ui.components.AuthScaffold
import com.storytail.adventures.ui.components.CodeInput
import com.storytail.adventures.ui.components.FormErrorCard
import com.storytail.adventures.ui.theme.PillShape

/**
 * TWO DEPARTURES FROM THE ARTBOARD, both because a phone is not a browser.
 *
 * THERE IS NO QR CODE. The artboard draws one, and on the device you are enrolling FROM it
 * is useless — you cannot scan your own screen, so a QR here means fetching a second device
 * to photograph the first. What a phone has instead is the `otpauth://` URI, which opens the
 * authenticator app directly with the secret already in it. That is one tap against a
 * two-device errand. The secret is also shown in full, copyable, for anyone whose app wants
 * it typed or who is setting up on a different device.
 *
 * THE SMS TILE IS VISIBLY UNAVAILABLE, not hidden. `supabase/config.toml` sets
 * `[auth.mfa.phone] enroll_enabled = false`, so offering it would be offering something
 * that fails. Drawing it greyed says the option exists and is not switched on, which is the
 * true thing; hiding it invites the question at a moment when somebody is already being
 * asked to do security admin.
 */
private object MfaSetupCopy {
    const val OVERLINE = "EXTRA SECURITY"
    const val TITLE = "Set up two-factor auth"
    const val SUB = "Recommended if you'll be storing payment cards."
    const val METHOD_APP = "Authenticator app"
    const val METHOD_APP_SUB = "Recommended"
    const val METHOD_SMS = "SMS code"
    const val METHOD_SMS_SUB = "Not available yet"
    const val OPEN_APP = "Open my authenticator app"
    const val SECRET_LABEL = "Or enter this key by hand"
    const val COPY = "Copy key"
    const val COPIED = "Copied"
    const val CODE_LABEL = "Then type the six digits it shows"
    const val SUBMIT = "Verify & turn on MFA"
    const val PENDING = "Turning it on…"
    const val PREPARING = "Getting your key ready…"
    const val RETRY = "Try again"
    const val CANCEL = "Not now"
}

@Composable
fun MfaSetupScreen(
    state: MfaSetupUiState,
    onCodeChange: (String) -> Unit,
    onSecretCopied: () -> Unit,
    onRetry: () -> Unit,
    onSubmit: () -> Unit,
    onCancel: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val clipboard = LocalClipboardManager.current
    val uriHandler = LocalUriHandler.current
    val enrollment = state.enrollment

    AuthScaffold(
        modifier = modifier,
        footer = {
            AuthPrimaryButton(
                label = MfaSetupCopy.SUBMIT,
                pendingLabel = MfaSetupCopy.PENDING,
                onClick = onSubmit,
                enabled = enrollment != null && !state.isVerifying,
                isSubmitting = state.isVerifying,
            )
            TextButton(onClick = onCancel, modifier = Modifier.fillMaxWidth()) {
                Text(MfaSetupCopy.CANCEL)
            }
        },
    ) {
        AuthHeader(
            overline = MfaSetupCopy.OVERLINE,
            title = MfaSetupCopy.TITLE,
            sub = MfaSetupCopy.SUB,
        )

        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            MethodTile(
                title = MfaSetupCopy.METHOD_APP,
                sub = MfaSetupCopy.METHOD_APP_SUB,
                selected = true,
                modifier = Modifier.weight(1f),
            )
            MethodTile(
                title = MfaSetupCopy.METHOD_SMS,
                sub = MfaSetupCopy.METHOD_SMS_SUB,
                selected = false,
                modifier = Modifier.weight(1f),
            )
        }

        if (state.formError != null) {
            FormErrorCard(
                message = state.formError.message,
                actionLabel = state.formError.action?.label,
            )
        }

        when {
            state.isEnrolling -> Row(
                modifier = Modifier.fillMaxWidth().padding(vertical = 12.dp),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                CircularProgressIndicator(Modifier.padding(2.dp))
                Text(
                    text = MfaSetupCopy.PREPARING,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            enrollment == null -> TextButton(
                onClick = onRetry,
                modifier = Modifier.fillMaxWidth(),
            ) { Text(MfaSetupCopy.RETRY) }

            else -> {
                OutlinedButton(
                    onClick = { uriHandler.openUri(enrollment.uri) },
                    shape = PillShape,
                    modifier = Modifier.fillMaxWidth(),
                ) { Text(MfaSetupCopy.OPEN_APP) }

                Text(
                    text = MfaSetupCopy.SECRET_LABEL,
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Surface(
                    color = MaterialTheme.colorScheme.surfaceVariant,
                    shape = MaterialTheme.shapes.medium,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Row(
                        modifier = Modifier.padding(start = 14.dp, end = 6.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(
                            text = enrollment.secret,
                            fontFamily = FontFamily.Monospace,
                            style = MaterialTheme.typography.bodyMedium,
                            modifier = Modifier.weight(1f),
                        )
                        TextButton(
                            onClick = {
                                clipboard.setText(AnnotatedString(enrollment.secret))
                                onSecretCopied()
                            },
                        ) {
                            Text(
                                if (state.secretCopied) MfaSetupCopy.COPIED
                                else MfaSetupCopy.COPY,
                            )
                        }
                    }
                }

                Text(
                    text = MfaSetupCopy.CODE_LABEL,
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
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

@Composable
private fun MethodTile(
    title: String,
    sub: String,
    selected: Boolean,
    modifier: Modifier = Modifier,
) {
    Surface(
        color =
            if (selected) MaterialTheme.colorScheme.primaryContainer
            else MaterialTheme.colorScheme.surface,
        contentColor =
            if (selected) MaterialTheme.colorScheme.onPrimaryContainer
            else MaterialTheme.colorScheme.onSurfaceVariant,
        shape = MaterialTheme.shapes.medium,
        border =
            if (selected) null
            else androidx.compose.foundation.BorderStroke(
                1.dp,
                MaterialTheme.colorScheme.outlineVariant,
            ),
        modifier = modifier,
    ) {
        Column(Modifier.padding(12.dp)) {
            Text(text = title, style = MaterialTheme.typography.titleSmall)
            Text(
                text = sub,
                style = MaterialTheme.typography.bodySmall,
                textAlign = TextAlign.Start,
            )
        }
    }
}
