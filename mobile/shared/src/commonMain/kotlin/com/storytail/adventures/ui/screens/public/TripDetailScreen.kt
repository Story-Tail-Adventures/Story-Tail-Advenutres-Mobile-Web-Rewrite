// Screen 2.0m.5 Public Property / Cruise / Tour Detail — see docs/Screen-Inventory.md §2.0.5
// (Pattern C, §4.4) and design/source-prototype/screens/client-public-mobile.jsx
// `M205_PublicDetail`. P2.
//
// Everything on this page is read-only; the three things a visitor can DO from it live on the
// sticky bar, because §4.4 puts "Message Gyasi without an account" there on mobile and the
// other two ("Request a quote", "Favorite") are the CTAs it sits beside.
package com.storytail.adventures.ui.screens.public

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.storytail.adventures.content.public.Money
import com.storytail.adventures.content.public.Trip
import com.storytail.adventures.content.public.TripHighlight
import com.storytail.adventures.content.public.TripType
import com.storytail.adventures.ui.components.public.NoteCard
import com.storytail.adventures.ui.components.public.PlaceholderBanner
import com.storytail.adventures.ui.components.public.PublicCard
import com.storytail.adventures.ui.components.public.PublicHero
import com.storytail.adventures.ui.components.public.PublicScaffold
import com.storytail.adventures.ui.components.public.PublicStickyCta
import com.storytail.adventures.ui.components.public.PublicTopBar
import com.storytail.adventures.ui.theme.LocalStoryTailExtended
import com.storytail.adventures.ui.theme.PillShape
import com.storytail.adventures.ui.theme.StoryTailBrand

private object TripDetailCopy {
    // Verbatim from the web twin — web/app/(public)/(hero)/explore/[slug]/content.ts and its
    // PriceCard. The same trip has to read the same way in the browser and on the phone.
    const val WHAT_IT_IS = "What it is"
    const val SAMPLE_ITINERARY = "Sample itinerary"
    const val STARTING_AT = "STARTING AT"
    const val PER_PERSON = "/person"
    const val REQUEST_QUOTE = "Request a quote"
    const val FAVORITE = "Favorite"
    const val MESSAGE_GUEST = "Message Gyasi without an account →"

    // The advisor card. Web's AdvisorCard carries a title and a subtitle; NoteCard has one
    // overline and one body, so the subtitle joins the line and the overline says whose card
    // this is. "Gyasi knows this one well" is the web line for every trip except Sandals Royal
    // Bahamian, which reads "Gyasi planned 14 of these" — that count is an unverified claim
    // reachable only through the generated PublicCatalog.CLAIMS, and a slug-to-claim map does
    // not belong in a screen file.
    const val ADVISOR_LABEL = "YOUR ADVISOR"
    const val ADVISOR_BODY = "Gyasi knows this one well · Caribbean specialist"
    const val ADVISOR_INITIALS = "GS"
}

/**
 * 2.0.5, for one catalog trip.
 *
 * [onRequestQuote] and [onSave] both lead to the sign-up gate (2.0.6) — the Screen Inventory
 * gates both actions behind an account. [onMessageGyasi] is the path that does not: in Phase 1
 * it opens a prefilled email, per the 2.0.5 Phase 1 note, and it is the reason the sticky bar
 * has a second row.
 */
@Composable
fun TripDetailScreen(
    trip: Trip,
    onRequestQuote: () -> Unit,
    onSave: () -> Unit,
    onMessageGyasi: () -> Unit,
    onMenu: () -> Unit,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
) {
    PublicScaffold(
        modifier = modifier,
        // The banner is the scaffold's top bar rather than the first thing inside the scroll.
        // It is what qualifies the price further down the page, and a disclaimer that scrolls
        // away before the figure it disclaims arrives is not doing its job. The hero keeps its
        // own bar, floating on the photo.
        topBar = { PlaceholderBanner() },
        stickyCta = {
            PublicStickyCta(
                primaryLabel = TripDetailCopy.REQUEST_QUOTE,
                onPrimary = onRequestQuote,
                secondaryLabel = TripDetailCopy.FAVORITE,
                onSecondary = onSave,
                // §4.4: "'Message Gyasi without an account' is a sticky bottom button on
                // mobile." It takes its own row because three controls will not share one on a
                // 360dp phone.
                guestLabel = TripDetailCopy.MESSAGE_GUEST,
                onGuest = onMessageGyasi,
            )
        },
    ) {
        PublicHero(
            // heroImageKey is the wide crop when the catalog has one; imageKey is the tile's.
            imageKey = trip.heroImageKey ?: trip.imageKey,
            overline = heroBadge(trip),
            title = trip.name,
            sub = trip.destination.place,
            topBar = { PublicTopBar(onMenu = onMenu, onPhoto = true, onBack = onBack) },
        )

        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 22.dp, vertical = 18.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                SectionTitle(TripDetailCopy.WHAT_IT_IS)
                Text(
                    text = trip.description,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            HighlightGrid(trip.highlights)

            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                SectionTitle(TripDetailCopy.SAMPLE_ITINERARY)
                trip.sampleItinerary.forEachIndexed { index, day ->
                    ItineraryRow(number = index + 1, day = day)
                }
            }

            PriceBlock(trip)

            NoteCard(
                label = TripDetailCopy.ADVISOR_LABEL,
                body = TripDetailCopy.ADVISOR_BODY,
                initials = TripDetailCopy.ADVISOR_INITIALS,
            )
        }
    }
}

/**
 * The artboard's `t-title-l` section heading.
 *
 * Local rather than [com.storytail.adventures.ui.components.public.SectionHeading], which
 * always draws the orange overline the §2.0 bands open with — this screen's two headings have
 * none. Announced as a heading so a screen reader can jump between them, like the web's `h2`.
 */
@Composable
private fun SectionTitle(text: String) {
    Text(
        text = text,
        style = MaterialTheme.typography.titleLarge,
        color = MaterialTheme.colorScheme.onSurface,
        modifier = Modifier.semantics { heading() },
    )
}

/** The two-up amenity grid under the description. */
@Composable
private fun HighlightGrid(highlights: List<TripHighlight>, modifier: Modifier = Modifier) {
    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        highlights.chunked(2).forEach { pair ->
            // IntrinsicSize.Min plus fillMaxHeight is what keeps a pair level when one label
            // wraps to two lines and the other does not — the same trick TripRow uses. Rows
            // rather than a LazyVerticalGrid because this sits inside the scaffold's own
            // vertical scroll, where a lazy grid has no bounded height to measure against.
            Row(
                modifier = Modifier.fillMaxWidth().height(IntrinsicSize.Min),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                pair.forEach { highlight ->
                    HighlightTile(highlight, Modifier.weight(1f).fillMaxHeight())
                }
                // An odd last highlight keeps its half of the row instead of stretching across
                // the full width, which would read as a different kind of thing.
                if (pair.size == 1) Spacer(Modifier.weight(1f))
            }
        }
    }
}

@Composable
private fun HighlightTile(highlight: TripHighlight, modifier: Modifier = Modifier) {
    Surface(
        modifier = modifier,
        color = LocalStoryTailExtended.current.surface2,
        shape = MaterialTheme.shapes.small,
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            // TripHighlight.icon names a glyph in the design's set; the app bundles no icon
            // font yet (PublicTopBar draws its own for the same reason), so the marker is a
            // brand dot. It is decorative — the label beside it carries the meaning.
            Box(Modifier.size(6.dp).background(StoryTailBrand.Orange, PillShape))
            Text(
                text = highlight.text,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurface,
            )
        }
    }
}

/** One day of the sample itinerary: its number in a badge, then the line from the catalog. */
@Composable
private fun ItineraryRow(number: Int, day: String) {
    PublicCard {
        Row(
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Surface(
                modifier = Modifier.size(22.dp),
                shape = PillShape,
                color = MaterialTheme.colorScheme.secondaryContainer,
                contentColor = MaterialTheme.colorScheme.onSecondaryContainer,
            ) {
                Box(contentAlignment = Alignment.Center) {
                    Text(number.toString(), style = MaterialTheme.typography.labelSmall)
                }
            }
            Text(
                text = day,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurface,
            )
        }
    }
}

/**
 * "STARTING AT · $3,290 /person", with the trip's own note under it.
 *
 * The web draws this figure in the mobile sticky bar; [PublicStickyCta] has no price slot, and
 * that turns out to be the better place for it anyway — [Trip.priceNote] is what says the
 * number is a placeholder rather than a quote, and it has to sit beside the number it
 * qualifies rather than a screen away from it.
 */
@Composable
private fun PriceBlock(trip: Trip, modifier: Modifier = Modifier) {
    PublicCard(modifier) {
        Column(
            modifier = Modifier.padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Text(
                text = TripDetailCopy.STARTING_AT,
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Row {
                Text(
                    text = trip.from.formatWholeDollars(),
                    style = MaterialTheme.typography.headlineSmall,
                    color = MaterialTheme.colorScheme.onSurface,
                    modifier = Modifier.alignByBaseline(),
                )
                Text(
                    text = " ${TripDetailCopy.PER_PERSON}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.alignByBaseline(),
                )
            }
            Text(
                text = trip.priceNote,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

/** Mirrors TRIP_TYPE_LABELS in web/lib/public/search.ts. */
private fun TripType.label(): String = when (this) {
    TripType.ALL_INCLUSIVE -> "All-inclusive"
    TripType.CRUISE -> "Cruise"
    TripType.HOTEL -> "Hotel"
    TripType.TOUR -> "Tour"
}

/**
 * The hero's overline: "ALL-INCLUSIVE · 7 NIGHTS" (web's `tripBadge`).
 *
 * Uppercased here because PublicHero prints the overline as it is given — the catalog's own
 * overlines arrive already uppercase, and this one is assembled rather than stored. Nights are
 * optional: a hotel stay in the catalog has no fixed length.
 */
private fun heroBadge(trip: Trip): String {
    val nights = trip.nights ?: return trip.type.label().uppercase()
    val unit = if (nights == 1) "night" else "nights"
    return "${trip.type.label()} · $nights $unit".uppercase()
}

/**
 * "$3,290" — whole dollars, grouped in threes.
 *
 * Kotlin common has no NumberFormat and cannot borrow the web twin's `Intl.NumberFormat`, so
 * the grouping happens here. Whole dollars, matching `formatMoney(money, { whole: true })`:
 * every catalog price is a round figure, and printing cents on a "starting at" number would
 * imply a precision this figure does not have. A currency other than USD prints its code
 * rather than this guessing at a symbol.
 */
private fun Money.formatWholeDollars(): String {
    val grouped = (amountCents / 100)
        .toString()
        .reversed()
        .chunked(3)
        .joinToString(",")
        .reversed()
    return if (currency == "USD") "\$$grouped" else "$currency $grouped"
}
