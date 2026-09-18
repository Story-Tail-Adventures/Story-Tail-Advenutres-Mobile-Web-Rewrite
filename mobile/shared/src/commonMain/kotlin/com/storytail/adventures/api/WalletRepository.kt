package com.storytail.adventures.api

import com.storytail.adventures.domain.uuidV7
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.exceptions.RestException
import io.github.jan.supabase.functions.functions
import io.ktor.client.request.url
import io.ktor.client.statement.bodyAsText
import io.ktor.http.HttpMethod
import kotlinx.coroutines.CancellationException
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/**
 * Screen Inventory §2.4's reads and writes.
 *
 * A REPOSITORY OF ITS OWN, unlike §2.6 — and the reason is the opposite of the reason §2.6
 * had to share `TripRepository`. §2.6's thread read is a PostgREST query that has to reuse
 * this file's private row types and its `message_attachment → document` embed, because two
 * copies of that logic would let 2.2.7 and 2.6.2 render the same conversation differently.
 * §2.4 has no PostgREST query at all: the payment tables hold no client-role privilege, so
 * every call here is `functions.invoke`, and there is nothing to share.
 *
 * WHY THERE IS NO POSTGREST PATH. `20260917090000_payment_domain_lockdown.sql` revoked every
 * client grant on `payment_card`, `card_authorization`, `authorization_request` and
 * `card_use_event`, and deliberately added no policy to replace it — a row policy cannot
 * withhold a column, and `stripe_payment_method_id` / `stripe_customer_id` are server-only
 * (Data-Model §21.2, CLAUDE.md rule 4). A `.select()` from here does not return an empty
 * list, it raises 42501.
 *
 * On native that is not a convenience argument. Compose Multiplatform has no server, so
 * without these functions §2.4 cannot read a card on Android or iOS at all.
 */
interface WalletRepository {

    /**
     * Everything §2.4 renders, in one call. Null on a failed read; an EMPTY wallet is a
     * different thing and gets the empty state.
     */
    suspend fun wallet(tripId: String? = null, cardId: String? = null): WalletSnapshot?

    /** 2.4.3. Returns the new authorization's id so the screen can push into 2.4.4. */
    suspend fun authorize(
        cardId: String,
        tripId: String,
        spendingLimitCents: Long,
        expiresAtIso: String,
    ): AuthorizeOutcome

    /** 2.4.7. Removes an AUTHORIZATION — never a card. See the Edge Function's own header. */
    suspend fun removeAuthorization(authorizationId: String): AuthorizeOutcome
}

data class WalletCardView(
    val id: String,
    /** Stripe's lowercase token. Use `brandChip`/`brandName` rather than rendering it raw. */
    val brand: String,
    val last4: String,
    val expMonth: Int,
    val expYear: Int,
    val nickname: String?,
    val status: String,
    val consentRecordedAt: String,
    val revokedAt: String?,
) {
    val isActive: Boolean get() = status == "active"
}

data class WalletAuthorizationView(
    val id: String,
    val cardId: String,
    val tripId: String,
    /** Null when the trip is unreadable — the function answers null rather than disclosing. */
    val tripTitle: String?,
    val spendingLimitCents: Long,
    val amountUsedCents: Long,
    val expiresAt: String,
    val status: String,
) {
    val isActive: Boolean get() = status == "active"

    /**
     * CLAMPED AT ZERO. A supplier charge landing after the limit was lowered, or a final
     * charge rounding past it, makes `amount_used_cents` exceed the limit — and a negative
     * remaining balance reads as though Story-Tail owes the traveler money. The web twin
     * clamps in `lib/wallet/format.ts` for the same reason, with a test on it.
     */
    val remainingCents: Long get() = (spendingLimitCents - amountUsedCents).coerceAtLeast(0)
}

data class WalletUseEventView(
    val id: String,
    val cardId: String,
    val tripId: String,
    val tripTitle: String?,
    /**
     * `supplier_name_snapshot`, never a join: a supplier renamed later must not rewrite a
     * traveler's history, and a portal booking names a merchant with no `supplier` row.
     */
    val supplierName: String,
    val amountCents: Long,
    val currency: String,
    val referenceNumber: String?,
    val createdAt: String,
)

data class WalletSnapshot(
    val cards: List<WalletCardView>,
    val authorizations: List<WalletAuthorizationView>,
    val events: List<WalletUseEventView>,
) {
    fun card(id: String): WalletCardView? = cards.firstOrNull { it.id == id }
    fun authorization(id: String): WalletAuthorizationView? = authorizations.firstOrNull { it.id == id }
    fun event(id: String): WalletUseEventView? = events.firstOrNull { it.id == id }

    /** Live authorizations for one card — what 2.4.1 summarises under each row. */
    fun activeAuthorizationsFor(cardId: String): List<WalletAuthorizationView> =
        authorizations.filter { it.cardId == cardId && it.isActive }
}

sealed interface AuthorizeOutcome {
    data class Done(val authorizationId: String) : AuthorizeOutcome
    /** `detail` is only ever a 4xx problem+json message — one we wrote. */
    data class Failed(val detail: String?) : AuthorizeOutcome
}

/** Before the Supabase client exists, or when it is not configured. */
class UnconfiguredWalletRepository : WalletRepository {
    override suspend fun wallet(tripId: String?, cardId: String?): WalletSnapshot? = null
    override suspend fun authorize(
        cardId: String,
        tripId: String,
        spendingLimitCents: Long,
        expiresAtIso: String,
    ): AuthorizeOutcome = AuthorizeOutcome.Failed(null)
    override suspend fun removeAuthorization(authorizationId: String): AuthorizeOutcome =
        AuthorizeOutcome.Failed(null)
}

class SupabaseWalletRepository(private val client: SupabaseClient) : WalletRepository {

    private val json = Json { ignoreUnknownKeys = true }

    override suspend fun wallet(tripId: String?, cardId: String?): WalletSnapshot? {
        val response = try {
            client.functions.invoke("payment-wallet") {
                method = HttpMethod.Get
                url {
                    tripId?.let { parameters.append("tripId", it) }
                    cardId?.let { parameters.append("cardId", it) }
                }
            }
        } catch (cancellation: CancellationException) {
            throw cancellation
        } catch (throwable: Throwable) {
            // Never log the throwable. Nothing in this payload is a secret — the function
            // withholds both Stripe columns — but a wallet error carrying a stack trace into
            // a log is the habit that eventually carries something that is.
            // A non-2xx arrives HERE, as a RestException — supabase-kt validates the
            // response rather than handing it back. Which is why there is no status check
            // below: by the time `response` exists it is a 2xx. The authorize path had one
            // and it was unreachable, which cost every rejection its sentence.
            return null
        }

        val body = runCatching {
            json.decodeFromString<WalletResponse>(response.bodyAsText())
        }.getOrNull() ?: return null

        return WalletSnapshot(
            cards = body.cards.map {
                WalletCardView(
                    id = it.id,
                    brand = it.brand,
                    last4 = it.last4,
                    expMonth = it.expMonth,
                    expYear = it.expYear,
                    nickname = it.nickname,
                    status = it.status,
                    consentRecordedAt = it.consentRecordedAt,
                    revokedAt = it.revokedAt,
                )
            },
            authorizations = body.authorizations.map {
                WalletAuthorizationView(
                    id = it.id,
                    cardId = it.cardId,
                    tripId = it.tripId,
                    tripTitle = it.tripTitle,
                    spendingLimitCents = it.spendingLimitCents,
                    amountUsedCents = it.amountUsedCents,
                    expiresAt = it.expiresAt,
                    status = it.status,
                )
            },
            events = body.events.map {
                WalletUseEventView(
                    id = it.id,
                    cardId = it.cardId,
                    tripId = it.tripId,
                    tripTitle = it.tripTitle,
                    supplierName = it.supplierName,
                    amountCents = it.amountCents,
                    currency = it.currency,
                    referenceNumber = it.referenceNumber,
                    createdAt = it.createdAt,
                )
            },
        )
    }

    override suspend fun authorize(
        cardId: String,
        tripId: String,
        spendingLimitCents: Long,
        expiresAtIso: String,
    ): AuthorizeOutcome {
        // Minted here so a retry is idempotent against the primary key, per Data-Model §21.6:
        // card_authorization.id has no default and the function checks the embedded timestamp
        // is recent.
        val authorizationId = uuidV7()
        val payload = buildJsonObject {
            put("action", JsonPrimitive("create"))
            put("authorizationId", JsonPrimitive(authorizationId))
            put("cardId", JsonPrimitive(cardId))
            put("tripId", JsonPrimitive(tripId))
            put("spendingLimitCents", JsonPrimitive(spendingLimitCents))
            put("expiresAt", JsonPrimitive(expiresAtIso))
        }
        return invoke(payload, authorizationId)
    }

    override suspend fun removeAuthorization(authorizationId: String): AuthorizeOutcome {
        val payload = buildJsonObject {
            put("action", JsonPrimitive("revoke"))
            put("authorizationId", JsonPrimitive(authorizationId))
        }
        return invoke(payload, authorizationId)
    }

    /**
     * One call site for `card-authorization`, so the error handling cannot drift between
     * create and revoke — the same reasoning the trip repository's `invokeTripMessage` note
     * records.
     */
    private suspend fun invoke(payload: JsonObject, id: String): AuthorizeOutcome {
        return try {
            client.functions.invoke("card-authorization", payload)
            AuthorizeOutcome.Done(id)
        } catch (cancellation: CancellationException) {
            throw cancellation
        } catch (rest: RestException) {
            // SUPABASE-KT VALIDATES THE RESPONSE, so a non-2xx never comes back as a value —
            // it is thrown. This used to read `response.status.value` after the call and
            // parse the body on 4xx, which meant the branch never ran: every rejection, down
            // to the conflict sentence this function goes out of its way to write, reached
            // the traveler as the generic "try again in a moment". Caught on the emulator by
            // authorizing a card that was already authorized for the trip.
            AuthorizeOutcome.Failed(problemDetail(rest))
        } catch (throwable: Throwable) {
            AuthorizeOutcome.Failed(null)
        }
    }

    /**
     * The problem+json `detail` off a rejected call.
     *
     * 4xx ONLY. Those details are sentences we wrote for a traveler to read; a 5xx detail
     * carries whatever Postgres said and belongs in the function log.
     *
     * READ FROM `error`, NOT `description` OR `message`. supabase-kt's
     * `Functions.parseErrorResponse` builds the exception as `BadRequestRestException(body,
     * response)` — the RAW BODY goes into `error`, `description` is left null, and `message`
     * is `error` plus appended `URL:` / `Headers:` / `Http Method:` lines. Parsing `message`
     * therefore hands kotlinx.serialization an object with trailing text, which it rejects,
     * so the detail silently came back null. That is the second half of this bug and it
     * looked exactly like the first.
     */
    private fun problemDetail(rest: RestException): String? {
        if (rest.statusCode !in 400..499) return null
        return runCatching { json.decodeFromString<ProblemDetail>(rest.error).detail }.getOrNull()
    }
}

@Serializable
private data class ProblemDetail(val detail: String? = null)

@Serializable
private data class WalletResponse(
    val cards: List<CardDto> = emptyList(),
    val authorizations: List<AuthorizationDto> = emptyList(),
    val events: List<EventDto> = emptyList(),
)

/**
 * The function's response shape, camelCase because it is a hand-written projection rather
 * than a PostgREST row. NEITHER STRIPE COLUMN HAS A FIELD HERE — not because they are dropped
 * on this side, but because the function never selects them.
 */
@Serializable
private data class CardDto(
    val id: String,
    val brand: String,
    val last4: String,
    val expMonth: Int,
    val expYear: Int,
    val nickname: String? = null,
    val status: String,
    val consentRecordedAt: String,
    val revokedAt: String? = null,
)

@Serializable
private data class AuthorizationDto(
    val id: String,
    val cardId: String,
    val tripId: String,
    val tripTitle: String? = null,
    // bigint cents. Long, not Int: a limit above $21m would overflow, and while no card holds
    // that, the column is bigint and the type should say what the column says.
    val spendingLimitCents: Long,
    val amountUsedCents: Long,
    val expiresAt: String,
    val status: String,
)

@Serializable
private data class EventDto(
    val id: String,
    val cardId: String,
    val tripId: String,
    val tripTitle: String? = null,
    val supplierName: String,
    val amountCents: Long,
    val currency: String,
    val referenceNumber: String? = null,
    val createdAt: String,
)
