-- §3.4.13 Trip Template Library: `trip_template` gets a producer, and `trip.template_id`
-- gets a meaning.
--
-- ── WHAT WAS HERE ───────────────────────────────────────────────────────────────────────
--
-- `trip_template` has existed since the initial migration with EIGHT columns, RLS enabled,
-- a place in the agent-domain lockdown list, and ZERO rows. Nothing reads it and nothing
-- writes it. `trip.template_id` has existed just as long, references it, and has never been
-- set. Two shipped columns and a shipped table waiting for this screen.
--
-- Three deferrals point here — `BUILDER_COPY.templatesDeferred`, `NEW_TRIP_COPY`'s
-- `templateDeferred`, and `AGENT_COPY.duplicateTripDeferred`, the last of which was
-- REPOINTED at §3.4.13 during §3.4.4 precisely because duplicating a trip and applying a
-- template are the same mechanism. All three come due here.
--
-- ── WHAT A TEMPLATE CAPTURES (Gyasi, 2026-09-28) ────────────────────────────────────────
--
-- Asked what should come across when a trip is saved and reused: **the bookings plus the
-- day-by-day**. Not the payment schedule — that was the third option and it was declined,
-- so milestones are deliberately absent from the payload and from this migration.
--
-- ── DATES BECOME OFFSETS, WHICH IS THE WHOLE ENGINEERING PROBLEM ────────────────────────
--
-- A template cannot carry absolute dates. A Sandals honeymoon saved from an August trip and
-- applied to a March one must produce March dates, so every date in the payload is stored
-- as an INTEGER OFFSET from the source trip's `start_date`, and apply recomputes it against
-- the destination trip's. TIMES are stored as-is: a 14:00 check-in is 14:00 in March too.
--
-- A source trip with no `start_date` yields NULL offsets, and apply then leaves those dates
-- NULL rather than inventing them. An inquiry with no dates is a real state (§3.4.1 has a
-- fixture for it) and saving one as a template is not an error — the bookings and the prose
-- are still worth keeping.
--
-- ── WHAT IS DELIBERATELY NOT CAPTURED, AND WHY EACH ─────────────────────────────────────
--
-- The payload is an explicit allow-list, the way `_shared/component.ts` is, for the reason
-- Data-Model §23 records: a jsonb blob that copies whatever it finds grows fields nobody
-- chose. Excluded on purpose:
--
--   confirmation_number   A booking reference belongs to ONE booking. Copying Sandals'
--                         confirmation from last August's honeymoon into next March's trip
--                         would put a false confirmation in front of a traveler — on both
--                         the component and the itinerary activity.
--   api_source /          This trip's API booking, not a reusable fact.
--   api_reference
--   component_id          On an activity: points at the SOURCE trip's component row. Apply
--                         re-links nothing; §3.4.14's generator is what associates an
--                         activity with a component, and it can be run afterwards.
--   itinerary_day.date    Replaced by the offset. See above.
--   weather_forecast      Per-trip, per-date, and Data-Model §16 already admits it is
--                         agent-authored rather than fetched.
--   cover_image_url,      Publication state belongs to a trip, not to a pattern.
--   published_at,
--   last_published_at
--   payment milestones    Declined. See above.
--
-- Kept, though it is prose: `itinerary.intro_note` and `closing_note`. They frame a
-- resort rather than a party, which is exactly the reuse the day-by-day answer asked for.
--
-- ── `trip.template_id` IS THE IDEMPOTENCY KEY ───────────────────────────────────────────
--
-- Apply is refused outright on a trip that already carries a `template_id`, and sets it on
-- success. That gives the column the meaning it has never had ("this trip was seeded from
-- this pattern"), makes a double-click a no-op instead of a duplicated set of components,
-- and needs no new column to do it. A trip built from a template is built from ONE.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Reads
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.agent_templates()
RETURNS TABLE (
    template_id      uuid,
    name             text,
    description      text,
    trip_type        trip_type,
    component_count  integer,
    day_count        integer,
    -- Sum of the payload's component costs, so the card can show what the pattern is worth
    -- without applying it. A digit-string, like every other money column on this side:
    -- PostgREST serialises bigint as a JSON number and loses precision past 2^53.
    value_cents      text,
    -- The prototype's "14× used" chip. Derived from trip.template_id, which this migration
    -- gives a producer — not a stored counter, so it cannot drift from the trips.
    times_used       integer,
    created_at       timestamptz,
    updated_at       timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    WITH me AS (
        SELECT a.id AS agent_id FROM public.agent a WHERE a.id = public.current_agent_id()
    )
    SELECT
        t.id,
        t.name,
        t.description,
        t.trip_type,
        coalesce(jsonb_array_length(t.payload -> 'components'), 0),
        coalesce(jsonb_array_length(t.payload -> 'days'), 0),
        coalesce((
            SELECT sum((c ->> 'cost_cents')::bigint)
              FROM jsonb_array_elements(coalesce(t.payload -> 'components', '[]'::jsonb)) c
        ), 0)::text,
        (SELECT count(*)::integer FROM public.trip tr
          WHERE tr.template_id = t.id AND tr.archived_at IS NULL),
        t.created_at,
        t.updated_at
      FROM public.trip_template t
     CROSS JOIN me
     WHERE t.agent_id = me.agent_id
       AND t.archived_at IS NULL
     ORDER BY t.updated_at DESC, t.id;
$$;

COMMENT ON FUNCTION public.agent_templates() IS
    'Screen 3.4.13''s grid. `times_used` is DERIVED from trip.template_id rather than '
    'stored, so it cannot drift from the trips that actually used the pattern. '
    '`component_count`, `day_count` and `value_cents` are read out of the payload, so a '
    'card needs no second round trip and applying nothing is required to see the shape.';

-- The payload itself, for the apply preview and the edit form. Separate from the grid
-- because the grid renders a dozen cards and none of them needs the whole blob.
CREATE OR REPLACE FUNCTION public.agent_template(p_template_id uuid)
RETURNS TABLE (
    template_id uuid,
    name        text,
    description text,
    trip_type   trip_type,
    payload     jsonb,
    times_used  integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT t.id, t.name, t.description, t.trip_type, t.payload,
           (SELECT count(*)::integer FROM public.trip tr
             WHERE tr.template_id = t.id AND tr.archived_at IS NULL)
      FROM public.trip_template t
     WHERE t.id = p_template_id
       AND t.agent_id = public.current_agent_id()
       AND t.archived_at IS NULL;
$$;

COMMENT ON FUNCTION public.agent_template(uuid) IS
    'One template and its whole payload. Zero rows for "no such template" and "not yours" '
    'alike, so an id cannot be probed — the posture every §3.x read takes.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Save a trip as a template
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.agent_save_trip_as_template(
    p_trip_id     uuid,
    p_agent_id    uuid,
    p_name        text,
    p_description text DEFAULT NULL
)
RETURNS TABLE (template_id uuid, components_saved integer, days_saved integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_trip        public.trip;
    v_template_id uuid := gen_random_uuid();
    v_payload     jsonb;
    v_components  integer;
    v_days        integer;
BEGIN
    -- `p_agent_id` is trusted input; the grant is why that is safe. Ownership is still
    -- checked, because a trusted actor id is not a licence to read another advisor's trip.
    SELECT * INTO v_trip FROM public.trip t
     WHERE t.id = p_trip_id AND t.agent_id = p_agent_id AND t.archived_at IS NULL;
    IF NOT FOUND THEN
        RETURN;  -- zero rows: "no such trip" and "not yours", indistinguishable
    END IF;

    IF p_name IS NULL OR btrim(p_name) = '' THEN
        RAISE EXCEPTION 'a template needs a name';
    END IF;

    -- THE ALLOW-LIST. Every key is named; nothing is copied because it happened to be
    -- there. `start_day` / `end_day` are integer offsets from the trip's own start_date,
    -- which is what lets the same pattern produce March dates in March.
    SELECT jsonb_build_object(
        'version', 1,
        'traveler_count', v_trip.traveler_count,
        'destinations', to_jsonb(coalesce(v_trip.destinations, ARRAY[]::text[])),
        'intro_note',   (SELECT i.intro_note   FROM public.itinerary i WHERE i.trip_id = p_trip_id),
        'closing_note', (SELECT i.closing_note FROM public.itinerary i WHERE i.trip_id = p_trip_id),
        'components', coalesce((
            SELECT jsonb_agg(jsonb_build_object(
                       'kind',             tc.kind,
                       'display_name',     tc.display_name,
                       'supplier_id',      tc.supplier_id,
                       'start_day',        (tc.start_date - v_trip.start_date),
                       'end_day',          (tc.end_date   - v_trip.start_date),
                       'start_time',       tc.start_time,
                       'end_time',         tc.end_time,
                       'location',         tc.location,
                       'cost_cents',       tc.cost_cents,
                       'commission_pct',   tc.commission_pct,
                       'commission_cents', tc.commission_cents,
                       'currency',         tc.currency,
                       'payload',          tc.payload,
                       'order_index',      tc.order_index
                   ) ORDER BY tc.order_index, tc.id)
              FROM public.trip_component tc
             WHERE tc.trip_id = p_trip_id AND tc.archived_at IS NULL
        ), '[]'::jsonb),
        'days', coalesce((
            SELECT jsonb_agg(jsonb_build_object(
                       'day_number', d.day_number,
                       'day_offset', (d.date - v_trip.start_date),
                       'label',      d.label,
                       'summary',    d.summary,
                       'activities', coalesce((
                           SELECT jsonb_agg(jsonb_build_object(
                                      'block',       act.block,
                                      'start_time',  act.start_time,
                                      'end_time',    act.end_time,
                                      'title',       act.title,
                                      'body',        act.body,
                                      'location',    act.location,
                                      'address',     act.address,
                                      'phone',       act.phone,
                                      'gyasis_tip',  act.gyasis_tip,
                                      'order_index', act.order_index
                                  ) ORDER BY act.order_index, act.id)
                             FROM public.itinerary_activity act
                            WHERE act.itinerary_day_id = d.id
                       ), '[]'::jsonb)
                   ) ORDER BY d.day_number, d.id)
              FROM public.itinerary_day d
              JOIN public.itinerary i ON i.id = d.itinerary_id
             WHERE i.trip_id = p_trip_id
        ), '[]'::jsonb)
    ) INTO v_payload;

    INSERT INTO public.trip_template (id, agent_id, name, description, trip_type, payload)
    VALUES (v_template_id, p_agent_id, btrim(p_name),
            nullif(btrim(coalesce(p_description, '')), ''), v_trip.trip_type, v_payload);

    v_components := jsonb_array_length(v_payload -> 'components');
    v_days       := jsonb_array_length(v_payload -> 'days');

    RETURN QUERY SELECT v_template_id, v_components, v_days;
END;
$$;

COMMENT ON FUNCTION public.agent_save_trip_as_template(uuid, uuid, text, text) IS
    'Screen 3.4.13''s "create from existing trip", and the mechanism '
    'AGENT_COPY.duplicateTripDeferred was repointed here for. Snapshots components and the '
    'day-by-day with every DATE converted to an integer offset from the trip''s start, so '
    'the same pattern produces the right dates whenever it is applied. Confirmation '
    'numbers, api_source/api_reference and activity component_id are deliberately NOT '
    'captured: a booking reference belongs to one booking, and copying one forward puts a '
    'false confirmation in front of a traveler.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Edit and retire
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.agent_update_template(
    p_template_id uuid,
    p_agent_id    uuid,
    p_name        text,
    p_description text DEFAULT NULL
)
RETURNS TABLE (outcome text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_name text := btrim(coalesce(p_name, ''));
    v_desc text := nullif(btrim(coalesce(p_description, '')), '');
    v_hit  boolean;
BEGIN
    IF v_name = '' THEN
        RAISE EXCEPTION 'a template needs a name';
    END IF;

    -- NAME AND DESCRIPTION ONLY. The payload is not editable here on purpose: it is a
    -- snapshot of a real trip, and hand-editing a components array in a jsonb column is how
    -- you get a template that no trip ever looked like. Changing the pattern means saving a
    -- new one from a trip that has the shape you want — which is also the only path that
    -- keeps the date offsets consistent.
    UPDATE public.trip_template
       SET name        = v_name,
           description = v_desc,
           updated_at  = now()
     WHERE id = p_template_id
       AND agent_id = p_agent_id
       AND archived_at IS NULL
       AND (name IS DISTINCT FROM v_name OR description IS DISTINCT FROM v_desc);

    IF FOUND THEN
        RETURN QUERY SELECT 'changed'::text;
        RETURN;
    END IF;

    SELECT true INTO v_hit FROM public.trip_template
     WHERE id = p_template_id AND agent_id = p_agent_id AND archived_at IS NULL;

    -- 'noop' and 'not_found' are distinguished for the caller's benefit but say nothing an
    -- id-prober can use: both are reachable only with a template this agent already owns.
    RETURN QUERY SELECT CASE WHEN v_hit THEN 'noop' ELSE 'not_found' END::text;
END;
$$;

COMMENT ON FUNCTION public.agent_update_template(uuid, uuid, text, text) IS
    'Rename or re-describe a template. The PAYLOAD is not editable: it is a snapshot of a '
    'real trip, and hand-editing it is how a template comes to describe a trip nobody ever '
    'booked. Re-shaping a pattern means saving a new one.';

-- Soft delete. `trip_template.archived_at` already exists, and Data-Model §20.1 lists this
-- table, so a hard delete would also break every `trip.template_id` pointing at it — the
-- FK has no ON DELETE clause, so the delete would simply fail on any template ever used.
CREATE OR REPLACE FUNCTION public.agent_archive_template(
    p_template_id uuid,
    p_agent_id    uuid
)
RETURNS TABLE (outcome text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    UPDATE public.trip_template
       SET archived_at = now(), updated_at = now()
     WHERE id = p_template_id AND agent_id = p_agent_id AND archived_at IS NULL;

    IF FOUND THEN
        RETURN QUERY SELECT 'archived'::text;
    ELSE
        RETURN QUERY SELECT 'not_found'::text;
    END IF;
END;
$$;

COMMENT ON FUNCTION public.agent_archive_template(uuid, uuid) IS
    'Soft delete, per Data-Model §20.1. A hard delete would fail outright on any template '
    'a trip has ever used: trip.template_id references this table with no ON DELETE clause. '
    'Archiving keeps the trips readable and drops the row out of agent_templates().';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Apply
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.agent_apply_template(
    p_template_id uuid,
    p_trip_id     uuid,
    p_agent_id    uuid
)
RETURNS TABLE (
    outcome            text,     -- 'applied' | 'already_applied' | 'not_found'
    components_added   integer,
    days_added         integer,
    activities_added   integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_trip         public.trip;
    v_payload      jsonb;
    v_itinerary_id uuid;
    v_order_base   integer;
    v_components   integer := 0;
    v_days         integer := 0;
    v_activities   integer := 0;
BEGIN
    SELECT * INTO v_trip FROM public.trip t
     WHERE t.id = p_trip_id AND t.agent_id = p_agent_id AND t.archived_at IS NULL;
    IF NOT FOUND THEN
        RETURN QUERY SELECT 'not_found'::text, 0, 0, 0;
        RETURN;
    END IF;

    -- IDEMPOTENCY, on a column that already existed and had never been written.
    -- A double-click, a retried request or a second tab all land here and write nothing.
    -- A trip seeded from a pattern was seeded from ONE.
    IF v_trip.template_id IS NOT NULL THEN
        RETURN QUERY SELECT 'already_applied'::text, 0, 0, 0;
        RETURN;
    END IF;

    SELECT t.payload INTO v_payload FROM public.trip_template t
     WHERE t.id = p_template_id AND t.agent_id = p_agent_id AND t.archived_at IS NULL;
    IF v_payload IS NULL THEN
        RETURN QUERY SELECT 'not_found'::text, 0, 0, 0;
        RETURN;
    END IF;

    -- Append, never overwrite. A trip may already carry a component the advisor added by
    -- hand before reaching for the pattern, and its order_index must keep its place.
    SELECT coalesce(max(tc.order_index), -1) + 1 INTO v_order_base
      FROM public.trip_component tc WHERE tc.trip_id = p_trip_id;

    -- ── Components ────────────────────────────────────────────────────────────
    --
    -- `v_trip.currency`, NOT the payload's. trip_component_currency_matches_trip refuses a
    -- child whose currency differs from its trip's, and taking the trip's own value means a
    -- template saved before 20260930100000 pinned everything to USD cannot fail the guard.
    WITH src AS (
        SELECT * FROM jsonb_to_recordset(coalesce(v_payload -> 'components', '[]'::jsonb))
            AS c(kind component_kind, display_name text, supplier_id uuid,
                 start_day integer, end_day integer, start_time time, end_time time,
                 location text, cost_cents bigint, commission_pct numeric,
                 commission_cents bigint, payload jsonb, order_index integer)
    ), ins AS (
        INSERT INTO public.trip_component
            (id, trip_id, kind, supplier_id, display_name, start_date, end_date,
             start_time, end_time, location, cost_cents, commission_pct, commission_cents,
             currency, payload, order_index)
        SELECT gen_random_uuid(), p_trip_id, c.kind, c.supplier_id, c.display_name,
               -- NULL offsets stay NULL dates. A template saved from a dateless inquiry
               -- keeps its bookings and its prose and invents no calendar.
               CASE WHEN c.start_day IS NOT NULL AND v_trip.start_date IS NOT NULL
                    THEN v_trip.start_date + c.start_day END,
               CASE WHEN c.end_day IS NOT NULL AND v_trip.start_date IS NOT NULL
                    THEN v_trip.start_date + c.end_day END,
               c.start_time, c.end_time, c.location,
               coalesce(c.cost_cents, 0), c.commission_pct, coalesce(c.commission_cents, 0),
               v_trip.currency, coalesce(c.payload, '{}'::jsonb),
               v_order_base + coalesce(c.order_index, 0)
          FROM src c
        RETURNING 1
    )
    SELECT count(*)::integer INTO v_components FROM ins;

    -- ── The day-by-day ───────────────────────────────────────────────────────
    --
    -- GATED ON THE TRIP HAVING A START DATE, because `itinerary_day.date` is NOT NULL.
    -- A day-by-day is a calendar, and a trip with no dates has no calendar to hang one on.
    -- The components still land — an undated inquiry is worth seeding with its bookings —
    -- and `days_added` comes back 0, which is the honest count rather than a failure.
    -- Applying again once the dates are set is refused by the template_id guard, so the
    -- advisor runs §3.4.14's generator, which is what builds a day-by-day from components.
    IF jsonb_array_length(coalesce(v_payload -> 'days', '[]'::jsonb)) > 0
       AND v_trip.start_date IS NOT NULL THEN
        v_itinerary_id := public.itinerary_for_trip(p_trip_id);

        -- Framing prose, only into an empty field. An advisor who has already written an
        -- intro for this trip outranks a pattern.
        UPDATE public.itinerary
           SET intro_note   = coalesce(intro_note,   v_payload ->> 'intro_note'),
               closing_note = coalesce(closing_note, v_payload ->> 'closing_note')
         WHERE id = v_itinerary_id;

        -- ADDITIVE AND IDEMPOTENT, the same property §3.4.14's generator has and for the
        -- same reason: a day the advisor has already written is a day this must not touch.
        -- Matched on day_number, which is what the payload carries as the pattern's own
        -- ordering; the DATE is recomputed from the destination trip.
        WITH src AS (
            SELECT * FROM jsonb_to_recordset(v_payload -> 'days')
                AS d(day_number integer, day_offset integer, label text, summary text,
                     activities jsonb)
        ), fresh AS (
            SELECT d.* FROM src d
             WHERE NOT EXISTS (
                SELECT 1 FROM public.itinerary_day e
                 WHERE e.itinerary_id = v_itinerary_id AND e.day_number = d.day_number)
        ), ins AS (
            INSERT INTO public.itinerary_day
                (id, itinerary_id, day_number, date, label, summary)
            SELECT gen_random_uuid(), v_itinerary_id, f.day_number,
                   -- NOT NULL on the column, and the branch above guarantees a start_date.
                   -- `day_offset` can still be NULL if the SOURCE trip had no dates, so it
                   -- falls back to the day_number, which is the pattern's own ordering.
                   v_trip.start_date + coalesce(f.day_offset, f.day_number - 1),
                   f.label, f.summary
              FROM fresh f
            RETURNING id, day_number
        ), acts AS (
            INSERT INTO public.itinerary_activity
                (id, itinerary_day_id, block, start_time, end_time, title, body,
                 location, address, phone, gyasis_tip, order_index)
            SELECT gen_random_uuid(), i.id, a.block, a.start_time, a.end_time,
                   a.title, a.body, a.location, a.address, a.phone, a.gyasis_tip,
                   coalesce(a.order_index, 0)
              FROM ins i
              JOIN fresh f ON f.day_number = i.day_number
             CROSS JOIN LATERAL jsonb_to_recordset(coalesce(f.activities, '[]'::jsonb))
                AS a(block block_kind, start_time time, end_time time, title text,
                     body text, location text, address text, phone text,
                     gyasis_tip text, order_index integer)
            RETURNING 1
        )
        SELECT (SELECT count(*)::integer FROM ins),
               (SELECT count(*)::integer FROM acts)
          INTO v_days, v_activities;

        PERFORM public.itinerary_touch(v_itinerary_id);
    END IF;

    -- The trip-level defaults, and the idempotency key. `traveler_count` and
    -- `destinations` are only filled where the trip has nothing: a pattern supplies a
    -- starting point, it does not overrule what the advisor already typed.
    UPDATE public.trip
       SET template_id    = p_template_id,
           traveler_count = CASE WHEN coalesce(traveler_count, 0) <= 1
                                 THEN coalesce((v_payload ->> 'traveler_count')::integer,
                                               traveler_count)
                                 ELSE traveler_count END,
           destinations   = CASE WHEN coalesce(array_length(destinations, 1), 0) = 0
                                 THEN coalesce(
                                        (SELECT array_agg(x #>> '{}')
                                           FROM jsonb_array_elements(
                                                  coalesce(v_payload -> 'destinations',
                                                           '[]'::jsonb)) x),
                                        destinations)
                                 ELSE destinations END,
           updated_at     = now(),
           version        = version + 1
     WHERE id = p_trip_id;

    RETURN QUERY SELECT 'applied'::text, v_components, v_days, v_activities;
END;
$$;

COMMENT ON FUNCTION public.agent_apply_template(uuid, uuid, uuid) IS
    'Seed a trip from a pattern (§3.4.13''s "Use", and §3.4.3''s "From template"). '
    'ADDITIVE: appends components after whatever is already there and creates only the '
    'itinerary days whose day_number is missing, so a day the advisor has written cannot be '
    'overwritten — the property §3.4.14''s generator has, for the same reason. IDEMPOTENT '
    'on trip.template_id: a trip that already carries one answers ''already_applied'' and '
    'writes nothing. Date offsets in the payload are resolved against THIS trip''s '
    'start_date, and a trip with no start_date gets NULL dates rather than invented ones.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Grants
-- ─────────────────────────────────────────────────────────────────────────────

-- Reads: the agent, through the accessor. Writes: service_role ONLY, because every one
-- takes `p_agent_id` as trusted input, and a client-role grant on one of those is an
-- act-as-any-agent primitive with no audit row.
DO $$
DECLARE f text;
BEGIN
    FOREACH f IN ARRAY ARRAY[
        'public.agent_templates()',
        'public.agent_template(uuid)'
    ]
    LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM public, anon', f);
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f);
    END LOOP;

    FOREACH f IN ARRAY ARRAY[
        'public.agent_save_trip_as_template(uuid, uuid, text, text)',
        'public.agent_update_template(uuid, uuid, text, text)',
        'public.agent_archive_template(uuid, uuid)',
        'public.agent_apply_template(uuid, uuid, uuid)'
    ]
    LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM public, anon, authenticated', f);
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f);
    END LOOP;
END $$;

-- ── ASSERTIONS ───────────────────────────────────────────────────────────────────

DO $$
DECLARE
    reads   text[] := ARRAY['agent_templates', 'agent_template'];
    writes  text[] := ARRAY['agent_save_trip_as_template', 'agent_update_template',
                            'agent_archive_template', 'agent_apply_template'];
    leaked  text;
    unpinned text;
BEGIN
    SELECT count(*) INTO leaked
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = ANY (reads || writes);
    IF leaked::integer <> 6 THEN
        RAISE EXCEPTION '§3.4.13 expected 6 functions, found %', leaked;
    END IF;

    SELECT string_agg(p.proname, ', ') INTO leaked
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = ANY (reads || writes)
       AND has_function_privilege('anon', p.oid, 'EXECUTE');
    IF leaked IS NOT NULL THEN
        RAISE EXCEPTION 'anon can execute §3.4.13 functions: %', leaked;
    END IF;

    -- The WRITES specifically. Every one takes p_agent_id, so an `authenticated` grant is
    -- the whole tenancy model gone: any signed-in user could name any advisor.
    SELECT string_agg(p.proname, ', ') INTO leaked
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = ANY (writes)
       AND has_function_privilege('authenticated', p.oid, 'EXECUTE');
    IF leaked IS NOT NULL THEN
        RAISE EXCEPTION
            'authenticated can execute §3.4.13 WRITE functions: %. Each takes p_agent_id as '
            'trusted input, so that is act-as-any-agent with no audit row.', leaked;
    END IF;

    SELECT string_agg(p.proname, ', ' ORDER BY p.proname) INTO unpinned
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      LEFT JOIN LATERAL (
            SELECT substr(cfg, length('search_path=') + 1) AS value
              FROM unnest(coalesce(p.proconfig, ARRAY[]::text[])) cfg
             WHERE cfg LIKE 'search\_path=%' LIMIT 1
           ) sp ON true
     WHERE n.nspname = 'public' AND p.proname = ANY (reads || writes)
       AND (sp.value IS NULL
            OR btrim((string_to_array(sp.value, ','))[
                   cardinality(string_to_array(sp.value, ','))], ' "') <> 'pg_temp');
    IF unpinned IS NOT NULL THEN
        RAISE EXCEPTION
            '§3.4.13 functions must end their search_path with pg_temp: %', unpinned;
    END IF;
END $$;

-- THE PAYLOAD ALLOW-LIST, ASSERTED FROM THE FUNCTION BODY.
--
-- The whole point of an explicit registry is that it refuses to carry things nobody chose,
-- and the two that matter most are booking references: copying a confirmation_number
-- forward puts a FALSE confirmation in front of a traveler. Reading the body is crude and
-- it is the only place this can be checked at deploy time — a jsonb column has no schema to
-- constrain, which is exactly what Data-Model §23 warns about.
DO $$
DECLARE body text := pg_get_functiondef(
    'public.agent_save_trip_as_template(uuid, uuid, text, text)'::regprocedure);
BEGIN
    IF body LIKE '%confirmation_number%' THEN
        RAISE EXCEPTION
            'the template payload captures confirmation_number. A booking reference belongs '
            'to ONE booking; copying it into the next trip shows a traveler a confirmation '
            'that was never issued to them.';
    END IF;

    IF body LIKE '%api_source%' OR body LIKE '%api_reference%' THEN
        RAISE EXCEPTION
            'the template payload captures api_source/api_reference, which describe this '
            'trip''s own API booking and are not a reusable pattern';
    END IF;

    IF body LIKE '%weather_forecast%' THEN
        RAISE EXCEPTION 'the template payload captures weather_forecast, which is per-date';
    END IF;

    -- And the two that MUST be there, so the assertions above cannot pass by the payload
    -- having quietly become empty.
    IF body NOT LIKE '%start_day%' OR body NOT LIKE '%day_offset%' THEN
        RAISE EXCEPTION
            'the template payload no longer stores date OFFSETS. Absolute dates in a '
            'template produce August dates for a March trip.';
    END IF;
END $$;

COMMIT;
