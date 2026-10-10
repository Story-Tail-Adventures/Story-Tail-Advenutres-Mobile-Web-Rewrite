package com.storytail.adventures.api

import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.exceptions.RestException
import io.github.jan.supabase.postgrest.postgrest
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonNull
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

    /**
     * Screen 3.3.1's roster. Two accessors, one answer.
     *
     * `offset` pages it. §6.6 keeps the phone narrow, so the screen appends rather than
     * paginating — but the ACCESSOR is the same one the web roster calls, with the same
     * window, because a second read shape for the same rows is a second thing to keep true.
     */
    suspend fun clientRoster(
        status: String = "active",
        search: String? = null,
        limit: Int = 25,
        offset: Int = 0,
    ): ClientRosterRead

    /**
     * Screens 3.3.2 – 3.3.8. EVERY TAB IN ONE READ, which is the opposite of what the web
     * build does and deliberate.
     *
     * The web page fetches only the active tab's rows, because a tab switch there is a
     * navigation and the next read starts while the browser is still painting. On a phone a
     * tab switch is a thumb moving two centimetres, and paying a round trip for it on the
     * connection this screen is designed for — §6.6's "on-the-go" — turns an instant
     * interaction into a spinner six times over. One client's whole detail is a few dozen
     * rows; fetching it once and switching locally is the cheaper trade.
     */
    suspend fun clientDetail(clientId: String): ClientDetailRead

    /**
     * Screen 3.4.2, all eight tabs, read-only.
     *
     * EVERY TAB IN ONE READ, for the reason [clientDetail] gives in full: on a phone a tab
     * switch is a thumb moving two centimetres, and paying a round trip for it turns an
     * instant interaction into a spinner eight times over.
     *
     * THERE IS NO `tripRoster` BESIDE THIS, and that is not an omission. §6.6's bottom bar
     * is Worklist, Clients, Messages, More — Trips is not on it, where the web rail has it.
     * A trip is reached from the worklist's rows, which already carry `tripId`, so the list
     * this detail hangs off already exists and is §3.2.1's.
     */
    suspend fun tripDetail(tripId: String): AgentTripDetailRead
}

/**
 * Three answers, for the reason [WorklistRead] gives.
 *
 * `AgentTrip…` PREFIXED, unlike [ClientDetailRead] beside it, because the traveler side
 * already owns the unprefixed names: `TripRepository.kt` declares its own
 * `TripDetailSnapshot` for §2.2's trip screen. Two surfaces legitimately have "a trip
 * detail" and they are different shapes — this one carries `total_commission_cents`, which
 * is withheld from the client role entirely. The compiler caught the collision on the
 * first build; the prefix is what keeps them from being confused by a future reader as
 * well as by the linker.
 */
sealed interface AgentTripDetailRead {
    data class Ok(val snapshot: AgentTripDetailSnapshot) : AgentTripDetailRead
    /**
     * Zero rows from the overview accessor. "No such trip", "not this advisor's" and
     * "archived" are ONE answer on purpose, so ids cannot be probed.
     */
    data object NotFound : AgentTripDetailRead
    data object Forbidden : AgentTripDetailRead
    data object Failed : AgentTripDetailRead
}

data class AgentTripDetailSnapshot(
    val overview: AgentTripOverviewRow,
    val components: List<AgentTripComponentRow>,
    /** Already grouped. The accessor returns one row per ACTIVITY with the day repeated. */
    val days: List<AgentTripItineraryDay>,
    /**
     * Whether the traveler can see the day-by-day yet.
     *
     * TWO STATES FROM THREE, matching the web's own collapse: an `itinerary` row that has
     * never been published and NO itinerary row at all both mean the client is reading
     * nothing, so both are `false`. `loadItinerary` does the same thing for the same reason.
     *
     * It costs an eighth accessor and it is worth one. `TripItineraryView` says "never
     * blank; an agent must know which one they are reading" — an advisor who tells a client
     * "it is in your app" off a draft has been misled by the screen, and there is nothing
     * else on the surface that would tell them.
     */
    val itineraryPublished: Boolean,
    val payments: List<AgentTripPaymentRow>,
    val documents: List<AgentTripDocumentRow>,
    val messages: List<AgentTripMessageRow>,
    val activity: List<AgentTripActivityRow>,
)

data class AgentTripOverviewRow(
    val tripId: String,
    val clientId: String,
    val clientName: String,
    val title: String,
    val tripType: String,
    val status: String,
    val startDate: String?,
    val endDate: String?,
    val destinations: List<String>,
    val travelerCount: Int,
    val totalValueCents: Long,
    val totalPaidCents: Long,
    /** Withheld from the client role entirely. Drawn on this screen and nowhere a traveler reaches. */
    val totalCommissionCents: Long,
    val currency: String,
    val cancellationReason: String?,
    val refundStatus: String?,
    val refundDetail: String?,
    /** `trip.notes`, the advisor's own prose. The Notes TAB is this one field, not a table. */
    val notes: String?,
    val cardLast4: String?,
    val cardBrand: String?,
    val cardSpendingLimitCents: Long?,
    /**
     * `greatest(max status change, max unarchived conversation message)`, off the accessor.
     *
     * NOT the newest `trip_status_history` row, which this was first derived from: that is
     * only the last STAGE change, so a trip whose last event was a client message reported
     * a date weeks older than the truth. The accessor's `activity` CTE is the authority and
     * deliberately excludes archived threads — filing a thread away is the advisor's only
     * way to put one down, and without that exclusion an archived thread kept driving this.
     */
    val lastActivityAt: String?,
    val componentCount: Int,
    val nextUnpaidDueDate: String?,
    val asOfDate: String,
)

data class AgentTripComponentRow(
    val componentId: String,
    val kind: String,
    val displayName: String,
    val supplierName: String?,
    val startDate: String?,
    val endDate: String?,
    val startTime: String?,
    val endTime: String?,
    val location: String?,
    val costCents: Long,
    val currency: String,
)

data class AgentTripItineraryDay(
    val dayId: String,
    val dayNumber: Int,
    val date: String,
    val label: String?,
    val summary: String?,
    val activities: List<AgentTripActivity>,
)

data class AgentTripActivity(
    val activityId: String,
    val block: String?,
    val startTime: String?,
    val title: String?,
    val body: String?,
    val location: String?,
    /** Its own column and its own block on screen — never folded into [body]. */
    val gyasisTip: String?,
)

data class AgentTripPaymentRow(
    val milestoneId: String,
    val label: String,
    val amountCents: Long,
    val paidCents: Long,
    val currency: String,
    val dueDate: String?,
    val status: String,
)

data class AgentTripDocumentRow(
    val documentId: String,
    val kind: String,
    val filename: String,
    val sizeBytes: Long,
    val isSensitive: Boolean,
    val createdAt: String,
)

data class AgentTripMessageRow(
    val messageId: String,
    val senderRole: String,
    val body: String,
    val createdAt: String,
    val isInternalNote: Boolean,
)

data class AgentTripActivityRow(
    val historyId: String,
    val fromStatus: String?,
    val toStatus: String,
    val changedAt: String,
    val changedByName: String?,
)

/** Three answers, for the reason [WorklistRead] gives. */
sealed interface ClientDetailRead {
    data class Ok(val snapshot: ClientDetailSnapshot) : ClientDetailRead
    /**
     * Zero rows from the overview accessor. "No such client", "not this advisor's" and "a
     * merged tombstone" are ONE answer on purpose, so ids cannot be probed — the screen
     * says the client is not there rather than that something failed.
     */
    data object NotFound : ClientDetailRead
    /** 401/403: not an agent, or no longer one. */
    data object Forbidden : ClientDetailRead
    data object Failed : ClientDetailRead
}

data class ClientDetailSnapshot(
    val overview: ClientOverviewRow,
    val companions: List<CompanionRow>,
    val trips: List<ClientTripRow>,
    val threads: List<ClientThreadRow>,
    val documents: List<ClientDocumentRow>,
    val notes: List<ClientNoteRow>,
    val activity: List<ClientActivityRow>,
)

data class ClientOverviewRow(
    val clientId: String,
    val displayName: String,
    val initials: String,
    val email: String?,
    val phone: String?,
    val status: String,
    val archived: Boolean,
    val tags: List<String>,
    val createdAt: String,
    val addressLine: String?,
    val dateOfBirth: String?,
    /** `client.notes` — the Snapshot card's free text, NOT the Notes tab. */
    val snapshotNote: String?,
    val preferredDestinations: List<String>,
    val travelStyles: List<String>,
    val dietaryRestrictions: List<String>,
    /** The allergy the closed vocabulary has no slug for. */
    val dietaryNote: String?,
    val accessibilityNeeds: List<String>,
    val accessibilityNote: String?,
    /** Programme and tier only. The NUMBER is an account credential and is never read. */
    val loyaltyPrograms: List<Pair<String, String?>>,
    val budgetBand: String?,
    /** Null when nothing is committed — NOT zero. */
    val lifetimeValueCents: Long?,
    val commissionCents: Long?,
    val lifetimeCurrency: String?,
    val tripCount: Int,
    val activeTripCount: Int,
    val noteCount: Int,
    val documentCount: Int,
    val lastContactAt: String?,
    val asOfDate: String,
)

data class CompanionRow(
    val companionId: String,
    val name: String,
    val initials: String,
    val relationship: String?,
    val passportExpiry: String?,
)

data class ClientTripRow(
    val tripId: String,
    val title: String,
    val status: String,
    val startDate: String?,
    val endDate: String?,
    val destination: String?,
    val totalValueCents: Long,
    val commissionCents: Long,
    val currency: String,
    val asOfDate: String,
)

data class ClientThreadRow(
    val conversationId: String,
    val subject: String?,
    val tripTitle: String?,
    val preview: String?,
    val lastMessageAt: String,
    val unread: Int,
    val messageCount: Int,
)

data class ClientDocumentRow(
    val documentId: String,
    val filename: String,
    val kind: String,
    val mimeType: String,
    val sizeBytes: Long,
    val sensitive: Boolean,
    val tripTitle: String?,
)

data class ClientNoteRow(
    val noteId: String,
    val body: String,
    val authorName: String?,
    val mine: Boolean,
    val createdAt: String,
    val updatedAt: String,
)

data class ClientActivityRow(
    val eventId: String,
    val eventType: String,
    val actorName: String?,
    val createdAt: String,
)

/** Three answers, for the reason [WorklistRead] gives. */
sealed interface ClientRosterRead {
    data class Ok(val snapshot: ClientRosterSnapshot) : ClientRosterRead
    /** 401/403: not an agent, or no longer one. */
    data object Forbidden : ClientRosterRead
    data object Failed : ClientRosterRead
}

data class ClientRosterSnapshot(
    val rows: List<RosterClient>,
    /** The count BEFORE the window — the only figure "27 of 30" can be built from. */
    val total: Int,
    val summary: ClientRosterSummary,
)

data class ClientRosterSummary(
    val activeCount: Int,
    val inMotionCount: Int,
    /** `trip.status = 'inquiry'`. NOT leads — there is no lead entity (BRD §6.5). */
    val inquiryCount: Int,
    val archivedCount: Int,
)

data class RosterClient(
    val clientId: String,
    val displayName: String,
    val initials: String,
    /** Nullable on the table, and a roster is mostly people who are missing something. */
    val email: String?,
    val phone: String?,
    val tags: List<String>,
    val archived: Boolean,
    /** Null when nothing is committed — NOT zero. A labelled $0 is a claim, not an absence. */
    val lifetimeValueCents: Long?,
    val lifetimeCurrency: String?,
    val tripCount: Int,
    val lastTripTitle: String?,
    val lastTripEndDate: String?,
    val nextTripTitle: String?,
    val nextTripStartDate: String?,
    val nextTripStatus: String?,
    val nextTripDestination: String?,
)

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

    override suspend fun clientRoster(
        status: String,
        search: String?,
        limit: Int,
        offset: Int,
    ): ClientRosterRead = ClientRosterRead.Failed

    override suspend fun clientDetail(clientId: String): ClientDetailRead = ClientDetailRead.Failed

    override suspend fun tripDetail(tripId: String): AgentTripDetailRead = AgentTripDetailRead.Failed
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
     * §3.3.2 – §3.3.8's seven reads, all at once.
     *
     * SEVEN ROUND TRIPS CONCURRENTLY, for the reason [worklist] gives about its four:
     * nothing here depends on another's result, and `coroutineScope` still rethrows the
     * FIRST child failure, so the three-way answer survives the concurrency.
     *
     * THE OVERVIEW DECIDES WHETHER THERE IS A CLIENT AT ALL. Zero rows means "no such
     * client", "not this advisor's" or "a merged tombstone" — one answer for all three, on
     * purpose. That is [ClientDetailRead.NotFound], which is NOT [ClientDetailRead.Failed]:
     * a mistyped id is neither our fault nor retryable, and a screen that offered a retry
     * would offer it forever.
     */
    override suspend fun clientDetail(clientId: String): ClientDetailRead = try {
        coroutineScope {
            val arg = buildJsonObject { put("p_client_id", clientId) }
            val overviewCall = async {
                client.postgrest.rpc("agent_client_overview", arg).decodeList<OverviewDto>()
            }
            val companionCall = async {
                client.postgrest.rpc("agent_client_companions", arg).decodeList<CompanionDto>()
            }
            val tripCall = async {
                client.postgrest.rpc("agent_client_trips", arg).decodeList<ClientTripDto>()
            }
            val threadCall = async {
                client.postgrest.rpc("agent_client_conversations", arg).decodeList<ThreadDto>()
            }
            val docCall = async {
                client.postgrest.rpc("agent_client_documents", arg).decodeList<ClientDocDto>()
            }
            val noteCall = async {
                client.postgrest.rpc("agent_client_notes", arg).decodeList<NoteDto>()
            }
            val activityCall = async {
                client.postgrest
                    .rpc(
                        "agent_client_activity",
                        buildJsonObject { put("p_client_id", clientId); put("p_limit", 50) },
                    )
                    .decodeList<ActivityDto>()
            }

            val overview = overviewCall.await().firstOrNull()
                ?: return@coroutineScope ClientDetailRead.NotFound

            ClientDetailRead.Ok(
                ClientDetailSnapshot(
                    overview = overview.toDomain(),
                    companions = companionCall.await().map { it.toDomain() },
                    trips = tripCall.await().map { it.toDomain() },
                    threads = threadCall.await().map { it.toDomain() },
                    documents = docCall.await().map { it.toDomain() },
                    notes = noteCall.await().map { it.toDomain() },
                    activity = activityCall.await().map { it.toDomain() },
                ),
            )
        }
    } catch (cancellation: CancellationException) {
        throw cancellation
    } catch (rest: RestException) {
        if (rest.statusCode in 401..403) ClientDetailRead.Forbidden else ClientDetailRead.Failed
    } catch (_: Exception) {
        ClientDetailRead.Failed
    }

    /**
     * §3.4.2's eight tabs, eight accessors, one round trip's worth of latency.
     *
     * EIGHT CALLS AT ONCE under `coroutineScope`, the shape [clientDetail] established:
     * none depends on another's result, and `coroutineScope` still rethrows the FIRST child
     * failure, so the four-way answer survives the concurrency.
     *
     * THE OVERVIEW IS THE GATE. Zero rows from it is the only NotFound, and the other six
     * are allowed to come back empty — a trip with no components, no itinerary and no
     * messages is a brand-new inquiry, not a missing trip.
     */
    override suspend fun tripDetail(tripId: String): AgentTripDetailRead = try {
        coroutineScope {
            val arg = buildJsonObject { put("p_trip_id", tripId) }
            val overviewCall = async {
                client.postgrest.rpc("agent_trip_overview", arg).decodeList<AgentTripOverviewDto>()
            }
            val componentCall = async {
                client.postgrest.rpc("agent_trip_components", arg).decodeList<AgentTripComponentDto>()
            }
            val dayCall = async {
                client.postgrest.rpc("agent_trip_itinerary_days", arg)
                    .decodeList<AgentTripDayDto>()
            }
            val paymentCall = async {
                client.postgrest.rpc("agent_trip_payments", arg).decodeList<AgentTripPaymentDto>()
            }
            val docCall = async {
                client.postgrest.rpc("agent_trip_documents", arg).decodeList<AgentTripDocumentDto>()
            }
            val messageCall = async {
                client.postgrest.rpc("agent_trip_messages", arg).decodeList<AgentTripMessageDto>()
            }
            val activityCall = async {
                client.postgrest.rpc("agent_trip_activity", arg).decodeList<AgentTripActivityDto>()
            }
            // The only thing read off the itinerary's own row. The cover image, intro and
            // closing notes are §3.4.14's to edit and §2.2's to render; none of them is a
            // fact an advisor needs standing at a gate.
            val metaCall = async {
                client.postgrest.rpc("agent_trip_itinerary_meta", arg)
                    .decodeList<AgentTripItineraryMetaDto>()
            }

            val overview = overviewCall.await().firstOrNull()
                ?: return@coroutineScope AgentTripDetailRead.NotFound

            AgentTripDetailRead.Ok(
                AgentTripDetailSnapshot(
                    overview = overview.toDomain(),
                    components = componentCall.await().map { it.toDomain() },
                    days = dayCall.await().map { it.asLike() }.groupIntoDays(),
                    // No itinerary row is `null` here, and an unpublished one is a row with
                    // a null `published_at`. Both answer false — see the field.
                    itineraryPublished =
                        metaCall.await().firstOrNull()?.published_at != null,
                    payments = paymentCall.await().map { it.toDomain() },
                    documents = docCall.await().map { it.toDomain() },
                    messages = messageCall.await().map { it.toDomain() },
                    activity = activityCall.await().map { it.toDomain() },
                ),
            )
        }
    } catch (cancellation: CancellationException) {
        throw cancellation
    } catch (rest: RestException) {
        if (rest.statusCode in 401..403) AgentTripDetailRead.Forbidden else AgentTripDetailRead.Failed
    } catch (_: Exception) {
        AgentTripDetailRead.Failed
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
    /**
     * §3.3.1's two reads, together.
     *
     * TWO ROUND TRIPS AT ONCE, for the reason [worklist] gives — neither depends on the
     * other's result, and `coroutineScope` still rethrows the FIRST child failure, so the
     * three-way answer survives the concurrency.
     *
     * THE SUMMARY IS REQUIRED, NOT OPTIONAL. A roster rendered without its header counts
     * shows chips claiming zero of everything over a table full of rows; a missing summary
     * row means the caller is not an agent, the same second line of defence [worklist] keeps.
     */
    override suspend fun clientRoster(
        status: String,
        search: String?,
        limit: Int,
        offset: Int,
    ): ClientRosterRead = try {
        coroutineScope {
            val rowsCall = async {
                client.postgrest
                    .rpc(
                        "agent_client_roster",
                        buildJsonObject {
                            put("p_status", Json.parseToJsonElement("[\"$status\"]"))
                            if (search.isNullOrBlank()) put("p_search", JsonNull)
                            else put("p_search", search)
                            put("p_tags", JsonNull)
                            put("p_limit", limit)
                            put("p_offset", offset)
                        },
                    )
                    .decodeList<RosterDto>()
            }
            val summaryCall = async {
                client.postgrest.rpc("agent_client_roster_summary").decodeList<RosterSummaryDto>()
            }

            val rows = rowsCall.await()
            val summary = summaryCall.await().firstOrNull()
                ?: return@coroutineScope ClientRosterRead.Forbidden

            ClientRosterRead.Ok(
                ClientRosterSnapshot(
                    rows = rows.map { it.toDomain() },
                    // `total_count` rides on every row and is the pre-window count. With no
                    // rows there is nothing to read it off, and zero is the right answer.
                    total = rows.firstOrNull()?.total_count ?: 0,
                    summary = summary.toDomain(),
                ),
            )
        }
    } catch (cancellation: CancellationException) {
        throw cancellation
    } catch (rest: RestException) {
        if (rest.statusCode in 401..403) ClientRosterRead.Forbidden else ClientRosterRead.Failed
    } catch (_: Exception) {
        ClientRosterRead.Failed
    }

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
    val currency: String? = null,
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
        currency = currency ?: "USD",
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

@Serializable
private data class RosterDto(
    val client_id: String = "",
    val display_name: String = "",
    val first_name: String = "",
    val last_name: String = "",
    val email: String? = null,
    val phone: String? = null,
    val tags: List<String>? = null,
    val lifetime_value_cents: String? = null,
    val lifetime_currency: String? = null,
    val trip_count: Int = 0,
    val last_trip_title: String? = null,
    val last_trip_end_date: String? = null,
    val next_trip_title: String? = null,
    val next_trip_start_date: String? = null,
    val next_trip_status: String? = null,
    val next_trip_destinations: List<String>? = null,
    val archived_at: String? = null,
    val total_count: Int = 0,
) {
    fun toDomain() = RosterClient(
        clientId = client_id,
        displayName = display_name,
        // Built from the NAME PARTS, not the display name: `preferred_name` replaces the
        // first name in `display_name`, so "Belle Fitzwilliam-Castellanos" would give BF
        // where the record is Annabelle's.
        initials = buildString {
            first_name.trim().firstOrNull()?.let { append(it) }
            last_name.trim().firstOrNull()?.let { append(it) }
        }.uppercase().ifBlank { "?" },
        email = email,
        phone = phone,
        tags = tags.orEmpty(),
        archived = archived_at != null,
        // NULL currency is the accessor's way of saying nothing is committed. Kept as null
        // rather than folded to 0 so the screen can show a dash instead of "$0.00".
        lifetimeValueCents = if (lifetime_currency == null) null else lifetime_value_cents.cents(),
        lifetimeCurrency = lifetime_currency,
        tripCount = trip_count,
        lastTripTitle = last_trip_title,
        lastTripEndDate = last_trip_end_date,
        nextTripTitle = next_trip_title,
        nextTripStartDate = next_trip_start_date,
        nextTripStatus = next_trip_status,
        nextTripDestination = next_trip_destinations?.firstOrNull(),
    )
}

@Serializable
private data class RosterSummaryDto(
    val active_count: Int = 0,
    val in_motion_count: Int = 0,
    val inquiry_count: Int = 0,
    val archived_count: Int = 0,
) {
    fun toDomain() = ClientRosterSummary(
        activeCount = active_count,
        inMotionCount = in_motion_count,
        inquiryCount = inquiry_count,
        archivedCount = archived_count,
    )
}

private fun initialsOf(first: String, last: String): String = buildString {
    first.trim().firstOrNull()?.let { append(it) }
    last.trim().firstOrNull()?.let { append(it) }
}.uppercase().ifBlank { "?" }

@Serializable
private data class LoyaltyDto(val program: String? = null, val tier: String? = null)

@Serializable
private data class OverviewDto(
    val client_id: String = "",
    val display_name: String = "",
    val first_name: String = "",
    val last_name: String = "",
    val email: String? = null,
    val phone: String? = null,
    val date_of_birth: String? = null,
    val status: String = "active",
    val tags: List<String>? = null,
    val address_line1: String? = null,
    val address_city: String? = null,
    val address_region: String? = null,
    val notes: String? = null,
    val created_at: String = "",
    val archived_at: String? = null,
    val preferred_destinations: List<String>? = null,
    val travel_styles: List<String>? = null,
    val dietary_restrictions: List<String>? = null,
    val dietary_notes: String? = null,
    val accessibility_needs: List<String>? = null,
    val accessibility_notes: String? = null,
    val loyalty_programs: List<LoyaltyDto>? = null,
    val budget_band: String? = null,
    val lifetime_value_cents: String? = null,
    val lifetime_currency: String? = null,
    val commission_cents: String? = null,
    val trip_count: Int = 0,
    val active_trip_count: Int = 0,
    val note_count: Int = 0,
    val document_count: Int = 0,
    val last_contact_at: String? = null,
    val as_of_date: String = "",
) {
    fun toDomain() = ClientOverviewRow(
        clientId = client_id,
        displayName = display_name,
        initials = initialsOf(first_name, last_name),
        email = email,
        phone = phone,
        status = status,
        archived = archived_at != null,
        tags = tags.orEmpty(),
        createdAt = created_at,
        addressLine = listOfNotNull(address_line1, address_city, address_region)
            .filter { it.isNotBlank() }
            .takeIf { it.isNotEmpty() }
            ?.joinToString(", "),
        dateOfBirth = date_of_birth,
        snapshotNote = notes,
        preferredDestinations = preferred_destinations.orEmpty(),
        travelStyles = travel_styles.orEmpty(),
        dietaryRestrictions = dietary_restrictions.orEmpty(),
        dietaryNote = dietary_notes,
        accessibilityNeeds = accessibility_needs.orEmpty(),
        accessibilityNote = accessibility_notes,
        // Programme and tier. The accessor returns the jsonb whole and the NUMBER is simply
        // never read out of it — a loyalty number is an account credential, and a booking
        // needs the programme and the tier.
        loyaltyPrograms = loyalty_programs.orEmpty()
            .mapNotNull { l -> l.program?.takeIf { it.isNotBlank() }?.let { it to l.tier } },
        budgetBand = budget_band,
        // A NULL currency is the accessor saying nothing is committed. Kept null rather than
        // folded to 0 so the screen shows a dash instead of "$0.00".
        lifetimeValueCents = if (lifetime_currency == null) null else lifetime_value_cents.cents(),
        commissionCents = if (lifetime_currency == null) null else commission_cents.cents(),
        lifetimeCurrency = lifetime_currency,
        tripCount = trip_count,
        activeTripCount = active_trip_count,
        noteCount = note_count,
        documentCount = document_count,
        lastContactAt = last_contact_at,
        asOfDate = as_of_date,
    )
}

@Serializable
private data class CompanionDto(
    val companion_id: String = "",
    val first_name: String = "",
    val last_name: String = "",
    val relationship: String? = null,
    val passport_expiry: String? = null,
) {
    fun toDomain() = CompanionRow(
        companionId = companion_id,
        name = "$first_name $last_name".trim(),
        initials = initialsOf(first_name, last_name),
        relationship = relationship,
        passportExpiry = passport_expiry,
    )
}

@Serializable
private data class ClientTripDto(
    val trip_id: String = "",
    val title: String = "",
    val status: String = "",
    val start_date: String? = null,
    val end_date: String? = null,
    val destinations: List<String>? = null,
    val total_value_cents: String? = null,
    val total_commission_cents: String? = null,
    val currency: String = "USD",
    val as_of_date: String = "",
) {
    fun toDomain() = ClientTripRow(
        tripId = trip_id,
        title = title,
        status = status,
        startDate = start_date,
        endDate = end_date,
        destination = destinations?.firstOrNull(),
        totalValueCents = total_value_cents.cents(),
        commissionCents = total_commission_cents.cents(),
        currency = currency,
        asOfDate = as_of_date,
    )
}

@Serializable
private data class ThreadDto(
    val conversation_id: String = "",
    val subject: String? = null,
    val trip_title: String? = null,
    val last_message_preview: String? = null,
    val last_message_at: String = "",
    val agent_unread_count: Int = 0,
    val message_count: Int = 0,
) {
    fun toDomain() = ClientThreadRow(
        conversationId = conversation_id,
        subject = subject,
        tripTitle = trip_title,
        preview = last_message_preview,
        lastMessageAt = last_message_at,
        unread = agent_unread_count,
        messageCount = message_count,
    )
}

@Serializable
private data class ClientDocDto(
    val document_id: String = "",
    val filename: String = "",
    val kind: String = "",
    val mime_type: String = "",
    val size_bytes: String? = null,
    val is_sensitive: Boolean = false,
    val trip_title: String? = null,
) {
    fun toDomain() = ClientDocumentRow(
        documentId = document_id,
        filename = filename,
        kind = kind,
        mimeType = mime_type,
        sizeBytes = size_bytes.cents(),
        sensitive = is_sensitive,
        tripTitle = trip_title,
    )
}

@Serializable
private data class NoteDto(
    val note_id: String = "",
    val body: String = "",
    val author_name: String? = null,
    val author_is_me: Boolean = false,
    val created_at: String = "",
    val updated_at: String = "",
) {
    fun toDomain() = ClientNoteRow(
        noteId = note_id,
        body = body,
        authorName = author_name,
        mine = author_is_me,
        createdAt = created_at,
        updatedAt = updated_at,
    )
}

@Serializable
private data class ActivityDto(
    val event_id: String = "",
    val event_type: String = "",
    val actor_name: String? = null,
    val created_at: String = "",
) {
    fun toDomain() = ClientActivityRow(
        eventId = event_id,
        eventType = event_type,
        actorName = actor_name,
        createdAt = created_at,
    )
}

// ──────────────────────────────────────────────────────────────────────────────
// §3.4.2's eight tabs
// ──────────────────────────────────────────────────────────────────────────────
//
// SEVEN DTOs FOR EIGHT TABS. The Notes tab is `trip.notes`, one text column on the overview
// row rather than a table of its own — `client_note` has a table and §3.3.7 an accessor;
// a trip's notes are a single field the advisor writes into. Data-Model §8.1.

@Serializable
private data class AgentTripOverviewDto(
    // `client_display_name`, NOT `client_name`. The accessor's column is the longer one and
    // a DTO field that does not match decodes to its default — so the trip header's client
    // line, which is the ONE link off this read-only screen, rendered as an empty tappable
    // strip. Nothing failed: `@Serializable` with a default is silent by design, the
    // compile was green and every unit test passed, because a test builds the domain row
    // directly and never goes through the DTO. The emulator is what found it.
    val trip_id: String = "",
    val client_id: String = "",
    val client_display_name: String = "",
    val title: String = "",
    val trip_type: String = "",
    val status: String = "",
    val start_date: String? = null,
    val end_date: String? = null,
    val destinations: List<String>? = null,
    val traveler_count: Int = 0,
    // Digit-strings, every one. PostgREST serialises bigint as a JSON number and loses
    // precision past 2^53, so the accessors return ::text and these parse it back.
    val total_value_cents: String? = null,
    val total_paid_cents: String? = null,
    val total_commission_cents: String? = null,
    val currency: String = "USD",
    val cancellation_reason: String? = null,
    val refund_status: String? = null,
    val refund_detail: String? = null,
    val notes: String? = null,
    val card_last4: String? = null,
    val card_brand: String? = null,
    val card_spending_limit_cents: String? = null,
    // `last_activity_at` is greatest(max status change, max unarchived conversation
    // message) — see the accessor's `activity` CTE. Deriving it from the status history
    // alone, which this did first, under-reports every trip whose last event was a client
    // message.
    val last_activity_at: String? = null,
    val component_count: Int = 0,
    val next_unpaid_due_date: String? = null,
    val as_of_date: String = "",
) {
    fun toDomain() = AgentTripOverviewRow(
        tripId = trip_id,
        clientId = client_id,
        clientName = client_display_name,
        title = title,
        tripType = trip_type,
        status = status,
        startDate = start_date,
        endDate = end_date,
        destinations = destinations.orEmpty(),
        travelerCount = traveler_count,
        totalValueCents = total_value_cents.cents(),
        totalPaidCents = total_paid_cents.cents(),
        totalCommissionCents = total_commission_cents.cents(),
        currency = currency,
        cancellationReason = cancellation_reason,
        refundStatus = refund_status,
        refundDetail = refund_detail,
        notes = notes,
        cardLast4 = card_last4,
        cardBrand = card_brand,
        // NULL rather than 0: no card on file is not a zero limit, and a confident "$0 cap"
        // on a payment surface is the kind of figure an advisor would act on.
        cardSpendingLimitCents = card_spending_limit_cents?.toLongOrNull(),
        lastActivityAt = last_activity_at,
        componentCount = component_count,
        nextUnpaidDueDate = next_unpaid_due_date,
        asOfDate = as_of_date,
    )
}

@Serializable
private data class AgentTripComponentDto(
    val component_id: String = "",
    val kind: String = "",
    val display_name: String = "",
    val supplier_name: String? = null,
    val start_date: String? = null,
    val end_date: String? = null,
    val start_time: String? = null,
    val end_time: String? = null,
    val location: String? = null,
    val cost_cents: String? = null,
    val currency: String = "USD",
) {
    fun toDomain() = AgentTripComponentRow(
        componentId = component_id,
        kind = kind,
        displayName = display_name,
        supplierName = supplier_name,
        startDate = start_date,
        endDate = end_date,
        startTime = start_time,
        endTime = end_time,
        location = location,
        costCents = cost_cents.cents(),
        currency = currency,
    )
}

/**
 * `agent_trip_itinerary_meta`, of which this side reads one column.
 *
 * The accessor returns six. `cover_image_url`, `intro_note` and `closing_note` belong to
 * the screens that write and render the itinerary itself, and `last_published_at` has no
 * producer at all — `itinerary_touch()` does not set it despite the name, which is correct
 * because publishing is §3.5's. Declaring a field here that nothing reads would suggest
 * otherwise.
 */
@Serializable
private data class AgentTripItineraryMetaDto(
    val published_at: String? = null,
)

/**
 * ONE ROW PER ACTIVITY, with the day's own fields repeated on every one of them.
 *
 * `agent_trip_itinerary_days` LEFT JOINs activities onto days, so a day with three entries
 * arrives as three rows and a day with NONE arrives as one row whose activity columns are
 * all NULL. Both matter: the empty day is a real state — the seeded trip has two of them —
 * and grouping has to keep it rather than filtering it out with the nulls.
 */
@Serializable
private data class AgentTripDayDto(
    val day_id: String = "",
    val day_number: Int = 0,
    val date: String = "",
    val day_label: String? = null,
    val day_summary: String? = null,
    val activity_id: String? = null,
    val block: String? = null,
    val start_time: String? = null,
    val activity_title: String? = null,
    val activity_body: String? = null,
    val location: String? = null,
    val gyasis_tip: String? = null,
)

@Serializable
private data class AgentTripPaymentDto(
    val milestone_id: String = "",
    val label: String = "",
    val amount_cents: String? = null,
    val paid_cents: String? = null,
    val currency: String = "USD",
    val due_date: String? = null,
    val status: String = "",
) {
    fun toDomain() = AgentTripPaymentRow(
        milestoneId = milestone_id,
        label = label,
        amountCents = amount_cents.cents(),
        paidCents = paid_cents.cents(),
        currency = currency,
        dueDate = due_date,
        status = status,
    )
}

@Serializable
private data class AgentTripDocumentDto(
    val document_id: String = "",
    val kind: String = "",
    val filename: String = "",
    val size_bytes: String? = null,
    val is_sensitive: Boolean = false,
    val created_at: String = "",
) {
    fun toDomain() = AgentTripDocumentRow(
        documentId = document_id,
        kind = kind,
        filename = filename,
        sizeBytes = size_bytes.cents(),
        isSensitive = is_sensitive,
        createdAt = created_at,
    )
}

@Serializable
private data class AgentTripMessageDto(
    val message_id: String = "",
    val sender_role: String = "",
    val body: String = "",
    val created_at: String = "",
    val is_internal_note: Boolean = false,
) {
    fun toDomain() = AgentTripMessageRow(
        messageId = message_id,
        senderRole = sender_role,
        body = body,
        createdAt = created_at,
        isInternalNote = is_internal_note,
    )
}

@Serializable
private data class AgentTripActivityDto(
    val history_id: String = "",
    val from_status: String? = null,
    val to_status: String = "",
    val changed_at: String = "",
    val changed_by_name: String? = null,
) {
    fun toDomain() = AgentTripActivityRow(
        historyId = history_id,
        fromStatus = from_status,
        toStatus = to_status,
        changedAt = changed_at,
        changedByName = changed_by_name,
    )
}

/**
 * Fold the flat join back into days.
 *
 * Order is preserved from the accessor rather than re-sorted: it already returns
 * `ORDER BY d.day_number, act.order_index`, and sorting again here would be a second
 * opinion about sequence that could disagree with the web's.
 */
internal fun List<AgentTripDayRowLike>.groupIntoDays(): List<AgentTripItineraryDay> {
    val out = mutableListOf<AgentTripItineraryDay>()
    for (row in this) {
        val last = out.lastOrNull()
        val day = if (last != null && last.dayId == row.dayId) {
            out.removeAt(out.size - 1)
            last
        } else {
            AgentTripItineraryDay(
                dayId = row.dayId,
                dayNumber = row.dayNumber,
                date = row.date,
                label = row.label,
                summary = row.summary,
                activities = emptyList(),
            )
        }
        // A day with no activities arrives as ONE row with every activity column NULL.
        // Keeping the day and dropping the phantom activity is the whole point of the fold.
        val activities = if (row.activityId == null) {
            day.activities
        } else {
            day.activities + AgentTripActivity(
                activityId = row.activityId,
                block = row.block,
                startTime = row.startTime,
                title = row.title,
                body = row.body,
                location = row.location,
                gyasisTip = row.gyasisTip,
            )
        }
        out.add(day.copy(activities = activities))
    }
    return out
}

/**
 * The shape [groupIntoDays] needs, so the fold can be unit-tested without a DTO whose
 * `@Serializable` machinery and private visibility both get in the way.
 */
internal data class AgentTripDayRowLike(
    val dayId: String,
    val dayNumber: Int,
    val date: String,
    val label: String?,
    val summary: String?,
    val activityId: String?,
    val block: String?,
    val startTime: String?,
    val title: String?,
    val body: String?,
    val location: String?,
    val gyasisTip: String?,
)

private fun AgentTripDayDto.asLike() = AgentTripDayRowLike(
    dayId = day_id,
    dayNumber = day_number,
    date = date,
    label = day_label,
    summary = day_summary,
    activityId = activity_id,
    block = block,
    startTime = start_time,
    title = activity_title,
    body = activity_body,
    location = location,
    gyasisTip = gyasis_tip,
)
