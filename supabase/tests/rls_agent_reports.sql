-- §3.11 Reporting, PR 1 — Revenue by Month, Commission by Supplier, Top Destinations, and the
-- audited CSV door (migration 20261028120000_agent_reports).
--
-- WHAT THIS FILE IS GUARDING.
--
--   1. The period: ytd / 12mo / qtd boundaries and the prior-year window, including a leap day.
--   2. Revenue (booked): a trip counts ONCE, in the month of its FIRST booking, in the advisor's
--      zone; cancelled, walked-back, archived and never-dated trips do not count. Revenue
--      (received): ledger money by received_at; removed lines and another advisor's lines do
--      not count. prior_cents is NULL, not 0, for a month a year back with nothing in it.
--   3. Supplier: received vs still owed, disputed/lost set aside and counted, by travel date.
--   4. Destinations: a trip counts once per stop, its value split evenly in whole cents so the
--      column adds up; spelling variants group; trips with no stop are one honest row.
--   5. Nobody reads another advisor's book; no client role reaches the internal functions or
--      the export; the export writes its audit row in the same call and refuses unknown input.
--
-- A SECOND ADVISOR with a known book, in a zone whose date differs from UTC's right now. Every
-- fixture is placed relative to THEIR today, month start (ms) and year start (ys). Every
-- expected figure is a literal worked out by hand below, never the implementation's expression.
--
-- Run against a freshly reset local database:
--     supabase db reset
--     psql "$(supabase status -o json | jq -r .DB_URL)" -v ON_ERROR_STOP=1 \
--          -f supabase/tests/rls_agent_reports.sql

\set ON_ERROR_STOP on

BEGIN;

\set agent     '''0195a2c0-1a00-7000-8000-000000000001'''
\set jordan    '''0195a2c0-1a00-7000-8000-000000000011'''
\set b_agent   '''0c7e0000-0000-7000-8000-000000000001'''
\set b_account '''0c7e0000-0000-7000-8000-000000000002'''
\set b_client  '''0c7e0000-0000-7000-8000-000000000003'''
\set s_one     '''0c7e0000-0000-7000-8000-0000000000a1'''
\set s_two     '''0c7e0000-0000-7000-8000-0000000000a2'''

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
-- 1. The period
-- ─────────────────────────────────────────────────────────────────────────────

SELECT pg_temp.assert(
    (SELECT (from_date, to_date, prior_from, prior_to)
              = ('2026-01-01'::date, '2026-10-21'::date, '2025-01-01'::date, '2025-10-21'::date)
       FROM public.report_period_bounds('ytd', '2026-10-21')),
    'ytd is Jan 1 to today, and the same dates a year back');
SELECT pg_temp.assert(
    (SELECT (from_date, to_date) = ('2025-11-01'::date, '2026-10-21'::date)
       FROM public.report_period_bounds('12mo', '2026-10-21')),
    '12mo is this month and the eleven whole months before it');
SELECT pg_temp.assert(
    (SELECT (from_date, prior_from) = ('2026-10-01'::date, '2025-10-01'::date)
       FROM public.report_period_bounds('qtd', '2026-10-21')),
    'qtd starts on the first of the quarter');
SELECT pg_temp.assert(
    (SELECT (from_date, prior_to) = ('2028-01-01'::date, '2027-02-28'::date)
       FROM public.report_period_bounds('ytd', '2028-02-29')),
    'a leap day''s year-back is Feb 28');
SELECT pg_temp.expect_invalid(
    $q$SELECT * FROM public.report_period_bounds('week', '2026-10-21')$q$,
    'an unknown period is refused');

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. The second advisor and their book
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TEMP TABLE b_zone AS
SELECT CASE WHEN (now() AT TIME ZONE 'Pacific/Kiritimati')::date <> (now() AT TIME ZONE 'UTC')::date
            THEN 'Pacific/Kiritimati' ELSE 'Pacific/Pago_Pago' END AS tz;

INSERT INTO public.agent (id, display_name, email, status, time_zone)
SELECT :b_agent::uuid, 'Reports Test Advisor', 'reports.advisor@example.com', 'active', tz FROM b_zone;

INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change)
VALUES (:b_account::uuid,
        '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        'reports.advisor.login@example.com', 'x', now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        ('{"first_name":"Reports","last_name":"Advisor",'
         || '"agent_id":"0195a2c0-1a00-7000-8000-000000000001"}')::jsonb,
        now(), now(), '', '', '', '');

DO $$
DECLARE v_client_id uuid;
BEGIN
    SELECT client_id INTO v_client_id FROM public.platform_user
     WHERE account_id = '0c7e0000-0000-7000-8000-000000000002';
    UPDATE public.platform_user
       SET role = 'agent', agent_id = '0c7e0000-0000-7000-8000-000000000001', client_id = NULL
     WHERE account_id = '0c7e0000-0000-7000-8000-000000000002';
    DELETE FROM public.client WHERE id = v_client_id;
END $$;

SELECT pu.id AS b_actor FROM public.platform_user pu WHERE pu.account_id = :b_account::uuid \gset
\set b_actor '''':b_actor''''

INSERT INTO public.client (id, agent_id, first_name, last_name, email)
VALUES (:b_client::uuid, :b_agent::uuid, 'Reports', 'Traveler', 'reports.traveler@example.com');

-- Their today, month start and year start. Used only to PLACE fixtures.
CREATE TEMP TABLE b_day AS
SELECT d AS today,
       date_trunc('month', d::timestamp)::date AS ms,
       date_trunc('year',  d::timestamp)::date AS ys,
       tz
  FROM (SELECT (now() AT TIME ZONE tz)::date AS d, tz FROM b_zone) x;

SELECT pg_temp.assert(
    (SELECT today FROM b_day) <> (now() AT TIME ZONE 'UTC')::date,
    'the second advisor''s calendar day differs from UTC''s, so a UTC slip cannot hide');

INSERT INTO public.supplier (id, name, kind)
VALUES (:s_one::uuid, 'Report Fixture One', 'resort'),
       (:s_two::uuid, 'Report Fixture Two', 'cruise_line');

-- Revenue trips (R*) carry NO travel dates, so the supplier and destination reports, which
-- filter on start_date, never see them. Supplier and destination trips (P*, D*) carry no
-- booking history, so revenue never sees them. Each report's figures come from its own rows.
INSERT INTO public.trip (id, client_id, agent_id, title, trip_type, status, start_date, end_date,
                         archived_at, total_value_cents, destinations)
SELECT v.id::uuid, :b_client::uuid, :b_agent::uuid, v.title, 'custom', v.status::trip_status,
       CASE v.starts WHEN 'ys' THEN b.ys WHEN 'before' THEN b.ys - 1 WHEN 'after' THEN b.today + 1 END,
       CASE v.starts WHEN 'ys' THEN b.ys + 3 WHEN 'before' THEN b.ys + 2 WHEN 'after' THEN b.today + 4 END,
       CASE WHEN v.archived THEN now() END,
       v.value,
       v.dests
  FROM b_day b,
       (VALUES
        -- Revenue (booked).
        ('0c7e0000-0000-7000-8000-000000000011', 'R1 booked this month, rebooked', 'booked',      NULL, false, 100000, '{}'::text[]),
        ('0c7e0000-0000-7000-8000-000000000012', 'R2 completed, first booked ms-2', 'completed',  NULL, false,  50000, '{}'),
        ('0c7e0000-0000-7000-8000-000000000013', 'R3 cancelled',                    'cancelled',  NULL, false, 999900, '{}'),
        ('0c7e0000-0000-7000-8000-000000000014', 'R4 walked back to proposal',      'proposal',   NULL, false, 888800, '{}'),
        ('0c7e0000-0000-7000-8000-000000000015', 'R5 archived booked',              'booked',     NULL, true,  777700, '{}'),
        ('0c7e0000-0000-7000-8000-000000000016', 'R6 booked, no history',           'booked',     NULL, false, 666600, '{}'),
        ('0c7e0000-0000-7000-8000-000000000017', 'R7 booked a year ago',            'in_progress',NULL, false,  30000, '{}'),
        ('0c7e0000-0000-7000-8000-000000000018', 'R8 booked 23:30 last of ms-1',    'booked',     NULL, false,   7000, '{}'),
        ('0c7e0000-0000-7000-8000-000000000019', 'R9 straight to completed',        'completed',  NULL, false,   1000, '{}'),
        -- Supplier ledger trips.
        ('0c7e0000-0000-7000-8000-000000000021', 'P1 in the year',                  'proposal',     'ys',     false, 0, '{}'),
        ('0c7e0000-0000-7000-8000-000000000022', 'P2 archived, in the year',        'completed',  'ys',     true,  0, '{}'),
        ('0c7e0000-0000-7000-8000-000000000023', 'P3 starts the day before ys',     'completed',  'before', false, 0, '{}'),
        ('0c7e0000-0000-7000-8000-000000000024', 'P4 starts tomorrow',              'booked',     'after',  false, 0, '{}'),
        -- Destination trips.
        ('0c7e0000-0000-7000-8000-000000000031', 'D1 three stops, two spellings',   'booked',     'ys', false, 100001, ARRAY['Nassau', 'Exuma', ' nassau ']),
        ('0c7e0000-0000-7000-8000-000000000032', 'D2 Nassau',                       'completed',  'ys', false,  50000, ARRAY['Nassau']),
        ('0c7e0000-0000-7000-8000-000000000033', 'D3 no stops',                     'in_progress','ys', false,  20000, '{}'),
        ('0c7e0000-0000-7000-8000-000000000034', 'D4 blank stops only',             'booked',     'ys', false,  10000, ARRAY['', '   ']),
        ('0c7e0000-0000-7000-8000-000000000039', 'D5 double inner space',           'booked',     'ys', false,   2000, ARRAY['Grand  Bahama']),
        ('0c7e0000-0000-7000-8000-00000000003a', 'D6 single space',                 'booked',     'ys', false,   1000, ARRAY['Grand Bahama']),
        ('0c7e0000-0000-7000-8000-000000000035', 'X proposal',                      'proposal',   'ys', false, 900000, ARRAY['Nassau']),
        ('0c7e0000-0000-7000-8000-000000000036', 'X cancelled',                     'cancelled',  'ys', false, 900000, ARRAY['Nassau']),
        ('0c7e0000-0000-7000-8000-000000000037', 'X archived',                      'booked',     'ys', true,  900000, ARRAY['Nassau']),
        ('0c7e0000-0000-7000-8000-000000000038', 'X started before the year',       'completed',  'before', false, 900000, ARRAY['Nassau'])
       ) AS v(id, title, status, starts, archived, value, dests);

-- Booking history, in the advisor's own zone (local noon unless the point is the edge).
INSERT INTO public.trip_status_history (id, trip_id, from_status, to_status, changed_at)
SELECT gen_random_uuid(), v.trip::uuid, v.from_status::trip_status, v.to_status::trip_status,
       (v.local_ts AT TIME ZONE b.tz)
  FROM b_day b,
       LATERAL (VALUES
        -- R1 first booked on the 1st of this month at noon, re-booked today: ONE count, here.
        ('0c7e0000-0000-7000-8000-000000000011', 'proposal',    'booked', b.ms + time '12:00'),
        ('0c7e0000-0000-7000-8000-000000000011', 'in_progress', 'booked', b.today + time '12:00'),
        -- R2 first booked two months back, re-booked this month: counts two months back only.
        ('0c7e0000-0000-7000-8000-000000000012', 'proposal',    'booked', (b.ms - interval '2 months')::date + time '12:00'),
        ('0c7e0000-0000-7000-8000-000000000012', 'proposal',    'booked', b.ms + time '12:00'),
        ('0c7e0000-0000-7000-8000-000000000013', 'proposal',    'booked', b.ms + time '12:00'),
        ('0c7e0000-0000-7000-8000-000000000014', 'proposal',    'booked', b.ms + time '12:00'),
        ('0c7e0000-0000-7000-8000-000000000015', 'proposal',    'booked', b.ms + time '12:00'),
        -- R7 booked on the 1st of this month a year ago: the prior figure for THIS month.
        ('0c7e0000-0000-7000-8000-000000000017', 'proposal',    'booked', (b.ms - interval '1 year')::date + time '12:00'),
        -- R8 at 23:30 local on the last day of last month. In UTC that is already the 1st for
        -- a zone west of UTC; in the advisor's calendar it is last month, and that is where it
        -- must land.
        ('0c7e0000-0000-7000-8000-000000000018', 'proposal',    'booked', (b.ms - 1) + time '23:30'),
        -- R9 never passed through `booked`: entered after the fact, straight to completed. It
        -- was committed this month, and it counts this month.
        ('0c7e0000-0000-7000-8000-000000000019', 'proposal',    'completed', b.ms + time '12:00')
       ) AS v(trip, from_status, to_status, local_ts);

-- Ledger lines. Revenue (received) on the R trips; supplier figures on the P trips.
INSERT INTO public.commission
    (id, trip_id, agent_id, supplier_id, gross_booking_cents, commission_pct,
     expected_commission_cents, processing_fee_cents, received_commission_cents, currency,
     payment_terms, payment_lag_days, status, received_at, archived_at)
SELECT v.id::uuid, v.trip::uuid, v.agent::uuid, v.supplier::uuid,
       v.expected * 10, 10, v.expected, 0, v.received, 'USD', 'after_travel', 0,
       v.status::commission_status,
       CASE v.recv WHEN 'today' THEN b.today WHEN 'ms-1' THEN b.ms - 1
                   WHEN 'ms-1y' THEN (b.ms - interval '1 year')::date
                   -- Supplier lines need a received date, but must stay out of every revenue
                   -- window, prior year included.
                   WHEN 'old' THEN (b.ys - interval '3 years')::date END,
       CASE WHEN v.removed THEN now() END
  FROM b_day b,
       (VALUES
        -- Revenue (received).
        ('0c7e0000-0000-7000-8000-000000000101', '0c7e0000-0000-7000-8000-000000000011', :b_agent, :s_one, 20000, 20000, 'received', 'today', false),
        -- On an ARCHIVED trip: still real money, still counts (the ledger shows it).
        ('0c7e0000-0000-7000-8000-000000000102', '0c7e0000-0000-7000-8000-000000000015', :b_agent, :s_one,  5000,  5000, 'received', 'ms-1',  false),
        -- Removed: never counts.
        ('0c7e0000-0000-7000-8000-000000000103', '0c7e0000-0000-7000-8000-000000000011', :b_agent, :s_one,  9999,  9999, 'received', 'today', true),
        -- Another advisor's agent id on B's trip: belongs to neither, counts for nobody.
        ('0c7e0000-0000-7000-8000-000000000104', '0c7e0000-0000-7000-8000-000000000011', :agent,   :s_one,  8888,  8888, 'received', 'today', false),
        -- Expected, nothing arrived: no received date, no revenue.
        ('0c7e0000-0000-7000-8000-000000000105', '0c7e0000-0000-7000-8000-000000000012', :b_agent, :s_one, 12345,     0, 'expected', NULL,    false),
        -- A year back: this month's prior figure.
        ('0c7e0000-0000-7000-8000-000000000106', '0c7e0000-0000-7000-8000-000000000017', :b_agent, :s_one,  4000,  4000, 'received', 'ms-1y', false),
        -- Supplier One on P1: received 20000; expected 30000 + invoiced 10000 owed; disputed and
        -- lost set aside.
        ('0c7e0000-0000-7000-8000-000000000201', '0c7e0000-0000-7000-8000-000000000021', :b_agent, :s_one, 20000, 20000, 'received', 'old', false),
        ('0c7e0000-0000-7000-8000-000000000202', '0c7e0000-0000-7000-8000-000000000021', :b_agent, :s_one, 30000,     0, 'expected', NULL, false),
        ('0c7e0000-0000-7000-8000-000000000203', '0c7e0000-0000-7000-8000-000000000021', :b_agent, :s_one, 10000,     0, 'invoiced', NULL, false),
        -- Disputed after a part payment of 1500 arrived: in neither column, named in the footnote.
        ('0c7e0000-0000-7000-8000-000000000204', '0c7e0000-0000-7000-8000-000000000021', :b_agent, :s_one,  7000,  1500, 'disputed', 'old', false),
        ('0c7e0000-0000-7000-8000-000000000205', '0c7e0000-0000-7000-8000-000000000021', :b_agent, :s_one,  3000,     0, 'lost',     NULL, false),
        -- Supplier Two on the ARCHIVED P2: received 50000, counts.
        ('0c7e0000-0000-7000-8000-000000000206', '0c7e0000-0000-7000-8000-000000000022', :b_agent, :s_two, 50000, 50000, 'received', 'old', false),
        -- Outside the period, removed, or not this advisor's: none count.
        ('0c7e0000-0000-7000-8000-000000000207', '0c7e0000-0000-7000-8000-000000000023', :b_agent, :s_two, 70000, 70000, 'received', 'old', false),
        ('0c7e0000-0000-7000-8000-000000000208', '0c7e0000-0000-7000-8000-000000000024', :b_agent, :s_two, 70000,     0, 'expected', NULL, false),
        ('0c7e0000-0000-7000-8000-000000000209', '0c7e0000-0000-7000-8000-000000000021', :b_agent, :s_two, 70000,     0, 'expected', NULL, true),
        ('0c7e0000-0000-7000-8000-00000000020a', '0c7e0000-0000-7000-8000-000000000021', :agent,   :s_two, 70000, 70000, 'received', 'old', false)
       ) AS v(id, trip, agent, supplier, expected, received, status, recv, removed);

GRANT SELECT ON b_day, b_zone TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Revenue by Month (as the second advisor, through the screen's door)
-- ─────────────────────────────────────────────────────────────────────────────

SELECT pg_temp.become(:b_account::uuid);

CREATE TEMP TABLE rev_booked AS
SELECT * FROM public.agent_report_revenue_by_month('12mo', 'booked');
CREATE TEMP TABLE rev_received AS
SELECT * FROM public.agent_report_revenue_by_month('12mo', 'received');

SELECT pg_temp.assert(
    (SELECT count(*) FROM rev_booked) = 12
    AND (SELECT min(month_start) FROM rev_booked) = (SELECT (ms - interval '11 months')::date FROM b_day)
    AND (SELECT max(month_start) FROM rev_booked) = (SELECT ms FROM b_day),
    '12mo is twelve zero-filled months, ending with the advisor''s own current month');

-- By hand: this month R1 = 100000 (once, though booked twice) + R9 = 1000 (straight to
-- completed, never `booked`); last month R8 = 7000 (23:30 local, not the UTC day); two months
-- back R2 = 50000. Cancelled R3, walked-back R4, archived R5, history-less R6 and the year-old
-- R7 are not in the window's bars. 158000 in all.
SELECT pg_temp.assert(
    (SELECT cents FROM rev_booked WHERE month_start = (SELECT ms FROM b_day)) = '101000'
    AND (SELECT item_count FROM rev_booked WHERE month_start = (SELECT ms FROM b_day)) = 2,
    'booked: R1 counts once though booked twice, and R9 counts though it skipped `booked`');
SELECT pg_temp.assert(
    (SELECT cents FROM rev_booked WHERE month_start = (SELECT (ms - interval '1 month')::date FROM b_day)) = '7000',
    'booked: 23:30 on the last of last month, local, is last month');
SELECT pg_temp.assert(
    (SELECT cents FROM rev_booked WHERE month_start = (SELECT (ms - interval '2 months')::date FROM b_day)) = '50000',
    'booked: a completed trip re-booked this month stays in its first month');
SELECT pg_temp.assert(
    (SELECT sum(cents::bigint) FROM rev_booked) = 158000,
    'booked: cancelled, walked back, archived and undated trips are left out (158000 in all)');
SELECT pg_temp.assert(
    (SELECT prior_cents FROM rev_booked WHERE month_start = (SELECT ms FROM b_day)) = '30000'
    AND (SELECT count(*) FROM rev_booked WHERE prior_cents IS NOT NULL) = 1,
    'booked: this month a year ago is 30000 (R7); every other prior month is NULL, not 0');

-- By hand: today 20000 (the removed 9999 and the other advisor's 8888 do not count); last
-- month 5000 from the archived trip; a year back 4000.
SELECT pg_temp.assert(
    (SELECT cents FROM rev_received WHERE month_start = (SELECT ms FROM b_day)) = '20000'
    AND (SELECT item_count FROM rev_received WHERE month_start = (SELECT ms FROM b_day)) = 1,
    'received: only this advisor''s live line counts this month');
SELECT pg_temp.assert(
    (SELECT cents FROM rev_received WHERE month_start = (SELECT (ms - interval '1 month')::date FROM b_day)) = '5000',
    'received: money on an archived trip still counts');
SELECT pg_temp.assert(
    (SELECT sum(cents::bigint) FROM rev_received) = 25000
    AND (SELECT prior_cents FROM rev_received WHERE month_start = (SELECT ms FROM b_day)) = '4000',
    'received: 25000 in the window, and 4000 a year back');

SELECT pg_temp.expect_invalid(
    $q$SELECT * FROM public.agent_report_revenue_by_month('12mo', 'gross')$q$,
    'an unknown basis is refused');

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Commission by Supplier
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TEMP TABLE sup AS SELECT * FROM public.agent_report_commission_by_supplier('ytd');

-- By hand: One received 20000, owed 30000 + 10000, 3 counted lines, 2 set aside. Two received
-- 50000 on the archived P2, 1 line. P3 (day before the year), P4 (tomorrow), the removed line
-- and the other advisor's line are nowhere. One (60000) ranks above Two (50000).
SELECT pg_temp.assert(
    (SELECT array_agg(supplier_name ORDER BY ord) FROM (SELECT supplier_name, row_number() OVER () AS ord FROM sup) x)
        = ARRAY['Report Fixture One', 'Report Fixture Two'],
    'suppliers rank by received + owed');
SELECT pg_temp.assert(
    (SELECT (received_cents, owed_cents, line_count, set_aside_count, set_aside_received_cents)
              = ('20000', '40000', 3, 2, '1500')
       FROM sup WHERE supplier_id = :s_one::uuid),
    'received vs still owed (expected + invoiced); disputed and lost set aside, counted, and '
    'the 1500 already received on the disputed line named, not summed');
SELECT pg_temp.assert(
    (SELECT (received_cents, owed_cents, line_count, set_aside_count) = ('50000', '0', 1, 0)
       FROM sup WHERE supplier_id = :s_two::uuid),
    'a line on an archived trip counts; out-of-period, removed and foreign lines do not');

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Top Destinations
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TEMP TABLE dest AS SELECT * FROM public.agent_report_top_destinations('ytd');

-- By hand: D1 is 100001 over three stops: 33334, 33334, 33333 (the first 100001 % 3 = 2 stops
-- take the extra cent). "Nassau" and " nassau " are one place: 33334 + 33333 + D2's 50000 =
-- 116667 over 2 trips. Exuma 33334, 1 trip. D3 (no stops) and D4 (blank stops) are the NULL
-- row: 30000, 2 trips. "Grand  Bahama" (two inner spaces) and "Grand Bahama" are one place:
-- 3000 over 2 trips. Total 183001 = 100001 + 50000 + 20000 + 10000 + 2000 + 1000, to the cent.
SELECT pg_temp.assert(
    (SELECT (trip_count, value_cents) = (2, '116667') FROM dest WHERE destination = 'Nassau'),
    'spellings group; a trip counts once per place; Nassau is 116667 over 2 trips');
SELECT pg_temp.assert(
    (SELECT (trip_count, value_cents) = (1, '33334') FROM dest WHERE destination = 'Exuma'),
    'the extra cent goes to the earlier stops');
SELECT pg_temp.assert(
    (SELECT (trip_count, value_cents) = (2, '30000') FROM dest WHERE destination IS NULL),
    'trips with no stop (or only blank ones) are one honest row');
SELECT pg_temp.assert(
    (SELECT (trip_count, value_cents) = (2, '3000') FROM dest WHERE destination = 'Grand Bahama'),
    'repeated inner spaces group with the single-spaced spelling');
SELECT pg_temp.assert(
    (SELECT count(*) FROM dest) = 4 AND (SELECT sum(value_cents::bigint) FROM dest) = 183001,
    'the value column adds up to the committed trips'' total exactly; proposal, cancelled, '
    'archived and out-of-period trips are left out');
SELECT pg_temp.assert(
    (SELECT array_agg(coalesce(destination, '∅') ORDER BY ord)
       FROM (SELECT destination, row_number() OVER () AS ord FROM dest) x)
        = ARRAY['Nassau', 'Exuma', '∅', 'Grand Bahama'],
    'ranked by value');

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Doors: nobody else's book, no internal functions, no export
-- ─────────────────────────────────────────────────────────────────────────────

SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_report_period('ytd')) = 1,
    'an advisor gets their period row');

SELECT pg_temp.expect_denied(
    format('SELECT * FROM public.report_commission_by_supplier(%L, %L)', :agent, 'ytd'),
    'an advisor cannot call the internal function with someone else''s id');
SELECT pg_temp.expect_denied(
    format('SELECT * FROM public.report_revenue_by_month(%L, %L, %L)', :agent, 'ytd', 'booked'),
    'nor the revenue one');
SELECT pg_temp.expect_denied(
    format('SELECT * FROM public.report_top_destinations(%L, %L)', :agent, 'ytd'),
    'nor the destinations one');
SELECT pg_temp.expect_denied(
    format('SELECT public.agent_report_export(%L, %L, %L, %L, NULL, gen_random_uuid(), NULL, NULL)',
           :agent, :b_actor, 'suppliers', 'ytd'),
    'an advisor cannot call the export directly (it skips the Edge Function''s audit inputs)');

-- Below aal2 the advisor side answers nothing: current_agent_id() requires the second factor.
SELECT set_config('request.jwt.claims',
    json_build_object('sub', :b_account, 'role', 'authenticated', 'aal', 'aal1')::text, true);
SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_report_period('ytd')) = 0
    AND (SELECT count(*) FROM public.agent_report_commission_by_supplier('ytd')) = 0,
    'an advisor signed in without their second factor gets no period row and no report');
SELECT pg_temp.become(:b_account::uuid);

-- None of Gyasi's seeded suppliers appear in B's report.
SELECT pg_temp.assert(
    NOT EXISTS (SELECT 1 FROM sup WHERE supplier_name = 'Sandals Resorts'),
    'the second advisor never sees the first advisor''s ledger');

-- A traveler: no period row, and every report empty.
SELECT pg_temp.become(:jordan::uuid);
SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_report_period('ytd')) = 0
    AND (SELECT count(*) FROM public.agent_report_revenue_by_month('ytd', 'booked')) = 0
    AND (SELECT count(*) FROM public.agent_report_commission_by_supplier('ytd')) = 0
    AND (SELECT count(*) FROM public.agent_report_top_destinations('ytd')) = 0,
    'a traveler gets no period row and no report rows');

RESET ROLE;
SET LOCAL role anon;
SELECT pg_temp.expect_denied(
    $q$SELECT * FROM public.agent_report_period('ytd')$q$,
    'anon cannot reach the reports');
RESET ROLE;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. The export (as the service role would call it)
-- ─────────────────────────────────────────────────────────────────────────────

SELECT public.agent_report_export(:b_agent::uuid, :b_actor::uuid, 'suppliers', 'ytd', NULL,
           '0c7e0000-0000-7000-8000-0000000003a1', '203.0.113.7, 10.0.0.1', 'test agent') AS out \gset

SELECT pg_temp.assert(
    jsonb_array_length((:'out'::jsonb) -> 'rows') = 2
    AND (:'out'::jsonb) #>> '{rows,0,supplier_name}' = 'Report Fixture One'
    AND (:'out'::jsonb) #>> '{rows,0,owed_cents}' = '40000'
    AND ((:'out'::jsonb) ->> 'from')::date = (SELECT ys FROM b_day)
    AND ((:'out'::jsonb) ->> 'to')::date = (SELECT today FROM b_day),
    'the export returns the screen''s own rows and the period it covered');

SELECT pg_temp.assert(
    (SELECT event_type = 'report.exported'
            AND actor_user_id = :b_actor::uuid
            AND target_id = :b_agent::uuid
            AND metadata ->> 'report' = 'suppliers'
            AND metadata ->> 'period' = 'ytd'
            AND (metadata ->> 'row_count')::int = 2
            AND metadata -> 'basis' = 'null'::jsonb
            AND ip_address = '203.0.113.7'::inet
       FROM public.audit_event WHERE id = '0c7e0000-0000-7000-8000-0000000003a1'),
    'one audit row, with the report, period and row count, and the first forwarded ip');

-- Two statements: within one, a read after the export's own insert sees the old snapshot.
SELECT jsonb_array_length(public.agent_report_export(:b_agent::uuid, :b_actor::uuid, 'revenue', '12mo',
           'received', '0c7e0000-0000-7000-8000-0000000003a2', NULL, NULL) -> 'rows') AS rev_rows \gset
SELECT pg_temp.assert(
    :rev_rows = 12
    AND (SELECT metadata ->> 'basis' FROM public.audit_event
          WHERE id = '0c7e0000-0000-7000-8000-0000000003a2') = 'received',
    'a revenue export carries its basis in the audit row');

-- The actor must be this advisor's own sign-in, or the audit row would name the wrong person.
SELECT pg_temp.expect_denied(
    format('SELECT public.agent_report_export(%L, %L, %L, %L, NULL, %L, NULL, NULL)',
           :agent, :b_actor, 'suppliers', 'ytd', '0c7e0000-0000-7000-8000-0000000003a5'),
    'an export filed under another advisor''s sign-in is refused');

SELECT pg_temp.expect_invalid(
    format('SELECT public.agent_report_export(%L, %L, %L, %L, NULL, %L, NULL, NULL)',
           :b_agent, :b_actor, 'payroll', 'ytd', '0c7e0000-0000-7000-8000-0000000003a3'),
    'an unknown report is refused');
SELECT pg_temp.assert(
    NOT EXISTS (SELECT 1 FROM public.audit_event WHERE id = '0c7e0000-0000-7000-8000-0000000003a3'),
    'and leaves no audit row behind');

UPDATE public.agent SET status = 'archived' WHERE id = :b_agent::uuid;
SELECT public.agent_report_export(:b_agent::uuid, :b_actor::uuid, 'suppliers', 'ytd', NULL,
           '0c7e0000-0000-7000-8000-0000000003a4', NULL, NULL) IS NULL AS archived_null \gset
SELECT pg_temp.assert(
    :'archived_null'::boolean
    AND NOT EXISTS (SELECT 1 FROM public.audit_event WHERE id = '0c7e0000-0000-7000-8000-0000000003a4'),
    'an archived advisor exports nothing and nothing is audited');

ROLLBACK;
