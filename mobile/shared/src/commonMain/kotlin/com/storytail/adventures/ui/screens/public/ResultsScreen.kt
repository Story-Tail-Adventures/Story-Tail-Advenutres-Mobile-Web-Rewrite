// Screen 2.0.4 Public Search Results — see docs/Screen-Inventory.md §2.0.4 and §4.4
// (Pattern F; "Save/quote CTAs trigger Sign-up Gate on all viewports") and
// design/source-prototype/screens/client-public-mobile.jsx (M204_PublicSearchResults). P2.
//
// [dest] is the whole of the search state this route carries, so the whole of the filtering
// happens here, in memory, over the curated catalog. The artboard's quick-filter chip row
// and its sort control are deliberately absent: both are filter state, this screen holds
// none, and a chip that cannot change the list below it is a control lying about what it
// does. They arrive with the Phase 2 API search, which swaps the data source without
// touching this layout.
package com.storytail.adventures.ui.screens.public

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.storytail.adventures.content.public.PublicCatalog
import com.storytail.adventures.content.public.Trip
import com.storytail.adventures.ui.components.public.PlaceholderBanner
import com.storytail.adventures.ui.components.public.PublicCard
import com.storytail.adventures.ui.components.public.PublicScaffold
import com.storytail.adventures.ui.components.public.PublicStickyCta
import com.storytail.adventures.ui.components.public.PublicTapTarget
import com.storytail.adventures.ui.components.public.PublicTopBar
import com.storytail.adventures.ui.components.public.TripRow
import com.storytail.adventures.ui.theme.PillShape

/** What the heading calls a search nobody has narrowed. */
private const val EVERYWHERE = "Everywhere Gyasi plans"

/**
 * The anonymous results list.
 *
 * Stateless: the route owns [dest], and every action leaves. Saving and requesting a quote
 * are the same journey for a signed-out visitor — both end at the 2.0.6 gate — which is why
 * both land on [onRequestQuote] rather than the app pretending it can save anything yet.
 */
@Composable
fun ResultsScreen(
    dest: String?,
    onOpenTrip: (slug: String) -> Unit,
    onRequestQuote: (slug: String) -> Unit,
    onCreateAccount: () -> Unit,
    onMenu: () -> Unit,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val results = remember(dest) { resultsFor(dest) }

    PublicScaffold(
        modifier = modifier,
        topBar = {
            // PlaceholderBanner and PublicTopBar each apply `statusBarsPadding` for the
            // screens where they are the first thing on the surface. Stacked, they would pad
            // twice — so the inset is applied and consumed once here, and neither of them
            // then finds anything left to add.
            Column(Modifier.statusBarsPadding()) {
                PlaceholderBanner()
                PublicTopBar(onMenu = onMenu, onBack = onBack)
            }
        },
        stickyCta = {
            // One primary, no secondary. The artboard pairs the save CTA with "Filter", and
            // there is no filter sheet on this route to open; a bar button that does nothing
            // is worse than a bar with one thing on it. The label is the web's corrected
            // wording (web/app/(public)/(plain)/explore/results/content.ts).
            PublicStickyCta(
                primaryLabel = "Create account to save",
                onPrimary = onCreateAccount,
            )
        },
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 14.dp)
                .padding(top = 14.dp, bottom = 18.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Text(
                text = headingFor(results.size, dest),
                style = MaterialTheme.typography.labelLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.semantics { heading() },
            )

            if (results.isEmpty()) {
                EmptyResults(onEditSearch = onBack)
            } else {
                // A plain forEach inside the scaffold's own vertical scroll: the curated
                // catalog is twenty-odd trips. When the Phase 2 API returns hundreds this
                // needs a lazy list, which means a scaffold variant that owns the scroll.
                results.forEach { trip ->
                    TripRow(
                        trip = trip,
                        onOpen = { onOpenTrip(trip.slug) },
                        onRequestQuote = { onRequestQuote(trip.slug) },
                    )
                }
                ResultsNotes()
            }
        }
    }
}

/**
 * The two things a visitor needs before reading the rows above as fact.
 *
 * The artboard prints "FROM $3,290 /pp" on every card; [TripRow] draws the range band
 * instead, and that is the honest form here — every price in the catalog is
 * `pricePlaceholder = true` and carries its own `priceNote`, so a bare figure beside a
 * "Request quote" button would read as the quote. The band still needs saying out loud,
 * because three glyphs look like a price to anyone who has not been told otherwise.
 */
@Composable
private fun ResultsNotes() {
    Text(
        text = "The range chips are Gyasi's rough guide, not a quote for your dates.",
        style = MaterialTheme.typography.labelSmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        textAlign = TextAlign.Center,
        modifier = Modifier.fillMaxWidth(),
    )
    Text(
        text = "Saving a trip or asking for a quote takes a free account — about 60 seconds.",
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        textAlign = TextAlign.Center,
        modifier = Modifier.fillMaxWidth(),
    )
}

/**
 * Nothing matched.
 *
 * Never a dead end. The only way out of a filtered list is back into the search, and on an
 * empty page the chevron in the top bar is the sole affordance on screen — saying so with a
 * real button costs one control and saves somebody guessing.
 */
@Composable
private fun EmptyResults(onEditSearch: () -> Unit) {
    PublicCard {
        Column(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 28.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Text(
                text = "Nothing here matches that yet.",
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.onSurface,
                textAlign = TextAlign.Center,
            )
            Text(
                text = "Gyasi's list is hand-picked, so it is short on purpose. Widen the " +
                    "destination and see what else is waiting.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
            )
            FilledTonalButton(
                onClick = onEditSearch,
                shape = PillShape,
                modifier = Modifier.heightIn(min = PublicTapTarget),
            ) {
                Text("Edit your search")
            }
        }
    }
}

/** "8 trips · Jamaica" — the count first, because the count is what the search changed. */
private fun headingFor(count: Int, dest: String?): String {
    val noun = if (count == 1) "trip" else "trips"
    val where = dest?.trim()?.takeIf { it.isNotEmpty() } ?: EVERYWHERE
    return "$count $noun · $where"
}

/**
 * The catalog, narrowed by the destination text.
 *
 * Word-wise rather than one substring, mirroring `matchesDest` in web/lib/public/search.ts:
 * "jamaica beach" should still find the Negril rows, and requiring every word is what stops
 * "cruise caribbean" matching the whole catalog. Catalog order is left alone — it is already
 * Gyasi's own ordering, and scoring a hand-picked list of twenty would be ranking his
 * choices against each other for no reason.
 */
private fun resultsFor(dest: String?): List<Trip> {
    val words = dest?.trim()?.lowercase()?.split(' ')?.filter { it.isNotBlank() }.orEmpty()
    if (words.isEmpty()) return PublicCatalog.TRIPS

    return PublicCatalog.TRIPS.filter { trip ->
        val haystack = listOf(
            trip.destination.region,
            trip.destination.place,
            trip.name,
        ).joinToString(" ").lowercase()
        words.all { haystack.contains(it) }
    }
}
