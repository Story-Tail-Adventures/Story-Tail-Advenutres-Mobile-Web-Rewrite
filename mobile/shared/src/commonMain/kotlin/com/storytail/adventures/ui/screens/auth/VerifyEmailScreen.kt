// Screen 2.1m.3 Email Verification — see docs/Screen-Inventory.md §2.1.3 (Pattern A, §4.3)
// and design/source-prototype/screens/client-auth-mobile.jsx `M213_EmailVerification`. P1.
package com.storytail.adventures.ui.screens.auth

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import com.storytail.adventures.ui.components.AuthNoteCard
import com.storytail.adventures.ui.components.AuthPrimaryButton
import com.storytail.adventures.ui.components.AuthScaffold
import com.storytail.adventures.ui.components.FormErrorCard
import com.storytail.adventures.ui.theme.LocalStoryTailExtended
import com.storytail.adventures.ui.theme.StoryTailBrand

private object VerifyEmailCopy {
    const val OVERLINE = "ONE MORE STEP"
    const val TITLE = "Check your email"
    const val SENT_TO = "We sent a verification link to "
    const val SENT_NO_ADDRESS =
        "We sent a verification link to the address you signed up with."
    const val WHY_TITLE = "Why verify?"
    const val WHY_BODY =
        "It links any trips Gyasi has already started planning for you, so you'll see them " +
            "as soon as you sign in."
    const val RESEND = "Resend verification email"
    const val RESENDING = "Sending it again…"
    const val RESENT = "Sent. Give it a minute, and check the spam folder if it hides."
    const val CHANGE_EMAIL = "Change email"
    const val SIGN_OUT = "Sign out"
}

/**
 * The envelope inside the badge, drawn rather than imported.
 *
 * The prototype uses `<Icon name="mail">` from its own set, and the shared module has no
 * icon library — pulling `material-icons-core` in for one glyph is a dependency for a
 * rectangle and two lines. Traced the same way `StoryTailMark` is.
 */
@Composable
private fun EnvelopeGlyph(modifier: Modifier = Modifier) {
    val color = LocalContentColor.current
    Canvas(modifier.size(40.dp)) {
        val stroke = Stroke(width = size.minDimension * 0.06f, cap = StrokeCap.Round)
        val body = Size(size.width, size.height * 0.72f)
        val top = Offset(0f, (size.height - body.height) / 2f)

        drawRoundRect(
            color = color,
            topLeft = top,
            size = body,
            cornerRadius = CornerRadius(size.minDimension * 0.08f),
            style = stroke,
        )
        // The flap: two strokes from the top corners meeting in the middle.
        val middle = Offset(size.width / 2f, top.y + body.height * 0.58f)
        drawLine(color, top, middle, strokeWidth = stroke.width, cap = StrokeCap.Round)
        drawLine(
            color,
            Offset(size.width, top.y),
            middle,
            strokeWidth = stroke.width,
            cap = StrokeCap.Round,
        )
    }
}

@Composable
fun VerifyEmailScreen(
    state: VerifyEmailUiState,
    onResend: () -> Unit,
    onChangeEmail: () -> Unit,
    onSignOut: () -> Unit,
    modifier: Modifier = Modifier,
) {
    AuthScaffold(
        modifier = modifier,
        footer = {
            AuthPrimaryButton(
                label = VerifyEmailCopy.RESEND,
                pendingLabel = VerifyEmailCopy.RESENDING,
                onClick = onResend,
                // Nothing to resend to. The screen still explains itself; the button just
                // cannot pretend it can act.
                enabled = !state.email.isNullOrBlank(),
                isSubmitting = state.isResending,
            )
            TextButton(onClick = onSignOut, modifier = Modifier.fillMaxWidth()) {
                Text(VerifyEmailCopy.SIGN_OUT)
            }
        },
    ) {
        Column(
            modifier = Modifier.fillMaxWidth(),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Surface(
                color = MaterialTheme.colorScheme.secondaryContainer,
                contentColor = MaterialTheme.colorScheme.onSecondaryContainer,
                shape = CircleShape,
                modifier = Modifier.size(88.dp),
            ) {
                Box(contentAlignment = Alignment.Center) { EnvelopeGlyph() }
            }

            Text(
                text = VerifyEmailCopy.OVERLINE,
                style = MaterialTheme.typography.labelSmall,
                color = StoryTailBrand.Orange,
            )
            Text(
                text = VerifyEmailCopy.TITLE,
                style = MaterialTheme.typography.headlineMedium,
                color = MaterialTheme.colorScheme.onSurface,
            )
            Text(
                text = buildAnnotatedString {
                    if (state.email.isNullOrBlank()) {
                        append(VerifyEmailCopy.SENT_NO_ADDRESS)
                    } else {
                        append(VerifyEmailCopy.SENT_TO)
                        // Bold, because it is the one thing on the screen somebody needs to
                        // read carefully — a typo here is the whole reason they are stuck.
                        withStyle(SpanStyle(fontWeight = FontWeight.SemiBold)) {
                            append(state.email)
                        }
                        append(".")
                    }
                },
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
            )
        }

        if (state.formError != null) {
            FormErrorCard(
                message = state.formError.message,
                actionLabel = state.formError.action?.label,
            )
        }

        if (state.resent) {
            Text(
                text = VerifyEmailCopy.RESENT,
                style = MaterialTheme.typography.bodySmall,
                color = LocalStoryTailExtended.current.success,
                textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth(),
            )
        }

        AuthNoteCard(title = VerifyEmailCopy.WHY_TITLE, body = VerifyEmailCopy.WHY_BODY)

        TextButton(onClick = onChangeEmail, modifier = Modifier.fillMaxWidth()) {
            Text(VerifyEmailCopy.CHANGE_EMAIL)
        }
    }
}
