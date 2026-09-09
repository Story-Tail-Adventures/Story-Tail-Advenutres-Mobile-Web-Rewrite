package com.storytail.adventures.ui.nav

import androidx.compose.runtime.Composable

/**
 * Deliberately empty.
 *
 * iOS has no system back the OS hands to an app the way Android's does — the swipe-from-
 * edge gesture belongs to UINavigationController, which Compose Multiplatform is not using
 * here. Going back on iOS is the screen's own affordance, so there is nothing to intercept.
 */
@Composable
actual fun PlatformBackHandler(enabled: Boolean, onBack: () -> Unit) {
    // No-op. See the KDoc.
}
