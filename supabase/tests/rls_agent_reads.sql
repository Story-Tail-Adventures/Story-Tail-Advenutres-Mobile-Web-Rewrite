-- The agent read surface: that it returns what only an agent may see, nothing to anyone
-- else, and nothing of one agent's to another.
--
-- WHAT THIS FILE IS REALLY ASSERTING. The §3.x design turns on one claim: a SECURITY DEFINER
-- accessor can return columns the caller has no grant on, scoped by a predicate the caller
-- cannot influence. Every other decision in 20260919140000_agent_read_surface.sql follows
-- from that. So the load-bearing assertion here is not that the functions return rows — it is
-- that `trip.notes` and `trip.total_commission_cents` come back NON-NULL to an agent who,
-- selecting them directly one statement earlier, gets 42501.
--
-- Run against a freshly reset local database:
--     supabase db reset
--     psql "$(supabase status -o json | jq -r .DB_URL)" -v ON_ERROR_STOP=1 \
--          -f supabase/tests/rls_agent_reads.sql

\set ON_ERROR_STOP on

BEGIN;

\set gyasi  '''0195a2c0-1a00-7000-8000-000000000010'''
\set jordan '''0195a2c0-1a00-7000-8000-000000000011'''

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

-- Expected counts, captured as the table owner BEFORE dropping into the agent's role.
-- An agent reading `trip` directly gets ZERO rows — trip_self_select is predicated on
-- platform_user.client_id, which is NULL for them, which is exactly what
-- rls_trip_graph.sql:361-377 asserts. So a comparison against a direct read would compare
-- against 0 and pass for nothing at all.
CREATE TEMP TABLE expected AS
SELECT (SELECT count(*) FROM public.trip
         WHERE agent_id = '0195a2c0-1a00-7000-8000-000000000001' AND archived_at IS NULL)
           AS trips,
       (SELECT count(*) FROM public.trip
         WHERE agent_id = '0195a2c0-1a00-7000-8000-000000000001'
           AND archived_at IS NULL AND status = 'inquiry')
           AS inquiries,
       (SELECT count(DISTINCT h.trip_id) FROM public.trip_status_history h
          JOIN public.trip t ON t.id = h.trip_id
         WHERE t.agent_id = '0195a2c0-1a00-7000-8000-000000000001'
           AND t.archived_at IS NULL AND h.to_status = 'booked')
           AS booked_ever;

-- The expected "booked this month", derived INDEPENDENTLY of the function.
--
-- The first version of this fixture computed it with `AT TIME ZONE 'UTC'` — the same
-- expression the function itself used — so it agreed with the implementation by construction
-- and could not fail on the timezone bug it was supposed to cover. An audit caught that. It
-- now uses the AGENT's zone, which is what "this month" means to the person reading the tile,
-- and a DISTINCT trip set, so a trip booked twice in the month is one summand.
CREATE TEMP TABLE expected_booked_month AS
SELECT t.id, t.total_value_cents
  FROM public.trip t
 WHERE t.agent_id = '0195a2c0-1a00-7000-8000-000000000001'
   AND t.archived_at IS NULL
   AND t.currency = (
        SELECT currency FROM public.trip
         WHERE agent_id = '0195a2c0-1a00-7000-8000-000000000001' AND archived_at IS NULL
           AND status IN ('inquiry','proposal','booked','in_progress')
         GROUP BY currency ORDER BY count(*) DESC, currency LIMIT 1)
   AND EXISTS (
        SELECT 1 FROM public.trip_status_history h
         WHERE h.trip_id = t.id AND h.to_status = 'booked'
           AND (h.changed_at AT TIME ZONE (SELECT time_zone FROM public.agent
                 WHERE id = '0195a2c0-1a00-7000-8000-000000000001'))::date
                 >= date_trunc('month', (now() AT TIME ZONE (SELECT time_zone FROM public.agent
                      WHERE id = '0195a2c0-1a00-7000-8000-000000000001'))::date)::date
           AND (h.changed_at AT TIME ZONE (SELECT time_zone FROM public.agent
                 WHERE id = '0195a2c0-1a00-7000-8000-000000000001'))::date
                 < (date_trunc('month', (now() AT TIME ZONE (SELECT time_zone FROM public.agent
                      WHERE id = '0195a2c0-1a00-7000-8000-000000000001'))::date)
                    + interval '1 month')::date);

-- The temp table belongs to the migration role, so the assertions below — which run as
-- `authenticated` — need reading rights on it. It lives in pg_temp and dies with the
-- transaction; nothing in the schema is widened.
-- What the inbox and the availability read should come back with, captured as the owner so
-- the assertions compare against the tables rather than against the functions.
CREATE TEMP TABLE expected_inbox AS
SELECT coalesce(sum(cv.agent_unread_count), 0)::integer AS unread,
       count(*)::integer                                AS threads
  FROM public.conversation cv
 WHERE cv.agent_id = '0195a2c0-1a00-7000-8000-000000000001' AND cv.archived_at IS NULL;

CREATE TEMP TABLE expected_commission AS
SELECT coalesce(sum(c.expected_commission_cents), 0)::bigint AS raw_cents
  FROM public.commission c
  JOIN public.trip t ON t.id = c.trip_id
 WHERE c.agent_id = '0195a2c0-1a00-7000-8000-000000000001'
   AND t.agent_id = '0195a2c0-1a00-7000-8000-000000000001'
   AND t.archived_at IS NULL
   AND t.status IN ('inquiry','proposal','booked','in_progress')
   AND c.status IN ('expected','invoiced');

CREATE TEMP TABLE expected_scope AS
SELECT (SELECT count(*) FROM public.client
         WHERE agent_id = '0195a2c0-1a00-7000-8000-000000000001' AND status = 'active')::integer
           AS active_clients,
       (SELECT count(*) FROM public.payment_milestone pm JOIN public.trip t ON t.id = pm.trip_id
         WHERE t.agent_id = '0195a2c0-1a00-7000-8000-000000000001'
           AND pm.status IN ('scheduled','overdue') AND pm.due_date IS NOT NULL)::integer
           AS due_ever;

GRANT SELECT ON expected, expected_booked_month, expected_inbox, expected_scope,
              expected_commission TO authenticated;

-- ── As the agent ─────────────────────────────────────────────────────────────────

SELECT pg_temp.become(:gyasi::uuid);

SELECT pg_temp.assert(
    public.current_agent_id() = '0195a2c0-1a00-7000-8000-000000000001'::uuid,
    'current_agent_id() resolves the agent from their JWT');

SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_kpis()) = 1,
    'agent_kpis() returns exactly one row for an agent');

-- THE ASSERTION THE WHOLE DESIGN RESTS ON. Both columns are outside the `authenticated`
-- column grant (20260904140753:33-38 and the trip_read_policies migration), so the two
-- statements below are a matched pair: refused directly, delivered through the accessor.
SELECT pg_temp.expect_denied(
    'SELECT total_commission_cents FROM public.trip',
    'agent is refused trip.total_commission_cents directly — the client grant binds them too');
SELECT pg_temp.expect_denied(
    'SELECT notes FROM public.trip',
    'agent is refused trip.notes directly');

SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_trip_board()
      WHERE total_commission_cents IS NOT NULL AND total_commission_cents <> '0') > 0,
    'agent_trip_board() DOES return total_commission_cents — the definer defeats the revoke');
SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_trip_board() WHERE notes IS NOT NULL) > 0,
    'agent_trip_board() DOES return trip.notes');

SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_trip_board()) = (SELECT trips FROM expected)
      AND (SELECT trips FROM expected) > 0,
    'agent_trip_board() returns every non-archived trip in the agent''s book, and no more');

-- Money is a digit-string, not a JSON number. A sum over bigint is where the contract's
-- convention earns itself; see contracts/openapi.yaml:36 and the migration header.
SELECT pg_temp.assert(
    (SELECT pipeline_value_cents ~ '^-?\d+$' FROM public.agent_kpis()),
    'agent_kpis() renders money as a digit-string');
SELECT pg_temp.assert(
    (SELECT bool_and(total_value_cents ~ '^-?\d+$') FROM public.agent_trip_board()),
    'agent_trip_board() renders money as a digit-string');

-- The cycle time, against the seed's synthetic history. `> 0` is the assertion that matters:
-- the figure is `first booked transition - trip.created_at`, so a fixture whose history
-- predates its trip — or an implementation that subtracts the wrong way round — yields a
-- negative average and a screen that reports trips booked before they existed.
SELECT pg_temp.assert(
    (SELECT inquiry_to_book_days > 0 FROM public.agent_kpis()),
    'inquiry_to_book_days is positive — history sits after each trip''s created_at');
SELECT pg_temp.assert(
    (SELECT inquiry_to_book_sample FROM public.agent_kpis()) = (SELECT booked_ever FROM expected)
      AND (SELECT booked_ever FROM expected) > 0,
    'inquiry_to_book_sample counts exactly the trips with a booked transition');

-- "Booked · month" is the figure trip.status_changed_at could not produce: a trip booked last
-- month and progressed this month would land in the wrong bucket. The seed puts exactly one
-- booking inside the current month, so this is checkable by hand.
SELECT pg_temp.assert(
    (SELECT booked_month_cents::bigint FROM public.agent_kpis()) =
    (SELECT coalesce(sum(t.total_value_cents), 0) FROM expected_booked_month t),
    'booked_month_cents is exactly the trips whose booked transition is in the current month');

-- Weighted strictly below raw. Equality would mean pipeline_weight is not being applied at
-- all — the seed deliberately puts commission on two `proposal` trips, which weigh 50.
SELECT pg_temp.assert(
    (SELECT commission_weighted_cents::bigint < commission_expected_cents::bigint
        AND commission_expected_cents::bigint > 0
       FROM public.agent_kpis()),
    'the forecast is weighted — weighted total is strictly below the raw total');
SELECT pg_temp.assert(
    (SELECT commission_confidence_pct BETWEEN 1 AND 99 FROM public.agent_kpis()),
    'commission_confidence_pct is a real ratio, not a 0%% or 100%% placeholder');

SELECT pg_temp.assert(
    (SELECT new_inquiry_count FROM public.agent_kpis()) = (SELECT inquiries FROM expected),
    'new_inquiry_count counts inquiry-status trips — there is no lead entity');

SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_inbox()) > 0,
    'agent_inbox() returns the agent''s conversations');
SELECT pg_temp.expect_denied(
    'SELECT agent_unread_count FROM public.conversation',
    'agent is refused conversation.agent_unread_count directly — the accessor is the way in');

SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_payments_due(365)) > 0,
    'agent_payments_due() returns scheduled milestones');

-- Positive assertions on the VALUES, not just the row counts. An audit found that
-- agent_inbox().agent_unread_count and the whole of agent_availability_self() were never
-- compared to anything: replacing the unread column with a literal 0, or making the
-- availability function return nothing to anybody, left the suite green.
SELECT pg_temp.assert(
    (SELECT sum(agent_unread_count)::integer FROM public.agent_inbox())
        = (SELECT unread FROM expected_inbox)
      AND (SELECT count(*) FROM public.agent_inbox()) = (SELECT threads FROM expected_inbox),
    'agent_inbox() carries the real agent_unread_count, not a placeholder');

SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_availability_self()) = 1,
    'agent_availability_self() returns the agent''s row — a function that answers nobody '
    'would otherwise pass every test in this file');
SELECT pg_temp.assert(
    (SELECT time_zone IS NOT NULL AND weekly_schedule IS NOT NULL
              AND jsonb_typeof(time_off_blocks) = 'array'
       FROM public.agent_availability_self()),
    'and it joins `agent` for the time zone, which does not live on agent_availability');

-- The per-column scoping inside agent_kpis(). These counts are computed by separate
-- subqueries, each with its own `agent_id =` predicate, so each is its own chance to forget
-- one — and a forgotten predicate returns MORE, which reads as a healthy book.
SELECT pg_temp.assert(
    (SELECT active_client_count FROM public.agent_kpis()) = (SELECT active_clients FROM expected_scope),
    'active_client_count counts only this agent''s active clients');
SELECT pg_temp.assert(
    (SELECT unread_message_count FROM public.agent_kpis()) = (SELECT unread FROM expected_inbox),
    'unread_message_count sums only this agent''s conversations');

-- ── Regression: four aggregate defects an adversarial audit reproduced ───────────
--
-- Each of these passed before the fix and fails without it. They are asserted here rather
-- than left to the arithmetic above because every one of them was invisible in a total.

-- (a) A booking on the last evening of the previous month, in the agent's zone. Its UTC
-- calendar date is the 1st, so a UTC comparison pulls it into this month.
SELECT pg_temp.assert(
    (SELECT booked_month_cents::bigint FROM public.agent_kpis()) =
    (SELECT coalesce(sum(total_value_cents), 0) FROM expected_booked_month),
    'booked_month_cents buckets in the AGENT''s zone, not UTC');

-- (b) booked -> in_progress -> booked is legal and routine — a client changes dates and the
-- deposit is re-run. Under a join to the history that trip's whole value is counted twice.
-- This has to WRITE the second transition to prove anything: the seed has no trip booked
-- twice, so a passive assertion over it would go on passing if the EXISTS became a join.
RESET ROLE;
INSERT INTO public.trip_status_history (id, trip_id, from_status, to_status, changed_at) VALUES
    ('01a0b1c2-d300-7000-8000-0000000000f1', '0195a2c0-1a00-7000-8000-000000000047',
     'booked', 'in_progress', now() - interval '2 days'),
    ('01a0b1c2-d300-7000-8000-0000000000f2', '0195a2c0-1a00-7000-8000-000000000047',
     'in_progress', 'booked', now() - interval '1 day');
SELECT pg_temp.become(:gyasi::uuid);
SELECT pg_temp.assert(
    (SELECT booked_month_cents::bigint FROM public.agent_kpis()) =
    (SELECT coalesce(sum(total_value_cents), 0) FROM expected_booked_month),
    'a trip booked TWICE in one month is one summand, not two');
RESET ROLE;
DELETE FROM public.trip_status_history
 WHERE id IN ('01a0b1c2-d300-7000-8000-0000000000f1', '01a0b1c2-d300-7000-8000-0000000000f2');
SELECT pg_temp.become(:gyasi::uuid);

-- (c) Every money figure honours `dominant_currency`. The first version scoped only
-- pipeline_value_cents and left three summing across everything under the same label, which
-- is worse than scoping none of them.
SELECT pg_temp.assert(
    (SELECT currency_count FROM public.agent_kpis()) = 1,
    'the seed is single-currency, so the scoped and unscoped totals cannot diverge here — '
    'the cross-currency case is asserted below, where a second currency exists');

-- (d) A commission row carries its own agent_id and nothing requires it to match the trip's.
SELECT pg_temp.assert(
    (SELECT commission_expected_cents::bigint FROM public.agent_kpis())
        = (SELECT raw_cents FROM expected_commission),
    'commission_expected_cents matches the owner-side figure for the agent''s OWN rows');

RESET ROLE;

-- ── As a signed-in traveler ──────────────────────────────────────────────────────
--
-- ZERO ROWS, NOT AN ERROR, and that is a deliberate choice rather than an accident of the
-- `me` CTE. Every read boundary in this schema answers this way — RLS filters rather than
-- raising, and rls_trip_graph.sql:355-359 states that as the design. A 403 would turn an
-- authorization decision into an error branch on both clients, for a case the UI cannot
-- produce, while telling a prober that the endpoint exists and they are not it. The
-- distinction a screen actually needs is preserved: agent_kpis() gives one row of zeros to
-- an agent with an empty book and NO row to a non-agent.

SELECT pg_temp.become(:jordan::uuid);

SELECT pg_temp.assert(public.current_agent_id() IS NULL,
    'current_agent_id() is NULL for a client');
SELECT pg_temp.assert((SELECT count(*) FROM public.agent_kpis()) = 0,
    'agent_kpis() is empty for a client — zero rows, not an error');
SELECT pg_temp.assert((SELECT count(*) FROM public.agent_trip_board()) = 0,
    'agent_trip_board() is empty for a client, including their OWN trips');
SELECT pg_temp.assert((SELECT count(*) FROM public.agent_inbox()) = 0,
    'agent_inbox() is empty for a client');
SELECT pg_temp.assert((SELECT count(*) FROM public.agent_payments_due()) = 0,
    'agent_payments_due() is empty for a client');
SELECT pg_temp.assert((SELECT count(*) FROM public.agent_availability_self()) = 0,
    'agent_availability_self() is empty for a client');

RESET ROLE;

-- ── As an anonymous visitor ──────────────────────────────────────────────────────
--
-- Two layers, and this asserts the outer one. Even if EXECUTE were restored, auth.uid() is
-- NULL for anon and `me` would be empty — but the grant is what should stop it first.

SET ROLE anon;

SELECT pg_temp.expect_denied('SELECT * FROM public.agent_kpis()',
    'anon cannot execute agent_kpis()');
SELECT pg_temp.expect_denied('SELECT * FROM public.agent_trip_board()',
    'anon cannot execute agent_trip_board()');
SELECT pg_temp.expect_denied('SELECT * FROM public.agent_payments_due()',
    'anon cannot execute agent_payments_due()');
SELECT pg_temp.expect_denied('SELECT * FROM public.agent_inbox()',
    'anon cannot execute agent_inbox()');
SELECT pg_temp.expect_denied('SELECT * FROM public.agent_availability_self()',
    'anon cannot execute agent_availability_self()');
SELECT pg_temp.expect_denied('SELECT public.current_agent_id()',
    'anon cannot execute current_agent_id()');

RESET ROLE;

-- ── The admin hole ───────────────────────────────────────────────────────────────
--
-- platform_user's CHECK has a bare `(role = 'admin')` branch, so an admin row may legally
-- carry an agent_id. `pu.agent_id IS NOT NULL` would have let an admin act as whichever
-- agent someone typed into their row; `pu.role = 'agent'` is what closes it. Without this
-- test that predicate reads like a redundant belt.

-- `platform_user_agent` is UNIQUE, so the admin cannot borrow Gyasi's agent_id — it has to
-- point at an agent of its own. That is also the realistic shape of the hole: an admin row
-- carrying SOME agent_id, not a duplicate of a real advisor's.
INSERT INTO public.agent (id, display_name, email, status)
VALUES ('0195a2c0-1a00-7000-8000-0000000000e0', 'Admin Probe Agent',
        'admin.probe.agent@example.com', 'active');

-- With two active agents, handle_new_user()'s fallback raises too_many_rows. Naming an
-- agent_id in the signup metadata takes the explicit branch (20260902020243:96-113) — the
-- same trap the second-agent fixture below hits.
INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change)
VALUES ('0195a2c0-1a00-7000-8000-0000000000e1',
        '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        'admin.probe@example.com', 'x', now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        ('{"first_name":"Admin","last_name":"Probe",'
         || '"agent_id":"0195a2c0-1a00-7000-8000-000000000001"}')::jsonb,
        now(), now(), '', '', '', '');

UPDATE public.platform_user
   SET role = 'admin', agent_id = '0195a2c0-1a00-7000-8000-0000000000e0', client_id = NULL
 WHERE account_id = '0195a2c0-1a00-7000-8000-0000000000e1';

SELECT pg_temp.become('0195a2c0-1a00-7000-8000-0000000000e1'::uuid);
SELECT pg_temp.assert(public.current_agent_id() IS NULL,
    'an admin carrying an agent_id is NOT resolved as that agent');
SELECT pg_temp.assert((SELECT count(*) FROM public.agent_trip_board()) = 0,
    'an admin sees no agent''s book');
RESET ROLE;

-- ── A second agent ───────────────────────────────────────────────────────────────
--
-- One agent exists today, so tenancy is untested by the seed and the predicate that enforces
-- it would fail silently — a missing `WHERE agent_id =` returns MORE rows, which looks like
-- a working screen. P3 is when this matters; the assertion is cheap now.
--
-- Same metadata trap as the admin fixture above: several active agents now exist, so the
-- signup must name one rather than let handle_new_user() guess.

INSERT INTO public.agent (id, display_name, email, status)
VALUES ('0195a2c0-1a00-7000-8000-0000000000e2', 'Second Advisor',
        'second.advisor@example.com', 'active');

INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change)
VALUES ('0195a2c0-1a00-7000-8000-0000000000e3',
        '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        'second.advisor.login@example.com', 'x', now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        ('{"first_name":"Second","last_name":"Advisor",'
         || '"agent_id":"0195a2c0-1a00-7000-8000-000000000001"}')::jsonb,
        now(), now(), '', '', '', '');

-- Promote exactly as seed.sql:109-126 does, then drop the stand-in client row.
UPDATE public.platform_user
   SET role = 'agent', agent_id = '0195a2c0-1a00-7000-8000-0000000000e2', client_id = NULL
 WHERE account_id = '0195a2c0-1a00-7000-8000-0000000000e3';

INSERT INTO public.client (id, agent_id, first_name, last_name, email)
VALUES ('0195a2c0-1a00-7000-8000-0000000000e4',
        '0195a2c0-1a00-7000-8000-0000000000e2', 'Other', 'Traveler',
        'other.traveler@example.com');

INSERT INTO public.trip (id, client_id, agent_id, title, trip_type, status, total_value_cents)
VALUES ('0195a2c0-1a00-7000-8000-0000000000e5',
        '0195a2c0-1a00-7000-8000-0000000000e4',
        '0195a2c0-1a00-7000-8000-0000000000e2',
        'Someone else''s trip', 'custom', 'proposal', 999999);

SELECT pg_temp.become('0195a2c0-1a00-7000-8000-0000000000e3'::uuid);
SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_trip_board()) = 1,
    'the second agent sees exactly their own one trip');
SELECT pg_temp.assert(
    (SELECT trip_id FROM public.agent_trip_board())
        = '0195a2c0-1a00-7000-8000-0000000000e5'::uuid,
    'and it is theirs, not Gyasi''s');
SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_inbox()) = 0,
    'the second agent sees none of Gyasi''s conversations');

-- THE ASSERTIONS AN AUDIT FOUND MISSING. Every accessor has its own tenancy predicate, and
-- each one is a separate chance to omit one — so each needs its own cross-tenant assertion.
-- `agent_payments_due` had none at all: deleting its `t.agent_id = me.agent_id` left the
-- whole suite green while it served every advisor's payment schedule to every other one.
SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_payments_due(3650)) = 0,
    'the second agent sees none of Gyasi''s payment milestones — the predicate this proves '
    'could be deleted without any other assertion in this file noticing');
SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_availability_self()) = 0,
    'and no availability row, because they have none — not Gyasi''s');

-- The KPI counts are separate subqueries with separate predicates. A forgotten one returns
-- MORE, which reads as a healthy book rather than as a bug.
SELECT pg_temp.assert(
    (SELECT active_client_count FROM public.agent_kpis()) = 1,
    'active_client_count is the second agent''s own single client, not the platform''s three');
SELECT pg_temp.assert(
    (SELECT unread_message_count FROM public.agent_kpis()) = 0,
    'unread_message_count is theirs alone');
SELECT pg_temp.assert(
    (SELECT commission_expected_cents = '0' AND pipeline_value_cents::bigint = 999999
       FROM public.agent_kpis()),
    'and their pipeline is exactly their one trip, with none of Gyasi''s commission');
RESET ROLE;

-- ── Cross-currency, where a second currency actually exists ──────────────────────
--
-- The seed is single-currency, so Gyasi's totals cannot show the difference between scoping
-- every money column and scoping none. Giving the second agent a EUR trip alongside their USD
-- one makes `dominant_currency` mean something, and asserts that the label and the figures
-- agree — which is the defect the audit found: three of four columns summed across everything
-- under a label only the fourth honoured.

INSERT INTO public.trip (id, client_id, agent_id, title, trip_type, status,
                         total_value_cents, currency)
VALUES ('0195a2c0-1a00-7000-8000-0000000000e6',
        '0195a2c0-1a00-7000-8000-0000000000e4',
        '0195a2c0-1a00-7000-8000-0000000000e2',
        'A trip priced in euros', 'custom', 'proposal', 4000000, 'EUR');

SELECT pg_temp.become('0195a2c0-1a00-7000-8000-0000000000e3'::uuid);
SELECT pg_temp.assert(
    (SELECT currency_count FROM public.agent_kpis()) = 2,
    'currency_count reports both currencies');
SELECT pg_temp.assert(
    (SELECT dominant_currency FROM public.agent_kpis()) = 'EUR',
    'one trip each is a tie, broken alphabetically — EUR, deterministically, so the tile does '
    'not change which currency it means between two reads of the same book');
SELECT pg_temp.assert(
    (SELECT pipeline_value_cents::bigint FROM public.agent_kpis()) = 4000000,
    'and the total is the EUR trip ALONE — 4,999,999 would be euros and dollars added together');
RESET ROLE;

-- Again with the majority the other way, so the assertion is about the scoping rather than
-- about which code happens to sort first.
INSERT INTO public.trip (id, client_id, agent_id, title, trip_type, status,
                         total_value_cents, currency)
VALUES ('0195a2c0-1a00-7000-8000-0000000000e7',
        '0195a2c0-1a00-7000-8000-0000000000e4',
        '0195a2c0-1a00-7000-8000-0000000000e2',
        'A second dollar trip', 'custom', 'proposal', 250000, 'USD');

SELECT pg_temp.become('0195a2c0-1a00-7000-8000-0000000000e3'::uuid);
SELECT pg_temp.assert(
    (SELECT dominant_currency FROM public.agent_kpis()) = 'USD',
    'two dollar trips against one euro trip makes USD dominant on count, not on spelling');
SELECT pg_temp.assert(
    (SELECT pipeline_value_cents::bigint FROM public.agent_kpis()) = 1249999,
    'and the total is the two dollar trips, with the larger euro one excluded — '
    'under-reporting with currency_count naming the exclusion, never a mixed sum');
RESET ROLE;

-- ── The posture itself ───────────────────────────────────────────────────────────

-- The projection as a catalog fact — the property a hand-written column list in TypeScript
-- cannot have. Data-Model §7.3 marks the refresh token Tokenized.
SELECT pg_temp.assert(
    pg_get_function_result('public.agent_availability_self'::regproc) NOT LIKE '%refresh_token%',
    'agent_availability_self() cannot name the encrypted calendar refresh token');

-- Schema-wide, so it catches the next definer function anyone writes, not just these six.
SELECT pg_temp.assert(
    NOT EXISTS (
        SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.prosecdef
           AND NOT EXISTS (
                SELECT 1 FROM unnest(coalesce(p.proconfig, ARRAY[]::text[])) cfg
                 WHERE cfg LIKE 'search\_path=%')
    ),
    'every SECURITY DEFINER function in public pins search_path');

SELECT pg_temp.assert(
    NOT EXISTS (
        SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public'
           AND (p.proname LIKE 'agent\_%' OR p.proname = 'current_agent_id')
           AND has_function_privilege('anon', p.oid, 'EXECUTE')
    ),
    'no agent read function is executable by anon');

-- The two new tables are agency data, reachable only through the accessors.
SELECT pg_temp.assert(
    NOT EXISTS (
        SELECT 1 FROM information_schema.role_table_grants
         WHERE table_schema = 'public' AND grantee IN ('anon', 'authenticated')
           AND table_name IN ('trip_status_history', 'pipeline_weight')
    ),
    'trip_status_history and pipeline_weight grant nothing to a client role');

SELECT pg_temp.assert(
    (SELECT count(*) FROM public.pipeline_weight
      WHERE agent_id = '0195a2c0-1a00-7000-8000-0000000000e2') = 6,
    'the trigger gave the second agent a complete weight set');

ROLLBACK;
