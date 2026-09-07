package com.storytail.adventures.ui.components.public

import com.storytail.adventures.shared.resources.Res
import com.storytail.adventures.shared.resources.aruba
import com.storytail.adventures.shared.resources.bahamas
import com.storytail.adventures.shared.resources.bvi
import com.storytail.adventures.shared.resources.candlelit
import com.storytail.adventures.shared.resources.cruise_ship
import com.storytail.adventures.shared.resources.family
import com.storytail.adventures.shared.resources.honeymoon
import com.storytail.adventures.shared.resources.jamaica
import com.storytail.adventures.shared.resources.overwater
import com.storytail.adventures.shared.resources.resort_night
import com.storytail.adventures.shared.resources.resort_pool
import com.storytail.adventures.shared.resources.snorkel
import com.storytail.adventures.shared.resources.stlucia
import com.storytail.adventures.shared.resources.sunset
import com.storytail.adventures.shared.resources.turks
import com.storytail.adventures.shared.resources.zipline
import org.jetbrains.compose.resources.DrawableResource

/**
 * The registry key → bundled photograph mapping.
 *
 * The keys come from web/lib/images.ts (carried into Kotlin as PublicCatalog.IMAGES) and the
 * files are the same photographs the web pages serve, downloaded at 800px and bundled so the
 * app needs no image loader and no network to draw a hero — the same reasoning as the
 * bundled typefaces.
 *
 * EVERY ONE OF THESE HAS BEEN OPENED AND LOOKED AT. The ids originally copied from the design
 * prototype had drifted badly — `jamaica` was serving the Taj Mahal, `honeymoon` a tent under
 * the Milky Way, `candlelit` the Chicago skyline — and were corrected in web/lib/images.ts on
 * 2026-09-06. Unsplash ids are not stable identifiers for a subject, so if you change one,
 * open it and make both the alt text and this mapping match what you actually see.
 *
 * `turks`/`palmTree` and `cruiseShip`/`cruiseAerial` share a file because the registry points
 * them at one id; that is faithful, not a bug. `stlucia` and `bvi` used to share one too, and
 * no longer do — a Piton and a catamaran are not the same photograph.
 *
 * A null return draws the brand gradient (see [PublicPhoto]). Nothing returns null today, and
 * PublicImagesTest fails if a regenerated catalog ever introduces a key that would.
 */
fun drawableForImageKey(imageKey: String): DrawableResource? = when (imageKey) {
    // Caribbean islands. Locations quoted where Unsplash publishes them.
    "turks", "palmTree" -> Res.drawable.turks
    "bahamas" -> Res.drawable.bahamas // "Nassau, The Bahamas"
    "stlucia" -> Res.drawable.stlucia // the Pitons — identifies itself
    "jamaica" -> Res.drawable.jamaica // cliffs over turquoise water; location not published
    "aruba" -> Res.drawable.aruba // "Arashi Beach, Noord, Aruba"
    "bvi" -> Res.drawable.bvi // a catamaran under sail; location not published

    // Resorts and pools.
    "resortPool" -> Res.drawable.resort_pool
    "overwater" -> Res.drawable.overwater
    "resortNight" -> Res.drawable.resort_night
    "family" -> Res.drawable.family

    // Cruises.
    "cruiseShip", "cruiseAerial" -> Res.drawable.cruise_ship

    // Couples.
    "honeymoon" -> Res.drawable.honeymoon
    "candlelit" -> Res.drawable.candlelit

    // Adventure and scenery.
    "snorkel" -> Res.drawable.snorkel
    "zipline" -> Res.drawable.zipline
    "sunset" -> Res.drawable.sunset

    else -> null
}
