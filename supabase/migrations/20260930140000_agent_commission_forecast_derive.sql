-- The commission forecast derives. The ledger stays stored. They were never one number.
--
-- ── THE DEFECT ──────────────────────────────────────────────────────────────────────────
--
-- `public.commission` has six money and status columns and NO producer. Its only writer in
-- the whole repository is seed.sql: no trigger, no RPC, no Edge Function, no import
-- pipeline. `agent-trip-status/index.ts:47` says so out loud — "it does not touch
-- commission" — and the row §3.7 will eventually write has never been written.
--
-- Three of `agent_kpis()`'s fifteen columns read it, on three live routes (the worklist,
-- the pipeline board and the calendar). Measured against the seed, that figure is wrong in
-- two directions at once:
--
--   * Trip 40 disagrees with ITSELF by $223.04. Its six components sum to 131,836 in
--     commission, because two flights are correctly recorded at 0%. The trigger from
--     20260928100000 puts that in `trip.total_commission_cents`, so screen 3.4.2 says
--     $1,318.36 — while the ledger row applies a flat 12% to the whole trip value and the
--     3.2.1 KPI counts $1,541.40 for the same trip.
--   * Three BOOKED trips are invisible to the forecast entirely: Maldives 297,600, Kyoto
--     136,800, Bimini 47,520. $4,819.20 of committed margin the agent cannot see, because
--     16 of 22 revenue trips have no ledger row at all.
--
-- ── WHY THIS IS A SPLIT AND NOT A CHOICE ────────────────────────────────────────────────
--
-- The obvious reading is that one of the two sources is right and the other should go. It
-- is not: §3.7's drawn screens need BOTH, and they need them to be able to disagree.
--
-- `design/source-prototype/screens/agent-commission.jsx:201` draws a reconciliation row
-- reading *"Expected $1,020 — Sandals applied 14% not 15%"*. For that sentence to exist,
-- expected must be a STORED CLAIM that can disagree with the world. A value derived from
-- components can only ever agree with its own children: the moment the advisor corrects
-- the component to 14%, which they must, the discrepancy evaporates and screen 3.7.6 has
-- nothing left to reconcile. Line 202 draws money with no trip behind it at all
-- (*"UNK-441 · Princess · $284 · No match found"*), and line 124 draws a Save form "for
-- trips booked outside the platform". A recompute trigger fails the same way from the
-- other side, by making the ledger a function of components.
--
-- So: ONE SYMPTOM, TWO DEFECTS.
--
--   Defect 1, live today: a TRIP-GRAIN forecast sourced from a LINE-GRAIN ledger that
--   covers 6 of 22 revenue trips. Fixed here, by reading the column that already has a
--   working producer.
--
--   Defect 2, latent: `commission` has no write surface. Its producer is §3.7's write
--   migration, which does not exist. NOT faked here. 20260930150000 constrains the table
--   so seed nonsense cannot pass, and comments name §3.7 as the owner.
--
-- The grain check that settles it: the prototype's forecast says "Across 26 trips" and its
-- dashboard says "9 trips". Both count TRIPS. 3.7.2 counts lines. These were always two
-- queries reading two things.
--
-- ── WHAT MOVES ON SCREEN ────────────────────────────────────────────────────────────────
--
-- Measured against the seed before writing this, rather than predicted: the raw forecast
-- goes 650,460 -> 1,110,076 and the weighted 477,900 -> 937,516, so "Commission expected"
-- reads $11,101 where it read $6,505 and confidence moves 73% -> 84%. That is the fix, not
-- a regression, and it is a big enough jump that anyone eyeballing the dashboard needs to
-- be told. `constraints_commission.sql` asserts it from both sides rather than pinning the
-- literal alone.
--
-- The signature does not change. `web/lib/agent/api.ts`, `queries.ts` and the three routes
-- need ZERO edits — which is a claim worth testing rather than trusting, so the assertion
-- block below reads it out of the catalog.

BEGIN;

CREATE OR REPLACE FUNCTION public.agent_kpis()
RETURNS TABLE (
    agent_id                   uuid,
    as_of_date                 date,
    currency                   char(3),
    pipeline_value_cents       text,
    booked_month_cents         text,
    commission_expected_cents  text,
    commission_weighted_cents  text,
    commission_confidence_pct  smallint,
    inquiry_to_book_days       numeric,
    inquiry_to_book_sample     integer,
    active_client_count        integer,
    active_trip_count          integer,
    new_inquiry_count          integer,
    unread_message_count       integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    WITH me AS (
        SELECT a.id AS agent_id,
               a.time_zone,
               (now() AT TIME ZONE a.time_zone)::date AS today
          FROM public.agent a
         WHERE a.id = public.current_agent_id()
    ),
    span AS (
        SELECT agent_id, time_zone, today,
               date_trunc('month', today)::date                            AS month_start,
               (date_trunc('month', today) + interval '1 month')::date     AS month_end
          FROM me
    ),
    -- The whole book: every non-archived trip this agent owns, whatever its status. Nothing
    -- is scoped to `book_trip` itself — it is the pool the three sets below are cut from.
    book_trip AS (
        SELECT t.*
          FROM public.trip t, span s
         WHERE t.agent_id = s.agent_id
           AND t.archived_at IS NULL
    ),
    open_trip AS (
        SELECT * FROM book_trip
         WHERE status IN ('inquiry', 'proposal', 'booked', 'in_progress')
    ),
    -- Trips whose FIRST booking inside the month happened this month.
    --
    -- EXISTS over the history rather than a join to it, because a join sums the trip's value
    -- once per matching row. `trip_status_history` only forbids a transition to the status
    -- the trip is already in, so booked -> in_progress -> booked is legal and routine (a
    -- client changes dates, the deposit is re-run) — and under a join that trip's whole value
    -- is counted twice, with nothing on the screen to say so.
    --
    -- The comparison is in the AGENT's time zone, matching the boundaries `span` computed.
    -- Comparing a UTC calendar date against agent-local month boundaries misfiles every
    -- booking made in the offset's worth of hours at each month edge: for America/Chicago a
    -- trip booked at 23:00 on the 31st is 04:00 UTC on the 1st, and lands in the wrong month.
    booked_month_trip AS (
        SELECT t.*
          FROM book_trip t
          JOIN span s ON t.agent_id = s.agent_id
         WHERE EXISTS (
                SELECT 1
                  FROM public.trip_status_history h
                 WHERE h.trip_id = t.id
                   AND h.to_status = 'booked'
                   AND (h.changed_at AT TIME ZONE s.time_zone)::date >= s.month_start
                   AND (h.changed_at AT TIME ZONE s.time_zone)::date <  s.month_end
               )
    ),
    -- Exactly the trips that feed a money figure, and nothing else: pipeline_value sums
    -- `open_trip`, both commission figures sum `open_trip`, booked_month sums
    -- `booked_month_trip`. A trip that is neither open nor booked inside this month reaches
    -- no tile, so it gets no say in what the tiles are labelled.
    --
    -- This CTE used to pick a dominant currency and every money column was filtered to it.
    -- Now it only labels. Both of the obvious bases for that label have been wrong here in
    -- the past and the reasoning still applies, which is why the set is computed rather than
    -- assumed: `open_trip` alone handed a NULL label to any agent with nothing currently
    -- open, and `book_trip` labelled the tiles with a currency only cancelled or
    -- long-completed trips voted for.
    money_trip AS (
        SELECT t.*
          FROM book_trip t
         WHERE t.id IN (SELECT id FROM open_trip)
            OR t.id IN (SELECT id FROM booked_month_trip)
    ),
    -- THE FORECAST IS A TRIP-GRAIN FIGURE AND NOW READS A TRIP-GRAIN SOURCE.
    --
    -- Weighted against pipeline_weight (Data-Model §7.4), joined on the trip's status. What
    -- changed in 20260930140000 is where the money comes from: `trip.total_commission_cents`,
    -- maintained by the trigger in 20260928100000 as the sum of its components' own
    -- commission, instead of the `commission` ledger.
    --
    -- Three things this quietly removes, each worth naming rather than silently dropping:
    --
    --  * The `c.agent_id = s.agent_id` guard. It defended against a commission row whose
    --    own agent_id does not match its trip's, which the schema permits. `open_trip` is
    --    already agent-scoped, so the hazard is now structurally impossible rather than
    --    merely guarded.
    --  * The `c.status IN ('expected','invoiced')` filter, whose job was to exclude money
    --    already earned or dead. `open_trip`'s status set does that, and does it better:
    --    the old filter could count a ledger row AND the same trip's components if a
    --    producer ever wrote both.
    --  * The join to `commission` itself, which is what made the figure wrong.
    comm AS (
        SELECT
            coalesce(sum(t.total_commission_cents), 0)::bigint AS raw_cents,
            coalesce(sum(t.total_commission_cents * pw.weight_pct / 100.0), 0)::bigint
                AS weighted_cents
          FROM open_trip t
          JOIN span s ON t.agent_id = s.agent_id
          JOIN public.pipeline_weight pw
                           ON pw.agent_id = s.agent_id AND pw.status = t.status
    ),
    booked_month AS (
        SELECT coalesce(sum(t.total_value_cents), 0)::bigint AS cents
          FROM booked_month_trip t
    ),
    -- Time from a trip's creation to its FIRST booked transition. `trip.created_at` is the
    -- inquiry moment (trip.status defaults to inquiry), so only the booked end needs history.
    cycle AS (
        SELECT avg(EXTRACT(epoch FROM first_booked - t.created_at) / 86400.0) AS days,
               count(*)::integer                                              AS sample
          FROM public.trip t
          JOIN span s ON t.agent_id = s.agent_id
          JOIN LATERAL (
                SELECT min(h.changed_at) AS first_booked
                  FROM public.trip_status_history h
                 WHERE h.trip_id = t.id AND h.to_status = 'booked'
               ) fb ON fb.first_booked IS NOT NULL
         WHERE t.archived_at IS NULL
    )
    SELECT
        s.agent_id,
        s.today,
        -- One currency or none. `trip_currency_usd` makes more than one impossible; if that
        -- constraint is ever lifted this returns NULL rather than labelling a mixed sum with
        -- one of the currencies it mixes. NULL also remains the honest answer for an agent
        -- whose book reaches no money figure at all.
        (SELECT CASE WHEN count(DISTINCT t.currency) = 1
                     THEN min(t.currency)::char(3) END
           FROM money_trip t),
        (SELECT coalesce(sum(total_value_cents), 0)::text FROM open_trip),
        (SELECT cents::text FROM booked_month),
        (SELECT raw_cents::text FROM comm),
        (SELECT weighted_cents::text FROM comm),
        -- NULL rather than 0 when there is nothing to be confident about: a 0% confidence
        -- figure over an empty pipeline is a claim, and an empty pipeline does not make one.
        (SELECT CASE WHEN raw_cents > 0
                     THEN round(weighted_cents * 100.0 / raw_cents)::smallint END FROM comm),
        (SELECT round(days, 1) FROM cycle),
        (SELECT sample FROM cycle),
        (SELECT count(*)::integer FROM public.client c
          WHERE c.agent_id = s.agent_id AND c.status = 'active'),
        (SELECT count(*)::integer FROM open_trip
          WHERE status IN ('proposal', 'booked', 'in_progress')),
        (SELECT count(*)::integer FROM open_trip WHERE status = 'inquiry'),
        (SELECT coalesce(sum(cv.agent_unread_count), 0)::integer
           FROM public.conversation cv
          WHERE cv.agent_id = s.agent_id AND cv.archived_at IS NULL)
      FROM span s;
$$;

COMMENT ON FUNCTION public.agent_kpis() IS
    'Screen 3.2.1''s KPI strip. RETURNS TABLE rather than a scalar row on purpose: an agent '
    'with an empty book gets one row of zeros, a non-agent gets NO row. "Not an agent" and '
    '"an agent with nothing" must be distinguishable, or the screen renders a confident $0 '
    'at a client. Money is a digit-string. The three commission columns are DERIVED from '
    'trip.total_commission_cents, not from the commission ledger — see this migration''s '
    'header for why those are two different numbers on purpose.';

-- ── ASSERTIONS ───────────────────────────────────────────────────────────────────

-- The signature is unchanged, asserted rather than asserted-in-prose. Fifteen columns, same
-- names: a caller that needed editing would mean this migration was not the no-op for the
-- web layer that its header claims.
DO $$
DECLARE result text := pg_get_function_result('public.agent_kpis()'::regprocedure);
BEGIN
    IF result NOT LIKE '%commission_expected_cents text%'
       OR result NOT LIKE '%commission_weighted_cents text%'
       OR result NOT LIKE '%commission_confidence_pct smallint%' THEN
        RAISE EXCEPTION
            'agent_kpis() lost or renamed a commission column; web/lib/agent/api.ts mirrors '
            'this signature by hand. Got: %', result;
    END IF;

    IF result LIKE '%currency_count%' THEN
        RAISE EXCEPTION 'agent_kpis() regained currency_count; see 20260930100000';
    END IF;
END $$;

-- The ledger is no longer reachable from the KPI strip. Asserted from the function body,
-- because this is the property the whole migration is about and a future edit that joins
-- `commission` back in would restore the exact defect without changing any column name.
DO $$
DECLARE body text := pg_get_functiondef('public.agent_kpis()'::regprocedure);
BEGIN
    IF body LIKE '%public.commission%' THEN
        RAISE EXCEPTION
            'agent_kpis() reads public.commission again. The forecast is trip-grain and the '
            'ledger is line-grain over 6 of 22 revenue trips; joining them is what made the '
            'KPI disagree with screen 3.4.2 by $223.04 on one trip and miss $4,819.20 on '
            'three others.';
    END IF;

    IF body NOT LIKE '%total_commission_cents%' THEN
        RAISE EXCEPTION 'agent_kpis() no longer reads trip.total_commission_cents';
    END IF;
END $$;

COMMIT;
