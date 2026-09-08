package com.storytail.adventures.domain.trip

import kotlinx.datetime.LocalDate
import kotlinx.datetime.daysUntil

/**
 * Trip status: the six stored values, and the seven labels the design asks for.
 *
 * BRD §6.2 wants trip cards reading "Proposal Ready", "Booked", "Final Payment Due",
 * "Traveling Now", "Past Trip". The `trip_status` enum has six values and none of them is
 * "Final Payment Due" — so two of the labels a client sees are DERIVED, and the derivation
 * has to live in exactly one place per stack or web and native will eventually disagree
 * about what the same trip is called.
 *
 * The TypeScript twin is `web/lib/trips/status.ts`, and
 * `.github/scripts/check_copy_parity.py` compares the two label tables on every CI run.
 * That is why [Messages] is a flat object of plain constants: the parity checker only reads
 * top-level strings, so anything nested would be invisible to it and could drift silently.
 */

/** The stored enum, verbatim from `trip_status` in the initial migration. */
enum class TripStatus(val wire: String) {
    INQUIRY("inquiry"),
    PROPOSAL("proposal"),
    BOOKED("booked"),
    IN_PROGRESS("in_progress"),
    COMPLETED("completed"),
    CANCELLED("cancelled"),
    ;

    companion object {
        /** Null for an unrecognised value rather than throwing — a new enum member added
         *  server-side should degrade to "no chip", not crash a trip list. */
        fun fromWire(value: String?): TripStatus? = entries.firstOrNull { it.wire == value }
    }
}

/**
 * The chip variants in [com.storytail.adventures.ui.theme.StoryTailStatusColors]. These are
 * PRESENTATIONAL and do not map 1:1 onto [TripStatus]: `DUE` is a payment state layered on
 * top of `BOOKED`, and `TRAVELING`/`PAST` are the design's names for
 * `IN_PROGRESS`/`COMPLETED`. `LEAD` belongs to the Phase 2 Lead entity and is never produced
 * from a trip, which is why it is absent here.
 */
enum class StatusChip {
    INQUIRY,
    PROPOSAL,
    BOOKED,
    DUE,
    TRAVELING,
    PAST,
    CANCELLED,
}

object TripStatusMessages {
    const val INQUIRY = "Inquiry"
    const val PROPOSAL_READY = "Proposal ready"
    const val BOOKED = "Booked"
    const val FINAL_PAYMENT_DUE = "Final payment due"
    const val TRAVELING_NOW = "Traveling now"
    const val PAST_TRIP = "Past trip"
    const val CANCELLED = "Cancelled"
}

/**
 * How close an unpaid milestone has to be before a booked trip starts calling itself
 * "Final payment due" instead of "Booked".
 *
 * Fourteen days, matching the "ACTION NEEDED · 14 DAYS" overline the C221 artboard draws.
 * An already-overdue milestone counts too — a date in the past is not less urgent.
 */
const val DUE_SOON_DAYS: Int = 14

data class TripStatusPresentation(
    val chip: StatusChip,
    val label: String,
)

/**
 * The one place a trip becomes a chip and a label.
 *
 * @param nextUnpaidDueDate `due_date` of the earliest unpaid `payment_milestone`, or null
 *   when there is none. A milestone with no due date set does not make a trip urgent.
 * @param today injected so the derivation stays pure and testable.
 *
 * `CANCELLED` is checked before the payment override on purpose: a cancelled trip with an
 * unpaid milestone is not "Final payment due", it is cancelled, and the refund line on
 * Screen 2.2.10 is what speaks to the money.
 */
fun tripStatusPresentation(
    status: TripStatus,
    today: LocalDate,
    nextUnpaidDueDate: LocalDate? = null,
): TripStatusPresentation = when (status) {
    TripStatus.CANCELLED ->
        TripStatusPresentation(StatusChip.CANCELLED, TripStatusMessages.CANCELLED)
    TripStatus.COMPLETED ->
        TripStatusPresentation(StatusChip.PAST, TripStatusMessages.PAST_TRIP)
    TripStatus.IN_PROGRESS ->
        TripStatusPresentation(StatusChip.TRAVELING, TripStatusMessages.TRAVELING_NOW)
    TripStatus.INQUIRY ->
        TripStatusPresentation(StatusChip.INQUIRY, TripStatusMessages.INQUIRY)
    TripStatus.PROPOSAL ->
        TripStatusPresentation(StatusChip.PROPOSAL, TripStatusMessages.PROPOSAL_READY)
    TripStatus.BOOKED ->
        if (nextUnpaidDueDate != null && today.daysUntil(nextUnpaidDueDate) <= DUE_SOON_DAYS) {
            TripStatusPresentation(StatusChip.DUE, TripStatusMessages.FINAL_PAYMENT_DUE)
        } else {
            TripStatusPresentation(StatusChip.BOOKED, TripStatusMessages.BOOKED)
        }
}

/**
 * Days until departure, or null when there is nothing to count down to.
 *
 * Null for an inquiry with no dates, and null once the trip has started — a countdown that
 * has reached zero is not a countdown, and Screen 2.2.1's hero switches to the traveling
 * treatment at that point.
 */
fun daysUntilDeparture(startDate: LocalDate?, today: LocalDate): Int? {
    if (startDate == null) return null
    val days = today.daysUntil(startDate)
    return if (days < 0) null else days
}
