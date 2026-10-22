package com.storytail.adventures.agent

import com.storytail.adventures.api.AgentThreadMessage
import com.storytail.adventures.ui.screens.agent.bubbleMeta
import kotlin.test.Test
import kotlin.test.assertEquals

/** §3.10 Stage 4: the "Emailed" and "By email" marks, worded as the web's (copy parity). */
class AgentEmailMarkTest {
    private fun message(fromAgent: Boolean, emailed: Boolean = false, byEmail: Boolean = false, autoReply: Boolean = false) =
        AgentThreadMessage(
            id = "m",
            fromAgent = fromAgent,
            body = "hi",
            createdAt = "2026-10-16T14:00:00.123456+00:00",
            internalNote = false,
            attachmentNames = emptyList(),
            emailed = emailed,
            byEmail = byEmail,
            autoReply = autoReply,
        )

    @Test
    fun anOutOfOfficeReplySaysAutomaticReplyBeforeEmailed() {
        // §3.12.2, the web's order: the tag, then the email mark (an auto-reply is emailed too).
        assertEquals(
            "9:05 AM · Automatic reply · Emailed",
            bubbleMeta("9:05 AM", message(fromAgent = true, autoReply = true, emailed = true)),
        )
        assertEquals("9:05 AM · Automatic reply", bubbleMeta("9:05 AM", message(fromAgent = true, autoReply = true)))
        // Only ever the advisor's side.
        assertEquals("9:05 AM", bubbleMeta("9:05 AM", message(fromAgent = false, autoReply = true)))
    }

    @Test
    fun aReplyAnEmailCarriedSaysEmailed() {
        assertEquals("9:05 AM · Emailed", bubbleMeta("9:05 AM", message(fromAgent = true, emailed = true)))
    }

    @Test
    fun aClientMessageThatCameByEmailSaysSo() {
        assertEquals("9:05 AM · By email", bubbleMeta("9:05 AM", message(fromAgent = false, byEmail = true)))
    }

    @Test
    fun otherwiseJustTheTime() {
        assertEquals("9:05 AM", bubbleMeta("9:05 AM", message(fromAgent = true)))
        assertEquals("9:05 AM", bubbleMeta("9:05 AM", message(fromAgent = false)))
        // The flags only mean something on their own side.
        assertEquals("9:05 AM", bubbleMeta("9:05 AM", message(fromAgent = false, emailed = true)))
    }
}

/**
 * The thread read's decode contract for §3.10 Stage 4's two columns, with supabase-kt's own
 * defaults (ignoreUnknownKeys, explicitNulls). A null `emailed_at` is "not emailed"; a MISSING
 * key fails the decode, so a misspelt column cannot silently read as "never emailed".
 */
class AgentThreadMessageDecodeTest {
    private val json = kotlinx.serialization.json.Json { ignoreUnknownKeys = true }
    private fun row(extra: String, autoReply: String = ""","is_auto_reply":false""") =
        """{"message_id":"m","sender_role":"agent","body":"hi","is_internal_note":false,""" +
            """"created_at":"2026-10-16T14:00:00.123456+00:00","attachments":[],"total_messages":1$extra$autoReply}"""

    @Test
    fun anEmailedReplyAndAByEmailClientMessageMap() {
        val emailed = json.decodeFromString<com.storytail.adventures.api.ConversationMessageDto>(
            row(""","emailed_at":"2026-10-16T14:05:00+00:00","channel":"app""""),
        ).toDomain()
        assertEquals(true, emailed.emailed)
        assertEquals(false, emailed.byEmail)
        val byEmail = json.decodeFromString<com.storytail.adventures.api.ConversationMessageDto>(
            row(""","emailed_at":null,"channel":"email""""),
        ).toDomain()
        assertEquals(false, byEmail.emailed)
        assertEquals(true, byEmail.byEmail)
        assertEquals(false, byEmail.autoReply)
        // §3.12.2: the advisor's out-of-office reply.
        val auto = json.decodeFromString<com.storytail.adventures.api.ConversationMessageDto>(
            row(""","emailed_at":null,"channel":"app"""", ""","is_auto_reply":true"""),
        ).toDomain()
        assertEquals(true, auto.autoReply)
    }

    @Test
    fun aMissingColumnFailsLoudly() {
        kotlin.test.assertFailsWith<kotlinx.serialization.SerializationException> {
            json.decodeFromString<com.storytail.adventures.api.ConversationMessageDto>(row(""","channel":"app""""))
        }
        kotlin.test.assertFailsWith<kotlinx.serialization.SerializationException> {
            json.decodeFromString<com.storytail.adventures.api.ConversationMessageDto>(row(""","emailed_at":null"""))
        }
        kotlin.test.assertFailsWith<kotlinx.serialization.SerializationException> {
            json.decodeFromString<com.storytail.adventures.api.ConversationMessageDto>(row(""","emailed_at":null,"channel":"app"""", ""))
        }
    }
}
