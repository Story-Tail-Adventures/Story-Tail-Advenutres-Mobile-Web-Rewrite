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
