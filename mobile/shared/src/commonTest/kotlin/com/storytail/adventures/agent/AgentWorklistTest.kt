package com.storytail.adventures.agent

import com.storytail.adventures.api.WorklistKpis
import com.storytail.adventures.api.WorklistPayment
import com.storytail.adventures.api.WorklistSnapshot
import com.storytail.adventures.api.WorklistTrip
import com.storytail.adventures.domain.agent.AGENT_BAR_DESTINATIONS
import com.storytail.adventures.domain.agent.AgentCopy
import com.storytail.adventures.domain.agent.PartOfDay
import com.storytail.adventures.domain.agent.currencyNote
import com.storytail.adventures.domain.agent.daysBetween
import com.storytail.adventures.domain.agent.departingWithin30
import com.storytail.adventures.domain.agent.isOverdue
import com.storytail.adventures.domain.agent.needsYouCount
import com.storytail.adventures.domain.agent.needsYouLine
import com.storytail.adventures.domain.agent.partOfDay
import com.storytail.adventures.domain.agent.paymentDueLabel
import com.storytail.adventures.domain.agent.paymentsInOrder
import com.storytail.adventures.ui.screens.agent.periodLabelFor
import com.storytail.adventures.ui.screens.agent.worklistUiState
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * §3.2.1's derivations. Pure and date-injected, so none of this depends on what day it is
 * where the test runs — the rule §2.2 set for `greeting()`.
 */
class AgentWorklistTest {

    private fun kpis(
        confidence: Int? = 73,
        cycleDays: Double? = 17.3,
        sample: Int = 4,
        currencyCount: Int = 1,
    ) = WorklistKpis(
        pipelineValueCents = 5_816_500,
        bookedMonthCents = 512_000,
        commissionExpectedCents = 650_460,
        commissionConfidencePct = confidence,
        inquiryToBookDays = cycleDays,
        inquiryToBookSample = sample,
        activeClients = 2,
        activeTrips = 6,
        newInquiries = 1,
        unreadMessages = 0,
        currency = "USD",
        currencyCount = currencyCount,
    )

    private fun trip(id: String, status: String, start: String?) = WorklistTrip(
        tripId = id,
        clientName = "Maya Carter",
        title = "Cabo, Four Nights",
        status = status,
        startDate = start,
        totalValueCents = 512_000,
        currency = "USD",
    )

    private fun payment(id: String, days: Int?) = WorklistPayment(
        milestoneId = id,
        clientName = "Maya Carter",
        tripTitle = "Cabo",
        label = "Final balance",
        amountCents = 256_000,
        currency = "USD",
        dueDate = "2026-09-18",
        daysUntil = days,
    )

    // ── The bar ──────────────────────────────────────────────────────────────

    @Test
    fun the_bar_is_section_6_6s_four_in_order() {
        assertEquals(
            listOf("Worklist", "Clients", "Messages", "More"),
            AGENT_BAR_DESTINATIONS.map { it.label },
        )
    }

    @Test
    fun two_tabs_are_built_and_every_other_one_names_its_section() {
        // `clients` joined `worklist` on 2026-09-26 with §3.3.1. The order matters: this is
        // §6.6's bar, and the built pair are its first two.
        assertEquals(
            listOf("worklist", "clients"),
            AGENT_BAR_DESTINATIONS.filter { it.built }.map { it.id },
        )
        for (d in AGENT_BAR_DESTINATIONS.filterNot { it.built }) {
            assertTrue(d.section.startsWith("§3."), "${d.id} has no section")
            assertTrue(d.phase != null, "${d.id} has no phase")
        }
        // A built destination carries no phase: `phase` answers "when does this arrive",
        // and the answer for a built one is that it already has.
        for (d in AGENT_BAR_DESTINATIONS.filter { it.built }) {
            assertTrue(d.phase == null, "${d.id} is built but still carries a phase")
        }
    }

    @Test
    fun the_bar_is_not_the_web_rail() {
        // §6.6 is a narrowing DECISION, not an omission. The web rail carries Trips, Leads,
        // Commission and Reports; none belongs here, and "More" is on neither rail.
        val labels = AGENT_BAR_DESTINATIONS.map { it.label }
        for (railOnly in listOf("Trips", "Leads", "Commission", "Reports")) {
            assertTrue(railOnly !in labels, "$railOnly is web-only at MVP")
        }
        assertTrue("More" in labels)
    }

    // ── The greeting ─────────────────────────────────────────────────────────

    @Test
    fun the_zero_greeting_reads_at_every_hour_of_the_day() {
        // It renders directly under "Morning," / "Afternoon," / "Evening,", computed in the
        // agent's own zone — so "Nothing urgent this morning." contradicted the line above
        // it at every hour after noon. Pinned as a literal: this is the one line the copy
        // file says earns the worldview, and a derived assertion would move with the bug.
        assertEquals("Nothing urgent today.", AgentCopy.GREETING_ZERO)
        for (timeOfDay in listOf("morning", "afternoon", "evening", "tonight")) {
            assertTrue(
                timeOfDay !in AgentCopy.GREETING_ZERO.lowercase(),
                "names a time of day: ${AgentCopy.GREETING_ZERO}",
            )
        }
        // The sub-line is time-neutral already and stays as it is.
        assertEquals("The book is quiet. That is allowed.", AgentCopy.GREETING_ZERO_SUB)
    }

    // ── The payment day label ────────────────────────────────────────────────

    @Test
    fun the_payment_label_pluralises_and_says_today_rather_than_in_0_days() {
        assertEquals("Today", paymentDueLabel(0))
        assertEquals("Tomorrow", paymentDueLabel(1))
        assertEquals("2 days", paymentDueLabel(2))
        assertEquals("21 days", paymentDueLabel(21))
        assertEquals("1 day late", paymentDueLabel(-1))
        assertEquals("6 days late", paymentDueLabel(-6))
        // The three the single plural template got wrong.
        for (days in listOf(0, 1, -1)) {
            assertTrue("1 days" !in paymentDueLabel(days), "bad plural at $days")
            assertTrue("0 days" !in paymentDueLabel(days), "bad zero at $days")
        }
    }

    @Test
    fun the_greeting_never_says_zero_things() {
        assertEquals(AgentCopy.GREETING_ZERO, needsYouLine(0))
        assertTrue("0" !in needsYouLine(0))
        assertEquals(AgentCopy.GREETING_ONE, needsYouLine(1))
        assertTrue(needsYouLine(2).startsWith("2 things"))
        assertTrue(needsYouLine(11).startsWith("11 things"))
    }

    @Test
    fun part_of_day_splits_at_noon_and_six() {
        assertEquals(PartOfDay.MORNING, partOfDay(0))
        assertEquals(PartOfDay.MORNING, partOfDay(11))
        assertEquals(PartOfDay.AFTERNOON, partOfDay(12))
        assertEquals(PartOfDay.AFTERNOON, partOfDay(17))
        assertEquals(PartOfDay.EVENING, partOfDay(18))
        assertEquals(PartOfDay.EVENING, partOfDay(23))
    }

    @Test
    fun the_count_is_derived_from_the_three_sections_that_need_action() {
        val snapshot = WorklistSnapshot(
            asOfDate = "2026-09-22",
            kpis = kpis(),
            awaitingResponse = listOf(trip("a", "proposal", null), trip("b", "proposal", null)),
            paymentsDue = listOf(payment("p", 3)),
            newInquiries = listOf(trip("c", "inquiry", null)),
            // Departures and messages are information, not things that need him.
            departingSoon = listOf(trip("d", "booked", "2026-10-01")),
            recentMessages = emptyList(),
        )
        assertEquals(4, needsYouCount(snapshot))
    }

    // ── Windows and ordering ─────────────────────────────────────────────────

    @Test
    fun departing_within_30_is_inclusive_of_today_and_excludes_day_30() {
        val trips = listOf(
            trip("today", "booked", "2026-09-22"),
            trip("day29", "booked", "2026-10-21"),
            trip("day30", "booked", "2026-10-22"),
            trip("past", "booked", "2026-09-21"),
            trip("nodate", "inquiry", null),
        )
        assertEquals(
            listOf("today", "day29"),
            departingWithin30(trips, "2026-09-22").map { it.tripId },
        )
    }

    @Test
    fun a_cancelled_trip_is_not_a_departure() {
        // C3 on the phone. `agent_trip_board` returns cancelled rows on purpose — the web
        // pipeline board counts them — and a trip cancelled eight days before departure
        // keeps its `start_date`, so the date window alone lets it through. The browser
        // excludes it in `departingSoon` in `web/lib/agent/queries.ts`; until this test the
        // handset did not, and the two surfaces printed different counts off the same rows.
        //
        // All three leave on the SAME DAY, so nothing but the status can separate them.
        //
        // FAILS ON ONE CHARACTER: the guard in `departingWithin30` (WorklistSections.kt)
        // reads `if (trip.status == "cancelled") return@filter false`. Replace the first
        // `=` with `!` and the cancelled trip is the only row that comes back.
        val gone = trip("gone", "cancelled", "2026-09-30")
        val asked = trip("asked", "inquiry", "2026-09-30")
        val going = trip("going", "booked", "2026-09-30")

        // A denylist, never a whitelist of booked statuses: an inquiry's `start_date` is a
        // requested date and the section is "who is travelling", not "who is booked".
        assertEquals(
            listOf("asked", "going"),
            departingWithin30(listOf(gone, asked, going), "2026-09-22").map { it.tripId },
        )

        // And through the state the screen renders, which is where the section's header
        // count comes from as well as its rows.
        val ui = worklistUiState(
            snapshot = WorklistSnapshot(
                asOfDate = "2026-09-22",
                kpis = kpis(),
                awaitingResponse = emptyList(),
                paymentsDue = emptyList(),
                newInquiries = emptyList(),
                departingSoon = listOf(gone, going),
                recentMessages = emptyList(),
            ),
            displayName = "Gyasi Story",
            partOfDay = PartOfDay.MORNING,
            today = "2026-09-22",
        )
        assertEquals(listOf("going"), ui.departing.map { it.tripId })
    }

    @Test
    fun days_between_handles_month_and_year_boundaries() {
        assertEquals(1, daysBetween("2026-09-30", "2026-10-01"))
        assertEquals(-1, daysBetween("2026-01-01", "2025-12-31"))
        assertEquals(0, daysBetween("2026-09-22", "2026-09-22"))
        assertNull(daysBetween("not-a-date", "2026-09-22"))
    }

    @Test
    fun payments_put_the_late_ones_first() {
        val ordered = paymentsInOrder(
            listOf(payment("soon", 3), payment("late", -6), payment("later", 11)),
        )
        assertEquals(listOf("late", "soon", "later"), ordered.map { it.milestoneId })
        assertTrue(isOverdue(ordered.first()))
        assertTrue(!isOverdue(ordered.last()))
    }

    @Test
    fun a_payment_with_no_day_count_sorts_last_rather_than_first() {
        // `null` must not read as 0 and jump the queue ahead of a genuinely urgent one.
        val ordered = paymentsInOrder(listOf(payment("unknown", null), payment("late", -2)))
        assertEquals(listOf("late", "unknown"), ordered.map { it.milestoneId })
    }

    // ── The view model ───────────────────────────────────────────────────────

    @Test
    fun null_stays_null_all_the_way_to_the_screen() {
        // Data-Model §8.8's honest state. A 0% or a 0-day average would be a claim where an
        // absence is the truth, and the accessors return NULL precisely so the screen can
        // tell the two apart.
        val ui = worklistUiState(
            snapshot = WorklistSnapshot(
                asOfDate = "2026-09-22",
                kpis = kpis(confidence = null, cycleDays = null, sample = 0),
                awaitingResponse = emptyList(),
                paymentsDue = emptyList(),
                newInquiries = emptyList(),
                departingSoon = emptyList(),
                recentMessages = emptyList(),
            ),
            displayName = "Gyasi Story",
            partOfDay = PartOfDay.MORNING,
            today = "2026-09-22",
        )
        assertNull(ui.snapshot.kpis.commissionConfidencePct)
        assertNull(ui.snapshot.kpis.inquiryToBookDays)
        assertEquals(0, ui.needsYouCount)
    }

    @Test
    fun the_currency_note_appears_only_when_something_is_excluded() {
        fun note(count: Int) = worklistUiState(
            snapshot = WorklistSnapshot(
                asOfDate = "2026-09-22",
                kpis = kpis(currencyCount = count),
                awaitingResponse = emptyList(),
                paymentsDue = emptyList(),
                newInquiries = emptyList(),
                departingSoon = emptyList(),
                recentMessages = emptyList(),
            ),
            displayName = "Gyasi",
            partOfDay = PartOfDay.MORNING,
            today = "2026-09-22",
        ).currencyNote

        // HAND-WRITTEN, NOT DERIVED. These used to read `contains("1 trip is")`, which is
        // the implementation's own `currencyCount - 1` restated — so the test agreed with
        // the sentence rather than checking it, and held in place a line that called a
        // count of CURRENCIES a count of TRIPS. With 10 USD, 4 EUR and 2 GBP trips
        // `currency_count` is 3 and the old wording claimed two excluded trips against six.
        assertNull(note(1))
        assertEquals(
            "USD only. Trips priced in 1 other currency are not counted here.",
            note(2),
        )
        assertEquals(
            "USD only. Trips priced in 2 other currencies are not counted here.",
            note(3),
        )
        assertEquals(
            "USD only. Trips priced in 6 other currencies are not counted here.",
            note(7),
        )
    }

    @Test
    fun the_currency_note_counts_currencies_and_never_trips() {
        // The word the number modifies is the whole defect: `currency_count` is
        // `count(DISTINCT currency)`, and nothing in the read surface knows how many TRIPS
        // are excluded. A sentence that names trips is a specific small number an agent
        // will believe without checking.
        for (others in 1..5) {
            val note = currencyNote("EUR", others)
            // The number must never be the count a trip noun hangs off.
            assertTrue("$others trip" !in note, "counts trips: $note")
            assertTrue(note.startsWith("EUR only."), "wrong dominant: $note")
        }
        assertTrue(currencyNote("USD", 1).contains("1 other currency "))
        assertTrue(currencyNote("USD", 2).contains("2 other currencies "))
    }

    @Test
    fun the_greeting_uses_the_first_name_and_survives_a_blank_one() {
        fun name(display: String) = worklistUiState(
            snapshot = WorklistSnapshot(
                asOfDate = "2026-09-22",
                kpis = kpis(),
                awaitingResponse = emptyList(),
                paymentsDue = emptyList(),
                newInquiries = emptyList(),
                departingSoon = emptyList(),
                recentMessages = emptyList(),
            ),
            displayName = display,
            partOfDay = PartOfDay.MORNING,
            today = "2026-09-22",
        ).firstName

        assertEquals("Gyasi", name("Gyasi Story"))
        assertEquals("Gyasi", name("Gyasi"))
        assertEquals("there", name(""))
        assertEquals("there", name("   "))
    }

    @Test
    fun the_period_label_is_the_agents_date_not_the_devices() {
        assertEquals("SEP 22", periodLabelFor("2026-09-22"))
        assertEquals("JAN 01", periodLabelFor("2027-01-01"))
        assertEquals("DEC 31", periodLabelFor("2026-12-31"))
        // Malformed input renders as itself rather than throwing inside a composition.
        assertEquals("nonsense", periodLabelFor("nonsense"))
        assertEquals("2026-13-01", periodLabelFor("2026-13-01"))
    }

    @Test
    fun every_deferral_names_the_section_that_builds_it() {
        for (copy in listOf(
            AgentCopy.TRIP_DETAIL_DEFERRED,
            AgentCopy.MESSAGES_DEFERRED,
            AgentCopy.QUICK_ADD_TRIP_DEFERRED,
            AgentCopy.LEADS_DEFERRED,
            AgentCopy.AVAILABILITY_DEFERRED,
        )) {
            assertTrue(Regex("§3\\.\\d").containsMatchIn(copy), "no section in: $copy")
        }
    }

    @Test
    fun the_copy_says_inquiry_rather_than_lead() {
        // BRD §6.5: a quote request creates a trip in `inquiry`. One string is allowed to
        // say the word, and its whole job is to point at where the thing actually is.
        assertTrue(AgentCopy.INQUIRIES_TITLE == "New inquiries")
        assertTrue(!AgentCopy.INQUIRIES_EMPTY.lowercase().contains("lead"))
        assertTrue(AgentCopy.LEADS_DEFERRED.contains("Inquiry"))
    }
}
