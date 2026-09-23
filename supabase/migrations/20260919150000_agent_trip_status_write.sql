-- The one write §3.2 needs: moving a trip between pipeline stages (Screen 3.2.2).
--
-- ── WHY THIS IS SQL AND NOT THREE SUPABASE-JS CALLS ──────────────────────────────
--
-- A stage change is three writes that must all happen or none: the `trip.status` update, the
-- `trip_status_history` row, and the `audit_event`. supabase-js has no transaction across
-- separate calls, so an Edge Function doing them in sequence can leave the first committed
-- and the second lost.
--
-- Losing the history row is not a recoverable error. Data-Model §8.8 exists because
-- `trip.status_changed_at` keeps only the latest transition; once a transition happens
-- without its history row there is nothing left to reconstruct WHEN it happened from, and
-- the inquiry-to-book KPI and §3.11's stage reporting are quietly wrong forever. So the
-- trip update and the history insert are one statement pair inside one function.
--
-- The `audit_event` stays in TypeScript, in `_shared/audit.ts`, deliberately: it carries
-- `ip_address` and `user_agent`, which only exist at the HTTP layer, and every other mutation
-- in the codebase writes it the same way. Splitting it out costs a narrow window where a
-- stage change is recorded and its audit row is not — visible and recoverable, unlike the
-- history row, and worth it to keep one audit path rather than two.
--
-- ── WHY service_role ONLY, AND NOT `authenticated` ───────────────────────────────
--
-- The read accessors are granted to `authenticated` and resolve the caller from
-- `auth.uid()`, which is right for a read: the identity is proven by the JWT and a direct
-- PostgREST call is just another way to ask the same question.
--
-- A write is different. If this were callable by `authenticated`, an agent could POST to
-- /rpc/agent_set_trip_status from a browser and move a trip with NO audit_event — CLAUDE.md
-- rule 3 enforced by convention rather than by reach. So it takes the agent id as a
-- parameter and is executable only by `service_role`, which no browser holds. The Edge
-- Function proves the identity (requireUser → requireAgentId) and is then the only door.
--
-- That also means `p_agent_id` is TRUSTED input, and the only thing that makes that safe is
-- the grant. If a future change grants this to `authenticated`, the parameter becomes a
-- "act as any agent" primitive. The assertion at the bottom is there to make that loud.

BEGIN;

CREATE OR REPLACE FUNCTION public.agent_set_trip_status(
    p_trip_id          uuid,
    p_agent_id         uuid,
    p_actor_user_id    uuid,
    p_status           trip_status,
    p_expected_version integer,
    p_reason           text DEFAULT NULL
)
RETURNS TABLE (
    outcome     text,          -- 'changed' | 'reason_changed' | 'noop' | 'stale'
    from_status trip_status,
    to_status   trip_status,
    version     integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_trip   public.trip%ROWTYPE;
    v_now    timestamptz := now();
BEGIN
    -- An ARCHIVED advisor writes nothing, which is the test every read on this side already
    -- applies. `current_agent_id()` joins public.agent and refuses `status = 'archived'`
    -- (agent_read_surface.sql:71), so without this an offboarded advisor's board, KPIs,
    -- inbox and calendar all return zero rows while this function keeps moving their trips.
    -- Half-enforced offboarding is worse than none: the empty board makes it look closed.
    --
    -- `<> 'archived'`, not `= 'active'` — word for word what the read surface uses. An
    -- `inactive` advisor is paused, not gone, and must still work the book they hold.
    --
    -- The Edge Function refuses this caller first, with a 403 and a sentence. This is the
    -- second lock, for a direct service_role caller, and it answers zero rows — the same
    -- answer as "no such trip", so it is no more of a probe than that one.
    IF NOT EXISTS (
        SELECT 1 FROM public.agent a
         WHERE a.id = p_agent_id
           AND a.status <> 'archived'
    ) THEN
        RETURN;
    END IF;

    -- FOR UPDATE, not a plain read. Two agents on two devices — or one agent double-tapping
    -- a drag — would otherwise both pass the version check against the same row and both
    -- write, and the second history row would claim a transition that never happened.
    SELECT * INTO v_trip
      FROM public.trip t
     WHERE t.id = p_trip_id
       AND t.agent_id = p_agent_id
       AND t.archived_at IS NULL
     FOR UPDATE;

    -- Zero rows for "no such trip" and for "not your trip" alike, so an agent cannot probe
    -- for another advisor's trip ids. Same convention as _shared/trip.ts:59-61.
    IF NOT FOUND THEN
        RETURN;
    END IF;

    -- Optimistic concurrency. Data-Model §20.4 specifies `trip.version` and nothing has ever
    -- honoured it; a drag-and-drop board across two tabs is exactly the case it is for.
    -- NULL means the caller opted out, which the Edge Function does not allow but a future
    -- server-side caller might.
    IF p_expected_version IS NOT NULL AND p_expected_version <> v_trip.version THEN
        RETURN QUERY SELECT 'stale'::text, v_trip.status, p_status, v_trip.version;
        RETURN;
    END IF;

    -- Asking for the state it is already in is not an error. The board can fire this from a
    -- drop that landed back in its own column, and a 409 the agent cannot act on is worse
    -- than saying "nothing to do" — the same call card-authorization makes on a double
    -- revoke. No history row, because no transition happened.
    IF v_trip.status = p_status THEN
        -- ONE same-stage call still has work to do: a cancelled trip whose reason is being
        -- corrected. The Edge Function makes `p_reason` mandatory on every `cancelled`
        -- call, and this function is the only writer of `trip.cancellation_reason` anywhere
        -- in the schema — the agent role holds no UPDATE on public.trip — so returning
        -- 'noop' here took a reason the caller was forced to supply, dropped it, and
        -- reported success. The traveler kept reading the old sentence on §2.2.10 with no
        -- way for the advisor to fix it.
        --
        -- It writes the column and nothing else: no `status_changed_at`, because the stage
        -- did not move, and no trip_status_history row, because no transition happened. The
        -- version DOES climb — a row that changed is a row a second tab is now stale
        -- against. A distinct outcome, so the Edge Function can write the audit row this
        -- deserves under its own event type rather than logging a transition that did not
        -- happen.
        IF p_status = 'cancelled'
           AND p_reason IS NOT NULL
           AND p_reason IS DISTINCT FROM v_trip.cancellation_reason
        THEN
            UPDATE public.trip
               SET cancellation_reason = p_reason,
                   updated_at          = v_now,
                   version             = v_trip.version + 1
             WHERE id = v_trip.id;

            RETURN QUERY SELECT 'reason_changed'::text, v_trip.status, p_status,
                                v_trip.version + 1;
            RETURN;
        END IF;

        RETURN QUERY SELECT 'noop'::text, v_trip.status, p_status, v_trip.version;
        RETURN;
    END IF;

    UPDATE public.trip
       SET status              = p_status,
           status_changed_at   = v_now,
           updated_at          = v_now,
           version             = v_trip.version + 1,
           cancellation_reason = CASE WHEN p_status = 'cancelled'
                                      THEN coalesce(p_reason, cancellation_reason)
                                      ELSE cancellation_reason END
     WHERE id = v_trip.id;

    INSERT INTO public.trip_status_history
        (id, trip_id, from_status, to_status, changed_at, changed_by_user_id)
    VALUES (gen_random_uuid(), v_trip.id, v_trip.status, p_status, v_now, p_actor_user_id);
    -- gen_random_uuid() is v4. Data-Model §21.6 prefers v7 for client-generated ids;
    -- time-ordering here is index locality, not correctness, and every other server-side
    -- insert in this schema makes the same call (20260902020243:153-156).

    RETURN QUERY SELECT 'changed'::text, v_trip.status, p_status, v_trip.version + 1;
END;
$$;

COMMENT ON FUNCTION public.agent_set_trip_status(uuid, uuid, uuid, trip_status, integer, text) IS
    'Move a trip between pipeline stages (Screen 3.2.2). The trip update and its '
    'trip_status_history row are one atomic pair: losing the history row is unrecoverable, '
    'because trip.status_changed_at keeps only the latest transition. Writes nothing for an '
    'agent whose agent.status is archived, matching current_agent_id() on the read side. '
    'cancelled -> cancelled with a different reason is outcome ''reason_changed'': the reason '
    'lands, no history row, version climbs. service_role only — p_agent_id is trusted input '
    'and the grant is the only thing that makes it safe.';

REVOKE EXECUTE ON FUNCTION
    public.agent_set_trip_status(uuid, uuid, uuid, trip_status, integer, text)
    FROM public, anon, authenticated;
GRANT  EXECUTE ON FUNCTION
    public.agent_set_trip_status(uuid, uuid, uuid, trip_status, integer, text)
    TO service_role;

-- ── ASSERTIONS ───────────────────────────────────────────────────────────────────

-- The grant is load-bearing, not hygiene: `authenticated` holding EXECUTE here turns
-- p_agent_id into an "act as any agent" parameter, reachable from a browser, with no
-- audit_event. Fail the deploy rather than let that be a code-review catch.
DO $$
BEGIN
    IF has_function_privilege('authenticated',
         'public.agent_set_trip_status(uuid, uuid, uuid, trip_status, integer, text)',
         'EXECUTE')
       OR has_function_privilege('anon',
         'public.agent_set_trip_status(uuid, uuid, uuid, trip_status, integer, text)',
         'EXECUTE')
    THEN
        RAISE EXCEPTION
            'agent_set_trip_status must be service_role only — p_agent_id is trusted input, '
            'and a client-role grant makes it an act-as-any-agent primitive with no audit row';
    END IF;
END $$;

-- The search_path rule, restated for the one function this migration adds, so the file is
-- self-checking rather than relying on the schema-wide assertion in the previous migration.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname = 'agent_set_trip_status'
           AND EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig, ARRAY[]::text[])) cfg
                        WHERE cfg LIKE 'search\_path=%')
    ) THEN
        RAISE EXCEPTION 'agent_set_trip_status does not pin search_path';
    END IF;
END $$;

COMMIT;
