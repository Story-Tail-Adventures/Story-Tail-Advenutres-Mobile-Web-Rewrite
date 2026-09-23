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
        -- The dominant currency ranges over ALL of the agent's non-archived trips, whatever
        -- their status — not over the open book alone. "Booked · month" deliberately spans
        -- trips of any status, so an open-book-only currency dropped every trip booked this
        -- month that had since completed, and reported '0' with no currency named.
        SELECT currency FROM public.trip
         WHERE agent_id = '0195a2c0-1a00-7000-8000-000000000001' AND archived_at IS NULL
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

-- ── Fixture: a non-zero, non-uniform agent_unread_count ─────────────────────────
--
-- The seed's single conversation carries `agent_unread_count = 0`, and no migration writes
-- that column, so every assertion built on it compared 0 to 0. The header over the value
-- assertions in the agent section claims an audit closed that hole; it did not, because the
-- fixture had no non-zero value for an implementation to get wrong.
--
-- Two threads with DIFFERENT non-zero counts close it twice over. 3 and 4 have no integer
-- mean, so the sum (7) cannot be reproduced by any single constant across two rows, and the
-- per-thread assertions further down pin which count belongs to which thread.
--
-- The counts sit on two different trips on purpose — 3 on trip 40, 4 on trip 47 — because
-- `agent_trip_board().agent_unread_count` is a SUM over each trip's conversations and had no
-- assertion of any kind. Written HERE, above the fixture captures, so the owner-side
-- expectations and the functions are describing the same world.
UPDATE public.conversation
   SET agent_unread_count = 3
 WHERE id = '0195a2c0-1a00-7000-8000-0000000000b0';

INSERT INTO public.conversation (
    id, client_id, agent_id, trip_id, subject,
    last_message_at, last_message_preview, client_unread_count, agent_unread_count
) VALUES (
    '01a0b1c2-d300-7000-8000-0000000000c0',
    '0195a2c0-1a00-7000-8000-000000000013',
    '0195a2c0-1a00-7000-8000-000000000001',
    '0195a2c0-1a00-7000-8000-000000000047',
    'Cabo transfers',
    now() - interval '30 minutes',
    'I''ll send the resort transfer times tonight.', 0, 4);

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

-- `due_ever` and `due_cents` carry `t.archived_at IS NULL` because agent_payments_due() does
-- (the agent read-surface migration, in its WHERE clause). Without that predicate the
-- fixture would be comparable to the function only by the accident that the seed archives a
-- client and no trip. There is deliberately no upper bound on due_date here, so the
-- assertions that use these call the function with a window wide enough to include
-- everything rather than with the 14-day default.
CREATE TEMP TABLE expected_scope AS
SELECT (SELECT count(*) FROM public.client
         WHERE agent_id = '0195a2c0-1a00-7000-8000-000000000001' AND status = 'active')::integer
           AS active_clients,
       (SELECT count(*) FROM public.payment_milestone pm JOIN public.trip t ON t.id = pm.trip_id
         WHERE t.agent_id = '0195a2c0-1a00-7000-8000-000000000001'
           AND t.archived_at IS NULL
           AND pm.status IN ('scheduled','overdue') AND pm.due_date IS NOT NULL)::integer
           AS due_ever,
       (SELECT coalesce(sum(pm.amount_cents), 0)::bigint
          FROM public.payment_milestone pm JOIN public.trip t ON t.id = pm.trip_id
         WHERE t.agent_id = '0195a2c0-1a00-7000-8000-000000000001'
           AND t.archived_at IS NULL
           AND pm.status IN ('scheduled','overdue') AND pm.due_date IS NOT NULL)
           AS due_cents;

-- A scratch table for a figure read on one side of a write and compared on the other.
--
-- The booked-month regressions below used to compare a post-write function result against a
-- fixture frozen at the top of this transaction, which made them a function of the day of
-- the month: red on the 2nd and 3rd, and vacuous on the 1st. Stating the invariant as a
-- DELTA instead — "this write moves the figure by exactly N" — is both a tighter claim and
-- one no calendar date can break. It has to be a table rather than a psql variable because
-- the figure is read as `authenticated` while the write between the two reads is made as
-- the owner.
CREATE TEMP TABLE captured (label text PRIMARY KEY, cents bigint NOT NULL);

GRANT SELECT ON expected, expected_booked_month, expected_inbox, expected_scope,
              expected_commission TO authenticated;
GRANT SELECT, INSERT ON captured TO authenticated;

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

-- agent_payments_due() was exercised three times and every one was a row count, so not one
-- of its thirteen returned columns was compared to anything — and `due_ever`, computed and
-- GRANTed at the top of this file for exactly this, was never read. Any of the value columns
-- could have been replaced by a literal with the whole suite still green, and nothing else
-- in the repo would have caught it: the generated TypeScript types derive from the
-- signature, not the body.
SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_payments_due(3650)) = (SELECT due_ever FROM expected_scope)
      AND (SELECT due_ever FROM expected_scope) > 0,
    'agent_payments_due() returns exactly the agent''s unsettled, dated milestones');
SELECT pg_temp.assert(
    (SELECT sum(amount_cents::bigint) FROM public.agent_payments_due(3650))
        = (SELECT due_cents FROM expected_scope),
    'and the amounts are the table''s own — replacing pm.amount_cents in the projection with '
    'a literal leaves every row count intact and fails only here');

-- The overdue milestone, column by column, against hand-read literals from the seed. Each
-- one names a single-character edit that fails it: `pm.paid_cents` in place of
-- `pm.amount_cents`, `c.first_name` in place of `c.last_name`, a truncated label, a
-- swapped kind.
SELECT pg_temp.assert(
    (SELECT amount_cents = '256000' AND paid_cents = '0' AND currency = 'USD'
              AND kind = 'final' AND label = 'Final balance' AND status = 'overdue'
              AND trip_title = 'Cabo, Four Nights' AND client_display_name = 'Maya Carter'
       FROM public.agent_payments_due(3650)
      WHERE milestone_id = '0195a2c0-1a00-7000-8000-0000000000a3'),
    'the overdue milestone carries its own amount, paid figure, currency, kind, label, '
    'status, trip and client — not a placeholder and not another row''s');

SELECT pg_temp.assert(
    (SELECT milestone_id FROM public.agent_payments_due(3650) LIMIT 1)
        = '0195a2c0-1a00-7000-8000-0000000000a3'::uuid,
    'and the already-late one sorts first, which is the point of the section');

-- days_until, against a pair of rows this test writes itself.
--
-- Nothing seeded can carry this assertion. The seed's due dates are offsets from the
-- `current_date` of whenever the database was reset, so an absolute expectation goes stale
-- the next day — and the two seed blocks were even written on different days, so the
-- spacing BETWEEN the seeded milestones is not fixed either. Two rows thirty days on each
-- side of the same base are 60 apart no matter what the base is or which zone the function
-- resolves "today" in.
--
-- A literal 0 in place of `(pm.due_date - me.today)` collapses the difference to 0 and
-- fails; reversing the subtraction flips both signs and fails the second assertion.
RESET ROLE;
INSERT INTO public.payment_milestone (id, trip_id, kind, label, amount_cents, currency,
                                      due_date, status, order_index)
SELECT v.id, '0195a2c0-1a00-7000-8000-000000000040', 'interim', v.label, 1000, 'USD',
       (now() AT TIME ZONE a.time_zone)::date + v.day_offset, v.status, v.order_index
  FROM public.agent a
 CROSS JOIN (VALUES
    ('01a0b1c2-d300-7000-8000-0000000000f7'::uuid, 'Thirty days late',
     -30, 'overdue'::payment_milestone_status,   90),
    ('01a0b1c2-d300-7000-8000-0000000000f8'::uuid, 'Thirty days out',
      30, 'scheduled'::payment_milestone_status, 91)
 ) AS v(id, label, day_offset, status, order_index)
 WHERE a.id = '0195a2c0-1a00-7000-8000-000000000001';
SELECT pg_temp.become(:gyasi::uuid);
SELECT pg_temp.assert(
    (SELECT days_until FROM public.agent_payments_due(3650)
      WHERE milestone_id = '01a0b1c2-d300-7000-8000-0000000000f8')
      - (SELECT days_until FROM public.agent_payments_due(3650)
          WHERE milestone_id = '01a0b1c2-d300-7000-8000-0000000000f7') = 60,
    'days_until is a real day count — two milestones 60 days apart report a 60-day gap');
SELECT pg_temp.assert(
    (SELECT days_until < 0 FROM public.agent_payments_due(3650)
      WHERE milestone_id = '01a0b1c2-d300-7000-8000-0000000000f7')
      AND (SELECT days_until > 0 FROM public.agent_payments_due(3650)
            WHERE milestone_id = '01a0b1c2-d300-7000-8000-0000000000f8'),
    'and it goes negative for an already-late milestone, which is the behaviour the '
    'function''s own COMMENT promises and the reason the section has no lower bound');
RESET ROLE;
DELETE FROM public.payment_milestone
 WHERE id IN ('01a0b1c2-d300-7000-8000-0000000000f7',
              '01a0b1c2-d300-7000-8000-0000000000f8');
SELECT pg_temp.become(:gyasi::uuid);

-- Positive assertions on the VALUES, not just the row counts. An audit found that
-- agent_inbox().agent_unread_count and the whole of agent_availability_self() were never
-- compared to anything: replacing the unread column with a literal 0, or making the
-- availability function return nothing to anybody, left the suite green.
SELECT pg_temp.assert(
    (SELECT sum(agent_unread_count)::integer FROM public.agent_inbox())
        = (SELECT unread FROM expected_inbox)
      AND (SELECT count(*) FROM public.agent_inbox()) = (SELECT threads FROM expected_inbox),
    'agent_inbox() carries the real agent_unread_count, not a placeholder');

-- That sum had no teeth until the fixture above gave the column a non-zero value: with one
-- seeded thread carrying 0, it compared 0 to 0 and a literal 0 in the projection passed. It
-- is now 7 over two threads — and because a sum is still forgeable by any constant equal to
-- its mean, these pin WHICH count sits on which thread. 3 and 4 have no integer mean, so no
-- constant survives either assertion.
SELECT pg_temp.assert(
    (SELECT agent_unread_count FROM public.agent_inbox()
      WHERE conversation_id = '0195a2c0-1a00-7000-8000-0000000000b0') = 3
      AND (SELECT agent_unread_count FROM public.agent_inbox()
            WHERE conversation_id = '01a0b1c2-d300-7000-8000-0000000000c0') = 4,
    'and the right count on the right thread — 3 and 4, not one constant printed twice');

-- agent_trip_board().agent_unread_count had no assertion of any kind, of either sort. It is
-- a SUM over the trip's conversations rather than a column read, so it is its own chance to
-- join to the wrong trip — and its own chance to return NULL where the board needs 0.
SELECT pg_temp.assert(
    (SELECT agent_unread_count FROM public.agent_trip_board()
      WHERE trip_id = '0195a2c0-1a00-7000-8000-000000000040') = 3
      AND (SELECT agent_unread_count FROM public.agent_trip_board()
            WHERE trip_id = '0195a2c0-1a00-7000-8000-000000000047') = 4
      AND (SELECT agent_unread_count FROM public.agent_trip_board()
            WHERE trip_id = '0195a2c0-1a00-7000-8000-000000000048') = 0,
    'agent_trip_board() carries each trip''s OWN unread count, and 0 rather than NULL for a '
    'trip with no conversation at all');

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
-- Each of these passed before the fix and fails without it, ON EVERY RUN. They are asserted
-- here rather than left to the arithmetic above because every one of them was invisible in
-- a total.
--
-- That "on every run" is the bar a later audit had to add, and it is the standard for
-- anything written into this block: each regression names, in its own comment, the single
-- edit to the migration that turns it red. A regression that cannot name one is a comment,
-- not a test — (a) and (d) were both in that state, (a) because it restated an assertion
-- made earlier in this file over unchanged state, (d) because no fixture anywhere could tell
-- its predicate from its absence.

-- WHY (a) AND (b) BOTH WRITE THEIR OWN ROWS, AND BOTH ASSERT A DELTA.
--
-- The first version of each compared the function's answer against `expected_booked_month`,
-- a snapshot taken at the top of this transaction. Every seeded transition is a rolling
-- offset from now() — trip 47's booking is `now() - 3 days` — so which of them fall inside
-- the agent-local month is a function of today's date. That made (b) FAIL on the 2nd and
-- 3rd of every month (its own inserted row was in this month, trip 47's seeded one was not,
-- so a correct implementation disagreed with an empty snapshot) and prove nothing at all on
-- the 1st, when both sides read 0. It is the same class of time bomb as the hardcoded
-- 2026-09-20 in filters.test.ts that reddened every branch the day after it expired.
--
-- (a) was worse: it was the SAME predicate over the SAME unchanged state as the assertion
-- earlier in this file, so it could not fail unless that one already had, and the boundary row
-- its comment describes was never created by anybody.
--
-- Both now pin their fixture rows to the agent-local month edge rather than to an offset
-- from now(), and both assert a delta against a figure captured moments earlier. A delta is
-- a statement about the function; a snapshot was a statement about the calendar.
--
-- Trip 44 is the vehicle for both: `completed`, USD, non-archived, 692,000, created 700 days
-- ago and booked 685 days ago (seed.sql back-dates it so the cycle-time average is not built
-- from one shape). Its only booked transition is two years outside this month, so the rows
-- written below are the only ones that can put it in the tile, and the delta they cause is
-- exactly its value, twice its value, or nothing.
--
-- WHY NOT TRIP 48, WHICH BOTH FIXTURES USED FIRST. Trip 48's seeded created_at is
-- `now() - interval '15 days'`, while both fixtures anchor their rows to the agent-local
-- MONTH edge. From roughly the 16th of any month onward that edge is earlier than the trip's
-- own creation, so the fixtures wrote transitions dated before the trip they describe: while
-- those rows were live, `inquiry_to_book_days` took a negative summand and
-- `inquiry_to_book_sample` gained a trip. Nothing failed, only because the two assertions
-- that read those columns sit above these inserts and the rows are deleted before the next
-- read — correctness by assertion ordering, which is the same undocumented, load-bearing
-- ordering the cleanup guard further down this file was written to eliminate. It is also the
-- date-dependence class that has reddened this repo twice.
--
-- Trip 44 cannot invert on any calendar date: its creation is 23 months clear of every month
-- edge these fixtures can compute. And because it ALREADY has a booked transition 685 days
-- old, `min(changed_at)` and the sample count are unchanged by anything written here, so
-- both cycle-time columns stay exactly as the seeded book left them while the rows are live.
INSERT INTO captured (label, cents)
SELECT 'booked_month', booked_month_cents::bigint FROM public.agent_kpis();

-- (a) A booking at 23:00 on the last day of the PREVIOUS month, in the agent's zone. In a
-- zone behind UTC that instant's UTC calendar date is the 1st of THIS month, so comparing a
-- UTC date against the agent-local month boundaries pulls last month's booking into this
-- month's tile. Changing `AT TIME ZONE s.time_zone` to `AT TIME ZONE 'UTC'` in the
-- booked_month_trip CTE adds trip 44's 692,000 here, on every run — where before the
-- reverted implementation shipped green on about 98% of them.
RESET ROLE;

-- The instant, and the proof that it IS a boundary. "23:00 local on the last of the month is
-- the 1st in UTC" holds for a zone behind UTC and fails for one ahead of it, so if the
-- seeded agent ever moves east this fixture stops being a boundary — and this says so
-- loudly rather than passing for the wrong reason.
CREATE TEMP TABLE boundary AS
SELECT ((date_trunc('month', now() AT TIME ZONE a.time_zone) - interval '1 hour')
          AT TIME ZONE a.time_zone)                                AS at_utc,
       date_trunc('month', (now() AT TIME ZONE a.time_zone))::date AS month_start
  FROM public.agent a
 WHERE a.id = '0195a2c0-1a00-7000-8000-000000000001';

SELECT pg_temp.assert(
    (SELECT (at_utc AT TIME ZONE 'UTC')::date >= month_start FROM boundary),
    'the boundary fixture really is a boundary — its UTC date is inside this month while '
    'its agent-local date is the last day of the previous one');

INSERT INTO public.trip_status_history (id, trip_id, from_status, to_status, changed_at)
SELECT '01a0b1c2-d300-7000-8000-0000000000f3',
       '0195a2c0-1a00-7000-8000-000000000044',
       'proposal', 'booked', at_utc
  FROM boundary;

SELECT pg_temp.become(:gyasi::uuid);
SELECT pg_temp.assert(
    (SELECT booked_month_cents::bigint FROM public.agent_kpis())
        - (SELECT cents FROM captured WHERE label = 'booked_month') = 0,
    'booked_month_cents buckets in the AGENT''s zone, not UTC — a booking made on the last '
    'local evening of last month adds nothing to this month''s tile');
RESET ROLE;
DELETE FROM public.trip_status_history WHERE id = '01a0b1c2-d300-7000-8000-0000000000f3';
DROP TABLE boundary;
SELECT pg_temp.become(:gyasi::uuid);

-- (b) booked -> in_progress -> booked is legal and routine — a client changes dates and the
-- deposit is re-run. Under a join to the history that trip's whole value is counted twice.
-- This has to WRITE both transitions to prove anything: the seed has no trip booked twice,
-- so a passive assertion over it would go on passing if the EXISTS became a join.
--
-- All three rows are anchored to the first minutes of the agent-local month, which is inside
-- it on every date of every month, never in the future, and — trip 44 being 700 days old —
-- never before the trip existed. Under EXISTS trip 44 contributes 692,000 once; under a join
-- the two booked rows contribute it twice and the delta below reads 1,384,000. Its seeded
-- transitions are two years outside the window, so they add nothing under either reading.
RESET ROLE;
INSERT INTO public.trip_status_history (id, trip_id, from_status, to_status, changed_at)
SELECT v.id, '0195a2c0-1a00-7000-8000-000000000044', v.from_status, v.to_status,
       (date_trunc('month', now() AT TIME ZONE a.time_zone) + v.at_offset)
         AT TIME ZONE a.time_zone
  FROM public.agent a
 CROSS JOIN (VALUES
    ('01a0b1c2-d300-7000-8000-0000000000f1'::uuid,
     'proposal'::trip_status,    'booked'::trip_status,      interval '0 minutes'),
    ('01a0b1c2-d300-7000-8000-0000000000f2'::uuid,
     'booked'::trip_status,      'in_progress'::trip_status, interval '1 minute'),
    ('01a0b1c2-d300-7000-8000-0000000000f4'::uuid,
     'in_progress'::trip_status, 'booked'::trip_status,      interval '2 minutes')
 ) AS v(id, from_status, to_status, at_offset)
 WHERE a.id = '0195a2c0-1a00-7000-8000-000000000001';
SELECT pg_temp.become(:gyasi::uuid);
SELECT pg_temp.assert(
    (SELECT booked_month_cents::bigint FROM public.agent_kpis())
        - (SELECT cents FROM captured WHERE label = 'booked_month') = 692000,
    'a trip booked TWICE in one month is one summand, not two — trip 44 adds its 692,000 '
    'once, and a join over trip_status_history would add it again');
RESET ROLE;
DELETE FROM public.trip_status_history
 WHERE id IN ('01a0b1c2-d300-7000-8000-0000000000f1',
              '01a0b1c2-d300-7000-8000-0000000000f2',
              '01a0b1c2-d300-7000-8000-0000000000f4');
SELECT pg_temp.become(:gyasi::uuid);

-- And the seed-derived oracle still has its say, now that the written rows are gone: the
-- snapshot fixture and the function agree about the book as seeded. This one IS calendar-
-- dependent in what it covers — on a day when no seeded booking falls inside the month both
-- sides are 0 — which is why (a) and (b) above no longer lean on it.
SELECT pg_temp.assert(
    (SELECT booked_month_cents::bigint FROM public.agent_kpis()) =
    (SELECT coalesce(sum(total_value_cents), 0) FROM expected_booked_month),
    'and the written rows left no residue — the tile is back to the seeded book exactly');

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

-- That assertion alone cannot fail on the predicate it is named for. The fixture requires
-- `c.agent_id` AND `t.agent_id` to be the agent's, and the seed has one agent, so every
-- commission row satisfies both and the two sides pick the same set with or without
-- `JOIN span s ON c.agent_id = s.agent_id` in the comm CTE. The row that can tell them
-- apart needs a SECOND agent to exist, so it is written in the second-agent section below,
-- against this captured weighted figure. (Raw is checked against the owner-side fixture
-- above; weighted has no owner-side oracle, and it is the half that also proves the weight
-- lookup keys on the READER's agent_id.)
INSERT INTO captured (label, cents)
SELECT 'commission_weighted', commission_weighted_cents::bigint FROM public.agent_kpis();

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

-- Promote, and DROP THE STAND-IN CLIENT the trigger just made, exactly as seed.sql's own
-- DO block does after its promotion. handle_new_user() unconditionally creates an `active`
-- public.client owned by whichever agent the signup metadata names — and the metadata above
-- has to name Gyasi's agent to dodge the too_many_rows fallback — so without this DELETE the
-- fixture silently adds a client to GYASI's book and leaves it there for the rest of the
-- transaction. Nothing broke before only because every Gyasi-scoped assertion happened to
-- sit above this line, which is a load-bearing and undocumented ordering. The assertion
-- after the second-agent fixture below is what now holds both cleanups honest.
DO $$
DECLARE v_client_id uuid;
BEGIN
    SELECT client_id INTO v_client_id
      FROM public.platform_user
     WHERE account_id = '0195a2c0-1a00-7000-8000-0000000000e1';

    UPDATE public.platform_user
       SET role = 'admin', agent_id = '0195a2c0-1a00-7000-8000-0000000000e0', client_id = NULL
     WHERE account_id = '0195a2c0-1a00-7000-8000-0000000000e1';

    DELETE FROM public.client WHERE id = v_client_id;
END $$;

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

-- Promote exactly as seed.sql does, then drop the stand-in client row — the same trigger
-- side effect the admin fixture above cleans up, for the same reason. The comment here used
-- to promise this DELETE and no DELETE existed.
DO $$
DECLARE v_client_id uuid;
BEGIN
    SELECT client_id INTO v_client_id
      FROM public.platform_user
     WHERE account_id = '0195a2c0-1a00-7000-8000-0000000000e3';

    UPDATE public.platform_user
       SET role = 'agent', agent_id = '0195a2c0-1a00-7000-8000-0000000000e2', client_id = NULL
     WHERE account_id = '0195a2c0-1a00-7000-8000-0000000000e3';

    DELETE FROM public.client WHERE id = v_client_id;
END $$;

-- The ordering guard. Both fixtures above attach a stand-in client to Gyasi's agent id, and
-- the only thing that kept the suite honest was that no Gyasi-scoped assertion ran after
-- them. Removing either DELETE now fails HERE, by exactly the number of fixtures that leaked
-- — with a message that names the cause — instead of surfacing as an unexplained off-by-two
-- in whatever assertion someone adds to the end of this file next.
SELECT pg_temp.become(:gyasi::uuid);
SELECT pg_temp.assert(
    (SELECT active_client_count FROM public.agent_kpis())
        = (SELECT active_clients FROM expected_scope),
    'the admin and second-agent fixtures left no stand-in clients in Gyasi''s book');
RESET ROLE;

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

-- ── Regression (d), completed: a commission row whose agent_id is NOT its trip's ──
--
-- The `JOIN span s ON c.agent_id = s.agent_id` in agent_kpis()'s comm CTE carries a comment
-- calling itself load-bearing, and until now nothing in the suite could tell whether it was
-- there. The seed has one agent, so every commission row's agent_id equals its trip's, and
-- both the function and the fixture pick the same set either way. This writes the row that
-- comment describes — the SECOND advisor's commission sitting on GYASI's open trip 41,
-- which is what a split booking or a corrected import leaves behind.
--
-- Changing that join to `ON true` moves Gyasi's raw total by 80,000 and his weighted total
-- by 40,000 (trip 41 is a `proposal`, weight 50, looked up under GYASI's weights — which is
-- the second half of the exposure), and both halves of the first assertion fail.
INSERT INTO public.commission (
    id, trip_id, agent_id, supplier_id, gross_booking_cents, commission_pct,
    expected_commission_cents, payment_terms, status
) VALUES (
    '01a0b1c2-d300-7000-8000-0000000000f6',
    '0195a2c0-1a00-7000-8000-000000000041',
    '0195a2c0-1a00-7000-8000-0000000000e2',
    '0195a2c0-1a00-7000-8000-000000000030',
    1000000, 8.00, 80000, '60 days after travel', 'expected');

SELECT pg_temp.become(:gyasi::uuid);
SELECT pg_temp.assert(
    (SELECT commission_expected_cents::bigint FROM public.agent_kpis())
        = (SELECT raw_cents FROM expected_commission)
      AND (SELECT commission_weighted_cents::bigint FROM public.agent_kpis())
        = (SELECT cents FROM captured WHERE label = 'commission_weighted'),
    'another advisor''s commission row on Gyasi''s own trip stays out of Gyasi''s forecast, '
    'raw and weighted alike');
RESET ROLE;

SELECT pg_temp.become('0195a2c0-1a00-7000-8000-0000000000e3'::uuid);
SELECT pg_temp.assert(
    (SELECT commission_expected_cents FROM public.agent_kpis()) = '0',
    'and it does not reach the advisor it names either — the trip it sits on is not in '
    'their book, which is the other half of the pair');
RESET ROLE;

DELETE FROM public.commission WHERE id = '01a0b1c2-d300-7000-8000-0000000000f6';

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

-- ── The currency base is not the open book ───────────────────────────────────────
--
-- Both fixtures above move the dominant currency by changing the OPEN book, so they pass
-- whatever set `cur` is derived from and neither can tell one base from another. That is why
-- widening the base could ship green: Gyasi's seeded book is USD in every status, and this
-- advisor's three trips are all `proposal`, so the open book and the trips that feed a tile
-- were the same set everywhere in this file.
--
-- Here they cannot be. Two EUR trips booked AND completed inside this month: closed, so they
-- hold no pipeline and no commission, and still summed by "Booked · month" — which is the
-- whole reason the base cannot be `open_trip`. EUR is now the most-used currency among the
-- trips that feed a figure, 3 to 2, while USD is still the majority of the open book, 2 to 1.
--
-- Revert `cur` and `currency_count` to `FROM open_trip` and every assertion below flips:
-- dominant USD, pipeline 1,249,999, booked_month 0 — no USD trip of theirs was booked this
-- month — and both commission figures 0, because the only commission row sits on the EUR
-- trip. That is the shape the tile showed when an advisor's last open trip completed.
--
-- `changed_at` is now() and `created_at` two days back: the transition is inside the
-- agent-local month on every calendar date and never precedes the trip it describes, which
-- is the anchoring trap documented at the booked-month fixtures above.
INSERT INTO public.trip (id, client_id, agent_id, title, trip_type, status,
                         total_value_cents, currency, created_at)
VALUES
    ('0195a2c0-1a00-7000-8000-0000000000e8',
     '0195a2c0-1a00-7000-8000-0000000000e4',
     '0195a2c0-1a00-7000-8000-0000000000e2',
     'Euros, booked and travelled this month', 'custom', 'completed',
     3000000, 'EUR', now() - interval '2 days'),
    ('0195a2c0-1a00-7000-8000-0000000000e9',
     '0195a2c0-1a00-7000-8000-0000000000e4',
     '0195a2c0-1a00-7000-8000-0000000000e2',
     'A second euro trip, already home', 'custom', 'completed',
     1500000, 'EUR', now() - interval '2 days');

INSERT INTO public.trip_status_history (id, trip_id, from_status, to_status, changed_at)
VALUES ('01a0b1c2-d300-7000-8000-0000000000fa',
        '0195a2c0-1a00-7000-8000-0000000000e8', 'proposal', 'booked', now()),
       ('01a0b1c2-d300-7000-8000-0000000000fb',
        '0195a2c0-1a00-7000-8000-0000000000e9', 'proposal', 'booked', now());

-- A commission on the OPEN euro trip, so the forecast has something to be scoped wrongly.
-- Without it both commission columns are 0 under every base and half the strip proves
-- nothing.
INSERT INTO public.commission (
    id, trip_id, agent_id, supplier_id, gross_booking_cents, commission_pct,
    expected_commission_cents, payment_terms, status
) VALUES (
    '01a0b1c2-d300-7000-8000-0000000000fc',
    '0195a2c0-1a00-7000-8000-0000000000e6',
    '0195a2c0-1a00-7000-8000-0000000000e2',
    '0195a2c0-1a00-7000-8000-000000000030',
    5000000, 12.00, 600000, '60 days after travel', 'expected');

SELECT pg_temp.become('0195a2c0-1a00-7000-8000-0000000000e3'::uuid);
SELECT pg_temp.assert(
    (SELECT dominant_currency FROM public.agent_kpis()) = 'EUR'
      AND (SELECT currency_count FROM public.agent_kpis()) = 2,
    'the label follows the trips that feed a figure, not the open book — two euro trips '
    'booked and completed this month outvote two open dollar ones');

-- The half that matters most, and the one a currency assertion alone does not make: a label
-- is only worth having if the numbers under it are real. Every figure here is non-zero and
-- in euros — the open EUR trip, the two EUR bookings, and the EUR commission at proposal
-- weight. A base that names a currency the money columns cannot fill reports 0 under a label
-- that says otherwise, and the exclusion note then names an exclusion that never happened.
SELECT pg_temp.assert(
    (SELECT pipeline_value_cents::bigint       FROM public.agent_kpis()) = 4000000
      AND (SELECT booked_month_cents::bigint        FROM public.agent_kpis()) = 4500000
      AND (SELECT commission_expected_cents::bigint FROM public.agent_kpis()) = 600000
      AND (SELECT commission_weighted_cents::bigint FROM public.agent_kpis()) = 300000
      AND (SELECT commission_confidence_pct        FROM public.agent_kpis()) = 50,
    'and every money figure is a real number in the currency the label names — 4,000,000 '
    'open, 4,500,000 booked this month, 600,000 of commission at proposal weight, no 0s');
RESET ROLE;

-- ── Nor is it the whole book ─────────────────────────────────────────────────────
--
-- The mirror of the fixture above, and the reason the base is the trips that feed a figure
-- rather than every trip the advisor owns. Four cancelled GBP trips are now the largest group
-- in this book and reach no figure on the strip: not open, so no pipeline and no commission;
-- no booking this month, so nothing in "Booked · month". A base of the whole book hands them
-- the label anyway, and the tiles they cannot fill read 0 beside an untouched "3 active
-- trips" — a wrong number presented as a fact, under an exclusion note counting a currency
-- that was never in any of these sums to be excluded from.
--
-- Change `FROM money_trip` to `FROM book_trip` in the `cur` CTE and this assertion is the
-- only one in the suite that notices: dominant GBP, currency_count 3, pipeline 0, both
-- commission figures 0 and commission_confidence_pct NULL. The fixture above stays green
-- under that same edit, because EUR leads the whole book too.
INSERT INTO public.trip (id, client_id, agent_id, title, trip_type, status,
                         total_value_cents, currency)
SELECT ('01a0b1c2-d300-7000-8000-4' || lpad(g::text, 11, '0'))::uuid,
       '0195a2c0-1a00-7000-8000-0000000000e4',
       '0195a2c0-1a00-7000-8000-0000000000e2',
       'Cancelled, priced in pounds #' || g, 'custom', 'cancelled', 800000, 'GBP'
  FROM generate_series(1, 4) AS g;

SELECT pg_temp.become('0195a2c0-1a00-7000-8000-0000000000e3'::uuid);
SELECT pg_temp.assert(
    (SELECT dominant_currency FROM public.agent_kpis()) = 'EUR'
      AND (SELECT currency_count FROM public.agent_kpis()) = 2
      AND (SELECT pipeline_value_cents::bigint FROM public.agent_kpis()) = 4000000
      AND (SELECT active_trip_count FROM public.agent_kpis()) = 3,
    'four cancelled pound trips get no vote — a currency no figure on the strip could have '
    'included cannot take the label, and cannot turn a live pipeline into a 0');
RESET ROLE;

-- ── A book bigger than any page ──────────────────────────────────────────────────
--
-- `agent_trip_board()` carried `LIMIT least(coalesce(p_limit, 200), 500)`, and both callers
-- ask for the whole board with no arguments and then aggregate what comes back — the
-- pipeline columns' counts and totals, the worklist's sections and its needs-you count, the
-- calendar's departures. Past the 200th trip every one of those was an aggregate over a page
-- with nothing on the screen saying so. The assertion written for that contract — 'returns
-- every non-archived trip in the agent's book, and no more', near the top of this file —
-- passes under the old cap, under a bare `LIMIT 200` and under no cap at all, because
-- Gyasi's seeded book is nine trips. Nothing here could exceed a page.
--
-- 201 generated trips, on the throwaway advisor rather than on Gyasi so that nothing
-- asserted above moves, and deleted immediately afterwards so the posture section reads the
-- book the rest of this file describes. Put the old cap back and the board returns 200 while
-- the advisor's book holds 210.
INSERT INTO public.trip (id, client_id, agent_id, title, trip_type, status,
                         total_value_cents, currency)
SELECT ('01a0b1c2-d300-7000-8000-2' || lpad(g::text, 11, '0'))::uuid,
       '0195a2c0-1a00-7000-8000-0000000000e4',
       '0195a2c0-1a00-7000-8000-0000000000e2',
       'A book of many trips #' || g, 'custom', 'inquiry', 1000, 'USD'
  FROM generate_series(1, 201) AS g;

CREATE TEMP TABLE expected_bulk AS
SELECT count(*)::bigint AS trips
  FROM public.trip
 WHERE agent_id = '0195a2c0-1a00-7000-8000-0000000000e2' AND archived_at IS NULL;
GRANT SELECT ON expected_bulk TO authenticated;

SELECT pg_temp.become('0195a2c0-1a00-7000-8000-0000000000e3'::uuid);
SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_trip_board()) = (SELECT trips FROM expected_bulk)
      AND (SELECT trips FROM expected_bulk) > 200,
    'agent_trip_board() with no arguments returns the WHOLE book, past any page size — '
    'every caller aggregates these rows, and an aggregate over a page is a wrong number');

-- And the parameter survived the removal: what went was the hidden default and the 500-row
-- ceiling, not a caller's ability to ask for a page. Deleting the `LIMIT p_limit` clause
-- leaves the assertion above green and fails only here.
SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_trip_board(NULL::trip_status[], NULL::integer, 25))
        = 25,
    'and an explicit p_limit is still honoured — a caller that pages knows that it paged');
RESET ROLE;

DELETE FROM public.trip
 WHERE agent_id = '0195a2c0-1a00-7000-8000-0000000000e2'
   AND title LIKE 'A book of many trips #%';
DROP TABLE expected_bulk;

-- WHAT THE THREE FIXTURES ABOVE LEAVE BEHIND, stated rather than left to be rediscovered.
-- The generated trips are gone. The second advisor keeps the two completed EUR trips, the
-- four cancelled GBP ones and the EUR commission row, so an assertion added below reads a
-- book of nine trips in three currencies rather than the three it had earlier in this file.
-- Nothing of GYASI's moved: every row written since his last assertion belongs to `…e2`,
-- which is the property that lets these sit at the end without an ordering rule.
--
-- ── The posture itself ───────────────────────────────────────────────────────────

-- The projection as a catalog fact — the property a hand-written column list in TypeScript
-- cannot have. Data-Model §7.3 marks the refresh token Tokenized.
SELECT pg_temp.assert(
    pg_get_function_result('public.agent_availability_self'::regproc) NOT LIKE '%refresh_token%',
    'agent_availability_self() cannot name the encrypted calendar refresh token');

-- Schema-wide, so it catches the next definer function anyone writes, not just these six.
--
-- THE PROPERTY IS THE POSITION, NOT THE PRESENCE OF A PIN, and this file's copy tested only
-- the presence — `cfg LIKE 'search\_path=%'`, that SOME value was set. The trap the read
-- surface migration's header is about is that pg_temp is searched BEFORE pg_catalog for
-- relation names unless it is positioned explicitly, so a caller who can create a temp table
-- named `platform_user` shadows the real one inside a function running as the table owner.
-- `SET search_path = public` leaves pg_temp exactly there and satisfied the old test. This
-- is now the same shape the migration enforces at deploy time, so a function cannot pass one
-- gate and fail the other.
--
-- Two ways to satisfy it. pg_temp named LAST, or an EMPTY search_path: `SET search_path =
-- ''` resolves nothing implicitly at all, including pg_temp, which is stricter than
-- pg_temp-last rather than weaker — and it is what Supabase's own function_search_path_mutable
-- advisor recommends. Postgres stores it as the proconfig entry `search_path=""`, whose last
-- comma-separated element btrims to the empty string, so a naive last-element test reads the
-- safest possible pin as an offender.
--
-- Extension-owned functions are out of scope: citext and pg_trgm were installed into public
-- in 20260514120000, nothing here can ALTER what an extension owns, and demanding zero rows
-- without the pg_depend exclusion would be an assertion that can never pass.
SELECT pg_temp.assert(
    NOT EXISTS (
        SELECT 1
          FROM pg_proc p
          JOIN pg_namespace n ON n.oid = p.pronamespace
          LEFT JOIN LATERAL (
                SELECT substr(cfg, length('search_path=') + 1) AS value
                  FROM unnest(coalesce(p.proconfig, ARRAY[]::text[])) cfg
                 WHERE cfg LIKE 'search\_path=%'
                 LIMIT 1
               ) sp ON true
         WHERE n.nspname = 'public'
           AND p.prosecdef
           AND NOT EXISTS (
                SELECT 1 FROM pg_depend d
                 WHERE d.classid = 'pg_proc'::regclass
                   AND d.objid   = p.oid
                   AND d.deptype = 'e')
           AND (
                sp.value IS NULL
                OR (btrim(sp.value, ' "') <> ''
                    AND btrim(
                          (string_to_array(sp.value, ','))[
                              cardinality(string_to_array(sp.value, ','))],
                          ' "'
                        ) <> 'pg_temp')
               )
    ),
    'every SECURITY DEFINER function in public ends its search_path with pg_temp, or pins '
    'it empty — a pin that merely exists still leaves pg_temp searched first');

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
