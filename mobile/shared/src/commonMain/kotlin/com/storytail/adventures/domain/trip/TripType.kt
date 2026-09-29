package com.storytail.adventures.domain.trip

/**
 * `trip_type`: the five stored values, and the words a person reads.
 *
 * The KMP twin of `web/lib/trips/tripType.ts`, registered in
 * `.github/scripts/check_copy_parity.py` as "trip type". That file was written asking for
 * this one: *"FLAT OBJECT OF PLAIN STRINGS, deliberately, exactly as `TRIP_STATUS_MESSAGES`
 * is: when a Kotlin twin lands, check_copy_parity.py only reads top-level string literals,
 * so a nested or computed shape would drift silently past the gate. There is no twin today
 * — §3.4 is web-only at MVP."* §3.4.2 on Compose is what ends that, so the twin lands here
 * and the gate gains the row.
 *
 * A SIBLING TO [TripStatus] RATHER THAN PART OF IT, the same split the web made: that file
 * is "the one place a trip becomes a chip and a label" for STATUS, and status carries a
 * chip variant and a derivation (BRD §6.2's "Final payment due") that none of this needs.
 *
 * The labels are not the traveler's words or the advisor's — they are the same on both
 * surfaces, because a trip type is a fact about the trip rather than a thing said to
 * somebody. That is why one table serves the client shell and the agent shell both.
 */

/** The stored enum, verbatim from `trip_type` in the initial migration. */
enum class TripType(val wire: String) {
    CRUISE("cruise"),
    ALL_INCLUSIVE("all_inclusive"),
    MULTI_DESTINATION("multi_destination"),
    GROUP("group"),
    CUSTOM("custom"),
    ;

    companion object {
        /** Null for an unrecognised value rather than throwing — see [tripTypeLabel]. */
        fun fromWire(value: String?): TripType? = entries.firstOrNull { it.wire == value }
    }
}

object TripTypeMessages {
    const val CRUISE = "Cruise"
    const val ALL_INCLUSIVE = "All-inclusive"
    const val MULTI_DESTINATION = "Multi-destination"
    const val GROUP = "Group trip"
    const val CUSTOM = "Custom"
}

/**
 * The label for a stored trip type.
 *
 * AN UNRECOGNISED VALUE FALLS BACK TO THE RAW STRING, matching `tripTypeLabel` on the web
 * byte for byte — and this is the one place the two used to disagree. The Compose helper
 * this replaces returned `tripType.replace('_', ' ')`, so a sixth enum member added by a
 * migration would have read "group charter" on a phone and "group_charter" in a browser.
 * Neither is good, and the gate cannot see a fallback, so they may as well be the same one:
 * the raw value names what to add here, where a prettied one hides that there is anything
 * to add.
 */
fun tripTypeLabel(value: String): String = when (TripType.fromWire(value)) {
    TripType.CRUISE -> TripTypeMessages.CRUISE
    TripType.ALL_INCLUSIVE -> TripTypeMessages.ALL_INCLUSIVE
    TripType.MULTI_DESTINATION -> TripTypeMessages.MULTI_DESTINATION
    TripType.GROUP -> TripTypeMessages.GROUP
    TripType.CUSTOM -> TripTypeMessages.CUSTOM
    null -> value
}
