package com.storytail.adventures.domain.trip

/**
 * Which photograph stands in for a trip. Mirrors `web/lib/trips/imagery.ts`.
 *
 * `trip.cover_image_url` and `itinerary.cover_image_url` both exist and are both null for
 * every seeded trip, because nobody has uploaded trip photography yet — and the bundled
 * registry is still unlicensed placeholders anyway. So a trip picks a photo from what it
 * knows about itself.
 *
 * Destination first, because somebody going to Negril should see Jamaica rather than a
 * generic beach. Trip type second. A stable hash of the trip id last, so the same trip
 * always draws the same photo — a card that changes picture between recompositions looks
 * broken.
 *
 * Replaced wholesale the moment `cover_image_url` carries anything: a fallback, not a
 * feature.
 */

private val BY_DESTINATION: List<Pair<Regex, String>> = listOf(
    Regex("jamaica|negril|montego", RegexOption.IGNORE_CASE) to "jamaica",
    Regex("turks|caicos|providenciales", RegexOption.IGNORE_CASE) to "turks",
    Regex("bahama|nassau|paradise island", RegexOption.IGNORE_CASE) to "bahamas",
    Regex("aruba|palm beach|oranjestad", RegexOption.IGNORE_CASE) to "aruba",
    Regex("lucia|piton|soufri", RegexOption.IGNORE_CASE) to "stlucia",
    Regex("virgin islands|tortola|bvi", RegexOption.IGNORE_CASE) to "bvi",
)

private val BY_TRIP_TYPE: Map<String, String> = mapOf(
    "cruise" to "cruiseShip",
    "all_inclusive" to "resortPool",
    "multi_destination" to "palmTree",
    "group" to "family",
    "custom" to "sunset",
)

/** In a fixed order, so the hash is stable across builds. */
private val FALLBACK = listOf("overwater", "resortPool", "palmTree", "sunset", "snorkel")

fun imageKeyForTrip(id: String, tripType: String, destinations: List<String>): String {
    val where = destinations.joinToString(" ")
    BY_DESTINATION.firstOrNull { (pattern, _) -> pattern.containsMatchIn(where) }
        ?.let { return it.second }

    BY_TRIP_TYPE[tripType]?.let { return it }

    // A cheap stable hash. Not cryptographic and does not need to be — it only has to be
    // the same number for the same id every time.
    var hash = 0
    for (ch in id) hash = (hash * 31 + ch.code) % 100_000
    return FALLBACK[hash % FALLBACK.size]
}
