package com.storytail.adventures.ui.nav

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext

@Composable
actual fun rememberPlatformLinks(): PlatformLinks {
    val context = LocalContext.current
    return remember(context) { AndroidPlatformLinks(context) }
}

private class AndroidPlatformLinks(private val context: Context) : PlatformLinks {

    override fun openMap(query: String) {
        // `geo:0,0?q=` is the documented way to hand a free-text place to whatever map app
        // is installed, rather than hard-coding one vendor's package.
        val uri = Uri.parse("geo:0,0?q=${Uri.encode(query)}")
        start(Intent(Intent.ACTION_VIEW, uri))
    }

    override fun dial(phone: String) {
        // ACTION_DIAL, never ACTION_CALL: DIAL opens the dialler with the number filled in
        // and needs no permission, while CALL places the call and would need CALL_PHONE.
        // Nobody should tap a phone number on an itinerary and have a call already ringing.
        start(Intent(Intent.ACTION_DIAL, Uri.parse("tel:${Uri.encode(phone)}")))
    }

    override fun openUrl(url: String) {
        // `Uri.parse`, NOT Uri.encode: the signed URL is already encoded and re-encoding it
        // would break the signature in its query string. See the interface note.
        start(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
    }

    private fun start(intent: Intent) {
        try {
            context.startActivity(intent)
        } catch (_: ActivityNotFoundException) {
            // No app handles it. Nothing useful to say that the traveler cannot see.
        }
    }
}
