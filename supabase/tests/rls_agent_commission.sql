-- §3.7.1 Commission Dashboard and §3.7.2 Commission Ledger — the five read accessors.
--
-- WHAT THIS FILE IS GUARDING. All five are SECURITY DEFINER and granted to `authenticated`,
-- over a table no client role can read. So the questions are: can one advisor see another's
-- lines, does a line whose two agent ids disagree reach anybody, does a non-agent get
-- anything at all — and do the four tiles add up what Gyasi ruled they add up (2026-10-11).
--
-- HOW THE TILES ARE TESTED. Not by re-deriving them as the owner with the accessor's own
-- expressions: a fixture computed that way agrees with any bug it shares. A SECOND ADVISOR
-- is built with a small book whose every figure is known by construction, and the tiles are
-- compared against literals. Gyasi's real seed is used for tenancy and for counts.
--
-- Run against a freshly reset local database:
--     supabase db reset
--     psql "$(supabase status -o json | jq -r .DB_URL)" -v ON_ERROR_STOP=1 \
--          -f supabase/tests/rls_agent_commission.sql

\set ON_ERROR_STOP on

BEGIN;

\set gyasi   '''0195a2c0-1a00-7000-8000-000000000010'''
\set jordan  '''0195a2c0-1a00-7000-8000-000000000011'''
\set agent   '''0195a2c0-1a00-7000-8000-000000000001'''
\set sandals '''0195a2c0-1a00-7000-8000-000000000030'''
\set allianz '''0195a2c0-1a00-7000-8000-000000000034'''
-- The second advisor: agent row, auth account, and their own client.
\set b_agent   '''0c7a0000-0000-7000-8000-000000000001'''
\set b_account '''0c7a0000-0000-7000-8000-000000000002'''
\set b_client  '''0c7a0000-0000-7000-8000-000000000003'''

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
-- `commission` is closed to every client role. An expectation read AFTER becoming the agent
-- would be a privilege error at best and zero rows at worst — and zero equals zero.

CREATE TEMP TABLE expected AS
SELECT count(*)                                         AS lines,
       count(*) FILTER (WHERE c.status = 'expected')    AS expected_n,
       count(*) FILTER (WHERE c.status = 'invoiced')    AS invoiced_n,
       count(*) FILTER (WHERE c.status = 'received')    AS received_n,
       count(*) FILTER (WHERE c.status = 'disputed')    AS disputed_n,
       count(*) FILTER (WHERE c.status = 'lost')        AS lost_n,
       count(DISTINCT c.supplier_id)                    AS suppliers,
       count(*) FILTER (WHERE c.supplier_id = :allianz::uuid) AS allianz_n
  FROM public.commission c
  JOIN public.trip t ON t.id = c.trip_id
 WHERE c.agent_id = :agent::uuid
   AND t.agent_id = :agent::uuid;

-- A travel range whose two ENDS are real trip start dates (the 2nd and 2nd-to-last distinct
-- ones), and the owner's count of lines inside it, edges included.
ALTER TABLE expected ADD COLUMN range_from date, ADD COLUMN range_to date, ADD COLUMN in_range bigint;
UPDATE expected e SET range_from = r.lo, range_to = r.hi
  FROM (SELECT (array_agg(d ORDER BY d))[2] AS lo, (array_agg(d ORDER BY d DESC))[2] AS hi
          FROM (SELECT DISTINCT t.start_date AS d
                  FROM public.commission c JOIN public.trip t ON t.id = c.trip_id
                 WHERE c.agent_id = :agent::uuid AND t.agent_id = :agent::uuid
                   AND t.start_date IS NOT NULL) x) r;
UPDATE expected e SET in_range = (
    SELECT count(*) FROM public.commission c JOIN public.trip t ON t.id = c.trip_id
     WHERE c.agent_id = :agent::uuid AND t.agent_id = :agent::uuid
       AND t.start_date BETWEEN e.range_from AND e.range_to);

GRANT SELECT ON expected TO authenticated;

-- Without these, several assertions below would pass over nothing.
SELECT pg_temp.assert((SELECT lines FROM expected) >= 10,
    'the seed gives Gyasi a ledger long enough to page');
SELECT pg_temp.assert((SELECT suppliers FROM expected) >= 2,
    'the ledger names at least two suppliers, so the supplier filter can narrow');
SELECT pg_temp.assert((SELECT lost_n FROM expected) >= 1,
    'there is a `lost` line behind the chip the prototype forgot');

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Grants: the accessors are the door, the table stays shut
-- ─────────────────────────────────────────────────────────────────────────────

-- The five by NAME, not "exactly five": Stage 2 adds more, and bumping a count to match
-- would defeat the check. The two LIKE checks below cover whatever else matches.
SELECT pg_temp.assert(
    (SELECT count(DISTINCT p.proname) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname IN ('agent_commission_ledger', 'agent_commission_ledger_summary',
                          'agent_commission_ledger_suppliers', 'agent_commission_dashboard',
                          'agent_commission_monthly')) = 5,
    'all five §3.7 Stage 1 accessors exist');

SELECT pg_temp.assert(
    NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname = 'public' AND p.proname LIKE 'agent\_commission\_%'
                   AND has_function_privilege('anon', p.oid, 'EXECUTE')),
    'anon cannot execute any of them');

SELECT pg_temp.assert(
    NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname = 'public' AND p.proname LIKE 'agent\_commission\_%'
                   AND NOT has_function_privilege('authenticated', p.oid, 'EXECUTE')),
    'authenticated can execute all of them');

SELECT pg_temp.become(:gyasi::uuid);

SELECT pg_temp.expect_denied(
    'SELECT count(*) FROM public.commission',
    'an agent still cannot read public.commission directly');
SELECT pg_temp.expect_denied(
    'SELECT count(*) FROM public.commission_import',
    'nor public.commission_import');

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. The ledger is exactly this agent's book, and the chips agree with it
-- ─────────────────────────────────────────────────────────────────────────────

SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_commission_ledger(NULL, NULL, NULL, NULL, NULL, 500, 0))
        = (SELECT lines FROM expected),
    'with no filters the ledger returns every line Gyasi owns, and only those');

SELECT pg_temp.assert(
    (SELECT total_count FROM public.agent_commission_ledger(NULL, NULL, NULL, NULL, NULL, 5, 0)
      LIMIT 1) = (SELECT lines FROM expected),
    'total_count is the count BEFORE the page window');

SELECT pg_temp.assert(
    (SELECT s.expected_count = e.expected_n AND s.invoiced_count = e.invoiced_n
        AND s.received_count = e.received_n AND s.disputed_count = e.disputed_n
        AND s.lost_count = e.lost_n AND s.total_count = e.lines
       FROM public.agent_commission_ledger_summary() s, expected e),
    'each of the five chip counts, and the total, matches the owner''s tally');

SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_commission_ledger_suppliers())
        = (SELECT suppliers FROM expected)
    AND (SELECT sum(line_count) FROM public.agent_commission_ledger_suppliers())
        = (SELECT lines FROM expected),
    'the supplier filter lists each supplier in the ledger once, and their lines add up');

-- Filters.
SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_commission_ledger(
        ARRAY['lost']::commission_status[], NULL, NULL, NULL, NULL, 500, 0))
        = (SELECT lost_n FROM expected)
    AND NOT EXISTS (SELECT 1 FROM public.agent_commission_ledger(
        ARRAY['lost']::commission_status[], NULL, NULL, NULL, NULL, 500, 0)
         WHERE status <> 'lost'),
    'the Lost chip returns the lost lines and nothing else');

SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_commission_ledger(
        ARRAY['received','disputed']::commission_status[], NULL, NULL, NULL, NULL, 500, 0))
        = (SELECT received_n + disputed_n FROM expected),
    'two chips at once return the union');

SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_commission_ledger(
        NULL, :allianz::uuid, NULL, NULL, NULL, 500, 0)) = (SELECT allianz_n FROM expected)
    AND (SELECT allianz_n FROM expected) > 0,
    'the supplier filter narrows to that supplier''s lines');

SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_commission_ledger(
        NULL, NULL, '0195a2c0-1a00-7000-8000-000000000040'::uuid, NULL, NULL, 500, 0)) = 1,
    'the trip filter (Trip Detail''s entry point) returns that trip''s one line');

-- The range is built FROM THE DATA, both ends on real start dates: the seed dates trips
-- relative to the day it runs, so a hardcoded year would eventually match nothing — and
-- "no row falls outside the range" is true of an empty result.
SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_commission_ledger(
        NULL, NULL, NULL, (SELECT range_from FROM expected), (SELECT range_to FROM expected), 500, 0))
        = (SELECT in_range FROM expected)
    AND (SELECT in_range FROM expected) >= 3,
    'the travel-date range keeps exactly the lines whose trip starts inside it, both ends inclusive');

SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_commission_ledger(
        '{}'::commission_status[], NULL, NULL, NULL, NULL, 500, 0)) = (SELECT lines FROM expected),
    'an EMPTY status array means every status, the same as NULL — not an empty ledger');

-- Paging and the clamp. LIMIT and OFFSET raise on a negative, and this is reachable from a
-- browser over /rpc/ with whatever numbers the caller likes.
SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_commission_ledger(NULL, NULL, NULL, NULL, NULL, 5, 5)) = 5,
    'a page of five, five in, is five rows');
SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_commission_ledger(NULL, NULL, NULL, NULL, NULL, -1, -10)) = 0,
    'a negative limit and offset are clamped rather than raising');

-- Newest travel first.
SELECT pg_temp.assert(
    (SELECT bool_and(ok) FROM (
        SELECT start_date >= lead(start_date) OVER (ORDER BY ord) AS ok
          FROM (SELECT start_date, row_number() OVER () AS ord
                  FROM public.agent_commission_ledger(NULL, NULL, NULL, NULL, NULL, 500, 0)
                 WHERE start_date IS NOT NULL) x) y WHERE ok IS NOT NULL),
    'the ledger reads newest travel first');

RESET ROLE;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. An archived trip's lines stay — a commission line is a tax record
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE public.trip SET archived_at = now()
 WHERE id = '0195a2c0-1a00-7000-8000-000000000117';   -- Barcelona: one Allianz line

SELECT pg_temp.become(:gyasi::uuid);
SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_commission_ledger(NULL, NULL, NULL, NULL, NULL, 500, 0))
        = (SELECT lines FROM expected),
    'archiving a trip does not remove its commission line from the ledger');
SELECT pg_temp.assert(
    (SELECT bool_and(trip_archived) FROM public.agent_commission_ledger(
        NULL, NULL, '0195a2c0-1a00-7000-8000-000000000117'::uuid, NULL, NULL, 500, 0))
    AND (SELECT count(*) FROM public.agent_commission_ledger(
        NULL, NULL, '0195a2c0-1a00-7000-8000-000000000117'::uuid, NULL, NULL, 500, 0)) = 1,
    '... and it says so, so the screen does not link into a trip that will not open');
SELECT pg_temp.assert(
    NOT (SELECT bool_or(trip_archived) FROM public.agent_commission_ledger(
        NULL, NULL, '0195a2c0-1a00-7000-8000-000000000040'::uuid, NULL, NULL, 500, 0)),
    'a live trip''s line is not marked archived');
RESET ROLE;

UPDATE public.trip SET archived_at = NULL
 WHERE id = '0195a2c0-1a00-7000-8000-000000000117';

-- Gyasi's tiles, BEFORE the second advisor and the mismatched rows exist. Section 6 asserts
-- none of them moved.
SELECT pg_temp.become(:gyasi::uuid);
CREATE TEMP TABLE gyasi_before AS SELECT * FROM public.agent_commission_dashboard();
RESET ROLE;
GRANT SELECT ON gyasi_before TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. A second advisor with a book whose every figure is known
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Signup must name an agent in its metadata, or handle_new_user() picks one — and the
-- stand-in client row it creates is deleted again, as rls_agent_reads.sql does.

-- THE ADVISOR'S ZONE IS CHOSEN SO ITS DATE DIFFERS FROM UTC'S RIGHT NOW. Kiritimati is
-- UTC+14 and Pago Pago UTC-11, so at any instant at least one of them is on a different
-- calendar day from UTC. Every boundary below is then wrong by a day if an accessor ever
-- slips back to `current_date` — on every run, not only in the few hours a day a Chicago
-- advisor's date and UTC's disagree.
CREATE TEMP TABLE b_zone AS
SELECT CASE WHEN (now() AT TIME ZONE 'Pacific/Kiritimati')::date <> (now() AT TIME ZONE 'UTC')::date
            THEN 'Pacific/Kiritimati' ELSE 'Pacific/Pago_Pago' END AS tz;

INSERT INTO public.agent (id, display_name, email, status, time_zone)
SELECT :b_agent::uuid, 'Commission Test Advisor', 'commission.advisor@example.com',
       'active', tz
  FROM b_zone;

INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change)
VALUES (:b_account::uuid,
        '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        'commission.advisor.login@example.com', 'x', now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        ('{"first_name":"Commission","last_name":"Advisor",'
         || '"agent_id":"0195a2c0-1a00-7000-8000-000000000001"}')::jsonb,
        now(), now(), '', '', '', '');

DO $$
DECLARE v_client_id uuid;
BEGIN
    SELECT client_id INTO v_client_id
      FROM public.platform_user
     WHERE account_id = '0c7a0000-0000-7000-8000-000000000002';

    UPDATE public.platform_user
       SET role = 'agent', agent_id = '0c7a0000-0000-7000-8000-000000000001', client_id = NULL
     WHERE account_id = '0c7a0000-0000-7000-8000-000000000002';

    DELETE FROM public.client WHERE id = v_client_id;
END $$;

INSERT INTO public.client (id, agent_id, first_name, last_name, email)
VALUES (:b_client::uuid, :b_agent::uuid, 'Fixture', 'Traveler', 'fixture.traveler@example.com');

-- The calendar this advisor lives on. Used only to PLACE fixtures; every assertion below is
-- against a literal.
CREATE TEMP TABLE b_day AS
SELECT d AS today,
       date_trunc('year', d)::date                       AS year_start,
       (date_trunc('year', d) - interval '1 year')::date AS ly_start,
       (d - interval '1 year')::date                     AS ly_today
  FROM (SELECT (now() AT TIME ZONE tz)::date AS d FROM b_zone) x;

SELECT pg_temp.assert(
    (SELECT today FROM b_day) <> (now() AT TIME ZONE 'UTC')::date,
    'the second advisor''s calendar day differs from UTC''s, so a UTC slip cannot hide');

GRANT SELECT ON b_day, b_zone TO authenticated;

-- Trips. Totals are written directly: the totals trigger fires on COMPONENT changes, and
-- these trips have none.
INSERT INTO public.trip (id, client_id, agent_id, title, trip_type, status,
                         start_date, end_date, total_value_cents, total_commission_cents)
SELECT v.id::uuid, :b_client::uuid, :b_agent::uuid, v.title, 'custom', v.status::trip_status,
       b.today + v.starts, b.today + v.starts + 5, v.commission * 10, v.commission
  FROM b_day b,
       (VALUES
        -- The book the ledger lines hang off.
        ('0c7a0000-0000-7000-8000-000000000010', 'Fixture: completed', 'completed', -400, 0),
        -- "Expected · 90d": booked inside the window, on its far edge, and one day past it.
        ('0c7a0000-0000-7000-8000-000000000011', 'Fixture: booked +10',  'booked',      10, 50000),
        ('0c7a0000-0000-7000-8000-000000000012', 'Fixture: booked +90',  'booked',      90,  7000),
        ('0c7a0000-0000-7000-8000-000000000013', 'Fixture: booked +91',  'booked',      91, 900000),
        -- Already travelling: started in the past, and still the soonest money there is.
        ('0c7a0000-0000-7000-8000-000000000014', 'Fixture: in progress', 'in_progress', -2,  3000),
        -- A proposal is not committed money, however soon it starts.
        ('0c7a0000-0000-7000-8000-000000000015', 'Fixture: proposal +5', 'proposal',     5, 800000),
        -- Booked, inside the window, unpriced: adds nothing and must not be counted.
        ('0c7a0000-0000-7000-8000-000000000016', 'Fixture: booked +20, unpriced', 'booked', 20, 0)
       ) AS v(id, title, status, starts, commission);

-- Ledger lines, all on the completed trip. `expected` is gross x pct exactly, as the
-- constraint demands.
INSERT INTO public.commission (
    id, trip_id, agent_id, supplier_id, gross_booking_cents, commission_pct,
    expected_commission_cents, processing_fee_cents, received_commission_cents, currency,
    payment_terms, status, received_at)
SELECT v.id::uuid, '0c7a0000-0000-7000-8000-000000000010'::uuid, :b_agent::uuid,
       v.supplier::uuid, v.gross, v.pct, v.expected, v.fee, v.received, 'USD',
       'after_travel', v.status::commission_status, v.received_at
  FROM b_day b,
       LATERAL (VALUES
        -- L1: arrived today.                                              YTD, trailing 12
        ('0c7a0000-0000-7000-8000-000000000101', :sandals, 100000::bigint, 10.00, 10000::bigint,
         0::bigint, 10000::bigint, 'received', b.today),
        -- L2: arrived Jan 1 — the lower edge of YTD, inclusive.           YTD, trailing 12
        ('0c7a0000-0000-7000-8000-000000000102', :allianz, 300000, 20.00, 60000,
         1000, 59000, 'received', b.year_start),
        -- L3: arrived exactly one year ago — the upper edge of LY.        LY, prior 12
        ('0c7a0000-0000-7000-8000-000000000103', :sandals, 200000, 15.00, 30000,
         0, 30000, 'received', b.ly_today),
        -- L4: arrived well before last year began.                        nowhere
        ('0c7a0000-0000-7000-8000-000000000104', :sandals, 50000, 10.00, 5000,
         0, 5000, 'received', b.ly_start - 400),
        -- L5: disputed, short by 500 after a 500 fee. Old, so it moves no money tile.
        ('0c7a0000-0000-7000-8000-000000000105', :sandals, 100000, 10.00, 10000,
         500, 9000, 'disputed', (b.year_start - interval '5 years')::date),
        -- L6: disputed but OVERPAID. Its gap is negative and must count as zero, not -2000.
        ('0c7a0000-0000-7000-8000-000000000106', :sandals, 100000, 10.00, 10000,
         0, 12000, 'disputed', (b.year_start - interval '5 years')::date),
        -- L7: expected, large, never paid. Reaches no money tile.
        ('0c7a0000-0000-7000-8000-000000000107', :sandals, 1000000, 50.00, 500000,
         0, 0, 'expected', NULL::date),
        -- L8: lost.
        ('0c7a0000-0000-7000-8000-000000000108', :sandals, 40000, 10.00, 4000,
         0, 0, 'lost', NULL::date),
        -- L9: dated TOMORROW in the advisor's zone. Nothing forbids a future received_at, and
        -- every money figure stops at today: YTD, the chip and the chart's last bar alike.
        ('0c7a0000-0000-7000-8000-000000000109', :sandals, 100000, 10.00, 10000,
         0, 10000, 'received', b.today + 1)
       ) AS v(id, supplier, gross, pct, expected, fee, received, status, received_at);

SELECT pg_temp.become(:b_account::uuid);

SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_commission_ledger(NULL, NULL, NULL, NULL, NULL, 500, 0)) = 9
    AND NOT EXISTS (SELECT 1 FROM public.agent_commission_ledger(NULL, NULL, NULL, NULL, NULL, 500, 0)
                     WHERE trip_id <> '0c7a0000-0000-7000-8000-000000000010'::uuid),
    'the second advisor sees their own nine lines and none of Gyasi''s');

SELECT pg_temp.assert(
    (SELECT as_of_date FROM public.agent_commission_dashboard()) = (SELECT today FROM b_day)
    AND (SELECT as_of_date FROM public.agent_commission_ledger(NULL, NULL, NULL, NULL, NULL, 1, 0))
        = (SELECT today FROM b_day),
    'both the dashboard and the ledger say "today" in the advisor''s zone, not UTC''s');

SELECT pg_temp.assert(
    (SELECT expected_count = 1 AND invoiced_count = 0 AND received_count = 5
        AND disputed_count = 2 AND lost_count = 1 AND total_count = 9
       FROM public.agent_commission_ledger_summary()),
    'their chip counts are their own');

SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_commission_ledger_suppliers()) = 2,
    'their supplier filter offers the two suppliers they have lines with');

-- The tiles, against literals.
SELECT pg_temp.assert(
    (SELECT ytd_received_cents FROM public.agent_commission_dashboard()) = '69000',
    'YTD received is L1 + L2 = 10,000 + 59,000: Jan 1 and today are inside; last year and '
    'tomorrow (L9) are not');

SELECT pg_temp.assert(
    (SELECT ly_received_cents FROM public.agent_commission_dashboard()) = '30000',
    'last year''s same window is L3 alone: a year ago today is inside, two years ago is not');

SELECT pg_temp.assert(
    (SELECT avg_rate_pct FROM public.agent_commission_dashboard()) = 17.5,
    'Avg rate is weighted by gross — (10,000 + 60,000) / (100,000 + 300,000) = 17.5%, '
    'where a plain mean of the two rates would say 15.0%');

SELECT pg_temp.assert(
    (SELECT ly_avg_rate_pct FROM public.agent_commission_dashboard()) = 15.0,
    'last year''s rate is L3''s 15%');

SELECT pg_temp.assert(
    (SELECT upcoming_commission_cents = '60000' AND upcoming_trip_count = 3
       FROM public.agent_commission_dashboard()),
    'Expected · 90d is 50,000 + 7,000 + 3,000: booked inside 90 days (edge included), plus '
    'in progress; not day 91, not a proposal, and the unpriced booking is not counted');

SELECT pg_temp.assert(
    (SELECT at_risk_cents = '500' AND disputed_count = 2
       FROM public.agent_commission_dashboard()),
    'At risk is the unpaid gap on disputed lines — 500, with the overpaid line counting zero');

SELECT pg_temp.assert(
    (SELECT trailing_12_cents = '69000' AND prior_12_cents = '30000'
       FROM public.agent_commission_dashboard()),
    'the trend chip compares the chart''s twelve months (L1 + L2) with the twelve before (L3)');

SELECT pg_temp.assert(
    (SELECT currency FROM public.agent_commission_dashboard()) = 'USD',
    'the dashboard names one currency');

-- The chart.
SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_commission_monthly()) = 12,
    'the chart always has twelve bars');
SELECT pg_temp.assert(
    (SELECT max(month_start) FROM public.agent_commission_monthly())
        = (SELECT date_trunc('month', today)::date FROM b_day),
    'the last bar is the current month in the advisor''s own time zone');
SELECT pg_temp.assert(
    (SELECT count(DISTINCT month_start) FROM public.agent_commission_monthly()) = 12,
    'no month appears twice');
SELECT pg_temp.assert(
    (SELECT sum(received_cents::bigint) FROM public.agent_commission_monthly()) = 69000,
    'the twelve bars add up to the trend chip''s own twelve-month figure — tomorrow''s L9 '
    'is in neither');

RESET ROLE;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. A line whose two agent ids disagree reaches nobody
-- ─────────────────────────────────────────────────────────────────────────────
--
-- The schema lets commission.agent_id and trip.agent_id differ. Each is planted with money
-- that arrived TODAY, so a leak would move a tile and not merely a count.

INSERT INTO public.commission (
    id, trip_id, agent_id, supplier_id, gross_booking_cents, commission_pct,
    expected_commission_cents, processing_fee_cents, received_commission_cents, currency,
    payment_terms, status, received_at)
-- Dated GYASI's today, not the second advisor's: their zone is chosen to sit on a different
-- calendar day, and a line dated tomorrow in Chicago would leak into nothing he can see.
SELECT v.id::uuid, v.trip::uuid, v.agent::uuid, :sandals::uuid, 7777000, 10.00, 777700,
       0, 777700, 'USD', 'after_travel', 'received', (now() AT TIME ZONE g.time_zone)::date
  FROM public.agent g,
       (VALUES
        -- The second advisor's id on Gyasi's trip.
        ('0c7a0000-0000-7000-8000-000000000201', '0195a2c0-1a00-7000-8000-000000000302',
         '0c7a0000-0000-7000-8000-000000000001'),
        -- Gyasi's id on the second advisor's trip.
        ('0c7a0000-0000-7000-8000-000000000202', '0c7a0000-0000-7000-8000-000000000010',
         '0195a2c0-1a00-7000-8000-000000000001')
       ) AS v(id, trip, agent)
 WHERE g.id = :agent::uuid;

SELECT pg_temp.become(:gyasi::uuid);
SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_commission_ledger(NULL, NULL, NULL, NULL, NULL, 500, 0))
        = (SELECT lines FROM expected),
    'Gyasi''s ledger is unchanged by either mismatched line');
SELECT pg_temp.assert(
    (SELECT total_count FROM public.agent_commission_ledger_summary())
        = (SELECT lines FROM expected),
    '... and so are his chip counts');
SELECT pg_temp.assert(
    (SELECT d.ytd_received_cents = g.ytd_received_cents
        AND d.trailing_12_cents = g.trailing_12_cents
        AND d.at_risk_cents = g.at_risk_cents
        AND d.upcoming_commission_cents = g.upcoming_commission_cents
       FROM public.agent_commission_dashboard() d, gyasi_before g),
    '... and his tiles did not move — not from the mismatched lines, not from the second '
    'advisor''s book');
SELECT pg_temp.assert(
    (SELECT sum(received_cents::bigint) FROM public.agent_commission_monthly())
        = (SELECT trailing_12_cents::bigint FROM gyasi_before),
    '... and neither did his chart');
SELECT pg_temp.assert(
    (SELECT sum(line_count) FROM public.agent_commission_ledger_suppliers())
        = (SELECT lines FROM expected),
    '... and neither did his supplier filter''s line counts');
RESET ROLE;

SELECT pg_temp.become(:b_account::uuid);
SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_commission_ledger(NULL, NULL, NULL, NULL, NULL, 500, 0)) = 9
    AND (SELECT ytd_received_cents FROM public.agent_commission_dashboard()) = '69000',
    'the second advisor''s ledger and YTD are unchanged by either mismatched line');
-- Every accessor has its own tenancy predicate, so each gets its own cross-tenant check.
SELECT pg_temp.assert(
    (SELECT total_count FROM public.agent_commission_ledger_summary()) = 9
    AND (SELECT sum(line_count) FROM public.agent_commission_ledger_suppliers()) = 9
    AND (SELECT sum(received_cents::bigint) FROM public.agent_commission_monthly()) = 69000,
    '... and so are their chip counts, their supplier filter and their chart');
RESET ROLE;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. A non-agent gets nothing — not zeros, nothing
-- ─────────────────────────────────────────────────────────────────────────────

SELECT pg_temp.become(:jordan::uuid);
SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_commission_ledger(NULL, NULL, NULL, NULL, NULL, 500, 0)) = 0
    AND (SELECT count(*) FROM public.agent_commission_ledger_summary()) = 0
    AND (SELECT count(*) FROM public.agent_commission_ledger_suppliers()) = 0
    AND (SELECT count(*) FROM public.agent_commission_dashboard()) = 0
    AND (SELECT count(*) FROM public.agent_commission_monthly()) = 0,
    'a traveler gets no row from any of the five — "not an agent" is not "an empty ledger"');
RESET ROLE;

ROLLBACK;
