-- Agent MFA on the read side: an agent session that is not aal2 reads nothing.
--
-- current_agent_id() is the one identity every agent_* accessor resolves the caller through,
-- so 20261023120000_agent_mfa_required.sql gates it and nothing else. This file proves the
-- gate holds end to end: the identity goes NULL below aal2, and accessors that return the
-- book at aal2 return none of it at aal1 or with no aal claim at all. The Edge Function
-- twin is requireAgentId's aal test in supabase/functions/_shared/agent_test.ts.
--
-- Run against a freshly reset local database:
--     supabase db reset
--     psql "$(supabase status -o json | jq -r .DB_URL)" -v ON_ERROR_STOP=1 \
--          -f supabase/tests/rls_agent_mfa.sql

\set ON_ERROR_STOP on

BEGIN;

\set gyasi '''0195a2c0-1a00-7000-8000-000000000010'''

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

-- `aal` NULL means "leave the claim out", the shape of a token minted before MFA existed.
CREATE OR REPLACE FUNCTION pg_temp.become(account uuid, aal text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    PERFORM set_config('role', 'authenticated', true);
    PERFORM set_config('request.jwt.claims',
        (jsonb_build_object('sub', account::text, 'role', 'authenticated')
         || CASE WHEN aal IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('aal', aal) END)::text,
        true);
END;
$$;

-- Seed sanity, as owner: the accessors below must have something to hide, or "returns 0 at
-- aal1" would pass on an empty book.
SELECT pg_temp.assert(
    (SELECT count(*) FROM public.trip
      WHERE agent_id = '0195a2c0-1a00-7000-8000-000000000001' AND archived_at IS NULL) > 0,
    'the seeded agent has trips to hide');
SELECT pg_temp.assert(
    (SELECT count(*) FROM public.client
      WHERE agent_id = '0195a2c0-1a00-7000-8000-000000000001' AND status = 'active') > 0,
    'the seeded agent has active clients to hide');

-- ── aal2: the book is there ─────────────────────────────────────────────────────

SELECT pg_temp.become(:gyasi::uuid, 'aal2');

SELECT pg_temp.assert(
    public.current_agent_id() = '0195a2c0-1a00-7000-8000-000000000001'::uuid,
    'aal2: current_agent_id() resolves the agent');
SELECT pg_temp.assert((SELECT count(*) FROM public.agent_trip_board()) > 0,
    'aal2: agent_trip_board() returns the book');
SELECT pg_temp.assert((SELECT count(*) FROM public.agent_client_roster()) > 0,
    'aal2: agent_client_roster() returns the book');
SELECT pg_temp.assert((SELECT count(*) FROM public.agent_kpis()) = 1,
    'aal2: agent_kpis() returns its row');

-- ── aal1: a password alone reads nothing ────────────────────────────────────────

SELECT pg_temp.become(:gyasi::uuid, 'aal1');

SELECT pg_temp.assert(public.current_agent_id() IS NULL,
    'aal1: current_agent_id() is NULL');
SELECT pg_temp.assert((SELECT count(*) FROM public.agent_trip_board()) = 0,
    'aal1: agent_trip_board() returns nothing');
SELECT pg_temp.assert((SELECT count(*) FROM public.agent_client_roster()) = 0,
    'aal1: agent_client_roster() returns nothing');
SELECT pg_temp.assert((SELECT count(*) FROM public.agent_inbox()) = 0,
    'aal1: agent_inbox() returns nothing');
SELECT pg_temp.assert((SELECT count(*) FROM public.agent_message_threads()) = 0,
    'aal1: agent_message_threads() returns nothing');
SELECT pg_temp.assert(
    NOT EXISTS (SELECT 1 FROM public.agent_kpis() k WHERE k.agent_id IS NOT NULL),
    'aal1: agent_kpis() names no agent');

-- ── no aal claim at all: treated as aal1 ────────────────────────────────────────

SELECT pg_temp.become(:gyasi::uuid, NULL);

SELECT pg_temp.assert(public.current_agent_id() IS NULL,
    'no aal claim: current_agent_id() is NULL');
SELECT pg_temp.assert((SELECT count(*) FROM public.agent_trip_board()) = 0,
    'no aal claim: agent_trip_board() returns nothing');

-- ── the gate reads the claim, not a lookalike ───────────────────────────────────

SELECT pg_temp.become(:gyasi::uuid, 'AAL2');
SELECT pg_temp.assert(public.current_agent_id() IS NULL,
    'a mis-cased aal is not aal2');

ROLLBACK;
