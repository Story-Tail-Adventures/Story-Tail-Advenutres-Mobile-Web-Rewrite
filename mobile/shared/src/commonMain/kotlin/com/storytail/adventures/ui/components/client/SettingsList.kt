package com.storytail.adventures.ui.components.client

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.disabled
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.storytail.adventures.ui.components.StoryTailGlyph
import com.storytail.adventures.ui.components.StoryTailMark

/**
 * The grouped settings list — the Kotlin twin of `web/components/ui/SettingsList.tsx`.
 *
 * Screen Inventory §2.5 is mostly this shape: 2.5.1's tiles, 2.5.7's panels, 2.5.8's
 * providers and 2.5.9's rows are the same row under different headings. The mobile artboard
 * (`client-account-mobile.jsx`, `MSettingsRow`) calls it the one primitive in the section
 * worth naming, and §3.12 Agent Settings will want it too.
 *
 * A DISABLED ROW KEEPS ITS PLACE. §2.5 has several destinations whose backend does not exist
 * yet, and the §2.2 rule is to render them disabled with a reason rather than hide them — a
 * list that grows an item per release moves every other item under the reader's thumb. The
 * reason REPLACES the subtitle rather than sitting beside it, because two lines of grey on a
 * dimmed row is unreadable, and it is announced once: the row is marked `disabled` in
 * semantics and the reason is already its visible text.
 */
@Composable
fun SettingsGroup(
    label: String? = null,
    modifier: Modifier = Modifier,
    content: @Composable ColumnScope.() -> Unit,
) {
    val scheme = MaterialTheme.colorScheme
    Column(modifier.fillMaxWidth().padding(top = 18.dp)) {
        if (label != null) {
            Text(
                label,
                style = MaterialTheme.typography.labelSmall,
                color = scheme.onSurfaceVariant,
                modifier = Modifier.padding(start = 4.dp, bottom = 8.dp),
            )
        }
        Column(
            Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(14.dp))
                .background(scheme.surface),
            content = content,
        )
    }
}

@Composable
fun SettingsRow(
    title: String,
    mark: StoryTailMark? = null,
    sub: String? = null,
    onClick: (() -> Unit)? = null,
    disabled: Boolean = false,
    reason: String? = null,
    danger: Boolean = false,
    first: Boolean = false,
    trailing: @Composable (() -> Unit)? = null,
) {
    val scheme = MaterialTheme.colorScheme
    // `reason` replaces `sub`; it is never rendered beside it.
    val secondary = if (disabled) reason else sub

    if (!first) HorizontalDivider(color = scheme.outlineVariant)

    Row(
        Modifier
            .fillMaxWidth()
            // A disabled row is inert AND is announced as disabled, rather than being an
            // unlabelled dimmed thing — the gap the §2.2 bottom bar still has, where a
            // dimmed tab carries alpha and nothing else.
            .then(
                // MERGED, not just marked. `clickable` merges its descendants for free, so
                // an enabled row is announced as one thing — "Security, Password and
                // two-factor". A disabled row has no clickable, so without an explicit merge
                // the title and the reason are two separate nodes and the reader has to
                // swipe twice to learn why the first one is dimmed.
                if (disabled) {
                    Modifier.semantics(mergeDescendants = true) { this.disabled() }
                } else if (onClick != null) {
                    Modifier.clickable(onClick = onClick)
                } else {
                    Modifier
                },
            )
            .alpha(if (disabled) 0.55f else 1f)
            .padding(horizontal = 16.dp, vertical = 13.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        if (mark != null) {
            Box(
                Modifier
                    .size(34.dp)
                    .clip(RoundedCornerShape(10.dp))
                    .background(if (danger) scheme.errorContainer else scheme.secondaryContainer),
                contentAlignment = Alignment.Center,
            ) {
                StoryTailGlyph(
                    mark = mark,
                    size = 17.dp,
                    color = if (danger) scheme.onErrorContainer else scheme.onSecondaryContainer,
                )
            }
        }

        Column(Modifier.weight(1f)) {
            Text(
                title,
                style = MaterialTheme.typography.titleSmall,
                color = if (danger) scheme.error else scheme.onSurface,
            )
            if (secondary != null) {
                Text(
                    secondary,
                    style = MaterialTheme.typography.bodySmall,
                    color = scheme.onSurfaceVariant,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }

        // The chevron is a disclosure affordance, so it is suppressed when there is nothing
        // to disclose (disabled) and when the row ends in a real control instead.
        when {
            trailing != null -> trailing()
            !disabled && onClick != null ->
                StoryTailGlyph(StoryTailMark.CHEVRON_RIGHT, 16.dp, scheme.onSurfaceVariant)
        }
    }
}
