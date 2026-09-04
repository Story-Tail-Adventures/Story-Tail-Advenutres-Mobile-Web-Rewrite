-- RLS assertions for the auth_bridge policies.
--
-- The `rls-policy` skill's step 5 exists because a policy that passes the happy path and
-- leaks to another user looks identical to a working one until you execute it as that
-- other user. This file is that execution, committed so it runs on every PR rather than
-- living in someone's shell history.
--
-- Run against a freshly reset local database:
--     supabase db reset
--     psql "$(supabase status -o json | jq -r .DB_URL)" -v ON_ERROR_STOP=1 \
--          -f supabase/tests/rls_auth_bridge.sql
--
-- Any failed assertion raises and, with ON_ERROR_STOP=1, exits non-zero.

\set ON_ERROR_STOP on

BEGIN;

-- Seeded ids, from supabase/seed.sql.
\set gyasi  '''0195a2c0-1a00-7000-8000-000000000010'''
\set jordan '''0195a2c0-1a00-7000-8000-000000000011'''
\set sam    '''0195a2c0-1a00-7000-8000-000000000012'''

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

-- Impersonate a signed-in user the way PostgREST does.
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

-- ── A client sees exactly themselves ────────────────────────────────────────────
SELECT pg_temp.become(:jordan);

SELECT pg_temp.assert(
    (SELECT count(*) FROM public.account) = 1,
    'client sees exactly one account row');
SELECT pg_temp.assert(
    (SELECT email FROM public.account) = 'jordan.hayes@example.com',
    'client sees their OWN account, not someone else''s');
SELECT pg_temp.assert(
    (SELECT count(*) FROM public.platform_user) = 1,
    'client sees exactly one platform_user row');
SELECT pg_temp.assert(
    (SELECT first_name FROM public.client) = 'Jordan',
    'client sees their own client row');
-- Was "client sees no trips yet (no policy — full RLS pass pending)", which asserted the
-- absence of a policy rather than a rule. 20260904140753 added `trip_self_select` because
-- Screen 2.1.13 needs it; the scoping assertions now live in rls_onboarding.sql, and what
-- belongs here is that the bridge hands the client the right rows.
SELECT pg_temp.assert(
    (SELECT count(*) FROM public.trip) >= 1,
    'client sees their own trips through the auth bridge');
SELECT pg_temp.assert(
    (SELECT count(*) FROM public.payment_card) = 0,
    'client sees no payment_card rows (rule 4)');

RESET ROLE;

-- ── A different client sees only themselves ────────────────────────────────────
SELECT pg_temp.become(:sam);

SELECT pg_temp.assert(
    (SELECT email FROM public.account) = 'sam.rivera@example.com',
    'second client sees their own account, not the first client''s');
SELECT pg_temp.assert(
    (SELECT count(*) FROM public.client) = 1,
    'second client cannot see the other client''s row');

RESET ROLE;

-- ── The agent ──────────────────────────────────────────────────────────────────
SELECT pg_temp.become(:gyasi);

SELECT pg_temp.assert(
    (SELECT email FROM public.account) = 'gyasi@example.com',
    'agent sees their own account');
SELECT pg_temp.assert(
    (SELECT role FROM public.platform_user)::text = 'agent',
    'agent resolves to the agent role');
-- Documented scope limit, not a bug: client_self_select keys on platform_user.client_id,
-- which is NULL for an agent. The agent's book of business needs the full RLS pass.
SELECT pg_temp.assert(
    (SELECT count(*) FROM public.client) = 0,
    'agent sees no clients yet (book-of-business policies still to come)');

RESET ROLE;

-- ── An unrecognised subject ────────────────────────────────────────────────────
SELECT pg_temp.become('00000000-0000-0000-0000-0000000000aa');

SELECT pg_temp.assert(
    (SELECT count(*) FROM public.account) = 0,
    'unknown subject sees nothing');

RESET ROLE;

-- ── Anonymous ──────────────────────────────────────────────────────────────────
SET LOCAL ROLE anon;

SELECT pg_temp.assert(
    (SELECT count(*) FROM public.account) = 0,
    'anon sees no accounts');
SELECT pg_temp.assert(
    (SELECT count(*) FROM public.client) = 0,
    'anon sees no clients');

RESET ROLE;

ROLLBACK;
