package com.storytail.adventures.domain.agent

import com.storytail.adventures.domain.messages.formatInboxTime
import com.storytail.adventures.domain.trip.localToday
import kotlinx.datetime.DayOfWeek
import kotlinx.datetime.Instant
import kotlinx.datetime.LocalDate
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime

/**
 * §3.10 on the phone (Stage 3): the advisor's Messages tab. Copy and the pure mapping from the
 * accessors' rows to what the screens draw.
 *
 * THE STRINGS ARE THE WEB'S, byte for byte, from `AGENT_MESSAGES_COPY` in
 * `web/lib/agent/content.ts`. `.github/scripts/check_copy_parity.py` holds them together under
 * its "agent 3.10" row, so an advisor never reads two wordings of one control.
 */
object AgentMessagesCopy {
    const val TITLE = "Messages"
    const val FILTER_UNREAD = "Unread"
    const val FILTER_OVERDUE = "Overdue"
    const val VIEW_ARCHIVED = "Archived"
    const val VIEW_INBOX = "Inbox"
    const val SEARCH_PLACEHOLDER = "Name, trip or message"
    const val CAUGHT_UP = "All caught up"
    const val EMPTY_INBOX = "No messages yet. When a client writes to you, it shows up here."
    const val EMPTY_NARROWED = "No threads match these filters."
    const val EMPTY_ARCHIVED = "Nothing archived."
    const val GENERAL_THREAD = "General"
    const val YOU_PREFIX = "You: "
    const val OVERDUE = "Overdue"
    const val OPEN_TRIP = "Open trip"
    const val OPEN_CLIENT = "Open client"
    const val ARCHIVE_THREAD = "Archive"
    const val RESTORE_THREAD = "Move to inbox"
    const val ARCHIVED_TAG = "Archived"
    const val ARCHIVED_DONE = "Archived"
    const val RESTORED_DONE = "Moved to inbox"
    const val ARCHIVE_FAILED = "That didn't save. Try again in a moment."
    const val INTERNAL_NOTE_TAG = "Internal note · only you can see this"
    // §3.10 Stage 4, after a bubble's time: an email carried this reply; the client replied by email.
    const val EMAILED_MARK = "Emailed"
    const val BY_EMAIL = "By email"
    // §3.12.2: an out-of-office reply sent for the advisor while they were away.
    const val AUTO_REPLY = "Automatic reply"
    const val EMPTY_THREAD = "No messages in this thread yet."
    const val REPLY_LABEL = "Reply"
    const val REPLY_PLACEHOLDER = "Write a reply…"
    const val MESSAGE_PLACEHOLDER = "Write a message…"
    const val NOTE_PLACEHOLDER = "Write a note only you can see…"
    const val NOTE_SWITCH = "Internal note"
    const val NOTE_HINT = "Only you can see this note."
    const val SEND = "Send"
    const val ADD_NOTE = "Add note"
    const val SEND_FAILED = "That didn't send. Try again in a moment."
    const val NOT_FOUND = "That client isn't one of yours, or they've been archived."

    // §3.10.7 notifications. The card's words are the web's (copy parity); the rest is the
    // phone's own notification (M3105 to M3108).
    const val NOTIFY_TITLE = "Get notified when clients write"
    const val NOTIFY_BODY = "Quiet overnight and on Sundays, with one summary in the morning."
    const val NOTIFY_TURN_ON = "Turn on"
    const val NOTIFY_NOT_NOW = "Not now"
    const val NOTIFY_TURNING_ON = "Turning on…"
    const val NOTIFY_FAILED = "Notifications didn't turn on. Try again in a moment."
    const val NOTIFY_ON = "Notifications are on for this phone."
    const val NOTIFY_BLOCKED_PHONE = "Notifications are off for Story-Tail in this phone's settings. You can turn them on there."
    const val NOTIFY_CHANNEL = "Client messages"
    const val NOTIFY_CHANNEL_DESCRIPTION = "When a client writes to you. Quiet outside your working hours."
    const val NOTIFY_LOCKED_BODY = "Unlock to read it."
    const val NOTIFY_NEW_MESSAGE = "New message"
    const val NOTIFY_ACTION_REPLY = "Reply"
    const val NOTIFY_ACTION_MARK_READ = "Mark read"
    const val NOTIFY_REPLY_HINT = "Write a reply…"
    const val NOTIFY_REPLY_FAILED = "Didn't send. Tap to try again."
    const val NOTIFY_REPLY_DRAFT = "Your reply is saved as a draft in this thread."
    const val NOTIFY_REPLY_SENT = "Sent"
    const val NOTIFY_OPEN_SETTINGS = "Open settings"
    const val NOTIFY_A_CLIENT = "A client"
    const val NOTIFY_NO_TEXT = "Sent you a message."
    const val NOTIFY_YOUR_CLIENTS = "Your clients"
    // §3.12.3: a client asked for a trip (the same words push-dispatch sends the browser).
    const val NOTIFY_NEW_TRIP_REQUEST = "New trip request"
    const val NOTIFY_TRIP_REQUEST_NO_DETAIL = "Open it to see what they're dreaming of."
    // §3.8 (2026-10-21): the channel carries a lead's note too, the same switch the web calls
    // "New inquiries and messages". The channel id is unchanged, so a phone keeps its setting.
    const val NOTIFY_TRIP_CHANNEL = "New inquiries and messages"
    const val NOTIFY_TRIP_CHANNEL_DESCRIPTION =
        "When a client asks you to plan a trip, or someone without an account writes to you. Quiet outside your working hours."
    const val NOTIFY_NEW_LEAD = "New note from someone new"
    const val NOTIFY_LEAD_BODY = "They wrote from the website. Open Leads on the web to read and reply."
    const val OPEN_IN_MESSAGES = "Open in Messages"

    // Phone-only. The web has no tab bar and a two-pane layout, so these have no twin.
    /** The Reply / Note toggle's second option: "Note" reads as the mode, the switch as a label. */
    const val NOTE_MODE = "Note"
    const val LOAD_MORE = "Load more"
    const val LOAD_FAILED_TITLE = "That didn't load"
    const val LOAD_FAILED_BODY = "Something went wrong on our side, not yours. Trying again usually sorts it."
    const val THREAD_NOT_FOUND_TITLE = "That thread isn't here"
    const val THREAD_NOT_FOUND_BODY = "It isn't one of yours, or it's gone. Head back to Messages."
    const val NEW_THREAD_EMPTY = "No messages about this yet. What you send starts the thread."
    const val TRY_AGAIN = "Try again"
    const val BACK_TO_MESSAGES = "Back to Messages"
    /** Screen-reader prefixes: the bubbles' sides carry who spoke only visually. */
    const val YOU_SAID = "You said"
    const val CLIENT_SAID = "Client said"
}

/** "3 unread · 1 overdue", or "All caught up". The web's `messagesHeadline`. */
fun messagesHeadline(unreadThreads: Int, overdueThreads: Int): String {
    val parts = buildList {
        if (unreadThreads > 0) add("$unreadThreads unread")
        if (overdueThreads > 0) add("$overdueThreads overdue")
    }
    return if (parts.isEmpty()) AgentMessagesCopy.CAUGHT_UP else parts.joinToString(" · ")
}

/** "Reply by Tue": the day a reply falls due, before it is overdue. The web's `messagesReplyByShort`. */
fun messagesReplyByShort(day: String): String = "Reply by $day"

/** "Reply by end of Tue", for the thread header. The web's `messagesReplyBy`. */
fun messagesReplyBy(day: String): String = "Reply by end of $day"

/** "Message Kai", Client Detail's header button. The web's `messageClientLabel`. */
fun messageClientLabel(firstName: String): String = "Message $firstName"

/** "Message Pri", the new-thread screen's title. The web's `messagesNewTo`. */
fun messagesNewTo(firstName: String): String = "Message $firstName"

/** Under the reply box when the client has no login yet. The web's `messagesNoLogin`. */
fun messagesNoLogin(firstName: String): String =
    "$firstName hasn't set up a login yet, so this won't be emailed. It will be waiting when they sign in."

private val WEEKDAYS = mapOf(
    DayOfWeek.MONDAY to "Mon",
    DayOfWeek.TUESDAY to "Tue",
    DayOfWeek.WEDNESDAY to "Wed",
    DayOfWeek.THURSDAY to "Thu",
    DayOfWeek.FRIDAY to "Fri",
    DayOfWeek.SATURDAY to "Sat",
    DayOfWeek.SUNDAY to "Sun",
)

/**
 * The weekday a reply falls due, in the ADVISOR's zone (never the handset's).
 *
 * `reply_due_at` is the midnight that ENDS the due day, so the day is read off the last moment
 * before it, one millisecond earlier, exactly as the web's `dueDay` does. Reading the instant
 * itself would name the day after.
 */
fun replyDueDay(dueAtIso: String, timeZone: String): String? {
    val zone = runCatching { TimeZone.of(timeZone) }.getOrDefault(TimeZone.UTC)
    val lastMoment = runCatching { Instant.parse(dueAtIso) }.getOrNull() ?: return null
    val local = Instant.fromEpochMilliseconds(lastMoment.toEpochMilliseconds() - 1).toLocalDateTime(zone)
    return WEEKDAYS[local.dayOfWeek]
}

/** One row of the phone inbox (3.10m.1). */
data class AgentInboxRowUi(
    val conversationId: String,
    val clientName: String,
    val initials: String,
    /** The trip, or "General". */
    val tripLabel: String,
    /** "You: " in front when the advisor spoke last. */
    val preview: String,
    val timeLabel: String,
    val unread: Int,
    val overdue: Boolean,
    /** "Reply by Tue" while a reply is owed and not yet late; null otherwise. */
    val replyByLabel: String?,
)

/** The raw accessor row, as the repository hands it over. */
data class AgentThreadListRow(
    val conversationId: String,
    val clientId: String,
    val clientName: String,
    val tripId: String?,
    val tripTitle: String?,
    val lastMessageAt: String,
    val lastMessagePreview: String?,
    val lastSenderRole: String?,
    val unread: Int,
    val replyDueAt: String?,
    val overdue: Boolean,
    val archived: Boolean,
    val totalCount: Int,
)

/** "JH" for Jordan Hayes. Initials, never a stock portrait standing in for a client. */
fun initialsOf(name: String): String =
    name.split(' ', '&', '-')
        .filter { it.isNotBlank() }
        .take(2)
        .joinToString("") { it.first().uppercase() }

fun agentInboxRow(
    row: AgentThreadListRow,
    timeZone: String,
    today: LocalDate = localToday(),
): AgentInboxRowUi {
    val preview = row.lastMessagePreview.orEmpty()
    return AgentInboxRowUi(
        conversationId = row.conversationId,
        clientName = row.clientName,
        initials = initialsOf(row.clientName),
        tripLabel = row.tripTitle ?: AgentMessagesCopy.GENERAL_THREAD,
        // Anything but the client is the advisor's side, as the thread reads it (staff too).
        preview = if (row.lastSenderRole != null && row.lastSenderRole != "client" && preview.isNotEmpty()) {
            AgentMessagesCopy.YOU_PREFIX + preview
        } else {
            preview
        },
        timeLabel = formatInboxTime(row.lastMessageAt, today),
        unread = row.unread,
        overdue = row.overdue,
        replyByLabel = if (row.replyDueAt != null && !row.overdue) {
            replyDueDay(row.replyDueAt, timeZone)?.let(::messagesReplyByShort)
        } else {
            null
        },
    )
}
