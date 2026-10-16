package com.storytail.adventures.push

import androidx.compose.runtime.staticCompositionLocalOf
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

/**
 * §3.10.7 as the shared UI sees it: the inbox card (M3108), sign-out, a tapped notification and
 * a reply that failed from one.
 *
 * Common code cannot reach Firebase or Android's permission prompt, so the platform provides
 * this through [LocalAgentPush]: androidApp's `AndroidAgentPush` on Android, [NoAgentPush]
 * everywhere else (iOS until Xcode, previews and tests), which offers nothing and does nothing.
 */
interface AgentPush {
    /** Whether the inbox card has anything to offer on this phone right now. */
    suspend fun offer(): AgentPushOffer

    /** "Turn on": the system prompt (Android 13+), a Firebase token, then `push-device`. */
    suspend fun turnOn(): AgentPushResult

    /** "Not now": per phone, like the permission itself. */
    fun notNow()

    /** Sign-out: this phone stops at once. Never throws, and gives up quickly. */
    suspend fun turnOffHere()

    /**
     * A reply that failed from a notification, waiting for its thread (ruling 4). It stays saved
     * until [clearDraft] (a successful send), so a rotation or a killed app cannot lose the words,
     * and it keeps the message id it was first sent with, so resending it after a send that
     * landed but timed out is idempotent rather than a second copy to the client.
     */
    fun draftFor(conversationId: String): PendingReply?

    fun clearDraft(conversationId: String)

    /** The phone's own notification settings, for a permission the system will no longer ask. */
    fun openSettings()

    /** A thread a tapped notification asked to open, until the app has opened it. */
    val openThread: StateFlow<String?>

    fun threadOpened()
}

data class PendingReply(val text: String, val messageId: String)

enum class AgentPushOffer { HIDDEN, OFFER }

enum class AgentPushResult { ON, BLOCKED, DISMISSED, FAILED }

object NoAgentPush : AgentPush {
    override suspend fun offer(): AgentPushOffer = AgentPushOffer.HIDDEN
    override suspend fun turnOn(): AgentPushResult = AgentPushResult.FAILED
    override fun notNow() = Unit
    override suspend fun turnOffHere() = Unit
    override fun draftFor(conversationId: String): PendingReply? = null
    override fun clearDraft(conversationId: String) = Unit
    override fun openSettings() = Unit
    override val openThread: StateFlow<String?> = MutableStateFlow(null)
    override fun threadOpened() = Unit
}

val LocalAgentPush = staticCompositionLocalOf<AgentPush> { NoAgentPush }
