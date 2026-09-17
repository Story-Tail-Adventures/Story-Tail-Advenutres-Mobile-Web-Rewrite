package com.storytail.adventures.ui.screens.messages

import androidx.compose.foundation.background
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
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.storytail.adventures.domain.messages.MessagesMessages
import com.storytail.adventures.ui.components.StoryTailGlyph
import com.storytail.adventures.ui.components.StoryTailMark
import com.storytail.adventures.ui.components.client.AccountTopBar
import com.storytail.adventures.ui.components.client.ClientScaffold
import com.storytail.adventures.ui.theme.PillShape
import com.storytail.adventures.ui.theme.StoryTailBrand
import com.storytail.adventures.ui.theme.StoryTailRadius

/**
 * Screen 2.6.3 New Conversation — docs/Screen-Inventory.md §2.6.3, §4.4 (Pattern **A**), and
 * design/source-prototype/screens/client-messaging-mobile.jsx (M263_NewConversation). P1.
 *
 * THIS SCREEN IS WHY THE EDGE FUNCTION CHANGED. Every other message in the app is addressed by
 * trip; this one is written before a trip exists, so `trip-message` had to learn to
 * find-or-create against `trip_id IS NULL`. Sending neither id is what asks for that, and it is
 * deliberately the only way to reach the general thread — so a traveler who writes twice lands
 * in one conversation rather than two.
 *
 * NOT THE COMPOSE BAR. 2.6.2's composer is a one-line reply that grows; this is a screen whose
 * whole purpose is one message, and the artboard draws it as a card with a tall field.
 *
 * NO SUBJECT FIELD, which the desktop frame has. `trip-message` takes no subject — it sets
 * `conversation.subject` from the trip title, and a trip-less thread has none — so the box would
 * go nowhere. The deeper reason not to wire one up: a subject line is the first step towards a
 * structured intake form, and BRD §6.5 (decided 2026-09-09) consolidated structured intake onto
 * `quote-request` precisely so there would not be a second queue. Departure 8.
 *
 * "Use a template" is absent for the same class of reason: `message_template` belongs to the
 * AGENT (§3.10). Departure 6.
 *
 * `imePadding` and `navigationBarsPadding` on the action row, both load-bearing and neither
 * optional: without the first the Send button sits behind the keyboard that appeared to let
 * somebody type, and without the second it sits under the home pill on a gesture-navigation
 * device — the §2.5 bug that reached a reviewer.
 */
@Composable
fun NewMessageScreen(
    draft: String,
    sending: Boolean,
    sendError: String?,
    onDraftChange: (String) -> Unit,
    onSend: () -> Unit,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val scheme = MaterialTheme.colorScheme
    val empty = draft.isBlank()

    ClientScaffold(
        modifier = modifier,
        topBar = {
            AccountTopBar(
                title = MessagesMessages.NEW_TITLE,
                onBack = onBack,
                backLabel = MessagesMessages.BACK_TO_MESSAGES,
            )
        },
    ) {
        Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp)) {
            // `ClientScaffold` applies no content padding of its own, so without this the
            // subtitle's first line sits against the top bar's divider.
            Spacer(Modifier.height(14.dp))

            Text(
                MessagesMessages.NEW_SUBTITLE,
                style = MaterialTheme.typography.bodyMedium,
                color = scheme.onSurfaceVariant,
            )

            Spacer(Modifier.height(14.dp))

            // The advisor card the frame opens with, minus the presence dot (departure 1 —
            // nothing backs it) and minus the "< 2h" promise (departure 2 — one reply-window
            // string, the settled one, everywhere).
            Row(
                Modifier
                    .fillMaxWidth()
                    .background(scheme.secondaryContainer, RoundedCornerShape(StoryTailRadius.md))
                    .padding(12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(
                    Modifier.size(36.dp).background(StoryTailBrand.Burgundy, PillShape),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        MessagesMessages.ADVISOR_INITIALS,
                        color = Color.White,
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Bold,
                    )
                }
                Spacer(Modifier.width(10.dp))
                Column {
                    Text(
                        MessagesMessages.ADVISOR_NAME,
                        style = MaterialTheme.typography.titleSmall,
                        color = scheme.onSecondaryContainer,
                    )
                    Text(
                        MessagesMessages.REPLY_WINDOW,
                        style = MaterialTheme.typography.bodySmall,
                        color = scheme.onSecondaryContainer,
                    )
                }
            }

            Spacer(Modifier.height(16.dp))

            Text(
                MessagesMessages.NEW_BODY_LABEL,
                style = MaterialTheme.typography.labelLarge,
                color = scheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(6.dp))

            OutlinedTextField(
                value = draft,
                onValueChange = onDraftChange,
                placeholder = {
                    Text(
                        MessagesMessages.NEW_PLACEHOLDER,
                        style = MaterialTheme.typography.bodyMedium,
                    )
                },
                minLines = 6,
                shape = RoundedCornerShape(StoryTailRadius.md),
                modifier = Modifier.fillMaxWidth(),
            )

            if (sendError != null) {
                Spacer(Modifier.height(8.dp))
                Text(
                    sendError,
                    style = MaterialTheme.typography.bodySmall,
                    color = scheme.error,
                )
            }

            Spacer(Modifier.height(14.dp))

            Row(
                Modifier.fillMaxWidth().imePadding().navigationBarsPadding(),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                // Departure 10: a thread with no trip has nothing it could attach.
                // `trip-document` hard-requires a tripId and is the only insert into
                // `document` in the repo, so `trip-message`'s filter would drop anything sent
                // from here. It turns on with the account-scoped upload endpoint recorded
                // against §2.5.4.
                //
                // The REASON is visible text beside the control rather than the control's own
                // label: a sentence-long button reads as a rendering fault, and there is no
                // tooltip on a touch screen.
                Column(Modifier.weight(1f)) {
                    Text(
                        ThreadAttachLabel,
                        style = MaterialTheme.typography.labelLarge,
                        color = scheme.onSurfaceVariant.copy(alpha = 0.55f),
                    )
                    Text(
                        MessagesMessages.ATTACH_DEFERRED,
                        style = MaterialTheme.typography.bodySmall,
                        color = scheme.onSurfaceVariant,
                    )
                }

                Spacer(Modifier.width(12.dp))

                Row(
                    Modifier
                        // §4.2's touch floor, which Material3's 40dp default is under.
                        .heightIn(min = 48.dp)
                        .background(
                            if (empty || sending) scheme.surfaceContainerHighest else scheme.primary,
                            PillShape,
                        )
                        .clickable(enabled = !empty && !sending, onClick = onSend)
                        .padding(horizontal = 18.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.Center,
                ) {
                    if (sending) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(16.dp),
                            strokeWidth = 2.dp,
                            color = scheme.onSurfaceVariant,
                        )
                        Spacer(Modifier.width(8.dp))
                        Text(
                            MessagesMessages.NEW_SENDING,
                            style = MaterialTheme.typography.labelLarge,
                            color = scheme.onSurfaceVariant,
                        )
                    } else {
                        StoryTailGlyph(
                            StoryTailMark.PLANE,
                            15.dp,
                            if (empty) scheme.onSurfaceVariant else scheme.onPrimary,
                        )
                        Spacer(Modifier.width(8.dp))
                        Text(
                            MessagesMessages.NEW_SEND,
                            style = MaterialTheme.typography.labelLarge,
                            color = if (empty) scheme.onSurfaceVariant else scheme.onPrimary,
                        )
                    }
                }
            }

            Spacer(Modifier.height(20.dp))
        }
    }
}

/**
 * Borrowed from 2.2.7's compose bar rather than given a §2.6 string of its own.
 *
 * It is `ThreadMessages.ATTACH_LABEL`, already under CI parity, and the two screens mean
 * exactly the same thing by it. A second copy would be a second place for one phrase to drift.
 */
private val ThreadAttachLabel: String
    get() = com.storytail.adventures.domain.trip.ThreadMessages.ATTACH_LABEL
