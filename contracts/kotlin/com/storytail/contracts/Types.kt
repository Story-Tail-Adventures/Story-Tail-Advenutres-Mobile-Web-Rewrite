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
    @SerialName("tripId")
    val tripId: String,
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
