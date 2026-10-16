package com.storytail.adventures.android.push

import android.Manifest
import android.content.Intent
import android.provider.Settings
import android.content.pm.PackageManager
import android.os.Build
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.google.firebase.messaging.FirebaseMessaging
import com.storytail.adventures.api.SupabaseClientProvider
import com.storytail.adventures.domain.uuidV7
import com.storytail.adventures.push.AgentPush
import com.storytail.adventures.push.AgentPushOffer
import com.storytail.adventures.push.AgentPushResult
import com.storytail.adventures.push.PendingReply
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withTimeoutOrNull
import kotlin.coroutines.resume

/**
 * §3.10.7 on Android, behind the shared [AgentPush]: the inbox card's "Turn on", sign-out, a
 * tapped notification, and a reply that failed from one.
 *
 * Built in MainActivity.onCreate, because the permission launcher must be registered before the
 * activity starts.
 */
class AndroidAgentPush(private val activity: ComponentActivity) : AgentPush {
    private val prefs = PushPrefs(activity)
    private var permission: CompletableDeferred<Boolean>? = null
    private val launcher = activity.registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        permission?.complete(granted)
    }

    override suspend fun offer(): AgentPushOffer {
        if (!PushSetup.configured || prefs.notNow) return AgentPushOffer.HIDDEN
        if (prefs.enabled && NotificationManagerCompat.from(activity).areNotificationsEnabled()) {
            // On already: say so again quietly, at most once a day, which also follows whoever
            // is signed in now. A rotated token is handled sooner, by onNewToken.
            if (System.currentTimeMillis() - prefs.lastRefreshAt > REFRESH_EVERY_MS) refresh()
            return AgentPushOffer.HIDDEN
        }
        return AgentPushOffer.OFFER
    }

    override suspend fun turnOn(): AgentPushResult {
        if (!PushSetup.configured) return AgentPushResult.FAILED
        when (askPermission()) {
            Permission.GRANTED -> Unit
            Permission.DISMISSED -> return AgentPushResult.DISMISSED
            Permission.BLOCKED -> return AgentPushResult.BLOCKED
        }
        // Off until now (the manifest says so): no token exists before the advisor asks.
        FirebaseMessaging.getInstance().isAutoInitEnabled = true
        val token = fcmToken() ?: return AgentPushResult.FAILED
        val ok = SupabaseClientProvider.agentPushRepository().register(uuidV7(), token, StoryTailMessagingService.deviceLabel())
        if (!ok) return AgentPushResult.FAILED
        prefs.token = token
        prefs.enabled = true
        prefs.lastRefreshAt = System.currentTimeMillis()
        return AgentPushResult.ON
    }

    override fun notNow() {
        prefs.notNow = true
    }

    override suspend fun turnOffHere() {
        val token = prefs.token
        prefs.enabled = false
        prefs.token = null
        prefs.clearAllDrafts()
        PushPrefs.openThread.value = null
        AgentNotifier(activity).cancelAll()
        // The server first, while the session that registered it still exists; bounded so it
        // can never hold sign-out up. Then the token itself goes, so nothing can reach this phone
        // even if that call did not land: the next send to it comes back gone and is pruned.
        withTimeoutOrNull(2_000) { if (token != null) SupabaseClientProvider.agentPushRepository().unregister(token) }
        if (PushSetup.configured) {
            FirebaseMessaging.getInstance().isAutoInitEnabled = false
            FirebaseMessaging.getInstance().deleteToken()
        }
    }

    override fun draftFor(conversationId: String): PendingReply? = prefs.draftFor(conversationId)

    override fun clearDraft(conversationId: String) = prefs.clearDraft(conversationId)

    override fun openSettings() {
        val intent = Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
            .putExtra(Settings.EXTRA_APP_PACKAGE, activity.packageName)
        runCatching { activity.startActivity(intent) }
    }

    override val openThread: StateFlow<String?> = PushPrefs.openThread

    override fun threadOpened() {
        PushPrefs.openThread.value = null
    }

    private suspend fun refresh() {
        val token = fcmToken() ?: return
        if (SupabaseClientProvider.agentPushRepository().register(uuidV7(), token, StoryTailMessagingService.deviceLabel())) {
            prefs.token = token
            prefs.lastRefreshAt = System.currentTimeMillis()
        }
    }

    private enum class Permission { GRANTED, DISMISSED, BLOCKED }

    private suspend fun askPermission(): Permission {
        val manager = NotificationManagerCompat.from(activity)
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            // No runtime prompt before Android 13: only the app's settings can turn them off.
            return if (manager.areNotificationsEnabled()) Permission.GRANTED else Permission.BLOCKED
        }
        val granted = ContextCompat.checkSelfPermission(activity, Manifest.permission.POST_NOTIFICATIONS) ==
            PackageManager.PERMISSION_GRANTED
        if (granted) return if (manager.areNotificationsEnabled()) Permission.GRANTED else Permission.BLOCKED

        val answer = CompletableDeferred<Boolean>().also { permission = it }
        launcher.launch(Manifest.permission.POST_NOTIFICATIONS)
        if (answer.await()) return Permission.GRANTED
        // Android shows the prompt at most twice. After the second refusal it answers "no"
        // without asking, and only the settings screen can change it: that is BLOCKED. Before
        // then, a refusal (or closing the prompt) leaves the card offering.
        prefs.denials = prefs.denials + 1
        val canAskAgain = activity.shouldShowRequestPermissionRationale(Manifest.permission.POST_NOTIFICATIONS)
        return if (!canAskAgain && prefs.denials >= 2) Permission.BLOCKED else Permission.DISMISSED
    }

    private suspend fun fcmToken(): String? = withTimeoutOrNull(10_000) {
        suspendCancellableCoroutine { cont ->
            FirebaseMessaging.getInstance().token.addOnCompleteListener { task ->
                cont.resume(if (task.isSuccessful) task.result else null)
            }
        }
    }

    private companion object {
        const val REFRESH_EVERY_MS = 24L * 60 * 60 * 1000
    }
}
