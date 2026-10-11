-- §3.7.1 Commission Dashboard and §3.7.2 Commission Ledger — the read surface.
--
-- Stage 1 of §3.7. Five SECURITY DEFINER accessors and nothing else: no write, no trigger,
-- no policy. The ledger's producers (§3.7.3 edit, §3.7.4 add, §3.7.5 import) are Stages 2
-- and 3, and the forecast screen (§3.7.7) is Stage 4.
--
-- ── WHY ACCESSORS AND NOT POLICIES ──────────────────────────────────────────────────────
--
-- The PR that split the forecast from the ledger left a note saying `commission` "has RLS
-- with no policies, and §3.7 needs policies". It does not. The payment-domain lockdown
-- revoked every privilege on `commission` from anon and authenticated, so the table is
-- service-role-only for the READ as well as the write, the way §2.4's tables are. The agent
-- reads it the way §3.2 to §3.4 read everything else: through definer functions that
-- resolve the caller from `current_agent_id()` and project a hand-written column list. A
-- policy would have to come WITH a table grant, and restoring a table grant is exactly what
-- the lockdown exists to prevent.
--
-- ── BOTH AGENT IDS ARE FILTERED ─────────────────────────────────────────────────────────
--
-- A commission row carries its own `agent_id` and so does its trip, and nothing in the
-- schema makes them agree. §3.2's audit found an accessor that filtered one and trusted the
-- other. Every query below requires BOTH to be the caller, so a row whose two ids disagree
-- is visible to neither advisor rather than to the wrong one. `rls_agent_commission.sql`
-- plants that row and asserts it.
--
-- ── THE FOUR DASHBOARD TILES, AS GYASI RULED THEM (2026-10-11) ──────────────────────────
--
-- The prototype (agent-commission.jsx, A371) and Screen Inventory §3.7.1 name different
-- tiles. Gyasi took the prototype's four, and settled the two that could be read two ways:
--
--   * YTD received      — money that ARRIVED this calendar year, in the agent's time zone,
--                         beside the same window one year earlier. Ledger grain.
--   * Expected · 90d    — TRIP grain, from `trip.total_commission_cents`: booked trips that
--                         start in the next 90 days, plus every trip already in progress.
--                         Not ledger lines: most booked trips have no line yet, and a trip
--                         with no line has not been invoiced — that is a state, not a gap.
--   * At risk           — the UNPAID GAP on disputed lines, `expected - fee - received`,
--                         never below zero. Money that already arrived is not at risk.
--   * Avg rate          — expected over gross, weighted by gross, across the same lines the
--                         YTD figure sums. A plain mean of `commission_pct` would let a $40
--                         excursion move the rate as much as a $10,000 resort week.
--
-- So the dashboard reads BOTH numbers on purpose — the trip-grain forecast and the
-- line-grain ledger — and labels which is which. See the ledger integrity migration's
-- header for why they are two numbers and must stay able to disagree.
--
-- ── MONEY ───────────────────────────────────────────────────────────────────────────────
--
-- Every money column crosses as `::text`: PostgREST serialises bigint as a JSON number and
-- precision goes above 2^53. One `currency` label per call, `CASE WHEN count(DISTINCT) = 1`
-- over the rows the figures touch — the USD-only form, which degrades to NULL rather than
-- to a wrong label if `trip_currency_usd` is ever lifted.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- §3.7.2 Ledger — one row per commission line
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.agent_commission_ledger(
    p_status      commission_status[] DEFAULT NULL,
    p_supplier_id uuid                DEFAULT NULL,
    p_trip_id     uuid                DEFAULT NULL,
    p_travel_from date                DEFAULT NULL,
    p_travel_to   date                DEFAULT NULL,
    p_limit       integer             DEFAULT 25,
    p_offset      integer             DEFAULT 0
)
RETURNS TABLE (
    commission_id             uuid,
    trip_id                   uuid,
    trip_title                text,
    trip_archived             boolean,
    client_id                 uuid,
    client_display_name       text,
    supplier_id               uuid,
    supplier_name             text,
    start_date                date,
    end_date                  date,
    gross_booking_cents       text,
    commission_pct            numeric,
    expected_commission_cents text,
    processing_fee_cents      text,
    received_commission_cents text,
    currency                  char(3),
    status                    commission_status,
    received_at               date,
    inteletravel_reference    text,
    as_of_date                date,
    total_count               integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    WITH me AS (
        SELECT a.id AS agent_id,
               (now() AT TIME ZONE a.time_zone)::date AS today
          FROM public.agent a
         WHERE a.id = public.current_agent_id()
    ),
    -- An ARCHIVED trip's lines stay. §3.4.16 archives a trip to take it off the working
    -- surfaces, but a commission line is a tax record (Data-Model §18.5 retains it even
    -- through erasure), and dropping it here would quietly shrink the year's received total.
    -- `trip_archived` rides along so the screen knows not to link into a trip detail that
    -- will not open.
    lines AS (
        SELECT c.*,
               t.title                     AS trip_title,
               t.archived_at IS NOT NULL   AS trip_archived,
               t.client_id,
               t.start_date,
               t.end_date,
               coalesce(cl.preferred_name, cl.first_name) || ' ' || cl.last_name
                                           AS client_display_name,
               s.name                      AS supplier_name
          FROM public.commission c
          JOIN me              ON c.agent_id = me.agent_id
          JOIN public.trip t   ON t.id = c.trip_id AND t.agent_id = me.agent_id
          JOIN public.client cl ON cl.id = t.client_id
          JOIN public.supplier s ON s.id = c.supplier_id
         -- NULL and an EMPTY array both mean every status. A caller that sends `[]` for
         -- "no chip ticked" would otherwise see an empty ledger and read it as an empty book.
         WHERE (p_status IS NULL OR cardinality(p_status) = 0 OR c.status = ANY (p_status))
           AND (p_supplier_id IS NULL OR c.supplier_id = p_supplier_id)
           AND (p_trip_id IS NULL OR c.trip_id = p_trip_id)
           -- The date range is TRAVEL dates, matching the column the prototype draws. A
           -- trip with no dates yet falls outside any range rather than inside every one.
           AND (p_travel_from IS NULL OR t.start_date >= p_travel_from)
           AND (p_travel_to   IS NULL OR t.start_date <= p_travel_to)
    )
    SELECT l.id, l.trip_id, l.trip_title, l.trip_archived, l.client_id, l.client_display_name,
           l.supplier_id, l.supplier_name, l.start_date, l.end_date,
           l.gross_booking_cents::text, l.commission_pct,
           l.expected_commission_cents::text, l.processing_fee_cents::text,
           l.received_commission_cents::text, l.currency, l.status, l.received_at,
           l.inteletravel_reference,
           me.today,
           count(*) OVER ()::integer
      FROM lines l
     CROSS JOIN me
     -- Newest travel first, the way a ledger reads. Undated trips last.
     ORDER BY l.start_date DESC NULLS LAST, l.created_at DESC, l.id
     -- Clamped, because LIMIT and OFFSET raise on a negative and this is callable straight
     -- from a browser over /rpc/.
     LIMIT  least(greatest(coalesce(p_limit, 25), 0), 500)
     OFFSET greatest(coalesce(p_offset, 0), 0);
$$;

COMMENT ON FUNCTION public.agent_commission_ledger(
    commission_status[], uuid, uuid, date, date, integer, integer) IS
    'Screen 3.7.2''s rows: one per commission line, filtered on BOTH commission.agent_id and '
    'the trip''s agent. Lines on archived trips stay (a commission line is a tax record); '
    'trip_archived tells the screen not to link them. Money is a digit-string.';

-- ─────────────────────────────────────────────────────────────────────────────
-- §3.7.2 Summary — the status chip counts
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.agent_commission_ledger_summary()
RETURNS TABLE (
    expected_count integer,
    invoiced_count integer,
    received_count integer,
    disputed_count integer,
    lost_count     integer,
    total_count    integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    WITH me AS (
        SELECT a.id AS agent_id FROM public.agent a WHERE a.id = public.current_agent_id()
    )
    -- FROM me, with the counts LATERAL to it, so a non-agent gets NO row rather than a row of
    -- zeros. The same distinction agent_kpis() draws: "not an agent" and "an agent with an
    -- empty ledger" are different answers.
    SELECT x.*
      FROM me
     CROSS JOIN LATERAL (
        SELECT count(*) FILTER (WHERE c.status = 'expected')::integer,
               count(*) FILTER (WHERE c.status = 'invoiced')::integer,
               count(*) FILTER (WHERE c.status = 'received')::integer,
               count(*) FILTER (WHERE c.status = 'disputed')::integer,
               count(*) FILTER (WHERE c.status = 'lost')::integer,
               count(*)::integer
          FROM public.commission c
          JOIN public.trip t ON t.id = c.trip_id AND t.agent_id = me.agent_id
         WHERE c.agent_id = me.agent_id
     ) x;
$$;

COMMENT ON FUNCTION public.agent_commission_ledger_summary() IS
    'Screen 3.7.2''s five status chip counts. All five, including `lost`, which the design '
    'prototype''s chip row omits. No row for a non-agent.';

-- ─────────────────────────────────────────────────────────────────────────────
-- §3.7.2 Supplier filter — only suppliers that appear in this agent's ledger
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.agent_commission_ledger_suppliers()
RETURNS TABLE (
    supplier_id   uuid,
    supplier_name text,
    line_count    integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    WITH me AS (
        SELECT a.id AS agent_id FROM public.agent a WHERE a.id = public.current_agent_id()
    )
    -- A picker offering every supplier on file would mostly lead to empty tables. This one
    -- offers the suppliers the advisor has actually been paid by, or expects to be.
    SELECT s.id, s.name, count(*)::integer
      FROM public.commission c
      JOIN me             ON c.agent_id = me.agent_id
      JOIN public.trip t  ON t.id = c.trip_id AND t.agent_id = me.agent_id
      JOIN public.supplier s ON s.id = c.supplier_id
     GROUP BY s.id, s.name
     ORDER BY s.name, s.id;
$$;

COMMENT ON FUNCTION public.agent_commission_ledger_suppliers() IS
    'Screen 3.7.2''s supplier filter: the suppliers that appear in the calling agent''s own '
    'ledger, with a line count each. Not every supplier on file.';

-- ─────────────────────────────────────────────────────────────────────────────
-- §3.7.1 Dashboard — the four tiles and the trend chip
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.agent_commission_dashboard()
RETURNS TABLE (
    as_of_date                date,
    currency                  char(3),
    ytd_received_cents        text,
    ly_received_cents         text,
    avg_rate_pct              numeric,
    ly_avg_rate_pct           numeric,
    upcoming_commission_cents text,
    upcoming_trip_count       integer,
    at_risk_cents             text,
    disputed_count            integer,
    trailing_12_cents         text,
    prior_12_cents            text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    WITH me AS (
        SELECT a.id AS agent_id,
               (now() AT TIME ZONE a.time_zone)::date AS today
          FROM public.agent a
         WHERE a.id = public.current_agent_id()
    ),
    -- Every boundary in the AGENT's time zone. A deposit that lands at 23:00 on Dec 31 in
    -- Chicago is 05:00 UTC on Jan 1, and a UTC boundary would file it in the wrong year —
    -- §3.2's audit found that exact misfiling in agent_kpis().
    span AS (
        SELECT agent_id, today,
               date_trunc('year', today)::date                          AS year_start,
               (date_trunc('year', today) - interval '1 year')::date    AS ly_start,
               (today - interval '1 year')::date                        AS ly_today,
               date_trunc('month', today)::date                         AS month_start
          FROM me
    ),
    lines AS (
        SELECT c.*
          FROM public.commission c
          JOIN span s        ON c.agent_id = s.agent_id
          JOIN public.trip t ON t.id = c.trip_id AND t.agent_id = s.agent_id
    ),
    -- `received_at` alone decides "the money arrived in this window". No status filter is
    -- needed beside it: `commission_date_means_paid` allows a date only on `received` and
    -- `disputed` rows, which are exactly the two that carry money — a disputed line was
    -- PART-paid, and the part that came in is real income.
    ytd AS (
        SELECT coalesce(sum(l.received_commission_cents), 0)::bigint AS received,
               round(sum(l.expected_commission_cents) * 100.0
                     / nullif(sum(l.gross_booking_cents), 0), 1)     AS rate
          FROM lines l, span s
         WHERE l.received_at BETWEEN s.year_start AND s.today
    ),
    -- The SAME window a year back — Jan 1 to this date last year — not the whole of last
    -- year. Comparing ten months against twelve would show a decline every October.
    ly AS (
        SELECT coalesce(sum(l.received_commission_cents), 0)::bigint AS received,
               round(sum(l.expected_commission_cents) * 100.0
                     / nullif(sum(l.gross_booking_cents), 0), 1)     AS rate
          FROM lines l, span s
         WHERE l.received_at BETWEEN s.ly_start AND s.ly_today
    ),
    -- TRIP grain, from trip.total_commission_cents (the totals trigger keeps it equal to the
    -- sum of the trip's components). Booked trips that start inside 90 days, and every trip
    -- already travelling: an in-progress trip started in the past, but it is the soonest
    -- money there is. Unweighted, because both stages are committed — §7.4 seeds them at
    -- 100%, and a probability belongs on §3.7.7's forecast, not on a "this is coming" tile.
    upcoming AS (
        SELECT t.currency, t.total_commission_cents
          FROM public.trip t, span s
         WHERE t.agent_id = s.agent_id
           AND t.archived_at IS NULL
           AND (t.status = 'in_progress'
                OR (t.status = 'booked'
                    AND t.start_date BETWEEN s.today AND s.today + 90))
    ),
    risk AS (
        SELECT coalesce(sum(greatest(l.expected_commission_cents - l.processing_fee_cents
                                     - l.received_commission_cents, 0)), 0)::bigint AS gap,
               count(*)::integer AS n
          FROM lines l
         WHERE l.status = 'disputed'
    ),
    -- The trend chip compares the chart's own span with the SAME span a year earlier. The
    -- chart is eleven whole months plus this month so far, so the comparison is too: it ends
    -- on this date last year, not at the end of last year's month. Against twelve whole months
    -- the chip read low every day but the last of the month — about 8% low on the 1st — the
    -- same error the YTD tile's same-window rule exists to avoid.
    trend AS (
        SELECT coalesce(sum(l.received_commission_cents) FILTER (
                    WHERE l.received_at >= (s.month_start - interval '11 months')::date
                      AND l.received_at <= s.today), 0)::bigint AS trailing_sum,
               coalesce(sum(l.received_commission_cents) FILTER (
                    WHERE l.received_at >= (s.month_start - interval '23 months')::date
                      AND l.received_at <= s.ly_today), 0)::bigint
                   AS prior_sum
          FROM lines l, span s
    )
    SELECT
        s.today,
        (SELECT CASE WHEN count(DISTINCT x.currency) = 1 THEN min(x.currency)::char(3) END
           FROM (SELECT currency FROM lines UNION ALL SELECT currency FROM upcoming) x),
        (SELECT received::text FROM ytd),
        (SELECT received::text FROM ly),
        (SELECT rate FROM ytd),
        (SELECT rate FROM ly),
        (SELECT coalesce(sum(total_commission_cents), 0)::text FROM upcoming),
        -- Trips that actually carry commission. A booked trip nobody has priced yet adds
        -- nothing to the figure, and counting it would say "across 9 trips" about 7.
        (SELECT count(*)::integer FROM upcoming WHERE total_commission_cents > 0),
        (SELECT gap::text FROM risk),
        (SELECT n FROM risk),
        (SELECT trailing_sum::text FROM trend),
        (SELECT prior_sum::text FROM trend)
      FROM span s;
$$;

COMMENT ON FUNCTION public.agent_commission_dashboard() IS
    'Screen 3.7.1''s four tiles, as Gyasi ruled them 2026-10-11. YTD received, its same-window '
    'last-year twin and the gross-weighted average rate read the LEDGER; Expected-90d reads '
    'trip.total_commission_cents (booked trips starting within 90 days, plus in-progress); At '
    'risk is the unpaid gap on disputed lines. Boundaries in the agent''s time zone. No row '
    'for a non-agent; NULL rates mean nothing arrived in that window, not 0%.';

-- ─────────────────────────────────────────────────────────────────────────────
-- §3.7.1 Trend — twelve months of money received
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.agent_commission_monthly()
RETURNS TABLE (
    month_start    date,
    received_cents text,
    line_count     integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    WITH me AS (
        SELECT a.id AS agent_id,
               (now() AT TIME ZONE a.time_zone)::date                       AS today,
               date_trunc('month', (now() AT TIME ZONE a.time_zone))::date AS month_start
          FROM public.agent a
         WHERE a.id = public.current_agent_id()
    ),
    -- Always twelve rows, the current month last. A month with nothing in it is a zero bar,
    -- which is information; a missing bar would close the gap and misdate every bar after it.
    -- `timestamp` on both ends, explicitly. Handed two dates, generate_series resolves to its
    -- timestamptz form and the ::date below would then depend on the session's TimeZone.
    months AS (
        SELECT gs::date AS month_start
          FROM me,
               generate_series((me.month_start - interval '11 months')::timestamp,
                               me.month_start::timestamp, interval '1 month') gs
    ),
    paid AS (
        SELECT date_trunc('month', c.received_at)::date AS month_start,
               sum(c.received_commission_cents)::bigint AS cents,
               count(*)::integer                        AS n
          FROM public.commission c
          JOIN me            ON c.agent_id = me.agent_id
          JOIN public.trip t ON t.id = c.trip_id AND t.agent_id = me.agent_id
         WHERE c.received_at >= (me.month_start - interval '11 months')::date
           -- Bounded above as the dashboard is. Nothing in the schema forbids a future
           -- received_at, and one would otherwise sit in this month's bar while the trend chip
           -- and the YTD tile, which stop at today, leave it out.
           AND c.received_at <= me.today
         GROUP BY 1
    )
    SELECT m.month_start, coalesce(p.cents, 0)::text, coalesce(p.n, 0)
      FROM months m
      LEFT JOIN paid p ON p.month_start = m.month_start
     ORDER BY m.month_start;
$$;

COMMENT ON FUNCTION public.agent_commission_monthly() IS
    'Screen 3.7.1''s bar chart: received commission per calendar month, twelve rows ending '
    'with the current month in the agent''s time zone, zero-filled. No rows for a non-agent.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Grants
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE f text;
BEGIN
    FOREACH f IN ARRAY ARRAY[
        'public.agent_commission_ledger(commission_status[], uuid, uuid, date, date, integer, integer)',
        'public.agent_commission_ledger_summary()',
        'public.agent_commission_ledger_suppliers()',
        'public.agent_commission_dashboard()',
        'public.agent_commission_monthly()'
    ]
    LOOP
        EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM public, anon', f);
        EXECUTE format('GRANT  EXECUTE ON FUNCTION %s TO authenticated, service_role', f);
    END LOOP;
END $$;

-- ── ASSERTIONS ───────────────────────────────────────────────────────────────────
--
-- Restated for THESE functions rather than inherited: a DO block in an earlier migration
-- only ever saw the catalog as it stood that day, so it covers nothing created here.
DO $$
DECLARE leaked text;
BEGIN
    SELECT string_agg(p.proname, ', ' ORDER BY p.proname) INTO leaked
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname LIKE 'agent\_commission\_%'
       AND has_function_privilege('anon', p.oid, 'EXECUTE');
    IF leaked IS NOT NULL THEN
        RAISE EXCEPTION '§3.7 reads must not be executable by anon: %', leaked;
    END IF;

    SELECT string_agg(p.proname, ', ' ORDER BY p.proname) INTO leaked
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      LEFT JOIN LATERAL (
            SELECT substr(cfg, length('search_path=') + 1) AS value
              FROM unnest(coalesce(p.proconfig, ARRAY[]::text[])) cfg
             WHERE cfg LIKE 'search\_path=%'
             LIMIT 1
           ) sp ON true
     WHERE n.nspname = 'public'
       AND p.proname IN ('agent_commission_ledger', 'agent_commission_ledger_summary',
                         'agent_commission_ledger_suppliers', 'agent_commission_dashboard',
                         'agent_commission_monthly')
       AND (NOT p.prosecdef
            OR sp.value IS NULL
            OR btrim((string_to_array(sp.value, ','))[
                   cardinality(string_to_array(sp.value, ','))], ' "') <> 'pg_temp');
    IF leaked IS NOT NULL THEN
        RAISE EXCEPTION
            '§3.7 reads must be SECURITY DEFINER with a search_path ending in pg_temp: %', leaked;
    END IF;

    -- The table stays closed. These accessors are the only door, and a table grant restored
    -- beside them would make every projection above decorative.
    IF has_table_privilege('authenticated', 'public.commission', 'SELECT')
       OR has_table_privilege('anon', 'public.commission', 'SELECT') THEN
        RAISE EXCEPTION 'public.commission is readable by a client role again';
    END IF;
END $$;

COMMIT;
