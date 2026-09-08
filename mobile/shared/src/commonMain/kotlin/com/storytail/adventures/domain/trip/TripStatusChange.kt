package com.storytail.adventures.domain.trip

/**
 * Screen 2.2.9's copy. KOTLIN TWIN of `web/lib/trips/statusChange.ts`, compared by
 * `.github/scripts/check_copy_parity.py`.
 *
 * SHARED because this is the screen a traveler reaches from a push notification, which is the
 * one place our words arrive without being asked for. Copy drifting between the stacks would
 * mean two travelers being told different things about the same event.
 *
 * WHAT THIS SCREEN CAN HONESTLY SAY is the design problem. The artboard's "What changed" card
 * lists three specific facts — the resort, the price, "two room types to choose between" — and
 * nothing in the schema records a DIFF. There is `trip.status` and `trip.status_changed_at`,
 * and that is all. So the headline and description are derived from the status it landed ON,
 * the supporting detail comes from real rows, and "two room types" is never said by anything.
 */
object StatusChangeMessages {
    const val WHAT_CHANGED = "What changed"
    const val WHATS_NEXT = "What’s next"

    const val OVERLINE_UPDATED = "Status updated"
    const val OVERLINE_INQUIRY = "We have your note"
    const val OVERLINE_TRAVELLING = "You’re travelling"
    const val OVERLINE_HOME = "Welcome home"

    const val HEADING_INQUIRY = "Gyasi has your inquiry"
    const val HEADING_PROPOSAL = "Your proposal is ready"
    const val HEADING_BOOKED = "It’s booked"
    const val HEADING_TRAVELLING = "You’re on your way"
    const val HEADING_COMPLETED = "That’s a wrap"
    const val HEADING_CANCELLED = "This trip has been cancelled"

    const val ITINERARY_LINE = "The day-by-day is published and ready to read"

    const val VIEW_PROPOSAL = "View the proposal"
    const val VIEW_ITINERARY = "Read the itinerary"
    const val VIEW_TRIP = "Open the trip"
    const val VIEW_SUMMARY = "See the cancellation summary"
    const val VIEW_MEMORIES = "Open the memories"
    const val AUTHORIZE_CARD = "Authorize a card"
    const val AUTHORIZE_DEFERRED = "Card authorization arrives with the payments screen"

    /** Shown when `status_changed_at` is null — a trip whose status never moved. */
    const val CHANGED_UNKNOWN = "Recently"
}

data class StatusNarrative(val overline: String, val heading: String, val body: String)

fun statusChangeNarrative(status: TripStatus, title: String): StatusNarrative = when (status) {
    TripStatus.INQUIRY -> StatusNarrative(
        StatusChangeMessages.OVERLINE_INQUIRY,
        StatusChangeMessages.HEADING_INQUIRY,
        "“$title” is on his desk. He reads every one himself, so give him a little time and " +
            "he will come back with questions or a plan.",
    )

    TripStatus.PROPOSAL -> StatusNarrative(
        StatusChangeMessages.OVERLINE_UPDATED,
        StatusChangeMessages.HEADING_PROPOSAL,
        "“$title” moved from an inquiry to a proposal. Gyasi has put something together — " +
            "have a read, no rush.",
    )

    TripStatus.BOOKED -> StatusNarrative(
        StatusChangeMessages.OVERLINE_UPDATED,
        StatusChangeMessages.HEADING_BOOKED,
        "“$title” is confirmed. From here Gyasi holds the details and you get to look " +
            "forward to it.",
    )

    TripStatus.IN_PROGRESS -> StatusNarrative(
        StatusChangeMessages.OVERLINE_TRAVELLING,
        StatusChangeMessages.HEADING_TRAVELLING,
        "“$title” has started. Everything you need is in the itinerary.",
    )

    TripStatus.COMPLETED -> StatusNarrative(
        StatusChangeMessages.OVERLINE_HOME,
        StatusChangeMessages.HEADING_COMPLETED,
        "“$title” is done. Whenever you feel like it, there is a place to keep the photos " +
            "and say what you carried home.",
    )

    TripStatus.CANCELLED -> StatusNarrative(
        StatusChangeMessages.OVERLINE_UPDATED,
        StatusChangeMessages.HEADING_CANCELLED,
        "“$title” is no longer going ahead. The summary has what was refunded and what is " +
            "held as credit.",
    )
}

/**
 * Per-status, and deliberately gentle. Design-System §2.6's third tone check asks whether
 * copy leaves room for rest, and this screen is reached from a notification, which is already
 * an interruption.
 */
fun statusChangeNextSteps(status: TripStatus): List<String> = when (status) {
    TripStatus.INQUIRY -> listOf(
        "Nothing to do yet",
        "Gyasi will come back to you with a plan or a question",
    )

    TripStatus.PROPOSAL -> listOf(
        "Have a read, no rush",
        "Reply with what you think",
        "Authorize a card and Gyasi locks it in",
    )

    TripStatus.BOOKED -> listOf(
        "Look through the itinerary when you have a minute",
        "Add your passports whenever it suits you",
        "Gyasi will be in touch before you travel",
    )

    TripStatus.IN_PROGRESS -> listOf(
        "Keep the itinerary handy",
        "Message Gyasi if anything shifts",
    )

    TripStatus.COMPLETED -> listOf(
        "Have a look at the photos",
        "Write something down if you feel like it",
    )

    TripStatus.CANCELLED -> listOf(
        "Read the cancellation summary",
        "Message Gyasi when the timing feels right",
    )
}

/** "Family Week in Turks · version 1", or a bare version when the proposal has no title. */
fun proposalLine(version: Int, title: String?): String =
    if (title != null) "$title · version $version" else "Proposal · version $version"

fun paymentLine(label: String, money: String, due: String?): String =
    if (due != null) "$label · $money due $due" else "$label · $money"
