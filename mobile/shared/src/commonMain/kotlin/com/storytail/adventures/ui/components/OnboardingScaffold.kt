package com.storytail.adventures.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.unit.dp
import com.storytail.adventures.domain.onboarding.WizardStep
import com.storytail.adventures.ui.theme.LocalStoryTailExtended
import com.storytail.adventures.ui.theme.StoryTailBrand

/**
 * The chrome every onboarding step wears — `MOnboardShell` in
 * design/source-prototype/screens/client-auth-mobile.jsx.
 *
 * The desktop twin puts a 280px rail of named steps down the left; a phone has no room for
 * it and shows six progress bars under an overline instead. Both read the same
 * [WizardStep] list, so a step added to one is added to the other.
 */
@Composable
fun OnboardingScaffold(
    step: WizardStep,
    title: String,
    modifier: Modifier = Modifier,
    sub: String? = null,
    /**
     * Replaces the numbered step pill entirely.
     *
     * Welcome is the one step that needs this. It is defined by the ABSENCE of progress —
     * nothing has been saved and no cursor has been written — so "STEP 01 OF 06" claims
     * something that has not happened, and the gold overline Design-System §2.4 asks this
     * screen to carry gets displaced by wizard chrome to say it.
     */
    overline: String? = null,
    footer: (@Composable ColumnScope.() -> Unit)? = null,
    content: @Composable ColumnScope.() -> Unit,
) {
    AuthScaffold(modifier = modifier, footer = footer) {
        if (overline != null) {
            Text(
                text = overline,
                style = MaterialTheme.typography.labelSmall,
                color = StoryTailBrand.Orange,
                modifier = Modifier.fillMaxWidth(),
            )
        } else {
            StepPill(step)
        }
        Text(
            text = title,
            style = MaterialTheme.typography.headlineMedium,
            color = MaterialTheme.colorScheme.onSurface,
        )
        if (sub != null) {
            Text(
                text = sub,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        content()
    }
}

/** `MStepPill`: the overline names the step, the bars show how far along it is. */
@Composable
private fun StepPill(step: WizardStep, modifier: Modifier = Modifier) {
    val extended = LocalStoryTailExtended.current

    Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(
            text = "${step.overline} · ${step.pillLabel.uppercase()}",
            style = MaterialTheme.typography.labelSmall,
            color = StoryTailBrand.Orange,
        )
        Row(
            horizontalArrangement = Arrangement.spacedBy(4.dp),
            // Decoration: the overline above already says which step this is and how many
            // there are, so six unlabelled bars would be six announcements of nothing.
            modifier = Modifier.clearAndSetSemantics {},
        ) {
            WizardStep.entries.forEach { bar ->
                Box(
                    Modifier
                        .weight(1f)
                        .height(4.dp)
                        .background(
                            color = when {
                                bar.ordinal < step.ordinal -> extended.success
                                bar == step -> MaterialTheme.colorScheme.primary
                                else -> extended.surface3
                            },
                            shape = RoundedCornerShape(2.dp),
                        ),
                )
            }
        }
    }
}
