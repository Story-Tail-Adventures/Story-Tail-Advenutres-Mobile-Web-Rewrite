// Screen 2.0.2 About / How It Works — see docs/Screen-Inventory.md §2.0.2 and §4.4
// (Pattern I; the FAQ is an accordion on mobile) and
// design/source-prototype/screens/client-public-mobile.jsx (M202_About). P2.
//
// Stateless: the page is copy and two exits, so there is nothing here to hold. The only
// state on the screen belongs to FaqAccordion, which keeps its own.
package com.storytail.adventures.ui.screens.public

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.consumeWindowInsets
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import com.storytail.adventures.content.public.PublicCatalog
import com.storytail.adventures.content.public.PublicContent
import com.storytail.adventures.ui.components.public.FaqAccordion
import com.storytail.adventures.ui.components.public.PlaceholderBanner
import com.storytail.adventures.ui.components.public.PublicCard
import com.storytail.adventures.ui.components.public.PublicScaffold
import com.storytail.adventures.ui.components.public.PublicStickyCta
import com.storytail.adventures.ui.components.public.PublicTapTarget
import com.storytail.adventures.ui.components.public.PublicTopBar
import com.storytail.adventures.ui.components.public.SectionHeading
import com.storytail.adventures.ui.components.public.SectionLabel
import com.storytail.adventures.ui.theme.LocalStoryTailBrandTypography
import com.storytail.adventures.ui.theme.LocalStoryTailExtended
import com.storytail.adventures.ui.theme.PillShape
import com.storytail.adventures.ui.theme.StoryTailBrand

/**
 * The three steps, in the mobile artboard's words.
 *
 * Step one says "Tell me" where M202 says "Tell Gyasi": the other two steps are already
 * first person ("I book through suppliers"), and the web twin makes the same correction in
 * web/app/(public)/(plain)/how-it-works/content.ts. One page, one voice.
 */
private data class Step(val title: String, val body: String)

private val STEPS = listOf(
    Step(
        title = "Ask",
        body = "Tell me what you're craving — beach week, family cruise, honeymoon.",
    ),
    Step(
        title = "Plan together",
        body = "A curated proposal: real options, real prices, honest takes — never a " +
            "search dump.",
    ),
    Step(
        title = "Go rest",
        body = "I book through suppliers, watch the details, and let you receive the rest " +
            "you came for.",
    ),
)

/**
 * Screen 2.0.2.
 *
 * [onBack] is both the top bar's back arrow and the sticky bar's "Skip" — the artboard's
 * label, and it means the same thing on a page reached from 2.0.1's "Take a quick tour":
 * leave the explainer, keep the app.
 *
 * [onMessageGyasi] is §2.0.2's "contact agent" key action. The artboard leaves it nowhere
 * to go on mobile, so it sits under Gyasi's card, where the reader has just learned who
 * they would be writing to.
 */
@Composable
fun HowItWorksScreen(
    onCreateAccount: () -> Unit,
    onMessageGyasi: () -> Unit,
    onMenu: () -> Unit,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
) {
    PublicScaffold(
        modifier = modifier,
        topBar = {
            Column {
                PlaceholderBanner()
                PublicTopBar(
                    onMenu = onMenu,
                    onBack = onBack,
                    // Solid bar, not the on-photo variant: this screen opens on words, not
                    // a hero. The banner above already paid the status-bar inset so its
                    // warning colour reaches the top of the screen; without consuming it
                    // here the bar pays it a second time and leaves a dead band under the
                    // banner. With no banner, the bar keeps the inset for itself.
                    modifier = if (PublicContent.hasUnverifiedClaims) {
                        Modifier.consumeWindowInsets(WindowInsets.statusBars)
                    } else {
                        Modifier
                    },
                )
            }
        },
        stickyCta = {
            PublicStickyCta(
                primaryLabel = "Create an account",
                onPrimary = onCreateAccount,
                secondaryLabel = "Skip",
                onSecondary = onBack,
            )
        },
    ) {
        // Padded here rather than through PublicScaffold's contentPadding, which would also
        // inset PublicFooter — and the footer is a full-bleed band.
        Column(
            modifier = Modifier
                .padding(horizontal = 22.dp)
                .padding(top = 20.dp, bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(20.dp),
        ) {
            PageHeader()
            StepCards()
            HeartPanel()
            AdvisorBio(onMessageGyasi = onMessageGyasi)
            Faq()
        }
    }
}

@Composable
private fun PageHeader() {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        SectionLabel("HOW STORY-TAIL WORKS")
        Text(
            text = "You ask. We plan. You rest.",
            style = MaterialTheme.typography.headlineMedium,
            color = MaterialTheme.colorScheme.onSurface,
            modifier = Modifier.semantics { heading() },
        )
        // Two departures from M202's lead, both deliberate. "90 seconds" is what §2.0.2 and
        // the web twin promise, and this page carries the heart panel and four FAQ rows —
        // 60 is a promise the page does not keep. "No planning fees, ever" is the precise
        // claim (BRD §10.5, and the footer's own words); a flat "No fees" reads like the
        // trip itself is free, which is not a thing we can say.
        Text(
            text = "Under 90 seconds of reading — promise. No planning fees, ever. We " +
                "exist so you can take the rest you were made for.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun StepCards() {
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        STEPS.forEachIndexed { index, step ->
            PublicCard {
                Column(
                    modifier = Modifier.padding(14.dp),
                    verticalArrangement = Arrangement.spacedBy(2.dp),
                ) {
                    SectionLabel("STEP 0${index + 1}")
                    Text(
                        text = step.title,
                        style = MaterialTheme.typography.titleSmall,
                        color = MaterialTheme.colorScheme.onSurface,
                    )
                    Text(
                        text = step.body,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
    }
}

/**
 * "Our heart" — the one band on the public surface where Design System §2.4 says the
 * worldview is stated outright rather than left to show through.
 *
 * The §2.5 welcome line at the foot of the panel is not decoration: it is what keeps the
 * band an explanation of where the care comes from rather than a condition on receiving it.
 */
@Composable
private fun HeartPanel() {
    val extended = LocalStoryTailExtended.current

    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = MaterialTheme.shapes.large,
        color = Color.Transparent,
    ) {
        Column(
            modifier = Modifier
                .background(
                    // The artboard's 135° surface-2 → primary-container wash. Both ends are
                    // scheme tokens, so the panel warms to burgundy in light and to ocean
                    // blue in dark instead of carrying one scheme's colour into the other.
                    Brush.linearGradient(
                        listOf(extended.surface2, MaterialTheme.colorScheme.primaryContainer),
                    ),
                )
                .padding(18.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            SectionHeading(
                label = "OUR HEART",
                title = "Vacation is rest. The world is good.",
                sub = "Two beliefs behind every trip we plan.",
            )
            Pillar(
                number = "01",
                title = "Rest is a command, not a luxury.",
                body = "God called the seventh day holy. Vacation isn't escape — it's " +
                    "obedience to a kind invitation.",
                quote = "\"Come to me, all who are weary.\"",
                reference = "MATT 11:28",
            )
            Pillar(
                number = "02",
                title = "Creation is a gift, meant to be enjoyed.",
                body = "The reef, the trade wind, the warm rain — He called it very good. " +
                    "We help you receive it.",
                quote = "\"It was very good.\"",
                reference = "GEN 1:31",
            )
            WelcomeNote()
        }
    }
}

@Composable
private fun Pillar(
    number: String,
    title: String,
    body: String,
    quote: String,
    reference: String,
) {
    val brandType = LocalStoryTailBrandTypography.current

    PublicCard {
        Column(
            modifier = Modifier.padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            SectionLabel(number)
            Text(
                text = title,
                style = MaterialTheme.typography.titleSmall,
                color = MaterialTheme.colorScheme.onSurface,
            )
            Text(
                text = body,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.Bottom,
            ) {
                Text(
                    text = quote,
                    // The artboard sets this line in --brand-burgundy. Burgundy is the light
                    // scheme's primary and the dark scheme swaps it for ocean blue, so the
                    // scheme token is what keeps the verse legible on a navy card instead of
                    // disappearing into it.
                    style = brandType.script.copy(
                        fontSize = MaterialTheme.typography.titleMedium.fontSize,
                    ),
                    color = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.weight(1f),
                )
                Text(
                    text = reference,
                    style = brandType.labelXS,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
private fun WelcomeNote() {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        color = LocalStoryTailExtended.current.surface1,
        shape = MaterialTheme.shapes.medium,
    ) {
        Text(
            text = buildAnnotatedString {
                withStyle(
                    SpanStyle(
                        color = MaterialTheme.colorScheme.onSurface,
                        fontWeight = FontWeight.SemiBold,
                    ),
                ) {
                    append("Whatever your faith — you're welcome here.")
                }
                append(" This is just where our hands come from.")
            },
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(12.dp),
        )
    }
}

/**
 * Gyasi's card: image-left row, as M202 draws it.
 *
 * The portrait is an initials badge rather than a PublicPhoto gradient — the same call the
 * web AdvisorCard made. A tinted rectangle standing in for a beach is a placeholder; a
 * tinted rectangle standing in for a person's face is a stranger.
 */
@Composable
private fun AdvisorBio(onMessageGyasi: () -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Surface(
            modifier = Modifier.fillMaxWidth(),
            color = LocalStoryTailExtended.current.surface2,
            shape = MaterialTheme.shapes.large,
        ) {
            Row(
                modifier = Modifier.padding(16.dp),
                horizontalArrangement = Arrangement.spacedBy(14.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Surface(
                    modifier = Modifier.size(60.dp),
                    shape = PillShape,
                    color = MaterialTheme.colorScheme.primaryContainer,
                    contentColor = MaterialTheme.colorScheme.onPrimaryContainer,
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Text("GS", style = MaterialTheme.typography.titleMedium)
                    }
                }
                Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Text(
                        text = "Meet Gyasi Story",
                        style = MaterialTheme.typography.titleSmall,
                        color = MaterialTheme.colorScheme.onSurface,
                    )
                    Text(
                        text = "Caribbean specialist · Inteletravel",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    AdvisorStats()
                }
            }
        }
        OutlinedButton(
            onClick = onMessageGyasi,
            shape = PillShape,
            modifier = Modifier.fillMaxWidth().heightIn(min = PublicTapTarget),
        ) {
            Text("Message Gyasi without an account")
        }
    }
}

@Composable
private fun AdvisorStats() {
    val rating = claim("ratingValue")
    val travelers = claim("travelersServed")
    val line = listOfNotNull(
        rating?.let { "$it rating" },
        travelers?.let { "$it travelers" },
    ).joinToString(" · ")
    if (line.isEmpty()) return

    Row(
        horizontalArrangement = Arrangement.spacedBy(5.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (rating != null) {
            Text(
                text = "★",
                style = MaterialTheme.typography.labelMedium,
                color = StoryTailBrand.Sunset,
                // Drawn as a glyph because no icon set is bundled — the same reason
                // PublicTopBar builds its menu control out of three boxes — and hidden from
                // the screen reader, which would otherwise announce "black star" ahead of
                // the number it decorates.
                modifier = Modifier.clearAndSetSemantics {},
            )
        }
        Text(
            text = line,
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun Faq() {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(
            text = "FAQ",
            style = MaterialTheme.typography.titleLarge,
            color = MaterialTheme.colorScheme.onSurface,
            modifier = Modifier.semantics { heading() },
        )
        PublicCard {
            FaqAccordion(
                items = PublicCatalog.HOW_IT_WORKS_FAQ,
                modifier = Modifier.padding(horizontal = 14.dp),
            )
        }
    }
}

/**
 * A figure from the claims registry, by id.
 *
 * Read rather than typed in, because every one of these is unverified (Claim.verified is
 * false for all of them today) and PlaceholderBanner is what says so. A "4.9" inlined into
 * this screen would outlive the banner and quietly become an assertion nobody checked.
 * Null when the id is absent, so a regenerated catalog that drops a claim removes the
 * figure instead of crashing the page.
 */
private fun claim(id: String): String? =
    PublicCatalog.CLAIMS.firstOrNull { it.id == id }?.display
