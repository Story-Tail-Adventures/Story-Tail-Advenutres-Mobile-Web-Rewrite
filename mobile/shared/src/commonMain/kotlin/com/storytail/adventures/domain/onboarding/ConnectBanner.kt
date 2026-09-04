package com.storytail.adventures.domain.onboarding

/**
 * Screen 2.1m.13 Connect — what the banner at the top of the screen says.
 *
 * PARALLEL IMPLEMENTATION of the banner in
 * web/app/(onboarding)/onboarding/connect/page.tsx, and pure for the same reason the rest of
 * this package is: this decides whether a traveler is told nothing is linked when something
 * is, which is the one thing this screen must never do.
 *
 * The auto-match at email confirmation can attach a trip before the traveler ever reaches
 * this step — that is the ORDINARY path for somebody Gyasi has already been planning with.
 * A screen that always says "nothing linked yet" is telling exactly those people that the
 * work already done for them does not exist.
 */

/** What to say, and whether it is good news. */
data class ConnectBanner(val message: String, val matched: Boolean)

/**
 * Reports what the automatic match found, rather than promising it is coming.
 *
 * An empty list is genuinely ambiguous — it is both "no trip" and "the read failed" — and
 * both get the same words, because "nothing linked yet" invites a code either way and never
 * claims more than we know.
 */
fun connectBanner(
    trips: List<LinkedTrip>,
    email: String?,
    formatStart: (LinkedTrip) -> String,
): ConnectBanner {
    if (trips.isEmpty()) return ConnectBanner(ConnectBannerCopy.NO_MATCH, matched = false)

    val head = if (trips.size == 1) {
        ConnectBannerCopy.matchedOne(trips.first().title, formatStart(trips.first()))
    } else {
        ConnectBannerCopy.matchedMany(trips.size, trips.joinToString(", ") { it.title })
    }
    val footer = email?.takeIf { it.isNotBlank() }
        ?.let { " " + ConnectBannerCopy.matchedFooter(it) }
        .orEmpty()

    return ConnectBanner(head + footer, matched = true)
}

object ConnectBannerCopy {
    const val NO_MATCH =
        "Nothing linked yet — which is completely normal if this is your first trip with " +
            "me. If I've already started planning something for you, the code from your " +
            "invitation email will pull it in."

    /** Used when a trip has no start date yet, in place of the date. */
    const val DATES_TO_COME = "dates to come"

    fun matchedOne(title: String, whenText: String) =
        "Already linked · $title — $whenText. I started this one before you signed up, and " +
            "it's waiting on your dashboard."

    fun matchedMany(count: Int, titles: String) =
        "Already linked · $count trips are on your dashboard: $titles. I started these " +
            "before you signed up."

    fun matchedFooter(email: String) = "Linked to $email."
}

/**
 * `2026-08-12` as `12 Aug 2026`, matching web's `Intl.DateTimeFormat("en-GB", …)`.
 *
 * The month names are written out rather than looked up, for the same reason
 * `web/lib/countries.ts` freezes its country names: a platform locale database answers this
 * question differently on different devices, and a trip date that reads one way on a phone
 * and another in a browser is the drift this whole parallel-implementation discipline
 * exists to prevent. en-GB because the web twin pins en-GB.
 */
fun formatTripDate(startDate: String?): String {
    if (startDate.isNullOrBlank()) return ConnectBannerCopy.DATES_TO_COME
    val parts = startDate.split("-")
    if (parts.size != 3) return ConnectBannerCopy.DATES_TO_COME
    val month = parts[1].toIntOrNull() ?: return ConnectBannerCopy.DATES_TO_COME
    val day = parts[2].toIntOrNull() ?: return ConnectBannerCopy.DATES_TO_COME
    if (month !in 1..12) return ConnectBannerCopy.DATES_TO_COME
    return "$day ${MONTHS_SHORT[month - 1]} ${parts[0]}"
}

private val MONTHS_SHORT = listOf(
    "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
)

/**
 * `1990-03-11` as `11 March 1990`, matching web's long `en-GB` form.
 *
 * Month names written out for the same reason [formatTripDate]'s are: a platform locale
 * database is not the same on every device, and this is a person's birthday shown beside
 * their name.
 */
fun formatLongDate(iso: String): String? {
    val parts = iso.split("-").takeIf { it.size == 3 } ?: return null
    val month = parts[1].toIntOrNull()?.takeIf { it in 1..12 } ?: return null
    val day = parts[2].toIntOrNull() ?: return null
    return "$day ${MONTHS_LONG[month - 1]} ${parts[0]}"
}

/** `2031-02-01` as `Feb 2031` — a passport expiry is a month, not a day. */
fun formatMonthYear(iso: String): String? {
    val parts = iso.split("-").takeIf { it.size >= 2 } ?: return null
    val month = parts[1].toIntOrNull()?.takeIf { it in 1..12 } ?: return null
    return "${MONTHS_SHORT[month - 1]} ${parts[0]}"
}

private val MONTHS_LONG = listOf(
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
)
