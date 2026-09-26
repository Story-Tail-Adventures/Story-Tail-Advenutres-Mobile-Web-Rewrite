package com.storytail.adventures.ui.components.client

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.storytail.adventures.domain.trip.CLIENT_BAR_DESTINATIONS
import com.storytail.adventures.domain.trip.ClientDestination
import com.storytail.adventures.ui.components.StoryTailGlyph
import com.storytail.adventures.ui.components.StoryTailMark
import com.storytail.adventures.ui.theme.LocalStoryTailBrandTypography
import com.storytail.adventures.ui.theme.PillShape

/**
 * The authenticated client surface — the shell every §2.2 screen sits inside.
 *
 * THE ONE STRUCTURAL RULE: the bottom bar is the LAST CHILD OF A COLUMN, not an overlay.
 *
 * That is what kept native §2.0 clear of the bug the web side shipped, where `StickyCta`
 * emitted its own spacer while `PublicFooter` rendered after `{children}` — the reserve
 * landed above the footer and the fixed bar covered six legal links on eight of eleven
 * pages. A sibling bar cannot cover content, because the scroll's `weight(1f)` already
 * excludes it. `PublicScaffold` established this and it is kept here on purpose.
 *
 * There is no Help FAB. Screen-Inventory §6.3 asks for one; the prototype's own
 * StaMobileTabs does not have one, and Gyasi chose the prototype on 2026-09-06.
 */
@Composable
fun ClientScaffold(
    modifier: Modifier = Modifier,
    topBar: @Composable () -> Unit = {},
    /** Null on a pushed screen — a trip detail has a back button, not a tab bar. */
    activeTab: String? = null,
    onSelectTab: (String) -> Unit = {},
    scrollable: Boolean = true,
    contentPadding: PaddingValues = PaddingValues(0.dp),
    /**
     * A bar below the scroll — §2.5's Save/Cancel, and §2.6's composer when it lands.
     *
     * A SIBLING, exactly like [ClientBottomNav], and for the same reason: the scroll's
     * `weight(1f)` already excludes it, so it cannot cover the last field on a short phone.
     * A screen passes this or [activeTab], never both — a tab root has nothing to save and a
     * pushed form has no tabs.
     */
    footer: (@Composable () -> Unit)? = null,
    content: @Composable ColumnScope.() -> Unit,
) {
    Surface(modifier = modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
        Column(
            Modifier
                .fillMaxSize()
                // The STATUS BAR inset, and only that one. Caught on an emulator: without it
                // the dashboard's overline rendered across the clock, because a §2.2 screen
                // may pass no [topBar] at all and then content starts at y=0. The §2.0
                // screens never showed it — every one of them has a top bar of its own.
                //
                // The navigation-bar inset is deliberately NOT applied here. It belongs
                // inside [ClientBottomNav] instead, so the bar's own background extends into
                // the gesture area rather than leaving a strip of page showing beneath it.
                // Applying it in both places would double-count and float the bar.
                .windowInsetsPadding(WindowInsets.statusBars),
        ) {
            topBar()
            Column(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth()
                    .then(if (scrollable) Modifier.verticalScroll(rememberScrollState()) else Modifier)
                    .padding(contentPadding),
            ) {
                content()
            }
            footer?.invoke()
            if (activeTab != null) {
                ClientBottomNav(active = activeTab, onSelect = onSelectTab)
            }
        }
    }
}

/**
 * Four tabs, per the prototype's StaMobileTabs, with a 56×28 active pill in
 * secondary-container.
 *
 * A destination with no screen yet stays VISIBLE and dimmed rather than being filtered out.
 * The alternative — a bar that grows a tab per release — moves every other tab under the
 * user's thumb, and muscle memory is most of why a bottom bar is worth having.
 */
@Composable
fun ClientBottomNav(
    active: String,
    onSelect: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(modifier) {
        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .background(MaterialTheme.colorScheme.surfaceContainerLowest)
                // The system navigation inset, so the bar clears a gesture pill or a
                // three-button bar rather than sitting under it.
                .padding(WindowInsets.navigationBars.asPaddingValues())
                .padding(top = 8.dp, bottom = 10.dp, start = 6.dp, end = 6.dp),
            horizontalArrangement = Arrangement.SpaceAround,
            verticalAlignment = Alignment.Top,
        ) {
            for (destination in CLIENT_BAR_DESTINATIONS) {
                ClientTab(
                    destination = destination,
                    selected = destination.id == active,
                    onSelect = onSelect,
                )
            }
        }
    }
}

private fun markFor(id: String): StoryTailMark = when (id) {
    "trips" -> StoryTailMark.HOME
    "discover" -> StoryTailMark.SEARCH
    "messages" -> StoryTailMark.MESSAGE
    else -> StoryTailMark.USER
}

@Composable
private fun ClientTab(
    destination: ClientDestination,
    selected: Boolean,
    onSelect: (String) -> Unit,
) {
    val scheme = MaterialTheme.colorScheme

    Column(
        modifier = Modifier
            .widthIn(min = 56.dp)
            // §4.2 asks for 44pt minimum on touch; 48dp is the platform's own floor.
            .heightIn(min = 48.dp)
            .then(
                if (destination.built) {
                    Modifier.selectable(
                        selected = selected,
                        role = Role.Tab,
                        onClick = { onSelect(destination.id) },
                    )
                } else {
                    // Not merely unclickable: dimmed, so it does not look pressable, and
                    // left out of the semantics tree's selectable set entirely.
                    Modifier.alpha(0.38f)
                },
            ),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(3.dp),
    ) {
        Box(
            modifier = Modifier
                .size(width = 56.dp, height = 28.dp)
                .then(
                    if (selected) Modifier.background(scheme.secondaryContainer, PillShape)
                    else Modifier,
                ),
            contentAlignment = Alignment.Center,
        ) {
            StoryTailGlyph(
                mark = markFor(destination.id),
                size = 19.dp,
                color = if (selected) scheme.onSecondaryContainer else scheme.onSurfaceVariant,
            )
        }
        Text(
            text = destination.label,
            style = LocalStoryTailBrandTypography.current.labelXS,
            color = if (selected) scheme.onSurface else scheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
        )
    }
}
