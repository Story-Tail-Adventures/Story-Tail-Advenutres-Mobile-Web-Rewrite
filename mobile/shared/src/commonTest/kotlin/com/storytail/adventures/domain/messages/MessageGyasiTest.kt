package com.storytail.adventures.domain.messages

import com.storytail.adventures.api.LeadAbout
import com.storytail.adventures.api.LeadMessageInput
import com.storytail.adventures.api.SupabaseLeadMessageRepository
import com.storytail.adventures.content.public.PublicCatalog
import com.storytail.adventures.content.public.Topic
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Screen 2.0.12 on the phone (§3.8, BRD §6.5, 2026-10-21). Pinned: what the visitor was viewing
 * is rebuilt from the catalog (an unknown slug is dropped), the body is the shape `lead-message`
 * reads with `page` "app" and an empty hidden field, and the three required fields gate Send.
 */
class MessageGyasiTest {
    @Test
    fun aboutComesFromTheCatalogOnly() {
        val trip = PublicCatalog.TRIPS.first()
        assertEquals(LeadAbout("trip", trip.slug, trip.name), leadAbout(trip.slug, Topic.CRUISES))
        assertEquals(LeadAbout("topic", "honeymoons", "a honeymoon"), leadAbout("not-a-trip", Topic.HONEYMOONS))
        assertNull(leadAbout("not-a-trip", null))
        assertNull(leadAbout(null, null))
    }

    @Test
    fun theBodyIsWhatLeadMessageReads() {
        val body = SupabaseLeadMessageRepository.body(
            LeadMessageInput("Dana", "", "dana@example.com", "", "Hi", LeadAbout("topic", "cruises", "a cruise"), 1234L),
        )
        assertEquals("app", body["page"]?.jsonPrimitive?.content)
        assertEquals("", body["website"]?.jsonPrimitive?.content)
        assertEquals("1234", body["startedAt"]?.jsonPrimitive?.content)
        assertEquals("cruises", body["about"]?.jsonObject?.get("slug")?.jsonPrimitive?.content)
        val noAbout = SupabaseLeadMessageRepository.body(
            LeadMessageInput("Dana", "", "dana@example.com", "", "Hi", null, 1L),
        )
        assertNull(noAbout["about"])
    }

    @Test
    fun sendWaitsForTheThreeRequiredFields() {
        assertTrue(messageFormReady("Dana", "dana@example.com", "Hi"))
        assertFalse(messageFormReady(" ", "dana@example.com", "Hi"))
        assertFalse(messageFormReady("Dana", "not-an-email", "Hi"))
        assertFalse(messageFormReady("Dana", "dana@example.com", " "))
        assertFalse(messageFormReady("Dana", "dana@example.com", "x".repeat(2001)))
    }

    @Test
    fun theReplyPromiseIsTheSettledOne() {
        // Screen Inventory 2.6's note of 2026-09-10: "Usually replies the same day", no other.
        assertTrue(MessageGyasiCopy.BODY.contains("usually replies the same day"))
        assertTrue(MessageGyasiCopy.SENT_BODY.contains("usually replies the same day"))
    }
}
