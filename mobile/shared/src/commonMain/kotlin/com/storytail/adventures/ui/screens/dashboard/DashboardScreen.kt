package com.storytail.adventures.ui.screens.dashboard

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeContentPadding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.storytail.adventures.ui.components.BrandWordmark

/**
 * Placeholder for Screen 2.2.1 Client Dashboard / Home.
 *
 * Exists so 2.1.1 has somewhere to land. The upcoming-trip hero, agent card and
 * quick actions arrive with the real screen.
 */
@Composable
fun DashboardScreen(onSignOut: () -> Unit, modifier: Modifier = Modifier) {
    Surface(modifier = modifier, color = MaterialTheme.colorScheme.background) {
        Column(
            modifier = Modifier.fillMaxSize().safeContentPadding().padding(24.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            BrandWordmark(size = 32.dp)
            Text("You're signed in.", style = MaterialTheme.typography.headlineMedium)
            Text(
                "Your dashboard is still coming together — your trips will live right here soon.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            TextButton(onClick = onSignOut) { Text("Sign out") }
        }
    }
}
