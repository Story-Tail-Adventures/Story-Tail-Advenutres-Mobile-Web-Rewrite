-- §3.11 Reporting, PR 1: the hub's first three reports (P1). Ruled 2026-10-21; the rulings
-- are Screen Inventory §3.11's "Ruled" block.
--
--   3.11.2 Revenue by Month       booked value by month of FIRST booking, or commission
--                                 received by month it arrived
--   3.11.3 Commission by Supplier the stored ledger, by travel date
--   3.11.4 Top Destinations       committed trips by stop, value split evenly
--
-- ── ONE BODY PER REPORT, TWO DOORS ──────────────────────────────────────────────────────
--
-- Each report is computed once, by an internal `report_*` function that takes the agent id.
-- Two doors call it:
--
--   * `agent_report_*()`, SECURITY DEFINER, for the screen. It passes `current_agent_id()`,
--     so an advisor can only ever read their own book.
--   * `agent_report_export()`, service role only, for the CSV. The Edge Function passes the
--     agent id it resolved, as `agent_export_commission` does, because on the service role
--     `current_agent_id()` is NULL. It writes the audit row in the same call that returns the
--     rows, so no file leaves without its record (Data-Model §18.3).
--
-- The screen and the file therefore cannot disagree: they are the same query.
--
-- The internal functions are NOT executable by any client role. They take an agent id as an
-- argument; granting them to `authenticated` would let any advisor read any other's book.
--
-- ── THE PERIOD ──────────────────────────────────────────────────────────────────────────
--
-- One filter on every report (§3.11): ytd, 12mo, qtd. Calendar boundaries in the advisor's own
-- zone, ending today. "12mo" is this month and the eleven before it, whole months, so twelve
-- bars always mean twelve calendar months. The prior window is the same dates a year earlier,
-- for year over year.
--
-- ── ALSO HERE: client.lifetime_value_cents IS DROPPED ──────────────────────────────────
--
-- Nothing ever wrote it (see 20260926140000's header). §3.11.5 ranks clients by lifetime
-- value, which is exactly where someone would reach for a column that looks like the answer
-- and is always wrong. Data-Model §6.1 records the drop.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. The dead column
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.client DROP COLUMN lifetime_value_cents;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. The period
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.report_period_bounds(p_period text, p_today date)
RETURNS TABLE (from_date date, to_date date, prior_from date, prior_to date)
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE
    v_from date;
BEGIN
    -- `::timestamp` on purpose. date_trunc over a bare date resolves to its timestamptz form,
    -- and the ::date back would then depend on the session's TimeZone.
    v_from := CASE p_period
        WHEN 'ytd'  THEN date_trunc('year',    p_today::timestamp)::date
        WHEN '12mo' THEN (date_trunc('month',  p_today::timestamp) - interval '11 months')::date
        WHEN 'qtd'  THEN date_trunc('quarter', p_today::timestamp)::date
    END;

    IF v_from IS NULL OR p_today IS NULL THEN
        RAISE EXCEPTION 'unknown report period: %', p_period USING ERRCODE = '22023';
    END IF;

    RETURN QUERY SELECT v_from,
                        p_today,
                        (v_from  - interval '1 year')::date,
                        (p_today - interval '1 year')::date;
END;
$$;

COMMENT ON FUNCTION public.report_period_bounds(text, date) IS
    '§3.11''s period filter: ytd, 12mo (this month and the eleven before) or qtd, ending '
    'p_today, plus the same window a year earlier. Raises 22023 on any other period.';

-- The advisor's today, in their own zone. No row for an unknown or archived advisor.
CREATE OR REPLACE FUNCTION public.report_agent_today(p_agent_id uuid)
RETURNS TABLE (agent_id uuid, time_zone text, today date)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
    SELECT a.id, a.time_zone, (now() AT TIME ZONE a.time_zone)::date
      FROM public.agent a
     WHERE a.id = p_agent_id
       AND a.status <> 'archived';
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. 3.11.2 Revenue by Month
-- ─────────────────────────────────────────────────────────────────────────────
--
-- `booked`: a trip's gross value, filed under the month it was FIRST committed: its earliest
-- transition in trip_status_history to booked, in progress or completed. Not `booked` alone:
-- the stage write lets an advisor move a trip straight from proposal to in progress or
-- completed (a trip entered after the fact), and keying on `booked` would leave that trip out
-- of these bars while Top Destinations and lifetime value count it. Only trips that are
-- committed NOW: a trip cancelled, or walked back to an earlier stage, did not turn into
-- revenue (Gyasi confirmed 2026-10-21). A trip that goes booked -> proposal -> booked counts
-- once, in its first month (min(changed_at)), never twice.
--
-- No backfill: a trip booked before trip_status_history existed (2026-09-19) has no booking
-- date, and is left out rather than given a made-up one. The screen says so.
--
-- `received`: commission money by the date it arrived, from the ledger. Removed lines never
-- count; lines on an archived trip do, as on the ledger, because the money was real. Same
-- source and predicate as agent_commission_monthly(), so this bar and §3.7.1's agree.
--
-- `prior_cents` is the same calendar month a year earlier, and NULL (not 0) when that month
-- had nothing in it. The screen hides year over year until some month has a prior figure:
-- a "+100%" against a year of no data is a broken number, not a trend.

CREATE OR REPLACE FUNCTION public.report_revenue_by_month(
    p_agent_id uuid,
    p_period   text,
    p_basis    text
)
RETURNS TABLE (month_start date, cents bigint, item_count integer, prior_cents bigint)
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
BEGIN
    IF p_basis IS NULL OR p_basis NOT IN ('booked', 'received') THEN
        RAISE EXCEPTION 'unknown revenue basis: %', p_basis USING ERRCODE = '22023';
    END IF;

    RETURN QUERY
    WITH me AS (
        SELECT r.agent_id, r.time_zone, b.*
          FROM public.report_agent_today(p_agent_id) r,
               public.report_period_bounds(p_period, r.today) b
    ),
    -- Every month in the window, zero-filled: a missing bar would close the gap and misdate
    -- every bar after it.
    months AS (
        SELECT gs::date AS month_start
          FROM me,
               generate_series(date_trunc('month', me.from_date::timestamp),
                               date_trunc('month', me.to_date::timestamp),
                               interval '1 month') gs
    ),
    booked AS (
        SELECT t.total_value_cents AS amount,
               (fb.first_booked AT TIME ZONE me.time_zone)::date AS on_date
          FROM me
          JOIN public.trip t
            ON t.agent_id = me.agent_id
           AND t.archived_at IS NULL
           AND t.status IN ('booked', 'in_progress', 'completed')
          JOIN LATERAL (
                SELECT min(h.changed_at) AS first_booked
                  FROM public.trip_status_history h
                 WHERE h.trip_id = t.id
                   AND h.to_status IN ('booked', 'in_progress', 'completed')
               ) fb ON fb.first_booked IS NOT NULL
         WHERE p_basis = 'booked'
    ),
    received AS (
        SELECT c.received_commission_cents AS amount,
               c.received_at              AS on_date
          FROM me
          JOIN public.commission c
            ON c.agent_id = me.agent_id
           AND c.archived_at IS NULL
          JOIN public.trip t
            ON t.id = c.trip_id
           AND t.agent_id = c.agent_id
         WHERE p_basis = 'received'
           AND c.received_at IS NOT NULL
    ),
    item AS (
        SELECT amount, on_date FROM booked
        UNION ALL
        SELECT amount, on_date FROM received
    ),
    cur AS (
        SELECT date_trunc('month', i.on_date::timestamp)::date AS m,
               sum(i.amount)::bigint AS cents, count(*)::integer AS n
          FROM item i, me
         WHERE i.on_date BETWEEN me.from_date AND me.to_date
         GROUP BY 1
    ),
    -- Filed under the month a year LATER, so it joins the bar it is compared with.
    prior AS (
        SELECT (date_trunc('month', i.on_date::timestamp) + interval '1 year')::date AS m,
               sum(i.amount)::bigint AS cents
          FROM item i, me
         WHERE i.on_date BETWEEN me.prior_from AND me.prior_to
         GROUP BY 1
    )
    SELECT mo.month_start,
           coalesce(c.cents, 0)::bigint,
           coalesce(c.n, 0)::integer,
           p.cents
      FROM months mo
      LEFT JOIN cur   c ON c.m = mo.month_start
      LEFT JOIN prior p ON p.m = mo.month_start
     ORDER BY mo.month_start;
END;
$$;

COMMENT ON FUNCTION public.report_revenue_by_month(uuid, text, text) IS
    '3.11.2 for one advisor: one row per month of the period (zero-filled), oldest first. '
    'basis booked = gross value of committed trips by month FIRST committed; received = '
    'ledger commission by received_at. prior_cents is NULL when the month a year earlier had '
    'nothing. Internal: reached through agent_report_revenue_by_month() or the export.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. 3.11.3 Commission by Supplier
-- ─────────────────────────────────────────────────────────────────────────────
--
-- The stored LEDGER, never the forecast (§3.11; commission-forecast-vs-ledger). The period
-- filters on the trip's start date, exactly as the ledger screen and its export do, so a
-- click through to the ledger filtered by supplier shows the lines this row summed.
--
--   received_cents  received lines, what arrived
--   owed_cents      expected and invoiced lines, what is still claimed
--   set_aside_count disputed and lost lines: left out of both figures, counted for the
--                   footnote, because a disputed $900 is neither earned nor owed yet
--   set_aside_received_cents  money that DID arrive on those lines (a part payment, then a
--                   dispute). Revenue's "Commission received" counts it, as §3.7.1 does, so
--                   the footnote names it rather than letting it vanish from this report

CREATE OR REPLACE FUNCTION public.report_commission_by_supplier(p_agent_id uuid, p_period text)
RETURNS TABLE (
    supplier_id     uuid,
    supplier_name   text,
    received_cents  bigint,
    owed_cents      bigint,
    line_count      integer,
    set_aside_count integer,
    set_aside_received_cents bigint
)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
    WITH me AS (
        SELECT r.agent_id, b.*
          FROM public.report_agent_today(p_agent_id) r,
               public.report_period_bounds(p_period, r.today) b
    )
    SELECT s.id,
           s.name,
           coalesce(sum(c.received_commission_cents) FILTER (WHERE c.status = 'received'), 0)::bigint,
           coalesce(sum(c.expected_commission_cents)
                        FILTER (WHERE c.status IN ('expected', 'invoiced')), 0)::bigint,
           (count(*) FILTER (WHERE c.status IN ('expected', 'invoiced', 'received')))::integer,
           (count(*) FILTER (WHERE c.status IN ('disputed', 'lost')))::integer,
           coalesce(sum(c.received_commission_cents)
                        FILTER (WHERE c.status IN ('disputed', 'lost')), 0)::bigint
      FROM me
      JOIN public.commission c
        ON c.agent_id = me.agent_id
       AND c.archived_at IS NULL
      JOIN public.trip t
        ON t.id = c.trip_id
       AND t.agent_id = c.agent_id
      JOIN public.supplier s ON s.id = c.supplier_id
     WHERE t.start_date BETWEEN me.from_date AND me.to_date
     GROUP BY s.id, s.name
     ORDER BY coalesce(sum(c.received_commission_cents) FILTER (WHERE c.status = 'received'), 0)
            + coalesce(sum(c.expected_commission_cents)
                           FILTER (WHERE c.status IN ('expected', 'invoiced')), 0) DESC,
              s.name, s.id;
$$;

COMMENT ON FUNCTION public.report_commission_by_supplier(uuid, text) IS
    '3.11.3 for one advisor: ledger lines whose trip starts in the period, per supplier. '
    'received = received lines; owed = expected + invoiced; disputed and lost are counted in '
    'set_aside_count (and any money already received on them in set_aside_received_cents), '
    'summed into neither figure. Internal.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. 3.11.4 Top Destinations
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Committed trips (booked, in progress, completed) whose travel starts in the period. A trip
-- with several stops counts once in each, and its value is split EVENLY across them, so the
-- value column adds up to exactly the trips' total. The split is in whole cents: each stop
-- gets value / n, and the first (value % n) stops one cent more. No cent is lost or made.
--
-- Stops are grouped ignoring case, edge spaces and repeated inner spaces ("Grand  Bahama",
-- " grand bahama"), shown with the most common spelling. A dated trip with no destination yet
-- is one row with a NULL name, which the screen labels, rather than dropping out of the total.
-- A trip with no start date is not in any period, here as on the ledger.

CREATE OR REPLACE FUNCTION public.report_top_destinations(p_agent_id uuid, p_period text)
RETURNS TABLE (destination text, trip_count integer, value_cents bigint)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
    WITH me AS (
        SELECT r.agent_id, b.*
          FROM public.report_agent_today(p_agent_id) r,
               public.report_period_bounds(p_period, r.today) b
    ),
    trips AS (
        SELECT t.id, t.total_value_cents AS v,
               -- Blank entries are not stops.
               coalesce(array_remove(array(
                   SELECT nullif(regexp_replace(btrim(d), '\s+', ' ', 'g'), '')
                     FROM unnest(t.destinations) d), NULL),
                   '{}') AS stops
          FROM me
          JOIN public.trip t
            ON t.agent_id = me.agent_id
           AND t.archived_at IS NULL
           AND t.status IN ('booked', 'in_progress', 'completed')
         WHERE t.start_date BETWEEN me.from_date AND me.to_date
    ),
    stop AS (
        SELECT tr.id, s.name, s.ord, cardinality(tr.stops) AS n, tr.v
          FROM trips tr,
               unnest(tr.stops) WITH ORDINALITY AS s(name, ord)
        UNION ALL
        SELECT tr.id, NULL, 1, 1, tr.v
          FROM trips tr
         WHERE cardinality(tr.stops) = 0
    ),
    share AS (
        SELECT st.id, st.name, lower(st.name) AS k,
               (st.v / st.n + CASE WHEN st.ord <= st.v % st.n THEN 1 ELSE 0 END)::bigint AS cents
          FROM stop st
    ),
    spelling AS (
        -- The most common spelling per key; ties go to the alphabetically first.
        SELECT DISTINCT ON (k) k, name
          FROM share
         WHERE name IS NOT NULL
         GROUP BY k, name
         ORDER BY k, count(*) DESC, name
    )
    SELECT sp.name,
           count(DISTINCT sh.id)::integer,
           sum(sh.cents)::bigint
      FROM share sh
      LEFT JOIN spelling sp ON sp.k = sh.k
     GROUP BY sh.k, sp.name
     ORDER BY 3 DESC, 2 DESC, sp.name NULLS LAST;
$$;

COMMENT ON FUNCTION public.report_top_destinations(uuid, text) IS
    '3.11.4 for one advisor: committed trips starting in the period, per stop. A trip counts '
    'once in each stop; its value is split evenly in whole cents so the column sums to the '
    'trips'' total. destination NULL = trips with no stop yet. Internal.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. The screen's doors (SECURITY DEFINER, the signed-in advisor only)
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Money leaves as digit-strings, like every other agent read: PostgREST would send a bigint
-- as a JSON number, and cents past 2^53 stop being exact in JavaScript.

-- The period the screen labels, and the tell between "not an advisor" (no row) and "an
-- advisor with nothing in this period" (a row, and empty reports).
CREATE OR REPLACE FUNCTION public.agent_report_period(p_period text)
RETURNS TABLE (from_date date, to_date date, today date)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT b.from_date, b.to_date, r.today
      FROM public.report_agent_today(public.current_agent_id()) r,
           public.report_period_bounds(p_period, r.today) b;
$$;

CREATE OR REPLACE FUNCTION public.agent_report_revenue_by_month(p_period text, p_basis text)
RETURNS TABLE (month_start date, cents text, item_count integer, prior_cents text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT r.month_start, r.cents::text, r.item_count, r.prior_cents::text
      FROM public.report_revenue_by_month(public.current_agent_id(), p_period, p_basis) r;
$$;

CREATE OR REPLACE FUNCTION public.agent_report_commission_by_supplier(p_period text)
RETURNS TABLE (
    supplier_id     uuid,
    supplier_name   text,
    received_cents  text,
    owed_cents      text,
    line_count      integer,
    set_aside_count integer,
    set_aside_received_cents text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT r.supplier_id, r.supplier_name, r.received_cents::text, r.owed_cents::text,
           r.line_count, r.set_aside_count, r.set_aside_received_cents::text
      FROM public.report_commission_by_supplier(public.current_agent_id(), p_period) r;
$$;

CREATE OR REPLACE FUNCTION public.agent_report_top_destinations(p_period text)
RETURNS TABLE (destination text, trip_count integer, value_cents text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT r.destination, r.trip_count, r.value_cents::text
      FROM public.report_top_destinations(public.current_agent_id(), p_period) r;
$$;

COMMENT ON FUNCTION public.agent_report_period(text) IS
    '§3.11''s period for the signed-in advisor. No row = not an advisor.';
COMMENT ON FUNCTION public.agent_report_revenue_by_month(text, text) IS
    'Screen 3.11.2. See report_revenue_by_month. Money as digit-strings.';
COMMENT ON FUNCTION public.agent_report_commission_by_supplier(text) IS
    'Screen 3.11.3. See report_commission_by_supplier. Money as digit-strings.';
COMMENT ON FUNCTION public.agent_report_top_destinations(text) IS
    'Screen 3.11.4. See report_top_destinations. Money as digit-strings.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. The CSV door (service role, audited)
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Returns one jsonb object, `{from, to, rows}`, not a row set: PostgREST caps row sets at
-- max_rows, and a capped export arrives short while its audit row says otherwise (the lesson
-- of agent_export_commission). NULL for an unknown or archived advisor.

CREATE OR REPLACE FUNCTION public.agent_report_export(
    p_agent_id      uuid,
    p_actor_user_id uuid,
    p_report        text,
    p_period        text,
    p_basis         text,
    p_audit_id      uuid,
    p_ip            text,
    p_user_agent    text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_today date;
    v_from  date;
    v_to    date;
    v_rows  jsonb;
BEGIN
    SELECT r.today INTO v_today FROM public.report_agent_today(p_agent_id) r;
    IF v_today IS NULL THEN
        RETURN NULL;
    END IF;

    -- The audit row names its actor. The Edge Function derives both ids from one verified
    -- session today; this keeps any future caller from filing an export under someone else.
    IF NOT EXISTS (SELECT 1 FROM public.platform_user pu
                    WHERE pu.id = p_actor_user_id AND pu.agent_id = p_agent_id) THEN
        RAISE EXCEPTION 'export actor is not this advisor' USING ERRCODE = '42501';
    END IF;

    SELECT b.from_date, b.to_date INTO v_from, v_to
      FROM public.report_period_bounds(p_period, v_today) b;

    IF p_report = 'revenue' THEN
        SELECT coalesce(jsonb_agg(jsonb_build_object(
                   'month_start', r.month_start,
                   'cents',       r.cents::text,
                   'item_count',  r.item_count,
                   'prior_cents', r.prior_cents::text) ORDER BY r.month_start), '[]'::jsonb)
          INTO v_rows
          FROM public.report_revenue_by_month(p_agent_id, p_period, p_basis) r;
    ELSIF p_report = 'suppliers' THEN
        SELECT coalesce(jsonb_agg(jsonb_build_object(
                   'supplier_name',   r.supplier_name,
                   'received_cents',  r.received_cents::text,
                   'owed_cents',      r.owed_cents::text,
                   'line_count',      r.line_count,
                   'set_aside_count', r.set_aside_count,
                   'set_aside_received_cents', r.set_aside_received_cents::text)
                   ORDER BY r.received_cents + r.owed_cents DESC, r.supplier_name), '[]'::jsonb)
          INTO v_rows
          FROM public.report_commission_by_supplier(p_agent_id, p_period) r;
    ELSIF p_report = 'destinations' THEN
        SELECT coalesce(jsonb_agg(jsonb_build_object(
                   'destination', r.destination,
                   'trip_count',  r.trip_count,
                   'value_cents', r.value_cents::text)
                   ORDER BY r.value_cents DESC, r.trip_count DESC, r.destination NULLS LAST), '[]'::jsonb)
          INTO v_rows
          FROM public.report_top_destinations(p_agent_id, p_period) r;
    ELSE
        RAISE EXCEPTION 'unknown report: %', p_report USING ERRCODE = '22023';
    END IF;

    -- In the same call that returns the rows: if this insert fails, the call fails and no file
    -- leaves without its record. The Export Center's history (§3.11.8) reads these rows.
    PERFORM public.commission_audit(
        p_audit_id, p_actor_user_id, 'report.exported', 'agent', p_agent_id,
        jsonb_build_object(
            'report',    p_report,
            'period',    p_period,
            'basis',     CASE WHEN p_report = 'revenue' THEN p_basis END,
            'from',      v_from,
            'to',        v_to,
            'row_count', jsonb_array_length(v_rows)),
        p_ip, p_user_agent);

    RETURN jsonb_build_object('from', v_from, 'to', v_to, 'rows', v_rows);
END;
$$;

COMMENT ON FUNCTION public.agent_report_export(uuid, uuid, text, text, text, uuid, text, text) IS
    'A §3.11 report''s own table for the CSV export: revenue | suppliers | destinations, for '
    'p_agent_id over p_period. Writes one report.exported audit row with the report, period and '
    'row count, then returns {from, to, rows}. Service role only (the agent-report function).';

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. Grants
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE f text;
BEGIN
    -- Internal: they take an agent id, so no client role may call them.
    FOREACH f IN ARRAY ARRAY[
        'public.report_period_bounds(text, date)',
        'public.report_agent_today(uuid)',
        'public.report_revenue_by_month(uuid, text, text)',
        'public.report_commission_by_supplier(uuid, text)',
        'public.report_top_destinations(uuid, text)',
        'public.agent_report_export(uuid, uuid, text, text, text, uuid, text, text)'
    ] LOOP
        EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM public, anon, authenticated', f);
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f);
    END LOOP;

    -- The screen's doors: the signed-in advisor, scoped by current_agent_id().
    FOREACH f IN ARRAY ARRAY[
        'public.agent_report_period(text)',
        'public.agent_report_revenue_by_month(text, text)',
        'public.agent_report_commission_by_supplier(text)',
        'public.agent_report_top_destinations(text)'
    ] LOOP
        EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM public, anon', f);
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f);
    END LOOP;
END $$;

COMMIT;
