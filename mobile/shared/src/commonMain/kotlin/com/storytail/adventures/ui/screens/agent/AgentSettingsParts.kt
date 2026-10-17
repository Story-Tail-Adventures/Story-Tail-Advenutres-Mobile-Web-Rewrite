package com.storytail.adventures.ui.screens.agent

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.disabled
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.toggleableState
import androidx.compose.ui.state.ToggleableState
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.storytail.adventures.domain.agent.AgentSettingsCopy
import com.storytail.adventures.ui.components.StoryTailGlyph
import com.storytail.adventures.ui.components.StoryTailMark
import com.storytail.adventures.ui.theme.StoryTailRadius

/**
 * The small pieces §3.12's three phone screens share: a labelled field that may wrap, a
 * choice that opens a list, a switch row, a section card, and the save line.
 */

@Composable
internal fun SettingsSection(
    title: String,
    sub: String? = null,
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    val scheme = MaterialTheme.colorScheme
    Column(
        modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp)
            .background(scheme.surface, RoundedCornerShape(StoryTailRadius.md))
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Column {
            Text(title, style = MaterialTheme.typography.titleMedium, color = scheme.onSurface)
            if (sub != null) {
                Spacer(Modifier.height(2.dp))
                Text(sub, style = MaterialTheme.typography.bodySmall, color = scheme.onSurfaceVariant)
            }
        }
        content()
    }
}

/** A field with its label above it, as `AuthTextField` draws one, that may wrap ([lines] > 1). */
@Composable
internal fun SettingsField(
    label: String,
    value: String,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier,
    hint: String? = null,
    error: String? = null,
    enabled: Boolean = true,
    lines: Int = 1,
    keyboardType: KeyboardType = KeyboardType.Text,
    capitalization: KeyboardCapitalization = KeyboardCapitalization.Sentences,
    maxLength: Int? = null,
) {
    val scheme = MaterialTheme.colorScheme
    Column(modifier.fillMaxWidth()) {
        Text(label, style = MaterialTheme.typography.labelMedium, color = scheme.onSurfaceVariant)
        Spacer(Modifier.height(4.dp))
        OutlinedTextField(
            value = value,
            onValueChange = { next -> onValueChange(if (maxLength != null) next.take(maxLength) else next) },
            enabled = enabled,
            singleLine = lines == 1,
            minLines = lines,
            maxLines = if (lines == 1) 1 else lines + 4,
            isError = error != null,
            supportingText = (error ?: hint)?.let { { Text(it) } },
            keyboardOptions = KeyboardOptions(
                keyboardType = keyboardType,
                capitalization = capitalization,
                // Prose only: a name, pronouns or a link should not be "corrected".
                autoCorrectEnabled = keyboardType == KeyboardType.Text && capitalization == KeyboardCapitalization.Sentences,
            ),
            modifier = Modifier.fillMaxWidth(),
        )
    }
}

/**
 * A value picked from a list: shows the current one, opens the list in a dialog. A dialog
 * rather than a dropdown menu so a long list (eighteen time zones, forty-eight half hours)
 * scrolls in one place a thumb can reach.
 */
@Composable
internal fun <T> ChoiceField(
    label: String,
    value: T,
    options: List<T>,
    optionLabel: (T) -> String,
    onSelect: (T) -> Unit,
    modifier: Modifier = Modifier,
    hint: String? = null,
    showLabel: Boolean = true,
) {
    val scheme = MaterialTheme.colorScheme
    var open by remember { mutableStateOf(false) }
    Column(modifier) {
        if (showLabel) {
            Text(label, style = MaterialTheme.typography.labelMedium, color = scheme.onSurfaceVariant)
            Spacer(Modifier.height(4.dp))
        }
        OutlinedButton(
            onClick = { open = true },
            shape = RoundedCornerShape(StoryTailRadius.xs),
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(min = 48.dp)
                .semantics { contentDescription = "$label, ${optionLabel(value)}" },
        ) {
            Text(optionLabel(value), modifier = Modifier.weight(1f), color = scheme.onSurface)
            StoryTailGlyph(StoryTailMark.CHEVRON_DOWN, 14.dp, scheme.onSurfaceVariant)
        }
        if (hint != null) {
            Text(
                hint,
                style = MaterialTheme.typography.bodySmall,
                color = scheme.onSurfaceVariant,
                modifier = Modifier.padding(start = 16.dp, top = 4.dp),
            )
        }
    }
    if (open) {
        AlertDialog(
            onDismissRequest = { open = false },
            title = { Text(label) },
            text = {
                LazyColumn(Modifier.heightIn(max = 420.dp)) {
                    items(options) { option ->
                        Row(
                            Modifier
                                .fillMaxWidth()
                                .heightIn(min = 48.dp)
                                .selectable(
                                    selected = option == value,
                                    role = Role.RadioButton,
                                    onClick = {
                                        onSelect(option)
                                        open = false
                                    },
                                ),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            RadioButton(selected = option == value, onClick = null)
                            Spacer(Modifier.padding(start = 8.dp))
                            Text(optionLabel(option), style = MaterialTheme.typography.bodyMedium)
                        }
                    }
                }
            },
            confirmButton = {
                TextButton(onClick = { open = false }) { Text(AgentSettingsCopy.CANCEL) }
            },
        )
    }
}

/** A labelled switch, the whole row the tap target. */
@Composable
internal fun SwitchRow(
    title: String,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit,
    modifier: Modifier = Modifier,
    sub: String? = null,
    enabled: Boolean = true,
    /** What a screen reader calls it, when [title] alone does not say ("Push" → "Client message by push"). */
    spokenName: String? = null,
) {
    val scheme = MaterialTheme.colorScheme
    Row(
        modifier
            .fillMaxWidth()
            .heightIn(min = 48.dp)
            .toggleable(value = checked, enabled = enabled, role = Role.Switch, onValueChange = onCheckedChange)
            // One name, said once: replace the merged "Push" rather than adding to it.
            .then(
                if (spokenName != null) {
                    Modifier.clearAndSetSemantics {
                        contentDescription = spokenName
                        role = Role.Switch
                        toggleableState = ToggleableState(checked)
                        if (!enabled) disabled()
                        onClick { onCheckedChange(!checked); true }
                    }
                } else {
                    Modifier
                },
            ),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Column(Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.bodyLarge, color = scheme.onSurface)
            if (sub != null) Text(sub, style = MaterialTheme.typography.bodySmall, color = scheme.onSurfaceVariant)
        }
        // onCheckedChange = null: the row handles the tap, so TalkBack hears one switch.
        Switch(checked = checked, onCheckedChange = null, enabled = enabled)
    }
}

/** What the last save said: "Saved.", "Nothing new to save." or the sentence that went wrong. */
data class SaveStatus(val text: String, val error: Boolean)

@Composable
internal fun SaveStatusLine(status: SaveStatus?, modifier: Modifier = Modifier) {
    if (status == null) return
    val scheme = MaterialTheme.colorScheme
    Text(
        status.text,
        style = MaterialTheme.typography.bodyMedium,
        color = if (status.error) scheme.error else scheme.onSurfaceVariant,
        // Said aloud when it changes, so "Saved." reaches a screen reader too.
        modifier = modifier.fillMaxWidth().semantics { liveRegion = LiveRegionMode.Polite },
    )
}

/** "You have changes that aren't saved. Leave without saving?" */
@Composable
internal fun LeaveUnsavedDialog(onLeave: () -> Unit, onStay: () -> Unit) {
    AlertDialog(
        onDismissRequest = onStay,
        text = { Text(AgentSettingsCopy.LEAVE_UNSAVED) },
        confirmButton = { TextButton(onClick = onLeave) { Text(AgentSettingsCopy.LEAVE) } },
        dismissButton = { TextButton(onClick = onStay) { Text(AgentSettingsCopy.STAY) } },
    )
}

/** A yes / no question before something that cannot be taken back. */
@Composable
internal fun ConfirmDialog(text: String, confirm: String, onConfirm: () -> Unit, onDismiss: () -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss,
        text = { Text(text) },
        confirmButton = { TextButton(onClick = onConfirm) { Text(confirm) } },
        dismissButton = { TextButton(onClick = onDismiss) { Text(AgentSettingsCopy.CANCEL) } },
    )
}
