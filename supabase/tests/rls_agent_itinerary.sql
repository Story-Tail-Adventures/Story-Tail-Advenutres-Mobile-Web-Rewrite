-- §3.4.14 Itinerary Editor — the writes, and the generator's safety property.
--
-- WHAT THIS FILE IS GUARDING. Two different things.
--
-- The WRITES take `p_agent_id` as trusted input, so the question is whether a client role
-- can call them at all, and whether an advisor can reach another advisor's itinerary — or
-- reach their OWN itinerary's rows through a different trip they happen to own.
--
-- The GENERATOR's question is different and more important: can it destroy work. An
-- advisor who rewrote "AA 1413 · MIA → MBJ" as "Your flight to paradise" has done the thing
-- this screen exists for, and a generator that overwrites it has destroyed the feature
-- rather than a row. Every assertion in section 4 is about that.
--
-- Run against a freshly reset local database:
--     supabase db reset
--     psql "$(supabase status -o json | jq -r .DB_URL)" -v ON_ERROR_STOP=1 \
--          -f supabase/tests/rls_agent_itinerary.sql

\set ON_ERROR_STOP on

BEGIN;

\set gyasi  '''0195a2c0-1a00-7000-8000-000000000010'''
\set jordan '''0195a2c0-1a00-7000-8000-000000000011'''
\set agent  '''0195a2c0-1a00-7000-8000-000000000001'''
\set trip   '''0195a2c0-1a00-7000-8000-000000000040'''
\set other  '''0195a2c0-1a00-7000-8000-000000000044'''

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

CREATE OR REPLACE FUNCTION pg_temp.counts(t uuid)
RETURNS TABLE (days bigint, acts bigint) LANGUAGE sql STABLE AS $$
    SELECT (SELECT count(*) FROM public.itinerary_day d
              JOIN public.itinerary i ON i.id = d.itinerary_id WHERE i.trip_id = t),
           (SELECT count(*) FROM public.itinerary_activity a
              JOIN public.itinerary_day d ON d.id = a.itinerary_day_id
              JOIN public.itinerary i ON i.id = d.itinerary_id WHERE i.trip_id = t);
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Every write is service_role only
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Each takes `p_agent_id` as trusted input. A grant to a client role — even to the advisor
-- themselves — would be an act-as-any-advisor primitive with no `audit_event` behind it,
-- because the Edge Function is the only thing that writes one.

SELECT pg_temp.become(:gyasi::uuid);

SELECT pg_temp.expect_denied(
    'SELECT * FROM public.agent_upsert_itinerary_day(NULL, NULL, NULL, NULL)',
    'agent_upsert_itinerary_day is service_role only');
SELECT pg_temp.expect_denied(
    'SELECT * FROM public.agent_upsert_itinerary_activity(NULL, NULL, NULL, NULL, NULL)',
    'agent_upsert_itinerary_activity is service_role only');
SELECT pg_temp.expect_denied(
    'SELECT * FROM public.agent_delete_itinerary_activity(NULL, NULL, NULL)',
    'agent_delete_itinerary_activity is service_role only');
SELECT pg_temp.expect_denied(
    'SELECT * FROM public.agent_reorder_itinerary_activities(NULL, NULL, NULL, NULL)',
    'agent_reorder_itinerary_activities is service_role only');
SELECT pg_temp.expect_denied(
    'SELECT * FROM public.agent_generate_itinerary(NULL, NULL)',
    'agent_generate_itinerary is service_role only');

-- The three internals are not callable either. `itinerary_for_trip` takes no agent and
-- checks nothing — it is a get-or-create — so a grant on it would let any caller create an
-- itinerary row against any trip id.
SELECT pg_temp.expect_denied(
    'SELECT public.itinerary_for_trip(NULL)',
    'itinerary_for_trip is unreachable — it takes no agent and checks nothing');
SELECT pg_temp.expect_denied(
    'SELECT public.itinerary_touch(NULL)',
    'itinerary_touch is unreachable');
SELECT pg_temp.expect_denied(
    'SELECT public.block_for_time(NULL)',
    'block_for_time is unreachable');

RESET ROLE;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Days
-- ─────────────────────────────────────────────────────────────────────────────

SET ROLE postgres;

-- A SECOND DAY ON A DATE THAT ALREADY HAS ONE IS ALLOWED, and the day_number falls through
-- to append. The UNIQUE is on (itinerary_id, day_number), not on the date — a trip can
-- legitimately want two entries for one calendar day, and the upsert must not violate the
-- constraint working that out. The append path is the one that was easy to get wrong.
SELECT pg_temp.assert(
    (SELECT outcome FROM public.agent_upsert_itinerary_day(
        :trip::uuid, :agent::uuid, NULL, date '2026-12-05', 'Second entry', NULL))
    = 'created',
    'a second day on a date that already has one appends rather than colliding');

SELECT pg_temp.assert(
    (SELECT count(DISTINCT day_number) = count(*) FROM public.itinerary_day d
       JOIN public.itinerary i ON i.id = d.itinerary_id WHERE i.trip_id = :trip::uuid),
    '... and every day_number on the itinerary is still distinct');

-- A trip with no itinerary at all gets one on first write. 24 of 27 seeded trips are in
-- that state, so this is the ordinary path and not an edge case.
SELECT set_config('pg_temp.itin_before',
    (SELECT count(*) FROM public.itinerary)::text, false);

SELECT pg_temp.assert(
    (SELECT outcome FROM public.agent_upsert_itinerary_day(
        '0195a2c0-1a00-7000-8000-000000000046'::uuid, :agent::uuid, NULL,
        date '2026-12-20', 'First day', NULL)) = 'created',
    'the first day on a trip with no itinerary creates both');

SELECT pg_temp.assert(
    (SELECT count(*) FROM public.itinerary) = current_setting('pg_temp.itin_before')::bigint + 1,
    '... exactly one itinerary row, not one per day');

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Activities
-- ─────────────────────────────────────────────────────────────────────────────

SELECT pg_temp.assert(
    (SELECT activity_id FROM public.agent_upsert_itinerary_activity(
        :trip::uuid, :agent::uuid, NULL,
        (SELECT d.id FROM public.itinerary_day d JOIN public.itinerary i ON i.id = d.itinerary_id
          WHERE i.trip_id = :trip::uuid ORDER BY d.day_number LIMIT 1),
        'Test activity', NULL, time '18:30')) IS NOT NULL,
    'agent_upsert_itinerary_activity creates an activity');

-- BLOCK IS DERIVED FROM THE TIME when the caller does not say. 18:30 is the evening, and
-- the form has a time field and no block picker.
SELECT pg_temp.assert(
    (SELECT block = 'evening' FROM public.itinerary_activity WHERE title = 'Test activity'),
    '... and derives `evening` from an 18:30 start with no block given');

SELECT pg_temp.assert(
    (SELECT outcome FROM public.agent_upsert_itinerary_activity(
        :trip::uuid, :agent::uuid,
        (SELECT id FROM public.itinerary_activity WHERE title = 'Test activity'),
        NULL, 'Test activity', NULL, time '18:30')) = 'noop',
    'an unchanged save is a noop, not a write');

-- AN ACTIVITY CANNOT BE REACHED THROUGH A DIFFERENT TRIP THE ADVISOR OWNS. Without the
-- itinerary scope, knowing an id would be enough to edit it.
SELECT pg_temp.assert(
    NOT EXISTS (SELECT 1 FROM public.agent_upsert_itinerary_activity(
        :other::uuid, :agent::uuid,
        (SELECT id FROM public.itinerary_activity WHERE title = 'Test activity'),
        NULL, 'Hijacked')),
    'an activity cannot be edited through another trip the same advisor owns');

SELECT pg_temp.assert(
    NOT EXISTS (SELECT 1 FROM public.agent_upsert_itinerary_activity(
        :trip::uuid, gen_random_uuid(),
        (SELECT id FROM public.itinerary_activity WHERE title = 'Test activity'),
        NULL, 'Hijacked')),
    'another advisor cannot edit it');

-- A create needs a day, and it must belong to this itinerary.
SELECT pg_temp.assert(
    NOT EXISTS (SELECT 1 FROM public.agent_upsert_itinerary_activity(
        :trip::uuid, :agent::uuid, NULL, gen_random_uuid(), 'Nowhere')),
    'an activity cannot be created on a day that is not on this itinerary');

-- `version` is a "changed since published" marker on this table, not a lock — so it moves
-- on every write, which is what §3.5's publish will read.
SELECT set_config('pg_temp.ver',
    (SELECT version FROM public.itinerary WHERE trip_id = :trip::uuid)::text, false);

SELECT pg_temp.assert(
    (SELECT outcome FROM public.agent_upsert_itinerary_activity(
        :trip::uuid, :agent::uuid,
        (SELECT id FROM public.itinerary_activity WHERE title = 'Test activity'),
        NULL, 'Test activity renamed', NULL, time '18:30')) = 'updated',
    'editing an activity updates it');

SELECT pg_temp.assert(
    (SELECT version FROM public.itinerary WHERE trip_id = :trip::uuid)
        > current_setting('pg_temp.ver')::integer,
    '... and bumps itinerary.version, which §3.5 reads as "changed since published"');

SELECT pg_temp.assert(
    (SELECT outcome FROM public.agent_delete_itinerary_activity(
        :trip::uuid, :agent::uuid,
        (SELECT id FROM public.itinerary_activity WHERE title = 'Test activity renamed')))
    = 'deleted',
    'agent_delete_itinerary_activity removes it — a hard delete, per §20.1');

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. The generator's safety property
-- ─────────────────────────────────────────────────────────────────────────────
--
-- THIS IS THE SECTION THAT MATTERS. Everything above is ownership; this is whether an
-- advisor can lose an afternoon's writing to a button.

-- The seed's itinerary covers Dec 4–7 on a Dec 4–11 trip, so half the days are missing and
-- the return flight has nowhere to live. Asserted rather than assumed, because the whole
-- section is calibrated against it.
SELECT pg_temp.assert(
    (SELECT days FROM pg_temp.counts(:trip::uuid)) <
    (SELECT (end_date - start_date) + 1 FROM public.trip WHERE id = :trip::uuid),
    'the fixture starts with fewer days than the trip spans');

-- Rewrite one, so there is prose to destroy.
UPDATE public.itinerary_activity SET title = 'Your flight to paradise'
 WHERE title = 'AA 1413 · MIA → MBJ';

SELECT pg_temp.assert(
    (SELECT days_added > 0 AND activities_added > 0
       FROM public.agent_generate_itinerary(:trip::uuid, :agent::uuid)),
    'generate adds the missing days and the unlinked components');

SELECT pg_temp.assert(
    (SELECT days FROM pg_temp.counts(:trip::uuid)) =
    (SELECT (end_date - start_date) + 1 FROM public.trip WHERE id = :trip::uuid),
    '... and the days now cover the whole trip exactly');

-- THE ONE THAT MATTERS MOST.
SELECT pg_temp.assert(
    EXISTS (SELECT 1 FROM public.itinerary_activity WHERE title = 'Your flight to paradise'),
    'generate does NOT overwrite a title the advisor rewrote');

SELECT pg_temp.assert(
    (SELECT count(*) FROM public.itinerary_activity a
       JOIN public.itinerary_day d ON d.id = a.itinerary_day_id
       JOIN public.itinerary i ON i.id = d.itinerary_id
      WHERE i.trip_id = :trip::uuid AND a.gyasis_tip IS NOT NULL) = 3,
    '... and leaves every "Gyasi''s Tip" where it was');

-- INSURANCE IS NOT AN ITINERARY ACTIVITY. A client's day-by-day does not include "your
-- policy is in effect". The component exists on this trip, so this is a real exclusion and
-- not a vacuous pass.
SELECT pg_temp.assert(
    EXISTS (SELECT 1 FROM public.trip_component
             WHERE trip_id = :trip::uuid AND kind = 'insurance' AND archived_at IS NULL),
    'the trip has an insurance component for the next assertion to exclude');

SELECT pg_temp.assert(
    NOT EXISTS (
        SELECT 1 FROM public.itinerary_activity a
          JOIN public.trip_component c ON c.id = a.component_id
         WHERE c.kind = 'insurance'),
    'generate does not put an insurance component on the itinerary');

-- IDEMPOTENT. The button an advisor will press twice without thinking.
SELECT pg_temp.assert(
    (SELECT outcome FROM public.agent_generate_itinerary(:trip::uuid, :agent::uuid)) = 'noop',
    'a second generate does nothing at all');

-- A trip with no dates cannot have a day scaffold — `itinerary_day.date` is NOT NULL — and
-- says so rather than inventing a range from today.
UPDATE public.trip SET start_date = NULL, end_date = NULL
 WHERE id = '0195a2c0-1a00-7000-8000-000000000042';

SELECT pg_temp.assert(
    (SELECT outcome FROM public.agent_generate_itinerary(
        '0195a2c0-1a00-7000-8000-000000000042'::uuid, :agent::uuid)) = 'no_dates',
    'a trip with no dates answers no_dates rather than inventing a range');

SELECT pg_temp.assert(
    NOT EXISTS (SELECT 1 FROM public.agent_generate_itinerary(:trip::uuid, gen_random_uuid())),
    'another advisor generates nothing');

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Reorder
-- ─────────────────────────────────────────────────────────────────────────────

SELECT set_config('pg_temp.day1',
    (SELECT d.id::text FROM public.itinerary_day d
       JOIN public.itinerary i ON i.id = d.itinerary_id
      WHERE i.trip_id = :trip::uuid ORDER BY d.day_number LIMIT 1), false);

DO $partial$
BEGIN
    PERFORM public.agent_reorder_itinerary_activities(
        '0195a2c0-1a00-7000-8000-000000000040'::uuid,
        '0195a2c0-1a00-7000-8000-000000000001'::uuid,
        current_setting('pg_temp.day1')::uuid,
        (SELECT array_agg(id) FROM (
            SELECT a.id FROM public.itinerary_activity a
             WHERE a.itinerary_day_id = current_setting('pg_temp.day1')::uuid LIMIT 1) q));
    RAISE EXCEPTION 'FAILED: a partial reorder should have been refused';
EXCEPTION
    WHEN raise_exception THEN
        IF SQLERRM LIKE 'FAILED:%' THEN RAISE; END IF;
        RAISE NOTICE '  ok    a reorder naming only some of the day''s activities is refused';
END $partial$;

SELECT pg_temp.assert(
    (SELECT moved FROM public.agent_reorder_itinerary_activities(
        :trip::uuid, :agent::uuid, current_setting('pg_temp.day1')::uuid,
        (SELECT array_agg(a.id ORDER BY a.order_index DESC)
           FROM public.itinerary_activity a
          WHERE a.itinerary_day_id = current_setting('pg_temp.day1')::uuid))) > 0,
    'reversing a whole day moves its activities');

SELECT pg_temp.assert(
    (SELECT moved FROM public.agent_reorder_itinerary_activities(
        :trip::uuid, :agent::uuid, current_setting('pg_temp.day1')::uuid,
        (SELECT array_agg(a.id ORDER BY a.order_index)
           FROM public.itinerary_activity a
          WHERE a.itinerary_day_id = current_setting('pg_temp.day1')::uuid))) = 0,
    'a reorder to the order it is already in moves nothing');

RESET ROLE;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. The traveler sees the result and cannot write it
-- ─────────────────────────────────────────────────────────────────────────────

SELECT pg_temp.become(:jordan::uuid);

SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_trip_itinerary_days(:trip::uuid)) = 0,
    'the agent itinerary accessor gives the traveler nothing — they have their own read');

SELECT pg_temp.expect_denied(
    'SELECT * FROM public.agent_generate_itinerary(''0195a2c0-1a00-7000-8000-000000000040'', ''0195a2c0-1a00-7000-8000-000000000001'')',
    'a traveler cannot generate an itinerary even naming the real advisor id');

RESET ROLE;

ROLLBACK;
