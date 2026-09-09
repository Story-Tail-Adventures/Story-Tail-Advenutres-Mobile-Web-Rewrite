// Screen 2.0.11 About Gyasi — see docs/Screen-Inventory.md §2.0.11 and its §4.4 mapping
// (Pattern H with Pattern I reading widths; on mobile the page stacks, the portrait becomes a
// round badge, the testimonials become a horizontal snap strip, and the CTAs move to the
// sticky bar), plus design/source-prototype/screens/client-public-mobile.jsx (M2011_AboutGyasi).
//
// Copy follows the web page (web/app/(public)/(hero)/about/content.ts), which is the longer,
// edited version of the artboard's text.
//
// Two places this screen deliberately does not follow the prototype:
//
//  - The prototype's bio says "mom of three" and its testimonials say "she". Gyasi is he/him.
//    The claims registry is where that was corrected, so every figure and every biographical
//    phrase here is READ from PublicCatalog rather than typed from the JSX.
//  - The prototype prints three testimonials. Publishing an endorsement the person has not
//    permitted is unlawful for a US business (16 CFR Part 465), so only consented quotes are
//    rendered — see TestimonialsBand.
package com.storytail.adventures.ui.screens.public

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.snapping.rememberSnapFlingBehavior
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.consumeWindowInsets
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.VerticalDivider
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import com.storytail.adventures.content.public.Claim
import com.storytail.adventures.content.public.PublicCatalog
import com.storytail.adventures.content.public.PublicContent
import com.storytail.adventures.content.public.Testimonial
import com.storytail.adventures.ui.components.public.ClosingCta
import com.storytail.adventures.ui.components.public.FaqAccordion
import com.storytail.adventures.ui.components.public.PlaceholderBanner
import com.storytail.adventures.ui.components.public.PublicCard
import com.storytail.adventures.ui.components.public.PublicScaffold
import com.storytail.adventures.ui.components.public.PublicStickyCta
import com.storytail.adventures.ui.components.public.PublicTopBar
import com.storytail.adventures.ui.components.public.SectionHeading
import com.storytail.adventures.ui.theme.LocalStoryTailBrandTypography
import com.storytail.adventures.ui.theme.LocalStoryTailExtended
import com.storytail.adventures.ui.theme.PillShape
import com.storytail.adventures.ui.theme.StoryTailBrand

/** The artboard's 22px page inset. Bands carry it themselves so the strip can bleed past it. */
private val PageGutter = 22.dp

/** M2011 draws the portrait at 200 and hangs it off the corner; §4.4 makes it a round badge. */
private val AdvisorBadgeSize = 200.dp

/**
 * 2.0.11, mobile.
 *
 * Stateless: nothing on this page is editable, the FAQ rows own their own expansion, and the
 * two actions belong to the caller. Everything else is read from the generated public catalog.
 */
@Composable
fun AboutGyasiScreen(
    onRequestQuote: () -> Unit,
    onMessageGyasi: () -> Unit,
    onMenu: () -> Unit,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
) {
    PublicScaffold(
        modifier = modifier,
        // Pinned above the scroll rather than dropped into it. The stats strip and the
        // credentials are the two blocks a reader is most likely to take as fact, and they sit
        // a screen apart — a banner that scrolls away stops covering the second one.
        topBar = { PlaceholderBanner() },
        stickyCta = {
            PublicStickyCta(
                primaryLabel = "Request a quote",
                onPrimary = onRequestQuote,
                secondaryLabel = "Message me",
                onSecondary = onMessageGyasi,
            )
        },
    ) {
        AdvisorHero(onMenu = onMenu, onBack = onBack)
        StatsStrip(advisorStats())

        Column(
            modifier = Modifier.padding(top = 20.dp, bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(22.dp),
        ) {
            StoryBand(Modifier.padding(horizontal = PageGutter))
            CredentialsBand(Modifier.padding(horizontal = PageGutter))
            TestimonialsBand()
            FaqBand(Modifier.padding(horizontal = PageGutter))
            ClosingCta(
                title = "Let's start with a conversation.",
                body = "No account, no commitment — just tell me what you're dreaming about " +
                    "and I'll come back with three real options.",
                primaryLabel = "Request a quote",
                onPrimary = onRequestQuote,
                secondaryLabel = "Message Gyasi",
                onSecondary = onMessageGyasi,
                modifier = Modifier.padding(horizontal = PageGutter),
            )
        }
    }
}

/**
 * The gradient hero.
 *
 * Not [com.storytail.adventures.ui.components.public.PublicHero]: that one scrims a
 * photograph, and this hero has none to scrim. There is no picture of Gyasi in the app and
 * there is not meant to be one yet (PublicPhoto explains why nothing is bundled), so the
 * artboard's burgundy ramp is drawn directly and the portrait is an initials badge.
 *
 * Everything on it is white or sunset gold over brand colours, so it reads identically in both
 * schemes — the same construction PublicHero uses.
 */
@Composable
private fun AdvisorHero(onMenu: () -> Unit, onBack: () -> Unit) {
    val brandType = LocalStoryTailBrandTypography.current
    // The banner above the scroll has already cleared the notch. Compose does not consume
    // insets between siblings, so without this the floating top bar reserves the status bar a
    // second time and the page opens on a band of empty gradient. Once every claim is verified
    // the banner stops rendering and the top bar goes back to clearing the notch itself.
    val notchAlreadyCleared = PublicContent.hasUnverifiedClaims

    Box(
        Modifier
            .fillMaxWidth()
            .heightIn(min = 380.dp)
            .then(
                if (notchAlreadyCleared) Modifier.consumeWindowInsets(WindowInsets.statusBars)
                else Modifier,
            )
            .background(
                Brush.linearGradient(
                    // M2011's 160° ramp. Its orange stop sits at 130%, so the bottom corner
                    // never reaches full orange — hence the blend rather than a third flat
                    // stop, which would put a hot orange corner under white body copy.
                    0f to StoryTailBrand.BurgundyDark,
                    0.55f to StoryTailBrand.Burgundy,
                    1f to lerp(StoryTailBrand.Burgundy, StoryTailBrand.Orange, 0.62f),
                ),
            )
            // The badge overhangs the bottom-right corner on the artboard.
            .clipToBounds(),
    ) {
        Column {
            // The artboard has no back control — it is one of eleven pages in a flat public
            // surface. The phone build takes one anyway: the menu is otherwise the only way
            // out, and a page reached from another page's footer should be reversible.
            PublicTopBar(onMenu = onMenu, onPhoto = true, onBack = onBack)

            Column(
                modifier = Modifier.padding(
                    start = PageGutter,
                    end = PageGutter,
                    top = 18.dp,
                    // Clears the badge, which the artboard also writes around rather than over.
                    bottom = AdvisorBadgeSize,
                ),
                verticalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                Text(
                    text = "YOUR ADVISOR",
                    style = MaterialTheme.typography.labelSmall,
                    color = StoryTailBrand.Sunset,
                )
                Text(
                    // One line, two faces: the artboard breaks the headline mid-sentence into
                    // the script, so this is an annotated string rather than two stacked Texts.
                    text = buildAnnotatedString {
                        append("Hi, I'm ")
                        withStyle(
                            SpanStyle(
                                fontFamily = brandType.script.fontFamily,
                                fontWeight = brandType.script.fontWeight,
                                fontSize = MaterialTheme.typography.displaySmall.fontSize,
                                color = StoryTailBrand.Sunset,
                            ),
                        ) {
                            append("Gyasi.")
                        }
                    },
                    style = MaterialTheme.typography.headlineMedium,
                    color = Color.White,
                    modifier = Modifier.semantics { heading() },
                )
                Text(
                    text = advisorHeroLine(),
                    style = MaterialTheme.typography.bodySmall,
                    color = Color.White.copy(alpha = 0.92f),
                )
            }
        }

        AdvisorBadge(Modifier.align(Alignment.BottomEnd).offset(x = 10.dp, y = 10.dp))
    }
}

/** Gyasi's initials, standing in for the portrait until there is a photograph to bundle. */
@Composable
private fun AdvisorBadge(modifier: Modifier = Modifier) {
    Surface(
        // "GS" read out after "Hi, I'm Gyasi." is noise — the heading already said whose page
        // this is, and the artboard treats the mobile portrait as decoration too.
        modifier = modifier.size(AdvisorBadgeSize).clearAndSetSemantics { },
        shape = PillShape,
        color = StoryTailBrand.BurgundyDark,
        border = BorderStroke(4.dp, Color.White.copy(alpha = 0.40f)),
    ) {
        Box(contentAlignment = Alignment.Center) {
            Text(
                // web/content/public/proof.ts carries ADVISOR.initials; the generator does not
                // emit that record to Kotlin yet, so this is the one place it is repeated.
                text = "GS",
                style = MaterialTheme.typography.displaySmall,
                fontWeight = FontWeight.Bold,
                color = Color.White,
            )
        }
    }
}

/** The four-up band under the hero. */
@Composable
private fun StatsStrip(stats: List<AdvisorStat>) {
    if (stats.isEmpty()) return

    Surface(modifier = Modifier.fillMaxWidth(), color = LocalStoryTailExtended.current.surface1) {
        Column {
            // IntrinsicSize.Min so the dividers take the tallest tile's height; a divider has
            // none of its own and would otherwise collapse to nothing.
            Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min)) {
                stats.forEachIndexed { index, stat ->
                    if (index > 0) {
                        VerticalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                    }
                    Column(
                        modifier = Modifier
                            .weight(1f)
                            .padding(horizontal = 6.dp, vertical = 14.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(4.dp),
                    ) {
                        Text(
                            text = stat.value,
                            style = MaterialTheme.typography.titleLarge,
                            // colorScheme.primary, not the artboard's raw burgundy: the dark
                            // scheme is a tropical rebrand, and burgundy on deep navy is
                            // unreadable. The web page made the same swap.
                            color = MaterialTheme.colorScheme.primary,
                        )
                        Text(
                            text = stat.label,
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            textAlign = TextAlign.Center,
                        )
                    }
                }
            }
            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
        }
    }
}

/** The bio, signed in the script face. */
@Composable
private fun StoryBand(modifier: Modifier = Modifier) {
    val brandType = LocalStoryTailBrandTypography.current

    Column(modifier, verticalArrangement = Arrangement.spacedBy(10.dp)) {
        SectionHeading(label = "THE STORY", title = "How Story-Tail started.")

        Text(
            text = buildAnnotatedString {
                append(
                    "I started planning trips for friends in ${claimText("bioStarted")} because " +
                        "they kept asking. I'd done enough Caribbean weeks of my own to know " +
                        "which resorts were worth it and which were paying for good Google ads. " +
                        "By ${claimText("bioNamed")} the side-thing had a name — ",
                )
                withStyle(SpanStyle(fontStyle = FontStyle.Italic)) {
                    append("Story-Tail Adventures")
                }
                append(" — and a backlog.")
            },
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurface,
        )
        Text(
            text = "I'm hosted by Inteletravel, which means you get my care plus an " +
                "IATA-accredited host agency behind every booking. I earn commission from " +
                "suppliers — never a fee from you.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurface,
        )
        Text(
            text = "My belief about all this is simple: vacation isn't an escape from your " +
                "life, it's a gift. The world is good. Rest is good. My job is to remove " +
                "enough friction that you can actually receive both.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurface,
        )
        Text(
            text = "— Gyasi",
            style = brandType.script.copy(
                fontSize = MaterialTheme.typography.headlineSmall.fontSize,
            ),
            // colorScheme.primary for the same reason as the stats: the artboard signs in
            // burgundy, which the dark scheme's navy surfaces swallow.
            color = MaterialTheme.colorScheme.primary,
        )
    }
}

/**
 * The credentials list.
 *
 * Each row's registry `detail` ("IATA-accredited host agency · Full supplier access" and
 * friends) is deliberately not shown: M2011 and the web page below its `md` breakpoint both
 * print the credential alone, and four two-line rows push the FAQ off a phone's second screen.
 */
@Composable
private fun CredentialsBand(modifier: Modifier = Modifier) {
    val credentials = listOfNotNull(
        claimOf("credInteletravel"),
        claimOf("credClia"),
        claimOf("credSandals"),
        claimOf("credRoyal"),
    )
    if (credentials.isEmpty()) return

    Column(modifier, verticalArrangement = Arrangement.spacedBy(10.dp)) {
        // "hosted", not the prototype's "audited": Inteletravel hosts Story-Tail, it does not
        // audit it, and saying otherwise would be a claim nobody could stand behind.
        SectionHeading(label = "CREDENTIALS", title = "Trained, certified, hosted.")
        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            credentials.forEach { credential -> CredentialRow(credential) }
        }
    }
}

@Composable
private fun CredentialRow(credential: Claim) {
    PublicCard {
        Row(
            modifier = Modifier.padding(horizontal = 14.dp, vertical = 12.dp),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                // The artboard's shield glyph. No icon set is bundled yet — PublicTopBar draws
                // its own hamburger out of three boxes for the same reason — and a check reads
                // as "certified" without one.
                text = "✓",
                style = MaterialTheme.typography.titleSmall,
                color = MaterialTheme.colorScheme.secondary,
                modifier = Modifier.clearAndSetSemantics { },
            )
            Text(
                text = credential.display,
                style = MaterialTheme.typography.titleSmall,
                color = MaterialTheme.colorScheme.onSurface,
            )
        }
    }
}

/**
 * The quotes, as §4.4's horizontal snap strip.
 *
 * 16 CFR Part 465 makes publishing an endorsement the person has not permitted unlawful for a
 * US business, so only `consented` quotes are rendered. Every quote in the registry is a
 * prototype placeholder with `consented = false`, which is why this band is absent from the
 * running app today and the page reads story → credentials → FAQ. One real, permissioned quote
 * landing in web/content/public/proof.ts brings it back with no change here.
 */
@Composable
private fun TestimonialsBand() {
    val quotes = PublicCatalog.TESTIMONIALS.filter { it.consented }
    if (quotes.isEmpty()) return

    val strip = rememberLazyListState()

    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        SectionHeading(
            label = "WHAT TRAVELERS SAY",
            // The web title counts them ("Six unedited notes."), which stops being true the
            // moment consent filtering removes one.
            title = "In their words.",
            modifier = Modifier.padding(horizontal = PageGutter),
        )
        LazyRow(
            state = strip,
            // Without snapping a free fling leaves a card half off the edge, which reads as a
            // rendering fault rather than as "there is more".
            flingBehavior = rememberSnapFlingBehavior(strip),
            contentPadding = PaddingValues(horizontal = PageGutter),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            items(quotes, key = { it.who }) { quote -> TestimonialCard(quote) }
        }
    }
}

@Composable
private fun TestimonialCard(testimonial: Testimonial) {
    val brandType = LocalStoryTailBrandTypography.current

    PublicCard(Modifier.width(280.dp)) {
        Column(
            modifier = Modifier.padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Text(
                text = "“",
                style = brandType.script,
                color = StoryTailBrand.Orange,
                // Decoration. A lone quote mark announced before the quote adds nothing the
                // sentence after it does not already carry.
                modifier = Modifier.clearAndSetSemantics { },
            )
            Text(
                text = testimonial.quote,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurface,
            )
            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
            Row(
                horizontalArrangement = Arrangement.spacedBy(10.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                InitialsAvatar(testimonial.initials)
                Column {
                    Text(
                        text = testimonial.who,
                        style = MaterialTheme.typography.labelLarge,
                        fontWeight = FontWeight.SemiBold,
                        color = MaterialTheme.colorScheme.onSurface,
                    )
                    Text(
                        text = testimonial.trip,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
    }
}

/** Initials rather than a face: the app bundles no photography of anyone, travelers included. */
@Composable
private fun InitialsAvatar(initials: String) {
    Surface(
        modifier = Modifier.size(30.dp).clearAndSetSemantics { },
        shape = PillShape,
        color = MaterialTheme.colorScheme.primaryContainer,
        contentColor = MaterialTheme.colorScheme.onPrimaryContainer,
    ) {
        Box(contentAlignment = Alignment.Center) {
            Text(text = initials, style = MaterialTheme.typography.labelSmall)
        }
    }
}

/** The five questions from the generated catalog, as Pattern I's accordion. */
@Composable
private fun FaqBand(modifier: Modifier = Modifier) {
    Column(modifier, verticalArrangement = Arrangement.spacedBy(10.dp)) {
        SectionHeading(label = "QUESTIONS PEOPLE ASK", title = "FAQ")
        PublicCard {
            FaqAccordion(
                items = PublicCatalog.GYASI_FAQ,
                modifier = Modifier.padding(horizontal = 14.dp),
            )
        }
    }
}

/** One tile of the stats strip: the claim's figure, and the phrase that says what it counts. */
private data class AdvisorStat(val value: String, val label: String)

/**
 * The strip's four tiles, in the web page's order.
 *
 * Built with listOfNotNull so a claim that leaves the registry takes its tile with it. None of
 * these figures is verified yet, and the one thing this file must never do is supply one of its
 * own — a hardcoded fallback would be a number nobody had even placeholdered.
 */
private fun advisorStats(): List<AdvisorStat> {
    val rating = claimOf("ratingValue")
    val reviews = claimOf("reviewCount")

    return listOfNotNull(
        claimOf("travelersServed")?.let { AdvisorStat(it.display, it.detail ?: "Travelers served") },
        rating?.let {
            AdvisorStat(
                value = "${it.display} ★",
                label = reviews?.let { count -> "${count.display} reviews" } ?: "Average rating",
            )
        },
        claimOf("avgReplyTime")?.let { AdvisorStat(it.display, it.detail ?: "Avg reply time") },
        claimOf("yearsSpecialist")?.let {
            AdvisorStat(it.display, it.detail ?: "Caribbean specialist")
        },
    )
}

/**
 * The hero's one-line introduction, assembled the way web/content/public/proof.ts assembles it.
 *
 * "dad of three" is a claim, not a constant — the design prototype says "mom of three" and the
 * registry is where that was corrected — so the phrase is read rather than typed. Joining the
 * clauses means a missing claim drops its clause instead of leaving a stray comma behind.
 */
private fun advisorHeroLine(): String {
    val credentials = listOf(
        "Caribbean specialist",
        claimText("bioParent"),
        "Sandals-certified",
        "hosted by Inteletravel",
    ).filter { it.isNotBlank() }

    return credentials.joinToString(", ") +
        ". I plan the kind of week that turns into a story your family tells for years — " +
        "and I don't disappear after the deposit clears."
}

/** A claim from the generated registry, or null if the TypeScript no longer publishes it. */
private fun claimOf(id: String): Claim? = PublicCatalog.CLAIMS.firstOrNull { it.id == id }

/**
 * A claim's display string, empty when the id is gone.
 *
 * The catalog is generated and CI fails on a stale one, so an empty result means the TypeScript
 * dropped the claim. The sentence then loses its figure, which is the right failure: better a
 * gap than this screen inventing a number, and better a gap than a crash on a public page.
 */
private fun claimText(id: String): String = claimOf(id)?.display.orEmpty()
