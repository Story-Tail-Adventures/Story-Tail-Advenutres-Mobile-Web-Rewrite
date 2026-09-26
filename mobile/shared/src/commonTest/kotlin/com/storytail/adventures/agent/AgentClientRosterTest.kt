package com.storytail.adventures.agent

import com.storytail.adventures.api.ClientRosterSnapshot
import com.storytail.adventures.api.ClientRosterSummary
import com.storytail.adventures.api.RosterClient
import com.storytail.adventures.domain.agent.AGENT_BAR_DESTINATIONS
import com.storytail.adventures.domain.agent.ClientCopy
import com.storytail.adventures.domain.agent.rosterCurrencyNote
import com.storytail.adventures.domain.agent.rosterSubtitle
import com.storytail.adventures.ui.screens.agent.clientRosterUiState
import com.storytail.adventures.ui.screens.agent.monthYear
import com.storytail.adventures.ui.screens.agent.rosterRowUi
import com.storytail.adventures.ui.screens.agent.ROSTER_STATUS_OPTIONS
import com.storytail.adventures.ui.screens.agent.rosterTripLine
import com.storytail.adventures.ui.screens.agent.tripLabel
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * §3.3.1's derivations on the phone.
 *
 * The web twin is `web/lib/agent/clients.test.ts` and it pins the same invariants, because
 * both surfaces derive the same labels from the same accessor. What is asserted here is what
 * a Compose screen can get wrong on its own: a labelled zero where an absence is the truth,
 * a trip line that disappears because its date is missing, and initials taken from a display
 * name that `preferred_name` has already rewritten.
 */
class AgentClientRosterTest {

    private fun client(
        first: String = "Jordan",
        last: String = "Hayes",
        display: String = "Jordan Hayes",
        initials: String = "JH",
        email: String? = "jordan.hayes@example.com",
        phone: String? = "+1-555-0142",
        lifetimeCents: Long? = 1_976_500,
        currency: String? = "USD",
        currencyCount: Int = 1,
        lastTitle: String? = "Beaches Turks & Caicos",
        lastEnd: String? = "2025-01-13",
        nextTitle: String? = "Anniversary Week in Negril",
        nextStart: String? = "2026-08-12",
        nextStatus: String? = "booked",
        nextDestination: String? = "Negril, Jamaica",
    ) = RosterClient(
        clientId = "c1",
        displayName = display,
        initials = initials,
        email = email,
        phone = phone,
        tags = listOf("anniversary"),
        archived = false,
        lifetimeValueCents = lifetimeCents,
        lifetimeCurrency = currency,
        lifetimeCurrencyCount = currencyCount,
        tripCount = 5,
        lastTripTitle = lastTitle,
        lastTripEndDate = lastEnd,
        nextTripTitle = nextTitle,
        nextTripStartDate = nextStart,
        nextTripStatus = nextStatus,
        nextTripDestination = nextDestination,
    )

    private fun money(cents: Long, currency: String) = "$currency $cents"

    // ── Dates ────────────────────────────────────────────────────────────────

    @Test
    fun monthYearFormatsTheRostersDateIdiom() {
        assertEquals("Aug 26", monthYear("2026-08-12"))
        assertEquals("Jan 25", monthYear("2025-01-13"))
    }

    @Test
    fun monthYearRefusesJunkRatherThanGuessing() {
        assertNull(monthYear(null))
        assertNull(monthYear(""))
        assertNull(monthYear("2026"))
        assertNull(monthYear("2026-13-01"))
        assertNull(monthYear("2026-ab-01"))
    }

    @Test
    fun aTripWithNoDateKeepsItsName() {
        // An inquiry has neither a start nor an end — BRD §6.5 creates one from a quote
        // request before anything is planned — and dropping the line because the date is
        // missing would blank out the client most in need of a call.
        assertEquals("Somewhere warm", tripLabel("Somewhere warm", null))
        assertEquals("Somewhere warm · Aug 26", tripLabel("Somewhere warm", "2026-08-12"))
        assertNull(tripLabel(null, "2026-08-12"))
    }

    // ── The one trip line a phone row has room for ────────────────────────────

    @Test
    fun aTravellingClientReadsNowRatherThanADateThatHasPassed() {
        val line = rosterTripLine(client(nextStatus = "in_progress"))
        assertEquals("${ClientCopy.TRAVELLING_NOW} · Negril, Jamaica", line)
    }

    @Test
    fun travellingWithNoDestinationFallsBackToTheTitleThenToTheWordAlone() {
        assertEquals(
            "${ClientCopy.TRAVELLING_NOW} · Anniversary Week in Negril",
            rosterTripLine(client(nextStatus = "in_progress", nextDestination = null)),
        )
        assertEquals(
            ClientCopy.TRAVELLING_NOW,
            rosterTripLine(
                client(nextStatus = "in_progress", nextDestination = null, nextTitle = null),
            ),
        )
    }

    @Test
    fun theNextTripWinsOverTheLastOne() {
        assertEquals("Anniversary Week in Negril · Aug 26", rosterTripLine(client()))
    }

    @Test
    fun aClientWithOnlyAPastTripStillGetsALineRatherThanADash() {
        assertEquals(
            "Beaches Turks & Caicos · Jan 25",
            rosterTripLine(client(nextTitle = null, nextStart = null, nextStatus = null)),
        )
    }

    @Test
    fun aClientWithNoTripsAtAllGetsNoLine() {
        assertNull(
            rosterTripLine(
                client(
                    lastTitle = null, lastEnd = null,
                    nextTitle = null, nextStart = null, nextStatus = null,
                ),
            ),
        )
    }

    // ── Money ────────────────────────────────────────────────────────────────

    @Test
    fun aClientWithNothingCommittedGetsNoFigureRatherThanZero() {
        // The accessor returns a NULL currency for exactly that case. A labelled $0 claims
        // they have spent nothing, where the truth is that nothing has been booked yet.
        val row = rosterRowUi(client(lifetimeCents = null, currency = null, currencyCount = 0), ::money)
        assertNull(row.lifetimeLabel)
        assertFalse(row.lifetimeExcludesACurrency)
    }

    @Test
    fun aZeroWithACurrencyIsStillNoFigure() {
        val row = rosterRowUi(client(lifetimeCents = 0L), ::money)
        assertNull(row.lifetimeLabel)
    }

    @Test
    fun aRowThatExcludedACurrencyIsMarked() {
        val row = rosterRowUi(client(currencyCount = 2), ::money)
        assertEquals("USD 1976500", row.lifetimeLabel)
        assertTrue(row.lifetimeExcludesACurrency)
    }

    // ── The row's second line ────────────────────────────────────────────────

    @Test
    fun theContactLineFallsBackEmailThenPhoneThenTheStandInSentence() {
        assertEquals("jordan.hayes@example.com", rosterRowUi(client(), ::money).contactLine)
        assertEquals("+1-555-0142", rosterRowUi(client(email = null), ::money).contactLine)
        assertEquals(
            ClientCopy.NO_EMAIL,
            rosterRowUi(client(email = null, phone = null), ::money).contactLine,
        )
    }

    // ── The header ───────────────────────────────────────────────────────────

    @Test
    fun theSubtitleSingularisesOneLeadAndDropsZero() {
        assertEquals("27 active · 5 in motion · 1 lead to qualify.", rosterSubtitle(27, 5, 1))
        assertEquals("27 active · 5 in motion · 4 leads to qualify.", rosterSubtitle(27, 5, 4))
        assertEquals("27 active · 5 in motion.", rosterSubtitle(27, 5, 0))
    }

    @Test
    fun theCurrencyNoteFiresOnlyWhenARowActuallyLeftOneOut() {
        assertNull(rosterCurrencyNote(0))
        assertEquals(ClientCopy.CURRENCY_NOTE_ONE, rosterCurrencyNote(1))
        assertTrue(rosterCurrencyNote(3)!!.startsWith("3 clients"))
    }

    // ── The whole state ──────────────────────────────────────────────────────

    private fun snapshot(rows: List<RosterClient>, total: Int) = ClientRosterSnapshot(
        rows = rows,
        total = total,
        summary = ClientRosterSummary(
            activeCount = 27, inMotionCount = 5, inquiryCount = 1, archivedCount = 2,
        ),
    )

    @Test
    fun hasMoreIsTrueOnlyWhileTheListIsAPrefixOfTheBook() {
        assertTrue(clientRosterUiState(snapshot(listOf(client()), total = 27), ::money).hasMore)
        assertFalse(clientRosterUiState(snapshot(listOf(client()), total = 1), ::money).hasMore)
        assertFalse(clientRosterUiState(snapshot(emptyList(), total = 0), ::money).hasMore)
    }

    @Test
    fun theStateCarriesTheHeaderAndTheNoteTogether() {
        val ui = clientRosterUiState(
            snapshot(listOf(client(currencyCount = 2), client()), total = 2),
            ::money,
        )
        assertEquals("27 active · 5 in motion · 1 lead to qualify.", ui.subtitle)
        assertEquals(ClientCopy.CURRENCY_NOTE_ONE, ui.currencyNote)
        assertEquals(2, ui.archivedCount)
    }

    @Test
    fun anEmptyBookIsAStateRatherThanAnAbsence() {
        val ui = clientRosterUiState(snapshot(emptyList(), total = 0), ::money)
        assertEquals(emptyList(), ui.rows)
        assertEquals(0, ui.total)
        assertNull(ui.currencyNote)
    }

    // ── The status chips ─────────────────────────────────────────────────────

    @Test
    fun the_status_chips_are_label_then_value_and_the_values_are_the_enum() {
        // This shipped INVERTED and an emulator run caught it: the chip rendered the enum
        // value as its text and sent the human label back as the filter, which
        // `client_status` has no member for. Both halves are silent — the chip merely looks
        // unstyled, and the read fails only once tapped. So both halves are asserted.
        assertEquals(
            listOf(ClientCopy.FILTER_ACTIVE, ClientCopy.FILTER_ARCHIVED),
            ROSTER_STATUS_OPTIONS.map { it.first },
        )
        assertEquals(listOf("active", "archived"), ROSTER_STATUS_OPTIONS.map { it.second })
        // The values are what `agent_client_roster(p_status => …)` casts to client_status.
        // 'merged_into' is a legal member of that enum and must NOT be offered: the accessor
        // excludes tombstones unconditionally, so a chip for it would return nothing.
        for ((_, value) in ROSTER_STATUS_OPTIONS) {
            assertTrue(value == value.lowercase(), "$value is not the enum spelling")
            assertTrue(value != "merged_into", "merged_into is not a filter a roster can offer")
        }
    }

    // ── The bar ──────────────────────────────────────────────────────────────

    @Test
    fun clientsIsBuiltAndIsTheSecondTabOnTheBar() {
        // §6.6's four, in order, with two of them now built. The screen reads its own title
        // off this registry, so a rename here moves both ends at once.
        val clients = AGENT_BAR_DESTINATIONS.first { it.id == "clients" }
        assertTrue(clients.built)
        assertNull(clients.phase)
        assertEquals("Clients", clients.label)
        assertEquals(listOf("worklist", "clients"), AGENT_BAR_DESTINATIONS.filter { it.built }.map { it.id })
    }
}
