-- What §3.4.5 – §3.4.12's sheets need to RENDER, as opposed to what they write.
--
-- Two changes, both forced by the same thing: until now nothing on the agent surface ever
-- read a component back in order to EDIT it. §3.4.2's Components tab lists them, and a list
-- needs a title, a date and a price. A form needs every field it is going to overwrite.
--
-- ── 1. `agent_trip_components` GAINS `payload` AND THE SUPPLIER ──────────────────────────
--
-- The function's own COMMENT currently says `payload` is "absent from the signature rather
-- than selected-and-ignored: nothing a component row renders needs it". That was true of
-- §3.4.2 and is false of §3.4.12 — a pre-filled edit sheet renders the flight's seats, the
-- cruise's cabin and the policy's plan name, all of which live in `payload`. The comment is
-- rewritten below rather than left standing next to a signature that contradicts it.
--
-- ONE ACCESSOR, NOT TWO. A separate `agent_trip_component(trip, component)` would keep the
-- list narrow, but the builder renders the list and the sheet from the same page load, and
-- the sheet's row is one the list already returned. A second accessor would be a second
-- round trip to fetch a row that is already in hand, and a second ownership check to keep
-- in step with this one.
--
-- ── 2. `agent_suppliers` — SO `supplier_id` STOPS BEING A COLUMN NOTHING WRITES ──────────
--
-- `trip_component.supplier_id` has existed since the initial migration and no code path has
-- ever set it. `commission` joins `supplier`, and `supplier.default_commission_pct` is the
-- number the commission field on every one of these sheets should open at. A form with a
-- free-text supplier name and a null FK is how `trip.total_value_cents` became a fiction:
-- a documented relationship with nothing maintaining it.
--
-- It is a read of a table in the agent domain (20260919120000 locked `supplier` away from
-- every client role), so it is an accessor like all the others, with the same CROSS JOIN me.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3.4.2's Components tab, widened for 3.4.4's builder and 3.4.12's edit sheet
-- ─────────────────────────────────────────────────────────────────────────────

-- DROP first: `CREATE OR REPLACE` cannot change a function's return type, and adding
-- columns to a `RETURNS TABLE` is changing it. The signature is unchanged so no grant or
-- caller moves.
DROP FUNCTION IF EXISTS public.agent_trip_components(uuid);

CREATE FUNCTION public.agent_trip_components(p_trip_id uuid)
RETURNS TABLE (
    component_id         uuid,
    kind                 component_kind,
    display_name         text,
    supplier_id          uuid,
    supplier_name        text,
    start_date           date,
    end_date             date,
    start_time           time,
    end_time             time,
    location             text,
    confirmation_number  text,
    cost_cents           text,
    commission_pct       numeric(5,2),
    commission_cents     text,
    currency             char(3),
    api_source           text,
    payload              jsonb,
    order_index          integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT
        tc.id, tc.kind, tc.display_name,
        tc.supplier_id, s.name,
        tc.start_date, tc.end_date, tc.start_time, tc.end_time,
        tc.location, tc.confirmation_number,
        -- ::text, not the bigint. PostgREST serialises bigint as a JSON number and a large
        -- one loses precision on the way out — the rule every money column on this surface
        -- follows.
        tc.cost_cents::text, tc.commission_pct, tc.commission_cents::text, tc.currency,
        tc.api_source, tc.payload, tc.order_index
      FROM public.trip_component tc
      JOIN public.trip t
        ON t.id = tc.trip_id
       AND t.agent_id = public.current_agent_id()
       AND t.archived_at IS NULL
      -- LEFT: most components are typed by hand and name no supplier row at all. An INNER
      -- join here would empty the builder for every trip built the ordinary way.
      LEFT JOIN public.supplier s
        ON s.id = tc.supplier_id
     WHERE tc.trip_id = p_trip_id
       AND tc.archived_at IS NULL
     ORDER BY tc.order_index;
$$;

COMMENT ON FUNCTION public.agent_trip_components(uuid) IS
    'The flat per-component list (Screen 3.4.2''s Components tab and 3.4.4''s builder canvas, '
    'distinct from Itinerary — the design prototype merges the two into one section, but '
    'Screen-Inventory''s text lists them as separate tabs and the doc hierarchy puts the text '
    'above the drawing). `payload` IS in the signature as of 3.4.12: an edit sheet renders '
    'the flight''s seats and the cruise''s cabin, which live nowhere else. It is Internal — '
    'agent-only — and this accessor is an agent-only door, which is the whole reason the '
    'agent surface is accessors rather than grants.';

-- ─────────────────────────────────────────────────────────────────────────────
-- The supplier picker on every component sheet
-- ─────────────────────────────────────────────────────────────────────────────

-- NO KIND FILTER, deliberately, and this was the second draft.
--
-- The first took `p_kind` so a flight sheet would offer airlines and nothing else. Two
-- things kill it. A supplier filed under the wrong `supplier_kind` — a resort entered as
-- `hotel_brand`, which is a judgement call every time — becomes UNPICKABLE on the sheet
-- that needs it, with no way for the advisor to see why. And a kind nobody has on file
-- yet opens an empty picker, which reads as a broken control rather than "none on file".
-- One list, grouped by kind in the form, loses the narrowing and keeps every supplier
-- reachable. `supplier.kind` is returned so the grouping happens where it can be seen.
CREATE OR REPLACE FUNCTION public.agent_suppliers()
RETURNS TABLE (
    supplier_id            uuid,
    name                   text,
    kind                   supplier_kind,
    default_commission_pct numeric(5,2)
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    WITH me AS (
        SELECT public.current_agent_id() AS agent_id
    )
    SELECT s.id, s.name, s.kind, s.default_commission_pct
      FROM public.supplier s
      -- The ownership CTE, even though `supplier` is agency-wide rather than per-advisor:
      -- `current_agent_id()` returns NULL for a traveler, for an admin with no agent row and
      -- for an archived advisor, and the CROSS JOIN turns every one of those into zero rows
      -- with no branch to forget. Suppliers carry commission terms; a traveler reading the
      -- agency's rate card is not a leak we are choosing to take.
     CROSS JOIN me
     WHERE me.agent_id IS NOT NULL
       AND s.archived_at IS NULL
     ORDER BY s.kind, s.name;
$$;

COMMENT ON FUNCTION public.agent_suppliers() IS
    'Screens 3.4.5 – 3.4.12''s supplier picker. `payment_api_endpoint`, `payment_portal_url` '
    'and the contact columns are deliberately absent: a component form needs a name, a kind '
    'and the default commission rate, and the payment columns belong to 3.6''s card flows. '
    'RETURNS TABLE is the column allow-list — that is what this shape is for.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Grants
-- ─────────────────────────────────────────────────────────────────────────────

-- Restated in full for both functions. `agent_trip_components` was DROPped above, which
-- takes its grants with it, and `agent_suppliers` is new.
--
-- Naming `anon` is load-bearing: Supabase grants EXECUTE to `anon` BY NAME, so
-- `REVOKE ... FROM public` alone leaves that grant standing.
DO $$
DECLARE f text;
BEGIN
    FOREACH f IN ARRAY ARRAY[
        'public.agent_trip_components(uuid)',
        'public.agent_suppliers()'
    ]
    LOOP
        EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM public, anon', f);
        EXECUTE format('GRANT  EXECUTE ON FUNCTION %s TO authenticated, service_role', f);
    END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Assertions
-- ─────────────────────────────────────────────────────────────────────────────
--
-- RESTATED HERE, not inherited. A DO block is a statement, not a constraint: it sees the
-- catalog as it stood the day it ran, so the copy in 20260919140000 says nothing about the
-- two functions this file creates. Three migrations in §3.4 have now shipped a broken
-- plpgsql body through a clean apply, because plpgsql compiles on FIRST EXECUTION — these
-- blocks are the part of a migration that actually runs.

DO $$
DECLARE missing text;
BEGIN
    SELECT string_agg(f, ', ') INTO missing
      FROM unnest(ARRAY['agent_trip_components', 'agent_suppliers']) AS f
     WHERE NOT EXISTS (
        SELECT 1 FROM pg_proc p
          JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname = f
     );
    IF missing IS NOT NULL THEN
        RAISE EXCEPTION 'accessor(s) missing after migration: %', missing;
    END IF;
END $$;

DO $$
DECLARE leaked text;
BEGIN
    SELECT string_agg(p.proname, ', ') INTO leaked
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('agent_trip_components', 'agent_suppliers')
       AND has_function_privilege('anon', p.oid, 'EXECUTE');
    IF leaked IS NOT NULL THEN
        RAISE EXCEPTION 'anon can execute: %', leaked;
    END IF;
END $$;

DO $$
DECLARE bad text;
BEGIN
    -- `pg_temp` LAST. A SECURITY DEFINER function whose search_path reaches pg_temp before
    -- public lets any caller shadow a table name with a temp table of their own and have
    -- this function read it with the definer's rights.
    SELECT string_agg(p.proname, ', ') INTO bad
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('agent_trip_components', 'agent_suppliers')
       AND NOT EXISTS (
         SELECT 1 FROM unnest(coalesce(p.proconfig, ARRAY[]::text[])) AS c
          WHERE c = 'search_path=public, pg_temp'
       );
    IF bad IS NOT NULL THEN
        RAISE EXCEPTION 'search_path not pinned to "public, pg_temp" on: %', bad;
    END IF;
END $$;

COMMIT;
