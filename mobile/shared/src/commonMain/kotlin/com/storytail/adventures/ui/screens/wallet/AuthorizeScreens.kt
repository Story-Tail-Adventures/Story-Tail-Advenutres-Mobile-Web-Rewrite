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
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.storytail.adventures.api.WalletCardView
import com.storytail.adventures.api.WalletSnapshot
import com.storytail.adventures.domain.trip.Loadable
import com.storytail.adventures.domain.wallet.WalletMessages
import com.storytail.adventures.domain.wallet.brandName
import com.storytail.adventures.domain.wallet.cardExpiry
import com.storytail.adventures.domain.wallet.cardLabel
import com.storytail.adventures.domain.wallet.formatDay
import com.storytail.adventures.domain.wallet.remainingLabel
import com.storytail.adventures.ui.components.StoryTailGlyph
import com.storytail.adventures.ui.components.StoryTailMark
import com.storytail.adventures.ui.components.client.AccountTopBar
import com.storytail.adventures.ui.components.client.ClientEmptyState
import com.storytail.adventures.ui.components.client.ClientErrorState
import com.storytail.adventures.ui.components.client.ClientScaffold
import com.storytail.adventures.ui.components.client.formatMoney
import com.storytail.adventures.ui.theme.PillShape
import com.storytail.adventures.ui.theme.StoryTailRadius

/**
 * Screens 2.4.3 Authorize, 2.4.4 Confirmation and 2.4.7 Remove — docs/Screen-Inventory.md
 * §2.4.3/§2.4.4/§2.4.7, §4.4 (Patterns **A**, **H**, **J**), and
 * design/source-prototype/screens/client-payment-mobile.jsx (M243, M244, M247). P1.
 *
 * THREE SCREENS IN ONE FILE because they are one authorization's life: created, confirmed,
 * removed. The rules that govern them are shared — the mandate is frozen at consent, the
 * limit is whole cents, and none of them touches a card — and splitting them would put those
 * notes in three places.
 */

/**
 * 2.4.3.
 *
 * THE CONSENT BOX GATES THE BUTTON *AND* IS RE-CHECKED SERVER-SIDE. Disabling the button is a
 * courtesy; the server check is what makes `card_authorization.consent_payload` mean
 * anything, because a mandate recorded for somebody who never ticked the box is worse than no
 * record at all.
 *
 * `imePadding` and `navigationBarsPadding` on the action bar, both load-bearing: without the
 * first the button hides behind the keyboard the custom-amount field opens, and without the
 * second it sits under the home pill on gesture navigation — the §2.5 bug that reached a
 * reviewer.
 */
@Composable
fun AuthorizeScreen(
    state: Loadable<WalletSnapshot>,
    tripTitle: String,
    balanceDueCents: Long,
    presets: List<Pair<String, Long>>,
    selectedCardId: String?,
    selectedLimitCents: Long,
    expiryIso: String,
    consented: Boolean,
    sending: Boolean,
    error: String?,
    onSelectCard: (String) -> Unit,
    onSelectLimit: (Long) -> Unit,
    onToggleConsent: (Boolean) -> Unit,
    onSubmit: () -> Unit,
    onBack: () -> Unit,
    onRetry: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val scheme = MaterialTheme.colorScheme
    val cards = (state as? Loadable.Ready)?.value?.cards?.filter { it.isActive }.orEmpty()
    val canSubmit = consented && !sending && selectedCardId != null && selectedLimitCents > 0

    ClientScaffold(
        modifier = modifier,
        topBar = { AccountTopBar(title = WalletMessages.AUTHORIZE_TITLE, onBack = onBack) },
        footer = if (cards.isEmpty()) null else {
            {
                Row(
                    Modifier
                        .fillMaxWidth()
                        .background(scheme.surfaceContainerLow)
                        .imePadding()
                        .navigationBarsPadding()
                        .padding(horizontal = 16.dp, vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Box(
                        Modifier
                            .weight(1f)
                            .heightIn(min = 48.dp)
                            .background(
                                if (canSubmit) scheme.primary else scheme.surfaceContainerHighest,
                                PillShape,
                            )
                            .clickable(enabled = canSubmit, onClick = onSubmit),
                        contentAlignment = Alignment.Center,
                    ) {
                        if (sending) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(18.dp),
                                strokeWidth = 2.dp,
                                color = scheme.onSurfaceVariant,
                            )
                        } else {
                            Text(
                                "${WalletMessages.AUTHORIZE_CTA} ${formatMoney(selectedLimitCents, "USD")}",
                                style = MaterialTheme.typography.labelLarge,
                                color = if (canSubmit) scheme.onPrimary else scheme.onSurfaceVariant,
                            )
                        }
                    }
                }
            }
        },
    ) {
        Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp)) {
            Spacer(Modifier.height(14.dp))

            // LOADING AND FAILED ARE NOT "YOU HAVE NO CARDS", and this screen used to say
            // they were. `cards` is derived from `Loadable.Ready` alone, so it is empty in
            // all three states — a slow network or a dead one fell straight through to the
            // empty state below and told a traveler with a wallet full of cards that they had
            // none, on the screen where they are about to authorize money against one. There
            // was no spinner, no error and no way back. The sibling screens in this file all
            // had the branch; the one that most needed it did not.
            when (state) {
                is Loadable.Loading -> {
                    Box(
                        Modifier.fillMaxWidth().padding(vertical = 48.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        CircularProgressIndicator(color = scheme.primary)
                    }
                    return@ClientScaffold
                }

                is Loadable.Failed -> {
                    ClientErrorState(
                        title = "We could not open your cards",
                        body = "The connection dropped on the way. Try again in a moment.",
                        retryLabel = "Try again",
                        onRetry = onRetry,
                    )
                    Spacer(Modifier.height(24.dp))
                    return@ClientScaffold
                }

                // Ready and Empty both mean "the read finished". Empty falls through to the
                // no-cards state below, which is then the truth rather than a guess.
                else -> Unit
            }

            // The desktop's right rail, moved ABOVE the form: on a phone the traveler needs to
            // know which trip they are authorizing before they pick a card, not after.
            Column(
                Modifier
                    .fillMaxWidth()
                    .background(scheme.surfaceContainer, RoundedCornerShape(StoryTailRadius.lg))
                    .padding(14.dp),
            ) {
                Text(tripTitle, style = MaterialTheme.typography.titleSmall, color = scheme.onSurface)
                Spacer(Modifier.height(8.dp))
                HorizontalDivider(color = scheme.outlineVariant)
                Spacer(Modifier.height(8.dp))
                Row(Modifier.fillMaxWidth()) {
                    Text(
                        "Balance due",
                        style = MaterialTheme.typography.bodySmall,
                        color = scheme.onSurfaceVariant,
                        modifier = Modifier.weight(1f),
                    )
                    Text(
                        formatMoney(balanceDueCents, "USD"),
                        style = MaterialTheme.typography.titleSmall,
                        color = scheme.onSurface,
                    )
                }
            }

            if (cards.isEmpty()) {
                // No usable card and no way to add one while 2.4.2 is deferred. Saying so beats
                // a form whose only control is inert.
                Spacer(Modifier.height(14.dp))
                ClientEmptyState(
                    title = WalletMessages.EMPTY_TITLE,
                    body = "${WalletMessages.EMPTY_BODY} ${WalletMessages.ADD_CARD_DEFERRED}.",
                    mark = StoryTailMark.CARD,
                )
                Spacer(Modifier.height(24.dp))
                return@ClientScaffold
            }

            Spacer(Modifier.height(16.dp))
            Text(
                WalletMessages.AUTHORIZE_CARD_HEADING,
                style = MaterialTheme.typography.titleSmall,
                color = scheme.onSurface,
            )
            Spacer(Modifier.height(6.dp))
            for (card in cards) {
                CardChoice(card, card.id == selectedCardId) { onSelectCard(card.id) }
                Spacer(Modifier.height(6.dp))
            }
            // Departure 2: no "Add new card" branch while 2.4.2 is deferred — it would
            // dead-end. The picker says why instead.
            Text(
                WalletMessages.AUTHORIZE_NO_NEW_CARD,
                style = MaterialTheme.typography.bodySmall,
                color = scheme.onSurfaceVariant,
            )

            Spacer(Modifier.height(16.dp))
            Text(
                WalletMessages.LIMIT_HEADING,
                style = MaterialTheme.typography.titleSmall,
                color = scheme.onSurface,
            )
            Text(
                WalletMessages.LIMIT_BODY,
                style = MaterialTheme.typography.bodySmall,
                color = scheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(8.dp))

            // Departure 12: a 2x2 rather than the desktop's four-across. At 400pt each of
            // four side-by-side cards is narrower than the amount inside it.
            for (pair in presets.chunked(2)) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    for ((label, cents) in pair) {
                        PresetTile(
                            label = label,
                            amount = formatMoney(cents, "USD"),
                            selected = cents == selectedLimitCents,
                            modifier = Modifier.weight(1f),
                        ) { onSelectLimit(cents) }
                    }
                    if (pair.size == 1) Spacer(Modifier.weight(1f))
                }
                Spacer(Modifier.height(8.dp))
            }

            Spacer(Modifier.height(6.dp))
            Text(
                "${WalletMessages.EXPIRES_LABEL}: ${formatDay(expiryIso)}. ${WalletMessages.EXPIRES_HINT}",
                style = MaterialTheme.typography.bodySmall,
                color = scheme.onSurfaceVariant,
            )

            Spacer(Modifier.height(14.dp))
            Row(
                Modifier
                    .fillMaxWidth()
                    .background(scheme.surfaceContainer, RoundedCornerShape(StoryTailRadius.md))
                    .clickable { onToggleConsent(!consented) }
                    .padding(12.dp),
            ) {
                Checkbox(checked = consented, onCheckedChange = onToggleConsent)
                Spacer(Modifier.width(8.dp))
                Text(
                    WalletMessages.CONSENT_MANDATE,
                    style = MaterialTheme.typography.bodySmall,
                    color = scheme.onSurface,
                )
            }

            if (error != null) {
                Spacer(Modifier.height(8.dp))
                Text(error, style = MaterialTheme.typography.bodySmall, color = scheme.error)
            }

            Spacer(Modifier.height(24.dp))
        }
    }
}

@Composable
private fun CardChoice(card: WalletCardView, selected: Boolean, onClick: () -> Unit) {
    val scheme = MaterialTheme.colorScheme
    Row(
        Modifier
            .fillMaxWidth()
            .heightIn(min = 48.dp)
            .border(
                1.5.dp,
                if (selected) scheme.primary else scheme.outlineVariant,
                RoundedCornerShape(StoryTailRadius.md),
            )
            .background(
                if (selected) scheme.primaryContainer else scheme.surface,
                RoundedCornerShape(StoryTailRadius.md),
            )
            .clickable(onClick = onClick)
            .padding(horizontal = 12.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        RadioButton(selected = selected, onClick = onClick)
        Spacer(Modifier.width(6.dp))
        Column(Modifier.weight(1f)) {
            Text(
                cardLabel(card.brand, card.last4),
                style = MaterialTheme.typography.titleSmall,
                color = if (selected) scheme.onPrimaryContainer else scheme.onSurface,
            )
            Text(
                listOfNotNull(card.nickname, "exp ${cardExpiry(card.expMonth, card.expYear)}")
                    .joinToString(" · "),
                style = MaterialTheme.typography.bodySmall,
                color = if (selected) scheme.onPrimaryContainer else scheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

@Composable
private fun PresetTile(
    label: String,
    amount: String,
    selected: Boolean,
    modifier: Modifier = Modifier,
    onClick: () -> Unit,
) {
    val scheme = MaterialTheme.colorScheme
    Column(
        modifier
            .heightIn(min = 48.dp)
            .border(
                1.5.dp,
                if (selected) scheme.primary else scheme.outlineVariant,
                RoundedCornerShape(StoryTailRadius.md),
            )
            .background(
                if (selected) scheme.primaryContainer else scheme.surface,
                RoundedCornerShape(StoryTailRadius.md),
            )
            .clickable(onClick = onClick)
            .padding(12.dp),
    ) {
        Text(
            label,
            style = MaterialTheme.typography.labelMedium,
            color = if (selected) scheme.onPrimaryContainer else scheme.onSurfaceVariant,
        )
        Text(
            amount,
            style = MaterialTheme.typography.titleSmall,
            color = if (selected) scheme.onPrimaryContainer else scheme.onSurface,
        )
    }
}

/**
 * 2.4.4.
 *
 * **NO NOTIFICATION PROMISE** — departure 3. The artboard's summary carries a fifth row,
 * "Notifications · Email + push on every use". No dispatcher exists on either stack, and the
 * same clause in 2.4.3's mandate would be PERSISTED into `consent_payload`, so it is cut in
 * both places at once and returns as consent version 2.
 *
 * **IT NAMES THE SUPPLIER** — departure 10. The desktop says "Gyasi can settle the May 28
 * invoice", which reads as a Story-Tail invoice on a platform contractually prohibited from
 * client-facing billing.
 */
@Composable
fun AuthorizationConfirmedScreen(
    state: Loadable<WalletSnapshot>,
    authorizationId: String,
    justAuthorized: Boolean,
    onBack: () -> Unit,
    onOpenActivity: () -> Unit,
    onOpenTrip: (String) -> Unit,
    onRemove: (String) -> Unit,
    onRetry: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val scheme = MaterialTheme.colorScheme
    val wallet = (state as? Loadable.Ready)?.value
    val auth = wallet?.authorization(authorizationId)
    val card = auth?.let { wallet.card(it.cardId) }

    ClientScaffold(
        modifier = modifier,
        topBar = { AccountTopBar(title = WalletMessages.CONFIRMED_TITLE, onBack = onBack) },
    ) {
        if (auth == null) {
            // A FAILED READ IS NOT A SLOW ONE. This used to spin forever on both, with no
            // way out but the back arrow — `auth` is null while loading AND when the read
            // died, and the branch could not tell them apart.
            if (state is Loadable.Failed) {
                ClientErrorState(
                    title = "We could not open this authorization",
                    body = "The connection dropped on the way. Try again in a moment.",
                    retryLabel = "Try again",
                    onRetry = onRetry,
                )
            } else {
                Box(Modifier.fillMaxWidth().padding(vertical = 48.dp), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = scheme.primary)
                }
            }
            return@ClientScaffold
        }

        Column(
            Modifier.fillMaxWidth().padding(horizontal = 16.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Spacer(Modifier.height(28.dp))

            if (justAuthorized) {
                Box(
                    Modifier.size(80.dp).background(scheme.tertiaryContainer, PillShape),
                    contentAlignment = Alignment.Center,
                ) {
                    StoryTailGlyph(StoryTailMark.SHIELD, 36.dp, scheme.onTertiaryContainer)
                }
                Spacer(Modifier.height(12.dp))
            }

            Text(
                WalletMessages.CONFIRMED_OVERLINE,
                style = MaterialTheme.typography.labelSmall,
                color = scheme.primary,
            )
            Text(
                // `brandName`, never the raw token — the web build shipped "Your visa is
                // ready" to a browser before a screenshot caught it.
                if (card != null) "Your ${brandName(card.brand)} is ready" else "Your card is ready",
                style = MaterialTheme.typography.headlineSmall,
                color = scheme.onSurface,
                textAlign = TextAlign.Center,
            )
            Spacer(Modifier.height(4.dp))
            Text(
                "Gyasi can now pay suppliers for this trip from this card, up to the limit you set.",
                style = MaterialTheme.typography.bodyMedium,
                color = scheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
            )

            Spacer(Modifier.height(18.dp))

            val rows = listOfNotNull(
                auth.tripTitle?.let { WalletMessages.CONFIRMED_TRIP to it },
                card?.let { WalletMessages.CONFIRMED_CARD to cardLabel(it.brand, it.last4) },
                WalletMessages.CONFIRMED_LIMIT to formatMoney(auth.spendingLimitCents, "USD"),
                WalletMessages.CONFIRMED_EXPIRES to formatDay(auth.expiresAt),
            )

            Column(
                Modifier
                    .fillMaxWidth()
                    .background(scheme.surfaceContainer, RoundedCornerShape(StoryTailRadius.lg))
                    .padding(14.dp),
            ) {
                Text(
                    WalletMessages.CONFIRMED_SUMMARY,
                    style = MaterialTheme.typography.labelSmall,
                    color = scheme.onSurfaceVariant,
                )
                for ((label, value) in rows) {
                    HorizontalDivider(color = scheme.outlineVariant)
                    Row(Modifier.fillMaxWidth().padding(vertical = 7.dp)) {
                        Text(label, style = MaterialTheme.typography.bodySmall, color = scheme.onSurfaceVariant)
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

            Spacer(Modifier.height(16.dp))

            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                PillButton(WalletMessages.ACTIVITY_TITLE, filled = false, modifier = Modifier.weight(1f)) {
                    onOpenActivity()
                }
                PillButton(WalletMessages.CONFIRMED_BACK_TO_TRIP, filled = true, modifier = Modifier.weight(1f)) {
                    onOpenTrip(auth.tripId)
                }
            }

            if (auth.isActive) {
                Spacer(Modifier.height(10.dp))
                Text(
                    WalletMessages.REMOVE_AUTHORIZATION,
                    style = MaterialTheme.typography.labelLarge,
                    color = scheme.onSurfaceVariant,
                    modifier = Modifier
                        .heightIn(min = 48.dp)
                        .clickable { onRemove(auth.id) }
                        .padding(12.dp),
                )
            }

            Spacer(Modifier.height(24.dp))
        }
    }
}

/**
 * 2.4.7.
 *
 * **IT REMOVES AN AUTHORIZATION, NOT A CARD** — departure 7, and the whole shape of the
 * screen rather than a caveat on it. Setting `payment_card.status` locally would leave the
 * PaymentMethod live in Stripe's vault while this screen says the card is gone; Data-Model
 * §18.5 expects the Stripe Customer deleted on erasure, and the local half alone is a broken
 * promise about a stored card. So the heading names the TRIP, and the screen says plainly
 * that the card stays on file.
 *
 * A FULL-SCREEN ROUTE, not a sheet — the same call §2.5.10 made. A grabber means "swipe this
 * away", which is the wrong affordance on a destructive confirmation.
 *
 * **NO "WE'LL NOTIFY" PANEL** — departures 8 and 9. Nothing sends that alert, and the
 * artboard's version of it also misgenders Gyasi.
 */
@Composable
fun RemoveAuthorizationScreen(
    state: Loadable<WalletSnapshot>,
    authorizationId: String,
    sending: Boolean,
    error: String?,
    onBack: () -> Unit,
    onConfirm: () -> Unit,
    onRetry: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val scheme = MaterialTheme.colorScheme
    val wallet = (state as? Loadable.Ready)?.value
    val auth = wallet?.authorization(authorizationId)
    val card = auth?.let { wallet.card(it.cardId) }

    ClientScaffold(
        modifier = modifier,
        topBar = { AccountTopBar(title = WalletMessages.REMOVE_TITLE, onBack = onBack) },
        footer = {
            Row(
                Modifier
                    .fillMaxWidth()
                    .background(scheme.surfaceContainerLow)
                    .navigationBarsPadding()
                    .padding(horizontal = 16.dp, vertical = 10.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                PillButton(WalletMessages.REMOVE_CANCEL, filled = false, onClick = onBack)
                Box(
                    Modifier
                        .weight(1f)
                        .heightIn(min = 48.dp)
                        .background(scheme.errorContainer, PillShape)
                        .clickable(enabled = !sending, onClick = onConfirm),
                    contentAlignment = Alignment.Center,
                ) {
                    if (sending) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(18.dp),
                            strokeWidth = 2.dp,
                            color = scheme.onErrorContainer,
                        )
                    } else {
                        Text(
                            WalletMessages.REMOVE_CTA,
                            style = MaterialTheme.typography.labelLarge,
                            color = scheme.onErrorContainer,
                        )
                    }
                }
            }
        },
    ) {
        if (auth == null) {
            // A FAILED READ IS NOT A SLOW ONE. This used to spin forever on both, with no
            // way out but the back arrow — `auth` is null while loading AND when the read
            // died, and the branch could not tell them apart.
            if (state is Loadable.Failed) {
                ClientErrorState(
                    title = "We could not open this authorization",
                    body = "The connection dropped on the way. Try again in a moment.",
                    retryLabel = "Try again",
                    onRetry = onRetry,
                )
            } else {
                Box(Modifier.fillMaxWidth().padding(vertical = 48.dp), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = scheme.primary)
                }
            }
            return@ClientScaffold
        }

        Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp)) {
            Spacer(Modifier.height(18.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(
                    Modifier.size(44.dp).background(scheme.errorContainer, PillShape),
                    contentAlignment = Alignment.Center,
                ) {
                    StoryTailGlyph(StoryTailMark.WARNING, 20.dp, scheme.onErrorContainer)
                }
                Spacer(Modifier.width(12.dp))
                Column {
                    Text(
                        WalletMessages.REMOVE_OVERLINE,
                        style = MaterialTheme.typography.labelSmall,
                        color = scheme.error,
                    )
                    Text(
                        "Stop using this card for ${auth.tripTitle ?: "this trip"}?",
                        style = MaterialTheme.typography.titleLarge,
                        color = scheme.onSurface,
                    )
                }
            }

            Spacer(Modifier.height(14.dp))
            Text(
                "${WalletMessages.REMOVE_BODY_LEAD} ${WalletMessages.REMOVE_BODY_PAST}",
                style = MaterialTheme.typography.bodyMedium,
                color = scheme.onSurfaceVariant,
            )

            Spacer(Modifier.height(14.dp))
            Column(
                Modifier
                    .fillMaxWidth()
                    .background(scheme.surfaceContainer, RoundedCornerShape(StoryTailRadius.md))
                    .padding(12.dp),
            ) {
                Text(
                    WalletMessages.REMOVE_THIS_AUTHORIZATION,
                    style = MaterialTheme.typography.labelSmall,
                    color = scheme.onSurfaceVariant,
                )
                Spacer(Modifier.height(4.dp))
                Text(
                    auth.tripTitle ?: "—",
                    style = MaterialTheme.typography.titleSmall,
                    color = scheme.onSurface,
                )
                Text(
                    listOfNotNull(
                        card?.let { cardLabel(it.brand, it.last4) },
                        remainingLabel(auth.remainingCents, auth.spendingLimitCents),
                        "${WalletMessages.EXPIRES_LABEL.lowercase()} ${formatDay(auth.expiresAt)}",
                    ).joinToString(" · "),
                    style = MaterialTheme.typography.bodySmall,
                    color = scheme.onSurfaceVariant,
                )
            }

            // Said plainly rather than left for somebody to discover after tapping.
            Spacer(Modifier.height(14.dp))
            Text(
                WalletMessages.REMOVE_CARD_STAYS,
                style = MaterialTheme.typography.bodySmall,
                color = scheme.onSurfaceVariant,
            )

            if (error != null) {
                Spacer(Modifier.height(8.dp))
                Text(error, style = MaterialTheme.typography.bodySmall, color = scheme.error)
            }

            Spacer(Modifier.height(24.dp))
        }
    }
}

@Composable
private fun PillButton(
    label: String,
    filled: Boolean,
    modifier: Modifier = Modifier,
    onClick: () -> Unit,
) {
    val scheme = MaterialTheme.colorScheme
    Box(
        modifier
            .heightIn(min = 48.dp)
            .then(
                if (filled) {
                    Modifier.background(scheme.primary, PillShape)
                } else {
                    Modifier.border(1.dp, scheme.outline, PillShape)
                },
            )
            .clickable(onClick = onClick)
            .padding(horizontal = 18.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            label,
            style = MaterialTheme.typography.labelLarge,
            color = if (filled) scheme.onPrimary else scheme.onSurface,
        )
    }
}
