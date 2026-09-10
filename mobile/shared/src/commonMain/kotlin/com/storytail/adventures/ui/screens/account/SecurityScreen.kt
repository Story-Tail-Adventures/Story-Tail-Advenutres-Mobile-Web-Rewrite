package com.storytail.adventures.ui.screens.account

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.storytail.adventures.api.AuthProviderState
import com.storytail.adventures.domain.account.SecurityMessages
import com.storytail.adventures.domain.account.noPasswordBody
import com.storytail.adventures.ui.components.StoryTailGlyph
import com.storytail.adventures.ui.components.StoryTailMark
import com.storytail.adventures.ui.components.client.AccountTopBar
import com.storytail.adventures.ui.components.client.ClientScaffold
import com.storytail.adventures.ui.components.client.SkeletonBlock
import com.storytail.adventures.ui.components.client.TonalCard
import com.storytail.adventures.ui.theme.PillShape

/**
 * Screen 2.5.7 Security Settings — docs/Screen-Inventory.md §2.5.7, §4.4 Pattern A, and
 * design/source-prototype/screens/client-account-mobile.jsx `M257_Security`. P1.
 *
 * Two of the three panels are real and go through GoTrue, which is the established auth path
 * in this repo rather than an Edge Function gap. The sessions panel cannot be built at all.
 *
 * DEPARTURES, per the Screen Inventory note at 2.5.7:
 *
 *  · THE PASSWORD PANEL IS CONDITIONAL ON `auth_provider = 'email'`. A Google or Apple
 *    account has no password: "Last changed 14 March" would be a fabrication and "Change
 *    password" would lead nowhere. Those accounts get a "How you sign in" card instead.
 *  · THE SESSIONS LIST IS DISABLED, not rendered empty. `session` is a shadow table that
 *    NOTHING writes — Data-Model §5.1.1 says not to double-implement what GoTrue owns — so a
 *    list built on it would be permanently empty, and an empty list reads as "you are signed
 *    in nowhere", which is false. The real source is `auth.sessions`, which needs a
 *    service-role Edge Function to read. Per-session sign-out and "sign out everywhere" go
 *    with it.
 *  · NO LOCATION on a session row when it does arrive: `auth.sessions` holds an `ip` and
 *    nothing resolves it to a place, and `session.ip_country` has no writer.
 *  · NO "suspicious activity" panel. `auth_event` has never been written by anything.
 *  · NO BACKUP CODES, and no authenticator vendor named. 2.1.6 records that Supabase has no
 *    backup-code factor and a home-grown one could not be trusted; the factor is TOTP and any
 *    app works.
 *
 * MFA STATE COMES FROM GoTrue rather than the `mfa_device` table, for the same reason.
 * Enrolment already has a screen (2.1.6) and this one links to it rather than growing a
 * second enrolment flow.
 *
 * A FAILED PROVIDER READ FALLS BACK TO THE PASSWORD CARD, and that is the safe direction: the
 * card is inert, so the worst case is offering a disabled control to an OAuth account rather
 * than telling a password user they have none — which is the mistake 2.5.8's fallback used to
 * make.
 */
@Composable
fun SecurityScreen(
    loading: Boolean,
    provider: AuthProviderState,
    mfaOn: Boolean,
    onBack: () -> Unit,
    onOpenConnected: () -> Unit,
    onEnableMfa: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val scheme = MaterialTheme.colorScheme
    val providerName = (provider as? AuthProviderState.Known)?.provider
    val usesPassword = (providerName ?: "email") == "email"

    ClientScaffold(
        modifier = modifier,
        topBar = { AccountTopBar(title = SecurityMessages.TITLE, onBack = onBack) },
    ) {
        Column(
            Modifier.fillMaxWidth().padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(
                SecurityMessages.SUBTITLE,
                style = MaterialTheme.typography.bodyMedium,
                color = scheme.onSurfaceVariant,
            )

            if (loading) {
                SkeletonBlock(Modifier.fillMaxWidth().height(150.dp))
            } else if (usesPassword) {
                TonalCard(background = scheme.surfaceContainer) {
                    Text(
                        SecurityMessages.PASSWORD_TITLE,
                        style = MaterialTheme.typography.titleSmall,
                        color = scheme.onSurface,
                    )
                    Spacer(Modifier.height(4.dp))
                    Text(
                        SecurityMessages.PASSWORD_BODY,
                        style = MaterialTheme.typography.bodySmall,
                        color = scheme.onSurfaceVariant,
                    )
                    Spacer(Modifier.height(12.dp))
                    // NOT a link to 2.1.4. That screen is for somebody signed OUT, and a
                    // signed-in visitor arriving there would be bounced straight off it —
                    // the web proxy holds /forgot-password in AUTH_ONLY_PREFIXES and native
                    // would have to reproduce that rule to no benefit. A real in-place
                    // change needs its own form calling `auth.updateUser`, and that is a
                    // decision as much as a build: `secure_password_change` is false in
                    // supabase/config.toml, so a stolen session could change a password with
                    // no reauthentication.
                    FilledTonalButton(
                        onClick = {},
                        enabled = false,
                        shape = PillShape,
                        modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp),
                    ) { Text(SecurityMessages.PASSWORD_CTA) }
                    Spacer(Modifier.height(6.dp))
                    Text(
                        SecurityMessages.PASSWORD_DEFERRED,
                        style = MaterialTheme.typography.bodySmall,
                        color = scheme.onSurfaceVariant,
                    )
                }
            } else {
                TonalCard(background = scheme.surfaceContainer) {
                    Text(
                        SecurityMessages.NO_PASSWORD_TITLE,
                        style = MaterialTheme.typography.titleSmall,
                        color = scheme.onSurface,
                    )
                    Spacer(Modifier.height(4.dp))
                    Text(
                        noPasswordBody(providerName ?: "your provider"),
                        style = MaterialTheme.typography.bodySmall,
                        color = scheme.onSurfaceVariant,
                    )
                    Spacer(Modifier.height(12.dp))
                    OutlinedButton(
                        onClick = onOpenConnected,
                        shape = PillShape,
                        modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp),
                    ) { Text(SecurityMessages.NO_PASSWORD_CTA) }
                }
            }

            TonalCard(background = scheme.surfaceContainer) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        SecurityMessages.MFA_TITLE,
                        style = MaterialTheme.typography.titleSmall,
                        color = scheme.onSurface,
                        modifier = Modifier.weight(1f),
                    )
                    MfaChip(on = mfaOn)
                }
                Spacer(Modifier.height(6.dp))
                Text(
                    SecurityMessages.MFA_BODY,
                    style = MaterialTheme.typography.bodySmall,
                    color = scheme.onSurfaceVariant,
                )
                Spacer(Modifier.height(12.dp))
                // Enrolling works and is a real destination. MANAGING an existing factor is
                // not: 2.1.6 redirects anyone who already has a verified factor straight back
                // out, and its own comment says why — enrolling a second one from there is
                // Security Settings' job, and that job is this screen's and is not built. So
                // the control says so rather than bouncing the reader off 2.1.6.
                if (mfaOn) {
                    FilledTonalButton(
                        onClick = {},
                        enabled = false,
                        shape = PillShape,
                        modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp),
                    ) { Text(SecurityMessages.MFA_MANAGE_CTA) }
                    Spacer(Modifier.height(6.dp))
                    Text(
                        SecurityMessages.MFA_MANAGE_DEFERRED,
                        style = MaterialTheme.typography.bodySmall,
                        color = scheme.onSurfaceVariant,
                    )
                } else {
                    Button(
                        onClick = onEnableMfa,
                        shape = PillShape,
                        modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp),
                    ) { Text(SecurityMessages.MFA_ENABLE_CTA) }
                }
            }

            Spacer(Modifier.height(6.dp))
            Text(
                SecurityMessages.SESSIONS_HEADING,
                style = MaterialTheme.typography.labelSmall,
                color = scheme.onSurfaceVariant,
            )
            TonalCard(background = scheme.surfaceContainer) {
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    StoryTailGlyph(StoryTailMark.SHIELD, 18.dp, scheme.onSurfaceVariant)
                    Column {
                        Text(
                            SecurityMessages.SESSIONS_DEFERRED,
                            style = MaterialTheme.typography.bodySmall,
                            color = scheme.onSurfaceVariant,
                        )
                        Spacer(Modifier.height(8.dp))
                        Text(
                            SecurityMessages.SESSIONS_ADVICE,
                            style = MaterialTheme.typography.bodySmall,
                            color = scheme.onSurfaceVariant,
                        )
                    }
                }
            }
            Spacer(Modifier.height(24.dp))
        }
    }
}

@Composable
private fun MfaChip(on: Boolean) {
    val scheme = MaterialTheme.colorScheme
    Text(
        text = if (on) SecurityMessages.MFA_ON else SecurityMessages.MFA_OFF,
        style = MaterialTheme.typography.labelSmall,
        color = if (on) scheme.onTertiaryContainer else scheme.onSurfaceVariant,
        modifier = Modifier
            .background(
                if (on) scheme.tertiaryContainer else scheme.surfaceContainerHigh,
                PillShape,
            )
            .padding(horizontal = 10.dp, vertical = 4.dp),
    )
}
