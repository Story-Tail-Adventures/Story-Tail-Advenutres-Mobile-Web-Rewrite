package com.storytail.adventures.ui.screens.agent

import com.storytail.adventures.api.ClientRosterSnapshot
import com.storytail.adventures.api.RosterClient
import com.storytail.adventures.domain.agent.ClientCopy
import com.storytail.adventures.domain.agent.rosterCurrencyNote
import com.storytail.adventures.domain.agent.rosterSubtitle

/**
 * Everything Screen 3.3.1 renders on a phone, already derived.
 *
 * The screen does no arithmetic and reads no clock, for the reason [WorklistUiState] gives:
 * a screen whose output depends on an ambient clock cannot be tested, and the accessors go
 * to real trouble computing their windows in the AGENT's zone. Nothing here needs "today" at
 * all — the roster's dates are labels, not comparisons, and the one comparison that matters
 * (is this client travelling right now) was made in SQL and arrives as `nextTripStatus`.
 *
 * THE WEB TWIN IS `web/lib/agent/clients.ts`. Both derive the same labels from the same
 * accessor, and `check_copy_parity.py` holds the strings together. The shapes differ where
 * the surfaces do: there is no table here, so no column headers, and §6.6's "on-the-go"
 * framing makes this append rather than paginate.
 */
data class ClientRosterUiState(
    val subtitle: String,
    val rows: List<RosterRowUi>,
    val total: Int,
    /** True while the list is a prefix of the book and "Load more" has somewhere to go. */
    val hasMore: Boolean,
    /** Non-null when at least one row's money figure excluded a currency. */
    val currencyNote: String?,
    val archivedCount: Int,
)

data class RosterRowUi(
    val clientId: String,
    val displayName: String,
    val initials: String,
    /** Never blank: falls back to the "no email" line so the row keeps its second line. */
    val contactLine: String,
    val tags: List<String>,
    /** Null for a client with nothing committed — the screen shows a dash, not "$0.00". */
    val lifetimeLabel: String?,
    /** True when this row's figure covers one currency out of several. */
    val lifetimeExcludesACurrency: Boolean,
    /** The one trip line a phone row has room for. Null when there is no trip at all. */
    val tripLine: String?,
    val travellingNow: Boolean,
)

private val MONTHS = listOf(
    "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
)

/** "2026-08-12" → "Aug 26". The roster's date idiom, matching the web build's. */
fun monthYear(iso: String?): String? {
    if (iso == null) return null
    val parts = iso.split("-")
    if (parts.size < 2) return null
    val month = parts[1].toIntOrNull() ?: return null
    if (month !in 1..12) return null
    val year = parts[0]
    if (year.length < 2) return null
    return "${MONTHS[month - 1]} ${year.takeLast(2)}"
}

/**
 * A trip cell: "Anniversary Week in Negril · Aug 26".
 *
 * A trip with no dates still gets its name. An `inquiry` has neither a start nor an end —
 * BRD §6.5 creates one from a quote request before anything is planned — and dropping the
 * line because the date is missing would blank out the client most in need of a call.
 */
fun tripLabel(title: String?, iso: String?): String? {
    if (title == null) return null
    val when_ = monthYear(iso)
    return if (when_ == null) title else "$title · $when_"
}

/**
 * The ONE trip line a phone row shows, and why it prefers the next trip.
 *
 * The web table has a column each for last and next. A phone row has one line, and the
 * useful half of "when did they last travel / when do they next travel" for an advisor
 * looking someone up on the move is the one that has not happened yet. A client with only a
 * past trip still gets it rather than a dash.
 */
fun rosterTripLine(client: RosterClient): String? {
    if (client.nextTripStatus == "in_progress") {
        val where = client.nextTripDestination ?: client.nextTripTitle
        return if (where == null) ClientCopy.TRAVELLING_NOW else "${ClientCopy.TRAVELLING_NOW} · $where"
    }
    return tripLabel(client.nextTripTitle, client.nextTripStartDate)
        ?: tripLabel(client.lastTripTitle, client.lastTripEndDate)
}

fun rosterRowUi(client: RosterClient, money: (Long, String) -> String): RosterRowUi = RosterRowUi(
    clientId = client.clientId,
    displayName = client.displayName,
    initials = client.initials,
    contactLine = client.email ?: client.phone ?: ClientCopy.NO_EMAIL,
    tags = client.tags,
    // A NULL currency is the accessor saying nothing is committed. A labelled zero would
    // claim they have spent nothing, where the truth is that nothing has been booked yet.
    lifetimeLabel = client.lifetimeCurrency
        ?.let { currency -> client.lifetimeValueCents?.takeIf { it > 0L }?.let { money(it, currency) } },
    lifetimeExcludesACurrency = client.lifetimeCurrencyCount > 1,
    tripLine = rosterTripLine(client),
    travellingNow = client.nextTripStatus == "in_progress",
)

fun clientRosterUiState(
    snapshot: ClientRosterSnapshot,
    money: (Long, String) -> String,
): ClientRosterUiState {
    val rows = snapshot.rows.map { rosterRowUi(it, money) }
    return ClientRosterUiState(
        subtitle = rosterSubtitle(
            active = snapshot.summary.activeCount,
            inMotion = snapshot.summary.inMotionCount,
            toQualify = snapshot.summary.inquiryCount,
        ),
        rows = rows,
        total = snapshot.total,
        hasMore = rows.size < snapshot.total,
        currencyNote = rosterCurrencyNote(rows.count { it.lifetimeExcludesACurrency }),
        archivedCount = snapshot.summary.archivedCount,
    )
}

/**
 * The status chips, as (LABEL, VALUE) pairs — the order [ChipRow] takes.
 *
 * LIFTED OUT OF THE COMPOSABLE ON PURPOSE. Written inverted this renders the enum value as
 * the chip's text ("active", lowercase) and sends the human label back as the filter
 * ("Active"), which `client_status` has no member for. Both halves are silent: the chip
 * merely looks unstyled, and the read fails only once someone taps it. It shipped that way
 * and an emulator run caught it, so the pairs live here where `AgentClientRosterTest` can
 * assert both halves.
 */
val ROSTER_STATUS_OPTIONS: List<Pair<String, String>> = listOf(
    ClientCopy.FILTER_ACTIVE to "active",
    ClientCopy.FILTER_ARCHIVED to "archived",
)
