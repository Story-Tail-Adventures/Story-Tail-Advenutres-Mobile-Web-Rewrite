package com.storytail.adventures.android

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.tooling.preview.Preview
import com.storytail.adventures.App
import com.storytail.adventures.android.push.AgentNotifier
import com.storytail.adventures.android.push.AndroidAgentPush
import com.storytail.adventures.android.push.PushPrefs
import com.storytail.adventures.push.AgentPushTarget
import com.storytail.adventures.push.LocalAgentPush
import com.storytail.adventures.ui.components.LocalAvatarPicker

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        // Before setContent: its permission launcher must be registered before the activity starts.
        val push = AndroidAgentPush(this)
        val avatarPicker = AndroidAvatarPicker(this)
        if (savedInstanceState == null) openTargetFrom(intent)

        setContent {
            CompositionLocalProvider(LocalAgentPush provides push, LocalAvatarPicker provides avatarPicker) {
                App()
            }
        }
    }

    // A notification tapped while the app is already open (singleTop).
    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        openTargetFrom(intent)
    }

    /**
     * A tapped notification names its thread (§3.10.7) or its trip request (§3.12.3); App()
     * opens it once signed in.
     */
    private fun openTargetFrom(intent: Intent?) {
        val target = intent?.getStringExtra(AgentNotifier.EXTRA_THREAD)?.let(AgentPushTarget::Thread)
            ?: intent?.getStringExtra(AgentNotifier.EXTRA_TRIP)?.let(AgentPushTarget::Trip)
        if (target != null) PushPrefs.openTarget.value = target
    }
}

@Preview
@Composable
fun AppAndroidPreview() {
    App()
}
