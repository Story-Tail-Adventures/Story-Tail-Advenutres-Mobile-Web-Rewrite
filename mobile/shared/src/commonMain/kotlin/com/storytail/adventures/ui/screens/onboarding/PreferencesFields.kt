package com.storytail.adventures.ui.screens.onboarding

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.storytail.adventures.domain.validation.LoyaltyRow
import com.storytail.adventures.domain.validation.PreferencesValidation
import com.storytail.adventures.ui.components.AuthTextField
import com.storytail.adventures.ui.components.ChipRow

/**
 * FOUR DEPARTURES FROM THE ARTBOARD, each because it cannot be built as drawn.
 *
 * The dual-thumb $1k–$10k+ slider is four bands, because `budget_band` is one nullable text
 * column and two thumbs is two numbers. The single loyalty text input is a repeater, because
 * splitting "Marriott Bonvoy 123" on the last space credits somebody's miles to a program
 * called Marriott. "No restrictions" clears its group, because a CHECK constraint forbids the
 * sentinel beside a real answer — or beside a note, which is the likelier contradiction since
 * the vocabulary has no slug for an allergy. And the free-text boxes beside the diet and
 * access chips are additions: five chips cannot say "severe tree nut allergy", and that is
 * the sentence an advisor forwards to a resort kitchen.
 */
internal object PreferencesCopy {
    const val TITLE = "How do you travel?"
    const val SUB =
        "Tag what's true. Nothing here is required — it just means I start closer to the mark."
    const val DESTINATIONS = "Destinations"
    const val DESTINATIONS_HINT = "Places you keep coming back to, or keep meaning to see."
    const val DESTINATION_OTHER = "Somewhere else?"
    const val STYLE = "Travel style"
    const val STYLE_HINT = "Pick everything that sounds like a trip you'd take."
    const val DIET = "Dietary needs"
    const val DIET_NOTES = "Anything else about food?"
    const val ACCESS = "Access needs"
    const val ACCESS_NOTES = "Anything else we should arrange?"
    const val LOYALTY = "Loyalty programs"
    const val LOYALTY_HINT = "So your miles and points actually get credited."
    const val LOYALTY_PROGRAM = "Program"
    const val LOYALTY_NUMBER = "Member number"
    const val LOYALTY_ADD = "Add another"
    const val LOYALTY_REMOVE = "Remove"
    const val BUDGET = "Budget comfort range"
    const val BUDGET_HINT =
        "Roughly, per person. It just tells me where to start looking — nothing here is a " +
            "commitment."
    const val FAVOURITES = "A trip you still talk about"
    const val PRIMARY = "Save & continue"
    const val PENDING = "Saving your preferences…"
    const val SKIP = "Skip for now"
}

/**
 * The chips, the notes and the loyalty repeater, without any chrome around them.
 *
 * SHARED BY 2.1.11 AND 2.5.3, exactly as [ProfileFields] is shared by 2.1.10 and 2.5.2 — the
 * Screen Inventory note at 2.5.3 asks for "the same chip behavior as 2.1.11", and the surest
 * way to have the same behaviour is to have the same code.
 *
 * EMITS SIBLINGS, with no wrapper Column; the caller owns the spacing.
 */
@Composable
fun PreferencesFields(
    form: PreferencesForm,
    onChange: ((PreferencesForm) -> PreferencesForm) -> Unit,
    onToggleSentinel: (Set<String>, String) -> Set<String>,
    busy: Boolean,
) {
    // Anything already on file that is not one of the suggestions still has to render as a
    // chip, or a destination somebody typed last time silently disappears from the screen
    // that is showing them their own answers.
    val extras = form.destinations.filterNot { chosen ->
        PreferencesValidation.DESTINATION_SUGGESTIONS.any { it.equals(chosen, true) }
    }

    PreferenceFieldGroup(
        PreferencesCopy.DESTINATIONS,
        hint = PreferencesCopy.DESTINATIONS_HINT,
        error = form.destinationsError,
    ) {
        ChipRow(
            options = (PreferencesValidation.DESTINATION_SUGGESTIONS + extras)
                .map { it to it },
            selected = form.destinations,
            onToggle = { value ->
                onChange { f ->
                    f.copy(
                        destinations =
                            if (value in f.destinations) f.destinations - value
                            else f.destinations + value,
                    )
                }
            },
            enabled = !busy,
        )
        AuthTextField(
            label = PreferencesCopy.DESTINATION_OTHER,
            value = form.destinationOther,
            onValueChange = { v -> onChange { it.copy(destinationOther = v) } },
            enabled = !busy,
        )
    }

    PreferenceFieldGroup(PreferencesCopy.STYLE, hint = PreferencesCopy.STYLE_HINT) {
        ChipRow(
            // The chip says "Honeymoon"; the value is `romantic`.
            options = PreferencesValidation.TRAVEL_STYLES.map { it.label to it.value },
            selected = form.travelStyles,
            onToggle = { value ->
                onChange { f ->
                    f.copy(
                        travelStyles =
                            if (value in f.travelStyles) f.travelStyles - value
                            else f.travelStyles + value,
                    )
                }
            },
            enabled = !busy,
        )
    }

    SentinelGroup(
        legend = PreferencesCopy.DIET,
        options = PreferencesValidation.DIETARY.map { it.label to it.value },
        selected = form.dietary,
        notesLabel = PreferencesCopy.DIET_NOTES,
        notes = form.dietaryNotes,
        error = form.dietaryError,
        enabled = !busy,
        onToggle = { v -> onChange { it.copy(dietary = onToggleSentinel(it.dietary, v)) } },
        onNotesChange = { v -> onChange { it.copy(dietaryNotes = v) } },
    )

    SentinelGroup(
        legend = PreferencesCopy.ACCESS,
        options = PreferencesValidation.ACCESSIBILITY.map { it.label to it.value },
        selected = form.accessibility,
        notesLabel = PreferencesCopy.ACCESS_NOTES,
        notes = form.accessibilityNotes,
        error = form.accessibilityError,
        enabled = !busy,
        onToggle = { v ->
            onChange { it.copy(accessibility = onToggleSentinel(it.accessibility, v)) }
        },
        onNotesChange = { v -> onChange { it.copy(accessibilityNotes = v) } },
    )

    PreferenceFieldGroup(
        PreferencesCopy.LOYALTY,
        hint = PreferencesCopy.LOYALTY_HINT,
        error = form.loyaltyError,
    ) {
        form.loyalty.forEachIndexed { index, row ->
            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                modifier = Modifier.fillMaxWidth(),
            ) {
                AuthTextField(
                    label = PreferencesCopy.LOYALTY_PROGRAM,
                    value = row.program,
                    onValueChange = { v ->
                        onChange { f -> f.copy(loyalty = f.loyalty.replaceAt(index) { it.copy(program = v) }) }
                    },
                    enabled = !busy,
                    modifier = Modifier.weight(1f),
                )
                AuthTextField(
                    label = PreferencesCopy.LOYALTY_NUMBER,
                    value = row.number,
                    onValueChange = { v ->
                        onChange { f -> f.copy(loyalty = f.loyalty.replaceAt(index) { it.copy(number = v) }) }
                    },
                    enabled = !busy,
                    modifier = Modifier.weight(1f),
                )
            }
            if (form.loyalty.size > 1) {
                TextButton(
                    onClick = {
                        onChange { f ->
                            f.copy(loyalty = f.loyalty.filterIndexed { i, _ -> i != index })
                        }
                    },
                    enabled = !busy,
                ) { Text(PreferencesCopy.LOYALTY_REMOVE) }
            }
        }
        if (form.loyalty.size < PreferencesValidation.Limits.LOYALTY_ROWS) {
            TextButton(
                onClick = { onChange { it.copy(loyalty = it.loyalty + LoyaltyRow()) } },
                enabled = !busy,
            ) { Text(PreferencesCopy.LOYALTY_ADD) }
        }
    }

    PreferenceFieldGroup(PreferencesCopy.BUDGET, hint = PreferencesCopy.BUDGET_HINT) {
        ChipRow(
            options = PreferencesValidation.BUDGET_BANDS.map { it.label to it.value } +
                // Not decoration: without an explicit way to say nothing, the first tap
                // on a single-select is irreversible.
                listOf(PreferencesValidation.BUDGET_UNSURE to ""),
            selected = setOf(form.budgetBand),
            onToggle = { value -> onChange { it.copy(budgetBand = value) } },
            enabled = !busy,
        )
    }

    AuthTextField(
        label = PreferencesCopy.FAVOURITES,
        value = form.favouritePastTrips,
        onValueChange = { v -> onChange { it.copy(favouritePastTrips = v) } },
        error = form.favouritesError,
        enabled = !busy,
    )
}

private fun <T> List<T>.replaceAt(index: Int, transform: (T) -> T): List<T> =
    mapIndexed { i, item -> if (i == index) transform(item) else item }

@Composable
private fun SentinelGroup(
    legend: String,
    options: List<Pair<String, String>>,
    selected: Set<String>,
    notesLabel: String,
    notes: String,
    error: String?,
    enabled: Boolean,
    onToggle: (String) -> Unit,
    onNotesChange: (String) -> Unit,
) {
    val sentinelOn = PreferencesValidation.NONE in selected
    PreferenceFieldGroup(legend, error = error) {
        ChipRow(options = options, selected = selected, onToggle = onToggle, enabled = enabled)
        AuthTextField(
            label = notesLabel,
            value = notes,
            onValueChange = onNotesChange,
            // Inert while the sentinel is ticked, so the contradiction cannot be typed at
            // all. The rules and a CHECK constraint both refuse the pair; this is what stops
            // anybody having to be told about it.
            enabled = enabled && !sentinelOn,
        )
    }
}

@Composable
private fun PreferenceFieldGroup(
    legend: String,
    modifier: Modifier = Modifier,
    hint: String? = null,
    error: String? = null,
    content: @Composable ColumnScope.() -> Unit,
) {
    Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(
                text = legend,
                style = MaterialTheme.typography.titleSmall,
                color = MaterialTheme.colorScheme.onSurface,
            )
            if (hint != null) {
                Text(
                    text = hint,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            if (error != null) {
                Text(
                    text = error,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.error,
                )
            }
        }
        content()
    }
}
