-- §3.11 Reporting, PR 2: Client Lifetime Value (3.11.5), the Conversion Funnel (3.11.6) and
-- Pipeline Value (3.11.7) (P1).
-- Rulings: Screen Inventory §3.11, "Ruled 2026-10-21". Same shape as 20261028120000: one
-- internal `report_*` body per report, a definer door for the screen, and the CSV through
-- agent_report_export, which is replaced here to know the two new reports.
--
-- ── "FIRST COMMITTED" IS ONE RULE ACROSS THE SECTION ───────────────────────────────────
--
-- A trip is committed the first time trip_status_history moves it to booked, in progress or
-- completed (20261028120000's revenue rule: the stage write lets an advisor skip `booked`).
-- The cohort here and the funnel's days-to-book use the same rule, through one helper, so the
-- three reports cannot disagree about when a trip was booked.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. The shared rule
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.report_first_committed_at(p_trip_id uuid)
RETURNS timestamptz
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
    SELECT min(h.changed_at)
      FROM public.trip_status_history h
     WHERE h.trip_id = p_trip_id
       AND h.to_status IN ('booked', 'in_progress', 'completed');
$$;

COMMENT ON FUNCTION public.report_first_committed_at(uuid) IS
    '§3.11''s "first booked": the trip''s earliest move to booked, in progress or completed. '
    'NULL when it never moved there, or did so before trip_status_history existed (no backfill).';

-- Revenue by Month re-pointed at the helper, so the rule lives in one place. Signature and
-- results unchanged.
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
    months AS (
        SELECT gs::date AS month_start
          FROM me,
               generate_series(date_trunc('month', me.from_date::timestamp),
                               date_trunc('month', me.to_date::timestamp),
                               interval '1 month') gs
    ),
    booked AS (
        SELECT t.total_value_cents AS amount,
               (public.report_first_committed_at(t.id) AT TIME ZONE me.time_zone)::date AS on_date
          FROM me
          JOIN public.trip t
            ON t.agent_id = me.agent_id
           AND t.archived_at IS NULL
           AND t.status IN ('booked', 'in_progress', 'completed')
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
        SELECT amount, on_date FROM booked WHERE on_date IS NOT NULL
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

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. 3.11.5 Client Lifetime Value
-- ─────────────────────────────────────────────────────────────────────────────
--
-- LIFETIME, SO NO PERIOD. Lifetime value is Client Detail's own figure: the sum of the
-- client's COMMITTED trips (booked, in progress, completed; not archived), with commission
-- beside it. A period would make it something else, so this report filters by COHORT
-- instead: the calendar quarter, in the advisor's zone, of the client's first committed trip.
-- A client with ANY committed trip from before trip_status_history has no cohort (NULL, "before
-- tracking"): their first booking is that one, whatever came after. The screen labels it rather
-- than guesses.
--
-- Only clients with something committed are ranked. Merged-away records are not clients.

CREATE OR REPLACE FUNCTION public.report_client_lifetime_value(p_agent_id uuid)
RETURNS TABLE (
    client_id         uuid,
    display_name      text,
    trip_count        integer,
    value_cents       bigint,
    commission_cents  bigint,
    cohort_start      date
)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
    WITH me AS (
        SELECT r.agent_id, r.time_zone FROM public.report_agent_today(p_agent_id) r
    ),
    committed AS (
        SELECT t.client_id, t.total_value_cents, t.total_commission_cents,
               public.report_first_committed_at(t.id) AS first_at
          FROM me
          JOIN public.trip t
            ON t.agent_id = me.agent_id
           AND t.archived_at IS NULL
           AND t.status IN ('booked', 'in_progress', 'completed')
    )
    SELECT c.id,
           coalesce(c.preferred_name, c.first_name) || ' ' || c.last_name,
           count(*)::integer,
           sum(ct.total_value_cents)::bigint,
           sum(ct.total_commission_cents)::bigint,
           -- One booking from before tracking makes the client "before tracking": their first
           -- booking is that one, and min() would otherwise skip its NULL and name a later
           -- quarter (review found a returning 2024 client filed under Q4 2026).
           CASE WHEN bool_or(ct.first_at IS NULL) THEN NULL
                ELSE date_trunc('quarter', (min(ct.first_at) AT TIME ZONE me.time_zone))::date
           END
      FROM committed ct
      JOIN me ON true
      JOIN public.client c
        ON c.id = ct.client_id
       AND c.agent_id = me.agent_id
       AND c.status <> 'merged_into'
     GROUP BY c.id, c.preferred_name, c.first_name, c.last_name, me.time_zone
     ORDER BY 4 DESC, 2, 1;
$$;

COMMENT ON FUNCTION public.report_client_lifetime_value(uuid) IS
    '3.11.5 for one advisor: every client with a committed trip, ranked by lifetime value '
    '(Client Detail''s expression), with commission and cohort = quarter of the first committed '
    'trip (NULL before tracking began). Internal.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. 3.11.6 Conversion Funnel
-- ─────────────────────────────────────────────────────────────────────────────
--
-- The trips CREATED in the period (trip.created_at is the inquiry moment: a trip starts in
-- `inquiry`), and how far each got. Stages, in order: 1 inquiry, 2 proposal, 3 booked (booked
-- or in progress), 4 traveled (completed). A trip's furthest stage is the highest it ever
-- reached, in its history or in its status now, so one entered straight as booked counts as
-- an inquiry and a proposal too, and a cancelled trip keeps the stage it got to.
--
-- Per stage, beside `reached`: how many STOPPED there, split into still open (it may yet move
-- on, so it is not a loss) and cancelled. That is the artboard's "drop", said honestly.
--
-- Days to book: from creation to first commitment, over the cohort's trips that committed and
-- have a recorded commitment.

CREATE OR REPLACE FUNCTION public.report_conversion_funnel(p_agent_id uuid, p_period text)
RETURNS TABLE (
    stage           smallint,
    reached         integer,
    open_here       integer,
    cancelled_here  integer,
    book_days_avg   numeric,
    book_days_n     integer
)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
    WITH me AS (
        SELECT r.agent_id, r.time_zone, b.*
          FROM public.report_agent_today(p_agent_id) r,
               public.report_period_bounds(p_period, r.today) b
    ),
    cohort AS (
        SELECT t.id, t.status, t.created_at
          FROM me
          JOIN public.trip t
            ON t.agent_id = me.agent_id
           AND t.archived_at IS NULL
         WHERE (t.created_at AT TIME ZONE me.time_zone)::date BETWEEN me.from_date AND me.to_date
    ),
    ranked AS (
        SELECT c.id, c.status, c.created_at,
               greatest(
                   CASE c.status WHEN 'inquiry' THEN 1 WHEN 'proposal' THEN 2
                                 WHEN 'booked' THEN 3 WHEN 'in_progress' THEN 3
                                 WHEN 'completed' THEN 4 ELSE 1 END,
                   coalesce((SELECT max(CASE h.to_status WHEN 'proposal' THEN 2
                                                         WHEN 'booked' THEN 3 WHEN 'in_progress' THEN 3
                                                         WHEN 'completed' THEN 4 ELSE 1 END)
                               FROM public.trip_status_history h
                              WHERE h.trip_id = c.id), 1)
               )::smallint AS furthest,
               public.report_first_committed_at(c.id) AS first_at
          FROM cohort c
    ),
    days AS (
        SELECT avg(EXTRACT(epoch FROM r.first_at - r.created_at) / 86400.0) AS avg_days,
               count(*)::integer AS n
          FROM ranked r
         WHERE r.first_at IS NOT NULL AND r.first_at >= r.created_at
    )
    SELECT s.stage::smallint,
           (count(r.id) FILTER (WHERE r.furthest >= s.stage))::integer,
           (count(r.id) FILTER (WHERE r.furthest = s.stage AND r.status NOT IN ('cancelled', 'completed')))::integer,
           (count(r.id) FILTER (WHERE r.furthest = s.stage AND r.status = 'cancelled'))::integer,
           (SELECT round(avg_days, 1) FROM days),
           (SELECT n FROM days)
      FROM generate_series(1, 4) AS s(stage)
      LEFT JOIN ranked r ON true
     GROUP BY s.stage
     ORDER BY s.stage;
$$;

COMMENT ON FUNCTION public.report_conversion_funnel(uuid, text) IS
    '3.11.6 for one advisor: trips created in the period, by the furthest stage each reached '
    '(1 inquiry, 2 proposal, 3 booked, 4 traveled). open_here / cancelled_here split those that '
    'stopped at a stage. book_days_* = average days from creation to first commitment, and its '
    'sample size (same on every row). Internal.';


-- ─────────────────────────────────────────────────────────────────────────────
-- 3b. 3.11.7 Pipeline Value
-- ─────────────────────────────────────────────────────────────────────────────
--
-- A SNAPSHOT OF TODAY, so no period. The open trips (inquiry, proposal, booked, in progress;
-- not archived), at their gross value, weighted by THE SAME pipeline_weight rows §3.7.7's
-- commission forecast uses: one set of weights (§3.11 ruling). Same trips as agent_kpis'
-- "Pipeline value" tile, so the tile and this report agree on the gross figure.
--
-- Rounding as agent_commission_forecast rounds: each stage's weighted figure from its exact
-- sum, and the total rounded ONCE from the exact grand sum, so the total is never four
-- roundings away from the truth.
--
-- By travel month: each open trip's weighted value in the month it starts, this month and
-- the eleven after. A trip TRAVELING NOW (in progress) that started before this month is in
-- this month's row: it is happening now. Any other open trip whose start date is before this
-- month (an inquiry or proposal that went stale, a booking never moved on) is one `past` row,
-- "Start date passed", rather than inflating this month (review, 2026-10-21). Beyond twelve
-- months is one `later` row; no start date is one `undated` row. Nothing is dropped, so the rows
-- add up to the weighted total (give or take each row's own rounding).

CREATE OR REPLACE FUNCTION public.report_pipeline_stages(p_agent_id uuid)
RETURNS TABLE (
    status               trip_status,
    weight_pct           smallint,
    trip_count           integer,
    gross_cents          bigint,
    weighted_cents       bigint,
    total_gross_cents    bigint,
    total_weighted_cents bigint
)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
    WITH me AS (
        SELECT r.agent_id FROM public.report_agent_today(p_agent_id) r
    ),
    stage AS (
        SELECT pw.status, pw.weight_pct,
               array_position(ARRAY['inquiry', 'proposal', 'booked', 'in_progress']::trip_status[],
                              pw.status) AS ord
          FROM public.pipeline_weight pw
          JOIN me ON pw.agent_id = me.agent_id
         WHERE pw.status IN ('inquiry', 'proposal', 'booked', 'in_progress')
    ),
    open_trip AS (
        SELECT t.status, t.total_value_cents
          FROM public.trip t
          JOIN me ON t.agent_id = me.agent_id
         WHERE t.archived_at IS NULL
           AND t.status IN ('inquiry', 'proposal', 'booked', 'in_progress')
    ),
    per AS (
        SELECT st.status, st.weight_pct, st.ord,
               count(o.status)::integer                                      AS n,
               coalesce(sum(o.total_value_cents), 0)::bigint                 AS gross,
               coalesce(sum(o.total_value_cents * st.weight_pct / 100.0), 0) AS weighted_exact
          FROM stage st
          LEFT JOIN open_trip o ON o.status = st.status
         GROUP BY st.status, st.weight_pct, st.ord
    )
    SELECT p.status, p.weight_pct, p.n, p.gross, round(p.weighted_exact)::bigint,
           (sum(p.gross) OVER ())::bigint,
           round(sum(p.weighted_exact) OVER ())::bigint
      FROM per p
     ORDER BY p.ord;
$$;

COMMENT ON FUNCTION public.report_pipeline_stages(uuid) IS
    '3.11.7 for one advisor: one row per open stage with its pipeline_weight, trips, gross value '
    'and weighted value; totals rounded once from the exact sums. Internal.';

CREATE OR REPLACE FUNCTION public.report_pipeline_months(p_agent_id uuid)
RETURNS TABLE (
    bucket          text,
    month_start     date,
    trip_count      integer,
    weighted_cents  bigint
)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
    WITH me AS (
        SELECT r.agent_id, date_trunc('month', r.today::timestamp)::date AS ms
          FROM public.report_agent_today(p_agent_id) r
    ),
    months AS (
        SELECT gs::date AS month_start
          FROM me, generate_series(me.ms::timestamp, (me.ms + interval '11 months')::timestamp,
                                   interval '1 month') gs
    ),
    open_trip AS (
        SELECT t.start_date, t.total_value_cents * pw.weight_pct / 100.0 AS weighted_exact,
               CASE
                   WHEN t.start_date IS NULL THEN 'undated'
                   WHEN t.start_date >= (me.ms + interval '12 months')::date THEN 'later'
                   WHEN t.start_date < me.ms AND t.status <> 'in_progress' THEN 'past'
                   ELSE 'month'
               END AS bucket,
               CASE
                   WHEN t.start_date IS NULL THEN NULL
                   ELSE greatest(date_trunc('month', t.start_date::timestamp)::date, me.ms)
               END AS m
          FROM me
          JOIN public.trip t
            ON t.agent_id = me.agent_id
           AND t.archived_at IS NULL
           AND t.status IN ('inquiry', 'proposal', 'booked', 'in_progress')
          JOIN public.pipeline_weight pw
            ON pw.agent_id = me.agent_id AND pw.status = t.status
    )
    SELECT x.bucket, x.month_start, x.trip_count, x.weighted_cents
      FROM (
        SELECT 'month' AS bucket, mo.month_start, 1 AS ord,
               (count(o.m))::integer AS trip_count,
               round(coalesce(sum(o.weighted_exact), 0))::bigint AS weighted_cents
          FROM months mo
          LEFT JOIN open_trip o ON o.bucket = 'month' AND o.m = mo.month_start
         GROUP BY mo.month_start
        UNION ALL
        SELECT b.bucket, NULL, b.ord,
               (SELECT count(*)::integer FROM open_trip o WHERE o.bucket = b.bucket),
               (SELECT round(coalesce(sum(o.weighted_exact), 0))::bigint FROM open_trip o WHERE o.bucket = b.bucket)
          FROM (VALUES ('past', 0), ('later', 2), ('undated', 3)) AS b(bucket, ord)
      ) x
     ORDER BY x.ord, x.month_start;
$$;

COMMENT ON FUNCTION public.report_pipeline_months(uuid) IS
    '3.11.7 for one advisor: a `past` row (open, not traveling, start date before this month), '
    'then the weighted value by the month trips start, this month and the eleven after (a trip '
    'traveling now counts this month), then `later` and `undated` rows. Nothing dropped. Internal.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. The screen's doors
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.agent_report_client_lifetime_value()
RETURNS TABLE (
    client_id         uuid,
    display_name      text,
    trip_count        integer,
    value_cents       text,
    commission_cents  text,
    cohort_start      date
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT r.client_id, r.display_name, r.trip_count, r.value_cents::text,
           r.commission_cents::text, r.cohort_start
      FROM public.report_client_lifetime_value(public.current_agent_id()) r;
$$;

CREATE OR REPLACE FUNCTION public.agent_report_conversion_funnel(p_period text)
RETURNS TABLE (
    stage           smallint,
    reached         integer,
    open_here       integer,
    cancelled_here  integer,
    book_days_avg   numeric,
    book_days_n     integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT * FROM public.report_conversion_funnel(public.current_agent_id(), p_period);
$$;

CREATE OR REPLACE FUNCTION public.agent_report_pipeline_stages()
RETURNS TABLE (
    status               trip_status,
    weight_pct           smallint,
    trip_count           integer,
    gross_cents          text,
    weighted_cents       text,
    total_gross_cents    text,
    total_weighted_cents text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT r.status, r.weight_pct, r.trip_count, r.gross_cents::text, r.weighted_cents::text,
           r.total_gross_cents::text, r.total_weighted_cents::text
      FROM public.report_pipeline_stages(public.current_agent_id()) r;
$$;

CREATE OR REPLACE FUNCTION public.agent_report_pipeline_months()
RETURNS TABLE (bucket text, month_start date, trip_count integer, weighted_cents text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT r.bucket, r.month_start, r.trip_count, r.weighted_cents::text
      FROM public.report_pipeline_months(public.current_agent_id()) r;
$$;

COMMENT ON FUNCTION public.agent_report_pipeline_stages() IS
    'Screen 3.11.7, by stage. See report_pipeline_stages. Money as digit-strings.';
COMMENT ON FUNCTION public.agent_report_pipeline_months() IS
    'Screen 3.11.7, by travel month. See report_pipeline_months. Money as digit-strings.';

COMMENT ON FUNCTION public.agent_report_client_lifetime_value() IS
    'Screen 3.11.5. See report_client_lifetime_value. Money as digit-strings.';
COMMENT ON FUNCTION public.agent_report_conversion_funnel(text) IS
    'Screen 3.11.6. See report_conversion_funnel.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. The CSV door learns the two reports
-- ─────────────────────────────────────────────────────────────────────────────
--
-- `clients` and `pipeline` take no period: the audit row records NULL for it, and from/to are
-- NULL in the result, so the file name carries the day it ran rather than inventing a window.

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

    IF NOT EXISTS (SELECT 1 FROM public.platform_user pu
                    WHERE pu.id = p_actor_user_id AND pu.agent_id = p_agent_id) THEN
        RAISE EXCEPTION 'export actor is not this advisor' USING ERRCODE = '42501';
    END IF;

    -- Lifetime value and the pipeline are not over a period.
    IF p_report NOT IN ('clients', 'pipeline') THEN
        SELECT b.from_date, b.to_date INTO v_from, v_to
          FROM public.report_period_bounds(p_period, v_today) b;
    END IF;

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
    ELSIF p_report = 'clients' THEN
        SELECT coalesce(jsonb_agg(jsonb_build_object(
                   'display_name',     r.display_name,
                   'trip_count',       r.trip_count,
                   'value_cents',      r.value_cents::text,
                   'commission_cents', r.commission_cents::text,
                   'cohort_start',     r.cohort_start)
                   ORDER BY r.value_cents DESC, r.display_name, r.client_id), '[]'::jsonb)
          INTO v_rows
          FROM public.report_client_lifetime_value(p_agent_id) r;
    ELSIF p_report = 'funnel' THEN
        SELECT coalesce(jsonb_agg(jsonb_build_object(
                   'stage',          r.stage,
                   'reached',        r.reached,
                   'open_here',      r.open_here,
                   'cancelled_here', r.cancelled_here,
                   'book_days_avg',  r.book_days_avg,
                   'book_days_n',    r.book_days_n) ORDER BY r.stage), '[]'::jsonb)
          INTO v_rows
          FROM public.report_conversion_funnel(p_agent_id, p_period) r;
    ELSIF p_report = 'pipeline' THEN
        -- Both tables in one array, each row tagged, stage rows first.
        -- WITH ORDINALITY + ORDER BY: the order is stated, not left to a scan staying intact.
        SELECT coalesce((SELECT jsonb_agg(jsonb_build_object(
                             'kind',           'stage',
                             'status',         r.status,
                             'weight_pct',     r.weight_pct,
                             'trip_count',     r.trip_count,
                             'gross_cents',    r.gross_cents::text,
                             'weighted_cents', r.weighted_cents::text) ORDER BY r.o)
                           FROM public.report_pipeline_stages(p_agent_id) WITH ORDINALITY
                                AS r(status, weight_pct, trip_count, gross_cents, weighted_cents,
                                     total_gross_cents, total_weighted_cents, o)), '[]'::jsonb)
            || coalesce((SELECT jsonb_agg(jsonb_build_object(
                             'kind',           r.bucket,
                             'month_start',    r.month_start,
                             'trip_count',     r.trip_count,
                             'weighted_cents', r.weighted_cents::text) ORDER BY r.o)
                           FROM public.report_pipeline_months(p_agent_id) WITH ORDINALITY
                                AS r(bucket, month_start, trip_count, weighted_cents, o)), '[]'::jsonb)
          INTO v_rows;
    ELSE
        RAISE EXCEPTION 'unknown report: %', p_report USING ERRCODE = '22023';
    END IF;

    PERFORM public.commission_audit(
        p_audit_id, p_actor_user_id, 'report.exported', 'agent', p_agent_id,
        jsonb_build_object(
            'report',    p_report,
            'period',    CASE WHEN p_report NOT IN ('clients', 'pipeline') THEN p_period END,
            'basis',     CASE WHEN p_report = 'revenue' THEN p_basis END,
            'from',      v_from,
            'to',        v_to,
            'row_count', jsonb_array_length(v_rows)),
        p_ip, p_user_agent);

    -- `today` is the advisor's own date, for a file name that is not over a period.
    RETURN jsonb_build_object('from', v_from, 'to', v_to, 'today', v_today, 'rows', v_rows);
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Grants
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE f text;
BEGIN
    FOREACH f IN ARRAY ARRAY[
        'public.report_first_committed_at(uuid)',
        'public.report_client_lifetime_value(uuid)',
        'public.report_conversion_funnel(uuid, text)',
        'public.report_pipeline_stages(uuid)',
        'public.report_pipeline_months(uuid)',
        'public.agent_report_export(uuid, uuid, text, text, text, uuid, text, text)'
    ] LOOP
        EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM public, anon, authenticated', f);
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f);
    END LOOP;

    FOREACH f IN ARRAY ARRAY[
        'public.agent_report_client_lifetime_value()',
        'public.agent_report_conversion_funnel(text)',
        'public.agent_report_pipeline_stages()',
        'public.agent_report_pipeline_months()'
    ] LOOP
        EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM public, anon', f);
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f);
    END LOOP;
END $$;

COMMIT;
