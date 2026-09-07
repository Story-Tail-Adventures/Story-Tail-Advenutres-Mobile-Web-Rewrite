/**
 * Sign a short-lived read URL for a document the caller owns — the single door to the
 * private `trip-documents` bucket. Screens 2.2.6 and 2.2.11.
 *
 * WHY THIS EXISTS AT ALL, since it looks like something RLS should handle.
 *
 * `document.storage_bucket` and `storage_key` are outside the client column grant (see
 * 20260907031255_trip_read_policies.sql). Supabase Storage is addressed BY KEY: every read,
 * every signed URL, every download names bucket + key. A client that cannot read the key
 * cannot form a request — so a policy on `storage.objects` for `authenticated` would never
 * be reached by anyone. The bucket therefore has no authenticated policies at all, and this
 * function is the only way in.
 *
 * That is not a web convenience. A Compose Multiplatform app has no server, so without this
 * endpoint 2.2.6 and 2.2.11 cannot open a file on Android or iOS at all.
 *
 * WHAT IT CHECKS, in order, all explicitly — this runs on the service role, so RLS is
 * checking nothing:
 *   1. the caller is a client
 *   2. the document exists
 *   3. its kind is one a client may read (the same allowlist the read policy uses)
 *   4. it belongs to them, by client_id OR by one of their trips
 *   5. it is not archived
 *
 * And it audits. Every signature is an access to somebody's passport scan or insurance
 * certificate, which is exactly what Data-Model §18.3 wants a trail for.
 */
import { requireUser } from "../_shared/auth.ts";
import { writeAuditEvent } from "../_shared/audit.ts";
import { corsHeaders, handlePreflight } from "../_shared/cors.ts";
import { badRequest, notFound, problem } from "../_shared/problem.ts";
import { requireClientId, toStoragePath, tripDb, TRIP_DOCUMENTS_BUCKET } from "../_shared/trip.ts";

/**
 * Five minutes. Long enough to open a PDF on a slow connection, short enough that a URL
 * pasted into a chat is dead by the time anybody clicks it.
 */
const TTL_SECONDS = 300;

/**
 * The kinds a client may READ. Wider than what they may upload — supplier confirmations and
 * itinerary PDFs are the agency's to file but the client's to see — and identical to the
 * allowlist in document_self_select, which is the point: a document readable through
 * PostgREST must be openable here, and nothing else.
 */
const READABLE_KINDS = [
  "passport",
  "visa",
  "insurance_cert",
  "supplier_confirmation",
  "photo",
  "pdf_itinerary",
] as const;

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  try {
    if (req.method !== "GET") throw badRequest("Use GET.");

    const ctx = await requireUser(req);
    const clientId = requireClientId(ctx);

    const documentId = new URL(req.url).searchParams.get("documentId");
    if (!documentId) throw badRequest("Pass documentId.");

    const db = tripDb();

    const { data: doc, error } = await db
      .from("document")
      .select("id, client_id, trip_id, kind, filename, mime_type, storage_bucket, storage_key, archived_at")
      .eq("id", documentId)
      .maybeSingle();

    if (error) throw new Error(`document lookup failed: ${error.message}`);
    // One answer for every failure mode below, so a client cannot probe for the existence
    // of documents belonging to anybody else.
    if (!doc || doc.archived_at !== null) throw notFound("No such document.");
    if (!(READABLE_KINDS as readonly string[]).includes(doc.kind)) throw notFound("No such document.");

    let owned = doc.client_id === clientId;
    if (!owned && doc.trip_id) {
      const { data: trip } = await db
        .from("trip")
        .select("id")
        .eq("id", doc.trip_id)
        .eq("client_id", clientId)
        .maybeSingle();
      owned = Boolean(trip);
    }
    if (!owned) throw notFound("No such document.");

    const { data: signed, error: signError } = await db.storage
      .from(doc.storage_bucket ?? TRIP_DOCUMENTS_BUCKET)
      .createSignedUrl(doc.storage_key, TTL_SECONDS);

    if (signError || !signed?.signedUrl) {
      // The row exists but the object does not, or storage is down. Never echo the storage
      // error: it contains the key, which is the one thing this endpoint exists to withhold.
      throw new Error("could not sign a URL for the stored object");
    }

    // A PATH, not an absolute URL — see toStoragePath for why that matters.
    const signedPath = toStoragePath(signed.signedUrl);

    // AFTER signing, so a failed signature is not recorded as an access that never
    // happened — but before returning, so the caller cannot receive a URL that is not on
    // the record. Data-Model §18.3.
    await writeAuditEvent(ctx, {
      eventType: "document.url_signed",
      targetEntity: "document",
      targetId: doc.id,
      metadata: { kind: doc.kind, tripId: doc.trip_id, ttlSeconds: TTL_SECONDS },
    });

    return json({
      documentId: doc.id,
      path: signedPath,
      expiresAt: new Date(Date.now() + TTL_SECONDS * 1000).toISOString(),
      filename: doc.filename,
      mimeType: doc.mime_type,
    });
  } catch (err) {
    return problem(err);
  }
});

function json(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
