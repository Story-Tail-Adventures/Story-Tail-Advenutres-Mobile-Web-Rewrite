package com.storytail.adventures.ui.screens.agent

import com.storytail.adventures.api.ClientDetailSnapshot
import com.storytail.adventures.api.ClientNoteRow
import com.storytail.adventures.api.ClientTripRow
import com.storytail.adventures.domain.agent.ClientCopy
import com.storytail.adventures.domain.agent.rosterCurrencyNote

/**
 * Everything Screens 3.3.2 – 3.3.8 render on a phone, already derived.
 *
 * THE WHOLE DETAIL IS HERE AT ONCE, which is what lets a tab switch cost nothing. See
 * `AgentRepository.clientDetail`'s doc comment for why the phone fetches all seven reads
 * where the web page fetches one tab's.
 *
 * The screen does no arithmetic and reads no clock, for the reason [WorklistUiState] gives.
 * `asOfDate` arrives on the rows, computed in Postgres in the AGENT's zone — a handset that
 * derived its own "today" would disagree with the accessor's windows for the offset's worth
 * of hours either side of midnight.
 */
data class ClientDetailUiState(
    val clientId: String,
    val displayName: String,
    val initials: String,
    /** Email, or phone, or the stand-in line. Never blank. */
    val contactLine: String,
    val phone: String?,
    val tags: List<String>,
    val archived: Boolean,
    val sinceLabel: String,
    val tabs: List<ClientTabUi>,
    val snapshot: List<Pair<String, String>>,
    val preferences: List<String>,
    /** The half the closed vocabulary cannot carry. */
    val preferenceNotes: List<String>,
    val snapshotNote: String?,
    val stats: List<Pair<String, String>>,
    /** True when a money figure on this screen covers one currency out of several. */
    val moneyExcludesACurrency: Boolean,
    val currencyNote: String?,
    val household: List<HouseholdUi>,
    val trips: List<ClientTripUi>,
    val threads: List<ClientThreadUi>,
    val documents: List<ClientDocumentUi>,
    val notes: List<ClientNoteUi>,
    val activity: List<ClientActivityUi>,
)

data class ClientTabUi(val id: String, val label: String)

data class HouseholdUi(
    val companionId: String,
    val name: String,
    val initials: String,
    val line: String?,
    val passportExpiringSoon: Boolean,
)

data class ClientTripUi(
    val tripId: String,
    val title: String,
    val line: String,
    val valueLabel: String,
    val commissionLabel: String,
    val status: String,
    val bucket: String,
)

data class ClientThreadUi(
    val conversationId: String,
    val subject: String,
    val preview: String?,
    val whenLabel: String,
    val unread: Int,
)

data class ClientDocumentUi(
    val documentId: String,
    val filename: String,
    val line: String,
    val badge: String,
    val sensitive: Boolean,
)

data class ClientNoteUi(
    val noteId: String,
    val body: String,
    val authorName: String,
    val whenLabel: String,
    val edited: Boolean,
    val mine: Boolean,
)

data class ClientActivityUi(
    val eventId: String,
    val description: String,
    val actorName: String?,
    val whenLabel: String,
)

private val MONTHS = listOf(
    "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
)

/** "2026-08-12" → "Aug 12, 2026". */
fun monthDayYear(iso: String?): String? {
    if (iso == null) return null
    val parts = iso.take(10).split("-")
    if (parts.size != 3) return null
    val month = parts[1].toIntOrNull() ?: return null
    if (month !in 1..12) return null
    val day = parts[2].toIntOrNull() ?: return null
    return "${MONTHS[month - 1]} $day, ${parts[0]}"
}

/** "2024-03-01" → "Mar 2024". The header's "Since" line. */
fun monthAndYear(iso: String?): String? {
    if (iso == null) return null
    val parts = iso.take(10).split("-")
    if (parts.size < 2) return null
    val month = parts[1].toIntOrNull() ?: return null
    if (month !in 1..12) return null
    return "${MONTHS[month - 1]} ${parts[0]}"
}

/**
 * A trip's one line: dates and a destination.
 *
 * A trip with no dates still gets its destination, and one with neither gets an em dash
 * rather than an empty row — an `inquiry` has no dates at all (BRD §6.5) and is the trip
 * most likely to need a call.
 */
fun tripLine(trip: ClientTripRow): String {
    val dates = when {
        trip.startDate != null && trip.endDate != null ->
            "${monthDayYear(trip.startDate)} – ${monthDayYear(trip.endDate)}"
        trip.startDate != null -> monthDayYear(trip.startDate)
        else -> null
    }
    val parts = listOfNotNull(dates, trip.destination)
    return if (parts.isEmpty()) ClientCopy.NO_TRIP else parts.joinToString(" · ")
}

/**
 * Which of the Trips tab's three groups a trip belongs to.
 *
 * `endDate` decides "past", not status: a completed trip whose status was never advanced
 * still belongs under Past once the dates say so. Same rule the web build applies.
 */
fun tripBucket(trip: ClientTripRow): String = when {
    trip.status == "cancelled" -> "cancelled"
    trip.endDate != null && trip.endDate < trip.asOfDate -> "past"
    else -> "active"
}

/** "PDF" / "IMG" / "DOC", from the mime type, falling back to the extension. */
fun documentBadge(mimeType: String, filename: String): String = when {
    mimeType == "application/pdf" || filename.lowercase().endsWith(".pdf") -> "PDF"
    mimeType.startsWith("image/") -> "IMG"
    else -> "DOC"
}

/** "1.1 MB". Binary units, because a file manager's number is what people compare against. */
fun fileSizeLabel(bytes: Long): String = when {
    bytes <= 0L -> ClientCopy.NO_TRIP
    bytes < 1024 -> "$bytes B"
    bytes < 1024 * 1024 -> "${bytes / 1024} KB"
    else -> {
        val tenths = (bytes * 10 / (1024 * 1024))
        "${tenths / 10}.${tenths % 10} MB"
    }
}

/**
 * `event_type` is a dotted slug and the enum is not copy.
 *
 * An unrecognised type falls back to a humanised form of itself rather than being dropped:
 * the Activity tab's whole job is that nothing is missing from it.
 */
fun describeEvent(eventType: String): String = when (eventType) {
    "client.updated" -> "Client record updated"
    "client.tag_added" -> "Tag added"
    "client.note_created" -> "Internal note added"
    "client.note_changed" -> "Internal note edited"
    "client.note_archived" -> "Internal note removed"
    "trip.status_changed" -> "Trip status changed"
    "trip.notes_changed" -> "Trip notes edited"
    else -> eventType.replace('.', ' ').replace('_', ' ')
        .replaceFirstChar { it.uppercase() }
}

/** True when a passport expires inside six months, which is most suppliers' floor. */
fun passportExpiringSoon(expiry: String?, asOfDate: String): Boolean {
    if (expiry == null) return false
    val parts = asOfDate.split("-")
    if (parts.size != 3) return false
    val year = parts[0].toIntOrNull() ?: return false
    val month = parts[1].toIntOrNull() ?: return false
    val shifted = month + 6
    val cutoffYear = year + (shifted - 1) / 12
    val cutoffMonth = ((shifted - 1) % 12) + 1
    val cutoff = "$cutoffYear-${cutoffMonth.toString().padStart(2, '0')}-${parts[2]}"
    return expiry <= cutoff
}

private fun noteUi(n: ClientNoteRow): ClientNoteUi = ClientNoteUi(
    noteId = n.noteId,
    body = n.body,
    authorName = n.authorName ?: "Unknown",
    whenLabel = monthDayYear(n.createdAt) ?: "",
    // `agent_write_client_note` answers 'noop' for a re-save of identical text precisely so
    // this stays honest: updated_at only moves when the body actually changed.
    edited = n.updatedAt != n.createdAt,
    mine = n.mine,
)

fun clientDetailUiState(
    snapshot: ClientDetailSnapshot,
    money: (Long, String) -> String,
): ClientDetailUiState {
    val o = snapshot.overview
    val currency = o.lifetimeCurrency

    val stats = listOf(
        ClientCopy.STAT_LIFETIME to
            (o.lifetimeValueCents?.takeIf { it > 0L }?.let { money(it, currency ?: "USD") }
                ?: ClientCopy.NO_LIFETIME),
        ClientCopy.STAT_TRIPS to
            (if (o.activeTripCount > 0) "${o.tripCount} · ${o.activeTripCount} active"
             else o.tripCount.toString()),
        ClientCopy.STAT_COMMISSION to
            (o.commissionCents?.takeIf { it > 0L }?.let { money(it, currency ?: "USD") }
                ?: ClientCopy.NO_LIFETIME),
        ClientCopy.STAT_LAST_CONTACT to (monthDayYear(o.lastContactAt) ?: ClientCopy.NO_TRIP),
    )

    return ClientDetailUiState(
        clientId = o.clientId,
        displayName = o.displayName,
        initials = o.initials,
        contactLine = o.email ?: o.phone ?: ClientCopy.NO_EMAIL,
        phone = o.phone,
        tags = o.tags,
        archived = o.archived,
        sinceLabel = monthAndYear(o.createdAt) ?: "",
        tabs = listOf(
            ClientTabUi("overview", ClientCopy.TAB_OVERVIEW),
            ClientTabUi("trips", "${ClientCopy.TAB_TRIPS} · ${o.tripCount}"),
            ClientTabUi("messages", ClientCopy.TAB_MESSAGES),
            ClientTabUi("documents", "${ClientCopy.TAB_DOCUMENTS} · ${o.documentCount}"),
            ClientTabUi("notes", "${ClientCopy.TAB_NOTES} · ${o.noteCount}"),
            ClientTabUi("activity", ClientCopy.TAB_ACTIVITY),
        ),
        snapshot = listOf(
            ClientCopy.LABEL_PHONE to (o.phone ?: ClientCopy.NO_TRIP),
            ClientCopy.LABEL_EMAIL to (o.email ?: ClientCopy.NO_EMAIL),
            ClientCopy.LABEL_ADDRESS to (o.addressLine ?: ClientCopy.NO_ADDRESS),
        ),
        preferences = o.preferredDestinations + o.travelStyles + o.dietaryRestrictions +
            o.accessibilityNeeds +
            o.loyaltyPrograms.map { (program, tier) ->
                if (tier == null) program else "$program · $tier"
            },
        preferenceNotes = listOfNotNull(o.dietaryNote, o.accessibilityNote),
        snapshotNote = o.snapshotNote,
        stats = stats,
        moneyExcludesACurrency = o.lifetimeCurrencyCount > 1,
        currencyNote = rosterCurrencyNote(if (o.lifetimeCurrencyCount > 1) 1 else 0),
        household = snapshot.companions.map { c ->
            HouseholdUi(
                companionId = c.companionId,
                name = c.name,
                initials = c.initials,
                line = listOfNotNull(
                    c.relationship,
                    monthDayYear(c.passportExpiry)?.let { "Passport $it" },
                ).takeIf { it.isNotEmpty() }?.joinToString(" · "),
                passportExpiringSoon = passportExpiringSoon(c.passportExpiry, o.asOfDate),
            )
        },
        trips = snapshot.trips.map { t ->
            ClientTripUi(
                tripId = t.tripId,
                title = t.title,
                line = tripLine(t),
                valueLabel = money(t.totalValueCents, t.currency),
                commissionLabel = money(t.commissionCents, t.currency),
                status = t.status,
                bucket = tripBucket(t),
            )
        },
        threads = snapshot.threads.map { t ->
            ClientThreadUi(
                conversationId = t.conversationId,
                // `conversation.subject` is nullable, and a blank row is worse than a
                // borrowed name.
                subject = t.subject?.takeIf { it.isNotBlank() } ?: t.tripTitle ?: "Conversation",
                preview = t.preview,
                whenLabel = monthDayYear(t.lastMessageAt) ?: "",
                unread = t.unread,
            )
        },
        documents = snapshot.documents.map { d ->
            ClientDocumentUi(
                documentId = d.documentId,
                filename = d.filename,
                line = listOfNotNull(d.tripTitle, fileSizeLabel(d.sizeBytes)).joinToString(" · "),
                badge = documentBadge(d.mimeType, d.filename),
                sensitive = d.sensitive,
            )
        },
        notes = snapshot.notes.map(::noteUi),
        activity = snapshot.activity.map { a ->
            ClientActivityUi(
                eventId = a.eventId,
                description = describeEvent(a.eventType),
                actorName = a.actorName,
                whenLabel = monthDayYear(a.createdAt) ?: "",
            )
        },
    )
}
