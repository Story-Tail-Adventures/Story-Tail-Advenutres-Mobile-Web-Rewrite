package com.storytail.adventures.domain.trip

import kotlinx.datetime.Clock
import kotlinx.datetime.Instant
import kotlinx.datetime.LocalDate
import kotlinx.datetime.LocalDateTime
import kotlinx.datetime.TimeZone
import kotlinx.datetime.daysUntil
import kotlinx.datetime.toLocalDateTime

/**
 * Message thread presentation for screen 2.2.7.
 *
 * KOTLIN TWIN of `web/lib/trips/thread.ts`, compared by
 * `.github/scripts/check_copy_parity.py`.
 *
 * WHAT IS DELIBERATELY NOT HERE. Screen-Inventory §2.2.7 names a typing indicator and read
 * receipts among its primary elements. Neither is built:
 *
 *  * The typing indicator needs Realtime presence. Nothing backs it — there is no presence
 *    channel in this codebase and no column that could stand in.
 *  * Read receipts would need `message.read_by_other_at`, which is outside the client column
 *    grant on purpose: it tells a client exactly when Gyasi opened their message, and an
 *    advisor who reads at 11pm should not have that on the record for every traveler.
 *    `conversation.client_unread_count` is granted and gives the client the half of the
 *    signal that is theirs — what THEY have not read.
 *
 * Both are recorded as deferrals in the plan rather than faked.
 */

/** `message.sender_role`, verbatim from the enum. */
enum class MessageSender { AGENT, CLIENT }

/** Flat and const, which is what `check_copy_parity.py` reads. */
object ThreadMessages {
    const val COMPOSE_PLACEHOLDER = "Reply to Gyasi…"
    const val SEND_LABEL = "Send"
    const val ATTACH_LABEL = "Attach a file"
    const val OPEN_TRIP = "Open trip"
    const val TODAY = "Today"
    const val YESTERDAY = "Yesterday"
    const val EMPTY_TITLE = "No messages yet"
    const val EMPTY_BODY =
        "This is where you and Gyasi talk about this trip. Ask anything — the small " +
            "questions are the ones worth asking."
    const val SEND_FAILED = "That message did not send. It is still here, so try again in a moment."
    const val QUICK_SOUNDS_GOOD = "Sounds good"
    const val QUICK_ADD_PARTNER = "Add my partner"
    const val QUICK_SEND_PASSPORT = "Send a passport"
    const val QUICK_SCHEDULE_CALL = "Schedule a call"

    /**
     * §2.0's landing said "Reply usually < 2h" and §2.1 said "within 48 hours". Three
     * competing promises across three sections is one too many to keep true, so §2.2
     * standardises on the one Gyasi can keep on a bad week. Stage 10 reconciles §2.0.
     */
    const val REPLY_WINDOW = "Usually replies the same day"
}

/**
 * The suggested-reply chips §2.2.7 lists as a key action.
 *
 * Copy, not data — nothing in the schema produces them. Keeping them beside the rest of the
 * table is what puts them under CI parity, so web and native never offer a traveler two
 * different sets of words to say.
 */
val QUICK_REPLIES = listOf(
    ThreadMessages.QUICK_SOUNDS_GOOD,
    ThreadMessages.QUICK_ADD_PARTNER,
    ThreadMessages.QUICK_SEND_PASSPORT,
    ThreadMessages.QUICK_SCHEDULE_CALL,
)

private val MONTHS = listOf(
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
)

/**
 * The device's own zone, not UTC.
 *
 * Unlike the date-only columns — which `todayIsoUtc` reads in UTC because a `date` has no
 * zone — a message carries a real instant, and a message sent at 11:14 in Jamaica should
 * read 11:14 to the traveler who sent it.
 */
private fun localDateTime(iso: String): LocalDateTime? =
    runCatching { Instant.parse(iso).toLocalDateTime(TimeZone.currentSystemDefault()) }
        .getOrNull()

/** "11:14a" / "2:14p", the artboards' own format. */
fun formatMessageTime(iso: String): String {
    val at = localDateTime(iso) ?: return ""
    val hour12 = if (at.hour % 12 == 0) 12 else at.hour % 12
    val minute = at.minute.toString().padStart(2, '0')
    return "$hour12:$minute${if (at.hour < 12) "a" else "p"}"
}

/**
 * Today's date IN THE DEVICE'S OWN ZONE.
 *
 * This exists because `todayIsoUtc()` — which every other §2.2 derivation correctly uses —
 * is WRONG for this screen, and the failure is invisible for most of the day.
 *
 * Measured on the emulator at 21:17 EDT on 7 September, which is 01:17 UTC on the 8th.
 * `todayIsoUtc()` said the 8th; the message timestamps render in the device zone and so sat
 * on the 6th and 7th. Every separator was off by exactly one day: yesterday's messages read
 * "Sep 6" and today's read "Yesterday". For a traveler west of Greenwich that is every
 * evening.
 *
 * The distinction is real and worth keeping straight: `trip.start_date` and friends are
 * date-only columns with no zone, so comparing them against a UTC today is correct. A
 * message carries an instant, is rendered in the device zone, and must be grouped against a
 * date in that same zone.
 */
fun localToday(): LocalDate =
    Clock.System.now().toLocalDateTime(TimeZone.currentSystemDefault()).date

/**
 * "Today" / "Yesterday" / "Mar 14".
 *
 * [today] MUST be the date in the same zone the timestamps are rendered in — the device's.
 * It defaults to [localToday] so a caller cannot get that wrong by accident; tests pass an
 * explicit value. Passing a UTC-derived date here is the bug described on [localToday].
 */
fun formatDaySeparator(iso: String, today: LocalDate = localToday()): String {
    val at = localDateTime(iso) ?: return ""
    // `daysUntil` rather than `today.minus(1, DAY)`: it is the helper TripStatus.kt already
    // uses for every other date comparison in §2.2, and it crosses month and year boundaries
    // without a second case.
    return when (at.date.daysUntil(today)) {
        0 -> ThreadMessages.TODAY
        1 -> ThreadMessages.YESTERDAY
        else -> "${MONTHS[at.date.monthNumber - 1]} ${at.date.dayOfMonth}"
    }
}

/** Local `yyyy-mm-dd`, so a 9pm message groups under the day the sender experienced. */
private fun localDayKey(iso: String): String? {
    val at = localDateTime(iso) ?: return null
    val month = at.date.monthNumber.toString().padStart(2, '0')
    val day = at.date.dayOfMonth.toString().padStart(2, '0')
    return "${at.date.year}-$month-$day"
}

data class ThreadDay<T>(
    /** Local `yyyy-mm-dd`. Stable across recompositions, which makes it a usable list key. */
    val key: String,
    val label: String,
    val messages: List<T>,
)

/**
 * Split a chronological message list into day buckets for the date separators.
 *
 * Assumes the input is already oldest-first, which is how the query orders it — a thread
 * reads top to bottom like a conversation, unlike the document list, which is newest-first.
 * A run of the same day that is NOT adjacent opens a new bucket rather than merging into the
 * earlier one, because merging would reorder somebody's messages.
 */
fun <T> groupMessagesByDay(
    messages: List<T>,
    today: LocalDate = localToday(),
    createdAtOf: (T) -> String,
): List<ThreadDay<T>> {
    val days = mutableListOf<ThreadDay<T>>()
    for (message in messages) {
        val iso = createdAtOf(message)
        val key = localDayKey(iso) ?: continue
        val last = days.lastOrNull()
        if (last != null && last.key == key) {
            days[days.lastIndex] = last.copy(messages = last.messages + message)
        } else {
            days += ThreadDay(key, formatDaySeparator(iso, today), listOf(message))
        }
    }
    return days
}
