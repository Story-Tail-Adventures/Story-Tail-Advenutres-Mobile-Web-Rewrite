/**
 * Register a document and sign a short-lived UPLOAD url for it. Screens 2.2.6 and 2.2.11.
 *
 * Two things have to happen together: a `document` row has to exist, and an object has to
 * land in the private bucket. The client can do neither directly — no write policy on
 * `document`, and never granted `storage_key` — so this creates the row, signs an upload URL
 * for a key the CLIENT NEVER CHOOSES, and audits it.
 *
 * WHY THE SERVER PICKS THE KEY. If a client supplied it, two clients could collide, a
 * traversal could escape the trip prefix, and the key would have to be returned — which is
 * the one field the read grant withholds. So the key is derived from ids the server already
 * trusts, and only the signed URL comes back.
 *
 * WHAT IT DOES NOT DO. It does not confirm the upload. A client that requests a URL and
 * never uploads leaves a `document` row with no object behind it, which 2.2.6 would list and
 * the signer would then fail to sign. That is a known, accepted gap: the alternative is a
 * second confirm endpoint and a pending state, which is real work for a case a sweep can
 * clean up. Recorded here rather than discovered later.
 */
import { requireUser } from "../_shared/auth.ts";
import { writeAuditEvent } from "../_shared/audit.ts";
import { corsHeaders, handlePreflight } from "../_shared/cors.ts";
import { badRequest, problem } from "../_shared/problem.ts";
import { assertRecentUuidV7 } from "../_shared/uuid.ts";
import {
  ALLOWED_MIME_TYPES,
  isClientDocumentKind,
  MAX_UPLOAD_BYTES,
  readJson,
  requireClientId,
  requireOwnedTrip,
  toStoragePath,
  TRIP_DOCUMENTS_BUCKET,
  tripDb,
} from "../_shared/trip.ts";

/** Ten minutes: long enough to upload a 50 MiB scan over a hotel connection. */
const UPLOAD_TTL_SECONDS = 600;

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  try {
    if (req.method !== "POST") throw badRequest("Use POST.");

    const ctx = await requireUser(req);
    const clientId = requireClientId(ctx);
    const body = await readJson(req);

    const documentId = body.documentId;
    if (typeof documentId !== "string") throw badRequest("Send a documentId.");
    try {
      // Client-generated UUIDv7 with a recent embedded timestamp (Data-Model §21.6). This
      // is what makes a retry idempotent rather than producing a second row.
      assertRecentUuidV7(documentId);
    } catch (err) {
      throw badRequest(`documentId must be a recent UUID v7: ${(err as Error).message}`);
    }

    const tripId = body.tripId;
    if (typeof tripId !== "string") throw badRequest("Send a tripId.");

    const kind = body.kind;
    if (!isClientDocumentKind(kind)) {
      throw badRequest("kind must be one of: passport, visa, insurance_cert, photo.");
    }

    const filename = typeof body.filename === "string" ? body.filename.trim() : "";
    if (!filename || filename.length > 255) throw badRequest("Send a filename under 255 characters.");

    const mimeType = body.mimeType;
    if (typeof mimeType !== "string" || !(ALLOWED_MIME_TYPES as readonly string[]).includes(mimeType)) {
      throw badRequest(`mimeType must be one of: ${ALLOWED_MIME_TYPES.join(", ")}.`);
    }

    // Sent as a digit-string for the same precision reason money is (CLAUDE.md rule 5).
    const sizeBytes = Number.parseInt(String(body.sizeBytes ?? ""), 10);
    if (!Number.isSafeInteger(sizeBytes) || sizeBytes <= 0 || sizeBytes > MAX_UPLOAD_BYTES) {
      throw badRequest(`sizeBytes must be a positive integer up to ${MAX_UPLOAD_BYTES}.`);
    }

    const db = tripDb();
    await requireOwnedTrip(db, clientId, tripId);

    // Derived from ids the server trusts, never from the client. The extension comes from
    // the mime type rather than the filename, so a name cannot smuggle one in.
    const extension = EXTENSION_BY_MIME[mimeType] ?? "bin";
    const storageKey = `trips/${tripId}/${documentId}.${extension}`;

    const { data: signed, error: signError } = await db.storage
      .from(TRIP_DOCUMENTS_BUCKET)
      .createSignedUploadUrl(storageKey, { upsert: true });

    if (signError || !signed?.signedUrl) {
      throw new Error("could not sign an upload URL");
    }

    // A PATH, not an absolute URL — see toStoragePath for why that matters.
    const uploadPath = toStoragePath(signed.signedUrl);

    // `checksum_sha256` is NOT NULL and cannot be known before the bytes arrive. Zeroes are
    // the honest placeholder: a checksum of the filename would look like a verified digest
    // of content nobody has seen. A confirm step would fill it in — see the header note.
    const { error: insertError } = await db.from("document").insert({
      id: documentId,
      owner_user_id: ctx.platformUserId,
      client_id: clientId,
      trip_id: tripId,
      kind,
      filename,
      mime_type: mimeType,
      size_bytes: sizeBytes,
      storage_bucket: TRIP_DOCUMENTS_BUCKET,
      storage_key: storageKey,
      // bytea over PostgREST is a hex-escape STRING, not a byte array — 32 zero bytes.
      checksum_sha256: `\\x${"00".repeat(32)}`,
      // A passport or a visa is Sensitive PII under Data-Model §18, and this flag is what
      // turns on the tighter access logging §18.3 asks for.
      is_sensitive: kind === "passport" || kind === "visa",
    });

    if (insertError) {
      // A retry of the same request lands here, which is the point of the client-supplied
      // id: the row already exists, so nothing new is created and nothing is lost.
      if (insertError.code === "23505") throw badRequest("That document has already been registered.");
      throw new Error(`document insert failed: ${insertError.message}`);
    }

    await writeAuditEvent(ctx, {
      eventType: "document.created",
      targetEntity: "document",
      targetId: documentId,
      metadata: { kind, tripId, sizeBytes, mimeType },
    });

    return json(
      {
        documentId,
        uploadPath,
        expiresAt: new Date(Date.now() + UPLOAD_TTL_SECONDS * 1000).toISOString(),
      },
      201,
    );
  } catch (err) {
    return problem(err);
  }
});

const EXTENSION_BY_MIME: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/heic": "heic",
  "image/webp": "webp",
};

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
