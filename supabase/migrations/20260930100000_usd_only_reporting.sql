-- USD only. The multi-currency reporting rule comes out, and a constraint takes its place.
--
-- ── WHY ─────────────────────────────────────────────────────────────────────────────────
--
-- Gyasi, 2026-09-27: *"I only deal in US Currency I can't operate out of North America.
-- All prices I give will be in USD."* Screen-Inventory §7 asked the question ("Currency
-- display. USD-first is the default, but suppliers in the Caribbean may quote in EUR or
-- local currency") and that is the answer. A supplier who quotes in euros is converted when
-- the agent enters the cost; the trip's own currency is the one presented to the client.
--
-- §3.2 built a careful rule for the other world: every money figure is the agent's most-used
-- currency ALONE, with a count beside it naming what was left out. Four accessors carried a
-- `(dominant_currency, currency_count)` pair, three screens rendered a note, two rendered an
-- asterisk. It was right for the case it was built for, and that case cannot occur.
--
-- ── THE ORDER MATTERS, AND THIS IS THE WHOLE POINT OF THE MIGRATION ─────────────────────
--
-- Deleting reporting machinery does not make the thing it reported on impossible. Delete the
-- scoping and leave the door open, and ONE non-USD trip produces a mixed sum with nothing on
-- the screen to say so — which is the defect class three columns were just fixed for
-- (`client.lifetime_value_cents`, `trip.total_value_cents`, `trip.total_paid_cents`: all
-- documented as totals, none of them computed). So the CHECK lands FIRST, and the machinery
-- comes out behind it. After this the rule is dead code rather than merely unused.
--
-- The constraint is on `trip` ONLY. `trip_component` and `payment_milestone` already have
-- guard triggers (20260928100000:67, 20260929100000:67) refusing a child row whose currency
-- differs from its trip's, so children become USD transitively. Constraining them directly
-- would make `constraints_trip_totals.sql:144-156` and `constraints_trip_paid.sql:146-163`
-- pass against the new CHECK instead of the trigger they exist to test, and those two tests
-- would stop proving anything while still going green.
--
-- NOT constrained, deliberately: the cruise catalog. The external provider returns the same
-- sailing per locale with different currencies (Data-Model §22), which is the supplier's
-- pricing and not Story-Tail's.
--
-- ── WHAT REPLACES THE PAIR, AND WHY IT IS NOT JUST A DELETION ───────────────────────────
--
-- The `*_currency` half was never only "which currency won". It was also (a) the code every
-- money formatter consumes and (b) the NULL that says "this client has committed nothing",
-- which drives the dash-rather-than-$0.00 rule §3.3.1 records. Dropping it outright takes
-- the symbol off every figure and puts a confident $0.00 on every client with no bookings.
--
-- So each accessor keeps ONE `currency char(3)` column and loses only the count. Money keeps
-- travelling with its currency (CLAUDE.md rule 5), the NULL signal survives untouched, and
-- the web layer takes a rename rather than a deletion.
--
-- Each one is now `CASE WHEN count(DISTINCT currency) = 1 THEN min(currency) END` over the
-- very rows the figure sums, rather than a most-used pick. That is the one form that cannot
-- lie if the CHECK is ever lifted: two currencies yields NULL, so nothing gets labelled with
-- one of the currencies it is a mixture of. A most-used pick degrades to WRONG; this degrades
-- to UNKNOWN, and `web/lib/agent/queries.ts:112`'s `money()` already renders a NULL code as
-- USD for display.
--
-- DROP then CREATE rather than CREATE OR REPLACE: removing a column changes the RETURNS TABLE
-- result type and `CREATE OR REPLACE` refuses it (the pattern at 20260928120000:41 and
-- 20260929110000:274). DROP also discards the grants, the search_path pin and the COMMENT, so
-- all three are restated below rather than inherited.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. The constraint
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.trip
    ADD CONSTRAINT trip_currency_usd CHECK (currency = 'USD');

COMMENT ON CONSTRAINT trip_currency_usd ON public.trip IS
    'Story-Tail quotes in USD and operates in North America only (Gyasi, 2026-09-27). This '
    'is what makes §3.2''s currency-scoping machinery dead code rather than merely unused: '
    'the accessors stopped scoping money to one currency because more than one became '
    'impossible. Lifting this constraint without restoring that scoping produces mixed sums '
    'with nothing on any screen to say so. The child tables are covered transitively by '
    'trip_component_currency_matches_trip and payment_milestone_currency_guard.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. §3.2.1 — the KPI strip
-- ─────────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.agent_kpis();

CREATE FUNCTION public.agent_kpis()
RETURNS TABLE (
    agent_id                   uuid,
    as_of_date                 date,
    currency                   char(3),
    pipeline_value_cents       text,
    booked_month_cents         text,
    commission_expected_cents  text,
    commission_weighted_cents  text,
    commission_confidence_pct  smallint,
    inquiry_to_book_days       numeric,
    inquiry_to_book_sample     integer,
    active_client_count        integer,
    active_trip_count          integer,
    new_inquiry_count          integer,
    unread_message_count       integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    WITH me AS (
        SELECT a.id AS agent_id,
               a.time_zone,
               (now() AT TIME ZONE a.time_zone)::date AS today
          FROM public.agent a
         WHERE a.id = public.current_agent_id()
    ),
    span AS (
        SELECT agent_id, time_zone, today,
               date_trunc('month', today)::date                            AS month_start,
               (date_trunc('month', today) + interval '1 month')::date     AS month_end
          FROM me
    ),
    -- The whole book: every non-archived trip this agent owns, whatever its status. Nothing
    -- is scoped to `book_trip` itself — it is the pool the three sets below are cut from.
    book_trip AS (
        SELECT t.*
          FROM public.trip t, span s
         WHERE t.agent_id = s.agent_id
           AND t.archived_at IS NULL
    ),
    open_trip AS (
        SELECT * FROM book_trip
         WHERE status IN ('inquiry', 'proposal', 'booked', 'in_progress')
    ),
    -- Trips whose FIRST booking inside the month happened this month.
    --
    -- EXISTS over the history rather than a join to it, because a join sums the trip's value
    -- once per matching row. `trip_status_history` only forbids a transition to the status
    -- the trip is already in, so booked -> in_progress -> booked is legal and routine (a
    -- client changes dates, the deposit is re-run) — and under a join that trip's whole value
    -- is counted twice, with nothing on the screen to say so.
    --
    -- The comparison is in the AGENT's time zone, matching the boundaries `span` computed.
    -- Comparing a UTC calendar date against agent-local month boundaries misfiles every
    -- booking made in the offset's worth of hours at each month edge: for America/Chicago a
    -- trip booked at 23:00 on the 31st is 04:00 UTC on the 1st, and lands in the wrong month.
    booked_month_trip AS (
        SELECT t.*
          FROM book_trip t
          JOIN span s ON t.agent_id = s.agent_id
         WHERE EXISTS (
                SELECT 1
                  FROM public.trip_status_history h
                 WHERE h.trip_id = t.id
                   AND h.to_status = 'booked'
                   AND (h.changed_at AT TIME ZONE s.time_zone)::date >= s.month_start
                   AND (h.changed_at AT TIME ZONE s.time_zone)::date <  s.month_end
               )
    ),
    -- Exactly the trips that feed a money figure, and nothing else: pipeline_value sums
    -- `open_trip`, both commission figures sum `open_trip`, booked_month sums
    -- `booked_month_trip`. A trip that is neither open nor booked inside this month reaches
    -- no tile, so it gets no say in what the tiles are labelled.
    --
    -- This CTE used to pick a dominant currency and every money column was filtered to it.
    -- Now it only labels. Both of the obvious bases for that label have been wrong here in
    -- the past and the reasoning still applies, which is why the set is computed rather than
    -- assumed: `open_trip` alone handed a NULL label to any agent with nothing currently
    -- open, and `book_trip` labelled the tiles with a currency only cancelled or
    -- long-completed trips voted for.
    money_trip AS (
        SELECT t.*
          FROM book_trip t
         WHERE t.id IN (SELECT id FROM open_trip)
            OR t.id IN (SELECT id FROM booked_month_trip)
    ),
    -- Weighted against pipeline_weight (Data-Model §7.4), joined on the TRIP's status.
    --
    -- `c.agent_id = s.agent_id` is not redundant with the join to open_trip. A commission row
    -- carries its OWN agent_id, and nothing in the schema requires it to match the trip's —
    -- a split booking or a corrected import can leave one pointing at another advisor's trip.
    -- Without this predicate that row lands in this agent's forecast, and the weight lookup
    -- would resolve against the wrong advisor's weights.
    comm AS (
        SELECT
            coalesce(sum(c.expected_commission_cents), 0)::bigint AS raw_cents,
            coalesce(sum(c.expected_commission_cents * pw.weight_pct / 100.0), 0)::bigint
                AS weighted_cents
          FROM public.commission c
          JOIN open_trip t ON t.id = c.trip_id
          JOIN span s      ON c.agent_id = s.agent_id
          JOIN public.pipeline_weight pw
                           ON pw.agent_id = s.agent_id AND pw.status = t.status
         WHERE c.status IN ('expected', 'invoiced')
    ),
    booked_month AS (
        SELECT coalesce(sum(t.total_value_cents), 0)::bigint AS cents
          FROM booked_month_trip t
    ),
    -- Time from a trip's creation to its FIRST booked transition. `trip.created_at` is the
    -- inquiry moment (trip.status defaults to inquiry), so only the booked end needs history.
    cycle AS (
        SELECT avg(EXTRACT(epoch FROM first_booked - t.created_at) / 86400.0) AS days,
               count(*)::integer                                              AS sample
          FROM public.trip t
          JOIN span s ON t.agent_id = s.agent_id
          JOIN LATERAL (
                SELECT min(h.changed_at) AS first_booked
                  FROM public.trip_status_history h
                 WHERE h.trip_id = t.id AND h.to_status = 'booked'
               ) fb ON fb.first_booked IS NOT NULL
         WHERE t.archived_at IS NULL
    )
    SELECT
        s.agent_id,
        s.today,
        -- One currency or none. `trip_currency_usd` makes more than one impossible; if that
        -- constraint is ever lifted this returns NULL rather than labelling a mixed sum with
        -- one of the currencies it mixes. NULL also remains the honest answer for an agent
        -- whose book reaches no money figure at all.
        (SELECT CASE WHEN count(DISTINCT t.currency) = 1
                     THEN min(t.currency)::char(3) END
           FROM money_trip t),
        (SELECT coalesce(sum(total_value_cents), 0)::text FROM open_trip),
        (SELECT cents::text FROM booked_month),
        (SELECT raw_cents::text FROM comm),
        (SELECT weighted_cents::text FROM comm),
        -- NULL rather than 0 when there is nothing to be confident about: a 0% confidence
        -- figure over an empty pipeline is a claim, and an empty pipeline does not make one.
        (SELECT CASE WHEN raw_cents > 0
                     THEN round(weighted_cents * 100.0 / raw_cents)::smallint END FROM comm),
        (SELECT round(days, 1) FROM cycle),
        (SELECT sample FROM cycle),
        (SELECT count(*)::integer FROM public.client c
          WHERE c.agent_id = s.agent_id AND c.status = 'active'),
        (SELECT count(*)::integer FROM open_trip
          WHERE status IN ('proposal', 'booked', 'in_progress')),
        (SELECT count(*)::integer FROM open_trip WHERE status = 'inquiry'),
        (SELECT coalesce(sum(cv.agent_unread_count), 0)::integer
           FROM public.conversation cv
          WHERE cv.agent_id = s.agent_id AND cv.archived_at IS NULL)
      FROM span s;
$$;

COMMENT ON FUNCTION public.agent_kpis() IS
    'Screen 3.2.1''s KPI strip. RETURNS TABLE rather than a scalar row on purpose: an agent '
    'with an empty book gets one row of zeros, a non-agent gets NO row. "Not an agent" and '
    '"an agent with nothing" must be distinguishable, or the screen renders a confident $0 '
    'at a client. Money is a digit-string; see 20260919140000''s header. `currency` is the '
    'code the figures are denominated in, NULL when the book reaches no money figure or (if '
    'trip_currency_usd is ever lifted) when more than one currency is in play.';

-- THE GENERATED TYPES STILL LIE ABOUT NULLABILITY. `supabase gen types` cannot infer it from
-- a RETURNS TABLE signature, so it declares every column non-nullable. `currency`,
-- `commission_confidence_pct` and `inquiry_to_book_days` are all genuinely NULL in exactly
-- the cases the screen most needs to distinguish, and rls_agent_reads.sql asserts they come
-- back NULL rather than 0. Every consumer must treat them as nullable whatever TypeScript
-- says. The same applies to `agent_trip_board`'s `notes`, `proposal_sent_at`,
-- `proposal_viewed_at`, `next_due_date`, `next_due_cents` and `next_due_currency`.

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. §3.3.1 — the client roster
-- ─────────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.agent_client_roster(client_status[], text[], text, integer, integer);

CREATE FUNCTION public.agent_client_roster(
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
    -- The sum, and the code it is denominated in. A client with no committed trip gets no
    -- row here at all, so the LEFT JOIN below leaves `lifetime_currency` NULL — which is how
    -- §3.3.1's dash-rather-than-$0.00 rule is carried, and what rls_agent_clients.sql
    -- asserts. That signal predates the currency rule and outlives it.
    --
    -- `count(DISTINCT ...) = 1` rather than a most-used pick: `trip_currency_usd` makes more
    -- than one impossible, and if it is ever lifted this yields NULL rather than labelling a
    -- mixed sum with one of the currencies in it. Wrong is the one thing a label must not be.
    lifetime AS (
        SELECT ct.client_id,
               sum(ct.total_value_cents)::bigint AS cents,
               CASE WHEN count(DISTINCT ct.currency) = 1
                    THEN min(ct.currency)::char(3) END AS currency
          FROM committed_trip ct
         GROUP BY ct.client_id
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
    'maintains that cache, so reading it would report a confident $0 for every client. '
    'lifetime_currency is NULL for a client with nothing committed, which is what makes the '
    'Lifetime cell a dash rather than a labelled $0.00.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. §3.3.2 — the client overview
-- ─────────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.agent_client_overview(uuid);

CREATE FUNCTION public.agent_client_overview(p_client_id uuid)
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
    -- Derived exactly as §3.3.1's roster derives them, over the same committed set.
    lifetime_value_cents    text,
    lifetime_currency       char(3),
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
    -- No GROUP BY and CROSS JOINed below, so this yields one row even for a client with
    -- nothing committed: the sums coalesce to 0 and `currency` stays NULL, which is the
    -- signal 3.3.2 turns into a dash rather than a confident $0.00.
    lifetime AS (
        SELECT
            coalesce(sum(ct.total_value_cents), 0)::bigint      AS cents,
            coalesce(sum(ct.total_commission_cents), 0)::bigint AS commission,
            CASE WHEN count(DISTINCT ct.currency) = 1
                 THEN min(ct.currency)::char(3) END             AS currency
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
        lifetime.currency,
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
    'trips, and lifetime_currency is NULL when nothing is committed — which is what makes '
    'the Lifetime and Commission stats read as a dash rather than $0.00.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. §3.4.1 — the trip roster summary
-- ─────────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.agent_trip_roster_summary();

CREATE FUNCTION public.agent_trip_roster_summary()
RETURNS TABLE (
    inquiry_count     integer,
    proposal_count    integer,
    booked_count      integer,
    in_progress_count integer,
    completed_count   integer,
    cancelled_count   integer,
    total_count       integer,
    pipeline_cents    text,
    pipeline_currency char(3)
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
            WHERE b.status IN ('inquiry', 'proposal', 'booked', 'in_progress')), 0)::text,
        -- The code the pipeline figure is denominated in, over the very rows it sums. NULL
        -- if the live book is empty, or (were trip_currency_usd ever lifted) if more than
        -- one currency is in it, so the label can never name one currency of a mixture.
        (SELECT CASE WHEN count(DISTINCT b2.currency) = 1
                     THEN min(b2.currency)::char(3) END
           FROM book b2
          WHERE b2.status IN ('inquiry', 'proposal', 'booked', 'in_progress'))
      FROM book b;
$$;

COMMENT ON FUNCTION public.agent_trip_roster_summary() IS
    'Screen 3.4.1''s six chip counts plus the pipeline figure. Counts cover all six statuses '
    'including completed and cancelled, which the design prototype''s chip row omits; the '
    'money covers the four live ones only.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Grants
--
-- DROP FUNCTION discards every grant on the function along with it, so all four are
-- re-granted here rather than inherited. Getting this wrong fails open in the worst
-- direction: a function with no explicit grant is EXECUTABLE BY PUBLIC in Postgres, which
-- is the default 20260905171542:85-105 already caught three functions shipping with.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE f text;
BEGIN
    FOREACH f IN ARRAY ARRAY[
        'public.agent_kpis()',
        'public.agent_client_roster(client_status[], text[], text, integer, integer)',
        'public.agent_client_overview(uuid)',
        'public.agent_trip_roster_summary()'
    ]
    LOOP
        -- `anon` by name. Supabase grants EXECUTE on new public functions to anon,
        -- authenticated and service_role BY NAME, so `REVOKE ... FROM public` alone is a
        -- no-op against all three.
        EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM public, anon', f);
        EXECUTE format('GRANT  EXECUTE ON FUNCTION %s TO authenticated, service_role', f);
    END LOOP;
END $$;

-- ── ASSERTIONS ───────────────────────────────────────────────────────────────────
--
-- Restated here rather than inherited. A DO block is a statement, not a constraint: it sees
-- the catalog as it stood the day it ran, so the copies in 20260919140000, 20260926140000,
-- 20260926150000 and 20260927100000 say nothing about the four functions this migration has
-- just replaced.

DO $$
DECLARE
    names    text[] := ARRAY['agent_kpis', 'agent_client_roster',
                             'agent_client_overview', 'agent_trip_roster_summary'];
    found    integer;
    leaked   text;
    unpinned text;
BEGIN
    SELECT count(*) INTO found
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = ANY (names);

    IF found <> array_length(names, 1) THEN
        RAISE EXCEPTION
            'expected % accessors in public after the USD-only rewrite, found %',
            array_length(names, 1), found;
    END IF;

    SELECT string_agg(p.proname, ', ') INTO leaked
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname = ANY (names)
       AND has_function_privilege('anon', p.oid, 'EXECUTE');

    IF leaked IS NOT NULL THEN
        RAISE EXCEPTION 'anon can execute rewritten agent read functions: %', leaked;
    END IF;

    -- pg_temp must be NAMED, and named LAST. `SET search_path = public` alone leaves pg_temp
    -- searched first for relation names, which is exactly the shadowing the pin exists to
    -- stop inside a function running as the table owner. CREATE discards nothing here, but a
    -- hand-written CREATE can simply omit the pin, which is the mistake this catches.
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
            'rewritten accessors must end their search_path with pg_temp: %', unpinned;
    END IF;
END $$;

-- The rule is GONE, not merely unused. Asserted from the catalog rather than trusted, because
-- a half-removal is the failure mode here: an accessor still returning a count keeps a screen
-- rendering a note about an exclusion that can no longer happen, and one still returning a
-- `dominant_` name keeps the old vocabulary alive for the next reader to copy.
DO $$
DECLARE
    sigs text[] := ARRAY[
        'public.agent_kpis()',
        'public.agent_client_roster(client_status[], text[], text, integer, integer)',
        'public.agent_client_overview(uuid)',
        'public.agent_trip_roster_summary()'
    ];
    s text;
    result text;
BEGIN
    FOREACH s IN ARRAY sigs
    LOOP
        result := pg_get_function_result(s::regprocedure);

        IF result LIKE '%currency_count%' THEN
            RAISE EXCEPTION
                '% still returns a currency_count. Story-Tail is USD only (trip_currency_usd), '
                'so a count of excluded currencies can only ever be 1 and the note it drives '
                'can never fire.', s;
        END IF;

        IF result LIKE '%dominant_currency%' THEN
            RAISE EXCEPTION
                '% still returns dominant_currency. There is no dominant currency to pick '
                'once there is only one; the column is named `currency`.', s;
        END IF;
    END LOOP;
END $$;

-- And the constraint itself bites. A CHECK added by a migration runs against an EMPTY table
-- (db reset applies migrations first and seeds afterwards), so nothing above has yet proved
-- it rejects anything. This is the cheapest place to prove it; the row never commits.
DO $$
DECLARE
    victim uuid;
BEGIN
    SELECT id INTO victim FROM public.trip LIMIT 1;
    IF victim IS NULL THEN
        -- An empty table on a fresh apply. constraints_trip_totals.sql carries the
        -- seeded-row version of this check, which is where it can actually bite.
        RETURN;
    END IF;

    BEGIN
        UPDATE public.trip SET currency = 'EUR' WHERE id = victim;
        RAISE EXCEPTION 'trip_currency_usd did not reject a EUR trip';
    EXCEPTION
        WHEN check_violation THEN
            NULL;  -- what we wanted
    END;
END $$;

COMMIT;
