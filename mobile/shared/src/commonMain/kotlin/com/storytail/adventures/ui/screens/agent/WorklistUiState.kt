package com.storytail.adventures.ui.screens.agent

import com.storytail.adventures.api.WorklistPayment
import com.storytail.adventures.api.WorklistSnapshot
import com.storytail.adventures.api.WorklistTrip
import com.storytail.adventures.domain.agent.AgentCopy
import com.storytail.adventures.domain.agent.PartOfDay
import com.storytail.adventures.domain.agent.departingWithin30
import com.storytail.adventures.domain.agent.needsYouCount
import com.storytail.adventures.domain.agent.paymentsInOrder
import com.storytail.adventures.domain.agent.waitingLabel

/**
 * Everything Screen 3.2.1 renders, already derived.
 *
 * The screen does no arithmetic and reads no clock: `today` and `hour` arrive from the
 * caller, because a screen whose output depends on an ambient clock cannot be tested. Both
 * ultimately come from the agent's own time zone — `as_of_date` off `agent_kpis()`, and the
 * hour off `platform_user.time_zone` — which is the point. The accessors go to real trouble
 * computing "this month" and "departing in 30 days" in his zone, and deriving "Morning" from
 * the device clock would undo that in the most visible line on the screen. The web build
 * shipped exactly that bug and it was caught in a browser, not by a test.
 */
data class WorklistUiState(
    val firstName: String,
    val partOfDay: PartOfDay,
    /** Pre-formatted, e.g. "SEP 22". */
    val periodLabel: String,
    val needsYouCount: Int,
    val snapshot: WorklistSnapshot,
    val payments: List<WorklistPayment>,
    val departing: List<WorklistTrip>,
    /** §3.2.1 (2026-10-21): new inquiries, oldest first, each with how long it has waited. */
    val inquiries: List<WorklistInquiry> = emptyList(),
)

/** A new inquiry and its wait label ("Waiting 2 days"), already derived. */
data class WorklistInquiry(val trip: WorklistTrip, val waitLabel: String?)

private val MONTHS = listOf(
    "JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC",
)

fun periodLabelFor(today: String): String {
    val parts = today.split("-")
    if (parts.size != 3) return today
    val month = parts[1].toIntOrNull() ?: return today
    if (month !in 1..12) return today
    return "${MONTHS[month - 1]} ${parts[2]}"
}

fun worklistUiState(
    snapshot: WorklistSnapshot,
    displayName: String,
    partOfDay: PartOfDay,
    today: String,
    /** The advisor's own zone, for the inquiry wait labels. */
    timeZone: String = "UTC",
): WorklistUiState = WorklistUiState(
    firstName = displayName.substringBefore(' ').ifBlank { "there" },
    partOfDay = partOfDay,
    periodLabel = periodLabelFor(today),
    needsYouCount = needsYouCount(snapshot),
    snapshot = snapshot,
    payments = paymentsInOrder(snapshot.paymentsDue),
    departing = departingWithin30(
        snapshot.awaitingResponse + snapshot.newInquiries + snapshot.departingSoon,
        today,
    ).distinctBy { it.tripId },
    // Oldest first, the web worklist's order. ISO instants sort as text; a missing one last.
    inquiries = snapshot.newInquiries
        .sortedWith(compareBy(nullsLast()) { it.statusChangedAt })
        .map { WorklistInquiry(it, waitingLabel(today, it.statusChangedAt, timeZone)) },
)

/** The empty state, when the read succeeded and the book is genuinely quiet. */
fun worklistEmptyCopy(): Pair<String, String> =
    AgentCopy.GREETING_ZERO to AgentCopy.GREETING_ZERO_SUB
