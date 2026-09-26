-- §3.3.7's write: add, edit and delete an internal note.
--
-- SAME SHAPE AS agent_set_trip_notes, WITH ONE STRUCTURAL DIFFERENCE. That one edits a
-- FIELD on a row that already exists; this one manages ROWS in `client_note`. So the
-- outcomes are four rather than three, and the function takes an explicit op instead of
-- inferring one from a null.
--
-- service_role only, for the reason the trip write records: `p_agent_id` is trusted input,
-- and a client-role grant would make this an act-as-any-agent primitive with no audit_event.
--
-- ── NO OPTIMISTIC LOCKING, AND THAT IS THE SCHEMA'S ANSWER RATHER THAN AN OMISSION ─────
--
-- `agent_set_trip_notes` checks `trip.version`. `client_note` has no `version` column —
-- Data-Model §20.4 lists the tables that carry one and this is not among them. Adding it
-- would be a Data-Model change, which CLAUDE.md is explicit belongs in the document before
-- the migration, and it is not obviously warranted: a note is a short internal jotting
-- written by one advisor, where a trip's notes are a shared field on a record several
-- surfaces write. Last-write-wins is recorded here as a decision so the next reader does
-- not assume the check was forgotten.
--
-- ── ONLY THE AUTHOR MAY EDIT OR ARCHIVE ────────────────────────────────────────────────
--
-- `agent_client_notes()` returns `author_is_me` to drive the affordance, and an affordance
-- is not an enforcement. One advisor exists until P3, so the predicate is always satisfied
-- today — which is exactly when it is cheapest to write and most likely to be skipped.

BEGIN;

CREATE OR REPLACE FUNCTION public.agent_write_client_note(
    p_client_id     uuid,
    p_agent_id      uuid,
    p_actor_user_id uuid,
    p_note_id       uuid,
    p_body          text,
    p_op            text
)
RETURNS TABLE (
    outcome text,   -- 'created' | 'changed' | 'noop' | 'archived'
    note_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_note public.client_note%ROWTYPE;
BEGIN
    -- Matching current_agent_id()'s predicate word for word: an archived advisor writes
    -- nothing, an inactive one still works their own book.
    IF NOT EXISTS (
        SELECT 1 FROM public.agent a WHERE a.id = p_agent_id AND a.status <> 'archived'
    ) THEN
        RETURN;
    END IF;

    -- The client must be this agent's, and must not be a tombstone. Zero rows for "no such
    -- client" and "not yours" alike — the convention every accessor on this surface keeps.
    IF NOT EXISTS (
        SELECT 1 FROM public.client c
         WHERE c.id = p_client_id
           AND c.agent_id = p_agent_id
           AND c.status <> 'merged_into'
    ) THEN
        RETURN;
    END IF;

    IF p_op = 'create' THEN
        -- The id is the CALLER's, generated as a v7 in the Edge Function. Data-Model §21.6:
        -- ids are time-ordered and client-generated so an offline compose can keep its own.
        IF p_note_id IS NULL OR p_body IS NULL OR btrim(p_body) = '' THEN
            RETURN;
        END IF;

        INSERT INTO public.client_note (id, client_id, author_user_id, body)
        VALUES (p_note_id, p_client_id, p_actor_user_id, btrim(p_body));

        RETURN QUERY SELECT 'created'::text, p_note_id;
        RETURN;
    END IF;

    SELECT * INTO v_note
      FROM public.client_note n
     WHERE n.id = p_note_id
       AND n.client_id = p_client_id
       AND n.archived_at IS NULL
     FOR UPDATE;

    IF NOT FOUND THEN
        RETURN;
    END IF;

    -- See the header. The affordance is `author_is_me`; this is the enforcement behind it.
    IF v_note.author_user_id <> p_actor_user_id THEN
        RETURN;
    END IF;

    IF p_op = 'archive' THEN
        UPDATE public.client_note
           SET archived_at = now(), updated_at = now()
         WHERE id = v_note.id;
        RETURN QUERY SELECT 'archived'::text, v_note.id;
        RETURN;
    END IF;

    IF p_op = 'update' THEN
        IF p_body IS NULL OR btrim(p_body) = '' THEN
            RETURN;
        END IF;

        -- A re-save of identical text is a no-op rather than a silent `updated_at` bump: the
        -- Notes tab shows "edited" off that column, and a timestamp that moved with nothing
        -- behind it is a claim the note changed.
        IF btrim(p_body) IS NOT DISTINCT FROM v_note.body THEN
            RETURN QUERY SELECT 'noop'::text, v_note.id;
            RETURN;
        END IF;

        UPDATE public.client_note
           SET body = btrim(p_body), updated_at = now()
         WHERE id = v_note.id;

        RETURN QUERY SELECT 'changed'::text, v_note.id;
        RETURN;
    END IF;

    -- An unrecognised op writes nothing. It cannot reach here from the Edge Function, whose
    -- own union is narrower, but a function that silently treated a typo as one of its real
    -- ops would be the worst possible failure for a write.
    RETURN;
END;
$$;

COMMENT ON FUNCTION public.agent_write_client_note(uuid, uuid, uuid, uuid, text, text) IS
    'Screen 3.3.7''s add/edit/delete. Delete is an ARCHIVE — client_note.archived_at, per '
    'Data-Model §20.1''s soft-delete set — so a note the agent removes leaves the tab but '
    'not the record. service_role only: p_agent_id and p_actor_user_id are trusted input.';

REVOKE EXECUTE ON FUNCTION
    public.agent_write_client_note(uuid, uuid, uuid, uuid, text, text)
    FROM public, anon, authenticated;
GRANT  EXECUTE ON FUNCTION
    public.agent_write_client_note(uuid, uuid, uuid, uuid, text, text)
    TO service_role;

-- ── ASSERTIONS ───────────────────────────────────────────────────────────────────

DO $$
BEGIN
    IF has_function_privilege('authenticated',
         'public.agent_write_client_note(uuid, uuid, uuid, uuid, text, text)', 'EXECUTE')
       OR has_function_privilege('anon',
         'public.agent_write_client_note(uuid, uuid, uuid, uuid, text, text)', 'EXECUTE')
    THEN
        RAISE EXCEPTION
            'agent_write_client_note must be service_role only — p_agent_id is trusted '
            'input, and a client-role grant makes it an act-as-any-agent primitive with no '
            'audit row';
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname = 'agent_write_client_note'
           AND EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig, ARRAY[]::text[])) cfg
                        WHERE cfg LIKE 'search\_path=%'))
    THEN
        RAISE EXCEPTION 'agent_write_client_note does not pin search_path';
    END IF;
END $$;

COMMIT;
