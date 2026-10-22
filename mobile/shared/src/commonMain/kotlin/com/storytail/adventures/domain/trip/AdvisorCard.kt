package com.storytail.adventures.domain.trip

import kotlinx.datetime.DayOfWeek
import kotlinx.datetime.LocalDate
import kotlinx.datetime.Month
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull

/**
 * §3.12 PR 3 on the phone (Q11, Q14, Q26): the client's "Your advisor" card, from
 * `client_advisor_card()`. The twin of `web/lib/client/advisorCard.ts` (PR 3), the same
 * labels and the same refusals. Pure, so commonTest covers it.
 *
 * Only the client-facing fields ever arrive: name, pronouns, bio, photo path, links, the
 * reply-time promise and the first day back while the advisor is away. Never their email,
 * phone, hours or the label of their time away; the SQL leaves those out, not this file.
 */
data class AdvisorLink(val label: String, val href: String)

data class AdvisorCard(
    val firstName: String,
    val displayName: String,
    val pronouns: String?,
    val bio: String?,
    /** A PATH in the public bucket; put it on the Supabase origin before loading it. */
    val avatarPath: String?,
    val initials: String,
    val links: List<AdvisorLink>,
    /** "Usually replies within 4 hours". */
    val replyLabel: String,
    /** "Away until Tuesday, October 20" while a block runs, else null. */
    val awayLabel: String?,
) {
    /** What the header says under the name: away beats the promise. */
    val statusLine: String get() = awayLabel ?: replyLabel
}

/** The four networks, in the web's order and with its labels (`ADVISOR_LINK_LABELS`). */
private val LINK_LABELS = listOf(
    "instagram" to "Instagram",
    "facebook" to "Facebook",
    "linkedin" to "LinkedIn",
    "website" to "Website",
)

/** The promise clients see (Q13). A day and two days read better than 24 and 48 hours. */
fun advisorReplyLabel(hours: Int?): String = when (hours) {
    2, 4, 12 -> "Usually replies within $hours hours"
    48 -> "Usually replies within 2 days"
    else -> "Usually replies within a day"
}

private val LONG_MONTH = Month.entries.map { m -> m.name.lowercase().replaceFirstChar { it.uppercase() } }
private val LONG_DAY = DayOfWeek.entries.map { d -> d.name.lowercase().replaceFirstChar { it.uppercase() } }

/** "Away until Tuesday, October 20": the first day back, read as a calendar date. */
fun advisorAwayLabel(firstDayBack: String?): String? {
    if (firstDayBack == null || !Regex("^\\d{4}-\\d{2}-\\d{2}$").matches(firstDayBack)) return null
    val d = runCatching { LocalDate.parse(firstDayBack) }.getOrNull() ?: return null
    return "Away until ${LONG_DAY[d.dayOfWeek.ordinal]}, ${LONG_MONTH[d.month.ordinal]} ${d.day}"
}

private val HTTPS_LINK = Regex("^https://[^\\s<>\"]+$")

private fun JsonObject.text(key: String): String? =
    (this[key] as? JsonPrimitive)?.takeIf { it.isString }?.contentOrNull?.trim()?.takeIf { it.isNotEmpty() }

/** `client_advisor_card()`'s jsonb as the card. Null for no row (not a client, no advisor). */
fun parseAdvisorCard(row: JsonObject): AdvisorCard {
    val displayName = row.text("displayName") ?: "Your advisor"
    val links = (row["socialLinks"] as? JsonObject)?.let { social ->
        // The database only ever holds https links (agent_social_links_valid); checked again so
        // the card can never open a javascript: or http: link.
        LINK_LABELS.mapNotNull { (key, label) -> social.text(key)?.takeIf(HTTPS_LINK::matches)?.let { AdvisorLink(label, it) } }
    }.orEmpty()
    val parts = displayName.split(Regex("\\s+")).filter { it.isNotEmpty() }
    return AdvisorCard(
        firstName = row.text("firstName") ?: parts.firstOrNull() ?: displayName,
        displayName = displayName,
        pronouns = row.text("pronouns"),
        bio = row.text("bio"),
        avatarPath = row.text("avatarPath"),
        initials = when {
            parts.isEmpty() -> "?"
            parts.size == 1 -> parts[0].take(1).uppercase()
            else -> (parts.first().take(1) + parts.last().take(1)).uppercase()
        },
        links = links,
        replyLabel = advisorReplyLabel((row["responseTimeHours"] as? JsonPrimitive)?.intOrNull),
        awayLabel = advisorAwayLabel(row.text("awayUntil")),
    )
}
