// Screen 2.0.3 Public Search Landing — see docs/Screen-Inventory.md §2.0.3 and §4.4
// (Pattern F, entry variant) and design/source-prototype/screens/client-public-mobile.jsx
// (M203_PublicSearchLanding). P2, built ahead of phase.
//
// §2.0.3 lists a persistent "sign in or create an account to save searches" banner. On a
// phone that banner IS the sticky bar's "Sign in" — §4.4 says the mobile strip carries it,
// and the web twin renders its own banner from `md` up for the same reason.
package com.storytail.adventures.ui.screens.public

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.consumeWindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import com.storytail.adventures.content.public.InspirationTile
import com.storytail.adventures.content.public.PublicCatalog
import com.storytail.adventures.content.public.PublicContent
import com.storytail.adventures.ui.components.public.HeroHeight
import com.storytail.adventures.ui.components.public.NoteCard
import com.storytail.adventures.ui.components.public.PlaceholderBanner
import com.storytail.adventures.ui.components.public.PublicCard
import com.storytail.adventures.ui.components.public.PublicHero
import com.storytail.adventures.ui.components.public.PublicPhotoFill
import com.storytail.adventures.ui.components.public.PublicScaffold
import com.storytail.adventures.ui.components.public.PublicStickyCta
import com.storytail.adventures.ui.components.public.PublicTapTarget
import com.storytail.adventures.ui.components.public.PublicTopBar
import com.storytail.adventures.ui.theme.PillShape
import com.storytail.adventures.ui.theme.StoryTailBrand

/** The hero photo M203 opens on. */
private const val HERO_IMAGE = "bahamas"

/** The artboard's fixed label column, which keeps the three values on one left edge. */
private val FieldLabelWidth = 86.dp

/**
 * The one §2.0 screen that holds state, because it is the only one with a form.
 *
 * [onSearch] receives the destination as typed and trimmed — including the empty string,
 * which is a real search ("show me everything"), not a failure. The route it feeds,
 * [com.storytail.adventures.ui.nav.AppRoute.PublicResults], takes a nullable destination for
 * exactly that case.
 */
@Composable
fun ExploreScreen(
    onSearch: (dest: String) -> Unit,
    onOpenTile: (slug: String) -> Unit,
    onSignIn: () -> Unit,
    onMenu: () -> Unit,
    onBack: () -> Unit,
) {
    var destination by remember { mutableStateOf("") }
    val runSearch = { onSearch(destination.trim()) }

    // PlaceholderBanner and PublicTopBar each apply `statusBarsPadding` for the screens where
    // they are the first thing on the surface. Here the banner is, and the bar floats on the
    // hero underneath it — so the hero's subtree is told the notch is already spent, or the
    // two would take it twice and drop the wordmark into the middle of the photo. Conditional
    // on the same flag the banner itself reads: when the claims registry is finally verified
    // the banner stops rendering, and the hero has to get the notch back.
    val bannerShowing = PublicContent.hasUnverifiedClaims

    PublicScaffold(
        // The Search control lives in the bar at the very bottom, and the keyboard opens over
        // the field that feeds it. Without this it would be the one button somebody cannot
        // reach while typing into the search it belongs to.
        modifier = Modifier.imePadding(),
        topBar = { PlaceholderBanner() },
        stickyCta = {
            PublicStickyCta(
                primaryLabel = "Search",
                onPrimary = runSearch,
                secondaryLabel = "Sign in",
                onSecondary = onSignIn,
            )
        },
    ) {
        Box(
            if (bannerShowing) Modifier.consumeWindowInsets(WindowInsets.statusBars)
            else Modifier,
        ) {
            PublicHero(
                imageKey = HERO_IMAGE,
                overline = "BROWSE WITHOUT AN ACCOUNT",
                title = "Find your next chapter.",
                height = HeroHeight.COMPACT,
                topBar = {
                    // Back as well as the menu. The artboard draws this page inside browser
                    // chrome that supplies a back button; the app has none, and 2.0.1 sends
                    // people here.
                    PublicTopBar(onMenu = onMenu, onPhoto = true, onBack = onBack)
                },
            )
        }

        Column(
            Modifier
                .fillMaxWidth()
                .padding(horizontal = 22.dp)
                .padding(top = 16.dp, bottom = 24.dp),
        ) {
            // M203's card carries no button of its own — the sticky bar is the submit. The
            // web build learned the other half of this the hard way: a Search that ignores
            // what the visitor typed is worse than no Search, so the bar reads this field
            // rather than navigating to a bare results page.
            PublicCard {
                Column(Modifier.padding(horizontal = 12.dp, vertical = 2.dp)) {
                    SearchFieldRow(label = "Destination") {
                        BasicTextField(
                            value = destination,
                            onValueChange = { destination = it },
                            singleLine = true,
                            textStyle = MaterialTheme.typography.titleSmall.copy(
                                color = MaterialTheme.colorScheme.onSurface,
                            ),
                            cursorBrush = SolidColor(StoryTailBrand.Orange),
                            keyboardOptions = KeyboardOptions(
                                imeAction = ImeAction.Search,
                                autoCorrectEnabled = false,
                            ),
                            // The keyboard's own Search key does what the bar does. Somebody
                            // who has just finished typing should not have to dismiss the
                            // keyboard to find the way out of the field.
                            keyboardActions = KeyboardActions(onSearch = { runSearch() }),
                            modifier = Modifier.weight(1f).heightIn(min = PublicTapTarget),
                            decorationBox = { field ->
                                Box(contentAlignment = Alignment.CenterStart) {
                                    if (destination.isEmpty()) {
                                        Text(
                                            text = "Caribbean",
                                            style = MaterialTheme.typography.titleSmall,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                                        )
                                    }
                                    field()
                                }
                            },
                        )
                    }
                    HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)

                    // Dates and travelers are shown, not typed. The results route carries a
                    // destination and nothing else, so a filled-in date would be dropped at
                    // the navigation boundary — a field that quietly discards what somebody
                    // wrote is the same lie as a Search that ignores it. When 2.0.4 grows the
                    // rest of the query, these become inputs beside the first one.
                    SearchFieldRow(label = "Dates") { FieldValue("Whenever suits you") }
                    HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                    SearchFieldRow(label = "Travelers") { FieldValue("However many are coming") }
                }
            }

            Text(
                text = "Destination is enough to start. Gyasi sorts out dates and travelers " +
                    "when you ask.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = 8.dp),
            )

            Text(
                text = "Inspiration · curated",
                style = MaterialTheme.typography.titleLarge,
                color = MaterialTheme.colorScheme.onSurface,
                modifier = Modifier.padding(top = 22.dp).semantics { heading() },
            )
            Text(
                text = "Six trip types we live and breathe. Tap any to start a search.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = 4.dp, bottom = 10.dp),
            )

            // Two-up, chunked by hand rather than a LazyVerticalGrid: the whole screen is one
            // vertical scroll and a lazy grid inside it scrolls the same axis. Six tiles cost
            // nothing to lay out eagerly.
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                PublicCatalog.INSPIRATION_TILES.chunked(2).forEach { pair ->
                    Row(
                        Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        pair.forEach { tile ->
                            InspirationTileCard(
                                tile = tile,
                                onOpen = { onOpenTile(tile.slug) },
                                modifier = Modifier.weight(1f),
                            )
                        }
                        // An odd tile count would otherwise stretch the last one to full
                        // width and break the grid's rhythm.
                        if (pair.size == 1) Spacer(Modifier.weight(1f))
                    }
                }
            }

            NoteCard(
                label = "TRUSTED",
                body = trustLine(),
                modifier = Modifier.padding(top = 18.dp),
            )
        }
    }
}

/**
 * One row of the stacked search card: marker, fixed-width label, then the value or the field.
 *
 * The row clears [PublicTapTarget] whether or not its content is interactive, which is what
 * makes the destination input comfortable to hit — a bare text field is only as tall as its
 * text.
 */
@Composable
private fun SearchFieldRow(label: String, content: @Composable RowScope.() -> Unit) {
    Row(
        Modifier.fillMaxWidth().heightIn(min = PublicTapTarget),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        // The artboard sets a map / calendar / user glyph here. The app bundles no icon set —
        // PublicTopBar draws its menu from three rules for the same reason — so the marker is
        // a dot in that same orange, which keeps the row's rhythm without inventing glyphs.
        Box(Modifier.size(6.dp).background(StoryTailBrand.Orange, PillShape))
        Text(
            text = label,
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.width(FieldLabelWidth),
        )
        content()
    }
}

/** A row's value where there is no field — quieter than typed text, because it is not. */
@Composable
private fun FieldValue(text: String) {
    Text(
        text = text,
        style = MaterialTheme.typography.titleSmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
}

/**
 * An inspiration tile: the brand photo plate, a scrim, and the two lines the artboard puts on
 * it.
 *
 * The count is derived from the catalog rather than typed. A tile that promises twelve trips
 * and opens on four is a small lie, and it is the kind that costs trust on the one screen
 * whose whole job is earning it.
 */
@Composable
private fun InspirationTileCard(
    tile: InspirationTile,
    onOpen: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val count = PublicContent.countFor(tile.query)

    Box(
        modifier
            .aspectRatio(5f / 4f)
            .clip(MaterialTheme.shapes.large)
            .clickable(onClick = onOpen),
    ) {
        // Decorative: the tile's own words say what it is, so a second reading of the same
        // thing is noise for a screen reader.
        PublicPhotoFill(tile.imageKey)
        Box(
            Modifier
                .fillMaxSize()
                .background(
                    Brush.verticalGradient(
                        0.45f to Color.Transparent,
                        1f to StoryTailBrand.Navy.copy(alpha = 0.85f),
                    ),
                ),
        )
        Column(
            Modifier
                .align(Alignment.BottomStart)
                .padding(horizontal = 10.dp, vertical = 8.dp),
        ) {
            // Brand tokens, not scheme colours: white on a scrimmed photo reads the same in
            // both schemes, where onSurface would invert into the scrim in dark.
            Text(
                text = tile.title,
                style = MaterialTheme.typography.titleSmall,
                color = Color.White,
            )
            Text(
                text = "$count active",
                style = MaterialTheme.typography.labelSmall,
                color = Color.White.copy(alpha = 0.85f),
            )
        }
    }
}

/**
 * The trust row, assembled from the claims registry instead of typed.
 *
 * Every figure in it is still `verified = false` — which is what PlaceholderBanner at the top
 * of this screen says out loud. Reading them from CLAIMS means the day Gyasi verifies a
 * number, or corrects one, this line moves with it; a rating hardcoded into a screen is a
 * number nobody can find again. Missing ids drop out rather than printing a blank, so a
 * renamed claim shortens the line instead of asserting something empty.
 */
private fun trustLine(): String = listOfNotNull(
    claim("credInteletravel"),
    claim("credClia"),
    // The rating and the count only mean anything together: "4.9" on its own is a score out
    // of nothing.
    claim("ratingValue")?.let { rating ->
        claim("reviewCount")?.let { reviews -> "$rating★ from $reviews travelers" }
    },
).joinToString(" · ")

private fun claim(id: String): String? =
    PublicCatalog.CLAIMS.firstOrNull { it.id == id }?.display
