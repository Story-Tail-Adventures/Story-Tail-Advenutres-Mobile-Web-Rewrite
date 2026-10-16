package com.storytail.adventures.android.push

import android.content.Context
import android.content.SharedPreferences
import androidx.core.content.edit
import com.storytail.adventures.push.PendingReply
import kotlinx.coroutines.flow.MutableStateFlow

/**
 * What this phone remembers about its notifications. Nothing here is a secret: the FCM token is
 * only an address, and a failed reply is the advisor's own words waiting for its thread.
 */
class PushPrefs(context: Context) {
    private val prefs: SharedPreferences =
        context.applicationContext.getSharedPreferences("storytail.push", Context.MODE_PRIVATE)

    /** Turned on, and registered with `push-device`. */
    var enabled: Boolean
        get() = prefs.getBoolean("enabled", false)
        set(v) = prefs.edit { putBoolean("enabled", v) }

    /** The token last registered, so sign-out can name it. */
    var token: String?
        get() = prefs.getString("token", null)
        set(v) = prefs.edit { putString("token", v) }

    var notNow: Boolean
        get() = prefs.getBoolean("notNow", false)
        set(v) = prefs.edit { putBoolean("notNow", v) }

    /** Times the system prompt was refused. Android stops showing it after two. */
    var denials: Int
        get() = prefs.getInt("denials", 0)
        set(v) = prefs.edit { putInt("denials", v) }

    /** When `push-device` last heard from this phone; the inbox re-registers at most daily. */
    var lastRefreshAt: Long
        get() = prefs.getLong("lastRefreshAt", 0L)
        set(v) = prefs.edit { putLong("lastRefreshAt", v) }

    /** A failed reply's words AND the id it was sent under, kept until a send succeeds. */
    fun saveDraft(conversationId: String, text: String, messageId: String) = prefs.edit {
        putString("draft.$conversationId", text)
        putString("draftId.$conversationId", messageId)
    }

    fun draftFor(conversationId: String): PendingReply? {
        val text = prefs.getString("draft.$conversationId", null) ?: return null
        val id = prefs.getString("draftId.$conversationId", null) ?: return null
        return PendingReply(text, id)
    }

    fun clearDraft(conversationId: String) = prefs.edit {
        remove("draft.$conversationId")
        remove("draftId.$conversationId")
    }

    /** Sign-out: the next advisor on this phone inherits nobody's words. */
    fun clearAllDrafts() = prefs.edit {
        prefs.all.keys.filter { it.startsWith("draft") }.forEach(::remove)
    }

    companion object {
        /** A thread a tapped notification asked to open. One per process: the app reads it. */
        val openThread = MutableStateFlow<String?>(null)
    }
}
