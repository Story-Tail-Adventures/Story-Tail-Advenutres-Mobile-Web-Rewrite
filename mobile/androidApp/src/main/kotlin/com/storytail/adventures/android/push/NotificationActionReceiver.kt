package com.storytail.adventures.android.push

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.core.app.RemoteInput
import com.storytail.adventures.api.AgentSendOutcome
import com.storytail.adventures.api.AgentSendRequest
import com.storytail.adventures.api.AgentThreadRead
import com.storytail.adventures.api.SupabaseClientProvider
import com.storytail.adventures.domain.agent.notificationTitle
import com.storytail.adventures.domain.uuidV7
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull

/**
 * The phone notification's two buttons (§3.10.7, ruling 3): Reply and Mark read.
 *
 * A reply from a notification is ALWAYS a reply, never an internal note. It goes through the same
 * `agent-message` send as the thread's reply box, with a fresh v7 id and the `seenUpTo` of the
 * message the notification showed, so a newer client message stays unread. If it fails, the words
 * wait as that thread's draft and the notification says "Didn't send. Tap to try again" (ruling
 * 4); tapping opens the thread with them in the box.
 */
class NotificationActionReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        val conversationId = intent.getStringExtra(AgentNotifier.EXTRA_THREAD) ?: return
        val seenUpTo = intent.getStringExtra(AgentNotifier.EXTRA_SEEN_UP_TO) ?: return
        val app = context.applicationContext
        // One id for this reply, minted before anything can time out: if the send lands but its
        // answer is lost, the draft keeps this id and a resend is the same message, not a second.
        val messageId = uuidV7()
        val pending = goAsync()
        scope.launch {
            try {
                withTimeoutOrNull(TIMEOUT_MS) {
                    when (intent.action) {
                        AgentNotifier.ACTION_MARK_READ -> markRead(app, conversationId, seenUpTo)
                        AgentNotifier.ACTION_REPLY -> {
                            val text = RemoteInput.getResultsFromIntent(intent)
                                ?.getCharSequence(AgentNotifier.KEY_REPLY)?.toString()?.trim()
                            if (!text.isNullOrEmpty()) reply(app, conversationId, seenUpTo, text, messageId)
                        }
                    }
                } ?: run {
                    android.util.Log.w("StoryTailPush", "notification action ${intent.action} timed out")
                    // Ran out of time: a reply's words must not vanish with it.
                    if (intent.action == AgentNotifier.ACTION_REPLY) {
                        RemoteInput.getResultsFromIntent(intent)?.getCharSequence(AgentNotifier.KEY_REPLY)
                            ?.toString()?.trim()?.takeIf { it.isNotEmpty() }
                            ?.let { failed(app, conversationId, it, messageId, null) }
                    }
                }
            } finally {
                pending.finish()
            }
        }
    }

    // Cleared after the call, not before: tapped and gone should mean read.
    private suspend fun markRead(context: Context, conversationId: String, seenUpTo: String) {
        if (SupabaseClientProvider.agentPushRepository().signedIn()) {
            SupabaseClientProvider.agentMessagesRepository().markRead(conversationId, seenUpTo)
        }
        AgentNotifier(context).cancel(conversationId)
    }

    private suspend fun reply(context: Context, conversationId: String, seenUpTo: String, text: String, messageId: String) {
        val signedIn = SupabaseClientProvider.agentPushRepository().signedIn()
        val title = if (signedIn) threadTitle(conversationId) else null
        val outcome = if (signedIn) {
            SupabaseClientProvider.agentMessagesRepository().send(
                AgentSendRequest(
                    messageId = messageId,
                    body = text,
                    internalNote = false,
                    conversationId = conversationId,
                    seenUpTo = seenUpTo,
                ),
            )
        } else {
            AgentSendOutcome.Failed(null)
        }
        when (outcome) {
            // Sent: the reply lowered the unread count, so this notification has done its job. An
            // update rather than a cancel (see AgentNotifier.showReplySent).
            is AgentSendOutcome.Sent -> AgentNotifier(context).showReplySent(conversationId, title)
            is AgentSendOutcome.Failed -> {
                android.util.Log.w("StoryTailPush", "reply from a notification failed (signed in: $signedIn, detail: ${outcome.detail != null})")
                failed(context, conversationId, text, messageId, title)
            }
        }
    }

    private suspend fun threadTitle(conversationId: String): String? =
        (SupabaseClientProvider.agentMessagesRepository().thread(conversationId) as? AgentThreadRead.Ok)
            ?.header?.let { notificationTitle(it.clientName, it.tripTitle) }

    private fun failed(context: Context, conversationId: String, text: String, messageId: String, title: String?) {
        PushPrefs(context).saveDraft(conversationId, text, messageId)
        AgentNotifier(context).showReplyFailed(conversationId, title)
    }

    companion object {
        private const val TIMEOUT_MS = 8_000L
        private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    }
}
