// The repeating pieces of Screen Inventory §2.0: heroes, trip rows, the range chip, the FAQ
// accordion and the menu behind the top bar's control.
//
// Mirrors MHero, MTripTile, MPriceRange and the menu in
// design/source-prototype/screens/client-public-mobile.jsx.
package com.storytail.adventures.ui.components.public

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.storytail.adventures.content.public.FaqItem
import com.storytail.adventures.content.public.PriceBand
import com.storytail.adventures.content.public.Topic
import com.storytail.adventures.content.public.Trip
import com.storytail.adventures.ui.theme.LocalStoryTailBrandTypography
import com.storytail.adventures.ui.theme.LocalStoryTailExtended
import com.storytail.adventures.ui.theme.PillShape
import com.storytail.adventures.ui.theme.StoryTailBrand

/** MHero heights. The artboards draw 280 for a topic page and 360 for honeymoons. */
enum class HeroHeight(val dp: androidx.compose.ui.unit.Dp) {
    COMPACT(220.dp), NORMAL(280.dp), TALL(360.dp), FILL(540.dp)
}

/**
 * MHero: a photograph under a navy-to-burgundy scrim, with the top bar floating on it and
 * the words pinned to its bottom edge.
 *
 * [script] is the Caveat half of the headline — the artboards break every §2.0 hero title
 * across a sans clause and a script one, and the script half is always sunset gold.
 */
@Composable
fun PublicHero(
    imageKey: String,
    overline: String,
    title: String,
    modifier: Modifier = Modifier,
    script: String? = null,
    sub: String? = null,
    height: HeroHeight = HeroHeight.NORMAL,
    topBar: @Composable () -> Unit = {},
) {
    val brandType = LocalStoryTailBrandTypography.current

    Box(modifier.fillMaxWidth().height(height.dp)) {
        PublicPhotoFill(imageKey)
        // The scrim. Brand tokens only, so it is identical in both schemes — white on a
        // beach photo stays white whichever way the app is themed.
        Box(
            Modifier
                .fillMaxWidth()
                .height(height.dp)
                .background(
                    Brush.verticalGradient(
                        listOf(
                            StoryTailBrand.Navy.copy(alpha = 0.45f),
                            StoryTailBrand.Burgundy.copy(alpha = 0.55f),
                            StoryTailBrand.Navy.copy(alpha = 0.90f),
                        ),
                    ),
                ),
        )
        Column(Modifier.fillMaxWidth()) {
            topBar()
        }
        Column(
            modifier = Modifier
                .align(Alignment.BottomStart)
                .fillMaxWidth()
                .padding(horizontal = 22.dp, vertical = 18.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Text(
                text = overline,
                style = MaterialTheme.typography.labelSmall,
                color = StoryTailBrand.Sunset,
            )
            Text(
                text = title,
                style = MaterialTheme.typography.headlineMedium,
                color = Color.White,
                modifier = Modifier.semantics { heading() },
            )
            if (script != null) {
                Text(
                    text = script,
                    style = brandType.script.copy(fontSize = MaterialTheme.typography.headlineLarge.fontSize),
                    color = StoryTailBrand.Sunset,
                )
            }
            if (sub != null) {
                Text(
                    text = sub,
                    style = MaterialTheme.typography.bodySmall,
                    color = Color.White.copy(alpha = 0.88f),
                )
            }
        }
    }
}

/**
 * MPriceRange: three glyphs, the first [PriceBand.dots] of them lit.
 *
 * Drawn rather than printed so "$$" cannot be mistaken for a price, and so it reads the
 * same at any type size. The band is announced in words for a screen reader, which "$$"
 * alone is not.
 */
@Composable
fun PriceRangeDots(band: PriceBand, modifier: Modifier = Modifier) {
    Surface(
        modifier = modifier,
        color = StoryTailBrand.Navy.copy(alpha = 0.85f),
        shape = RoundedCornerShape(5.dp),
    ) {
        Row(
            Modifier.padding(horizontal = 7.dp, vertical = 2.dp),
            horizontalArrangement = Arrangement.spacedBy(1.dp),
        ) {
            repeat(3) { index ->
                Text(
                    text = "$",
                    style = MaterialTheme.typography.labelSmall,
                    color = Color.White.copy(alpha = if (index < band.dots) 1f else 0.32f),
                )
            }
        }
    }
}

/**
 * MTripTile: the image-left row every §2.0 grid becomes on a phone.
 *
 * [topic] picks up that page's placement overrides — the same resort carries a different
 * overline on Caribbean than on Honeymoons.
 */
@Composable
fun TripRow(
    trip: Trip,
    onOpen: () -> Unit,
    onRequestQuote: () -> Unit,
    modifier: Modifier = Modifier,
    topic: Topic? = null,
) {
    val badge = trip.badgeFor(topic)

    PublicCard(modifier.clickable(onClick = onOpen)) {
        // IntrinsicSize.Min: the photo column has no height of its own, so it takes the
        // text column's — which is what makes the image fill the row rather than the row
        // collapse to the image.
        Row(Modifier.height(IntrinsicSize.Min)) {
            Box(Modifier.width(120.dp).fillMaxHeight()) {
                PublicPhotoFill(trip.imageKey)
                if (badge != null) {
                    Surface(
                        modifier = Modifier.padding(6.dp),
                        color = MaterialTheme.colorScheme.secondary,
                        contentColor = MaterialTheme.colorScheme.onSecondary,
                        shape = RoundedCornerShape(4.dp),
                    ) {
                        Text(
                            text = badge.uppercase(),
                            style = MaterialTheme.typography.labelSmall,
                            modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
                        )
                    }
                }
            }
            Column(
                Modifier.weight(1f).padding(12.dp),
                verticalArrangement = Arrangement.spacedBy(2.dp),
            ) {
                Row(
                    Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.Top,
                ) {
                    Text(
                        text = trip.overlineFor(topic),
                        style = MaterialTheme.typography.labelSmall,
                        color = StoryTailBrand.Orange,
                        modifier = Modifier.weight(1f, fill = false),
                    )
                    PriceRangeDots(trip.band)
                }
                Text(
                    text = trip.name,
                    style = MaterialTheme.typography.titleSmall,
                    color = MaterialTheme.colorScheme.onSurface,
                )
                Text(
                    text = trip.taglineFor(topic),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Spacer(Modifier.height(6.dp))
                Button(
                    onClick = onRequestQuote,
                    shape = PillShape,
                    modifier = Modifier.heightIn(min = PublicTapTarget),
                ) {
                    Text("Request quote")
                }
            }
        }
    }
}

/**
 * The FAQ, as a set of disclosures.
 *
 * Pattern I calls for an accordion on mobile. Each row is a real toggle rather than a
 * styled box, so a screen reader announces that it expands and what it now shows.
 */
@Composable
fun FaqAccordion(items: List<FaqItem>, modifier: Modifier = Modifier) {
    Column(modifier.fillMaxWidth()) {
        items.forEachIndexed { index, item ->
            FaqRow(item)
            if (index < items.lastIndex) {
                HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
            }
        }
    }
}

@Composable
private fun FaqRow(item: FaqItem) {
    var expanded by remember { mutableStateOf(false) }

    Column(
        Modifier
            .fillMaxWidth()
            .clickable { expanded = !expanded }
            .padding(vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Row(
            Modifier.fillMaxWidth().heightIn(min = 24.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = item.q,
                style = MaterialTheme.typography.titleSmall,
                color = MaterialTheme.colorScheme.onSurface,
                modifier = Modifier.weight(1f),
            )
            Text(
                text = if (expanded) "–" else "+",
                style = MaterialTheme.typography.titleLarge,
                color = StoryTailBrand.Orange,
            )
        }
        AnimatedVisibility(expanded) {
            Text(
                text = item.a,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

/** A wrapping row of read-only labels — cruise lines, amenities, credentials. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun PublicChips(labels: List<String>, modifier: Modifier = Modifier) {
    FlowRow(
        modifier = modifier,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        labels.forEach { label ->
            Surface(
                color = LocalStoryTailExtended.current.surface3,
                shape = PillShape,
            ) {
                Text(
                    text = label,
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
                )
            }
        }
    }
}

/**
 * The closing band every topic page ends on: a gradient card, a promise, and the two ways
 * in.
 */
@Composable
fun ClosingCta(
    title: String,
    body: String,
    primaryLabel: String,
    onPrimary: () -> Unit,
    secondaryLabel: String,
    onSecondary: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = MaterialTheme.shapes.extraLarge,
        color = Color.Transparent,
    ) {
        Column(
            Modifier
                .background(
                    Brush.linearGradient(
                        listOf(StoryTailBrand.Burgundy, StoryTailBrand.Navy),
                    ),
                )
                .padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Text(
                text = title,
                style = MaterialTheme.typography.titleLarge,
                color = Color.White,
                fontWeight = FontWeight.Bold,
            )
            Text(
                text = body,
                style = MaterialTheme.typography.bodySmall,
                color = Color.White.copy(alpha = 0.88f),
            )
            Button(
                onClick = onPrimary,
                shape = PillShape,
                modifier = Modifier.fillMaxWidth().heightIn(min = PublicTapTarget),
            ) {
                Text(primaryLabel)
            }
            OutlinedButton(
                onClick = onSecondary,
                shape = PillShape,
                modifier = Modifier.fillMaxWidth().heightIn(min = PublicTapTarget),
            ) {
                Text(secondaryLabel, color = Color.White)
            }
        }
    }
}

/** A quiet block of body copy with an orange overline — the artboards' note cards. */
@Composable
fun NoteCard(
    label: String,
    body: String,
    modifier: Modifier = Modifier,
    initials: String? = null,
) {
    Surface(
        modifier = modifier.fillMaxWidth(),
        color = LocalStoryTailExtended.current.surface2,
        shape = MaterialTheme.shapes.large,
    ) {
        Row(
            Modifier.padding(14.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            if (initials != null) {
                Surface(
                    modifier = Modifier.size(44.dp),
                    shape = PillShape,
                    color = MaterialTheme.colorScheme.primaryContainer,
                    contentColor = MaterialTheme.colorScheme.onPrimaryContainer,
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Text(initials, style = MaterialTheme.typography.titleSmall)
                    }
                }
            }
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                SectionLabel(label)
                Text(
                    text = body,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurface,
                )
            }
        }
    }
}

/** "See all N …" — the link out of a curated grid into the full list. */
@Composable
fun SeeAllButton(label: String, onClick: () -> Unit, modifier: Modifier = Modifier) {
    TextButton(
        onClick = onClick,
        modifier = modifier.fillMaxWidth().heightIn(min = PublicTapTarget),
    ) {
        Text(label)
    }
}
