package com.storytail.adventures.domain.agent

import com.storytail.adventures.api.WorklistPayment
import com.storytail.adventures.api.WorklistSnapshot
import com.storytail.adventures.api.WorklistTrip
import kotlinx.datetime.LocalDate

/**
 * The worklist's derivations. Deliberately OUTSIDE [AgentCopy].
 *
 * check_copy_parity.py's Kotlin reader terminates at the first line-leading `}`, so a `fun`
 * or a `val listOf(...)` inside that object silently truncates the map and takes every key
 * after it out of the gate. Splitting the file is the strong version of the warning
 * AccountCopy and WalletCopy both carry as a comment.
 *
 * Everything here is pure and date-injected: a screen whose output depends on an ambient
 * clock cannot be tested, which is the rule §2.2 set for `greeting()`. `today` comes from
 * `agent_kpis().as_of_date`, already computed in the agent's own time zone.
 */

/** How many things actually need him. Derived, never a literal — it is the first line on the screen. */
fun needsYouCount(snapshot: WorklistSnapshot): Int =
    snapshot.awaitingResponse.size + snapshot.paymentsDue.size + snapshot.newInquiries.size

fun needsYouLine(count: Int): String = when (count) {
    0 -> AgentCopy.GREETING_ZERO
    1 -> AgentCopy.GREETING_ONE
    else -> "$count things need you today."
}

/**
 * What the money figures leave out — in CURRENCIES, which is what the number actually counts.
 *
 * [otherCurrencies] is `agent_kpis().currency_count - 1`, and `currency_count` is
 * `count(DISTINCT currency)`. The old sentence rendered that as a number of TRIPS ("2 trips
 * are priced in another currency"), which is true only when every non-dominant currency holds
 * exactly one trip: with 10 USD, 4 EUR and 2 GBP it claimed two excluded trips against six.
 * The accessor returns no excluded-trip count and inventing one is a migration, so the
 * sentence names the thing the number is. Under-reporting with the exclusion named, never a
 * mixed sum.
 *
 * Byte-identical to `AGENT_COPY.currencyNote` in `web/lib/agent/content.ts`.
 */
fun currencyNote(dominant: String, otherCurrencies: Int): String =
    if (otherCurrencies == 1) {
        "$dominant only. Trips priced in 1 other currency are not counted here."
    } else {
        "$dominant only. Trips priced in $otherCurrencies other currencies are not counted here."
    }

/**
 * A payment milestone's due-day label — the words a person would use.
 *
 * ONE TEMPLATE WITH NO SPECIAL CASES WAS THE BUG: a milestone due today read "in 0 days", one
 * due tomorrow "in 1 days", and one a day overdue "1 days late". Matches `relativeDay()` in
 * `web/lib/agent/queries.ts` word for word, including the bare "5 days" for anything further
 * out — the two surfaces disagreed on EVERY future row, not only the ungrammatical three.
 */
fun paymentDueLabel(daysUntil: Int): String = when {
    daysUntil == 0 -> "Today"
    daysUntil == 1 -> "Tomorrow"
    daysUntil < 0 -> "${-daysUntil} ${if (daysUntil == -1) "day" else "days"} late"
    else -> "$daysUntil days"
}

enum class PartOfDay { MORNING, AFTERNOON, EVENING }

fun partOfDay(hour: Int): PartOfDay = when {
    hour < 12 -> PartOfDay.MORNING
    hour < 18 -> PartOfDay.AFTERNOON
    else -> PartOfDay.EVENING
}

fun PartOfDay.label(): String = when (this) {
    PartOfDay.MORNING -> "Morning"
    PartOfDay.AFTERNOON -> "Afternoon"
    PartOfDay.EVENING -> "Evening"
}

/** Whole days from [today] to [then]. Negative when [then] is past. */
fun daysBetween(today: String, then: String): Int? {
    val a = runCatching { LocalDate.parse(today) }.getOrNull() ?: return null
    val b = runCatching { LocalDate.parse(then) }.getOrNull() ?: return null
    // `toEpochDays()` is Long in this kotlinx-datetime; a trip is never 2^31 days out.
    return (b.toEpochDays() - a.toEpochDays()).toInt()
}

/**
 * Departures inside the next thirty days. Inclusive of today, exclusive of day 30 — the same
 * window `agent_trip_board(p_departing_within_days => 30)` uses, restated here because this
 * screen asks for the whole board and slices it rather than making four calls.
 *
 * CANCELLED IS NOT A DEPARTURE. `agent_trip_board` filters archived trips and deliberately
 * NOT cancelled ones — the web pipeline board needs them to count — so the exclusion has to
 * happen at the slice. A trip cancelled eight days before departure keeps its `start_date`,
 * and the date test alone lets it straight through: the handset listed a traveller who is
 * not going while the browser, which filters in `departingSoon` in `web/lib/agent/queries.ts`
 * under a comment of the same name, did not. Two surfaces printing different counts off the
 * same accessor and the same rows is worse than either one of them being wrong.
 *
 * A DENYLIST, NEVER A WHITELIST of booked statuses. An inquiry's or a proposal's
 * `start_date` is a requested date, and this section answers "who is travelling", not
 * "who is booked" — the same reading the web twin's comment spells out.
 *
 * The predicate lives here and not in `AgentRepository`'s `departingSoon` slice, which is
 * the raw date pre-filter over the board. This is the function that builds the section, it
 * is pure, and a second copy in the repository would be a predicate no test can drive.
 */
fun departingWithin30(trips: List<WorklistTrip>, today: String): List<WorklistTrip> =
    trips.filter { trip ->
        if (trip.status == "cancelled") return@filter false
        val start = trip.startDate ?: return@filter false
        val d = daysBetween(today, start) ?: return@filter false
        d in 0..29
    }

/**
 * Overdue first, then by due date.
 *
 * NO RISK MODEL. The desktop artboard draws high/med/low dots; `payment_milestone.status` is
 * `scheduled | paid | waived | overdue`, four states with no risk field anywhere in the
 * schema, and three colours over that is a control that lies. Lateness is the real signal
 * and it is already in `daysUntil`, which goes negative.
 */
fun paymentsInOrder(payments: List<WorklistPayment>): List<WorklistPayment> =
    payments.sortedWith(compareBy({ it.daysUntil ?: Int.MAX_VALUE }, { it.dueDate ?: "" }))

fun isOverdue(payment: WorklistPayment): Boolean = (payment.daysUntil ?: 0) < 0
