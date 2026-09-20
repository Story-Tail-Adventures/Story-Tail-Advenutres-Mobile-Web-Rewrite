-- The one write on the agent side: public.agent_set_trip_status (Screen 3.2.2).
--
-- WHAT THIS FILE IS GUARDING. The function is service_role-only and takes `p_agent_id` as a
-- parameter, which means the grant is the ONLY thing standing between it and an
-- "act as any agent" primitive callable from a browser with no audit_event. Every other
-- ownership check in this repo is defence in depth over RLS; this one is load-bearing on its
-- own. The first section asserts it directly.
--
-- The second thing it guards is the atomic pair. A stage change is a trip update plus a
-- trip_status_history row, and losing the history row is unrecoverable — Data-Model §8.8
-- exists because trip.status_changed_at keeps only the latest transition. So every outcome is
-- asserted against BOTH tables: a change writes exactly one history row, and a no-op writes
-- none. A no-op that logged a transition would corrupt the cycle-time KPI just as surely as a
-- change that did not.
--
-- Run against a freshly reset local database:
--     supabase db reset
--     psql "$(supabase status -o json | jq -r .DB_URL)" -v ON_ERROR_STOP=1 \
--          -f supabase/tests/rls_agent_write.sql

\set ON_ERROR_STOP on

BEGIN;

\set agent  '''0195a2c0-1a00-7000-8000-000000000001'''
\set jordan '''0195a2c0-1a00-7000-8000-000000000011'''
\set gyasi  '''0195a2c0-1a00-7000-8000-000000000010'''
-- "Family Week in Turks" — a proposal, so it has somewhere to move to.
\set trip   '''0195a2c0-1a00-7000-8000-000000000042'''

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

CREATE OR REPLACE FUNCTION pg_temp.actor() RETURNS uuid LANGUAGE sql STABLE AS $$
    SELECT id FROM public.platform_user WHERE role = 'agent' LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION pg_temp.history_count(t uuid) RETURNS bigint LANGUAGE sql STABLE AS $$
    SELECT count(*) FROM public.trip_status_history WHERE trip_id = t;
$$;

-- ── The grant is the whole security model here ───────────────────────────────────

SELECT pg_temp.become(:gyasi::uuid);
SELECT pg_temp.expect_denied(
    format('SELECT * FROM public.agent_set_trip_status(%L, %L, %L, %L, 1)',
           :trip, :agent, '0195a2c0-1a00-7000-8000-000000000020', 'booked'),
    'even an AGENT cannot execute agent_set_trip_status directly — service_role only');
RESET ROLE;

SELECT pg_temp.become(:jordan::uuid);
SELECT pg_temp.expect_denied(
    format('SELECT * FROM public.agent_set_trip_status(%L, %L, %L, %L, 1)',
           :trip, :agent, '0195a2c0-1a00-7000-8000-000000000020', 'booked'),
    'a client cannot execute it either');
RESET ROLE;

SET ROLE anon;
SELECT pg_temp.expect_denied(
    format('SELECT * FROM public.agent_set_trip_status(%L, %L, %L, %L, 1)',
           :trip, :agent, '0195a2c0-1a00-7000-8000-000000000020', 'booked'),
    'and anon cannot');
RESET ROLE;

-- Asserted from the catalog too, because the three statements above would all still pass if
-- the function were dropped. This is the assertion that fails if somebody widens the grant.
SELECT pg_temp.assert(
    NOT has_function_privilege('authenticated',
        'public.agent_set_trip_status(uuid, uuid, uuid, trip_status, integer, text)', 'EXECUTE')
    AND NOT has_function_privilege('anon',
        'public.agent_set_trip_status(uuid, uuid, uuid, trip_status, integer, text)', 'EXECUTE'),
    'no client role holds EXECUTE — p_agent_id is trusted input and the grant is why that is safe');

-- ── Tenancy ──────────────────────────────────────────────────────────────────────

SELECT pg_temp.assert(
    NOT EXISTS (
        SELECT 1 FROM public.agent_set_trip_status(
            :trip::uuid, '0195a2c0-1a00-7000-8000-0000000000ee'::uuid,
            pg_temp.actor(), 'booked'::trip_status, 1)
    ),
    'another agent''s id returns ZERO ROWS — "no such trip" and "not yours" are one answer');

SELECT pg_temp.assert(
    (SELECT status FROM public.trip WHERE id = :trip) = 'proposal',
    'and it did not write anything on the way to saying no');

-- An archived trip is not a live trip. The read board filters them out, so a stage change
-- against one can only come from a stale client or a crafted request.
UPDATE public.trip SET archived_at = now() WHERE id = :trip;
SELECT pg_temp.assert(
    NOT EXISTS (
        SELECT 1 FROM public.agent_set_trip_status(
            :trip::uuid, :agent::uuid, pg_temp.actor(), 'booked'::trip_status, 1)
    ),
    'an archived trip cannot be moved');
UPDATE public.trip SET archived_at = NULL WHERE id = :trip;

-- ── Optimistic concurrency ───────────────────────────────────────────────────────

SELECT pg_temp.assert(
    (SELECT outcome FROM public.agent_set_trip_status(
        :trip::uuid, :agent::uuid, pg_temp.actor(), 'booked'::trip_status, 99)) = 'stale',
    'a version that no longer matches is `stale`, not a silent last-write-wins');
SELECT pg_temp.assert(
    (SELECT status FROM public.trip WHERE id = :trip) = 'proposal'
      AND pg_temp.history_count(:trip) = 0,
    'and a stale attempt writes neither the trip nor a history row');

-- ── No-op ────────────────────────────────────────────────────────────────────────

SELECT pg_temp.assert(
    (SELECT outcome FROM public.agent_set_trip_status(
        :trip::uuid, :agent::uuid, pg_temp.actor(), 'proposal'::trip_status, 1)) = 'noop',
    'asking for the stage it is already in is `noop`, not an error');
SELECT pg_temp.assert(
    pg_temp.history_count(:trip) = 0,
    'a no-op writes NO history row — a logged transition that never happened would corrupt '
    'the cycle-time KPI exactly as badly as a missing one');
SELECT pg_temp.assert(
    (SELECT version FROM public.trip WHERE id = :trip) = 1,
    'and does not burn a version');

-- ── The real thing ───────────────────────────────────────────────────────────────

SELECT pg_temp.assert(
    (SELECT outcome || ':' || version FROM public.agent_set_trip_status(
        :trip::uuid, :agent::uuid, pg_temp.actor(), 'booked'::trip_status, 1)) = 'changed:2',
    'a real transition reports `changed` and the version it bumped to');

SELECT pg_temp.assert(
    (SELECT status = 'booked' AND version = 2 AND status_changed_at > now() - interval '1 minute'
       FROM public.trip WHERE id = :trip),
    'the trip row moved, bumped its version, and stamped status_changed_at');

SELECT pg_temp.assert(
    pg_temp.history_count(:trip) = 1,
    'exactly one history row — the atomic pair the function exists for');
SELECT pg_temp.assert(
    (SELECT from_status = 'proposal' AND to_status = 'booked'
              AND changed_by_user_id = pg_temp.actor()
       FROM public.trip_status_history WHERE trip_id = :trip),
    'and it records where the trip came from, where it went, and who moved it');

-- The version the first write bumped to is now the only one that works. This is the two-tabs
-- case the whole mechanism is for: the losing tab still holds version 1.
SELECT pg_temp.assert(
    (SELECT outcome FROM public.agent_set_trip_status(
        :trip::uuid, :agent::uuid, pg_temp.actor(), 'in_progress'::trip_status, 1)) = 'stale',
    'a second write holding the OLD version is refused — two tabs cannot both win');
SELECT pg_temp.assert(
    pg_temp.history_count(:trip) = 1,
    'and the refused write left the history alone');

-- ── Cancellation carries its reason ──────────────────────────────────────────────
--
-- trip.cancellation_reason is inside the client column grant and Screen 2.2.10 renders it, so
-- a cancellation that cannot say why is a worse row than no cancellation. The Edge Function
-- refuses a reasonless cancel; this asserts the column actually lands.

SELECT pg_temp.assert(
    (SELECT outcome FROM public.agent_set_trip_status(
        :trip::uuid, :agent::uuid, pg_temp.actor(), 'cancelled'::trip_status, 2,
        'Client postponed to next spring')) = 'changed',
    'a trip can be cancelled');
SELECT pg_temp.assert(
    (SELECT cancellation_reason FROM public.trip WHERE id = :trip)
        = 'Client postponed to next spring',
    'and the reason reaches the column the traveler''s screen reads');
SELECT pg_temp.assert(
    pg_temp.history_count(:trip) = 2,
    'and the cancellation is a transition like any other');

-- A later non-cancel transition must not wipe the reason — the CASE in the UPDATE is what
-- keeps it, and an unconditional assignment would blank it on every subsequent move.
SELECT pg_temp.assert(
    (SELECT outcome FROM public.agent_set_trip_status(
        :trip::uuid, :agent::uuid, pg_temp.actor(), 'proposal'::trip_status, 3)) = 'changed',
    'a cancelled trip can be revived');
SELECT pg_temp.assert(
    (SELECT cancellation_reason FROM public.trip WHERE id = :trip) IS NOT NULL,
    'and reviving it does not blank the reason it was cancelled');

-- ── The history table is append-only in prose; check what is actually enforced ────
--
-- Recorded rather than asserted as a guarantee: nothing in the schema stops the SERVICE role
-- from updating or deleting a history row, and nothing needs to today because exactly one
-- function writes it. The assertion below states the reachable posture — no client role can
-- touch it at all — so that if that ever stops being true, this is where it shows.

SELECT pg_temp.become(:gyasi::uuid);
SELECT pg_temp.expect_denied(
    'SELECT count(*) FROM public.trip_status_history',
    'not even the agent can read trip_status_history directly');
SELECT pg_temp.expect_denied(
    format('UPDATE public.trip_status_history SET to_status = %L', 'completed'),
    'and cannot rewrite history');
RESET ROLE;

ROLLBACK;
