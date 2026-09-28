-- §3.4.4's component writes, and §3.4.5–§3.4.12's forms behind them.
--
-- ── ONE UPSERT FOR SEVEN KINDS, AND FOR BOTH ADD AND EDIT ────────────────────────────────
--
-- The Screen Inventory draws eight sheets (§3.4.5–§3.4.11 to add, §3.4.12 to edit) and they
-- are one write. §3.4.12's own entry says "Same form as the corresponding Add screen,
-- pre-filled", and the seven kinds differ only in which fields the FORM shows — every one of
-- them lands in the same columns. Seven functions would be seven copies of the same
-- ownership check differing by which payload keys they happened to name.
--
-- WHAT IS A COLUMN AND WHAT IS PAYLOAD is settled in Data-Model §23 (2026-09-27): anything a
-- QUERY needs — filtered, sorted, summed, joined — is a column; `payload` is detail a screen
-- renders and nothing aggregates. This function takes the columns by name and the payload
-- whole, which is the boundary made executable.
--
-- ── THE TOTALS LOOK AFTER THEMSELVES ─────────────────────────────────────────────────────
--
-- Nothing here writes `trip.total_value_cents`. The trigger from 20260928100000 recomputes
-- it, which is the whole reason that landed first — a write path that maintained the total
-- itself would be a second place for the two to disagree, and it is exactly how the column
-- came to be a fiction in the first place.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- Upsert — §3.4.5 – §3.4.12
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.agent_upsert_trip_component(
    p_trip_id             uuid,
    p_agent_id            uuid,
    p_component_id        uuid,
    p_kind                component_kind,
    p_display_name        text,
    p_supplier_id         uuid    DEFAULT NULL,
    p_start_date          date    DEFAULT NULL,
    p_end_date            date    DEFAULT NULL,
    p_start_time          time    DEFAULT NULL,
    p_end_time            time    DEFAULT NULL,
    p_location            text    DEFAULT NULL,
    p_confirmation_number text    DEFAULT NULL,
    p_cost_cents          bigint  DEFAULT 0,
    p_commission_pct      numeric DEFAULT NULL,
    p_commission_cents    bigint  DEFAULT 0,
    p_payload             jsonb   DEFAULT '{}'::jsonb
)
RETURNS TABLE (
    outcome      text,   -- 'created' | 'updated' | 'noop'
    component_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_trip     public.trip%ROWTYPE;
    v_existing public.trip_component%ROWTYPE;
    v_name     text := btrim(coalesce(p_display_name, ''));
    v_next     integer;
    -- Minted here, and ONLY used for a create. The first draft returned `currval_id()`,
    -- which is not a function — plpgsql compiles a body on FIRST EXECUTION rather than at
    -- CREATE, so the migration applied perfectly and the break waited for the first
    -- component anybody added.
    v_id       uuid := gen_random_uuid();
BEGIN
    IF v_name = '' THEN
        RAISE EXCEPTION 'agent_upsert_trip_component needs a name — display_name is NOT NULL';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.agent a WHERE a.id = p_agent_id AND a.status <> 'archived'
    ) THEN
        RETURN;
    END IF;

    -- THE TRIP IS LOCKED, not merely checked. Two component adds racing on one trip would
    -- otherwise compute the same `order_index` and land on top of each other.
    SELECT * INTO v_trip
      FROM public.trip t
     WHERE t.id = p_trip_id
       AND t.agent_id = p_agent_id
       AND t.archived_at IS NULL
     FOR UPDATE;

    IF NOT FOUND THEN
        RETURN;   -- "no such trip" and "not yours" are the same answer.
    END IF;

    -- `p_component_id` MEANS "EDIT THIS ONE" AND NOTHING ELSE. It used to double as the id
    -- to create with, and the two readings collided: an id that did not belong to the named
    -- trip fell through to the INSERT and violated the primary key — which is the failure a
    -- crafted request would have produced, and which a test caught before any caller could.
    -- A create never supplies an id; the function mints one and hands it back.
    IF p_component_id IS NOT NULL THEN
        SELECT * INTO v_existing
          FROM public.trip_component c
         WHERE c.id = p_component_id
           -- SCOPED TO THE TRIP, not just to the id. Without this, an advisor could edit any
           -- component they knew the id of by naming one of their own trips.
           AND c.trip_id = p_trip_id
           AND c.archived_at IS NULL;

        -- Asked to edit something that is not on this trip: that is a stale or crafted
        -- request, not an invitation to create. Silence, the same answer as "no such trip".
        IF NOT FOUND THEN
            RETURN;
        END IF;
    END IF;

    IF p_component_id IS NOT NULL THEN
        -- Nothing changed is not an error, and not a write either: the builder auto-saves,
        -- so a blur with no edit would otherwise bump `updated_at` and re-run the totals
        -- trigger on every field the advisor merely tabbed through.
        IF (v_existing.kind, v_existing.display_name, v_existing.supplier_id,
            v_existing.start_date, v_existing.end_date, v_existing.start_time,
            v_existing.end_time, v_existing.location, v_existing.confirmation_number,
            v_existing.cost_cents, v_existing.commission_pct, v_existing.commission_cents,
            v_existing.payload)
           IS NOT DISTINCT FROM
           (p_kind, v_name, p_supplier_id, p_start_date, p_end_date, p_start_time,
            p_end_time, p_location, p_confirmation_number,
            coalesce(p_cost_cents, 0), p_commission_pct, coalesce(p_commission_cents, 0),
            coalesce(p_payload, '{}'::jsonb))
        THEN
            RETURN QUERY SELECT 'noop'::text, v_existing.id;
            RETURN;
        END IF;

        UPDATE public.trip_component
           SET kind = p_kind,
               display_name = v_name,
               supplier_id = p_supplier_id,
               start_date = p_start_date,
               end_date = p_end_date,
               start_time = p_start_time,
               end_time = p_end_time,
               location = p_location,
               confirmation_number = p_confirmation_number,
               cost_cents = coalesce(p_cost_cents, 0),
               commission_pct = p_commission_pct,
               commission_cents = coalesce(p_commission_cents, 0),
               payload = coalesce(p_payload, '{}'::jsonb),
               updated_at = now()
         WHERE id = v_existing.id;

        RETURN QUERY SELECT 'updated'::text, v_existing.id;
        RETURN;
    END IF;

    -- Appended, not inserted at a position. §3.4.4 reorders by drag, and that is its own
    -- write — a new component goes at the end, where the advisor just clicked "add".
    SELECT coalesce(max(c.order_index), -1) + 1 INTO v_next
      FROM public.trip_component c
     WHERE c.trip_id = p_trip_id;

    INSERT INTO public.trip_component (
        id, trip_id, kind, supplier_id, display_name,
        start_date, end_date, start_time, end_time, location, confirmation_number,
        cost_cents, commission_pct, commission_cents, currency, payload, order_index
    )
    VALUES (
        v_id, p_trip_id, p_kind, p_supplier_id, v_name,
        p_start_date, p_end_date, p_start_time, p_end_time, p_location, p_confirmation_number,
        coalesce(p_cost_cents, 0), p_commission_pct, coalesce(p_commission_cents, 0),
        -- THE TRIP'S CURRENCY, never the caller's. One trip, one currency — the guard on
        -- trip_component would refuse anything else anyway, and taking it as a parameter
        -- would invite a form to offer a choice that cannot be honoured.
        v_trip.currency,
        coalesce(p_payload, '{}'::jsonb), v_next
    );

    RETURN QUERY SELECT 'created'::text, v_id;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Archive — §3.4.12's "Remove from trip"
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.agent_archive_trip_component(
    p_trip_id      uuid,
    p_agent_id     uuid,
    p_component_id uuid
)
RETURNS TABLE (
    outcome      text,   -- 'archived' | 'noop'
    component_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_existing public.trip_component%ROWTYPE;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.agent a WHERE a.id = p_agent_id AND a.status <> 'archived'
    ) THEN
        RETURN;
    END IF;

    -- REMOVING A COMPONENT IS AN ARCHIVE, per Data-Model §20.1. A hard delete would take the
    -- itinerary activities that link to it through `itinerary_activity.component_id` with it,
    -- and an advisor who removed a flight would silently lose the day it was written into.
    SELECT c.* INTO v_existing
      FROM public.trip_component c
      JOIN public.trip t ON t.id = c.trip_id
     WHERE c.id = p_component_id
       AND c.trip_id = p_trip_id
       AND t.agent_id = p_agent_id
       AND t.archived_at IS NULL
     FOR UPDATE OF c;

    IF NOT FOUND THEN
        RETURN;
    END IF;

    IF v_existing.archived_at IS NOT NULL THEN
        RETURN QUERY SELECT 'noop'::text, v_existing.id;
        RETURN;
    END IF;

    UPDATE public.trip_component
       SET archived_at = now(), updated_at = now()
     WHERE id = v_existing.id;

    RETURN QUERY SELECT 'archived'::text, v_existing.id;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Reorder — §3.4.4's drag
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.agent_reorder_trip_components(
    p_trip_id      uuid,
    p_agent_id     uuid,
    p_component_ids uuid[]
)
RETURNS TABLE (outcome text, moved integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_live integer;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.agent a WHERE a.id = p_agent_id AND a.status <> 'archived'
    ) THEN
        RETURN;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.trip t
         WHERE t.id = p_trip_id AND t.agent_id = p_agent_id AND t.archived_at IS NULL
    ) THEN
        RETURN;
    END IF;

    -- THE LIST MUST BE THE WHOLE LIST. A partial order would leave the components it omitted
    -- holding indexes that collide with the ones it set, and the next read would interleave
    -- them in an order nobody chose. Refusing is better than a silent shuffle.
    SELECT count(*) INTO v_live
      FROM public.trip_component c
     WHERE c.trip_id = p_trip_id AND c.archived_at IS NULL;

    IF coalesce(cardinality(p_component_ids), 0) <> v_live THEN
        RAISE EXCEPTION
            'agent_reorder_trip_components needs every live component of the trip '
            '(got %, trip has %)', coalesce(cardinality(p_component_ids), 0), v_live;
    END IF;

    UPDATE public.trip_component c
       SET order_index = pos.idx - 1,
           updated_at = now()
      FROM unnest(p_component_ids) WITH ORDINALITY AS pos(id, idx)
     WHERE c.id = pos.id
       AND c.trip_id = p_trip_id
       AND c.archived_at IS NULL
       AND c.order_index IS DISTINCT FROM pos.idx - 1;

    GET DIAGNOSTICS v_live = ROW_COUNT;
    RETURN QUERY SELECT 'reordered'::text, v_live;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Grants
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE f text;
BEGIN
    FOREACH f IN ARRAY ARRAY[
        'public.agent_upsert_trip_component(uuid, uuid, uuid, component_kind, text, uuid, date, date, time, time, text, text, bigint, numeric, bigint, jsonb)',
        'public.agent_archive_trip_component(uuid, uuid, uuid)',
        'public.agent_reorder_trip_components(uuid, uuid, uuid[])'
    ]
    LOOP
        EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM public, anon, authenticated', f);
        EXECUTE format('GRANT  EXECUTE ON FUNCTION %s TO service_role', f);
    END LOOP;
END $$;

COMMIT;
