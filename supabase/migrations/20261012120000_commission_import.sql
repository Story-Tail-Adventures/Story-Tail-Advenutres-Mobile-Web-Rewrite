-- §3.7 Stage 3: 3.7.5 import an Inteletravel statement, 3.7.6 reconcile it against the ledger.
--
-- ── WHAT GYASI RULED (2026-10-11) ───────────────────────────────────────────────────────
--
--   * CSV ONLY. Inteletravel gives a CSV download; no spreadsheet parser (a new parsing
--     library would need a security review first).
--   * A ROW THAT MATCHES A LINE ALREADY RECEIVED OR DISPUTED NEVER CHANGES IT. The row is
--     shown as already recorded, and any difference is flagged for the advisor to fix by hand.
--     This is also why there is no MFA step-up here: Data-Model §18.4 requires one for "an
--     import that affects already-marked-received commissions", and this one cannot. If an
--     import is ever allowed to update a paid line, the step-up comes back with it.
--   * ONE STATEMENT ROW PER BOOKING. A second row for a booking already matched in the same
--     file is flagged as a duplicate, never added to the first.
--   * AN UNMATCHED ROW CAN BECOME A NEW LINE: the advisor picks the trip, and reconciling
--     creates the line already paid, filled in from the row.
--
-- ── NOTHING TOUCHES THE LEDGER UNTIL "MARK AS RECONCILED" ────────────────────────────────
--
-- Upload stores the file and its rows. Mapping reads amounts and dates out of the rows and
-- runs the matcher. Each Resolve decision changes one row. None of those writes `commission`.
-- Reconcile then applies every decision in ONE transaction, writing one audit row per ledger
-- line it pays or creates and one for the statement, through Stage 2's `commission_audit()`:
-- if any of them fails, nothing lands. That is the property that lets an advisor upload the
-- wrong file, map it wrong, or change their mind on a row without any of it reaching a total.
--
-- ── WHERE THE PARSING HAPPENS ────────────────────────────────────────────────────────────
--
-- In the Edge Function (`_shared/statement.ts`), not here: reading "$1,234.56", "(12.00)" and
-- "4/15/26" is string work TypeScript does with tests beside it. What SQL receives is already
-- typed (cents, dates, or a parse_error sentence), and SQL defends the invariants again —
-- a readable row has an amount above $0 and a paid-on date that is not in the advisor's future.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Types
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TYPE public.commission_import_status AS ENUM ('mapping', 'review', 'reconciled', 'discarded');

COMMENT ON TYPE public.commission_import_status IS
    'An imported statement''s life: uploaded and waiting for its column map (mapping), rows '
    'read and matched (review), applied to the ledger (reconciled), or thrown away before '
    'that (discarded). Only mapping and review can change.';

CREATE TYPE public.commission_import_row_state AS ENUM (
    'confirmed', 'suggested', 'unmatched', 'duplicate', 'unreadable',
    'already_recorded', 'to_create', 'ignored'
);

COMMENT ON TYPE public.commission_import_row_state IS
    'Where one statement row stands. confirmed pays its line on reconcile; suggested needs '
    'the advisor to confirm; unmatched, duplicate and unreadable need a decision; '
    'already_recorded matched a line that is already paid and never changes it; to_create '
    'makes a new line on reconcile; ignored is set aside. Reconcile refuses while any row is '
    'suggested, unmatched, duplicate or unreadable.';

CREATE TYPE public.commission_match_basis AS ENUM (
    'reference', 'confirmation', 'supplier_and_traveler', 'manual', 'none'
);

COMMENT ON TYPE public.commission_match_basis IS
    'How a statement row found its line: the reference was already on the line, the reference '
    'is a booking''s supplier confirmation number, the supplier and traveler and amount agree '
    '(a suggestion only), the advisor picked it, or nothing.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. commission_import grows what an import screen needs
-- ─────────────────────────────────────────────────────────────────────────────

-- The table has had no producer since 20260514120000 and production holds no rows
-- (checked 2026-10-11). The NOT NULL columns below would fail loudly on a row they cannot
-- fill, which is the right outcome if that ever stops being true.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM public.commission_import) THEN
        RAISE EXCEPTION 'commission_import has rows; this migration assumes it never had a producer';
    END IF;
END $$;

ALTER TABLE public.commission_import
    ADD COLUMN agent_id        uuid NOT NULL REFERENCES public.agent(id),
    ADD COLUMN checksum_sha256 bytea NOT NULL,
    ADD COLUMN headers         text[] NOT NULL DEFAULT '{}',
    ADD COLUMN column_map      jsonb NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN statement_date  date,
    ADD COLUMN status          public.commission_import_status NOT NULL DEFAULT 'mapping',
    ADD COLUMN version         integer NOT NULL DEFAULT 1,
    ADD COLUMN reconciled_at   timestamptz,
    ADD COLUMN updated_at      timestamptz NOT NULL DEFAULT now(),
    ALTER COLUMN document_id SET NOT NULL;

ALTER TABLE public.commission_import
    ADD CONSTRAINT commission_import_rows_range CHECK (total_rows BETWEEN 1 AND 1000),
    ADD CONSTRAINT commission_import_counts CHECK (
        matched_rows >= 0 AND unmatched_rows >= 0 AND matched_rows + unmatched_rows = total_rows),
    ADD CONSTRAINT commission_import_version_positive CHECK (version >= 1),
    ADD CONSTRAINT commission_import_reconciled_has_date CHECK (
        (status = 'reconciled') = (reconciled_at IS NOT NULL)),
    ADD CONSTRAINT commission_import_period_order CHECK (
        period_start IS NULL OR period_end IS NULL OR period_start <= period_end),
    ADD CONSTRAINT commission_import_map_is_object CHECK (jsonb_typeof(column_map) = 'object');

-- The same file twice is the same statement twice. A discarded import frees its file so the
-- advisor can upload it again and map it differently.
CREATE UNIQUE INDEX commission_import_file_once
    ON public.commission_import (agent_id, checksum_sha256)
    WHERE status <> 'discarded';

CREATE INDEX commission_import_agent_recent
    ON public.commission_import (agent_id, created_at DESC);

COMMENT ON TABLE public.commission_import IS
    'One uploaded Inteletravel statement (§3.7.5) and where it stands. Its rows are in '
    'commission_import_row; the ledger changes only when it is reconciled (§3.7.6).';
COMMENT ON COLUMN public.commission_import.column_map IS
    'Platform field -> header index, e.g. {"reference": 0, "received": 3}. Guessed at upload '
    'from the advisor''s last statement, then from header names; confirmed on the map screen.';
COMMENT ON COLUMN public.commission_import.statement_date IS
    'The paid-on date for every row when no column carries one.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. commission_import_row: one line of the statement, and what to do with it
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.commission_import_row (
    id                      uuid PRIMARY KEY,
    import_id               uuid NOT NULL REFERENCES public.commission_import(id),
    row_number              integer NOT NULL,
    cells                   text[] NOT NULL,
    reference               text,
    supplier_text           text,
    traveler_text           text,
    gross_cents             bigint,
    received_cents          bigint,
    fee_cents               bigint,
    paid_on                 date,
    currency                char(3) NOT NULL DEFAULT 'USD',
    parse_error             text,
    state                   public.commission_import_row_state NOT NULL DEFAULT 'unmatched',
    match_basis             public.commission_match_basis NOT NULL DEFAULT 'none',
    suggested_commission_id uuid REFERENCES public.commission(id),
    commission_id           uuid REFERENCES public.commission(id),
    new_trip_id             uuid REFERENCES public.trip(id),
    new_supplier_id         uuid REFERENCES public.supplier(id),
    new_gross_cents         bigint,
    new_commission_pct      numeric(5,2),
    new_commission_id       uuid,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT commission_import_row_number_positive CHECK (row_number >= 1),
    -- 0 to $99,999,999.99, the cap hand entry has (`_shared/component.ts`): a wrongly mapped
    -- column must not read as $90 trillion.
    CONSTRAINT commission_import_row_amounts_range CHECK (
        coalesce(gross_cents, 0) BETWEEN 0 AND 9999999999
        AND coalesce(received_cents, 0) BETWEEN 0 AND 9999999999
        AND coalesce(fee_cents, 0) BETWEEN 0 AND 9999999999
        AND coalesce(new_gross_cents, 0) BETWEEN 0 AND 9999999999),
    CONSTRAINT commission_import_row_pct_range CHECK (
        new_commission_pct IS NULL OR new_commission_pct BETWEEN 0 AND 100),
    -- A row the screen calls readable can be applied: it has money and a date.
    CONSTRAINT commission_import_row_readable CHECK (
        parse_error IS NOT NULL OR received_cents IS NULL
        OR (received_cents > 0 AND paid_on IS NOT NULL)),
    -- An unreadable row says why; a row that could not be read can only be set aside.
    CONSTRAINT commission_import_row_unreadable_says_why CHECK (
        (state <> 'unreadable' OR parse_error IS NOT NULL)
        AND (parse_error IS NULL OR state IN ('unreadable', 'ignored'))),
    CONSTRAINT commission_import_row_line_when_matched CHECK (
        state NOT IN ('confirmed', 'already_recorded') OR commission_id IS NOT NULL),
    CONSTRAINT commission_import_row_create_complete CHECK (
        state <> 'to_create'
        OR (new_trip_id IS NOT NULL AND new_supplier_id IS NOT NULL AND new_gross_cents IS NOT NULL
            AND new_commission_pct IS NOT NULL AND new_commission_id IS NOT NULL))
);

CREATE UNIQUE INDEX commission_import_row_order ON public.commission_import_row (import_id, row_number);

-- Two rows can never both pay one line.
CREATE UNIQUE INDEX commission_import_row_one_payer
    ON public.commission_import_row (import_id, commission_id)
    WHERE state = 'confirmed';

CREATE INDEX commission_import_row_line ON public.commission_import_row (commission_id)
    WHERE commission_id IS NOT NULL;

COMMENT ON TABLE public.commission_import_row IS
    'One row of an imported statement: the cells as the file had them, the amounts and dates '
    'read from them, the line the matcher found, and the advisor''s decision. Cells and '
    'traveler_text carry traveler names. Service-role only; read through the §3.7.6 accessors.';

ALTER TABLE public.commission_import_row ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.commission_import_row FROM anon, authenticated;
-- Restated: the lockdown revoked it once (20260919120000), and a new column must not make
-- anyone wonder.
REVOKE ALL ON public.commission_import FROM anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. The private bucket the original files live in
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Not `trip-documents`: a statement belongs to no trip and names every client on it. No
-- storage.objects policy for any client role, as with trip-documents: only the Edge Function
-- (service role) writes the file, and nothing reads it back yet.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('commission-statements', 'commission-statements', false, 524288, ARRAY['text/csv'])
ON CONFLICT (id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Helpers (no grants; reached only from inside the definer functions)
-- ─────────────────────────────────────────────────────────────────────────────

-- A reference as a key: no spaces, upper case. "srb 220119" and "SRB220119" are one booking.
CREATE OR REPLACE FUNCTION public.commission_ref_key(p_text text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
    SELECT nullif(upper(regexp_replace(coalesce(p_text, ''), '\s', '', 'g')), '');
$$;

-- The matcher looks lines and bookings up by this key once per statement row. Unindexed,
-- a large book (2,500 lines, 10,000 components) made a 1,000-row map take 18 seconds and
-- hit the statement timeout; with these, 0.3 seconds (measured in review).
--
-- EXECUTE STAYS WITH THE WRITING ROLES (authenticated, service_role), unlike the other two
-- helpers: an index expression is evaluated as whoever writes the row, and every role that
-- writes `commission` or `trip_component` must be able to run it. It upper-cases and strips
-- spaces; there is nothing in it to guard. `anon` writes neither table and gets nothing
-- (rls_agent_domain.sql asserts anon can execute no function of ours).
CREATE INDEX commission_ref_key_lookup
    ON public.commission (agent_id, public.commission_ref_key(inteletravel_reference))
    WHERE archived_at IS NULL;
CREATE INDEX trip_component_confirmation_key
    ON public.trip_component (public.commission_ref_key(confirmation_number))
    WHERE archived_at IS NULL;

-- Words for matching: accents folded (as cruise search does), lower case, every run of
-- non-letters one space, and a space either side so `position()` matches whole words only —
-- "Ray" inside " ray smith " but not inside " murray ".
CREATE OR REPLACE FUNCTION public.commission_fold(p_text text)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
    SELECT ' ' || btrim(regexp_replace(
               lower(extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(p_text, ''))),
               '[^a-z0-9]+', ' ', 'g')) || ' ';
$$;

-- The matcher. Runs over every row of one import, in file order, strongest evidence first.
-- Called by the map write (and so again on every remap); resets every row's decision.
CREATE OR REPLACE FUNCTION public.commission_import_match(p_import_id uuid, p_agent_id uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
    r         record;
    v_line    uuid;
    v_basis   public.commission_match_basis;
    v_n       integer;
    v_status  public.commission_status;
    v_ref     text;
    v_seen    text[] := '{}';
    v_claimed uuid[] := '{}';
    v_state   public.commission_import_row_state;
    v_weak    boolean;
BEGIN
    FOR r IN SELECT * FROM public.commission_import_row
              WHERE import_id = p_import_id ORDER BY row_number
    LOOP
        v_line := NULL;
        v_basis := 'none';
        v_weak := false;
        v_ref := public.commission_ref_key(r.reference);
        -- "1" or "A2" is a row number, not a booking: too short to match or to call a duplicate.
        IF length(v_ref) < 4 THEN
            v_ref := NULL;
        END IF;

        IF r.parse_error IS NOT NULL THEN
            UPDATE public.commission_import_row
               SET state = 'unreadable', match_basis = 'none', suggested_commission_id = NULL,
                   commission_id = NULL, new_trip_id = NULL, new_supplier_id = NULL,
                   new_gross_cents = NULL, new_commission_pct = NULL, new_commission_id = NULL,
                   updated_at = now()
             WHERE id = r.id;
            CONTINUE;
        END IF;

        -- 1. The reference is already on a line (the natural key, Data-Model §10.1). Any
        --    status: a paid line found this way becomes "already recorded" below.
        IF v_ref IS NOT NULL THEN
            SELECT c.id INTO v_line
              FROM public.commission c
              JOIN public.trip t ON t.id = c.trip_id
             WHERE c.agent_id = p_agent_id AND t.agent_id = p_agent_id
               AND c.archived_at IS NULL
               AND public.commission_ref_key(c.inteletravel_reference) = v_ref
             ORDER BY c.id
             LIMIT 1;
            IF v_line IS NOT NULL THEN
                v_basis := 'reference';
            END IF;
        END IF;

        -- 2. The reference is a booking's supplier confirmation number, and exactly one line
        --    pays that booking: the component's own line, or the trip's line for its supplier.
        --    A line already carrying a DIFFERENT reference belongs to another statement row.
        IF v_line IS NULL AND v_ref IS NOT NULL THEN
            SELECT count(DISTINCT c.id), (array_agg(DISTINCT c.id))[1] INTO v_n, v_line
              FROM public.trip_component tc
              JOIN public.trip t       ON t.id = tc.trip_id
              JOIN public.commission c ON c.trip_id = t.id
                   AND (c.component_id = tc.id
                        OR (c.component_id IS NULL AND c.supplier_id = tc.supplier_id))
             WHERE t.agent_id = p_agent_id AND c.agent_id = p_agent_id
               AND tc.archived_at IS NULL AND c.archived_at IS NULL
               AND public.commission_ref_key(tc.confirmation_number) = v_ref
               AND (c.inteletravel_reference IS NULL
                    OR public.commission_ref_key(c.inteletravel_reference) = v_ref);
            IF v_n = 1 THEN
                v_basis := 'confirmation';
                -- A confirmation number is short and reused across suppliers. When the row
                -- names a supplier that is not the line's, it is a suggestion, never a match:
                -- review found a $2 row from another supplier confirmed onto a $1,212 line.
                IF length(btrim(public.commission_fold(r.supplier_text))) > 2 AND NOT EXISTS (
                    SELECT 1 FROM public.commission c JOIN public.supplier s ON s.id = c.supplier_id
                     WHERE c.id = v_line
                       AND length(btrim(public.commission_fold(s.name))) > 2
                       AND (position(public.commission_fold(s.name) IN public.commission_fold(r.supplier_text)) > 0
                            OR position(public.commission_fold(r.supplier_text) IN public.commission_fold(s.name)) > 0)) THEN
                    v_weak := true;
                END IF;
            ELSE
                v_line := NULL;  -- none, or several: the advisor picks.
            END IF;
        END IF;

        -- 3. A SUGGESTION, never applied without the advisor: one unpaid line whose supplier
        --    and traveler's last name both appear in the row, and whose expected amount is
        --    within a quarter of what the row paid (fee included). A 14%-not-15% shortfall is
        --    close enough to suggest; a different booking with the same family usually is not.
        IF v_line IS NULL
           AND length(btrim(public.commission_fold(r.supplier_text))) > 2
           AND length(btrim(public.commission_fold(r.traveler_text))) > 1 THEN
            SELECT count(*), (array_agg(c.id ORDER BY c.id))[1] INTO v_n, v_line
              FROM public.commission c
              JOIN public.trip t     ON t.id = c.trip_id
              JOIN public.client cl  ON cl.id = t.client_id
              JOIN public.supplier s ON s.id = c.supplier_id
             WHERE c.agent_id = p_agent_id AND t.agent_id = p_agent_id
               AND c.archived_at IS NULL
               AND c.status IN ('expected', 'invoiced')
               AND (c.inteletravel_reference IS NULL OR v_ref IS NULL)
               AND NOT (c.id = ANY (v_claimed))
               AND length(btrim(public.commission_fold(s.name))) > 2
               AND (position(public.commission_fold(s.name) IN public.commission_fold(r.supplier_text)) > 0
                    OR position(public.commission_fold(r.supplier_text) IN public.commission_fold(s.name)) > 0)
               AND length(btrim(public.commission_fold(cl.last_name))) > 1
               AND position(public.commission_fold(cl.last_name) IN public.commission_fold(r.traveler_text)) > 0
               AND c.expected_commission_cents > 0
               AND abs(r.received_cents + coalesce(r.fee_cents, 0) - c.expected_commission_cents) * 4
                   <= c.expected_commission_cents;
            IF v_n = 1 THEN
                v_basis := 'supplier_and_traveler';
            ELSE
                v_line := NULL;
            END IF;
        END IF;

        -- One row per booking (Gyasi, 2026-10-11): a reference seen earlier in this file, or a
        -- line an earlier row already took, is a duplicate — flagged, never summed.
        IF (v_ref IS NOT NULL AND v_ref = ANY (v_seen))
           OR (v_line IS NOT NULL AND v_line = ANY (v_claimed)) THEN
            v_state := 'duplicate';
        ELSIF v_line IS NULL THEN
            v_state := 'unmatched';
        ELSE
            SELECT c.status INTO v_status FROM public.commission c WHERE c.id = v_line;
            IF v_status IN ('received', 'disputed') THEN
                v_state := 'already_recorded';
            ELSIF v_basis IN ('reference', 'confirmation') AND NOT v_weak THEN
                v_state := 'confirmed';
            ELSE
                v_state := 'suggested';
            END IF;
            v_claimed := v_claimed || v_line;
        END IF;
        IF v_ref IS NOT NULL THEN
            v_seen := v_seen || v_ref;
        END IF;

        UPDATE public.commission_import_row
           SET state = v_state,
               match_basis = v_basis,
               suggested_commission_id = v_line,
               commission_id = CASE WHEN v_state IN ('confirmed', 'already_recorded') THEN v_line END,
               new_trip_id = NULL, new_supplier_id = NULL, new_gross_cents = NULL,
               new_commission_pct = NULL, new_commission_id = NULL,
               updated_at = now()
         WHERE id = r.id;
    END LOOP;
END;
$$;

COMMENT ON FUNCTION public.commission_import_match(uuid, uuid) IS
    'Matches every row of one import to the agent''s ledger: reference already on a line, then '
    'a supplier confirmation number, then (as a suggestion only) supplier + traveler + a close '
    'amount. Flags a second row for one booking as a duplicate. Resets every decision.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Reads (definer, for the signed-in advisor)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.agent_commission_imports()
RETURNS TABLE (
    import_id         uuid,
    original_filename text,
    status            commission_import_status,
    total_rows        integer,
    matched_rows      integer,
    unmatched_rows    integer,
    period_start      date,
    period_end        date,
    created_at        timestamptz,
    -- The advisor's calendar date: the UTC date of an evening upload in the US is tomorrow's.
    created_on        date,
    reconciled_at     timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT i.id, i.original_filename, i.status, i.total_rows, i.matched_rows, i.unmatched_rows,
           i.period_start, i.period_end, i.created_at,
           (i.created_at AT TIME ZONE a.time_zone)::date,
           i.reconciled_at
      FROM public.commission_import i
      JOIN public.agent a ON a.id = i.agent_id
     WHERE i.agent_id = public.current_agent_id()
       AND i.status <> 'discarded'
     ORDER BY i.created_at DESC, i.id DESC
     LIMIT 50;
$$;

COMMENT ON FUNCTION public.agent_commission_imports() IS
    'Screen 3.7.5''s list of past statements: the caller''s last 50, newest first, discarded '
    'ones left out.';

CREATE OR REPLACE FUNCTION public.agent_commission_import(p_import_id uuid)
RETURNS TABLE (
    import_id              uuid,
    original_filename      text,
    status                 commission_import_status,
    headers                text[],
    column_map             jsonb,
    statement_date         date,
    total_rows             integer,
    period_start           date,
    period_end             date,
    version                integer,
    created_at             timestamptz,
    reconciled_at          timestamptz,
    reconciled_on          date,
    confirmed_count        integer,
    suggested_count        integer,
    unmatched_count        integer,
    duplicate_count        integer,
    unreadable_count       integer,
    already_recorded_count integer,
    to_create_count        integer,
    ignored_count          integer,
    sample_rows            jsonb,
    as_of_date             date
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    WITH me AS (
        SELECT a.id AS agent_id, a.time_zone, (now() AT TIME ZONE a.time_zone)::date AS today
          FROM public.agent a
         WHERE a.id = public.current_agent_id()
    )
    SELECT i.id, i.original_filename, i.status, i.headers, i.column_map, i.statement_date,
           i.total_rows, i.period_start, i.period_end, i.version, i.created_at, i.reconciled_at,
           (i.reconciled_at AT TIME ZONE me.time_zone)::date,
           n.confirmed, n.suggested, n.unmatched, n.duplicate, n.unreadable, n.already,
           n.to_create, n.ignored,
           (SELECT coalesce(jsonb_agg(to_jsonb(x.cells) ORDER BY x.row_number), '[]'::jsonb)
              FROM (SELECT r.cells, r.row_number FROM public.commission_import_row r
                     WHERE r.import_id = i.id ORDER BY r.row_number LIMIT 3) x),
           me.today
      FROM public.commission_import i
      JOIN me ON me.agent_id = i.agent_id
     CROSS JOIN LATERAL (
        SELECT count(*) FILTER (WHERE r.state = 'confirmed')::integer        AS confirmed,
               count(*) FILTER (WHERE r.state = 'suggested')::integer        AS suggested,
               count(*) FILTER (WHERE r.state = 'unmatched')::integer        AS unmatched,
               count(*) FILTER (WHERE r.state = 'duplicate')::integer        AS duplicate,
               count(*) FILTER (WHERE r.state = 'unreadable')::integer       AS unreadable,
               count(*) FILTER (WHERE r.state = 'already_recorded')::integer AS already,
               count(*) FILTER (WHERE r.state = 'to_create')::integer        AS to_create,
               count(*) FILTER (WHERE r.state = 'ignored')::integer          AS ignored
          FROM public.commission_import_row r
         WHERE r.import_id = i.id
     ) n
     WHERE i.id = p_import_id
       AND i.status <> 'discarded';
$$;

COMMENT ON FUNCTION public.agent_commission_import(uuid) IS
    'Screens 3.7.5 / 3.7.6: one of the caller''s statements, its header row and column map, '
    'counts by row state, its first three rows (for the map screen), and the version for the '
    'optimistic lock. No row for anyone else''s, or a discarded one.';

CREATE OR REPLACE FUNCTION public.agent_commission_import_rows(p_import_id uuid)
RETURNS TABLE (
    row_id               uuid,
    row_number           integer,
    state                commission_import_row_state,
    match_basis          commission_match_basis,
    reference            text,
    supplier_text        text,
    traveler_text        text,
    gross_cents          text,
    received_cents       text,
    fee_cents            text,
    paid_on              date,
    currency             char(3),
    parse_error          text,
    line_id              uuid,
    line_trip_id         uuid,
    line_trip_title      text,
    line_client_name     text,
    line_supplier_name   text,
    line_status          commission_status,
    line_gross_cents     text,
    line_commission_pct  numeric,
    line_expected_cents  text,
    line_fee_cents       text,
    line_received_cents  text,
    line_received_at     date,
    new_trip_id          uuid,
    new_trip_title       text,
    new_supplier_id      uuid,
    new_supplier_name    text,
    new_gross_cents      text,
    new_commission_pct   numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    -- At most 1,000 rows (commission_import_rows_range), so PostgREST's max_rows (1000) never
    -- cuts this short. Raise the cap and this must become a jsonb array, as the export did.
    SELECT r.id, r.row_number, r.state, r.match_basis, r.reference, r.supplier_text,
           r.traveler_text, r.gross_cents::text, r.received_cents::text, r.fee_cents::text,
           r.paid_on, r.currency, r.parse_error,
           c.id, c.trip_id, t.title,
           coalesce(cl.preferred_name, cl.first_name) || ' ' || cl.last_name,
           s.name, c.status, c.gross_booking_cents::text, c.commission_pct,
           c.expected_commission_cents::text, c.processing_fee_cents::text,
           c.received_commission_cents::text, c.received_at,
           r.new_trip_id, nt.title, r.new_supplier_id, ns.name, r.new_gross_cents::text,
           r.new_commission_pct
      FROM public.commission_import i
      JOIN public.commission_import_row r ON r.import_id = i.id
      -- The line it pays, or the one the matcher suggested — the caller's own lines only.
      LEFT JOIN public.commission c
             ON c.id = coalesce(r.commission_id, r.suggested_commission_id)
            AND c.agent_id = i.agent_id
            AND c.archived_at IS NULL
            AND EXISTS (SELECT 1 FROM public.trip tt WHERE tt.id = c.trip_id AND tt.agent_id = i.agent_id)
      LEFT JOIN public.trip t      ON t.id = c.trip_id
      LEFT JOIN public.client cl   ON cl.id = t.client_id
      LEFT JOIN public.supplier s  ON s.id = c.supplier_id
      LEFT JOIN public.trip nt     ON nt.id = r.new_trip_id AND nt.agent_id = i.agent_id
      LEFT JOIN public.supplier ns ON ns.id = r.new_supplier_id
     WHERE i.id = p_import_id
       AND i.agent_id = public.current_agent_id()
       AND i.status <> 'discarded'
     ORDER BY r.row_number;
$$;

COMMENT ON FUNCTION public.agent_commission_import_rows(uuid) IS
    'Screen 3.7.6: every row of one of the caller''s statements, beside the ledger line it pays '
    'or was suggested, and what the advisor chose to create. File order.';

CREATE OR REPLACE FUNCTION public.agent_commission_import_candidates(p_import_id uuid, p_row_id uuid)
RETURNS TABLE (
    commission_id       uuid,
    trip_id             uuid,
    trip_title          text,
    client_name         text,
    supplier_name       text,
    status              commission_status,
    start_date          date,
    gross_booking_cents text,
    commission_pct      numeric,
    expected_cents      text,
    supplier_matches    boolean,
    traveler_matches    boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    WITH target AS (
        SELECT r.*
          FROM public.commission_import_row r
          JOIN public.commission_import i ON i.id = r.import_id
         WHERE r.id = p_row_id
           AND i.id = p_import_id
           AND i.agent_id = public.current_agent_id()
           AND i.status = 'review'
    )
    SELECT c.id, c.trip_id, t.title,
           coalesce(cl.preferred_name, cl.first_name) || ' ' || cl.last_name,
           s.name, c.status, t.start_date, c.gross_booking_cents::text, c.commission_pct,
           c.expected_commission_cents::text,
           x.supplier_matches, x.traveler_matches
      FROM target
     CROSS JOIN public.commission_lines_for_current_agent() c
      JOIN public.trip t     ON t.id = c.trip_id
      JOIN public.client cl  ON cl.id = t.client_id
      JOIN public.supplier s ON s.id = c.supplier_id
     CROSS JOIN LATERAL (
        SELECT length(btrim(public.commission_fold(target.supplier_text))) > 2
               AND (position(public.commission_fold(s.name) IN public.commission_fold(target.supplier_text)) > 0
                    OR position(public.commission_fold(target.supplier_text) IN public.commission_fold(s.name)) > 0)
                   AS supplier_matches,
               length(btrim(public.commission_fold(cl.last_name))) > 1
               AND position(public.commission_fold(cl.last_name) IN public.commission_fold(target.traveler_text)) > 0
                   AS traveler_matches
     ) x
     -- Lines a statement row may pay: not paid yet, not already taken by another row of this
     -- statement, and not carrying a different reference.
     WHERE c.status IN ('expected', 'invoiced', 'lost')
       AND NOT EXISTS (
            SELECT 1 FROM public.commission_import_row o
             WHERE o.import_id = target.import_id AND o.id <> target.id
               AND o.state = 'confirmed' AND o.commission_id = c.id)
       AND (c.inteletravel_reference IS NULL OR target.reference IS NULL
            OR public.commission_ref_key(c.inteletravel_reference) = public.commission_ref_key(target.reference))
     ORDER BY x.supplier_matches DESC, x.traveler_matches DESC,
              abs(c.expected_commission_cents - coalesce(target.received_cents, 0) - coalesce(target.fee_cents, 0)),
              t.start_date DESC NULLS LAST, c.id
     LIMIT 25;
$$;

COMMENT ON FUNCTION public.agent_commission_import_candidates(uuid, uuid) IS
    'Screen 3.7.6''s "match to a different line": up to 25 of the caller''s unpaid lines a row '
    'could pay, same supplier and traveler first, then closest amount.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Upload — the file and its rows, nothing read from them yet
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.agent_upload_commission_statement(
    p_agent_id      uuid,
    p_actor_user_id uuid,
    p_import_id     uuid,
    p_document_id   uuid,
    p_filename      text,
    p_size_bytes    bigint,
    p_checksum      bytea,
    p_storage_key   text,
    p_headers       text[],
    p_column_map    jsonb,
    p_rows          jsonb,
    p_audit_id      uuid,
    p_ip            text,
    p_user_agent    text
)
RETURNS TABLE (outcome text, import_id uuid, uploaded_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
    v_existing record;
    v_count    integer;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.agent a
                    WHERE a.id = p_agent_id AND a.status <> 'archived') THEN
        RETURN;
    END IF;

    SELECT i.id, i.created_at INTO v_existing
      FROM public.commission_import i
     WHERE i.agent_id = p_agent_id AND i.checksum_sha256 = p_checksum
       AND i.status <> 'discarded';
    IF FOUND THEN
        RETURN QUERY SELECT 'duplicate_file'::text, v_existing.id, v_existing.created_at;
        RETURN;
    END IF;

    v_count := jsonb_array_length(p_rows);
    IF v_count < 1 OR v_count > 1000 THEN
        RAISE EXCEPTION 'a statement has 1 to 1000 rows, not %', v_count;
    END IF;

    BEGIN
        INSERT INTO public.document
            (id, owner_user_id, kind, filename, mime_type, size_bytes, storage_bucket,
             storage_key, checksum_sha256, is_sensitive)
        VALUES
            (p_document_id, p_actor_user_id, 'csv_import', left(p_filename, 255), 'text/csv',
             p_size_bytes, 'commission-statements', p_storage_key, p_checksum, true);

        INSERT INTO public.commission_import
            (id, agent_id, imported_by_user_id, source, original_filename, document_id,
             checksum_sha256, headers, column_map, status, total_rows, matched_rows,
             unmatched_rows)
        VALUES
            (p_import_id, p_agent_id, p_actor_user_id, 'inteletravel_csv', left(p_filename, 255),
             p_document_id, p_checksum, p_headers, coalesce(p_column_map, '{}'::jsonb),
             'mapping', v_count, 0, v_count);
    EXCEPTION WHEN unique_violation THEN
        -- Two uploads of one file racing: the second is the duplicate, not a 500.
        IF SQLERRM LIKE '%commission_import_file_once%' THEN
            SELECT i.id, i.created_at INTO v_existing
              FROM public.commission_import i
             WHERE i.agent_id = p_agent_id AND i.checksum_sha256 = p_checksum
               AND i.status <> 'discarded';
            RETURN QUERY SELECT 'duplicate_file'::text, v_existing.id, v_existing.created_at;
            RETURN;
        END IF;
        RAISE;
    END;

    INSERT INTO public.commission_import_row (id, import_id, row_number, cells)
    SELECT (e.elem ->> 'id')::uuid, p_import_id, e.n::integer,
           ARRAY(SELECT jsonb_array_elements_text(e.elem -> 'cells'))
      FROM jsonb_array_elements(p_rows) WITH ORDINALITY AS e(elem, n);

    PERFORM public.commission_audit(
        p_audit_id, p_actor_user_id, 'commission.statement_uploaded', 'commission_import',
        p_import_id,
        jsonb_build_object(
            'filename', left(p_filename, 255),
            'size_bytes', p_size_bytes,
            'row_count', v_count,
            'checksum_sha256', encode(p_checksum, 'hex')),
        p_ip, p_user_agent);

    RETURN QUERY SELECT 'uploaded'::text, p_import_id, now();
END;
$$;

COMMENT ON FUNCTION public.agent_upload_commission_statement IS
    'Screen 3.7.5 step 1. Records the stored CSV as a document, the import (status mapping, '
    'with a guessed column map) and one row per data line, and audits it, in one transaction. '
    'Outcomes: uploaded | duplicate_file (the same file is already imported and not discarded).';

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. Map — the rows' amounts and dates, then the matcher
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.agent_map_commission_import(
    p_agent_id         uuid,
    p_import_id        uuid,
    p_expected_version integer,
    p_column_map       jsonb,
    p_statement_date   date,
    p_rows             jsonb
)
RETURNS TABLE (outcome text, version integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
    v_import public.commission_import%ROWTYPE;
    v_today  date;
    v_given  integer;
    v_unique integer;
    v_known  integer;
BEGIN
    SELECT (now() AT TIME ZONE a.time_zone)::date INTO v_today
      FROM public.agent a
     WHERE a.id = p_agent_id AND a.status <> 'archived';
    IF NOT FOUND THEN
        RETURN;
    END IF;

    SELECT i.* INTO v_import
      FROM public.commission_import i
     WHERE i.id = p_import_id AND i.agent_id = p_agent_id AND i.status <> 'discarded'
       FOR UPDATE;
    IF NOT FOUND THEN
        RETURN QUERY SELECT 'not_found'::text, NULL::integer;
        RETURN;
    END IF;
    IF p_expected_version IS DISTINCT FROM v_import.version THEN
        RETURN QUERY SELECT 'stale'::text, v_import.version;
        RETURN;
    END IF;
    IF v_import.status NOT IN ('mapping', 'review') THEN
        RETURN QUERY SELECT 'not_open'::text, v_import.version;
        RETURN;
    END IF;

    -- Every row of this import, once, and nothing else.
    SELECT count(*), count(DISTINCT x.id), count(r.id) INTO v_given, v_unique, v_known
      FROM jsonb_to_recordset(p_rows) AS x(id uuid)
      LEFT JOIN public.commission_import_row r ON r.id = x.id AND r.import_id = p_import_id;
    IF v_given <> v_import.total_rows OR v_unique <> v_import.total_rows
       OR v_known <> v_import.total_rows THEN
        RAISE EXCEPTION 'a map must read every row of the statement exactly once';
    END IF;

    UPDATE public.commission_import_row r
       SET reference      = nullif(btrim(x.reference), ''),
           supplier_text  = nullif(btrim(x.supplier), ''),
           traveler_text  = nullif(btrim(x.traveler), ''),
           gross_cents    = x.gross_cents,
           received_cents = x.received_cents,
           fee_cents      = x.fee_cents,
           paid_on        = x.paid_on,
           -- The function read the row; SQL re-checks the two things an applied row needs, in
           -- the advisor's time zone, which only SQL knows.
           parse_error    = CASE
               WHEN x.parse_error IS NOT NULL THEN x.parse_error
               WHEN x.received_cents IS NULL OR x.received_cents <= 0
                   THEN 'No commission amount on this row.'
               WHEN x.paid_on IS NULL THEN 'No paid-on date for this row.'
               WHEN x.paid_on > v_today THEN 'The paid-on date is after today.'
           END,
           -- Keeps the unreadable/parse_error pairing until the matcher sets each row.
           state = CASE
               WHEN x.parse_error IS NOT NULL OR x.received_cents IS NULL OR x.received_cents <= 0
                    OR x.paid_on IS NULL OR x.paid_on > v_today
               THEN 'unreadable'::public.commission_import_row_state
               ELSE 'unmatched'::public.commission_import_row_state END,
           commission_id = NULL,
           updated_at = now()
      FROM jsonb_to_recordset(p_rows) AS x(
               id uuid, reference text, supplier text, traveler text, gross_cents bigint,
               received_cents bigint, fee_cents bigint, paid_on date, parse_error text)
     WHERE r.id = x.id AND r.import_id = p_import_id;

    PERFORM public.commission_import_match(p_import_id, p_agent_id);

    UPDATE public.commission_import i
       SET column_map     = coalesce(p_column_map, '{}'::jsonb),
           statement_date = p_statement_date,
           status         = 'review',
           period_start   = p.lo,
           period_end     = p.hi,
           matched_rows   = p.matched,
           unmatched_rows = i.total_rows - p.matched,
           version        = i.version + 1,
           updated_at     = now()
      FROM (SELECT min(r.paid_on) FILTER (WHERE r.parse_error IS NULL) AS lo,
                   max(r.paid_on) FILTER (WHERE r.parse_error IS NULL) AS hi,
                   count(*) FILTER (WHERE r.state IN ('confirmed', 'suggested', 'already_recorded'))::integer
                       AS matched
              FROM public.commission_import_row r
             WHERE r.import_id = p_import_id) p
     WHERE i.id = p_import_id;

    RETURN QUERY SELECT 'mapped'::text, v_import.version + 1;
END;
$$;

COMMENT ON FUNCTION public.agent_map_commission_import IS
    'Screen 3.7.5 step 2. Stores what the Edge Function read from each row under the chosen '
    'column map, re-checks amount and date (not after the advisor''s today), runs the matcher '
    'and moves the import to review. Re-mapping a statement in review resets every decision. '
    'Changes no ledger line, so writes no audit row. Outcomes: mapped | stale | not_found | '
    'not_open.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. Resolve one row — confirm, match, create, or ignore
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.agent_resolve_commission_import_row(
    p_agent_id          uuid,
    p_import_id         uuid,
    p_expected_version  integer,
    p_row_id            uuid,
    p_action            text,
    p_commission_id     uuid    DEFAULT NULL,
    p_trip_id           uuid    DEFAULT NULL,
    p_supplier_id       uuid    DEFAULT NULL,
    p_gross_cents       bigint  DEFAULT NULL,
    p_commission_pct    numeric DEFAULT NULL,
    p_new_commission_id uuid    DEFAULT NULL
)
RETURNS TABLE (outcome text, version integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
    v_import public.commission_import%ROWTYPE;
    v_row    public.commission_import_row%ROWTYPE;
    v_target uuid;
    v_basis  public.commission_match_basis;
BEGIN
    IF p_action NOT IN ('confirm', 'match', 'create', 'ignore') THEN
        RAISE EXCEPTION 'unknown action %', p_action;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.agent a
                    WHERE a.id = p_agent_id AND a.status <> 'archived') THEN
        RETURN;
    END IF;

    SELECT i.* INTO v_import
      FROM public.commission_import i
     WHERE i.id = p_import_id AND i.agent_id = p_agent_id AND i.status <> 'discarded'
       FOR UPDATE;
    IF NOT FOUND THEN
        RETURN QUERY SELECT 'not_found'::text, NULL::integer;
        RETURN;
    END IF;
    IF p_expected_version IS DISTINCT FROM v_import.version THEN
        RETURN QUERY SELECT 'stale'::text, v_import.version;
        RETURN;
    END IF;
    IF v_import.status <> 'review' THEN
        RETURN QUERY SELECT 'not_open'::text, v_import.version;
        RETURN;
    END IF;

    SELECT r.* INTO v_row
      FROM public.commission_import_row r
     WHERE r.id = p_row_id AND r.import_id = p_import_id
       FOR UPDATE;
    IF NOT FOUND THEN
        RETURN QUERY SELECT 'not_found'::text, v_import.version;
        RETURN;
    END IF;

    -- A row whose line is already paid has nothing to decide: it never changes that line.
    IF v_row.state = 'already_recorded' THEN
        RETURN QUERY SELECT 'not_allowed'::text, v_import.version;
        RETURN;
    END IF;

    IF p_action = 'ignore' THEN
        UPDATE public.commission_import_row
           SET state = 'ignored', commission_id = NULL,
               new_trip_id = NULL, new_supplier_id = NULL, new_gross_cents = NULL,
               new_commission_pct = NULL, new_commission_id = NULL, updated_at = now()
         WHERE id = p_row_id;

    ELSE
        -- Confirm, match and create all put money on a line: the row must have been readable.
        IF v_row.parse_error IS NOT NULL THEN
            RETURN QUERY SELECT 'not_allowed'::text, v_import.version;
            RETURN;
        END IF;

        IF p_action IN ('confirm', 'match') THEN
            IF p_action = 'confirm' THEN
                v_target := v_row.suggested_commission_id;
                IF v_target IS NULL THEN
                    RETURN QUERY SELECT 'not_allowed'::text, v_import.version;
                    RETURN;
                END IF;
                v_basis := v_row.match_basis;
            ELSE
                v_target := p_commission_id;
                v_basis := CASE WHEN p_commission_id = v_row.suggested_commission_id
                                THEN v_row.match_basis ELSE 'manual' END;
            END IF;

            -- The line: this advisor's (both ids), live, unpaid, not taken by another row of
            -- this statement, and not carrying a different reference. Locked, so a hand edit
            -- cannot slip between this check and the write.
            PERFORM 1
              FROM public.commission c
              JOIN public.trip t ON t.id = c.trip_id
             WHERE c.id = v_target
               AND c.agent_id = p_agent_id AND t.agent_id = p_agent_id
               AND c.archived_at IS NULL
               AND c.status NOT IN ('received', 'disputed')
               AND (c.inteletravel_reference IS NULL OR v_row.reference IS NULL
                    OR public.commission_ref_key(c.inteletravel_reference)
                       = public.commission_ref_key(v_row.reference))
               AND NOT EXISTS (
                    SELECT 1 FROM public.commission_import_row o
                     WHERE o.import_id = p_import_id AND o.id <> p_row_id
                       AND o.state = 'confirmed' AND o.commission_id = c.id)
               FOR UPDATE OF c;
            IF NOT FOUND THEN
                RETURN QUERY SELECT 'line_unavailable'::text, v_import.version;
                RETURN;
            END IF;

            UPDATE public.commission_import_row
               SET state = 'confirmed', commission_id = v_target, match_basis = v_basis,
                   new_trip_id = NULL, new_supplier_id = NULL, new_gross_cents = NULL,
                   new_commission_pct = NULL, new_commission_id = NULL, updated_at = now()
             WHERE id = p_row_id;

        ELSE  -- create
            IF p_new_commission_id IS NULL OR p_gross_cents IS NULL OR p_gross_cents < 0
               OR p_commission_pct IS NULL OR p_commission_pct < 0 OR p_commission_pct > 100 THEN
                RAISE EXCEPTION 'create needs a new line id, a gross of $0 or more and a rate from 0 to 100';
            END IF;
            -- A new line goes on a live trip, as 3.7.4's add does.
            IF NOT EXISTS (SELECT 1 FROM public.trip t
                            WHERE t.id = p_trip_id AND t.agent_id = p_agent_id
                              AND t.archived_at IS NULL) THEN
                RETURN QUERY SELECT 'trip_not_found'::text, v_import.version;
                RETURN;
            END IF;
            IF NOT EXISTS (SELECT 1 FROM public.supplier s
                            WHERE s.id = p_supplier_id AND s.archived_at IS NULL) THEN
                RETURN QUERY SELECT 'supplier_not_found'::text, v_import.version;
                RETURN;
            END IF;

            UPDATE public.commission_import_row
               SET state = 'to_create', commission_id = NULL,
                   new_trip_id = p_trip_id, new_supplier_id = p_supplier_id,
                   new_gross_cents = p_gross_cents,
                   new_commission_pct = round(p_commission_pct, 2),
                   new_commission_id = p_new_commission_id, updated_at = now()
             WHERE id = p_row_id;
        END IF;
    END IF;

    UPDATE public.commission_import i
       SET version = i.version + 1, updated_at = now()
     WHERE i.id = p_import_id;

    RETURN QUERY SELECT 'resolved'::text, v_import.version + 1;
END;
$$;

COMMENT ON FUNCTION public.agent_resolve_commission_import_row IS
    'Screen 3.7.6''s Resolve: confirm the suggested line, match a different unpaid line, set '
    'the row to create a new line on a live trip, or ignore it. Changes only the row. A row '
    'already recorded against a paid line has no actions. Outcomes: resolved | stale | '
    'not_found | not_open | not_allowed | line_unavailable | trip_not_found | supplier_not_found.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 10. Reconcile — every decision, applied together, each with its audit row
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.agent_reconcile_commission_import(
    p_agent_id         uuid,
    p_actor_user_id    uuid,
    p_import_id        uuid,
    p_expected_version integer,
    p_audit_ids        uuid[],
    p_ip               text,
    p_user_agent       text
)
RETURNS TABLE (
    outcome        text,
    version        integer,
    paid_count     integer,
    created_count  integer,
    already_count  integer,
    blocking_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
    v_import   public.commission_import%ROWTYPE;
    r          record;
    v_line     public.commission%ROWTYPE;
    v_supplier public.supplier%ROWTYPE;
    v_currency char(3);
    v_fee      bigint;
    v_gap      bigint;
    v_status   public.commission_status;
    v_expected bigint;
    v_ref      text;
    v_set_ref  boolean;
    v_i        integer := 0;
    v_paid     integer := 0;
    v_created  integer := 0;
    v_already  integer := 0;
    v_lost     integer := 0;
    v_n        integer;
    v_blocking integer;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.agent a
                    WHERE a.id = p_agent_id AND a.status <> 'archived') THEN
        RETURN;
    END IF;

    SELECT i.* INTO v_import
      FROM public.commission_import i
     WHERE i.id = p_import_id AND i.agent_id = p_agent_id AND i.status <> 'discarded'
       FOR UPDATE;
    IF NOT FOUND THEN
        RETURN QUERY SELECT 'not_found'::text, NULL::integer, 0, 0, 0, 0;
        RETURN;
    END IF;
    IF p_expected_version IS DISTINCT FROM v_import.version THEN
        RETURN QUERY SELECT 'stale'::text, v_import.version, 0, 0, 0, 0;
        RETURN;
    END IF;
    IF v_import.status <> 'review' THEN
        RETURN QUERY SELECT 'not_open'::text, v_import.version, 0, 0, 0, 0;
        RETURN;
    END IF;

    -- ── One reconcile at a time per advisor, and the rows it names held still ─────────
    -- Two statements reconciled at once could each create a line for the same booking (each
    -- checked the reference before the other wrote it; found in review). The advisory lock
    -- makes them take turns. Then every line a confirmed row pays is locked FOR UPDATE, and
    -- every trip and supplier a new line needs FOR SHARE, in id order, BEFORE the checks
    -- below read them: checked without a lock, a line removed by hand while this waited was
    -- paid anyway (found in review, with two sessions).
    PERFORM pg_advisory_xact_lock(hashtextextended('commission_reconcile:' || p_agent_id::text, 0));

    PERFORM 1 FROM public.commission c
     WHERE c.id IN (SELECT r.commission_id FROM public.commission_import_row r
                     WHERE r.import_id = p_import_id AND r.state = 'confirmed')
     ORDER BY c.id
       FOR UPDATE;
    PERFORM 1 FROM public.trip t
     WHERE t.id IN (SELECT r.new_trip_id FROM public.commission_import_row r
                     WHERE r.import_id = p_import_id AND r.state = 'to_create')
     ORDER BY t.id
       FOR SHARE;
    PERFORM 1 FROM public.supplier sp
     WHERE sp.id IN (SELECT r.new_supplier_id FROM public.commission_import_row r
                      WHERE r.import_id = p_import_id AND r.state = 'to_create')
     ORDER BY sp.id
       FOR SHARE;

    -- ── Every decision re-checked against the ledger as it is NOW ──────────────────────
    -- Since a decision was made: a line may have been removed by hand, a trip archived, a
    -- supplier retired, a reference written onto a line by hand or by another statement.
    -- Each such row goes back to needing a decision (a change of state, not a ledger write)
    -- and reconcile stops so the advisor sees why.

    -- A confirmed row whose line is gone.
    UPDATE public.commission_import_row r
       SET state = 'unmatched', commission_id = NULL, updated_at = now()
     WHERE r.import_id = p_import_id
       AND r.state = 'confirmed'
       AND NOT EXISTS (
            SELECT 1 FROM public.commission c JOIN public.trip t ON t.id = c.trip_id
             WHERE c.id = r.commission_id AND c.agent_id = p_agent_id
               AND t.agent_id = p_agent_id AND c.archived_at IS NULL);
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_lost := v_lost + v_n;

    -- A new line whose trip or supplier is gone.
    UPDATE public.commission_import_row r
       SET state = 'unmatched', new_trip_id = NULL, new_supplier_id = NULL,
           new_gross_cents = NULL, new_commission_pct = NULL, new_commission_id = NULL,
           updated_at = now()
     WHERE r.import_id = p_import_id
       AND r.state = 'to_create'
       AND (NOT EXISTS (SELECT 1 FROM public.trip t
                         WHERE t.id = r.new_trip_id AND t.agent_id = p_agent_id
                           AND t.archived_at IS NULL)
            OR NOT EXISTS (SELECT 1 FROM public.supplier sp
                            WHERE sp.id = r.new_supplier_id AND sp.archived_at IS NULL));
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_lost := v_lost + v_n;

    -- A confirmed row whose line now carries a DIFFERENT reference: that line is another
    -- booking's (a hand edit was paid over in review, and the statement's reference dropped).
    UPDATE public.commission_import_row r
       SET state = 'unmatched', commission_id = NULL, updated_at = now()
     WHERE r.import_id = p_import_id
       AND r.state = 'confirmed'
       AND public.commission_ref_key(r.reference) IS NOT NULL
       AND EXISTS (SELECT 1 FROM public.commission c
                    WHERE c.id = r.commission_id
                      AND public.commission_ref_key(c.inteletravel_reference) IS NOT NULL
                      AND public.commission_ref_key(c.inteletravel_reference)
                          <> public.commission_ref_key(r.reference));
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_lost := v_lost + v_n;

    -- A row whose reference is on ANOTHER live line of this advisor: the booking is already
    -- in the ledger (by hand, or from another statement). Creating a second line counted the
    -- money twice in review. The row now points at that line: already recorded if it is paid
    -- (never changed), otherwise a suggestion for the advisor to confirm.
    UPDATE public.commission_import_row r
       SET state = CASE WHEN o.status IN ('received', 'disputed')
                        THEN 'already_recorded'::public.commission_import_row_state
                        ELSE 'suggested'::public.commission_import_row_state END,
           commission_id = CASE WHEN o.status IN ('received', 'disputed') THEN o.id END,
           suggested_commission_id = o.id,
           match_basis = 'reference',
           new_trip_id = NULL, new_supplier_id = NULL, new_gross_cents = NULL,
           new_commission_pct = NULL, new_commission_id = NULL,
           updated_at = now()
      FROM public.commission o
      JOIN public.trip ot ON ot.id = o.trip_id
     WHERE r.import_id = p_import_id
       AND r.state IN ('confirmed', 'to_create')
       AND o.agent_id = p_agent_id AND ot.agent_id = p_agent_id
       AND o.archived_at IS NULL
       AND o.id IS DISTINCT FROM r.commission_id
       AND length(public.commission_ref_key(r.reference)) >= 4
       AND public.commission_ref_key(o.inteletravel_reference) = public.commission_ref_key(r.reference);
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_lost := v_lost + v_n;

    -- Within this statement, a second row still paying or creating for a booking an earlier
    -- row already does (a duplicate resolved to "create", say): one row per booking.
    UPDATE public.commission_import_row r
       SET state = 'duplicate', commission_id = NULL,
           new_trip_id = NULL, new_supplier_id = NULL, new_gross_cents = NULL,
           new_commission_pct = NULL, new_commission_id = NULL,
           updated_at = now()
     WHERE r.import_id = p_import_id
       AND r.state IN ('confirmed', 'to_create')
       AND length(public.commission_ref_key(r.reference)) >= 4
       AND EXISTS (SELECT 1 FROM public.commission_import_row e
                    WHERE e.import_id = p_import_id
                      AND e.row_number < r.row_number
                      AND e.state IN ('confirmed', 'to_create')
                      AND public.commission_ref_key(e.reference) = public.commission_ref_key(r.reference));
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_lost := v_lost + v_n;

    -- Rows moved: the version moves, so any open screen reloads. Kept in step locally, so
    -- every version this call reports below is the real one.
    IF v_lost > 0 THEN
        UPDATE public.commission_import i SET version = i.version + 1, updated_at = now()
         WHERE i.id = p_import_id;
        v_import.version := v_import.version + 1;
    END IF;

    SELECT count(*)::integer INTO v_blocking
      FROM public.commission_import_row r
     WHERE r.import_id = p_import_id
       AND r.state IN ('suggested', 'unmatched', 'duplicate', 'unreadable');
    IF v_blocking > 0 THEN
        RETURN QUERY SELECT 'needs_decisions'::text, v_import.version, 0, 0, 0, v_blocking;
        RETURN;
    END IF;

    -- One audit id per ledger line touched, plus one for the statement. The Edge Function
    -- sends 1,001 (the row cap plus one); too few is its bug, and the whole call fails.
    IF coalesce(cardinality(p_audit_ids), 0) <
       (SELECT count(*) FROM public.commission_import_row r
         WHERE r.import_id = p_import_id AND r.state IN ('confirmed', 'to_create')) + 1 THEN
        RAISE EXCEPTION 'reconcile needs one audit id per line it writes, plus one';
    END IF;

    -- ── Pay the confirmed lines ───────────────────────────────────────────────────────
    FOR r IN SELECT * FROM public.commission_import_row
              WHERE import_id = p_import_id AND state = 'confirmed'
              ORDER BY row_number
    LOOP
        SELECT c.* INTO v_line FROM public.commission c
         WHERE c.id = r.commission_id AND c.agent_id = p_agent_id AND c.archived_at IS NULL
           FOR UPDATE;
        IF NOT FOUND THEN
            -- Locked above and checked since; reaching here is a bug, and nothing lands.
            RAISE EXCEPTION 'commission line % changed during reconcile', r.commission_id;
        END IF;

        -- Paid by hand since it was matched: never changed (Gyasi, 2026-10-11). The row says
        -- so, and the line keeps what the advisor recorded.
        IF v_line.status IN ('received', 'disputed') THEN
            UPDATE public.commission_import_row SET state = 'already_recorded', updated_at = now()
             WHERE id = r.id;
            v_already := v_already + 1;
            CONTINUE;
        END IF;

        v_fee := coalesce(r.fee_cents, 0);
        v_gap := v_line.expected_commission_cents - v_fee - r.received_cents;
        v_status := CASE WHEN v_gap > 0 THEN 'disputed' ELSE 'received' END;
        v_ref := nullif(btrim(r.reference), '');
        -- The statement's reference goes on the line when the line has none and no other line
        -- of this advisor holds it (the natural key is unique per advisor).
        v_set_ref := v_line.inteletravel_reference IS NULL AND v_ref IS NOT NULL
                     AND NOT EXISTS (SELECT 1 FROM public.commission o
                                      WHERE o.agent_id = p_agent_id
                                        AND o.inteletravel_reference = v_ref);

        UPDATE public.commission c
           SET status                    = v_status,
               received_commission_cents = r.received_cents,
               processing_fee_cents      = v_fee,
               received_at               = r.paid_on,
               import_id                 = p_import_id,
               version                   = c.version + 1,
               updated_at                = now()
         WHERE c.id = v_line.id;

        -- The reference in its own step: a hand edit committing the same reference after the
        -- check above would otherwise hit the unique index and fail the whole reconcile.
        IF v_set_ref THEN
            BEGIN
                UPDATE public.commission c SET inteletravel_reference = v_ref WHERE c.id = v_line.id;
            EXCEPTION WHEN unique_violation THEN
                IF SQLERRM NOT LIKE '%commission_inteletravel_ref%' THEN RAISE; END IF;
                v_set_ref := false;
            END;
        END IF;

        v_i := v_i + 1;
        PERFORM public.commission_audit(
            p_audit_ids[v_i], p_actor_user_id, 'commission.reconciled', 'commission', v_line.id,
            jsonb_build_object(
                'import_id', p_import_id,
                'import_row_id', r.id,
                'row_number', r.row_number,
                'match_basis', r.match_basis,
                'status', jsonb_build_object('from', v_line.status, 'to', v_status),
                'received_commission_cents',
                    jsonb_build_object('from', v_line.received_commission_cents, 'to', r.received_cents),
                'processing_fee_cents',
                    jsonb_build_object('from', v_line.processing_fee_cents, 'to', v_fee),
                'received_at', jsonb_build_object('from', v_line.received_at, 'to', r.paid_on),
                'inteletravel_reference', CASE WHEN v_set_ref THEN
                    jsonb_build_object('from', NULL, 'to', v_ref) END,
                'gap_cents', v_gap,
                'version', v_line.version + 1),
            p_ip, p_user_agent);
        v_paid := v_paid + 1;
    END LOOP;

    -- ── Create the new lines ──────────────────────────────────────────────────────────
    FOR r IN SELECT * FROM public.commission_import_row
              WHERE import_id = p_import_id AND state = 'to_create'
              ORDER BY row_number
    LOOP
        SELECT t.currency INTO v_currency FROM public.trip t WHERE t.id = r.new_trip_id;
        SELECT s.* INTO v_supplier FROM public.supplier s WHERE s.id = r.new_supplier_id;

        v_fee := coalesce(r.fee_cents, 0);
        v_expected := round(r.new_gross_cents * r.new_commission_pct / 100.0);
        v_gap := v_expected - v_fee - r.received_cents;
        v_status := CASE WHEN v_gap > 0 THEN 'disputed' ELSE 'received' END;
        v_ref := nullif(btrim(r.reference), '');
        v_set_ref := v_ref IS NOT NULL
                     AND NOT EXISTS (SELECT 1 FROM public.commission o
                                      WHERE o.agent_id = p_agent_id
                                        AND o.inteletravel_reference = v_ref);

        -- Terms from the supplier's defaults; a supplier with none is after travel, 0 days.
        -- The line is paid already, so the terms date nothing yet; they are not NULL-able.
        INSERT INTO public.commission
            (id, trip_id, agent_id, supplier_id, gross_booking_cents, commission_pct,
             expected_commission_cents, processing_fee_cents, received_commission_cents,
             currency, payment_terms, payment_lag_days, status, received_at,
             inteletravel_reference, import_id, version)
        VALUES
            (r.new_commission_id, r.new_trip_id, p_agent_id, r.new_supplier_id,
             r.new_gross_cents, r.new_commission_pct, v_expected, v_fee, r.received_cents,
             v_currency,
             coalesce(v_supplier.commission_payment_terms, 'after_travel'),
             CASE WHEN v_supplier.commission_payment_terms IS NULL THEN 0
                  ELSE coalesce(v_supplier.commission_payment_lag_days, 0) END,
             v_status, r.paid_on, NULL, p_import_id, 1);

        IF v_set_ref THEN
            BEGIN
                UPDATE public.commission c SET inteletravel_reference = v_ref WHERE c.id = r.new_commission_id;
            EXCEPTION WHEN unique_violation THEN
                IF SQLERRM NOT LIKE '%commission_inteletravel_ref%' THEN RAISE; END IF;
                v_set_ref := false;
            END;
        END IF;

        UPDATE public.commission_import_row
           SET commission_id = r.new_commission_id, updated_at = now()
         WHERE id = r.id;

        v_i := v_i + 1;
        PERFORM public.commission_audit(
            p_audit_ids[v_i], p_actor_user_id, 'commission.created', 'commission',
            r.new_commission_id,
            jsonb_build_object(
                'source', 'statement',
                'import_id', p_import_id,
                'import_row_id', r.id,
                'row_number', r.row_number,
                'trip_id', r.new_trip_id,
                'supplier_id', r.new_supplier_id,
                'gross_booking_cents', r.new_gross_cents,
                'commission_pct', r.new_commission_pct,
                'expected_commission_cents', v_expected,
                'status', v_status,
                'received_commission_cents', r.received_cents,
                'processing_fee_cents', v_fee,
                'received_at', r.paid_on,
                'inteletravel_reference', CASE WHEN v_set_ref THEN v_ref END,
                'gap_cents', v_gap,
                'version', 1),
            p_ip, p_user_agent);
        v_created := v_created + 1;
    END LOOP;

    SELECT count(*)::integer INTO v_already
      FROM public.commission_import_row r
     WHERE r.import_id = p_import_id AND r.state = 'already_recorded';

    UPDATE public.commission_import i
       SET status         = 'reconciled',
           reconciled_at  = now(),
           matched_rows   = v_paid + v_created + v_already,
           unmatched_rows = i.total_rows - (v_paid + v_created + v_already),
           version        = v_import.version + 1,
           updated_at     = now()
     WHERE i.id = p_import_id;

    v_i := v_i + 1;
    PERFORM public.commission_audit(
        p_audit_ids[v_i], p_actor_user_id, 'commission.statement_reconciled', 'commission_import',
        p_import_id,
        jsonb_build_object(
            'filename', v_import.original_filename,
            'row_count', v_import.total_rows,
            'paid', v_paid,
            'created', v_created,
            'already_recorded', v_already,
            'ignored', v_import.total_rows - (v_paid + v_created + v_already),
            'version', v_import.version + 1),
        p_ip, p_user_agent);

    RETURN QUERY SELECT 'reconciled'::text, v_import.version + 1, v_paid, v_created, v_already, 0;
END;
$$;

COMMENT ON FUNCTION public.agent_reconcile_commission_import IS
    'Screen 3.7.6''s "Mark as reconciled". Refuses while any row needs a decision. Pays each '
    'confirmed line (received, or disputed when short) and creates each to_create line, with '
    'one commission_audit row per line plus one for the statement, all in this transaction. A '
    'line paid by hand since it was matched is left alone and its row marked already recorded. '
    'Outcomes: reconciled | needs_decisions | stale | not_found | not_open.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 11. Discard — a wrong file or a bad map, before reconciling
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.agent_discard_commission_import(
    p_agent_id         uuid,
    p_actor_user_id    uuid,
    p_import_id        uuid,
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
    v_import public.commission_import%ROWTYPE;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.agent a
                    WHERE a.id = p_agent_id AND a.status <> 'archived') THEN
        RETURN;
    END IF;

    SELECT i.* INTO v_import
      FROM public.commission_import i
     WHERE i.id = p_import_id AND i.agent_id = p_agent_id AND i.status <> 'discarded'
       FOR UPDATE;
    IF NOT FOUND THEN
        RETURN QUERY SELECT 'not_found'::text, NULL::integer;
        RETURN;
    END IF;
    IF p_expected_version IS DISTINCT FROM v_import.version THEN
        RETURN QUERY SELECT 'stale'::text, v_import.version;
        RETURN;
    END IF;
    -- A reconciled statement has moved money. Undoing it is editing those lines, one by one.
    IF v_import.status NOT IN ('mapping', 'review') THEN
        RETURN QUERY SELECT 'not_open'::text, v_import.version;
        RETURN;
    END IF;

    UPDATE public.commission_import i
       SET status = 'discarded', version = i.version + 1, updated_at = now()
     WHERE i.id = p_import_id;

    UPDATE public.document d SET archived_at = now()
     WHERE d.id = v_import.document_id AND d.archived_at IS NULL;

    PERFORM public.commission_audit(
        p_audit_id, p_actor_user_id, 'commission.statement_discarded', 'commission_import',
        p_import_id,
        jsonb_build_object(
            'filename', v_import.original_filename,
            'row_count', v_import.total_rows,
            'status_was', v_import.status,
            'version', v_import.version + 1),
        p_ip, p_user_agent);

    RETURN QUERY SELECT 'discarded'::text, v_import.version + 1;
END;
$$;

COMMENT ON FUNCTION public.agent_discard_commission_import IS
    'Throws away a statement still in mapping or review: it leaves every list, its file can be '
    'uploaded again, and nothing in the ledger changes (nothing had). Audited. Outcomes: '
    'discarded | stale | not_found | not_open.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 12. Grants
-- ─────────────────────────────────────────────────────────────────────────────

REVOKE EXECUTE ON FUNCTION public.agent_commission_imports() FROM public, anon;
GRANT  EXECUTE ON FUNCTION public.agent_commission_imports() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.agent_commission_import(uuid) FROM public, anon;
GRANT  EXECUTE ON FUNCTION public.agent_commission_import(uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.agent_commission_import_rows(uuid) FROM public, anon;
GRANT  EXECUTE ON FUNCTION public.agent_commission_import_rows(uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.agent_commission_import_candidates(uuid, uuid) FROM public, anon;
GRANT  EXECUTE ON FUNCTION public.agent_commission_import_candidates(uuid, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.commission_ref_key(text) FROM public, anon;
GRANT  EXECUTE ON FUNCTION public.commission_ref_key(text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.commission_fold(text) FROM public, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.commission_import_match(uuid, uuid) FROM public, anon, authenticated, service_role;

-- The writes take `p_agent_id` as trusted input: a client-role grant on any of them is an
-- act-as-any-advisor primitive. service_role only; the Edge Function is the door.
DO $$
DECLARE f text;
BEGIN
    FOREACH f IN ARRAY ARRAY[
        'public.agent_upload_commission_statement(uuid, uuid, uuid, uuid, text, bigint, bytea, text, text[], jsonb, jsonb, uuid, text, text)',
        'public.agent_map_commission_import(uuid, uuid, integer, jsonb, date, jsonb)',
        'public.agent_resolve_commission_import_row(uuid, uuid, integer, uuid, text, uuid, uuid, uuid, bigint, numeric, uuid)',
        'public.agent_reconcile_commission_import(uuid, uuid, uuid, integer, uuid[], text, text)',
        'public.agent_discard_commission_import(uuid, uuid, uuid, integer, uuid, text, text)'
    ]
    LOOP
        EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM public, anon, authenticated', f);
        EXECUTE format('GRANT  EXECUTE ON FUNCTION %s TO service_role', f);
    END LOOP;
END $$;

-- ── ASSERTIONS ───────────────────────────────────────────────────────────────────

DO $$
DECLARE leaked text;
BEGIN
    SELECT string_agg(p.proname, ', ' ORDER BY p.proname) INTO leaked
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('agent_upload_commission_statement', 'agent_map_commission_import',
                         'agent_resolve_commission_import_row', 'agent_reconcile_commission_import',
                         'agent_discard_commission_import',
                         'commission_fold', 'commission_import_match')
       AND (has_function_privilege('authenticated', p.oid, 'EXECUTE')
            OR has_function_privilege('anon', p.oid, 'EXECUTE'));
    IF leaked IS NOT NULL THEN
        RAISE EXCEPTION '§3.7.5/3.7.6 writes and helpers must not be executable by a client role: %', leaked;
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
       AND p.proname IN ('agent_commission_imports', 'agent_commission_import',
                         'agent_commission_import_rows', 'agent_commission_import_candidates',
                         'agent_upload_commission_statement', 'agent_map_commission_import',
                         'agent_resolve_commission_import_row', 'agent_reconcile_commission_import',
                         'agent_discard_commission_import', 'commission_ref_key',
                         'commission_fold', 'commission_import_match')
       AND (sp.value IS NULL
            OR btrim((string_to_array(sp.value, ','))[
                   cardinality(string_to_array(sp.value, ','))], ' "') <> 'pg_temp'
            OR (p.prosecdef = (p.proname IN ('commission_ref_key', 'commission_fold',
                                             'commission_import_match'))));
    IF leaked IS NOT NULL THEN
        RAISE EXCEPTION
            '§3.7.5/3.7.6 functions need a pg_temp-terminated search_path, definer for the '
            'accessors and writes, invoker for the three helpers: %', leaked;
    END IF;

    IF has_table_privilege('authenticated', 'public.commission_import_row', 'SELECT')
       OR has_table_privilege('anon', 'public.commission_import_row', 'SELECT')
       OR has_table_privilege('authenticated', 'public.commission_import', 'SELECT')
       OR has_table_privilege('anon', 'public.commission_import', 'SELECT') THEN
        RAISE EXCEPTION 'an imported statement is readable by a client role';
    END IF;

    IF NOT (SELECT c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE n.nspname = 'public' AND c.relname = 'commission_import_row') THEN
        RAISE EXCEPTION 'RLS must be enabled on commission_import_row';
    END IF;

    IF (SELECT public FROM storage.buckets WHERE id = 'commission-statements') IS DISTINCT FROM false THEN
        RAISE EXCEPTION 'the commission-statements bucket must exist and be private';
    END IF;

    -- No client-role policy can reach this bucket: none that names it, and none that names
    -- no bucket at all (which would reach every bucket). Policies scoped to OTHER buckets are
    -- not this migration's business; a dashboard-made one on the hosted project must not fail
    -- the deploy.
    IF EXISTS (SELECT 1 FROM pg_policies
                WHERE schemaname = 'storage' AND tablename = 'objects'
                  AND roles && ARRAY['anon', 'authenticated', 'public']::name[]
                  AND (coalesce(qual, '') || coalesce(with_check, '')) LIKE ANY
                      (ARRAY['%commission-statements%'])
                   OR (schemaname = 'storage' AND tablename = 'objects'
                       AND roles && ARRAY['anon', 'authenticated', 'public']::name[]
                       AND (coalesce(qual, '') || coalesce(with_check, '')) NOT LIKE '%bucket_id%')) THEN
        RAISE EXCEPTION 'a client-role policy on storage.objects could reach commission-statements';
    END IF;
END $$;

COMMIT;
