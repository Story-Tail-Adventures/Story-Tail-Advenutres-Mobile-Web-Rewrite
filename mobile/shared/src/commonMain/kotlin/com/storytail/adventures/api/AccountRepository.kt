package com.storytail.adventures.api

import com.storytail.adventures.domain.validation.LoyaltyRow
import com.storytail.adventures.domain.validation.readLoyalty
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.query.Columns
import io.github.jan.supabase.postgrest.query.Order
import io.github.jan.supabase.postgrest.query.filter.FilterOperator
import kotlinx.coroutines.CancellationException
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement

/**
 * The §2.5 reads.
 *
 * PARALLEL IMPLEMENTATION of the loaders scattered across `web/app/(client)/account/` and
 * `web/lib/account/documents.ts`, under the same two rules as [TripRepository]:
 *
 *  * EVERY SELECT NAMES ITS COLUMNS, because the column grant is what withholds
 *    `document.storage_key`, `travel_document.document_number_encrypted` and the rest — a
 *    `select("*")` raises 42501 rather than quietly returning less.
 *  * Reads go through the CALLER'S OWN SESSION and the `*_self_select` policies, never the
 *    service role.
 *
 * NOTHING HERE WRITES. Every §2.5 mutation that exists at all goes through
 * [OnboardingRepository.call] — `onboarding-profile` and `onboarding-preferences`, minus the
 * `advance` flag so the wizard cursor does not move. The other seven screens' actions have no
 * door yet and render disabled with a reason; see each screen for which and why.
 *
 * FAILURE IS NOT EMPTINESS, and which way a given read fails is a decision per screen rather
 * than a convention:
 *
 *  * [documents] returns null on failure, because an empty list would tell a traveler they
 *    have no passport on file.
 *  * [overview] and [profile] and [preferences] fall back to blanks with the failure
 *    reported alongside, because an account screen that cannot show what is on file should
 *    still let you set it — and 2.5.1 must still offer its eight destinations.
 *  * [authProvider] distinguishes "failed" from "none", because defaulting a failed read to
 *    an OAuth account tells an email-and-password user they have no password, which is a
 *    false statement about their own account on the screen they came to check it.
 */
interface AccountRepository {

    /** Screen 2.5.1's header and its document count. */
    suspend fun overview(): AccountOverview

    /** Screen 2.5.4's list, or null when the read failed. */
    suspend fun documents(): List<TripDocumentView>?

    /** Screen 2.5.2's identity block and form prefill. */
    suspend fun profile(): AccountProfile

    /** Screen 2.5.3's form prefill. */
    suspend fun preferences(): AccountPreferences

    /** Screens 2.5.7 and 2.5.8. */
    suspend fun authProvider(): AuthProviderState

    /** Screen 2.5.10's confirmation placeholder — the address you sign in with. */
    suspend fun accountEmail(): String?
}

/**
 * Screen 2.5.1's header.
 *
 * [documentCount] is NULL when the count read failed, which is not the same as zero: "0
 * files" is a statement about somebody's documents and a wrong one. The row falls back to
 * the neutral subtitle instead. Same split the web hub makes.
 */
data class AccountOverview(
    val firstName: String? = null,
    val lastName: String? = null,
    val preferredName: String? = null,
    val email: String? = null,
    val createdAt: String? = null,
    val documentCount: Int? = null,
)

/**
 * Screen 2.5.2.
 *
 * [name] and [email] are READ-ONLY and are not part of the form: no Edge Function writes
 * `client.first_name` / `last_name` / `preferred_name`, and changing the sign-in address is
 * GoTrue's with an `auth_bridge` trigger that does not exist yet. See the web page header.
 *
 * THE PASSPORT FIELDS ARE NOT OPTIONAL to read. The form posts every field,
 * `onboarding-profile` treats an empty expiry AND country as `passport: null`, and null
 * ARCHIVES the existing `travel_document` row. A screen that rendered them blank would
 * destroy a traveler's passport record on a save that only changed their phone number.
 */
data class AccountProfile(
    val name: String = "",
    val email: String = "",
    val phone: String = "",
    val dateOfBirth: String = "",
    val addressLine1: String = "",
    val addressLine2: String = "",
    val addressCity: String = "",
    val addressRegion: String = "",
    val addressPostalCode: String = "",
    val addressCountry: String = "",
    val emergencyName: String = "",
    val emergencyPhone: String = "",
    val emergencyRelationship: String = "",
    val passportExpiry: String = "",
    val passportCountry: String = "",
)

/** Screen 2.5.3, in the same shape 2.1.11's form holds. */
data class AccountPreferences(
    val destinations: List<String> = emptyList(),
    val travelStyles: List<String> = emptyList(),
    val dietary: List<String> = emptyList(),
    val dietaryNotes: String = "",
    val accessibility: List<String> = emptyList(),
    val accessibilityNotes: String = "",
    val loyalty: List<LoyaltyRow> = emptyList(),
    val budgetBand: String = "",
    val favouritePastTrips: String = "",
)

/**
 * What `account.auth_provider` says, with "we could not read it" as a value of its own.
 *
 * [Unknown] is why this is not a nullable String: two screens key a paragraph off this, and
 * both paragraphs make a claim about how somebody signs in. Neither may be shown on a guess.
 */
sealed interface AuthProviderState {
    data object Unknown : AuthProviderState
    data class Known(val provider: String) : AuthProviderState
}

/** Before local.properties carries a URL and a key there is nothing to read. */
class UnconfiguredAccountRepository : AccountRepository {
    override suspend fun overview() = AccountOverview()
    override suspend fun documents(): List<TripDocumentView>? = null
    override suspend fun profile() = AccountProfile()
    override suspend fun preferences() = AccountPreferences()
    override suspend fun authProvider(): AuthProviderState = AuthProviderState.Unknown
    override suspend fun accountEmail(): String? = null
}

class SupabaseAccountRepository(
    private val client: SupabaseClient,
) : AccountRepository {

    override suspend fun overview(): AccountOverview {
        val row = read {
            client.postgrest.from("client")
                .select(
                    Columns.list("first_name", "last_name", "preferred_name", "email", "created_at"),
                )
                .decodeList<OverviewRow>()
                .firstOrNull()
        }

        // `document_self_select` scopes this to the caller, so no filter is needed — and
        // none of the withheld columns (storage_bucket / storage_key / checksum_sha256) is
        // named. `id` alone is enough to count.
        val documents = read {
            client.postgrest.from("document")
                .select(Columns.list("id")) {
                    filter { filter("archived_at", FilterOperator.IS, "null") }
                }
                .decodeList<IdRow>()
        }

        return AccountOverview(
            firstName = row?.first_name,
            lastName = row?.last_name,
            preferredName = row?.preferred_name,
            email = row?.email,
            createdAt = row?.created_at,
            documentCount = documents?.size,
        )
    }

    override suspend fun documents(): List<TripDocumentView>? {
        val rows = read {
            client.postgrest.from("document")
                .select(
                    Columns.list(
                        "id", "owner_user_id", "kind", "filename",
                        "mime_type", "size_bytes", "created_at",
                    ),
                ) {
                    // NO TRIP FILTER — that is the whole difference from §2.2.6's read.
                    // `document_self_select` matches on `client_id` OR one of the caller's
                    // trips, so a per-trip upload appears here too: `trip-document` stamps
                    // `client_id` alongside `trip_id`.
                    filter { filter("archived_at", FilterOperator.IS, "null") }
                    order("created_at", Order.DESCENDING)
                }
                .decodeList<AccountDocumentRow>()
        } ?: return null

        val myUserId = read {
            client.postgrest.from("platform_user")
                .select(Columns.list("id"))
                .decodeList<IdRow>()
                .firstOrNull()
                ?.id
        }

        return rows.map { row ->
            TripDocumentView(
                id = row.id,
                kind = row.kind,
                filename = row.filename,
                mimeType = row.mime_type,
                sizeBytes = row.size_bytes ?: 0L,
                createdAt = row.created_at,
                mine = myUserId != null && row.owner_user_id == myUserId,
            )
        }
    }

    override suspend fun profile(): AccountProfile {
        val row = read {
            client.postgrest.from("client")
                .select(
                    Columns.list(
                        "first_name", "last_name", "preferred_name", "email", "phone",
                        "date_of_birth", "emergency_contact", "mailing_address_id",
                    ),
                )
                .decodeList<ProfileRow>()
                .firstOrNull()
        } ?: return AccountProfile()

        val address = row.mailing_address_id?.let { addressId ->
            read {
                client.postgrest.from("address")
                    .select(Columns.list("line1", "line2", "city", "region", "postal_code", "country")) {
                        filter { eq("id", addressId) }
                        limit(1)
                    }
                    .decodeList<AddressRow>()
                    .firstOrNull()
            }
        }

        // THE PASSPORT READ. See [AccountProfile] — leaving it out is silent data loss, not
        // a missing convenience. The NUMBER is not selected and cannot be:
        // `document_number_encrypted` is outside the column grant, which is what stops even
        // the ciphertext being selectable.
        val passport = read {
            client.postgrest.from("travel_document")
                .select(Columns.list("expires_on", "issuing_country")) {
                    filter {
                        eq("kind", "passport")
                        filter("companion_id", FilterOperator.IS, "null")
                        filter("archived_at", FilterOperator.IS, "null")
                    }
                    limit(1)
                }
                .decodeList<PassportRow>()
                .firstOrNull()
        }

        val emergency = row.emergency_contact
        return AccountProfile(
            name = listOfNotNull(
                (row.preferred_name ?: row.first_name)?.takeIf { it.isNotBlank() },
                row.last_name?.takeIf { it.isNotBlank() },
            ).joinToString(" "),
            email = row.email.orEmpty(),
            phone = row.phone.orEmpty(),
            dateOfBirth = row.date_of_birth.orEmpty(),
            addressLine1 = address?.line1.orEmpty(),
            addressLine2 = address?.line2.orEmpty(),
            addressCity = address?.city.orEmpty(),
            addressRegion = address?.region.orEmpty(),
            addressPostalCode = address?.postal_code.orEmpty(),
            addressCountry = address?.country.orEmpty(),
            emergencyName = emergency?.name.orEmpty(),
            emergencyPhone = emergency?.phone.orEmpty(),
            emergencyRelationship = emergency?.relationship.orEmpty(),
            passportExpiry = passport?.expires_on.orEmpty(),
            passportCountry = passport?.issuing_country.orEmpty(),
        )
    }

    override suspend fun preferences(): AccountPreferences {
        val row = read {
            client.postgrest.from("travel_preference")
                .select(
                    Columns.list(
                        "preferred_destinations", "travel_styles", "dietary_restrictions",
                        "dietary_notes", "accessibility_needs", "accessibility_notes",
                        "loyalty_programs", "budget_band", "favorite_past_trips",
                    ),
                )
                .decodeList<PreferenceRow>()
                .firstOrNull()
        } ?: return AccountPreferences()

        return AccountPreferences(
            destinations = row.preferred_destinations.orEmpty(),
            travelStyles = row.travel_styles.orEmpty(),
            dietary = row.dietary_restrictions.orEmpty(),
            dietaryNotes = row.dietary_notes.orEmpty(),
            accessibility = row.accessibility_needs.orEmpty(),
            accessibilityNotes = row.accessibility_notes.orEmpty(),
            loyalty = readLoyalty(row.loyalty_programs),
            budgetBand = row.budget_band.orEmpty(),
            favouritePastTrips = row.favorite_past_trips.orEmpty(),
        )
    }

    override suspend fun authProvider(): AuthProviderState {
        val row = read {
            client.postgrest.from("account")
                .select(Columns.list("auth_provider"))
                .decodeList<ProviderRow>()
                .firstOrNull()
        } ?: return AuthProviderState.Unknown
        return AuthProviderState.Known(row.auth_provider)
    }

    override suspend fun accountEmail(): String? = read {
        client.postgrest.from("account")
            .select(Columns.list("email"))
            .decodeList<EmailRow>()
            .firstOrNull()
            ?.email
    }

    /**
     * Null on failure, and never a log of the row — it is somebody's address.
     *
     * The caller decides what null means; see the interface note, where it is a different
     * thing on each screen.
     */
    private suspend fun <T> read(block: suspend () -> T): T? =
        try {
            block()
        } catch (cancellation: CancellationException) {
            throw cancellation
        } catch (throwable: Throwable) {
            null
        }
}

@Serializable
private data class IdRow(val id: String)

@Serializable
private data class OverviewRow(
    val first_name: String? = null,
    val last_name: String? = null,
    val preferred_name: String? = null,
    val email: String? = null,
    val created_at: String? = null,
)

@Serializable
private data class AccountDocumentRow(
    val id: String,
    val owner_user_id: String? = null,
    val kind: String,
    val filename: String,
    val mime_type: String,
    /** `bigint`, serialised by PostgREST as a plain JSON number — see TripRepository. */
    val size_bytes: Long? = null,
    val created_at: String,
)

@Serializable
private data class ProfileRow(
    val first_name: String? = null,
    val last_name: String? = null,
    val preferred_name: String? = null,
    val email: String? = null,
    val phone: String? = null,
    val date_of_birth: String? = null,
    val emergency_contact: EmergencyContactRow? = null,
    val mailing_address_id: String? = null,
)

/** `client.emergency_contact` is `jsonb` with this shape — see the onboarding migration. */
@Serializable
private data class EmergencyContactRow(
    val name: String? = null,
    val phone: String? = null,
    val relationship: String? = null,
)

@Serializable
private data class AddressRow(
    val line1: String? = null,
    val line2: String? = null,
    val city: String? = null,
    val region: String? = null,
    val postal_code: String? = null,
    val country: String? = null,
)

@Serializable
private data class PassportRow(
    val expires_on: String? = null,
    val issuing_country: String? = null,
)

@Serializable
private data class PreferenceRow(
    val preferred_destinations: List<String>? = null,
    val travel_styles: List<String>? = null,
    val dietary_restrictions: List<String>? = null,
    val dietary_notes: String? = null,
    val accessibility_needs: List<String>? = null,
    val accessibility_notes: String? = null,
    /**
     * `jsonb`, decoded as raw JSON rather than into a row class.
     *
     * A blank member number persists as `{"program": "...", "number": null}`, and a strict
     * shape would either fail the whole decode or drop the row — and the form replaces this
     * column wholesale on save, so dropping a row deletes a program. [readLoyalty] is the
     * shared reader that gets this right on both stacks.
     */
    val loyalty_programs: JsonElement? = null,
    val budget_band: String? = null,
    val favorite_past_trips: String? = null,
)

@Serializable
private data class ProviderRow(val auth_provider: String)

@Serializable
private data class EmailRow(val email: String? = null)
