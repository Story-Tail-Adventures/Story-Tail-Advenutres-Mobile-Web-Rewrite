-- §3.4.15 Trip Payment Schedule — the writes, and the read widened to serve its form.
--
-- ── THREE FUNCTIONS, NOT ONE ─────────────────────────────────────────────────────────────
--
-- §3.4.4's components are one upsert because the seven kinds land in the same columns.
-- A milestone is not that shape. `paid_cents`, `paid_at` and `status` MOVE TOGETHER — there
-- is a CHECK saying a `paid` row must carry a `paid_at` — and they are touched by a
-- different action, at a different moment, by an advisor answering a different question.
-- "What does the supplier expect and when" is the schedule; "has the money moved" is not.
--
-- Folding them would also mean the edit form posts `paid_cents` on every save of a label,
-- which is the widest possible blast radius for the column that now drives
-- `trip.total_paid_cents` and, through it, the balance a traveler is shown when they
-- authorize a card.
--
-- ── REMOVAL IS A HARD DELETE, DELIBERATELY ──────────────────────────────────────────────
--
-- `payment_milestone` is NOT on Data-Model §20.1's soft-delete list and has no
-- `archived_at` column, and nothing in the schema references it. §3.4.4's components are
-- archived instead because `itinerary_activity.component_id` points at them and a hard
-- delete would take an advisor's written-up day with it. Nothing points here.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- The schedule: what is expected, and when
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.agent_upsert_payment_milestone(
    p_trip_id      uuid,
    p_agent_id     uuid,
    p_milestone_id uuid,
    p_kind         payment_milestone_kind,
    p_label        text,
    p_amount_cents bigint,
    p_due_date     date DEFAULT NULL
)
RETURNS TABLE (
    outcome      text,   -- 'created' | 'updated' | 'noop'
    milestone_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_trip     public.trip%ROWTYPE;
    v_existing public.payment_milestone%ROWTYPE;
    v_label    text := btrim(coalesce(p_label, ''));
    v_next     integer;
    v_id       uuid := gen_random_uuid();
BEGIN
    IF v_label = '' THEN
        RAISE EXCEPTION 'agent_upsert_payment_milestone needs a label — it is NOT NULL and '
                        'it is what the client reads';
    END IF;

    IF coalesce(p_amount_cents, 0) < 0 THEN
        RAISE EXCEPTION 'a milestone cannot expect a negative amount';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.agent a WHERE a.id = p_agent_id AND a.status <> 'archived'
    ) THEN
        RETURN;
    END IF;

    -- Locked, not merely checked: two adds racing on one trip would otherwise compute the
    -- same `order_index`.
    SELECT * INTO v_trip
      FROM public.trip t
     WHERE t.id = p_trip_id
       AND t.agent_id = p_agent_id
       AND t.archived_at IS NULL
     FOR UPDATE;

    IF NOT FOUND THEN
        RETURN;   -- "no such trip" and "not yours" are the same answer.
    END IF;

    -- `p_milestone_id` MEANS "EDIT THIS ONE" AND NOTHING ELSE, and it is scoped to the
    -- trip. Both halves are load-bearing: without the second, an advisor could edit any
    -- milestone whose id they knew by naming one of their own trips. §3.4.4's component
    -- upsert learned the first half by producing a primary-key violation on a stale id.
    IF p_milestone_id IS NOT NULL THEN
        SELECT * INTO v_existing
          FROM public.payment_milestone pm
         WHERE pm.id = p_milestone_id AND pm.trip_id = p_trip_id;

        IF NOT FOUND THEN
            RETURN;
        END IF;

        IF (v_existing.kind, v_existing.label, v_existing.amount_cents, v_existing.due_date)
           IS NOT DISTINCT FROM
           (p_kind, v_label, coalesce(p_amount_cents, 0), p_due_date)
        THEN
            RETURN QUERY SELECT 'noop'::text, v_existing.id;
            RETURN;
        END IF;

        -- NOTHING HERE TOUCHES paid_cents, paid_at OR status. See the header: those three
        -- move together and they belong to `agent_set_milestone_paid`. An edit to a label
        -- must not be able to move `trip.total_paid_cents`.
        UPDATE public.payment_milestone
           SET kind = p_kind,
               label = v_label,
               amount_cents = coalesce(p_amount_cents, 0),
               due_date = p_due_date,
               updated_at = now()
         WHERE id = v_existing.id;

        RETURN QUERY SELECT 'updated'::text, v_existing.id;
        RETURN;
    END IF;

    SELECT coalesce(max(pm.order_index), -1) + 1 INTO v_next
      FROM public.payment_milestone pm
     WHERE pm.trip_id = p_trip_id;

    INSERT INTO public.payment_milestone (
        id, trip_id, kind, label, amount_cents, currency,
        due_date, paid_cents, status, order_index
    )
    VALUES (
        v_id, p_trip_id, p_kind, v_label, coalesce(p_amount_cents, 0),
        -- THE TRIP'S CURRENCY, never the caller's — the BEFORE guard would refuse anything
        -- else, and taking it as a parameter would invite a form to offer a choice that
        -- cannot be honoured.
        v_trip.currency,
        p_due_date, 0, 'scheduled', v_next
    );

    RETURN QUERY SELECT 'created'::text, v_id;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- The money: has it moved
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.agent_set_milestone_paid(
    p_trip_id      uuid,
    p_agent_id     uuid,
    p_milestone_id uuid,
    p_status       payment_milestone_status,
    p_paid_cents   bigint DEFAULT NULL
)
RETURNS TABLE (
    outcome      text,   -- 'changed' | 'noop'
    milestone_id uuid,
    paid_cents   text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_existing public.payment_milestone%ROWTYPE;
    v_paid     bigint;
    v_paid_at  timestamptz;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.agent a WHERE a.id = p_agent_id AND a.status <> 'archived'
    ) THEN
        RETURN;
    END IF;

    SELECT pm.* INTO v_existing
      FROM public.payment_milestone pm
      JOIN public.trip t ON t.id = pm.trip_id
     WHERE pm.id = p_milestone_id
       AND pm.trip_id = p_trip_id
       AND t.agent_id = p_agent_id
       AND t.archived_at IS NULL
     FOR UPDATE OF pm;

    IF NOT FOUND THEN
        RETURN;
    END IF;

    -- THE THREE COLUMNS ARE DERIVED FROM THE STATUS, not taken separately, which is what
    -- makes them incapable of disagreeing. The CHECK on this table only enforces one
    -- direction (a `paid` row needs a `paid_at`); the states below are the whole matrix,
    -- and it is the same reasoning the client archive uses for `status` + `archived_at`.
    --
    --   paid       → the full amount, unless a partial was named. paid_at is set.
    --   scheduled  → nothing has moved. paid_at cleared, or the row would claim a date for
    --                a payment it no longer records.
    --   overdue    → same as scheduled. Overdue is a scheduled row past its date, and an
    --                advisor can suppress it (§9.5), which is why it is stored.
    --   waived     → the supplier forgave it. NOT a payment: paid_cents stays 0, so the
    --                trip total does not rise. This is the distinction §9.5 exists for.
    IF p_status = 'paid' THEN
        v_paid := coalesce(p_paid_cents, v_existing.amount_cents);
        IF v_paid < 0 THEN
            RAISE EXCEPTION 'a payment cannot be negative';
        END IF;
        -- Kept rather than re-stamped, so marking a row paid twice does not rewrite when
        -- the money actually landed.
        v_paid_at := coalesce(v_existing.paid_at, now());
    ELSE
        v_paid := 0;
        v_paid_at := NULL;
    END IF;

    IF (v_existing.status, v_existing.paid_cents, v_existing.paid_at)
       IS NOT DISTINCT FROM (p_status, v_paid, v_paid_at)
    THEN
        RETURN QUERY SELECT 'noop'::text, v_existing.id, v_existing.paid_cents::text;
        RETURN;
    END IF;

    UPDATE public.payment_milestone
       SET status = p_status,
           paid_cents = v_paid,
           paid_at = v_paid_at,
           updated_at = now()
     WHERE id = v_existing.id;

    -- `trip.total_paid_cents` is NOT written here. 20260929100000's trigger recomputes it
    -- from this UPDATE, which is the whole reason that landed first: a write path that
    -- maintained the total itself would be a second place for the two to disagree, and
    -- that is exactly how the column came to have no producer at all.
    RETURN QUERY SELECT 'changed'::text, v_existing.id, v_paid::text;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Removal
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.agent_delete_payment_milestone(
    p_trip_id      uuid,
    p_agent_id     uuid,
    p_milestone_id uuid
)
RETURNS TABLE (outcome text, milestone_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_found uuid;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.agent a WHERE a.id = p_agent_id AND a.status <> 'archived'
    ) THEN
        RETURN;
    END IF;

    DELETE FROM public.payment_milestone pm
     USING public.trip t
     WHERE pm.id = p_milestone_id
       AND pm.trip_id = p_trip_id
       AND t.id = pm.trip_id
       AND t.agent_id = p_agent_id
       AND t.archived_at IS NULL
    RETURNING pm.id INTO v_found;

    IF v_found IS NULL THEN
        RETURN;   -- Not there, or not theirs. One answer.
    END IF;

    RETURN QUERY SELECT 'deleted'::text, v_found;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- The read, widened for the form
-- ─────────────────────────────────────────────────────────────────────────────

-- DROP first: `CREATE OR REPLACE` cannot change a function's return type.
DROP FUNCTION IF EXISTS public.agent_trip_payments(uuid);

CREATE FUNCTION public.agent_trip_payments(p_trip_id uuid)
RETURNS TABLE (
    milestone_id  uuid,
    kind          payment_milestone_kind,
    label         text,
    amount_cents  text,
    paid_cents    text,
    currency      char(3),
    due_date      date,
    paid_at       timestamptz,
    status        payment_milestone_status,
    order_index   integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT pm.id, pm.kind, pm.label, pm.amount_cents::text, pm.paid_cents::text,
           pm.currency, pm.due_date, pm.paid_at, pm.status, pm.order_index
      FROM public.payment_milestone pm
      JOIN public.trip t
        ON t.id = pm.trip_id
       AND t.agent_id = public.current_agent_id()
       AND t.archived_at IS NULL
     WHERE pm.trip_id = p_trip_id
     -- BY DATE FIRST, as of §3.4.15. It ordered by `order_index` alone, which is what
     -- Data-Model §9.5 calls "display order" with due_date as the tiebreak — and that is
     -- backwards for a payment schedule. A deposit added after the final balance sorted
     -- below it, and the Overview sidebar's "next unpaid" was the next INSERTED rather
     -- than the next DUE. `order_index` keeps its job as the stable tiebreak so two
     -- milestones on one date never swap places between renders.
     ORDER BY pm.due_date NULLS LAST, pm.order_index;
$$;

COMMENT ON FUNCTION public.agent_trip_payments(uuid) IS
    'Every milestone for the trip, in DUE-DATE order. Serves both the Overview sidebar''s '
    'summary card (the caller picks the next unpaid row or two) and §3.4.15''s editor — '
    'one read, two renderings. `paid_at` is in the signature as of §3.4.15: the schedule '
    'editor shows when a payment landed, and it is the column the paid/unpaid write moves '
    'together with `status` and `paid_cents`.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Grants
-- ─────────────────────────────────────────────────────────────────────────────

-- THE THREE WRITES ARE service_role ONLY. Each takes `p_agent_id` as trusted input, so a
-- grant to a client role would be an act-as-any-advisor primitive with no `audit_event`
-- behind it. The reads are accessors and go to `authenticated`.
DO $$
DECLARE f text;
BEGIN
    FOREACH f IN ARRAY ARRAY[
        'public.agent_upsert_payment_milestone(uuid, uuid, uuid, payment_milestone_kind, text, bigint, date)',
        'public.agent_set_milestone_paid(uuid, uuid, uuid, payment_milestone_status, bigint)',
        'public.agent_delete_payment_milestone(uuid, uuid, uuid)'
    ]
    LOOP
        EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM public, anon, authenticated', f);
        EXECUTE format('GRANT  EXECUTE ON FUNCTION %s TO service_role', f);
    END LOOP;

    -- Naming `anon` is load-bearing: Supabase grants EXECUTE by name, so `FROM public`
    -- alone leaves that grant standing.
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.agent_trip_payments(uuid) FROM public, anon';
    EXECUTE 'GRANT  EXECUTE ON FUNCTION public.agent_trip_payments(uuid) TO authenticated, service_role';
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Assertions — restated, because a DO block sees only the catalog of its own day
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE missing text;
BEGIN
    SELECT string_agg(f, ', ') INTO missing
      FROM unnest(ARRAY['agent_upsert_payment_milestone', 'agent_set_milestone_paid',
                        'agent_delete_payment_milestone', 'agent_trip_payments']) AS f
     WHERE NOT EXISTS (
        SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname = f);
    IF missing IS NOT NULL THEN
        RAISE EXCEPTION 'function(s) missing after migration: %', missing;
    END IF;
END $$;

DO $$
DECLARE leaked text;
BEGIN
    SELECT string_agg(p.proname, ', ') INTO leaked
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('agent_upsert_payment_milestone', 'agent_set_milestone_paid',
                         'agent_delete_payment_milestone')
       AND (has_function_privilege('anon', p.oid, 'EXECUTE')
         OR has_function_privilege('authenticated', p.oid, 'EXECUTE'));
    IF leaked IS NOT NULL THEN
        RAISE EXCEPTION
            'a client role can execute a p_agent_id write — act-as-any-advisor: %', leaked;
    END IF;
END $$;

DO $$
DECLARE bad text;
BEGIN
    SELECT string_agg(p.proname, ', ') INTO bad
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('agent_upsert_payment_milestone', 'agent_set_milestone_paid',
                         'agent_delete_payment_milestone', 'agent_trip_payments')
       AND NOT EXISTS (
         SELECT 1 FROM unnest(coalesce(p.proconfig, ARRAY[]::text[])) AS c
          WHERE c = 'search_path=public, pg_temp');
    IF bad IS NOT NULL THEN
        RAISE EXCEPTION 'search_path not pinned to "public, pg_temp" on: %', bad;
    END IF;
END $$;

COMMIT;
