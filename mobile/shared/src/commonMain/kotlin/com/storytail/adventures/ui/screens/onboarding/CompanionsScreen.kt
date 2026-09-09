// Screen 2.1m.12 Travel Companions — see docs/Screen-Inventory.md §2.1.12 (Pattern G, §4.4)
// and design/source-prototype/screens/client-auth-mobile.jsx `M2112_Companions`. P1.
package com.storytail.adventures.ui.screens.onboarding

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.storytail.adventures.domain.onboarding.WizardStep
import com.storytail.adventures.domain.onboarding.formatLongDate
import com.storytail.adventures.domain.onboarding.formatMonthYear
import com.storytail.adventures.domain.validation.CompanionValidation
import com.storytail.adventures.ui.components.AuthPrimaryButton
import com.storytail.adventures.ui.components.AuthTextField
import com.storytail.adventures.ui.components.CountryField
import com.storytail.adventures.ui.components.DateField
import com.storytail.adventures.ui.components.FormErrorCard
import com.storytail.adventures.ui.components.OnboardingScaffold

private object CompanionsCopy {
    const val TITLE = "Who often travels with you?"
    const val SUB =
        "So I can pre-fill their info next time you book together. Add now, or skip — " +
            "totally up to you."
    const val EMPTY_TITLE = "No one added yet"
    const val EMPTY_BODY =
        "Add the people you usually travel with and I'll have their details ready when you " +
            "book together. There's no rush — you can come back to this any time."
    const val ADD = "Add a traveler"
    const val EDIT = "Edit"
    const val REMOVE = "Remove"
    const val FORM_ADD = "Add a traveler"
    /** Named, so a household of four does not show four identical headings. */
    fun formEdit(name: String) = "Edit $name"
    fun born(whenText: String) = "Born $whenText"
    fun passportExpires(whenText: String) = "Passport expires $whenText"
    fun passportExpiringSoon(whenText: String) =
        "Passport expires $whenText — many countries want six months' validity"
    const val FORM_SUB =
        "Just the basics. Passport details are optional — add them whenever you have the " +
            "book in hand."
    const val FIRST_NAME = "First name"
    const val LAST_NAME = "Last name"
    const val RELATIONSHIP = "Relationship"
    const val DOB = "Date of birth"
    const val EXPIRES = "Expires"
    const val ISSUING = "Country of issue"
    const val SAVE = "Save traveler"
    const val SAVING = "Saving…"
    const val CANCEL = "Cancel"
    const val NO_PASSPORT = "No passport details yet"
    const val MAX =
        "That's twelve travelers — plenty for one household. Need more? I can add them when " +
            "we're planning together."
    const val UNFINISHED = "Save or cancel the traveler you're adding, and we'll move on."
    const val PRIMARY = "Save & continue"
    const val PENDING = "Saving…"
    const val SKIP = "Skip for now"
}

@Composable
fun CompanionsScreen(
    state: OnboardingUiState,
    form: CompanionsForm,
    onStartAdding: () -> Unit,
    onStartEditing: (TravelCompanion) -> Unit,
    onDraftChange: ((CompanionDraft) -> CompanionDraft) -> Unit,
    onSaveDraft: () -> Unit,
    onCancelDraft: () -> Unit,
    onRemove: (TravelCompanion) -> Unit,
    onContinue: () -> Unit,
    onSkip: () -> Unit,
    /** Today in UTC, hoisted so the six-month passport warning is testable. */
    today: String,
    modifier: Modifier = Modifier,
) {
    val sixMonthsFromToday = remember(today) { CompanionValidation.sixMonthsFrom(today) }
    val draft = form.draft
    val full = form.companions.size >= CompanionValidation.Limits.MAX_COMPANIONS
    val busy = state.isSaving || state.isSkipping

    OnboardingScaffold(
        step = WizardStep.COMPANIONS,
        title = CompanionsCopy.TITLE,
        sub = CompanionsCopy.SUB,
        modifier = modifier,
        footer = {
            AuthPrimaryButton(
                label = CompanionsCopy.PRIMARY,
                pendingLabel = CompanionsCopy.PENDING,
                onClick = onContinue,
                // Held back while a form is open: leaving would discard what is in it, which
                // is the same data loss the save-on-landing rule exists to prevent, reachable
                // through a different button.
                enabled = !busy && draft == null,
                isSubmitting = state.isSaving,
            )
            TextButton(
                onClick = onSkip,
                enabled = !busy && draft == null,
                modifier = Modifier.fillMaxWidth(),
            ) { Text(CompanionsCopy.SKIP) }
        },
    ) {
        if (state.formError != null) FormErrorCard(message = state.formError)

        if (form.companions.isEmpty() && draft == null) {
            Surface(
                color = MaterialTheme.colorScheme.surfaceVariant,
                contentColor = MaterialTheme.colorScheme.onSurfaceVariant,
                shape = MaterialTheme.shapes.medium,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(
                        text = CompanionsCopy.EMPTY_TITLE,
                        style = MaterialTheme.typography.titleSmall,
                        color = MaterialTheme.colorScheme.onSurface,
                    )
                    Text(CompanionsCopy.EMPTY_BODY, style = MaterialTheme.typography.bodySmall)
                }
            }
        }

        form.companions.forEach { companion ->
            CompanionCard(
                companion = companion,
                sixMonthsFromToday = sixMonthsFromToday,
                enabled = draft == null && !busy,
                onEdit = { onStartEditing(companion) },
                onRemove = { onRemove(companion) },
            )
        }

        if (full) {
            Text(
                text = CompanionsCopy.MAX,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }

        if (draft == null && !full) {
            OutlinedButton(
                onClick = onStartAdding,
                enabled = !busy,
                modifier = Modifier.fillMaxWidth(),
            ) { Text(CompanionsCopy.ADD) }
        }

        if (draft != null) {
            Text(
                text = CompanionsCopy.UNFINISHED,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            DraftForm(
                draft = draft,
                isSaving = form.isSavingCompanion,
                onChange = onDraftChange,
                onSave = onSaveDraft,
                onCancel = onCancelDraft,
            )
        }
    }
}

@Composable
private fun CompanionCard(
    companion: TravelCompanion,
    sixMonthsFromToday: String,
    enabled: Boolean,
    onEdit: () -> Unit,
    onRemove: () -> Unit,
) {
    Surface(
        color = MaterialTheme.colorScheme.surface,
        shape = MaterialTheme.shapes.medium,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Row(
            modifier = Modifier.padding(start = 14.dp, end = 4.dp, top = 8.dp, bottom = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(Modifier.weight(1f)) {
                Text(
                    text = "${companion.firstName} ${companion.lastName}",
                    style = MaterialTheme.typography.titleSmall,
                    color = MaterialTheme.colorScheme.onSurface,
                )
                Text(
                    text = listOfNotNull(
                        companion.relationship.ifBlank { null },
                        companion.dateOfBirth.ifBlank { null }
                            ?.let { formatLongDate(it) }
                            ?.let { CompanionsCopy.born(it) },
                        // The prototype prints "Passport B987654321 · 02/2031". The number is
                        // gone: it is outside the client's column grant and is not collected.
                        // The date keeps its label — a bare "Feb 2031" beside somebody's name
                        // does not say what expires.
                        passportLine(companion.passportExpiry, sixMonthsFromToday),
                    ).joinToString(" · "),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            TextButton(onClick = onEdit, enabled = enabled) { Text(CompanionsCopy.EDIT) }
            TextButton(onClick = onRemove, enabled = enabled) { Text(CompanionsCopy.REMOVE) }
        }
    }
}

/**
 * The passport half of a card's meta line.
 *
 * An expiry inside six months says so: that is the validity most countries want on entry, so
 * a passport good for five months is a problem the traveler does not know they have. A
 * warning, never a block — the row saves either way.
 */
private fun passportLine(expiry: String, sixMonthsFromToday: String): String {
    val month = expiry.ifBlank { null }?.let { formatMonthYear(it) }
        ?: return CompanionsCopy.NO_PASSPORT
    return if (CompanionValidation.expiresWithinSixMonths(expiry, sixMonthsFromToday)) {
        CompanionsCopy.passportExpiringSoon(month)
    } else {
        CompanionsCopy.passportExpires(month)
    }
}

@Composable
private fun DraftForm(
    draft: CompanionDraft,
    isSaving: Boolean,
    onChange: ((CompanionDraft) -> CompanionDraft) -> Unit,
    onSave: () -> Unit,
    onCancel: () -> Unit,
) {
    Surface(
        color = MaterialTheme.colorScheme.surfaceVariant,
        shape = MaterialTheme.shapes.medium,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text(
                text = if (draft.editingId != null) {
                    CompanionsCopy.formEdit("${draft.firstName} ${draft.lastName}".trim())
                } else {
                    CompanionsCopy.FORM_ADD
                },
                style = MaterialTheme.typography.titleSmall,
                color = MaterialTheme.colorScheme.onSurface,
            )
            Text(CompanionsCopy.FORM_SUB, style = MaterialTheme.typography.bodySmall)

            AuthTextField(
                label = CompanionsCopy.FIRST_NAME,
                value = draft.firstName,
                onValueChange = { v -> onChange { it.copy(firstName = v) } },
                error = draft.firstNameError,
                enabled = !isSaving,
            )
            AuthTextField(
                label = CompanionsCopy.LAST_NAME,
                value = draft.lastName,
                onValueChange = { v -> onChange { it.copy(lastName = v) } },
                error = draft.lastNameError,
                enabled = !isSaving,
            )
            AuthTextField(
                label = CompanionsCopy.RELATIONSHIP,
                value = draft.relationship,
                onValueChange = { v -> onChange { it.copy(relationship = v) } },
                error = draft.relationshipError,
                enabled = !isSaving,
            )
            DateField(
                label = CompanionsCopy.DOB,
                value = draft.dateOfBirth,
                onValueChange = { v -> onChange { it.copy(dateOfBirth = v) } },
                error = draft.dateOfBirthError,
                enabled = !isSaving,
            )
            if (draft.passportError != null) {
                Text(
                    text = draft.passportError,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.error,
                )
            }
            DateField(
                label = CompanionsCopy.EXPIRES,
                value = draft.passportExpiry,
                onValueChange = { v -> onChange { it.copy(passportExpiry = v) } },
                error = draft.passportExpiryError,
                enabled = !isSaving,
            )
            CountryField(
                label = CompanionsCopy.ISSUING,
                value = draft.passportCountry,
                onValueChange = { v -> onChange { it.copy(passportCountry = v) } },
                error = draft.passportCountryError,
                enabled = !isSaving,
            )

            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                AuthPrimaryButton(
                    label = CompanionsCopy.SAVE,
                    pendingLabel = CompanionsCopy.SAVING,
                    onClick = onSave,
                    enabled = !isSaving,
                    isSubmitting = isSaving,
                    modifier = Modifier.weight(1f),
                )
                TextButton(onClick = onCancel, enabled = !isSaving) {
                    Text(CompanionsCopy.CANCEL)
                }
            }
        }
    }
}
