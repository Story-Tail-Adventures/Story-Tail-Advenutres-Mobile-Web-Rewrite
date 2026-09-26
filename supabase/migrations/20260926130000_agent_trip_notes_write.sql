-- The one write §3.4.2 needs beyond the stage change §3.2.2 already has: editing the
-- agent-only free-text `trip.notes`.
--
-- SAME REASONS AS THE STAGE WRITE, SHORTER FUNCTION. Optimistic concurrency against
-- `trip.version` (Data-Model §20.4), `FOR UPDATE` row lock, service_role only because
-- `p_agent_id` is trusted input and a client-role grant would make it an act-as-any-agent
-- primitive with no audit_event. Unlike a stage change, there is no history table this write
-- must not lose a row to — `trip.notes` has no §8.8-style timeline, so the only shapes are
-- 'changed' | 'noop' | 'stale', not the stage write's four.

BEGIN;

CREATE OR REPLACE FUNCTION public.agent_set_trip_notes(
    p_trip_id          uuid,
    p_agent_id         uuid,
    p_notes            text,
    p_expected_version integer
)
RETURNS TABLE (
    outcome  text,   -- 'changed' | 'noop' | 'stale'
    version  integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_trip public.trip%ROWTYPE;
BEGIN
    -- Matching current_agent_id()'s predicate word for word: an archived advisor writes
    -- nothing, an inactive one still works their own book.
    IF NOT EXISTS (
        SELECT 1 FROM public.agent a
         WHERE a.id = p_agent_id
           AND a.status <> 'archived'
    ) THEN
        RETURN;
    END IF;

    SELECT * INTO v_trip
      FROM public.trip t
     WHERE t.id = p_trip_id
       AND t.agent_id = p_agent_id
       AND t.archived_at IS NULL
     FOR UPDATE;

    -- Zero rows for "no such trip" and "not yours" alike, same convention as
    -- agent_set_trip_status.
    IF NOT FOUND THEN
        RETURN;
    END IF;

    IF p_expected_version IS NOT NULL AND p_expected_version <> v_trip.version THEN
        RETURN QUERY SELECT 'stale'::text, v_trip.version;
        RETURN;
    END IF;

    -- `IS NOT DISTINCT FROM` so clearing notes to NULL and re-saving an unchanged NULL both
    -- count as a no-op — a version bump with nothing behind it would make a second tab stale
    -- against a write that changed nothing.
    IF p_notes IS NOT DISTINCT FROM v_trip.notes THEN
        RETURN QUERY SELECT 'noop'::text, v_trip.version;
        RETURN;
    END IF;

    UPDATE public.trip
       SET notes      = p_notes,
           updated_at = now(),
           version    = v_trip.version + 1
     WHERE id = v_trip.id;

    RETURN QUERY SELECT 'changed'::text, v_trip.version + 1;
END;
$$;

COMMENT ON FUNCTION public.agent_set_trip_notes(uuid, uuid, text, integer) IS
    'Edit trip.notes (Screen 3.4.2''s Notes tab). No history row: unlike a stage change, '
    'there is no §8.8-style timeline for a free-text field to lose. service_role only, same '
    'reason as agent_set_trip_status — p_agent_id is trusted input.';

REVOKE EXECUTE ON FUNCTION
    public.agent_set_trip_notes(uuid, uuid, text, integer)
    FROM public, anon, authenticated;
GRANT  EXECUTE ON FUNCTION
    public.agent_set_trip_notes(uuid, uuid, text, integer)
    TO service_role;

-- ── ASSERTIONS ───────────────────────────────────────────────────────────────────

DO $$
BEGIN
    IF has_function_privilege('authenticated',
         'public.agent_set_trip_notes(uuid, uuid, text, integer)', 'EXECUTE')
       OR has_function_privilege('anon',
         'public.agent_set_trip_notes(uuid, uuid, text, integer)', 'EXECUTE')
    THEN
        RAISE EXCEPTION
            'agent_set_trip_notes must be service_role only — p_agent_id is trusted input, '
            'and a client-role grant makes it an act-as-any-agent primitive with no audit row';
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname = 'agent_set_trip_notes'
           AND EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig, ARRAY[]::text[])) cfg
                        WHERE cfg LIKE 'search\_path=%')
    ) THEN
        RAISE EXCEPTION 'agent_set_trip_notes does not pin search_path';
    END IF;
END $$;

COMMIT;
