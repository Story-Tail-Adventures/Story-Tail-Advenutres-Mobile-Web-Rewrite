// Screen 2.1m.14 Onboarding Complete — see docs/Screen-Inventory.md §2.1.14 (Pattern G,
// §4.4) and design/source-prototype/screens/client-auth-mobile.jsx
// `M2114_OnboardingComplete`. P1.
package com.storytail.adventures.ui.screens.onboarding

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.unit.dp
import com.storytail.adventures.domain.onboarding.CompletionSummary
import com.storytail.adventures.domain.onboarding.completionChecklist
import com.storytail.adventures.domain.onboarding.completionSubtitle
import com.storytail.adventures.ui.components.AuthPrimaryButton
import com.storytail.adventures.ui.components.CheckMark
import com.storytail.adventures.ui.components.AuthScaffold
import com.storytail.adventures.ui.components.FormErrorCard
import com.storytail.adventures.ui.theme.LocalStoryTailExtended
import com.storytail.adventures.ui.theme.StoryTailBrand

/**
 * NO WIZARD CHROME, which is what the artboard has and is the point of the screen: the
 * progress pill is a progress indicator, and there is no longer any progress to indicate.
 * Keeping it would make an arrival read as one more step. This is the only wizard screen
 * that does not use [OnboardingScaffold].
 *
 * WHAT IT SAYS IS ASSEMBLED, not fixed. The prototype's subtitle is "Your profile,
 * preferences, household, and existing trip with Sandals are all linked up" — true of the
 * artboard and of nobody else. Every step here was skippable, so the traveler most likely to
 * reach this screen having skipped things is exactly the one that sentence would mislead.
 * The checklist names what was skipped, in words rather than only a colour.
 */
private object CompleteCopy {
    const val OVERLINE = "YOU'RE ALL SET"
    const val TITLE_PREFIX = "That's everything"
    const val CHECKLIST = "What we set up"
    const val PRIMARY = "Continue to my trips"
    const val PENDING = "Opening your dashboard…"
}

@Composable
fun CompleteScreen(
    state: OnboardingUiState,
    /** What the earlier steps actually saved, or null while the reads are in flight. */
    summary: CompletionSummary?,
    onFinish: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val firstName = summary?.firstName
    val checklist = summary?.let { completionChecklist(it) }.orEmpty()
    val extended = LocalStoryTailExtended.current

    AuthScaffold(
        modifier = modifier,
        showWordmark = true,
        footer = {
            AuthPrimaryButton(
                label = CompleteCopy.PRIMARY,
                pendingLabel = CompleteCopy.PENDING,
                onClick = onFinish,
                enabled = !state.isSaving,
                isSubmitting = state.isSaving,
            )
        },
    ) {
        Surface(
            color = extended.successContainer,
            contentColor = extended.success,
            shape = CircleShape,
            modifier = Modifier.size(72.dp),
        ) {
            // Decorative: "YOU'RE ALL SET" is right underneath it.
            Box(Modifier.clearAndSetSemantics {}, contentAlignment = Alignment.Center) {
                CheckMark(size = 36.dp, color = extended.success)
            }
        }

        Text(
            text = CompleteCopy.OVERLINE,
            style = MaterialTheme.typography.labelSmall,
            color = StoryTailBrand.Orange,
        )
        Text(
            text = if (firstName != null) "${CompleteCopy.TITLE_PREFIX}, $firstName."
                   else "${CompleteCopy.TITLE_PREFIX}.",
            style = MaterialTheme.typography.headlineMedium,
            color = MaterialTheme.colorScheme.onSurface,
        )
        // Held back until the reads answer. An unread summary looks exactly like an empty
        // one, and "nothing to save yet" is the worst thing to flash at somebody who just
        // filled in all three steps.
        if (summary != null) {
            Text(
                text = completionSubtitle(summary),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }

        if (state.formError != null) FormErrorCard(message = state.formError)

        // The heading only when there is a list under it. A section title over empty space
        // reads as something that failed to load.
        if (checklist.isNotEmpty()) {
            Text(
                text = CompleteCopy.CHECKLIST,
                style = MaterialTheme.typography.titleSmall,
                color = MaterialTheme.colorScheme.onSurface,
                modifier = Modifier.padding(top = 6.dp),
            )
        }
        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            checklist.forEach { line ->
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Surface(
                        color = if (line.done) extended.success else extended.surface3,
                        shape = CircleShape,
                        modifier = Modifier.size(18.dp),
                    ) {
                        if (line.done) {
                            Box(Modifier, contentAlignment = Alignment.Center) {
                                CheckMark(
                                    size = 12.dp,
                                    color = MaterialTheme.colorScheme.surface,
                                    strokeWidth = 2.dp,
                                )
                            }
                        }
                    }
                    // The done state is in the colour, which is decoration — so it is also
                    // in the text. The skipped labels say "skipped" in words.
                    Text(
                        text = line.label,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
    }
}
