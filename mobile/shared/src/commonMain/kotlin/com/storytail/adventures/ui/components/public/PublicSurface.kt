// The shell every Screen Inventory §2.0 screen is built from.
//
// Mirrors the mobile artboards' shared helpers in
// design/source-prototype/screens/client-public-mobile.jsx — MFrame, MTopBar, MStickyCTA —
// the same way AuthScaffold mirrors that file's auth equivalents for §2.1.
package com.storytail.adventures.ui.components.public

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.storytail.adventures.content.public.PublicContent
import com.storytail.adventures.ui.components.BrandMark
import com.storytail.adventures.ui.components.BrandTone
import com.storytail.adventures.ui.theme.LocalStoryTailExtended
import com.storytail.adventures.ui.theme.PillShape
import com.storytail.adventures.ui.theme.StoryTailBrand

/** The floor every touch target on the public surface clears. */
val PublicTapTarget = 48.dp

/**
 * MFrame: a scrolling single column, an optional top bar over it, and an optional CTA bar
 * pinned to the bottom.
 *
 * The bar is a sibling of the scroll rather than an overlay on it, which is the Compose
 * equivalent of the fix the web surface needed in this same section: a fixed bar there was
 * covering the footer, because the space it occupied was reserved in the wrong place. A
 * Column with the bar as its last child cannot make that mistake — the scroll gets what is
 * left, and `navigationBarsPadding` keeps the bar off the home indicator.
 */
@Composable
fun PublicScaffold(
    modifier: Modifier = Modifier,
    topBar: @Composable () -> Unit = {},
    stickyCta: (@Composable () -> Unit)? = null,
    contentPadding: PaddingValues = PaddingValues(0.dp),
    content: @Composable ColumnScope.() -> Unit,
) {
    Surface(modifier = modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
        Column(Modifier.fillMaxSize()) {
            topBar()
            Column(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth()
                    .verticalScroll(rememberScrollState())
                    .padding(contentPadding),
            ) {
                content()
                PublicFooter()
            }
            if (stickyCta != null) stickyCta()
        }
    }
}

/**
 * MTopBar. [onPhoto] is the variant that floats over a hero photograph — white glyphs, no
 * background — which is what every screen that opens on a hero uses.
 *
 * The trailing control is the menu, matching the artboards: the five public destinations do
 * not fit a phone's width, so they live behind it rather than in a row.
 */
@Composable
fun PublicTopBar(
    onMenu: () -> Unit,
    modifier: Modifier = Modifier,
    onPhoto: Boolean = false,
    onBack: (() -> Unit)? = null,
) {
    val foreground =
        if (onPhoto) Color.White else MaterialTheme.colorScheme.onSurface
    val background =
        if (onPhoto) Color.Transparent else LocalStoryTailExtended.current.surface1

    Column(modifier.background(background).statusBarsPadding()) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 8.dp, vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (onBack != null) {
                IconButton(onClick = onBack, modifier = Modifier.heightIn(min = PublicTapTarget)) {
                    Text("‹", style = MaterialTheme.typography.headlineMedium, color = foreground)
                }
            } else {
                Spacer(Modifier.width(6.dp))
            }
            BrandMark(size = 80.dp, tone = if (onPhoto) BrandTone.Dark else BrandTone.Auto)
            Spacer(Modifier.weight(1f))
            IconButton(
                onClick = onMenu,
                modifier = Modifier.heightIn(min = PublicTapTarget).width(PublicTapTarget),
            ) {
                // Three rules rather than an icon font: the design's `more` glyph, and the
                // app has no icon set bundled yet.
                Column(
                    verticalArrangement = Arrangement.spacedBy(3.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    repeat(3) {
                        Box(
                            Modifier
                                .width(18.dp)
                                .height(2.dp)
                                .background(foreground, PillShape),
                        )
                    }
                }
            }
        }
        if (!onPhoto) HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
    }
}

/**
 * MStickyCTA: the primary action pinned to the bottom, with an optional quieter one beside
 * it and an optional full-width third on its own row.
 *
 * [guest] is 2.0.5's "Message Gyasi without an account" — §4.4 puts it on the bottom bar on
 * mobile, and three controls will not share one row on a narrow phone.
 */
@Composable
fun PublicStickyCta(
    primaryLabel: String,
    onPrimary: () -> Unit,
    modifier: Modifier = Modifier,
    secondaryLabel: String? = null,
    onSecondary: (() -> Unit)? = null,
    guestLabel: String? = null,
    onGuest: (() -> Unit)? = null,
) {
    Surface(
        modifier = modifier.fillMaxWidth(),
        color = LocalStoryTailExtended.current.surface1,
    ) {
        Column(Modifier.navigationBarsPadding()) {
            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 14.dp, vertical = 10.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                if (secondaryLabel != null && onSecondary != null) {
                    TextButton(
                        onClick = onSecondary,
                        modifier = Modifier.heightIn(min = PublicTapTarget),
                    ) {
                        Text(secondaryLabel)
                    }
                }
                Button(
                    onClick = onPrimary,
                    shape = PillShape,
                    modifier = Modifier.weight(1f).heightIn(min = PublicTapTarget),
                ) {
                    Text(primaryLabel)
                }
            }
            if (guestLabel != null && onGuest != null) {
                TextButton(
                    onClick = onGuest,
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(min = PublicTapTarget)
                        .padding(horizontal = 14.dp)
                        .padding(bottom = 8.dp),
                ) {
                    Text(guestLabel)
                }
            }
        }
    }
}

/** The orange overline every §2.0 band opens with. */
@Composable
fun SectionLabel(text: String, modifier: Modifier = Modifier) {
    Text(
        text = text,
        style = MaterialTheme.typography.labelSmall,
        color = StoryTailBrand.Orange,
        modifier = modifier,
    )
}

/** A band heading: the overline, then the sentence under it. */
@Composable
fun SectionHeading(
    label: String,
    title: String,
    modifier: Modifier = Modifier,
    sub: String? = null,
) {
    Column(modifier, verticalArrangement = Arrangement.spacedBy(2.dp)) {
        SectionLabel(label)
        Text(
            text = title,
            style = MaterialTheme.typography.titleLarge,
            color = MaterialTheme.colorScheme.onSurface,
        )
        if (sub != null) {
            Text(
                text = sub,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

/** The prototype's `.card`: a rounded surface-1 block with a hairline. */
@Composable
fun PublicCard(
    modifier: Modifier = Modifier,
    content: @Composable ColumnScope.() -> Unit,
) {
    Surface(
        modifier = modifier.fillMaxWidth(),
        color = LocalStoryTailExtended.current.surface1,
        shape = MaterialTheme.shapes.large,
    ) {
        Column(content = content)
    }
}

/**
 * The banner the web renders from PUBLIC_CLAIMS_MODE.
 *
 * Every figure, testimonial, credential and price on this surface is a placeholder until
 * Gyasi verifies it (web/content/public/proof.ts). Showing them without saying so would be
 * the app asserting things nobody has checked, so the banner rides above the whole surface
 * exactly as it does in the browser.
 */
@Composable
fun PlaceholderBanner(modifier: Modifier = Modifier) {
    if (!PublicContent.hasUnverifiedClaims) return
    val extended = LocalStoryTailExtended.current
    Surface(
        modifier = modifier.fillMaxWidth(),
        color = extended.warningContainer,
        contentColor = extended.warning,
    ) {
        Text(
            text = "Preview content — some figures, quotes, prices and photos are " +
                "placeholders pending verification.",
            style = MaterialTheme.typography.labelSmall,
            modifier = Modifier
                .statusBarsPadding()
                .padding(horizontal = 16.dp, vertical = 8.dp),
        )
    }
}

/**
 * The footer §2.0 says every public screen carries.
 *
 * It scrolls with the content rather than sitting under the CTA bar — the web build had
 * exactly that bug, and on a phone these are the only route to the legal pages.
 */
@Composable
fun PublicFooter(modifier: Modifier = Modifier) {
    Surface(
        modifier = modifier.fillMaxWidth(),
        color = LocalStoryTailExtended.current.surface2,
    ) {
        Column(
            Modifier.padding(horizontal = 18.dp, vertical = 16.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            HorizontalDivider(
                color = MaterialTheme.colorScheme.outlineVariant,
                modifier = Modifier.padding(bottom = 10.dp),
            )
            Text(
                text = "© Story-Tail Adventures · Hosted by Inteletravel",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Text(
                text = "No planning fees, ever.",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                fontWeight = FontWeight.SemiBold,
            )
        }
    }
}
