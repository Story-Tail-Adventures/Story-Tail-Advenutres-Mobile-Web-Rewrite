// Screen 2.0.1 App Subdomain Public Landing — see docs/Screen-Inventory.md §2.0.1 and its
// §4.4 mapping (Pattern H, with the recorded "no mobile sticky bottom bar" deviation), and
// design/source-prototype/screens/client-public-mobile.jsx (M201_PublicLanding). P1.
//
// The copy is the web twin's copy module, web/app/(public)/(hero)/content.ts, rather than the
// artboard's literal strings: it carries two corrections the September artboard predates —
// trips are "always in your pocket" rather than "offline at the resort" (offline UI is P3),
// and the reply-time figure is read from the claims registry instead of typed.
package com.storytail.adventures.ui.screens.public

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.consumeWindowInsets
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.storytail.adventures.content.public.PublicCatalog
import com.storytail.adventures.ui.components.public.HeroHeight
import com.storytail.adventures.ui.components.public.PlaceholderBanner
import com.storytail.adventures.ui.components.public.PublicCard
import com.storytail.adventures.ui.components.public.PublicPhoto
import com.storytail.adventures.ui.components.public.PublicScaffold
import com.storytail.adventures.ui.components.public.PublicTapTarget
import com.storytail.adventures.ui.components.public.PublicTopBar
import com.storytail.adventures.ui.components.public.SectionLabel
import com.storytail.adventures.ui.components.public.SeeAllButton
import com.storytail.adventures.ui.theme.LocalStoryTailBrandTypography
import com.storytail.adventures.ui.theme.PillShape
import com.storytail.adventures.ui.theme.StoryTailBrand

/** The photo key the landing hero asks for — registered in PublicCatalog.IMAGES. */
private const val HERO_IMAGE = "turks"

/**
 * The app's front door for anyone who is not signed in.
 *
 * No sticky CTA bar, unlike every other Pattern H screen in §2.0: both account CTAs sit at
 * the foot of the hero, above the fold and above the scripture strip, and the page scrolls
 * only a couple of hundred dp — a fixed bar would spend permanent height duplicating a
 * button that never scrolls out of view. §4.4's 2.0.1 bullet records that deviation.
 */
@Composable
fun LandingScreen(
    onCreateAccount: () -> Unit,
    onSignIn: () -> Unit,
    onTakeTour: () -> Unit,
    onBrowseTrips: () -> Unit,
    onMenu: () -> Unit,
    modifier: Modifier = Modifier,
) {
    // No `topBar`: the bar floats on the photo, so it belongs to the hero rather than to
    // the scaffold's fixed strip above the scroll.
    PublicScaffold(modifier = modifier) {
        LandingHero(
            onCreateAccount = onCreateAccount,
            onSignIn = onSignIn,
            onTakeTour = onTakeTour,
            onMenu = onMenu,
        )
        WhatYouCanDoHere(onBrowseTrips = onBrowseTrips)
    }
}

/**
 * The full-bleed hero, with the value prop, the three ways in and the scripture line all on
 * the photo.
 *
 * Not [com.storytail.adventures.ui.components.public.PublicHero]: that one pins a fixed
 * overline/title/sub block to the bottom of the photo and takes no children, and 2.0.1 is
 * the one §2.0 hero whose actions live *inside* the scrim. So it is assembled here from the
 * same shared pieces — PublicPhoto, the brand scrim, PublicTopBar, HeroHeight.FILL — rather
 * than by growing a content slot the other ten screens have no use for.
 */
@Composable
private fun LandingHero(
    onCreateAccount: () -> Unit,
    onSignIn: () -> Unit,
    onTakeTour: () -> Unit,
    onMenu: () -> Unit,
) {
    val brandType = LocalStoryTailBrandTypography.current

    // `heightIn` rather than a fixed height, matching the artboard's `minHeight: 540`: the
    // copy and three stacked buttons very nearly fill 540dp at default type, so a fixed
    // hero would push the scripture line out through the bottom of the photo the moment
    // somebody raised their font size.
    Box(Modifier.fillMaxWidth().heightIn(min = HeroHeight.FILL.dp)) {
        PublicPhoto(HERO_IMAGE, Modifier.matchParentSize())
        // The landing scrim, heavier at the bottom than the shared hero's because body copy
        // and buttons sit on it rather than a title alone. Brand tokens only, so it renders
        // identically in both schemes — which is what lets everything drawn on it be plain
        // white and sunset gold instead of scheme colours.
        Box(
            Modifier
                .matchParentSize()
                .background(
                    Brush.verticalGradient(
                        0.0f to StoryTailBrand.Navy.copy(alpha = 0.55f),
                        0.6f to StoryTailBrand.Burgundy.copy(alpha = 0.70f),
                        1.0f to StoryTailBrand.Navy.copy(alpha = 0.85f),
                    ),
                ),
        )

        Column(Modifier.fillMaxWidth()) {
            PublicTopBar(onMenu = onMenu, onPhoto = true)
            // Both the bar and the banner clear the notch on their own, and only one of
            // them can: the wordmark keeps it and the notice sits directly under the bar.
            // Consuming the inset here means the banner never draws a 44dp empty strip, and
            // it costs nothing on the day every claim is verified and it stops rendering.
            Box(Modifier.consumeWindowInsets(WindowInsets.statusBars)) {
                PlaceholderBanner()
            }

            Column(
                Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 22.dp)
                    .padding(top = 20.dp, bottom = 28.dp),
            ) {
                Text(
                    text = "REST IS A GIFT · CREATION IS A GIFT",
                    style = MaterialTheme.typography.labelSmall,
                    color = StoryTailBrand.Sunset,
                )
                Spacer(Modifier.height(10.dp))

                // Merged into one heading: the sentence is split across two faces, and a
                // screen reader announcing "Plan a rest worthy of the" and "world He made."
                // as two separate headings makes nonsense of a line that is one thought.
                Column(Modifier.semantics(mergeDescendants = true) { heading() }) {
                    Text(
                        text = "Plan a rest worthy of the",
                        style = MaterialTheme.typography.headlineLarge,
                        color = Color.White,
                    )
                    Text(
                        text = "world He made.",
                        // Caveat's line height is pinned at its wordmark size, so it has to
                        // travel with the font size or the descenders clip.
                        style = brandType.script.copy(
                            fontSize = MaterialTheme.typography.displaySmall.fontSize,
                            lineHeight = MaterialTheme.typography.displaySmall.lineHeight,
                        ),
                        color = StoryTailBrand.Sunset,
                    )
                }

                Spacer(Modifier.height(12.dp))
                Text(
                    text = "Your portal for everything Story-Tail — trips in motion, cards " +
                        "authorized for suppliers, and a place to dream up what's next. We " +
                        "believe vacation is rest, and rest is sacred.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = Color.White.copy(alpha = 0.92f),
                )

                Spacer(Modifier.height(24.dp))
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(
                        onClick = onCreateAccount,
                        shape = PillShape,
                        // Orange rather than colorScheme.primary: primary is burgundy in the
                        // light scheme and ocean blue in the dark one, and neither reads as
                        // the lead action on a burgundy-tinted scrim.
                        colors = ButtonDefaults.buttonColors(
                            containerColor = StoryTailBrand.Orange,
                            contentColor = Color.White,
                        ),
                        modifier = Modifier.fillMaxWidth().heightIn(min = PublicTapTarget),
                    ) {
                        Text("Create an account")
                    }
                    OutlinedButton(
                        onClick = onSignIn,
                        shape = PillShape,
                        colors = ButtonDefaults.outlinedButtonColors(
                            containerColor = Color.White.copy(alpha = 0.18f),
                            contentColor = Color.White,
                        ),
                        border = BorderStroke(1.dp, Color.White.copy(alpha = 0.30f)),
                        modifier = Modifier.fillMaxWidth().heightIn(min = PublicTapTarget),
                    ) {
                        Text("Sign in")
                    }
                    TextButton(
                        onClick = onTakeTour,
                        colors = ButtonDefaults.textButtonColors(
                            contentColor = Color.White.copy(alpha = 0.85f),
                        ),
                        modifier = Modifier.fillMaxWidth().heightIn(min = PublicTapTarget),
                    ) {
                        Text("Take a quick tour →")
                    }
                }

                Spacer(Modifier.height(18.dp))
                HorizontalDivider(color = Color.White.copy(alpha = 0.18f))
                Spacer(Modifier.height(14.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        // The web hero carries a second verse from `md` up; the phone shows
                        // this one alone, as the artboard does.
                        text = "“On the seventh day God rested.”",
                        style = brandType.script.copy(
                            fontSize = MaterialTheme.typography.titleMedium.fontSize,
                            lineHeight = MaterialTheme.typography.titleMedium.lineHeight,
                        ),
                        color = StoryTailBrand.Sunset,
                        // Wraps rather than pushing the reference off the edge when the font
                        // scale is turned up.
                        modifier = Modifier.weight(1f, fill = false),
                    )
                    Text(
                        text = "GEN 2 : 2",
                        style = MaterialTheme.typography.labelSmall,
                        color = Color.White.copy(alpha = 0.70f),
                    )
                }
            }
        }
    }
}

/**
 * The band under the hero: what an account is actually for, in three lines.
 *
 * "Browse trip ideas" is not on the mobile artboard — the desktop hero carries it as a glass
 * chip and the phone leaves it to the menu — but §2.0.1 lists it as a primary element and
 * the menu is a tap away rather than in view. A quiet link under the cards keeps the route
 * to 2.0.3 visible without adding any fixed chrome.
 */
@Composable
private fun WhatYouCanDoHere(onBrowseTrips: () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 22.dp)
            .padding(top = 24.dp, bottom = 30.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        SectionLabel("WHAT YOU CAN DO HERE", Modifier.semantics { heading() })
        FeatureCard(
            mark = FeatureMark.PLANE,
            title = "View your trips",
            body = "Itinerary, day-by-day, always in your pocket.",
        )
        FeatureCard(
            mark = FeatureMark.CARD,
            title = "Authorize cards",
            body = "Stripe-secured. We pay suppliers — never charge fees.",
        )
        FeatureCard(
            mark = FeatureMark.MESSAGE,
            title = "Message Gyasi",
            body = messageGyasiBody,
        )
        SeeAllButton("Browse trip ideas →", onBrowseTrips)
    }
}

/**
 * The reply time is read from the claims registry rather than typed into the sentence.
 *
 * It is one of the unverified figures PlaceholderBanner is warning about, so it changes in
 * exactly one place when Gyasi checks it — and if it ever leaves the registry the promise
 * leaves the card with it, instead of hardening into copy nobody owns.
 */
private val messageGyasiBody: String =
    PublicCatalog.CLAIMS.firstOrNull { it.id == "avgReplyTime" }
        ?.let { "Threaded by trip. Reply usually ${it.display}." }
        ?: "Threaded by trip."

@Composable
private fun FeatureCard(mark: FeatureMark, title: String, body: String) {
    PublicCard {
        Row(
            modifier = Modifier.padding(14.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalAlignment = Alignment.Top,
        ) {
            Surface(
                modifier = Modifier.size(36.dp),
                shape = MaterialTheme.shapes.small,
                color = MaterialTheme.colorScheme.primaryContainer,
                contentColor = MaterialTheme.colorScheme.onPrimaryContainer,
            ) {
                Box(contentAlignment = Alignment.Center) {
                    FeatureGlyph(
                        mark = mark,
                        size = 16.dp,
                        color = MaterialTheme.colorScheme.onPrimaryContainer,
                    )
                }
            }
            Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
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
            }
        }
    }
}

/** The three marks the cards need — the artboard's `plane`, `card` and `message` icons. */
private enum class FeatureMark { PLANE, CARD, MESSAGE }

/**
 * Drawn rather than imported, for the same reason CheckMark is:
 * `androidx.compose.material.icons` is not on this module's classpath, and three glyphs do
 * not justify an artifact that ships every Material icon. Each is the prototype's icon cut
 * down to what still reads at 16dp, in a 0..1 viewport so it scales with [size].
 */
@Composable
private fun FeatureGlyph(mark: FeatureMark, size: Dp, color: Color) {
    Canvas(Modifier.size(size)) {
        val w = this.size.width
        val h = this.size.height
        val outline = Stroke(
            width = w * 0.11f,
            cap = StrokeCap.Round,
            join = StrokeJoin.Round,
        )

        when (mark) {
            // A paper plane: nose top-right, one wing, the crease, the tail.
            FeatureMark.PLANE -> drawPath(
                path = Path().apply {
                    moveTo(w * 0.94f, h * 0.08f)
                    lineTo(w * 0.06f, h * 0.46f)
                    lineTo(w * 0.42f, h * 0.58f)
                    lineTo(w * 0.56f, h * 0.94f)
                    close()
                },
                color = color,
            )

            FeatureMark.CARD -> {
                drawRoundRect(
                    color = color,
                    topLeft = Offset(w * 0.06f, h * 0.18f),
                    size = Size(w * 0.88f, h * 0.64f),
                    cornerRadius = CornerRadius(w * 0.14f),
                    style = outline,
                )
                // The magnetic stripe, which is what separates a card from a rectangle.
                drawLine(
                    color = color,
                    start = Offset(w * 0.06f, h * 0.40f),
                    end = Offset(w * 0.94f, h * 0.40f),
                    strokeWidth = w * 0.11f,
                )
            }

            FeatureMark.MESSAGE -> {
                drawRoundRect(
                    color = color,
                    topLeft = Offset(w * 0.08f, h * 0.12f),
                    size = Size(w * 0.84f, h * 0.58f),
                    cornerRadius = CornerRadius(w * 0.18f),
                    style = outline,
                )
                // The tail, which is what separates a bubble from a box.
                drawPath(
                    path = Path().apply {
                        moveTo(w * 0.30f, h * 0.66f)
                        lineTo(w * 0.30f, h * 0.94f)
                        lineTo(w * 0.54f, h * 0.66f)
                        close()
                    },
                    color = color,
                )
            }
        }
    }
}
