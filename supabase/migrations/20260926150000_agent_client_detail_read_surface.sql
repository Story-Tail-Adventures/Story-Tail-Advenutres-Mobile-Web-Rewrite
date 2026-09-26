-- The agent read surface for Screen Inventory §3.3.2 – §3.3.8 (Client Detail and its six
-- tabs). Seven SECURITY DEFINER accessors, one per row-shape the screen needs.
--
-- SAME PATTERN AS §3.2, §3.4.2 AND §3.3.1, NOT A NEW ONE. The §3.2 read-surface migration's
-- header argues why this is RPC and not a policy; the §3.3.1 one argues why `client` in
-- particular had no other option. Neither is re-argued here.
--
-- IT CARRIES ITS OWN ASSERTIONS. A `DO $$ … $$` block is a statement, not a constraint: it
-- runs once, against the catalog as it stood inside its own migration's transaction, so the
-- earlier "schema-wide" guards cannot see anything created later however wide their
-- `agent\_%` glob looks. Restated at the bottom for these seven.
--
-- ── SEVEN FUNCTIONS FOR SIX TABS ───────────────────────────────────────────────────────
--
-- `RETURNS TABLE` fixes one row shape per function, which is the property the whole pattern
-- exists for. The Overview tab needs two: one row of the client's own facts, and a LIST of
-- household companions. Everything else is one list each.
--
-- The single-row Overview carries `travel_preference` inline rather than in an eighth
-- function, because `travel_preference.client_id` is UNIQUE — it is one row per client by
-- construction, so folding it in adds no cardinality and costs no round trip.
--
-- ── WHAT THE ACTIVITY TAB IS, AND WHAT IT IS NOT ───────────────────────────────────────
--
-- Screen-Inventory §3.3.8 describes "logins, payment authorizations, status changes, agent
-- actions", and the prototype draws a sign-in row first. Sign-ins live in `auth_event`, not
-- `audit_event`, and they have their OWN screen: §3.9.6 Login Activity, inside Login Support
-- / Account Administration. Putting them here would build half of §3.9.6 under a different
-- heading and give two screens separate reads of the same table.
--
-- So this tab is `audit_event` — the record of what was DONE to this client and their trips,
-- which is the half §3.3.8 is uniquely positioned to show. The union is deliberate: an event
-- targeting the client, or targeting one of their trips. A card authorization is recorded
-- against the trip it was raised for, so scoping to `target_entity = 'client'` alone would
-- have shown an almost empty timeline on the tab whose whole purpose is the timeline.
--
-- ── WHY THESE TABLES NEED AN ACCESSOR AT ALL ───────────────────────────────────────────
--
--   client_note      `20260919120000_agent_domain_lockdown` REVOKEs ALL. Zero grants to any
--                    client role, so an agent reading their own notes gets 42501.
--   audit_event      RLS on, no policy, no grant. Nothing reads it through PostgREST.
--   document         `storage_key` and `checksum_sha256` are server-only; the projection
--                    below cannot name them, and an assertion at the bottom enforces that.
--   message          `is_internal_note` is outside the client grant.
--   client           `tags`, `status` and the money, as §3.3.1 records.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- Shared ownership gate
--
-- Every function below opens with this shape. Zero rows for "no such client" and "not
-- yours" alike, matching agent_trip_overview's convention — an agent cannot tell the two
-- apart by probing ids. Written out in each function rather than factored into a helper,
-- because a helper would be a second SECURITY DEFINER surface to grant and audit.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────────────────────
-- §3.3.2 / §3.3.3 Overview — the header card and the snapshot
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.agent_client_overview(p_client_id uuid)
RETURNS TABLE (
    client_id               uuid,
    display_name            text,
    first_name              text,
    last_name               text,
    preferred_name          text,
    email                   text,
    phone                   text,
    date_of_birth           date,
    status                  client_status,
    tags                    text[],
    important_dates         jsonb,
    emergency_contact       jsonb,
    address_line1           text,
    address_line2           text,
    address_city            text,
    address_region          text,
    address_postal_code     text,
    address_country         char(2),
    notes                   text,
    version                 integer,
    created_at              timestamptz,
    archived_at             timestamptz,
    -- travel_preference is 1:1 by a UNIQUE constraint, so it rides this row.
    preferred_destinations  text[],
    travel_styles           text[],
    dietary_restrictions    text[],
    -- The actionable half the closed vocabulary cannot carry. Sensitive PII (health
    -- adjacent), and the advisor booking the restaurant is exactly who needs it —
    -- "pescatarian" without "shellfish is a hard no" is worse than useless.
    dietary_notes           text,
    accessibility_needs     text[],
    accessibility_notes     text,
    loyalty_programs        jsonb,
    budget_band             text,
    favorite_past_trips     text,
    -- Derived, and scoped exactly as §3.3.1's roster scopes them.
    lifetime_value_cents    text,
    lifetime_currency       char(3),
    lifetime_currency_count integer,
    commission_cents        text,
    trip_count              integer,
    active_trip_count       integer,
    note_count              integer,
    document_count          integer,
    last_contact_at         timestamptz,
    as_of_date              date
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    WITH me AS (
        SELECT c.*, (now() AT TIME ZONE a.time_zone)::date AS today
          FROM public.client c
          JOIN public.agent a ON a.id = c.agent_id
         WHERE c.id = p_client_id
           AND c.agent_id = public.current_agent_id()
           -- A merged tombstone is not a client detail page. §3.9's merge tooling reads
           -- those rows directly; here the id simply does not resolve.
           AND c.status <> 'merged_into'
    ),
    book_trip AS (
        SELECT t.* FROM public.trip t, me
         WHERE t.client_id = me.id
           AND t.agent_id = me.agent_id
           AND t.archived_at IS NULL
    ),
    committed_trip AS (
        SELECT * FROM book_trip WHERE status IN ('booked', 'in_progress', 'completed')
    ),
    cur AS (
        SELECT currency, count(*) AS n
          FROM committed_trip
         GROUP BY currency
         ORDER BY n DESC, currency
         LIMIT 1
    ),
    lifetime AS (
        SELECT
            coalesce(sum(ct.total_value_cents)
                     FILTER (WHERE ct.currency = (SELECT currency FROM cur)), 0)::bigint AS cents,
            coalesce(sum(ct.total_commission_cents)
                     FILTER (WHERE ct.currency = (SELECT currency FROM cur)), 0)::bigint AS commission,
            count(DISTINCT ct.currency)::integer AS currency_count
          FROM committed_trip ct
    ),
    counts AS (
        SELECT
            (SELECT count(*)::integer FROM book_trip)                                   AS trips,
            (SELECT count(*)::integer FROM book_trip
              WHERE status IN ('proposal', 'booked', 'in_progress'))                    AS active_trips,
            (SELECT count(*)::integer FROM public.client_note n, me
              WHERE n.client_id = me.id AND n.archived_at IS NULL)                      AS notes,
            (SELECT count(*)::integer FROM public.document d, me
              WHERE d.archived_at IS NULL
                AND (d.client_id = me.id
                     OR d.trip_id IN (SELECT id FROM book_trip)))                       AS docs
    ),
    contact AS (
        SELECT max(cv.last_message_at) AS at
          FROM public.conversation cv, me
         WHERE cv.client_id = me.id
           AND cv.agent_id = me.agent_id
           AND cv.archived_at IS NULL
    )
    SELECT
        me.id,
        coalesce(me.preferred_name, me.first_name) || ' ' || me.last_name,
        me.first_name, me.last_name, me.preferred_name,
        me.email::text, me.phone, me.date_of_birth,
        me.status, me.tags, me.important_dates, me.emergency_contact,
        addr.line1, addr.line2, addr.city, addr.region, addr.postal_code, addr.country,
        me.notes, me.version, me.created_at, me.archived_at,
        coalesce(tp.preferred_destinations, ARRAY[]::text[]),
        coalesce(tp.travel_styles, ARRAY[]::text[]),
        coalesce(tp.dietary_restrictions, ARRAY[]::text[]),
        tp.dietary_notes,
        coalesce(tp.accessibility_needs, ARRAY[]::text[]),
        tp.accessibility_notes,
        coalesce(tp.loyalty_programs, '[]'::jsonb),
        tp.budget_band,
        tp.favorite_past_trips,
        lifetime.cents::text,
        (SELECT currency FROM cur),
        lifetime.currency_count,
        lifetime.commission::text,
        counts.trips, counts.active_trips, counts.notes, counts.docs,
        contact.at,
        me.today
      FROM me
     CROSS JOIN lifetime
     CROSS JOIN counts
     CROSS JOIN contact
      LEFT JOIN public.address addr ON addr.id = me.mailing_address_id
      LEFT JOIN public.travel_preference tp ON tp.client_id = me.id;
$$;

COMMENT ON FUNCTION public.agent_client_overview(uuid) IS
    'Screens 3.3.2 and 3.3.3 — the header card, the snapshot, preferences and the four '
    'mini-stats. `notes` here is client.notes, the agent''s free-form column; the Notes TAB '
    'is the client_note table and has its own accessor. Money is derived from committed '
    'trips and scoped to one currency, as §3.3.1 records.';

-- ─────────────────────────────────────────────────────────────────────────────
-- §3.3.3 Household — the companions card
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.agent_client_companions(p_client_id uuid)
RETURNS TABLE (
    companion_id      uuid,
    first_name        text,
    last_name         text,
    relationship      text,
    date_of_birth     date,
    passport_expiry   date,
    passport_country  char(2),
    linked_client_id  uuid,
    invited           boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    WITH me AS (
        SELECT c.id
          FROM public.client c
         WHERE c.id = p_client_id
           AND c.agent_id = public.current_agent_id()
           AND c.status <> 'merged_into'
    )
    SELECT cp.id, cp.first_name, cp.last_name, cp.relationship, cp.date_of_birth,
           cp.passport_expiry, cp.passport_country, cp.linked_client_id,
           cp.is_invited_to_platform
      FROM public.companion cp
     CROSS JOIN me
     WHERE cp.client_id = me.id
       AND cp.archived_at IS NULL
     ORDER BY cp.created_at;
$$;

COMMENT ON FUNCTION public.agent_client_companions(uuid) IS
    'Screen 3.3.3''s household card. `passport_number_encrypted` is NOT named and must not '
    'be: the expiry and country are what a trip needs, the number is not, and an accessor '
    'that returns it makes every caller a place it can leak from.';

-- ─────────────────────────────────────────────────────────────────────────────
-- §3.3.4 Trips tab
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.agent_client_trips(p_client_id uuid)
RETURNS TABLE (
    trip_id                uuid,
    title                  text,
    trip_type              trip_type,
    status                 trip_status,
    start_date             date,
    end_date               date,
    destinations           text[],
    traveler_count         integer,
    total_value_cents      text,
    total_paid_cents       text,
    total_commission_cents text,
    currency               char(3),
    as_of_date             date
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    WITH me AS (
        SELECT c.id, c.agent_id, (now() AT TIME ZONE a.time_zone)::date AS today
          FROM public.client c
          JOIN public.agent a ON a.id = c.agent_id
         WHERE c.id = p_client_id
           AND c.agent_id = public.current_agent_id()
           AND c.status <> 'merged_into'
    )
    SELECT t.id, t.title, t.trip_type, t.status, t.start_date, t.end_date,
           t.destinations, t.traveler_count,
           t.total_value_cents::text, t.total_paid_cents::text,
           t.total_commission_cents::text, t.currency, me.today
      FROM public.trip t
     CROSS JOIN me
     WHERE t.client_id = me.id
       AND t.agent_id = me.agent_id
       AND t.archived_at IS NULL
     -- Soonest first among trips still ahead, then most recent past. NULLS LAST keeps a
     -- dateless inquiry at the end rather than at the top of the client's whole history.
     ORDER BY t.start_date DESC NULLS LAST, t.id;
$$;

COMMENT ON FUNCTION public.agent_client_trips(uuid) IS
    'Screen 3.3.4. total_commission_cents is Internal (outside the client grant) and is '
    'exactly why this is an accessor rather than a select. The tab''s active/past/cancelled '
    'chips are computed from `status` and `end_date` in the view model, not here: they are a '
    'presentation split over one row set, not three reads.';

-- ─────────────────────────────────────────────────────────────────────────────
-- §3.3.5 Messages tab — the thread list
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.agent_client_conversations(p_client_id uuid)
RETURNS TABLE (
    conversation_id      uuid,
    trip_id              uuid,
    trip_title           text,
    subject              text,
    last_message_at      timestamptz,
    last_message_preview text,
    agent_unread_count   integer,
    message_count        integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    WITH me AS (
        SELECT c.id, c.agent_id
          FROM public.client c
         WHERE c.id = p_client_id
           AND c.agent_id = public.current_agent_id()
           AND c.status <> 'merged_into'
    )
    SELECT cv.id, cv.trip_id, t.title, cv.subject,
           cv.last_message_at, cv.last_message_preview, cv.agent_unread_count,
           (SELECT count(*)::integer FROM public.message m
             WHERE m.conversation_id = cv.id AND m.archived_at IS NULL)
      FROM public.conversation cv
     CROSS JOIN me
      LEFT JOIN public.trip t ON t.id = cv.trip_id
     WHERE cv.client_id = me.id
       AND cv.agent_id = me.agent_id
       -- Archived threads are excluded here as they are in every other conversation read on
       -- this side (agent_kpis, agent_trip_board, agent_inbox, agent_trip_overview): filing
       -- a thread away is the advisor's only way to put it down.
       AND cv.archived_at IS NULL
     ORDER BY cv.last_message_at DESC;
$$;

COMMENT ON FUNCTION public.agent_client_conversations(uuid) IS
    'Screen 3.3.5''s thread list. The thread BODY is §3.10.2 and is not built; this returns '
    'previews only, which is all the tab draws.';

-- ─────────────────────────────────────────────────────────────────────────────
-- §3.3.6 Documents tab — across trips
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.agent_client_documents(p_client_id uuid)
RETURNS TABLE (
    document_id  uuid,
    kind         document_kind,
    filename     text,
    mime_type    text,
    size_bytes   text,
    is_sensitive boolean,
    trip_id      uuid,
    trip_title   text,
    created_at   timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    WITH me AS (
        SELECT c.id, c.agent_id
          FROM public.client c
         WHERE c.id = p_client_id
           AND c.agent_id = public.current_agent_id()
           AND c.status <> 'merged_into'
    ),
    book_trip AS (
        SELECT t.id, t.title FROM public.trip t, me
         WHERE t.client_id = me.id AND t.agent_id = me.agent_id AND t.archived_at IS NULL
    )
    -- "All documents associated with the client (across trips)" — §3.3.6's own words. The
    -- union is the point: `document.client_id` and `document.trip_id` are independently
    -- nullable, so a passport hangs off the client and a booking confirmation off the trip,
    -- and a tab that read only one predicate would silently show half the folder.
    SELECT d.id, d.kind, d.filename, d.mime_type, d.size_bytes::text, d.is_sensitive,
           d.trip_id, bt.title, d.created_at
      FROM public.document d
     CROSS JOIN me
      LEFT JOIN book_trip bt ON bt.id = d.trip_id
     WHERE d.archived_at IS NULL
       AND (d.client_id = me.id OR d.trip_id IN (SELECT id FROM book_trip))
     ORDER BY d.created_at DESC;
$$;

COMMENT ON FUNCTION public.agent_client_documents(uuid) IS
    'Screen 3.3.6. storage_bucket, storage_key and checksum_sha256 are server-only and are '
    'unnameable here rather than merely unselected — a signed URL is issued by '
    'trip-document-url, which is the one place that may touch them.';

-- ─────────────────────────────────────────────────────────────────────────────
-- §3.3.7 Notes tab — the client_note table
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.agent_client_notes(p_client_id uuid)
RETURNS TABLE (
    note_id     uuid,
    body        text,
    author_name text,
    author_is_me boolean,
    created_at  timestamptz,
    updated_at  timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    WITH me AS (
        SELECT c.id AS client_id, c.agent_id
          FROM public.client c
         WHERE c.id = p_client_id
           AND c.agent_id = public.current_agent_id()
           AND c.status <> 'merged_into'
    ),
    caller AS (
        SELECT pu.id FROM public.platform_user pu WHERE pu.account_id = auth.uid() LIMIT 1
    )
    SELECT n.id, n.body, au.display_name,
           -- Drives the edit/delete affordance: §3.3.7's key actions are "add, edit, delete",
           -- and a second advisor's note is not this one's to rewrite. One advisor exists
           -- until P3, so this is always true today and the UI still asks rather than assumes.
           n.author_user_id = (SELECT id FROM caller),
           n.created_at, n.updated_at
      FROM public.client_note n
     CROSS JOIN me
      LEFT JOIN public.platform_user au ON au.id = n.author_user_id
     WHERE n.client_id = me.client_id
       AND n.archived_at IS NULL
     ORDER BY n.created_at DESC;
$$;

COMMENT ON FUNCTION public.agent_client_notes(uuid) IS
    'Screen 3.3.7. client_note has ZERO grants to any client role — agent_domain_lockdown '
    'REVOKEs ALL on it — so this accessor is the only way an advisor reads their own notes. '
    'Deliberately internal: §3.3.7''s purpose line is "Internal notes only the agent sees."';

-- ─────────────────────────────────────────────────────────────────────────────
-- §3.3.8 Activity log — audit_event about this client and their trips
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.agent_client_activity(p_client_id uuid, p_limit integer DEFAULT 50)
RETURNS TABLE (
    event_id      uuid,
    event_type    text,
    target_entity text,
    target_id     uuid,
    actor_name    text,
    actor_role    user_role,
    metadata      jsonb,
    created_at    timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    WITH me AS (
        SELECT c.id, c.agent_id
          FROM public.client c
         WHERE c.id = p_client_id
           AND c.agent_id = public.current_agent_id()
           AND c.status <> 'merged_into'
    ),
    book_trip AS (
        SELECT t.id FROM public.trip t, me
         WHERE t.client_id = me.id AND t.agent_id = me.agent_id
    )
    -- The client's own events UNION their trips'. A card authorization is recorded against
    -- the trip it was raised for, so `target_entity = 'client'` alone would leave the tab
    -- whose whole purpose is the timeline showing almost nothing.
    --
    -- `ip_address` and `user_agent` are NOT named. They are forensic columns for §3.9.6
    -- Login Activity, and a client-detail tab is not the place to publish where someone was.
    SELECT ae.id, ae.event_type, ae.target_entity, ae.target_id,
           pu.display_name, ae.actor_role, ae.metadata, ae.created_at
      FROM public.audit_event ae
     CROSS JOIN me
      LEFT JOIN public.platform_user pu ON pu.id = ae.actor_user_id
     WHERE (ae.target_entity = 'client' AND ae.target_id = me.id)
        OR (ae.target_entity = 'trip'   AND ae.target_id IN (SELECT id FROM book_trip))
     ORDER BY ae.created_at DESC
     LIMIT greatest(coalesce(p_limit, 50), 0);
$$;

COMMENT ON FUNCTION public.agent_client_activity(uuid, integer) IS
    'Screen 3.3.8. Sign-ins are NOT here: they live in auth_event and have their own screen '
    '(§3.9.6 Login Activity). audit_event has RLS on with no policy and no grant, so this '
    'accessor is the only read of it anywhere.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Grants
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE f text;
BEGIN
    FOREACH f IN ARRAY ARRAY[
        'public.agent_client_overview(uuid)',
        'public.agent_client_companions(uuid)',
        'public.agent_client_trips(uuid)',
        'public.agent_client_conversations(uuid)',
        'public.agent_client_documents(uuid)',
        'public.agent_client_notes(uuid)',
        'public.agent_client_activity(uuid, integer)'
    ]
    LOOP
        -- `anon` by name; `REVOKE ... FROM public` alone is a no-op against Supabase's
        -- by-name grant. See the §3.2 read-surface migration.
        EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM public, anon', f);
        EXECUTE format('GRANT  EXECUTE ON FUNCTION %s TO authenticated, service_role', f);
    END LOOP;
END $$;

-- ── ASSERTIONS ───────────────────────────────────────────────────────────────────

DO $$
DECLARE
    names text[] := ARRAY[
        'agent_client_overview', 'agent_client_companions', 'agent_client_trips',
        'agent_client_conversations', 'agent_client_documents', 'agent_client_notes',
        'agent_client_activity'
    ];
    found    integer;
    leaked   text;
    unpinned text;
BEGIN
    SELECT count(*) INTO found
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = ANY (names);

    IF found <> array_length(names, 1) THEN
        RAISE EXCEPTION '§3.3.2–3.3.8 expected % accessors in public, found %',
            array_length(names, 1), found;
    END IF;

    SELECT string_agg(p.proname, ', ') INTO leaked
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname = ANY (names)
       AND has_function_privilege('anon', p.oid, 'EXECUTE');

    IF leaked IS NOT NULL THEN
        RAISE EXCEPTION 'anon can execute §3.3 client detail read functions: %', leaked;
    END IF;

    -- pg_temp must be NAMED, and named LAST: `SET search_path = public` alone leaves pg_temp
    -- searched first for relation names, which is the shadowing the pin exists to stop.
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
            '§3.3 detail accessors must end their search_path with pg_temp: %', unpinned;
    END IF;
END $$;

-- The projections, asserted from the catalog. Each of these columns is server-only, and
-- "unnameable" is a stronger guarantee than "not currently selected": a later edit that adds
-- one to a RETURNS TABLE fails here rather than shipping.
DO $$
DECLARE docs text := pg_get_function_result('public.agent_client_documents(uuid)'::regprocedure);
        comp text := pg_get_function_result('public.agent_client_companions(uuid)'::regprocedure);
        act  text := pg_get_function_result('public.agent_client_activity(uuid, integer)'::regprocedure);
BEGIN
    IF docs LIKE '%storage_%' OR docs LIKE '%checksum%' THEN
        RAISE EXCEPTION
            'agent_client_documents() names a server-only storage column; a signed URL is '
            'trip-document-url''s job and that is the only place those may be touched';
    END IF;

    IF comp LIKE '%passport_number%' THEN
        RAISE EXCEPTION
            'agent_client_companions() names passport_number_encrypted. The expiry and '
            'country are what a trip needs; the number is not, and an accessor that returns '
            'it makes every caller a place it can leak from';
    END IF;

    IF act LIKE '%ip_address%' OR act LIKE '%user_agent%' THEN
        RAISE EXCEPTION
            'agent_client_activity() names a forensic column. Those belong to §3.9.6 Login '
            'Activity; a client-detail tab is not the place to publish where someone was';
    END IF;
END $$;

COMMIT;
