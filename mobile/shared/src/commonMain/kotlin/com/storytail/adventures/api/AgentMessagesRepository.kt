package com.storytail.adventures.api

import com.storytail.adventures.domain.agent.AgentThreadListRow
import com.storytail.contracts.AgentArchiveThreadsRequest
import com.storytail.contracts.AgentArchiveThreadsRequestOp
import com.storytail.contracts.AgentArchiveThreadsResponse
import com.storytail.contracts.AgentMarkThreadReadRequest
import com.storytail.contracts.AgentMarkThreadReadRequestOp
import com.storytail.contracts.AgentMarkThreadReadResponse
import com.storytail.contracts.AgentSendMessageRequest
import com.storytail.contracts.AgentSendMessageRequestOp
import com.storytail.contracts.AgentSendMessageResponse
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.exceptions.RestException
import io.github.jan.supabase.functions.functions
import io.github.jan.supabase.postgrest.postgrest
import io.ktor.client.statement.bodyAsText
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.put

/**
 * §3.10 on the phone (Stage 3): the advisor's Messages tab. Its own repository, on the rule
 * the retired §2.4 wallet set: one when a section shares no read with an existing file.
 *
 * ── THE SAME SQL THE WEB READS ──────────────────────────────────────────────────
 *
 * Every read is a SECURITY DEFINER accessor over `current_agent_id()`, from
 * 20261015120000_agent_messaging.sql: `agent_message_threads`, `agent_message_summary`,
 * `agent_conversation`, `agent_conversation_messages` and `agent_message_target`. A second
 * read shape for the same rows would be a second thing to keep true, so there is none. Zero
 * rows means "not yours" and "not there" alike, so ids cannot be probed.
 *
 * ── THE WRITES GO THROUGH `agent-message`, TYPED BY THE CONTRACT ────────────────
 *
 * Send, read and archive are the Edge Function's three ops, with request and response shapes
 * generated from `contracts/openapi.yaml` (§3.10 Stage 3 added them). The SQL writes are
 * service_role only: each takes the agent id as trusted input, and the function supplies it.
 *
 * `functions.invoke` THROWS ON A NON-2xx (CLAUDE.md, "Local development gotchas"): the
 * function's sentence is read off `RestException.error`, never `message`.
 */
interface AgentMessagesRepository {
    suspend fun inbox(query: AgentInboxQuery): AgentInboxRead

    /** The Messages tab's badge: unread THREADS. Null when the read failed or the caller is not an agent. */
    suspend fun unreadThreads(): Int?

    suspend fun thread(conversationId: String): AgentThreadRead

    /** Who a new message is for, and their live thread when there already is one. */
    suspend fun target(clientId: String, tripId: String?): AgentMessageTargetRead

    suspend fun send(request: AgentSendRequest): AgentSendOutcome

    /** Clears the advisor's unread count up to [seenUpTo], exactly as PostgREST wrote it. */
    suspend fun markRead(conversationId: String, seenUpTo: String): Boolean

    suspend fun setArchived(conversationId: String, archived: Boolean): AgentArchiveOutcome
}

data class AgentInboxQuery(
    val archived: Boolean = false,
    val unread: Boolean = false,
    val overdue: Boolean = false,
    val search: String? = null,
    /** A window that widens, not a page: the phone appends (3.3m's rule). */
    val limit: Int = 25,
)

data class AgentInboxSummary(
    val unreadThreads: Int,
    val overdueThreads: Int,
    val archivedThreads: Int,
)

sealed interface AgentInboxRead {
    data class Ok(val summary: AgentInboxSummary, val rows: List<AgentThreadListRow>, val total: Int) : AgentInboxRead
    data object Forbidden : AgentInboxRead
    data object Failed : AgentInboxRead
}

data class AgentThreadHeader(
    val conversationId: String,
    val clientId: String,
    val clientName: String,
    val clientFirstName: String,
    val tripId: String?,
    val tripTitle: String?,
    val replyDueAt: String?,
    val overdue: Boolean,
    val archived: Boolean,
    val clientCanSignIn: Boolean,
)

data class AgentThreadMessage(
    val id: String,
    /** True for the advisor's own (and their notes); false for the client's. */
    val fromAgent: Boolean,
    val body: String,
    /** EXACTLY as PostgREST wrote it: the newest one is the `seenUpTo` a read or reply sends. */
    val createdAt: String,
    val internalNote: Boolean,
    val attachmentNames: List<String>,
    /** §3.10 Stage 4: an email carried this reply to the client (the "Emailed" mark). */
    val emailed: Boolean = false,
    /** The client wrote this by replying to an email. */
    val byEmail: Boolean = false,
    /** §3.12.2: the out-of-office reply sent for the advisor while they were away. */
    val autoReply: Boolean = false,
)

sealed interface AgentThreadRead {
    data class Ok(val header: AgentThreadHeader, val messages: List<AgentThreadMessage>) : AgentThreadRead
    data object NotFound : AgentThreadRead
    data object Forbidden : AgentThreadRead
    data object Failed : AgentThreadRead
}

data class AgentMessageTarget(
    val clientId: String,
    val clientName: String,
    val clientFirstName: String,
    val tripId: String?,
    val tripTitle: String?,
    val conversationId: String?,
    val clientCanSignIn: Boolean,
)

sealed interface AgentMessageTargetRead {
    data class Ok(val target: AgentMessageTarget) : AgentMessageTargetRead
    data object NotFound : AgentMessageTargetRead
    data object Failed : AgentMessageTargetRead
}

/** Into a thread, OR to a client (and optionally a trip). Never both. */
data class AgentSendRequest(
    /** Minted once per draft, reused for a retry of the same words. */
    val messageId: String,
    val body: String,
    val internalNote: Boolean,
    val conversationId: String? = null,
    val clientId: String? = null,
    val tripId: String? = null,
    val seenUpTo: String? = null,
)

sealed interface AgentSendOutcome {
    data class Sent(val conversationId: String) : AgentSendOutcome

    /** `detail` is a 4xx sentence the function wrote, or null for anything else. */
    data class Failed(val detail: String?) : AgentSendOutcome
}

sealed interface AgentArchiveOutcome {
    data object Done : AgentArchiveOutcome
    data class Failed(val detail: String?) : AgentArchiveOutcome
}

class UnconfiguredAgentMessagesRepository : AgentMessagesRepository {
    override suspend fun inbox(query: AgentInboxQuery): AgentInboxRead = AgentInboxRead.Failed
    override suspend fun unreadThreads(): Int? = null
    override suspend fun thread(conversationId: String): AgentThreadRead = AgentThreadRead.Failed
    override suspend fun target(clientId: String, tripId: String?): AgentMessageTargetRead = AgentMessageTargetRead.Failed
    override suspend fun send(request: AgentSendRequest): AgentSendOutcome = AgentSendOutcome.Failed(null)
    override suspend fun markRead(conversationId: String, seenUpTo: String): Boolean = false
    override suspend fun setArchived(conversationId: String, archived: Boolean): AgentArchiveOutcome =
        AgentArchiveOutcome.Failed(null)
}

class SupabaseAgentMessagesRepository(private val client: SupabaseClient) : AgentMessagesRepository {

    private val json = Json { ignoreUnknownKeys = true }

    /** Both reads at once: nothing in one depends on the other. */
    override suspend fun inbox(query: AgentInboxQuery): AgentInboxRead = try {
        coroutineScope {
            val summaryCall = async { client.postgrest.rpc("agent_message_summary").decodeList<SummaryDto>() }
            val threadsCall = async {
                client.postgrest
                    .rpc(
                        "agent_message_threads",
                        buildJsonObject {
                            put("p_archived", query.archived)
                            put("p_unread", query.unread)
                            put("p_overdue", query.overdue)
                            query.search?.trim()?.takeIf { it.isNotEmpty() }?.let { put("p_search", it.take(100)) }
                            put("p_limit", query.limit)
                            put("p_offset", 0)
                        },
                    )
                    .decodeList<ThreadListDto>()
            }
            // Not an advisor: the summary answers no row rather than a row of zeros.
            val summary = summaryCall.await().firstOrNull() ?: return@coroutineScope AgentInboxRead.Forbidden
            val rows = threadsCall.await()
            AgentInboxRead.Ok(
                summary = AgentInboxSummary(summary.unread_threads, summary.overdue_threads, summary.archived_threads),
                rows = rows.map { it.toDomain() },
                total = rows.firstOrNull()?.total_count ?: 0,
            )
        }
    } catch (cancellation: CancellationException) {
        throw cancellation
    } catch (rest: RestException) {
        if (rest.statusCode in 401..403) AgentInboxRead.Forbidden else AgentInboxRead.Failed
    } catch (_: Exception) {
        AgentInboxRead.Failed
    }

    override suspend fun unreadThreads(): Int? = try {
        client.postgrest.rpc("agent_message_summary").decodeList<SummaryDto>().firstOrNull()?.unread_threads
    } catch (cancellation: CancellationException) {
        throw cancellation
    } catch (_: Exception) {
        null
    }

    override suspend fun thread(conversationId: String): AgentThreadRead = try {
        coroutineScope {
            val arg = buildJsonObject { put("p_conversation_id", conversationId) }
            val headerCall = async { client.postgrest.rpc("agent_conversation", arg).decodeList<ConversationDto>() }
            val messagesCall = async {
                client.postgrest.rpc("agent_conversation_messages", arg).decodeList<ConversationMessageDto>()
            }
            val header = headerCall.await().firstOrNull() ?: return@coroutineScope AgentThreadRead.NotFound
            AgentThreadRead.Ok(header.toDomain(), messagesCall.await().map { it.toDomain() })
        }
    } catch (cancellation: CancellationException) {
        throw cancellation
    } catch (rest: RestException) {
        if (rest.statusCode in 401..403) AgentThreadRead.Forbidden else AgentThreadRead.Failed
    } catch (_: Exception) {
        AgentThreadRead.Failed
    }

    override suspend fun target(clientId: String, tripId: String?): AgentMessageTargetRead = try {
        val row = client.postgrest
            .rpc(
                "agent_message_target",
                buildJsonObject {
                    put("p_client_id", clientId)
                    tripId?.let { put("p_trip_id", it) }
                },
            )
            .decodeList<TargetDto>()
            .firstOrNull()
        if (row == null) AgentMessageTargetRead.NotFound else AgentMessageTargetRead.Ok(row.toDomain())
    } catch (cancellation: CancellationException) {
        throw cancellation
    } catch (_: Exception) {
        AgentMessageTargetRead.Failed
    }

    override suspend fun send(request: AgentSendRequest): AgentSendOutcome {
        val body = AgentSendMessageRequest(
            op = AgentSendMessageRequestOp.SEND,
            messageId = request.messageId,
            conversationId = request.conversationId,
            clientId = if (request.conversationId == null) request.clientId else null,
            tripId = if (request.conversationId == null) request.tripId else null,
            body = request.body.trim(),
            internalNote = request.internalNote,
            seenUpTo = request.seenUpTo,
        )
        return try {
            val response = client.functions.invoke("agent-message", encode(AgentSendMessageRequest.serializer(), body))
            val sent = json.decodeFromString(AgentSendMessageResponse.serializer(), response.bodyAsText())
            AgentSendOutcome.Sent(sent.conversationId)
        } catch (cancellation: CancellationException) {
            throw cancellation
        } catch (rest: RestException) {
            // NEVER log the body: it is somebody's message.
            AgentSendOutcome.Failed(problemDetail(rest))
        } catch (_: Throwable) {
            AgentSendOutcome.Failed(null)
        }
    }

    override suspend fun markRead(conversationId: String, seenUpTo: String): Boolean = try {
        val request = AgentMarkThreadReadRequest(
            op = AgentMarkThreadReadRequestOp.READ,
            conversationId = conversationId,
            seenUpTo = seenUpTo,
        )
        val response = client.functions.invoke("agent-message", encode(AgentMarkThreadReadRequest.serializer(), request))
        json.decodeFromString(AgentMarkThreadReadResponse.serializer(), response.bodyAsText()).changed
    } catch (cancellation: CancellationException) {
        throw cancellation
    } catch (_: Throwable) {
        // Reading is a side effect of opening a thread. A failure leaves the badge one higher
        // than the truth until the next open; it is not worth an error on the screen.
        false
    }

    override suspend fun setArchived(conversationId: String, archived: Boolean): AgentArchiveOutcome = try {
        val request = AgentArchiveThreadsRequest(
            op = AgentArchiveThreadsRequestOp.ARCHIVE,
            conversationIds = listOf(conversationId),
            archived = archived,
        )
        val response = client.functions.invoke("agent-message", encode(AgentArchiveThreadsRequest.serializer(), request))
        json.decodeFromString(AgentArchiveThreadsResponse.serializer(), response.bodyAsText())
        AgentArchiveOutcome.Done
    } catch (cancellation: CancellationException) {
        throw cancellation
    } catch (rest: RestException) {
        AgentArchiveOutcome.Failed(problemDetail(rest))
    } catch (_: Throwable) {
        AgentArchiveOutcome.Failed(null)
    }

    /**
     * The contract type as a JsonObject. `encodeDefaults` stays off, so an optional field left
     * null is OMITTED rather than sent as `null`: the function reads a present-but-null address
     * the same as an absent one, but an omitted field is the contract's own shape.
     */
    private fun <T> encode(serializer: kotlinx.serialization.KSerializer<T>, value: T): JsonObject =
        json.encodeToJsonElement(serializer, value).jsonObject

    /** 4xx only: those are sentences we wrote. Read from `error`, never `message` (AgentRepository.problemDetail says why). */
    private fun problemDetail(rest: RestException): String? {
        if (rest.statusCode !in 400..499) return null
        return runCatching { json.decodeFromString(ProblemDto.serializer(), rest.error).detail }.getOrNull()
    }
}

@Serializable
private data class ProblemDto(val detail: String? = null)

@Suppress("PropertyName")
@Serializable
private data class SummaryDto(
    val open_threads: Int = 0,
    val unread_threads: Int = 0,
    val unread_messages: Int = 0,
    val overdue_threads: Int = 0,
    val archived_threads: Int = 0,
)

@Suppress("PropertyName")
@Serializable
private data class ThreadListDto(
    val conversation_id: String,
    val client_id: String,
    val client_display_name: String,
    val trip_id: String? = null,
    val trip_title: String? = null,
    val last_message_at: String,
    val last_message_preview: String? = null,
    val last_sender_role: String? = null,
    val agent_unread_count: Int = 0,
    val reply_due_at: String? = null,
    val overdue: Boolean = false,
    val archived: Boolean = false,
    val total_count: Int = 0,
) {
    fun toDomain() = AgentThreadListRow(
        conversationId = conversation_id,
        clientId = client_id,
        clientName = client_display_name,
        tripId = trip_id,
        tripTitle = trip_title,
        lastMessageAt = last_message_at,
        lastMessagePreview = last_message_preview,
        lastSenderRole = last_sender_role,
        unread = agent_unread_count,
        replyDueAt = reply_due_at,
        overdue = overdue,
        archived = archived,
        totalCount = total_count,
    )
}

@Suppress("PropertyName")
@Serializable
private data class ConversationDto(
    val conversation_id: String,
    val client_id: String,
    val client_display_name: String,
    val client_first_name: String,
    val trip_id: String? = null,
    val trip_title: String? = null,
    val reply_due_at: String? = null,
    val overdue: Boolean = false,
    val archived: Boolean = false,
    val client_can_sign_in: Boolean = false,
) {
    fun toDomain() = AgentThreadHeader(
        conversationId = conversation_id,
        clientId = client_id,
        clientName = client_display_name,
        clientFirstName = client_first_name,
        tripId = trip_id,
        tripTitle = trip_title,
        replyDueAt = reply_due_at,
        overdue = overdue,
        archived = archived,
        clientCanSignIn = client_can_sign_in,
    )
}

@Serializable
internal data class AttachmentDto(val filename: String)

@Suppress("PropertyName")
@Serializable
// internal, not private, so AgentEmailMarkTest can pin the decode contract.
internal data class ConversationMessageDto(
    val message_id: String,
    val sender_role: String,
    val body: String,
    val is_internal_note: Boolean = false,
    val created_at: String,
    val attachments: List<AttachmentDto> = emptyList(),
    // §3.10 Stage 4. NO defaults: PostgREST always sends both keys, so a misspelt name fails the
    // decode loudly instead of silently reading as "never emailed".
    val emailed_at: String?,
    val channel: String,
    // §3.12.2. No default either, for the same reason as the two above.
    val is_auto_reply: Boolean,
) {
    fun toDomain() = AgentThreadMessage(
        id = message_id,
        // Anything but the client is the advisor's side (an admin writes as staff too).
        fromAgent = sender_role != "client",
        body = body,
        createdAt = created_at,
        internalNote = is_internal_note,
        attachmentNames = attachments.map { it.filename },
        emailed = emailed_at != null,
        byEmail = channel == "email",
        autoReply = is_auto_reply,
    )
}

@Suppress("PropertyName")
@Serializable
private data class TargetDto(
    val client_id: String,
    val client_display_name: String,
    val client_first_name: String,
    val trip_id: String? = null,
    val trip_title: String? = null,
    val conversation_id: String? = null,
    val client_can_sign_in: Boolean = false,
) {
    fun toDomain() = AgentMessageTarget(
        clientId = client_id,
        clientName = client_display_name,
        clientFirstName = client_first_name,
        tripId = trip_id,
        tripTitle = trip_title,
        conversationId = conversation_id,
        clientCanSignIn = client_can_sign_in,
    )
}
