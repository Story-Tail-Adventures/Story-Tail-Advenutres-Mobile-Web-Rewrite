package com.storytail.adventures.domain.messages

import com.storytail.adventures.api.InboxConversationView
import com.storytail.adventures.domain.trip.ThreadMessages
import com.storytail.adventures.domain.trip.formatDaySeparator
import com.storytail.adventures.domain.trip.formatMessageTime
import com.storytail.adventures.domain.trip.localToday
import kotlinx.datetime.LocalDate

/**
 * Screen 2.6.1's rows, formatted.
 *
 * The twin of `web/lib/messages/inbox.ts`, with one deliberate difference: the web side has to
 * be handed `platform_user.time_zone` explicitly, because it formats on a server whose ambient
 * zone is UTC and a browser that would disagree across midnight. A phone already knows where
 * it is, so these read the device zone through [localToday] and [formatMessageTime] — the same
 * split `TripThread.kt` documents for the day separators.
 */
data class InboxRowView(
    val id: String,
    /** Trip title, else subject, else the advisor's name. See [inboxTitle]. */
    val title: String,
    /** The trip's name as the row's kicker, or null on the general thread. */
    val tripLabel: String?,
    val preview: String,
    /** "2:14p" today, "Yesterday", else "Mar 14". */
    val time: String,
    val unreadCount: Int,
)

/**
 * "2:14p" for today, "Yesterday", else "Mar 14".
 *
 * The desktop frame has a third tier — a bare weekday ("Tue") for the last week — which is
 * dropped on both stacks. It would need seven new strings under CI parity to save a traveler
 * with three threads from reading a date, and [formatDaySeparator] already answers this
 * question correctly in the device's zone.
 */
fun formatInboxTime(iso: String, today: LocalDate = localToday()): String {
    val day = formatDaySeparator(iso, today)
    return if (day == ThreadMessages.TODAY) formatMessageTime(iso) else day
}

/**
 * An empty preview is possible: `last_message_preview` is nullable, and a conversation exists
 * for a moment before its first message lands — `trip-message` is explicitly not atomic. The
 * row still has to render; a thread that vanishes because one column is null is worse than a
 * thread with a quiet line under it.
 */
fun inboxRows(
    conversations: List<InboxConversationView>,
    today: LocalDate = localToday(),
): List<InboxRowView> = conversations.map { conversation ->
    InboxRowView(
        id = conversation.id,
        title = inboxTitle(conversation.subject, conversation.tripTitle),
        tripLabel = conversation.tripTitle,
        preview = conversation.lastMessagePreview ?: "",
        time = formatInboxTime(conversation.lastMessageAt, today),
        unreadCount = conversation.unreadCount,
    )
}

/**
 * Search, over what the row actually shows.
 *
 * NOT A SERVER SEARCH. `message.body` is readable, so a full-text search over the whole
 * history would be possible — but `last_message_preview` is the only message text the inbox
 * has loaded, so a match on an unloaded message would return a row whose visible text does not
 * contain what the traveler typed. Searching exactly what is on screen is the honest version of
 * this control.
 */
fun filterInboxRows(rows: List<InboxRowView>, query: String): List<InboxRowView> {
    val needle = query.trim().lowercase()
    if (needle.isEmpty()) return rows
    return rows.filter { row ->
        row.title.lowercase().contains(needle) ||
            row.preview.lowercase().contains(needle) ||
            row.tripLabel?.lowercase()?.contains(needle) == true
    }
}
