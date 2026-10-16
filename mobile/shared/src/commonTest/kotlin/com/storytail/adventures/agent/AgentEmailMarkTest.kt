package com.storytail.adventures.agent

import com.storytail.adventures.api.AgentThreadMessage
import com.storytail.adventures.ui.screens.agent.bubbleMeta
import kotlin.test.Test
import kotlin.test.assertEquals

/** §3.10 Stage 4: the "Emailed" and "By email" marks, worded as the web's (copy parity). */
class AgentEmailMarkTest {
    private fun message(fromAgent: Boolean, emailed: Boolean = false, byEmail: Boolean = false) =
        AgentThreadMessage(
            id = "m",
            fromAgent = fromAgent,
            body = "hi",
            createdAt = "2026-10-16T14:00:00.123456+00:00",
            internalNote = false,
            attachmentNames = emptyList(),
            emailed = emailed,
            byEmail = byEmail,
        )

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
