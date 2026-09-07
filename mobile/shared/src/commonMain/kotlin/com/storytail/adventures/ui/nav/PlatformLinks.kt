package com.storytail.adventures.ui.nav

import androidx.compose.runtime.Composable

/**
 * The two hand-offs Screen 2.2.5 needs: open an address in a map, and dial a phone number.
 *
 * `commonMain` had neither, and §2.2.5's key actions are exactly "tap address to open in
 * maps; tap phone to call" — with §4.4 adding that maps are full-screen on mobile, which is
 * to say the platform's own app rather than anything embedded.
 *
 * This is a [Composable] factory rather than a plain function because both platforms need
 * something from the composition to do the work — an Android `Context`, and on iOS a
 * `UIApplication` call that must happen on the main thread. Returning the launcher lets a
 * screen capture it once and call it from a click handler.
 *
 * Failure is silent by design. A device with no maps app, or a phone number a dialler
 * refuses, should not crash a trip screen — and there is nothing useful to tell a traveler
 * about it that they cannot see for themselves.
 */
@Composable
expect fun rememberPlatformLinks(): PlatformLinks

interface PlatformLinks {
    /** Open a free-text place or address in whatever map app the device has. */
    fun openMap(query: String)

    /** Open the dialler with a number filled in — never placing the call itself. */
    fun dial(phone: String)
}
