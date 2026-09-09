// Screen 2.1m.9 Welcome / First Login — see docs/Screen-Inventory.md §2.1.9 (Pattern G,
// §4.4) and design/source-prototype/screens/client-auth-mobile.jsx `M219_Welcome`. P1.
package com.storytail.adventures.ui.screens.onboarding

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.storytail.adventures.domain.onboarding.WizardStep
import com.storytail.adventures.ui.components.AuthPrimaryButton
import com.storytail.adventures.ui.components.FormErrorCard
import com.storytail.adventures.ui.components.OnboardingScaffold

/**
 * Copy from `M219_Welcome`, with the web twin's reasoning carried over: the mobile artboard
 * shows FOUR cards where the desktop one shows five, and the one it drops — "Explore on your
 * time" — is also the least true of the five today, since self-guided search is Phase 2.
 */
private object WelcomeCopy {
    const val OVERLINE = "WELCOME · REST WELL"
    const val TITLE_PREFIX = "So glad you're here"
    const val SUB = "Here's to a year of trips worth telling — and rest worth taking. — Gyasi"
    const val SECTION = "Here's what your portal will do for you:"
    const val PRIMARY = "Get started"
    const val PENDING = "One moment…"
    const val SKIP = "Skip the tour"
}

private data class WelcomeCard(val title: String, val body: String)

private val WELCOME_CARDS = listOf(
    WelcomeCard(
        "Your trips, always here",
        "Your itinerary stays current as things firm up, and you can download it as a PDF " +
            "to carry with you.",
    ),
    WelcomeCard(
        "Securely authorize cards",
        // BRD §10.5: the agency is contractually barred from charging planning fees, and
        // this is the thing travelers most need to hear — said in a way that does not imply
        // we hold the card ourselves.
        "Your card stays with Stripe, not in our database. It pays the resort or cruise " +
            "line directly — and there's never a planning fee from us.",
    ),
    WelcomeCard(
        "Talk to me anytime",
        "Messages threaded by trip, so nothing gets lost in your inbox. We'll email you " +
            "when something changes.",
    ),
    WelcomeCard(
        "Documents in one place",
        "Passports, visas and insurance, kept alongside the trip they belong to.",
    ),
)

@Composable
fun WelcomeScreen(
    state: OnboardingUiState,
    firstName: String?,
    onStart: () -> Unit,
    onSkip: () -> Unit,
    modifier: Modifier = Modifier,
) {
    OnboardingScaffold(
        step = WizardStep.WELCOME,
        // `handle_new_user()` writes the literal 'New' when a sign-up carried no name
        // claims — Apple sends none after the first authorization. Greeting somebody as
        // "New" is worse than greeting them as nobody in particular.
        title = if (firstName != null) "${WelcomeCopy.TITLE_PREFIX}, $firstName." 
                else "${WelcomeCopy.TITLE_PREFIX}.",
        sub = WelcomeCopy.SUB,
        overline = WelcomeCopy.OVERLINE,
        modifier = modifier,
        footer = {
            AuthPrimaryButton(
                label = WelcomeCopy.PRIMARY,
                pendingLabel = WelcomeCopy.PENDING,
                onClick = onStart,
                enabled = !state.isSaving && !state.isSkipping,
                isSubmitting = state.isSaving,
            )
            TextButton(onClick = onSkip, modifier = Modifier.fillMaxWidth()) {
                Text(WelcomeCopy.SKIP)
            }
        },
    ) {
        if (state.formError != null) FormErrorCard(message = state.formError)

        Text(
            text = WelcomeCopy.SECTION,
            style = MaterialTheme.typography.titleMedium,
            color = MaterialTheme.colorScheme.onSurface,
            modifier = Modifier.padding(top = 4.dp),
        )

        WELCOME_CARDS.forEach { card ->
            Surface(
                color = MaterialTheme.colorScheme.surfaceVariant,
                contentColor = MaterialTheme.colorScheme.onSurfaceVariant,
                shape = MaterialTheme.shapes.medium,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Column(
                    Modifier.padding(14.dp),
                    verticalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    Text(
                        text = card.title,
                        style = MaterialTheme.typography.titleSmall,
                        color = MaterialTheme.colorScheme.onSurface,
                    )
                    Text(text = card.body, style = MaterialTheme.typography.bodySmall)
                }
            }
        }
    }
}
