package com.storytail.adventures.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

/**
 * A wrapping row of selectable chips.
 *
 * WRAPS RATHER THAN SCROLLS. Screen-Inventory §4.4 calls these "scrollable chip groups" on
 * mobile, and that line is corrected in the doc: a horizontal scroller hides options on a
 * screen whose instruction is "tag what's true", and the value of the answer depends on
 * people seeing the whole list.
 *
 * `FilterChip` rather than a styled box, because it carries the selected state to a screen
 * reader — the prototype's `<span className="chip">` with a " ✓" appended to the label is
 * neither focusable nor announced, and storing "Caribbean ✓" would poison every comparison
 * downstream.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun ChipRow(
    options: List<Pair<String, String>>,
    selected: Set<String>,
    onToggle: (String) -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
) {
    FlowRow(
        modifier = modifier,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        options.forEach { (label, value) ->
            FilterChip(
                selected = value in selected,
                onClick = { onToggle(value) },
                enabled = enabled,
                label = { Text(label) },
                // No tick glyph: FilterChip already renders and announces its selected
                // state, and the prototype's " ✓" is a drawing convention rather than
                // content — it is the thing that must never reach the stored value.
            )
        }
    }
}
