package com.storytail.adventures.api

import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.exceptions.RestException
import io.github.jan.supabase.postgrest.postgrest
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/**
 * Screen Inventory §3.2.1's read. The advisor's worklist.
 *
 * A REPOSITORY OF ITS OWN, on the same rule WalletRepository states: one when the section
 * shares no read with an existing file. §3.2 shares nothing with `TripRepository` — every
 * client trip read there goes through PostgREST under `trip_self_select`, and an agent's
 * `platform_user.client_id` is NULL, so every one of those predicates returns zero rows for
 * the person this file serves.
 *
 * ── THE FIRST `.rpc()` IN mobile/, AND WHY THE READS ARE RPC AT ALL ─────────────
 *
 * RLS decides rows and GRANTs decide columns, and an agent is also the Postgres role
 * `authenticated` — so the column REVOKEs the client sections added bind the agent too.
 * `trip.notes`, `trip.total_commission_cents` and `conversation.agent_unread_count` all
 * raise 42501 for them. The answer is SECURITY DEFINER accessors whose `RETURNS TABLE`
 * signature IS the column allowlist, called over PostgREST `/rpc/`.
 *
 * Every read here is one of those. The one WRITE on this surface (§3.2.2's stage change) is
 * an Edge Function instead, because `agent_set_trip_status` is service_role-only —
 * otherwise a browser could move a trip with no `audit_event`. §3.2.2 is web-only at MVP
 * (§6.6), so this file has no write at all.
 *
 * ── MONEY ARRIVES AS A DIGIT-STRING ────────────────────────────────────────────
 *
 * `contracts/openapi.yaml:36` states the convention and gives the reason. The accessors cast
 * every cents column to `text`, and these are SUMS over `bigint` — which is exactly where a
 * JSON number loses precision and where §2.4's `Int` mistake would have surfaced. Parsed to
 * `Long` once, here, where a failure has somewhere to go: a malformed figure costs the tile
 * its number, not the screen its render.
 *
 * ── `.rpc()` THROWS, IT DOES NOT RETURN THE RESPONSE ───────────────────────────
 *
 * supabase-kt validates every response, so `if (status in 400..499)` written after the call
 * is unreachable — the rejection already left through the catch. Three repositories shipped
 * that shape and every Edge Function rejection reached the traveler as the generic "try
 * again in a moment". [problemDetail] is WalletRepository's, copied rather than re-derived,
 * including the part that matters: read the body off `error`, never `message`.
 */
interface AgentRepository {
    /** Null on a FAILED read. An agent with an empty book gets a [WorklistSnapshot] of zeros. */
    suspend fun worklist(): WorklistRead
}

/**
 * Three answers, not two.
 *
 * `Loadable.Unauthorized` is consumed by thirteen screens and produced by nothing — the gap
 * `TripRepository.read {}` leaves by collapsing "threw" and "decoded nothing" into one null.
 * The distinction is already in the exception here (`RestException.statusCode`), so
 * preserving it costs nothing and collapsing it would cost extra code. A revoked agent
 * hitting the worklist must see "this is not your view", not "we couldn't load".
 *
 * This is what §2.2's loaders should do and do not. Fixing them is not this slice's job —
 * half-fixing moves the wrong answer to the other case — but new code should not inherit it.
 */
sealed interface WorklistRead {
    data class Ok(val snapshot: WorklistSnapshot) : WorklistRead
    /** 401/403: not an agent, or no longer one. */
    data object Forbidden : WorklistRead
    data object Failed : WorklistRead
}

data class WorklistSnapshot(
    /**
     * `agent_kpis().as_of_date` — TODAY IN THE AGENT'S OWN TIME ZONE, not the device's.
     *
     * Every window the accessors compute ("this month", "departing in 30 days") is anchored
     * to it, so a screen that derived its own date from the handset would disagree with the
     * numbers beside it whenever the two are on different sides of midnight.
     */
    val asOfDate: String,
    val kpis: WorklistKpis,
    val awaitingResponse: List<WorklistTrip>,
    val paymentsDue: List<WorklistPayment>,
    /** `trip.status = 'inquiry'`. NOT leads — there is no lead entity (BRD §6.5). */
    val newInquiries: List<WorklistTrip>,
    val departingSoon: List<WorklistTrip>,
    val recentMessages: List<WorklistMessage>,
)

data class WorklistKpis(
    val pipelineValueCents: Long,
    val bookedMonthCents: Long,
    val commissionExpectedCents: Long,
    /** Null over an empty pipeline. NOT zero — a 0% is a claim where an absence is the truth. */
    val commissionConfidencePct: Int?,
    /** Null until trip_status_history accumulates (Data-Model §8.8). */
    val inquiryToBookDays: Double?,
    val inquiryToBookSample: Int,
    val activeClients: Int,
    val activeTrips: Int,
    val newInquiries: Int,
    val unreadMessages: Int,
    val currency: String,
    /** More than one means the money figures exclude something, and the screen must say so. */
    val currencyCount: Int,
)

data class WorklistTrip(
    val tripId: String,
    val clientName: String,
    val title: String,
    val status: String,
    val startDate: String?,
    val totalValueCents: Long,
    val currency: String,
)

data class WorklistPayment(
    val milestoneId: String,
    val clientName: String,
    val tripTitle: String,
    val label: String,
    val amountCents: Long,
    val currency: String,
    val dueDate: String?,
    val daysUntil: Int?,
)

data class WorklistMessage(
    val conversationId: String,
    val clientName: String,
    val preview: String,
    val lastMessageAt: String,
    val unread: Int,
)

/** Before `supabase start` has ever run there is nothing to ask. */
class UnconfiguredAgentRepository : AgentRepository {
    override suspend fun worklist(): WorklistRead = WorklistRead.Failed
}

class SupabaseAgentRepository(private val client: SupabaseClient) : AgentRepository {

    private val json = Json { ignoreUnknownKeys = true }

    /**
     * FOUR ROUND TRIPS AT ONCE, NOT ONE AFTER ANOTHER.
     *
     * Nothing here depends on a value from an earlier call — the `as_of_date` the board is
     * filtered against is read after all four have landed — so awaiting them in sequence
     * cost four serialised round trips on the client with the worst latency. The web build
     * of this same screen puts all of them in one `Promise.all`; this is that shape.
     *
     * THE THREE-WAY ANSWER SURVIVES, which is the part concurrency could quietly break.
     * `coroutineScope` rethrows the FIRST child failure rather than the cancellation it
     * causes in its siblings, so a 403 on any one of the four still leaves through the
     * `RestException` catch below and still answers [WorklistRead.Forbidden] — not
     * [WorklistRead.Failed]. What does change: when two calls fail differently the one that
     * fails FIRST decides the answer, where sequence used to decide it. A 403 from one
     * accessor and a 500 from another is not a state the read surface can produce — every
     * one of them is `SECURITY DEFINER` over the same `current_agent_id()`.
     */
    override suspend fun worklist(): WorklistRead = try {
        coroutineScope {
            val kpiCall = async { client.postgrest.rpc("agent_kpis").decodeList<KpiDto>() }
            val tripCall = async { client.postgrest.rpc("agent_trip_board").decodeList<TripDto>() }
            val paymentCall = async {
                client.postgrest
                    .rpc("agent_payments_due", buildJsonObject { put("p_within_days", 21) })
                    .decodeList<PaymentDto>()
            }
            val inboxCall = async {
                client.postgrest
                    .rpc("agent_inbox", buildJsonObject { put("p_limit", 5) })
                    .decodeList<InboxDto>()
            }

            val kpiRows = kpiCall.await()
            val trips = tripCall.await()
            val payments = paymentCall.await()
            val inbox = inboxCall.await()

            // No row at all means the caller is not an agent — App.kt's gate should already
            // have caught that, so this is the second line of defence. One row of zeros is a
            // different answer and must not be confused with it.
            //
            // Checked after the join rather than before it: a non-agent wastes three calls
            // that return nothing, and in exchange the agent — every other caller — waits
            // for one round trip instead of two. `return@coroutineScope`, never a bare
            // `return`: `coroutineScope` is not inline, so a non-local return out of it
            // does not compile.
            val kpi = kpiRows.firstOrNull()
                ?: return@coroutineScope WorklistRead.Forbidden

            WorklistRead.Ok(
                WorklistSnapshot(
                    asOfDate = kpi.as_of_date,
                    kpis = kpi.toDomain(),
                    awaitingResponse = trips
                        .filter { it.status == "proposal" && it.proposal_sent_at != null }
                        .map { it.toDomain() },
                    paymentsDue = payments.map { it.toDomain() },
                    newInquiries = trips.filter { it.status == "inquiry" }.map { it.toDomain() },
                    // The raw date pre-slice, NOT the section. Cancelled trips are excluded
                    // one layer up, in `departingWithin30` — the mobile twin of web's
                    // `departingSoon` filter, and the only thing that reaches `ui.departing`.
                    // A second `status != "cancelled"` here would be a predicate no test can
                    // drive: this class needs a live Supabase client to run at all.
                    departingSoon = trips
                        .filter { it.start_date != null && it.start_date >= kpi.as_of_date }
                        .map { it.toDomain() },
                    recentMessages = inbox.map { it.toDomain() },
                ),
            )
        }
    } catch (cancellation: CancellationException) {
        throw cancellation
    } catch (rest: RestException) {
        if (rest.statusCode in 401..403) WorklistRead.Forbidden else WorklistRead.Failed
    } catch (_: Exception) {
        WorklistRead.Failed
    }

    /**
     * 4xx only, and read from `error`.
     *
     * Kept even though nothing calls it yet: §3.2.2's stage change is the write that will,
     * and having it here means the next person does not re-derive the bug. supabase-kt's
     * `Functions.parseErrorResponse` puts the RAW BODY in `error`, leaves `description`
     * null, and appends `URL:` / `Headers:` lines to `message` — so parsing `message` hands
     * kotlinx.serialization trailing text and the detail silently comes back null.
     */
    @Suppress("unused")
    private fun problemDetail(rest: RestException): String? {
        if (rest.statusCode !in 400..499) return null
        return runCatching { json.decodeFromString<AgentProblemDetail>(rest.error).detail }.getOrNull()
    }
}

/**
 * Named apart from WalletRepository's identical private type: two top-level `private`
 * declarations of the same name in one package are a redeclaration error, not two scopes.
 */
@Serializable
private data class AgentProblemDetail(val detail: String? = null)

/** Cents are digit-strings; see the file header. `?: 0L` costs the tile a number, not the screen. */
private fun String?.cents(): Long = this?.toLongOrNull() ?: 0L

@Serializable
private data class KpiDto(
    val as_of_date: String = "",
    val dominant_currency: String? = null,
    val currency_count: Int = 0,
    val pipeline_value_cents: String? = null,
    val booked_month_cents: String? = null,
    val commission_expected_cents: String? = null,
    val commission_confidence_pct: Int? = null,
    val inquiry_to_book_days: Double? = null,
    val inquiry_to_book_sample: Int = 0,
    val active_client_count: Int = 0,
    val active_trip_count: Int = 0,
    val new_inquiry_count: Int = 0,
    val unread_message_count: Int = 0,
) {
    fun toDomain() = WorklistKpis(
        pipelineValueCents = pipeline_value_cents.cents(),
        bookedMonthCents = booked_month_cents.cents(),
        commissionExpectedCents = commission_expected_cents.cents(),
        commissionConfidencePct = commission_confidence_pct,
        inquiryToBookDays = inquiry_to_book_days,
        inquiryToBookSample = inquiry_to_book_sample,
        activeClients = active_client_count,
        activeTrips = active_trip_count,
        newInquiries = new_inquiry_count,
        unreadMessages = unread_message_count,
        currency = dominant_currency ?: "USD",
        currencyCount = currency_count,
    )
}

@Serializable
private data class TripDto(
    val trip_id: String = "",
    val client_display_name: String = "",
    val title: String = "",
    val status: String = "",
    val start_date: String? = null,
    val total_value_cents: String? = null,
    val currency: String = "USD",
    val proposal_sent_at: String? = null,
) {
    fun toDomain() = WorklistTrip(
        tripId = trip_id,
        clientName = client_display_name,
        title = title,
        status = status,
        startDate = start_date,
        totalValueCents = total_value_cents.cents(),
        currency = currency,
    )
}

@Serializable
private data class PaymentDto(
    val milestone_id: String = "",
    val client_display_name: String = "",
    val trip_title: String = "",
    val label: String = "",
    val amount_cents: String? = null,
    val currency: String = "USD",
    val due_date: String? = null,
    val days_until: Int? = null,
) {
    fun toDomain() = WorklistPayment(
        milestoneId = milestone_id,
        clientName = client_display_name,
        tripTitle = trip_title,
        label = label,
        amountCents = amount_cents.cents(),
        currency = currency,
        dueDate = due_date,
        daysUntil = days_until,
    )
}

@Serializable
private data class InboxDto(
    val conversation_id: String = "",
    val client_display_name: String = "",
    val last_message_preview: String? = null,
    val last_message_at: String = "",
    val agent_unread_count: Int = 0,
) {
    fun toDomain() = WorklistMessage(
        conversationId = conversation_id,
        clientName = client_display_name,
        preview = last_message_preview.orEmpty(),
        lastMessageAt = last_message_at,
        unread = agent_unread_count,
    )
}
