-- §3.4.14 Itinerary Editor — the day scaffold, the activities, and the generator.
--
-- ── WHAT THIS SCREEN IS FOR, AND WHY IT IS NOT §3.4.4 ───────────────────────────────────
--
-- §3.4.4's builder lists `trip_component` rows: what was booked, what it cost, what the
-- confirmation number is. This screen is the STORY told from them — `itinerary_day` and
-- `itinerary_activity`, which carry a client-facing title, prose, and "Gyasi's Tip". The
-- design prototype draws the day grouping inside the builder; Screen-Inventory lists them
-- as separate screens and the doc hierarchy puts the text above the drawing (recorded in
-- §3.4.4's amendment when the builder shipped).
--
-- The link between them is `itinerary_activity.component_id`, and it is one-directional:
-- an activity may point at a component, a component does not know its activity.
--
-- ── THE GENERATOR IS ADDITIVE AND IDEMPOTENT. THAT IS THE WHOLE DESIGN. ─────────────────
--
-- `agent_generate_itinerary` is the Key actions line's "Auto-generate", and the one thing
-- it must never do is overwrite prose. An advisor who rewrote "AA 1413 · MIA → MBJ" as
-- "Your flight to paradise" has done the work this screen exists for; a generator that
-- replaces it has destroyed the feature. So:
--
--   * It CREATES days the trip's date range needs and does not have.
--   * It ADDS one activity per component that has no activity pointing at it yet.
--   * It TOUCHES NO EXISTING ACTIVITY, ever — not the title, not the times, not the tip.
--
-- Run it twice and the second run does nothing. Run it after adding a flight and it adds
-- the flight. That is the only shape that is safe to put behind a button an advisor will
-- press without thinking.
--
-- WHAT IT DELIBERATELY DOES NOT GENERATE: an `insurance` component. A client's day-by-day
-- does not include "your policy is in effect" — it is a fact about the trip, not a thing
-- that happens on a morning. Every other kind gets an activity, `custom` included, because
-- a custom component is whatever the advisor said it was. An advisor who DOES want the
-- policy on the itinerary can add the activity by hand, and the generator will then leave
-- it alone like any other.
--
-- ── `itinerary.version` IS NOT AN OPTIMISTIC LOCK HERE ──────────────────────────────────
--
-- Data-Model §20.4 makes `version` optimistic concurrency, and `trip` and `client` writes
-- honour it. Gating a PER-ACTIVITY write on a WHOLE-ITINERARY version would be the wrong
-- granularity by a wide margin: editing day 1 and then day 2 would be a conflict with
-- yourself. What the column is for on this table is stated by the two beside it —
-- `published_at` and `last_published_at` — so it is BUMPED on every change and read by
-- §3.5's publish to answer "has this changed since the client last saw it".

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- Shared: the trip's itinerary row, created on first write
-- ─────────────────────────────────────────────────────────────────────────────

-- `itinerary` is 1:1 with `trip` (UNIQUE trip_id) and 24 of 27 seeded trips have none.
-- Every write below needs one, so every write below would otherwise carry the same
-- get-or-create. SECURITY DEFINER and never granted: it takes no agent and checks nothing,
-- so it must not be reachable from outside this file's functions.
CREATE OR REPLACE FUNCTION public.itinerary_for_trip(p_trip_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_id uuid;
BEGIN
    SELECT i.id INTO v_id FROM public.itinerary i WHERE i.trip_id = p_trip_id;
    IF v_id IS NOT NULL THEN RETURN v_id; END IF;

    v_id := gen_random_uuid();
    INSERT INTO public.itinerary (id, trip_id) VALUES (v_id, p_trip_id)
    -- A concurrent first write would violate the UNIQUE; take the winner's id rather than
    -- failing the caller for a race neither of them caused.
    ON CONFLICT (trip_id) DO NOTHING;

    SELECT i.id INTO v_id FROM public.itinerary i WHERE i.trip_id = p_trip_id;
    RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.itinerary_for_trip(uuid) FROM public, anon, authenticated;

-- `version` is a "changed since published" marker on this table, not a lock. One place to
-- bump it, so no write can forget.
CREATE OR REPLACE FUNCTION public.itinerary_touch(p_itinerary_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    UPDATE public.itinerary
       SET version = version + 1, updated_at = now()
     WHERE id = p_itinerary_id;
$$;

REVOKE EXECUTE ON FUNCTION public.itinerary_touch(uuid) FROM public, anon, authenticated;

-- `block_kind` from a clock time, so a generated activity lands where the prototype's
-- own fixtures put it: 06:40 and 09:00 in the morning, 15:00 in the afternoon.
-- No time at all is `all_day` rather than a guess.
CREATE OR REPLACE FUNCTION public.block_for_time(p_time time)
RETURNS block_kind
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
    SELECT CASE
        WHEN p_time IS NULL       THEN 'all_day'::block_kind
        WHEN p_time <  '12:00'    THEN 'morning'::block_kind
        WHEN p_time <  '17:00'    THEN 'afternoon'::block_kind
        ELSE 'evening'::block_kind
    END;
$$;

REVOKE EXECUTE ON FUNCTION public.block_for_time(time) FROM public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Days
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.agent_upsert_itinerary_day(
    p_trip_id  uuid,
    p_agent_id uuid,
    p_day_id   uuid,
    p_date     date,
    p_label    text DEFAULT NULL,
    p_summary  text DEFAULT NULL
)
RETURNS TABLE (outcome text, day_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_trip     public.trip%ROWTYPE;
    v_itin     uuid;
    v_existing public.itinerary_day%ROWTYPE;
    v_number   integer;
    v_id       uuid := gen_random_uuid();
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.agent a WHERE a.id = p_agent_id AND a.status <> 'archived'
    ) THEN
        RETURN;
    END IF;

    SELECT * INTO v_trip
      FROM public.trip t
     WHERE t.id = p_trip_id AND t.agent_id = p_agent_id AND t.archived_at IS NULL
     FOR UPDATE;

    IF NOT FOUND THEN RETURN; END IF;

    v_itin := public.itinerary_for_trip(p_trip_id);

    IF p_day_id IS NOT NULL THEN
        SELECT * INTO v_existing
          FROM public.itinerary_day d
         WHERE d.id = p_day_id
           -- SCOPED TO THIS ITINERARY, not just to the id — otherwise an advisor could
           -- edit any day they knew the id of by naming one of their own trips. The same
           -- hole §3.4.4's component upsert closed.
           AND d.itinerary_id = v_itin;

        IF NOT FOUND THEN RETURN; END IF;

        IF (v_existing.date, v_existing.label, v_existing.summary)
           IS NOT DISTINCT FROM (coalesce(p_date, v_existing.date), p_label, p_summary)
        THEN
            RETURN QUERY SELECT 'noop'::text, v_existing.id;
            RETURN;
        END IF;

        UPDATE public.itinerary_day
           SET date = coalesce(p_date, date), label = p_label, summary = p_summary
         WHERE id = v_existing.id;

        PERFORM public.itinerary_touch(v_itin);
        RETURN QUERY SELECT 'updated'::text, v_existing.id;
        RETURN;
    END IF;

    IF p_date IS NULL THEN
        RAISE EXCEPTION 'a new itinerary day needs a date — itinerary_day.date is NOT NULL';
    END IF;

    -- DAY NUMBER IS DERIVED FROM THE TRIP'S START, not from a count of existing days.
    -- A count breaks the moment a day is inserted between two others, and the UNIQUE on
    -- (itinerary_id, day_number) turns that into a constraint violation rather than a
    -- renumbering. Off the trip's range — or on a trip with no start date — it falls back
    -- to appending, because a number is required and any number beats refusing the write.
    IF v_trip.start_date IS NOT NULL AND p_date >= v_trip.start_date THEN
        v_number := (p_date - v_trip.start_date) + 1;
    ELSE
        v_number := NULL;
    END IF;

    IF v_number IS NULL OR EXISTS (
        SELECT 1 FROM public.itinerary_day d
         WHERE d.itinerary_id = v_itin AND d.day_number = v_number
    ) THEN
        SELECT coalesce(max(d.day_number), 0) + 1 INTO v_number
          FROM public.itinerary_day d WHERE d.itinerary_id = v_itin;
    END IF;

    INSERT INTO public.itinerary_day (id, itinerary_id, day_number, date, label, summary)
    VALUES (v_id, v_itin, v_number, p_date, p_label, p_summary);

    PERFORM public.itinerary_touch(v_itin);
    RETURN QUERY SELECT 'created'::text, v_id;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Activities
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.agent_upsert_itinerary_activity(
    p_trip_id             uuid,
    p_agent_id            uuid,
    p_activity_id         uuid,
    p_day_id              uuid,
    p_title               text,
    p_block               block_kind DEFAULT NULL,
    p_start_time          time       DEFAULT NULL,
    p_end_time            time       DEFAULT NULL,
    p_body                text       DEFAULT NULL,
    p_location            text       DEFAULT NULL,
    p_address             text       DEFAULT NULL,
    p_phone               text       DEFAULT NULL,
    p_confirmation_number text       DEFAULT NULL,
    p_gyasis_tip          text       DEFAULT NULL
)
RETURNS TABLE (outcome text, activity_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_itin     uuid;
    v_existing public.itinerary_activity%ROWTYPE;
    v_title    text := btrim(coalesce(p_title, ''));
    v_block    block_kind;
    v_next     integer;
    v_id       uuid := gen_random_uuid();
BEGIN
    IF v_title = '' THEN
        RAISE EXCEPTION 'an itinerary activity needs a title — it is NOT NULL and it is '
                        'the line the client reads';
    END IF;

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

    v_itin := public.itinerary_for_trip(p_trip_id);

    -- Derived when the caller does not say, so a form with a time and no block picker still
    -- lands the activity in the right part of the day.
    v_block := coalesce(p_block, public.block_for_time(p_start_time));

    IF p_activity_id IS NOT NULL THEN
        SELECT a.* INTO v_existing
          FROM public.itinerary_activity a
          JOIN public.itinerary_day d ON d.id = a.itinerary_day_id
         WHERE a.id = p_activity_id AND d.itinerary_id = v_itin
         FOR UPDATE OF a;

        IF NOT FOUND THEN RETURN; END IF;

        -- MOVING AN ACTIVITY BETWEEN DAYS IS AN EDIT, not a separate verb: the editor
        -- offers a day picker, and the day it names must belong to this itinerary.
        IF p_day_id IS NOT NULL AND p_day_id <> v_existing.itinerary_day_id THEN
            IF NOT EXISTS (
                SELECT 1 FROM public.itinerary_day d
                 WHERE d.id = p_day_id AND d.itinerary_id = v_itin
            ) THEN
                RETURN;
            END IF;
        END IF;

        IF (v_existing.itinerary_day_id, v_existing.block, v_existing.start_time,
            v_existing.end_time, v_existing.title, v_existing.body, v_existing.location,
            v_existing.address, v_existing.phone, v_existing.confirmation_number,
            v_existing.gyasis_tip)
           IS NOT DISTINCT FROM
           (coalesce(p_day_id, v_existing.itinerary_day_id), v_block, p_start_time,
            p_end_time, v_title, p_body, p_location, p_address, p_phone,
            p_confirmation_number, p_gyasis_tip)
        THEN
            RETURN QUERY SELECT 'noop'::text, v_existing.id;
            RETURN;
        END IF;

        UPDATE public.itinerary_activity
           SET itinerary_day_id = coalesce(p_day_id, itinerary_day_id),
               block = v_block,
               start_time = p_start_time,
               end_time = p_end_time,
               title = v_title,
               body = p_body,
               location = p_location,
               address = p_address,
               phone = p_phone,
               confirmation_number = p_confirmation_number,
               gyasis_tip = p_gyasis_tip,
               updated_at = now()
         WHERE id = v_existing.id;

        PERFORM public.itinerary_touch(v_itin);
        RETURN QUERY SELECT 'updated'::text, v_existing.id;
        RETURN;
    END IF;

    -- A create needs a day, and it must be one of ours.
    IF p_day_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.itinerary_day d
         WHERE d.id = p_day_id AND d.itinerary_id = v_itin
    ) THEN
        RETURN;
    END IF;

    SELECT coalesce(max(a.order_index), -1) + 1 INTO v_next
      FROM public.itinerary_activity a WHERE a.itinerary_day_id = p_day_id;

    INSERT INTO public.itinerary_activity (
        id, itinerary_day_id, block, start_time, end_time, title, body,
        location, address, phone, confirmation_number, gyasis_tip, order_index
    )
    VALUES (
        v_id, p_day_id, v_block, p_start_time, p_end_time, v_title, p_body,
        p_location, p_address, p_phone, p_confirmation_number, p_gyasis_tip, v_next
    );

    PERFORM public.itinerary_touch(v_itin);
    RETURN QUERY SELECT 'created'::text, v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.agent_delete_itinerary_activity(
    p_trip_id     uuid,
    p_agent_id    uuid,
    p_activity_id uuid
)
RETURNS TABLE (outcome text, activity_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_itin  uuid;
    v_found uuid;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.agent a WHERE a.id = p_agent_id AND a.status <> 'archived'
    ) THEN
        RETURN;
    END IF;

    SELECT i.id INTO v_itin
      FROM public.itinerary i
      JOIN public.trip t ON t.id = i.trip_id
     WHERE i.trip_id = p_trip_id AND t.agent_id = p_agent_id AND t.archived_at IS NULL;

    IF v_itin IS NULL THEN RETURN; END IF;

    -- A HARD DELETE. `itinerary_activity` is not on Data-Model §20.1's soft-delete list and
    -- nothing references it — the FK runs the other way, to `trip_component`, so removing
    -- the activity leaves the booking untouched. That is the right asymmetry: the prose is
    -- disposable and the booking is not.
    DELETE FROM public.itinerary_activity a
     USING public.itinerary_day d
     WHERE a.id = p_activity_id
       AND d.id = a.itinerary_day_id
       AND d.itinerary_id = v_itin
    RETURNING a.id INTO v_found;

    IF v_found IS NULL THEN RETURN; END IF;

    PERFORM public.itinerary_touch(v_itin);
    RETURN QUERY SELECT 'deleted'::text, v_found;
END;
$$;

CREATE OR REPLACE FUNCTION public.agent_reorder_itinerary_activities(
    p_trip_id      uuid,
    p_agent_id     uuid,
    p_day_id       uuid,
    p_activity_ids uuid[]
)
RETURNS TABLE (outcome text, moved integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_itin uuid;
    v_live integer;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.agent a WHERE a.id = p_agent_id AND a.status <> 'archived'
    ) THEN
        RETURN;
    END IF;

    SELECT i.id INTO v_itin
      FROM public.itinerary i
      JOIN public.trip t ON t.id = i.trip_id
     WHERE i.trip_id = p_trip_id AND t.agent_id = p_agent_id AND t.archived_at IS NULL;

    IF v_itin IS NULL THEN RETURN; END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.itinerary_day d
         WHERE d.id = p_day_id AND d.itinerary_id = v_itin
    ) THEN
        RETURN;
    END IF;

    -- THE LIST MUST BE THE WHOLE DAY. A partial order leaves the activities it omitted
    -- holding indexes that collide with the ones it set, and the next read interleaves them
    -- in an order nobody chose — the same refusal §3.4.4's component reorder makes, scoped
    -- to one day rather than the whole trip.
    SELECT count(*) INTO v_live
      FROM public.itinerary_activity a WHERE a.itinerary_day_id = p_day_id;

    IF coalesce(cardinality(p_activity_ids), 0) <> v_live THEN
        RAISE EXCEPTION
            'agent_reorder_itinerary_activities needs every activity on the day '
            '(got %, the day has %)', coalesce(cardinality(p_activity_ids), 0), v_live;
    END IF;

    UPDATE public.itinerary_activity a
       SET order_index = pos.idx - 1, updated_at = now()
      FROM unnest(p_activity_ids) WITH ORDINALITY AS pos(id, idx)
     WHERE a.id = pos.id
       AND a.itinerary_day_id = p_day_id
       AND a.order_index IS DISTINCT FROM pos.idx - 1;

    GET DIAGNOSTICS v_live = ROW_COUNT;
    IF v_live > 0 THEN PERFORM public.itinerary_touch(v_itin); END IF;

    RETURN QUERY SELECT 'reordered'::text, v_live;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Auto-generate — additive, idempotent, never destructive
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.agent_generate_itinerary(
    p_trip_id  uuid,
    p_agent_id uuid
)
RETURNS TABLE (
    outcome         text,      -- 'generated' | 'noop' | 'no_dates'
    days_added      integer,
    activities_added integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_trip   public.trip%ROWTYPE;
    v_itin   uuid;
    v_days   integer := 0;
    v_acts   integer := 0;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.agent a WHERE a.id = p_agent_id AND a.status <> 'archived'
    ) THEN
        RETURN;
    END IF;

    SELECT * INTO v_trip
      FROM public.trip t
     WHERE t.id = p_trip_id AND t.agent_id = p_agent_id AND t.archived_at IS NULL
     FOR UPDATE;

    IF NOT FOUND THEN RETURN; END IF;

    -- NO DATES, NO SCAFFOLD, AND SAY SO. `itinerary_day.date` is NOT NULL and day numbers
    -- come from the trip's start, so a trip with no dates cannot have days generated. An
    -- outcome the form can act on beats inventing a range from today.
    IF v_trip.start_date IS NULL OR v_trip.end_date IS NULL THEN
        RETURN QUERY SELECT 'no_dates'::text, 0, 0;
        RETURN;
    END IF;

    v_itin := public.itinerary_for_trip(p_trip_id);

    -- ── 1. Days the trip's range needs and does not have ──────────────────
    WITH wanted AS (
        SELECT d::date AS the_date,
               (d::date - v_trip.start_date) + 1 AS day_number
          FROM generate_series(v_trip.start_date, v_trip.end_date, interval '1 day') AS d
    ),
    inserted AS (
        INSERT INTO public.itinerary_day (id, itinerary_id, day_number, date)
        SELECT gen_random_uuid(), v_itin, w.day_number, w.the_date
          FROM wanted w
         WHERE NOT EXISTS (
            -- BY DATE, not by day_number. A day whose date was moved by hand still covers
            -- that date, and matching on the number would insert a duplicate for it and
            -- violate the UNIQUE.
            SELECT 1 FROM public.itinerary_day d
             WHERE d.itinerary_id = v_itin AND d.date = w.the_date
         )
           AND NOT EXISTS (
            SELECT 1 FROM public.itinerary_day d
             WHERE d.itinerary_id = v_itin AND d.day_number = w.day_number
         )
        RETURNING 1
    )
    SELECT count(*) INTO v_days FROM inserted;

    -- ── 2. One activity per component that has none ───────────────────────
    WITH candidates AS (
        SELECT c.id, c.kind, c.display_name, c.start_date, c.start_time, c.end_time,
               c.location, c.confirmation_number
          FROM public.trip_component c
         WHERE c.trip_id = p_trip_id
           AND c.archived_at IS NULL
           -- NOT `insurance`. A client's day-by-day does not include "your policy is in
           -- effect" — it is a fact about the trip, not a thing that happens on a morning.
           -- An advisor who wants it there adds the activity by hand, and this generator
           -- will then leave it alone like any other.
           AND c.kind <> 'insurance'
           -- THE IDEMPOTENCE, and the whole safety property: a component that already has
           -- an activity is skipped, whatever the advisor has since written in it.
           AND NOT EXISTS (
            SELECT 1 FROM public.itinerary_activity a WHERE a.component_id = c.id
         )
           -- And it needs a day to land on.
           AND EXISTS (
            SELECT 1 FROM public.itinerary_day d
             WHERE d.itinerary_id = v_itin AND d.date = c.start_date
         )
    ),
    placed AS (
        SELECT cd.*,
               (SELECT d.id FROM public.itinerary_day d
                 WHERE d.itinerary_id = v_itin AND d.date = cd.start_date
                 LIMIT 1) AS day_id
          FROM candidates cd
    ),
    numbered AS (
        SELECT p.*,
               (SELECT coalesce(max(a.order_index), -1) FROM public.itinerary_activity a
                 WHERE a.itinerary_day_id = p.day_id)
               + row_number() OVER (PARTITION BY p.day_id
                                    ORDER BY p.start_time NULLS LAST, p.display_name)
               AS order_index
          FROM placed p
    ),
    inserted AS (
        INSERT INTO public.itinerary_activity (
            id, itinerary_day_id, block, start_time, end_time, title,
            location, confirmation_number, component_id, order_index
        )
        SELECT gen_random_uuid(), n.day_id, public.block_for_time(n.start_time),
               n.start_time, n.end_time, n.display_name,
               n.location, n.confirmation_number, n.id, n.order_index
          FROM numbered n
        RETURNING 1
    )
    SELECT count(*) INTO v_acts FROM inserted;

    -- NOTHING TO DO IS NOT AN ERROR, and it is the answer a second press gives. The form
    -- says "already up to date" rather than claiming to have generated nothing.
    IF v_days = 0 AND v_acts = 0 THEN
        RETURN QUERY SELECT 'noop'::text, 0, 0;
        RETURN;
    END IF;

    PERFORM public.itinerary_touch(v_itin);
    RETURN QUERY SELECT 'generated'::text, v_days, v_acts;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Grants
-- ─────────────────────────────────────────────────────────────────────────────

-- ALL service_role ONLY. Each takes `p_agent_id` as trusted input, so a client-role grant
-- would be an act-as-any-advisor primitive with no `audit_event` behind it.
DO $$
DECLARE f text;
BEGIN
    FOREACH f IN ARRAY ARRAY[
        'public.agent_upsert_itinerary_day(uuid, uuid, uuid, date, text, text)',
        'public.agent_upsert_itinerary_activity(uuid, uuid, uuid, uuid, text, block_kind, time, time, text, text, text, text, text, text)',
        'public.agent_delete_itinerary_activity(uuid, uuid, uuid)',
        'public.agent_reorder_itinerary_activities(uuid, uuid, uuid, uuid[])',
        'public.agent_generate_itinerary(uuid, uuid)'
    ]
    LOOP
        EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM public, anon, authenticated', f);
        EXECUTE format('GRANT  EXECUTE ON FUNCTION %s TO service_role', f);
    END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Assertions — restated, because a DO block sees only the catalog of its own day
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE missing text;
BEGIN
    SELECT string_agg(f, ', ') INTO missing
      FROM unnest(ARRAY['agent_upsert_itinerary_day', 'agent_upsert_itinerary_activity',
                        'agent_delete_itinerary_activity',
                        'agent_reorder_itinerary_activities', 'agent_generate_itinerary',
                        'itinerary_for_trip', 'itinerary_touch', 'block_for_time']) AS f
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
       AND p.proname IN ('agent_upsert_itinerary_day', 'agent_upsert_itinerary_activity',
                         'agent_delete_itinerary_activity',
                         'agent_reorder_itinerary_activities', 'agent_generate_itinerary',
                         'itinerary_for_trip', 'itinerary_touch', 'block_for_time')
       AND (has_function_privilege('anon', p.oid, 'EXECUTE')
         OR has_function_privilege('authenticated', p.oid, 'EXECUTE'));
    IF leaked IS NOT NULL THEN
        RAISE EXCEPTION 'a client role can execute an itinerary write: %', leaked;
    END IF;
END $$;

DO $$
DECLARE bad text;
BEGIN
    SELECT string_agg(p.proname, ', ') INTO bad
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('agent_upsert_itinerary_day', 'agent_upsert_itinerary_activity',
                         'agent_delete_itinerary_activity',
                         'agent_reorder_itinerary_activities', 'agent_generate_itinerary',
                         'itinerary_for_trip', 'itinerary_touch', 'block_for_time')
       AND NOT EXISTS (
         SELECT 1 FROM unnest(coalesce(p.proconfig, ARRAY[]::text[])) AS c
          WHERE c = 'search_path=public, pg_temp');
    IF bad IS NOT NULL THEN
        RAISE EXCEPTION 'search_path not pinned to "public, pg_temp" on: %', bad;
    END IF;
END $$;

COMMIT;
