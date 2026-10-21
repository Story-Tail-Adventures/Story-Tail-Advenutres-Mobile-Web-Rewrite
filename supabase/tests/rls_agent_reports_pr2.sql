-- §3.11 Reporting, PR 2 — Client Lifetime Value (3.11.5), the Conversion Funnel (3.11.6) and
-- Pipeline Value (3.11.7) (migration 20261029120000_agent_reports_pr2).
--
-- WHAT THIS FILE IS GUARDING.
--
--   1. Lifetime value is Client Detail's figure (committed trips only, archived and cancelled
--      out), ranked, with commission; cohort is the quarter of the FIRST commitment in the
--      advisor's zone, NULL when it predates tracking; a client with nothing committed is not
--      ranked.
--   2. The funnel follows trips CREATED in the period, counts each in every stage up to the
--      furthest it reached (history or status now), and splits those that stopped into still
--      open and cancelled. Days to book uses the same first-commitment rule as Revenue.
--   3. Pipeline: today's open trips weighted by the advisor's OWN pipeline_weight rows (the ones
--      §3.7.7 edits), rounded once; by travel month with started trips in this month, a later
--      row and an undated row, so the months add back to the weighted total.
--   4. The doors: internal functions denied to client roles; the export knows the three reports
--      and records a NULL period for lifetime value and the pipeline.
--
-- A THIRD ADVISOR in Pacific/Pago_Pago (UTC-11), fixed rather than chosen, so a cohort edge at
-- 23:30 local on Mar 31 is already April in UTC: a UTC slip moves it a quarter. Every expected
-- figure below is a literal worked out by hand.
--
--     psql "$(supabase status -o json | jq -r .DB_URL)" -v ON_ERROR_STOP=1 \
--          -f supabase/tests/rls_agent_reports_pr2.sql

\set ON_ERROR_STOP on

BEGIN;

\set c_agent   '''0c7f0000-0000-7000-8000-000000000001'''
\set c_account '''0c7f0000-0000-7000-8000-000000000002'''
\set k_ada     '''0c7f0000-0000-7000-8000-000000000011'''
\set k_bo      '''0c7f0000-0000-7000-8000-000000000012'''
\set k_cy      '''0c7f0000-0000-7000-8000-000000000013'''
\set k_di      '''0c7f0000-0000-7000-8000-000000000014'''

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

-- 22023 (invalid_parameter_value) is what the report functions raise on unknown input.
CREATE OR REPLACE FUNCTION pg_temp.expect_invalid(stmt text, description text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    EXECUTE stmt;
    RAISE EXCEPTION 'FAILED: % — statement succeeded, expected 22023', description;
EXCEPTION
    WHEN invalid_parameter_value THEN RAISE NOTICE '  ok    %', description;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.become(account uuid)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    PERFORM set_config('role', 'authenticated', true);
    PERFORM set_config('request.jwt.claims',
        json_build_object('sub', account::text, 'role', 'authenticated', 'aal', 'aal2')::text, true);
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 0. The third advisor
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.agent (id, display_name, email, status, time_zone)
VALUES (:c_agent::uuid, 'Funnel Test Advisor', 'funnel.advisor@example.com', 'active', 'Pacific/Pago_Pago');

INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change)
VALUES (:c_account::uuid,
        '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        'funnel.advisor.login@example.com', 'x', now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        ('{"first_name":"Funnel","last_name":"Advisor",'
         || '"agent_id":"0195a2c0-1a00-7000-8000-000000000001"}')::jsonb,
        now(), now(), '', '', '', '');

DO $$
DECLARE v_client_id uuid;
BEGIN
    SELECT client_id INTO v_client_id FROM public.platform_user
     WHERE account_id = '0c7f0000-0000-7000-8000-000000000002';
    UPDATE public.platform_user
       SET role = 'agent', agent_id = '0c7f0000-0000-7000-8000-000000000001', client_id = NULL
     WHERE account_id = '0c7f0000-0000-7000-8000-000000000002';
    DELETE FROM public.client WHERE id = v_client_id;
END $$;

SELECT pu.id AS c_actor FROM public.platform_user pu WHERE pu.account_id = :c_account::uuid \gset
\set c_actor '''':c_actor''''

INSERT INTO public.client (id, agent_id, first_name, last_name, preferred_name, email)
VALUES (:k_ada::uuid, :c_agent::uuid, 'Augusta', 'Lovelace', 'Ada', 'ada@example.com'),
       (:k_bo::uuid,  :c_agent::uuid, 'Bo',      'Diddley',  NULL,  'bo@example.com'),
       (:k_cy::uuid,  :c_agent::uuid, 'Cy',      'Young',    NULL,  'cy@example.com'),
       (:k_di::uuid,  :c_agent::uuid, 'Di',      'Prince',   NULL,  'di@example.com');

-- ── Lifetime value trips: created long ago, so the funnel never sees them ──────────────
INSERT INTO public.trip (id, client_id, agent_id, title, trip_type, status, archived_at,
                         total_value_cents, total_commission_cents, created_at)
VALUES
    -- Ada: two committed trips, 150000 / 15000 in all.
    ('0c7f0000-0000-7000-8000-000000000101', :k_ada::uuid, :c_agent::uuid, 'L1 Ada booked',     'custom', 'booked',      NULL,  100000, 10000, '2024-06-01'),
    ('0c7f0000-0000-7000-8000-000000000102', :k_ada::uuid, :c_agent::uuid, 'L2 Ada completed',  'custom', 'completed',   NULL,   50000,  5000, '2024-06-01'),
    -- Ada, never counted: cancelled, and archived.
    ('0c7f0000-0000-7000-8000-000000000103', :k_ada::uuid, :c_agent::uuid, 'L3 Ada cancelled',  'custom', 'cancelled',   NULL,  999900, 99900, '2024-06-01'),
    ('0c7f0000-0000-7000-8000-000000000104', :k_ada::uuid, :c_agent::uuid, 'L4 Ada archived',   'custom', 'booked',      now(), 888800, 88800, '2024-06-01'),
    -- Bo: one trip traveling now, committed before tracking began (no history): no cohort.
    ('0c7f0000-0000-7000-8000-000000000105', :k_bo::uuid,  :c_agent::uuid, 'L5 Bo traveling',   'custom', 'in_progress', NULL,  200000, 30000, '2024-06-01'),
    -- Di: a returning client. A 2024 trip from before tracking (no history) and one tracked in
    -- 2025: the first booking is the untracked one, so the cohort is "before tracking".
    ('0c7f0000-0000-7000-8000-000000000107', :k_di::uuid,  :c_agent::uuid, 'L7 Di 2024',        'custom', 'completed',   NULL,    1000,   100, '2024-06-01'),
    ('0c7f0000-0000-7000-8000-000000000108', :k_di::uuid,  :c_agent::uuid, 'L8 Di tracked',     'custom', 'completed',   NULL,    2000,   200, '2024-06-01'),
    -- Cy: a proposal only. Nothing committed, so not ranked.
    ('0c7f0000-0000-7000-8000-000000000106', :k_cy::uuid,  :c_agent::uuid, 'L6 Cy proposal',    'custom', 'proposal',    NULL,  777700, 77700, '2024-06-01');

-- Ada's first commitment is L2 at 23:30 on Mar 31 2025 in Pago Pago (Apr 1 10:30 UTC): Q1, not
-- Q2. L1 committed later, in May.
-- `::timestamp` before AT TIME ZONE is what makes this LOCAL time: on a bare literal Postgres
-- picks timestamptz, reads it as UTC and converts the other way, and the edge stops being one.
INSERT INTO public.trip_status_history (id, trip_id, from_status, to_status, changed_at)
VALUES (gen_random_uuid(), '0c7f0000-0000-7000-8000-000000000102', 'proposal', 'completed',
        '2025-03-31 23:30'::timestamp AT TIME ZONE 'Pacific/Pago_Pago'),
       (gen_random_uuid(), '0c7f0000-0000-7000-8000-000000000101', 'proposal', 'booked',
        '2025-05-10 12:00'::timestamp AT TIME ZONE 'Pacific/Pago_Pago'),
       (gen_random_uuid(), '0c7f0000-0000-7000-8000-000000000108', 'proposal', 'completed',
        '2025-08-01 12:00'::timestamp AT TIME ZONE 'Pacific/Pago_Pago');

-- ── Funnel trips: created within the last 12 months ────────────────────────────────────
INSERT INTO public.trip (id, client_id, agent_id, title, trip_type, status, archived_at, created_at)
VALUES
    ('0c7f0000-0000-7000-8000-000000000201', :k_cy::uuid, :c_agent::uuid, 'F1 still an inquiry',         'custom', 'inquiry',     NULL,  now()),
    ('0c7f0000-0000-7000-8000-000000000202', :k_cy::uuid, :c_agent::uuid, 'F2 cancelled at proposal',    'custom', 'cancelled',   NULL,  now()),
    ('0c7f0000-0000-7000-8000-000000000203', :k_cy::uuid, :c_agent::uuid, 'F3 proposal, open',           'custom', 'proposal',    NULL,  now()),
    ('0c7f0000-0000-7000-8000-000000000204', :k_cy::uuid, :c_agent::uuid, 'F4 entered straight as booked','custom', 'booked',     NULL,  now()),
    ('0c7f0000-0000-7000-8000-000000000205', :k_cy::uuid, :c_agent::uuid, 'F5 traveling, booked day 10', 'custom', 'in_progress', NULL,  now() - interval '12 days'),
    ('0c7f0000-0000-7000-8000-000000000206', :k_cy::uuid, :c_agent::uuid, 'F6 straight to completed d4', 'custom', 'completed',   NULL,  now() - interval '30 days'),
    ('0c7f0000-0000-7000-8000-000000000207', :k_cy::uuid, :c_agent::uuid, 'F7 booked day 7, cancelled',  'custom', 'cancelled',   NULL,  now() - interval '20 days'),
    ('0c7f0000-0000-7000-8000-000000000208', :k_cy::uuid, :c_agent::uuid, 'X archived',                  'custom', 'booked',      now(), now()),
    ('0c7f0000-0000-7000-8000-000000000209', :k_cy::uuid, :c_agent::uuid, 'X created 400 days ago',      'custom', 'completed',   NULL,  now() - interval '400 days');

INSERT INTO public.trip_status_history (id, trip_id, from_status, to_status, changed_at)
SELECT gen_random_uuid(), v.trip::uuid, v.f::trip_status, v.t::trip_status, t.created_at + v.after
  FROM (VALUES
        ('0c7f0000-0000-7000-8000-000000000202', 'inquiry',  'proposal',  interval '1 day'),
        ('0c7f0000-0000-7000-8000-000000000202', 'proposal', 'cancelled', interval '2 days'),
        ('0c7f0000-0000-7000-8000-000000000203', 'inquiry',  'proposal',  interval '1 hour'),
        ('0c7f0000-0000-7000-8000-000000000205', 'inquiry',  'proposal',  interval '2 days'),
        ('0c7f0000-0000-7000-8000-000000000205', 'proposal', 'booked',    interval '10 days'),
        ('0c7f0000-0000-7000-8000-000000000205', 'booked',   'in_progress', interval '11 days'),
        ('0c7f0000-0000-7000-8000-000000000206', 'proposal', 'completed', interval '4 days'),
        ('0c7f0000-0000-7000-8000-000000000207', 'proposal', 'booked',    interval '7 days'),
        ('0c7f0000-0000-7000-8000-000000000207', 'booked',   'cancelled', interval '8 days')
       ) AS v(trip, f, t, after)
  JOIN public.trip t ON t.id = v.trip::uuid;

-- ── Pipeline trips: open, priced, placed against the advisor's month start ─────────────
CREATE TEMP TABLE c_day AS
SELECT date_trunc('month', (now() AT TIME ZONE 'Pacific/Pago_Pago')::date::timestamp)::date AS ms;

INSERT INTO public.trip (id, client_id, agent_id, title, trip_type, status, start_date,
                         total_value_cents, created_at)
SELECT v.id::uuid, :k_cy::uuid, :c_agent::uuid, v.title, 'custom', v.status::trip_status,
       CASE WHEN v.offset_days IS NULL THEN NULL ELSE d.ms + v.offset_days END,
       v.value, '2024-06-01'
  FROM c_day d,
       (VALUES
        -- 45 days after the 1st is always mid next month.
        ('0c7f0000-0000-7000-8000-000000000301', 'P1 inquiry next month',      'inquiry',     45,   100000),
        -- 400 days out: past the twelve-month window, the `later` row.
        ('0c7f0000-0000-7000-8000-000000000302', 'P2 proposal much later',     'proposal',    400,   30001),
        -- Started 20 days before this month and still only `booked`, never moved on: not
        -- traveling, so the "Start date passed" row, not this month.
        ('0c7f0000-0000-7000-8000-000000000303', 'P3 booked, start passed',    'booked',      -20,   77777),
        ('0c7f0000-0000-7000-8000-000000000304', 'P4 traveling this month',    'in_progress',  2,    11111),
        ('0c7f0000-0000-7000-8000-000000000305', 'P5 inquiry, no dates',       'inquiry',     NULL,      5)
       ) AS v(id, title, status, offset_days, value);

-- The report reads THIS advisor's weights, the rows §3.7.7 edits: inquiry moved off its 20%.
UPDATE public.pipeline_weight SET weight_pct = 25
 WHERE agent_id = :c_agent::uuid AND status = 'inquiry';

GRANT SELECT ON c_day TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Client Lifetime Value
-- ─────────────────────────────────────────────────────────────────────────────

SELECT pg_temp.become(:c_account::uuid);
CREATE TEMP TABLE ltv AS SELECT * FROM public.agent_report_client_lifetime_value();

-- By hand: Bo 200000 / 30000 (1 trip, no cohort) ranks above Ada 150000 / 15000 (2 trips,
-- cohort Q1 2025). Cy's lifetime trip is a proposal, but Cy also owns the funnel's committed
-- trips (F4, F5, F6 and the 400-day-old completed one, all unpriced) and two priced pipeline
-- trips: 88888, last.
-- Ada's cancelled and archived trips are nowhere.
SELECT pg_temp.assert(
    (SELECT count(*) FROM ltv) = 4
    AND (SELECT array_agg(display_name ORDER BY ord) FROM (SELECT display_name, row_number() OVER () AS ord FROM ltv) x)
        = ARRAY['Bo Diddley', 'Ada Lovelace', 'Cy Young', 'Di Prince'],
    'clients with something committed, ranked by lifetime value; the preferred name shows');
SELECT pg_temp.assert(
    -- The pipeline fixtures are Cy's too: P3 (booked, 77777) and P4 (traveling, 11111) are
    -- committed; P1, P2 and P5 are not.
    (SELECT (trip_count, value_cents) = (6, '88888') FROM ltv WHERE client_id = :k_cy::uuid),
    'proposal, inquiry, cancelled and archived trips are not lifetime value; the six committed ones are');
SELECT pg_temp.assert(
    (SELECT (trip_count, value_cents, commission_cents) = (2, '150000', '15000') FROM ltv WHERE client_id = :k_ada::uuid),
    'lifetime value counts committed trips only: cancelled and archived are out');
SELECT pg_temp.assert(
    (SELECT cohort_start = '2025-01-01'::date FROM ltv WHERE client_id = :k_ada::uuid),
    'cohort is the quarter of the FIRST commitment, in the advisor''s zone (Mar 31 23:30 is Q1)');
SELECT pg_temp.assert(
    (SELECT cohort_start IS NULL FROM ltv WHERE client_id = :k_bo::uuid),
    'a client committed before tracking began has no cohort, rather than a guessed one');
SELECT pg_temp.assert(
    (SELECT (trip_count, value_cents, cohort_start IS NULL) = (2, '3000', true) FROM ltv WHERE client_id = :k_di::uuid),
    'one booking from before tracking makes the client "before tracking", though a later one is tracked');

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. The Conversion Funnel
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TEMP TABLE fun AS SELECT * FROM public.agent_report_conversion_funnel('12mo');

-- By hand, over F1 to F7 (the archived one and the 400-day-old one are out):
--   furthest: F1 1, F2 2 (cancelled), F3 2, F4 3 (no history, status booked), F5 3, F6 4
--             (skipped booked), F7 3 (cancelled)
--   reached:  stage 1 = 7, 2 = 6, 3 = 4, 4 = 1
--   stopped:  stage 1 F1 open; stage 2 F3 open, F2 cancelled; stage 3 F4 and F5 open, F7
--             cancelled
--   days:     F5 10, F6 4, F7 7 -> 7.0 over 3 (F4 has no recorded commitment)
SELECT pg_temp.assert(
    (SELECT array_agg(reached ORDER BY stage) FROM fun) = ARRAY[7, 6, 4, 1],
    'each trip counts in every stage up to its furthest, from history or its status now');
SELECT pg_temp.assert(
    (SELECT array_agg(open_here ORDER BY stage) FROM fun) = ARRAY[1, 1, 2, 0]
    AND (SELECT array_agg(cancelled_here ORDER BY stage) FROM fun) = ARRAY[0, 1, 1, 0],
    'those that stopped split into still open and cancelled, at the stage they reached');
SELECT pg_temp.assert(
    (SELECT bool_and(book_days_avg = 7.0 AND book_days_n = 3) FROM fun),
    'days to book: creation to FIRST commitment, skipping booked counts, no record no sample');

-- ─────────────────────────────────────────────────────────────────────────────
-- 2b. Pipeline Value
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TEMP TABLE pst AS SELECT * FROM public.agent_report_pipeline_stages();
CREATE TEMP TABLE pmo AS SELECT * FROM public.agent_report_pipeline_months();

-- By hand. Open trips: F1, P1, P5 inquiry; F3, P2, L6 proposal; F4, P3, L1 booked; F5, P4, L5
-- traveling (the F trips are unpriced; the L trips are lifetime-value fixtures, open too).
-- Weights 25 / 50 / 100 / 100.
--   inquiry   3 trips, 100005 gross,  25001.25 -> 25001
--   proposal  3 trips, 807701 gross, 403850.5  -> 403851
--   booked    3 trips, 177777 gross, 177777
--   traveling 3 trips, 211111 gross, 211111
--   total 1296594 gross; weighted 817739.75 rounded ONCE -> 817740
SELECT pg_temp.assert(
    (SELECT array_agg((status::text, weight_pct, trip_count, gross_cents, weighted_cents)::text ORDER BY status)
       FROM pst)
    = ARRAY['(inquiry,25,3,100005,25001)', '(proposal,50,3,807701,403851)',
            '(booked,100,3,177777,177777)', '(in_progress,100,3,211111,211111)'],
    'open trips by stage, gross and weighted, by this advisor''s own (edited) weights');
SELECT pg_temp.assert(
    (SELECT bool_and(total_gross_cents = '1296594' AND total_weighted_cents = '817740') FROM pst),
    'the weighted total is rounded once from the exact sum (817739.75 -> 817740)');

-- By travel month: `past` P3 (booked, start passed, never moved on) = 77777 over 1; this month
-- P4 (traveling) = 11111 over 1; next month P1 = 25000;
-- `later` P2 = 15000.5 -> 15001; `undated` F1, F3, F4, F5, P5, L1, L5, L6 = 1.25 + 100000 +
-- 200000 + 388850 = 688851.25 -> 688851 over 8. The rest zero.
SELECT pg_temp.assert(
    (SELECT count(*) FROM pmo WHERE bucket = 'month') = 12
    AND (SELECT (trip_count, weighted_cents) = (1, '11111') FROM pmo
          WHERE bucket = 'month' AND month_start = (SELECT ms FROM c_day))
    AND (SELECT (trip_count, weighted_cents) = (1, '77777') FROM pmo WHERE bucket = 'past')
    AND (SELECT (trip_count, weighted_cents) = (1, '25000') FROM pmo
          WHERE bucket = 'month' AND month_start = (SELECT (ms + interval '1 month')::date FROM c_day)),
    'twelve months from this one; a trip traveling now counts this month, a stale one is set apart');
SELECT pg_temp.assert(
    (SELECT (trip_count, weighted_cents) = (1, '15001') FROM pmo WHERE bucket = 'later')
    AND (SELECT (trip_count, weighted_cents) = (8, '688851') FROM pmo WHERE bucket = 'undated'),
    'beyond twelve months is one row, no dates is another: nothing is dropped');
SELECT pg_temp.assert(
    (SELECT sum(weighted_cents::bigint) FROM pmo) = 817740
    AND (SELECT sum(trip_count) FROM pmo) = 12,
    'the months add back to the weighted total and every open trip');

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Doors and the export
-- ─────────────────────────────────────────────────────────────────────────────

SELECT pg_temp.expect_denied(
    format('SELECT * FROM public.report_client_lifetime_value(%L)', '0195a2c0-1a00-7000-8000-000000000001'),
    'an advisor cannot call the internal lifetime-value function with someone else''s id');
SELECT pg_temp.expect_denied(
    format('SELECT * FROM public.report_conversion_funnel(%L, %L)', '0195a2c0-1a00-7000-8000-000000000001', 'ytd'),
    'nor the funnel');
SELECT pg_temp.expect_denied(
    format('SELECT public.report_first_committed_at(%L)', '0c7f0000-0000-7000-8000-000000000205'),
    'nor the shared first-commitment helper');
SELECT pg_temp.expect_denied(
    format('SELECT * FROM public.report_pipeline_stages(%L)', '0195a2c0-1a00-7000-8000-000000000001'),
    'nor the pipeline by stage');
SELECT pg_temp.expect_denied(
    format('SELECT * FROM public.report_pipeline_months(%L)', '0195a2c0-1a00-7000-8000-000000000001'),
    'nor the pipeline by month');

-- Gyasi's seeded clients never appear in this advisor's ranking.
SELECT pg_temp.assert(
    NOT EXISTS (SELECT 1 FROM ltv WHERE display_name LIKE 'Jordan%' OR display_name LIKE 'Maya%'),
    'the ranking is this advisor''s book only');

RESET ROLE;

SELECT public.agent_report_export(:c_agent::uuid, :c_actor::uuid, 'clients', NULL, NULL,
           '0c7f0000-0000-7000-8000-0000000003b1', NULL, NULL) AS out \gset
SELECT pg_temp.assert(
    jsonb_array_length((:'out'::jsonb) -> 'rows') = 4
    AND (:'out'::jsonb) #>> '{rows,0,display_name}' = 'Bo Diddley'
    AND (:'out'::jsonb) -> 'from' = 'null'::jsonb,
    'the lifetime-value export takes no period and carries the screen''s ranking');
SELECT pg_temp.assert(
    (SELECT metadata -> 'period' = 'null'::jsonb AND metadata ->> 'report' = 'clients'
       FROM public.audit_event WHERE id = '0c7f0000-0000-7000-8000-0000000003b1'),
    'and its audit row records no period');

SELECT jsonb_array_length(public.agent_report_export(:c_agent::uuid, :c_actor::uuid, 'funnel', '12mo', NULL,
           '0c7f0000-0000-7000-8000-0000000003b2', NULL, NULL) -> 'rows') AS funnel_rows \gset
SELECT pg_temp.assert(:funnel_rows = 4, 'the funnel export has its four stages');

SELECT public.agent_report_export(:c_agent::uuid, :c_actor::uuid, 'pipeline', NULL, NULL,
           '0c7f0000-0000-7000-8000-0000000003b3', NULL, NULL) AS pipe \gset
SELECT pg_temp.assert(
    jsonb_array_length((:'pipe'::jsonb) -> 'rows') = 19
    AND (:'pipe'::jsonb) #>> '{rows,0,kind}' = 'stage'
    AND (:'pipe'::jsonb) #>> '{rows,4,kind}' = 'past'
    AND (:'pipe'::jsonb) #>> '{rows,18,kind}' = 'undated'
    AND (:'pipe'::jsonb) ->> 'today' IS NOT NULL
    AND (:'pipe'::jsonb) -> 'from' = 'null'::jsonb,
    'the pipeline export carries both tables, stages first, and no period');
SELECT pg_temp.assert(
    (SELECT metadata -> 'period' = 'null'::jsonb FROM public.audit_event
      WHERE id = '0c7f0000-0000-7000-8000-0000000003b3'),
    'and its audit row records no period');

ROLLBACK;
