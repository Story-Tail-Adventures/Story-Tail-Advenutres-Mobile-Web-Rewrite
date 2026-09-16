package com.storytail.adventures.api

import com.storytail.adventures.domain.trip.TripStatus
import com.storytail.adventures.domain.trip.daysUntilDeparture
import com.storytail.adventures.domain.trip.tripStatusPresentation
import com.storytail.adventures.domain.trip.StatusChip
import com.storytail.adventures.config.SupabaseConfig
import com.storytail.adventures.domain.messages.inboxTitle
import com.storytail.adventures.domain.trip.MessageSender
import com.storytail.adventures.domain.uuidV7
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.functions.functions
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.query.Columns
import io.github.jan.supabase.postgrest.query.Order
import io.github.jan.supabase.postgrest.query.filter.FilterOperator
import io.ktor.client.request.url
import io.ktor.client.statement.bodyAsText
import io.ktor.http.HttpMethod
import kotlinx.coroutines.CancellationException
import kotlinx.datetime.LocalDate
import kotlinx.datetime.daysUntil
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/**
 * The §2.2 reads.
 *
 * PARALLEL IMPLEMENTATION of web/lib/trips/queries.ts, and the same two rules apply:
 *
 *  * EVERY SELECT NAMES ITS COLUMNS. `trip_read_policies` revokes the table-level SELECT
 *    grant and grants back a column list, so a `select("*")` raises 42501 rather than simply
 *    returning fewer columns. That is a feature — it means an accidental `*` fails loudly
 *    instead of shipping a column somebody decided a client should not see.
 *  * Reads go through the CALLER'S OWN SESSION, never the service role. The policies are
 *    what scope the rows to this traveler; a service-role read here would bypass the very
 *    thing that makes the data safe to render.
 *
 * Unlike the onboarding repository, the failure mode here FAILS CLOSED: a dashboard that
 * cannot read its trips shows §5's error state, because the alternative — an empty state —
 * tells a traveler they have no trips, which is a lie that looks like data loss.
 */
interface TripRepository {

    /** Everything Screen 2.2.1 renders, or null when the read failed. */
    suspend fun dashboard(today: LocalDate): DashboardSnapshot?

    /** Screen 2.2.2's list plus the five tab counts, or null when the read failed. */
    suspend fun trips(filter: TripFilter, today: LocalDate): TripsList?

    /** Screen 2.2.3, or null when the trip is not the caller's — RLS makes those the same. */
    suspend fun tripDetail(tripId: String, today: LocalDate): TripDetailSnapshot?

    /** Screens 2.2.4/2.2.5. Null when there is no READABLE itinerary — a draft is invisible. */
    suspend fun itinerary(tripId: String, today: LocalDate): ItineraryView?

    /** The name to greet somebody by, or null. */
    suspend fun greetableFirstName(): String?

    /** Screen 2.2.6, or null when the trip is not the caller's — RLS makes those the same. */
    suspend fun tripDocuments(tripId: String): TripDocumentsSnapshot?

    /** Screen 2.2.7. A trip with no conversation yet is an EMPTY thread, not a failure. */
    suspend fun tripThread(tripId: String): TripThreadSnapshot?

    /**
     * Sign a short-lived read URL for one document, for 2.2.6's open action.
     *
     * This is the ONLY way either stack opens a stored file. `document.storage_key` is
     * outside the client column grant and Storage is addressed by key, so the bucket has no
     * authenticated policies at all and this Edge Function is the single door — see
     * supabase/functions/trip-document-url/index.ts. On native that is not a convenience:
     * Compose Multiplatform has no server, so without it 2.2.6 cannot open a file at all.
     */
    suspend fun signDocumentUrl(documentId: String): SignedDocument

    /** Send a message on a trip thread, for 2.2.7's compose bar. */
    suspend fun sendMessage(tripId: String, body: String): SendMessageOutcome

    // ── Screen Inventory §2.6, Messaging ────────────────────────────────────────
    //
    // WHY §2.6 IS HERE AND NOT IN A MessagesRepository OF ITS OWN. The interface name is a
    // little wrong for it — a general thread has no trip — and that was weighed against the
    // alternative, which is worse: every row type and helper in this file is file-private, so
    // a separate repository would have to re-implement the message read and its
    // message_attachment → document embed. That read is the one piece of logic whose
    // divergence would make 2.6.2 and 2.2.7 show different threads, which is the single thing
    // this section is built to prevent. So they share `threadMessages` instead, and the name
    // is the price. Rename the interface when §3.x gives the agent side its own.

    /** Screen 2.6.1's list. Null on a failed read; EMPTY means no conversations. */
    suspend fun inbox(): List<InboxConversationView>?

    /**
     * Screen 2.6.2, addressed by CONVERSATION rather than by trip.
     *
     * Not [tripThread]: that one resolves the conversation from a trip and cannot reach a row
     * with `trip_id IS NULL`, so it would miss exactly the threads 2.6.3 creates.
     *
     * Null covers no such row, not yours, and archived alike — `conversation_self_select`
     * makes all three invisible, so none of them can be told apart and none of them should be.
     */
    suspend fun conversationThread(conversationId: String): ConversationThreadSnapshot?

    /** Send into an existing thread, for 2.6.2's compose bar. */
    suspend fun sendToConversation(conversationId: String, body: String): SendMessageOutcome

    /**
     * Start — or continue — the general thread, for 2.6.3.
     *
     * SENDS NEITHER ID, which is what tells `trip-message` to find-or-create against
     * `trip_id IS NULL`, so a traveler who writes twice lands in one thread rather than two.
     * Returns the conversation id so the screen can push straight into it.
     */
    suspend fun startConversation(body: String): StartConversationOutcome

    /** Screen 2.2.11. Null when the trip is not the caller's. */
    suspend fun pastTrip(tripId: String, today: LocalDate): PastTripSnapshot?

    /** Screen 2.2.9, the notification landing. */
    suspend fun statusChange(tripId: String, today: LocalDate): StatusChangeSnapshot?

    /** Save or submit a reflection, for 2.2.11. */
    suspend fun saveReflection(
        tripId: String,
        body: String,
        existingId: String?,
        submit: Boolean,
    ): SendMessageOutcome
}

data class ClientReflection(
    val id: String,
    val body: String,
    val rating: Int?,
    val status: String,
) {
    /** False once it leaves `draft` — the Edge Function refuses edits after that. */
    val editable: Boolean get() = status == "draft"
}

data class PastTripSnapshot(
    val trip: TripSummary,
    /** `itinerary.closing_note` if readable, else `intro_note`. See the web twin for why. */
    val noteFromGyasi: String?,
    val photos: List<TripDocumentView>,
    val documentCount: Int,
    val itineraryReady: Boolean,
    val nights: Int?,
    val reflection: ClientReflection?,
)

data class SentProposal(
    val id: String,
    val coverTitle: String?,
    val versionNumber: Int,
    val sentAt: String?,
)

data class StatusChangeSnapshot(
    val trip: TripSummary,
    /** `trip.status_changed_at`. Null is a real state — a trip whose status never moved. */
    val changedAt: String?,
    val proposal: SentProposal?,
    val itineraryReady: Boolean,
    val nextPayment: PaymentMilestoneView?,
)

data class TripDocumentView(
    val id: String,
    val kind: String,
    val filename: String,
    val mimeType: String,
    val sizeBytes: Long,
    val createdAt: String,
    /** True when `owner_user_id` is the caller's own platform user — the §2.2.6 uploaded-by. */
    val mine: Boolean,
)

data class TripDocumentsSnapshot(
    val tripId: String,
    val tripTitle: String,
    val documents: List<TripDocumentView>,
)

data class ThreadMessageView(
    val id: String,
    val sender: MessageSender,
    val body: String,
    val createdAt: String,
    val attachments: List<TripDocumentView>,
)

data class TripThreadSnapshot(
    val tripId: String,
    val tripTitle: String,
    val conversationId: String?,
    val unreadCount: Int,
    val messages: List<ThreadMessageView>,
)

/** One row of Screen 2.6.1's list. */
data class InboxConversationView(
    val id: String,
    /** Null on a general thread — nothing sets a subject on one. See `inboxTitle`. */
    val subject: String?,
    val tripId: String?,
    val tripTitle: String?,
    val lastMessageAt: String,
    val lastMessagePreview: String?,
    /**
     * Granted and rendered, but no runtime path in this repo raises it: `trip-message` sets it
     * to 0 at creation and only ever increments the agent's side. `seed.sql` hand-writes a 2 so
     * §2.2.3 has an unread state to show. It starts meaning something when the agent send path
     * lands in §3.x.
     */
    val unreadCount: Int,
)

/** Screen 2.6.2's thread. [tripId] null is what suppresses "Open trip". */
data class ConversationThreadSnapshot(
    val conversationId: String,
    val title: String,
    val tripId: String?,
    val unreadCount: Int,
    val messages: List<ThreadMessageView>,
)

sealed interface StartConversationOutcome {
    /** [conversationId] is what 2.6.3 pushes into once the message is away. */
    data class Started(val conversationId: String) : StartConversationOutcome
    data class Failed(val detail: String?) : StartConversationOutcome
}

sealed interface SignedDocument {
    /** An ABSOLUTE url, already joined to this build's Supabase origin. */
    data class Ok(val url: String, val filename: String, val mimeType: String) : SignedDocument
    data object Failed : SignedDocument
}

sealed interface SendMessageOutcome {
    data object Sent : SendMessageOutcome

    /**
     * `detail` is only ever populated from a 4xx problem+json body — messages we wrote. A
     * 5xx detail carries whatever Postgres said, which belongs in the function log and not
     * in front of a traveler.
     */
    data class Failed(val detail: String?) : SendMessageOutcome
}

/**
 * `itinerary_day.weather_forecast`, which is agent-authored and cached with a TTL — not a
 * live API. BRD §9 names no weather integration, and this column is why none is needed at
 * MVP. Every field is optional because the agent fills in what he knows.
 */
@Serializable
data class DayWeather(
    @SerialName("high_f") val highF: Int? = null,
    @SerialName("low_f") val lowF: Int? = null,
    val summary: String? = null,
    @SerialName("wind_mph") val windMph: Int? = null,
    @SerialName("wind_dir") val windDir: String? = null,
    @SerialName("uv_index") val uvIndex: Int? = null,
) {
    val isEmpty: Boolean
        get() = highF == null && lowF == null && summary == null &&
            windMph == null && windDir == null && uvIndex == null
}

data class ItineraryActivity(
    val id: String,
    val block: String,
    val startTime: String?,
    val endTime: String?,
    val title: String,
    val body: String?,
    val location: String?,
    val address: String?,
    val phone: String?,
    val confirmationNumber: String?,
    /** Design-System §2.4's voice-forward moment inside a day. */
    val gyasisTip: String?,
)

data class ItineraryDay(
    val id: String,
    val dayNumber: Int,
    val date: LocalDate?,
    val label: String?,
    val summary: String?,
    val weather: DayWeather?,
    val activities: List<ItineraryActivity>,
)

data class ItineraryView(
    val trip: TripSummary,
    val introNote: String?,
    val closingNote: String?,
    val days: List<ItineraryDay>,
    /** Which component kinds the trip HAS, so 2.2.8 can only claim what is actually absent. */
    val componentKinds: List<String>,
    val insuranceReference: String?,
    val emergencyName: String?,
    val emergencyPhone: String?,
)

/** The filter tabs 2.2.2 offers. ALL is not a status — it is the absence of one. */
enum class TripFilter { ALL, UPCOMING, PLANNING, PAST, CANCELLED }

data class TripsList(
    val trips: List<TripSummary>,
    /** Counts for every tab, from the same snapshot, so a tab never lies about its contents. */
    val counts: Map<TripFilter, Int>,
)

data class PaymentMilestoneView(
    val id: String,
    val kind: String,
    val label: String,
    val amountCents: Long,
    val paidCents: Long,
    val currency: String,
    val dueDate: LocalDate?,
    val status: String,
)

data class TripDetailSnapshot(
    val trip: TripSummary,
    /** Client-visible since the Data-Model §21 reclassification, which exists for 2.2.10. */
    val cancellationReason: String?,
    val refundStatus: String?,
    /**
     * `itinerary.intro_note`, NOT `trip.notes` — the latter is the agent's own thinking and
     * is outside the client column grant. Design-System §2.4 names this the voice-forward
     * surface of the trip.
     */
    val introNote: String?,
    val itineraryReady: Boolean,
    val dayCount: Int,
    val componentCount: Int,
    val documentCount: Int,
    val unreadCount: Int,
    val milestones: List<PaymentMilestoneView>,
)

/** One trip, with its derived presentation already resolved. */
data class TripSummary(
    val id: String,
    val title: String,
    val tripType: String,
    val status: TripStatus,
    val startDate: LocalDate?,
    val endDate: LocalDate?,
    val destinations: List<String>,
    val travelerCount: Int,
    val totalValueCents: Long,
    val totalPaidCents: Long,
    val currency: String,
    val chip: StatusChip,
    val statusLabel: String,
    val daysUntil: Int?,
)

data class NextPayment(
    val label: String,
    val amountCents: Long,
    val currency: String,
    val dueDate: LocalDate?,
    val daysUntilDue: Int?,
)

/**
 * The last message on the newest thread, for the dashboard's advisor card.
 *
 * NOT "the last thing Gyasi said": `conversation.last_message_preview` is the last thing
 * ANYBODY said, so without [fromAgent] a traveler's own question comes back quoted
 * underneath "Gyasi · Your advisor" as though he had said it. Caught by eye on the emulator
 * after sending a test message; the web twin had the identical defect.
 */
data class AdvisorMessage(
    val body: String,
    val tripId: String?,
    val conversationId: String,
    val unread: Int,
    val fromAgent: Boolean,
)

data class DashboardSnapshot(
    val upcoming: TripSummary?,
    val inPlanning: List<TripSummary>,
    val past: List<TripSummary>,
    val nextPayment: NextPayment?,
    val itineraryReady: Boolean,
    val latestMessage: AdvisorMessage?,
)

/** Before local.properties carries a URL and a key there is nothing to read. */
class UnconfiguredTripRepository : TripRepository {
    override suspend fun dashboard(today: LocalDate): DashboardSnapshot? = null
    override suspend fun trips(filter: TripFilter, today: LocalDate): TripsList? = null
    override suspend fun tripDetail(tripId: String, today: LocalDate): TripDetailSnapshot? = null
    override suspend fun itinerary(tripId: String, today: LocalDate): ItineraryView? = null
    override suspend fun greetableFirstName(): String? = null
    override suspend fun tripDocuments(tripId: String): TripDocumentsSnapshot? = null
    override suspend fun tripThread(tripId: String): TripThreadSnapshot? = null
    override suspend fun signDocumentUrl(documentId: String): SignedDocument = SignedDocument.Failed
    override suspend fun inbox(): List<InboxConversationView>? = null
    override suspend fun conversationThread(conversationId: String): ConversationThreadSnapshot? = null
    override suspend fun sendToConversation(conversationId: String, body: String): SendMessageOutcome =
        SendMessageOutcome.Failed(null)
    override suspend fun startConversation(body: String): StartConversationOutcome =
        StartConversationOutcome.Failed(null)
    override suspend fun sendMessage(tripId: String, body: String): SendMessageOutcome =
        SendMessageOutcome.Failed(null)
    override suspend fun pastTrip(tripId: String, today: LocalDate): PastTripSnapshot? = null
    override suspend fun statusChange(tripId: String, today: LocalDate): StatusChangeSnapshot? = null
    override suspend fun saveReflection(
        tripId: String,
        body: String,
        existingId: String?,
        submit: Boolean,
    ): SendMessageOutcome = SendMessageOutcome.Failed(null)
}

/** Which statuses each tab shows. Mirrors FILTER_STATUSES in web/lib/trips/queries.ts. */
private val FILTER_STATUSES: Map<TripFilter, Set<TripStatus>> = mapOf(
    // UPCOMING is booked-or-travelling rather than "starts in the future": a trip that began
    // yesterday is not upcoming, and a booked trip with no dates yet still is.
    TripFilter.UPCOMING to setOf(TripStatus.BOOKED, TripStatus.IN_PROGRESS),
    TripFilter.PLANNING to setOf(TripStatus.INQUIRY, TripStatus.PROPOSAL),
    TripFilter.PAST to setOf(TripStatus.COMPLETED),
    TripFilter.CANCELLED to setOf(TripStatus.CANCELLED),
)

class SupabaseTripRepository(
    private val client: SupabaseClient,
) : TripRepository {

    private val json = Json { ignoreUnknownKeys = true }

    override suspend fun dashboard(today: LocalDate): DashboardSnapshot? {
        val trips = read {
            client.postgrest.from("trip")
                .select(
                    Columns.list(
                        "id", "title", "trip_type", "status", "start_date", "end_date",
                        "destinations", "traveler_count", "total_value_cents",
                        "total_paid_cents", "currency",
                    ),
                ) {
                    order("start_date", Order.ASCENDING, nullsFirst = false)
                }
                .decodeList<TripRow>()
        } ?: return null

        // The hero: the soonest trip that has not finished. `in_progress` outranks `booked`
        // because somebody already travelling should see THAT trip, not the next one.
        val active = trips.filter { it.status == "booked" || it.status == "in_progress" }
        val upcomingRow = active.firstOrNull { it.status == "in_progress" } ?: active.firstOrNull()

        var nextPayment: NextPayment? = null
        var itineraryReady = false
        var nextUnpaidDue: LocalDate? = null

        if (upcomingRow != null) {
            val milestones = read {
                client.postgrest.from("payment_milestone")
                    .select(
                        Columns.list("label", "amount_cents", "currency", "due_date", "status", "order_index"),
                    ) {
                        filter {
                            eq("trip_id", upcomingRow.id)
                            neq("status", "paid")
                            neq("status", "waived")
                        }
                        order("order_index", Order.ASCENDING)
                    }
                    .decodeList<MilestoneRow>()
            }
            val next = milestones?.firstOrNull()
            if (next != null) {
                nextUnpaidDue = next.due_date?.let(::parseDate)
                nextPayment = NextPayment(
                    label = next.label,
                    amountCents = next.amount_cents,
                    currency = next.currency,
                    dueDate = nextUnpaidDue,
                    daysUntilDue = nextUnpaidDue?.let { daysUntilDeparture(it, today) },
                )
            }

            // `published_at` is the access boundary, not just a flag: an unpublished
            // itinerary is invisible to this session entirely, so a row coming back at all
            // means it is readable.
            val itinerary = read {
                client.postgrest.from("itinerary")
                    .select(Columns.list("id", "published_at")) {
                        filter { eq("trip_id", upcomingRow.id) }
                        limit(1)
                    }
                    .decodeList<ItineraryRow>()
            }
            itineraryReady = itinerary?.firstOrNull()?.published_at != null
        }

        val conversation = read {
            client.postgrest.from("conversation")
                .select(
                    Columns.list(
                        "id", "trip_id", "last_message_preview", "last_message_at",
                        "client_unread_count",
                    ),
                ) {
                    order("last_message_at", Order.DESCENDING)
                    limit(1)
                }
                .decodeList<ConversationRow>()
        }?.firstOrNull()

        // Who spoke last. `conversation` denormalises the preview but not the sender, so
        // this is one more round trip — worth it, because without it the card
        // misattributes the traveler's own words to their advisor.
        val lastSender = conversation?.last_message_preview?.let {
            read {
                client.postgrest.from("message")
                    .select(Columns.list("sender_role")) {
                        filter { eq("conversation_id", conversation.id) }
                        order("created_at", Order.DESCENDING)
                        limit(1)
                    }
                    .decodeList<SenderRow>()
                    .firstOrNull()
                    ?.sender_role
            }
        }

        return DashboardSnapshot(
            upcoming = upcomingRow?.toSummary(today, nextUnpaidDue),
            inPlanning = trips
                .filter { it.status == "inquiry" || it.status == "proposal" }
                .map { it.toSummary(today) },
            past = trips
                .filter { it.status == "completed" }
                .sortedByDescending { it.start_date ?: "" }
                .map { it.toSummary(today) },
            nextPayment = nextPayment,
            itineraryReady = itineraryReady,
            latestMessage = conversation?.last_message_preview?.let {
                AdvisorMessage(
                    body = it,
                    tripId = conversation.trip_id,
                    conversationId = conversation.id,
                    unread = conversation.client_unread_count ?: 0,
                    fromAgent = lastSender == "agent",
                )
            },
        )
    }

    override suspend fun trips(filter: TripFilter, today: LocalDate): TripsList? {
        val rows = read {
            client.postgrest.from("trip")
                .select(
                    Columns.list(
                        "id", "title", "trip_type", "status", "start_date", "end_date",
                        "destinations", "traveler_count", "total_value_cents",
                        "total_paid_cents", "currency",
                    ),
                ) {
                    order("start_date", Order.DESCENDING, nullsFirst = false)
                }
                .decodeList<TripRow>()
        } ?: return null

        fun countOf(f: TripFilter) =
            rows.count { TripStatus.fromWire(it.status) in (FILTER_STATUSES[f] ?: emptySet()) }

        val counts = mapOf(
            TripFilter.ALL to rows.size,
            TripFilter.UPCOMING to countOf(TripFilter.UPCOMING),
            TripFilter.PLANNING to countOf(TripFilter.PLANNING),
            TripFilter.PAST to countOf(TripFilter.PAST),
            TripFilter.CANCELLED to countOf(TripFilter.CANCELLED),
        )

        val visible = if (filter == TripFilter.ALL) {
            rows
        } else {
            rows.filter { TripStatus.fromWire(it.status) in (FILTER_STATUSES[filter] ?: emptySet()) }
        }

        // The earliest unpaid milestone PER TRIP. Without it this list labels the same trip
        // differently from the dashboard — tripStatusPresentation needs a due date to turn
        // "Booked" into "Final payment due", so a list that omits it says Booked while the
        // hero two taps away says Final payment due. One query for the page, not one per row.
        val bookedIds = visible
            .filter { it.status == "booked" || it.status == "in_progress" }
            .map { it.id }

        val dueByTrip = mutableMapOf<String, LocalDate>()
        if (bookedIds.isNotEmpty()) {
            val milestones = read {
                client.postgrest.from("payment_milestone")
                    .select(Columns.list("trip_id", "due_date", "order_index", "status")) {
                        filter {
                            isIn("trip_id", bookedIds)
                            neq("status", "paid")
                            neq("status", "waived")
                        }
                        order("order_index", Order.ASCENDING)
                    }
                    .decodeList<MilestoneTripRow>()
            }
            for (m in milestones.orEmpty()) {
                val due = m.due_date?.let(::parseDate) ?: continue
                if (m.trip_id !in dueByTrip) dueByTrip[m.trip_id] = due
            }
        }

        return TripsList(
            trips = visible.map { it.toSummary(today, dueByTrip[it.id]) },
            counts = counts,
        )
    }

    override suspend fun tripDetail(tripId: String, today: LocalDate): TripDetailSnapshot? {
        val row = read {
            client.postgrest.from("trip")
                .select(
                    Columns.list(
                        "id", "title", "trip_type", "status", "start_date", "end_date",
                        "destinations", "traveler_count", "total_value_cents",
                        "total_paid_cents", "currency", "cancellation_reason", "refund_status",
                    ),
                ) {
                    filter { eq("id", tripId) }
                    limit(1)
                }
                .decodeList<TripDetailRow>()
                .firstOrNull()
        } ?: return null

        val itinerary = read {
            client.postgrest.from("itinerary")
                .select(Columns.list("id", "intro_note", "closing_note", "published_at")) {
                    filter { eq("trip_id", tripId) }
                    limit(1)
                }
                .decodeList<ItineraryDetailRow>()
                .firstOrNull()
        }

        val milestones = read {
            client.postgrest.from("payment_milestone")
                .select(
                    Columns.list(
                        "id", "kind", "label", "amount_cents", "paid_cents", "currency",
                        "due_date", "status", "order_index",
                    ),
                ) {
                    filter { eq("trip_id", tripId) }
                    order("order_index", Order.ASCENDING)
                }
                .decodeList<MilestoneDetailRow>()
        }.orEmpty().map {
            PaymentMilestoneView(
                id = it.id,
                kind = it.kind,
                label = it.label,
                amountCents = it.amount_cents,
                paidCents = it.paid_cents,
                currency = it.currency,
                dueDate = it.due_date?.let(::parseDate),
                status = it.status,
            )
        }

        val components = read {
            client.postgrest.from("trip_component")
                .select(Columns.list("id")) { filter { eq("trip_id", tripId) } }
                .decodeList<IdOnlyRow>()
        }.orEmpty()

        val documents = read {
            client.postgrest.from("document")
                .select(Columns.list("id")) { filter { eq("trip_id", tripId) } }
                .decodeList<IdOnlyRow>()
        }.orEmpty()

        val conversation = read {
            client.postgrest.from("conversation")
                .select(Columns.list("id", "client_unread_count")) {
                    filter { eq("trip_id", tripId) }
                    limit(1)
                }
                .decodeList<ConversationCountRow>()
                .firstOrNull()
        }

        // Days are counted only when the itinerary is readable at all. An unpublished one is
        // invisible to this session, so a count from it is always zero and would imply
        // "no days" rather than "not published yet".
        var dayCount = 0
        if (itinerary?.published_at != null) {
            dayCount = read {
                client.postgrest.from("itinerary_day")
                    .select(Columns.list("id")) { filter { eq("itinerary_id", itinerary.id) } }
                    .decodeList<IdOnlyRow>()
            }.orEmpty().size
        }

        val nextUnpaid = milestones.firstOrNull { it.status != "paid" && it.status != "waived" }

        return TripDetailSnapshot(
            trip = row.toSummary(today, nextUnpaid?.dueDate),
            cancellationReason = row.cancellation_reason,
            refundStatus = row.refund_status,
            introNote = itinerary?.intro_note,
            itineraryReady = itinerary?.published_at != null,
            dayCount = dayCount,
            componentCount = components.size,
            documentCount = documents.size,
            unreadCount = conversation?.client_unread_count ?: 0,
            milestones = milestones,
        )
    }

    override suspend fun itinerary(tripId: String, today: LocalDate): ItineraryView? {
        val trip = read {
            client.postgrest.from("trip")
                .select(
                    Columns.list(
                        "id", "title", "trip_type", "status", "start_date", "end_date",
                        "destinations", "traveler_count", "total_value_cents",
                        "total_paid_cents", "currency",
                    ),
                ) {
                    filter { eq("id", tripId) }
                    limit(1)
                }
                .decodeList<TripRow>()
                .firstOrNull()
        } ?: return null

        // An unpublished itinerary is invisible to this session entirely, so "not published"
        // and "no itinerary" arrive identically here. The screen decides what to say.
        val itinerary = read {
            client.postgrest.from("itinerary")
                .select(Columns.list("id", "intro_note", "closing_note", "published_at")) {
                    filter { eq("trip_id", tripId) }
                    limit(1)
                }
                .decodeList<ItineraryDetailRow>()
                .firstOrNull()
        } ?: return null

        val dayRows = read {
            client.postgrest.from("itinerary_day")
                .select(
                    Columns.list("id", "day_number", "date", "label", "summary", "weather_forecast"),
                ) {
                    filter { eq("itinerary_id", itinerary.id) }
                    order("day_number", Order.ASCENDING)
                }
                .decodeList<DayRow>()
        }.orEmpty()

        val activityRows = if (dayRows.isEmpty()) {
            emptyList()
        } else {
            read {
                client.postgrest.from("itinerary_activity")
                    .select(
                        Columns.list(
                            "id", "itinerary_day_id", "block", "start_time", "end_time", "title",
                            "body", "location", "address", "phone", "confirmation_number",
                            "gyasis_tip", "order_index",
                        ),
                    ) {
                        filter { isIn("itinerary_day_id", dayRows.map { it.id }) }
                        order("order_index", Order.ASCENDING)
                    }
                    .decodeList<ActivityRow>()
            }.orEmpty()
        }

        val components = read {
            client.postgrest.from("trip_component")
                .select(Columns.list("kind", "confirmation_number")) {
                    filter { eq("trip_id", tripId) }
                }
                .decodeList<ComponentKindRow>()
        }.orEmpty()

        val emergency = read {
            client.postgrest.from("client")
                .select(Columns.list("emergency_contact"))
                .decodeSingleOrNull<EmergencyRow>()
        }?.emergency_contact

        val byDay = activityRows.groupBy { it.itinerary_day_id }

        return ItineraryView(
            trip = trip.toSummary(today),
            introNote = itinerary.intro_note,
            closingNote = itinerary.closing_note,
            days = dayRows.map { d ->
                ItineraryDay(
                    id = d.id,
                    dayNumber = d.day_number,
                    date = d.date?.let(::parseDate),
                    label = d.label,
                    summary = d.summary,
                    weather = d.weather_forecast?.takeIf { !it.isEmpty },
                    activities = byDay[d.id].orEmpty().map { a ->
                        ItineraryActivity(
                            id = a.id,
                            block = a.block,
                            startTime = a.start_time,
                            endTime = a.end_time,
                            title = a.title,
                            body = a.body,
                            location = a.location,
                            address = a.address,
                            phone = a.phone,
                            confirmationNumber = a.confirmation_number,
                            gyasisTip = a.gyasis_tip,
                        )
                    },
                )
            },
            componentKinds = components.map { it.kind },
            insuranceReference = components.firstOrNull { it.kind == "insurance" }?.confirmation_number,
            emergencyName = emergency?.name,
            emergencyPhone = emergency?.phone,
        )
    }

    override suspend fun greetableFirstName(): String? = read {
        client.postgrest.from("client")
            .select(Columns.list("first_name", "preferred_name"))
            .decodeSingleOrNull<NameRow>()
    }?.greetable()

    override suspend fun tripDocuments(tripId: String): TripDocumentsSnapshot? {
        val trip = read {
            client.postgrest.from("trip")
                .select(Columns.list("id", "title")) {
                    filter { eq("id", tripId) }
                    limit(1)
                }
                .decodeList<TitleRow>()
                .firstOrNull()
        } ?: return null

        // `storage_key` is deliberately NOT selected. It is outside the column grant, so
        // naming it raises 42501 — and the whole point of trip-document-url is that the
        // client never holds a key.
        val rows = read {
            client.postgrest.from("document")
                .select(
                    Columns.list(
                        "id", "owner_user_id", "kind", "filename",
                        "mime_type", "size_bytes", "created_at",
                    ),
                ) {
                    filter { eq("trip_id", tripId) }
                    order("created_at", Order.DESCENDING)
                }
                .decodeList<DocumentRow>()
        } ?: return null

        val myUserId = currentPlatformUserId()

        return TripDocumentsSnapshot(
            tripId = trip.id,
            tripTitle = trip.title,
            documents = rows.map { it.toView(myUserId) },
        )
    }

    override suspend fun tripThread(tripId: String): TripThreadSnapshot? {
        val trip = read {
            client.postgrest.from("trip")
                .select(Columns.list("id", "title")) {
                    filter { eq("id", tripId) }
                    limit(1)
                }
                .decodeList<TitleRow>()
                .firstOrNull()
        } ?: return null

        val conversation = read {
            client.postgrest.from("conversation")
                .select(Columns.list("id", "client_unread_count")) {
                    filter { eq("trip_id", tripId) }
                    limit(1)
                }
                .decodeList<ConversationCountRow>()
                .firstOrNull()
        }

        // No conversation is a real state, not an error: the row is created by trip-message
        // on the first send. It renders as the empty thread.
        if (conversation == null) {
            return TripThreadSnapshot(trip.id, trip.title, null, 0, emptyList())
        }

        val messages = threadMessages(conversation.id) ?: return null

        return TripThreadSnapshot(
            tripId = trip.id,
            tripTitle = trip.title,
            conversationId = conversation.id,
            unreadCount = conversation.client_unread_count ?: 0,
            messages = messages,
        )
    }

    /**
     * Every message in one conversation, oldest first, with its readable attachments.
     *
     * SHARED BY 2.2.7 AND 2.6.2 — extracted when §2.6 landed, and the extraction is the point
     * rather than a tidy-up. The mobile artboard says 2.6.2 "is not a new screen", so the two
     * screens must not be able to render the same conversation differently; one read is how
     * that is enforced rather than hoped for.
     *
     * `is_internal_note` is not filtered here, and that is not an omission: it is outside the
     * client column grant, so naming it would raise 42501. The filtering lives in
     * `message_self_select`, which carries `is_internal_note = false` as a ROW predicate — the
     * internal notes are invisible rather than redacted.
     *
     * Null is a failed read. An EMPTY list is a real conversation with nothing in it, which
     * `trip-message` can genuinely leave behind because it is not atomic.
     */
    private suspend fun threadMessages(conversationId: String): List<ThreadMessageView>? {
        val messageRows = read {
            client.postgrest.from("message")
                .select(Columns.list("id", "sender_role", "body", "created_at")) {
                    filter { eq("conversation_id", conversationId) }
                    order("created_at", Order.ASCENDING)
                }
                .decodeList<MessageRow>()
        } ?: return null

        val myUserId = currentPlatformUserId()

        // One query for the whole thread rather than one per message. The embed goes
        // message_attachment → document, and `document`'s own policy still applies to the
        // embedded side: an attachment pointing at a `receipt` comes back with a null
        // document and is dropped, which is why this is not an inner join.
        val attachments = if (messageRows.isEmpty()) {
            emptyMap()
        } else {
            read {
                client.postgrest.from("message_attachment")
                    .select(
                        Columns.raw(
                            "message_id, document:document_id(id, owner_user_id, kind, " +
                                "filename, mime_type, size_bytes, created_at)",
                        ),
                    ) {
                        filter { isIn("message_id", messageRows.map { it.id }) }
                    }
                    .decodeList<AttachmentRow>()
            }.orEmpty()
                .mapNotNull { row -> row.document?.let { row.message_id to it.toView(myUserId) } }
                .groupBy({ it.first }, { it.second })
        }

        return messageRows.map { row ->
            ThreadMessageView(
                id = row.id,
                sender = if (row.sender_role == "client") MessageSender.CLIENT else MessageSender.AGENT,
                body = row.body,
                createdAt = row.created_at,
                attachments = attachments[row.id].orEmpty(),
            )
        }
    }

    override suspend fun inbox(): List<InboxConversationView>? {
        // KEYED ON THE CLIENT, NOT A TRIP, which is the whole difference from every
        // conversation read §2.2 has: those are `eq("trip_id", …)` single-row lookups and none
        // of them can see a thread with no trip. `conversation_self_select` already scopes rows
        // to the caller, so this needs no filter of its own — and it carries
        // `archived_at IS NULL`, so there is no client-side archive view to build.
        //
        // The trip title is EMBEDDED rather than joined in a second pass; `trip`'s own policy
        // still applies to the embedded side, so an unreadable trip comes back null and the row
        // falls back to its subject.
        val rows = read {
            client.postgrest.from("conversation")
                .select(
                    Columns.raw(
                        "id, subject, trip_id, last_message_at, last_message_preview, " +
                            "client_unread_count, trip:trip_id(title)",
                    ),
                ) {
                    order("last_message_at", Order.DESCENDING)
                }
                .decodeList<InboxRow>()
        } ?: return null

        return rows.map { row ->
            InboxConversationView(
                id = row.id,
                subject = row.subject,
                tripId = row.trip_id,
                tripTitle = row.trip?.title,
                lastMessageAt = row.last_message_at,
                lastMessagePreview = row.last_message_preview,
                unreadCount = row.client_unread_count ?: 0,
            )
        }
    }

    override suspend fun conversationThread(conversationId: String): ConversationThreadSnapshot? {
        val conversation = read {
            client.postgrest.from("conversation")
                .select(
                    Columns.raw(
                        "id, subject, trip_id, client_unread_count, trip:trip_id(title)",
                    ),
                ) {
                    filter { eq("id", conversationId) }
                    limit(1)
                }
                .decodeList<ConversationThreadRow>()
                .firstOrNull()
        } ?: return null

        val messages = threadMessages(conversation.id) ?: return null

        return ConversationThreadSnapshot(
            conversationId = conversation.id,
            title = inboxTitle(conversation.subject, conversation.trip?.title),
            tripId = conversation.trip_id,
            unreadCount = conversation.client_unread_count ?: 0,
            messages = messages,
        )
    }

    override suspend fun sendToConversation(
        conversationId: String,
        body: String,
    ): SendMessageOutcome {
        val trimmed = body.trim()
        if (trimmed.isEmpty()) return SendMessageOutcome.Failed(null)

        val payload = buildJsonObject {
            put("messageId", JsonPrimitive(uuidV7()))
            // By CONVERSATION. A general thread has no trip to key on, so `sendMessage`
            // cannot serve 2.6.2 at all.
            put("conversationId", JsonPrimitive(conversationId))
            put("body", JsonPrimitive(trimmed))
        }

        return invokeTripMessage(payload).outcome
    }

    override suspend fun startConversation(body: String): StartConversationOutcome {
        val trimmed = body.trim()
        if (trimmed.isEmpty()) return StartConversationOutcome.Failed(null)

        val payload = buildJsonObject {
            put("messageId", JsonPrimitive(uuidV7()))
            // NEITHER id — see the interface note. This is what reaches the general thread.
            put("body", JsonPrimitive(trimmed))
        }

        val result = invokeTripMessage(payload)
        return when (val outcome = result.outcome) {
            is SendMessageOutcome.Sent ->
                result.conversationId?.let { StartConversationOutcome.Started(it) }
                    // Sent, but with no id to navigate to. Reported as failure would be a lie
                    // — the message is away — so the screen treats a null id as "go to the
                    // inbox", which is where it landed.
                    ?: StartConversationOutcome.Started("")
            is SendMessageOutcome.Failed -> StartConversationOutcome.Failed(outcome.detail)
        }
    }

    /**
     * One call site for `trip-message`, which is now three endpoints wearing one name.
     *
     * Shared so the error handling cannot drift between the three addressing modes: the
     * never-log-the-body rule is the kind of thing that gets remembered in two places out of
     * three.
     */
    private suspend fun invokeTripMessage(payload: JsonObject): TripMessageResult {
        val response = try {
            client.functions.invoke("trip-message", payload)
        } catch (cancellation: CancellationException) {
            throw cancellation
        } catch (throwable: Throwable) {
            // NEVER log the body — it is somebody's message.
            return TripMessageResult(SendMessageOutcome.Failed(null), null)
        }

        val text = runCatching { response.bodyAsText() }.getOrDefault("")

        if (response.status.value in 200..299) {
            val id = runCatching {
                json.decodeFromString<SendMessageResponse>(text).conversationId
            }.getOrNull()
            return TripMessageResult(SendMessageOutcome.Sent, id)
        }

        val detail = if (response.status.value in 400..499) problemDetail(text) else null
        return TripMessageResult(SendMessageOutcome.Failed(detail), null)
    }

    override suspend fun signDocumentUrl(documentId: String): SignedDocument {
        val response = try {
            client.functions.invoke("trip-document-url") {
                method = HttpMethod.Get
                url { parameters.append("documentId", documentId) }
            }
        } catch (cancellation: CancellationException) {
            throw cancellation
        } catch (throwable: Throwable) {
            // Never log the throwable: a storage error carries the key, which is the one
            // thing this whole path exists to withhold.
            return SignedDocument.Failed
        }

        if (response.status.value !in 200..299) return SignedDocument.Failed

        val body = runCatching {
            json.decodeFromString<SignedUrlResponse>(response.bodyAsText())
        }.getOrNull() ?: return SignedDocument.Failed

        // The function returns a PATH, not an absolute URL — Storage signs against the origin
        // it sees from inside its own container (`http://kong:8000` locally), which resolves
        // nowhere on a phone. See toStoragePath in supabase/functions/_shared/trip.ts. This
        // build already knows the right origin, so it does the joining.
        return SignedDocument.Ok(
            url = SupabaseConfig.URL.trimEnd('/') + body.path,
            filename = body.filename,
            mimeType = body.mimeType,
        )
    }

    override suspend fun sendMessage(tripId: String, body: String): SendMessageOutcome {
        val trimmed = body.trim()
        if (trimmed.isEmpty()) return SendMessageOutcome.Failed(null)

        val payload = buildJsonObject {
            // Minted here, per Data-Model §21.6 — `message.id` has no default and the
            // function validates the embedded timestamp is recent.
            put("messageId", JsonPrimitive(uuidV7()))
            put("tripId", JsonPrimitive(tripId))
            put("body", JsonPrimitive(trimmed))
        }

        val response = try {
            client.functions.invoke("trip-message", payload)
        } catch (cancellation: CancellationException) {
            throw cancellation
        } catch (throwable: Throwable) {
            // NEVER log the body — it is somebody's message.
            return SendMessageOutcome.Failed(null)
        }

        if (response.status.value in 200..299) return SendMessageOutcome.Sent

        val text = runCatching { response.bodyAsText() }.getOrDefault("")
        val detail = if (response.status.value in 400..499) problemDetail(text) else null
        return SendMessageOutcome.Failed(detail)
    }

    override suspend fun pastTrip(tripId: String, today: LocalDate): PastTripSnapshot? {
        val row = read {
            client.postgrest.from("trip")
                .select(
                    Columns.list(
                        "id", "title", "trip_type", "status", "start_date", "end_date",
                        "destinations", "traveler_count", "total_value_cents",
                        "total_paid_cents", "currency",
                    ),
                ) {
                    filter { eq("id", tripId) }
                    limit(1)
                }
                .decodeList<TripRow>()
                .firstOrNull()
        } ?: return null

        val itinerary = read {
            client.postgrest.from("itinerary")
                .select(Columns.list("id", "intro_note", "closing_note", "published_at")) {
                    filter { eq("trip_id", tripId) }
                    limit(1)
                }
                .decodeList<ItineraryDetailRow>()
                .firstOrNull()
        }

        val documents = read {
            client.postgrest.from("document")
                .select(
                    Columns.list(
                        "id", "owner_user_id", "kind", "filename",
                        "mime_type", "size_bytes", "created_at",
                    ),
                ) {
                    filter { eq("trip_id", tripId) }
                    order("created_at", Order.DESCENDING)
                }
                .decodeList<DocumentRow>()
        }.orEmpty()

        val reflection = read {
            client.postgrest.from("testimonial")
                .select(Columns.list("id", "body", "rating", "status")) {
                    filter { eq("trip_id", tripId) }
                    limit(1)
                }
                .decodeList<TestimonialRow>()
                .firstOrNull()
        }

        val myUserId = currentPlatformUserId()
        val views = documents.map { it.toView(myUserId) }

        return PastTripSnapshot(
            trip = row.toSummary(today),
            // `closing_note` first: an intro note reads oddly in the past tense, and the
            // closing note is where Gyasi writes the gratitude Design-System §2.4 names as
            // this screen's register. Same derivation as the web twin.
            noteFromGyasi = itinerary?.closing_note ?: itinerary?.intro_note,
            photos = views.filter { it.kind == "photo" },
            documentCount = views.size,
            itineraryReady = itinerary?.published_at != null,
            // Nights, computed here rather than borrowed from `nightsBetween` in
            // ui/components/client/TripParts.kt — that is a UI helper, and the api layer
            // pulling from the ui one is the wrong direction.
            nights = run {
                val from = row.start_date?.let(::parseDate)
                val to = row.end_date?.let(::parseDate)
                if (from != null && to != null) from.daysUntil(to) else null
            },
            reflection = reflection?.let {
                ClientReflection(it.id, it.body, it.rating, it.status)
            },
        )
    }

    override suspend fun statusChange(tripId: String, today: LocalDate): StatusChangeSnapshot? {
        val row = read {
            client.postgrest.from("trip")
                .select(
                    Columns.list(
                        "id", "title", "trip_type", "status", "status_changed_at", "start_date",
                        "end_date", "destinations", "traveler_count", "total_value_cents",
                        "total_paid_cents", "currency",
                    ),
                ) {
                    filter { eq("id", tripId) }
                    limit(1)
                }
                .decodeList<StatusChangeRow>()
                .firstOrNull()
        } ?: return null

        // `sent_at` NOT NULL, because an unsent proposal is a draft Gyasi is still writing —
        // the seed keeps one deliberately and the read policy lets it through, so the filter
        // has to be here. Newest version first.
        val proposal = read {
            client.postgrest.from("proposal")
                .select(Columns.list("id", "cover_title", "version_number", "sent_at")) {
                    filter {
                        eq("trip_id", tripId)
                        filterNot("sent_at", FilterOperator.IS, "null")
                    }
                    order("version_number", Order.DESCENDING)
                    limit(1)
                }
                .decodeList<ProposalRow>()
                .firstOrNull()
        }

        val itinerary = read {
            client.postgrest.from("itinerary")
                .select(Columns.list("id", "published_at")) {
                    filter { eq("trip_id", tripId) }
                    limit(1)
                }
                .decodeList<ItineraryRow>()
                .firstOrNull()
        }

        val milestone = read {
            client.postgrest.from("payment_milestone")
                .select(
                    Columns.list(
                        "id", "kind", "label", "amount_cents", "paid_cents",
                        "currency", "due_date", "status", "order_index",
                    ),
                ) {
                    filter {
                        eq("trip_id", tripId)
                        neq("status", "paid")
                        // `waived` too, matching dashboard() and trips() above. Without it
                        // 2.2.9 can announce a WAIVED milestone as the next payment — a
                        // figure the traveler does not owe, on the screen they reach from a
                        // notification. The other three call sites all exclude both.
                        neq("status", "waived")
                    }
                    // `order_index`, like the sibling queries — see the web twin's note.
                    order("order_index", Order.ASCENDING)
                    limit(1)
                }
                .decodeList<MilestoneDetailRow>()
                .firstOrNull()
        }

        return StatusChangeSnapshot(
            trip = row.toTripRow().toSummary(today),
            changedAt = row.status_changed_at,
            proposal = proposal?.let {
                SentProposal(it.id, it.cover_title, it.version_number, it.sent_at)
            },
            itineraryReady = itinerary?.published_at != null,
            nextPayment = milestone?.let {
                PaymentMilestoneView(
                    id = it.id,
                    kind = it.kind,
                    label = it.label,
                    amountCents = it.amount_cents,
                    paidCents = it.paid_cents,
                    currency = it.currency,
                    dueDate = it.due_date?.let(::parseDate),
                    status = it.status,
                )
            },
        )
    }

    override suspend fun saveReflection(
        tripId: String,
        body: String,
        existingId: String?,
        submit: Boolean,
    ): SendMessageOutcome {
        val trimmed = body.trim()
        if (trimmed.isEmpty()) return SendMessageOutcome.Failed(null)

        val payload = buildJsonObject {
            // Re-sent when there is one, so the function edits rather than creating. It
            // looks the row up by (client_id, trip_id) regardless — see the header note in
            // supabase/functions/testimonial/index.ts — so a device that has forgotten the
            // id still lands on the right reflection.
            put("testimonialId", JsonPrimitive(existingId ?: uuidV7()))
            put("tripId", JsonPrimitive(tripId))
            put("body", JsonPrimitive(trimmed))
            put("submit", JsonPrimitive(submit))
        }

        val response = try {
            client.functions.invoke("testimonial", payload)
        } catch (cancellation: CancellationException) {
            throw cancellation
        } catch (throwable: Throwable) {
            // NEVER log the body — it is somebody's reflection on their own holiday.
            return SendMessageOutcome.Failed(null)
        }

        if (response.status.value in 200..299) return SendMessageOutcome.Sent

        val text = runCatching { response.bodyAsText() }.getOrDefault("")
        val detail = if (response.status.value in 400..499) problemDetail(text) else null
        return SendMessageOutcome.Failed(detail)
    }

    /** The `detail` from an RFC 7807 body, if it carried one. */
    private fun problemDetail(text: String): String? = runCatching {
        json.decodeFromString<ProblemBody>(text).detail
    }.getOrNull()

    /**
     * The caller's own `platform_user.id`.
     *
     * NOT the auth user id, which is `platform_user.account_id` and a DIFFERENT value.
     * `document.owner_user_id` points at `platform_user.id`, so comparing against the auth
     * id makes the comparison false for everybody and labels a traveler's own passport
     * "added by Gyasi" — which is exactly how the web twin shipped before it was caught.
     *
     * No filter: RLS scopes `platform_user` to the caller's own row, the same assumption
     * `OnboardingRepository.status()` runs on.
     */
    private suspend fun currentPlatformUserId(): String? = read {
        client.postgrest.from("platform_user")
            .select(Columns.list("id"))
            .decodeList<IdOnlyRow>()
            .firstOrNull()
            ?.id
    }

    /**
     * Unlike the onboarding repository's `read`, callers here treat null as FAILURE rather
     * than as "nothing to show" — see the interface note.
     */
    private suspend fun <T> read(block: suspend () -> T): T? =
        try {
            block()
        } catch (cancellation: CancellationException) {
            throw cancellation
        } catch (throwable: Throwable) {
            // Never the row — it is somebody's trip.
            null
        }
}

private fun parseDate(value: String): LocalDate? =
    runCatching { LocalDate.parse(value) }.getOrNull()

private fun TripRow.toSummary(today: LocalDate, nextUnpaidDue: LocalDate? = null): TripSummary {
    val parsedStatus = TripStatus.fromWire(status) ?: TripStatus.INQUIRY
    val start = start_date?.let(::parseDate)
    val presentation = tripStatusPresentation(parsedStatus, today, nextUnpaidDue)
    return TripSummary(
        id = id,
        title = title,
        tripType = trip_type,
        status = parsedStatus,
        startDate = start,
        endDate = end_date?.let(::parseDate),
        destinations = destinations ?: emptyList(),
        travelerCount = traveler_count ?: 1,
        totalValueCents = total_value_cents ?: 0,
        totalPaidCents = total_paid_cents ?: 0,
        currency = currency ?: "USD",
        chip = presentation.chip,
        statusLabel = presentation.label,
        daysUntil = daysUntilDeparture(start, today),
    )
}

@Serializable
private data class TripRow(
    val id: String,
    val title: String,
    val trip_type: String,
    val status: String,
    val start_date: String? = null,
    val end_date: String? = null,
    val destinations: List<String>? = null,
    val traveler_count: Int? = null,
    val total_value_cents: Long? = null,
    val total_paid_cents: Long? = null,
    val currency: String? = null,
)

private fun TripDetailRow.toSummary(today: LocalDate, nextUnpaidDue: LocalDate? = null): TripSummary =
    TripRow(
        id = id, title = title, trip_type = trip_type, status = status,
        start_date = start_date, end_date = end_date, destinations = destinations,
        traveler_count = traveler_count, total_value_cents = total_value_cents,
        total_paid_cents = total_paid_cents, currency = currency,
    ).toSummary(today, nextUnpaidDue)

@Serializable
private data class MilestoneRow(
    val label: String,
    val amount_cents: Long,
    val currency: String,
    val due_date: String? = null,
    val status: String,
    val order_index: Int,
)

@Serializable
private data class ItineraryRow(val id: String, val published_at: String? = null)

@Serializable
private data class ItineraryDetailRow(
    val id: String,
    val intro_note: String? = null,
    val closing_note: String? = null,
    val published_at: String? = null,
)

@Serializable
private data class MilestoneTripRow(
    val trip_id: String,
    val due_date: String? = null,
    val order_index: Int,
    val status: String,
)

@Serializable
private data class MilestoneDetailRow(
    val id: String,
    val kind: String,
    val label: String,
    val amount_cents: Long,
    val paid_cents: Long,
    val currency: String,
    val due_date: String? = null,
    val status: String,
    val order_index: Int,
)

@Serializable
private data class IdOnlyRow(val id: String)

@Serializable
private data class DayRow(
    val id: String,
    val day_number: Int,
    val date: String? = null,
    val label: String? = null,
    val summary: String? = null,
    val weather_forecast: DayWeather? = null,
)

@Serializable
private data class ActivityRow(
    val id: String,
    val itinerary_day_id: String,
    val block: String,
    val start_time: String? = null,
    val end_time: String? = null,
    val title: String,
    val body: String? = null,
    val location: String? = null,
    val address: String? = null,
    val phone: String? = null,
    val confirmation_number: String? = null,
    val gyasis_tip: String? = null,
    val order_index: Int,
)

@Serializable
private data class ComponentKindRow(
    val kind: String,
    val confirmation_number: String? = null,
)

@Serializable
private data class EmergencyContact(
    val name: String? = null,
    val phone: String? = null,
    val relationship: String? = null,
)

@Serializable
private data class EmergencyRow(val emergency_contact: EmergencyContact? = null)

@Serializable
private data class ConversationCountRow(
    val id: String,
    val client_unread_count: Int? = null,
)

@Serializable
private data class TripDetailRow(
    val id: String,
    val title: String,
    val trip_type: String,
    val status: String,
    val start_date: String? = null,
    val end_date: String? = null,
    val destinations: List<String>? = null,
    val traveler_count: Int? = null,
    val total_value_cents: Long? = null,
    val total_paid_cents: Long? = null,
    val currency: String? = null,
    val cancellation_reason: String? = null,
    val refund_status: String? = null,
)

@Serializable
private data class ConversationRow(
    val id: String,
    val trip_id: String? = null,
    val last_message_preview: String? = null,
    val last_message_at: String? = null,
    val client_unread_count: Int? = null,
)

@Serializable
private data class NameRow(
    val first_name: String? = null,
    val preferred_name: String? = null,
) {
    /**
     * `handle_new_user()` falls back to the literal 'New' when a sign-up carried no name —
     * a social provider that sends no name claims, which Apple does after the first
     * authorization. Greeting somebody as "New" is worse than greeting them as nobody in
     * particular, so the placeholder is treated as absent. Same call as
     * OnboardingRepository's greetableName.
     */
    fun greetable(): String? =
        (preferred_name?.takeIf { it.isNotBlank() } ?: first_name?.takeIf { it.isNotBlank() })
            ?.takeIf { it != "New" }
}

@Serializable
private data class TitleRow(val id: String, val title: String)

@Serializable
private data class DocumentRow(
    val id: String,
    val owner_user_id: String? = null,
    val kind: String,
    val filename: String,
    val mime_type: String,
    /**
     * A JSON NUMBER, not a string.
     *
     * Worth stating because `size_bytes` is `bigint` and the OpenAPI contract carries money
     * as a string for exactly the precision reason you would expect to apply here too. It
     * does not: PostgREST serialises int8 as a plain JSON number, so this decodes as Long —
     * measured against the running stack, after decoding it as String silently swallowed
     * every attachment on the thread. A `Long` is exact to 2^53 through JSON and the bucket
     * caps uploads at 50 MiB, so the precision ceiling is nowhere near.
     */
    val size_bytes: Long? = null,
    val created_at: String,
)

private fun DocumentRow.toView(myUserId: String?): TripDocumentView = TripDocumentView(
    id = id,
    kind = kind,
    filename = filename,
    mimeType = mime_type,
    sizeBytes = size_bytes ?: 0L,
    createdAt = created_at,
    mine = myUserId != null && owner_user_id == myUserId,
)

@Serializable
private data class MessageRow(
    val id: String,
    val sender_role: String,
    val body: String,
    val created_at: String,
)

@Serializable
private data class AttachmentRow(
    val message_id: String,
    val document: DocumentRow? = null,
)

@Serializable
private data class SignedUrlResponse(
    val path: String,
    val filename: String,
    @SerialName("mimeType") val mimeType: String,
)

@Serializable
private data class ProblemBody(val detail: String? = null)

@Serializable
private data class SenderRow(val sender_role: String)

@Serializable
private data class TestimonialRow(
    val id: String,
    val body: String,
    val rating: Int? = null,
    val status: String,
)

@Serializable
private data class ProposalRow(
    val id: String,
    val cover_title: String? = null,
    val version_number: Int,
    val sent_at: String? = null,
)

/**
 * `trip` plus `status_changed_at`, which no other §2.2 read needs.
 *
 * A separate row class rather than adding a nullable field to [TripRow]: every other query
 * in this file names its columns exactly, and a TripRow carrying a column most of those
 * queries do not select would decode to null and read as "the status never changed".
 */
@Serializable
private data class StatusChangeRow(
    val id: String,
    val title: String,
    val trip_type: String,
    val status: String,
    val status_changed_at: String? = null,
    val start_date: String? = null,
    val end_date: String? = null,
    val destinations: List<String>? = null,
    val traveler_count: Int? = null,
    val total_value_cents: Long? = null,
    val total_paid_cents: Long? = null,
    val currency: String? = null,
)

private fun StatusChangeRow.toTripRow(): TripRow = TripRow(
    id = id,
    title = title,
    trip_type = trip_type,
    status = status,
    start_date = start_date,
    end_date = end_date,
    destinations = destinations,
    traveler_count = traveler_count,
    total_value_cents = total_value_cents,
    total_paid_cents = total_paid_cents,
    currency = currency,
)

/**
 * §2.6's rows.
 *
 * `trip:trip_id(title)` embeds rather than joins, so `trip`'s own policy applies to the
 * embedded side: a conversation whose trip the caller cannot read comes back with a null
 * `trip` and falls back to its subject, instead of the whole row disappearing.
 */
@Serializable
private data class TripTitleEmbed(val title: String? = null)

@Serializable
private data class InboxRow(
    val id: String,
    val subject: String? = null,
    val trip_id: String? = null,
    val last_message_at: String,
    val last_message_preview: String? = null,
    val client_unread_count: Int? = null,
    val trip: TripTitleEmbed? = null,
)

@Serializable
private data class ConversationThreadRow(
    val id: String,
    val subject: String? = null,
    val trip_id: String? = null,
    val client_unread_count: Int? = null,
    val trip: TripTitleEmbed? = null,
)

/**
 * `trip-message`'s response body.
 *
 * Only `conversationId` is read. 2.6.3 needs it to push into the thread it just created, and
 * the other fields the function returns are things this client already knows.
 */
@Serializable
private data class SendMessageResponse(val conversationId: String? = null)

/** [SupabaseTripRepository.invokeTripMessage]'s two answers, which callers need separately. */
private data class TripMessageResult(
    val outcome: SendMessageOutcome,
    val conversationId: String?,
)
