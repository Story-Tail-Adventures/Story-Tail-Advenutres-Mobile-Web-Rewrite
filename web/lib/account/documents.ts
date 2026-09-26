import type { TripDocument } from "@/lib/trips/queries";
import { createClient } from "@/lib/supabase/server";

/**
 * Screen 2.5.4's read — the account-wide document library.
 *
 * This is §2.2.6's read without the trip filter. `document_self_select` matches
 * `client_id = (SELECT client_id FROM current_platform_user()) OR trip_id IN (…)`, so the
 * caller sees their own documents whether or not those documents belong to a trip — which
 * means every per-trip upload already appears here, because `trip-document` stamps
 * `client_id` alongside `trip_id`.
 *
 * NONE of the withheld columns is selected. `storage_bucket`, `storage_key`,
 * `checksum_sha256` and `is_sensitive` are outside the column grant, and selecting one
 * raises 42501 rather than returning fewer columns — an accidental `select *` fails loudly.
 * Storage is addressed BY KEY, so a caller who cannot read the key cannot form a request;
 * `trip-document-url` is the only door, and it signs on demand.
 *
 * Returns `null` on a failed read so the caller can render §5's error state. An empty array
 * means "no documents", which is a different thing and gets the empty state.
 */
export async function loadAccountDocuments(): Promise<TripDocument[] | null> {
  const supabase = await createClient();

  const [{ data: me }, { data, error }] = await Promise.all([
    // `platform_user_self_select` scopes this to the caller — no `.eq()` needed.
    supabase.from("platform_user").select("id").maybeSingle(),
    supabase
      .from("document")
      .select("id, owner_user_id, kind, filename, mime_type, size_bytes, created_at")
      .is("archived_at", null)
      .order("created_at", { ascending: false }),
  ]);

  if (error) {
    console.warn("[account] document library read failed", { code: error.code });
    return null;
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    kind: row.kind,
    filename: row.filename,
    mimeType: row.mime_type,
    // `size_bytes` is bigint, and PostgREST serialises int8 as a plain JSON number rather
    // than a string. `Number()` is a no-op today and is kept so a config that started
    // stringifying would not turn a size into NaN — the same guard §2.2.6 uses.
    sizeBytes: Number(row.size_bytes),
    createdAt: row.created_at,
    mine: Boolean(me?.id) && row.owner_user_id === me?.id,
  }));
}
