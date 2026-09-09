-- Assertions for the cruise catalog's access posture (Data-Model §24.10).
--
-- This one is the inverse of its three companions. rls_trip_graph.sql and friends assert
-- that a policy lets the right person through; there are NO policies on these nine tables,
-- so what has to be asserted is that NOBODY gets through — not anon, not an authenticated
-- client, not an authenticated agent.
--
-- That matters more here than the phrasing suggests, for three reasons:
--
--   * config.toml sets auto_expose_new_tables = true, so a table arrives world-readable
--     and stays that way unless its migration revokes. The REVOKE is the security control,
--     not a formality, and a migration that forgets it fails silently and looks fine.
--   * 20260907113546_revoke_write_grants.sql already ran. Its sweep cannot cover a table
--     added afterwards, so these nine are outside the guard that protects everything else.
--   * This catalog is the first thing in the schema that WILL want anonymous reads, when
--     cruise search ships. When someone adds that policy, this file is where they will find
--     out whether they widened exactly what they meant to — every assertion below should
--     then be revisited deliberately rather than deleted to make a build go green.
--
-- Run against a freshly reset local database:
--     supabase db reset
--     psql "$(supabase status -o json | jq -r .DB_URL)" -v ON_ERROR_STOP=1 \
--          -f supabase/tests/rls_cruise_catalog.sql
--
-- Any failed assertion raises and, with ON_ERROR_STOP=1, exits non-zero.

\set ON_ERROR_STOP on

BEGIN;

-- Seeded ids, from supabase/seed.sql.
\set gyasi_acct  '''0195a2c0-1a00-7000-8000-000000000010'''
\set jordan_acct '''0195a2c0-1a00-7000-8000-000000000011'''

-- Configuration rows, from migration 20260909001124.
\set scope_lines '''01a08376-dc00-7000-8000-000000000001'''
\set virgin_line '''01a08376-dc00-7000-8000-000000000100'''

CREATE OR REPLACE FUNCTION pg_temp.assert(condition boolean, description text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    IF condition THEN
        RAISE NOTICE '  ok    %', description;
    ELSE
        RAISE EXCEPTION 'FAILED: %', description;
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.become(account uuid)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    PERFORM set_config('role', 'authenticated', true);
    PERFORM set_config(
        'request.jwt.claims',
        json_build_object('sub', account::text, 'role', 'authenticated')::text,
        true
    );
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.become_anon()
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    PERFORM set_config('role', 'anon', true);
    PERFORM set_config('request.jwt.claims', NULL, true);
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.expect_denied(stmt text, description text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    EXECUTE stmt;
    RAISE EXCEPTION 'FAILED: % — statement succeeded, expected a privilege error', description;
EXCEPTION
    WHEN insufficient_privilege THEN
        RAISE NOTICE '  ok    %', description;
END;
$$;

-- The nine tables, in one place, so a tenth added later without a line here is obvious.
CREATE OR REPLACE FUNCTION pg_temp.cruise_tables()
RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
    SELECT ARRAY[
        'cruise_line', 'cruise_ship', 'cruise_port', 'cruise_sailing',
        'cruise_port_call', 'cruise_sailing_cabin_price',
        'cruise_sync_scope', 'cruise_sync_run', 'cruise_api_request'
    ];
$$;

-- ─────────────────────────────────────────────────────────────────────────────
\echo '== structure =='
-- ─────────────────────────────────────────────────────────────────────────────

-- Catches the tenth table added without a REVOKE, which is the whole failure mode here.
SELECT pg_temp.assert(
    (SELECT count(*) FROM pg_tables
      WHERE schemaname = 'public' AND tablename LIKE 'cruise%') = 9,
    'exactly nine cruise tables exist — a tenth needs its own line in this file'
);

SELECT pg_temp.assert(
    NOT EXISTS (
        SELECT 1 FROM pg_tables
         WHERE schemaname = 'public'
           AND tablename = ANY (pg_temp.cruise_tables())
           AND NOT rowsecurity
    ),
    'row level security is enabled on all nine'
);

SELECT pg_temp.assert(
    NOT EXISTS (
        SELECT 1 FROM pg_policies
         WHERE schemaname = 'public' AND tablename = ANY (pg_temp.cruise_tables())
    ),
    'no policies exist on any of them — service role only, by design'
);

-- The assertion that would have caught a missing REVOKE. Kept separate from the RLS check
-- because a table can have RLS on and still be readable through a leftover table grant.
SELECT pg_temp.assert(
    NOT EXISTS (
        SELECT 1 FROM information_schema.role_table_grants
         WHERE table_schema = 'public'
           AND grantee IN ('anon', 'authenticated')
           AND table_name = ANY (pg_temp.cruise_tables())
    ),
    'neither anon nor authenticated holds any grant on any cruise table'
);

-- ─────────────────────────────────────────────────────────────────────────────
\echo '== the sync wrote configuration the service role can see =='
-- ─────────────────────────────────────────────────────────────────────────────

SELECT pg_temp.assert(
    (SELECT count(*) FROM public.cruise_sync_scope WHERE enabled AND endpoint IN
        ('cruise_lines', 'filter_options', 'coverage')) = 3,
    'the three unpaginated reference scopes ship enabled'
);

SELECT pg_temp.assert(
    (SELECT count(*) FROM public.cruise_sync_scope WHERE enabled AND endpoint = 'cruises') = 1,
    'exactly one sailing scope ships enabled'
);

SELECT pg_temp.assert(
    NOT EXISTS (SELECT 1 FROM public.cruise_sync_scope
                 WHERE enabled AND endpoint IN ('ships', 'ports')),
    'the paginated ships/ports scopes stay disabled — /filter-options is 457x cheaper'
);

-- THE ASSERTION THAT MATTERS: a cost ceiling, not a row count.
--
-- The free tier is 100 requests a month and an overspent month cannot be bought back, so
-- what needs guarding is the monthly bill. Cadence is part of that now, so the sum is
-- weighted: a scope on a 28-day interval bills roughly once a month, one at 0 bills every
-- weekly run.
--
--   reference   3 x 1 request, monthly       =  3
--   sailings    1 x 4 requests, weekly x4.3  = 17
--                                             ---
--                                              20 of 100, leaving ~80 for quote fetches
--
-- 40 is the ceiling: comfortably above today's 20, comfortably below the 90 the sync's own
-- CRUISE_SYNC_MONTHLY_CEILING allows, so crossing it means redoing this arithmetic rather
-- than nudging a number.
SELECT pg_temp.assert(
    (SELECT sum(
        max_requests_per_run
        * CASE WHEN min_interval_days >= 28 THEN 1
               WHEN min_interval_days >= 7  THEN 4.3
               ELSE 4.3 END
     ) FROM public.cruise_sync_scope WHERE enabled) <= 40,
    'the enabled scopes bill at most ~40 requests a month once cadence is counted'
);

-- A slow-changing scope on every-run cadence is how the budget quietly drains: it is 4
-- requests a month against 17 for the same data.
SELECT pg_temp.assert(
    NOT EXISTS (SELECT 1 FROM public.cruise_sync_scope
                 WHERE enabled AND endpoint IN ('cruise_lines', 'filter_options', 'coverage')
                   AND min_interval_days < 28),
    'reference scopes run monthly, not on every weekly tick'
);

-- Destination-filtered, because a thin slice of everywhere is worth less than a complete
-- slice of somewhere when the ceiling is 1,000 rows a month against 245,020 sailings.
SELECT pg_temp.assert(
    NOT EXISTS (SELECT 1 FROM public.cruise_sync_scope
                 WHERE enabled AND endpoint = 'cruises' AND destination IS NULL),
    'every enabled sailing scope narrows to destinations the storefront sells'
);

-- Coverage before freshness. An empty catalogue walked with updated_at:desc chases churn
-- and never accumulates; see the `sort` column comment. A sailing scope that ships in
-- freshness mode would quietly sync almost nothing.
SELECT pg_temp.assert(
    NOT EXISTS (SELECT 1 FROM public.cruise_sync_scope
                 WHERE enabled AND endpoint = 'cruises' AND sort LIKE 'updated_at%'),
    'no enabled sailing scope walks in freshness mode while the catalogue is still filling'
);

-- A sailing scope with no window would page the provider's entire inventory — 245,020
-- rows — ten at a time, forever.
SELECT pg_temp.assert(
    NOT EXISTS (SELECT 1 FROM public.cruise_sync_scope
                 WHERE enabled AND endpoint = 'cruises' AND departure_within_days IS NULL),
    'every enabled sailing scope has a bounded departure window'
);

SELECT pg_temp.assert(
    (SELECT slug FROM public.cruise_line WHERE id = :virgin_line) = 'virgin-voyages'
    AND (SELECT provider FROM public.cruise_line WHERE id = :virgin_line) IS NULL
    AND (SELECT is_booked FROM public.cruise_line WHERE id = :virgin_line),
    'Virgin Voyages exists as a booked, curated-only line the provider cannot supply'
);

-- ─────────────────────────────────────────────────────────────────────────────
\echo '== anon is refused on every table =='
-- ─────────────────────────────────────────────────────────────────────────────

SELECT pg_temp.become_anon();

SELECT pg_temp.expect_denied(
    format('SELECT 1 FROM public.%I LIMIT 1', t),
    format('anon cannot read %s', t)
) FROM unnest(pg_temp.cruise_tables()) AS t;

-- Writes, not just reads. A sync that could be driven from the public anon key would let
-- anyone on the internet spend the monthly budget.
SELECT pg_temp.expect_denied(
    'INSERT INTO public.cruise_line (id, slug, name) '
    'VALUES (gen_random_uuid(), ''rogue-line'', ''Rogue'')',
    'anon cannot insert a cruise line'
);

SELECT pg_temp.expect_denied(
    'UPDATE public.cruise_sync_scope SET enabled = true',
    'anon cannot enable a sync scope'
);

-- The ledger is what makes the budget enforceable. If it were writable from outside, the
-- pre-flight count could be poisoned in either direction.
SELECT pg_temp.expect_denied(
    'DELETE FROM public.cruise_api_request',
    'anon cannot erase the quota ledger'
);

RESET ROLE;

-- ─────────────────────────────────────────────────────────────────────────────
\echo '== an authenticated client is refused too =='
-- ─────────────────────────────────────────────────────────────────────────────

-- This is the assertion that would fail first if someone reached for a
-- `TO authenticated` policy as a shortcut to get the search page working. The catalog is
-- public content, so the temptation is real, and §24.10 has the two candidate designs.
SELECT pg_temp.become(:jordan_acct);

SELECT pg_temp.expect_denied(
    format('SELECT 1 FROM public.%I LIMIT 1', t),
    format('an authenticated client cannot read %s', t)
) FROM unnest(pg_temp.cruise_tables()) AS t;

-- Internal pricing specifically. cruise_sailing.lead_price_cents and the cabin prices are
-- classified Internal in §24.4/§24.6 and granted to nobody.
SELECT pg_temp.expect_denied(
    'SELECT lead_price_cents, currency FROM public.cruise_sailing LIMIT 1',
    'an authenticated client cannot read a sailing lead-in fare'
);

SELECT pg_temp.expect_denied(
    'SELECT price_cents FROM public.cruise_sailing_cabin_price LIMIT 1',
    'an authenticated client cannot read cabin pricing'
);

RESET ROLE;

-- The agent account is not privileged here either: writes go through the Edge Function on
-- the service role so that rule 3's audit row cannot be bypassed, and reads for the agent
-- UI do not exist yet.
SELECT pg_temp.become(:gyasi_acct);

SELECT pg_temp.expect_denied(
    'SELECT 1 FROM public.cruise_sailing LIMIT 1',
    'the agent account cannot read cruise_sailing either — no policy means no one'
);

SELECT pg_temp.expect_denied(
    format('SELECT 1 FROM public.%I LIMIT 1', t),
    format('the agent account cannot read %s', t)
) FROM unnest(ARRAY['cruise_sync_scope', 'cruise_sync_run', 'cruise_api_request']) AS t;

RESET ROLE;

-- ─────────────────────────────────────────────────────────────────────────────
\echo '== the scheduler function is not callable by a client =='
-- ─────────────────────────────────────────────────────────────────────────────

-- cruise_sync_tick() is SECURITY DEFINER and reads a service-role key out of Vault. It
-- cannot leak the key, but anyone able to call it could spend the monthly budget at will.
SELECT pg_temp.assert(
    NOT has_function_privilege('anon', 'public.cruise_sync_tick()', 'EXECUTE')
    AND NOT has_function_privilege('authenticated', 'public.cruise_sync_tick()', 'EXECUTE'),
    'neither anon nor authenticated may execute cruise_sync_tick()'
);

\echo '== all cruise catalog assertions passed =='

ROLLBACK;
