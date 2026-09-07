package com.storytail.adventures.api

import com.storytail.adventures.domain.trip.TripStatus
import com.storytail.adventures.domain.trip.daysUntilDeparture
import com.storytail.adventures.domain.trip.tripStatusPresentation
import com.storytail.adventures.domain.trip.StatusChip
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.query.Columns
import io.github.jan.supabase.postgrest.query.Order
import kotlinx.coroutines.CancellationException
import kotlinx.datetime.LocalDate
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

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

data class AdvisorMessage(
    val body: String,
    val tripId: String?,
    val conversationId: String,
    val unread: Int,
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
