package com.storytail.adventures.domain.agent

import com.storytail.adventures.api.parseAgentSettings
import com.storytail.adventures.api.scheduleJson
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.jsonObject
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

/**
 * §3.12 on the phone (PR 4). The vectors are the web's (`web/lib/agent/settingsRules.test.ts`)
 * where the rule is shared, so the phone says the same sentence before the round trip as the
 * function says after it.
 */
class AgentSettingsTest {

    @Test
    fun phoneNumbersAsTheFunctionReadsThem() {
        assertNull(phoneProblem(""))
        assertNull(phoneProblem("+1 (312) 555-0100"))
        assertEquals("That phone number doesn't look right. Use digits, spaces, + - ( ) or .", phoneProblem("call me"))
        assertEquals("That phone number doesn't look right. Use digits, spaces, + - ( ) or .", phoneProblem("555-01"))
    }

    @Test
    fun theProfileNeedsAName() {
        assertEquals("Add the name clients will see.", profileProblem(AgentProfileSettings(displayName = "  ")))
        assertNull(profileProblem(AgentProfileSettings(displayName = "Gyasi Story")))
    }

    @Test
    fun timeAwayDates() {
        val today = "2026-10-17"
        assertEquals("Pick the first day away.", timeOffProblem("", "2026-10-20", today))
        assertEquals("Pick the last day away.", timeOffProblem("2026-10-20", "2026-02-30", today))
        assertEquals("The last day away can't be before the first.", timeOffProblem("2026-10-20", "2026-10-19", today))
        assertEquals("Time away can start today or later.", timeOffProblem("2026-10-16", "2026-10-20", today))
        assertEquals("Time away can be up to a year. Check the dates.", timeOffProblem("2026-10-17", "2027-10-18", today))
        assertNull(timeOffProblem("2026-10-17", "2026-10-17", today))
    }

    @Test
    fun theAutoReplyKnowsOneField() {
        assertNull(autoReplyProblem(true, DEFAULT_AUTO_REPLY))
        assertNull(autoReplyProblem(false, ""))
        assertEquals("Add the words for your automatic reply, or turn it off.", autoReplyProblem(true, "  "))
        assertEquals("We don't have a {{agent.name}} field. You can use {{return_date}}.", autoReplyProblem(true, "Hi {{agent.name}}"))
        assertEquals(
            "Thanks! Back on Monday, July 6.",
            autoReplyFilled("Thanks! Back on {{ return_date }}.", "2026-07-05"),
        )
    }

    @Test
    fun timesAndDatesReadTheWebsWay() {
        assertEquals("7am", timeLabel("07:00"))
        assertEquals("9:30pm", timeLabel("21:30"))
        assertEquals("noon", timeLabel("12:00"))
        assertEquals("midnight", timeLabel("24:00"))
        assertEquals("Jul 4 – Jul 7", dateRangeLabel("2026-07-04", "2026-07-07", "2026-06-01"))
        assertEquals("Jul 4", dateRangeLabel("2026-07-04", "2026-07-04", "2026-06-01"))
        assertEquals("Dec 24 – Jan 2, 2027", dateRangeLabel("2026-12-24", "2027-01-02", "2026-10-17"))
        assertEquals("Monday, July 6", returnDateLabel("2026-07-05"))
        assertEquals(TimeOffPhase.RUNNING, timeOffPhase("2026-10-15", "2026-10-17", "2026-10-17"))
        assertEquals(TimeOffPhase.UPCOMING, timeOffPhase("2026-10-18", "2026-10-20", "2026-10-17"))
        assertEquals(TimeOffPhase.PAST, timeOffPhase("2026-10-10", "2026-10-16", "2026-10-17"))
        assertEquals(48, HALF_HOURS.size - 1)
        assertEquals("23:30", START_TIMES.last())
        assertEquals("24:00", END_TIMES.last())
    }

    @Test
    fun theScheduleOrderIsChecked() {
        assertNull(scheduleProblem(DEFAULT_WEEKLY_SCHEDULE))
        val bad = DEFAULT_WEEKLY_SCHEDULE + (Weekday.TUE to DayHours("21:00", "07:00"))
        assertEquals("Tuesday's hours have to end after they start.", scheduleProblem(bad))
    }

    @Test
    fun thePhotoIsAPathOnOurOwnOrigin() {
        val path = "/storage/v1/object/public/agent-avatars/0195a2c0-1a00-7000-8000-000000000001/0195a2c0-1a00-7000-8000-000000000002.jpg"
        assertEquals("http://10.0.2.2:54321$path", avatarUrlFor(path, "http://10.0.2.2:54321/"))
        // Anything that is not one of ours is refused rather than loaded.
        assertNull(avatarUrlFor("https://evil.example/x.jpg", "http://10.0.2.2:54321"))
        assertNull(avatarUrlFor("http://kong:8000$path", "http://10.0.2.2:54321"))
        assertNull(avatarUrlFor("/storage/v1/object/public/agent-avatars/../secret", "http://10.0.2.2:54321"))
        assertNull(avatarUrlFor(null, "http://10.0.2.2:54321"))
        assertEquals("GS", advisorInitials("Gyasi  Story"))
        assertEquals("?", advisorInitials(" "))
    }

    @Test
    fun theScheduleGoesOutAsSevenDays() {
        val out = scheduleJson(DEFAULT_WEEKLY_SCHEDULE)
        assertEquals(setOf("mon", "tue", "wed", "thu", "fri", "sat", "sun"), out.keys)
        assertEquals(JsonNull, out["sun"])
        assertEquals("""{"start":"07:00","end":"21:00"}""", out["mon"].toString())
    }

    @Test
    fun theReadParsesAndFallsBack() {
        val row = Json.parseToJsonElement(
            """
            {"profile":{"displayName":"Gyasi Story","pronouns":"he/him","email":"g@example.com","phone":null,"bio":"Hi",
              "avatarUrl":"/storage/v1/object/public/agent-avatars/a/b.jpg",
              "socialLinks":{"instagram":"https://instagram.com/gyasi","website":""}},
             "availability":{"timeZone":"America/New_York",
               "weeklySchedule":{"mon":{"start":"08:00","end":"17:30"},"tue":null,"wed":null,"thu":null,"fri":null,"sat":null,"sun":null},
               "responseTimeHours":4},
             "notifications":{"clientMessages":{"push":false,"email":true},"quoteRequests":{"push":true,"email":false}},
             "today":"2026-10-17",
             "timeOff":[{"id":"0195a2c0-1a00-7000-8000-000000000009","startsOn":"2026-10-20","endsOn":"2026-10-24",
               "label":null,"autoReplyEnabled":true,"autoReplyText":"Away"}]}
            """.trimIndent(),
        ).jsonObject
        val s = parseAgentSettings(row)
        assertEquals("Gyasi Story", s.profile.displayName)
        assertEquals("", s.profile.phone)
        assertEquals(mapOf(SocialNetwork.INSTAGRAM to "https://instagram.com/gyasi"), s.profile.socialLinks)
        assertEquals("America/New_York", s.availability.timeZone)
        assertEquals(DayHours("08:00", "17:30"), s.availability.weeklySchedule[Weekday.MON])
        assertNull(s.availability.weeklySchedule[Weekday.SUN])
        assertEquals(4, s.availability.responseTimeHours)
        assertEquals(AgentNotificationSettings(false, true, true, false), s.notifications)
        assertEquals(1, s.availability.timeOff.size)
        assertEquals(true, s.availability.timeOff[0].autoReplyEnabled)

        // An older read without the PR 2 keys and with a schedule that does not parse: the defaults.
        val old = parseAgentSettings(
            Json.parseToJsonElement("""{"profile":{"displayName":"G"},"availability":{"weeklySchedule":{"mon":null}}}""").jsonObject,
        )
        assertEquals(DEFAULT_WEEKLY_SCHEDULE, old.availability.weeklySchedule)
        assertEquals(AgentNotificationSettings(), old.notifications)
        assertEquals(24, old.availability.responseTimeHours)
    }
}
