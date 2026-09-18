package com.storytail.adventures.ui.screens.wallet

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.storytail.adventures.api.WalletSnapshot
import com.storytail.adventures.api.WalletUseEventView
import com.storytail.adventures.domain.trip.Loadable
import com.storytail.adventures.domain.wallet.WalletMessages
import com.storytail.adventures.domain.wallet.cardLabel
import com.storytail.adventures.domain.wallet.formatAmount
import com.storytail.adventures.domain.wallet.formatDay
import com.storytail.adventures.ui.components.StoryTailGlyph
import com.storytail.adventures.ui.components.StoryTailMark
import com.storytail.adventures.ui.components.client.AccountTopBar
import com.storytail.adventures.ui.components.client.ClientEmptyState
import com.storytail.adventures.ui.components.client.ClientErrorState
import com.storytail.adventures.ui.components.client.ClientScaffold
import com.storytail.adventures.ui.theme.PillShape
import com.storytail.adventures.ui.theme.StoryTailRadius

/**
 * Screens 2.4.5 Card Use History and 2.4.6 Card Use Detail — docs/Screen-Inventory.md §2.4.5
 * and §2.4.6, §4.4 (Patterns **I** and **C**), and
 * design/source-prototype/screens/client-payment-mobile.jsx (M245_Activity, M246_UseDetail).
 * P1.
 *
 * TWO SCREENS IN ONE FILE because they are one subject — a list of charges and one of those
 * charges — and every rule that governs the list governs the row: the supplier name comes
 * from the snapshot, the amount is the traveler's to see, and the agent's justification is
 * not. Splitting them would put those three notes in two places.
 *
 * **NO CSV EXPORT** on 2.4.5 — departure 4, and cut rather than drawn disabled. It would be
 * the only §2.4 surface that persists this data outside the platform, where no revocation
 * reaches it and no audit follows it, and there is no export precedent in the repo to copy
 * safely.
 *
 * NOTHING WRITES `card_use_event` YET. The producing surface is the agent's reveal-and-record
 * flow in §3.6, unbuilt; today's rows come from `seed.sql`. The screen is real and says so
 * plainly rather than being withheld — the §2.5 precedent.
 */
@Composable
fun CardActivityScreen(
    state: Loadable<WalletSnapshot>,
    cardFilter: String?,
    onBack: () -> Unit,
    onSelectCard: (String?) -> Unit,
    onOpenEvent: (String) -> Unit,
    onRetry: () -> Unit,
    modifier: Modifier = Modifier,
) {
    ClientScaffold(
        modifier = modifier,
        topBar = { AccountTopBar(title = WalletMessages.ACTIVITY_TITLE, onBack = onBack) },
    ) {
        when (state) {
            is Loadable.Loading ->
                Box(Modifier.fillMaxWidth().padding(vertical = 48.dp), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = MaterialTheme.colorScheme.primary)
                }

            is Loadable.Failed ->
                Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp)) {
                    ClientErrorState(
                        title = "We could not open your card activity",
                        body = "The connection dropped on the way. Try again in a moment.",
                        retryLabel = "Try again",
                        onRetry = onRetry,
                    )
                }

            is Loadable.Unauthorized, is Loadable.Empty ->
                Column(Modifier.fillMaxWidth().padding(16.dp)) {
                    ClientEmptyState(
                        title = WalletMessages.ACTIVITY_EMPTY_TITLE,
                        body = WalletMessages.ACTIVITY_EMPTY_BODY,
                        mark = StoryTailMark.CARD,
                    )
                }

            is Loadable.Ready -> {
                val wallet = state.value
                val scheme = MaterialTheme.colorScheme

                Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp)) {
                    Spacer(Modifier.height(14.dp))
                    Text(
                        WalletMessages.ACTIVITY_SUBTITLE,
                        style = MaterialTheme.typography.bodyMedium,
                        color = scheme.onSurfaceVariant,
                    )

                    if (wallet.cards.size > 1) {
                        Spacer(Modifier.height(12.dp))
                        Row(
                            Modifier.horizontalScroll(rememberScrollState()),
                            horizontalArrangement = Arrangement.spacedBy(6.dp),
                        ) {
                            FilterChip(WalletMessages.FILTER_ALL_CARDS, cardFilter == null) {
                                onSelectCard(null)
                            }
                            for (card in wallet.cards) {
                                FilterChip(cardLabel(card.brand, card.last4), cardFilter == card.id) {
                                    onSelectCard(card.id)
                                }
                            }
                        }
                    }

                    Spacer(Modifier.height(12.dp))

                    if (wallet.events.isEmpty()) {
                        ClientEmptyState(
                            title = WalletMessages.ACTIVITY_EMPTY_TITLE,
                            body = WalletMessages.ACTIVITY_EMPTY_BODY,
                            mark = StoryTailMark.CARD,
                        )
                    } else {
                        // Newest first, which the function already ordered: this is a
                        // statement, and a statement reads backwards from the most recent
                        // charge. §2.2.7's thread is the opposite, for the opposite reason.
                        for (event in wallet.events) {
                            EventRow(event, wallet) { onOpenEvent(event.id) }
                            Spacer(Modifier.height(6.dp))
                        }
                    }

                    Spacer(Modifier.height(24.dp))
                }
            }
        }
    }
}

@Composable
private fun FilterChip(label: String, selected: Boolean, onClick: () -> Unit) {
    val scheme = MaterialTheme.colorScheme
    Box(
        Modifier
            .heightIn(min = 44.dp)
            .background(
                if (selected) scheme.primaryContainer else scheme.surfaceContainerHigh,
                PillShape,
            )
            .clickable(onClick = onClick)
            .padding(horizontal = 14.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            label,
            style = MaterialTheme.typography.labelLarge,
            color = if (selected) scheme.onPrimaryContainer else scheme.onSurface,
        )
    }
}

@Composable
private fun EventRow(event: WalletUseEventView, wallet: WalletSnapshot, onClick: () -> Unit) {
    val scheme = MaterialTheme.colorScheme
    val card = wallet.card(event.cardId)

    Row(
        Modifier
            .fillMaxWidth()
            .background(scheme.surfaceContainer, RoundedCornerShape(StoryTailRadius.lg))
            .clickable(onClick = onClick)
            .padding(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            Modifier
                .size(34.dp)
                .background(scheme.primaryContainer, RoundedCornerShape(StoryTailRadius.xs)),
            contentAlignment = Alignment.Center,
        ) {
            StoryTailGlyph(StoryTailMark.CARD, 15.dp, scheme.onPrimaryContainer)
        }
        Spacer(Modifier.width(10.dp))
        Column(Modifier.weight(1f)) {
            // supplier_name_snapshot, never a join — a renamed supplier must not rewrite a
            // traveler's history, and a portal booking names a merchant with no supplier row.
            Text(
                event.supplierName,
                style = MaterialTheme.typography.titleSmall,
                color = scheme.onSurface,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                listOfNotNull(
                    formatDay(event.createdAt),
                    event.tripTitle,
                    card?.let { cardLabel(it.brand, it.last4) },
                ).joinToString(" · "),
                style = MaterialTheme.typography.bodySmall,
                color = scheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        Spacer(Modifier.width(8.dp))
        Text(
            formatAmount(event.amountCents, event.currency),
            style = MaterialTheme.typography.titleSmall,
            color = scheme.onSurface,
        )
    }
}

/**
 * Screen 2.4.6.
 *
 * THE SENTENCE THAT MATTERS is "the supplier charged your card directly. Story-Tail never
 * handled the money." Story-Tail is not the merchant of record — BRD §10.5 prohibits it from
 * being one for its own services — and a detail screen that reads like a Story-Tail receipt
 * describes a relationship the business does not have.
 *
 * **"FLAG AS UNFAMILIAR" IS DISABLED** — departure 5. Data-Model §9.4 declares
 * `card_use_event` append-only, no UPDATE, and in the same table defines `client_flag_status`
 * with three values only UPDATEs can produce. That is a ruling, not a screen decision.
 *
 * **NO RECEIPT** — departure 6. `document_self_select`'s kind allowlist excludes `receipt` on
 * purpose: a supplier receipt shows what the agency actually paid.
 *
 * **NO "NOTE FROM GYASI"** either. That is `justification`, classified Internal in §9.4 and
 * never selected by the wallet function — the agent's reason for the audit trail, not prose
 * written for the traveler. "Ask Gyasi about this" goes to §2.6, where a real answer can be
 * given, and is the one fully live action on the screen.
 */
@Composable
fun CardUseDetailScreen(
    state: Loadable<WalletSnapshot>,
    eventId: String,
    onBack: () -> Unit,
    onAskGyasi: () -> Unit,
    onRetry: () -> Unit,
    modifier: Modifier = Modifier,
) {
    ClientScaffold(
        modifier = modifier,
        topBar = { AccountTopBar(title = WalletMessages.USE_DETAIL_TITLE, onBack = onBack) },
    ) {
        val scheme = MaterialTheme.colorScheme
        val event = (state as? Loadable.Ready)?.value?.event(eventId)

        when {
            state is Loadable.Loading ->
                Box(Modifier.fillMaxWidth().padding(vertical = 48.dp), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = scheme.primary)
                }

            state is Loadable.Failed || event == null ->
                Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp)) {
                    ClientErrorState(
                        title = "We could not open this charge",
                        body = "The connection dropped on the way. Try again in a moment.",
                        retryLabel = "Try again",
                        onRetry = onRetry,
                    )
                }

            else -> {
                // Smart-cast: `event` is non-null only when `state` is Ready, and the two
                // branches above take every other case.
                val card = state.value.card(event.cardId)

                Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp)) {
                    Spacer(Modifier.height(14.dp))
                    Text(
                        formatAmount(event.amountCents, event.currency),
                        style = MaterialTheme.typography.headlineSmall,
                        color = scheme.onSurface,
                    )
                    Text(
                        "${event.supplierName} · ${formatDay(event.createdAt)}",
                        style = MaterialTheme.typography.bodySmall,
                        color = scheme.onSurfaceVariant,
                    )

                    Spacer(Modifier.height(14.dp))

                    Column(
                        Modifier
                            .fillMaxWidth()
                            .background(scheme.tertiaryContainer, RoundedCornerShape(StoryTailRadius.md))
                            .padding(14.dp),
                    ) {
                        Text(
                            WalletMessages.CHARGED_BY_SUPPLIER,
                            style = MaterialTheme.typography.titleSmall,
                            color = scheme.onTertiaryContainer,
                        )
                        Spacer(Modifier.height(4.dp))
                        Text(
                            WalletMessages.CHARGED_BY_SUPPLIER_BODY,
                            style = MaterialTheme.typography.bodySmall,
                            color = scheme.onTertiaryContainer,
                        )
                    }

                    Spacer(Modifier.height(10.dp))

                    val rows = listOfNotNull(
                        WalletMessages.DETAIL_AMOUNT to formatAmount(event.amountCents, event.currency),
                        card?.let { WalletMessages.DETAIL_CARD to cardLabel(it.brand, it.last4) },
                        WalletMessages.DETAIL_SUPPLIER to event.supplierName,
                        event.tripTitle?.let { WalletMessages.DETAIL_TRIP to it },
                        WalletMessages.DETAIL_WHEN to formatDay(event.createdAt),
                        event.referenceNumber?.let { WalletMessages.DETAIL_REFERENCE to it },
                    )

                    Column(
                        Modifier
                            .fillMaxWidth()
                            .background(scheme.surfaceContainer, RoundedCornerShape(StoryTailRadius.lg))
                            .padding(14.dp),
                    ) {
                        rows.forEachIndexed { index, (label, value) ->
                            if (index > 0) HorizontalDivider(color = scheme.outlineVariant)
                            Row(Modifier.fillMaxWidth().padding(vertical = 8.dp)) {
                                Text(
                                    label,
                                    style = MaterialTheme.typography.bodySmall,
                                    color = scheme.onSurfaceVariant,
                                )
                                Spacer(Modifier.width(12.dp))
                                Text(
                                    value,
                                    style = MaterialTheme.typography.bodySmall,
                                    color = scheme.onSurface,
                                    textAlign = TextAlign.End,
                                    modifier = Modifier.weight(1f),
                                )
                            }
                        }
                    }

                    Spacer(Modifier.height(14.dp))

                    // Drawn disabled with the reason beneath rather than omitted: a traveler
                    // who remembers the control should find out why it is inert.
                    Box(
                        Modifier
                            .fillMaxWidth()
                            .heightIn(min = 48.dp)
                            .background(scheme.surfaceContainerHigh, PillShape)
                            .padding(horizontal = 16.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            StoryTailGlyph(StoryTailMark.WARNING, 14.dp, scheme.onSurfaceVariant.copy(alpha = 0.55f))
                            Spacer(Modifier.width(8.dp))
                            Text(
                                WalletMessages.FLAG_UNFAMILIAR,
                                style = MaterialTheme.typography.labelLarge,
                                color = scheme.onSurfaceVariant.copy(alpha = 0.55f),
                            )
                        }
                    }
                    Spacer(Modifier.height(4.dp))
                    Text(
                        WalletMessages.FLAG_DEFERRED,
                        style = MaterialTheme.typography.bodySmall,
                        color = scheme.onSurfaceVariant,
                    )

                    Spacer(Modifier.height(10.dp))

                    Box(
                        Modifier
                            .fillMaxWidth()
                            .heightIn(min = 48.dp)
                            .background(scheme.secondaryContainer, PillShape)
                            .clickable(onClick = onAskGyasi),
                        contentAlignment = Alignment.Center,
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            StoryTailGlyph(StoryTailMark.MESSAGE, 14.dp, scheme.onSecondaryContainer)
                            Spacer(Modifier.width(8.dp))
                            Text(
                                WalletMessages.ASK_GYASI,
                                style = MaterialTheme.typography.labelLarge,
                                color = scheme.onSecondaryContainer,
                            )
                        }
                    }

                    Spacer(Modifier.height(24.dp))
                }
            }
        }
    }
}
