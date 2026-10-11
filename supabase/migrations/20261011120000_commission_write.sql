-- §3.7 Stage 2: the commission ledger's first producers — 3.7.3 edit, 3.7.4 add, the
-- "mark received" action, a soft remove, and the audited export Stage 1 deferred.
--
-- ── WHAT GYASI RULED (2026-10-11) ───────────────────────────────────────────────────────
--
--   * PAYMENT TERMS BECOME A CHOICE PLUS A NUMBER. `commission.payment_terms` was free text
--     ('60 days after travel') against a documented at_booking / after_travel pair, and
--     §3.7.7's cash-in calendar cannot be computed from prose. It is the enum the Data Model
--     always named, plus `payment_lag_days`. Free to do now: production holds no commission
--     rows and no supplier rows (checked 2026-10-11), so nothing is being reinterpreted.
--   * A LINE ENTERED BY MISTAKE MAY BE REMOVED ONLY WHILE IT IS `expected` AND CARRIES NO
--     INTELETRAVEL REFERENCE — i.e. before it was ever invoiced. Removal is SOFT
--     (`archived_at`) and audited. Anything later is corrected by editing, or marked lost.
--
-- ── THE AUDIT ROW IS WRITTEN IN THE SAME TRANSACTION AS THE WRITE ───────────────────────
--
-- Every other write on the agent surface audits from the Edge Function AFTER the RPC
-- returns: two round trips, so a failed audit insert leaves a landed mutation with no record.
-- `_shared/audit.ts` says in so many words that this should be closed "before the first
-- financial mutation ships". `commission` is on CLAUDE.md rule 3's list and Data-Model §18.3
-- names "any commission record edit (financial integrity)" — this is that mutation. So each
-- write below calls `commission_audit()` before it returns, inside its own transaction: the
-- audit row and the change land together or not at all. The Edge Function supplies the
-- audit row's v7 id, the caller's ip and user agent; nothing else about the row is up to it.
--
-- ── THE TENANCY PREDICATE LIVES IN ONE PLACE NOW ────────────────────────────────────────
--
-- Stage 1's five accessors each spelled out "commission.agent_id is me AND the trip's
-- agent_id is me" — five copies, each mutation-tested separately. Stage 2 adds
-- `archived_at IS NULL` to that predicate, which would have been five more edits to get
-- right. Instead `commission_lines_for_current_agent()` holds it once and the five are
-- re-pointed at it (signatures unchanged). The writes take `p_agent_id` explicitly and keep
-- their own predicate: they run on the service role, where `current_agent_id()` is NULL.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Schema
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TYPE public.commission_payment_terms AS ENUM ('at_booking', 'after_travel');

COMMENT ON TYPE public.commission_payment_terms IS
    'When a supplier pays commission: a number of days after BOOKING, or after TRAVEL ends. '
    'Paired with a lag-days integer on the row. Data-Model §10.1 documented these two values '
    'from the start; the column held free text until 20261011120000.';

-- The lag is parsed out of the old text BEFORE the type changes, for any deployed rows.
-- On `db reset` this is a no-op (migrations run against an empty table; the seed writes the
-- new shape itself), and production had no rows on 2026-10-11 — it is here so the migration
-- is correct rather than merely lucky.
ALTER TABLE public.commission
    ADD COLUMN payment_lag_days integer NOT NULL DEFAULT 0,
    ADD COLUMN version          integer NOT NULL DEFAULT 1,
    ADD COLUMN archived_at      timestamptz;

UPDATE public.commission
   SET payment_lag_days = coalesce(substring(payment_terms FROM '(\d+)')::integer, 0);

ALTER TABLE public.commission
    ALTER COLUMN payment_terms TYPE public.commission_payment_terms
    USING (CASE WHEN payment_terms ILIKE '%booking%' THEN 'at_booking'
                ELSE 'after_travel' END)::public.commission_payment_terms;

ALTER TABLE public.commission
    ADD CONSTRAINT commission_lag_range CHECK (payment_lag_days BETWEEN 0 AND 365),
    ADD CONSTRAINT commission_version_positive CHECK (version >= 1);

COMMENT ON COLUMN public.commission.payment_terms IS
    'at_booking or after_travel, with payment_lag_days. Was free text until 20261011120000.';
COMMENT ON COLUMN public.commission.payment_lag_days IS
    'Days after the booking (at_booking) or after travel ends (after_travel) that the '
    'supplier pays. 0–365. With payment_terms it dates the expected payment on screen 3.7.3 '
    'and, later, §3.7.7''s cash-in calendar.';
COMMENT ON COLUMN public.commission.version IS
    'Optimistic lock for screen 3.7.3 (Data-Model §20.4). Bumped by every write; a write that '
    'names a different version is refused as stale rather than overwriting.';
COMMENT ON COLUMN public.commission.archived_at IS
    'Soft removal of a line entered by mistake. Allowed ONLY while status = expected and no '
    'Inteletravel reference is set (Gyasi, 2026-10-11). Removed lines leave every accessor; '
    'the row and its audit trail remain.';

-- The supplier's DEFAULT terms, offered when a line is added. NULL means "varies" (the old
-- documented `mixed`) or "not on file" — no prefill either way, and the advisor picks.
ALTER TABLE public.supplier ADD COLUMN commission_payment_lag_days integer;

UPDATE public.supplier
   SET commission_payment_lag_days = substring(commission_payment_terms FROM '(\d+)')::integer
 WHERE commission_payment_terms ~ '\d';

ALTER TABLE public.supplier
    ALTER COLUMN commission_payment_terms TYPE public.commission_payment_terms
    USING (CASE WHEN commission_payment_terms ILIKE '%booking%' THEN 'at_booking'
                WHEN commission_payment_terms ILIKE '%travel%'  THEN 'after_travel'
                END)::public.commission_payment_terms;

ALTER TABLE public.supplier
    ADD CONSTRAINT supplier_lag_range
        CHECK (commission_payment_lag_days IS NULL
               OR commission_payment_lag_days BETWEEN 0 AND 365),
    -- A lag with no terms says "60 days after… something". Refused.
    ADD CONSTRAINT supplier_lag_needs_terms
        CHECK (commission_payment_terms IS NOT NULL OR commission_payment_lag_days IS NULL);

COMMENT ON COLUMN public.supplier.commission_payment_terms IS
    'Default terms offered when a commission line is added for this supplier. NULL = varies '
    'or unknown. Enum since 20261011120000 (was free text).';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. The scope: the calling agent's live commission lines, defined once
-- ─────────────────────────────────────────────────────────────────────────────
--
-- SECURITY INVOKER, and granted to NO client role. It is only ever called from inside the
-- definer accessors below, which run as the table owner; a client role calling it directly
-- has neither EXECUTE on it nor SELECT on `commission`.

CREATE OR REPLACE FUNCTION public.commission_lines_for_current_agent()
RETURNS SETOF public.commission
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
    SELECT c.*
      FROM public.commission c
      JOIN public.trip t ON t.id = c.trip_id
     WHERE c.agent_id = public.current_agent_id()
       -- BOTH agent ids. Nothing in the schema makes them agree, so a line whose two ids
       -- disagree belongs to neither advisor rather than to the wrong one.
       AND t.agent_id = c.agent_id
       AND c.archived_at IS NULL;
$$;

COMMENT ON FUNCTION public.commission_lines_for_current_agent() IS
    'The one definition of "my commission lines": commission.agent_id AND trip.agent_id are '
    'the caller, and the line is not removed. Every §3.7 read accessor selects from this. '
    'Not executable by any client role; reached only through the definer accessors.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Stage 1's five accessors, re-pointed at the scope (signatures unchanged)
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
          FROM public.commission_lines_for_current_agent() c
          JOIN public.trip t     ON t.id = c.trip_id
          JOIN public.client cl  ON cl.id = t.client_id
          JOIN public.supplier s ON s.id = c.supplier_id
         WHERE (p_status IS NULL OR cardinality(p_status) = 0 OR c.status = ANY (p_status))
           AND (p_supplier_id IS NULL OR c.supplier_id = p_supplier_id)
           AND (p_trip_id IS NULL OR c.trip_id = p_trip_id)
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
     ORDER BY l.start_date DESC NULLS LAST, l.created_at DESC, l.id
     LIMIT  least(greatest(coalesce(p_limit, 25), 0), 500)
     OFFSET greatest(coalesce(p_offset, 0), 0);
$$;

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
    SELECT x.*
      FROM me
     CROSS JOIN LATERAL (
        SELECT count(*) FILTER (WHERE c.status = 'expected')::integer,
               count(*) FILTER (WHERE c.status = 'invoiced')::integer,
               count(*) FILTER (WHERE c.status = 'received')::integer,
               count(*) FILTER (WHERE c.status = 'disputed')::integer,
               count(*) FILTER (WHERE c.status = 'lost')::integer,
               count(*)::integer
          FROM public.commission_lines_for_current_agent() c
     ) x;
$$;

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
    SELECT s.id, s.name, count(*)::integer
      FROM public.commission_lines_for_current_agent() c
      JOIN public.supplier s ON s.id = c.supplier_id
     GROUP BY s.id, s.name
     ORDER BY s.name, s.id;
$$;

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
    span AS (
        SELECT agent_id, today,
               date_trunc('year', today)::date                          AS year_start,
               (date_trunc('year', today) - interval '1 year')::date    AS ly_start,
               (today - interval '1 year')::date                        AS ly_today,
               date_trunc('month', today)::date                         AS month_start
          FROM me
    ),
    lines AS (
        SELECT c.* FROM public.commission_lines_for_current_agent() c
    ),
    ytd AS (
        SELECT coalesce(sum(l.received_commission_cents), 0)::bigint AS received,
               round(sum(l.expected_commission_cents) * 100.0
                     / nullif(sum(l.gross_booking_cents), 0), 1)     AS rate
          FROM lines l, span s
         WHERE l.received_at BETWEEN s.year_start AND s.today
    ),
    ly AS (
        SELECT coalesce(sum(l.received_commission_cents), 0)::bigint AS received,
               round(sum(l.expected_commission_cents) * 100.0
                     / nullif(sum(l.gross_booking_cents), 0), 1)     AS rate
          FROM lines l, span s
         WHERE l.received_at BETWEEN s.ly_start AND s.ly_today
    ),
    -- TRIP grain, not lines — unchanged by Stage 2 and untouched by line removal.
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
        (SELECT count(*)::integer FROM upcoming WHERE total_commission_cents > 0),
        (SELECT gap::text FROM risk),
        (SELECT n FROM risk),
        (SELECT trailing_sum::text FROM trend),
        (SELECT prior_sum::text FROM trend)
      FROM span s;
$$;

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
          FROM public.commission_lines_for_current_agent() c
          JOIN me ON true
         WHERE c.received_at >= (me.month_start - interval '11 months')::date
           AND c.received_at <= me.today
         GROUP BY 1
    )
    SELECT m.month_start, coalesce(p.cents, 0)::text, coalesce(p.n, 0)
      FROM months m
      LEFT JOIN paid p ON p.month_start = m.month_start
     ORDER BY m.month_start;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. §3.7.3's read: one line, everything the detail screen shows
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.agent_commission_line(p_commission_id uuid)
RETURNS TABLE (
    commission_id             uuid,
    trip_id                   uuid,
    trip_title                text,
    trip_status               trip_status,
    trip_archived             boolean,
    trip_start_date           date,
    trip_end_date             date,
    booked_on                 date,
    client_id                 uuid,
    client_display_name       text,
    supplier_id               uuid,
    supplier_name             text,
    gross_booking_cents       text,
    commission_pct            numeric,
    expected_commission_cents text,
    processing_fee_cents      text,
    received_commission_cents text,
    currency                  char(3),
    payment_terms             commission_payment_terms,
    payment_lag_days          integer,
    expected_payment_date     date,
    status                    commission_status,
    received_at               date,
    inteletravel_reference    text,
    notes                     text,
    version                   integer,
    can_remove                boolean,
    as_of_date                date
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    WITH me AS (
        SELECT a.id AS agent_id, a.time_zone,
               (now() AT TIME ZONE a.time_zone)::date AS today
          FROM public.agent a
         WHERE a.id = public.current_agent_id()
    ),
    line AS (
        SELECT c.* FROM public.commission_lines_for_current_agent() c
         WHERE c.id = p_commission_id
    )
    SELECT l.id, l.trip_id, t.title, t.status, t.archived_at IS NOT NULL,
           t.start_date, t.end_date, b.booked_on,
           t.client_id,
           coalesce(cl.preferred_name, cl.first_name) || ' ' || cl.last_name,
           l.supplier_id, s.name,
           l.gross_booking_cents::text, l.commission_pct,
           l.expected_commission_cents::text, l.processing_fee_cents::text,
           l.received_commission_cents::text, l.currency,
           l.payment_terms, l.payment_lag_days,
           -- The prototype's "Expected hit: Oct 18, 2026". NULL when the anchor date is not
           -- known yet — a trip with no end date, or one that has never been booked — rather
           -- than a guess.
           CASE l.payment_terms
                WHEN 'after_travel' THEN t.end_date + l.payment_lag_days
                WHEN 'at_booking'   THEN b.booked_on + l.payment_lag_days
           END,
           l.status, l.received_at, l.inteletravel_reference, l.notes, l.version,
           -- Gyasi's rule, computed where the write enforces it, so the button and the
           -- refusal cannot disagree.
           (l.status = 'expected' AND l.inteletravel_reference IS NULL),
           me.today
      FROM line l
     CROSS JOIN me
      JOIN public.trip t     ON t.id = l.trip_id
      JOIN public.client cl  ON cl.id = t.client_id
      JOIN public.supplier s ON s.id = l.supplier_id
      -- The FIRST time the trip was booked, as a date in the agent's zone: the anchor for
      -- `at_booking` terms. A trip re-booked after a date change keeps its original date.
      LEFT JOIN LATERAL (
            SELECT (min(h.changed_at) AT TIME ZONE me.time_zone)::date AS booked_on
              FROM public.trip_status_history h
             WHERE h.trip_id = t.id AND h.to_status = 'booked'
           ) b ON true;
$$;

COMMENT ON FUNCTION public.agent_commission_line(uuid) IS
    'Screen 3.7.3: one live commission line the caller owns (through '
    'commission_lines_for_current_agent), with its trip, client and supplier names, the '
    'expected payment date derived from its terms, its version for the optimistic lock, and '
    'whether it may be removed. No row for anything else.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. The supplier picker learns each supplier's default terms
-- ─────────────────────────────────────────────────────────────────────────────
--
-- DROP, not CREATE OR REPLACE: adding columns changes the RETURNS TABLE type. The §3.4
-- component sheets that already read this take the extra columns without noticing.

DROP FUNCTION IF EXISTS public.agent_suppliers();

CREATE FUNCTION public.agent_suppliers()
RETURNS TABLE (
    supplier_id                 uuid,
    name                        text,
    kind                        supplier_kind,
    default_commission_pct      numeric(5,2),
    commission_payment_terms    commission_payment_terms,
    commission_payment_lag_days integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    WITH me AS (
        SELECT public.current_agent_id() AS agent_id
    )
    SELECT s.id, s.name, s.kind, s.default_commission_pct,
           s.commission_payment_terms, s.commission_payment_lag_days
      FROM public.supplier s
     CROSS JOIN me
     WHERE me.agent_id IS NOT NULL
       AND s.archived_at IS NULL
     ORDER BY s.kind, s.name;
$$;

COMMENT ON FUNCTION public.agent_suppliers() IS
    'The supplier picker for screens 3.4.5 – 3.4.12 and 3.7.4: name, kind, default commission '
    'rate and default payment terms. Payment endpoints, portal URLs and contacts are '
    'deliberately absent. RETURNS TABLE is the column allow-list.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. The audit row, written inside the caller's transaction
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.commission_audit(
    p_audit_id      uuid,
    p_actor_user_id uuid,
    p_event_type    text,
    p_target_entity text,
    p_target_id     uuid,
    p_metadata      jsonb,
    p_ip            text,
    p_user_agent    text
)
RETURNS void
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
    v_ip inet;
BEGIN
    -- A write with no audit id is a caller that forgot the audit, not one that chose to skip
    -- it. Refuse, and the whole write goes with it.
    IF p_audit_id IS NULL OR p_actor_user_id IS NULL THEN
        RAISE EXCEPTION 'commission writes owe an audit row: audit id and actor are required';
    END IF;

    -- A malformed forwarded-for value must not cost the advisor their write; it costs the
    -- audit row its ip and nothing else.
    BEGIN
        v_ip := nullif(btrim(p_ip), '')::inet;
    EXCEPTION WHEN invalid_text_representation THEN
        v_ip := NULL;
    END;

    INSERT INTO public.audit_event
        (id, actor_user_id, actor_role, event_type, target_entity, target_id,
         metadata, ip_address, user_agent)
    VALUES
        (p_audit_id, p_actor_user_id, 'agent', p_event_type, p_target_entity, p_target_id,
         coalesce(p_metadata, '{}'::jsonb), v_ip, left(p_user_agent, 500));
END;
$$;

COMMENT ON FUNCTION public.commission_audit(uuid, uuid, text, text, uuid, jsonb, text, text) IS
    'Writes one audit_event inside the calling transaction. Used by every §3.7 write so the '
    'change and its record land together. Not executable by any client role.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. §3.7.4 Add
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.agent_create_commission(
    p_agent_id               uuid,
    p_actor_user_id          uuid,
    p_commission_id          uuid,
    p_trip_id                uuid,
    p_supplier_id            uuid,
    p_gross_cents            bigint,
    p_commission_pct         numeric,
    p_payment_terms          commission_payment_terms,
    p_payment_lag_days       integer,
    p_status                 commission_status,
    p_inteletravel_reference text,
    p_notes                  text,
    p_audit_id               uuid,
    p_ip                     text,
    p_user_agent             text
)
RETURNS TABLE (outcome text, commission_id uuid, version integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
    v_currency char(3);
    v_ref      text := nullif(btrim(p_inteletravel_reference), '');
    v_expected bigint;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.agent a
                    WHERE a.id = p_agent_id AND a.status <> 'archived') THEN
        RETURN;
    END IF;

    -- A new line has not been paid. `received` and `disputed` carry money and a date, and
    -- arrive through agent_record_commission_payment; `lost` on a line that never existed
    -- is not a thing to record. The Edge Function says this in English first.
    IF p_status NOT IN ('expected', 'invoiced') THEN
        RAISE EXCEPTION 'a new commission line starts as expected or invoiced, not %', p_status;
    END IF;

    SELECT t.currency INTO v_currency
      FROM public.trip t
     WHERE t.id = p_trip_id AND t.agent_id = p_agent_id AND t.archived_at IS NULL;
    IF NOT FOUND THEN
        RETURN QUERY SELECT 'trip_not_found'::text, NULL::uuid, NULL::integer;
        RETURN;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.supplier s
                    WHERE s.id = p_supplier_id AND s.archived_at IS NULL) THEN
        RETURN QUERY SELECT 'supplier_not_found'::text, NULL::uuid, NULL::integer;
        RETURN;
    END IF;

    IF v_ref IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.commission c
         WHERE c.agent_id = p_agent_id AND c.inteletravel_reference = v_ref) THEN
        RETURN QUERY SELECT 'duplicate_reference'::text, NULL::uuid, NULL::integer;
        RETURN;
    END IF;

    -- Computed HERE, never taken from the caller. `commission_expected_matches_rate` would
    -- refuse a mismatch anyway; computing it means there is nothing to mismatch.
    v_expected := round(p_gross_cents * p_commission_pct / 100.0);

    INSERT INTO public.commission
        (id, trip_id, agent_id, supplier_id, gross_booking_cents, commission_pct,
         expected_commission_cents, processing_fee_cents, received_commission_cents,
         currency, payment_terms, payment_lag_days, status, inteletravel_reference, notes,
         version)
    VALUES
        (p_commission_id, p_trip_id, p_agent_id, p_supplier_id, p_gross_cents,
         p_commission_pct, v_expected, 0, 0, v_currency, p_payment_terms, p_payment_lag_days,
         p_status, v_ref, nullif(btrim(p_notes), ''), 1);

    PERFORM public.commission_audit(
        p_audit_id, p_actor_user_id, 'commission.created', 'commission', p_commission_id,
        jsonb_build_object(
            'trip_id', p_trip_id,
            'supplier_id', p_supplier_id,
            'gross_booking_cents', p_gross_cents,
            'commission_pct', p_commission_pct,
            'expected_commission_cents', v_expected,
            'status', p_status,
            'payment_terms', p_payment_terms,
            'payment_lag_days', p_payment_lag_days,
            'inteletravel_reference', v_ref,
            -- Whether, never what: notes are free text and may name people.
            'has_notes', nullif(btrim(p_notes), '') IS NOT NULL,
            'version', 1),
        p_ip, p_user_agent);

    RETURN QUERY SELECT 'created'::text, p_commission_id, 1;
END;
$$;

COMMENT ON FUNCTION public.agent_create_commission IS
    'Screen 3.7.4. A new line on one of the advisor''s live trips, expected or invoiced, with '
    'expected computed from gross x rate. Writes its audit row in the same transaction. '
    'Outcomes: created | trip_not_found | supplier_not_found | duplicate_reference.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. §3.7.3 Edit
-- ─────────────────────────────────────────────────────────────────────────────
--
-- The trip is NOT editable: a line belongs to the trip it was entered against, and moving it
-- is a remove and an add, each audited. The status may move among expected, invoiced and
-- lost here; received and disputed carry money and a date and arrive only through the
-- payment write. A line that WAS received and is moved back here has its money and date
-- cleared — the constraints demand it, and the audit row keeps the before values.

CREATE OR REPLACE FUNCTION public.agent_update_commission(
    p_agent_id               uuid,
    p_actor_user_id          uuid,
    p_commission_id          uuid,
    p_expected_version       integer,
    p_supplier_id            uuid,
    p_gross_cents            bigint,
    p_commission_pct         numeric,
    p_payment_terms          commission_payment_terms,
    p_payment_lag_days       integer,
    p_status                 commission_status,
    p_inteletravel_reference text,
    p_notes                  text,
    p_audit_id               uuid,
    p_ip                     text,
    p_user_agent             text
)
RETURNS TABLE (outcome text, version integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
    v_line     public.commission%ROWTYPE;
    v_ref      text := nullif(btrim(p_inteletravel_reference), '');
    v_notes    text := nullif(btrim(p_notes), '');
    v_expected bigint;
    v_clear    boolean;
    v_changes  jsonb := '{}'::jsonb;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.agent a
                    WHERE a.id = p_agent_id AND a.status <> 'archived') THEN
        RETURN;
    END IF;

    SELECT c.* INTO v_line
      FROM public.commission c
      JOIN public.trip t ON t.id = c.trip_id
     WHERE c.id = p_commission_id
       AND c.agent_id = p_agent_id
       AND t.agent_id = p_agent_id
       AND c.archived_at IS NULL
       FOR UPDATE OF c;
    IF NOT FOUND THEN
        RETURN QUERY SELECT 'not_found'::text, NULL::integer;
        RETURN;
    END IF;

    IF p_expected_version IS DISTINCT FROM v_line.version THEN
        RETURN QUERY SELECT 'stale'::text, v_line.version;
        RETURN;
    END IF;

    -- Keeping a paid status is fine (editing a received line's notes); MOVING to one is the
    -- payment write's job.
    IF p_status IN ('received', 'disputed') AND p_status IS DISTINCT FROM v_line.status THEN
        RETURN QUERY SELECT 'needs_payment'::text, v_line.version;
        RETURN;
    END IF;

    -- The current supplier stays valid even if it has since been archived; a NEW choice
    -- must be live.
    IF p_supplier_id IS DISTINCT FROM v_line.supplier_id AND NOT EXISTS (
        SELECT 1 FROM public.supplier s WHERE s.id = p_supplier_id AND s.archived_at IS NULL) THEN
        RETURN QUERY SELECT 'supplier_not_found'::text, v_line.version;
        RETURN;
    END IF;

    IF v_ref IS NOT NULL AND v_ref IS DISTINCT FROM v_line.inteletravel_reference AND EXISTS (
        SELECT 1 FROM public.commission c
         WHERE c.agent_id = p_agent_id AND c.inteletravel_reference = v_ref
           AND c.id <> p_commission_id) THEN
        RETURN QUERY SELECT 'duplicate_reference'::text, v_line.version;
        RETURN;
    END IF;

    v_expected := round(p_gross_cents * p_commission_pct / 100.0);
    v_clear := v_line.status IN ('received', 'disputed')
               AND p_status NOT IN ('received', 'disputed');

    -- Before/after for every financial field that moved. These are the agency's own figures,
    -- not a client's personal data, and "what did the line say before" is the question a
    -- financial audit trail exists to answer.
    IF p_supplier_id IS DISTINCT FROM v_line.supplier_id THEN
        v_changes := v_changes || jsonb_build_object('supplier_id',
            jsonb_build_object('from', v_line.supplier_id, 'to', p_supplier_id));
    END IF;
    IF p_gross_cents IS DISTINCT FROM v_line.gross_booking_cents THEN
        v_changes := v_changes || jsonb_build_object('gross_booking_cents',
            jsonb_build_object('from', v_line.gross_booking_cents, 'to', p_gross_cents));
    END IF;
    IF p_commission_pct IS DISTINCT FROM v_line.commission_pct THEN
        v_changes := v_changes || jsonb_build_object('commission_pct',
            jsonb_build_object('from', v_line.commission_pct, 'to', p_commission_pct));
    END IF;
    IF v_expected IS DISTINCT FROM v_line.expected_commission_cents THEN
        v_changes := v_changes || jsonb_build_object('expected_commission_cents',
            jsonb_build_object('from', v_line.expected_commission_cents, 'to', v_expected));
    END IF;
    IF p_payment_terms IS DISTINCT FROM v_line.payment_terms THEN
        v_changes := v_changes || jsonb_build_object('payment_terms',
            jsonb_build_object('from', v_line.payment_terms, 'to', p_payment_terms));
    END IF;
    IF p_payment_lag_days IS DISTINCT FROM v_line.payment_lag_days THEN
        v_changes := v_changes || jsonb_build_object('payment_lag_days',
            jsonb_build_object('from', v_line.payment_lag_days, 'to', p_payment_lag_days));
    END IF;
    IF p_status IS DISTINCT FROM v_line.status THEN
        v_changes := v_changes || jsonb_build_object('status',
            jsonb_build_object('from', v_line.status, 'to', p_status));
    END IF;
    IF v_ref IS DISTINCT FROM v_line.inteletravel_reference THEN
        v_changes := v_changes || jsonb_build_object('inteletravel_reference',
            jsonb_build_object('from', v_line.inteletravel_reference, 'to', v_ref));
    END IF;
    IF v_clear THEN
        v_changes := v_changes || jsonb_build_object('payment_cleared', jsonb_build_object(
            'received_commission_cents', v_line.received_commission_cents,
            'processing_fee_cents', v_line.processing_fee_cents,
            'received_at', v_line.received_at));
    END IF;

    IF v_changes = '{}'::jsonb AND v_notes IS NOT DISTINCT FROM v_line.notes THEN
        -- A re-save of identical values is a no-op: no version bump (which would stale every
        -- other open tab for nothing) and no audit row (nothing happened).
        RETURN QUERY SELECT 'noop'::text, v_line.version;
        RETURN;
    END IF;

    UPDATE public.commission c
       SET supplier_id               = p_supplier_id,
           gross_booking_cents       = p_gross_cents,
           commission_pct            = p_commission_pct,
           expected_commission_cents = v_expected,
           payment_terms             = p_payment_terms,
           payment_lag_days          = p_payment_lag_days,
           status                    = p_status,
           inteletravel_reference    = v_ref,
           notes                     = v_notes,
           received_commission_cents = CASE WHEN v_clear THEN 0 ELSE c.received_commission_cents END,
           processing_fee_cents      = CASE WHEN v_clear THEN 0 ELSE c.processing_fee_cents END,
           received_at               = CASE WHEN v_clear THEN NULL ELSE c.received_at END,
           version                   = c.version + 1,
           updated_at                = now()
     WHERE c.id = p_commission_id;

    PERFORM public.commission_audit(
        p_audit_id, p_actor_user_id, 'commission.updated', 'commission', p_commission_id,
        jsonb_build_object(
            'changes', v_changes,
            'notes_changed', v_notes IS DISTINCT FROM v_line.notes,
            'version', v_line.version + 1),
        p_ip, p_user_agent);

    RETURN QUERY SELECT 'changed'::text, v_line.version + 1;
END;
$$;

COMMENT ON FUNCTION public.agent_update_commission IS
    'Screen 3.7.3''s edit. Optimistic lock on commission.version; the trip is fixed; status '
    'moves among expected / invoiced / lost (a received line moved back has its payment '
    'cleared, recorded in the audit). Audits before/after of every financial field in the '
    'same transaction. Outcomes: changed | noop | stale | not_found | needs_payment | '
    'supplier_not_found | duplicate_reference.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. "Mark received" — the only door to `received` and `disputed`
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.agent_record_commission_payment(
    p_agent_id         uuid,
    p_actor_user_id    uuid,
    p_commission_id    uuid,
    p_expected_version integer,
    p_status           commission_status,
    p_received_cents   bigint,
    p_fee_cents        bigint,
    p_received_at      date,
    p_audit_id         uuid,
    p_ip               text,
    p_user_agent       text
)
RETURNS TABLE (outcome text, version integer, gap_cents text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
    v_line  public.commission%ROWTYPE;
    v_today date;
    v_gap   bigint;
BEGIN
    IF p_status NOT IN ('received', 'disputed') THEN
        RAISE EXCEPTION 'a payment is recorded as received or disputed, not %', p_status;
    END IF;

    SELECT (now() AT TIME ZONE a.time_zone)::date INTO v_today
      FROM public.agent a
     WHERE a.id = p_agent_id AND a.status <> 'archived';
    IF NOT FOUND THEN
        RETURN;
    END IF;

    SELECT c.* INTO v_line
      FROM public.commission c
      JOIN public.trip t ON t.id = c.trip_id
     WHERE c.id = p_commission_id
       AND c.agent_id = p_agent_id
       AND t.agent_id = p_agent_id
       AND c.archived_at IS NULL
       FOR UPDATE OF c;
    IF NOT FOUND THEN
        RETURN QUERY SELECT 'not_found'::text, NULL::integer, NULL::text;
        RETURN;
    END IF;

    IF p_expected_version IS DISTINCT FROM v_line.version THEN
        RETURN QUERY SELECT 'stale'::text, v_line.version, NULL::text;
        RETURN;
    END IF;

    -- Money that has not arrived yet has not arrived. Every money figure on the dashboard
    -- stops at the advisor's today; a future date would sit outside all of them.
    IF p_received_at IS NULL OR p_received_at > v_today THEN
        RETURN QUERY SELECT 'bad_date'::text, v_line.version, NULL::text;
        RETURN;
    END IF;

    v_gap := v_line.expected_commission_cents - p_fee_cents - p_received_cents;

    IF p_status = v_line.status
       AND p_received_cents = v_line.received_commission_cents
       AND p_fee_cents = v_line.processing_fee_cents
       AND p_received_at = v_line.received_at THEN
        RETURN QUERY SELECT 'noop'::text, v_line.version, v_gap::text;
        RETURN;
    END IF;

    UPDATE public.commission c
       SET status                    = p_status,
           received_commission_cents = p_received_cents,
           processing_fee_cents      = p_fee_cents,
           received_at               = p_received_at,
           version                   = c.version + 1,
           updated_at                = now()
     WHERE c.id = p_commission_id;

    PERFORM public.commission_audit(
        p_audit_id, p_actor_user_id, 'commission.payment_recorded', 'commission',
        p_commission_id,
        jsonb_build_object(
            'status', jsonb_build_object('from', v_line.status, 'to', p_status),
            'received_commission_cents',
                jsonb_build_object('from', v_line.received_commission_cents, 'to', p_received_cents),
            'processing_fee_cents',
                jsonb_build_object('from', v_line.processing_fee_cents, 'to', p_fee_cents),
            'received_at', jsonb_build_object('from', v_line.received_at, 'to', p_received_at),
            'gap_cents', v_gap,
            'version', v_line.version + 1),
        p_ip, p_user_agent);

    RETURN QUERY SELECT 'recorded'::text, v_line.version + 1, v_gap::text;
END;
$$;

COMMENT ON FUNCTION public.agent_record_commission_payment IS
    'Screen 3.7.3''s "Mark received". Sets received or disputed with the amount, the fee and '
    'the date (not in the future). Returns the gap, expected - fee - received, which is what '
    '§3.7.6 reconciles. Audited in the same transaction. Outcomes: recorded | noop | stale | '
    'not_found | bad_date.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 10. Remove a line entered by mistake — soft, and only before invoicing
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.agent_remove_commission(
    p_agent_id         uuid,
    p_actor_user_id    uuid,
    p_commission_id    uuid,
    p_expected_version integer,
    p_audit_id         uuid,
    p_ip               text,
    p_user_agent       text
)
RETURNS TABLE (outcome text, version integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
    v_line public.commission%ROWTYPE;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.agent a
                    WHERE a.id = p_agent_id AND a.status <> 'archived') THEN
        RETURN;
    END IF;

    SELECT c.* INTO v_line
      FROM public.commission c
      JOIN public.trip t ON t.id = c.trip_id
     WHERE c.id = p_commission_id
       AND c.agent_id = p_agent_id
       AND t.agent_id = p_agent_id
       AND c.archived_at IS NULL
       FOR UPDATE OF c;
    IF NOT FOUND THEN
        RETURN QUERY SELECT 'not_found'::text, NULL::integer;
        RETURN;
    END IF;

    IF p_expected_version IS DISTINCT FROM v_line.version THEN
        RETURN QUERY SELECT 'stale'::text, v_line.version;
        RETURN;
    END IF;

    -- Gyasi's rule (2026-10-11). Once Inteletravel has a reference for it, or it has moved
    -- past `expected`, the line is part of the financial record: correct it, do not remove it.
    IF v_line.status <> 'expected' OR v_line.inteletravel_reference IS NOT NULL THEN
        RETURN QUERY SELECT 'not_removable'::text, v_line.version;
        RETURN;
    END IF;

    UPDATE public.commission c
       SET archived_at = now(),
           version     = c.version + 1,
           updated_at  = now()
     WHERE c.id = p_commission_id;

    PERFORM public.commission_audit(
        p_audit_id, p_actor_user_id, 'commission.removed', 'commission', p_commission_id,
        jsonb_build_object(
            'trip_id', v_line.trip_id,
            'supplier_id', v_line.supplier_id,
            'gross_booking_cents', v_line.gross_booking_cents,
            'commission_pct', v_line.commission_pct,
            'expected_commission_cents', v_line.expected_commission_cents,
            'version', v_line.version + 1),
        p_ip, p_user_agent);

    RETURN QUERY SELECT 'removed'::text, v_line.version + 1;
END;
$$;

COMMENT ON FUNCTION public.agent_remove_commission IS
    'Soft-removes a line entered by mistake: only while status = expected with no Inteletravel '
    'reference (Gyasi, 2026-10-11). Audited in the same transaction. Outcomes: removed | '
    'stale | not_found | not_removable.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 11. The export — rows and their audit row in one call
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Data-Model §18.3 audits "any bulk client list export", and a ledger download carries every
-- client's name. The audit row records WHAT was exported (the filters) and how many rows,
-- in the same call that returns them, so no export leaves without its record. Exact cents: this is data for the books, not the whole-dollar
-- display the screens use. Notes are left out — free text that may name people, and not
-- what a ledger export is for.

CREATE OR REPLACE FUNCTION public.agent_export_commission(
    p_agent_id      uuid,
    p_actor_user_id uuid,
    p_status        commission_status[],
    p_supplier_id   uuid,
    p_trip_id       uuid,
    p_travel_from   date,
    p_travel_to     date,
    p_audit_id      uuid,
    p_ip            text,
    p_user_agent    text
)
RETURNS TABLE (
    trip_title                text,
    client_display_name       text,
    supplier_name             text,
    travel_start              date,
    travel_end                date,
    status                    commission_status,
    gross_booking_cents       text,
    commission_pct            numeric,
    expected_commission_cents text,
    processing_fee_cents      text,
    received_commission_cents text,
    received_at               date,
    payment_terms             commission_payment_terms,
    payment_lag_days          integer,
    inteletravel_reference    text,
    currency                  char(3)
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
    v_count integer;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.agent a
                    WHERE a.id = p_agent_id AND a.status <> 'archived') THEN
        RETURN;
    END IF;

    -- Rows first, then the audit row with their count. Both are inside this one call: if
    -- the audit insert fails the call fails, and PostgREST returns no rows at all — so an
    -- export can never leave without its record, which is the property that matters.
    -- The predicate is the ledger's, spelled with p_agent_id: this runs on the service role,
    -- where current_agent_id() is NULL.
    RETURN QUERY
    SELECT t.title,
           coalesce(cl.preferred_name, cl.first_name) || ' ' || cl.last_name,
           s.name, t.start_date, t.end_date, c.status,
           c.gross_booking_cents::text, c.commission_pct, c.expected_commission_cents::text,
           c.processing_fee_cents::text, c.received_commission_cents::text, c.received_at,
           c.payment_terms, c.payment_lag_days, c.inteletravel_reference, c.currency
      FROM public.commission c
      JOIN public.trip t     ON t.id = c.trip_id
      JOIN public.client cl  ON cl.id = t.client_id
      JOIN public.supplier s ON s.id = c.supplier_id
     WHERE c.agent_id = p_agent_id
       AND t.agent_id = p_agent_id
       AND c.archived_at IS NULL
       AND (p_status IS NULL OR cardinality(p_status) = 0 OR c.status = ANY (p_status))
       AND (p_supplier_id IS NULL OR c.supplier_id = p_supplier_id)
       AND (p_trip_id IS NULL OR c.trip_id = p_trip_id)
       AND (p_travel_from IS NULL OR t.start_date >= p_travel_from)
       AND (p_travel_to   IS NULL OR t.start_date <= p_travel_to)
     ORDER BY t.start_date DESC NULLS LAST, c.created_at DESC, c.id;

    GET DIAGNOSTICS v_count = ROW_COUNT;

    PERFORM public.commission_audit(
        p_audit_id, p_actor_user_id, 'commission.exported', 'agent', p_agent_id,
        jsonb_build_object(
            'row_count', v_count,
            'filters', jsonb_build_object(
                'status', p_status,
                'supplier_id', p_supplier_id,
                'trip_id', p_trip_id,
                'travel_from', p_travel_from,
                'travel_to', p_travel_to)),
        p_ip, p_user_agent);
END;
$$;

COMMENT ON FUNCTION public.agent_export_commission IS
    'The ledger CSV export (§3.7.2), deferred from Stage 1 until it could be audited. Applies '
    'the ledger''s filters for p_agent_id, writes one commission.exported audit row with the '
    'filters and row count, then returns the rows in exact cents. Notes are not exported.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 12. Grants
-- ─────────────────────────────────────────────────────────────────────────────

-- The detail read joins Stage 1's reads: a definer accessor for the signed-in agent.
REVOKE EXECUTE ON FUNCTION public.agent_commission_line(uuid) FROM public, anon;
GRANT  EXECUTE ON FUNCTION public.agent_commission_line(uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.agent_suppliers() FROM public, anon;
GRANT  EXECUTE ON FUNCTION public.agent_suppliers() TO authenticated, service_role;

-- The two helpers: no client role, and not service_role either. They are only ever reached
-- from inside the functions above, which run as the owner.
REVOKE EXECUTE ON FUNCTION public.commission_lines_for_current_agent() FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION
    public.commission_audit(uuid, uuid, text, text, uuid, jsonb, text, text)
    FROM public, anon, authenticated;

-- The writes and the export take `p_agent_id` as trusted input. A client-role grant on any
-- of them is an act-as-any-advisor primitive. service_role only; the Edge Function is the door.
DO $$
DECLARE f text;
BEGIN
    FOREACH f IN ARRAY ARRAY[
        'public.agent_create_commission(uuid, uuid, uuid, uuid, uuid, bigint, numeric, commission_payment_terms, integer, commission_status, text, text, uuid, text, text)',
        'public.agent_update_commission(uuid, uuid, uuid, integer, uuid, bigint, numeric, commission_payment_terms, integer, commission_status, text, text, uuid, text, text)',
        'public.agent_record_commission_payment(uuid, uuid, uuid, integer, commission_status, bigint, bigint, date, uuid, text, text)',
        'public.agent_remove_commission(uuid, uuid, uuid, integer, uuid, text, text)',
        'public.agent_export_commission(uuid, uuid, commission_status[], uuid, uuid, date, date, uuid, text, text)'
    ]
    LOOP
        EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM public, anon, authenticated', f);
        EXECUTE format('GRANT  EXECUTE ON FUNCTION %s TO service_role', f);
    END LOOP;
END $$;

-- ── ASSERTIONS ───────────────────────────────────────────────────────────────────
--
-- Restated for THIS migration's functions. A DO block in an earlier migration only ever saw
-- the catalog as it stood that day.
DO $$
DECLARE leaked text;
BEGIN
    -- The writes, the export and both helpers: no client role may execute them.
    SELECT string_agg(p.proname, ', ' ORDER BY p.proname) INTO leaked
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('agent_create_commission', 'agent_update_commission',
                         'agent_record_commission_payment', 'agent_remove_commission',
                         'agent_export_commission', 'commission_lines_for_current_agent',
                         'commission_audit')
       AND (has_function_privilege('authenticated', p.oid, 'EXECUTE')
            OR has_function_privilege('anon', p.oid, 'EXECUTE'));
    IF leaked IS NOT NULL THEN
        RAISE EXCEPTION
            '§3.7 writes and helpers must not be executable by a client role: %', leaked;
    END IF;

    -- Every function this migration created or replaced pins its search_path to end in
    -- pg_temp; the definer ones must BE definer, and the helpers must NOT be.
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
                         'agent_commission_monthly', 'agent_commission_line', 'agent_suppliers',
                         'agent_create_commission', 'agent_update_commission',
                         'agent_record_commission_payment', 'agent_remove_commission',
                         'agent_export_commission', 'commission_lines_for_current_agent',
                         'commission_audit')
       AND (sp.value IS NULL
            OR btrim((string_to_array(sp.value, ','))[
                   cardinality(string_to_array(sp.value, ','))], ' "') <> 'pg_temp'
            OR (p.prosecdef = (p.proname IN ('commission_lines_for_current_agent',
                                             'commission_audit'))));
    IF leaked IS NOT NULL THEN
        RAISE EXCEPTION
            '§3.7 functions need a pg_temp-terminated search_path, definer for the accessors '
            'and writes, invoker for the two helpers: %', leaked;
    END IF;

    -- The table itself stays closed to every client role.
    IF has_table_privilege('authenticated', 'public.commission', 'SELECT')
       OR has_table_privilege('authenticated', 'public.commission', 'UPDATE')
       OR has_table_privilege('anon', 'public.commission', 'SELECT') THEN
        RAISE EXCEPTION 'public.commission is reachable by a client role again';
    END IF;
END $$;

COMMIT;
