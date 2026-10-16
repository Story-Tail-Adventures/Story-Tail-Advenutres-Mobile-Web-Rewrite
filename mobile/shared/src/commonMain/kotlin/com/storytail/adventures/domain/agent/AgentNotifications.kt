package com.storytail.adventures.domain.agent

/**
 * §3.10.7 on the phone: what an FCM message means, and the words a notification shows.
 *
 * Pure, so commonTest covers it. The Android messaging service (androidApp) does the I/O: it
 * parses the data Google delivered, reads the thread over the advisor's own session, and hands
 * the result here for its words.
 *
 * The FCM payload carries no client words by design (fetch on receipt; see
 * docs/Push-Notifications-Security-Review.md §3.1), so everything a person reads is built here
 * from our own API's answer, never from the push.
 */

/** What `push-dispatch` sends an Android phone (`supabase/functions/_shared/fcm.ts`). */
sealed interface AgentPushData {
    data class Message(val conversationId: String, val seenUpTo: String, val count: Int) : AgentPushData
    data class Summary(val count: Int) : AgentPushData
    /** [readUpTo]: the newest message its notification was about. A newer notification stays. */
    data class Dismiss(val tag: String, val readUpTo: String? = null) : AgentPushData

    companion object {
        /** Null for anything this version does not understand: shown as nothing, never as junk. */
        fun parse(data: Map<String, String>): AgentPushData? {
            if (data["v"] != "1") return null
            return when (data["kind"]) {
                "message" -> {
                    val id = data["conversationId"]?.takeIf { UUID.matches(it) } ?: return null
                    val seen = data["seenUpTo"]?.takeIf { it.isNotBlank() } ?: return null
                    Message(id, seen, data["count"]?.toIntOrNull()?.coerceAtLeast(1) ?: 1)
                }
                "summary" -> Summary(data["count"]?.toIntOrNull()?.coerceAtLeast(1) ?: 1)
                "dismiss" -> data["tag"]?.takeIf { it.isNotBlank() && it.length <= 64 }
                    ?.let { Dismiss(it, data["readUpTo"]?.takeIf(String::isNotBlank)) }
                else -> null
            }
        }

        private val UUID = Regex("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")
    }
}

/** The summary's tag, the same one the web uses. A message's tag is its conversation id. */
const val AGENT_PUSH_SUMMARY_TAG = "summary"

/**
 * A run of 13 to 19 digits, optionally split by spaces or dashes: the shape of a card number.
 * The same rule as `maskCardNumbers` in supabase/functions/_shared/push.ts. A client who pastes
 * one into a message must not see it copied onto a lock screen.
 */
private val CARD_LIKE = Regex("""\b\d(?:[ -]?\d){12,18}\b""")

fun maskCardNumbers(text: String): String =
    CARD_LIKE.replace(text) { m -> "•••• " + m.value.filter(Char::isDigit).takeLast(4) }

/** "Jordan Hayes · Anniversary Week in Negril", or the name alone for a thread with no trip. */
fun notificationTitle(clientName: String, tripTitle: String?): String {
    val name = clientName.trim().ifEmpty { AgentMessagesCopy.NOTIFY_A_CLIENT }
    val trip = tripTitle?.trim().orEmpty()
    return if (trip.isEmpty()) name else "$name · $trip"
}

/** The locked screen: the client's name only (ruling 2). */
fun notificationLockedTitle(clientName: String): String =
    "New message from ${clientName.trim().ifEmpty { AgentMessagesCopy.NOTIFY_A_CLIENT.lowercase() }}"

/** The first line, masked and kept to a notification's length. */
fun notificationBody(body: String): String {
    val line = maskCardNumbers(body.trim().replace(Regex("\\s+"), " "))
    return when {
        line.isEmpty() -> AgentMessagesCopy.NOTIFY_NO_TEXT
        line.length <= 140 -> line
        else -> line.take(139).trimEnd() + "…"
    }
}

/** "3 new messages while you rested", as on the web. */
fun notificationSummaryTitle(count: Int): String =
    "$count new ${if (count == 1) "message" else "messages"} while you rested"

/** "Jordan Hayes, Maya Carter and Sam Rivera wrote while you rested." */
fun notificationSummaryBody(names: List<String>): String {
    val unique = names.map { it.trim() }.filter { it.isNotEmpty() }.distinct()
    val who = when (unique.size) {
        0 -> AgentMessagesCopy.NOTIFY_YOUR_CLIENTS
        1 -> unique[0]
        2, 3 -> unique.dropLast(1).joinToString(", ") + " and " + unique.last()
        else -> {
            val rest = unique.size - 3
            unique.take(3).joinToString(", ") + " and $rest ${if (rest == 1) "other" else "others"}"
        }
    }
    return "$who wrote while you rested."
}

/**
 * Whether a dismiss may close the notification on screen. Timestamps as PostgREST writes them
 * (same zone, same width), so text order is time order. Unknown on either side: close it, as a
 * dismiss always did.
 */
fun dismissApplies(readUpTo: String?, shownUpTo: String?): Boolean =
    readUpTo == null || shownUpTo == null || shownUpTo <= readUpTo
