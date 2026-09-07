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

    /** The name to greet somebody by, or null. */
    suspend fun greetableFirstName(): String?
}

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
    override suspend fun greetableFirstName(): String? = null
}

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
