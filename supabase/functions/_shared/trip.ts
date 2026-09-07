/**
 * Shared helpers for the §2.2 write functions.
 *
 * The three functions here all need the same two things: the caller's client id, and proof
 * that a trip belongs to them. Doing that in three places is how one of them ends up
 * checking a different predicate from the read policies — which would mean a client could
 * write to a trip they cannot read, or the reverse.
 */
import { serviceClient, type Db } from "./db.ts";
import { forbidden, notFound } from "./problem.ts";
import type { AuthContext } from "./auth.ts";

/**
 * The document kinds a CLIENT may contribute.
 *
 * Deliberately narrower than `document_self_select`'s read allowlist, which also includes
 * `supplier_confirmation` and `pdf_itinerary` — those are the agency's to file. A client
 * cannot mint a `receipt` or a `csv_import` at all: those are agency records, and the read
 * policy excludes them for the same reason.
 */
export const CLIENT_DOCUMENT_KINDS = ["passport", "visa", "insurance_cert", "photo"] as const;
export type ClientDocumentKind = (typeof CLIENT_DOCUMENT_KINDS)[number];

export function isClientDocumentKind(value: unknown): value is ClientDocumentKind {
  return typeof value === "string" && (CLIENT_DOCUMENT_KINDS as readonly string[]).includes(value);
}

/** The mime types the `trip-documents` bucket accepts, matching its own allowed_mime_types. */
export const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/heic",
  "image/webp",
] as const;

/** 50 MiB, matching the bucket's file_size_limit and [storage] in config.toml. */
export const MAX_UPLOAD_BYTES = 52_428_800;

export const TRIP_DOCUMENTS_BUCKET = "trip-documents";

/** The caller's client id, or 403. An agent has none and does not belong on these routes. */
export function requireClientId(ctx: AuthContext): string {
  if (ctx.role !== "client" || !ctx.clientId) {
    throw forbidden("This is the traveler's side of the platform.");
  }
  return ctx.clientId;
}

/**
 * Assert the trip belongs to this client, and return it.
 *
 * Runs on the SERVICE role and checks `client_id` by hand rather than leaning on RLS,
 * because these functions have to write — and once you are on the service role, RLS is not
 * checking anything for you. Every ownership test in this file is therefore explicit, and
 * mirrors the predicate in 20260907031255_trip_read_policies.sql.
 *
 * 404 rather than 403 when the trip is not theirs: "no such trip" and "not yours" are
 * deliberately the same answer, so a client cannot enumerate other people's trip ids.
 */
export async function requireOwnedTrip(
  db: Db,
  clientId: string,
  tripId: string,
): Promise<{ id: string; agentId: string }> {
  const { data, error } = await db
    .from("trip")
    .select("id, client_id, agent_id, archived_at")
    .eq("id", tripId)
    .maybeSingle();

  if (error) throw new Error(`trip lookup failed: ${error.message}`);
  if (!data || data.client_id !== clientId || data.archived_at !== null) {
    throw notFound("No such trip.");
  }
  return { id: data.id, agentId: data.agent_id };
}

/**
 * `http://kong:8000/storage/v1/object/sign/...?token=...` → `/storage/v1/object/sign/...?token=...`
 *
 * WHY THE FUNCTIONS RETURN A PATH AND NOT AN ABSOLUTE URL.
 *
 * Both `createSignedUrl` and `createSignedUploadUrl` build their result from SUPABASE_URL as
 * seen from INSIDE the function's own container. Locally that is `http://kong:8000` — a
 * Docker-internal hostname that resolves nowhere in a browser or on a phone. Returning it
 * verbatim means document open and document upload both pass in curl and are broken on web,
 * Android and iOS alike.
 *
 * Re-basing onto a public origin here would need a second env var holding that origin, set
 * correctly in every environment, and wrong in exactly one direction — silently, at runtime —
 * whenever it drifted. But every caller already knows the correct origin: it is the origin
 * they reached the function on. So the path is the portable answer, and there is nothing left
 * to misconfigure. The signature rides in the query string, so the token survives intact.
 *
 * Relative input passes through unchanged. supabase-js has returned both shapes across
 * versions, and a version bump that starts returning a path must not double-prefix it.
 */
export function toStoragePath(signedUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(signedUrl, "http://placeholder.invalid");
  } catch {
    throw new Error("storage returned a signed URL that will not parse");
  }
  return `${parsed.pathname}${parsed.search}`;
}

export function tripDb(): Db {
  return serviceClient();
}

/** Body parsing with a useful failure, shared by all three functions. */
export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new Error("not an object");
    }
    return body as Record<string, unknown>;
  } catch {
    const { badRequest } = await import("./problem.ts");
    throw badRequest("Send a JSON object.");
  }
}
