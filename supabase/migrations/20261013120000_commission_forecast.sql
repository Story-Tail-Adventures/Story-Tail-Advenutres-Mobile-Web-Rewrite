-- §3.7 Stage 4: 3.7.7 Commission Forecast — the pipeline-weighted forecast by stage, the
-- cash-in calendar, and saving the stage weights.
--
-- ── WHAT GYASI RULED (2026-10-12) ───────────────────────────────────────────────────────
--
--   * THE FORECAST COVERS EVERY OPEN TRIP (inquiry, proposal, booked, in progress), whatever
--     its dates — the same pool, weights and source as agent_kpis, so its unweighted and
--     weighted totals are agent_kpis' own. (The worklist tile shows the unweighted one with the
--     confidence under it; this screen leads with the weighted one.)
--   * THE CASH-IN CALENDAR IS THAT FORECAST BY MONTH: each booking's weighted commission in the
--     month its supplier should pay. Money already recorded as received on a trip's ledger
--     lines comes off that trip's future cash, so nothing is counted twice.
--   * A BOOKING WITH NO PAYMENT TERMS ON FILE IS EXPECTED 60 DAYS AFTER TRAVEL.
--   * "ADJUST WEIGHTING" SAVES: it writes `pipeline_weight` (Data-Model §7.4), so the worklist's
--     confidence (and agent_kpis' weighted figure) moves with it, and the change is audited.
--
-- ── TRIP GRAIN, NEVER THE LEDGER ────────────────────────────────────────────────────────
--
-- The forecast reads `trip.total_commission_cents` (kept by the trip-totals trigger as the sum
-- of its live components) and the calendar reads those same components. The ledger appears
-- only as money already received — subtracted, never added. Commission is two numbers on
-- purpose (Data-Model §10.1); this file does not add one to the other.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. The forecast by stage
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.agent_commission_forecast()
RETURNS TABLE (
    status               trip_status,
    weight_pct           smallint,
    trip_count           integer,
    raw_cents            text,
    weighted_cents       text,
    total_raw_cents      text,
    total_weighted_cents text,
    as_of_date           date
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    WITH me AS (
        SELECT a.id AS agent_id, (now() AT TIME ZONE a.time_zone)::date AS today
          FROM public.agent a
         WHERE a.id = public.current_agent_id()
    ),
    -- The four open stages, in pipeline order, each with this advisor's weight.
    stage AS (
        SELECT pw.status, pw.weight_pct,
               array_position(ARRAY['inquiry', 'proposal', 'booked', 'in_progress']::trip_status[],
                              pw.status) AS ord
          FROM public.pipeline_weight pw
          JOIN me ON pw.agent_id = me.agent_id
         WHERE pw.status IN ('inquiry', 'proposal', 'booked', 'in_progress')
    ),
    -- agent_kpis' `open_trip`, word for word: every non-archived trip in an open status.
    open_trip AS (
        SELECT t.status, t.total_commission_cents
          FROM public.trip t
          JOIN me ON t.agent_id = me.agent_id
         WHERE t.archived_at IS NULL
           AND t.status IN ('inquiry', 'proposal', 'booked', 'in_progress')
    ),
    per AS (
        SELECT st.status, st.weight_pct, st.ord,
               count(o.status)::integer                                         AS n,
               coalesce(sum(o.total_commission_cents), 0)::bigint                AS raw,
               coalesce(sum(o.total_commission_cents * st.weight_pct / 100.0), 0) AS weighted_exact
          FROM stage st
          LEFT JOIN open_trip o ON o.status = st.status
         GROUP BY st.status, st.weight_pct, st.ord
    )
    -- The total is rounded ONCE, from the exact sum, exactly as agent_kpis rounds it: four
    -- per-stage roundings could drift a cent or two from the worklist's figure.
    SELECT p.status, p.weight_pct, p.n, p.raw::text, p.weighted_exact::bigint::text,
           (sum(p.raw) OVER ())::bigint::text,
           (sum(p.weighted_exact) OVER ())::bigint::text,
           me.today
      FROM per p
     CROSS JOIN me
     ORDER BY p.ord;
$$;

COMMENT ON FUNCTION public.agent_commission_forecast() IS
    'Screen 3.7.7''s weighted forecast: one row per open stage (inquiry, proposal, booked, '
    'in_progress) with the advisor''s weight, the trips in it, their commission and the weighted '
    'amount; plus the totals, rounded once as agent_kpis rounds them so the two figures agree.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. The cash-in calendar
-- ─────────────────────────────────────────────────────────────────────────────
--
-- WHEN A BOOKING PAYS, from its supplier's terms (Data-Model §8.1):
--   after_travel  → the trip's end date + the supplier's lag
--   at_booking    → the day the trip was first booked + the lag; a trip not booked yet is
--                   assumed booked today, the earliest it could pay
--   no terms      → the trip's end date + 60 days (Gyasi, 2026-10-12)
-- A trip with no end date where one is needed has no date: the "date not set" row, rather
-- than a guess.
--
-- WHAT IS ALREADY HERE. A trip's received ledger money (received or disputed lines) comes off
-- its weighted total, spread over its bookings in proportion, so a trip paid in part shows
-- only what is still to come. `received_cents` reports what came off, so the page can say
-- calendar + received = forecast.

CREATE OR REPLACE FUNCTION public.agent_commission_cash_in()
RETURNS TABLE (
    bucket         text,
    month_start    date,
    cents          text,
    trip_count     integer,
    received_cents text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    WITH me AS (
        SELECT a.id AS agent_id, a.time_zone,
               (now() AT TIME ZONE a.time_zone)::date                       AS today,
               date_trunc('month', (now() AT TIME ZONE a.time_zone))::date AS month_start
          FROM public.agent a
         WHERE a.id = public.current_agent_id()
    ),
    -- The forecast's own pool, and each trip's weighted total exactly as the forecast takes it.
    open_trip AS (
        SELECT t.id, t.end_date,
               pw.weight_pct,
               t.total_commission_cents * pw.weight_pct / 100.0 AS weighted
          FROM public.trip t
          JOIN me ON t.agent_id = me.agent_id
          JOIN public.pipeline_weight pw ON pw.agent_id = t.agent_id AND pw.status = t.status
         WHERE t.archived_at IS NULL
           AND t.status IN ('inquiry', 'proposal', 'booked', 'in_progress')
    ),
    first_booked AS (
        SELECT h.trip_id, (min(h.changed_at) AT TIME ZONE me.time_zone)::date AS booked_on
          FROM public.trip_status_history h
          JOIN open_trip o ON o.id = h.trip_id
         CROSS JOIN me
         WHERE h.to_status = 'booked'
         GROUP BY h.trip_id, me.time_zone
    ),
    -- One piece per live booking: its weighted commission and the day it should be paid.
    component_piece AS (
        SELECT o.id AS trip_id,
               tc.commission_cents * o.weight_pct / 100.0 AS amount,
               CASE s.commission_payment_terms
                    WHEN 'at_booking'   THEN coalesce(b.booked_on, me.today)
                                             + coalesce(s.commission_payment_lag_days, 0)
                    WHEN 'after_travel' THEN o.end_date + coalesce(s.commission_payment_lag_days, 0)
                    ELSE o.end_date + 60
               END AS due
          FROM open_trip o
         CROSS JOIN me
          JOIN public.trip_component tc ON tc.trip_id = o.id AND tc.archived_at IS NULL
          LEFT JOIN public.supplier s   ON s.id = tc.supplier_id
          LEFT JOIN first_booked b      ON b.trip_id = o.id
         WHERE tc.commission_cents > 0
    ),
    -- What a trip's total holds beyond its live bookings — a total written by anything but the
    -- totals trigger (review found a hand-set total on a trip with no bookings, counted by the
    -- forecast and missing here). Undated, so calendar + received = forecast by construction.
    piece AS (
        SELECT cp.trip_id, cp.amount, cp.due FROM component_piece cp
        UNION ALL
        SELECT o.id, o.weighted - coalesce(sum(cp.amount), 0), NULL::date
          FROM open_trip o
          LEFT JOIN component_piece cp ON cp.trip_id = o.id
         GROUP BY o.id, o.weighted
        HAVING o.weighted - coalesce(sum(cp.amount), 0) > 0
    ),
    -- Both agent ids, as every §3.7 read: a line whose ids disagree is nobody's.
    received AS (
        SELECT c.trip_id, sum(c.received_commission_cents) AS cents
          FROM public.commission c
          JOIN public.trip t ON t.id = c.trip_id
          JOIN open_trip o   ON o.id = c.trip_id
         CROSS JOIN me
         WHERE c.agent_id = me.agent_id AND t.agent_id = me.agent_id
           AND c.archived_at IS NULL
           AND c.status IN ('received', 'disputed')
         GROUP BY c.trip_id
    ),
    -- Never more than the trip's weighted total comes off: money beyond it is not "still to come".
    came_off AS (
        SELECT o.id AS trip_id, o.weighted, least(coalesce(r.cents, 0), o.weighted) AS off
          FROM open_trip o
          LEFT JOIN received r ON r.trip_id = o.id
         WHERE o.weighted > 0
    ),
    scaled AS (
        SELECT p.trip_id, p.due, p.amount * (co.weighted - co.off) / co.weighted AS amount
          FROM piece p
          JOIN came_off co ON co.trip_id = p.trip_id
    ),
    -- OVERDUE IS BEFORE THE ADVISOR'S TODAY, not before the first of the month: a payment due
    -- on the 3rd and still not here on the 12th is overdue (both reviews).
    bucketed AS (
        SELECT CASE WHEN sc.due IS NULL THEN 'undated'
                    WHEN sc.due < me.today THEN 'overdue'
                    WHEN sc.due >= (me.month_start + interval '12 months')::date THEN 'later'
                    ELSE 'month' END AS bucket,
               CASE WHEN sc.due >= me.today
                     AND sc.due < (me.month_start + interval '12 months')::date
                    THEN date_trunc('month', sc.due)::date END AS month_start,
               sc.trip_id, sc.amount
          FROM scaled sc
         CROSS JOIN me
         WHERE sc.amount > 0
    ),
    -- Every row the calendar draws, zero or not, in order. FROM me throughout, so a caller who
    -- is not an advisor gets no rows at all rather than a frame of zeros.
    frame AS (
        SELECT 'overdue'::text AS bucket, NULL::date AS month_start, 0 AS ord FROM me
        UNION ALL
        SELECT 'month', (me.month_start + make_interval(months => g))::date, g + 1
          FROM me, generate_series(0, 11) AS g
        UNION ALL
        SELECT 'later', NULL, 13 FROM me
        UNION ALL
        SELECT 'undated', NULL, 14 FROM me
    ),
    per_row AS (
        SELECT f.bucket, f.month_start, f.ord,
               coalesce(sum(b.amount), 0)        AS exact,
               count(DISTINCT b.trip_id)::integer AS n
          FROM frame f
          LEFT JOIN bucketed b
                 ON b.bucket = f.bucket AND b.month_start IS NOT DISTINCT FROM f.month_start
         GROUP BY f.bucket, f.month_start, f.ord
    ),
    totals AS (
        SELECT (SELECT coalesce(sum(o.weighted), 0) FROM open_trip o) AS forecast_exact,
               (SELECT coalesce(sum(co.off), 0) FROM came_off co)    AS off_exact
    )
    -- ROUNDED AS RUNNING TOTALS: each row is round(sum up to it) - round(sum before it), and
    -- received is round(forecast) - round(forecast - received). Every row is whole cents, and
    -- the rows plus received equal the forecast's once-rounded total EXACTLY. Rounding each row
    -- on its own drifted by a cent per row (review measured it).
    SELECT r.bucket, r.month_start,
           (round(sum(r.exact) OVER upto) - round(coalesce(sum(r.exact) OVER before, 0)))::bigint::text,
           r.n,
           (round(t.forecast_exact) - round(t.forecast_exact - t.off_exact))::bigint::text
      FROM per_row r
     CROSS JOIN totals t
    WINDOW upto   AS (ORDER BY r.ord ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW),
           before AS (ORDER BY r.ord ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING)
     ORDER BY r.ord;
$$;

COMMENT ON FUNCTION public.agent_commission_cash_in() IS
    'Screen 3.7.7''s cash-in calendar: the weighted forecast spread over the months each '
    'booking''s supplier should pay (after travel / at booking + lag; no terms = 60 days after '
    'travel), less money already received on the trip. Rows: overdue, twelve months from this '
    'one, later, undated — every row present, zero or not. Overdue is due before the advisor''s '
    'today. Rows are running-total rounded so rows + received_cents = the forecast''s total.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Saving the weights
-- ─────────────────────────────────────────────────────────────────────────────
--
-- The four open stages only: completed and cancelled carry rows (Data-Model §7.4) but no
-- forecast reads them, and this screen does not show them. The caller names the weights the
-- screen showed (`p_expected`); if the stored ones differ, someone changed them since, and the
-- save is `stale` rather than a silent overwrite.

CREATE OR REPLACE FUNCTION public.agent_set_pipeline_weights(
    p_agent_id      uuid,
    p_actor_user_id uuid,
    p_expected      jsonb,
    p_weights       jsonb,
    p_audit_id      uuid,
    p_ip            text,
    p_user_agent    text
)
RETURNS TABLE (outcome text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
    v_stages  text[] := ARRAY['inquiry', 'proposal', 'booked', 'in_progress'];
    v_stage   text;
    v_now     integer;
    v_new     integer;
    v_changes jsonb := '{}'::jsonb;
    v_stale   boolean := false;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.agent a
                    WHERE a.id = p_agent_id AND a.status <> 'archived') THEN
        RETURN;
    END IF;

    -- Exactly the four stages, each a whole number from 0 to 100. The Edge Function says this
    -- in English first; this is the fence.
    IF jsonb_typeof(p_weights) IS DISTINCT FROM 'object' OR jsonb_typeof(p_expected) IS DISTINCT FROM 'object'
       OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(p_weights) k)
          IS DISTINCT FROM (SELECT array_agg(s ORDER BY s) FROM unnest(v_stages) s)
       OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(p_expected) k)
          IS DISTINCT FROM (SELECT array_agg(s ORDER BY s) FROM unnest(v_stages) s)
       -- CASE, not OR: SQL does not promise to test the type before it tries the cast.
       OR EXISTS (SELECT 1
                    FROM (SELECT value FROM jsonb_each(p_weights)
                          UNION ALL SELECT value FROM jsonb_each(p_expected)) e
                   WHERE CASE WHEN jsonb_typeof(e.value) <> 'number' THEN true
                              ELSE (e.value)::numeric <> trunc((e.value)::numeric)
                                   OR (e.value)::numeric NOT BETWEEN 0 AND 100 END) THEN
        RAISE EXCEPTION 'weights are the four open stages, each a whole number from 0 to 100';
    END IF;

    -- Locked, so two tabs saving at once take turns and the second is told it is stale. (A
    -- single-session test cannot show this; review ran two sessions: without the lock the second
    -- save overwrote the first, with it the second waited and returned stale.)
    PERFORM 1 FROM public.pipeline_weight pw
     WHERE pw.agent_id = p_agent_id AND pw.status::text = ANY (v_stages)
       FOR UPDATE;

    FOREACH v_stage IN ARRAY v_stages LOOP
        SELECT pw.weight_pct INTO v_now
          FROM public.pipeline_weight pw
         WHERE pw.agent_id = p_agent_id AND pw.status = v_stage::trip_status;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'advisor % has no % weight (Data-Model §7.4 seeds all six)', p_agent_id, v_stage;
        END IF;
        -- Through numeric: 50.0 passes the whole-number check above and is not valid text for
        -- an integer (found in review).
        IF v_now IS DISTINCT FROM (p_expected -> v_stage)::numeric::integer THEN
            v_stale := true;
        END IF;
        v_new := (p_weights -> v_stage)::numeric::integer;
        IF v_new IS DISTINCT FROM v_now THEN
            v_changes := v_changes || jsonb_build_object(v_stage, jsonb_build_object('from', v_now, 'to', v_new));
        END IF;
    END LOOP;

    IF v_stale THEN
        RETURN QUERY SELECT 'stale'::text;
        RETURN;
    END IF;
    IF v_changes = '{}'::jsonb THEN
        RETURN QUERY SELECT 'noop'::text;
        RETURN;
    END IF;

    UPDATE public.pipeline_weight pw
       SET weight_pct = (p_weights -> pw.status::text)::numeric::smallint,
           updated_at = now()
     WHERE pw.agent_id = p_agent_id
       AND pw.status::text = ANY (v_stages)
       AND pw.weight_pct IS DISTINCT FROM (p_weights -> pw.status::text)::numeric::smallint;

    -- The same in-transaction audit as every §3.7 write: these weights move a figure on the
    -- worklist, and "who changed the forecast" is a question the audit trail should answer.
    PERFORM public.commission_audit(
        p_audit_id, p_actor_user_id, 'pipeline_weight.updated', 'agent', p_agent_id,
        jsonb_build_object('changes', v_changes),
        p_ip, p_user_agent);

    RETURN QUERY SELECT 'saved'::text;
END;
$$;

COMMENT ON FUNCTION public.agent_set_pipeline_weights IS
    'Screen 3.7.7''s "Adjust weighting": sets the four open stages'' weights (0-100) for '
    'p_agent_id, refusing as stale if the stored weights differ from p_expected. Audited in the '
    'same transaction. Outcomes: saved | noop | stale.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Grants
-- ─────────────────────────────────────────────────────────────────────────────

REVOKE EXECUTE ON FUNCTION public.agent_commission_forecast() FROM public, anon;
GRANT  EXECUTE ON FUNCTION public.agent_commission_forecast() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.agent_commission_cash_in() FROM public, anon;
GRANT  EXECUTE ON FUNCTION public.agent_commission_cash_in() TO authenticated, service_role;

-- Takes `p_agent_id` as trusted input: service_role only; the Edge Function is the door.
REVOKE EXECUTE ON FUNCTION
    public.agent_set_pipeline_weights(uuid, uuid, jsonb, jsonb, uuid, text, text)
    FROM public, anon, authenticated;
GRANT  EXECUTE ON FUNCTION
    public.agent_set_pipeline_weights(uuid, uuid, jsonb, jsonb, uuid, text, text)
    TO service_role;

-- ── ASSERTIONS ───────────────────────────────────────────────────────────────────

DO $$
DECLARE leaked text;
BEGIN
    IF has_function_privilege('authenticated',
           'public.agent_set_pipeline_weights(uuid, uuid, jsonb, jsonb, uuid, text, text)', 'EXECUTE')
       OR has_function_privilege('anon',
           'public.agent_set_pipeline_weights(uuid, uuid, jsonb, jsonb, uuid, text, text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'agent_set_pipeline_weights must not be executable by a client role';
    END IF;
    IF has_function_privilege('anon', 'public.agent_commission_forecast()', 'EXECUTE')
       OR has_function_privilege('anon', 'public.agent_commission_cash_in()', 'EXECUTE') THEN
        RAISE EXCEPTION 'the forecast reads are for signed-in advisors only';
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
       AND p.proname IN ('agent_commission_forecast', 'agent_commission_cash_in',
                         'agent_set_pipeline_weights')
       AND (sp.value IS NULL
            OR btrim((string_to_array(sp.value, ','))[
                   cardinality(string_to_array(sp.value, ','))], ' "') <> 'pg_temp'
            OR NOT p.prosecdef);
    IF leaked IS NOT NULL THEN
        RAISE EXCEPTION '§3.7.7 functions need a pg_temp-terminated search_path and SECURITY DEFINER: %', leaked;
    END IF;

    IF has_table_privilege('authenticated', 'public.pipeline_weight', 'UPDATE')
       OR has_table_privilege('authenticated', 'public.pipeline_weight', 'SELECT') THEN
        RAISE EXCEPTION 'pipeline_weight is reachable by a client role';
    END IF;
END $$;

COMMIT;
