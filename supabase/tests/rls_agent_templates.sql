-- §3.4.13's template library: the access posture, and the two properties that make a
-- template safe to apply.
--
-- WHY THIS FILE EXISTS. `trip_template` shipped in the initial migration with eight
-- columns, RLS enabled, a slot in the agent-domain lockdown list and ZERO rows, and
-- `trip.template_id` shipped referencing it and was never written. Giving both a producer
-- means a jsonb payload now decides what a new trip looks like, and Data-Model §23's
-- warning applies in full: a blob that copies whatever it finds grows fields nobody chose.
--
-- The two properties worth more than the rest:
--
--   1. DATES ARE OFFSETS. A pattern saved from a December trip must produce March dates in
--      March. Absolute dates in a payload would be silently wrong on every reuse.
--   2. APPLY CANNOT DESTROY PROSE. Additive, and idempotent on trip.template_id. The same
--      property §3.4.14's generator has and for the same reason: an hour of an advisor's
--      writing must not be a double-click away from being replaced.
--
-- Run against a freshly reset local database:
--     supabase db reset
--     psql "$(supabase status -o json | jq -r .DB_URL)" -v ON_ERROR_STOP=1 \
--          -f supabase/tests/rls_agent_templates.sql

\set ON_ERROR_STOP on

BEGIN;

\set gyasi  '''0195a2c0-1a00-7000-8000-000000000010'''
\set agent  '''0195a2c0-1a00-7000-8000-000000000001'''
\set trip40 '''0195a2c0-1a00-7000-8000-000000000040'''

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
\echo '== 0. the fixture, so nothing below passes vacuously =='
-- ─────────────────────────────────────────────────────────────────────────────

SELECT pg_temp.assert(
    (SELECT count(*) FROM public.trip_component
      WHERE trip_id = :trip40 AND archived_at IS NULL) >= 6,
    'trip 40 has the components a template is worth making from');

SELECT pg_temp.assert(
    (SELECT count(*) FROM public.itinerary_day d JOIN public.itinerary i ON i.id = d.itinerary_id
      WHERE i.trip_id = :trip40) >= 3,
    '... and a written day-by-day, so the prose half is exercised');

SELECT pg_temp.assert(
    (SELECT start_date IS NOT NULL FROM public.trip WHERE id = :trip40),
    '... and real dates, so the offsets are not all NULL');

-- ─────────────────────────────────────────────────────────────────────────────
\echo '== 1. save: an allow-list, and offsets rather than dates =='
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TEMP TABLE made AS
SELECT * FROM public.agent_save_trip_as_template(
    :trip40::uuid, :agent::uuid, 'Sandals Negril · 7n', 'A pattern');

SELECT pg_temp.assert(
    (SELECT components_saved = 6 AND days_saved >= 3 FROM made),
    'saving a trip captures its components and its days');

CREATE TEMP TABLE payload AS
SELECT t.payload FROM public.trip_template t WHERE t.id = (SELECT template_id FROM made);

-- THE ASSERTION THE PAYLOAD DESIGN EXISTS FOR. A confirmation number belongs to ONE
-- booking. Carried forward, it shows a traveler a confirmation that was never issued to
-- them — on a screen they are being asked to trust.
SELECT pg_temp.assert(
    (SELECT payload::text NOT LIKE '%confirmation%' FROM payload),
    'the payload carries NO confirmation number, on components or activities');

SELECT pg_temp.assert(
    (SELECT payload::text NOT LIKE '%api_source%' AND payload::text NOT LIKE '%api_reference%'
       FROM payload),
    'nor api_source / api_reference — this trip''s own booking, not a pattern');

SELECT pg_temp.assert(
    (SELECT payload::text NOT LIKE '%weather%' FROM payload),
    'nor weather_forecast, which is per-date');

-- Dates became integers. Asserted by VALUE, read off the seed by hand rather than
-- recomputed with the function's own expression: trip 40 runs Dec 4 to Dec 11, its hotel
-- covers the whole week (0 to 7), and the catamaran is on the third day (offset 2).
SELECT pg_temp.assert(
    (SELECT (c ->> 'start_day')::integer = 0 AND (c ->> 'end_day')::integer = 7
       FROM payload, jsonb_array_elements(payload.payload -> 'components') c
      WHERE c ->> 'display_name' LIKE 'Ocean-view suite%'),
    'the hotel is stored as day 0 to day 7, not as December dates');

SELECT pg_temp.assert(
    (SELECT (c ->> 'start_day')::integer = 2
       FROM payload, jsonb_array_elements(payload.payload -> 'components') c
      WHERE c ->> 'display_name' LIKE 'Catamaran%'),
    'the catamaran is stored as day 2');

-- TIMES are not offsets. A 14:00 check-in is 14:00 in March too.
SELECT pg_temp.assert(
    (SELECT c ->> 'start_time' = '06:40:00'
       FROM payload, jsonb_array_elements(payload.payload -> 'components') c
      WHERE c ->> 'display_name' LIKE 'AA 1413%'),
    'times are kept verbatim — only DATES are relative');

-- The component payload registry rides along. §3.4.4 settled that shape, and a template
-- that dropped it would apply a flight with no flight number.
SELECT pg_temp.assert(
    (SELECT c -> 'payload' ->> 'flight_number' = 'AA 1413'
       FROM payload, jsonb_array_elements(payload.payload -> 'components') c
      WHERE c ->> 'display_name' LIKE 'AA 1413%'),
    'the component''s own payload registry survives the snapshot');

-- ─────────────────────────────────────────────────────────────────────────────
\echo '== 2. apply: the same pattern, this trip''s calendar =='
-- ─────────────────────────────────────────────────────────────────────────────

-- A trip THREE MONTHS LATER than the source, so an absolute date in the payload would be
-- obviously wrong rather than coincidentally right.
INSERT INTO public.trip (id, client_id, agent_id, title, trip_type, status,
                         start_date, end_date, destinations, traveler_count, currency)
VALUES ('01a0b1c2-d300-7000-8000-00000000ab01', '0195a2c0-1a00-7000-8000-000000000102',
        :agent::uuid, 'Negril again, in March', 'all_inclusive', 'inquiry',
        '2027-03-06', '2027-03-13', ARRAY[]::text[], 1, 'USD');

CREATE TEMP TABLE applied AS
SELECT * FROM public.agent_apply_template(
    (SELECT template_id FROM made), '01a0b1c2-d300-7000-8000-00000000ab01'::uuid, :agent::uuid);

SELECT pg_temp.assert(
    (SELECT outcome = 'applied' AND components_added = 6 AND days_added >= 3 FROM applied),
    'applying seeds the components and the days');

SELECT pg_temp.assert(
    (SELECT start_date = DATE '2027-03-06' AND end_date = DATE '2027-03-13'
       FROM public.trip_component
      WHERE trip_id = '01a0b1c2-d300-7000-8000-00000000ab01'
        AND display_name LIKE 'Ocean-view suite%'),
    'the hotel lands on THIS trip''s week — March, not the December it was saved from');

SELECT pg_temp.assert(
    (SELECT start_date = DATE '2027-03-08'
       FROM public.trip_component
      WHERE trip_id = '01a0b1c2-d300-7000-8000-00000000ab01'
        AND display_name LIKE 'Catamaran%'),
    'and day 2 is the third day of THIS trip');

SELECT pg_temp.assert(
    (SELECT start_time = TIME '06:40:00'
       FROM public.trip_component
      WHERE trip_id = '01a0b1c2-d300-7000-8000-00000000ab01'
        AND display_name LIKE 'AA 1413%'),
    'the departure time is unchanged');

-- The money reproduces exactly, which is the point of capturing costs at all. Compared
-- against the SOURCE trip rather than a literal, so it stays true if the seed is re-priced.
SELECT pg_temp.assert(
    (SELECT n.total_value_cents = o.total_value_cents
        AND n.total_commission_cents = o.total_commission_cents
       FROM public.trip n, public.trip o
      WHERE n.id = '01a0b1c2-d300-7000-8000-00000000ab01' AND o.id = :trip40),
    'the trip totals trigger fired and reproduced the source trip''s money to the cent');

SELECT pg_temp.assert(
    (SELECT traveler_count = 2 AND destinations = ARRAY['Negril, Jamaica']
       FROM public.trip WHERE id = '01a0b1c2-d300-7000-8000-00000000ab01'),
    'trip-level defaults fill in where the trip had nothing');

SELECT pg_temp.assert(
    (SELECT d.date = DATE '2027-03-06'
       FROM public.itinerary i JOIN public.itinerary_day d ON d.itinerary_id = i.id
      WHERE i.trip_id = '01a0b1c2-d300-7000-8000-00000000ab01' AND d.day_number = 1),
    'day 1 of the day-by-day is day 1 of THIS trip');

SELECT pg_temp.assert(
    (SELECT count(*) > 0
       FROM public.itinerary i
       JOIN public.itinerary_day d ON d.itinerary_id = i.id
       JOIN public.itinerary_activity a ON a.itinerary_day_id = d.id
      WHERE i.trip_id = '01a0b1c2-d300-7000-8000-00000000ab01'),
    'the written activities came across');

SELECT pg_temp.assert(
    NOT EXISTS (
        SELECT 1 FROM public.itinerary i
          JOIN public.itinerary_day d ON d.itinerary_id = i.id
          JOIN public.itinerary_activity a ON a.itinerary_day_id = d.id
         WHERE i.trip_id = '01a0b1c2-d300-7000-8000-00000000ab01'
           AND (a.confirmation_number IS NOT NULL OR a.component_id IS NOT NULL)),
    'and arrived with NO confirmation number and NO component link — a copied confirmation '
    'is a confirmation the traveler never received');

-- ─────────────────────────────────────────────────────────────────────────────
\echo '== 3. apply is idempotent, and cannot destroy prose =='
-- ─────────────────────────────────────────────────────────────────────────────

-- An advisor's own writing on a day the pattern also has.
UPDATE public.itinerary_day SET summary = 'MY OWN WORDS, DO NOT TOUCH'
 WHERE day_number = 1
   AND itinerary_id = (SELECT id FROM public.itinerary
                        WHERE trip_id = '01a0b1c2-d300-7000-8000-00000000ab01');

CREATE TEMP TABLE again AS
SELECT * FROM public.agent_apply_template(
    (SELECT template_id FROM made), '01a0b1c2-d300-7000-8000-00000000ab01'::uuid, :agent::uuid);

SELECT pg_temp.assert(
    (SELECT outcome = 'already_applied' AND components_added = 0
        AND days_added = 0 AND activities_added = 0 FROM again),
    'a second apply answers already_applied and writes nothing — trip.template_id is the '
    'idempotency key, and a double-click is not a duplicated trip');

SELECT pg_temp.assert(
    (SELECT count(*) = 6 FROM public.trip_component
      WHERE trip_id = '01a0b1c2-d300-7000-8000-00000000ab01'),
    '... and the components were not doubled');

SELECT pg_temp.assert(
    (SELECT summary = 'MY OWN WORDS, DO NOT TOUCH'
       FROM public.itinerary_day
      WHERE day_number = 1
        AND itinerary_id = (SELECT id FROM public.itinerary
                             WHERE trip_id = '01a0b1c2-d300-7000-8000-00000000ab01')),
    'THE PROPERTY THAT MATTERS MOST: a rewritten day survives a re-apply verbatim');

-- A dateless trip is a real state (§3.4.1 has a fixture for it) and applying to one must
-- not invent a calendar.
INSERT INTO public.trip (id, client_id, agent_id, title, trip_type, status,
                         destinations, traveler_count, currency)
VALUES ('01a0b1c2-d300-7000-8000-00000000ab02', '0195a2c0-1a00-7000-8000-000000000102',
        :agent::uuid, 'Somewhere warm, no dates', 'all_inclusive', 'inquiry',
        ARRAY[]::text[], 1, 'USD');

SELECT public.agent_apply_template(
    (SELECT template_id FROM made), '01a0b1c2-d300-7000-8000-00000000ab02'::uuid, :agent::uuid);

SELECT pg_temp.assert(
    NOT EXISTS (SELECT 1 FROM public.trip_component
                 WHERE trip_id = '01a0b1c2-d300-7000-8000-00000000ab02'
                   AND start_date IS NOT NULL),
    'a trip with no start_date gets NULL component dates rather than invented ones');

SELECT pg_temp.assert(
    (SELECT count(*) = 6 FROM public.trip_component
      WHERE trip_id = '01a0b1c2-d300-7000-8000-00000000ab02'),
    '... but keeps every booking, because an undated inquiry is still worth seeding');

-- AND SKIPS THE DAY-BY-DAY ENTIRELY, because `itinerary_day.date` is NOT NULL: a day-by-day
-- is a calendar and this trip has none. Found by this test rather than by reasoning — the
-- first version of apply tried to insert a NULL date and the constraint refused it.
SELECT pg_temp.assert(
    NOT EXISTS (SELECT 1 FROM public.itinerary i
                 JOIN public.itinerary_day d ON d.itinerary_id = i.id
                WHERE i.trip_id = '01a0b1c2-d300-7000-8000-00000000ab02'),
    'and no itinerary days at all — itinerary_day.date is NOT NULL, so a dateless trip '
    'gets its bookings and no calendar, rather than a failed apply');

-- ─────────────────────────────────────────────────────────────────────────────
\echo '== 4. tenancy and posture =='
-- ─────────────────────────────────────────────────────────────────────────────

SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_apply_template(
        (SELECT template_id FROM made), :trip40::uuid,
        '0195a2c0-1a00-7000-8000-0000000000e2'::uuid)
      WHERE outcome = 'not_found') = 1,
    'another advisor cannot apply this agent''s template to this agent''s trip');

SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_save_trip_as_template(
        :trip40::uuid, '0195a2c0-1a00-7000-8000-0000000000e2'::uuid, 'Stolen', NULL)) = 0,
    'nor save somebody else''s trip as their own template — zero rows, so "no such trip" '
    'and "not yours" are indistinguishable');

GRANT SELECT ON made TO authenticated;
SELECT pg_temp.become(:gyasi::uuid);

SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_templates()) >= 1,
    'the agent sees their own templates through the accessor');

SELECT pg_temp.assert(
    (SELECT times_used >= 2 FROM public.agent_templates()
      WHERE template_id = (SELECT template_id FROM made)),
    'times_used counts the trips that actually used it — derived from trip.template_id, '
    'never a stored counter that can drift');

SELECT pg_temp.assert(
    (SELECT component_count = 6 AND value_cents::bigint > 0
       FROM public.agent_templates() WHERE template_id = (SELECT template_id FROM made)),
    'the grid gets the shape and the value without applying anything');

-- THE ASSERTION THE WHOLE WRITE POSTURE RESTS ON. Every write takes p_agent_id as trusted
-- input, so a client-role grant on one is act-as-any-agent with no audit row.
SELECT pg_temp.expect_denied(
    format('SELECT * FROM public.agent_save_trip_as_template(%L, %L, %L, NULL)',
           :trip40, :agent, 'Nope'),
    'even an AGENT cannot execute agent_save_trip_as_template directly — service_role only');

SELECT pg_temp.expect_denied(
    format('SELECT * FROM public.agent_apply_template(%L, %L, %L)',
           (SELECT template_id FROM made), :trip40, :agent),
    'nor agent_apply_template');

SELECT pg_temp.expect_denied(
    'SELECT 1 FROM public.trip_template LIMIT 1',
    'nor read trip_template directly — the table has no policy, so no one does');

RESET ROLE;

SELECT pg_temp.assert(
    (SELECT outcome = 'archived' FROM public.agent_archive_template(
        (SELECT template_id FROM made), :agent::uuid)),
    'archiving is a soft delete — a hard one would fail outright on any template a trip '
    'has used, because trip.template_id references it with no ON DELETE clause');

SELECT pg_temp.become(:gyasi::uuid);
SELECT pg_temp.assert(
    NOT EXISTS (SELECT 1 FROM public.agent_templates()
                 WHERE template_id = (SELECT template_id FROM made)),
    '... and an archived template drops out of the grid');
RESET ROLE;

ROLLBACK;
