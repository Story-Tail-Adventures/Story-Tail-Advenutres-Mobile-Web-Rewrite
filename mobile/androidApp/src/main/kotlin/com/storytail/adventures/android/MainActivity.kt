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
import com.storytail.adventures.push.LocalAgentPush

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        // Before setContent: its permission launcher must be registered before the activity starts.
        val push = AndroidAgentPush(this)
        if (savedInstanceState == null) openThreadFrom(intent)

        setContent {
            CompositionLocalProvider(LocalAgentPush provides push) {
                App()
            }
        }
    }

    // A notification tapped while the app is already open (singleTop).
    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        openThreadFrom(intent)
    }

    /** §3.10.7: a tapped notification names its thread; App() opens it once signed in. */
    private fun openThreadFrom(intent: Intent?) {
        intent?.getStringExtra(AgentNotifier.EXTRA_THREAD)?.let { PushPrefs.openThread.value = it }
    }
}

@Preview
@Composable
fun AppAndroidPreview() {
    App()
}
