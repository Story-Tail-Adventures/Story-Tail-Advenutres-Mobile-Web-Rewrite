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
    /** §3.12.3: a client asked for a trip. Ids only; the name and dates are read on receipt. */
    data class QuoteRequest(val tripId: String) : AgentPushData {
        /** One notification per request, the same tag the web uses. */
        val tag: String get() = "quote-$tripId"
    }
    /**
     * §3.8 (2026-10-21): somebody without an account wrote through the public form. The lead id
     * only; the name is read on receipt. There is no phone Leads screen, so a tap opens the app.
     */
    data class LeadMessage(val leadId: String) : AgentPushData {
        val tag: String get() = "lead-$leadId"
    }

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
                "quote_request" -> data["tripId"]?.takeIf { UUID.matches(it) }?.let(::QuoteRequest)
                "lead_message" -> data["leadId"]?.takeIf { UUID.matches(it) }?.let(::LeadMessage)
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
 * A card number a client pastes into a message must not be copied onto a lock screen. Found by
 * the guard's rule (Data-Model §18), the same as `maskCardNumbers` in
 * supabase/functions/_shared/cardDigits.ts: ASCII digit groups joined by up to three spaces,
 * dots, dashes or no-break / thin spaces; every span of whole groups that joins to 13 to 19
 * digits and passes Luhn is shown as its last four. Every starting group is tried, so a short
 * number in front ("Paid 12 4111…") or letters touching the digits cannot hide the card. From
 * each start the longest such span wins, and the search goes on after it.
 */
// A normal string, not a raw one: Kotlin turns the \u escapes into the characters themselves,
// so the pattern means the same on the JVM and on Kotlin/Native.
private val DIGIT_RUN = Regex("[0-9]+(?:[ .\u00a0\u2009\u202f-]{1,3}[0-9]+)*")
private val DIGIT_GROUP = Regex("[0-9]+")

internal fun luhnValid(digits: String): Boolean {
    var total = 0
    var double = false
    for (i in digits.indices.reversed()) {
        var d = digits[i] - '0'
        if (double) {
            d *= 2
            if (d > 9) d -= 9
        }
        total += d
        double = !double
    }
    return total % 10 == 0
}

fun maskCardNumbers(text: String): String {
    val out = StringBuilder()
    var at = 0
    for (run in DIGIT_RUN.findAll(text)) {
        val groups = DIGIT_GROUP.findAll(run.value).map { it.range.first + run.range.first..it.range.last + run.range.first }.toList()
        var i = 0
        while (i < groups.size) {
            var digits = ""
            var best = -1
            var bestDigits = ""
            for (j in i until groups.size) {
                digits += text.substring(groups[j])
                if (digits.length > 19) break
                if (digits.length >= 13 && luhnValid(digits)) {
                    best = j
                    bestDigits = digits
                }
            }
            if (best < 0) {
                i++
                continue
            }
            out.appendRange(text, at, groups[i].first).append("•••• ").append(bestDigits.takeLast(4))
            at = groups[best].last + 1
            i = best + 1
        }
    }
    return out.appendRange(text, at, text.length).toString()
}

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

/**
 * §3.12.3's locked screen: the client's name only, as on the web
 * (`quoteRequestPayload` in supabase/functions/_shared/push.ts).
 */
/**
 * §3.8: "New note from Dana Reyes". A NOTE, never a "message": a stranger's note must not look
 * like a client's message on a lock screen. The web push says the same (`_shared/push.ts`).
 */
fun leadMessageTitle(name: String?): String =
    name?.trim()?.takeIf { it.isNotEmpty() }?.let { "New note from $it" } ?: AgentMessagesCopy.NOTIFY_NEW_LEAD

fun quoteRequestTitle(clientName: String?): String =
    "New trip request from ${clientName?.trim()?.takeIf { it.isNotEmpty() } ?: AgentMessagesCopy.NOTIFY_A_CLIENT.lowercase()}"

/**
 * Unlocked: where and when, when the client said. "Negril, Jamaica · Feb 10 – Feb 14", or what
 * of it there is, or the gentle fallback. Dates are read as calendar dates: no zone moves them.
 * Masked like a message, since a client types the destination.
 */
fun quoteRequestBody(destination: String?, startDate: String?, endDate: String?): String {
    val from = shortIsoDate(startDate)
    val to = shortIsoDate(endDate)
    val whenText = when {
        from != null && to != null -> if (from == to) from else "$from – $to"
        else -> from ?: to
    }
    val detail = listOfNotNull(destination?.trim()?.takeIf { it.isNotEmpty() }, whenText).joinToString(" · ")
    return maskCardNumbers(detail.ifEmpty { AgentMessagesCopy.NOTIFY_TRIP_REQUEST_NO_DETAIL })
}

private val SHORT_MONTHS = listOf("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")

private fun shortIsoDate(iso: String?): String? {
    val m = iso?.let { Regex("^(\\d{4})-(\\d{2})-(\\d{2})").find(it) } ?: return null
    val month = m.groupValues[2].toInt()
    if (month !in 1..12) return null
    return "${SHORT_MONTHS[month - 1]} ${m.groupValues[3].toInt()}"
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
