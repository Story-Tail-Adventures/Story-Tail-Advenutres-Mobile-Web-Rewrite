-- The agent read surface for Screen Inventory §3.4.2 (Trip Detail, agent view). Eight
-- SECURITY DEFINER accessors, one per row-shape the eight tabs need.
--
-- SAME PATTERN AS §3.2, NOT A NEW ONE. The §3.2 agent read surface migration's header already
-- argues why this is RPC and not a policy (RLS decides rows, GRANTs decide columns, and
-- `trip.notes` / `trip_component.cost_cents` / `message.is_internal_note` are outside the
-- client grant), why search_path is pinned with pg_temp named last, and why money crosses as
-- a digit-string. None of that is re-argued here — this migration only adds functions in the
-- same shape.
--
-- IT CARRIES ITS OWN ASSERTIONS, AND IT HAS TO. An earlier draft of this header claimed the
-- §3.2 migration's two "schema-wide" guards covered these eight for free, because both glob
-- `agent\_%` rather than naming functions. They do — but a `DO $$ … $$` block is a statement,
-- not a constraint: it runs ONCE, inside its own migration's transaction, against the catalog
-- as it stood at that point in history. Nothing created by a later migration was in
-- `pg_proc` to be scanned, so neither guard can ever see these eight. "Schema-wide" describes
-- the query's reach on the day it ran, not a standing policy. Every migration that adds a
-- SECURITY DEFINER function therefore re-states the checks for its own functions, which is
-- what the two §3.2 write migrations already do and what the bottom of this file now does.
--
-- EIGHT FUNCTIONS, NOT ONE. `RETURNS TABLE` fixes one row shape per function, and the header
-- (one row) and the six list-shaped tabs (components, itinerary meta, itinerary days,
-- payments, documents, messages, activity) are seven different shapes. Folding them into one
-- wide row of jsonb sub-shapes would mean hand-parsed JSON on the TypeScript side, which
-- throws away exactly the "the projection IS the return type" property this pattern exists
-- for. `agent_trip_payments` deliberately serves both the Overview sidebar's summary and the
-- full Payments tab — one read, two renderings — rather than adding a ninth function for a
-- top-N view of rows the tab already lists in full.
--
-- EVERY FUNCTION IS GATED THROUGH THE SAME OWNERSHIP CTE: `me AS (SELECT ... FROM trip t
-- WHERE t.id = p_trip_id AND t.agent_id = current_agent_id() AND t.archived_at IS NULL)`.
-- Zero rows for "no such trip" and "not yours" alike, matching `agent_set_trip_status`'s
-- convention — an agent cannot tell the two apart by probing.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3.4.2 Overview — the header, the at-a-glance grid, and the two sidebar cards
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.agent_trip_overview(p_trip_id uuid)
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
    activity AS (
        SELECT greatest(
                   (SELECT max(h.changed_at) FROM public.trip_status_history h
                     WHERE h.trip_id = p_trip_id),
                   (SELECT max(cv.last_message_at) FROM public.conversation cv
                     WHERE cv.trip_id = p_trip_id)
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
        me.currency, me.cancellation_reason, me.refund_status, me.notes, me.version,
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

-- ─────────────────────────────────────────────────────────────────────────────
-- 3.4.2 Components tab
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.agent_trip_components(p_trip_id uuid)
RETURNS TABLE (
    component_id        uuid,
    kind                 component_kind,
    display_name         text,
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
    order_index          integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT
        tc.id, tc.kind, tc.display_name, tc.start_date, tc.end_date, tc.start_time, tc.end_time,
        tc.location, tc.confirmation_number,
        tc.cost_cents::text, tc.commission_pct, tc.commission_cents::text, tc.currency,
        tc.api_source, tc.order_index
      FROM public.trip_component tc
      JOIN public.trip t
        ON t.id = tc.trip_id
       AND t.agent_id = public.current_agent_id()
       AND t.archived_at IS NULL
     WHERE tc.trip_id = p_trip_id
       AND tc.archived_at IS NULL
     ORDER BY tc.order_index;
$$;

COMMENT ON FUNCTION public.agent_trip_components(uuid) IS
    'The flat per-component list (Screen 3.4.2''s Components tab, distinct from Itinerary — '
    'the design prototype merges the two into one section, but Screen-Inventory''s text lists '
    'them as separate tabs and the doc hierarchy puts the text above the drawing). `payload` '
    '(type-specific, Internal) is absent from the signature rather than selected-and-ignored: '
    'nothing a component row renders needs it, matching `agent_availability_self()`''s '
    'unnameable-refresh-token precedent.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3.4.2 Itinerary tab — meta row, then day+activity rows
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.agent_trip_itinerary_meta(p_trip_id uuid)
RETURNS TABLE (
    itinerary_id       uuid,
    cover_image_url     text,
    intro_note          text,
    closing_note        text,
    published_at        timestamptz,
    last_published_at   timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT i.id, i.cover_image_url, i.intro_note, i.closing_note, i.published_at, i.last_published_at
      FROM public.itinerary i
      JOIN public.trip t
        ON t.id = i.trip_id
       AND t.agent_id = public.current_agent_id()
       AND t.archived_at IS NULL
     WHERE i.trip_id = p_trip_id;
$$;

COMMENT ON FUNCTION public.agent_trip_itinerary_meta(uuid) IS
    'No `published_at IS NOT NULL` gate, unlike the client-side itinerary read — an agent '
    'edits an itinerary before it is published and must see the draft, not a blank tab.';

CREATE OR REPLACE FUNCTION public.agent_trip_itinerary_days(p_trip_id uuid)
RETURNS TABLE (
    day_id              uuid,
    day_number           integer,
    date                 date,
    day_label            text,
    day_summary          text,
    activity_id          uuid,
    block                block_kind,
    start_time           time,
    end_time             time,
    activity_title       text,
    activity_body        text,
    location             text,
    address              text,
    phone                text,
    confirmation_number  text,
    gyasis_tip           text,
    component_id         uuid,
    activity_order       integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT
        d.id, d.day_number, d.date, d.label, d.summary,
        a.id, a.block, a.start_time, a.end_time, a.title, a.body,
        a.location, a.address, a.phone, a.confirmation_number, a.gyasis_tip,
        a.component_id, a.order_index
      FROM public.itinerary_day d
      JOIN public.itinerary i ON i.id = d.itinerary_id
      JOIN public.trip t
        ON t.id = i.trip_id
       AND t.agent_id = public.current_agent_id()
       AND t.archived_at IS NULL
      LEFT JOIN public.itinerary_activity a ON a.itinerary_day_id = d.id
     WHERE i.trip_id = p_trip_id
     ORDER BY d.day_number, a.order_index;
$$;

COMMENT ON FUNCTION public.agent_trip_itinerary_days(uuid) IS
    'One row per activity, day fields repeated — `RETURNS TABLE` cannot nest a day -> '
    'activities[] shape, and the caller groups by day_id in TypeScript exactly the way '
    '`lib/trips/queries.ts`''s `loadItinerary` already groups two separate client-side reads. '
    'A day with no activities yet still returns its one row, with every activity_* column '
    'null, via the LEFT JOIN — an empty day is not the same as a day that does not exist.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3.4.2 Payments tab, and the Overview sidebar's payments summary
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.agent_trip_payments(p_trip_id uuid)
RETURNS TABLE (
    milestone_id  uuid,
    kind          payment_milestone_kind,
    label         text,
    amount_cents  text,
    paid_cents    text,
    currency      char(3),
    due_date      date,
    status        payment_milestone_status,
    order_index   integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT pm.id, pm.kind, pm.label, pm.amount_cents::text, pm.paid_cents::text,
           pm.currency, pm.due_date, pm.status, pm.order_index
      FROM public.payment_milestone pm
      JOIN public.trip t
        ON t.id = pm.trip_id
       AND t.agent_id = public.current_agent_id()
       AND t.archived_at IS NULL
     WHERE pm.trip_id = p_trip_id
     ORDER BY pm.order_index;
$$;

COMMENT ON FUNCTION public.agent_trip_payments(uuid) IS
    'Every milestone for the trip, in schedule order. Serves both the Overview sidebar''s '
    'summary card (the caller picks the next unpaid row or two) and the full Payments tab — '
    'one read, two renderings, rather than a second function for a top-N view of rows the '
    'tab already lists in full.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3.4.2 Documents tab
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.agent_trip_documents(p_trip_id uuid)
RETURNS TABLE (
    document_id    uuid,
    owner_user_id  uuid,
    kind           document_kind,
    filename       text,
    mime_type      text,
    size_bytes     text,
    is_sensitive   boolean,
    created_at     timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT d.id, d.owner_user_id, d.kind, d.filename, d.mime_type, d.size_bytes::text,
           d.is_sensitive, d.created_at
      FROM public.document d
      JOIN public.trip t
        ON t.id = d.trip_id
       AND t.agent_id = public.current_agent_id()
       AND t.archived_at IS NULL
     WHERE d.trip_id = p_trip_id
       AND d.archived_at IS NULL
       -- Everything the client-side allowlist admits (passport, visa, insurance_cert,
       -- supplier_confirmation, photo, pdf_itinerary) PLUS the three it withholds from a
       -- traveler but an advisor files themselves: receipt, pdf_proposal and other.
       --
       -- ONE KIND STAYS OUT, AND IT IS THE ONLY ONE THAT MATTERS HERE. `csv_import` is an
       -- Inteletravel commission CSV: `commission_import.document_id` points into this same
       -- `document` table, and `commission_import` has no trip of its own, so such a row
       -- reaches a trip only incidentally. Admitting the kind would put cross-client agency
       -- financial data on one traveler's Documents tab through a join nobody reading that
       -- tab asked for.
       AND d.kind <> 'csv_import'
     ORDER BY d.created_at DESC;
$$;

COMMENT ON FUNCTION public.agent_trip_documents(uuid) IS
    'Every document kind except csv_import, which is withheld because '
    'commission_import.document_id points at the same table for cross-client agency '
    'financial data that reaches a trip only incidentally. The three kinds this adds over '
    'the client-side allowlist are receipt, pdf_proposal and other. storage_bucket, '
    'storage_key and checksum_sha256 stay out of the signature — server-only, unnameable '
    'rather than merely unselected.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3.4.2 Messages tab
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.agent_trip_messages(p_trip_id uuid)
RETURNS TABLE (
    message_id        uuid,
    sender_role        user_role,
    body               text,
    created_at         timestamptz,
    is_internal_note   boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT m.id, m.sender_role, m.body, m.created_at, m.is_internal_note
      FROM public.message m
      JOIN public.conversation cv ON cv.id = m.conversation_id
      JOIN public.trip t
        ON t.id = cv.trip_id
       AND t.agent_id = public.current_agent_id()
       AND t.archived_at IS NULL
     WHERE cv.trip_id = p_trip_id
       AND m.archived_at IS NULL
     ORDER BY m.created_at;
$$;

COMMENT ON FUNCTION public.agent_trip_messages(uuid) IS
    '`is_internal_note` IS SELECTED, unlike the client-side message read that excludes it. '
    'The exclusion exists to hide an agent''s own internal notes from the client on that '
    'thread; an agent viewing their own trip needs to see the note they left. Read-only in '
    'this pass — sending is §3.10.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3.4.2 Activity tab — the business timeline, not the forensic audit trail
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.agent_trip_activity(p_trip_id uuid)
RETURNS TABLE (
    history_id        uuid,
    from_status        trip_status,
    to_status          trip_status,
    changed_at         timestamptz,
    changed_by_name    text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT h.id, h.from_status, h.to_status, h.changed_at, pu.display_name
      FROM public.trip_status_history h
      JOIN public.trip t
        ON t.id = h.trip_id
       AND t.agent_id = public.current_agent_id()
       AND t.archived_at IS NULL
      LEFT JOIN public.platform_user pu ON pu.id = h.changed_by_user_id
     WHERE h.trip_id = p_trip_id
     ORDER BY h.changed_at DESC;
$$;

COMMENT ON FUNCTION public.agent_trip_activity(uuid) IS
    'trip_status_history, not audit_event: this is the queryable BUSINESS timeline (Data-Model '
    '§8.8), which is what an agent reading "what happened to this trip" wants. audit_event is '
    'the tamper-evident forensic trail (actor IP, user agent) and is out of scope for this '
    'tab. `changed_by_name` is null for a transition with no `changed_by_user_id` — there is '
    'none today, but the column is nullable and a future system-driven transition should not '
    'crash this read.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Grants
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE f text;
BEGIN
    FOREACH f IN ARRAY ARRAY[
        'public.agent_trip_overview(uuid)',
        'public.agent_trip_components(uuid)',
        'public.agent_trip_itinerary_meta(uuid)',
        'public.agent_trip_itinerary_days(uuid)',
        'public.agent_trip_payments(uuid)',
        'public.agent_trip_documents(uuid)',
        'public.agent_trip_messages(uuid)',
        'public.agent_trip_activity(uuid)'
    ]
    LOOP
        -- `anon` by name; see the §3.2 read-surface migration's note on current_agent_id()
        -- for why `REVOKE ... FROM public` alone is a no-op.
        EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM public, anon', f);
        EXECUTE format('GRANT  EXECUTE ON FUNCTION %s TO authenticated, service_role', f);
    END LOOP;
END $$;

-- ── ASSERTIONS ───────────────────────────────────────────────────────────────────

-- The eight names these three blocks all check. Kept as one list so a ninth accessor added
-- to this file cannot be added to one guard and forgotten in the others.
DO $$
DECLARE
    names text[] := ARRAY[
        'agent_trip_overview', 'agent_trip_components', 'agent_trip_itinerary_meta',
        'agent_trip_itinerary_days', 'agent_trip_payments', 'agent_trip_documents',
        'agent_trip_messages', 'agent_trip_activity'
    ];
    found   integer;
    leaked  text;
    unpinned text;
BEGIN
    -- Every one of them exists under the name the grants loop above used. A typo there is
    -- otherwise silent: `REVOKE ... FROM anon` on a name that does not exist raises, but a
    -- name this file never created would simply go unchecked by the two blocks below.
    SELECT count(*) INTO found
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = ANY (names);

    IF found <> array_length(names, 1) THEN
        RAISE EXCEPTION
            '§3.4.2 expected % accessors in public, found %',
            array_length(names, 1), found;
    END IF;

    -- A future `GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public` would hand the whole trip
    -- detail surface to unauthenticated callers.
    SELECT string_agg(p.proname, ', ') INTO leaked
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname = ANY (names)
       AND has_function_privilege('anon', p.oid, 'EXECUTE');

    IF leaked IS NOT NULL THEN
        RAISE EXCEPTION 'anon can execute §3.4.2 trip detail read functions: %', leaked;
    END IF;

    -- THE PIN, AND ITS POSITION. Checking only that SOME search_path is set is the weaker
    -- test the §3.2 migration's own comment warns about: `SET search_path = public` leaves
    -- pg_temp searched FIRST for relation names, which is exactly the shadowing the pin
    -- exists to stop. pg_temp must be NAMED, and named LAST. (The empty pin, `search_path
    -- = ''`, is stricter still — it resolves nothing implicitly — and is accepted here for
    -- the reason the §3.2 migration spells out at length.)
    SELECT string_agg(
               p.proname || ' (search_path=' || coalesce(sp.value, '<unset>') || ')',
               ', ' ORDER BY p.proname)
      INTO unpinned
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      LEFT JOIN LATERAL (
            SELECT substr(cfg, length('search_path=') + 1) AS value
              FROM unnest(coalesce(p.proconfig, ARRAY[]::text[])) cfg
             WHERE cfg LIKE 'search\_path=%'
             LIMIT 1
           ) sp ON true
     WHERE n.nspname = 'public'
       AND p.proname = ANY (names)
       AND (
            sp.value IS NULL
            OR (
                 btrim(sp.value, ' "') <> ''
                 AND btrim(
                       (string_to_array(sp.value, ','))[
                           cardinality(string_to_array(sp.value, ','))],
                       ' "'
                     ) <> 'pg_temp'
               )
           );

    IF unpinned IS NOT NULL THEN
        RAISE EXCEPTION
            '§3.4.2 accessors must end their search_path with pg_temp, so a temp relation '
            'cannot shadow a real one inside a function running as the table owner: %',
            unpinned;
    END IF;
END $$;

-- The projection, asserted from the catalog for the two functions whose withheld column is
-- security-relevant enough to name explicitly (the pattern used for agent_availability_self's
-- refresh token).
DO $$
BEGIN
    IF pg_get_function_result('public.agent_trip_components'::regproc) LIKE '%payload%' THEN
        RAISE EXCEPTION
            'agent_trip_components() names trip_component.payload, which is Internal '
            '(type-specific, unvetted for client-facing rendering) and must be unnameable';
    END IF;

    IF pg_get_function_result('public.agent_trip_documents'::regproc) LIKE '%storage_%'
       OR pg_get_function_result('public.agent_trip_documents'::regproc) LIKE '%checksum%'
    THEN
        RAISE EXCEPTION
            'agent_trip_documents() names a server-only storage column, which must be '
            'unnameable rather than merely unselected';
    END IF;
END $$;

COMMIT;
