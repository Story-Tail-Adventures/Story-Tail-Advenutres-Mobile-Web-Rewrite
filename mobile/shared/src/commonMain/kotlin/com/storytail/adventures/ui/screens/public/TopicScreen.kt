// Screens 2.0.8 Caribbean, 2.0.9 Cruises and 2.0.10 Honeymoons — see docs/Screen-Inventory.md
// §2.0.8–2.0.10 and §4.4 (Pattern H; mobile is a single column, island tiles as a horizontal
// snap strip, trips as image-left rows, and the inquire bar replaced by the sticky bottom
// CTA). Mirrors design/source-prototype/screens/client-public-mobile.jsx — M208_Caribbean,
// M209_Cruises, M2010_Honeymoons. P2 (built ahead of phase, September 2026).
//
// One screen with three faces, which is why AppRoute.PublicTopic carries the topic instead
// of splitting into three routes: the pages share a hero, a curated grid, a see-all and a
// closing band, and differ only in the band between the hero and the grid. All three sets of
// copy live in TopicCopy at the bottom of this file, so the body reads as one page rather
// than three branches.
//
// The prose is the browser's, string for string, from
// web/app/(public)/(hero)/{caribbean,cruises,honeymoons}/content.ts. The generator behind
// GeneratedPublicContent.kt exports the catalog but not the page copy, so this parity is by
// hand — change a sentence there and change it here, or the phone and the browser start
// telling a traveler different things.
package com.storytail.adventures.ui.screens.public

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.snapping.rememberSnapFlingBehavior
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.consumeWindowInsets
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.storytail.adventures.content.public.Island
import com.storytail.adventures.content.public.PublicCatalog
import com.storytail.adventures.content.public.PublicContent
import com.storytail.adventures.content.public.Topic
import com.storytail.adventures.ui.components.public.ClosingCta
import com.storytail.adventures.ui.components.public.HeroHeight
import com.storytail.adventures.ui.components.public.NoteCard
import com.storytail.adventures.ui.components.public.PlaceholderBanner
import com.storytail.adventures.ui.components.public.PublicCard
import com.storytail.adventures.ui.components.public.PublicChips
import com.storytail.adventures.ui.components.public.PublicHero
import com.storytail.adventures.ui.components.public.PublicPhotoFill
import com.storytail.adventures.ui.components.public.PublicScaffold
import com.storytail.adventures.ui.components.public.PublicStickyCta
import com.storytail.adventures.ui.components.public.PublicTapTarget
import com.storytail.adventures.ui.components.public.PublicTopBar
import com.storytail.adventures.ui.components.public.SectionHeading
import com.storytail.adventures.ui.components.public.SectionLabel
import com.storytail.adventures.ui.components.public.SeeAllButton
import com.storytail.adventures.ui.components.public.TripRow
import com.storytail.adventures.ui.theme.PillShape
import com.storytail.adventures.ui.theme.StoryTailBrand

/** The artboards' 18px page gutter. */
private val Gutter = 18.dp

/**
 * A topic landing page: Caribbean, Cruises or Honeymoons.
 *
 * Stateless — everything it draws comes from the generated catalog and [TopicCopy], and every
 * way out is a lambda. [onRequestQuote] carries the trip slug when the traveler asked about a
 * specific one and null when they asked from the closing band or the sticky bar; 2.0.6 uses
 * that to say what it is gating.
 *
 * No figure is printed anywhere on this page — the range chip is three drawn glyphs, not a
 * price (see PriceRangeDots) — so nothing here needs a trip's `priceNote` beside it. A
 * "from $2,640" line on these tiles would; the note travels with the number.
 */
@Composable
fun TopicScreen(
    topic: Topic,
    onOpenTrip: (slug: String) -> Unit,
    onRequestQuote: (slug: String?) -> Unit,
    onSeeAll: () -> Unit,
    onMessageGyasi: () -> Unit,
    onMenu: () -> Unit,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val copy = copyFor(topic)
    val trips = PublicContent.tripsFor(topic)

    // PlaceholderBanner rides above the scroll and has already cleared the status bar.
    // PublicTopBar pads for that bar too, and on a hero whose top bar floats over the photo a
    // second helping would drop the wordmark into the middle of the picture — so the inset is
    // consumed before it reaches the bar. When every claim is finally verified the banner
    // disappears and the inset is the top bar's again.
    val bannerHolds = PublicContent.hasUnverifiedClaims

    PublicScaffold(
        modifier = modifier,
        topBar = { PlaceholderBanner() },
        stickyCta = {
            PublicStickyCta(
                primaryLabel = RequestQuote,
                onPrimary = { onRequestQuote(null) },
                secondaryLabel = copy.stickySecondary,
                onSecondary = when (copy.secondaryTarget) {
                    SecondaryTarget.BROWSE -> onSeeAll
                    SecondaryTarget.MESSAGE -> onMessageGyasi
                },
            )
        },
    ) {
        PublicHero(
            imageKey = copy.heroImageKey,
            overline = copy.heroOverline,
            title = copy.heroTitle,
            script = copy.heroScript,
            sub = copy.heroSub,
            height = copy.heroHeight,
            topBar = {
                Box(
                    if (bannerHolds) Modifier.consumeWindowInsets(WindowInsets.statusBars)
                    else Modifier,
                ) {
                    PublicTopBar(onMenu = onMenu, onPhoto = true, onBack = onBack)
                }
            },
        )

        // The gutter is applied per block rather than to this column, because the island strip
        // is the one thing that has to reach both edges: it scrolls, and a strip that stops
        // 18dp short reads as a cropped list rather than a continuing one.
        Column(
            modifier = Modifier.padding(top = Gutter, bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(22.dp),
        ) {
            when (val band = copy.band) {
                is TopicBand.Islands -> IslandsBand(band, onSeeAll)
                is TopicBand.CruiseTypes -> CruiseTypesBand(band)
                is TopicBand.HoneymoonStyles -> HoneymoonStylesBand(band)
            }

            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                SectionHeading(
                    label = copy.gridLabel(trips.size),
                    title = copy.gridTitle,
                    sub = copy.gridSub,
                    modifier = Modifier.padding(horizontal = Gutter),
                )
                trips.forEach { trip ->
                    TripRow(
                        trip = trip,
                        onOpen = { onOpenTrip(trip.slug) },
                        onRequestQuote = { onRequestQuote(trip.slug) },
                        modifier = Modifier.padding(horizontal = Gutter),
                        topic = topic,
                    )
                }
                SeeAllButton(
                    label = copy.seeAllLabel(trips.size),
                    onClick = onSeeAll,
                    modifier = Modifier.padding(horizontal = Gutter),
                )
            }

            if (copy.christianCard != null) {
                ChristianCouplesCard(
                    copy = copy.christianCard,
                    onRequestQuote = { onRequestQuote(null) },
                    modifier = Modifier.padding(horizontal = Gutter),
                )
            }

            ClosingCta(
                title = copy.closing.title,
                body = copy.closing.body,
                primaryLabel = copy.closing.primary,
                onPrimary = { onRequestQuote(null) },
                secondaryLabel = copy.closing.secondary,
                onSecondary = onMessageGyasi,
                modifier = Modifier.padding(horizontal = Gutter),
            )
        }
    }
}

// ── The band between the hero and the grid ───────────────────────────────────────────────

/** 2.0.8: the three-point intro, then "Where to land". */
@Composable
private fun IslandsBand(band: TopicBand.Islands, onIsland: () -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(20.dp)) {
        Column(
            modifier = Modifier.padding(horizontal = Gutter),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            band.intro.forEachIndexed { index, point -> IntroPointRow(index + 1, point) }
        }

        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            SectionHeading(
                label = band.islands.label,
                title = band.islands.title,
                sub = band.islands.sub,
                modifier = Modifier.padding(horizontal = Gutter),
            )
            IslandStrip(PublicCatalog.ISLANDS, onIsland)
        }
    }
}

/** 2.0.9: who a cruise is for, then the lines Gyasi books. */
@Composable
private fun CruiseTypesBand(band: TopicBand.CruiseTypes) {
    Column(
        modifier = Modifier.padding(horizontal = Gutter),
        verticalArrangement = Arrangement.spacedBy(20.dp),
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            SectionHeading(band.types.label, band.types.title, sub = band.types.sub)
            band.cards.forEach { MediaRow(it) }
        }

        // The mobile artboard shows the overline and the chips, nothing else. Web's headline
        // spells the count out ("Eight lines…"), which would quietly go stale here the first
        // time CRUISE_LINES changes — web pins that list to eight in a test, and this file has
        // nothing to pin it with.
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            SectionLabel(band.linesLabel)
            PublicChips(PublicCatalog.CRUISE_LINES.map { it.name })
        }
    }
}

/** 2.0.10: Gyasi's note, then the three rhythms a honeymoon can take. */
@Composable
private fun HoneymoonStylesBand(band: TopicBand.HoneymoonStyles) {
    Column(
        modifier = Modifier.padding(horizontal = Gutter),
        verticalArrangement = Arrangement.spacedBy(20.dp),
    ) {
        NoteCard(label = band.noteLabel, body = band.noteBody, initials = "GS")

        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            SectionHeading(band.styles.label, band.styles.title)
            band.cards.forEach { MediaRow(it) }
        }
    }
}

// ── Parts this screen owns ───────────────────────────────────────────────────────────────

/**
 * One point of 2.0.8's intro band.
 *
 * The artboard puts an icon in the square. The app bundles no icon set — CheckMark exists
 * because a single glyph did not justify shipping every Material icon — and an empty coloured
 * square reads as a picture that failed to load, so the square carries the point's number
 * instead. The Screen Inventory calls this a "three-point intro band"; numbering it says the
 * same thing the icons were saying.
 */
@Composable
private fun IntroPointRow(number: Int, point: IntroPoint) {
    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Surface(
            modifier = Modifier.size(32.dp),
            shape = MaterialTheme.shapes.medium,
            color = MaterialTheme.colorScheme.primaryContainer,
            contentColor = MaterialTheme.colorScheme.onPrimaryContainer,
        ) {
            Box(contentAlignment = Alignment.Center) {
                Text(number.toString(), style = MaterialTheme.typography.labelLarge)
            }
        }
        Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(
                text = point.title,
                style = MaterialTheme.typography.titleSmall,
                color = MaterialTheme.colorScheme.onSurface,
                fontWeight = FontWeight.Bold,
            )
            Text(
                text = point.body,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

/**
 * The island strip: §4.4's "horizontal snap strip" on mobile.
 *
 * A LazyRow purely for the snap fling — six tiles do not need laziness, but they do need to
 * come to rest on a tile edge rather than mid-photo, which is what `scroll-snap-type` does for
 * the same strip in the browser. `contentPadding` is what lets it start at the gutter and
 * still scroll clear of both edges.
 *
 * Every tile lands on the same results list today: this screen is handed one [onSeeAll], and
 * AppRoute.PublicResults already carries a `dest` — so the fix, when 2.0.4 can take one, is an
 * `onIsland(name)` lambda here rather than a change to the tiles.
 */
@Composable
private fun IslandStrip(islands: List<Island>, onIsland: () -> Unit) {
    val state = rememberLazyListState()

    LazyRow(
        state = state,
        flingBehavior = rememberSnapFlingBehavior(state),
        contentPadding = PaddingValues(horizontal = Gutter),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        items(islands, key = { it.slug }) { island ->
            Box(
                Modifier
                    .width(110.dp)
                    .aspectRatio(4f / 5f)
                    .clip(MaterialTheme.shapes.large)
                    .clickable(onClick = onIsland),
            ) {
                PublicPhotoFill(island.imageKey)
                // Sits on the photo, so it is brand tokens rather than scheme colours — the
                // name reads white whichever way the app is themed.
                Box(
                    Modifier
                        .fillMaxSize()
                        .background(
                            Brush.verticalGradient(
                                0.4f to Color.Transparent,
                                1f to StoryTailBrand.Navy.copy(alpha = 0.75f),
                            ),
                        ),
                )
                Text(
                    text = island.name,
                    style = MaterialTheme.typography.labelLarge,
                    color = Color.White,
                    modifier = Modifier.align(Alignment.BottomStart).padding(8.dp),
                )
            }
        }
    }
}

/**
 * The image-left card behind "who it's for" and "three ways to honeymoon".
 *
 * Shaped like TripRow deliberately — same card, same photo column, same intrinsic-height trick
 * — but it is not a trip: no range chip, no quote button, nothing to open. These describe a
 * kind of week, and giving one a CTA would promise a page that does not exist.
 */
@Composable
private fun MediaRow(card: MediaCopy) {
    PublicCard {
        Row(Modifier.height(IntrinsicSize.Min)) {
            Box(Modifier.width(100.dp).fillMaxHeight()) {
                PublicPhotoFill(card.imageKey)
                // White on burgundy, like the hero's words: the tag sits on the photo scrim,
                // so it is the same in both schemes by construction.
                Surface(
                    modifier = Modifier.padding(6.dp),
                    color = Color.White,
                    contentColor = StoryTailBrand.Burgundy,
                    shape = RoundedCornerShape(4.dp),
                ) {
                    Text(
                        text = card.tag,
                        style = MaterialTheme.typography.labelSmall,
                        modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
                    )
                }
            }
            Column(
                Modifier.weight(1f).padding(12.dp),
                verticalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                Text(
                    text = card.title,
                    style = MaterialTheme.typography.titleSmall,
                    color = MaterialTheme.colorScheme.onSurface,
                )
                Text(
                    text = card.body,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

/**
 * 2.0.10's opt-in card for couples who want a faith-shaped rhythm to the week.
 *
 * Kept as designed, on Gyasi's call. The voice rule it has to clear is Design System §2.2 and
 * §2.5: the offer is made, never assumed. Nothing on this page asks anyone's faith, the card is
 * one block among several, and the way in is the same inquiry form everybody else uses — which
 * is why its button is "Request a quote" rather than a separate door.
 *
 * The artboard sets the overline in fixed burgundy. That vanishes into the dark scheme, where
 * the whole card turns ocean blue, so the overline takes onPrimaryContainer with the rest of
 * the text — the same call the web build made.
 */
@Composable
private fun ChristianCouplesCard(
    copy: ChristianCardCopy,
    onRequestQuote: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val scheme = MaterialTheme.colorScheme

    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = MaterialTheme.shapes.extraLarge,
        color = Color.Transparent,
    ) {
        Column(
            modifier = Modifier
                .background(
                    Brush.linearGradient(
                        listOf(scheme.primaryContainer, scheme.secondaryContainer),
                    ),
                )
                .padding(18.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Text(
                text = copy.label,
                style = MaterialTheme.typography.labelSmall,
                color = scheme.onPrimaryContainer,
            )
            Text(
                text = copy.title,
                style = MaterialTheme.typography.titleLarge,
                color = scheme.onPrimaryContainer,
                modifier = Modifier.semantics { heading() },
            )
            Text(
                text = copy.body,
                style = MaterialTheme.typography.bodySmall,
                color = scheme.onPrimaryContainer.copy(alpha = 0.85f),
            )
            Button(
                onClick = onRequestQuote,
                shape = PillShape,
                colors = ButtonDefaults.buttonColors(
                    containerColor = scheme.onPrimaryContainer,
                    contentColor = scheme.primaryContainer,
                ),
                modifier = Modifier.padding(top = 6.dp).heightIn(min = PublicTapTarget),
            ) {
                Text(copy.action)
            }
        }
    }
}

// ── The copy, keyed by topic ─────────────────────────────────────────────────────────────

/** Every page says this on the sticky bar, in the closing band, and on every tile. */
private val RequestQuote = "Request a quote"

private class SectionCopy(val label: String, val title: String, val sub: String? = null)

private class IntroPoint(val title: String, val body: String)

private class MediaCopy(
    val imageKey: String,
    val tag: String,
    val title: String,
    val body: String,
)

private class ClosingCopy(
    val title: String,
    val body: String,
    val primary: String,
    val secondary: String,
)

private class ChristianCardCopy(
    val label: String,
    val title: String,
    val body: String,
    val action: String,
)

/** Where a page's quieter sticky action goes — the three do not all point the same way. */
private enum class SecondaryTarget { BROWSE, MESSAGE }

/** The one band that differs between the three pages: what sits between hero and grid. */
private sealed interface TopicBand {
    class Islands(val intro: List<IntroPoint>, val islands: SectionCopy) : TopicBand

    class CruiseTypes(
        val types: SectionCopy,
        val cards: List<MediaCopy>,
        val linesLabel: String,
    ) : TopicBand

    class HoneymoonStyles(
        val noteLabel: String,
        val noteBody: String,
        val styles: SectionCopy,
        val cards: List<MediaCopy>,
    ) : TopicBand
}

/**
 * One page's worth of words.
 *
 * A holder rather than three `if` chains through the body: what varies between 2.0.8, 2.0.9
 * and 2.0.10 is almost entirely prose, and prose belongs in one readable block where it can be
 * diffed against the web copy modules it has to match.
 *
 * [gridLabel] and [seeAllLabel] take the count because the count is whatever the grid actually
 * rendered. Nobody types "9 trips" here; the catalog decides, the same way the web pages derive
 * it rather than hardcoding a figure.
 */
private class TopicCopy(
    val heroImageKey: String,
    val heroHeight: HeroHeight,
    val heroOverline: String,
    val heroTitle: String,
    val heroScript: String,
    val heroSub: String,
    val band: TopicBand,
    val gridLabel: (Int) -> String,
    val gridTitle: String,
    val gridSub: String? = null,
    val seeAllLabel: (Int) -> String,
    val closing: ClosingCopy,
    val stickySecondary: String,
    val secondaryTarget: SecondaryTarget,
    /** 2.0.10 only, and it sits after the grid rather than inside [band]. */
    val christianCard: ChristianCardCopy? = null,
)

/**
 * A `when` rather than a map lookup: it is exhaustive over [Topic], so a fourth topic cannot
 * reach a build without someone writing its page copy first.
 */
private fun copyFor(topic: Topic): TopicCopy = when (topic) {
    Topic.CARIBBEAN -> Caribbean
    Topic.CRUISES -> Cruises
    Topic.HONEYMOONS -> Honeymoons
}

/**
 * The display text of a marketing claim, read from the registry instead of retyped here.
 *
 * Every one of these is still unverified (`Claim.verified == false`) — PlaceholderBanner is
 * what says so, and it rides above this whole surface. Reading them is what keeps the phone
 * and the browser making the same unverified claim rather than two different ones.
 */
private fun claim(id: String): String =
    PublicCatalog.CLAIMS.firstOrNull { it.id == id }?.display.orEmpty()

private fun plural(count: Int, one: String, many: String): String = if (count == 1) one else many

private val Caribbean = TopicCopy(
    heroImageKey = "turks",
    heroHeight = HeroHeight.NORMAL,
    heroOverline = "CARIBBEAN VACATIONS",
    heroTitle = "A region built for",
    heroScript = "rest.",
    heroSub = claim("islandsPlannedAll") +
        " The hard part isn't finding a good week — it's choosing which good one.",
    band = TopicBand.Islands(
        intro = listOf(
            IntroPoint(
                title = "You won't have to think.",
                body = "Transfers, dining reservations, the spa slot you didn't know you " +
                    "needed — handled before you leave Miami.",
            ),
            IntroPoint(
                title = "Real prices, honest takes.",
                body = "I tell you which resorts are tired and which ones are quietly the " +
                    "best. No commission steers my picks.",
            ),
            IntroPoint(
                title = "A week worth returning to.",
                body = "The point isn't the trip — it's the rest you bring home from it. We " +
                    "plan with that in mind.",
            ),
        ),
        islands = SectionCopy(
            label = "ISLANDS",
            title = "Where to land",
            sub = "Tap an island to start a search, or let Gyasi suggest one based on your week.",
        ),
    ),
    gridLabel = { count -> "HAND-PICKED · $count " + plural(count, "TRIP", "TRIPS") },
    gridTitle = "Caribbean weeks Gyasi loves right now",
    gridSub = claim("catalogUpdatedMonthly") +
        " The ${'$'} chip is a rough range — request a quote to see real prices for your dates.",
    seeAllLabel = { count ->
        "See all $count Caribbean " + plural(count, "trip", "trips") + " →"
    },
    closing = ClosingCopy(
        title = "Tell me your week. I'll come back with three good options.",
        body = "No account needed to message. No planning fees, ever. Just a real " +
            "conversation about what you actually need.",
        primary = RequestQuote,
        secondary = "Message Gyasi first",
    ),
    stickySecondary = "Browse all",
    secondaryTarget = SecondaryTarget.BROWSE,
)

private val Cruises = TopicCopy(
    heroImageKey = "cruiseAerial",
    heroHeight = HeroHeight.NORMAL,
    heroOverline = "CRUISING",
    heroTitle = "A floating Sabbath,",
    heroScript = "every morning new.",
    heroSub = "Unpack once. See three islands. The ship handles dinner, the towel art, the " +
        "kids' club — you handle being on a balcony at sunrise.",
    band = TopicBand.CruiseTypes(
        types = SectionCopy(
            label = "WHO IT'S FOR",
            title = "Three kinds of cruise, one advisor.",
            sub = claim("sailsEachLineYearly"),
        ),
        cards = listOf(
            MediaCopy(
                imageKey = "cruiseShip",
                tag = "FAMILY",
                title = "Family cruises",
                body = "Multi-gen sailings with waterparks, character meet-ups, and rooms " +
                    "that connect.",
            ),
            MediaCopy(
                imageKey = "cruiseAerial",
                tag = "ADULTS",
                title = "Adults-only",
                body = "Virgin, Viking, premium Celebrity — quieter ships, real dining, no " +
                    "kids underfoot.",
            ),
            MediaCopy(
                imageKey = "overwater",
                tag = "GROUP",
                title = "Group cruises",
                body = "8+ travelers — birthday, anniversary, ministry, friends week. Group " +
                    "rates + a coordinator.",
            ),
        ),
        linesLabel = "LINES WE BOOK",
    ),
    gridLabel = { count -> "HAND-PICKED · $count " + plural(count, "SAILING", "SAILINGS") },
    gridTitle = "Sailings worth booking this season",
    seeAllLabel = { count -> "See all $count " + plural(count, "sailing", "sailings") + " →" },
    closing = ClosingCopy(
        title = "Tell me how many people, when, and roughly your budget.",
        body = "I'll come back with three sailings, on three lines, with honest notes on what " +
            "each ship is actually good at.",
        primary = RequestQuote,
        secondary = "Message Gyasi first",
    ),
    stickySecondary = "All sailings",
    secondaryTarget = SecondaryTarget.BROWSE,
)

private val Honeymoons = TopicCopy(
    heroImageKey = "overwater",
    heroHeight = HeroHeight.TALL,
    heroOverline = "HONEYMOONS",
    heroTitle = "The first rest,",
    heroScript = "after the I-do's.",
    heroSub = "A week that begins your marriage — quiet, unhurried, and built around the two " +
        "of you. We handle the moving parts so you can be present.",
    band = TopicBand.HoneymoonStyles(
        noteLabel = "A NOTE FROM GYASI",
        // Web italicises the question. NoteCard takes plain body text, and one emphasised
        // clause does not earn an AnnotatedString here — the question carries itself.
        noteBody = "Honeymoons are the most personal trip I plan. Some couples want the resort " +
            "with no decisions to make. Some want two islands and a snorkel boat between them. " +
            "I ask the same question first either way: what kind of rest does your marriage " +
            "need to begin with? Then we plan from there.",
        styles = SectionCopy(
            label = "THREE WAYS TO HONEYMOON",
            title = "Pick the rhythm. We pick the rest.",
        ),
        cards = listOf(
            MediaCopy(
                imageKey = "overwater",
                tag = "ALL-INCLUSIVE",
                title = "Adults-only resorts",
                body = "Sandals, Couples, Excellence — all-inclusive, no kids, real spas.",
            ),
            MediaCopy(
                imageKey = "overwater",
                tag = "OVERWATER",
                title = "Overwater bungalows",
                body = "A door to the ocean from your bed. Tahiti, Maldives, El Dorado Maroma.",
            ),
            MediaCopy(
                imageKey = "sunset",
                tag = "MULTI-STOP",
                title = "Multi-stop",
                body = "Two islands. Or a city + a beach. We sequence the rhythm — busy first, " +
                    "rest second.",
            ),
        ),
    ),
    gridLabel = { count -> "FEATURED · $count " + plural(count, "PACKAGE", "PACKAGES") },
    gridTitle = "Honeymoons booked this year",
    seeAllLabel = { count ->
        "See all $count honeymoon " + plural(count, "package", "packages") + " →"
    },
    closing = ClosingCopy(
        title = "When's the wedding? I'll start there.",
        body = "Tell me the date, your two priorities (rest? adventure? privacy?), and a " +
            "budget range. I'll send three honest options " + claim("replyWithin48h") + ".",
        primary = RequestQuote,
        secondary = "Message Gyasi first",
    ),
    stickySecondary = "Message Gyasi",
    secondaryTarget = SecondaryTarget.MESSAGE,
    // The artboard's button here reads "See the curated list →", which on this phone lands in
    // the same place as the see-all row a few hundred pixels above it. The card's own copy
    // already names the way in — "just tell me on the inquiry form" — so it takes the web
    // page's primary action instead of repeating the link.
    christianCard = ChristianCardCopy(
        label = "FOR CHRISTIAN COUPLES",
        title = "A honeymoon that honors what you just promised.",
        body = "If you're building a Christ-centered marriage, your first week away matters. " +
            "We'll steer you toward resorts that fit — quieter properties, family-owned " +
            "boutiques, an Adventist-friendly Sabbath rhythm if that matters to you. Just tell " +
            "me on the inquiry form. No upcharge, no judgment, no awkward conversation.",
        action = RequestQuote,
    ),
)
