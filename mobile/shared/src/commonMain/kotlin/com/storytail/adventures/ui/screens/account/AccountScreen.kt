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
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.storytail.adventures.api.AccountOverview
import com.storytail.adventures.domain.account.AccountMessages
import com.storytail.adventures.domain.account.documentsSub
import com.storytail.adventures.domain.account.memberSince
import com.storytail.adventures.domain.account.monthAndYear
import com.storytail.adventures.domain.auth.INITIALS_FALLBACK
import com.storytail.adventures.domain.auth.initialsFor
import com.storytail.adventures.domain.trip.Loadable
import com.storytail.adventures.ui.components.StoryTailMark
import com.storytail.adventures.ui.components.client.AvatarTone
import com.storytail.adventures.ui.components.client.ClientScaffold
import com.storytail.adventures.ui.components.client.InitialsAvatar
import com.storytail.adventures.ui.components.client.SettingsGroup
import com.storytail.adventures.ui.components.client.SettingsRow
import com.storytail.adventures.ui.components.client.SkeletonBlock
import com.storytail.adventures.ui.theme.PillShape

/**
 * Screen 2.5.1 Account Overview — docs/Screen-Inventory.md §2.5.1, §4.4 Pattern D variant,
 * and design/source-prototype/screens/client-account-mobile.jsx `M251_AccountOverview`. P1.
 *
 * THE ROOT OF THE ACCOUNT TAB, and the only §2.5 screen reached from the bar rather than
 * pushed. It is also the only place in the app that owns SIGN OUT — §2.2's `TripRoute`
 * carried an unused `onSignOut` against this screen existing, and it no longer needs to.
 *
 * A LIST, not the web twin's tile grid. §4.4's Pattern D variant is explicit — "Mobile: list
 * of tiles. Tablet/web: grid of tiles" — and it is the artboard's shape too.
 *
 * DEPARTURES FROM THE ARTBOARD, each recorded in the Screen Inventory note at 2.5.1 and each
 * matching the web build:
 *  · No "Member ID · STA-5839" chip — no such column exists anywhere, and inventing a
 *    customer number is a support burden rather than a feature.
 *  · The avatar is INITIALS, never a photograph. `web/lib/images.ts` has no avatar entries,
 *    so every `staImg('avatar*')` in the artboards is a stock portrait of a stranger.
 *  · "Payment methods" renders disabled with a reason — §2.4 is unbuilt.
 *  · "Notifications" is disabled too: `notification_preference` has RLS with no policy and
 *    no row-creation path, so 2.5.6 would read zero rows forever. Its route still exists and
 *    says so; see NotificationsScreen.
 *  · No "Story-Tail Adventures · v1.0" footer. There is no build-version source in
 *    commonMain, and a hardcoded "v1.0" is a claim that goes stale on the next release.
 *
 * The document count is READ rather than hardcoded, and a failed count falls back to the
 * neutral subtitle rather than "0 files" — a count here that 2.5.4 contradicts is the
 * cheapest possible bug to ship, and "0 files" is a wrong statement about somebody's own
 * documents.
 */
@Composable
fun AccountScreen(
    state: Loadable<AccountOverview>,
    onSelectTab: (String) -> Unit,
    onOpenPersonal: () -> Unit,
    onOpenPreferences: () -> Unit,
    onOpenDocuments: () -> Unit,
    onOpenSecurity: () -> Unit,
    onOpenConnected: () -> Unit,
    onOpenHelp: () -> Unit,
    onOpenPrivacy: () -> Unit,
    onSignOut: () -> Unit,
    modifier: Modifier = Modifier,
) {
    ClientScaffold(
        modifier = modifier,
        activeTab = "account",
        onSelectTab = onSelectTab,
    ) {
        when (state) {
            is Loadable.Loading -> AccountHeaderSkeleton()

            // Listed rather than folded into an `else`, matching App.kt's discipline for
            // routes: a sixth Loadable state should fail to compile here rather than
            // silently inherit whichever branch happened to be last. This loader never
            // produces any of the three — the repository degrades to blanks instead — so
            // they render the header with nothing in it, which is what a degraded read is.
            is Loadable.Failed, is Loadable.Empty, is Loadable.Unauthorized ->
                AccountIdentityHeader(AccountOverview())

            is Loadable.Ready -> AccountIdentityHeader(state.value)
        }

        Column(Modifier.padding(horizontal = 16.dp)) {
            val overview = (state as? Loadable.Ready)?.value
            val files = overview?.documentCount

            SettingsGroup(label = AccountMessages.GROUP_YOU) {
                SettingsRow(
                    first = true,
                    mark = StoryTailMark.USER,
                    title = AccountMessages.PERSONAL,
                    sub = AccountMessages.PERSONAL_SUB,
                    onClick = onOpenPersonal,
                )
                SettingsRow(
                    mark = StoryTailMark.HEART,
                    title = AccountMessages.PREFERENCES,
                    sub = AccountMessages.PREFERENCES_SUB,
                    onClick = onOpenPreferences,
                )
                SettingsRow(
                    mark = StoryTailMark.PASSPORT,
                    title = AccountMessages.DOCUMENTS,
                    sub = if (files == null || files == 0) {
                        AccountMessages.DOCUMENTS_EMPTY_SUB
                    } else {
                        documentsSub(files)
                    },
                    onClick = onOpenDocuments,
                )
            }

            SettingsGroup(label = AccountMessages.GROUP_APP) {
                SettingsRow(
                    first = true,
                    mark = StoryTailMark.BELL,
                    title = AccountMessages.NOTIFICATIONS,
                    disabled = true,
                    reason = AccountMessages.COMING_SOON,
                )
                SettingsRow(
                    mark = StoryTailMark.SHIELD,
                    title = AccountMessages.SECURITY,
                    sub = AccountMessages.SECURITY_SUB,
                    onClick = onOpenSecurity,
                )
                SettingsRow(
                    mark = StoryTailMark.LINK,
                    title = AccountMessages.CONNECTED,
                    sub = AccountMessages.CONNECTED_SUB,
                    onClick = onOpenConnected,
                )
                SettingsRow(
                    mark = StoryTailMark.CARD,
                    title = AccountMessages.WALLET,
                    disabled = true,
                    reason = AccountMessages.COMING_SOON,
                )
            }

            SettingsGroup(label = AccountMessages.GROUP_SUPPORT) {
                SettingsRow(
                    first = true,
                    mark = StoryTailMark.QUESTION,
                    title = AccountMessages.HELP,
                    sub = AccountMessages.HELP_SUB,
                    onClick = onOpenHelp,
                )
                SettingsRow(
                    mark = StoryTailMark.LOCK,
                    title = AccountMessages.PRIVACY,
                    sub = AccountMessages.PRIVACY_SUB,
                    onClick = onOpenPrivacy,
                )
            }

            Spacer(Modifier.height(18.dp))
            OutlinedButton(
                onClick = onSignOut,
                shape = PillShape,
                modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp),
            ) {
                Text(AccountMessages.SIGN_OUT)
            }
            Spacer(Modifier.height(24.dp))
        }
    }
}

/** The gradient identity band the artboard puts above the groups. */
@Composable
private fun AccountIdentityHeader(overview: AccountOverview) {
    val scheme = MaterialTheme.colorScheme
    val initials = initialsFor(
        overview.preferredName ?: overview.firstName,
        overview.lastName,
    )
    val displayName = listOfNotNull(
        (overview.preferredName ?: overview.firstName)?.takeIf { it.isNotBlank() },
        overview.lastName?.takeIf { it.isNotBlank() },
    ).joinToString(" ").ifBlank { AccountMessages.FALLBACK_NAME }
    val since = monthAndYear(overview.createdAt)

    Row(
        Modifier
            .fillMaxWidth()
            .background(
                Brush.linearGradient(
                    listOf(scheme.primaryContainer, scheme.secondaryContainer),
                ),
            )
            .padding(horizontal = 16.dp, vertical = 18.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        // `surface`, so the circle reads as a distinct object against the gradient rather
        // than another container tone blending into it. Spelled out as a tone rather than
        // built from a name — see AvatarTone.
        InitialsAvatar(
            initials = initials.ifBlank { INITIALS_FALLBACK },
            size = 64.dp,
            tone = AvatarTone.SURFACE,
        )
        Column(Modifier.weight(1f)) {
            Text(
                displayName,
                style = MaterialTheme.typography.headlineSmall,
                color = scheme.onPrimaryContainer,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            if (!overview.email.isNullOrBlank()) {
                Text(
                    overview.email,
                    style = MaterialTheme.typography.bodySmall,
                    color = scheme.onPrimaryContainer,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            if (since != null) {
                Text(
                    memberSince(since),
                    style = MaterialTheme.typography.bodySmall,
                    color = scheme.onPrimaryContainer,
                )
            }
        }
    }
}

/** §5's skeleton for the band. The rows below it are static and need none. */
@Composable
private fun AccountHeaderSkeleton() {
    Column(
        Modifier.fillMaxWidth().padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        SkeletonBlock(Modifier.fillMaxWidth().height(88.dp))
    }
}
