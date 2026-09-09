#!/usr/bin/env bash
#
# Put a placeholder object behind every seeded `document` row.
#
# WHY THIS IS A SCRIPT AND NOT PART OF seed.sql: `seed.sql` runs inside Postgres, and
# Supabase Storage objects are not rows Postgres owns — the metadata lives in
# `storage.objects` but the bytes live in the storage service's own volume. Inserting the
# metadata by hand would give every document a row pointing at bytes that are not there,
# which is worse than nothing: `trip-document-url` would sign a URL that 404s at fetch time
# instead of failing loudly at sign time.
#
# WITHOUT THIS, after a `supabase db reset`, screen 2.2.6 lists five documents and every one
# of them fails to open — the rows are seeded, the objects are not. That reads as a broken
# document library rather than as absent fixtures, and it cost real time to diagnose once.
#
# Run it after `supabase db reset`. Idempotent: `x-upsert` means re-running is harmless.
#
#   ./supabase/scripts/seed-storage-objects.sh
#
# The bytes are a single character. Nothing in §2.2 reads the content — the screens show
# filename, kind and size from the `document` row, and the only thing that touches the object
# is the signature. A real JPEG would make the fixtures 4MB of binary in git for no gain.
set -euo pipefail

export PATH="$HOME/.orbstack/bin:$PATH"

DB_URL="${DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
API_URL="${API_URL:-http://127.0.0.1:54321}"

SERVICE_ROLE_KEY="$(supabase status -o json | python3 -c 'import json,sys; print(json.load(sys.stdin)["SERVICE_ROLE_KEY"])')"

# The service role, because the `trip-documents` bucket has no policies for any client role
# at all — that is the design (see 20260907031256_trip_document_storage.sql), and it is why
# `trip-document-url` exists.
blob="$(mktemp)"
printf 'x' > "$blob"
trap 'rm -f "$blob"' EXIT

fails=0
while IFS=$'\t' read -r bucket key mime; do
    [ -z "${key:-}" ] && continue
    code="$(curl -s -o /dev/null -w '%{http_code}' \
        -X POST "$API_URL/storage/v1/object/$bucket/$key" \
        -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
        -H "Content-Type: $mime" \
        -H "x-upsert: true" \
        --data-binary "@$blob")"
    printf '%-4s %s\n' "$code" "$key"
    [ "$code" = "200" ] || fails=$((fails + 1))
done < <(psql "$DB_URL" -X -q -A -t -F $'\t' \
    -c "SELECT storage_bucket, storage_key, mime_type FROM public.document ORDER BY id;")

if [ "$fails" -gt 0 ]; then
    echo "$fails object(s) failed to upload." >&2
    exit 1
fi
echo "All seeded documents have a backing object."
