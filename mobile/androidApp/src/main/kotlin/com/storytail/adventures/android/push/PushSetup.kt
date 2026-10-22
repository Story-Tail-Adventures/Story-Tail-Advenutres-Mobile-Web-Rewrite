package com.storytail.adventures.android.push

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.os.Build
import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseOptions
import com.storytail.adventures.R
import com.storytail.adventures.domain.agent.AgentMessagesCopy

/**
 * Firebase, configured by hand from the four values local.properties put into resources
 * (androidApp/build.gradle.kts). No google-services.json, no Gradle plugin: a build without the
 * values has notifications off and nothing else changes.
 *
 * Called from [com.storytail.adventures.android.StoryTailApplication.onCreate], so it has run
 * before a push wakes the messaging service in a fresh process.
 */
object PushSetup {
    const val CHANNEL_MESSAGES = "client_messages"
    /** §3.12.3. Its own channel, so the phone's settings can quiet one kind without the other. */
    const val CHANNEL_TRIP_REQUESTS = "trip_requests"

    @Volatile
    var configured: Boolean = false
        private set

    fun init(context: Context) {
        createChannel(context)
        val options = optionsFrom(context) ?: return
        if (FirebaseApp.getApps(context).isEmpty()) FirebaseApp.initializeApp(context, options)
        configured = true
    }

    private fun optionsFrom(context: Context): FirebaseOptions? {
        val projectId = context.getString(R.string.firebase_project_id)
        val appId = context.getString(R.string.firebase_app_id)
        val apiKey = context.getString(R.string.firebase_api_key)
        val senderId = context.getString(R.string.firebase_sender_id)
        if (listOf(projectId, appId, apiKey, senderId).any { it.isBlank() }) return null
        return FirebaseOptions.Builder()
            .setProjectId(projectId)
            .setApplicationId(appId)
            .setApiKey(apiKey)
            .setGcmSenderId(senderId)
            .build()
    }

    private fun createChannel(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val trips = NotificationChannel(
            CHANNEL_TRIP_REQUESTS,
            AgentMessagesCopy.NOTIFY_TRIP_CHANNEL,
            NotificationManager.IMPORTANCE_HIGH,
        ).apply {
            description = AgentMessagesCopy.NOTIFY_TRIP_CHANNEL_DESCRIPTION
            lockscreenVisibility = android.app.Notification.VISIBILITY_PRIVATE
        }
        context.getSystemService(NotificationManager::class.java).createNotificationChannel(trips)
        val channel = NotificationChannel(
            CHANNEL_MESSAGES,
            AgentMessagesCopy.NOTIFY_CHANNEL,
            NotificationManager.IMPORTANCE_HIGH,
        ).apply {
            description = AgentMessagesCopy.NOTIFY_CHANNEL_DESCRIPTION
            // Ruling 2 by default; the notification's own public version says the name only.
            lockscreenVisibility = android.app.Notification.VISIBILITY_PRIVATE
        }
        context.getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }
}
