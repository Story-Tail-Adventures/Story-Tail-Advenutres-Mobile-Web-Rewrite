-- §3.4.1 Trip List — the roster reads and the bulk status write.
--
-- WHAT THIS FILE IS GUARDING. Two different things, and they want different tests.
-- The two READS are SECURITY DEFINER and granted to `authenticated`, so the question is
-- whether they can be made to return another advisor's trips. The WRITE takes `p_agent_id`
-- as trusted input, so the question is whether a client role can call it at all — plus the
-- one behaviour that separates it from §3.3's bulk tag: a status change OVERWRITES, so it
-- must refuse to move a trip somebody else already moved.
--
-- Run against a freshly reset local database:
--     supabase db reset
--     psql "$(supabase status -o json | jq -r .DB_URL)" -v ON_ERROR_STOP=1 \
--          -f supabase/tests/rls_agent_trips.sql

\set ON_ERROR_STOP on

BEGIN;

\set gyasi  '''0195a2c0-1a00-7000-8000-000000000010'''
\set agent  '''0195a2c0-1a00-7000-8000-000000000001'''

-- THE TWO PLATFORM_USER IDS. `:gyasi` above is the AUTH account id — what a JWT's `sub`
-- carries and what `become()` sets. `trip_status_history.changed_by_user_id` points at
-- `platform_user.id`, which is a different uuid entirely. Mixing them up gets a foreign-key
-- violation here, and silently matches nothing in app code that compares them.
CREATE OR REPLACE FUNCTION pg_temp.actor() RETURNS uuid LANGUAGE sql STABLE AS $$
    SELECT pu.id FROM public.platform_user pu
     WHERE pu.account_id = '0195a2c0-1a00-7000-8000-000000000010'::uuid;
$$;

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
-- 0. Expectations, captured as the OWNER
-- ─────────────────────────────────────────────────────────────────────────────
--
-- `trip` has RLS and the agent role holds no policy on it. A test that builds its own
-- expectation from a direct read, AFTER becoming the agent, reads zero rows and then
-- compares two numbers that are both wrong — which passes. rls_agent_clients.sql recorded
-- this trap first; it is the same one here.

CREATE TEMP TABLE expected AS
SELECT
    count(*) FILTER (WHERE t.archived_at IS NULL)     AS live_trips,
    count(*) FILTER (WHERE t.archived_at IS NOT NULL) AS archived_trips
  FROM public.trip t
 WHERE t.agent_id = :agent::uuid;

GRANT SELECT ON expected TO authenticated;

SELECT pg_temp.assert((SELECT live_trips FROM expected) > 0,
    'the seed gives this agent trips to list');

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. The write is service_role only
-- ─────────────────────────────────────────────────────────────────────────────

SELECT pg_temp.become(:gyasi::uuid);

SELECT pg_temp.expect_denied(
    $$SELECT public.agent_bulk_set_trip_status(
        ARRAY['00000000-0000-0000-0000-000000000001'::uuid],
        ARRAY['proposal']::trip_status[],
        '00000000-0000-0000-0000-000000000002'::uuid,
        '00000000-0000-0000-0000-000000000003'::uuid,
        'booked')$$,
    'even an AGENT cannot execute agent_bulk_set_trip_status — service_role only');

-- Writes to `trip` itself remain closed to every client role.
SELECT pg_temp.expect_denied(
    $$UPDATE public.trip SET status = 'booked'$$,
    'an agent still cannot UPDATE trip through PostgREST');

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. The roster reads only this agent's book
-- ─────────────────────────────────────────────────────────────────────────────

SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_trip_roster(NULL, NULL, NULL, 500, 0))
    = (SELECT live_trips FROM expected),
    'p_status = NULL returns every non-archived trip this agent owns, and only those');

-- Asserted by COUNT rather than by joining `public.trip`, which this role cannot read: if
-- the accessor leaked another advisor's trips the count would exceed the owner's tally.
SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_trip_roster(NULL, NULL, NULL, 500, 0))
    <= (SELECT live_trips FROM expected),
    'no row belongs to another advisor');

-- ARCHIVED IS NOT A FILTER, IT IS AN EXCLUSION. §3.4.16 archives a trip to take it off the
-- working surfaces; a status the caller could ask for would undo that.
SELECT pg_temp.assert(
    (SELECT archived_trips FROM expected) > 0,
    'the seed carries an archived trip, so the next assertion can fail');

SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_trip_roster(NULL, NULL, NULL, 500, 0))
    = (SELECT live_trips FROM expected),
    'an archived trip never appears, whatever statuses are asked for');

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. The chips the prototype forgot
-- ─────────────────────────────────────────────────────────────────────────────

-- THE REASON THESE EXIST. The design's chip row draws four statuses and `trip_status` has
-- six. On the seed that is 13 completed trips out of 26 — half the book unreachable from
-- the screen called "Trips". Settled 2026-09-27: both chips ship.
SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_trip_roster(
        ARRAY['completed']::trip_status[], NULL, NULL, 500, 0)) > 0,
    'the Completed chip returns rows rather than an empty list');

SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_trip_roster(
        ARRAY['cancelled']::trip_status[], NULL, NULL, 500, 0)) > 0,
    'the Cancelled chip returns rows too');

-- The DEFAULT is still the four live ones, so the screen opens on work in progress.
SELECT pg_temp.assert(
    NOT EXISTS (
        SELECT 1 FROM public.agent_trip_roster() r
         WHERE r.status IN ('completed', 'cancelled')),
    'the default page shows neither completed nor cancelled');

SELECT pg_temp.assert(
    (SELECT inquiry_count + proposal_count + booked_count + in_progress_count
            + completed_count + cancelled_count
       FROM public.agent_trip_roster_summary())
    = (SELECT total_count FROM public.agent_trip_roster_summary()),
    'the six chip counts add up to the total — no status falls between them');

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Paging, search and the window count
-- ─────────────────────────────────────────────────────────────────────────────

SELECT pg_temp.assert(
    (SELECT max(total_count) FROM public.agent_trip_roster(NULL, NULL, NULL, 2, 0))
    = (SELECT count(*)::integer FROM public.agent_trip_roster(NULL, NULL, NULL, 500, 0)),
    'total_count reports the whole result, not the page — the paginator depends on it');

SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_trip_roster(NULL, NULL, NULL, 2, 0)) = 2,
    'p_limit bounds the page');

SELECT pg_temp.assert(
    NOT EXISTS (
        SELECT r.trip_id FROM public.agent_trip_roster(NULL, NULL, NULL, 2, 0) r
        INTERSECT
        SELECT r2.trip_id FROM public.agent_trip_roster(NULL, NULL, NULL, 2, 2) r2),
    'page 2 shares no row with page 1 — the ORDER BY carries a tiebreaker');

-- Search spans the title, the destinations AND the client's name, because all three are
-- things an advisor types looking for "the Cabo one".
SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_trip_roster(NULL, NULL, 'cabo', 500, 0)) > 0,
    'search matches a trip title');

SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_trip_roster(NULL, NULL, 'Maya', 500, 0)) > 0,
    'search matches the client name, which is not on the trip row at all');

SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_trip_roster(NULL, NULL, '   ', 500, 0))
    = (SELECT count(*) FROM public.agent_trip_roster(NULL, NULL, NULL, 500, 0)),
    'a whitespace-only search is no search, not a search for nothing');

-- ─────────────────────────────────────────────────────────────────────────────
-- 4b. §3.4.3 Create
-- ─────────────────────────────────────────────────────────────────────────────

SELECT pg_temp.expect_denied(
    $$SELECT public.agent_create_trip(
        '00000000-0000-0000-0000-000000000001'::uuid,
        '00000000-0000-0000-0000-000000000002'::uuid,
        '00000000-0000-0000-0000-000000000003'::uuid,
        'x', 'custom'::trip_type, 1)$$,
    'even an AGENT cannot execute agent_create_trip — service_role only');

RESET ROLE;

-- A TRIP IS BORN IN `inquiry`, ALWAYS. Every other stage is a transition that owes a
-- trip_status_history row naming what it moved from; a trip created straight into `booked`
-- would be a booking with no record of having been proposed.
-- Created in its own STATEMENT, then asserted. A function's INSERT is not visible to
-- another scan inside the same statement, so folding the call into the WHERE of a SELECT
-- over `trip` reads the snapshot from before the row existed — and the assertion fails for
-- a reason that has nothing to do with what it is testing.
CREATE TEMP TABLE made AS
SELECT * FROM public.agent_create_trip(
    :agent::uuid, gen_random_uuid(),
    (SELECT c.id FROM public.client c WHERE c.agent_id = :agent::uuid LIMIT 1),
    'Tobago, a first look', 'custom'::trip_type, 2);

SELECT pg_temp.assert((SELECT outcome FROM made) = 'created',
    'the create reports success');

SELECT pg_temp.assert(
    (SELECT t.status FROM public.trip t WHERE t.id = (SELECT trip_id FROM made)) = 'inquiry',
    'a created trip starts in inquiry, and the caller is not offered a choice');

SELECT pg_temp.assert(
    (SELECT t.traveler_count FROM public.trip t WHERE t.id = (SELECT trip_id FROM made)) = 2,
    '... and keeps the traveler count it was given');

SELECT pg_temp.assert(
    NOT EXISTS (
        SELECT 1 FROM public.trip_status_history h
          JOIN public.trip t ON t.id = h.trip_id
         WHERE t.title = 'Tobago, a first look'),
    '... and writes no history row, because nothing transitioned');

-- ANOTHER ADVISOR'S CLIENT IS `no_client`, NOT AN EXCEPTION. The picker searches the
-- advisor's own book, so reaching this means a typed or stale id — and it is the same
-- answer as "no such client", so an id cannot be probed for.
SELECT pg_temp.assert(
    (SELECT outcome FROM public.agent_create_trip(
        :agent::uuid, gen_random_uuid(),
        (SELECT c.id FROM public.client c WHERE c.agent_id <> :agent::uuid LIMIT 1),
        'Not mine', 'custom'::trip_type, 1)) = 'no_client',
    'another advisor''s client cannot be given a trip, and says so rather than raising');

SELECT pg_temp.assert(
    NOT EXISTS (SELECT 1 FROM public.trip WHERE title = 'Not mine'),
    '... and no row was written');

SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_create_trip(
        '00000000-0000-0000-0000-0000000000ff'::uuid, gen_random_uuid(),
        (SELECT c.id FROM public.client c WHERE c.agent_id = :agent::uuid LIMIT 1),
        'By a stranger', 'custom'::trip_type, 1)) = 0,
    'an unknown agent id creates nothing');

-- `trip.title` is NOT NULL, and a generated "Untitled trip" would make a list of five of
-- them — worse than a form that asked.
DO $blank$
BEGIN
    PERFORM public.agent_create_trip(
        '0195a2c0-1a00-7000-8000-000000000001'::uuid, gen_random_uuid(),
        (SELECT c.id FROM public.client c
          WHERE c.agent_id = '0195a2c0-1a00-7000-8000-000000000001'::uuid LIMIT 1),
        '   ', 'custom'::trip_type, 1);
    RAISE EXCEPTION 'FAILED: a blank title should have been refused';
EXCEPTION
    WHEN raise_exception THEN
        IF SQLERRM LIKE 'FAILED:%' THEN RAISE; END IF;
        RAISE NOTICE '  ok    a blank title is refused rather than invented';
END $blank$;

-- The new trip shows up on the screen that lists them.
SELECT pg_temp.become(:gyasi::uuid);

SELECT pg_temp.assert(
    EXISTS (
        SELECT 1 FROM public.agent_trip_roster(NULL, NULL, 'Tobago', 50, 0)),
    'the created trip is on the roster, and findable by search');

RESET ROLE;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Bulk status change
-- ─────────────────────────────────────────────────────────────────────────────

RESET ROLE;

CREATE TEMP TABLE targets AS
SELECT t.id, t.status, t.version
  FROM public.trip t
 WHERE t.agent_id = :agent::uuid AND t.archived_at IS NULL AND t.status = 'booked'
 ORDER BY t.id
 LIMIT 3;

SELECT pg_temp.assert((SELECT count(*) FROM targets) = 3,
    'three booked trips are available to move');

-- ── The guard that makes this different from §3.3's bulk tag ──────────────

-- A trip whose status has MOVED since the page rendered is skipped, not overwritten. This
-- is the whole reason the function takes a from-status per trip.
SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_bulk_set_trip_status(
        (SELECT array_agg(id) FROM targets),
        (SELECT array_agg('proposal'::trip_status) FROM targets),  -- wrong: they are booked
        :agent::uuid, pg_temp.actor(), 'in_progress')) = 0,
    'a stale from-status moves nothing — the overwrite is refused, not applied');

SELECT pg_temp.assert(
    (SELECT bool_and(t.status = 'booked') FROM public.trip t
      WHERE t.id IN (SELECT id FROM targets)),
    '... and the rows are untouched');

-- With the status the screen actually saw, all three move.
SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_bulk_set_trip_status(
        (SELECT array_agg(id) FROM targets),
        (SELECT array_agg(status) FROM targets),
        :agent::uuid, pg_temp.actor(), 'in_progress')) = 3,
    'the correct from-status moves all three');

SELECT pg_temp.assert(
    (SELECT bool_and(t.status = 'in_progress') FROM public.trip t
      WHERE t.id IN (SELECT id FROM targets)),
    '... and they are in the new status');

SELECT pg_temp.assert(
    (SELECT bool_and(t.version > g.version) FROM public.trip t
       JOIN targets g ON g.id = t.id),
    '... every version climbed, so an open detail tab goes stale rather than clobbering');

-- ── One history row per move, and none for a non-move ─────────────────────

SELECT pg_temp.assert(
    (SELECT count(*) FROM public.trip_status_history h
      WHERE h.trip_id IN (SELECT id FROM targets)
        AND h.to_status = 'in_progress'
        AND h.from_status = 'booked'
        AND h.changed_by_user_id = pg_temp.actor()) = 3,
    'three history rows, each naming the transition that actually happened');

-- Repeating the call is a no-op: the trips are already there.
SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_bulk_set_trip_status(
        (SELECT array_agg(id) FROM targets),
        (SELECT array_agg('in_progress'::trip_status) FROM targets),
        :agent::uuid, pg_temp.actor(), 'in_progress')) = 0,
    'asking for the status they already hold changes nothing');

SELECT pg_temp.assert(
    (SELECT count(*) FROM public.trip_status_history h
      WHERE h.trip_id IN (SELECT id FROM targets) AND h.to_status = 'in_progress') = 3,
    '... and writes no second history row claiming a transition that never happened');

-- ── Scoping ───────────────────────────────────────────────────────────────

-- Another advisor's trip produces no row — indistinguishable from a stale from-status, so
-- the answer confirms nothing about whether the id exists.
SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_bulk_set_trip_status(
        ARRAY[(SELECT t.id FROM public.trip t WHERE t.agent_id <> :agent::uuid LIMIT 1)],
        ARRAY[(SELECT t.status FROM public.trip t WHERE t.agent_id <> :agent::uuid LIMIT 1)],
        :agent::uuid, pg_temp.actor(), 'booked')) = 0,
    'another advisor''s trip cannot be moved, and the refusal looks like a no-op');

SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_bulk_set_trip_status(
        (SELECT array_agg(id) FROM targets),
        (SELECT array_agg(status) FROM targets),
        '00000000-0000-0000-0000-0000000000ff'::uuid, pg_temp.actor(), 'booked')) = 0,
    'an unknown agent id moves nothing');

-- ── The refusals ──────────────────────────────────────────────────────────

-- CANCELLED IS NOT A BULK TARGET. §3.4.16 is a whole screen: an impact list and a mandatory
-- reason. Twenty trips cancelled from a checkbox column with neither is a different action.
DO $cancel$
BEGIN
    PERFORM public.agent_bulk_set_trip_status(
        ARRAY[gen_random_uuid()], ARRAY['booked']::trip_status[],
        '0195a2c0-1a00-7000-8000-000000000001'::uuid,
        pg_temp.actor(), 'cancelled');
    RAISE EXCEPTION 'FAILED: cancelled should have been refused as a bulk target';
EXCEPTION
    WHEN raise_exception THEN
        IF SQLERRM LIKE 'FAILED:%' THEN RAISE; END IF;
        RAISE NOTICE '  ok    `cancelled` is refused as a bulk target — §3.4.16 owns it';
END $cancel$;

-- Mismatched array lengths are a caller bug that would otherwise zip short and move a
-- subset, silently.
DO $zip$
BEGIN
    PERFORM public.agent_bulk_set_trip_status(
        ARRAY[gen_random_uuid(), gen_random_uuid()], ARRAY['booked']::trip_status[],
        '0195a2c0-1a00-7000-8000-000000000001'::uuid,
        pg_temp.actor(), 'proposal');
    RAISE EXCEPTION 'FAILED: mismatched array lengths should have been refused';
EXCEPTION
    WHEN raise_exception THEN
        IF SQLERRM LIKE 'FAILED:%' THEN RAISE; END IF;
        RAISE NOTICE '  ok    one expected status per trip id, or the call is refused';
END $zip$;

DO $cap$
BEGIN
    PERFORM public.agent_bulk_set_trip_status(
        (SELECT array_agg(gen_random_uuid()) FROM generate_series(1, 101)),
        (SELECT array_agg('booked'::trip_status) FROM generate_series(1, 101)),
        '0195a2c0-1a00-7000-8000-000000000001'::uuid,
        pg_temp.actor(), 'proposal');
    RAISE EXCEPTION 'FAILED: a 101-trip request should have been refused';
EXCEPTION
    WHEN raise_exception THEN
        IF SQLERRM LIKE 'FAILED:%' THEN RAISE; END IF;
        RAISE NOTICE '  ok    a request for more than 100 trips is refused outright';
END $cap$;

SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_bulk_set_trip_status(
        ARRAY[]::uuid[], ARRAY[]::trip_status[],
        :agent::uuid, pg_temp.actor(), 'booked')) = 0,
    'an empty selection changes nothing');

-- ── The roster agrees with what just happened ─────────────────────────────

SELECT pg_temp.become(:gyasi::uuid);

SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_trip_roster(
        ARRAY['in_progress']::trip_status[], NULL, NULL, 500, 0)) >= 3,
    'the moved trips come back under the In progress chip');

SELECT pg_temp.assert(
    (SELECT in_progress_count FROM public.agent_trip_roster_summary()) >= 3,
    '... and the chip count beside it agrees');

RESET ROLE;

ROLLBACK;
