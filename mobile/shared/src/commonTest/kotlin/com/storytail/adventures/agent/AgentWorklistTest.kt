package com.storytail.adventures.agent

import com.storytail.adventures.api.WorklistKpis
import com.storytail.adventures.api.WorklistPayment
import com.storytail.adventures.api.WorklistSnapshot
import com.storytail.adventures.api.WorklistTrip
import com.storytail.adventures.domain.agent.AGENT_BAR_DESTINATIONS
import com.storytail.adventures.domain.agent.AgentCopy
import com.storytail.adventures.domain.agent.PartOfDay
import com.storytail.adventures.domain.agent.daysBetween
import com.storytail.adventures.domain.agent.departingWithin30
import com.storytail.adventures.domain.agent.isOverdue
import com.storytail.adventures.domain.agent.needsYouCount
import com.storytail.adventures.domain.agent.needsYouLine
import com.storytail.adventures.domain.agent.partOfDay
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
    fun only_the_worklist_is_built_and_every_other_tab_names_its_section() {
        assertEquals(listOf("worklist"), AGENT_BAR_DESTINATIONS.filter { it.built }.map { it.id })
        for (d in AGENT_BAR_DESTINATIONS.filterNot { it.built }) {
            assertTrue(d.section.startsWith("§3."), "${d.id} has no section")
            assertTrue(d.phase != null, "${d.id} has no phase")
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

        assertNull(note(1))
        assertTrue(note(2)!!.contains("1 trip is"))
        assertTrue(note(3)!!.contains("2 trips are"))
        assertTrue(note(2)!!.startsWith("USD only."))
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
            AgentCopy.CLIENT_DETAIL_DEFERRED,
            AgentCopy.MESSAGES_DEFERRED,
            AgentCopy.QUICK_ADD_TRIP_DEFERRED,
            AgentCopy.QUICK_ADD_CLIENT_DEFERRED,
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
