// The shell and parts every Screen Inventory §2.1 auth screen is built from.
//
// Pulled out of LoginScreen (2.1.1), which had all of it inline and was the only screen at
// the time. The mobile artboards in design/source-prototype/screens/client-auth-mobile.jsx
// share exactly one shell (`MFrame` + `MBrandMark` + `MAuthHeader`), so the screens differ
// only in what goes between the header and the CTA — which is what these let them do.
package com.storytail.adventures.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
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
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.autofill.ContentType
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.contentType
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import com.storytail.adventures.domain.validation.PasswordStrength
import com.storytail.adventures.ui.theme.PillShape
import com.storytail.adventures.ui.theme.LocalStoryTailExtended
import com.storytail.adventures.ui.theme.StoryTailBrand

/** Pattern A mobile: 56dp minimum, which exceeds the 48dp accessibility floor. */
val AuthTapTarget = 56.dp

/**
 * The single-column shell from Pattern A's mobile rules (Screen Inventory §4.3).
 *
 * `safeContentPadding` keeps content out of the notch and the home indicator; `imePadding`
 * plus `verticalScroll` are together the "primary CTA reachable above the keyboard" and
 * "keyboard-aware scroll" the pattern asks for — without them the submit button on a short
 * phone sits under the keyboard with no way to reach it.
 */
@Composable
fun AuthScaffold(
    modifier: Modifier = Modifier,
    showWordmark: Boolean = true,
    footer: (@Composable ColumnScope.() -> Unit)? = null,
    content: @Composable ColumnScope.() -> Unit,
) {
    Surface(modifier = modifier, color = MaterialTheme.colorScheme.background) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .safeContentPadding()
                .imePadding(),
        ) {
            Column(
                modifier = Modifier
                    .weight(1f)
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = 24.dp, vertical = 16.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp),
            ) {
                if (showWordmark) {
                    BrandMark(size = 80.dp)
                    Spacer(Modifier.height(8.dp))
                }
                content()
            }

            if (footer != null) StickyFooter(content = footer)
        }
    }
}

/**
 * `MStickyBottom` from the prototype: the CTA pinned below the scrolling form.
 *
 * Outside the scroll, so a long form cannot push the primary action off the bottom of a
 * short phone — Pattern A's "primary CTA reachable above the keyboard" for the screens
 * where the content is genuinely taller than the viewport. Screens whose content fits pass
 * no footer and keep the CTA inline, which is what the shorter artboards draw.
 */
@Composable
private fun StickyFooter(content: @Composable ColumnScope.() -> Unit) {
    Surface(color = MaterialTheme.colorScheme.surfaceContainerLow) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 18.dp)
                .padding(top = 12.dp, bottom = 16.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            content()
        }
    }
}

/**
 * The strength bar under a new password, and the line that says what is still missing.
 *
 * The bar is not decoration: [PasswordStrength.message] names the rules that are unmet
 * rather than scoring the password out of five, so somebody stuck knows what to change.
 * Empty for an empty field — nobody has failed at anything before they have typed.
 */
@Composable
fun PasswordStrengthMeter(password: String, modifier: Modifier = Modifier) {
    if (password.isEmpty()) return

    val result = PasswordStrength.of(password)
    val total = PasswordStrength.RULE_COUNT
    val tone =
        if (result.meets) LocalStoryTailExtended.current.success
        else MaterialTheme.colorScheme.onSurfaceVariant

    Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            repeat(total) { index ->
                Surface(
                    color =
                        if (index < result.score) tone
                        else MaterialTheme.colorScheme.outlineVariant,
                    shape = MaterialTheme.shapes.extraSmall,
                    modifier = Modifier.weight(1f).height(4.dp),
                ) {}
            }
        }
        Text(
            text = PasswordStrength.message(password),
            style = MaterialTheme.typography.bodySmall,
            color = tone,
            // Announced as it changes. Without this a screen-reader user typing a password
            // never hears what is still missing — they would have to navigate back to a
            // line that is only there to tell them.
            modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
        )
    }
}

/** `MAuthHeader` from the prototype: orange overline, heavy title, quiet subtitle. */
@Composable
fun AuthHeader(overline: String, title: String, sub: String? = null) {
    Text(
        text = overline,
        style = MaterialTheme.typography.labelSmall,
        color = StoryTailBrand.Orange,
    )
    Text(
        text = title,
        style = MaterialTheme.typography.headlineMedium,
        color = MaterialTheme.colorScheme.onSurface,
    )
    if (sub != null) {
        Text(
            text = sub,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

/**
 * A labelled field.
 *
 * The label is a sibling Text rather than the OutlinedTextField's own, matching the
 * prototype's `field-label` above the box and the web `Field` component. [contentType] is
 * what lets the platform password manager fill it — worth more on a phone than any amount
 * of visual fidelity.
 */
@Composable
fun AuthTextField(
    label: String,
    value: String,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier,
    error: String? = null,
    supportingText: String? = null,
    enabled: Boolean = true,
    keyboardType: KeyboardType = KeyboardType.Text,
    imeAction: ImeAction = ImeAction.Next,
    keyboardActions: KeyboardActions = KeyboardActions.Default,
    contentType: ContentType? = null,
    isPassword: Boolean = false,
    isPasswordVisible: Boolean = false,
    onTogglePasswordVisibility: (() -> Unit)? = null,
    labelAction: (@Composable () -> Unit)? = null,
) {
    Column(modifier) {
        if (labelAction != null) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                FieldLabel(label)
                labelAction()
            }
        } else {
            FieldLabel(label)
        }

        OutlinedTextField(
            value = value,
            onValueChange = onValueChange,
            singleLine = true,
            isError = error != null,
            supportingText = (error ?: supportingText)?.let { { Text(it) } },
            enabled = enabled,
            visualTransformation =
                if (isPassword && !isPasswordVisible) PasswordVisualTransformation()
                else VisualTransformation.None,
            keyboardOptions = KeyboardOptions(
                keyboardType = keyboardType,
                imeAction = imeAction,
                autoCorrectEnabled = false,
            ),
            keyboardActions = keyboardActions,
            trailingIcon = if (isPassword && onTogglePasswordVisibility != null) {
                {
                    TextButton(onClick = onTogglePasswordVisibility) {
                        Text(if (isPasswordVisible) "Hide" else "Show")
                    }
                }
            } else null,
            modifier = Modifier
                .fillMaxWidth()
                .then(
                    if (contentType != null) {
                        Modifier.semantics { this.contentType = contentType }
                    } else Modifier,
                ),
        )
    }
}

@Composable
private fun FieldLabel(text: String) {
    Text(
        text = text,
        style = MaterialTheme.typography.labelMedium,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
}

/**
 * The full-width primary CTA, with its pending state.
 *
 * The label never freezes: a spinner beside "Signing you in…" says the app is working,
 * where a spinner beside the original label says nothing changed.
 */
@Composable
fun AuthPrimaryButton(
    label: String,
    pendingLabel: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    isSubmitting: Boolean = false,
) {
    Button(
        onClick = onClick,
        enabled = enabled && !isSubmitting,
        shape = PillShape,
        modifier = modifier.fillMaxWidth().heightIn(min = AuthTapTarget),
    ) {
        if (isSubmitting) {
            CircularProgressIndicator(
                modifier = Modifier.size(18.dp),
                strokeWidth = 2.dp,
                color = MaterialTheme.colorScheme.onPrimary,
            )
            Spacer(Modifier.size(10.dp))
            Text(pendingLabel)
        } else {
            Text(label)
        }
    }
}

/** "———— OR ————", between the social block and the email block. */
@Composable
fun LabeledDivider(label: String) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        HorizontalDivider(Modifier.weight(1f))
        Text(
            text = label,
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        HorizontalDivider(Modifier.weight(1f))
    }
}

/** A form-level failure, with the "somewhere useful to go" most of them carry. */
@Composable
fun FormErrorCard(message: String, actionLabel: String? = null) {
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

/**
 * The same card in a warning tone: something worth saying, that is not an error.
 *
 * Distinct from [FormErrorCard] because an expired passport did not stop the save — telling
 * somebody in the colour reserved for failure would say it did.
 */
@Composable
fun FormWarningCard(message: String) {
    val extended = LocalStoryTailExtended.current
    Surface(
        color = extended.warningContainer,
        contentColor = extended.warning,
        shape = MaterialTheme.shapes.medium,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(Modifier.padding(horizontal = 14.dp, vertical = 12.dp)) {
            Text(text = message, style = MaterialTheme.typography.bodySmall)
        }
    }
}

/**
 * The same card in a success tone: something good that has already happened.
 *
 * 2.1m.13's "already linked" banner is the only caller today. It is a different colour from
 * [AuthNoteCard] because "your trip is waiting" and "nothing linked yet" are opposite
 * answers, and rendering both in the neutral surface makes them look like the same
 * announcement.
 */
@Composable
fun AuthSuccessCard(body: String) {
    val extended = LocalStoryTailExtended.current
    Surface(
        color = extended.successContainer,
        contentColor = extended.success,
        shape = MaterialTheme.shapes.medium,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(Modifier.padding(14.dp)) {
            Text(text = body, style = MaterialTheme.typography.bodySmall)
        }
    }
}

/** A quiet card for reassurance and explanation — the prototype's surface-2 blocks. */
@Composable
fun AuthNoteCard(title: String? = null, body: String) {
    Surface(
        color = MaterialTheme.colorScheme.surfaceVariant,
        contentColor = MaterialTheme.colorScheme.onSurfaceVariant,
        shape = MaterialTheme.shapes.medium,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(Modifier.padding(14.dp)) {
            if (title != null) {
                Text(
                    text = title,
                    style = MaterialTheme.typography.titleSmall,
                    color = MaterialTheme.colorScheme.onSurface,
                )
                Spacer(Modifier.height(4.dp))
            }
            Text(text = body, style = MaterialTheme.typography.bodySmall)
        }
    }
}
