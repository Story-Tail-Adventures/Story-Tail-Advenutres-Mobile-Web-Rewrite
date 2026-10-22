package com.storytail.adventures.android.push

import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import com.storytail.adventures.api.SupabaseClientProvider
import com.storytail.adventures.domain.agent.AgentPushData
import com.storytail.adventures.domain.uuidV7
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeoutOrNull

/**
 * Where FCM delivers (§3.10.7). `push-dispatch` sends DATA messages at high priority, so this
 * runs in the background too and draws the notification itself (see [AgentNotifier]).
 *
 * `onMessageReceived` already runs off the main thread and may take a few seconds; blocking it
 * for the one read the notification needs is the documented way to do this work. The read is
 * bounded well inside Android's limit, and one that runs out still ends in a notification.
 */
class StoryTailMessagingService : FirebaseMessagingService() {

    override fun onMessageReceived(message: RemoteMessage) {
        val data = AgentPushData.parse(message.data) ?: return
        // AgentNotifier bounds its own read, so this always ends in a notification.
        runBlocking { AgentNotifier(applicationContext).handle(data) }
    }

    /**
     * Firebase rotated this phone's address. If notifications are on, tell `push-device` the new
     * one; the old row is pruned the first time a send to it comes back gone.
     */
    override fun onNewToken(token: String) {
        val prefs = PushPrefs(applicationContext)
        if (!prefs.enabled) return
        runBlocking {
            withTimeoutOrNull(TIMEOUT_MS) {
                val push = SupabaseClientProvider.agentPushRepository()
                if (push.signedIn() && push.register(uuidV7(), token, deviceLabel())) prefs.token = token
            }
        }
    }

    companion object {
        private const val TIMEOUT_MS = 8_000L

        /** "Pixel 9 Pro XL", for §3.12.3's device list later. */
        fun deviceLabel(): String? = android.os.Build.MODEL?.takeIf { it.isNotBlank() }
    }
}
