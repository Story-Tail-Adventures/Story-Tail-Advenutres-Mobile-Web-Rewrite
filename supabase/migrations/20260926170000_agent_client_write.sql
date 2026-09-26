-- §3.3.9 Create, §3.3.10 Edit, §3.3.12 Archive / Restore. The write path for `client`
-- itself, where §3.3's earlier migrations only read it and wrote `client_note`.
--
-- ALL service_role ONLY, for the reason `agent_set_trip_status` established: `p_agent_id` is
-- trusted input, and a client-role grant makes any of these an act-as-any-agent primitive
-- with no `audit_event`. `client` is a CLAUDE.md rule-3 table — every mutation owes an audit
-- row, and a PostgREST write cannot produce one.
--
-- ── ARCHIVE AND RESTORE ARE ONE FUNCTION ───────────────────────────────────────────────
--
-- They are the same write with a boolean, against the same two columns, with the same
-- ownership gate and the same version check. Two functions would be two grants, two
-- assertion blocks and two places for the `status`/`archived_at` pair to drift apart — and
-- that pair drifting is the specific failure worth preventing: `status` is outside the
-- column grant and `archived_at` is inside it, so a row where only one moved reads as
-- archived to one query and active to another.
--
-- ── WHAT THESE FUNCTIONS DELIBERATELY DO NOT TOUCH ─────────────────────────────────────
--
--   emergency_contact  The TRAVELER's field, not the advisor's. Data-Model §6.1: "Captured
--                      at Screen 2.1.10, edited at 2.5.2". `onboarding-profile` writes it.
--   lifetime_value_cents  Derived, never stored — see the §3.3.1 read surface migration for
--                      why the cache is left alone rather than written here.
--   merged_into_client_id  §3.9.7's, and §3.3.11 is deferred to it.
--   notes              `client.notes` is edited from the Snapshot card, which is §3.3.10's
--                      form field below; the `client_note` TABLE has its own write.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- A shared address upsert
--
-- `client.mailing_address_id` points at an `address` row, and the form edits it inline. The
-- helper keeps create and update from growing two copies of the same twelve lines.
--
-- IT REUSES THE EXISTING ROW RATHER THAN INSERTING A NEW ONE on every save. An address has
-- no other referent — nothing else in the schema points at a client's mailing address — so
-- inserting per save would leave an orphan behind each time, and `onboarding-connect`'s
-- rescue path already has to reason about which address a client holds.
--
-- ALL-EMPTY CLEARS THE LINK rather than storing a row of nulls: "no address on file" and
-- "an address whose every field is blank" render the same and mean different things.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.agent_upsert_client_address(
    p_client_id    uuid,
    p_existing_id  uuid,
    p_line1        text,
    p_line2        text,
    p_city         text,
    p_region       text,
    p_postal_code  text,
    p_country      char(2)
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_id uuid;
BEGIN
    IF coalesce(btrim(p_line1), '') = ''
       AND coalesce(btrim(p_line2), '') = ''
       AND coalesce(btrim(p_city), '') = ''
       AND coalesce(btrim(p_region), '') = ''
       AND coalesce(btrim(p_postal_code), '') = ''
    THEN
        RETURN NULL;
    END IF;

    IF p_existing_id IS NOT NULL THEN
        UPDATE public.address
           SET line1 = nullif(btrim(p_line1), ''),
               line2 = nullif(btrim(p_line2), ''),
               city = nullif(btrim(p_city), ''),
               region = nullif(btrim(p_region), ''),
               postal_code = nullif(btrim(p_postal_code), ''),
               country = p_country
         WHERE id = p_existing_id;
        RETURN p_existing_id;
    END IF;

    -- v4, and that is the settled call rather than a shortcut. An address row is created BY
    -- THE DATABASE in response to a form save, so there is no client to hand it a v7 — the
    -- same position `handle_new_user()` is in, whose own comment says it plainly:
    -- "time-ordering is a nice-to-have for index locality, not a correctness property, and
    -- the offline-generation rule in §21.6 is about rows the apps create."
    --
    -- `client.id` IS a v7, because the Edge Function generates it before calling
    -- agent_create_client and therefore can.
    v_id := gen_random_uuid();

    INSERT INTO public.address (id, line1, line2, city, region, postal_code, country)
    VALUES (
        v_id,
        nullif(btrim(p_line1), ''), nullif(btrim(p_line2), ''),
        nullif(btrim(p_city), ''), nullif(btrim(p_region), ''),
        nullif(btrim(p_postal_code), ''), p_country
    );
    RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.agent_upsert_client_address(uuid, uuid, text, text, text, text, text, char) IS
    'Shared by agent_create_client and agent_update_client. Returns NULL when every field is '
    'blank, which CLEARS client.mailing_address_id rather than storing a row of nulls.';

-- ─────────────────────────────────────────────────────────────────────────────
-- §3.3.9 Create
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.agent_create_client(
    p_agent_id       uuid,
    p_client_id      uuid,
    p_first_name     text,
    p_last_name      text,
    p_preferred_name text,
    p_email          text,
    p_phone          text,
    p_date_of_birth  date,
    p_tags           text[],
    p_important_dates jsonb,
    p_notes          text,
    p_line1          text,
    p_line2          text,
    p_city           text,
    p_region         text,
    p_postal_code    text,
    p_country        char(2)
)
RETURNS TABLE (
    outcome     text,   -- 'created' | 'duplicate_email'
    client_id   uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_existing uuid;
    v_address  uuid;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.agent a WHERE a.id = p_agent_id AND a.status <> 'archived'
    ) THEN
        RETURN;
    END IF;

    IF p_client_id IS NULL
       OR coalesce(btrim(p_first_name), '') = ''
       OR coalesce(btrim(p_last_name), '') = ''
       OR coalesce(btrim(p_email), '') = ''
    THEN
        RETURN;
    END IF;

    -- A SECOND RECORD FOR THE SAME PERSON IS WHAT MERGE EXISTS TO CLEAN UP, so this refuses
    -- rather than creating one and leaving the agent to notice. Scoped to THIS agent's own
    -- book and to live records: another advisor's client is none of their business, and a
    -- tombstone's email is not a collision with anything a screen can reach.
    --
    -- `client.email` is citext and its index is partial, NOT unique — a family sharing one
    -- address is legal in the schema. This is the advisor being told, not the database
    -- forbidding it, which is why it is an outcome rather than a constraint violation.
    SELECT c.id INTO v_existing
      FROM public.client c
     WHERE c.agent_id = p_agent_id
       AND c.email = btrim(p_email)::citext
       AND c.status <> 'merged_into'
     LIMIT 1;

    IF FOUND THEN
        RETURN QUERY SELECT 'duplicate_email'::text, v_existing;
        RETURN;
    END IF;

    v_address := public.agent_upsert_client_address(
        p_client_id, NULL, p_line1, p_line2, p_city, p_region, p_postal_code, p_country);

    INSERT INTO public.client (
        id, agent_id, first_name, last_name, preferred_name, email, phone,
        date_of_birth, mailing_address_id, important_dates, tags, notes, status
    ) VALUES (
        p_client_id, p_agent_id,
        btrim(p_first_name), btrim(p_last_name),
        nullif(btrim(p_preferred_name), ''),
        btrim(p_email)::citext,
        nullif(btrim(p_phone), ''),
        p_date_of_birth,
        v_address,
        coalesce(p_important_dates, '[]'::jsonb),
        coalesce(p_tags, ARRAY[]::text[]),
        nullif(btrim(p_notes), ''),
        'active'
    );

    RETURN QUERY SELECT 'created'::text, p_client_id;
END;
$$;

COMMENT ON FUNCTION public.agent_create_client IS
    'Screen 3.3.9. Refuses a second live record with the same email in the same book and '
    'answers `duplicate_email` with the existing id, because that duplicate is exactly what '
    '§3.3.11 Merge exists to clean up. emergency_contact is NOT set here — Data-Model §6.1 '
    'makes it the traveler''s field, captured at 2.1.10 and edited at 2.5.2.';

-- ─────────────────────────────────────────────────────────────────────────────
-- §3.3.10 Edit
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.agent_update_client(
    p_client_id       uuid,
    p_agent_id        uuid,
    p_first_name      text,
    p_last_name       text,
    p_preferred_name  text,
    p_email           text,
    p_phone           text,
    p_date_of_birth   date,
    p_tags            text[],
    p_important_dates jsonb,
    p_notes           text,
    p_line1           text,
    p_line2           text,
    p_city            text,
    p_region          text,
    p_postal_code     text,
    p_country         char(2),
    p_expected_version integer
)
RETURNS TABLE (
    outcome text,   -- 'changed' | 'noop' | 'stale' | 'duplicate_email'
    version integer,
    /**
     * WHICH fields moved, for the audit row — NAMES, never values.
     *
     * `onboarding-profile` already audits `{"fields":["phone"]}` and `onboarding-connect`'s
     * rescue path "audits with the field names and none of their contents". A client record
     * is PII; an audit_event is retained seven years. "phone changed" is the fact worth
     * keeping, and the phone number itself is already in the row.
     */
    changed_fields text[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_client   public.client%ROWTYPE;
    v_address  uuid;
    v_existing uuid;
    v_fields   text[];
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.agent a WHERE a.id = p_agent_id AND a.status <> 'archived'
    ) THEN
        RETURN;
    END IF;

    IF coalesce(btrim(p_first_name), '') = ''
       OR coalesce(btrim(p_last_name), '') = ''
       OR coalesce(btrim(p_email), '') = ''
    THEN
        RETURN;
    END IF;

    SELECT * INTO v_client
      FROM public.client c
     WHERE c.id = p_client_id
       AND c.agent_id = p_agent_id
       AND c.status <> 'merged_into'
     FOR UPDATE;

    IF NOT FOUND THEN
        RETURN;
    END IF;

    IF p_expected_version IS NOT NULL AND p_expected_version <> v_client.version THEN
        RETURN QUERY SELECT 'stale'::text, v_client.version, ARRAY[]::text[];
        RETURN;
    END IF;

    -- Same rule as create, minus this row: changing an email TO one another live client in
    -- the book already holds is the same duplicate by a different route.
    SELECT c.id INTO v_existing
      FROM public.client c
     WHERE c.agent_id = p_agent_id
       AND c.id <> p_client_id
       AND c.email = btrim(p_email)::citext
       AND c.status <> 'merged_into'
     LIMIT 1;

    IF FOUND THEN
        RETURN QUERY SELECT 'duplicate_email'::text, v_client.version, ARRAY[]::text[];
        RETURN;
    END IF;

    v_address := public.agent_upsert_client_address(
        p_client_id, v_client.mailing_address_id,
        p_line1, p_line2, p_city, p_region, p_postal_code, p_country);

    -- `IS DISTINCT FROM` throughout so a re-save of identical values is a NOOP: a version
    -- bump with nothing behind it makes a second tab stale against a write that changed
    -- nothing, which is the bug `agent_set_trip_notes` records the same guard for.
    -- `::text` on every literal is load-bearing: `text[] || 'x'` picks the array||array
    -- overload and fails with "malformed array literal" at RUNTIME, not at CREATE time.
    v_fields := ARRAY[]::text[];
    IF btrim(p_first_name) IS DISTINCT FROM v_client.first_name
        THEN v_fields := v_fields || 'first_name'::text; END IF;
    IF btrim(p_last_name) IS DISTINCT FROM v_client.last_name
        THEN v_fields := v_fields || 'last_name'::text; END IF;
    IF nullif(btrim(p_preferred_name), '') IS DISTINCT FROM v_client.preferred_name
        THEN v_fields := v_fields || 'preferred_name'::text; END IF;
    IF btrim(p_email)::citext IS DISTINCT FROM v_client.email
        THEN v_fields := v_fields || 'email'::text; END IF;
    IF nullif(btrim(p_phone), '') IS DISTINCT FROM v_client.phone
        THEN v_fields := v_fields || 'phone'::text; END IF;
    IF p_date_of_birth IS DISTINCT FROM v_client.date_of_birth
        THEN v_fields := v_fields || 'date_of_birth'::text; END IF;
    IF coalesce(p_tags, ARRAY[]::text[]) IS DISTINCT FROM v_client.tags
        THEN v_fields := v_fields || 'tags'::text; END IF;
    IF coalesce(p_important_dates, '[]'::jsonb) IS DISTINCT FROM v_client.important_dates
        THEN v_fields := v_fields || 'important_dates'::text; END IF;
    IF nullif(btrim(p_notes), '') IS DISTINCT FROM v_client.notes
        THEN v_fields := v_fields || 'notes'::text; END IF;
    IF v_address IS DISTINCT FROM v_client.mailing_address_id
        THEN v_fields := v_fields || 'mailing_address'::text; END IF;

    IF cardinality(v_fields) = 0 THEN
        RETURN QUERY SELECT 'noop'::text, v_client.version, ARRAY[]::text[];
        RETURN;
    END IF;

    UPDATE public.client
       SET first_name = btrim(p_first_name),
           last_name = btrim(p_last_name),
           preferred_name = nullif(btrim(p_preferred_name), ''),
           email = btrim(p_email)::citext,
           phone = nullif(btrim(p_phone), ''),
           date_of_birth = p_date_of_birth,
           tags = coalesce(p_tags, ARRAY[]::text[]),
           important_dates = coalesce(p_important_dates, '[]'::jsonb),
           notes = nullif(btrim(p_notes), ''),
           mailing_address_id = v_address,
           updated_at = now(),
           version = v_client.version + 1
     WHERE id = v_client.id;

    RETURN QUERY SELECT 'changed'::text, v_client.version + 1, v_fields;
END;
$$;

COMMENT ON FUNCTION public.agent_update_client IS
    'Screen 3.3.10. Optimistic concurrency against client.version (Data-Model §20.4). '
    'Returns `duplicate_email` when the new address already belongs to another live client '
    'in the same book.';

-- ─────────────────────────────────────────────────────────────────────────────
-- §3.3.12 Archive / Restore
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.agent_set_client_archived(
    p_client_id        uuid,
    p_agent_id         uuid,
    p_archived         boolean,
    p_expected_version integer
)
RETURNS TABLE (
    outcome text,   -- 'archived' | 'restored' | 'noop' | 'stale'
    version integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_client public.client%ROWTYPE;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.agent a WHERE a.id = p_agent_id AND a.status <> 'archived'
    ) THEN
        RETURN;
    END IF;

    SELECT * INTO v_client
      FROM public.client c
     WHERE c.id = p_client_id
       AND c.agent_id = p_agent_id
       -- A tombstone cannot be archived OR restored: its fields live on its survivor now,
       -- and restoring one would put two records for the same person back on the roster.
       AND c.status <> 'merged_into'
     FOR UPDATE;

    IF NOT FOUND THEN
        RETURN;
    END IF;

    IF p_expected_version IS NOT NULL AND p_expected_version <> v_client.version THEN
        RETURN QUERY SELECT 'stale'::text, v_client.version;
        RETURN;
    END IF;

    IF (p_archived AND v_client.status = 'archived')
       OR (NOT p_archived AND v_client.status = 'active')
    THEN
        RETURN QUERY SELECT 'noop'::text, v_client.version;
        RETURN;
    END IF;

    -- BOTH COLUMNS MOVE TOGETHER, ALWAYS. `status` is outside the column grant to
    -- `authenticated` and `archived_at` is inside it, so a row where only one changed reads
    -- as archived through the accessor and active through a direct select. The roster
    -- filters on `status`; the detail header reads `archived_at`.
    UPDATE public.client
       SET status = CASE WHEN p_archived THEN 'archived'::client_status
                         ELSE 'active'::client_status END,
           archived_at = CASE WHEN p_archived THEN now() ELSE NULL END,
           updated_at = now(),
           version = v_client.version + 1
     WHERE id = v_client.id;

    RETURN QUERY SELECT
        CASE WHEN p_archived THEN 'archived' ELSE 'restored' END::text,
        v_client.version + 1;
END;
$$;

COMMENT ON FUNCTION public.agent_set_client_archived(uuid, uuid, boolean, integer) IS
    'Screen 3.3.12, both halves. One function because archive and restore are the same write '
    'with a boolean, and because `status` and `archived_at` must never move apart — one is '
    'outside the column grant and one is inside it. The archive REASON is not stored: '
    '`client` has no column for it, so it rides the audit_event metadata instead.';

-- ─────────────────────────────────────────────────────────────────────────────
-- §3.3.1 Bulk tag — the action behind the roster's checkbox column
-- ─────────────────────────────────────────────────────────────────────────────
--
-- ONE TAG PER CALL, ONE DIRECTION PER CALL. A list of tags, or a mixed add/remove, makes
-- partial success unreportable: "3 of 6 changed" is meaningless when six clients were each
-- offered four different edits. One tag in one direction has exactly one honest count.
--
-- NO EXPECTED VERSION, BUT THE VERSION STILL BUMPS — and the asymmetry is the point.
-- `agent_update_client` overwrites the whole row, so it MUST refuse a stale write. Adding a
-- tag is set-valued and idempotent: it cannot clobber a concurrent edit, so demanding
-- twenty-five expected versions would only make the operation fail for no gain. The bump is
-- still required in the other direction, because the EDIT FORM writes the whole `tags`
-- array — without it, an edit form opened before a bulk tag would silently undo it on save.
-- With it, that save comes back `stale` and the advisor reloads.
--
-- WHAT IS NOT RETURNED IS THE SECURITY PROPERTY. One row comes back per client actually
-- changed, and nothing at all for the rest — so a client belonging to another advisor and a
-- client that already carried the tag are indistinguishable in the answer. Reporting them
-- apart would confirm that an id exists, which is the probe the ownership CTE exists to
-- prevent everywhere else in this file.

CREATE OR REPLACE FUNCTION public.agent_bulk_tag_clients(
    p_client_ids uuid[],
    p_agent_id   uuid,
    p_tag        text,
    p_add        boolean
)
RETURNS TABLE (
    client_id uuid,
    version   integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_tag text := lower(btrim(coalesce(p_tag, '')));
BEGIN
    IF v_tag = '' THEN
        RETURN;
    END IF;

    IF p_client_ids IS NULL OR cardinality(p_client_ids) = 0 THEN
        RETURN;
    END IF;

    -- The roster pages at 25 and "select all" selects the page, so 100 is four times the
    -- largest honest request. A crafted one asking for the whole book in a single statement
    -- is refused loudly rather than served quietly.
    IF cardinality(p_client_ids) > 100 THEN
        RAISE EXCEPTION 'agent_bulk_tag_clients refuses more than 100 clients in one call';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.agent a WHERE a.id = p_agent_id AND a.status <> 'archived'
    ) THEN
        RETURN;
    END IF;

    RETURN QUERY
    WITH updated AS (
        UPDATE public.client c
           SET tags = CASE WHEN p_add THEN array_append(c.tags, v_tag)
                           ELSE array_remove(c.tags, v_tag) END,
               updated_at = now(),
               version = c.version + 1
         WHERE c.id = ANY (p_client_ids)
           AND c.agent_id = p_agent_id
           -- A tombstone's fields live on its survivor now; tagging one tags nothing anybody
           -- will ever read.
           AND c.status <> 'merged_into'
           -- The no-op arm. Adding a tag a client already has, or removing one they never
           -- had, changes nothing — and going through the UPDATE anyway would bump `version`
           -- and stale every open edit form for no reason.
           AND (CASE WHEN p_add THEN NOT (v_tag = ANY (c.tags))
                     ELSE v_tag = ANY (c.tags) END)
           -- 20 is `agent-client/index.ts`'s MAX_TAGS. A client already at the cap is
           -- skipped rather than pushed over it — it lands in the same silent "unchanged"
           -- bucket as the two cases above, which is why the UI reports a count of what
           -- moved instead of claiming every selected client was tagged.
           AND (NOT p_add OR cardinality(c.tags) < 20)
        RETURNING c.id, c.version
    )
    SELECT u.id, u.version FROM updated u;
END;
$$;

COMMENT ON FUNCTION public.agent_bulk_tag_clients(uuid[], uuid, text, boolean) IS
    'Screen 3.3.1''s bulk-tag action. One tag, one direction, one row returned per client '
    'actually changed — a client that is not this agent''s and a client that already carried '
    'the tag are deliberately indistinguishable in the answer. Bumps `version` without '
    'checking it: the write is idempotent so it cannot clobber, but the edit form overwrites '
    'the whole tags array and must be told the row moved.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Grants
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE f text;
BEGIN
    FOREACH f IN ARRAY ARRAY[
        'public.agent_upsert_client_address(uuid, uuid, text, text, text, text, text, char)',
        'public.agent_create_client(uuid, uuid, text, text, text, text, text, date, text[], jsonb, text, text, text, text, text, text, char)',
        'public.agent_update_client(uuid, uuid, text, text, text, text, text, date, text[], jsonb, text, text, text, text, text, text, char, integer)',
        'public.agent_set_client_archived(uuid, uuid, boolean, integer)',
        'public.agent_bulk_tag_clients(uuid[], uuid, text, boolean)'
    ]
    LOOP
        EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM public, anon, authenticated', f);
        EXECUTE format('GRANT  EXECUTE ON FUNCTION %s TO service_role', f);
    END LOOP;
END $$;

-- ── ASSERTIONS ───────────────────────────────────────────────────────────────────

DO $$
DECLARE
    names text[] := ARRAY[
        'agent_upsert_client_address', 'agent_create_client',
        'agent_update_client', 'agent_set_client_archived',
        'agent_bulk_tag_clients'
    ];
    found   integer;
    leaked  text;
    unpinned text;
BEGIN
    SELECT count(*) INTO found
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = ANY (names);

    IF found <> array_length(names, 1) THEN
        RAISE EXCEPTION '§3.3 write surface expected % functions, found %',
            array_length(names, 1), found;
    END IF;

    -- The one that matters most here. Every one of these takes `p_agent_id` as trusted
    -- input, so a grant to a client role is an act-as-any-agent primitive with no audit row.
    SELECT string_agg(p.proname, ', ') INTO leaked
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname = ANY (names)
       AND (has_function_privilege('authenticated', p.oid, 'EXECUTE')
            OR has_function_privilege('anon', p.oid, 'EXECUTE'));

    IF leaked IS NOT NULL THEN
        RAISE EXCEPTION
            '§3.3 write functions must be service_role only — a client-role grant on any of '
            'these makes it an act-as-any-agent primitive with no audit_event: %', leaked;
    END IF;

    SELECT string_agg(p.proname, ', ' ORDER BY p.proname) INTO unpinned
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      LEFT JOIN LATERAL (
            SELECT substr(cfg, length('search_path=') + 1) AS value
              FROM unnest(coalesce(p.proconfig, ARRAY[]::text[])) cfg
             WHERE cfg LIKE 'search\_path=%'
             LIMIT 1
           ) sp ON true
     WHERE n.nspname = 'public'
       AND p.proname = ANY (names)
       AND (
            sp.value IS NULL
            OR (
                 btrim(sp.value, ' "') <> ''
                 AND btrim(
                       (string_to_array(sp.value, ','))[
                           cardinality(string_to_array(sp.value, ','))],
                       ' "'
                     ) <> 'pg_temp'
               )
           );

    IF unpinned IS NOT NULL THEN
        RAISE EXCEPTION
            '§3.3 write functions must end their search_path with pg_temp: %', unpinned;
    END IF;
END $$;

COMMIT;
