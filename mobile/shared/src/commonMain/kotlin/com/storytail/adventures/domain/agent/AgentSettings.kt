package com.storytail.adventures.domain.agent

import kotlinx.datetime.DatePeriod
import kotlinx.datetime.DayOfWeek
import kotlinx.datetime.LocalDate
import kotlinx.datetime.Month
import kotlinx.datetime.plus

/**
 * §3.12 Agent Profile & Settings on the phone (PR 4): Profile, Availability and Notifications.
 * Signature stays on the web (Screen Inventory §3.12, Q10).
 *
 * PARALLEL IMPLEMENTATION of `web/lib/agent/settingsRules.ts` and `settingsCopy.ts`, which
 * themselves mirror `supabase/functions/_shared/agentSettings.ts`, the one that decides. The
 * phone checks only what it can say before a round trip (a name, a phone number, dates, the
 * auto-reply's field); everything else, the social links above all, goes to `agent-settings`,
 * whose 4xx sentence is shown as written.
 *
 * Pure, so commonTest covers it.
 */

// ── Words ────────────────────────────────────────────────────────────────────

/**
 * The web's SETTINGS_COPY, flattened. NOT under `check_copy_parity.py`: that script reads
 * flat top-level keys, and SETTINGS_COPY is nested by tab. Change a sentence there, change
 * it here. The phone-only words (the More tab, the web-only Signature row) have no twin.
 */
object AgentSettingsCopy {
    // The More tab (phone only: on the web this is the avatar menu).
    const val MORE_TITLE = "More"
    const val SETTINGS_GROUP = "Settings"
    const val ROLE = "Travel Advisor"
    const val ROW_PROFILE = "Profile"
    const val ROW_PROFILE_SUB = "Photo, name, bio and links"
    const val ROW_AVAILABILITY = "Availability"
    const val ROW_AVAILABILITY_SUB = "Working hours, reply time and time away"
    const val ROW_NOTIFICATIONS = "Notifications"
    const val ROW_NOTIFICATIONS_SUB = "When and how you hear from us"
    const val ROW_SIGNATURE = "Email signature"
    const val ROW_SIGNATURE_WEB = "Edit your signature on the web."
    const val ACCOUNT_GROUP = "Account"
    const val AWAY_NOW = "Away now"

    const val SAVED = "Saved."
    const val NOTHING_CHANGED = "Nothing new to save."
    const val SAVE_FAILED = "That didn't save. Check your connection and try again."
    const val LEAVE_UNSAVED = "You have changes that aren't saved. Leave without saving?"
    const val LEAVE = "Leave"
    const val STAY = "Keep editing"
    const val LOAD_FAILED = "We couldn't load your settings just now. Try again in a moment."
    const val TRY_AGAIN = "Try again"
    const val SAVE = "Save"
    const val SAVING = "Saving…"
    const val CANCEL = "Cancel"

    // Profile (3.12.1)
    const val PROFILE_TITLE = "My profile"
    const val PROFILE_SUB = "What clients see in emails and the portal."
    const val PHOTO = "Profile photo"
    const val PHOTO_HINT = "A JPG, PNG or WebP, up to 5 MB."
    const val UPLOAD = "Upload new"
    const val REMOVE = "Remove"
    const val UPLOADING = "Uploading…"
    const val PHOTO_SAVED = "Photo updated."
    const val PHOTO_REMOVED = "Photo removed. Clients will see your initials."
    const val PHOTO_TOO_BIG = "That photo is over 5 MB. Try a smaller one."
    const val PHOTO_WRONG_TYPE = "Use a JPG, PNG or WebP photo."
    const val PHOTO_UNREADABLE = "We couldn't read that photo. Try another one."
    const val NAME = "Name"
    const val NAME_REQUIRED = "Add the name clients will see."
    const val PRONOUNS = "Pronouns"
    const val PRONOUNS_HINT = "Optional. Shown next to your name."
    const val EMAIL = "Email"
    const val EMAIL_HINT = "This is the email you sign in with, so it can't be changed here yet."
    const val PHONE = "Phone"
    const val BIO = "Bio (clients can see this)"
    const val BIO_HINT = "A few warm lines about how you plan trips. Write it the way you'd say it to a new client."
    const val LINKS = "Links"
    const val LINKS_HINT = "Paste a link or an @handle. Leave any blank to hide it."
    const val INSTAGRAM = "Instagram"
    const val FACEBOOK = "Facebook"
    const val LINKEDIN = "LinkedIn"
    const val WEBSITE = "Website"

    // Availability (3.12.2)
    const val AVAILABILITY_TITLE = "Availability"
    const val AVAILABILITY_SUB = "Your working hours, time zone and time away."
    const val HOURS_TITLE = "Working hours"
    const val HOURS_SUB = "Outside these hours you're resting, and notifications stay quiet."
    const val TIME_ZONE = "Time zone"
    const val DAY_OFF = "Off"
    const val FROM = "From"
    const val TO = "To"
    const val REPLY_TIME = "Usually replies within"
    const val REPLY_TIME_HINT = "Clients see this next to your name."
    const val AWAY_TITLE = "Out of office"
    const val AWAY_SUB = "Time to rest. Clients see when you'll be back."
    const val AWAY_EMPTY = "No time away planned."
    const val SCHEDULE = "Schedule time away"
    const val EDIT = "Edit"
    const val DELETE = "Remove"
    const val BACK = "I'm back"
    const val DIALOG_NEW = "Schedule time away"
    const val DIALOG_EDIT = "Edit time away"
    const val FIRST_DAY = "First day away"
    const val LAST_DAY = "Last day away"
    const val LABEL = "Label"
    const val LABEL_HINT = "Optional, just for you. Like \"Family trip\"."
    const val CONFIRM_DELETE = "Remove this time away?"
    const val CONFIRM_BACK = "Welcome back. End your time away now? It will show as ending yesterday."
    const val AUTO_REPLY = "Send an automatic reply"
    const val AUTO_REPLY_HINT =
        "Answers the first message in each conversation once while you're away. {{return_date}} becomes the day you're back."
    const val AUTO_REPLY_TEXT = "Automatic reply"
    const val AUTO_REPLY_ON = "Automatic reply on"

    // Notifications (3.12.3)
    const val NOTIFICATIONS_TITLE = "Notifications"
    const val NOTIFICATIONS_SUB = "When and how you hear from us."
    const val CHANNEL_EMAIL = "Email"
    const val CHANNEL_PUSH = "Push"
    const val CLIENT_MESSAGES = "Client message"
    const val CLIENT_MESSAGES_HINT = "A client writes to you."
    // Renamed 2026-10-21 (Screen Inventory 3.12.3), word for word the web's settingsCopy.
    const val QUOTE_REQUESTS = "New inquiries and messages"
    const val QUOTE_REQUESTS_HINT = "A client asks for a quote, or someone without an account writes to you."
    const val REST_TITLE = "Rest hours"
    const val REST_BODY =
        "Push stays quiet outside your working hours and while you're away, then one summary when you're back."
    const val REST_LINK = "Set your working hours"
    const val EMAIL_NOTE =
        "Alert emails go to your sign-in email right away. They name the client and the trip, never what they wrote."
    const val PUSH_NOTE = "Push goes to the browsers and phones where you turned notifications on."
}

fun replyWithinLabel(hours: Int): String = "Usually replies within $hours hours"

fun hoursLabel(hours: Int): String = "$hours hours"

fun switchLabel(what: String, channel: String): String = "$what by ${channel.lowercase()}"

fun workingOnLabel(day: String): String = "Working on $day"

fun autoReplyPreview(text: String): String = "Clients will read: \"$text\""

// ── Limits and choices (settingsRules.ts) ────────────────────────────────────

const val MAX_NAME = 80
const val MAX_PRONOUNS = 30
const val MAX_PHONE = 30
const val MAX_BIO = 600
const val MAX_LINK = 300
const val MAX_TIME_OFF_LABEL = 80
const val MAX_AUTO_REPLY = 600

/** The photo as picked, before the phone squares it (Q8). */
const val MAX_AVATAR_SOURCE_BYTES = 5 * 1024 * 1024

/** The square the phone sends, as the browser does. */
const val AVATAR_SIZE_PX = 400

/** Q21's default words (brand-voice reviewed on the web). `{{return_date}}` is filled when it sends. */
const val DEFAULT_AUTO_REPLY =
    "Thanks for writing! I'm away resting until {{return_date}} and will answer when I'm back. Your plans are in good hands."

enum class SocialNetwork(val key: String, val label: String) {
    INSTAGRAM("instagram", AgentSettingsCopy.INSTAGRAM),
    FACEBOOK("facebook", AgentSettingsCopy.FACEBOOK),
    LINKEDIN("linkedin", AgentSettingsCopy.LINKEDIN),
    WEBSITE("website", AgentSettingsCopy.WEBSITE),
}

data class TimeZoneChoice(val id: String, val label: String)

/** §3.12.2 (Q9): North American zones only, east to west, then the islands. */
val NORTH_AMERICAN_TIME_ZONES: List<TimeZoneChoice> = listOf(
    TimeZoneChoice("America/St_Johns", "Newfoundland (St. John's)"),
    TimeZoneChoice("America/Halifax", "Atlantic (Halifax)"),
    TimeZoneChoice("America/Puerto_Rico", "Atlantic (Puerto Rico)"),
    TimeZoneChoice("America/New_York", "Eastern (New York)"),
    TimeZoneChoice("America/Toronto", "Eastern (Toronto)"),
    TimeZoneChoice("America/Cancun", "Eastern (Cancún)"),
    TimeZoneChoice("America/Chicago", "Central (Chicago)"),
    TimeZoneChoice("America/Winnipeg", "Central (Winnipeg)"),
    TimeZoneChoice("America/Mexico_City", "Central (Mexico City)"),
    TimeZoneChoice("America/Regina", "Central, no daylight saving (Regina)"),
    TimeZoneChoice("America/Denver", "Mountain (Denver)"),
    TimeZoneChoice("America/Edmonton", "Mountain (Edmonton)"),
    TimeZoneChoice("America/Phoenix", "Mountain, no daylight saving (Phoenix)"),
    TimeZoneChoice("America/Los_Angeles", "Pacific (Los Angeles)"),
    TimeZoneChoice("America/Vancouver", "Pacific (Vancouver)"),
    TimeZoneChoice("America/Tijuana", "Pacific (Tijuana)"),
    TimeZoneChoice("America/Anchorage", "Alaska (Anchorage)"),
    TimeZoneChoice("Pacific/Honolulu", "Hawaii (Honolulu)"),
)

val RESPONSE_TIME_CHOICES: List<Int> = listOf(2, 4, 12, 24, 48)

enum class Weekday(val key: String, val label: String) {
    MON("mon", "Monday"),
    TUE("tue", "Tuesday"),
    WED("wed", "Wednesday"),
    THU("thu", "Thursday"),
    FRI("fri", "Friday"),
    SAT("sat", "Saturday"),
    SUN("sun", "Sunday"),
}

/** One day's working hours, "HH:MM" in half-hour steps; the end may be "24:00". */
data class DayHours(val start: String, val end: String)

/** Every weekday, each null (off) or its hours. */
typealias WeeklySchedule = Map<Weekday, DayHours?>

/** §3.12.2's default: Monday to Saturday 7am to 9pm, Sunday off. */
val DEFAULT_WEEKLY_SCHEDULE: WeeklySchedule = Weekday.entries.associateWith {
    if (it == Weekday.SUN) null else DayHours("07:00", "21:00")
}

/** Every half hour as "HH:MM", "00:00" to "24:00". Starts stop at 23:30; ends start at 00:30. */
val HALF_HOURS: List<String> = (0..48).map { i ->
    "${(i / 2).toString().padStart(2, '0')}:${if (i % 2 == 1) "30" else "00"}"
}

val START_TIMES: List<String> = HALF_HOURS.dropLast(1)
val END_TIMES: List<String> = HALF_HOURS.drop(1)

/** "07:00" → "7am", "21:30" → "9:30pm", "24:00" → "midnight", "12:00" → "noon". */
fun timeLabel(hhmm: String): String {
    if (hhmm == "24:00" || hhmm == "00:00") return "midnight"
    if (hhmm == "12:00") return "noon"
    val parts = hhmm.split(":")
    val h = parts.getOrNull(0)?.toIntOrNull() ?: return hhmm
    val m = parts.getOrNull(1)?.toIntOrNull() ?: return hhmm
    val suffix = if (h < 12) "am" else "pm"
    val h12 = if (h % 12 == 0) 12 else h % 12
    return if (m == 0) "$h12$suffix" else "$h12:${m.toString().padStart(2, '0')}$suffix"
}

// ── The read, as the screens hold it ─────────────────────────────────────────

data class AgentProfileSettings(
    val displayName: String = "",
    val pronouns: String = "",
    val email: String = "",
    val phone: String = "",
    val bio: String = "",
    /** A PATH in the public bucket, or null. Put it on the Supabase origin with [avatarUrlFor]. */
    val avatarPath: String? = null,
    val socialLinks: Map<SocialNetwork, String> = emptyMap(),
)

data class TimeOffBlock(
    val id: String,
    val startsOn: String,
    val endsOn: String,
    val label: String = "",
    val autoReplyEnabled: Boolean = false,
    val autoReplyText: String = "",
)

data class AgentAvailabilitySettings(
    val timeZone: String = "America/Chicago",
    val weeklySchedule: WeeklySchedule = DEFAULT_WEEKLY_SCHEDULE,
    val responseTimeHours: Int = 24,
    /** The advisor's own date, from the server; never the handset's. */
    val today: String = "",
    val timeOff: List<TimeOffBlock> = emptyList(),
)

/** §3.12.3's four switches, with their defaults for a read that predates them. */
data class AgentNotificationSettings(
    val clientMessagesPush: Boolean = true,
    val clientMessagesEmail: Boolean = false,
    val quoteRequestsPush: Boolean = true,
    val quoteRequestsEmail: Boolean = true,
)

data class AgentSettings(
    val profile: AgentProfileSettings,
    val availability: AgentAvailabilitySettings,
    val notifications: AgentNotificationSettings,
)

/**
 * `agent.avatar_url` is a PATH (`/storage/v1/object/public/agent-avatars/…`), never an absolute
 * URL: inside a function's container the Supabase origin is `http://kong:8000` (Data-Model §7.1).
 * The twin of `web/lib/agent/avatarUrl.ts`: anything else is refused rather than loaded.
 */
fun avatarUrlFor(path: String?, supabaseOrigin: String): String? {
    if (path.isNullOrBlank() || !path.startsWith(AVATAR_PATH_PREFIX) || supabaseOrigin.isBlank()) return null
    if (path.contains("..") || !AVATAR_PATH.matches(path)) return null
    return supabaseOrigin.trimEnd('/') + path
}

private const val AVATAR_PATH_PREFIX = "/storage/v1/object/public/agent-avatars/"

/** Plain path characters only: no query, fragment, backslash, percent-escape or empty segment. */
private val AVATAR_PATH = Regex("^/storage/v1/object/public/agent-avatars/[A-Za-z0-9._-]+(/[A-Za-z0-9._-]+)*$")

/** "Gyasi Story" → "GS" (first and last, as `initialsOf` in settingsView.ts); the fallback when there is no photo. */
fun advisorInitials(name: String): String {
    val parts = name.trim().split(Regex("\\s+")).filter { it.isNotEmpty() }
    if (parts.isEmpty()) return "?"
    val first = parts.first().first().toString()
    val last = if (parts.size > 1) parts.last().first().toString() else ""
    return (first + last).uppercase()
}

// ── Checks the phone can make before a round trip ────────────────────────────

/** Mirrors readPhone. Null when fine (or empty). */
fun phoneProblem(value: String): String? {
    val t = value.trim()
    if (t.isEmpty()) return null
    if (t.length > MAX_PHONE) return "Phone can be up to $MAX_PHONE characters."
    if (!Regex("^[0-9+()\\-. xX]+$").matches(t) || t.count { it.isDigit() } < 7) {
        return "That phone number doesn't look right. Use digits, spaces, + - ( ) or ."
    }
    return null
}

/** The first thing wrong with the profile form, or null. */
fun profileProblem(p: AgentProfileSettings): String? = when {
    p.displayName.isBlank() -> AgentSettingsCopy.NAME_REQUIRED
    p.displayName.trim().length > MAX_NAME -> "Your name can be up to $MAX_NAME characters."
    p.pronouns.trim().length > MAX_PRONOUNS -> "Pronouns can be up to $MAX_PRONOUNS characters."
    p.bio.trim().length > MAX_BIO -> "Bio can be up to $MAX_BIO characters."
    else -> phoneProblem(p.phone)
}

/** Mirrors scheduleProblem for a schedule the pickers built (only the order can be wrong). */
fun scheduleProblem(schedule: WeeklySchedule): String? {
    for (day in Weekday.entries) {
        val hours = schedule[day] ?: continue
        if (hours.start >= hours.end) return "${day.label}'s hours have to end after they start."
    }
    return null
}

private val ISO = Regex("^\\d{4}-\\d{2}-\\d{2}$")

private fun parseIso(value: String): LocalDate? =
    if (ISO.matches(value)) runCatching { LocalDate.parse(value) }.getOrNull() else null

/** Mirrors timeOffProblem: real dates, in order, not before today, at most a year. */
fun timeOffProblem(startsOn: String, endsOn: String, today: String): String? {
    val s = parseIso(startsOn) ?: return "Pick the first day away."
    val e = parseIso(endsOn) ?: return "Pick the last day away."
    if (e < s) return "The last day away can't be before the first."
    if (today.isNotEmpty() && startsOn < today) return "Time away can start today or later."
    if (e.toEpochDays() - s.toEpochDays() + 1 > 366) return "Time away can be up to a year. Check the dates."
    return null
}

private val FIELD = Regex("\\{\\{\\s*([^}]*?)\\s*\\}\\}")

/** Mirrors autoReplyProblem. */
fun autoReplyProblem(enabled: Boolean, text: String): String? {
    val t = text.trim()
    if (t.length > MAX_AUTO_REPLY) return "An automatic reply can be up to $MAX_AUTO_REPLY characters."
    FIELD.findAll(t).firstOrNull { it.groupValues[1] != "return_date" }?.let {
        return "We don't have a {{${it.groupValues[1]}}} field. You can use {{return_date}}."
    }
    if (enabled && t.isEmpty()) return "Add the words for your automatic reply, or turn it off."
    return null
}

enum class TimeOffPhase { UPCOMING, RUNNING, PAST }

/** In the advisor's own days. */
fun timeOffPhase(startsOn: String, endsOn: String, today: String): TimeOffPhase = when {
    endsOn < today -> TimeOffPhase.PAST
    startsOn <= today -> TimeOffPhase.RUNNING
    else -> TimeOffPhase.UPCOMING
}

private val SHORT_MONTH = listOf("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")

private fun shortDay(iso: String): String {
    val d = parseIso(iso) ?: return iso
    return "${SHORT_MONTH[d.month.ordinal]} ${d.day}"
}

/** "Jul 4 – Jul 7", "Jul 4", or "Dec 24 – Jan 2, 2027" when it leaves this year. */
fun dateRangeLabel(startsOn: String, endsOn: String, today: String): String {
    if (startsOn == endsOn) return shortDay(startsOn)
    val otherYear = endsOn.take(4) != startsOn.take(4) || startsOn.take(4) != today.take(4)
    return "${shortDay(startsOn)} – ${shortDay(endsOn)}${if (otherYear) ", ${endsOn.take(4)}" else ""}"
}

private val LONG_MONTH = Month.entries.map { m -> m.name.lowercase().replaceFirstChar { it.uppercase() } }
private val LONG_DAY = DayOfWeek.entries.map { d -> d.name.lowercase().replaceFirstChar { it.uppercase() } }

/** "Monday, July 8": the day after the last day away, as the reply will say it. */
fun returnDateLabel(endsOn: String): String {
    val d = parseIso(endsOn)?.plus(DatePeriod(days = 1)) ?: return endsOn
    return "${LONG_DAY[d.dayOfWeek.ordinal]}, ${LONG_MONTH[d.month.ordinal]} ${d.day}"
}

/** The auto-reply as a client would read it, `{{return_date}}` filled. */
fun autoReplyFilled(text: String, endsOn: String): String =
    FIELD.replace(text.trim()) { if (it.groupValues[1] == "return_date") returnDateLabel(endsOn) else it.value }
