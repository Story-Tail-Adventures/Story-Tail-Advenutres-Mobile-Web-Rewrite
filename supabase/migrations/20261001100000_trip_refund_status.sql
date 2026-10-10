-- §3.4.16 Cancel / Archive Trip: `trip.refund_status` gets a vocabulary and a producer.
--
-- ── WHAT WAS ALREADY THERE, AND WHAT WAS NOT ────────────────────────────────────────────
--
-- Most of cancelling was built during §3.4.1. `agent_set_trip_status` already makes a
-- reason mandatory on `cancelled`, already writes `trip.cancellation_reason` (it is the
-- only writer of that column anywhere), already refuses to cancel in bulk with a comment
-- reading *"§3.4.16 owns cancelling: it has an impact list and a mandatory reason"*, and
-- already lets an advisor correct a reason on a trip that is already cancelled.
--
-- `trip.refund_status` is the half that was not. It is free `text`, nullable, with no
-- vocabulary, no constraint and NOTHING THAT WRITES IT — and the client's own trip screen
-- already selects it (`web/lib/trips/queries.ts`, three query sites). So every cancelled
-- trip renders a blank refund line to the traveler, and has since the column was added.
-- Same shape as the three documented-total columns fixed last week, one field over.
--
-- Gyasi, 2026-09-28, asked whether cancelling should record where the refund stands: yes,
-- with fixed options rather than free text, so the value can be filtered and totalled later
-- and so the traveler is not reading the advisor's working notes.
--
-- ── THE VOCABULARY, AND WHY NULL IS NOT ONE OF ITS VALUES ───────────────────────────────
--
--   none_expected  the advisor has looked, and nothing is coming back
--   pending        requested or expected, not yet received
--   partial        some of it arrived; a fee or a non-refundable line kept the rest
--   full           all of it arrived
--
-- NULL stays legal and means "not stated". That is a different fact from `none_expected`:
-- one is an advisor who has not checked yet, the other is an advisor who has. Collapsing
-- them would put a confident "no refund" on the traveler's screen for every trip cancelled
-- before this shipped.
--
-- A CHECK rather than an enum, deliberately. `refund_status` is already `text` in a shipped
-- table that the client column grant exposes; converting it to an enum is a type change on
-- a granted column for no behavioural gain, and a CHECK is the cheaper thing to widen when
-- a fifth case turns up.
--
-- ── AND A SECOND COLUMN, WHICH THE SEED FORCED ──────────────────────────────────────────
--
-- The only cancelled trip in the seed carried this in `refund_status`:
--
--     'Refunded $1,640 on Feb 12; $240 future-trip credit through Dec 2027'
--
-- That is not an advisor's working note. It is a client-facing sentence with an amount, a
-- date, and a credit with an expiry, and §2.2.10 renders it to the traveler. Flattening it
-- to `partial` and calling the job done would have been a REGRESSION in what the client is
-- told, hidden inside a change whose stated purpose was to make the field more useful.
--
-- So the field splits, the way `cruise_sync_run` splits `status` from `error_detail` and
-- `commission` splits the rate from the fee: a STATE you can filter and total on, plus the
-- SPECIFICS a person actually needs. `refund_status` takes the vocabulary; `refund_detail`
-- takes the sentence. Neither is derivable from the other — 'partial' cannot tell you when
-- the money landed, and the sentence cannot be counted.
--
-- ── WHY THE FUNCTION IS DROPPED AND RECREATED ───────────────────────────────────────────
--
-- Adding a parameter with a DEFAULT does not replace the old function, it creates a second
-- OVERLOAD beside it — and PostgREST resolves RPC calls by argument names, so a six-arg and
-- a seven-arg `agent_set_trip_status` would be genuinely ambiguous for any caller that
-- omits the new one. DROP first, and the assertion at the foot proves only one survives.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. The vocabulary
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.trip
    ADD COLUMN refund_detail text;

-- The prose that was living in `refund_status`, moved before the CHECK can refuse it. This
-- one is NOT a no-op on `db reset` in the usual way: the seed is re-authored to write both
-- columns directly, so on a fresh apply there is nothing here to move. It matters on the
-- deployed database, where the row already exists.
UPDATE public.trip
   SET refund_detail = refund_status,
       refund_status = CASE
           WHEN refund_status IS NULL                       THEN NULL
           WHEN refund_status ~* 'no refund|non-?refundable' THEN 'none_expected'
           WHEN refund_status ~* 'credit|partial'            THEN 'partial'
           WHEN refund_status ~* 'pending|awaiting|expected' THEN 'pending'
           WHEN refund_status ~* 'refund'                    THEN 'full'
           ELSE NULL
       END
 WHERE refund_status IS NOT NULL
   AND refund_status NOT IN ('none_expected', 'pending', 'partial', 'full');

ALTER TABLE public.trip
    ADD CONSTRAINT trip_refund_status_vocabulary
        CHECK (refund_status IS NULL
               OR refund_status IN ('none_expected', 'pending', 'partial', 'full'));

COMMENT ON COLUMN public.trip.refund_status IS
    'Where the refund stands on a cancelled trip: none_expected, pending, partial, full, '
    'or NULL for "not stated" — which is a different fact from none_expected and is what '
    'every trip cancelled before 20261001100000 carries. Written only by '
    'agent_set_trip_status on a `cancelled` call (§3.4.16''s modal), and only ever SET by '
    'one: a trip moved back out of cancelled keeps its refund history, because the money '
    'moved and reinstating the trip does not un-move it. Inside the client column grant — '
    'the traveler''s §2.2.10 screen renders it.';

COMMENT ON COLUMN public.trip.refund_detail IS
    'The specifics behind refund_status, in the advisor''s own words, for the traveler: '
    '"Refunded $1,640 on Feb 12; $240 future-trip credit through Dec 2027". Client-visible, '
    'like refund_status. Exists because that sentence was what refund_status held before it '
    'had a vocabulary, and a filterable state cannot carry an amount, a date or an expiry. '
    'Neither column derives from the other.';

COMMENT ON CONSTRAINT trip_refund_status_vocabulary ON public.trip IS
    'Fixed options rather than free text (Gyasi, 2026-09-28) so the value can be filtered '
    'and totalled, and so the traveler is not shown the advisor''s working notes. A CHECK '
    'rather than an enum because the column is already text in a shipped, client-granted '
    'table, and a CHECK is the cheaper thing to widen.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. The write path
-- ─────────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.agent_set_trip_status(
    uuid, uuid, uuid, trip_status, integer, text);

CREATE FUNCTION public.agent_set_trip_status(
    p_trip_id          uuid,
    p_agent_id         uuid,
    p_actor_user_id    uuid,
    p_status           trip_status,
    p_expected_version integer,
    p_reason           text DEFAULT NULL,
    -- §3.4.16. NULL means "not stated", which is different from 'none_expected': one is an
    -- advisor who has not looked yet, the other is an advisor who has. The client's §2.2.10
    -- screen renders them differently for that reason.
    p_refund_status    text DEFAULT NULL,
    -- The sentence behind the state. See the header: the state can be counted, this cannot.
    p_refund_detail    text DEFAULT NULL
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
        -- WIDENED IN 20261001100000 to cover `refund_status` as well as the reason.
        -- Both are facts about the same cancellation, and the refund one MOVES over time:
        -- a refund that is `pending` the day the trip is cancelled becomes `full` or
        -- `partial` weeks later. A write-once field with no way to correct it is the
        -- shape that made this branch necessary for the reason in the first place.
        --
        -- The outcome string stays `reason_changed` rather than being renamed. It is the
        -- "a cancellation detail moved without a transition" outcome, and the Edge
        -- Function, its tests and rls_agent_write.sql all key on it; a rename would be
        -- churn across three files for a word.
        IF p_status = 'cancelled'
           AND (
                (p_reason IS NOT NULL
                 AND p_reason IS DISTINCT FROM v_trip.cancellation_reason)
             OR (p_refund_status IS NOT NULL
                 AND p_refund_status IS DISTINCT FROM v_trip.refund_status)
             OR (p_refund_detail IS NOT NULL
                 AND p_refund_detail IS DISTINCT FROM v_trip.refund_detail)
           )
        THEN
            UPDATE public.trip
               SET cancellation_reason = coalesce(p_reason, cancellation_reason),
                   refund_status       = coalesce(p_refund_status, refund_status),
                   refund_detail       = coalesce(p_refund_detail, refund_detail),
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
                                      ELSE cancellation_reason END,
           -- Only ever set BY a cancellation. A trip moved out of `cancelled` keeps its
           -- refund history rather than having it silently cleared: the money moved, and
           -- reinstating the trip does not un-move it.
           refund_status       = CASE WHEN p_status = 'cancelled'
                                      THEN coalesce(p_refund_status, refund_status)
                                      ELSE refund_status END,
           refund_detail       = CASE WHEN p_status = 'cancelled'
                                      THEN coalesce(p_refund_detail, refund_detail)
                                      ELSE refund_detail END
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

-- service_role ONLY. `p_agent_id` is trusted input, so a client-role grant here would be an
-- act-as-any-agent primitive with no audit row. Restated because DROP took the old grants
-- with it.
REVOKE ALL ON FUNCTION public.agent_set_trip_status(
    uuid, uuid, uuid, trip_status, integer, text, text, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.agent_set_trip_status(
    uuid, uuid, uuid, trip_status, integer, text, text, text) TO service_role;

COMMENT ON FUNCTION public.agent_set_trip_status(
    uuid, uuid, uuid, trip_status, integer, text, text, text) IS
    'Move a trip between pipeline stages (Screen 3.2.2), and record a cancellation''s reason '
    'and refund status (Screen 3.4.16). The trip update and its history row are one '
    'statement pair. cancelled -> cancelled carrying a different reason OR a different '
    'refund status is outcome ''reason_changed'': a detail moved without a transition, so '
    'the column is written, the version climbs, and NO history row is created. Both '
    'cancellation fields are the advisor correcting a record over time — a refund that is '
    'pending on the day of cancellation becomes full or partial weeks later.';

-- ── ASSERTIONS ───────────────────────────────────────────────────────────────────

-- EXACTLY ONE overload survives. Two would make every PostgREST call that omits
-- p_refund_status ambiguous, which is a runtime failure on a write path with no local
-- symptom — the local stack resolves it the same way right up until it does not.
DO $$
DECLARE n integer;
BEGIN
    SELECT count(*) INTO n
      FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
     WHERE ns.nspname = 'public' AND p.proname = 'agent_set_trip_status';

    IF n <> 1 THEN
        RAISE EXCEPTION
            'expected exactly one agent_set_trip_status, found % — adding a parameter with '
            'a DEFAULT creates an OVERLOAD rather than replacing the function, and '
            'PostgREST cannot choose between them', n;
    END IF;
END $$;

DO $$
DECLARE
    leaked   text;
    unpinned boolean;
BEGIN
    SELECT string_agg(r, ', ') INTO leaked
      FROM unnest(ARRAY['anon', 'authenticated']) r
     WHERE has_function_privilege(
               r, 'public.agent_set_trip_status(uuid, uuid, uuid, trip_status, integer, '
                  'text, text, text)', 'EXECUTE');

    IF leaked IS NOT NULL THEN
        RAISE EXCEPTION
            'a client role can execute agent_set_trip_status: %. p_agent_id is trusted '
            'input, so that is an act-as-any-agent primitive with no audit row.', leaked;
    END IF;

    SELECT NOT EXISTS (
        SELECT 1 FROM pg_proc p
          JOIN pg_namespace ns ON ns.oid = p.pronamespace
         CROSS JOIN LATERAL unnest(coalesce(p.proconfig, ARRAY[]::text[])) cfg
         WHERE ns.nspname = 'public' AND p.proname = 'agent_set_trip_status'
           AND cfg = 'search_path=public, pg_temp'
    ) INTO unpinned;

    IF unpinned THEN
        RAISE EXCEPTION
            'agent_set_trip_status must pin search_path ending in pg_temp; DROP + CREATE '
            'loses any pin that was applied with ALTER FUNCTION rather than in the body';
    END IF;
END $$;

-- The CHECK bites. Against an EMPTY table on a fresh apply, so this is the deployed-database
-- half; constraints_trip_totals.sql carries the seeded-row version.
DO $$
DECLARE victim uuid;
BEGIN
    SELECT id INTO victim FROM public.trip LIMIT 1;
    IF victim IS NULL THEN RETURN; END IF;

    BEGIN
        UPDATE public.trip SET refund_status = 'mostly, probably' WHERE id = victim;
        RAISE EXCEPTION 'trip_refund_status_vocabulary accepted free text';
    EXCEPTION
        WHEN check_violation THEN NULL;
    END;
END $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. The trip detail read learns about refund_detail
-- ─────────────────────────────────────────────────────────────────────────────
--
-- DROP + CREATE because adding a column changes the RETURNS TABLE result type. The grant,
-- the search_path pin and the COMMENT all go with the DROP, so all three are restated.

DROP FUNCTION IF EXISTS public.agent_trip_overview(uuid);

CREATE FUNCTION public.agent_trip_overview(p_trip_id uuid)
RETURNS TABLE (
    trip_id                   uuid,
    client_id                 uuid,
    client_display_name       text,
    title                     text,
    trip_type                 trip_type,
    status                    trip_status,
    status_changed_at         timestamptz,
    start_date                date,
    end_date                  date,
    destinations              text[],
    traveler_count            integer,
    traveler_breakdown        jsonb,
    total_value_cents         text,
    total_paid_cents          text,
    total_commission_cents    text,
    currency                  char(3),
    cancellation_reason       text,
    refund_status             text,
    -- §3.4.16. The sentence behind the state; see 20261001100000's header for why they are
    -- two columns. Both are inside the client column grant — the traveler reads them too.
    refund_detail             text,
    notes                     text,
    version                   integer,
    card_last4                char(4),
    card_brand                text,
    card_spending_limit_cents text,
    last_activity_at          timestamptz,
    component_count           integer,
    manual_component_count    integer,
    api_component_count       integer,
    as_of_date                date,
    next_unpaid_due_date      date
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    WITH me AS (
        SELECT t.*
          FROM public.trip t
         WHERE t.id = p_trip_id
           AND t.agent_id = public.current_agent_id()
           AND t.archived_at IS NULL
    ),
    client_row AS (
        SELECT coalesce(c.preferred_name, c.first_name) || ' ' || c.last_name AS name
          FROM public.client c, me
         WHERE c.id = me.client_id
    ),
    -- The most recent ACTIVE authorization, not every authorization ever issued — an expired
    -- or revoked one is not the card on file today.
    card AS (
        SELECT pcard.last4, pcard.brand, ca.spending_limit_cents
          FROM public.card_authorization ca
          JOIN public.payment_card pcard ON pcard.id = ca.payment_card_id
         WHERE ca.trip_id = p_trip_id AND ca.status = 'active'
         ORDER BY ca.created_at DESC
         LIMIT 1
    ),
    -- "Last activity" is the later of a stage change or a message on this trip's threads.
    -- Both are business events worth surfacing; document uploads and payments are not, since
    -- neither is a signal the agent needs an "activity" line to catch their attention for.
    --
    -- ARCHIVED THREADS DO NOT COUNT, and every other conversation read on this side already
    -- agrees: agent_kpis, agent_trip_board's unread LATERAL and agent_inbox all carry
    -- `cv.archived_at IS NULL`, as does the client-side policy. Without it here, archiving a
    -- thread — the advisor's only way to put one down — left its last message still driving
    -- this field, so the worklist reported no activity on a trip whose header still named a
    -- date from the thread they had deliberately filed away.
    activity AS (
        SELECT greatest(
                   (SELECT max(h.changed_at) FROM public.trip_status_history h
                     WHERE h.trip_id = p_trip_id),
                   (SELECT max(cv.last_message_at) FROM public.conversation cv
                     WHERE cv.trip_id = p_trip_id AND cv.archived_at IS NULL)
               ) AS at
    ),
    comps AS (
        SELECT count(*)::integer AS n,
               count(*) FILTER (WHERE api_source IS NULL)::integer     AS manual_n,
               count(*) FILTER (WHERE api_source IS NOT NULL)::integer AS api_n
          FROM public.trip_component
         WHERE trip_id = p_trip_id AND archived_at IS NULL
    ),
    -- THE TWO VALUES `tripStatusPresentation` NEEDS, and the reason they are computed here
    -- rather than in TypeScript. A `booked` trip with a milestone due inside 14 days calls
    -- itself "Final payment due" instead of "Booked" — BRD §6.2's label, derived rather than
    -- stored. That comparison is against the agent's OWN today, so `as_of_date` is built in
    -- `agent.time_zone` exactly the way agent_kpis() builds its own: deriving "today" from
    -- the server clock in the browser layer misfiles every trip whose milestone falls on the
    -- boundary, for the offset's worth of hours either side of midnight.
    due AS (
        SELECT (now() AT TIME ZONE a.time_zone)::date AS today,
               (SELECT min(pm.due_date)
                  FROM public.payment_milestone pm
                 WHERE pm.trip_id = p_trip_id
                   AND pm.status IN ('scheduled', 'overdue')
                   AND pm.due_date IS NOT NULL) AS next_unpaid
          FROM public.agent a, me
         WHERE a.id = me.agent_id
    )
    SELECT
        me.id, me.client_id, client_row.name, me.title, me.trip_type, me.status,
        me.status_changed_at, me.start_date, me.end_date, me.destinations,
        me.traveler_count, me.traveler_breakdown,
        me.total_value_cents::text, me.total_paid_cents::text, me.total_commission_cents::text,
        me.currency, me.cancellation_reason, me.refund_status, me.refund_detail,
        me.notes, me.version,
        card.last4, card.brand, card.spending_limit_cents::text,
        activity.at,
        comps.n, comps.manual_n, comps.api_n,
        due.today, due.next_unpaid
      FROM me, client_row, activity, comps, due
      LEFT JOIN card ON true;
$$;

COMMENT ON FUNCTION public.agent_trip_overview(uuid) IS
    'Screen 3.4.2''s header, at-a-glance grid, and the two sidebar cards'' underlying figures. '
    'No "booking source" column: the design prototype draws one and no such column exists on '
    '`trip` anywhere in the schema — the same class of invented field as Pipeline''s '
    '"Qualified"/"Traveling" columns, recorded here rather than chased with a migration. '
    'total_commission_cents and notes are both Internal (outside the client grant) and are '
    'exactly why this is an accessor rather than a plain select.';

REVOKE ALL ON FUNCTION public.agent_trip_overview(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.agent_trip_overview(uuid) TO authenticated, service_role;

DO $$
DECLARE result text := pg_get_function_result('public.agent_trip_overview(uuid)'::regprocedure);
BEGIN
    IF result NOT LIKE '%refund_detail%' THEN
        RAISE EXCEPTION 'agent_trip_overview() does not return refund_detail';
    END IF;

    IF has_function_privilege('anon', 'public.agent_trip_overview(uuid)', 'EXECUTE') THEN
        RAISE EXCEPTION 'anon can execute agent_trip_overview()';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
         CROSS JOIN LATERAL unnest(coalesce(p.proconfig, ARRAY[]::text[])) cfg
         WHERE ns.nspname = 'public' AND p.proname = 'agent_trip_overview'
           AND cfg = 'search_path=public, pg_temp'
    ) THEN
        RAISE EXCEPTION 'agent_trip_overview() lost its search_path pin to the DROP';
    END IF;
END $$;

COMMIT;
