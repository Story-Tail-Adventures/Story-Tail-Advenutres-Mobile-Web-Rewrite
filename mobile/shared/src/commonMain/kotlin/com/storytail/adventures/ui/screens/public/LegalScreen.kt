// Screen 2.0.7 Footer Pages — see docs/Screen-Inventory.md §2.0.7 and §4.4 (Pattern I,
// simplified: identical content on every viewport, larger type on mobile) and
// design/source-prototype/screens/client-public-mobile.jsx (M207_FooterPages). P1.
//
// The web twin is web/app/(public)/(plain)/legal/[slug]/. Same four documents, same copy,
// same draft notice — the text itself is generated from web/content/public/legal/*.ts, so
// the only thing that can drift here is the chrome around it.
//
// Stateless, because which document is open is a route parameter (AppRoute.PublicLegal) and
// not local state: these pages get linked to from consent flows and from the footer, and a
// chip that swapped the body in place would leave the back gesture pointing at whichever
// screen the visitor came from rather than at the document they were just reading.
package com.storytail.adventures.ui.screens.public

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.consumeWindowInsets
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.storytail.adventures.content.public.LegalDoc
import com.storytail.adventures.content.public.LegalSection
import com.storytail.adventures.content.public.LegalSlug
import com.storytail.adventures.content.public.PublicContent
import com.storytail.adventures.ui.components.FormWarningCard
import com.storytail.adventures.ui.components.public.PlaceholderBanner
import com.storytail.adventures.ui.components.public.PublicScaffold
import com.storytail.adventures.ui.components.public.PublicTapTarget
import com.storytail.adventures.ui.components.public.PublicTopBar
import com.storytail.adventures.ui.components.public.SectionLabel
import com.storytail.adventures.ui.theme.LocalStoryTailExtended
import com.storytail.adventures.ui.theme.PillShape

/** The gutter the artboard sets on the whole document block. */
private val Gutter = 18.dp

/** Mirrors LEGAL_PAGE.overline / .lastUpdated / .draftNotice in the web twin's content.ts. */
private const val OVERLINE = "LEGAL"
private const val LAST_UPDATED = "Last updated"
private const val DRAFT_NOTICE =
    "Draft — this page has not been reviewed yet. It describes how the portal is meant to " +
        "work; the final wording may change."

/**
 * One of the four legal documents, with the strip that moves between them.
 *
 * No sticky CTA, and that is deliberate: M207 is the one §2.0 artboard that passes no
 * `footer` to `MFrame`. A "Request a quote" bar under a privacy policy would be selling to
 * somebody who came here to check whether we sell their data.
 */
@Composable
fun LegalScreen(
    doc: LegalDoc,
    onSelectDoc: (LegalSlug) -> Unit,
    onMenu: () -> Unit,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
) {
    PublicScaffold(
        modifier = modifier,
        topBar = {
            // PlaceholderBanner is what pads the notch while it is showing, and PublicTopBar
            // pads for it too — stacked, that is two status bars of empty space. So consume
            // the inset for the bar, but ONLY while the banner is actually rendering: it
            // draws nothing once every claim is verified, and consuming unconditionally
            // would slide the bar under the status bar on the day that happens.
            val bannerShowing = PublicContent.hasUnverifiedClaims
            Column {
                PlaceholderBanner()
                Box(
                    if (bannerShowing) {
                        Modifier.consumeWindowInsets(WindowInsets.statusBars)
                    } else {
                        Modifier
                    },
                ) {
                    PublicTopBar(onMenu = onMenu, onBack = onBack)
                }
            }
        },
    ) {
        LegalChipStrip(active = doc.slug, onSelect = onSelectDoc)

        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = Gutter)
                .padding(top = 6.dp, bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            SectionLabel(OVERLINE)
            Text(
                text = doc.title,
                style = MaterialTheme.typography.headlineSmall,
                color = MaterialTheme.colorScheme.onSurface,
                modifier = Modifier.semantics { heading() },
            )
            // The artboard puts a "PDF" link beside the date and the web twin replaced it
            // with "Print this page". There is neither a PDF pipeline nor a print dialog on
            // a phone, so the line is the date and nothing else.
            Text(
                text = "$LAST_UPDATED ${formatUpdated(doc.lastUpdated)}",
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )

            if (doc.isDraft) {
                // The web twin has to override its Alert's role="alert" to keep this quiet;
                // FormWarningCard announces nothing, so there is nothing to override.
                FormWarningCard(DRAFT_NOTICE)
            }

            doc.sections.forEach { section ->
                LegalSectionBlock(section)
            }
        }
    }
}

/**
 * The four documents as a scrolling strip, the open one marked.
 *
 * `selectable` rather than `clickable` so the marked chip is announced as selected — colour
 * is the only other thing saying which document you are reading, and it is the same
 * secondary-container the web sets `aria-current="page"` on.
 */
@Composable
private fun LegalChipStrip(active: LegalSlug, onSelect: (LegalSlug) -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .horizontalScroll(rememberScrollState())
            // Inside the scroll, so the last chip keeps its gutter when the strip is scrolled
            // to the end rather than sitting flush against the edge.
            .padding(horizontal = Gutter)
            .padding(top = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        LegalSlug.entries.mapNotNull(PublicContent::legalBySlug).forEach { entry ->
            LegalChip(
                label = entry.navLabel,
                selected = entry.slug == active,
                onClick = { onSelect(entry.slug) },
            )
        }
    }
}

@Composable
private fun LegalChip(label: String, selected: Boolean, onClick: () -> Unit) {
    val extended = LocalStoryTailExtended.current

    // The tap target is the full-height box; the pill inside keeps the artboard's size. A
    // 48dp-tall pill would read as a row of buttons rather than a chip strip.
    Box(
        modifier = Modifier
            .heightIn(min = PublicTapTarget)
            .selectable(selected = selected, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Surface(
            color =
                if (selected) MaterialTheme.colorScheme.secondaryContainer
                else extended.surface2,
            contentColor =
                if (selected) MaterialTheme.colorScheme.onSecondaryContainer
                else MaterialTheme.colorScheme.onSurfaceVariant,
            shape = PillShape,
        ) {
            Text(
                text = label,
                style = MaterialTheme.typography.labelLarge,
                modifier = Modifier.padding(horizontal = 14.dp, vertical = 8.dp),
            )
        }
    }
}

/**
 * A numbered section: heading, paragraphs, bullets.
 *
 * bodyLarge for the paragraphs and titleMedium for the heading — §4.4 gives this screen
 * larger reading type on mobile than on desktop, which is backwards from every other screen
 * and right here: nobody skims a privacy policy on a phone, they read it. The web twin does
 * the same thing in reverse, dropping `.legal-prose` from 16px to 14px at `md`.
 *
 * The heading carries `heading()` semantics because these documents are long and a screen
 * reader's heading jump is the only fast way through one.
 */
@Composable
private fun LegalSectionBlock(section: LegalSection) {
    Column(
        modifier = Modifier.fillMaxWidth().padding(top = 10.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Text(
            text = section.heading,
            style = MaterialTheme.typography.titleMedium,
            color = MaterialTheme.colorScheme.onSurface,
            modifier = Modifier.semantics { heading() },
        )
        section.paragraphs.forEach { paragraph ->
            Text(
                text = paragraph,
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        section.bullets.forEach { bullet ->
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(
                    text = "•",
                    style = MaterialTheme.typography.bodyLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Text(
                    text = bullet,
                    style = MaterialTheme.typography.bodyLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.weight(1f),
                )
            }
        }
    }
}

/**
 * `2026-09-02` as `September 2, 2026`, matching the web twin's en-US long date.
 *
 * Not `formatLongDate` from domain.onboarding — that one prints `2 September 2026`, because
 * ITS web twin pins en-GB. Two locales in one repo because the two pages were written that
 * way; the rule that holds is that each screen prints what its own browser twin prints.
 *
 * Falls back to the raw ISO string rather than throwing: this text is generated, so a
 * malformed date means the generator broke, and a legal page that renders with an ugly date
 * is worth more than one that does not render at all.
 */
private fun formatUpdated(iso: String): String {
    val parts = iso.split("-")
    val month = parts.getOrNull(1)?.toIntOrNull()?.takeIf { it in 1..12 } ?: return iso
    val day = parts.getOrNull(2)?.toIntOrNull() ?: return iso
    return "${MONTHS[month - 1]} $day, ${parts[0]}"
}

/** Written out rather than looked up, so no device's locale database can restate them. */
private val MONTHS = listOf(
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
)
