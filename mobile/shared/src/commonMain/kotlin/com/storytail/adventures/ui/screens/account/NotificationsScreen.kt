package com.storytail.adventures.ui.screens.account

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.storytail.adventures.domain.account.NotificationsMessages
import com.storytail.adventures.ui.components.StoryTailGlyph
import com.storytail.adventures.ui.components.StoryTailMark
import com.storytail.adventures.ui.components.client.AccountTopBar
import com.storytail.adventures.ui.components.client.ClientScaffold
import com.storytail.adventures.ui.components.client.TonalCard

/**
 * Screen 2.5.6 Notification Preferences — docs/Screen-Inventory.md §2.5.6, §4.4 Pattern A
 * (matrix form), and design/source-prototype/screens/client-account-mobile.jsx
 * `M256_Notifications`. P1.
 *
 * A PLACEHOLDER, deliberately and in full. This is the one §2.5 screen that cannot be built
 * at all today, and shipping the matrix would be worse than shipping this — it would be a set
 * of switches that control nothing, which is precisely the trap the disabled §2.4 CTAs exist
 * to avoid. Four independent blockers, each needing a migration or a new function:
 *
 *  1. `notification_preference` has RLS enabled and NO POLICY. The read returns zero rows and
 *     always will.
 *  2. No path creates a row. Its primary key is `user_id`, so a screen with no row has
 *     nothing to read even once a policy exists — `handle_new_user()` has to seed one and
 *     this screen has to upsert.
 *  3. No Edge Function references the table, and PostgREST cannot write it either (no write
 *     policy, verbs not granted).
 *  4. NOTHING DELIVERS A NOTIFICATION. There is no dispatcher, no transactional email sender,
 *     and no FCM or APNs wiring anywhere in the repo — the only `firebase` reference in
 *     supabase/config.toml is `[auth.third_party.firebase]`, an identity provider. SMS is off
 *     in config and has no provider, which is why BRD §6.6 says "email and push" and the
 *     Screen Inventory's third channel column was removed.
 *
 * The honest thing a placeholder can do is say which channels are live. Today that is none,
 * so it says so rather than implying the preferences are merely unsaved.
 *
 * The row that reaches this on 2.5.1 is DISABLED, so this screen is unreachable in the built
 * app. It exists anyway, for the same reason the web route does: the route has to resolve
 * rather than crash for anyone who arrives from a future deep link, and this is where the
 * reasoning lives.
 */
@Composable
fun NotificationsScreen(
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val scheme = MaterialTheme.colorScheme

    ClientScaffold(
        modifier = modifier,
        topBar = { AccountTopBar(title = NotificationsMessages.TITLE, onBack = onBack) },
    ) {
        Column(Modifier.fillMaxWidth().padding(16.dp)) {
            TonalCard(background = scheme.surfaceContainer) {
                Column(
                    Modifier.fillMaxWidth().padding(vertical = 10.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Box(
                        Modifier
                            .size(56.dp)
                            .background(scheme.surfaceContainerHigh, CircleShape),
                        contentAlignment = Alignment.Center,
                    ) {
                        StoryTailGlyph(StoryTailMark.BELL, 26.dp, scheme.onSurfaceVariant)
                    }
                    Spacer(Modifier.height(12.dp))
                    Text(
                        NotificationsMessages.EMPTY_TITLE,
                        style = MaterialTheme.typography.titleLarge,
                        color = scheme.onSurface,
                        textAlign = TextAlign.Center,
                    )
                    Spacer(Modifier.height(8.dp))
                    Text(
                        NotificationsMessages.EMPTY_BODY,
                        style = MaterialTheme.typography.bodyMedium,
                        color = scheme.onSurfaceVariant,
                        textAlign = TextAlign.Center,
                    )
                    Spacer(Modifier.height(14.dp))
                    Text(
                        NotificationsMessages.REACH_YOU,
                        style = MaterialTheme.typography.bodySmall,
                        color = scheme.onSurfaceVariant,
                        textAlign = TextAlign.Center,
                    )
                }
            }
            Spacer(Modifier.height(24.dp))
        }
    }
}
