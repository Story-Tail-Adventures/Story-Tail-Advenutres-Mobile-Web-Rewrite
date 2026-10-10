package com.storytail.adventures.domain.agent

/**
 * Screen 3.4.2's vocabularies and derivations, for the reason `WorklistSections.kt` gives:
 * [AgentCopy] must stay a flat wall of `const val`, so anything with a brace in it lives
 * here instead.
 *
 * ── THREE OBJECTS, NOT ONE, AND THE SPLIT IS THE PARITY GATE'S ──────────────────
 *
 * `check_copy_parity.py` pairs ONE Kotlin object with ONE web const. The web keeps these
 * labels in three places for its own reasons — component kinds in `BUILDER_COPY` (§3.4.4's
 * sheets name them), milestone statuses in `SCHEDULE_COPY` (§3.4.15's editor), itinerary
 * blocks in `ITINERARY_COPY` (§3.4.14's form) — and every one of them is ALSO read-only
 * text on §3.4.2, which is the screen this file serves. So the split mirrors theirs rather
 * than tidying it, because a tidier shape here would be a shape the gate cannot check.
 *
 * Each object is flat `const val` only, for the same mechanical reason [AgentCopy] is: the
 * gate's Kotlin reader stops at the first line-leading `}`, so a `fun` inside one of these
 * would silently take every key after it out of the comparison. The functions are below the
 * last object's closing brace, which is why they are in this file at all.
 *
 * ── WHAT IS DELIBERATELY NOT PAIRED ─────────────────────────────────────────────
 *
 * Three vocabularies this screen renders have no pairable twin, and all three are the web's
 * shape rather than a decision here:
 *
 *   * DOCUMENT KINDS live in a `Record<string, string>` inside `TripDocumentsList.tsx`.
 *   * REFUND STATUSES live in a nested array in `cancelTrip.ts` (`REFUND_STATUS_OPTIONS`).
 *   * SENDER ROLES are an inline ternary in `TripMessagesThread.tsx`.
 *
 * The gate reads top-level string literals out of an object or a const, so none of the
 * three is visible to it. They are covered by `AgentTripDetailTest.kt` asserting the exact
 * labels instead, which is the arrangement `content.test.ts` uses on the web side for the
 * keys web_messages skips. Naming them here is what stops the next reader assuming the
 * paired set is the whole set.
 */

/**
 * Screen 3.4.2's eight tabs, in the web's order.
 *
 * NOT IN [AgentCopy] and not in the parity map, exactly as §3.3's six are not: the web
 * reads its labels from `tripTabs.ts`, a const array of `{id, label}` rather than a copy
 * object, so there is nothing on that side to pair with. The ids match `?tab=`'s values so
 * a reader can move between the two surfaces without a translation table.
 *
 * ALL EIGHT ARE HERE, unlike §3.3's mobile strip which dropped the one tab that was
 * disabled on the web too (Gyasi, asked at approval 2026-09-29). §6.6's "intentionally
 * narrower than web" is about WRITES and navigational depth, not about how much an advisor
 * may look at — someone standing at a gate needs to read anything about a trip.
 */
val AGENT_TRIP_DETAIL_TABS: List<AgentTripTab> = listOf(
    AgentTripTab("overview", "Overview"),
    AgentTripTab("components", "Components"),
    AgentTripTab("itinerary", "Itinerary"),
    AgentTripTab("payments", "Payments"),
    AgentTripTab("documents", "Documents"),
    AgentTripTab("messages", "Messages"),
    AgentTripTab("notes", "Notes"),
    AgentTripTab("activity", "Activity"),
)

data class AgentTripTab(val id: String, val label: String)

/** `component_kind`'s seven, paired with `BUILDER_COPY`. */
object TripComponentCopy {
    const val KIND_FLIGHT = "Flight"
    const val KIND_HOTEL = "Hotel or resort"
    const val KIND_CRUISE = "Cruise"
    const val KIND_EXCURSION = "Tour or activity"
    const val KIND_TRANSFER = "Transfer"
    const val KIND_INSURANCE = "Insurance"
    const val KIND_CUSTOM = "Something else"
}

/**
 * `payment_milestone_status`'s four, paired with `SCHEDULE_COPY`.
 *
 * The HINTS are not here. They explain a choice to somebody making one, and this surface
 * makes none — a read-only row shows the state it is in, and the sentence telling an
 * advisor when to pick `waived` belongs beside the picker that offers it.
 */
object TripScheduleCopy {
    const val STATUS_SCHEDULED = "Scheduled"
    const val STATUS_PAID = "Paid"
    const val STATUS_OVERDUE = "Overdue"
    const val STATUS_WAIVED = "Waived"
}

/** `itinerary_activity.block`'s four, plus the two lines the day-by-day renders. */
object TripItineraryCopy {
    const val BLOCK_MORNING = "Morning"
    const val BLOCK_AFTERNOON = "Afternoon"
    const val BLOCK_EVENING = "Evening"
    const val BLOCK_ALL_DAY = "All day"
    const val DAY_EMPTY = "Nothing on this day yet."
    // Verbatim, and Design-System §2 is why: "Gyasi's Tip" is a named thing on this product
    // rather than a generic note, so it is the one label on the agent's side that carries
    // the client surface's voice.
    const val TIP_LABEL = "Gyasi's Tip"
}

/**
 * The label for a stored `component_kind`.
 *
 * An unrecognised value falls back to the raw string rather than to "Something else":
 * `custom` is a real member with its own label, so collapsing an unknown eighth member into
 * it would hide a schema change behind a legitimate answer.
 */
fun componentKindLabel(kind: String): String = when (kind) {
    "flight" -> TripComponentCopy.KIND_FLIGHT
    "hotel" -> TripComponentCopy.KIND_HOTEL
    "cruise" -> TripComponentCopy.KIND_CRUISE
    "excursion" -> TripComponentCopy.KIND_EXCURSION
    "transfer" -> TripComponentCopy.KIND_TRANSFER
    "insurance" -> TripComponentCopy.KIND_INSURANCE
    "custom" -> TripComponentCopy.KIND_CUSTOM
    else -> kind
}

/** The label for a stored `payment_milestone_status`. */
fun milestoneStatusLabel(status: String): String = when (status) {
    "scheduled" -> TripScheduleCopy.STATUS_SCHEDULED
    "paid" -> TripScheduleCopy.STATUS_PAID
    "overdue" -> TripScheduleCopy.STATUS_OVERDUE
    "waived" -> TripScheduleCopy.STATUS_WAIVED
    else -> status
}

/**
 * The label for a stored `itinerary_activity.block`, or null.
 *
 * NULL RATHER THAN A FALLBACK, because the column is nullable and a null block is the
 * normal case — `BLOCKS` on the web opens with `{ value: "", label: "Work it out from the
 * time" }`, which is an instruction to the form and not a thing to render. A row with no
 * block shows its time and nothing else.
 */
fun itineraryBlockLabel(block: String?): String? = when (block) {
    null, "" -> null
    "morning" -> TripItineraryCopy.BLOCK_MORNING
    "afternoon" -> TripItineraryCopy.BLOCK_AFTERNOON
    "evening" -> TripItineraryCopy.BLOCK_EVENING
    "all_day" -> TripItineraryCopy.BLOCK_ALL_DAY
    else -> block
}

/**
 * The label for a stored `trip.refund_status`, or null.
 *
 * NULL FOR ANYTHING OUTSIDE THE VOCABULARY rather than echoing it, matching
 * `refundStatusLabel` on the web. The four values arrived with 20261001100000 and the same
 * migration moved everything else into `refund_detail` — so a row still carrying
 * pre-vocabulary free text falls through to the detail line rather than putting a whole
 * sentence where a status belongs.
 */
fun refundStatusLabel(value: String?): String? = when (value) {
    "none_expected" -> "None expected"
    "pending" -> "Pending"
    "partial" -> "Partial"
    "full" -> "Full"
    else -> null
}

/**
 * The label for a stored `document_kind`.
 *
 * TEN, WHERE THE WEB'S RECORD HAS NINE. The enum in the initial migration carries
 * `csv_import` and `TripDocumentsList.tsx` omits it, so such a document renders the raw
 * `csv_import` in a browser today. Both sides gain the entry with this screen.
 */
fun documentKindLabel(kind: String): String = when (kind) {
    "passport" -> "Passport"
    "visa" -> "Visa"
    "insurance_cert" -> "Insurance certificate"
    "supplier_confirmation" -> "Supplier confirmation"
    "receipt" -> "Receipt"
    "photo" -> "Photo"
    "csv_import" -> "CSV import"
    "pdf_proposal" -> "Proposal PDF"
    "pdf_itinerary" -> "Itinerary PDF"
    "other" -> "Other"
    else -> kind
}

/**
 * Who sent a message, from `user_role`.
 *
 * "You" for the agent, because the advisor reading this screen IS the agent — the accessor
 * is scoped to their own trips, so there is no case where an `agent` row was written by
 * somebody else. `admin` falls through to the raw value, which is the web's behaviour and
 * is honest: an admin reply is rare enough that inventing a friendly name for it would hide
 * who actually answered the client.
 */
fun senderRoleLabel(role: String): String = when (role) {
    "agent" -> "You"
    "client" -> "Client"
    else -> role
}
