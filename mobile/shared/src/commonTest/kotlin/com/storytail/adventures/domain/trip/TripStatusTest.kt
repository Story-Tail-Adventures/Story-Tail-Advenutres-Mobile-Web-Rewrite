package com.storytail.adventures.domain.trip

import kotlinx.datetime.LocalDate
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * The TypeScript twin of these cases is `web/lib/trips/status.test.ts`. They are kept in
 * step by hand — check_copy_parity.py compares the label strings, not the behaviour — so a
 * case added there should be added here.
 *
 * The derivation is the reason this file exists at all: two of the seven labels a client
 * sees are not stored anywhere, so "Booked" quietly becoming "Final payment due" is a rule
 * that can drift between the two stacks without anything failing to compile.
 */
class TripStatusTest {

    private val today = LocalDate(2026, 9, 7)

    @Test
    fun `maps each of the six stored statuses to a chip and a label`() {
        val cases = listOf(
            Triple(TripStatus.INQUIRY, StatusChip.INQUIRY, "Inquiry"),
            Triple(TripStatus.PROPOSAL, StatusChip.PROPOSAL, "Proposal ready"),
            Triple(TripStatus.BOOKED, StatusChip.BOOKED, "Booked"),
            Triple(TripStatus.IN_PROGRESS, StatusChip.TRAVELING, "Traveling now"),
            Triple(TripStatus.COMPLETED, StatusChip.PAST, "Past trip"),
            Triple(TripStatus.CANCELLED, StatusChip.CANCELLED, "Cancelled"),
        )
        for ((status, chip, label) in cases) {
            assertEquals(TripStatusPresentation(chip, label), tripStatusPresentation(status, today))
        }
    }

    @Test
    fun `covers every value of the enum, so a new status cannot be forgotten`() {
        for (status in TripStatus.entries) {
            val out = tripStatusPresentation(status, today)
            assertTrue(out.label.isNotBlank(), "no label for $status")
        }
    }

    @Test
    fun `fromWire round-trips every value and degrades on an unknown one`() {
        for (status in TripStatus.entries) {
            assertEquals(status, TripStatus.fromWire(status.wire))
        }
        // A status added server-side should render no chip, not crash a trip list.
        assertNull(TripStatus.fromWire("refunded"))
        assertNull(TripStatus.fromWire(null))
    }

    @Test
    fun `final payment due overrides Booked when a milestone is inside the window`() {
        val out = tripStatusPresentation(
            TripStatus.BOOKED,
            today,
            nextUnpaidDueDate = LocalDate(2026, 9, 14), // 7 days out
        )
        assertEquals(TripStatusPresentation(StatusChip.DUE, "Final payment due"), out)
    }

    @Test
    fun `the due window is inclusive at its boundary`() {
        assertEquals(
            StatusChip.DUE,
            tripStatusPresentation(TripStatus.BOOKED, today, LocalDate(2026, 9, 21)).chip,
        )
        assertEquals(
            StatusChip.BOOKED,
            tripStatusPresentation(TripStatus.BOOKED, today, LocalDate(2026, 9, 22)).chip,
        )
    }

    @Test
    fun `an overdue milestone is due, not less urgent`() {
        assertEquals(
            StatusChip.DUE,
            tripStatusPresentation(TripStatus.BOOKED, today, LocalDate(2026, 8, 1)).chip,
        )
    }

    @Test
    fun `no milestone means no override`() {
        assertEquals(StatusChip.BOOKED, tripStatusPresentation(TripStatus.BOOKED, today, null).chip)
    }

    @Test
    fun `a cancelled trip with money outstanding still reads as cancelled`() {
        // The refund line on Screen 2.2.10 speaks to the money; the chip says cancelled.
        val out = tripStatusPresentation(TripStatus.CANCELLED, today, LocalDate(2026, 9, 8))
        assertEquals(TripStatusPresentation(StatusChip.CANCELLED, "Cancelled"), out)
    }

    @Test
    fun `completed and in-progress are not overridden either`() {
        assertEquals(
            StatusChip.PAST,
            tripStatusPresentation(TripStatus.COMPLETED, today, LocalDate(2026, 9, 8)).chip,
        )
        assertEquals(
            StatusChip.TRAVELING,
            tripStatusPresentation(TripStatus.IN_PROGRESS, today, LocalDate(2026, 9, 8)).chip,
        )
    }

    @Test
    fun `daysUntilDeparture counts whole days`() {
        assertEquals(100, daysUntilDeparture(LocalDate(2026, 12, 16), today))
        assertEquals(1, daysUntilDeparture(LocalDate(2026, 9, 8), today))
    }

    @Test
    fun `daysUntilDeparture is null with no date and null once departure has passed`() {
        assertNull(daysUntilDeparture(null, today))
        assertNull(daysUntilDeparture(LocalDate(2026, 9, 6), today))
    }

    @Test
    fun `daysUntilDeparture is zero, not null, on the day of departure`() {
        assertEquals(0, daysUntilDeparture(today, today))
    }
}
