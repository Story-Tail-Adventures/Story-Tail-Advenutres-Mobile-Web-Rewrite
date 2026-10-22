package com.storytail.adventures.api

import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.exceptions.RestException
import io.github.jan.supabase.functions.functions
import kotlinx.coroutines.CancellationException
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonObject

/**
 * Screen 2.0.12 on the phone: "Message Gyasi" without an account, through `lead-message`, the
 * same function the web form posts to (BRD §6.5, 2026-10-21; Data-Model §11).
 *
 * NO SESSION NEEDED. The visitor has no account, which is the point; the client's anon key is
 * enough (`verify_jwt` is off for this function). The phone calls the function directly, so
 * the five-an-hour limit counts the phone's own network address and no form key is involved.
 */
data class LeadMessageInput(
    val firstName: String,
    val lastName: String,
    val email: String,
    val phone: String,
    val message: String,
    /** A catalog trip or a topic the visitor was viewing, already resolved from the catalog. */
    val about: LeadAbout?,
    /** Epoch ms when the form was drawn: the function drops a send made under three seconds. */
    val startedAt: Long,
)

data class LeadAbout(val kind: String, val slug: String, val label: String)

sealed interface LeadMessageResult {
    data object Sent : LeadMessageResult
    /** A 400 with a sentence the visitor can act on (written by the function). */
    data class Invalid(val detail: String) : LeadMessageResult
    data object Throttled : LeadMessageResult
    data object Unavailable : LeadMessageResult
}

interface LeadMessageRepository {
    suspend fun send(input: LeadMessageInput): LeadMessageResult
}

class UnconfiguredLeadMessageRepository : LeadMessageRepository {
    override suspend fun send(input: LeadMessageInput): LeadMessageResult = LeadMessageResult.Unavailable
}

class SupabaseLeadMessageRepository(private val client: SupabaseClient) : LeadMessageRepository {
    override suspend fun send(input: LeadMessageInput): LeadMessageResult = try {
        client.functions.invoke("lead-message", body(input))
        LeadMessageResult.Sent
    } catch (e: CancellationException) {
        throw e
    } catch (rest: RestException) {
        // `invoke` THROWS on a non-2xx (CLAUDE.md, "Local development gotchas"). The status is
        // `statusCode` and the raw body is on `error`, never `message`.
        when (rest.statusCode) {
            400 -> detailOf(rest.error)?.let { LeadMessageResult.Invalid(it) } ?: LeadMessageResult.Unavailable
            429 -> LeadMessageResult.Throttled
            else -> LeadMessageResult.Unavailable
        }
    } catch (_: Exception) {
        LeadMessageResult.Unavailable
    }

    private fun detailOf(raw: String?): String? = runCatching {
        Json.parseToJsonElement(raw ?: return null).jsonObject["detail"]?.jsonPrimitive?.content
    }.getOrNull()?.takeIf { it.isNotBlank() }

    companion object {
        /** The function's JSON body. `page` is "app": the web sends which public page it was. */
        fun body(input: LeadMessageInput): JsonObject = buildJsonObject {
            put("firstName", input.firstName)
            put("lastName", input.lastName)
            put("email", input.email)
            put("phone", input.phone)
            put("message", input.message)
            put("page", "app")
            input.about?.let { a ->
                putJsonObject("about") {
                    put("kind", a.kind)
                    put("slug", a.slug)
                    put("label", a.label)
                }
            }
            put("website", "")
            put("startedAt", input.startedAt)
        }
    }
}
