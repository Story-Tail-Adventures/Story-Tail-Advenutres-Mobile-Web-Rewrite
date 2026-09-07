-- The `trip-documents` storage bucket, and the deliberate absence of policies on it.
--
-- Screens 2.2.6 (Trip Document Library) and 2.2.11 (photos) need a client to open a file.
-- The obvious shape — a private bucket plus a `storage.objects` policy for `authenticated`
-- that checks trip ownership from the object path — CANNOT WORK HERE, and it is worth
-- writing down why, because it looks like an oversight otherwise.
--
-- `document.storage_bucket` and `document.storage_key` are Internal and are outside the
-- column grant to `authenticated` (see the trip_read_policies migration). A client
-- therefore never learns the key of any object. Supabase Storage is addressed BY KEY: every
-- read, every signed-URL request, every download names bucket + key. A client that cannot
-- read the key cannot form a request, so an `authenticated` policy on storage.objects would
-- never be reached by anyone. It would be dead code that reads like a security control —
-- the worst kind.
--
-- So the bucket is private and has NO `authenticated` policies at all. Access goes through
-- one audited Edge Function that resolves a `document.id` the client CAN see, checks
-- ownership against the same predicate document_self_select uses, signs a short-lived URL
-- with the service role, and writes an audit_event (CLAUDE.md rule 3).
--
-- This is not merely the tidier design — on mobile it is the only one. There is no server
-- in a Compose Multiplatform app, so a "the web server fetches it for you" shortcut has no
-- mobile equivalent; without a signer function, Screens 2.2.6 and 2.2.11 cannot open a file
-- on Android or iOS at all.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'trip-documents',
    'trip-documents',
    false,
    52428800,  -- 50 MiB, matching [storage].file_size_limit in config.toml
    ARRAY[
        'application/pdf',
        'image/jpeg', 'image/png', 'image/heic', 'image/webp'
    ]
)
ON CONFLICT (id) DO NOTHING;

-- No COMMENT ON TABLE storage.buckets here, deliberately: that table is owned by
-- supabase_storage_admin, so commenting on it fails with "must be owner of table buckets"
-- (42501) and takes the whole migration down with it. The rationale lives in this file's
-- header instead, which is where a reader of the bucket definition will look anyway.

-- Belt and braces: `storage.objects` ships with RLS enabled, and this asserts it rather
-- than assuming it. If a future Supabase version changes that default, this migration
-- fails loudly instead of the bucket quietly becoming readable.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_class
        WHERE oid = 'storage.objects'::regclass AND relrowsecurity
    ) THEN
        RAISE EXCEPTION
            'storage.objects does not have row level security enabled — the trip-documents '
            'bucket would be readable by any authenticated caller. Refusing to continue.';
    END IF;
END
$$;

-- Deliberately NOT created here:
--   * any policy on storage.objects for `anon` or `authenticated`
--   * any INSERT policy — client uploads go through the same Edge Function door, so that
--     the document row and the object are created together or not at all. A client that
--     could write to the bucket directly would produce orphan objects with no document row,
--     which is exactly the state that makes a document library impossible to audit.
