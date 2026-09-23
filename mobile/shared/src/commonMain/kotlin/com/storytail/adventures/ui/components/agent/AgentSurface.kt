package com.storytail.adventures.ui.components.agent

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
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.storytail.adventures.domain.agent.AGENT_BAR_DESTINATIONS
import com.storytail.adventures.domain.agent.AgentCopy
import com.storytail.adventures.domain.agent.AgentDestination
import com.storytail.adventures.ui.components.StoryTailGlyph
import com.storytail.adventures.ui.components.StoryTailMark
import com.storytail.adventures.ui.theme.LocalStoryTailBrandTypography
import com.storytail.adventures.ui.theme.PillShape

/**
 * The advisor's shell. §3.2's counterpart to `ClientSurface.kt`.
 *
 * DELIBERATELY THE SAME STRUCTURE, down to the inset split — the two files draw one app and
 * must not drift. Only the bar's contents differ, and §6.6 is why: Worklist, Clients,
 * Messages, More, against the client's Trips, Discover, Messages, Account.
 *
 * COPIED RATHER THAN PARAMETERISED. `ClientScaffold` takes `activeTab: String?` and reads
 * `CLIENT_BAR_DESTINATIONS` directly; adding a role parameter would make every one of §2.x's
 * call sites carry an argument it can only ever pass one value for. The two shells stay
 * apart because of what renders them, which is also why nothing under `ui/screens/agent/`
 * imports `ClientScaffold`.
 */
@Composable
fun AgentScaffold(
    modifier: Modifier = Modifier,
    topBar: @Composable () -> Unit = {},
    /** Null on a pushed screen. Every §3.2 screen in this slice is a tab root. */
    activeTab: String? = null,
    onSelectTab: (String) -> Unit = {},
    scrollable: Boolean = true,
    contentPadding: PaddingValues = PaddingValues(0.dp),
    content: @Composable ColumnScope.() -> Unit,
) {
    Surface(modifier = modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
        Column(
            Modifier
                .fillMaxSize()
                // The STATUS BAR inset, and only that one — the navigation-bar inset belongs
                // inside [AgentBottomNav] so the bar's own background extends into the
                // gesture area. Applying it in both places double-counts and floats the bar.
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
            // A SIBLING of the scroll, never an overlay. The scroll's `weight(1f)` already
            // excludes it, so it cannot cover the last row on a short phone — the rule that
            // kept native §2.0 clear of the sticky-CTA overlap the web side shipped.
            if (activeTab != null) {
                AgentBottomNav(active = activeTab, onSelect = onSelectTab)
            }
        }
    }
}

/**
 * The advisor's top bar, and the only way off this surface.
 *
 * WHY SIGN-OUT LIVES HERE RATHER THAN BEHIND "MORE". Worklist is the whole agent shell in
 * this slice: `nav.resetTo` clears the stack so system back is disabled, and Clients,
 * Messages and More are all `built = false`, which [AgentTab] draws dimmed and unpressable.
 * Until §3.12 builds More there is no other screen to put this on, and before §3.2 an agent
 * signing in on a phone landed in the CLIENT shell, whose Account tab has one — so shipping
 * without it would REMOVE the only sign-out an agent had rather than merely not add one.
 * That matters most on iOS, where `PlatformBackHandler` is a deliberate no-op and there is
 * no system exit at all, and the session is restored from storage on every relaunch.
 *
 * A WORD, NOT A GLYPH. There is no logout mark in [StoryTailMark], and an unlabelled icon is
 * the opposite of "somewhere a phone user will find it". When §3.12 lands, More takes this
 * over and this bar keeps the title.
 *
 * NO BRAND LOCKUP, unlike the web top bar. [com.storytail.adventures.ui.components.BrandMark]
 * takes a HEIGHT with an 80dp floor — below that the light lockup's "ADVENTURES" line stops
 * being readable — and the dark scheme's lockup is a near-square badge, so the mark would
 * cost 80dp of a phone screen above the densest surface in the product. The screen's own
 * name is the orientation a phone needs here; §6.6's whole argument for this surface is
 * on-the-go density.
 *
 * 56dp and a divider, the same bar [com.storytail.adventures.ui.components.client.AccountTopBar]
 * draws — the two shells must not drift structurally. Nothing here imports from
 * `ui/screens/account/` or `ui/components/client/`, which is the rule [AgentScaffold] states.
 */
@Composable
fun AgentTopBar(
    title: String,
    onSignOut: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val scheme = MaterialTheme.colorScheme

    Column(modifier.fillMaxWidth().background(scheme.background)) {
        Row(
            Modifier
                .fillMaxWidth()
                .heightIn(min = 56.dp)
                .padding(start = 16.dp, end = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                title,
                style = MaterialTheme.typography.titleSmall,
                color = scheme.onSurface,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
            TextButton(
                onClick = onSignOut,
                // §4.2's 44pt floor on touch; 48dp is the platform's own.
                modifier = Modifier.heightIn(min = 48.dp),
            ) {
                Text(AgentCopy.SIGN_OUT)
            }
        }
        HorizontalDivider(color = scheme.outlineVariant)
    }
}

@Composable
fun AgentBottomNav(
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
                .padding(WindowInsets.navigationBars.asPaddingValues())
                .padding(top = 8.dp, bottom = 10.dp, start = 6.dp, end = 6.dp),
            horizontalArrangement = Arrangement.SpaceAround,
            verticalAlignment = Alignment.Top,
        ) {
            for (destination in AGENT_BAR_DESTINATIONS) {
                AgentTab(
                    destination = destination,
                    selected = destination.id == active,
                    onSelect = onSelect,
                )
            }
        }
    }
}

private fun markFor(id: String): StoryTailMark = when (id) {
    "worklist" -> StoryTailMark.PULSE
    "clients" -> StoryTailMark.USERS
    "messages" -> StoryTailMark.MESSAGE
    else -> StoryTailMark.MORE_VERT
}

@Composable
private fun AgentTab(
    destination: AgentDestination,
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
                    // Three of the four are this, in this slice. Dimmed so it does not look
                    // pressable, and out of the semantics tree's selectable set entirely.
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
