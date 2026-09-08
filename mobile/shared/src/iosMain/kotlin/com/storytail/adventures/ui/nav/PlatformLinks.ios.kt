package com.storytail.adventures.ui.nav

import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import platform.Foundation.NSURL
import platform.UIKit.UIApplication

@Composable
actual fun rememberPlatformLinks(): PlatformLinks = remember { IosPlatformLinks() }

private class IosPlatformLinks : PlatformLinks {

    override fun openMap(query: String) {
        // `maps://` goes to Apple Maps, which every iOS device has — no Info.plist
        // LSApplicationQueriesSchemes entry needed, unlike querying for a third-party app.
        open("maps://?q=${query.encodeForUrl()}")
    }

    override fun dial(phone: String) {
        // `tel:` on iOS shows a confirmation sheet before dialling, so this cannot place a
        // call without the traveler agreeing to it.
        open("tel:${phone.encodeForUrl()}")
    }

    override fun openUrl(url: String) {
        // Straight to `open`, skipping `encodeForUrl`: the signed URL is already encoded and
        // running it through again would corrupt the signature. See the interface note.
        open(url)
    }

    private fun open(url: String) {
        val nsUrl = NSURL.URLWithString(url) ?: return
        UIApplication.sharedApplication.openURL(nsUrl)
    }
}

/**
 * Minimal percent-encoding.
 *
 * `NSString.stringByAddingPercentEncodingWithAllowedCharacters` is the idiomatic call but
 * needs a character set built through several interop hops; the inputs here are addresses
 * and phone numbers, so escaping the handful of characters that actually break a URL is
 * enough and is far easier to read.
 */
private fun String.encodeForUrl(): String = buildString {
    for (ch in this@encodeForUrl) {
        when {
            ch.isLetterOrDigit() || ch in "-_.~" -> append(ch)
            ch == ' ' -> append("%20")
            else -> append('%').append(ch.code.toString(16).uppercase().padStart(2, '0'))
        }
    }
}
