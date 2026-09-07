package com.storytail.adventures.ui.components.public

import com.storytail.adventures.shared.resources.Res
import com.storytail.adventures.shared.resources.cruise_ship
import com.storytail.adventures.shared.resources.resort_night
import com.storytail.adventures.shared.resources.resort_pool
import com.storytail.adventures.shared.resources.snorkel
import com.storytail.adventures.shared.resources.turks
import org.jetbrains.compose.resources.DrawableResource

/**
 * The registry key → bundled photograph mapping.
 *
 * The keys come from web/lib/images.ts (carried into Kotlin as PublicCatalog.IMAGES) and
 * the files are the design's own Unsplash photographs, downloaded at 800px and bundled so
 * the app needs no image loader and no network to draw a hero — the same reasoning as the
 * bundled typefaces.
 *
 * ONLY THE PHOTOGRAPHS THAT DEPICT WHAT THEY CLAIM ARE BUNDLED, AND THAT IS THE WHOLE POINT
 * OF THIS FILE. Every id in the registry was fetched and looked at. Nine of the fifteen
 * return something other than their own alt text — `jamaica` ("Cliffs above clear water near
 * Negril") is the Taj Mahal, `honeymoon` ("Couple walking along a beach at golden hour") is
 * a tent under the Milky Way, `aruba` ("Palm-lined beach") is a group of people in winter
 * coats around a firepit. Unsplash ids are not stable identifiers for a subject; these have
 * drifted since the prototype was drawn.
 *
 * The mismatched ones are deliberately NOT bundled. A key with no file falls back to the
 * brand gradient (see [PublicPhoto]), which is a designed state — a travel advisor's page
 * illustrating Jamaica with the Taj Mahal is not. THE SAME IDS ARE LIVE ON WEB, so fixing
 * them in web/lib/images.ts fixes both platforms; [UNVERIFIED_IMAGE_KEYS] is the list.
 *
 * Do not "fix" a gradient here by pointing the key at a different photograph. Picking what
 * illustrates Aruba is Gyasi's call, and a generic beach captioned Aruba is the same class
 * of error as the Taj Mahal, only harder to catch.
 */
fun drawableForImageKey(imageKey: String): DrawableResource? = when (imageKey) {
    // Verified: the photograph matches the registry's own description.
    "turks", "palmTree" -> Res.drawable.turks
    "resortPool" -> Res.drawable.resort_pool
    "resortNight" -> Res.drawable.resort_night
    "cruiseShip", "cruiseAerial" -> Res.drawable.cruise_ship
    "snorkel" -> Res.drawable.snorkel

    // Everything else draws the gradient. See [UNVERIFIED_IMAGE_KEYS].
    else -> null
}

/**
 * Registry keys whose photograph does not match its description, plus the one whose photo
 * has been deleted. Each needs a corrected Unsplash id in web/lib/images.ts — or, better,
 * Gyasi's own photography, which is what `licensed: false` has been waiting for all along.
 *
 * Kept as data rather than a comment so the test suite can assert the list has not quietly
 * grown, and so the number in a review is a fact rather than a claim.
 */
val UNVERIFIED_IMAGE_KEYS: Set<String> = setOf(
    // Wrong subject — the id resolves to a different photograph entirely.
    "bahamas", // "Palm trees leaning over a Bahamas beach" → a breaking wave, no palms
    "stlucia", // "Green island peaks rising from the sea" → a man with a suitcase
    "bvi", //     shares stlucia's id
    "jamaica", // "Cliffs above clear water near Negril" → the Taj Mahal, India
    "aruba", //   "Palm-lined beach in Aruba" → people in winter coats around a firepit
    "overwater", // "Overwater bungalows above a calm lagoon" → a clifftop pool terrace
    "honeymoon", // "Couple walking along a beach at golden hour" → a tent under the stars
    "candlelit", // "Candlelit dinner table for two" → the Chicago skyline at dusk
    "family", //  "Family playing in a resort pool" → an empty villa interior
    "sunset", //  "Palm silhouettes against a tropical sunset" → boats in a cove, from above

    // Gone: the photograph has been removed from Unsplash and the id 404s.
    "zipline",
)
