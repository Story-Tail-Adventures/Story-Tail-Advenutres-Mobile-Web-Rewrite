package com.storytail.adventures.ui.screens.agent

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.storytail.adventures.domain.agent.AgentMessagesCopy
import com.storytail.adventures.push.AgentPushOffer
import com.storytail.adventures.push.AgentPushResult
import com.storytail.adventures.push.LocalAgentPush
import com.storytail.adventures.ui.components.StoryTailGlyph
import com.storytail.adventures.ui.components.StoryTailMark
import kotlinx.coroutines.launch

private enum class NotifyView { HIDDEN, OFFER, WORKING, BLOCKED, FAILED, ON }

/**
 * Screen 3.10.7's opt-in on the phone (M3108, ruling 7): "Get notified when clients write", at
 * the top of the inbox until it is answered. The system prompt appears only on "Turn on".
 *
 * Stateful on purpose, like the web's card: whether to offer depends on this phone (the
 * permission, a token already registered, "Not now"), which only [LocalAgentPush] knows. With
 * no platform behind it (iOS, previews, tests) it draws nothing.
 */
@Composable
fun AgentNotifyCard(modifier: Modifier = Modifier) {
    val push = LocalAgentPush.current
    val scope = rememberCoroutineScope()
    var view by remember { mutableStateOf(NotifyView.HIDDEN) }

    LaunchedEffect(push) {
        if (push.offer() == AgentPushOffer.OFFER) view = NotifyView.OFFER
    }

    when (view) {
        NotifyView.HIDDEN -> return
        NotifyView.ON -> {
            Text(
                AgentMessagesCopy.NOTIFY_ON,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = modifier.padding(bottom = 10.dp).semantics { liveRegion = LiveRegionMode.Polite },
            )
            return
        }
        else -> Unit
    }

    Surface(
        color = MaterialTheme.colorScheme.secondaryContainer,
        contentColor = MaterialTheme.colorScheme.onSecondaryContainer,
        shape = MaterialTheme.shapes.medium,
        modifier = modifier.fillMaxWidth().padding(bottom = 12.dp),
    ) {
        Row(Modifier.padding(14.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            StoryTailGlyph(StoryTailMark.BELL, size = 18.dp, color = MaterialTheme.colorScheme.onSecondaryContainer)
            Column(Modifier.weight(1f)) {
                Text(
                    AgentMessagesCopy.NOTIFY_TITLE,
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.semantics { heading() },
                )
                Text(
                    AgentMessagesCopy.NOTIFY_BODY,
                    style = MaterialTheme.typography.bodySmall,
                    modifier = Modifier.padding(top = 3.dp),
                )
                val problem = when (view) {
                    NotifyView.BLOCKED -> AgentMessagesCopy.NOTIFY_BLOCKED_PHONE
                    NotifyView.FAILED -> AgentMessagesCopy.NOTIFY_FAILED
                    else -> null
                }
                if (problem != null) {
                    Text(
                        problem,
                        style = MaterialTheme.typography.bodySmall,
                        fontWeight = FontWeight.SemiBold,
                        modifier = Modifier.padding(top = 6.dp).semantics { liveRegion = LiveRegionMode.Assertive },
                    )
                }
                Row(
                    // The button's words change to "Turning on…": say so.
                    Modifier.padding(top = 10.dp).semantics { liveRegion = LiveRegionMode.Polite },
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    if (view == NotifyView.BLOCKED) {
                        // The system will not ask again; its settings are the only way left.
                        Button(onClick = { push.openSettings() }, modifier = Modifier.heightIn(min = 48.dp)) {
                            Text(AgentMessagesCopy.NOTIFY_OPEN_SETTINGS)
                        }
                    } else {
                        Button(
                            onClick = {
                                if (view == NotifyView.WORKING) return@Button
                                view = NotifyView.WORKING
                                scope.launch {
                                    view = when (push.turnOn()) {
                                        AgentPushResult.ON -> NotifyView.ON
                                        AgentPushResult.BLOCKED -> NotifyView.BLOCKED
                                        // Closing the prompt is not an error: back to the offer.
                                        AgentPushResult.DISMISSED -> NotifyView.OFFER
                                        AgentPushResult.FAILED -> NotifyView.FAILED
                                    }
                                }
                            },
                            modifier = Modifier.heightIn(min = 48.dp),
                        ) {
                            Text(if (view == NotifyView.WORKING) AgentMessagesCopy.NOTIFY_TURNING_ON else AgentMessagesCopy.NOTIFY_TURN_ON)
                        }
                    }
                    TextButton(
                        onClick = {
                            push.notNow()
                            view = NotifyView.HIDDEN
                        },
                        // Mid-request it would be overwritten by the answer; wait for it.
                        enabled = view != NotifyView.WORKING,
                        modifier = Modifier.heightIn(min = 48.dp),
                    ) {
                        Text(AgentMessagesCopy.NOTIFY_NOT_NOW)
                    }
                }
            }
        }
    }
}
