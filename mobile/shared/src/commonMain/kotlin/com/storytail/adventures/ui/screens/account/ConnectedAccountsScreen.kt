package com.storytail.adventures.ui.screens.account

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.disabled
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.storytail.adventures.api.AuthProviderState
import com.storytail.adventures.domain.account.ConnectedMessages
import com.storytail.adventures.domain.auth.OAUTH_PROVIDERS
import com.storytail.adventures.domain.auth.PROVIDER_LABEL
import com.storytail.adventures.domain.auth.columnValue
import com.storytail.adventures.ui.components.client.AccountTopBar
import com.storytail.adventures.ui.components.client.ClientScaffold
import com.storytail.adventures.ui.components.client.SettingsGroup
import com.storytail.adventures.ui.components.client.SettingsRow
import com.storytail.adventures.ui.components.client.SkeletonBlock
import com.storytail.adventures.ui.theme.PillShape

/**
 * Screen 2.5.8 Connected Accounts — docs/Screen-Inventory.md §2.5.8, §4.4 Pattern A, and
 * design/source-prototype/screens/client-account-mobile.jsx `M258_Connected`. P1.
 *
 * READ-ONLY today. The state reads; neither action has a safe path.
 *
 * GOOGLE AND APPLE ONLY, and the Screen Inventory is already correct on this — it is the
 * ARTBOARD that adds a Facebook row marked "Not connected · available" (departure 3).
 * `auth_provider` is ENUM ('email','google','apple'), so a third provider is a schema change
 * rather than a config one, and the list is derived from [OAUTH_PROVIDERS] rather than typed
 * out here. A provider we do not have, described as available, reads as one click away.
 *
 * WHY UNLINK IS DISABLED — and it must stay disabled until an Edge Function exists. Unlinking
 * the last identity on an account with no password is a PERMANENT LOCKOUT: there would be no
 * way back in. The refusal has to happen server-side, in an audited function that checks what
 * else the account can authenticate with. It cannot be a disabled button (the client decides
 * nothing) and it must not lean on GoTrue's own guard.
 *
 * WHY LINK IS DISABLED: `linkIdentity` needs manual linking enabled on the project, and it is
 * not. Turning it on is a config change with its own consequences — a decision rather than a
 * cleanup.
 *
 * A FAILED READ STAYS UNKNOWN and the note is omitted entirely. Defaulting to "no provider"
 * used to fall through to the OAuth note, which tells an email-and-password user they have no
 * password — a false statement about their own account, on the screen they came to to check
 * it.
 */
@Composable
fun ConnectedAccountsScreen(
    loading: Boolean,
    provider: AuthProviderState,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val scheme = MaterialTheme.colorScheme
    val signedUpWith = (provider as? AuthProviderState.Known)?.provider

    ClientScaffold(
        modifier = modifier,
        topBar = { AccountTopBar(title = ConnectedMessages.TITLE, onBack = onBack) },
    ) {
        Column(
            Modifier.fillMaxWidth().padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Spacer(Modifier.height(12.dp))
            Text(
                ConnectedMessages.SUBTITLE,
                style = MaterialTheme.typography.bodyMedium,
                color = scheme.onSurfaceVariant,
            )

            if (loading) {
                Spacer(Modifier.height(12.dp))
                SkeletonBlock(Modifier.fillMaxWidth().height(120.dp))
            } else {
                SettingsGroup {
                    OAUTH_PROVIDERS.forEachIndexed { index, oauth ->
                        val linked = signedUpWith == oauth.columnValue
                        SettingsRow(
                            first = index == 0,
                            title = PROVIDER_LABEL.getValue(oauth),
                            sub = if (linked) ConnectedMessages.LINKED else ConnectedMessages.NOT_LINKED,
                            trailing = {
                                // Inert, and announced as inert. A dimmed button carrying
                                // only alpha is the gap the §2.2 bottom bar still has.
                                //
                                // Sized for touch even though nothing can touch it: this is
                                // the control's real geometry the day the Edge Function
                                // exists, and discovering it is 40dp then means discovering
                                // it after somebody has tried to press it.
                                OutlinedButton(
                                    onClick = {},
                                    enabled = false,
                                    shape = PillShape,
                                    modifier = Modifier
                                        .heightIn(min = 48.dp)
                                        .semantics { disabled() },
                                ) {
                                    Text(
                                        if (linked) ConnectedMessages.UNLINK_CTA
                                        else ConnectedMessages.LINK_CTA,
                                        style = MaterialTheme.typography.labelMedium,
                                    )
                                }
                            },
                        )
                    }
                }

                Spacer(Modifier.height(14.dp))
                if (signedUpWith != null) {
                    Text(
                        if (signedUpWith == "email") ConnectedMessages.EMAIL_ACCOUNT_NOTE
                        else ConnectedMessages.OAUTH_ACCOUNT_NOTE,
                        style = MaterialTheme.typography.bodySmall,
                        color = scheme.onSurfaceVariant,
                    )
                    Spacer(Modifier.height(10.dp))
                }
                Text(
                    ConnectedMessages.SAFETY_NOTE,
                    style = MaterialTheme.typography.bodySmall,
                    color = scheme.onSurfaceVariant,
                )
            }
            Spacer(Modifier.height(24.dp))
        }
    }
}
