-- §3.7 Stage 4 — 3.7.7 Commission Forecast: the weighted forecast by stage, the cash-in
-- calendar, and saving the stage weights.
--
-- WHAT THIS FILE IS GUARDING.
--
--   1. The forecast's totals ARE agent_kpis' own, the numbers behind the worklist's "Commission
--      expected": same trips, same weights, rounded the same way (Gyasi, 2026-10-12).
--   2. The calendar places each booking in the month its supplier should pay — after travel /
--      at booking + lag, or 60 days after travel with no terms (Gyasi, 2026-10-12) — and takes
--      money already received off the trip, so calendar + received = forecast.
--   3. Saving weights is the advisor's own, audited, refuses a stale save, and moves the
--      worklist figure with it.
--
-- A SECOND ADVISOR with a known book, in a time zone whose date differs from UTC's right now,
-- with every fixture placed relative to the first of THEIR month. Every assertion is a literal.
--
-- Run against a freshly reset local database:
--     supabase db reset
--     psql "$(supabase status -o json | jq -r .DB_URL)" -v ON_ERROR_STOP=1 \
--          -f supabase/tests/rls_agent_commission_forecast.sql

\set ON_ERROR_STOP on

BEGIN;

\set gyasi     '''0195a2c0-1a00-7000-8000-000000000010'''
\set jordan    '''0195a2c0-1a00-7000-8000-000000000011'''
\set agent     '''0195a2c0-1a00-7000-8000-000000000001'''
\set b_agent   '''0c7d0000-0000-7000-8000-000000000001'''
\set b_account '''0c7d0000-0000-7000-8000-000000000002'''
\set b_client  '''0c7d0000-0000-7000-8000-000000000003'''
\set s_after30 '''0c7d0000-0000-7000-8000-0000000000a1'''
\set s_book15  '''0c7d0000-0000-7000-8000-0000000000a2'''
\set s_none    '''0c7d0000-0000-7000-8000-0000000000a3'''
\set s_edge1   '''0c7d0000-0000-7000-8000-0000000000a4'''
\set s_edge2   '''0c7d0000-0000-7000-8000-0000000000a5'''

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

CREATE OR REPLACE FUNCTION pg_temp.expect_error(stmt text, description text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    EXECUTE stmt;
    RAISE EXCEPTION 'FAILED: % — statement succeeded, expected an error', description;
EXCEPTION
    WHEN raise_exception OR invalid_text_representation OR check_violation THEN
        IF SQLERRM LIKE 'FAILED:%' THEN RAISE; END IF;
        RAISE NOTICE '  ok    %', description;
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
-- 0. The second advisor and their book
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TEMP TABLE b_zone AS
SELECT CASE WHEN (now() AT TIME ZONE 'Pacific/Kiritimati')::date <> (now() AT TIME ZONE 'UTC')::date
            THEN 'Pacific/Kiritimati' ELSE 'Pacific/Pago_Pago' END AS tz;

INSERT INTO public.agent (id, display_name, email, status, time_zone)
SELECT :b_agent::uuid, 'Forecast Test Advisor', 'forecast.advisor@example.com', 'active', tz FROM b_zone;

INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change)
VALUES (:b_account::uuid,
        '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        'forecast.advisor.login@example.com', 'x', now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        ('{"first_name":"Forecast","last_name":"Advisor",'
         || '"agent_id":"0195a2c0-1a00-7000-8000-000000000001"}')::jsonb,
        now(), now(), '', '', '', '');

DO $$
DECLARE v_client_id uuid;
BEGIN
    SELECT client_id INTO v_client_id FROM public.platform_user
     WHERE account_id = '0c7d0000-0000-7000-8000-000000000002';
    UPDATE public.platform_user
       SET role = 'agent', agent_id = '0c7d0000-0000-7000-8000-000000000001', client_id = NULL
     WHERE account_id = '0c7d0000-0000-7000-8000-000000000002';
    DELETE FROM public.client WHERE id = v_client_id;
END $$;

SELECT pu.id AS b_actor FROM public.platform_user pu WHERE pu.account_id = :b_account::uuid \gset
\set b_actor '''':b_actor''''

INSERT INTO public.client (id, agent_id, first_name, last_name, email)
VALUES (:b_client::uuid, :b_agent::uuid, 'Forecast', 'Traveler', 'forecast.traveler@example.com');

-- Their today and the first of their month. Used only to PLACE fixtures.
CREATE TEMP TABLE b_day AS
SELECT d AS today, date_trunc('month', d)::date AS ms
  FROM (SELECT (now() AT TIME ZONE tz)::date AS d FROM b_zone) x;

SELECT pg_temp.assert(
    (SELECT today FROM b_day) <> (now() AT TIME ZONE 'UTC')::date,
    'the second advisor''s calendar day differs from UTC''s, so a UTC slip cannot hide');

-- Two at-booking suppliers whose lag puts a never-booked trip's payment exactly on the
-- advisor's month edge: the FIRST of next month and the LAST of this one. Under a UTC slip in
-- `today` one of the two moves month, whichever side of UTC the advisor's zone is on.
INSERT INTO public.supplier (id, name, kind, commission_payment_terms, commission_payment_lag_days)
SELECT v.id::uuid, v.name, v.kind::supplier_kind, v.terms::commission_payment_terms, v.lag
  FROM b_day b,
       LATERAL (VALUES
        (:s_after30, 'Fixture After Travel', 'resort',        'after_travel', 30),
        (:s_book15,  'Fixture At Booking',   'cruise_line',   'at_booking',   15),
        (:s_none,    'Fixture No Terms',     'tour_operator', NULL,           NULL),
        (:s_edge1,   'Fixture Edge First',   'cruise_line',   'at_booking',
             ((b.ms + interval '1 month')::date - b.today)),
        (:s_edge2,   'Fixture Edge Last',    'cruise_line',   'at_booking',
             ((b.ms + interval '1 month')::date - 1 - b.today))
       ) AS v(id, name, kind, terms, lag);

-- Trips, relative to the first of the advisor's month (ms). Totals come from the components,
-- through the trip-totals trigger — except T11's, set by hand with no bookings at all.
INSERT INTO public.trip (id, client_id, agent_id, title, trip_type, status, start_date, end_date,
                         archived_at, total_commission_cents)
SELECT v.id::uuid, :b_client::uuid, :b_agent::uuid, v.title, 'custom', v.status::trip_status,
       CASE WHEN v.ends IS NULL THEN NULL ELSE b.ms + v.ends - 3 END,
       CASE WHEN v.ends IS NULL THEN NULL ELSE b.ms + v.ends END,
       CASE WHEN v.archived THEN now() END,
       v.total
  FROM b_day b,
       (VALUES
        -- T1 booked, ends ms+5, TWO bookings after travel +30 → ms+35: NEXT month, one trip.
        ('0c7d0000-0000-7000-8000-000000000011', 'T1 booked after-travel', 'booked',       5, false, 0),
        -- T2 booked 100 days ago, at booking +15 → today-85: OVERDUE.
        ('0c7d0000-0000-7000-8000-000000000012', 'T2 booked at-booking',   'booked',     300, false, 0),
        -- T3 proposal (50% of $300.01 = $150.005), no terms, ends ms+40. A $180 DISPUTED payment
        -- already arrived: more than its weighted total, so only $150.005 comes off, and none
        -- is left to come.
        ('0c7d0000-0000-7000-8000-000000000013', 'T3 proposal no terms',   'proposal',    40, false, 0),
        -- T4 booked, no end date, no terms: NO TRAVEL DATES YET.
        ('0c7d0000-0000-7000-8000-000000000014', 'T4 booked undated',      'booked',    NULL, false, 0),
        -- T5 booked, ends ms+400, after travel +30: LATER than twelve months.
        ('0c7d0000-0000-7000-8000-000000000015', 'T5 booked far',          'booked',     400, false, 0),
        -- T6 traveling, ends ms+150, no terms → ms+210: SIXTH month on. $200 already received;
        -- a $70 line whose two agent ids disagree is NOT this advisor's and is not taken off.
        ('0c7d0000-0000-7000-8000-000000000016', 'T6 in progress',         'in_progress', 150, false, 0),
        -- T7 proposal, never booked, at booking +15 → assumed booked today: today+15.
        ('0c7d0000-0000-7000-8000-000000000017', 'T7 proposal at-booking', 'proposal',   200, false, 0),
        -- T7a / T7b proposals, never booked, landing on the first of next month / the last of this.
        ('0c7d0000-0000-7000-8000-00000000017a', 'T7a month edge first',   'proposal',   200, false, 0),
        ('0c7d0000-0000-7000-8000-00000000017b', 'T7b month edge last',    'proposal',   200, false, 0),
        -- T9 inquiry (20% of $100.03 = $20.006), ends ms+5, no terms → ms+65: SECOND month on.
        ('0c7d0000-0000-7000-8000-000000000019', 'T9 inquiry',             'inquiry',      5, false, 0),
        -- T11 proposal with a total written by hand and no bookings: $500 at 50%, NO DATE.
        ('0c7d0000-0000-7000-8000-00000000001d', 'T11 hand-set total',     'proposal',   200, false, 50000),
        -- T12 booked 16 days ago, at booking +15 → due YESTERDAY: overdue, though this month.
        ('0c7d0000-0000-7000-8000-00000000001e', 'T12 due yesterday',      'booked',     300, false, 0),
        -- Never counted: completed, cancelled, archived.
        ('0c7d0000-0000-7000-8000-00000000001a', 'X completed',            'completed',   10, false, 0),
        ('0c7d0000-0000-7000-8000-00000000001b', 'X cancelled',            'cancelled',   10, false, 0),
        ('0c7d0000-0000-7000-8000-00000000001c', 'X archived booked',      'booked',      10, true,  0)
       ) AS v(id, title, status, ends, archived, total);

INSERT INTO public.trip_component (id, trip_id, kind, display_name, supplier_id, cost_cents, commission_cents, currency)
VALUES
    ('0c7d0000-0000-7000-8000-000000000101', '0c7d0000-0000-7000-8000-000000000011', 'hotel',  'C1',  :s_after30::uuid, 100000, 10000, 'USD'),
    ('0c7d0000-0000-7000-8000-00000000011b', '0c7d0000-0000-7000-8000-000000000011', 'hotel',  'C1b', :s_after30::uuid,  50000,  5000, 'USD'),
    ('0c7d0000-0000-7000-8000-000000000102', '0c7d0000-0000-7000-8000-000000000012', 'cruise', 'C2',  :s_book15::uuid,  200000, 20000, 'USD'),
    ('0c7d0000-0000-7000-8000-000000000103', '0c7d0000-0000-7000-8000-000000000013', 'custom', 'C3',  NULL,              300000, 30001, 'USD'),
    ('0c7d0000-0000-7000-8000-000000000104', '0c7d0000-0000-7000-8000-000000000014', 'custom', 'C4',  :s_none::uuid,    400000, 40000, 'USD'),
    ('0c7d0000-0000-7000-8000-000000000105', '0c7d0000-0000-7000-8000-000000000015', 'hotel',  'C5',  :s_after30::uuid, 500000, 50000, 'USD'),
    ('0c7d0000-0000-7000-8000-000000000106', '0c7d0000-0000-7000-8000-000000000016', 'custom', 'C6',  :s_none::uuid,    600000, 60000, 'USD'),
    ('0c7d0000-0000-7000-8000-000000000107', '0c7d0000-0000-7000-8000-000000000017', 'cruise', 'C7',  :s_book15::uuid,   80000,  8000, 'USD'),
    ('0c7d0000-0000-7000-8000-00000000017a', '0c7d0000-0000-7000-8000-00000000017a', 'cruise', 'C7a', :s_edge1::uuid,    60000,  6000, 'USD'),
    ('0c7d0000-0000-7000-8000-00000000017b', '0c7d0000-0000-7000-8000-00000000017b', 'cruise', 'C7b', :s_edge2::uuid,    40000,  4000, 'USD'),
    ('0c7d0000-0000-7000-8000-000000000109', '0c7d0000-0000-7000-8000-000000000019', 'custom', 'C9',  NULL,              100000, 10003, 'USD'),
    ('0c7d0000-0000-7000-8000-00000000011e', '0c7d0000-0000-7000-8000-00000000001e', 'cruise', 'C12', :s_book15::uuid,   30000,  3000, 'USD'),
    ('0c7d0000-0000-7000-8000-00000000010a', '0c7d0000-0000-7000-8000-00000000001a', 'custom', 'XA',  NULL,              100000, 99900, 'USD'),
    ('0c7d0000-0000-7000-8000-00000000010b', '0c7d0000-0000-7000-8000-00000000001b', 'custom', 'XB',  NULL,              100000, 99900, 'USD'),
    ('0c7d0000-0000-7000-8000-00000000010c', '0c7d0000-0000-7000-8000-00000000001c', 'custom', 'XC',  NULL,              100000, 99900, 'USD'),
    -- A removed booking on T1: never counted.
    ('0c7d0000-0000-7000-8000-00000000010d', '0c7d0000-0000-7000-8000-000000000011', 'custom', 'gone', NULL,             100000, 77700, 'USD');
UPDATE public.trip_component SET archived_at = now() WHERE id = '0c7d0000-0000-7000-8000-00000000010d';

-- T2 first booked 100 days ago (and re-booked since, which must not move it); T12 16 days ago.
INSERT INTO public.trip_status_history (id, trip_id, from_status, to_status, changed_at)
VALUES (gen_random_uuid(), '0c7d0000-0000-7000-8000-000000000012', 'proposal', 'booked', now() - interval '100 days'),
       (gen_random_uuid(), '0c7d0000-0000-7000-8000-000000000012', 'in_progress', 'booked', now() - interval '2 days'),
       (gen_random_uuid(), '0c7d0000-0000-7000-8000-00000000001e', 'proposal', 'booked', now() - interval '16 days');

-- Ledger money on the open trips: what comes off, and what must not.
INSERT INTO public.commission
    (id, trip_id, agent_id, supplier_id, gross_booking_cents, commission_pct,
     expected_commission_cents, processing_fee_cents, received_commission_cents, currency,
     payment_terms, payment_lag_days, status, received_at)
SELECT v.id::uuid, v.trip::uuid, v.agent::uuid, :s_none::uuid,
       v.gross, 10, v.gross / 10, 0, v.received, 'USD', 'after_travel', 0, v.status::commission_status,
       CASE WHEN v.received > 0 THEN b.today - 1 END
  FROM b_day b,
       (VALUES
        -- T6: $200 received (comes off), $50 merely expected (does not).
        ('0c7d0000-0000-7000-8000-000000000201', '0c7d0000-0000-7000-8000-000000000016', :b_agent, 200000, 20000, 'received'),
        ('0c7d0000-0000-7000-8000-000000000202', '0c7d0000-0000-7000-8000-000000000016', :b_agent,  50000,     0, 'expected'),
        -- T6: $70 on a line whose agent id is ANOTHER advisor's. Not this advisor's money.
        ('0c7d0000-0000-7000-8000-000000000203', '0c7d0000-0000-7000-8000-000000000016', :agent,    70000,  7000, 'received'),
        -- T3: $180 DISPUTED, more than T3's whole weighted total.
        ('0c7d0000-0000-7000-8000-000000000204', '0c7d0000-0000-7000-8000-000000000013', :b_agent, 200000, 18000, 'disputed')
       ) AS v(id, trip, agent, gross, received, status);

GRANT SELECT ON b_day, b_zone TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. No client role writes; nobody else reads
-- ─────────────────────────────────────────────────────────────────────────────

SELECT pg_temp.become(:b_account::uuid);
SELECT pg_temp.expect_denied(
    $q$SELECT public.agent_set_pipeline_weights(NULL, NULL, '{}', '{}', NULL, NULL, NULL)$q$,
    'even the owning advisor cannot call agent_set_pipeline_weights over /rpc/');
SELECT pg_temp.expect_denied('UPDATE public.pipeline_weight SET weight_pct = 0',
    'and the weights table itself stays closed');
RESET ROLE;

SELECT pg_temp.become(:jordan::uuid);
SELECT pg_temp.assert(
    NOT EXISTS (SELECT 1 FROM public.agent_commission_forecast())
    AND NOT EXISTS (SELECT 1 FROM public.agent_commission_cash_in()),
    'a traveler gets no forecast rows and no calendar, not a frame of zeros');
RESET ROLE;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. The forecast
-- ─────────────────────────────────────────────────────────────────────────────

SELECT pg_temp.become(:b_account::uuid);

CREATE TEMP TABLE f AS SELECT * FROM public.agent_commission_forecast();
CREATE TEMP TABLE c AS SELECT * FROM public.agent_commission_cash_in();
CREATE TEMP TABLE k AS SELECT commission_weighted_cents, commission_expected_cents FROM public.agent_kpis();

SELECT pg_temp.assert(
    (SELECT array_agg(status::text ORDER BY array_position(ARRAY['inquiry','proposal','booked','in_progress'], status::text))
       FROM f) = ARRAY['inquiry', 'proposal', 'booked', 'in_progress'],
    'one row per open stage, in pipeline order; completed and cancelled are not stages here');

SELECT pg_temp.assert(
    (SELECT weight_pct = 20 AND trip_count = 1 AND raw_cents = '10003'  AND weighted_cents = '2001'   FROM f WHERE status = 'inquiry')
    AND (SELECT weight_pct = 50 AND trip_count = 5 AND raw_cents = '98001'  AND weighted_cents = '49001'  FROM f WHERE status = 'proposal')
    AND (SELECT weight_pct = 100 AND trip_count = 5 AND raw_cents = '128000' AND weighted_cents = '128000' FROM f WHERE status = 'booked')
    AND (SELECT weight_pct = 100 AND trip_count = 1 AND raw_cents = '60000'  AND weighted_cents = '60000'  FROM f WHERE status = 'in_progress'),
    'each stage: its weight, its trips, their commission and the weighted amount; the archived, '
    'completed and cancelled trips and the removed booking count nowhere; the hand-set total does');

-- Inquiry $20.006 and proposal $490.005: rounded per stage they add to $2,390.02; the exact sum
-- $2,390.011 rounds ONCE to $2,390.01, which is what agent_kpis shows.
SELECT pg_temp.assert(
    (SELECT bool_and(total_raw_cents = '296004' AND total_weighted_cents = '239001') FROM f)
    AND (SELECT commission_weighted_cents = '239001' AND commission_expected_cents = '296004' FROM k),
    'the forecast''s totals are agent_kpis'' own, rounded once from the exact sum, not added from '
    'rounded stages ($2,390.01, not $2,390.02)');

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. The cash-in calendar
-- ─────────────────────────────────────────────────────────────────────────────

-- Month index n = the n-th month from the advisor's current month.
CREATE TEMP TABLE c_idx AS
SELECT c.bucket, c.cents::bigint AS cents, c.trip_count,
       CASE WHEN c.bucket = 'month'
            THEN (extract(year FROM age(c.month_start, b.ms)) * 12 + extract(month FROM age(c.month_start, b.ms)))::int END AS n,
       c.received_cents
  FROM c, b_day b;

SELECT pg_temp.assert(
    (SELECT count(*) FROM c_idx WHERE bucket = 'month') = 12
    AND (SELECT array_agg(n ORDER BY n) FROM c_idx WHERE bucket = 'month') = ARRAY[0,1,2,3,4,5,6,7,8,9,10,11]
    AND (SELECT count(*) FROM c_idx WHERE bucket IN ('overdue', 'later', 'undated')) = 3,
    'twelve months from the advisor''s own current month, plus overdue, later and undated — every row, zero or not');

SELECT (b.today + 15) >= (b.ms + interval '1 month')::date AS t7_next FROM b_day b \gset

-- Running totals: overdue $230; this month $20 (+$40 for T7); next $180 (+$40); then T9's
-- $20.006 makes the running total $460.006, rounded $460.01, so that row shows $20.01; the
-- rows after stay whole. T3's money is all in already.
SELECT pg_temp.assert(
    (SELECT cents FROM c_idx WHERE bucket = 'overdue') = 23000
    AND (SELECT cents FROM c_idx WHERE n = 0) = 2000 + CASE WHEN :'t7_next' THEN 0 ELSE 4000 END
    AND (SELECT cents FROM c_idx WHERE n = 1) = 18000 + CASE WHEN :'t7_next' THEN 4000 ELSE 0 END
    AND (SELECT cents FROM c_idx WHERE n = 2) = 2001
    AND (SELECT cents FROM c_idx WHERE n = 3) = 0
    AND (SELECT cents FROM c_idx WHERE n = 6) = 40000
    AND (SELECT cents FROM c_idx WHERE bucket = 'later') = 50000
    AND (SELECT cents FROM c_idx WHERE bucket = 'undated') = 65000
    AND (SELECT sum(cents) FROM c_idx WHERE n IN (4, 5, 7, 8, 9, 10, 11)) = 0,
    'each booking lands where its terms put it: after travel +30 next month; at booking +15 from '
    'the FIRST booking, overdue; due yesterday is overdue though it is this month; no terms 60 '
    'days after travel; a proposal not yet booked as if booked today; no end date, or a hand-set '
    'total with no bookings, undated; past twelve months later; each at its stage''s weight');

SELECT pg_temp.assert(
    (SELECT trip_count FROM c_idx WHERE n = 1) = 2 + CASE WHEN :'t7_next' THEN 1 ELSE 0 END,
    'a month counts TRIPS: T1''s two bookings there are one trip');

SELECT pg_temp.assert(
    (SELECT bool_and(received_cents = '35000') FROM c_idx)
    AND (SELECT cents FROM c_idx WHERE n = 6) = 40000,
    'what came off: T6''s own $200 (not the $50 merely expected, not the $70 on another advisor''s '
    'line) and T3''s $150.005 of its $180 disputed payment, never more than the trip''s weighted '
    'total: $350 in all, rounded with the rest');

SELECT pg_temp.assert(
    (SELECT sum(cents) FROM c_idx) + 35000 = 239001,
    'calendar + already received = the forecast, to the cent, with odd cents in play');

RESET ROLE;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Saving the weights
-- ─────────────────────────────────────────────────────────────────────────────

\set cur '''{"inquiry":20,"proposal":50,"booked":100,"in_progress":100}'''

SELECT pg_temp.assert(
    (SELECT outcome FROM public.agent_set_pipeline_weights(:b_agent::uuid, :b_actor::uuid,
        '{"inquiry":20,"proposal":40,"booked":100,"in_progress":100}', :cur, gen_random_uuid(), NULL, NULL)) = 'stale',
    'a save naming weights the screen did not show is stale, not an overwrite');

SELECT pg_temp.assert(
    (SELECT outcome FROM public.agent_set_pipeline_weights(:b_agent::uuid, :b_actor::uuid,
        :cur, :cur, gen_random_uuid(), NULL, NULL)) = 'noop'
    AND NOT EXISTS (SELECT 1 FROM public.audit_event WHERE target_id = :b_agent::uuid AND event_type = 'pipeline_weight.updated'),
    'saving the same weights is a no-op, with no audit row');

SELECT pg_temp.expect_error(
    format($q$SELECT * FROM public.agent_set_pipeline_weights(%L, %L, %L,
             '{"inquiry":20,"proposal":101,"booked":100,"in_progress":100}', gen_random_uuid(), NULL, NULL)$q$,
           :b_agent, :b_actor, :cur),
    'a weight over 100 is refused');
SELECT pg_temp.expect_error(
    format($q$SELECT * FROM public.agent_set_pipeline_weights(%L, %L, %L,
             '{"inquiry":20,"proposal":50.5,"booked":100,"in_progress":100}', gen_random_uuid(), NULL, NULL)$q$,
           :b_agent, :b_actor, :cur),
    'and so is half a percent');
SELECT pg_temp.expect_error(
    format($q$SELECT * FROM public.agent_set_pipeline_weights(%L, %L, %L,
             '{"inquiry":"20","proposal":50,"booked":100,"in_progress":100}', gen_random_uuid(), NULL, NULL)$q$,
           :b_agent, :b_actor, :cur),
    'and a weight sent as text');
SELECT pg_temp.expect_error(
    format($q$SELECT * FROM public.agent_set_pipeline_weights(%L, %L, %L,
             '{"inquiry":20,"proposal":50,"booked":100,"completed":0}', gen_random_uuid(), NULL, NULL)$q$,
           :b_agent, :b_actor, :cur),
    'and a set that is not exactly the four open stages');

SELECT outcome AS w_outcome FROM public.agent_set_pipeline_weights(:b_agent::uuid, :b_actor::uuid, :cur,
    '{"inquiry":20,"proposal":80,"booked":100,"in_progress":100}', gen_random_uuid(), '203.0.113.5', 'psql test') \gset

SELECT pg_temp.assert(
    :'w_outcome' = 'saved'
    AND (SELECT weight_pct FROM public.pipeline_weight WHERE agent_id = :b_agent::uuid AND status = 'proposal') = 80
    AND (SELECT weight_pct FROM public.pipeline_weight WHERE agent_id = :b_agent::uuid AND status = 'completed') = 100
    AND (SELECT weight_pct FROM public.pipeline_weight WHERE agent_id = :agent::uuid AND status = 'proposal') = 50,
    'Proposal to 80% saves for this advisor only; completed is untouched, and so is every other advisor');

SELECT pg_temp.assert(
    (SELECT count(*) = 1 AND bool_and(metadata->'changes' = '{"proposal":{"from":50,"to":80}}'::jsonb
                                      AND ip_address = '203.0.113.5'::inet AND actor_user_id = :b_actor::uuid)
       FROM public.audit_event WHERE target_id = :b_agent::uuid AND event_type = 'pipeline_weight.updated'),
    'one audit row, naming exactly what moved');

SELECT pg_temp.become(:b_account::uuid);
SELECT pg_temp.assert(
    (SELECT weighted_cents = '78401' AND total_weighted_cents = '268401' FROM public.agent_commission_forecast() WHERE status = 'proposal')
    AND (SELECT commission_weighted_cents = '268401' FROM public.agent_kpis())
    AND (SELECT sum(cents::bigint) + max(received_cents::bigint) = 268401 AND max(received_cents::bigint) = 38000
           FROM public.agent_commission_cash_in()),
    'the forecast, agent_kpis'' weighted figure and the calendar all move with the saved weight '
    '(T3 at 80% is $240.008, so all $180 of its payment now comes off)');
RESET ROLE;

ROLLBACK;
