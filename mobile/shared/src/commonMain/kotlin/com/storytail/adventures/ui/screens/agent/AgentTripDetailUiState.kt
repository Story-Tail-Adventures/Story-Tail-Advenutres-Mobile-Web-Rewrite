package com.storytail.adventures.ui.screens.agent

import com.storytail.adventures.api.AgentTripComponentRow
import com.storytail.adventures.api.AgentTripDetailSnapshot
import com.storytail.adventures.api.AgentTripItineraryDay
import com.storytail.adventures.api.AgentTripPaymentRow
import com.storytail.adventures.domain.agent.AGENT_TRIP_DETAIL_TABS
import com.storytail.adventures.domain.agent.AgentCopy
import com.storytail.adventures.domain.agent.AgentTripTab
import com.storytail.adventures.domain.agent.componentKindLabel
import com.storytail.adventures.domain.agent.documentKindLabel
import com.storytail.adventures.domain.agent.itineraryBlockLabel
import com.storytail.adventures.domain.agent.milestoneStatusLabel
import com.storytail.adventures.domain.agent.refundStatusLabel
import com.storytail.adventures.domain.agent.senderRoleLabel
import com.storytail.adventures.domain.trip.StatusChip
import com.storytail.adventures.domain.trip.TripStatus
import com.storytail.adventures.domain.trip.tripStatusPresentation
import com.storytail.adventures.domain.trip.tripTypeLabel
import com.storytail.adventures.ui.components.client.formatDay
import kotlinx.datetime.LocalDate

/**
 * Everything Screen 3.4.2 renders on a phone, already derived.
 *
 * ALL EIGHT TABS AT ONCE, which is what lets a tab switch cost nothing — see
 * `AgentRepository.tripDetail` for why the phone fetches eight reads where the web page
 * fetches one tab's, and [ClientDetailUiState] for the same call made at §3.3.2.
 *
 * THE SCREEN DOES NO ARITHMETIC AND READS NO CLOCK, the rule [WorklistUiState] sets.
 * `asOfDate` arrives on the overview, computed in Postgres in the AGENT's zone. A handset
 * deriving its own "today" would disagree with the accessor for the offset's worth of hours
 * either side of midnight — and here it would disagree about whether a trip says "Final
 * payment due", which is the one word on the screen an advisor acts on.
 *
 * ONE DEPARTURE FROM THE WEB'S SHAPE IS WORTH NAMING UP FRONT. The desk build derives the
 * status chip with `nextUnpaidDueDate: null` on the roster and the real value on the detail;
 * this passes the real value, because the detail is the only place a phone shows a trip at
 * all. So a booked trip with a balance eleven days out reads "Final payment due" here, and
 * that is the thing the advisor has to act on rather than the stage the row was filed under.
 */
data class AgentTripDetailUiState(
    val tripId: String,
    val clientId: String,
    val clientName: String,
    val title: String,
    val statusLabel: String,
    /**
     * Null when `trip_status` holds a value this build does not know.
     *
     * NOT a default chip, which is the trap: `StatusChip.INQUIRY` would have painted a
     * sixth enum member added server-side in inquiry colours, so the screen would state a
     * stage confidently and wrongly. Null renders the raw value in neutral type, which
     * reads as "we do not know what this is" — the honest answer.
     */
    val statusChip: StatusChip?,
    /** "Dec 4 – 11 · 6 travelers". Never blank — the traveler count is NOT NULL. */
    val subLine: String,
    /** The three figures, in the order an advisor is asked them. */
    val money: List<Pair<String, String>>,
    /** Labels carry a count where one exists, as §3.3.2's strip does. */
    val tabs: List<AgentTripTab>,
    val glance: List<Pair<String, String>>,
    val components: List<AgentTripComponentUi>,
    val days: List<AgentTripDayUi>,
    /** "Published" or "Draft". Never blank — an advisor must know which they are reading. */
    val itineraryStateLabel: String,
    val payments: List<AgentTripPaymentUi>,
    /**
     * One line above the schedule: nothing scheduled, everything settled, or what is next.
     *
     * THE THIRD CASE IS DATA, NOT COPY, which is why there is no string for it. The first
     * two are the pair `PaymentsSummaryCard` keeps apart on the web, and its reason holds
     * here: an empty list and a fully-paid list are opposite facts, and one sentence for
     * both told an advisor "No payments scheduled." about a trip that was paid in full.
     */
    val paymentsSummary: String,
    val documents: List<AgentTripDocumentUi>,
    val messages: List<AgentTripMessageUi>,
    /** `trip.notes`, the advisor's own prose. The Notes tab is this one field. */
    val notes: String?,
    val activity: List<AgentTripActivityUi>,
)

data class AgentTripComponentUi(
    val componentId: String,
    val kindLabel: String,
    val title: String,
    /** Supplier, date, time and place, in whatever order they exist. Null when none do. */
    val line: String?,
    val costLabel: String,
)

data class AgentTripDayUi(
    val dayId: String,
    val dayNumber: Int,
    /** "Fri Dec 4". */
    val dateLabel: String,
    val label: String?,
    val summary: String?,
    val activities: List<AgentTripActivityUi2>,
)

/**
 * One itinerary entry.
 *
 * NAMED APART FROM [AgentTripActivityUi], which is the status TIMELINE's row. Two different
 * things in this section are called an activity — `itinerary_activity` is a thing the
 * traveler does, `trip_status_history` is a thing that happened to the trip — and the
 * schema uses the word for both. Keeping the collision visible in the type names beats
 * resolving it silently and hoping the next reader guesses right.
 */
data class AgentTripActivityUi2(
    val activityId: String,
    /** "08:40 · Morning · Seven Mile Beach", from whichever of the three exist. */
    val line: String?,
    val title: String,
    val body: String?,
    val gyasisTip: String?,
)

data class AgentTripPaymentUi(
    val milestoneId: String,
    val label: String,
    val statusLabel: String,
    val paid: Boolean,
    /** "Dec 4", or null when the supplier has not set one. */
    val dueLabel: String?,
    val amountLabel: String,
)

data class AgentTripDocumentUi(
    val documentId: String,
    val filename: String,
    /** "Supplier confirmation · 1.1 MB". */
    val line: String,
    val sensitive: Boolean,
)

data class AgentTripMessageUi(
    val messageId: String,
    val who: String,
    val whenLabel: String,
    val body: String,
    val internalNote: Boolean,
)

data class AgentTripActivityUi(
    val historyId: String,
    /** "Proposal ready → Booked", or just the destination stage for the first entry. */
    val description: String,
    val actorName: String?,
    val whenLabel: String,
)

/**
 * "Fri Dec 4", the day-by-day's date line.
 *
 * THE WEEKDAY IS A PHONE ADDITION. `ItineraryDayList` on the web draws "Dec 4" alone, and
 * it can afford to — the desk screen shows the whole trip at once, so which day of the week
 * Wednesday falls on is visible from the rows around it. A phone shows two days at a time
 * and the commonest question an advisor is asked on the move is about a named day
 * ("what are we doing Saturday?"), which the date alone does not answer.
 *
 * `take(3)` off the enum name rather than a seventh list of weekday strings. Six copies of
 * the month names already exist in this module and a seventh of anything is not the fix.
 */
private fun weekdayMonthDay(iso: String): String {
    val date = runCatching { LocalDate.parse(iso) }.getOrNull() ?: return iso
    val weekday = date.dayOfWeek.name.take(3).lowercase().replaceFirstChar { it.uppercase() }
    return "$weekday ${formatDay(date)}"
}

/** "Dec 4", or null. The twin of `monthDay` in `web/lib/agent/queries.ts`. */
internal fun monthDay(iso: String?): String? {
    if (iso == null) return null
    val date = runCatching { LocalDate.parse(iso.take(10)) }.getOrNull() ?: return null
    return formatDay(date)
}

/**
 * `HH:MM:SS` → `HH:MM`, and null stays null.
 *
 * Postgres hands back seconds on a `time` column and nobody schedules a transfer to the
 * second. The web trims the same way in `hhmm`, for a different reason there — a value with
 * seconds on it makes Safari's time input render empty.
 */
internal fun hhmm(value: String?): String? = value?.takeIf { it.length >= 5 }?.take(5)

/** "1.1 MB". Binary units, because a file manager's number is what people compare against. */
private fun sizeLabel(bytes: Long): String = fileSizeLabel(bytes)

/**
 * The component's one line: who, when, where.
 *
 * SUPPLIER FIRST, which the web's row does not carry at all — it shows date, time and
 * location. On a phone the supplier is the answer to the question that gets asked out loud
 * ("who do I ring?"), and it is the only one of the four that cannot be guessed from the
 * trip's own dates.
 */
private fun componentLine(c: AgentTripComponentRow): String? = listOfNotNull(
    c.supplierName,
    monthDay(c.startDate),
    hhmm(c.startTime),
    c.location,
).takeIf { it.isNotEmpty() }?.joinToString(" · ")

/**
 * The Payments tab's summary line.
 *
 * The next-due row is chosen by `due_date`, and a milestone with NO due date cannot be
 * next — the supplier has not set one, so there is no date to be counted down to. That
 * matches `tripStatusPresentation`, which treats a dateless milestone as not making a trip
 * urgent, and the two must agree or the chip and this line contradict each other.
 */
private fun paymentsSummary(
    payments: List<AgentTripPaymentRow>,
    money: (Long, String) -> String,
): String {
    if (payments.isEmpty()) return AgentCopy.TRIP_PAYMENTS_EMPTY
    val outstanding = payments.filter { it.status != "paid" && it.status != "waived" }
    if (outstanding.isEmpty()) return AgentCopy.TRIP_PAYMENTS_ALL_SETTLED
    val next = outstanding.filter { it.dueDate != null }.minByOrNull { it.dueDate!! }
        ?: outstanding.first()
    return listOfNotNull(
        next.label,
        monthDay(next.dueDate),
        money(next.amountCents - next.paidCents, next.currency),
    ).joinToString(" · ")
}

fun agentTripDetailUiState(
    snapshot: AgentTripDetailSnapshot,
    money: (Long, String) -> String,
): AgentTripDetailUiState {
    val o = snapshot.overview
    val today = runCatching { LocalDate.parse(o.asOfDate) }.getOrNull()

    // An unrecognised `trip_status` degrades to the raw value and no chip rather than
    // throwing — the same posture `TripStatus.fromWire` documents. A sixth enum member
    // added server-side should not blank a screen.
    val status = TripStatus.fromWire(o.status)
    val presentation = if (status != null && today != null) {
        tripStatusPresentation(
            status = status,
            today = today,
            nextUnpaidDueDate = o.nextUnpaidDueDate?.let {
                runCatching { LocalDate.parse(it) }.getOrNull()
            },
        )
    } else {
        null
    }

    val dates = when {
        o.startDate != null && o.endDate != null ->
            "${monthDay(o.startDate)} – ${monthDay(o.endDate)}"
        o.startDate != null -> monthDay(o.startDate)
        o.endDate != null -> monthDay(o.endDate)
        else -> null
    }
    val travelers =
        "${o.travelerCount} ${if (o.travelerCount == 1) "traveler" else "travelers"}"

    val glance = buildList {
        add(AgentCopy.GLANCE_TRIP_TYPE to tripTypeLabel(o.tripType))
        add(
            AgentCopy.GLANCE_DESTINATION to
                (o.destinations.takeIf { it.isNotEmpty() }?.joinToString(", ")
                    ?: AgentCopy.GLANCE_NOT_SET),
        )
        // Brand, last four and the cap, which is the shape §2.4 already renders to the
        // traveler. The cap is the figure an advisor needs before adding a component: a
        // $9,000 limit against a $12,845 trip is a phone call, not a booking.
        add(
            AgentCopy.GLANCE_CARD_ON_FILE to (
                if (o.cardLast4 == null) {
                    AgentCopy.GLANCE_NO_CARD
                } else {
                    listOfNotNull(
                        "${o.cardBrand?.uppercase() ?: "CARD"} •••• ${o.cardLast4}",
                        o.cardSpendingLimitCents?.let { "${money(it, o.currency)} cap" },
                    ).joinToString(" · ")
                }
                ),
        )
        // OFF THE ACCESSOR, not off the status timeline beside it. `last_activity_at` is
        // greatest(max status change, max unarchived conversation message); the newest
        // `trip_status_history` row — which this read first — is only the last STAGE
        // change, so a trip whose last event was a client message showed a date weeks
        // older than the truth. The web reads the same column.
        add(
            AgentCopy.GLANCE_LAST_ACTIVITY to
                (monthDay(o.lastActivityAt) ?: AgentCopy.GLANCE_NO_ACTIVITY),
        )
        o.cancellationReason?.let { add(AgentCopy.GLANCE_CANCELLATION_REASON to it) }
        // The LABEL, not the stored value, and null for anything outside the vocabulary —
        // see `refundStatusLabel`. A row still carrying pre-vocabulary free text falls
        // through to the detail line below rather than putting a sentence where a status
        // belongs.
        refundStatusLabel(o.refundStatus)?.let { add(AgentCopy.GLANCE_REFUND_STATUS to it) }
        o.refundDetail?.let { add(AgentCopy.GLANCE_REFUND_DETAIL to it) }
    }

    return AgentTripDetailUiState(
        tripId = o.tripId,
        clientId = o.clientId,
        clientName = o.clientName,
        title = o.title,
        statusLabel = presentation?.label ?: o.status,
        statusChip = presentation?.chip,
        subLine = listOfNotNull(dates, travelers).joinToString(" · "),
        money = listOf(
            AgentCopy.CLIENT_TOTAL_LABEL to money(o.totalValueCents, o.currency),
            AgentCopy.PAID_SO_FAR_LABEL to money(o.totalPaidCents, o.currency),
            // `trip.total_commission_cents`, withheld from the client role entirely. Drawn
            // here and nowhere a traveler can reach.
            AgentCopy.COMMISSION_LABEL to money(o.totalCommissionCents, o.currency),
        ),
        // THE COUNTS COME OFF THE LISTS, which is where the phone differs from the web's
        // header and has to. The web's Overview tab does not hold the component rows, so
        // its header reads `component_count` off the accessor; this screen holds all eight
        // tabs at once, so the list's own length is the number the tab will actually show
        // and cannot disagree with the rows under it.
        //
        // It is also the only number available for documents: the accessor has
        // `component_count`, `manual_component_count` and `api_component_count` and NO
        // document count. A `document_count` field was declared here first and decoded to
        // its default, so the tab read "Documents · 0" over three documents — silently,
        // because a `@Serializable` default is silent by design.
        tabs = AGENT_TRIP_DETAIL_TABS.map { tab ->
            when (tab.id) {
                "components" -> tab.copy(label = "${tab.label} · ${snapshot.components.size}")
                "documents" -> tab.copy(label = "${tab.label} · ${snapshot.documents.size}")
                else -> tab
            }
        },
        glance = glance,
        components = snapshot.components.map { c ->
            AgentTripComponentUi(
                componentId = c.componentId,
                kindLabel = componentKindLabel(c.kind),
                title = c.displayName,
                line = componentLine(c),
                costLabel = money(c.costCents, c.currency),
            )
        },
        days = snapshot.days.map { d -> dayUi(d) },
        itineraryStateLabel =
            if (snapshot.itineraryPublished) AgentCopy.ITINERARY_PUBLISHED
            else AgentCopy.ITINERARY_DRAFT,
        payments = snapshot.payments.map { p ->
            AgentTripPaymentUi(
                milestoneId = p.milestoneId,
                label = p.label,
                statusLabel = milestoneStatusLabel(p.status),
                paid = p.status == "paid",
                dueLabel = monthDay(p.dueDate),
                amountLabel = money(p.amountCents, p.currency),
            )
        },
        paymentsSummary = paymentsSummary(snapshot.payments, money),
        documents = snapshot.documents.map { d ->
            AgentTripDocumentUi(
                documentId = d.documentId,
                filename = d.filename,
                line = "${documentKindLabel(d.kind)} · ${sizeLabel(d.sizeBytes)}",
                sensitive = d.isSensitive,
            )
        },
        messages = snapshot.messages.map { m ->
            AgentTripMessageUi(
                messageId = m.messageId,
                who = senderRoleLabel(m.senderRole),
                whenLabel = monthDay(m.createdAt.take(10)) ?: "",
                body = m.body,
                internalNote = m.isInternalNote,
            )
        },
        notes = o.notes?.takeIf { it.isNotBlank() },
        activity = snapshot.activity.map { h ->
            val to = stageLabel(h.toStatus)
            AgentTripActivityUi(
                historyId = h.historyId,
                description = h.fromStatus?.let { "${stageLabel(it)} → $to" } ?: to,
                actorName = h.changedByName,
                whenLabel = monthDay(h.changedAt.take(10)) ?: "",
            )
        },
    )
}

private fun dayUi(d: AgentTripItineraryDay) = AgentTripDayUi(
    dayId = d.dayId,
    dayNumber = d.dayNumber,
    dateLabel = weekdayMonthDay(d.date),
    label = d.label,
    summary = d.summary,
    activities = d.activities.map { a ->
        AgentTripActivityUi2(
            activityId = a.activityId,
            line = listOfNotNull(hhmm(a.startTime), itineraryBlockLabel(a.block), a.location)
                .takeIf { it.isNotEmpty() }?.joinToString(" · "),
            // `itinerary_activity.title` is nullable in the accessor's shape. An untitled
            // entry with a time and a place is still worth a row, so it degrades to its own
            // block rather than being dropped.
            title = a.title?.takeIf { it.isNotBlank() }
                ?: itineraryBlockLabel(a.block)
                ?: AgentCopy.GLANCE_NOT_SET,
            body = a.body,
            gyasisTip = a.gyasisTip,
        )
    },
)

/**
 * A stage's label, for the status timeline.
 *
 * `tripStatusPresentation` WITHOUT A DATE, deliberately, which is the one place this screen
 * calls it that way. A history row records the stage the trip moved TO at the time; folding
 * today's unpaid milestone into it would relabel a past `booked` transition as
 * "Final payment due", which is not what happened. The web's `TripActivityTimeline` passes
 * `today: ""` for the same reason and gets there by accident — an unparseable date makes
 * `daysBetween` NaN and the override is skipped. This says it on purpose.
 */
private fun stageLabel(wire: String): String {
    val status = TripStatus.fromWire(wire) ?: return wire
    return tripStatusPresentation(status, LocalDate(1970, 1, 1)).label
}
