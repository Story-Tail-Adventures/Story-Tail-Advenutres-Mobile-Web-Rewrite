/**
 * Document grouping and presentation for screen 2.2.6.
 *
 * Screen-Inventory §2.2.6 asks for the list "grouped by type (Supplier confirmations,
 * Passport copies, Visa, Insurance, Boarding passes, Photos)". Six group names for ten
 * `document_kind` values, and the mapping is not one-to-one in either direction:
 *
 *   - Passports and visas share ONE group in both artboards ("Passports & visas"), because
 *     a traveler thinks of them as one drawer.
 *   - "Boarding passes" is not a kind at all. Boarding passes arrive as
 *     `supplier_confirmation` — the desktop artboard files `flight-aa1413-boarding.pdf`
 *     under "Supplier confirmations" for exactly that reason. Giving it its own group would
 *     mean a heading that is always empty.
 *   - Four kinds NEVER reach a client: `receipt`, `csv_import`, `pdf_proposal` and `other`
 *     are outside `document_self_select`'s allowlist. They are absent here too, so a kind
 *     that slips into the read policy shows up as an unrouted document rather than silently
 *     joining a group it does not belong in.
 *
 * The Kotlin twin is
 * `mobile/shared/src/commonMain/kotlin/com/storytail/adventures/domain/trip/TripDocuments.kt`,
 * and `.github/scripts/check_copy_parity.py` compares DOCUMENT_MESSAGES against it. That is
 * why the table is a flat object of plain strings — the checker reads only top-level string
 * keys, so a nested shape would drift silently.
 */

/**
 * The client-readable kinds, verbatim from `document_self_select`'s allowlist in
 * 20260907031255_trip_read_policies.sql. Anything outside this list is unreachable through
 * PostgREST and unsignable through `trip-document-url`; if the two lists ever disagree the
 * narrower one wins, so keeping them identical is the point.
 */
export const READABLE_DOCUMENT_KINDS = [
  "passport",
  "visa",
  "insurance_cert",
  "supplier_confirmation",
  "photo",
  "pdf_itinerary",
] as const;

export type ReadableDocumentKind = (typeof READABLE_DOCUMENT_KINDS)[number];

/** The kinds a client may contribute, matching CLIENT_DOCUMENT_KINDS in _shared/trip.ts. */
export const UPLOADABLE_DOCUMENT_KINDS = [
  "passport",
  "visa",
  "insurance_cert",
  "photo",
] as const;

export type UploadableDocumentKind = (typeof UPLOADABLE_DOCUMENT_KINDS)[number];

export const DOCUMENT_GROUP_IDS = [
  "confirmations",
  "identity",
  "insurance",
  "itinerary",
  "photos",
  "other",
] as const;

export type DocumentGroupId = (typeof DOCUMENT_GROUP_IDS)[number];

/**
 * Flat, and shared with the Kotlin twin. Group headings live here rather than in a
 * per-screen content.ts because both stacks render them and CI compares them.
 */
export const DOCUMENT_MESSAGES = {
  groupConfirmations: "Supplier confirmations",
  groupIdentity: "Passports & visas",
  groupInsurance: "Insurance",
  groupItinerary: "Your itinerary",
  groupPhotos: "Photos",
  groupOther: "Everything else",
  addedByYou: "added by you",
  addedByAgent: "added by Gyasi",
  emptyTitle: "Nothing filed yet",
  emptyBody:
    "As Gyasi confirms each piece of the trip, the paperwork lands here. Add your passport whenever you have a moment — there is no rush.",
  uploadCta: "Add a document",
  openFailed: "That file would not open just now. Give it a moment and try again.",
} as const;

const GROUP_LABEL_BY_ID: Record<DocumentGroupId, string> = {
  confirmations: DOCUMENT_MESSAGES.groupConfirmations,
  identity: DOCUMENT_MESSAGES.groupIdentity,
  insurance: DOCUMENT_MESSAGES.groupInsurance,
  itinerary: DOCUMENT_MESSAGES.groupItinerary,
  photos: DOCUMENT_MESSAGES.groupPhotos,
  other: DOCUMENT_MESSAGES.groupOther,
};

const GROUP_BY_KIND: Record<string, DocumentGroupId> = {
  supplier_confirmation: "confirmations",
  passport: "identity",
  visa: "identity",
  insurance_cert: "insurance",
  pdf_itinerary: "itinerary",
  photo: "photos",
};

export function documentGroupFor(kind: string): DocumentGroupId {
  return GROUP_BY_KIND[kind] ?? "other";
}

export function documentGroupLabel(group: DocumentGroupId): string {
  return GROUP_LABEL_BY_ID[group];
}

/**
 * PDF or IMG, the two badges both artboards draw.
 *
 * Off the MIME TYPE, never the filename extension. `filename` is client-supplied on upload
 * and is the one field here a client controls; `mime_type` is validated against the bucket's
 * own `allowed_mime_types` before the object is accepted. A `.pdf` suffix on a JPEG would
 * otherwise paint a burgundy PDF tile over a photograph.
 */
export function documentBadge(mimeType: string): "PDF" | "IMG" {
  return mimeType === "application/pdf" ? "PDF" : "IMG";
}

/**
 * "1.1 MB", "320 KB".
 *
 * BINARY divisors under decimal labels, which looks like a bug and is not. The artboards'
 * numbers settle it: 327,680 bytes reads "320 KB" there and 634,880 reads "620 KB" — both
 * exact multiples of 1024, and both off by 2.5% under a 10^6 divisor (328 KB, 635 KB). The
 * passport is the same story: 1,153,434 bytes is "1.1 MB" in the artboard and 1.0999 MiB.
 *
 * So the design means KiB/MiB and writes KB/MB, which is the convention Windows and every
 * file manager a traveler has used shows them. Printing "MiB" would be more correct and
 * would read as a typo to everyone outside engineering; printing decimal would put numbers
 * on screen that do not match the design. Matching the design wins.
 */
export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  const mb = bytes / (1024 * 1024);
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}

/**
 * "added by you" / "added by Gyasi".
 *
 * Decided by whether `owner_user_id` is the caller's own platform user, which is why the
 * queries select that column: §2.2.6's "uploaded-by indicator (agent vs. client)" is one of
 * its named primary elements, and `kind` is a poor proxy — the agency files passports on a
 * client's behalf often enough that a passport is not proof the client uploaded it.
 */
export function uploadedByLabel(isMine: boolean): string {
  return isMine ? DOCUMENT_MESSAGES.addedByYou : DOCUMENT_MESSAGES.addedByAgent;
}

export type GroupableDocument = {
  kind: string;
  createdAt: string;
};

export type DocumentGroup<T extends GroupableDocument> = {
  id: DocumentGroupId;
  label: string;
  documents: T[];
};

/**
 * Group in DOCUMENT_GROUP_IDS order, newest first inside each group, dropping empties.
 *
 * Stable group order rather than "order of first appearance": the heading a traveler is
 * looking for should not move because the agency happened to file an insurance certificate
 * before a confirmation.
 */
export function groupDocuments<T extends GroupableDocument>(
  documents: readonly T[],
): DocumentGroup<T>[] {
  const buckets = new Map<DocumentGroupId, T[]>();
  for (const doc of documents) {
    const id = documentGroupFor(doc.kind);
    const bucket = buckets.get(id);
    if (bucket) bucket.push(doc);
    else buckets.set(id, [doc]);
  }

  return DOCUMENT_GROUP_IDS.flatMap((id) => {
    const docs = buckets.get(id);
    if (!docs || docs.length === 0) return [];
    return [
      {
        id,
        label: GROUP_LABEL_BY_ID[id],
        documents: [...docs].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      },
    ];
  });
}
