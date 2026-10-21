-- §3.11 Reporting, PR 3: the Export Center (3.11.8) (P1). Rulings: Screen Inventory §3.11,
-- "Ruled 2026-10-21".
--
--   * CSV only, built on demand and downloaded at once: no stored file, no bucket, no expiry.
--   * Four types: Commission ledger (the existing agent_export_commission, unchanged), Trips,
--     Payment milestones, Clients. A Clients file carries contact details (email, phone,
--     mailing address) ONLY when the advisor ticks "Include contact details", which starts
--     unticked. Every export writes an audit row in the same call that returns its rows.
--   * A custom date range (From / To), which only the Export Center has. Each type says what
--     its dates mean: travel start (ledger, trips), due date (milestones). Clients takes NO
--     range: it is the whole client list. Filtering a client list by the day each was added
--     would quietly leave out every older client, the wrong answer for the books.
--   * "Recent exports" are READ FROM THE AUDIT ROWS every export already writes, per-report
--     ones included, so there is no history table to keep in step. "Run again" repeats one.
--
-- Same shape as 20261028120000: internal bodies take the agent id; one service-role door for
-- the file (the agent-report Edge Function's `center` op); one definer read for the history.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. The range
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.report_check_range(p_from date, p_to date)
RETURNS void
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
BEGIN
    IF p_from IS NULL OR p_to IS NULL OR p_from > p_to THEN
        RAISE EXCEPTION 'an export needs a From date on or before its To date' USING ERRCODE = '22023';
    END IF;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Trips
-- ─────────────────────────────────────────────────────────────────────────────
--
-- The advisor's trips (not archived) whose travel STARTS in the range, any stage, cancelled
-- included: a file for the books should show what fell through too, with its stage saying so.
-- A trip with no start date is in no range. Money is the trip's own totals; "first booked" is
-- the section's one rule (report_first_committed_at), as a date in the advisor's zone.

CREATE OR REPLACE FUNCTION public.report_export_trips(p_agent_id uuid, p_from date, p_to date)
RETURNS TABLE (
    trip_title        text,
    client_name       text,
    status            trip_status,
    start_date        date,
    end_date          date,
    destinations      text,
    value_cents       bigint,
    commission_cents  bigint,
    paid_cents        bigint,
    first_booked_on   date,
    created_on        date
)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
    SELECT t.title,
           coalesce(cl.preferred_name, cl.first_name) || ' ' || cl.last_name,
           t.status,
           t.start_date,
           t.end_date,
           array_to_string(t.destinations, '; '),
           t.total_value_cents,
           t.total_commission_cents,
           t.total_paid_cents,
           (public.report_first_committed_at(t.id) AT TIME ZONE r.time_zone)::date,
           (t.created_at AT TIME ZONE r.time_zone)::date
      FROM public.report_agent_today(p_agent_id) r
      JOIN public.trip t
        ON t.agent_id = r.agent_id
       AND t.archived_at IS NULL
      -- Both owners: nothing in the schema makes a trip's advisor and its client's agree, and a
      -- reassigned trip must not carry another book's client name into this file.
      JOIN public.client cl ON cl.id = t.client_id AND cl.agent_id = r.agent_id
     WHERE t.start_date BETWEEN p_from AND p_to
     ORDER BY t.start_date, t.title, t.id;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Payment milestones
-- ─────────────────────────────────────────────────────────────────────────────
--
-- The supplier pay schedule (Data-Model §9.5) of the advisor's trips, by DUE date in the
-- range. The pay link leaves as its host only ("royalcaribbean.com"): enough for the books,
-- and a link is not something a spreadsheet should carry around. The advisor's free-text
-- paid_note is not exported (as the ledger export leaves notes out).

CREATE OR REPLACE FUNCTION public.report_export_milestones(p_agent_id uuid, p_from date, p_to date)
RETURNS TABLE (
    trip_title      text,
    client_name     text,
    label           text,
    kind            payment_milestone_kind,
    amount_cents    bigint,
    due_date        date,
    status          payment_milestone_status,
    paid_cents      bigint,
    paid_on         date,
    paid_reference  text,
    pay_site        text
)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
    SELECT t.title,
           coalesce(cl.preferred_name, cl.first_name) || ' ' || cl.last_name,
           m.label,
           m.kind,
           m.amount_cents,
           m.due_date,
           m.status,
           m.paid_cents,
           (m.paid_at AT TIME ZONE r.time_zone)::date,
           m.paid_reference,
           CASE WHEN m.pay_url IS NOT NULL THEN public.pay_url_host(m.pay_url) END
      FROM public.report_agent_today(p_agent_id) r
      JOIN public.trip t
        ON t.agent_id = r.agent_id
       AND t.archived_at IS NULL
      -- Both owners: nothing in the schema makes a trip's advisor and its client's agree, and a
      -- reassigned trip must not carry another book's client name into this file.
      JOIN public.client cl ON cl.id = t.client_id AND cl.agent_id = r.agent_id
      JOIN public.payment_milestone m ON m.trip_id = t.id
     WHERE m.due_date BETWEEN p_from AND p_to
     ORDER BY m.due_date, t.title, m.order_index, m.id;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Clients
-- ─────────────────────────────────────────────────────────────────────────────
--
-- EVERY client of the advisor (merged-away records are not clients), with their committed
-- trips and lifetime value, Client Detail's own figure, and the day each was added. Contact
-- details are NULL unless p_include_contact: the switch lives HERE, not in the file writer, so
-- a file without them cannot carry them by mistake.

CREATE OR REPLACE FUNCTION public.report_export_clients(
    p_agent_id        uuid,
    p_include_contact boolean
)
RETURNS TABLE (
    client_name     text,
    status          client_status,
    added_on        date,
    trip_count      integer,
    value_cents     bigint,
    email           text,
    phone           text,
    address_line1   text,
    address_line2   text,
    city            text,
    region          text,
    postal_code     text,
    country         text
)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
    SELECT coalesce(c.preferred_name, c.first_name) || ' ' || c.last_name,
           c.status,
           (c.created_at AT TIME ZONE r.time_zone)::date,
           coalesce(v.n, 0)::integer,
           coalesce(v.cents, 0)::bigint,
           CASE WHEN p_include_contact THEN c.email::text END,
           CASE WHEN p_include_contact THEN c.phone END,
           CASE WHEN p_include_contact THEN a.line1 END,
           CASE WHEN p_include_contact THEN a.line2 END,
           CASE WHEN p_include_contact THEN a.city END,
           CASE WHEN p_include_contact THEN a.region END,
           CASE WHEN p_include_contact THEN a.postal_code END,
           CASE WHEN p_include_contact THEN a.country::text END
      FROM public.report_agent_today(p_agent_id) r
      JOIN public.client c
        ON c.agent_id = r.agent_id
       AND c.status <> 'merged_into'
      LEFT JOIN public.address a ON a.id = c.mailing_address_id
      LEFT JOIN LATERAL (
            SELECT count(*) AS n, sum(t.total_value_cents) AS cents
              FROM public.trip t
             WHERE t.client_id = c.id
               AND t.agent_id = r.agent_id
               AND t.archived_at IS NULL
               AND t.status IN ('booked', 'in_progress', 'completed')
           ) v ON true
     ORDER BY c.last_name, c.first_name, c.id;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. The file door (service role, audited)
-- ─────────────────────────────────────────────────────────────────────────────
--
-- trips | milestones | clients. The ledger type goes through agent_export_commission, which
-- already writes its own `commission.exported` row; the Edge Function calls it directly.
-- Returns {from, to, today, rows}; NULL for an unknown or archived advisor.

CREATE OR REPLACE FUNCTION public.agent_export_center(
    p_agent_id        uuid,
    p_actor_user_id   uuid,
    p_type            text,
    p_from            date,
    p_to              date,
    p_include_contact boolean,
    p_audit_id        uuid,
    p_ip              text,
    p_user_agent      text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_today date;
    v_rows  jsonb;
    v_contact boolean := coalesce(p_include_contact, false);
BEGIN
    SELECT r.today INTO v_today FROM public.report_agent_today(p_agent_id) r;
    IF v_today IS NULL THEN
        RETURN NULL;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.platform_user pu
                    WHERE pu.id = p_actor_user_id AND pu.agent_id = p_agent_id) THEN
        RAISE EXCEPTION 'export actor is not this advisor' USING ERRCODE = '42501';
    END IF;

    -- Clients is the whole list: no range, and one sent is refused rather than ignored.
    IF p_type = 'clients' THEN
        IF p_from IS NOT NULL OR p_to IS NOT NULL THEN
            RAISE EXCEPTION 'the Clients export is the whole list and takes no dates' USING ERRCODE = '22023';
        END IF;
    ELSE
        PERFORM public.report_check_range(p_from, p_to);
    END IF;

    -- Contact details belong to the Clients file alone. Asked for on any other type, it is a
    -- caller that has the switch wired wrong: refused, not quietly dropped.
    IF v_contact AND p_type <> 'clients' THEN
        RAISE EXCEPTION 'contact details are only for the Clients export' USING ERRCODE = '22023';
    END IF;

    IF p_type = 'trips' THEN
        SELECT coalesce(jsonb_agg(jsonb_build_object(
                   'trip_title',       x.trip_title,
                   'client_name',      x.client_name,
                   'status',           x.status,
                   'start_date',       x.start_date,
                   'end_date',         x.end_date,
                   'destinations',     x.destinations,
                   'value_cents',      x.value_cents::text,
                   'commission_cents', x.commission_cents::text,
                   'paid_cents',       x.paid_cents::text,
                   'first_booked_on',  x.first_booked_on,
                   'created_on',       x.created_on) ORDER BY x.o), '[]'::jsonb)
          INTO v_rows
          FROM public.report_export_trips(p_agent_id, p_from, p_to) WITH ORDINALITY
               AS x(trip_title, client_name, status, start_date, end_date, destinations,
                    value_cents, commission_cents, paid_cents, first_booked_on, created_on, o);
    ELSIF p_type = 'milestones' THEN
        SELECT coalesce(jsonb_agg(jsonb_build_object(
                   'trip_title',     x.trip_title,
                   'client_name',    x.client_name,
                   'label',          x.label,
                   'kind',           x.kind,
                   'amount_cents',   x.amount_cents::text,
                   'due_date',       x.due_date,
                   'status',         x.status,
                   'paid_cents',     x.paid_cents::text,
                   'paid_on',        x.paid_on,
                   'paid_reference', x.paid_reference,
                   'pay_site',       x.pay_site) ORDER BY x.o), '[]'::jsonb)
          INTO v_rows
          FROM public.report_export_milestones(p_agent_id, p_from, p_to) WITH ORDINALITY
               AS x(trip_title, client_name, label, kind, amount_cents, due_date, status,
                    paid_cents, paid_on, paid_reference, pay_site, o);
    ELSIF p_type = 'clients' THEN
        SELECT coalesce(jsonb_agg(jsonb_build_object(
                   'client_name',   x.client_name,
                   'status',        x.status,
                   'added_on',      x.added_on,
                   'trip_count',    x.trip_count,
                   'value_cents',   x.value_cents::text,
                   'email',         x.email,
                   'phone',         x.phone,
                   'address_line1', x.address_line1,
                   'address_line2', x.address_line2,
                   'city',          x.city,
                   'region',        x.region,
                   'postal_code',   x.postal_code,
                   'country',       x.country) ORDER BY x.o), '[]'::jsonb)
          INTO v_rows
          FROM public.report_export_clients(p_agent_id, v_contact) WITH ORDINALITY
               AS x(client_name, status, added_on, trip_count, value_cents, email, phone,
                    address_line1, address_line2, city, region, postal_code, country, o);
    ELSE
        RAISE EXCEPTION 'unknown export type: %', p_type USING ERRCODE = '22023';
    END IF;

    -- The Export Center's own rows say so (`source`), and whether contact details went out.
    PERFORM public.commission_audit(
        p_audit_id, p_actor_user_id, 'report.exported', 'agent', p_agent_id,
        jsonb_build_object(
            'report',          p_type,
            'source',          'export_center',
            'from',            p_from,
            'to',              p_to,
            'include_contact', v_contact,
            'row_count',       jsonb_array_length(v_rows)),
        p_ip, p_user_agent);

    RETURN jsonb_build_object('from', p_from, 'to', p_to, 'today', v_today, 'rows', v_rows);
END;
$$;

COMMENT ON FUNCTION public.agent_export_center(uuid, uuid, text, date, date, boolean, uuid, text, text) IS
    '§3.11.8 Export Center: trips | milestones over a From/To range, or clients (the whole list). '
    'Contact details only for clients and only when asked. Writes one report.exported audit row '
    '(source export_center) with the type, range, contact switch and row count, then returns '
    '{from, to, today, rows}. Service role only (the agent-report function''s center op).';

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Recent exports, read from the audit rows
-- ─────────────────────────────────────────────────────────────────────────────
--
-- The signed-in advisor's own exports: every report.exported (per-report and Export Center)
-- and commission.exported (the ledger) row whose target is them, newest first. Only what the
-- screen needs to describe one and run it again: the metadata, which never holds client data
-- (ids, dates, counts and switches). Not the ip or user agent.

CREATE OR REPLACE FUNCTION public.agent_export_history(p_limit integer DEFAULT 20)
RETURNS TABLE (
    audit_id      uuid,
    event_type    text,
    created_at    timestamptz,
    -- The same moment on the advisor's own clock, for "Oct 21, 3:04 PM".
    created_local timestamp,
    metadata      jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT e.id, e.event_type, e.created_at, e.created_at AT TIME ZONE r.time_zone, e.metadata
      FROM public.report_agent_today(public.current_agent_id()) r
      JOIN public.audit_event e
        ON e.target_entity = 'agent'
       AND e.target_id = r.agent_id
     WHERE true
       AND e.event_type IN ('report.exported', 'commission.exported')
     ORDER BY e.created_at DESC, e.id DESC
     LIMIT least(greatest(coalesce(p_limit, 20), 1), 50);
$$;

COMMENT ON FUNCTION public.agent_export_history(integer) IS
    '§3.11.8''s Recent exports for the signed-in advisor, read from audit_event (report.exported '
    'and commission.exported targeting them), newest first, at most 50. No ip or user agent.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Grants
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE f text;
BEGIN
    FOREACH f IN ARRAY ARRAY[
        'public.report_check_range(date, date)',
        'public.report_export_trips(uuid, date, date)',
        'public.report_export_milestones(uuid, date, date)',
        'public.report_export_clients(uuid, boolean)',
        'public.agent_export_center(uuid, uuid, text, date, date, boolean, uuid, text, text)'
    ] LOOP
        EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM public, anon, authenticated', f);
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f);
    END LOOP;

    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.agent_export_history(integer) FROM public, anon';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.agent_export_history(integer) TO authenticated, service_role';
END $$;

COMMIT;
