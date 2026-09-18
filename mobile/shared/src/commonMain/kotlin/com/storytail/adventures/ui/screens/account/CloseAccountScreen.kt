package com.storytail.adventures.ui.screens.account

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.storytail.adventures.domain.account.CLOSE_WHAT_HAPPENS
import com.storytail.adventures.domain.account.CloseMessages
import com.storytail.adventures.ui.components.AuthTextField
import com.storytail.adventures.ui.components.StoryTailGlyph
import com.storytail.adventures.ui.components.StoryTailMark
import com.storytail.adventures.ui.components.client.AccountTopBar
import com.storytail.adventures.ui.components.client.ClientScaffold
import com.storytail.adventures.ui.components.client.TonalCard
import com.storytail.adventures.ui.theme.PillShape

/**
 * Screen 2.5.10 Account Closure — docs/Screen-Inventory.md §2.5.10, §4.4 Pattern J
 * (destructive confirmation), and design/source-prototype/screens/client-account-mobile.jsx
 * `M2510_Closure`. P1.
 *
 * READ-ONLY today: the CTA is disabled because NO Edge Function writes to `account` — a grep
 * across supabase/functions returns zero hits for that table — and PostgREST is refused twice
 * over (no write policy, and the write verbs are not granted).
 *
 * A FULL-SCREEN ROUTE, not a bottom sheet — departure 11 in the mobile artboard. A sheet's
 * grabber means "swipe this away", which is exactly the wrong affordance on a destructive
 * confirmation, and the screen deserves its own Back for the same reason §2.2.9 is a route.
 *
 * DEPARTURES, per the Screen Inventory note at 2.5.10:
 *  · Confirmation is a TYPED EMAIL, not a password re-entry. `auth_provider` is
 *    ('email','google','apple'), so a Google or Apple account has no password and the
 *    artboard's password field is a wall those accounts cannot pass.
 *  · NO "within 30 days". Data-Model §18.5 describes that window and nothing implements it —
 *    no migration, no pg_cron entry, no function. A dated retention promise on a legal screen
 *    is the class of claim PUBLIC_CLAIMS_MODE=strict exists to stop.
 *  · Card revocation is stated as a CONSEQUENCE, which is true whether or not §2.4 shipped.
 *  · The reason field has no column of its own — `account.locked_reason` is agent-facing and
 *    withheld from clients — so it is disabled alongside the CTA rather than collected into
 *    the wrong place.
 *
 * NOTHING HERE SELLS. Design-System §2.5 says the brand is not used to sell more, and the
 * artboard's "helps Gyasi follow up if you reconsider" is a retention hook on a closure
 * screen. The offer to talk to him stays — that is useful — but the field is not framed as a
 * way to win somebody back.
 */
@Composable
fun CloseAccountScreen(
    email: String?,
    onBack: () -> Unit,
    onMessageGyasi: () -> Unit,
    onKeepAccount: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val scheme = MaterialTheme.colorScheme

    ClientScaffold(
        modifier = modifier,
        topBar = {
            AccountTopBar(
                title = CloseMessages.TITLE,
                onBack = onBack,
                // Named, because this screen is reached from 2.5.9 rather than from the hub
                // — "Back" alone would not say where.
                backLabel = CloseMessages.BACK,
            )
        },
    ) {
        Column(
            Modifier.fillMaxWidth().padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Box(
                    Modifier.size(44.dp).background(scheme.errorContainer, CircleShape),
                    contentAlignment = Alignment.Center,
                ) {
                    StoryTailGlyph(StoryTailMark.WARNING, 20.dp, scheme.onErrorContainer)
                }
                Text(
                    CloseMessages.HEADING,
                    style = MaterialTheme.typography.titleLarge,
                    color = scheme.onSurface,
                )
            }

            TonalCard(background = scheme.surfaceContainer) {
                Text(
                    CloseMessages.WHAT_HAPPENS_LABEL,
                    style = MaterialTheme.typography.labelSmall,
                    color = scheme.onSurfaceVariant,
                )
                Spacer(Modifier.height(8.dp))
                CLOSE_WHAT_HAPPENS.forEach { line ->
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text("·", style = MaterialTheme.typography.bodyMedium, color = scheme.onSurfaceVariant)
                        Text(
                            line,
                            style = MaterialTheme.typography.bodySmall,
                            color = scheme.onSurfaceVariant,
                        )
                    }
                    Spacer(Modifier.height(6.dp))
                }
            }

            TonalCard(background = scheme.secondaryContainer) {
                Text(
                    CloseMessages.RECONSIDER_BODY,
                    style = MaterialTheme.typography.bodySmall,
                    color = scheme.onSecondaryContainer,
                )
                // `onSecondaryContainer`, not the default primary. A TextButton inherits the
                // theme's primary colour regardless of what it is sitting on, and in the
                // dark scheme that is ocean blue on a sunset-gold card — the one place in
                // §2.5 where the two schemes disagree about whether a control is readable.
                // Caught on the emulator in dark mode, which is why §2.2's rule is to check
                // both schemes on every screen rather than to reason about them.
                TextButton(
                    onClick = onMessageGyasi,
                    colors = ButtonDefaults.textButtonColors(
                        contentColor = scheme.onSecondaryContainer,
                    ),
                ) {
                    Text(CloseMessages.RECONSIDER_CTA)
                }
            }

            // Both inputs are inert, and both are shown rather than hidden: the reader is
            // being told exactly what closing will ask of them when it works, which is the
            // point of a confirmation screen. Empty values, because a disabled box holding
            // typed text implies it was captured.
            AuthTextField(
                label = CloseMessages.REASON_LABEL,
                value = "",
                onValueChange = {},
                supportingText = CloseMessages.REASON_PLACEHOLDER,
                enabled = false,
            )
            AuthTextField(
                label = CloseMessages.CONFIRM_LABEL,
                value = "",
                onValueChange = {},
                // The address is a HINT, never a prefilled value: typing it is the whole
                // confirmation, and pre-filling the box would reduce it to one tap.
                supportingText = email ?: CloseMessages.CONFIRM_PLACEHOLDER,
                enabled = false,
            )
            Text(
                CloseMessages.CONFIRM_HINT,
                style = MaterialTheme.typography.bodySmall,
                color = scheme.onSurfaceVariant,
            )

            Button(
                onClick = {},
                enabled = false,
                shape = PillShape,
                colors = ButtonDefaults.buttonColors(
                    containerColor = scheme.error,
                    contentColor = scheme.onError,
                ),
                modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp),
            ) { Text(CloseMessages.CONFIRM_CTA) }
            Text(
                CloseMessages.DEFERRED,
                style = MaterialTheme.typography.bodySmall,
                color = scheme.onSurfaceVariant,
            )

            TextButton(onClick = onKeepAccount, modifier = Modifier.fillMaxWidth()) {
                Text(CloseMessages.KEEP_CTA)
            }
            Spacer(Modifier.height(24.dp))
        }
    }
}
