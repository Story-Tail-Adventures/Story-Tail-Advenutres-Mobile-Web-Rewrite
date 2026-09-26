-- The agent read surface for Screen Inventory §3.3.1 (Client List / Roster). Two
-- SECURITY DEFINER accessors: the roster's rows, and the header's counts.
--
-- SAME PATTERN AS §3.2 AND §3.4.2, NOT A NEW ONE. The §3.2 read-surface migration's header
-- argues why this is RPC and not a policy (RLS decides which ROWS; GRANTs decide which
-- COLUMNS), why search_path is pinned with pg_temp named last, and why money crosses as a
-- digit-string. None of that is re-argued here.
--
-- BUT §3.3 IS THE CASE THAT ARGUMENT WAS WRITTEN FOR. `20260905171542_client_column_grant`
-- revoked table SELECT on `client` and re-granted fifteen columns, holding back five:
-- `notes`, `tags`, `lifetime_value_cents`, `status`, `merged_into_client_id`. An AGENT is
-- also the Postgres role `authenticated` — the agent/client distinction is
-- `platform_user.role`, not a DB role — so that grant binds the advisor too. That migration
-- said so at the time and left the choice to whoever needed it:
--
--     "the options when it lands are a SECURITY DEFINER accessor, a view, or the service
--      role behind an Edge Function. Choosing one is that change's job, not this one's."
--
-- Three of the five columns are roster columns. This is that change, and it chooses the
-- accessor, matching §3.2.
--
-- IT CARRIES ITS OWN ASSERTIONS. A `DO $$ … $$` block is a statement, not a constraint: the
-- §3.2 and §3.4.2 guards ran against the catalog as it stood on their own day and can never
-- see a function created later, however wide their `agent\_%` glob looks. Restated at the
-- bottom of this file for these two.
--
-- ── `lifetime_value_cents` IS NOT READ, AND THAT IS THE FINDING ──────────────────────────
--
-- Data-Model §6.1 calls the column "Computed; cached for sort/filter", and its own
-- COMMENT repeats it. Nothing computes it. There is no trigger, no function and no Edge
-- Function anywhere in this repository that writes `client.lifetime_value_cents`; the only
-- write in the tree is one hand-set row in seed.sql. Reading the cache would have put a
-- confident `$0` against every real client on the roster's money column — a figure that is
-- wrong rather than missing, which is the worse of the two.
--
-- So the roster DERIVES lifetime value from the trips it is the sum of, and the cache is
-- left alone rather than quietly back-filled: maintaining it is a write-path concern and
-- belongs with §3.3's write migration or a trigger, not with a read.
--
-- ── MONEY IS SCOPED TO ONE CURRENCY, PER CLIENT ──────────────────────────────────────────
--
-- §3.2 settled the rule for the KPI strip: a money figure names one currency and says how
-- many it left out, because summing across them states a total that is not true of any
-- currency. The same rule applies per ROW here, and the scope is per CLIENT rather than per
-- agent: two clients on one roster can legitimately bank in different currencies, and an
-- agent-wide dominant currency would mislabel every row that did not share it.
--
-- `lifetime_currency` is chosen over the very trips `lifetime_value_cents` sums — not over
-- the client's whole book — so the label is true of the figure rather than merely near it.
-- `lifetime_currency_count` counts over that same set and drives the roster's exclusion
-- note. Both are NULL/0 for a client with nothing committed yet, which is the honest answer
-- and not a zero.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- §3.3.1 Roster — one row per client
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.agent_client_roster(
    p_status   client_status[] DEFAULT ARRAY['active']::client_status[],
    p_tags     text[]          DEFAULT NULL,
    p_search   text            DEFAULT NULL,
    p_limit    integer         DEFAULT 25,
    p_offset   integer         DEFAULT 0
)
RETURNS TABLE (
    client_id               uuid,
    display_name            text,
    first_name              text,
    last_name               text,
    email                   text,
    phone                   text,
    status                  client_status,
    tags                    text[],
    lifetime_value_cents    text,
    lifetime_currency       char(3),
    lifetime_currency_count integer,
    trip_count              integer,
    last_trip_title         text,
    last_trip_end_date      date,
    next_trip_title         text,
    next_trip_start_date    date,
    next_trip_status        trip_status,
    next_trip_destinations  text[],
    last_contact_at         timestamptz,
    created_at              timestamptz,
    archived_at             timestamptz,
    as_of_date              date,
    total_count             integer
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
    -- The agent's book, before the screen's filters. `merged_into` is excluded
    -- unconditionally and is NOT a filter the caller can ask for: a merged record is a
    -- tombstone pointing at its survivor (Data-Model §20.1), and listing it would offer a
    -- row whose every field now lives somewhere else. §3.9's merge tooling reads those rows
    -- directly when it needs them.
    book AS (
        SELECT c.*
          FROM public.client c
         CROSS JOIN me
         WHERE c.agent_id = me.agent_id
           AND c.status <> 'merged_into'
    ),
    -- Non-archived trips belonging to the agent's clients. Scoped by the TRIP's agent_id as
    -- well as the client's: a trip carries its own agent_id and nothing in the schema forces
    -- the two to match, so a reassigned or split booking could otherwise contribute another
    -- advisor's money to this roster's totals.
    book_trip AS (
        SELECT t.*
          FROM public.trip t
         CROSS JOIN me
         WHERE t.agent_id = me.agent_id
           AND t.archived_at IS NULL
           AND t.client_id IN (SELECT id FROM book)
    ),
    -- What "lifetime value" is the sum of: trips the client has actually committed to.
    -- `inquiry` and `proposal` are pipeline, not spend, and belong to the KPI strip's
    -- pipeline_value figure rather than here; `cancelled` is money that never moved.
    committed_trip AS (
        SELECT * FROM book_trip
         WHERE status IN ('booked', 'in_progress', 'completed')
    ),
    -- Each client's own most-used currency over the very rows the sum below covers, ties
    -- broken by currency ascending so the answer is stable from one read to the next.
    client_cur AS (
        SELECT DISTINCT ON (client_id) client_id, currency
          FROM (
              SELECT client_id, currency, count(*) AS n
                FROM committed_trip
               GROUP BY client_id, currency
          ) g
         ORDER BY client_id, n DESC, currency
    ),
    lifetime AS (
        SELECT ct.client_id,
               coalesce(sum(ct.total_value_cents)
                        FILTER (WHERE ct.currency = cc.currency), 0)::bigint AS cents,
               cc.currency,
               count(DISTINCT ct.currency)::integer AS currency_count
          FROM committed_trip ct
          JOIN client_cur cc ON cc.client_id = ct.client_id
         GROUP BY ct.client_id, cc.currency
    ),
    trip_counts AS (
        SELECT client_id, count(*)::integer AS n
          FROM book_trip
         GROUP BY client_id
    ),
    -- The most recently FINISHED trip. `end_date` rather than status, so a completed trip
    -- whose status was never advanced still reads as past once the dates say so.
    last_trip AS (
        SELECT DISTINCT ON (t.client_id)
               t.client_id, t.title, t.end_date
          FROM book_trip t
         CROSS JOIN me
         WHERE t.status <> 'cancelled'
           AND t.end_date IS NOT NULL
           AND t.end_date < me.today
         ORDER BY t.client_id, t.end_date DESC, t.id
    ),
    -- The soonest trip that has not finished — which includes one under way today, so the
    -- roster can say "Now · St Lucia" rather than showing nothing for a traveling client.
    -- `next_trip_status` is returned so the caller can tell the two apart without guessing
    -- from the date.
    next_trip AS (
        SELECT DISTINCT ON (t.client_id)
               t.client_id, t.title, t.start_date, t.status, t.destinations
          FROM book_trip t
         CROSS JOIN me
         WHERE t.status <> 'cancelled'
           AND (t.end_date IS NULL OR t.end_date >= me.today)
         ORDER BY t.client_id, t.start_date NULLS LAST, t.id
    ),
    -- Archived threads do not count, matching every other conversation read on this side
    -- (agent_kpis, agent_trip_board, agent_inbox and agent_trip_overview all carry it):
    -- filing a thread away is the advisor's only way to put it down, and without this
    -- predicate a filed thread keeps driving "last contact" forever.
    contact AS (
        SELECT cv.client_id, max(cv.last_message_at) AS at
          FROM public.conversation cv
         CROSS JOIN me
         WHERE cv.agent_id = me.agent_id
           AND cv.archived_at IS NULL
         GROUP BY cv.client_id
    ),
    filtered AS (
        SELECT b.*
          FROM book b
         WHERE (p_status IS NULL OR b.status = ANY (p_status))
           AND (p_tags   IS NULL OR b.tags && p_tags)
           AND (
                 p_search IS NULL
                 OR btrim(p_search) = ''
                 -- Matches the expression `client_name_trgm` indexes, character for
                 -- character, or the GIN trigram index cannot be used for this predicate.
                 OR (b.first_name || ' ' || b.last_name) ILIKE '%' || btrim(p_search) || '%'
                 OR b.preferred_name ILIKE '%' || btrim(p_search) || '%'
                 OR b.email::text    ILIKE '%' || btrim(p_search) || '%'
                 OR EXISTS (
                        SELECT 1 FROM book_trip t
                         WHERE t.client_id = b.id
                           AND t.title ILIKE '%' || btrim(p_search) || '%'
                    )
               )
    )
    SELECT
        f.id,
        coalesce(f.preferred_name, f.first_name) || ' ' || f.last_name,
        f.first_name,
        f.last_name,
        f.email::text,
        f.phone,
        f.status,
        f.tags,
        coalesce(l.cents, 0)::text,
        l.currency,
        coalesce(l.currency_count, 0),
        coalesce(tc.n, 0),
        lt.title, lt.end_date,
        nt.title, nt.start_date, nt.status, nt.destinations,
        ct.at,
        f.created_at,
        f.archived_at,
        me.today,
        -- The count BEFORE the page window, so the roster can paginate without a second
        -- round trip. Computed over `filtered`, which is the set the page is cut from.
        count(*) OVER ()::integer
      FROM filtered f
     CROSS JOIN me
      LEFT JOIN lifetime    l  ON l.client_id  = f.id
      LEFT JOIN trip_counts tc ON tc.client_id = f.id
      LEFT JOIN last_trip   lt ON lt.client_id = f.id
      LEFT JOIN next_trip   nt ON nt.client_id = f.id
      LEFT JOIN contact     ct ON ct.client_id = f.id
     ORDER BY f.last_name, f.first_name, f.id
     LIMIT  greatest(coalesce(p_limit, 25), 0)
    OFFSET greatest(coalesce(p_offset, 0), 0);
$$;

COMMENT ON FUNCTION public.agent_client_roster(client_status[], text[], text, integer, integer) IS
    'Screen 3.3.1''s rows. Exists as an accessor rather than a select because `status`, '
    '`tags` and the money column are all outside the `client` column grant to '
    '`authenticated`, which binds the agent too. lifetime_value_cents is DERIVED from '
    'committed trips, not read from client.lifetime_value_cents — nothing in the repository '
    'maintains that cache, so reading it would report a confident $0 for every client.';

-- ─────────────────────────────────────────────────────────────────────────────
-- §3.3.1 Roster header — the counts above the table
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.agent_client_roster_summary()
RETURNS TABLE (
    active_count    integer,
    in_motion_count integer,
    inquiry_count   integer,
    archived_count  integer,
    tag_facets      jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    WITH me AS (
        SELECT a.id AS agent_id
          FROM public.agent a
         WHERE a.id = public.current_agent_id()
    ),
    book AS (
        SELECT c.id, c.status, c.tags
          FROM public.client c
         CROSS JOIN me
         WHERE c.agent_id = me.agent_id
           AND c.status <> 'merged_into'
    ),
    book_trip AS (
        SELECT t.client_id, t.status
          FROM public.trip t
         CROSS JOIN me
         WHERE t.agent_id = me.agent_id
           AND t.archived_at IS NULL
           AND t.client_id IN (SELECT id FROM book)
    ),
    in_motion AS (
        SELECT DISTINCT client_id FROM book_trip
         WHERE status IN ('proposal', 'booked', 'in_progress')
    ),
    -- "Leads to qualify" in the prototype's words. The FIELD is inquiry_count and no column,
    -- function or route on the agent side may be named `lead`: the `lead` domain is
    -- specified and deliberately unbuilt (Data-Model §11), a quote request creates a trip in
    -- `inquiry` status instead (BRD §6.5, amended 2026-09-09), and the deferred domain comes
    -- back by autocomplete the moment something here carries its name. Copy may still say
    -- either. Same rule §3.2 set for `new_inquiry_count`.
    --
    -- A client who already has a proposal out is not waiting to be qualified, so anyone in
    -- motion is excluded rather than counted twice across two numbers on one line.
    to_qualify AS (
        SELECT DISTINCT client_id FROM book_trip
         WHERE status = 'inquiry'
           AND client_id NOT IN (SELECT client_id FROM in_motion)
    ),
    -- The tag chips above the roster, and the reason they are a READ rather than a constant.
    -- `client.tags` is free-form (Data-Model §6.1) — there is no vocabulary table and no
    -- CHECK — so the only honest source for "which tags does this agent use" is the book
    -- itself. A hardcoded chip row would offer filters that match nothing and omit the ones
    -- he actually types, which is how the prototype's two chip rows came to disagree with
    -- each other (`Active/VIP/Honeymoon/Family/Lead/Archived` on the page,
    -- `Active/VIP/Honeymoon/New` in the rail) and with the data under both.
    --
    -- Counted over active clients only: an archived client's tags are not a filter the
    -- active roster can usefully offer, and including them puts chips on screen that return
    -- nothing until the status filter is changed too.
    facets AS (
        SELECT jsonb_agg(jsonb_build_object('tag', tag, 'count', n)
                         ORDER BY n DESC, tag) AS js
          FROM (
              SELECT t.tag, count(*)::integer AS n
                FROM book b
               CROSS JOIN LATERAL unnest(b.tags) AS t(tag)
               WHERE b.status = 'active'
               GROUP BY t.tag
          ) g
    )
    SELECT
        count(*) FILTER (WHERE b.status = 'active')::integer,
        count(*) FILTER (WHERE b.status = 'active'
                           AND b.id IN (SELECT client_id FROM in_motion))::integer,
        count(*) FILTER (WHERE b.status = 'active'
                           AND b.id IN (SELECT client_id FROM to_qualify))::integer,
        count(*) FILTER (WHERE b.status = 'archived')::integer,
        coalesce((SELECT js FROM facets), '[]'::jsonb)
      FROM book b;
$$;

COMMENT ON FUNCTION public.agent_client_roster_summary() IS
    'Screen 3.3.1''s header counts, the Archived chip''s total, and the tag chips. Reads '
    'client.status and client.tags, both outside the column grant to `authenticated`. '
    'tag_facets is derived from the book rather than from a vocabulary table, because '
    'client.tags is free-form and has neither.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Grants
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE f text;
BEGIN
    FOREACH f IN ARRAY ARRAY[
        'public.agent_client_roster(client_status[], text[], text, integer, integer)',
        'public.agent_client_roster_summary()'
    ]
    LOOP
        -- `anon` by name; see the §3.2 read-surface migration's note on current_agent_id()
        -- for why `REVOKE ... FROM public` alone is a no-op.
        EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM public, anon', f);
        EXECUTE format('GRANT  EXECUTE ON FUNCTION %s TO authenticated, service_role', f);
    END LOOP;
END $$;

-- ── ASSERTIONS ───────────────────────────────────────────────────────────────────

DO $$
DECLARE
    names    text[] := ARRAY['agent_client_roster', 'agent_client_roster_summary'];
    found    integer;
    leaked   text;
    unpinned text;
BEGIN
    SELECT count(*) INTO found
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = ANY (names);

    IF found <> array_length(names, 1) THEN
        RAISE EXCEPTION
            '§3.3.1 expected % accessors in public, found %',
            array_length(names, 1), found;
    END IF;

    SELECT string_agg(p.proname, ', ') INTO leaked
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname = ANY (names)
       AND has_function_privilege('anon', p.oid, 'EXECUTE');

    IF leaked IS NOT NULL THEN
        RAISE EXCEPTION 'anon can execute §3.3.1 client roster read functions: %', leaked;
    END IF;

    -- pg_temp must be NAMED, and named LAST. `SET search_path = public` alone leaves pg_temp
    -- searched first for relation names, which is exactly the shadowing the pin exists to
    -- stop inside a function running as the table owner.
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
            '§3.3.1 accessors must end their search_path with pg_temp: %', unpinned;
    END IF;
END $$;

-- The projection, asserted from the catalog. `notes` and `merged_into_client_id` are the two
-- withheld client columns the roster has no business naming: the first is the agent's private
-- prose and belongs to §3.3.7's own accessor, the second is merge bookkeeping that would only
-- ever be non-NULL for a row this function already excludes.
DO $$
DECLARE result text := pg_get_function_result(
    'public.agent_client_roster(client_status[], text[], text, integer, integer)'::regprocedure);
BEGIN
    IF result LIKE '%notes%' THEN
        RAISE EXCEPTION
            'agent_client_roster() names client.notes, which belongs to the Notes tab''s '
            'own accessor and must be unnameable here rather than merely unselected';
    END IF;

    IF result LIKE '%merged_into%' THEN
        RAISE EXCEPTION
            'agent_client_roster() names merged_into_client_id, which is only ever set on '
            'rows this function excludes outright';
    END IF;
END $$;

COMMIT;
