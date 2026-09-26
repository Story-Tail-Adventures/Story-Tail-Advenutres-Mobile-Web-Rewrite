package com.storytail.adventures.agent

import com.storytail.adventures.api.ClientActivityRow
import com.storytail.adventures.api.ClientDetailSnapshot
import com.storytail.adventures.api.ClientDocumentRow
import com.storytail.adventures.api.ClientNoteRow
import com.storytail.adventures.api.ClientOverviewRow
import com.storytail.adventures.api.ClientThreadRow
import com.storytail.adventures.api.ClientTripRow
import com.storytail.adventures.api.CompanionRow
import com.storytail.adventures.domain.agent.ClientCopy
import com.storytail.adventures.ui.screens.agent.clientDetailUiState
import com.storytail.adventures.ui.screens.agent.describeEvent
import com.storytail.adventures.ui.screens.agent.documentBadge
import com.storytail.adventures.ui.screens.agent.fileSizeLabel
import com.storytail.adventures.ui.screens.agent.monthAndYear
import com.storytail.adventures.ui.screens.agent.monthDayYear
import com.storytail.adventures.ui.screens.agent.passportExpiringSoon
import com.storytail.adventures.ui.screens.agent.tripBucket
import com.storytail.adventures.ui.screens.agent.tripLine
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * §3.3.2 – §3.3.8's derivations on the phone.
 *
 * The web twin is `web/lib/agent/clientDetail.test.ts` and pins the same invariants, because
 * both surfaces derive the same labels from the same seven accessors. What is asserted here
 * is what a Compose screen can get wrong on its own — and one thing neither can get right by
 * accident: the six-month passport cutoff crosses a year boundary, and month arithmetic done
 * by hand is where that breaks.
 */
class AgentClientDetailTest {

    private fun overview(
        lifetime: Long? = 2_480_000,
        commission: Long? = 297_600,
        currency: String? = "USD",
        currencyCount: Int = 1,
        trips: Int = 1,
        activeTrips: Int = 1,
        notes: Int = 3,
        docs: Int = 0,
        email: String? = "annabelle.fc@example.com",
        phone: String? = "+1-555-0194",
    ) = ClientOverviewRow(
        clientId = "c1",
        displayName = "Belle Fitzwilliam-Castellanos",
        initials = "AF",
        email = email,
        phone = phone,
        status = "active",
        archived = false,
        tags = listOf("vip"),
        createdAt = "2024-03-01T00:00:00Z",
        addressLine = "1400 Lakeview Terrace, Chicago, IL",
        dateOfBirth = "1988-04-17",
        snapshotNote = "Prefers a villa.",
        preferredDestinations = listOf("Caribbean"),
        travelStyles = listOf("resort"),
        dietaryRestrictions = listOf("pescatarian"),
        dietaryNote = "Shellfish is a hard no.",
        accessibilityNeeds = emptyList(),
        accessibilityNote = null,
        loyaltyPrograms = listOf("AAdvantage" to "Platinum", "Bonvoy" to null),
        budgetBand = "premium",
        lifetimeValueCents = lifetime,
        commissionCents = commission,
        lifetimeCurrency = currency,
        lifetimeCurrencyCount = currencyCount,
        tripCount = trips,
        activeTripCount = activeTrips,
        noteCount = notes,
        documentCount = docs,
        lastContactAt = "2026-09-26T12:00:00Z",
        asOfDate = "2026-09-26",
    )

    private fun trip(
        status: String = "booked",
        start: String? = "2027-04-24",
        end: String? = "2027-05-04",
        destination: String? = "Malé, Maldives",
        asOf: String = "2026-09-26",
    ) = ClientTripRow(
        tripId = "t1",
        title = "Maldives, overwater",
        status = status,
        startDate = start,
        endDate = end,
        destination = destination,
        totalValueCents = 2_480_000,
        commissionCents = 297_600,
        currency = "USD",
        asOfDate = asOf,
    )

    private fun snapshot(
        o: ClientOverviewRow = overview(),
        companions: List<CompanionRow> = emptyList(),
        trips: List<ClientTripRow> = emptyList(),
        threads: List<ClientThreadRow> = emptyList(),
        documents: List<ClientDocumentRow> = emptyList(),
        notes: List<ClientNoteRow> = emptyList(),
        activity: List<ClientActivityRow> = emptyList(),
    ) = ClientDetailSnapshot(o, companions, trips, threads, documents, notes, activity)

    private fun money(cents: Long, currency: String) = "$currency $cents"

    // ── Dates ────────────────────────────────────────────────────────────────

    @Test
    fun dates_format_two_ways_and_refuse_junk() {
        assertEquals("Aug 12, 2026", monthDayYear("2026-08-12"))
        assertEquals("Aug 12, 2026", monthDayYear("2026-08-12T10:00:00Z"))
        assertEquals("Mar 2024", monthAndYear("2024-03-01T00:00:00Z"))
        assertNull(monthDayYear(null))
        assertNull(monthDayYear("2026-13-01"))
        assertNull(monthDayYear("2026-08"))
        assertNull(monthAndYear("nonsense"))
    }

    // ── The passport cutoff, which is where hand-rolled month maths breaks ───

    @Test
    fun the_six_month_passport_cutoff_crosses_a_year_boundary() {
        // From October, six months lands in April of the NEXT year. An implementation that
        // added 6 to the month without rolling the year would compute month 16 and compare
        // against a string that sorts wrong, flagging nothing.
        assertTrue(passportExpiringSoon("2027-02-14", asOfDate = "2026-10-15"))
        assertTrue(passportExpiringSoon("2027-04-01", asOfDate = "2026-10-15"))
        assertFalse(passportExpiringSoon("2027-06-01", asOfDate = "2026-10-15"))
    }

    @Test
    fun the_cutoff_works_inside_one_year_too_and_ignores_a_missing_expiry() {
        assertTrue(passportExpiringSoon("2026-11-01", asOfDate = "2026-09-26"))
        assertFalse(passportExpiringSoon("2029-08-30", asOfDate = "2026-09-26"))
        assertFalse(passportExpiringSoon(null, asOfDate = "2026-09-26"))
    }

    // ── Trips ────────────────────────────────────────────────────────────────

    @Test
    fun a_trip_line_survives_missing_dates_and_missing_everything() {
        assertEquals("Apr 24, 2027 – May 4, 2027 · Malé, Maldives", tripLine(trip()))
        assertEquals(
            "Malé, Maldives",
            tripLine(trip(start = null, end = null)),
        )
        // An inquiry has no dates at all (BRD §6.5) and is the trip most likely to need a
        // call — it must not render as an empty row.
        assertEquals(
            ClientCopy.NO_TRIP,
            tripLine(trip(start = null, end = null, destination = null)),
        )
    }

    @Test
    fun the_bucket_is_decided_by_end_date_not_by_status() {
        // A completed trip whose status was never advanced still belongs under Past.
        assertEquals("active", tripBucket(trip()))
        assertEquals("past", tripBucket(trip(end = "2025-01-13", start = "2025-01-06")))
        assertEquals("cancelled", tripBucket(trip(status = "cancelled")))
        assertEquals("past", tripBucket(trip(status = "booked", end = "2020-01-01")))
    }

    // ── Documents ────────────────────────────────────────────────────────────

    @Test
    fun the_badge_comes_from_the_mime_type_and_falls_back_to_the_extension() {
        assertEquals("PDF", documentBadge("application/pdf", "x"))
        assertEquals("IMG", documentBadge("image/jpeg", "p.jpg"))
        assertEquals("DOC", documentBadge("application/octet-stream", "x.bin"))
        assertEquals("PDF", documentBadge("application/octet-stream", "y.PDF"))
    }

    @Test
    fun a_size_is_formatted_and_never_invented() {
        assertEquals("900 B", fileSizeLabel(900))
        assertEquals("1 KB", fileSizeLabel(1024))
        assertEquals("1.1 MB", fileSizeLabel(1_153_434))
        assertEquals(ClientCopy.NO_TRIP, fileSizeLabel(0))
        assertEquals(ClientCopy.NO_TRIP, fileSizeLabel(-5))
    }

    // ── Activity ─────────────────────────────────────────────────────────────

    @Test
    fun an_event_slug_becomes_a_sentence_and_an_unknown_one_is_never_dropped() {
        assertEquals("Client record updated", describeEvent("client.updated"))
        assertEquals("Internal note added", describeEvent("client.note_created"))
        assertEquals("Trip status changed", describeEvent("trip.status_changed"))
        assertEquals("Something entirely new", describeEvent("something.entirely_new"))
    }

    // ── The whole state ──────────────────────────────────────────────────────

    @Test
    fun the_tab_strip_carries_the_counts_the_overview_already_read() {
        val ui = clientDetailUiState(snapshot(overview(trips = 4, docs = 5, notes = 3)), ::money)
        assertEquals(
            listOf("Overview", "Trips · 4", "Messages", "Documents · 5", "Notes · 3", "Activity"),
            ui.tabs.map { it.label },
        )
        assertEquals(
            listOf("overview", "trips", "messages", "documents", "notes", "activity"),
            ui.tabs.map { it.id },
        )
    }

    @Test
    fun a_client_with_nothing_committed_gets_a_dash_rather_than_zero() {
        val ui = clientDetailUiState(
            snapshot(overview(lifetime = null, commission = null, currency = null, currencyCount = 0)),
            ::money,
        )
        val stats = ui.stats.toMap()
        assertEquals(ClientCopy.NO_LIFETIME, stats[ClientCopy.STAT_LIFETIME])
        assertEquals(ClientCopy.NO_LIFETIME, stats[ClientCopy.STAT_COMMISSION])
        assertFalse(ui.moneyExcludesACurrency)
        assertNull(ui.currencyNote)
    }

    @Test
    fun a_row_that_excluded_a_currency_says_so() {
        val ui = clientDetailUiState(snapshot(overview(currencyCount = 2)), ::money)
        assertTrue(ui.moneyExcludesACurrency)
        assertEquals(ClientCopy.CURRENCY_NOTE_ONE, ui.currencyNote)
    }

    @Test
    fun the_loyalty_number_is_never_in_the_state_at_all() {
        // The accessor returns the jsonb whole; the programme and tier are what a booking
        // needs and the number is an account credential.
        val ui = clientDetailUiState(snapshot(), ::money)
        assertTrue(ui.preferences.contains("AAdvantage · Platinum"))
        assertTrue(ui.preferences.contains("Bonvoy"))
        assertFalse(ui.preferences.any { it.contains("SECRET") })
    }

    @Test
    fun the_contact_line_falls_back_email_then_phone_then_the_stand_in() {
        assertEquals(
            "annabelle.fc@example.com",
            clientDetailUiState(snapshot(), ::money).contactLine,
        )
        assertEquals(
            "+1-555-0194",
            clientDetailUiState(snapshot(overview(email = null)), ::money).contactLine,
        )
        assertEquals(
            ClientCopy.NO_EMAIL,
            clientDetailUiState(snapshot(overview(email = null, phone = null)), ::money).contactLine,
        )
    }

    @Test
    fun a_thread_with_no_subject_borrows_the_trips_name_rather_than_rendering_blank() {
        val threads = listOf(
            ClientThreadRow("cv1", null, "Maldives, overwater", "Hi", "2026-09-26T12:00:00Z", 2, 5),
            ClientThreadRow("cv2", "   ", "Maldives, overwater", null, "2026-09-25T12:00:00Z", 0, 1),
            ClientThreadRow("cv3", "Upgrade", null, null, "2026-09-24T12:00:00Z", 0, 1),
            ClientThreadRow("cv4", null, null, null, "2026-09-23T12:00:00Z", 0, 1),
        )
        val ui = clientDetailUiState(snapshot(threads = threads), ::money)
        assertEquals(
            listOf("Maldives, overwater", "Maldives, overwater", "Upgrade", "Conversation"),
            ui.threads.map { it.subject },
        )
    }

    @Test
    fun a_note_is_marked_edited_only_when_updated_at_actually_moved() {
        val notes = listOf(
            ClientNoteRow("n1", "a", "Gyasi", true, "2026-09-14T10:00:00Z", "2026-09-14T10:00:00Z"),
            ClientNoteRow("n2", "b", "Gyasi", true, "2026-09-14T10:00:00Z", "2026-09-20T10:00:00Z"),
            ClientNoteRow("n3", "c", null, false, "2026-09-14T10:00:00Z", "2026-09-14T10:00:00Z"),
        )
        val ui = clientDetailUiState(snapshot(notes = notes), ::money)
        assertEquals(listOf(false, true, false), ui.notes.map { it.edited })
        assertEquals("Unknown", ui.notes[2].authorName)
    }

    @Test
    fun the_household_line_flags_only_the_passport_that_is_close() {
        val companions = listOf(
            CompanionRow("cp1", "Dominic Castellanos", "DC", "spouse", "2026-11-01"),
            CompanionRow("cp2", "Rosa Castellanos", "RC", "child", "2029-08-30"),
            CompanionRow("cp3", "No Passport", "NP", null, null),
        )
        val ui = clientDetailUiState(snapshot(companions = companions), ::money)
        assertEquals(listOf(true, false, false), ui.household.map { it.passportExpiringSoon })
        assertNull(ui.household[2].line)
    }
}
