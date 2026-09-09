package com.storytail.adventures.ui.nav

import androidx.compose.runtime.Composable

/**
 * The platform's own "go back" gesture, where it has one.
 *
 * Android has a system back button and a predictive-back gesture that the app is expected
 * to honour; iOS does not have an equivalent the OS routes to us, and its screens carry
 * their own back affordance instead. So this is a real handler on one platform and nothing
 * at all on the other, which is exactly what expect/actual is for.
 *
 * [enabled] should be false when there is nothing to go back to, so Android falls through
 * to its default — leaving the app — rather than swallowing the gesture.
 */
@Composable
expect fun PlatformBackHandler(enabled: Boolean, onBack: () -> Unit)
