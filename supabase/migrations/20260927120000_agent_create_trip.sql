-- §3.4.3 Create New Trip — the first row on the trip side that an advisor makes by hand.
--
-- ── A TRIP IS BORN IN `inquiry`, ALWAYS ──────────────────────────────────────────────────
--
-- `trip.status` already defaults to `inquiry` and this function does not offer the caller a
-- choice. Every other stage is a TRANSITION, and a transition owes a `trip_status_history`
-- row naming what it moved from — a trip created directly in `booked` would be a booking
-- with no record of ever having been proposed. `agent_set_trip_status` is the only way
-- onward, and it writes that history.
--
-- ── THE TITLE IS NOT OPTIONAL, AND NOT INVENTED EITHER ───────────────────────────────────
--
-- `trip.title` is NOT NULL. The screen collects one; this function refuses a blank rather
-- than generating "Untitled trip", because a list of five "Untitled trip" rows is worse than
-- a form that asked.
--
-- ── WHAT THIS DOES NOT DO ────────────────────────────────────────────────────────────────
--
-- No components, no dates, no travelers beyond the count, no template. §3.4.4 is the builder
-- and owns all of that. This exists so the advisor can get a real trip onto the board the
-- moment a client calls, and fill it in afterwards — which is how an inquiry actually
-- arrives.

BEGIN;

CREATE OR REPLACE FUNCTION public.agent_create_trip(
    p_agent_id       uuid,
    p_trip_id        uuid,
    p_client_id      uuid,
    p_title          text,
    p_trip_type      trip_type,
    p_traveler_count integer DEFAULT 1
)
RETURNS TABLE (
    outcome text,   -- 'created' | 'no_client'
    trip_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_title text := btrim(coalesce(p_title, ''));
BEGIN
    IF v_title = '' THEN
        RAISE EXCEPTION 'agent_create_trip needs a title — trip.title is NOT NULL';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.agent a WHERE a.id = p_agent_id AND a.status <> 'archived'
    ) THEN
        RETURN;
    END IF;

    -- THE CLIENT MUST BE THIS ADVISOR'S, and a client that is not returns `no_client` rather
    -- than raising: the picker is a search over their own book, so reaching this means the
    -- id was typed or stale, and the screen can say "pick a client" without a 500. It is the
    -- same answer for "no such client" and "not yours", so an id cannot be probed for.
    IF NOT EXISTS (
        SELECT 1 FROM public.client c
         WHERE c.id = p_client_id
           AND c.agent_id = p_agent_id
           AND c.status <> 'merged_into'
    ) THEN
        RETURN QUERY SELECT 'no_client'::text, NULL::uuid;
        RETURN;
    END IF;

    INSERT INTO public.trip (
        id, client_id, agent_id, title, trip_type, status,
        status_changed_at, traveler_count, currency
    )
    VALUES (
        p_trip_id, p_client_id, p_agent_id, v_title, p_trip_type, 'inquiry',
        now(), greatest(coalesce(p_traveler_count, 1), 1),
        -- The agent's own currency would be the better default and there is no column for
        -- it; `trip.currency` already defaults to USD and every seeded trip is USD. Left as
        -- the column default rather than invented here, so there is one place to change it
        -- when multi-currency becomes real.
        'USD'
    );

    RETURN QUERY SELECT 'created'::text, p_trip_id;
END;
$$;

COMMENT ON FUNCTION public.agent_create_trip(uuid, uuid, uuid, text, trip_type, integer) IS
    'Screen 3.4.3. Creates a trip in `inquiry` and nothing else — every other stage is a '
    'transition that owes a trip_status_history row. Returns `no_client` rather than raising '
    'when the client is not this advisor''s, which is the same answer as "no such client".';

-- ─────────────────────────────────────────────────────────────────────────────
-- Grants
-- ─────────────────────────────────────────────────────────────────────────────

REVOKE EXECUTE ON FUNCTION
    public.agent_create_trip(uuid, uuid, uuid, text, trip_type, integer)
    FROM public, anon, authenticated;
GRANT  EXECUTE ON FUNCTION
    public.agent_create_trip(uuid, uuid, uuid, text, trip_type, integer)
    TO service_role;

-- ── ASSERTIONS ───────────────────────────────────────────────────────────────────
--
-- Restated rather than inherited: a DO block is a statement, not a constraint.
DO $$
DECLARE bad text;
BEGIN
    SELECT string_agg(p.proname, ', ') INTO bad
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname = 'agent_create_trip'
       AND (has_function_privilege('authenticated', p.oid, 'EXECUTE')
            OR has_function_privilege('anon', p.oid, 'EXECUTE'));
    IF bad IS NOT NULL THEN
        RAISE EXCEPTION
            '§3.4.3''s write must be service_role only — it takes p_agent_id as trusted '
            'input, so a client-role grant is an act-as-any-agent primitive: %', bad;
    END IF;

    SELECT string_agg(p.proname, ', ') INTO bad
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      LEFT JOIN LATERAL (
            SELECT substr(cfg, length('search_path=') + 1) AS value
              FROM unnest(coalesce(p.proconfig, ARRAY[]::text[])) cfg
             WHERE cfg LIKE 'search\_path=%'
             LIMIT 1
           ) sp ON true
     WHERE n.nspname = 'public'
       AND p.proname = 'agent_create_trip'
       AND (sp.value IS NULL
            OR btrim((string_to_array(sp.value, ','))[
                   cardinality(string_to_array(sp.value, ','))], ' "') <> 'pg_temp');
    IF bad IS NOT NULL THEN
        RAISE EXCEPTION '§3.4.3''s write must end its search_path with pg_temp: %', bad;
    END IF;
END $$;

COMMIT;
