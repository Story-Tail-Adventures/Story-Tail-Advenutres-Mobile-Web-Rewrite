package com.storytail.adventures.domain.trip

/**
 * Document grouping and presentation for screen 2.2.6.
 *
 * KOTLIN TWIN of `web/lib/trips/documents.ts`, compared by
 * `.github/scripts/check_copy_parity.py`. Both sides derive the same six group headings from
 * ten `document_kind` values, and the mapping is not one-to-one in either direction:
 *
 *  * Passports and visas share ONE group in both artboards, because a traveler thinks of
 *    them as one drawer.
 *  * "Boarding passes", which Screen-Inventory §2.2.6 names, is not a kind at all — boarding
 *    passes arrive as `supplier_confirmation`, which is where the desktop artboard files
 *    `flight-aa1413-boarding.pdf`. Its own group would be a heading that is always empty.
 *  * Four kinds never reach a client: `receipt`, `csv_import`, `pdf_proposal` and `other`
 *    are outside `document_self_select`'s allowlist. They are absent here too, so a kind
 *    that slips into the read policy surfaces under the catch-all rather than silently
 *    joining a group it does not belong in.
 */

/**
 * The client-readable kinds, verbatim from `document_self_select` in
 * 20260907031255_trip_read_policies.sql. If this list and the policy ever disagree, the
 * narrower one wins — keeping them identical is the point.
 */
val READABLE_DOCUMENT_KINDS = listOf(
    "passport",
    "visa",
    "insurance_cert",
    "supplier_confirmation",
    "photo",
    "pdf_itinerary",
)

/** The kinds a client may contribute, matching CLIENT_DOCUMENT_KINDS in _shared/trip.ts. */
val UPLOADABLE_DOCUMENT_KINDS = listOf("passport", "visa", "insurance_cert", "photo")

enum class DocumentGroup {
    CONFIRMATIONS,
    IDENTITY,
    INSURANCE,
    ITINERARY,
    PHOTOS,
    OTHER,
    ;

    val label: String
        get() = when (this) {
            CONFIRMATIONS -> DocumentMessages.GROUP_CONFIRMATIONS
            IDENTITY -> DocumentMessages.GROUP_IDENTITY
            INSURANCE -> DocumentMessages.GROUP_INSURANCE
            ITINERARY -> DocumentMessages.GROUP_ITINERARY
            PHOTOS -> DocumentMessages.GROUP_PHOTOS
            OTHER -> DocumentMessages.GROUP_OTHER
        }
}

/** Flat and const, which is what `check_copy_parity.py` reads. */
object DocumentMessages {
    const val GROUP_CONFIRMATIONS = "Supplier confirmations"
    const val GROUP_IDENTITY = "Passports & visas"
    const val GROUP_INSURANCE = "Insurance"
    const val GROUP_ITINERARY = "Your itinerary"
    const val GROUP_PHOTOS = "Photos"
    const val GROUP_OTHER = "Everything else"
    const val ADDED_BY_YOU = "added by you"
    const val ADDED_BY_AGENT = "added by Gyasi"
    const val EMPTY_TITLE = "Nothing filed yet"
    const val EMPTY_BODY =
        "As Gyasi confirms each piece of the trip, the paperwork lands here. Add your " +
            "passport whenever you have a moment — there is no rush."
    const val UPLOAD_CTA = "Add a document"
    const val OPEN_FAILED = "That file would not open just now. Give it a moment and try again."
}

private val GROUP_BY_KIND: Map<String, DocumentGroup> = mapOf(
    "supplier_confirmation" to DocumentGroup.CONFIRMATIONS,
    "passport" to DocumentGroup.IDENTITY,
    "visa" to DocumentGroup.IDENTITY,
    "insurance_cert" to DocumentGroup.INSURANCE,
    "pdf_itinerary" to DocumentGroup.ITINERARY,
    "photo" to DocumentGroup.PHOTOS,
)

fun documentGroupFor(kind: String): DocumentGroup = GROUP_BY_KIND[kind] ?: DocumentGroup.OTHER

/** PDF or IMG, the two badges both artboards draw. */
enum class DocumentBadge { PDF, IMG }

/**
 * Off the MIME TYPE, never the filename extension.
 *
 * `filename` is client-supplied on upload and is the one field here a client controls;
 * `mime_type` is validated against the bucket's own `allowed_mime_types` before the object
 * is accepted. A `.pdf` suffix on a JPEG would otherwise paint a burgundy PDF tile over a
 * photograph.
 */
fun documentBadge(mimeType: String): DocumentBadge =
    if (mimeType == "application/pdf") DocumentBadge.PDF else DocumentBadge.IMG

/**
 * "1.1 MB", "320 KB".
 *
 * BINARY divisors under decimal labels, which looks like a bug and is not. The artboards'
 * numbers settle it: 327,680 bytes reads "320 KB" there and 634,880 reads "620 KB" — both
 * exact multiples of 1024, and both off by 2.5% under a 10^6 divisor. Printing "MiB" would
 * be more correct and would read as a typo to everyone outside engineering; printing decimal
 * would put numbers on screen that do not match the design.
 *
 * The web twin is `formatFileSize` in web/lib/trips/documents.ts and its test table is the
 * same four fixtures.
 */
fun formatFileSize(bytes: Long): String {
    if (bytes < 0) return "—"
    if (bytes < 1024) return "$bytes B"
    if (bytes < 1024 * 1024) return "${(bytes + 512) / 1024} KB"

    val mb = bytes.toDouble() / (1024.0 * 1024.0)
    // One decimal below 10 MB, none above, matching the web twin. `roundTenth` avoids
    // pulling in a platform number formatter for one string — commonMain has no printf.
    return if (mb < 10.0) "${roundTenth(mb)} MB" else "${(bytes + 524_288) / (1024 * 1024)} MB"
}

/** "1.1" — one decimal place, half-up, without a platform formatter. */
private fun roundTenth(value: Double): String {
    val tenths = ((value * 10.0) + 0.5).toLong()
    return "${tenths / 10}.${tenths % 10}"
}

/**
 * "added by you" / "added by Gyasi".
 *
 * Decided by whether `owner_user_id` is the caller's own PLATFORM USER id — not their auth
 * user id, which is `platform_user.account_id` and a different value. Getting that wrong
 * labels a traveler's own passport "added by Gyasi", which is how the web twin shipped
 * before it was caught by eye.
 */
fun uploadedByLabel(isMine: Boolean): String =
    if (isMine) DocumentMessages.ADDED_BY_YOU else DocumentMessages.ADDED_BY_AGENT

/**
 * Group in enum order, newest first inside each group, dropping empties.
 *
 * Stable group order rather than "order of first appearance": the heading a traveler is
 * looking for should not move because the agency happened to file an insurance certificate
 * before a confirmation.
 */
fun <T> groupDocuments(
    documents: List<T>,
    kindOf: (T) -> String,
    createdAtOf: (T) -> String,
): List<Pair<DocumentGroup, List<T>>> {
    val buckets = LinkedHashMap<DocumentGroup, MutableList<T>>()
    for (document in documents) {
        val group = documentGroupFor(kindOf(document))
        buckets.getOrPut(group) { mutableListOf() }.add(document)
    }

    return DocumentGroup.entries.mapNotNull { group ->
        val docs = buckets[group] ?: return@mapNotNull null
        if (docs.isEmpty()) null else group to docs.sortedByDescending(createdAtOf)
    }
}
