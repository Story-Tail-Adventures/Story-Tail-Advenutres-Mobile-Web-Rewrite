package com.storytail.adventures.ui.screens.dashboard

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.storytail.adventures.ui.components.BrandWordmark
import com.storytail.adventures.ui.components.client.ClientScaffold

/**
 * Screen 2.2.1 Client Dashboard / Home — see docs/Screen-Inventory.md §2.2.1 and §4.4
 * (Pattern D; the mobile hero countdown is full-width and the tablet/web weather widget
 * beside it is a larger-viewport affordance) and
 * design/source-prototype/screens/client-trip-mobile.jsx (M221_Dashboard). P1.
 *
 * SHELL ONLY at this commit. The scaffold, the four-tab bar and the callback surface are
 * real and wired; the body is still the placeholder copy, and the hero countdown, the
 * action-needed card, the advisor card and the trip cards land with the screen itself.
 *
 * It is committed in this state deliberately rather than left uncompiled: the bottom bar's
 * tab semantics, the sibling-not-overlay rule and the back-stack behaviour are all things
 * that need a real screen to be exercised in, and they are what this stage is for.
 */
@Composable
fun DashboardScreen(
    onSelectTab: (String) -> Unit,
    onOpenTrip: (tripId: String) -> Unit,
    onSeeAllTrips: () -> Unit,
    onMessageAgent: (tripId: String) -> Unit,
    onSignOut: () -> Unit,
    modifier: Modifier = Modifier,
) {
    ClientScaffold(
        modifier = modifier,
        activeTab = "trips",
        onSelectTab = onSelectTab,
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 14.dp),
    ) {
        Column(
            modifier = Modifier.fillMaxWidth(),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            BrandWordmark(size = 32.dp)
            Text("You're signed in.", style = MaterialTheme.typography.headlineMedium)
            Text(
                "Your dashboard is still coming together \u2014 your trips will live right here soon.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            TextButton(onClick = onSignOut) { Text("Sign out") }
        }
    }
}
