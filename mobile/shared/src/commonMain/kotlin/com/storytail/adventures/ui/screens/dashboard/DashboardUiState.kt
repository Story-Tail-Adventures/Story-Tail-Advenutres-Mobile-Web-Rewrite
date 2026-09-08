package com.storytail.adventures.ui.screens.dashboard

import com.storytail.adventures.api.DashboardSnapshot
import com.storytail.adventures.domain.trip.Loadable

/**
 * Screen 2.2.1's state.
 *
 * The snapshot and the greeting are separate because they fail separately: a trip read that
 * throws must show §5's error state, while a name read that throws should cost the greeting
 * a name and nothing else. Failing both together would put an error page in front of
 * somebody whose trips loaded perfectly well.
 */
data class DashboardUiState(
    val snapshot: Loadable<DashboardSnapshot> = Loadable.Loading,
    /** Null falls back to a nameless greeting rather than blocking the screen. */
    val firstName: String? = null,
)

/** Copy for Screen 2.2.1, mirroring web/app/(client)/dashboard/content.ts. */
object DashboardMessages {
    const val OVERLINE_REST = "WELCOME BACK · YOUR REST IS COMING"
    const val OVERLINE_NEUTRAL = "WELCOME BACK"
    const val SUBTITLE_TRAVELING = "Everything you need is on the itinerary. Rest deeply this week."
    const val SUBTITLE_NO_TRIP =
        "Nothing on the calendar yet — which is its own kind of open. Tell Gyasi roughly when and where, and he’ll take it from there."
    const val VIEW_ITINERARY = "View itinerary"
    const val ITINERARY_NOT_READY = "Gyasi is still writing this one"
    const val ACTION_NEEDED_LABEL = "ACTION NEEDED"
    const val AUTHORIZE_CARD = "Authorize a card"
    const val AUTHORIZE_CARD_COMING_SOON = "Card authorization opens with the next release"
    const val ADVISOR_NAME = "Gyasi"
    const val ADVISOR_ROLE = "Your advisor"
    const val ADVISOR_REPLY_TIME = "Usually replies the same day"
    const val MESSAGE_AGENT = "Message Gyasi"
    const val EMPTY_PLANNING_TITLE = "Nothing in planning"
    const val EMPTY_PLANNING_BODY =
        "When Gyasi starts putting something together for you, it shows up here first."
    const val EMPTY_PAST_TITLE = "No past trips yet"
    const val EMPTY_PAST_BODY =
        "Once you’ve travelled with Story-Tail, every trip stays here for you."
    const val START_SOMETHING_NEW = "Ask Gyasi about something new"
    const val SEE_ALL_TRIPS = "See all trips"
    const val NO_TRIP_TITLE = "No trip booked yet"
    const val NO_TRIP_BODY = "When there is one, it lives right here with a countdown on it."
    const val ERROR_TITLE = "We couldn’t load your trips"
    const val ERROR_BODY = "Something went wrong on our side, not yours. Try again in a moment."
    const val RETRY = "Try again"
    const val DAYS_UNIT = "DAYS"
}

/**
 * Which trip types get the rest framing.
 *
 * Design-System §2.4 asks for a "Resting in [destination] in [N] days" framing "for trips
 * that are clearly leisure (not always — sometimes the trip is a wedding, reunion,
 * work-adjacent)". Nothing in the schema says which, and rather than add a field or say
 * "you can finally breathe out" to somebody flying to a funeral, it derives from
 * `trip_type`: a cruise or an all-inclusive is a holiday by construction, while `group`,
 * `multi_destination` and `custom` are exactly the shapes a wedding or a reunion takes.
 *
 * Mirrors `isLeisure` in web/app/(client)/dashboard/content.ts.
 */
private val LEISURE_TRIP_TYPES = setOf("cruise", "all_inclusive")

fun isLeisure(tripType: String): Boolean = tripType in LEISURE_TRIP_TYPES

/** The hero greeting. Never says "0 days" or "1 days". */
fun greeting(name: String, days: Int?, traveling: Boolean, leisure: Boolean): String = when {
    traveling -> "You’re there, $name."
    days == null -> "Hello, $name."
    days == 0 -> "Today’s the day, $name."
    days == 1 -> "One more day, $name."
    leisure -> "Hey $name — $days days until you can finally breathe out."
    else -> "Hey $name — $days days to go."
}
