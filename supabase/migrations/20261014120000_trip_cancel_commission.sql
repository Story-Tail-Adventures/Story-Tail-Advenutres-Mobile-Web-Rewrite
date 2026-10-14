-- §3.7 Stage 5: cancelling a trip closes its open commission lines (Screen 3.4.16).
--
-- ── WHAT GYASI RULED (2026-10-12) ───────────────────────────────────────────────────────
--
--   * CANCEL CLOSES OPEN LINES. A cancelled trip's Expected and Invoiced ledger lines stayed
--     open forever: the ledger kept showing them as owed, and statement matching kept offering
--     them as unpaid. The prototype's cancel dialog draws "Commission expectation removed".
--   * OFFERED, ON BY DEFAULT. The cancel dialog lists the open lines under one checkbox,
--     checked. Unchecking it covers a supplier that still pays on a cancelled booking.
--
-- ── WHAT THIS DOES NOT DO ───────────────────────────────────────────────────────────────
--
-- It does not close anything on its own. `agent-trip-status` still never mints or moves money
-- records off a stage change (its header says why); this closes ONLY the lines the caller
-- names, each at the version the advisor saw. Received, Disputed, Lost and removed lines are
-- never touched, and a line changed since the dialog opened is skipped, not overwritten.
--
-- `agent_set_trip_status` is called, not changed: the Pipeline board, the bulk move and every
-- test that keys on its outcomes are untouched.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. What the cancel dialog lists
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.agent_trip_open_commission(p_trip_id uuid)
RETURNS TABLE (
    commission_id             uuid,
    supplier_name             text,
    status                    commission_status,
    expected_commission_cents text,
    currency                  char(3),
    version                   integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    -- The one scope every §3.7 read uses: both agent ids are the caller's, and removed lines
    -- are gone. Cents as text: a bigint arrives in JavaScript as a lossy number otherwise.
    SELECT c.id, s.name, c.status, c.expected_commission_cents::text, c.currency, c.version
      FROM public.commission_lines_for_current_agent() c
      JOIN public.supplier s ON s.id = c.supplier_id
     WHERE c.trip_id = p_trip_id
       AND c.status IN ('expected', 'invoiced')
     ORDER BY c.created_at, c.id
     -- The write closes at most this many in one call.
     LIMIT 100;
$$;

COMMENT ON FUNCTION public.agent_trip_open_commission(uuid) IS
    'Screen 3.4.16: the trip''s ledger lines a cancellation can close (Expected and Invoiced), '
    'with the version the close is checked against. Scoped by commission_lines_for_current_agent().';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Cancel, and close the lines the advisor confirmed
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.agent_cancel_trip(
    p_trip_id          uuid,
    p_agent_id         uuid,
    p_actor_user_id    uuid,
    p_expected_version integer,
    p_reason           text,
    -- DEFAULT NULL from here on, as agent_set_trip_status has them: an omitted refund field is
    -- "leave it alone", and the generated types make each one optional rather than nullable.
    p_refund_status    text    DEFAULT NULL,
    p_refund_detail    text    DEFAULT NULL,
    -- [{"id": <uuid>, "version": <int>}, …]: the lines the dialog showed, at the version it
    -- showed. NULL or [] closes nothing.
    p_close_lines      jsonb   DEFAULT NULL,
    -- One per line, v7, minted by the Edge Function. Line i (in id order) takes id i.
    p_audit_ids        uuid[]  DEFAULT NULL,
    p_ip               text    DEFAULT NULL,
    p_user_agent       text    DEFAULT NULL
)
RETURNS TABLE (
    outcome       text,          -- agent_set_trip_status's: 'changed' | 'reason_changed' | 'noop' | 'stale'
    from_status   trip_status,
    to_status     trip_status,
    version       integer,
    lines_closed  integer,
    lines_skipped integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
    v_elem    jsonb;
    v_num     numeric;
    v_ids     uuid[]    := ARRAY[]::uuid[];
    v_vers    integer[] := ARRAY[]::integer[];
    v_trip    record;
    v_line    public.commission%ROWTYPE;
    v_closed  integer := 0;
    v_skipped integer := 0;
BEGIN
    -- ── The list, checked before anything is locked or written ────────────────────────
    -- The Edge Function checks all of this first and answers in English; these are the
    -- second lock, for a direct service_role caller. Nothing is cast until jsonb_typeof says
    -- it fits: an OR beside a cast still runs the cast (Stage 4's weights check, in review).
    IF p_close_lines IS NOT NULL AND jsonb_typeof(p_close_lines) IS DISTINCT FROM 'array' THEN
        RAISE EXCEPTION 'p_close_lines must be a JSON array';
    END IF;
    IF jsonb_array_length(coalesce(p_close_lines, '[]'::jsonb)) > 100 THEN
        RAISE EXCEPTION 'a cancellation closes at most 100 commission lines';
    END IF;

    FOR v_elem IN SELECT e FROM jsonb_array_elements(coalesce(p_close_lines, '[]'::jsonb)) e LOOP
        IF jsonb_typeof(v_elem) IS DISTINCT FROM 'object'
           OR jsonb_typeof(v_elem -> 'id') IS DISTINCT FROM 'string'
           OR jsonb_typeof(v_elem -> 'version') IS DISTINCT FROM 'number' THEN
            RAISE EXCEPTION 'each line to close is {"id": <uuid>, "version": <whole number>}';
        END IF;
        v_num := (v_elem -> 'version')::numeric;
        IF v_num <> trunc(v_num) OR v_num < 1 OR v_num > 2147483647 THEN
            RAISE EXCEPTION 'a line version is a whole number from 1';
        END IF;
        v_ids  := v_ids  || (v_elem ->> 'id')::uuid;   -- a malformed id raises here
        v_vers := v_vers || v_num::integer;
    END LOOP;

    IF cardinality(v_ids) <> (SELECT count(DISTINCT x) FROM unnest(v_ids) x) THEN
        RAISE EXCEPTION 'a line is named twice';
    END IF;
    IF cardinality(v_ids) > 0 AND (
           cardinality(coalesce(p_audit_ids, ARRAY[]::uuid[])) <> cardinality(v_ids)
        OR array_position(p_audit_ids, NULL) IS NOT NULL
        OR cardinality(p_audit_ids) <> (SELECT count(DISTINCT x) FROM unnest(p_audit_ids) x)) THEN
        RAISE EXCEPTION 'commission writes owe an audit row: one distinct audit id per line';
    END IF;

    -- Id order, the order every lock below is taken in.
    SELECT coalesce(array_agg(l.id ORDER BY l.id), ARRAY[]::uuid[]),
           coalesce(array_agg(l.v  ORDER BY l.id), ARRAY[]::integer[])
      INTO v_ids, v_vers
      FROM unnest(v_ids, v_vers) AS l(id, v);

    -- ── Lines first, then the trip ──────────────────────────────────────────────────
    -- The same order reconcile takes them in (lines, then trips), so a cancel and a reconcile
    -- on one trip queue rather than deadlock. Only this advisor's lines on THIS trip are
    -- locked; anything else named is simply never touched.
    --
    -- FOR NO KEY UPDATE, not FOR UPDATE: the close never touches the key, and FOR UPDATE also
    -- blocks the FOR KEY SHARE every foreign-key check takes. Statement matching writes
    -- commission_import_row (two FKs into commission) row by row, so a cancel holding line 1
    -- and wanting line 2 against a match holding 2 and wanting 1 deadlocked (found in review,
    -- with two sessions). This still queues behind, and blocks, the 3.7.3 edit, payment and
    -- remove, which each lock their line FOR UPDATE.
    PERFORM 1 FROM public.commission c
     WHERE c.id = ANY (v_ids)
       AND c.trip_id = p_trip_id
       AND c.agent_id = p_agent_id
     ORDER BY c.id
       FOR NO KEY UPDATE;

    SELECT * INTO v_trip
      FROM public.agent_set_trip_status(
               p_trip_id, p_agent_id, p_actor_user_id, 'cancelled', p_expected_version,
               p_reason, p_refund_status, p_refund_detail);

    -- Zero rows: no such trip, not this advisor's, or an archived advisor. Same answer for
    -- all three, and nothing closed.
    IF NOT FOUND THEN
        RETURN;
    END IF;

    -- The trip moved under the dialog. Nothing is closed: the advisor reloads and sees the
    -- lines as they are now.
    IF v_trip.outcome = 'stale' THEN
        RETURN QUERY SELECT v_trip.outcome, v_trip.from_status, v_trip.to_status, v_trip.version, 0, 0;
        RETURN;
    END IF;

    -- ── Close what is still as the advisor saw it ───────────────────────────────────
    -- 'changed', 'reason_changed' and 'noop' all close: a trip cancelled before this shipped
    -- is cleaned up from the same dialog ("Save details"), where the stage does not move.
    FOR i IN 1 .. cardinality(v_ids) LOOP
        SELECT c.* INTO v_line
          FROM public.commission c
          JOIN public.trip t ON t.id = c.trip_id
         WHERE c.id = v_ids[i]
           AND c.trip_id = p_trip_id
           AND c.agent_id = p_agent_id
           AND t.agent_id = p_agent_id     -- both ids, as every §3.7 read requires
           AND c.archived_at IS NULL;

        IF NOT FOUND
           OR v_line.version <> v_vers[i]
           OR v_line.status NOT IN ('expected', 'invoiced') THEN
            -- Not this trip's, not this advisor's, removed, paid, or edited since the dialog
            -- opened. One answer for all of them, so a crafted id learns nothing.
            v_skipped := v_skipped + 1;
            CONTINUE;
        END IF;

        UPDATE public.commission c
           SET status     = 'lost',
               version    = c.version + 1,
               updated_at = now()
         WHERE c.id = v_line.id;

        PERFORM public.commission_audit(
            p_audit_ids[i], p_actor_user_id, 'commission.updated', 'commission', v_line.id,
            jsonb_build_object(
                'changes', jsonb_build_object(
                    'status', jsonb_build_object('from', v_line.status, 'to', 'lost')),
                'notes_changed', false,
                'version', v_line.version + 1,
                -- Why it moved, which 3.7.3's edit never needs to say.
                'via', 'trip_cancelled',
                'trip_id', p_trip_id),
            p_ip, p_user_agent);

        v_closed := v_closed + 1;
    END LOOP;

    RETURN QUERY SELECT v_trip.outcome, v_trip.from_status, v_trip.to_status, v_trip.version,
                        v_closed, v_skipped;
END;
$$;

COMMENT ON FUNCTION public.agent_cancel_trip(
    uuid, uuid, uuid, integer, text, text, text, jsonb, uuid[], text, text) IS
    'Screen 3.4.16. Cancels the trip through agent_set_trip_status (unchanged), then marks Lost '
    'each named commission line that is still Expected or Invoiced at the version named, with one '
    'commission_audit() row per line, all in one transaction. A stale trip closes nothing; a line '
    'not as named is skipped. Gyasi, 2026-10-12: offered in the dialog, on by default.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Grants
-- ─────────────────────────────────────────────────────────────────────────────

REVOKE EXECUTE ON FUNCTION public.agent_trip_open_commission(uuid) FROM public, anon;
GRANT  EXECUTE ON FUNCTION public.agent_trip_open_commission(uuid) TO authenticated, service_role;

-- service_role ONLY. `p_agent_id` is trusted input: a client-role grant would be an
-- act-as-any-advisor primitive.
REVOKE EXECUTE ON FUNCTION public.agent_cancel_trip(
    uuid, uuid, uuid, integer, text, text, text, jsonb, uuid[], text, text)
    FROM public, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.agent_cancel_trip(
    uuid, uuid, uuid, integer, text, text, text, jsonb, uuid[], text, text)
    TO service_role;

-- ── ASSERTIONS ───────────────────────────────────────────────────────────────────

DO $$
DECLARE leaked text;
BEGIN
    IF has_function_privilege('authenticated',
           'public.agent_cancel_trip(uuid, uuid, uuid, integer, text, text, text, jsonb, uuid[], text, text)', 'EXECUTE')
       OR has_function_privilege('anon',
           'public.agent_cancel_trip(uuid, uuid, uuid, integer, text, text, text, jsonb, uuid[], text, text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'agent_cancel_trip must not be executable by a client role';
    END IF;
    IF has_function_privilege('anon', 'public.agent_trip_open_commission(uuid)', 'EXECUTE') THEN
        RAISE EXCEPTION 'agent_trip_open_commission is for signed-in advisors only';
    END IF;

    -- EXACTLY ONE overload, as 20261001100000 asserts for agent_set_trip_status: a second one
    -- with defaulted parameters would make every PostgREST call that omits them ambiguous.
    IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
         WHERE ns.nspname = 'public' AND p.proname = 'agent_cancel_trip') <> 1 THEN
        RAISE EXCEPTION 'agent_cancel_trip must have exactly one overload';
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
       AND p.proname IN ('agent_trip_open_commission', 'agent_cancel_trip')
       AND (sp.value IS NULL
            OR btrim((string_to_array(sp.value, ','))[
                   cardinality(string_to_array(sp.value, ','))], ' "') <> 'pg_temp'
            OR NOT p.prosecdef);
    IF leaked IS NOT NULL THEN
        RAISE EXCEPTION '§3.4.16 commission functions need a pg_temp-terminated search_path and SECURITY DEFINER: %', leaked;
    END IF;
END $$;

COMMIT;
