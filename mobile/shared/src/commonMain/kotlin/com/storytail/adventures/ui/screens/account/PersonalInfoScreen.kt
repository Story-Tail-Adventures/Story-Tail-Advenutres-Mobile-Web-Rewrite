package com.storytail.adventures.ui.screens.account

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.storytail.adventures.domain.account.PersonalMessages
import com.storytail.adventures.ui.components.FormErrorCard
import com.storytail.adventures.ui.components.StoryTailGlyph
import com.storytail.adventures.ui.components.StoryTailMark
import com.storytail.adventures.ui.components.client.AccountSaveBar
import com.storytail.adventures.ui.components.client.AccountTopBar
import com.storytail.adventures.ui.components.client.ClientScaffold
import com.storytail.adventures.ui.components.client.SkeletonBlock
import com.storytail.adventures.ui.screens.onboarding.ProfileFields
import com.storytail.adventures.ui.screens.onboarding.ProfileForm
import com.storytail.adventures.ui.theme.StoryTailRadius

/**
 * Screen 2.5.2 Personal Info Edit — docs/Screen-Inventory.md §2.5.2, §4.4 Pattern A, and
 * design/source-prototype/screens/client-account-mobile.jsx `M252_PersonalInfo`. P1.
 *
 * MOUNTS 2.1.10's FORM, which turns out to be exactly the writable set: phone, date of
 * birth, mailing address, emergency contact, passport expiry and issuing country. Same
 * [ProfileFields] the wizard renders, same rules, same Edge Function — the difference is the
 * chrome and the missing `advance` flag.
 *
 * TWO FIELDS THE ARTBOARD DRAWS AS EDITABLE ARE READ-ONLY HERE, and both are write-path gaps
 * rather than design choices:
 *
 *  · NAME. No Edge Function writes `client.first_name` / `last_name` / `preferred_name` —
 *    they are set at registration and by `handle_new_user()`. PostgREST cannot write them
 *    either: `client` has a SELECT policy and no write policy, so a `.update()` would match
 *    zero rows and return 204, which looks exactly like success.
 *  · EMAIL. Changing it is GoTrue's, and `account.email` is only mirrored back by a trigger
 *    that does not exist — `auth_bridge` has one for `AFTER INSERT` and one for
 *    `AFTER UPDATE OF email_confirmed_at`, and NONE for `AFTER UPDATE OF email`. Offering
 *    the edit would leave the login address and the CRM record disagreeing, and
 *    `handle_user_email_confirmed()` matches pre-created clients on `account.email` — so the
 *    next person to register the old address could be adopted onto the wrong client row.
 *
 * They are shown with a note about how to change them rather than in a box that would
 * silently discard the edit.
 */
@Composable
fun PersonalInfoScreen(
    state: AccountFormState,
    form: ProfileForm,
    identity: Pair<String, String>,
    onChange: ((ProfileForm) -> ProfileForm) -> Unit,
    onSubmit: () -> Unit,
    onBack: () -> Unit,
    /** Today in UTC, hoisted so the expired-passport warning is testable. */
    today: String,
    modifier: Modifier = Modifier,
) {
    ClientScaffold(
        modifier = modifier,
        topBar = { AccountTopBar(title = PersonalMessages.TITLE, onBack = onBack) },
        footer = {
            AccountSaveBar(
                onSave = onSubmit,
                onCancel = onBack,
                saveLabel = PersonalMessages.SAVE,
                cancelLabel = PersonalMessages.CANCEL,
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
                PersonalMessages.SUBTITLE,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )

            if (state.formError != null) FormErrorCard(message = state.formError)

            IdentityCard(name = identity.first, email = identity.second)

            if (state.loading) {
                SkeletonBlock(Modifier.fillMaxWidth().height(220.dp))
            } else {
                ProfileFields(
                    form = form,
                    onChange = onChange,
                    busy = state.saving,
                    today = today,
                )
            }
            Spacer(Modifier.height(8.dp))
        }
    }
}

/** The two read-only facts, and the honest sentence about why they are read-only. */
@Composable
private fun IdentityCard(name: String, email: String) {
    val scheme = MaterialTheme.colorScheme
    Column(
        Modifier
            .fillMaxWidth()
            .background(scheme.surfaceContainer, RoundedCornerShape(StoryTailRadius.md))
            .padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Text(
            PersonalMessages.IDENTITY_HEADING,
            style = MaterialTheme.typography.labelSmall,
            color = scheme.onSurfaceVariant,
        )
        IdentityRow(PersonalMessages.NAME_LABEL, name.ifBlank { PersonalMessages.NOT_SET })
        IdentityRow(PersonalMessages.EMAIL_LABEL, email.ifBlank { PersonalMessages.NOT_SET })
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            StoryTailGlyph(StoryTailMark.INFO, 15.dp, scheme.onSurfaceVariant)
            Text(
                PersonalMessages.IDENTITY_NOTE,
                style = MaterialTheme.typography.bodySmall,
                color = scheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun IdentityRow(label: String, value: String) {
    val scheme = MaterialTheme.colorScheme
    Row(
        Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(16.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            label,
            style = MaterialTheme.typography.bodySmall,
            color = scheme.onSurfaceVariant,
        )
        Text(
            value,
            style = MaterialTheme.typography.bodyMedium,
            color = scheme.onSurface,
            textAlign = TextAlign.End,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f),
        )
    }
}
