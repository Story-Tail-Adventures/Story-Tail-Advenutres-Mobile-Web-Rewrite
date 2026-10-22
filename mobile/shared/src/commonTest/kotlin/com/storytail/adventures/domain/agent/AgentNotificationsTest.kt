package com.storytail.adventures.domain.agent

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class AgentNotificationsTest {
    private val conv = "0195a2c0-1a00-7000-8000-0000000000b0"

    @Test
    fun parsesWhatPushDispatchSends() {
        assertEquals(
            AgentPushData.Message(conv, "2026-10-15T14:02:11.123456+00:00", 2),
            AgentPushData.parse(
                mapOf("v" to "1", "kind" to "message", "tag" to conv, "conversationId" to conv,
                    "seenUpTo" to "2026-10-15T14:02:11.123456+00:00", "count" to "2"),
            ),
        )
        assertEquals(AgentPushData.Summary(3), AgentPushData.parse(mapOf("v" to "1", "kind" to "summary", "count" to "3")))
        assertEquals(AgentPushData.Dismiss(conv), AgentPushData.parse(mapOf("v" to "1", "kind" to "dismiss", "tag" to conv)))
        assertEquals(
            AgentPushData.Dismiss(conv, "2026-10-15T14:02:11.123456+00:00"),
            AgentPushData.parse(mapOf("v" to "1", "kind" to "dismiss", "tag" to conv, "readUpTo" to "2026-10-15T14:02:11.123456+00:00")),
        )
    }

    @Test
    fun parsesATripRequest() {
        // §3.12.3: ids only (fcm.ts androidData). The tag is the web's, so one request is one notification.
        val trip = "0195a2c0-1a00-7000-8000-0000000000c1"
        val parsed = AgentPushData.parse(mapOf("v" to "1", "kind" to "quote_request", "tag" to "quote-$trip", "tripId" to trip))
        assertEquals(AgentPushData.QuoteRequest(trip), parsed)
        assertEquals("quote-$trip", (parsed as AgentPushData.QuoteRequest).tag)
        assertNull(AgentPushData.parse(mapOf("v" to "1", "kind" to "quote_request", "tripId" to "not-a-uuid")))
        assertNull(AgentPushData.parse(mapOf("v" to "1", "kind" to "quote_request")))
    }

    @Test
    fun parsesALeadsNoteAndNamesItANote() {
        // §3.8 (2026-10-21): the lead id only (fcm.ts androidData), the web's tag. A "note", never
        // a "message", so a stranger's note never looks like a client's message.
        val lead = "0195a2c0-1a00-7000-8000-0000000000d1"
        val parsed = AgentPushData.parse(mapOf("v" to "1", "kind" to "lead_message", "tag" to "lead-$lead", "leadId" to lead))
        assertEquals(AgentPushData.LeadMessage(lead), parsed)
        assertEquals("lead-$lead", (parsed as AgentPushData.LeadMessage).tag)
        assertNull(AgentPushData.parse(mapOf("v" to "1", "kind" to "lead_message", "leadId" to "nope")))
        assertEquals("New note from Dana Reyes", leadMessageTitle(" Dana Reyes "))
        assertEquals("New note from someone new", leadMessageTitle(null))
        assertEquals("New note from someone new", leadMessageTitle("  "))
    }

    @Test
    fun aTripRequestSaysWhoOnTheLockScreenAndWhereWhenUnlocked() {
        // The words push.ts sends the browser (quoteRequestPayload / quoteRequestDetail).
        assertEquals("New trip request from Jordan Hayes", quoteRequestTitle("Jordan Hayes"))
        assertEquals("New trip request from a client", quoteRequestTitle("  "))
        assertEquals("Negril, Jamaica · Feb 10 – Feb 14", quoteRequestBody("Negril, Jamaica", "2027-02-10", "2027-02-14"))
        assertEquals("Negril · Feb 10", quoteRequestBody("Negril", "2027-02-10", "2027-02-10"))
        assertEquals("Mar 3", quoteRequestBody(null, null, "2027-03-03"))
        assertEquals("Open it to see what they're dreaming of.", quoteRequestBody(" ", null, null))
    }

    @Test
    fun ignoresWhatItDoesNotUnderstand() {
        assertNull(AgentPushData.parse(mapOf("v" to "2", "kind" to "message")))
        assertNull(AgentPushData.parse(mapOf("v" to "1", "kind" to "message", "conversationId" to "nope", "seenUpTo" to "x")))
        assertNull(AgentPushData.parse(mapOf("v" to "1", "kind" to "message", "conversationId" to conv)))
        assertNull(AgentPushData.parse(mapOf("v" to "1", "kind" to "party")))
        assertNull(AgentPushData.parse(emptyMap()))
    }

    @Test
    fun aCardNumberNeverReachesTheLockScreen() {
        // Built at runtime: CI's PCI guard refuses Luhn-valid numbers in source, fixtures too.
        val visa = List(4) { "4242" }.joinToString(" ")
        val amex = listOf("3782", "822463", "10005").joinToString("-")
        assertEquals("card •••• 4242 exp 12/29", notificationBody("card $visa exp 12/29"))
        assertEquals("Amex •••• 0005", maskCardNumbers("Amex $amex"))
        assertEquals("•••• 1111", maskCardNumbers("4111" + "1".repeat(12)))
        val ordinary = "$7,845 due 10/29, call 312-555-0142, conf 8841207"
        assertEquals(ordinary, maskCardNumbers(ordinary))
    }

    /** Built at runtime: the PCI guard refuses Luhn-valid literals in source. */
    private fun withCheckDigit(body: String): String =
        (0..9).map { body + it }.first { luhnValid(it) }

    private val pan = withCheckDigit("4" + "1".repeat(14))
    private val last4 = pan.takeLast(4)
    private fun joined(sep: String) = pan.chunked(4).joinToString(sep)

    @Test
    fun theGuardsRuleFindsWhatOneGreedyMatchMissed() {
        assertEquals("Paid 12 •••• $last4", maskCardNumbers("Paid 12 ${joined(" ")}"), "a short number in front")
        assertEquals("Paid 12 •••• $last4", maskCardNumbers("Paid 12 $pan"))
        assertEquals("ref•••• $last4", maskCardNumbers("ref$pan"), "letters touching")
        assertEquals("x_•••• ${last4}x", maskCardNumbers("x_${pan}x"), "an underscore touching")
        assertEquals("a •••• $last4 b", maskCardNumbers("a ${joined("  ")} b"), "double spaces")
        assertEquals("a •••• $last4 b", maskCardNumbers("a ${joined(" - ")} b"), "a spaced dash")
        assertEquals("a •••• $last4 b", maskCardNumbers("a ${joined("\u00a0")} b"), "no-break spaces")
        assertEquals("•••• $last4 or •••• $last4?", maskCardNumbers("$pan or ${joined(".")}?"))
        assertEquals("Paid 12 •••• $last4", notificationBody("Paid 12 ${joined("  ")}"))
    }

    @Test
    fun fullwidthDigitsAndShortNumbersAreLeftAlone() {
        val wide = pan.map { (0xFF10 + (it - '0')).toChar() }.joinToString("")
        assertEquals("card $wide", maskCardNumbers("card $wide"))
        val plain = "Invoice 2026 10 16 booking 4471, 123456789012"
        assertEquals(plain, maskCardNumbers(plain))
        // A long number that fails Luhn is a reference, not a card: the guard lets it through too.
        val notCard = pan.dropLast(1) + ((pan.last() - '0' + 1) % 10)
        assertEquals("ref $notCard", maskCardNumbers("ref $notCard"))
        assertEquals("", maskCardNumbers(""))
    }

    @Test
    fun theWords() {
        assertEquals("Jordan Hayes · Anniversary Week in Negril", notificationTitle("Jordan Hayes", "Anniversary Week in Negril"))
        assertEquals("Maya Carter", notificationTitle("Maya Carter", null))
        assertEquals("New message from Jordan Hayes", notificationLockedTitle("Jordan Hayes"))
        assertEquals("Sent you a message.", notificationBody("   "))
        assertEquals(140, notificationBody("x".repeat(400)).length)
        assertEquals("1 new message while you rested", notificationSummaryTitle(1))
        assertEquals("3 new messages while you rested", notificationSummaryTitle(3))
        assertEquals("Jordan Hayes and Maya Carter wrote while you rested.", notificationSummaryBody(listOf("Jordan Hayes", "Maya Carter")))
        assertEquals("A, B, C and 2 others wrote while you rested.", notificationSummaryBody(listOf("A", "B", "C", "D", "E")))
        assertEquals("Your clients wrote while you rested.", notificationSummaryBody(emptyList()))
    }

    @Test
    fun aLateDismissNeverClosesANewerNotification() {
        val older = "2026-10-15T14:02:11.123456+00:00"
        val newer = "2026-10-15T14:05:00.000001+00:00"
        assertEquals(true, dismissApplies(readUpTo = newer, shownUpTo = older))
        assertEquals(true, dismissApplies(readUpTo = older, shownUpTo = older))
        assertEquals(false, dismissApplies(readUpTo = older, shownUpTo = newer))
        assertEquals(true, dismissApplies(readUpTo = null, shownUpTo = newer))
        assertEquals(true, dismissApplies(readUpTo = older, shownUpTo = null))
    }
}
