package com.storytail.adventures.api

import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.functions.functions
import io.ktor.client.statement.bodyAsText
import io.ktor.http.HttpStatusCode
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonPrimitive

/**
 * The §2.1.9–2.1.14 onboarding writes.
 *
 * PARALLEL IMPLEMENTATION of web/lib/onboarding/api.ts, and the reasoning is identical:
 * every wizard write goes through an Edge Function rather than PostgREST, because the tables
 * they touch have SELECT-only RLS and no write policy. A direct `.update()` would match zero
 * rows and return 204 — succeeding loudly while changing nothing. `client` is also a
 * sensitive table under CLAUDE.md rule 3 and owes an `audit_event` on every mutation, which
 * only the function side can write.
 *
 * The caller's own access token is what travels; the service-role key exists only on the far
 * side of that boundary and never enters this module (Data-Model §21.2).
 */
interface OnboardingRepository {
    suspend fun call(function: OnboardingFunction, body: JsonObject): OnboardingResult
}

/** The five functions the wizard writes through. */
enum class OnboardingFunction(val path: String) {
    STEP("onboarding-step"),
    PROFILE("onboarding-profile"),
    PREFERENCES("onboarding-preferences"),
    COMPANIONS("onboarding-companions"),
    CONNECT("onboarding-connect"),
}

/**
 * What a call produced.
 *
 * Failure is a value rather than a throw, because every caller is a ViewModel that has to
 * turn it into screen state. The three kinds map to the three things a screen can usefully
 * do: send somebody back to sign in, say what was wrong with what they entered, or admit it
 * did not work and offer to try again.
 */
sealed interface OnboardingResult {
    data class Ok(val body: JsonObject) : OnboardingResult

    data object Unauthenticated : OnboardingResult

    /**
     * A 4xx the function chose to send, carrying its own sentence about what was wrong.
     *
     * Only ever populated from a problem+json `detail` the functions build from their own
     * `badRequest(...)` messages. A 5xx detail is deliberately dropped — those carry
     * whatever Postgres said, and that belongs in the function log rather than in front of
     * a traveler.
     */
    data class Rejected(val detail: String?) : OnboardingResult

    data object Unavailable : OnboardingResult
}

/** Before local.properties carries a URL and a key there is nothing to call. */
class UnconfiguredOnboardingRepository : OnboardingRepository {
    override suspend fun call(
        function: OnboardingFunction,
        body: JsonObject,
    ): OnboardingResult = OnboardingResult.Unavailable
}

class SupabaseOnboardingRepository(
    private val client: SupabaseClient,
) : OnboardingRepository {

    private val json = Json { ignoreUnknownKeys = true }

    override suspend fun call(
        function: OnboardingFunction,
        body: JsonObject,
    ): OnboardingResult {
        val response = try {
            client.functions.invoke(function.path, body)
        } catch (throwable: Throwable) {
            // The function never answered. NEVER log the body — it is somebody's profile.
            return OnboardingResult.Unavailable
        }

        val status = response.status
        val text = runCatching { response.bodyAsText() }.getOrDefault("")

        return when {
            status.value in 200..299 -> OnboardingResult.Ok(parseObject(text))
            status == HttpStatusCode.Unauthorized || status == HttpStatusCode.Forbidden ->
                OnboardingResult.Unauthenticated
            status.value in 400..499 -> OnboardingResult.Rejected(problemDetail(text))
            else -> OnboardingResult.Unavailable
        }
    }

    private fun parseObject(text: String): JsonObject =
        runCatching { json.parseToJsonElement(text) as JsonObject }
            .getOrDefault(JsonObject(emptyMap()))

    /** The `detail` from an RFC 7807 body, if it carried one. */
    private fun problemDetail(text: String): String? = runCatching {
        (json.parseToJsonElement(text) as JsonObject)["detail"]?.jsonPrimitive?.content
    }.getOrNull()
}
