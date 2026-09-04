package com.storytail.adventures.api

import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.functions.functions
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.query.Columns
import io.github.jan.supabase.postgrest.query.Order
import com.storytail.adventures.domain.onboarding.CompletionSummary
import com.storytail.adventures.domain.onboarding.LinkedTrip
import io.ktor.client.statement.bodyAsText
import io.ktor.http.HttpStatusCode
import kotlinx.coroutines.CancellationException
import kotlinx.serialization.Serializable
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

    /**
     * Where the signed-in traveler is in the wizard, or null if it cannot be read.
     *
     * Read through the caller's own session and `platform_user_self_select`, never the
     * service role — somebody reading their own row is exactly what that policy is for.
     */
    suspend fun status(): OnboardingStatus?

    /**
     * What the wizard actually collected, for Screen 2.1m.14 to report.
     *
     * Read back rather than assumed, and read through the caller's own session and the
     * self-select policies. An empty summary is the safe answer when a read fails: the
     * checklist then says "skipped, add it any time", which is at worst an invitation to
     * redo something already done.
     */
    suspend fun completionSummary(): CompletionSummary

    /**
     * The trips already on this account, for Screen 2.1m.13's banner.
     *
     * The auto-match at email confirmation may have linked a trip before the traveler ever
     * reached this screen, and the whole premise of 2.1.13 is being honest about what has
     * already happened. An empty list on failure is the safe answer: the banner then says
     * "nothing linked yet", which invites a code rather than claiming there is nothing.
     */
    suspend fun linkedTrips(): List<LinkedTrip>

    /**
     * The signed-in address, for 2.1m.13 to say which one the match keyed on.
     *
     * On this repository rather than `AuthRepository` so the Connect screen keeps a single
     * dependency — it is the same session object either way, and every other caller of this
     * fact is on this screen.
     */
    suspend fun currentEmail(): String?

    /**
     * The name to greet somebody by on Screen 2.1m.9, or null.
     *
     * `handle_new_user()` falls back to the literal 'New' when a sign-up carried no name at
     * all — a social provider that sends no name claims, which Apple does on every
     * authorization after the first. Greeting somebody as "New" is worse than greeting them
     * as nobody in particular, so the placeholder is treated as absent.
     *
     * Prefers `preferred_name`: if a traveler has told Gyasi they go by something, the
     * welcome screen is where that should show up.
     */
    suspend fun greetableFirstName(): String?
}

/**
 * The wizard's state for one account.
 *
 * Null everywhere is a legitimate answer for an agent, who has no wizard at all.
 */
data class OnboardingStatus(
    val isClient: Boolean,
    val completed: Boolean,
    val step: String?,
)

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

    override suspend fun status(): OnboardingStatus? = null

    override suspend fun completionSummary() = CompletionSummary()

    override suspend fun linkedTrips(): List<LinkedTrip> = emptyList()

    override suspend fun currentEmail(): String? = null

    override suspend fun greetableFirstName(): String? = null
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
        } catch (cancellation: CancellationException) {
            // The screen is leaving; let the cancellation finish its job rather than
            // reporting it to a caller that is about to disappear.
            throw cancellation
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

    /**
     * FAILS OPEN. A null answer means "do not route them into the wizard", which is what a
     * bookkeeping read going wrong should cost: being unable to reach your own dashboard
     * because a status query failed is a far worse outcome than seeing the wizard once more.
     * The web gate makes the same choice in web/lib/onboarding/status.ts.
     */
    override suspend fun status(): OnboardingStatus? = read {
        client.postgrest
            .from("platform_user")
            .select(Columns.list("role", "onboarding_step", "onboarding_completed_at"))
            .decodeSingleOrNull<PlatformUserRow>()
    }?.let {
        OnboardingStatus(
            isClient = it.role == "client",
            completed = it.onboarding_completed_at != null,
            step = it.onboarding_step,
        )
    }

    /**
     * Four reads, each answering a question the screen would otherwise guess.
     *
     * `client.phone` (or a birth date, or an address) rather than the row's existence,
     * because the row ALWAYS exists — `handle_new_user()` creates it at sign-up. Whether
     * somebody told us anything is a different question from whether they have a record.
     *
     * EACH READ IS GUARDED SEPARATELY. A `travel_preference` read that throws must not turn
     * into "how you like to travel — skipped": that is an infrastructure fault wearing the
     * face of a choice the traveler made, on the one screen whose whole job is not doing
     * that. Failing the whole summary would say it about all three at once, so each falls
     * back on its own and the others still tell the truth.
     */
    override suspend fun completionSummary(): CompletionSummary {
        val clientRow = read {
            client.postgrest.from("client")
                .select(
                    Columns.list(
                        "first_name", "preferred_name", "phone", "date_of_birth",
                        "mailing_address_id",
                    ),
                )
                .decodeSingleOrNull<ClientRow>()
        }
        val preferences = read {
            client.postgrest.from("travel_preference")
                .select(Columns.list("id"))
                .decodeSingleOrNull<IdRow>()
        }
        val companions = read {
            client.postgrest.from("companion")
                .select(Columns.list("id")) {
                    filter { exact("archived_at", null) }
                    limit(1)
                }
                .decodeList<IdRow>()
        }
        val trips = read { soonestTrips(limit = 1) }

        return CompletionSummary(
            firstName = clientRow.greetableName(),
            hasProfile = clientRow?.phone != null ||
                clientRow?.date_of_birth != null ||
                clientRow?.mailing_address_id != null,
            hasPreferences = preferences != null,
            hasCompanions = (companions?.size ?: 0) > 0,
            trip = trips?.firstOrNull(),
        )
    }

    override suspend fun linkedTrips(): List<LinkedTrip> = read { soonestTrips() }.orEmpty()

    /**
     * The trips worth greeting somebody with, soonest first.
     *
     * An archived or cancelled trip is not one of them, which is why this is a function
     * rather than two call sites that each have to remember the same two filters.
     */
    private suspend fun soonestTrips(limit: Int? = null): List<LinkedTrip> =
        client.postgrest.from("trip")
            .select(Columns.list("title", "start_date")) {
                filter {
                    exact("archived_at", null)
                    neq("status", "cancelled")
                }
                order("start_date", Order.ASCENDING, nullsFirst = false)
                if (limit != null) limit(limit.toLong())
            }
            .decodeList<TripRow>()
            .map { LinkedTrip(title = it.title, startDate = it.start_date) }

    override suspend fun currentEmail(): String? =
        read { client.auth.currentUserOrNull()?.email }

    override suspend fun greetableFirstName(): String? =
        read {
            client.postgrest.from("client")
                .select(Columns.list("first_name", "preferred_name"))
                .decodeSingleOrNull<ClientRow>()
        }.greetableName()

    /**
     * One guarded read. Null means "could not tell", never "the answer is no".
     *
     * CancellationException is re-thrown rather than swallowed. Compose cancels a screen's
     * scope when it leaves composition, and that cancellation travels as an exception —
     * catching it here would tell the caller "the read failed, carry on" inside a coroutine
     * that is supposed to be stopping, and the work would keep going after the screen is
     * gone.
     */
    private suspend fun <T> read(block: suspend () -> T): T? =
        try {
            block()
        } catch (cancellation: CancellationException) {
            throw cancellation
        } catch (throwable: Throwable) {
            // Never the row — it is somebody's profile.
            null
        }

    /**
     * The greetable name on a client row, or null.
     *
     * One place, because 2.1m.9 and 2.1m.14 both greet by name and both have to make the
     * same call about the 'New' placeholder.
     */
    private fun ClientRow?.greetableName(): String? {
        val name = this?.preferred_name?.trim()?.takeIf { it.isNotEmpty() }
            ?: this?.first_name?.trim()?.takeIf { it.isNotEmpty() }
        return name?.takeIf { it != "New" }
    }

    @Serializable
    private data class ClientRow(
        val first_name: String? = null,
        val preferred_name: String? = null,
        val phone: String? = null,
        val date_of_birth: String? = null,
        val mailing_address_id: String? = null,
    )

    @Serializable
    private data class IdRow(val id: String? = null)

    @Serializable
    private data class TripRow(val title: String = "", val start_date: String? = null)

    @Serializable
    private data class PlatformUserRow(
        val role: String? = null,
        val onboarding_step: String? = null,
        val onboarding_completed_at: String? = null,
    )

    private fun parseObject(text: String): JsonObject =
        runCatching { json.parseToJsonElement(text) as JsonObject }
            .getOrDefault(JsonObject(emptyMap()))

    /** The `detail` from an RFC 7807 body, if it carried one. */
    private fun problemDetail(text: String): String? = runCatching {
        (json.parseToJsonElement(text) as JsonObject)["detail"]?.jsonPrimitive?.content
    }.getOrNull()
}
