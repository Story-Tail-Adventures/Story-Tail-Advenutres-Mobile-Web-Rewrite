-- §3.4.1 Trip List — the roster read, and the bulk status write behind its checkboxes.
--
-- ── WHY NOT EXTEND agent_trip_board() ────────────────────────────────────────────────────
--
-- That function already returns nearly every column this screen wants, and growing it was
-- the obvious first idea. It is the wrong one: §3.2.2's pipeline is built on it, and it is
-- deliberately STAGE-shaped — no search, no offset, no total count, and a `p_limit` that
-- means "per column" rather than "per page". Adding paging to it would change what the board
-- means; adding a second set of parameters would give one function two jobs and two callers
-- who each ignore half of it.
--
-- So this is a sibling, modelled on `agent_client_roster()` (§3.3.1) rather than on the
-- board, because a roster is what it is.
--
-- ── THE STATUS FILTER DEFAULTS TO THE FOUR THAT ARE LIVE ─────────────────────────────────
--
-- `trip_status` has six values and the design prototype's chip row draws four — nothing for
-- `completed` or `cancelled`. On the seed that is not a rounding error: 13 of 26 trips are
-- completed, so half the book would have been unreachable from the screen whose title is
-- "Trips". Both chips ship (settled 2026-09-27), and the DEFAULT stays at the four live
-- ones so the screen opens on work in progress rather than on a decade of history.
--
-- ── MONEY ────────────────────────────────────────────────────────────────────────────────
--
-- Unlike §3.3.1's roster, a trip carries its own `currency`, so there is no per-row currency
-- election to make — the row's figure is in the row's currency and that is simply true. What
-- the SUMMARY owes is §3.2's rule: one currency named, and a count of what it left out.
--
-- All money crosses as `::text`. PostgREST serialises bigint as a JSON number and precision
-- is lost above 2^53 — the trap recorded against `size_bytes` on the client surface.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- §3.4.1 Roster — one row per trip
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.agent_trip_roster(
    p_status    trip_status[] DEFAULT ARRAY['inquiry','proposal','booked','in_progress']::trip_status[],
    p_client_id uuid          DEFAULT NULL,
    p_search    text          DEFAULT NULL,
    p_limit     integer       DEFAULT 25,
    p_offset    integer       DEFAULT 0
)
RETURNS TABLE (
    trip_id                uuid,
    title                  text,
    client_id              uuid,
    client_display_name    text,
    trip_type              trip_type,
    status                 trip_status,
    status_changed_at      timestamptz,
    start_date             date,
    end_date               date,
    destinations           text[],
    traveler_count         integer,
    total_value_cents      text,
    total_paid_cents       text,
    total_commission_cents text,
    currency               char(3),
    component_count        integer,
    last_activity_at       timestamptz,
    version                integer,
    as_of_date             date,
    total_count            integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    WITH me AS (
        SELECT a.id AS agent_id,
               (now() AT TIME ZONE a.time_zone)::date AS today
          FROM public.agent a
         WHERE a.id = public.current_agent_id()
    ),
    -- The agent's book of trips. `archived_at` is excluded unconditionally and is not a
    -- filter the caller can ask for: §3.4.16 archives a trip to take it off the working
    -- surfaces, and a list that could show them again would undo the point of archiving.
    -- Cancelled is DIFFERENT and is a status the caller may ask for — a cancelled trip is
    -- still a record of work, and its commission reversal is something an advisor looks up.
    book AS (
        SELECT t.*
          FROM public.trip t
         CROSS JOIN me
         WHERE t.agent_id = me.agent_id
           AND t.archived_at IS NULL
    ),
    -- Components are counted, not joined into the row: the count is what the list shows
    -- ("6 components") and the rows themselves belong to §3.4.2's own accessor.
    comp AS (
        SELECT c.trip_id, count(*)::integer AS n
          FROM public.trip_component c
         WHERE c.trip_id IN (SELECT id FROM book)
           AND c.archived_at IS NULL
         GROUP BY c.trip_id
    ),
    -- "Last activity" is the most recent thing that HAPPENED to the trip, which is not the
    -- same as `updated_at` — that moves when a nightly job touches a row. The three sources
    -- are the ones an advisor would name: the last message, the last status move, and the
    -- last component edit.
    activity AS (
        SELECT b.id AS trip_id,
               greatest(
                   b.status_changed_at,
                   coalesce((SELECT max(m.created_at) FROM public.message m
                              JOIN public.conversation cv ON cv.id = m.conversation_id
                             WHERE cv.trip_id = b.id), b.status_changed_at),
                   coalesce((SELECT max(c.updated_at) FROM public.trip_component c
                             WHERE c.trip_id = b.id), b.status_changed_at)
               ) AS at
          FROM book b
    ),
    filtered AS (
        SELECT b.*, coalesce(cp.n, 0) AS component_count, ac.at AS last_activity_at,
               coalesce(cl.preferred_name, cl.first_name) || ' ' || cl.last_name
                   AS client_display_name
          FROM book b
          JOIN public.client cl ON cl.id = b.client_id
          LEFT JOIN comp cp ON cp.trip_id = b.id
          LEFT JOIN activity ac ON ac.trip_id = b.id
         WHERE (p_status IS NULL OR b.status = ANY (p_status))
           AND (p_client_id IS NULL OR b.client_id = p_client_id)
           -- Search spans the trip's title, its destinations and the client's name, because
           -- all three are things an advisor types when looking for "the Sandals one".
           AND (
                p_search IS NULL OR btrim(p_search) = '' OR
                b.title ILIKE '%' || btrim(p_search) || '%' OR
                (coalesce(cl.preferred_name, cl.first_name) || ' ' || cl.last_name)
                    ILIKE '%' || btrim(p_search) || '%' OR
                EXISTS (SELECT 1 FROM unnest(b.destinations) d
                         WHERE d ILIKE '%' || btrim(p_search) || '%')
               )
    )
    SELECT f.id, f.title, f.client_id, f.client_display_name, f.trip_type, f.status,
           f.status_changed_at, f.start_date, f.end_date, f.destinations, f.traveler_count,
           f.total_value_cents::text, f.total_paid_cents::text, f.total_commission_cents::text,
           f.currency, f.component_count, f.last_activity_at, f.version,
           me.today,
           count(*) OVER ()::integer
      FROM filtered f
     CROSS JOIN me
     -- Departure order, nulls last: a trip with no dates yet is an inquiry nobody has
     -- planned, and it belongs after the ones that are actually going somewhere.
     ORDER BY f.start_date ASC NULLS LAST, f.id
     LIMIT coalesce(p_limit, 25) OFFSET coalesce(p_offset, 0);
$$;

COMMENT ON FUNCTION public.agent_trip_roster(trip_status[], uuid, text, integer, integer) IS
    'Screen 3.4.1''s rows. A sibling of agent_trip_board() rather than an extension of it — '
    'the board is stage-shaped and §3.2.2 depends on that. Archived trips are excluded '
    'unconditionally; cancelled ones are a status the caller may ask for.';

-- ─────────────────────────────────────────────────────────────────────────────
-- §3.4.1 Summary — the chip counts, and the currency note
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.agent_trip_roster_summary()
RETURNS TABLE (
    inquiry_count     integer,
    proposal_count    integer,
    booked_count      integer,
    in_progress_count integer,
    completed_count   integer,
    cancelled_count   integer,
    total_count       integer,
    pipeline_cents    text,
    pipeline_currency char(3),
    currency_count    integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    WITH me AS (
        SELECT a.id AS agent_id FROM public.agent a WHERE a.id = public.current_agent_id()
    ),
    book AS (
        SELECT t.status, t.total_value_cents, t.currency
          FROM public.trip t
         CROSS JOIN me
         WHERE t.agent_id = me.agent_id
           AND t.archived_at IS NULL
    ),
    -- §3.2's currency rule: the figure is the agent's most-used currency ALONE, and the
    -- screen says how many others it left out rather than summing across them.
    cur AS (
        SELECT b.currency, count(*) AS n
          FROM book b
         WHERE b.status IN ('inquiry', 'proposal', 'booked', 'in_progress')
         GROUP BY b.currency
         ORDER BY n DESC, b.currency
         LIMIT 1
    )
    SELECT
        count(*) FILTER (WHERE b.status = 'inquiry')::integer,
        count(*) FILTER (WHERE b.status = 'proposal')::integer,
        count(*) FILTER (WHERE b.status = 'booked')::integer,
        count(*) FILTER (WHERE b.status = 'in_progress')::integer,
        count(*) FILTER (WHERE b.status = 'completed')::integer,
        count(*) FILTER (WHERE b.status = 'cancelled')::integer,
        count(*)::integer,
        -- Pipeline value is the LIVE four only. A completed trip's value is history and a
        -- cancelled one's is not money at all; adding either would inflate the one number on
        -- this screen an advisor might quote out loud.
        coalesce(sum(b.total_value_cents) FILTER (
            WHERE b.status IN ('inquiry', 'proposal', 'booked', 'in_progress')
              AND b.currency = (SELECT currency FROM cur)), 0)::text,
        (SELECT currency FROM cur),
        (SELECT count(DISTINCT b2.currency)::integer FROM book b2
          WHERE b2.status IN ('inquiry', 'proposal', 'booked', 'in_progress'))
      FROM book b;
$$;

COMMENT ON FUNCTION public.agent_trip_roster_summary() IS
    'Screen 3.4.1''s six chip counts plus the pipeline figure. Counts cover all six statuses '
    'including completed and cancelled, which the design prototype''s chip row omits; the '
    'money covers the four live ones only.';

-- ─────────────────────────────────────────────────────────────────────────────
-- §3.4.1 Bulk status change — the action behind the roster's checkboxes
-- ─────────────────────────────────────────────────────────────────────────────
--
-- ── WHY THIS IS NOT agent_bulk_tag_clients WITH DIFFERENT NOUNS ──────────────────────────
--
-- §3.3.1's bulk tag needs no concurrency guard at all: adding a tag is set-valued and
-- idempotent, so it cannot clobber a concurrent edit. Setting a status is the opposite — it
-- OVERWRITES. If another tab moved a trip to `cancelled` while this selection sat on screen,
-- a bulk "mark booked" with no guard would quietly undo that.
--
-- Asking for twenty-five expected VERSIONS is impractical. So the guard is the thing the
-- screen actually knows: the status each row was SHOWING. `p_trip_ids` and `p_from_statuses`
-- are parallel arrays zipped by position, and a trip whose status has moved since the page
-- rendered is skipped rather than overwritten. That is exact, it needs nothing the UI does
-- not already have, and the skipped trip simply does not come back in the result.
--
-- ── CANCELLED IS NOT A BULK TARGET ───────────────────────────────────────────────────────
--
-- §3.4.16 is a whole screen for cancelling one trip: an impact list (card authorization
-- revoked, insurance refund window, supplier fee, commission removed) and a mandatory
-- reason. `agent_set_trip_status` enforces that reason for `cancelled`. Cancelling twenty
-- trips from a checkbox column, with no reason and nobody reading the impact, is not the
-- same action wearing a different hat — so this function refuses the target outright rather
-- than accepting it with a NULL reason.

CREATE OR REPLACE FUNCTION public.agent_bulk_set_trip_status(
    p_trip_ids       uuid[],
    p_from_statuses  trip_status[],
    p_agent_id       uuid,
    p_actor_user_id  uuid,
    p_to_status      trip_status
)
RETURNS TABLE (
    trip_id     uuid,
    from_status trip_status,
    version     integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $BULK$
DECLARE
    v_now timestamptz := now();
BEGIN
    IF p_to_status = 'cancelled' THEN
        RAISE EXCEPTION
            'agent_bulk_set_trip_status refuses `cancelled` — cancelling a trip needs '
            '§3.4.16''s reason and impact review, one trip at a time';
    END IF;

    IF p_trip_ids IS NULL OR cardinality(p_trip_ids) = 0 THEN
        RETURN;
    END IF;

    -- The two arrays ARE one list of pairs. A caller that sends them at different lengths
    -- has a bug that would otherwise silently zip short and move a subset.
    IF p_from_statuses IS NULL
       OR cardinality(p_from_statuses) <> cardinality(p_trip_ids) THEN
        RAISE EXCEPTION
            'agent_bulk_set_trip_status needs one expected status per trip id (got % ids, % statuses)',
            cardinality(p_trip_ids), cardinality(coalesce(p_from_statuses, ARRAY[]::trip_status[]));
    END IF;

    -- The roster pages at 25 and select-all selects the page. 100 is four times the largest
    -- honest request; a longer one is refused rather than truncated, for the reason
    -- agent_bulk_tag_clients gives.
    IF cardinality(p_trip_ids) > 100 THEN
        RAISE EXCEPTION 'agent_bulk_set_trip_status refuses more than 100 trips in one call';
    END IF;

    -- An archived advisor writes nothing — the same gate every read and write on this side
    -- applies, and the same `<> ''archived''` rather than `= ''active''`: an inactive advisor
    -- is paused, not gone.
    IF NOT EXISTS (
        SELECT 1 FROM public.agent a WHERE a.id = p_agent_id AND a.status <> 'archived'
    ) THEN
        RETURN;
    END IF;

    RETURN QUERY
    WITH asked AS (
        SELECT u.id, u.want
          FROM unnest(p_trip_ids, p_from_statuses) AS u(id, want)
    ),
    moved AS (
        UPDATE public.trip t
           SET status            = p_to_status,
               status_changed_at = v_now,
               updated_at        = v_now,
               version           = t.version + 1
          FROM asked a
         WHERE t.id = a.id
           AND t.agent_id = p_agent_id
           AND t.archived_at IS NULL
           -- The guard. A trip somebody else has moved since the page rendered is not this
           -- caller''s to overwrite.
           AND t.status = a.want
           -- Asking for the status it already holds is a no-op, not a transition: it would
           -- otherwise write a history row claiming a move that never happened.
           AND t.status <> p_to_status
        RETURNING t.id, a.want AS from_status, t.version
    ),
    logged AS (
        -- Aliased, and the returned column renamed. `trip_status_history.trip_id` and this
        -- function's OUTPUT PARAMETER `trip_id` are both in scope here, and plpgsql resolves
        -- a bare `trip_id` as ambiguous — at runtime, on the first call, not at create time.
        INSERT INTO public.trip_status_history AS h
            (id, trip_id, from_status, to_status, changed_at, changed_by_user_id)
        SELECT gen_random_uuid(), m.id, m.from_status, p_to_status, v_now, p_actor_user_id
          FROM moved m
        RETURNING h.trip_id AS logged_trip_id
    )
    -- `logged` is selected from so the CTE is not pruned. A data-modifying CTE nobody reads
    -- is still executed by Postgres, but making the dependency explicit means a later edit
    -- cannot accidentally drop the history write by rearranging the query.
    SELECT m.id, m.from_status, m.version
      FROM moved m
     WHERE m.id IN (SELECT logged_trip_id FROM logged);
END;
$BULK$;

COMMENT ON FUNCTION public.agent_bulk_set_trip_status(uuid[], trip_status[], uuid, uuid, trip_status) IS
    'Screen 3.4.1''s bulk status change. Guarded per trip by the status the screen was '
    'showing, because setting a status overwrites where adding a tag cannot. Refuses '
    '`cancelled`: that needs §3.4.16''s reason and impact review. One row back per trip '
    'actually moved, and one trip_status_history row alongside it.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Grants
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE f text;
BEGIN
    FOREACH f IN ARRAY ARRAY[
        'public.agent_trip_roster(trip_status[], uuid, text, integer, integer)',
        'public.agent_trip_roster_summary()'
    ]
    LOOP
        EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM public, anon', f);
        EXECUTE format('GRANT  EXECUTE ON FUNCTION %s TO authenticated, service_role', f);
    END LOOP;
END $$;

-- The write is service_role ONLY, and that is the same rule every §3.x write follows: it
-- takes `p_agent_id` as trusted input, so a client-role grant on it is an act-as-any-agent
-- primitive with no audit_event behind it.
REVOKE EXECUTE ON FUNCTION
    public.agent_bulk_set_trip_status(uuid[], trip_status[], uuid, uuid, trip_status)
    FROM public, anon, authenticated;
GRANT  EXECUTE ON FUNCTION
    public.agent_bulk_set_trip_status(uuid[], trip_status[], uuid, uuid, trip_status)
    TO service_role;

-- ── ASSERTIONS ───────────────────────────────────────────────────────────────────
--
-- Restated here rather than inherited: a DO block is a statement, not a constraint, and the
-- copy in an earlier migration only ever saw the catalog as it stood that day.
DO $$
DECLARE leaked text;
BEGIN
    SELECT string_agg(p.proname, ', ') INTO leaked
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname = 'agent_bulk_set_trip_status'
       AND (has_function_privilege('authenticated', p.oid, 'EXECUTE')
            OR has_function_privilege('anon', p.oid, 'EXECUTE'));
    IF leaked IS NOT NULL THEN
        RAISE EXCEPTION
            '§3.4.1''s bulk write must be service_role only — a client-role grant makes it '
            'an act-as-any-agent primitive with no audit_event: %', leaked;
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
       AND p.proname IN ('agent_trip_roster', 'agent_trip_roster_summary',
                         'agent_bulk_set_trip_status')
       AND (sp.value IS NULL
            OR btrim((string_to_array(sp.value, ','))[
                   cardinality(string_to_array(sp.value, ','))], ' "') <> 'pg_temp');
    IF leaked IS NOT NULL THEN
        RAISE EXCEPTION '§3.4.1 functions must end their search_path with pg_temp: %', leaked;
    END IF;
END $$;

COMMIT;
