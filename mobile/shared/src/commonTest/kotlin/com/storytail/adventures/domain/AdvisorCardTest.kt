package com.storytail.adventures.domain

import com.storytail.adventures.api.ThreadMessageView
import com.storytail.adventures.domain.trip.MessageSender
import com.storytail.adventures.domain.trip.advisorAwayLabel
import com.storytail.adventures.domain.trip.advisorReplyLabel
import com.storytail.adventures.domain.trip.parseAdvisorCard
import com.storytail.adventures.ui.components.client.clientBubbleMeta
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

/** §3.12 PR 3 on the phone: the same labels and refusals as `web/lib/client/advisorCard.test.ts`. */
class AdvisorCardTest {

    @Test
    fun theReplyPromise() {
        assertEquals("Usually replies within 2 hours", advisorReplyLabel(2))
        assertEquals("Usually replies within 12 hours", advisorReplyLabel(12))
        assertEquals("Usually replies within a day", advisorReplyLabel(24))
        assertEquals("Usually replies within 2 days", advisorReplyLabel(48))
        assertEquals("Usually replies within a day", advisorReplyLabel(null))
    }

    @Test
    fun awayUntilIsTheFirstDayBack() {
        assertEquals("Away until Tuesday, October 20", advisorAwayLabel("2026-10-20"))
        assertNull(advisorAwayLabel(null))
        assertNull(advisorAwayLabel("2026-02-30"))
        assertNull(advisorAwayLabel("soon"))
    }

    @Test
    fun theCardKeepsOnlyHttpsLinksAndPrefersAway() {
        val card = parseAdvisorCard(
            Json.parseToJsonElement(
                """
                {"displayName":"Gyasi Story","firstName":"Gyasi","pronouns":"he/him","bio":"  ","avatarPath":null,
                 "socialLinks":{"website":"https://story-tail.com","instagram":"http://instagram.com/x","facebook":"javascript:alert(1)"},
                 "responseTimeHours":4,"awayUntil":"2026-10-20"}
                """.trimIndent(),
            ).jsonObject,
        )
        assertEquals("Gyasi", card.firstName)
        assertEquals("GS", card.initials)
        assertNull(card.bio)
        assertEquals(listOf("Website"), card.links.map { it.label })
        assertEquals("Usually replies within 4 hours", card.replyLabel)
        assertEquals("Away until Tuesday, October 20", card.statusLine)

        val home = parseAdvisorCard(Json.parseToJsonElement("""{"displayName":"Gyasi Story","responseTimeHours":48}""").jsonObject)
        assertEquals("Usually replies within 2 days", home.statusLine)
    }

    @Test
    fun theClientSeesTheTagOnlyOnTheAdvisorsAutoReply() {
        fun m(sender: MessageSender, auto: Boolean) =
            ThreadMessageView("m", sender, "hi", "2026-10-17T14:00:00+00:00", emptyList(), autoReply = auto)
        assertEquals("2:00 PM · Automatic reply", clientBubbleMeta("2:00 PM", m(MessageSender.AGENT, true)))
        assertEquals("2:00 PM", clientBubbleMeta("2:00 PM", m(MessageSender.AGENT, false)))
        assertEquals("2:00 PM", clientBubbleMeta("2:00 PM", m(MessageSender.CLIENT, true)))
    }
}
