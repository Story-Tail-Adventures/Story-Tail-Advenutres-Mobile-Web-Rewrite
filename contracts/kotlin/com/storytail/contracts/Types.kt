// GENERATED FILE — DO NOT EDIT.
//
// Source: contracts/openapi.yaml
// Regenerate: npm run generate -w contracts
//
// Hand-editing this file is the one thing that breaks the contract, because the CI job
// "Contracts codegen is current" regenerates it and diffs — an edit here shows up as a
// failing build on somebody else's PR. Change openapi.yaml instead.

package com.storytail.contracts

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement

@Serializable
enum class HotelSearchResponseDegraded {
    @SerialName("budget_exhausted")
    BUDGET_EXHAUSTED,
    @SerialName("provider_unavailable")
    PROVIDER_UNAVAILABLE,
}

@Serializable
enum class HotelSearchResponseSource {
    @SerialName("live")
    LIVE,
    @SerialName("cache")
    CACHE,
    @SerialName("stale")
    STALE,
}

@Serializable
enum class HotelRateBasis {
    @SerialName("night")
    NIGHT,
}

@Serializable
enum class OnboardingCompanionRequestAction {
    @SerialName("add")
    ADD,
    @SerialName("edit")
    EDIT,
    @SerialName("remove")
    REMOVE,
    @SerialName("none")
    NONE,
}

@Serializable
enum class OnboardingPreferencesRequestBudgetBand {
    @SerialName("budget")
    BUDGET,
    @SerialName("mid")
    MID,
    @SerialName("premium")
    PREMIUM,
    @SerialName("luxury")
    LUXURY,
}

@Serializable
enum class OnboardingPreferencesRequestAccessibility {
    @SerialName("none")
    NONE,
    @SerialName("mobility")
    MOBILITY,
    @SerialName("quiet_room")
    QUIET_ROOM,
    @SerialName("service_animal")
    SERVICE_ANIMAL,
}

@Serializable
enum class OnboardingPreferencesRequestDietary {
    @SerialName("none")
    NONE,
    @SerialName("vegetarian")
    VEGETARIAN,
    @SerialName("pescatarian")
    PESCATARIAN,
    @SerialName("gluten_free")
    GLUTEN_FREE,
    @SerialName("halal")
    HALAL,
}

@Serializable
enum class OnboardingPreferencesRequestTravelStyles {
    @SerialName("resort")
    RESORT,
    @SerialName("cruise")
    CRUISE,
    @SerialName("adventure")
    ADVENTURE,
    @SerialName("family")
    FAMILY,
    @SerialName("romantic")
    ROMANTIC,
    @SerialName("group")
    GROUP,
}

@Serializable
enum class OnboardingStepResponseStep {
    @SerialName("profile")
    PROFILE,
    @SerialName("preferences")
    PREFERENCES,
    @SerialName("companions")
    COMPANIONS,
    @SerialName("connect")
    CONNECT,
    @SerialName("complete")
    COMPLETE,
}

@Serializable
enum class OnboardingStepRequestStep {
    @SerialName("profile")
    PROFILE,
    @SerialName("preferences")
    PREFERENCES,
    @SerialName("companions")
    COMPANIONS,
    @SerialName("connect")
    CONNECT,
    @SerialName("complete")
    COMPLETE,
}

@Serializable
enum class AgentTripStatusResponsePreviousStatus {
    @SerialName("inquiry")
    INQUIRY,
    @SerialName("proposal")
    PROPOSAL,
    @SerialName("booked")
    BOOKED,
    @SerialName("in_progress")
    IN_PROGRESS,
    @SerialName("completed")
    COMPLETED,
    @SerialName("cancelled")
    CANCELLED,
}

@Serializable
enum class AgentTripStatusResponseStatus {
    @SerialName("inquiry")
    INQUIRY,
    @SerialName("proposal")
    PROPOSAL,
    @SerialName("booked")
    BOOKED,
    @SerialName("in_progress")
    IN_PROGRESS,
    @SerialName("completed")
    COMPLETED,
    @SerialName("cancelled")
    CANCELLED,
}

@Serializable
enum class AgentTripStatusRequestStatus {
    @SerialName("inquiry")
    INQUIRY,
    @SerialName("proposal")
    PROPOSAL,
    @SerialName("booked")
    BOOKED,
    @SerialName("in_progress")
    IN_PROGRESS,
    @SerialName("completed")
    COMPLETED,
    @SerialName("cancelled")
    CANCELLED,
}

@Serializable
enum class CardAuthorizationResponseStatus {
    @SerialName("active")
    ACTIVE,
    @SerialName("revoked")
    REVOKED,
    @SerialName("expired")
    EXPIRED,
}

@Serializable
enum class CardAuthorizationRequestAction {
    @SerialName("create")
    CREATE,
    @SerialName("revoke")
    REVOKE,
}

@Serializable
enum class WalletAuthorizationStatus {
    @SerialName("active")
    ACTIVE,
    @SerialName("revoked")
    REVOKED,
    @SerialName("expired")
    EXPIRED,
}

@Serializable
enum class WalletCardStatus {
    @SerialName("active")
    ACTIVE,
    @SerialName("revoked")
    REVOKED,
    @SerialName("expired")
    EXPIRED,
}

@Serializable
enum class SaveTestimonialResponseStatus {
    @SerialName("draft")
    DRAFT,
    @SerialName("submitted")
    SUBMITTED,
}

@Serializable
enum class RequestTripDocumentUploadRequestKind {
    @SerialName("passport")
    PASSPORT,
    @SerialName("visa")
    VISA,
    @SerialName("insurance_cert")
    INSURANCE_CERT,
    @SerialName("photo")
    PHOTO,
}

/** An amount in minor units plus its currency. */
@Serializable
data class Money(
    // Integer minor units (cents), as a string to preserve precision.
    @SerialName("amount")
    val amount: String,
    // ISO-4217 alphabetic code.
    @SerialName("currency")
    val currency: String,
)

@Serializable
data class SendTripMessageRequest(
    // Client-generated UUID v7. The server validates that the embedded timestamp is
    // recent (Data-Model §21.6) — `assertRecentUuidV7` in `_shared/uuid.ts`. Supplying
    // the id client-side is what makes a retry idempotent.
    @SerialName("messageId")
    val messageId: String,
    // The trip whose thread this belongs to. Mutually exclusive with `conversationId`;
    // omit both to post into the traveler's general (trip-less) thread.
    @SerialName("tripId")
    val tripId: String? = null,
    // An existing thread, addressed directly. Screen 2.6.2 uses this because a general
    // thread has `trip_id IS NULL` and so has no trip to key on. Mutually exclusive
    // with `tripId`.
    @SerialName("conversationId")
    val conversationId: String? = null,
    @SerialName("body")
    val body: String,
    // Documents already registered via POST /trip-document.
    @SerialName("attachmentDocumentIds")
    val attachmentDocumentIds: List<String>? = null,
)

@Serializable
data class SendTripMessageResponse(
    @SerialName("messageId")
    val messageId: String,
    @SerialName("conversationId")
    val conversationId: String,
    @SerialName("createdAt")
    val createdAt: String,
)

@Serializable
data class RequestTripDocumentUploadRequest(
    // Client-generated UUID v7, validated as recent.
    @SerialName("documentId")
    val documentId: String,
    @SerialName("tripId")
    val tripId: String,
    @SerialName("filename")
    val filename: String,
    // Must be one of the bucket's allowed types.
    @SerialName("mimeType")
    val mimeType: String,
    // Integer byte count as a string, for the same precision reason as Money.
    @SerialName("sizeBytes")
    val sizeBytes: String,
    // The document kinds a client may contribute.
    @SerialName("kind")
    val kind: RequestTripDocumentUploadRequestKind,
)

@Serializable
data class RequestTripDocumentUploadResponse(
    @SerialName("documentId")
    val documentId: String,
    // Signed PUT target, as a path to join to the caller's own Supabase base URL — not an absolute URL. Storage signs against the origin the function sees from inside its container (`http://kong:8000` locally), which resolves nowhere in a browser or on a phone. The caller already holds the right origin, so it does the joining. The storage key itself is still never returned; the path carries the signature, not a readable key.
    @SerialName("uploadPath")
    val uploadPath: String,
    @SerialName("expiresAt")
    val expiresAt: String,
)

@Serializable
data class TripDocumentUrlResponse(
    @SerialName("documentId")
    val documentId: String,
    // Signed read target, as a path to join to the caller's own Supabase base URL. See RequestTripDocumentUploadResponse.uploadPath for why this is not absolute.
    @SerialName("path")
    val path: String,
    @SerialName("expiresAt")
    val expiresAt: String,
    @SerialName("filename")
    val filename: String,
    @SerialName("mimeType")
    val mimeType: String,
)

@Serializable
data class SaveTestimonialRequest(
    // Client-generated UUID v7, validated as recent.
    @SerialName("testimonialId")
    val testimonialId: String,
    // Omitted for a reflection not tied to one trip.
    @SerialName("tripId")
    val tripId: String? = null,
    @SerialName("body")
    val body: String,
    // How the client wants to be credited.
    @SerialName("attribution")
    val attribution: String? = null,
    // Optional. The prompt is a question, not a star widget.
    @SerialName("rating")
    val rating: Int? = null,
    // False saves a draft; true moves it to `submitted`. A client can reach no other
    // state — approval is an agent action.
    @SerialName("submit")
    val submit: Boolean? = null,
)

@Serializable
data class SaveTestimonialResponse(
    @SerialName("testimonialId")
    val testimonialId: String,
    @SerialName("status")
    val status: SaveTestimonialResponseStatus,
    @SerialName("submittedAt")
    val submittedAt: String? = null,
)

/** A card on file. NEITHER STRIPE COLUMN APPEARS HERE and neither ever */
/** should — see CLAUDE.md rule 4. Brand and last 4 are the non-sensitive */
/** metadata the traveler needs to recognize their own card. */
@Serializable
data class WalletCard(
    @SerialName("id")
    val id: String,
    // Stripe's brand slug, e.g. `visa`, `mastercard`, `amex`.
    @SerialName("brand")
    val brand: String,
    @SerialName("last4")
    val last4: String,
    @SerialName("expMonth")
    val expMonth: Int,
    @SerialName("expYear")
    val expYear: Int,
    // The traveler's own label, e.g. "Personal Visa".
    @SerialName("nickname")
    val nickname: String? = null,
    @SerialName("status")
    val status: WalletCardStatus,
    @SerialName("consentRecordedAt")
    val consentRecordedAt: String? = null,
    @SerialName("revokedAt")
    val revokedAt: String? = null,
    @SerialName("revokedReason")
    val revokedReason: String? = null,
)

/** One card bound to one trip, with a ceiling and an expiry. */
@Serializable
data class WalletAuthorization(
    @SerialName("id")
    val id: String,
    @SerialName("cardId")
    val cardId: String,
    @SerialName("tripId")
    val tripId: String,
    // Resolved server-side so neither client has to join. Null when the trip is no
    // longer readable — an authorization outliving its trip is a state the traveler
    // should still see rather than a row that renders blank.
    @SerialName("tripTitle")
    val tripTitle: String? = null,
    // The ceiling the traveler set. Capped at $250,000 by the function.
    @SerialName("spendingLimitCents")
    val spendingLimitCents: Int,
    // Denormalized on `card_authorization`. Both clients derive "remaining" from this
    // and clamp it at zero — a supplier overcharging past the ceiling is a real state,
    // and a negative remaining is not a number to show anybody.
    @SerialName("amountUsedCents")
    val amountUsedCents: Int,
    @SerialName("expiresAt")
    val expiresAt: String,
    @SerialName("status")
    val status: WalletAuthorizationStatus,
    @SerialName("revokedAt")
    val revokedAt: String? = null,
    @SerialName("createdAt")
    val createdAt: String,
)

/** One time a card on file was used to pay a supplier. Currently fixture-fed: the */
/** producing surface is the agent's reveal-and-record flow in §3.6, which is unbuilt. */
@Serializable
data class WalletUseEvent(
    @SerialName("id")
    val id: String,
    @SerialName("authorizationId")
    val authorizationId: String? = null,
    @SerialName("cardId")
    val cardId: String,
    @SerialName("tripId")
    val tripId: String? = null,
    @SerialName("tripTitle")
    val tripTitle: String? = null,
    // `supplier_name_snapshot`, never a join. Null is possible and is not an error: a
    // portal booking names a merchant with no `supplier` row behind it.
    @SerialName("supplierName")
    val supplierName: String? = null,
    @SerialName("amountCents")
    val amountCents: Int,
    @SerialName("currency")
    val currency: String,
    @SerialName("referenceNumber")
    val referenceNumber: String? = null,
    @SerialName("createdAt")
    val createdAt: String,
)

@Serializable
data class WalletResponse(
    @SerialName("cards")
    val cards: List<WalletCard>,
    @SerialName("authorizations")
    val authorizations: List<WalletAuthorization>,
    @SerialName("events")
    val events: List<WalletUseEvent>,
)

@Serializable
data class CardAuthorizationRequest(
    @SerialName("action")
    val action: CardAuthorizationRequestAction,
    // Client-generated UUID v7 on `create`; the server validates the embedded
    // timestamp is recent (Data-Model §21.6). Supplying it client-side is what makes a
    // retry idempotent against the primary key rather than a second authorization. On
    // `revoke` it names the existing row.
    @SerialName("authorizationId")
    val authorizationId: String? = null,
    // `create` only. Must be an active card belonging to the caller.
    @SerialName("cardId")
    val cardId: String? = null,
    // `create` only. `card_authorization.trip_id` is NOT NULL.
    @SerialName("tripId")
    val tripId: String? = null,
    // `create` only. Zero and negatives are refused: an authorization that permits
    // nothing is a record with no meaning, not a cautious default.
    @SerialName("spendingLimitCents")
    val spendingLimitCents: Int? = null,
    // `create` only. Both clients default to trip end + 7 days so a late supplier
    // charge still goes through. The function caps it at ten years out.
    @SerialName("expiresAt")
    val expiresAt: String? = null,
    // `create` only, and required to be true. Re-checked server-side even though both
    // clients gate the submit button on it — the stored `consent_payload` is a
    // compliance record, and one written for somebody who never ticked the box is
    // worse than no record at all. The TEXT is the server's, never the request's.
    @SerialName("consent")
    val consent: Boolean? = null,
)

@Serializable
data class CardAuthorizationResponse(
    @SerialName("authorizationId")
    val authorizationId: String,
    @SerialName("status")
    val status: CardAuthorizationResponseStatus,
    // `create` only. False means the id already existed — a retry.
    @SerialName("created")
    val created: Boolean? = null,
    // `revoke` only. False means it was already revoked or expired.
    @SerialName("changed")
    val changed: Boolean? = null,
)

@Serializable
data class AgentTripStatusRequest(
    @SerialName("tripId")
    val tripId: String,
    @SerialName("status")
    val status: AgentTripStatusRequestStatus,
    // `trip.version` as the board was rendered from. A mismatch is a 409. Required: the board always has it, and omitting it would make every drop last-write-wins.
    @SerialName("expectedVersion")
    val expectedVersion: Int,
    // Required when `status` is `cancelled`, ignored otherwise. Reaches `trip.cancellation_reason`, which Screen 2.2.10 shows the traveler.
    @SerialName("cancellationReason")
    val cancellationReason: String? = null,
)

@Serializable
data class AgentTripStatusResponse(
    @SerialName("tripId")
    val tripId: String,
    @SerialName("status")
    val status: AgentTripStatusResponseStatus,
    // Absent whenever the stage did not move — a no-op, or a cancellation-reason correction — because nothing was left behind.
    @SerialName("previousStatus")
    val previousStatus: AgentTripStatusResponsePreviousStatus? = null,
    // The version after the write. Send this as the next `expectedVersion`.
    @SerialName("version")
    val version: Int,
    // False when the trip was already in this stage: no transition, so no `trip_status_history` row. It does NOT mean nothing was recorded — a corrected cancellation reason writes the column and an `audit_event` under `trip.cancellation_reason_changed`, and still reports false.
    @SerialName("changed")
    val changed: Boolean,
    // Present on every `cancelled` call and only those, because the reason is mandatory on all of them and the caller is owed an answer about where it went. True when this call wrote it to `trip.cancellation_reason` — either on a transition into `cancelled` or on a same-stage correction. False when the stored reason already read that way, so there was nothing to write. Either answer means the traveler now sees the sentence you sent, on Screen 2.2.10.
    @SerialName("cancellationReasonUpdated")
    val cancellationReasonUpdated: Boolean? = null,
)

@Serializable
data class OnboardingStepRequest(
    // The step to move the cursor to. Reaching `complete` is not the same as finishing — that is what `complete: true` is for.
    @SerialName("step")
    val step: OnboardingStepRequestStep? = null,
    // Marks onboarding finished by setting `onboarding_completed_at`. Mutually exclusive with `step` in practice: this is checked first.
    @SerialName("complete")
    val complete: Boolean? = null,
)

@Serializable
data class OnboardingStepResponse(
    @SerialName("ok")
    val ok: Boolean,
    // Echoed back when the request moved the cursor.
    @SerialName("step")
    val step: OnboardingStepResponseStep? = null,
    // True when the request finished onboarding.
    @SerialName("completed")
    val completed: Boolean? = null,
)

@Serializable
data class OnboardingOkResponse(
    @SerialName("ok")
    val ok: Boolean,
)

@Serializable
data class OnboardingIdResponse(
    @SerialName("ok")
    val ok: Boolean,
    // The row written. Null when the call wrote nothing — a companions request with `action: none`.
    @SerialName("id")
    val id: String? = null,
)

/** All or nothing. A name with no number looks like a safety net and is not one, so a half-filled contact is a 400 rather than a partial row. Null clears it. Stored as jsonb on `client.emergency_contact`; see Data-Model §6.1. */
@Serializable
data class OnboardingEmergencyContact(
    @SerialName("name")
    val name: String? = null,
    // Normalised to E.164, as everywhere else in the schema.
    @SerialName("phone")
    val phone: String? = null,
    @SerialName("relationship")
    val relationship: String? = null,
)

/** Six structured fields, not one line — `client.mailing_address_id` is a FK to `address` and there is no free-text address column anywhere. `line1`, `city` and `country` are required TOGETHER or the whole object must be absent or null; two of the three is a 400. */
@Serializable
data class OnboardingAddress(
    @SerialName("line1")
    val line1: String? = null,
    @SerialName("line2")
    val line2: String? = null,
    @SerialName("city")
    val city: String? = null,
    @SerialName("region")
    val region: String? = null,
    @SerialName("postalCode")
    val postalCode: String? = null,
    // ISO-3166-1 alpha-2, matching `address.country`'s char(2).
    @SerialName("country")
    val country: String? = null,
)

/** Expiry and issuing country only. See the endpoint description: sending `number` is a 400, not an ignored field. */
@Serializable
data class OnboardingPassport(
    // What drives the renewal reminder, and the reason this object exists.
    @SerialName("expiresOn")
    val expiresOn: String? = null,
    @SerialName("issuingCountry")
    val issuingCountry: String? = null,
)

@Serializable
data class OnboardingProfileRequest(
    @SerialName("phone")
    val phone: String? = null,
    @SerialName("dateOfBirth")
    val dateOfBirth: String? = null,
    @SerialName("emergencyContact")
    val emergencyContact: OnboardingEmergencyContact? = null,
    @SerialName("address")
    val address: OnboardingAddress? = null,
    @SerialName("passport")
    val passport: OnboardingPassport? = null,
    @SerialName("advance")
    val advance: Boolean? = null,
)

/** A wholly empty entry is skipped — it is the repeater's last blank line, not a mistake. A number without a program is a 400. */
@Serializable
data class OnboardingLoyaltyProgram(
    @SerialName("program")
    val program: String,
    // Alphanumeric and hyphens. Anything else is a paste accident, and this is a number somebody will read back to an airline.
    @SerialName("number")
    val number: String? = null,
)

/** Every list is validated against the vocabulary in Data-Model §6.2. Null clears a list; absent leaves it. */
@Serializable
data class OnboardingPreferencesRequest(
    // Free text — the wish list is the traveler's, not a menu.
    @SerialName("destinations")
    val destinations: List<String>? = null,
    @SerialName("travelStyles")
    val travelStyles: List<OnboardingPreferencesRequestTravelStyles>? = null,
    // `none` is exclusive — with anything else it is a 400.
    @SerialName("dietary")
    val dietary: List<OnboardingPreferencesRequestDietary>? = null,
    @SerialName("dietaryNotes")
    val dietaryNotes: String? = null,
    // `none` is exclusive, as with dietary.
    @SerialName("accessibility")
    val accessibility: List<OnboardingPreferencesRequestAccessibility>? = null,
    @SerialName("accessibilityNotes")
    val accessibilityNotes: String? = null,
    @SerialName("favoritePastTrips")
    val favoritePastTrips: String? = null,
    // Four bands, not a figure. See the endpoint description for why the prototype's dual-thumb slider did not survive.
    @SerialName("budgetBand")
    val budgetBand: OnboardingPreferencesRequestBudgetBand? = null,
    @SerialName("loyalty")
    val loyalty: List<OnboardingLoyaltyProgram>? = null,
    @SerialName("advance")
    val advance: Boolean? = null,
)

@Serializable
data class OnboardingCompanionRequest(
    // `none` writes nothing and exists so "Save & continue" on an already complete list can advance the cursor without inventing a row.
    @SerialName("action")
    val action: OnboardingCompanionRequestAction? = null,
    // Required for `edit` and `remove`.
    @SerialName("id")
    val id: String? = null,
    // Required together with lastName for `add` and `edit`.
    @SerialName("firstName")
    val firstName: String? = null,
    @SerialName("lastName")
    val lastName: String? = null,
    @SerialName("relationship")
    val relationship: String? = null,
    @SerialName("dateOfBirth")
    val dateOfBirth: String? = null,
    @SerialName("passportExpiry")
    val passportExpiry: String? = null,
    @SerialName("advance")
    val advance: Boolean? = null,
)

@Serializable
data class OnboardingConnectRequest(
    // The agent's invite code. Omitted or null is "I don't have a code" — a first-class exit, not an error.
    @SerialName("code")
    val code: String? = null,
    @SerialName("advance")
    val advance: Boolean? = null,
)

@Serializable
data class OnboardingConnectResponse(
    @SerialName("ok")
    val ok: Boolean,
    // False when the traveler declined to enter a code.
    @SerialName("redeemed")
    val redeemed: Boolean,
)

/** RFC 7807 problem details. Every error response uses this shape. */
@Serializable
data class Problem(
    @SerialName("type")
    val type: String,
    @SerialName("title")
    val title: String,
    @SerialName("status")
    val status: Int,
    @SerialName("detail")
    val detail: String? = null,
    @SerialName("instance")
    val instance: String? = null,
)

@Serializable
data class HotelSearchRequest(
    // Free text, as typed. Normalised server-side before it becomes a cache key.
    @SerialName("destination")
    val destination: String,
    @SerialName("checkIn")
    val checkIn: String,
    // Must be after checkIn, and at most 30 nights later.
    @SerialName("checkOut")
    val checkOut: String,
    @SerialName("adults")
    val adults: Int? = null,
    @SerialName("childrenAges")
    val childrenAges: List<Int>? = null,
    // Google star classification, 2-5. Not the guest rating.
    @SerialName("hotelClass")
    val hotelClass: List<String>? = null,
    // Google amenity ids. Unknown values are dropped, never forwarded.
    @SerialName("amenities")
    val amenities: List<String>? = null,
    @SerialName("minPrice")
    val minPrice: Int? = null,
    @SerialName("maxPrice")
    val maxPrice: Int? = null,
    // SerpApi sort id — "3" lowest price, "8" highest rating, "13" most reviewed. Empty means the provider's own relevance.
    @SerialName("sortBy")
    val sortBy: String? = null,
)

/** ONE indicative nightly rate, deliberately not a list. The provider returns one entry */
/** per booking site, each carrying a source, a logo and a link; a list here — even with */
/** those fields omitted — would invite someone to add the source back "for attribution". */
/** A single scalar cannot. */
@Serializable
data class HotelRate(
    // Integer minor units as a string (CLAUDE.md rule 5).
    @SerialName("amountCents")
    val amountCents: String,
    @SerialName("currency")
    val currency: String,
    // The only basis published. A total-for-the-stay reads like a quote.
    @SerialName("basis")
    val basis: HotelRateBasis,
    @SerialName("beforeTaxesFees")
    val beforeTaxesFees: Boolean,
)

@Serializable
data class HotelImage(
    // Host allow-listed at the mapper and again in web/.
    @SerialName("url")
    val url: String,
)

@Serializable
data class HotelLocation(
    @SerialName("latitude")
    val latitude: Double,
    @SerialName("longitude")
    val longitude: Double,
)

@Serializable
data class HotelResult(
    @SerialName("id")
    val id: String,
    // Opaque provider id, carried so the later inquiry step can name the hotel. Not a URL.
    @SerialName("propertyToken")
    val propertyToken: String? = null,
    @SerialName("name")
    val name: String,
    @SerialName("description")
    val description: String? = null,
    @SerialName("propertyType")
    val propertyType: String? = null,
    @SerialName("hotelClass")
    val hotelClass: Int? = null,
    @SerialName("overallRating")
    val overallRating: Double? = null,
    @SerialName("reviewCount")
    val reviewCount: Int? = null,
    @SerialName("location")
    val location: HotelLocation? = null,
    @SerialName("checkInTime")
    val checkInTime: String? = null,
    @SerialName("checkOutTime")
    val checkOutTime: String? = null,
    @SerialName("amenities")
    val amenities: List<String>,
    @SerialName("images")
    val images: List<HotelImage>,
    @SerialName("ecoCertified")
    val ecoCertified: Boolean,
    @SerialName("rate")
    val rate: HotelRate? = null,
)

@Serializable
data class HotelSearchEcho(
    @SerialName("destination")
    val destination: String,
    @SerialName("checkIn")
    val checkIn: String,
    @SerialName("checkOut")
    val checkOut: String,
    @SerialName("adults")
    val adults: Int,
    @SerialName("nights")
    val nights: Int,
)

@Serializable
data class HotelSearchResponse(
    // Payload shape version. Part of the cache key, so a change means a cold cache.
    @SerialName("version")
    val version: Int,
    @SerialName("currency")
    val currency: String,
    @SerialName("totalAvailable")
    val totalAvailable: Int? = null,
    @SerialName("results")
    val results: List<HotelResult>,
    // Always false. Each extra page is another billable search.
    @SerialName("hasMore")
    val hasMore: Boolean,
    @SerialName("source")
    val source: HotelSearchResponseSource,
    @SerialName("degraded")
    val degraded: HotelSearchResponseDegraded? = null,
    @SerialName("asOf")
    val asOf: String,
    // Set only when source is "stale". The page must show how old the prices are.
    @SerialName("staleAsOf")
    val staleAsOf: String? = null,
    @SerialName("query")
    val query: HotelSearchEcho,
)
