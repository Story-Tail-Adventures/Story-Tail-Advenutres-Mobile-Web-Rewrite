package com.storytail.adventures.ui.screens.account

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.storytail.adventures.domain.account.AccountPreferencesMessages
import com.storytail.adventures.ui.components.FormErrorCard
import com.storytail.adventures.ui.components.client.AccountSaveBar
import com.storytail.adventures.ui.components.client.AccountTopBar
import com.storytail.adventures.ui.components.client.ClientScaffold
import com.storytail.adventures.ui.components.client.SkeletonBlock
import com.storytail.adventures.ui.screens.onboarding.PreferencesFields
import com.storytail.adventures.ui.screens.onboarding.PreferencesForm

/**
 * Screen 2.5.3 Travel Preferences Edit — docs/Screen-Inventory.md §2.5.3, §4.4 Pattern A
 * ("same chip behavior as 2.1.11"), and
 * design/source-prototype/screens/client-account-mobile.jsx `M253_PreferencesEdit`. P1.
 *
 * MOUNTS 2.1.11's CONTROLS rather than growing a second set, which is what the Screen
 * Inventory note asks for. Shared: [PreferencesFields] (the chips, the loyalty repeater, the
 * "No restrictions" clearing rule a CHECK constraint also enforces), the closed vocabularies,
 * and `validatePreferencesForm`. Different: the save omits `advance`, so the write lands
 * without moving the onboarding cursor, and the footer is Save/Cancel rather than
 * Save-and-continue/Skip.
 *
 * ONE CAVEAT the Edge Function records about itself: its read-then-write is not locked and
 * `travel_preference` has no optimistic-concurrency column, so two devices saving at once is
 * last-write-wins. Unchanged from 2.1.11, and not made worse here.
 */
@Composable
fun AccountPreferencesScreen(
    state: AccountFormState,
    form: PreferencesForm,
    onChange: ((PreferencesForm) -> PreferencesForm) -> Unit,
    onToggleSentinel: (Set<String>, String) -> Set<String>,
    onSubmit: () -> Unit,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
) {
    ClientScaffold(
        modifier = modifier,
        topBar = { AccountTopBar(title = AccountPreferencesMessages.TITLE, onBack = onBack) },
        footer = {
            AccountSaveBar(
                onSave = onSubmit,
                onCancel = onBack,
                saveLabel = AccountPreferencesMessages.SAVE,
                cancelLabel = AccountPreferencesMessages.CANCEL,
                enabled = !state.loading,
                saving = state.saving,
            )
        },
    ) {
        Column(
            Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 14.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Text(
                AccountPreferencesMessages.SUBTITLE,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )

            if (state.formError != null) FormErrorCard(message = state.formError)

            if (state.loading) {
                SkeletonBlock(Modifier.fillMaxWidth().height(260.dp))
            } else {
                PreferencesFields(
                    form = form,
                    onChange = onChange,
                    onToggleSentinel = onToggleSentinel,
                    busy = state.saving,
                )
            }
            Spacer(Modifier.height(8.dp))
        }
    }
}
