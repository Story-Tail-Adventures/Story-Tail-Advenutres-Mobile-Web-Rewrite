-- §3.3.9 / §3.3.10 / §3.3.12's write path.
--
-- WHAT THIS FILE IS GUARDING. All five functions take `p_agent_id` as trusted input, so the
-- single most important assertion here is the cheapest one: that no client role can execute
-- any of them. Everything else is behaviour, and behaviour is exercised as the OWNER because
-- the Edge Function is their only real door.
--
-- THE PAIR THAT MUST NEVER DRIFT. `client.status` is OUTSIDE the column grant to
-- `authenticated` and `client.archived_at` is INSIDE it. A row where only one moved reads as
-- archived through the roster accessor (which filters on `status`) and active through the
-- detail header (which reads `archived_at`). `agent_set_client_archived` writes both in one
-- statement precisely so that cannot happen, and this file checks both after every call.
--
-- Run against a freshly reset local database:
--     supabase db reset
--     psql "$(supabase status -o json | jq -r .DB_URL)" -v ON_ERROR_STOP=1 \
--          -f supabase/tests/rls_agent_client_write.sql

\set ON_ERROR_STOP on

BEGIN;

\set gyasi  '''0195a2c0-1a00-7000-8000-000000000010'''
\set agent  '''0195a2c0-1a00-7000-8000-000000000001'''
\set newid  '''0195a2c0-1a00-7000-8000-000000000900'''

CREATE OR REPLACE FUNCTION pg_temp.assert(condition boolean, description text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    IF condition THEN RAISE NOTICE '  ok    %', description;
    ELSE RAISE EXCEPTION 'FAILED: %', description;
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.expect_denied(stmt text, description text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    EXECUTE stmt;
    RAISE EXCEPTION 'FAILED: % — statement succeeded, expected a privilege error', description;
EXCEPTION
    WHEN insufficient_privilege THEN RAISE NOTICE '  ok    %', description;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.become(account uuid)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    PERFORM set_config('role', 'authenticated', true);
    PERFORM set_config('request.jwt.claims',
        json_build_object('sub', account::text, 'role', 'authenticated')::text, true);
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. The cheapest assertion, and the one that matters most
-- ─────────────────────────────────────────────────────────────────────────────

SELECT pg_temp.become(:gyasi::uuid);

SELECT pg_temp.expect_denied(
    $$SELECT public.agent_create_client(
        '00000000-0000-0000-0000-000000000001'::uuid,
        '00000000-0000-0000-0000-000000000002'::uuid,
        'a','b',NULL,'x@example.com',NULL,NULL,NULL,NULL,NULL,
        NULL,NULL,NULL,NULL,NULL,NULL)$$,
    'even an AGENT cannot execute agent_create_client — service_role only');

SELECT pg_temp.expect_denied(
    $$SELECT public.agent_set_client_archived(
        '00000000-0000-0000-0000-000000000001'::uuid,
        '00000000-0000-0000-0000-000000000002'::uuid, true, 1)$$,
    'even an AGENT cannot execute agent_set_client_archived — service_role only');

SELECT pg_temp.expect_denied(
    $$SELECT public.agent_bulk_tag_clients(
        ARRAY['00000000-0000-0000-0000-000000000001'::uuid],
        '00000000-0000-0000-0000-000000000002'::uuid, 'vip', true)$$,
    'even an AGENT cannot execute agent_bulk_tag_clients — service_role only');

SELECT pg_temp.expect_denied(
    $$SELECT public.agent_upsert_client_address(
        '00000000-0000-0000-0000-000000000001'::uuid, NULL,
        'a',NULL,NULL,NULL,NULL,NULL)$$,
    'even an AGENT cannot execute the address helper directly');

-- Writes to `client` itself remain closed to every client role, unchanged by this section.
SELECT pg_temp.expect_denied(
    $$UPDATE public.client SET first_name = 'x'$$,
    'an agent still cannot UPDATE client through PostgREST');
SELECT pg_temp.expect_denied(
    $$INSERT INTO public.client (id, agent_id, first_name, last_name)
      VALUES (gen_random_uuid(), '0195a2c0-1a00-7000-8000-000000000001'::uuid, 'a', 'b')$$,
    'an agent still cannot INSERT a client through PostgREST');

RESET ROLE;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Create
-- ─────────────────────────────────────────────────────────────────────────────

SELECT pg_temp.assert(
    (SELECT outcome FROM public.agent_create_client(
        :agent::uuid, :newid::uuid, '  Noor  ', 'Haddad', NULL, ' noor.h@example.com ',
        '+1-555-0300', '1991-02-08', ARRAY['vip'],
        '[{"label":"Anniversary","date":"2020-06-12","recurring":true}]'::jsonb,
        'Met at the expo.', '88 Harbour Rd', 'Apt 2', 'Tampa', 'FL', '33602', 'US'))
    = 'created',
    'create writes a client');

SELECT pg_temp.assert(
    (SELECT first_name = 'Noor' AND email::text = 'noor.h@example.com'
       FROM public.client WHERE id = :newid::uuid),
    'the name and email are trimmed on the way in');

SELECT pg_temp.assert(
    (SELECT a.city = 'Tampa' AND a.line2 = 'Apt 2'
       FROM public.client c JOIN public.address a ON a.id = c.mailing_address_id
      WHERE c.id = :newid::uuid),
    'the address row is created and linked');

SELECT pg_temp.assert(
    (SELECT version = 1 AND status = 'active' AND archived_at IS NULL
       FROM public.client WHERE id = :newid::uuid),
    'a new client starts at version 1, active, with no archived_at');

-- A duplicate is what §3.3.11 Merge exists to clean up, so it is refused rather than made.
-- citext, so the case does not matter — and the caller is told WHICH record it collides with.
SELECT pg_temp.assert(
    (SELECT outcome = 'duplicate_email' AND client_id = :newid::uuid
       FROM public.agent_create_client(
        :agent::uuid, gen_random_uuid(), 'Other', 'Person', NULL, 'NOOR.H@EXAMPLE.COM',
        NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL)),
    'a duplicate email is refused case-insensitively, naming the existing record');

-- Required fields are refused rather than stored blank.
SELECT pg_temp.assert(
    NOT EXISTS (SELECT 1 FROM public.agent_create_client(
        :agent::uuid, gen_random_uuid(), '   ', 'Haddad', NULL, 'x@example.com',
        NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL)),
    'a whitespace-only first name is refused');

SELECT pg_temp.assert(
    NOT EXISTS (SELECT 1 FROM public.agent_create_client(
        '0195a2c0-1a00-7000-8000-0000000000ff'::uuid, gen_random_uuid(), 'A', 'B', NULL,
        'y@example.com', NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL)),
    'an agent id that is not an active advisor writes nothing');

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Update
-- ─────────────────────────────────────────────────────────────────────────────

SELECT pg_temp.assert(
    (SELECT outcome = 'noop' AND cardinality(changed_fields) = 0
       FROM public.agent_update_client(
        :newid::uuid, :agent::uuid, 'Noor', 'Haddad', NULL, 'noor.h@example.com',
        '+1-555-0300', '1991-02-08', ARRAY['vip'],
        '[{"label":"Anniversary","date":"2020-06-12","recurring":true}]'::jsonb,
        'Met at the expo.', '88 Harbour Rd', 'Apt 2', 'Tampa', 'FL', '33602', 'US', 1)),
    'an identical re-save is a noop with no version bump and no changed fields');

-- The audit row records the NAMES that moved, so this is the assertion that keeps it honest.
SELECT pg_temp.assert(
    (SELECT changed_fields @> ARRAY['last_name','tags']::text[]
        AND NOT (changed_fields @> ARRAY['phone']::text[])
       FROM public.agent_update_client(
        :newid::uuid, :agent::uuid, 'Noor', 'Haddad-Reyes', NULL, 'noor.h@example.com',
        '+1-555-0300', '1991-02-08', ARRAY['vip','repeat'],
        '[{"label":"Anniversary","date":"2020-06-12","recurring":true}]'::jsonb,
        'Met at the expo.', '88 Harbour Rd', 'Apt 2', 'Tampa', 'FL', '33602', 'US', 1)),
    'changed_fields names exactly what moved, and nothing that did not');

SELECT pg_temp.assert(
    (SELECT outcome = 'stale' FROM public.agent_update_client(
        :newid::uuid, :agent::uuid, 'Noor', 'Z', NULL, 'noor.h@example.com',
        NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL, 1)),
    'a stale expectedVersion is refused');

-- Clearing every address field UNLINKS rather than storing a row of nulls: "no address on
-- file" and "an address whose every field is blank" render the same and mean different things.
SELECT pg_temp.assert(
    (SELECT outcome FROM public.agent_update_client(
        :newid::uuid, :agent::uuid, 'Noor', 'Haddad-Reyes', NULL, 'noor.h@example.com',
        NULL, NULL, ARRAY['vip','repeat'],
        '[{"label":"Anniversary","date":"2020-06-12","recurring":true}]'::jsonb,
        'Met at the expo.', NULL, NULL, NULL, NULL, NULL, NULL, 2)) = 'changed',
    'clearing the address is a real change');

SELECT pg_temp.assert(
    (SELECT mailing_address_id IS NULL FROM public.client WHERE id = :newid::uuid),
    '... and it unlinks the address rather than storing blanks');

-- Changing an email TO one another live client already holds is the same duplicate by
-- another route.
SELECT pg_temp.assert(
    (SELECT outcome = 'duplicate_email' FROM public.agent_update_client(
        :newid::uuid, :agent::uuid, 'Noor', 'Haddad-Reyes', NULL,
        'jordan.hayes@example.com', NULL, NULL, NULL, NULL, NULL,
        NULL,NULL,NULL,NULL,NULL,NULL, 3)),
    'an edit cannot move an email onto another live client in the book');

SELECT pg_temp.assert(
    NOT EXISTS (SELECT 1 FROM public.agent_update_client(
        :newid::uuid, '0195a2c0-1a00-7000-8000-0000000000ff'::uuid, 'A', 'B', NULL,
        'noor.h@example.com', NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL, 3)),
    'another advisor cannot edit this advisor''s client');

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Archive and restore — one function, and the pair that must move together
-- ─────────────────────────────────────────────────────────────────────────────

SELECT pg_temp.assert(
    (SELECT outcome = 'archived' AND version = 4
       FROM public.agent_set_client_archived(:newid::uuid, :agent::uuid, true, 3)),
    'archive sets the outcome and bumps the version');

SELECT pg_temp.assert(
    (SELECT status = 'archived' AND archived_at IS NOT NULL
       FROM public.client WHERE id = :newid::uuid),
    'BOTH columns moved — status is outside the column grant, archived_at is inside it');

SELECT pg_temp.assert(
    (SELECT outcome = 'noop' FROM public.agent_set_client_archived(
        :newid::uuid, :agent::uuid, true, 4)),
    'archiving an already-archived client is a noop, not a second version bump');

SELECT pg_temp.assert(
    (SELECT outcome = 'restored' FROM public.agent_set_client_archived(
        :newid::uuid, :agent::uuid, false, 4)),
    'restore is the same function with the boolean flipped');

SELECT pg_temp.assert(
    (SELECT status = 'active' AND archived_at IS NULL
       FROM public.client WHERE id = :newid::uuid),
    '... and it clears BOTH columns, not just one');

SELECT pg_temp.assert(
    (SELECT outcome = 'stale' FROM public.agent_set_client_archived(
        :newid::uuid, :agent::uuid, true, 1)),
    'archive honours the optimistic lock too');

-- A merged tombstone can be neither archived nor restored: its fields live on its survivor
-- now, and restoring one would put two records for the same person back on the roster.
SELECT pg_temp.assert(
    NOT EXISTS (
        SELECT 1 FROM public.agent_set_client_archived(
            (SELECT id FROM public.client WHERE status = 'merged_into' LIMIT 1),
            :agent::uuid, false, NULL)),
    'a merged tombstone cannot be restored onto the roster');

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. The roster and the detail agree about what just happened
-- ─────────────────────────────────────────────────────────────────────────────

SELECT public.agent_set_client_archived(:newid::uuid, :agent::uuid, true, 5);
SELECT pg_temp.become(:gyasi::uuid);

SELECT pg_temp.assert(
    NOT EXISTS (
        SELECT 1 FROM public.agent_client_roster(
            ARRAY['active']::client_status[], NULL, 'Haddad-Reyes', 50, 0)),
    'an archived client leaves the active roster');

SELECT pg_temp.assert(
    EXISTS (
        SELECT 1 FROM public.agent_client_roster(
            ARRAY['archived']::client_status[], NULL, 'Haddad-Reyes', 50, 0)),
    '... and appears under the Archived filter');

SELECT pg_temp.assert(
    (SELECT archived_at IS NOT NULL FROM public.agent_client_overview(:newid::uuid)),
    '... and the detail header agrees, because both columns moved together');

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Bulk tag
-- ─────────────────────────────────────────────────────────────────────────────

RESET ROLE;

-- Undo section 5 so this section works against a live roster rather than an archived row.
SELECT public.agent_set_client_archived(:newid::uuid, :agent::uuid, false, NULL);

-- Two of this agent's clients, one already carrying 'vip' and one not.
CREATE TEMP TABLE bulk_targets AS
SELECT c.id, c.version, c.tags
  FROM public.client c
 WHERE c.agent_id = :agent::uuid AND c.status = 'active'
 ORDER BY c.id
 LIMIT 3;

SELECT pg_temp.assert(
    (SELECT count(*) FROM bulk_targets) = 3,
    'three of this agent''s clients are available to tag');

-- ── The count is what actually moved ──────────────────────────────────────

-- Give exactly one of them the tag first, so the bulk call has a genuine no-op to skip.
SELECT public.agent_bulk_tag_clients(
    ARRAY[(SELECT id FROM bulk_targets ORDER BY id LIMIT 1)], :agent::uuid, 'vip', true);

SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_bulk_tag_clients(
        (SELECT array_agg(id) FROM bulk_targets), :agent::uuid, 'vip', true)) = 2,
    'tagging three clients where one already had it reports two changed, not three');

SELECT pg_temp.assert(
    (SELECT bool_and('vip' = ANY (c.tags)) FROM public.client c
      WHERE c.id IN (SELECT id FROM bulk_targets)),
    '... and all three carry the tag afterwards');

-- THE TAG APPEARS ONCE. `client.tags` is a plain text[] with no unique constraint, so a
-- second add that was not skipped would produce {vip,vip} — which renders as two identical
-- chips and doubles the facet count beside them.
SELECT pg_temp.assert(
    (SELECT bool_and(cardinality(array_positions(c.tags, 'vip')) = 1) FROM public.client c
      WHERE c.id IN (SELECT id FROM bulk_targets)),
    '... exactly once each, never twice');

-- ── The version bump, and why it is not a version CHECK ───────────────────

SELECT pg_temp.assert(
    (SELECT bool_and(c.version > b.version) FROM public.client c
       JOIN bulk_targets b ON b.id = c.id),
    'every tagged client''s version moved, so an open edit form goes stale rather than '
    'silently overwriting the tag');

SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_bulk_tag_clients(
        (SELECT array_agg(id) FROM bulk_targets), :agent::uuid, 'vip', true)) = 0,
    'tagging again changes nothing — the call is idempotent');

-- The other half of that: a no-op must not bump the version either, or repeating a bulk tag
-- would stale every open form for a write that did not happen.
CREATE TEMP TABLE after_noop AS
SELECT c.id, c.version FROM public.client c WHERE c.id IN (SELECT id FROM bulk_targets);

SELECT public.agent_bulk_tag_clients(
    (SELECT array_agg(id) FROM bulk_targets), :agent::uuid, 'vip', true);

SELECT pg_temp.assert(
    (SELECT bool_and(c.version = a.version) FROM public.client c
       JOIN after_noop a ON a.id = c.id),
    '... and a no-op leaves the version alone');

-- ── Removal ───────────────────────────────────────────────────────────────

SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_bulk_tag_clients(
        (SELECT array_agg(id) FROM bulk_targets), :agent::uuid, 'vip', false)) = 3,
    'removing the tag reports all three');

SELECT pg_temp.assert(
    (SELECT bool_and(NOT ('vip' = ANY (c.tags))) FROM public.client c
      WHERE c.id IN (SELECT id FROM bulk_targets)),
    '... and none of them carries it afterwards');

SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_bulk_tag_clients(
        (SELECT array_agg(id) FROM bulk_targets), :agent::uuid, 'vip', false)) = 0,
    'removing a tag nobody has changes nothing');

-- ── Scoping: the thing this whole file exists for ─────────────────────────

-- THE ANSWER IS AN ABSENCE, NOT A REFUSAL. Another advisor's client id produces no row —
-- exactly like a client that already had the tag. Reporting the two apart would confirm the
-- id exists, which is the probe the ownership check exists to prevent.
SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_bulk_tag_clients(
        ARRAY[(SELECT c.id FROM public.client c WHERE c.agent_id <> :agent::uuid LIMIT 1)],
        :agent::uuid, 'vip', true)) = 0,
    'another advisor''s client cannot be tagged, and the refusal is indistinguishable from '
    'a no-op');

SELECT pg_temp.assert(
    NOT EXISTS (
        SELECT 1 FROM public.client c
         WHERE c.agent_id <> :agent::uuid AND 'vip' = ANY (c.tags)),
    '... and nothing outside this agent''s book grew a tag');

-- A mixed list tags the agent's OWN clients and silently drops the rest, rather than failing
-- the whole call. A request that fails wholesale on one bad id is a request the UI cannot
-- recover from, and there is nothing to recover: the other ids were legitimate.
SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_bulk_tag_clients(
        (SELECT array_agg(id) FROM bulk_targets)
            || (SELECT c.id FROM public.client c WHERE c.agent_id <> :agent::uuid LIMIT 1),
        :agent::uuid, 'gift', true)) = 3,
    'a list mixing this agent''s clients with someone else''s tags only their own');

-- A merged tombstone is skipped for the same reason it cannot be archived.
SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_bulk_tag_clients(
        ARRAY[(SELECT id FROM public.client WHERE status = 'merged_into' LIMIT 1)],
        :agent::uuid, 'vip', true)) = 0,
    'a merged tombstone cannot be tagged');

-- An archived agent cannot act at all, the same gate every other function in this file has.
SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_bulk_tag_clients(
        (SELECT array_agg(id) FROM bulk_targets),
        '00000000-0000-0000-0000-0000000000ff'::uuid, 'vip', true)) = 0,
    'an unknown agent id tags nothing');

-- ── Input handling ────────────────────────────────────────────────────────

SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_bulk_tag_clients(
        (SELECT array_agg(id) FROM bulk_targets), :agent::uuid, '   VIP  ', true)) = 3,
    'the tag is trimmed and lower-cased, so "  VIP " and "vip" are one tag');

SELECT pg_temp.assert(
    (SELECT bool_and('vip' = ANY (c.tags)) FROM public.client c
      WHERE c.id IN (SELECT id FROM bulk_targets)),
    '... stored lower-case');

SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_bulk_tag_clients(
        (SELECT array_agg(id) FROM bulk_targets), :agent::uuid, '   ', true)) = 0,
    'a blank tag is a no-op rather than an empty string in the array');

SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_bulk_tag_clients(
        ARRAY[]::uuid[], :agent::uuid, 'vip', true)) = 0,
    'an empty selection changes nothing');

SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_bulk_tag_clients(
        NULL, :agent::uuid, 'vip', true)) = 0,
    'a null selection changes nothing');

-- THE CAP IS A REFUSAL, NOT A TRUNCATION. Quietly tagging the first hundred of a longer list
-- would report a count the caller cannot reconcile with what they asked for.
DO $cap$
BEGIN
    PERFORM public.agent_bulk_tag_clients(
        (SELECT array_agg(gen_random_uuid()) FROM generate_series(1, 101)),
        '0195a2c0-1a00-7000-8000-000000000001'::uuid, 'vip', true);
    RAISE EXCEPTION 'FAILED: a 101-client request should have been refused';
EXCEPTION
    WHEN raise_exception THEN
        IF SQLERRM LIKE 'FAILED:%' THEN RAISE;
        END IF;
        RAISE NOTICE '  ok    a request for more than 100 clients is refused outright';
END $cap$;

-- ── The roster agrees ─────────────────────────────────────────────────────

SELECT pg_temp.become(:gyasi::uuid);

SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_client_roster(
        ARRAY['active']::client_status[], ARRAY['gift'], NULL, 50, 0)) = 3,
    'the bulk-tagged clients come back under that tag''s roster filter');

SELECT pg_temp.assert(
    (SELECT (f->>'count')::int
       FROM public.agent_client_roster_summary(),
            jsonb_array_elements(tag_facets) f
      WHERE f->>'tag' = 'gift') = 3,
    '... and the facet count beside the chip agrees');

RESET ROLE;

-- ── The cap on tags per client ────────────────────────────────────────────

-- 20 is the Edge Function's MAX_TAGS. A client already at it is SKIPPED, which is why the
-- UI reports what moved rather than claiming everything selected was tagged.
UPDATE public.client
   SET tags = (SELECT array_agg('t' || g) FROM generate_series(1, 20) g)
 WHERE id = (SELECT id FROM bulk_targets ORDER BY id LIMIT 1);

SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_bulk_tag_clients(
        (SELECT array_agg(id) FROM bulk_targets), :agent::uuid, 'overflow', true)) = 2,
    'a client already at 20 tags is skipped, and the other two still get theirs');

SELECT pg_temp.assert(
    (SELECT cardinality(c.tags) = 20 FROM public.client c
      WHERE c.id = (SELECT id FROM bulk_targets ORDER BY id LIMIT 1)),
    '... and is left at 20 rather than pushed to 21');

RESET ROLE;

ROLLBACK;
