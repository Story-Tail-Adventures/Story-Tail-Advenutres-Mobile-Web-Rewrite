package com.storytail.adventures.ui.screens.wallet

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.storytail.adventures.api.WalletCardView
import com.storytail.adventures.api.WalletSnapshot
import com.storytail.adventures.domain.trip.Loadable
import com.storytail.adventures.domain.wallet.WalletMessages
import com.storytail.adventures.domain.wallet.brandChip
import com.storytail.adventures.domain.wallet.cardExpiry
import com.storytail.adventures.domain.wallet.formatDay
import com.storytail.adventures.domain.wallet.remainingLabel
import com.storytail.adventures.ui.components.StoryTailGlyph
import com.storytail.adventures.ui.components.StoryTailMark
import com.storytail.adventures.ui.components.client.AccountTopBar
import com.storytail.adventures.ui.components.client.ClientEmptyState
import com.storytail.adventures.ui.components.client.ClientErrorState
import com.storytail.adventures.ui.components.client.ClientScaffold
import com.storytail.adventures.ui.theme.PillShape
import com.storytail.adventures.ui.theme.StoryTailRadius

/**
 * Screen 2.4.1 My Cards — docs/Screen-Inventory.md §2.4.1, §4.4 (Pattern **B**), and
 * design/source-prototype/screens/client-payment-mobile.jsx (M241_MyCards). P1.
 *
 * PUSHED, NOT A TAB. Wallet is rail-only on web and absent from the mobile bar, so this is
 * reached from 2.5.1's "Payment methods" row and carries a back bar rather than MClientTabs.
 *
 * THE LIST IS A RECORD, NOT A SETTINGS PANE. A revoked card keeps its place with the date it
 * was revoked, because the question this screen answers is "what has been able to charge me,
 * and when" — not "what can charge me now".
 *
 * NO CARD ART — departure 11. The desktop draws each card as a gradient plate with the number
 * in 26px monospace; at 400pt two of those fill the screen before any of the information that
 * matters. A brand chip identifies the card in a tenth of the space, and what fills the rest
 * is the authorization: which trip, how much is left, when it lapses.
 *
 * **2.4.2 IS DEFERRED**, so "Add a card" is drawn disabled with its reason rather than hidden
 * — the §2.5 rule, so the list does not grow controls under the reader's thumb later.
 */
@Composable
fun WalletScreen(
    state: Loadable<WalletSnapshot>,
    onBack: () -> Unit,
    onOpenActivity: (String?) -> Unit,
    onRemoveAuthorization: (String) -> Unit,
    onRetry: () -> Unit,
    modifier: Modifier = Modifier,
) {
    ClientScaffold(
        modifier = modifier,
        topBar = { AccountTopBar(title = WalletMessages.TITLE, onBack = onBack) },
    ) {
        when (state) {
            is Loadable.Loading ->
                Box(Modifier.fillMaxWidth().padding(vertical = 48.dp), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = MaterialTheme.colorScheme.primary)
                }

            is Loadable.Failed ->
                Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp)) {
                    ClientErrorState(
                        title = "We could not open your wallet",
                        body = "The connection dropped on the way. Try again in a moment.",
                        retryLabel = "Try again",
                        onRetry = onRetry,
                    )
                }

            // Listed rather than folded into an `else` — see the note in DocumentsScreen.
            is Loadable.Unauthorized, is Loadable.Empty ->
                Column(Modifier.fillMaxWidth().padding(16.dp)) {
                    ClientEmptyState(
                        title = WalletMessages.EMPTY_TITLE,
                        body = WalletMessages.EMPTY_BODY,
                        mark = StoryTailMark.CARD,
                    )
                }

            is Loadable.Ready -> WalletBody(
                wallet = state.value,
                onOpenActivity = onOpenActivity,
                onRemoveAuthorization = onRemoveAuthorization,
            )
        }
    }
}

@Composable
private fun WalletBody(
    wallet: WalletSnapshot,
    onOpenActivity: (String?) -> Unit,
    onRemoveAuthorization: (String) -> Unit,
) {
    val scheme = MaterialTheme.colorScheme

    Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp)) {
        Spacer(Modifier.height(14.dp))
        Text(
            WalletMessages.SUBTITLE,
            style = MaterialTheme.typography.bodyMedium,
            color = scheme.onSurfaceVariant,
        )

        Spacer(Modifier.height(12.dp))

        // BRD §10.5 is a hard product constraint rather than reassurance: Story-Tail is
        // contractually prohibited from charging a client a fee, which is why the schema has
        // no invoice entity and no charge endpoint at all.
        Row(
            Modifier
                .fillMaxWidth()
                .background(scheme.secondaryContainer, RoundedCornerShape(StoryTailRadius.md))
                .padding(12.dp),
        ) {
            StoryTailGlyph(StoryTailMark.SHIELD, 18.dp, scheme.onSecondaryContainer)
            Spacer(Modifier.width(10.dp))
            Column {
                Text(
                    WalletMessages.FEE_ASSURANCE,
                    style = MaterialTheme.typography.titleSmall,
                    color = scheme.onSecondaryContainer,
                )
                Text(
                    WalletMessages.FEE_ASSURANCE_BODY,
                    style = MaterialTheme.typography.bodySmall,
                    color = scheme.onSecondaryContainer,
                )
            }
        }

        Spacer(Modifier.height(14.dp))

        if (wallet.cards.isEmpty()) {
            ClientEmptyState(
                title = WalletMessages.EMPTY_TITLE,
                body = WalletMessages.EMPTY_BODY,
                mark = StoryTailMark.CARD,
            )
        } else {
            for (card in wallet.cards) {
                CardRow(
                    card = card,
                    wallet = wallet,
                    onOpenActivity = onOpenActivity,
                    onRemoveAuthorization = onRemoveAuthorization,
                )
                Spacer(Modifier.height(8.dp))
            }
        }

        // Deferred, shown, explained — never hidden.
        Column(
            Modifier
                .fillMaxWidth()
                .border(1.5.dp, scheme.outline, RoundedCornerShape(StoryTailRadius.lg))
                .background(scheme.surfaceContainer, RoundedCornerShape(StoryTailRadius.lg))
                .padding(vertical = 18.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            StoryTailGlyph(StoryTailMark.CARD, 22.dp, scheme.onSurfaceVariant)
            Spacer(Modifier.height(4.dp))
            Text(
                WalletMessages.ADD_CARD,
                style = MaterialTheme.typography.titleSmall,
                color = scheme.onSurfaceVariant,
            )
            Text(
                WalletMessages.ADD_CARD_DEFERRED,
                style = MaterialTheme.typography.bodySmall,
                color = scheme.onSurfaceVariant,
            )
        }

        if (wallet.events.isNotEmpty()) {
            Spacer(Modifier.height(14.dp))
            Row(
                Modifier
                    .fillMaxWidth()
                    .heightIn(min = 48.dp)
                    .clickable { onOpenActivity(null) },
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    WalletMessages.ACTIVITY_TITLE,
                    style = MaterialTheme.typography.labelLarge,
                    color = scheme.primary,
                )
                Spacer(Modifier.width(6.dp))
                StoryTailGlyph(StoryTailMark.CHEVRON_RIGHT, 14.dp, scheme.primary)
            }
        }

        Spacer(Modifier.height(24.dp))
    }
}

@Composable
private fun CardRow(
    card: WalletCardView,
    wallet: WalletSnapshot,
    onOpenActivity: (String?) -> Unit,
    onRemoveAuthorization: (String) -> Unit,
) {
    val scheme = MaterialTheme.colorScheme
    val live = wallet.activeAuthorizationsFor(card.id)

    Column(
        Modifier
            .fillMaxWidth()
            .background(scheme.surfaceContainer, RoundedCornerShape(StoryTailRadius.lg))
            .padding(14.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            // `brandChip`, never `brand.take(4)` — that renders "mastercard" as MAST, which
            // the web build shipped to a browser before a screenshot caught it.
            Box(
                Modifier
                    .width(38.dp)
                    .height(24.dp)
                    .background(
                        if (card.brand.lowercase() == "visa") Color(0xFF1A1F71) else Color(0xFFEB001B),
                        RoundedCornerShape(4.dp),
                    ),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    brandChip(card.brand),
                    color = Color.White,
                    fontSize = 9.sp,
                    fontWeight = FontWeight.ExtraBold,
                )
            }
            Spacer(Modifier.width(10.dp))
            Column(Modifier.weight(1f)) {
                Text(
                    "•••• ${card.last4}",
                    style = MaterialTheme.typography.titleSmall,
                    color = scheme.onSurface,
                )
                Text(
                    listOfNotNull(card.nickname, "exp ${cardExpiry(card.expMonth, card.expYear)}")
                        .joinToString(" · "),
                    style = MaterialTheme.typography.bodySmall,
                    color = scheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            StatusChip(if (card.isActive) WalletMessages.STATUS_ACTIVE else WalletMessages.STATUS_REVOKED, card.isActive)
        }

        if (card.isActive && live.isNotEmpty()) {
            Spacer(Modifier.height(10.dp))
            HorizontalDivider(color = scheme.outlineVariant)
            for (auth in live) {
                Spacer(Modifier.height(10.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(
                            auth.tripTitle ?: WalletMessages.CONFIRMED_TRIP,
                            style = MaterialTheme.typography.bodyMedium,
                            color = scheme.onSurface,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                        Text(
                            remainingLabel(auth.remainingCents, auth.spendingLimitCents),
                            style = MaterialTheme.typography.bodySmall,
                            color = scheme.onSurfaceVariant,
                        )
                    }
                    Spacer(Modifier.width(8.dp))
                    Box(
                        Modifier
                            .heightIn(min = 48.dp)
                            .border(1.dp, scheme.outline, PillShape)
                            .clickable { onRemoveAuthorization(auth.id) }
                            .padding(horizontal = 14.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(
                            WalletMessages.REMOVE_AUTHORIZATION,
                            style = MaterialTheme.typography.labelLarge,
                            color = scheme.onSurface,
                        )
                    }
                }
            }
        }

        if (!card.isActive && card.revokedAt != null) {
            Spacer(Modifier.height(10.dp))
            HorizontalDivider(color = scheme.outlineVariant)
            Spacer(Modifier.height(8.dp))
            Text(
                "${WalletMessages.STATUS_REVOKED} ${formatDay(card.revokedAt)}",
                style = MaterialTheme.typography.bodySmall,
                color = scheme.onSurfaceVariant,
            )
        }

        Spacer(Modifier.height(10.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Box(
                Modifier
                    .heightIn(min = 48.dp)
                    .background(scheme.secondaryContainer, PillShape)
                    .clickable { onOpenActivity(card.id) }
                    .padding(horizontal = 16.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    WalletMessages.VIEW_ACTIVITY,
                    style = MaterialTheme.typography.labelLarge,
                    color = scheme.onSecondaryContainer,
                )
            }
        }
    }
}

@Composable
internal fun StatusChip(label: String, active: Boolean) {
    val scheme = MaterialTheme.colorScheme
    Box(
        Modifier
            .background(
                if (active) scheme.primaryContainer else scheme.surfaceContainerHighest,
                PillShape,
            )
            .padding(horizontal = 10.dp, vertical = 4.dp),
    ) {
        Text(
            label.uppercase(),
            style = MaterialTheme.typography.labelSmall,
            fontWeight = FontWeight.Bold,
            color = if (active) scheme.onPrimaryContainer else scheme.onSurfaceVariant,
        )
    }
}
