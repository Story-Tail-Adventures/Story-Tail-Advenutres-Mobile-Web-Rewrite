-- The agent read surface for Screen Inventory §3.2. Five SECURITY DEFINER accessors and the
-- identity helper they are all built on.
--
-- ── WHY THIS IS NOT A POLICY, AND NOT AN EDGE FUNCTION ───────────────────────────
--
-- RLS decides which ROWS; GRANTs decide which COLUMNS. An agent is also the Postgres role
-- `authenticated` — the agent/client distinction is `platform_user.role`, not a database
-- role — so every column REVOKE the client sections added binds the agent too. Eleven
-- columns §3.2 needs are outside the client grant on purpose: `trip.notes`,
-- `trip.total_commission_cents`, `trip_component.cost_cents` and its commission fields,
-- `conversation.agent_unread_count`, `message.is_internal_note`, `proposal.viewed_at`.
-- Selecting one as `authenticated` raises 42501. So the agent side cannot be built by adding
-- policies, and 20260905171542:42-49 and 20260907031255:14-19 both said so and left the
-- choice open. This is that choice, and they both named the accessor first.
--
-- Against an Edge Function on the service role, which is what §2.4 used: that ruling rests on
-- a property these columns do not have. `stripe_payment_method_id` must never leave the
-- server for ANYONE, so service-role-only is the right shape. The columns here are the
-- agent's own data withheld from CLIENTS — every migration that withheld one says so in its
-- comment. The line needed is client-vs-agent, and the database can draw that itself.
--
-- What the accessor buys over a hand-written column list in TypeScript: the projection
-- becomes a catalog object. `payment-wallet/index.ts:54-84` protects three tables with three
-- string literals and its own comment says the reviewer is the enforcement. Here the
-- projection IS the function's return type — Postgres refuses to return a column the
-- signature does not name, `pg_get_function_result()` asserts it from SQL, and
-- `supabase gen types` publishes it where typecheck and CI's drift check both see it.
-- `agent_availability.calendar_sync_refresh_token_encrypted` is not merely unselected below;
-- it is unnameable.
--
-- Precedent: 20260909120000_hotel_search.sql:198-221 is the same shape, already shipped.
--
-- ── WHY search_path IS PINNED ON EVERY ONE ───────────────────────────────────────
--
-- A SECURITY DEFINER function inherits the CALLER's search_path unless it pins one, and this
-- deployment hands the caller influence over it: supabase/config.toml:16 sets
-- extra_search_path on every Data API request. Worse, `pg_temp` is searched before
-- `pg_catalog` for relation names unless positioned explicitly, so a caller who can create a
-- temp table named `platform_user` shadows the real one inside a function running as the
-- table owner. Naming pg_temp LAST, and schema-qualifying every reference anyway, closes
-- both. `auth` is deliberately not on the path, which is why auth.uid() is written qualified
-- — 20260902020243:199-201 already does exactly this.
--
-- ── MONEY CROSSES AS A DIGIT-STRING ──────────────────────────────────────────────
--
-- Every cents column below is `text`. contracts/openapi.yaml:36 states the convention and
-- gives the reason; §2.4 departed from it and `WalletAuthorization.spendingLimitCents`
-- generated as a 32-bit Int, which has not bitten only because nothing imports
-- contracts/kotlin from mobile/ yet. These are SUMS over bigint columns, which is exactly
-- where it would. Aggregating in SQL and casting to text means the client parses once, in
-- the repository, where a failure has somewhere to go.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- Identity
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.current_agent_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT pu.agent_id
      FROM public.platform_user pu
      JOIN public.agent a ON a.id = pu.agent_id
     WHERE pu.account_id = auth.uid()
       AND pu.role = 'agent'
       AND a.status <> 'archived'
     LIMIT 1;
$$;

COMMENT ON FUNCTION public.current_agent_id() IS
    'The calling agent''s agent_id, or NULL. The §3.x analogue of current_platform_user(). '
    'SECURITY DEFINER so it can read platform_user and agent without a client-shaped policy. '
    'NULL for every non-agent, which is what makes every predicate built on it fail closed.';

-- `pu.role = ''agent''`, not `pu.agent_id IS NOT NULL`. The platform_user CHECK
-- (20260514120000_initial.sql:170-174) makes those equivalent for client and agent rows, but
-- its third branch is a bare `(role = 'admin')` — an admin row may legally carry an agent_id.
-- The looser test would let an admin act as whichever agent someone typed into their row.
--
-- `a.status <> ''archived''`, not `= ''active''`. handle_new_user() uses `= 'active'`
-- (20260902020243:108) but answers a different question: who may RECEIVE new clients. An
-- agent marked inactive must still see the book they already have — locking them out of
-- their own worklist is a support incident, not a security control. `archived` is terminal.
--
-- Naming `anon` in the REVOKE is load-bearing. Supabase grants EXECUTE on new public
-- functions to anon, authenticated and service_role BY NAME, so `REVOKE ... FROM public` is
-- a no-op against all three — 20260905171542:85-105 records three functions that shipped
-- believing otherwise.
REVOKE EXECUTE ON FUNCTION public.current_agent_id() FROM public, anon;
GRANT  EXECUTE ON FUNCTION public.current_agent_id() TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3.2.1 — the KPI strip
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.agent_kpis()
RETURNS TABLE (
    agent_id                   uuid,
    as_of_date                 date,
    dominant_currency          char(3),
    currency_count             integer,
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
    -- Trips whose FIRST booking inside the month happened this month. Split out of
    -- `booked_month` so the currency base below can be built from the very rows that figure
    -- sums, instead of from a set that merely overlaps them.
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
    -- THE CURRENCY BASE: exactly the trips that feed a money figure, and nothing else.
    --
    -- Read the four money columns' own FROM clauses and the set falls out. pipeline_value
    -- sums `open_trip`; both commission figures sum commission rows joined to `open_trip`;
    -- booked_month sums `booked_month_trip`, where a trip counts for the month it was
    -- booked in whatever status it has reached since, so a completed one still belongs.
    -- Nothing else in the book reaches a tile. A trip that is neither open nor booked
    -- inside this month — last quarter's cancellation, a trip completed after an earlier
    -- month's booking — contributes to no figure at all, and a currency that only such
    -- trips use has no number on the screen for the label to be about. (A trip booked this
    -- month and cancelled since is still in booked_month, as it was before this change;
    -- whether the month's bookings should net out a same-month cancellation is a question
    -- about that figure, not about the currency it is labelled in.)
    --
    -- Both of the obvious bases have now been wrong here, in the same way and one tile
    -- apart. `open_trip` alone was too narrow: an agent whose last open trip completed got
    -- an EMPTY `cur`, `t.currency = NULL` is NULL for every row, and the "Booked · month"
    -- tile fell to $0 the moment nothing was open, with no booking data having changed.
    -- `book_trip` was then too wide, which moved that same confident zero rather than
    -- removing it: an advisor whose closed book is mostly EUR and whose open book is USD
    -- got a EUR label beside a EUR pipeline of 0 and two EUR commission figures of 0, while
    -- "3 active trips" — not currency-scoped — sat next to it saying otherwise. A base that
    -- is neither the numerator nor the denominator of anything on the screen will always be
    -- able to label a figure it does not describe.
    --
    -- `currency_count` counts over THIS set too, not over the book. It drives the note that
    -- says what the figures left out, and counting a currency no figure could have included
    -- names an exclusion that never happened.
    --
    -- One case stays imperfect, and is left visible rather than papered over: when this
    -- month's bookings are in one currency and the open book in another, no single label is
    -- true of both, and the tiles the label loses read 0. `currency_count` is 2 there, so
    -- the note fires and names the exclusion — under-reporting with the exclusion stated,
    -- which is the posture the note under this function argues for. The answer if that ever
    -- happens in practice is a per-currency breakdown, not a second, hidden scope.
    money_trip AS (
        SELECT t.*
          FROM book_trip t
         WHERE t.id IN (SELECT id FROM open_trip)
            OR t.id IN (SELECT id FROM booked_month_trip)
    ),
    -- The agent's own currencies over that base, most-used first, ties broken by currency
    -- ascending so the answer is stable from one read to the next. EVERY money figure below
    -- is scoped to this one — see the note under the function on why that is the shape, and
    -- why scoping three of four would have been worse than scoping none.
    cur AS (
        SELECT currency, count(*) AS n
          FROM money_trip
         GROUP BY currency
         ORDER BY n DESC, currency
         LIMIT 1
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
           AND t.currency = (SELECT currency FROM cur)
    ),
    -- The month's bookings, in the dominant currency. The row set is `booked_month_trip`
    -- above — the same rows `money_trip` counted when it chose that currency, which is what
    -- keeps the label true of this figure rather than merely near it.
    booked_month AS (
        SELECT coalesce(sum(t.total_value_cents), 0)::bigint AS cents
          FROM booked_month_trip t
         WHERE t.currency = (SELECT currency FROM cur)
    ),
    -- Time from a trip's creation to its FIRST booked transition. `trip.created_at` is the
    -- inquiry moment (trip.status defaults to inquiry), so only the booked end needs history
    -- — which means this populates from the first booking after this migration rather than
    -- waiting for a full inquiry-to-booked pair to accumulate.
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
        (SELECT currency FROM cur),
        (SELECT count(DISTINCT currency)::integer FROM money_trip),
        (SELECT coalesce(sum(total_value_cents), 0)::text
           FROM open_trip WHERE currency = (SELECT currency FROM cur)),
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
    'at a client. Money is a digit-string; see the migration header.';

-- THE GENERATED TYPES LIE ABOUT NULLABILITY, and this is the one that will bite a caller.
--
-- `supabase gen types` cannot infer nullability from a RETURNS TABLE signature, so it
-- declares every column non-nullable: web/types/supabase.ts says
-- `commission_confidence_pct: number` and `inquiry_to_book_days: number`. Both are NULL in
-- exactly the cases the screen most needs to distinguish — an empty pipeline has no
-- confidence to report, and a book with no booked transitions has no cycle time — and
-- rls_agent_reads.sql asserts they come back NULL rather than 0, because a zero there is a
-- claim where an absence is the truth.
--
-- So a caller that trusts the generated type will render "0%" and "0 days" for "we don't
-- know yet". Every consumer must treat these two, and `dominant_currency`, as nullable
-- whatever TypeScript says. The same applies to `agent_trip_board`'s `notes`,
-- `proposal_sent_at`, `proposal_viewed_at`, `next_due_date`, `next_due_cents` and
-- `next_due_currency`, all of which come from LEFT JOINs.
COMMENT ON COLUMN public.trip.total_commission_cents IS
    'The agency''s expected margin. Outside the column grant to `authenticated` '
    '(20260904140753) and reached by the agent through public.agent_trip_board().';

-- MIXED CURRENCY. trip.currency is char(3) and holds whatever was entered, so summing across
-- currencies produces a number that is not money in any of them. EVERY money column here is
-- therefore scoped to the agent's most-used currency, and `currency_count` says how many
-- exist so a screen showing one figure can say what it excluded. Under-reporting with the
-- exclusion named beats a plausible wrong total.
--
-- Both are derived from `money_trip`: the union of the row sets the money figures actually
-- range over — open trips, plus the trips booked this month whatever status they carry now.
-- Neither of the two obvious bases works. `open_trip` alone hands a NULL currency, and so a
-- confident unexplained $0, to any agent with nothing currently open. The whole book labels
-- the tiles with a currency that only cancelled or long-completed trips voted for, and those
-- tiles then read 0 beside an untouched "3 active trips". The CTE carries the derivation.
--
-- Scoping all four matters more than it looks. The first version of this function scoped only
-- `pipeline_value_cents` and left the other three summing across everything, under a single
-- `dominant_currency` label — which is strictly worse than scoping none of them, because the
-- label makes a claim about figures that do not honour it. If the count ever exceeds one in
-- practice the answer is a per-currency breakdown, not a conversion rate nobody has agreed on.
--
-- `commission` has no currency column of its own; a commission is denominated in its trip's
-- currency, which is why the scope is applied through the join to open_trip.
--
-- `new_inquiry_count`, not `new_lead_count`. The lead domain is specified and deliberately
-- unbuilt (Data-Model §11, BRD §6.5 as amended 2026-09-09); a quote request creates a trip in
-- `inquiry`. Copy may say "leads"; the schema must not, or the deferred domain comes back by
-- autocomplete two quarters from now.

-- ─────────────────────────────────────────────────────────────────────────────
-- 3.2.1 sections, 3.2.2 board, 3.2.3 travel days — one function
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.agent_trip_board(
    p_statuses               trip_status[] DEFAULT NULL,
    p_departing_within_days  integer       DEFAULT NULL,
    p_limit                  integer       DEFAULT NULL
)
RETURNS TABLE (
    trip_id                uuid,
    client_id              uuid,
    client_display_name    text,
    title                  text,
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
    notes                  text,
    version                integer,
    proposal_sent_at       timestamptz,
    proposal_viewed_at     timestamptz,
    next_due_date          date,
    next_due_cents         text,
    next_due_currency      char(3),
    agent_unread_count     integer
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
    )
    SELECT
        t.id,
        t.client_id,
        coalesce(c.preferred_name, c.first_name) || ' ' || c.last_name,
        t.title,
        t.trip_type,
        t.status,
        t.status_changed_at,
        t.start_date,
        t.end_date,
        t.destinations,
        t.traveler_count,
        t.total_value_cents::text,
        t.total_paid_cents::text,
        t.total_commission_cents::text,
        t.currency,
        t.notes,
        t.version,
        p.sent_at,
        p.viewed_at,
        m.due_date,
        m.amount_cents::text,
        m.currency,
        coalesce(u.unread, 0)::integer
      FROM public.trip t
      JOIN public.client c ON c.id = t.client_id
     CROSS JOIN me
      LEFT JOIN LATERAL (
            SELECT pr.sent_at, pr.viewed_at
              FROM public.proposal pr
             WHERE pr.trip_id = t.id AND pr.sent_at IS NOT NULL
             ORDER BY pr.version_number DESC
             LIMIT 1
           ) p ON true
      LEFT JOIN LATERAL (
            -- The milestone's OWN currency, not the trip's. payment_milestone.currency is a
            -- separate column and a supplier can invoice in something other than the trip's
            -- denomination; pairing the amount with the trip's code would mislabel it.
            SELECT pm.due_date, pm.amount_cents, pm.currency
              FROM public.payment_milestone pm
             WHERE pm.trip_id = t.id AND pm.status IN ('scheduled', 'overdue')
             ORDER BY pm.due_date NULLS LAST
             LIMIT 1
           ) m ON true
      LEFT JOIN LATERAL (
            SELECT sum(cv.agent_unread_count) AS unread
              FROM public.conversation cv
             WHERE cv.trip_id = t.id AND cv.archived_at IS NULL
           ) u ON true
     WHERE t.agent_id = me.agent_id
       AND t.archived_at IS NULL
       AND (p_statuses IS NULL OR t.status = ANY (p_statuses))
       AND (p_departing_within_days IS NULL
            OR (t.start_date IS NOT NULL
                AND t.start_date >= me.today
                AND t.start_date <  me.today + p_departing_within_days))
     ORDER BY t.start_date NULLS LAST, t.status_changed_at DESC
     -- NO DEFAULT CAP, AND NO CEILING. `LIMIT NULL` is "all rows", which is the contract
     -- rls_agent_reads.sql:170 already asserts: every non-archived trip in the agent's
     -- book, and no more.
     --
     -- Both callers ask for the whole board with no arguments and then aggregate the rows
     -- they get — the pipeline columns' counts and totals, the cancelled count, the
     -- worklist's sections and its needs-you count, the calendar's departures and returns.
     -- A default cap made every one of those an aggregate over a PAGE, and this ORDER BY
     -- chose the page badly: no status filter, so every `completed` trip an advisor has
     -- ever had stays in the set forever and sorts to the FRONT under oldest-departure-
     -- first, while `inquiry` trips — which characteristically have no dates yet — sort
     -- last under NULLS LAST and are the first to be cut. Past the cap the sections
     -- silently under-reported while the KPI strip above them, computed in SQL with no
     -- cap, kept counting the whole book; the tile and the sections beneath it disagreed,
     -- and nothing on the page said the list had been cut. The old ceiling of 500 meant
     -- an explicit larger p_limit could not recover the rows either.
     --
     -- `p_limit` is still honoured when a caller passes one. That is then that caller's
     -- page, asked for and therefore known about, rather than a hidden truncation of
     -- everybody's board. A caller that pages owes its reader the fact that it did.
     LIMIT p_limit;
$$;

COMMENT ON FUNCTION public.agent_trip_board(trip_status[], integer, integer) IS
    'One read behind three of 3.2.1''s sections, all of 3.2.2''s board and 3.2.3''s travel '
    'days. `CROSS JOIN me` is the tenancy boundary: me is empty for a client, an admin or '
    'anon, so the whole query returns zero rows without a branch. client_display_name is '
    'composed here rather than returned as three columns — two hand-written name formatters, '
    'one TS and one Kotlin, is the drift check_copy_parity.py exists to police. Uncapped '
    'unless p_limit is given, because every caller aggregates the rows it returns and an '
    'aggregate over a page is a wrong number with no way to tell.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3.2.1 "Payments to settle", 3.2.3 payment-due events
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.agent_payments_due(p_within_days integer DEFAULT 14)
RETURNS TABLE (
    milestone_id        uuid,
    trip_id             uuid,
    trip_title          text,
    client_id           uuid,
    client_display_name text,
    kind                payment_milestone_kind,
    label               text,
    amount_cents        text,
    paid_cents          text,
    currency            char(3),
    due_date            date,
    status              payment_milestone_status,
    days_until          integer
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
    )
    SELECT
        pm.id, t.id, t.title, c.id,
        coalesce(c.preferred_name, c.first_name) || ' ' || c.last_name,
        pm.kind, pm.label,
        pm.amount_cents::text, pm.paid_cents::text, pm.currency,
        pm.due_date, pm.status,
        (pm.due_date - me.today)::integer
      FROM public.payment_milestone pm
      JOIN public.trip t   ON t.id = pm.trip_id
      JOIN public.client c ON c.id = t.client_id
     CROSS JOIN me
     WHERE t.agent_id = me.agent_id
       AND t.archived_at IS NULL
       AND pm.status IN ('scheduled', 'overdue')
       AND pm.due_date IS NOT NULL
       AND pm.due_date < me.today + coalesce(p_within_days, 14)
     -- NO CAP, for the reason agent_trip_board above has none: both callers AGGREGATE
     -- these rows rather than paging them. The worklist adds this row count into the
     -- "needs you" total beside the proposals and the new inquiries, and the calendar asks
     -- for a 400-day window and then emits one event per row. Under the old `LIMIT 200` an
     -- advisor with more scheduled or overdue milestones than that inside the window lost
     -- events off the calendar and had the badge understate the work, with nothing on
     -- either screen saying the list had been cut — a count over a page is a wrong number
     -- with no way to tell.
     --
     -- No p_limit parameter either, on purpose. `supabase gen types` puts a function's
     -- ARGUMENTS in the generated types as well as its columns, so adding one drifts
     -- web/types/supabase.ts and supabase/functions/_shared/database.types.ts; and no
     -- caller wants a page — they want the window, which p_within_days already bounds. The
     -- day one does, it can add the parameter and own the paging it asked for.
     ORDER BY pm.due_date;
$$;

COMMENT ON FUNCTION public.agent_payments_due(integer) IS
    'Supplier payments due soon. No lower bound on due_date on purpose — already-overdue is '
    'the point of the section, and days_until goes negative to say so. Uncapped, like '
    'agent_trip_board: both callers aggregate these rows rather than paging them, and '
    'p_within_days is the bound that is meant to do the narrowing.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3.2.1 "Recent messages", later 3.10.1
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.agent_inbox(p_limit integer DEFAULT 20)
RETURNS TABLE (
    conversation_id      uuid,
    client_id            uuid,
    client_display_name  text,
    trip_id              uuid,
    trip_title           text,
    subject              text,
    last_message_at      timestamptz,
    last_message_preview text,
    agent_unread_count   integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    WITH me AS (
        SELECT a.id AS agent_id FROM public.agent a
         WHERE a.id = public.current_agent_id()
    )
    SELECT
        cv.id, c.id,
        coalesce(c.preferred_name, c.first_name) || ' ' || c.last_name,
        cv.trip_id, t.title, cv.subject,
        cv.last_message_at, cv.last_message_preview, cv.agent_unread_count
      FROM public.conversation cv
      JOIN public.client c ON c.id = cv.client_id
     CROSS JOIN me
      LEFT JOIN public.trip t ON t.id = cv.trip_id
     WHERE cv.agent_id = me.agent_id
       AND cv.archived_at IS NULL
     ORDER BY cv.last_message_at DESC
     -- A DEFAULT IS FINE HERE; THE CEILING WAS NOT. Unlike the two functions above,
     -- nothing aggregates these rows into a total: this is a "recent messages" list, every
     -- caller passes an explicit p_limit (the worklist asks for 5), and a list that returns
     -- exactly the number of rows it was asked for has told its reader it is a page. The
     -- default of 20 is part of the declared signature, so omitting the argument is a
     -- choice rather than a surprise.
     --
     -- `least(..., 100)` was the part that could not be told from the truth. A caller
     -- asking for 500 got 100 rows back with no way to know whether that was the whole
     -- inbox or a silent trim of it, and no larger argument could recover the rest. These
     -- are the agent's own conversations; there is nothing protected by refusing them.
     LIMIT coalesce(p_limit, 20);
$$;

COMMENT ON FUNCTION public.agent_inbox(integer) IS
    'The agent side of the message list. agent_unread_count is the column that makes this '
    'function necessary — it is withheld from `authenticated` (20260907031255:216-224) '
    'precisely so a client cannot poll how far behind their advisor is.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3.2.3 availability layer
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.agent_availability_self()
RETURNS TABLE (
    agent_id               uuid,
    time_zone              text,
    weekly_schedule        jsonb,
    response_time_hours    integer,
    time_off_blocks        jsonb,
    calendar_sync_provider text,
    updated_at             timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    -- time_zone lives on `agent`, not on agent_availability. The calendar needs it in the
    -- same read, and joining here keeps the screen from having to ask twice.
    SELECT av.agent_id, a.time_zone, av.weekly_schedule,
           av.response_time_hours, av.time_off_blocks,
           av.calendar_sync_provider, av.updated_at
      FROM public.agent_availability av
      JOIN public.agent a ON a.id = av.agent_id
     WHERE av.agent_id = public.current_agent_id();
$$;

COMMENT ON FUNCTION public.agent_availability_self() IS
    'The agent''s own working hours. calendar_sync_refresh_token_encrypted is ABSENT from '
    'the signature rather than selected-and-dropped: Data-Model §7.3 marks it Tokenized and '
    'it is an OAuth refresh token, so it must be unnameable, not merely unselected. '
    'rls_agent_reads.sql asserts that from pg_get_function_result().';

-- ─────────────────────────────────────────────────────────────────────────────
-- Grants
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE f text;
BEGIN
    FOREACH f IN ARRAY ARRAY[
        'public.agent_kpis()',
        'public.agent_trip_board(trip_status[], integer, integer)',
        'public.agent_payments_due(integer)',
        'public.agent_inbox(integer)',
        'public.agent_availability_self()'
    ]
    LOOP
        -- `anon` by name; see the note on current_agent_id() above.
        EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM public, anon', f);
        EXECUTE format('GRANT  EXECUTE ON FUNCTION %s TO authenticated, service_role', f);
    END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- pg_temp, named LAST, on the definer functions that predate this one
-- ─────────────────────────────────────────────────────────────────────────────

-- The header's rule is POSITIONAL. A search_path that does not name pg_temp leaves it
-- searched FIRST for relation names, which is precisely the shadowing the header is about;
-- `SET search_path = public` looks pinned and is not.
--
-- Seven SECURITY DEFINER functions already in `public` are in that state, and they passed
-- the assertion below only because it used to look for the string `search_path=` and
-- nothing else. None is exploitable today — every one schema-qualifies its relations,
-- `authenticated` is NOLOGIN, PostgREST exposes no DDL, and the two trigger functions run
-- in GoTrue's session rather than a caller's — but the assertion is tightened here to check
-- the property the header actually argues for, and it cannot be tightened without these.
--
-- ALTER rather than CREATE OR REPLACE on purpose: this changes the pin and nothing else, so
-- each body stays owned by the migration that wrote it. Note that a later CREATE OR REPLACE
-- of any of these drops the pin again — handle_new_user() has already been replaced three
-- times — which is why the guard below is schema-wide rather than a list.
ALTER FUNCTION public.handle_new_user()
    SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.handle_user_email_confirmed()
    SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.current_platform_user()
    SET search_path = public, pg_temp;
ALTER FUNCTION public.current_client_mailing_address_id()
    SET search_path = public, pg_temp;
ALTER FUNCTION public.cruise_sync_tick()
    SET search_path = public, pg_temp;
ALTER FUNCTION public.hotel_search_take_token(
        text, public.hotel_rate_window, timestamptz, integer)
    SET search_path = public, pg_temp;
ALTER FUNCTION public.hotel_search_gc()
    SET search_path = public, pg_temp;

-- ── ASSERTIONS ───────────────────────────────────────────────────────────────────

-- A future `GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public` is exactly the kind of thing
-- that happens, and it would hand the whole agent surface to unauthenticated callers.
DO $$
DECLARE leaked text;
BEGIN
    SELECT string_agg(p.proname, ', ') INTO leaked
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND (p.proname LIKE 'agent\_%' OR p.proname = 'current_agent_id')
       AND has_function_privilege('anon', p.oid, 'EXECUTE');

    IF leaked IS NOT NULL THEN
        RAISE EXCEPTION 'anon can execute agent read functions: %', leaked;
    END IF;
END $$;

-- Schema-wide rather than per-function, so it catches the NEXT definer function anyone
-- writes as well as these six.
--
-- WHAT IT CHECKS IS THE POSITION, not merely the presence, of a pin. The previous version
-- of this block tested `cfg LIKE 'search_path=%'` — that SOME value was set — and then
-- claimed in its own comment to catch "the trap this migration's header is about". It did
-- not. The header's trap is pg_temp searched first for relation names, and
-- `SET search_path = public` leaves it exactly there while satisfying that test. So the old
-- guard caught only a COMPLETELY MISSING pin, which is strictly weaker than the property
-- the file argues for, and anything written in the shape of current_platform_user() got a
-- green build. pg_temp must be NAMED, and named LAST.
--
-- ONE PIN PASSES WITHOUT NAMING IT: the empty one. `SET search_path = ''` is stored as the
-- proconfig entry search_path="", whose last comma-separated element btrims to the empty
-- string, so the positional test would read the strictest setting there is as an offender.
-- An empty search_path resolves NOTHING implicitly — pg_temp included — which means every
-- relation name in the body must already be schema-qualified and there is no position for
-- a temp relation to be shadowed FROM. It is stricter than pg_temp-last, not weaker, and
-- it is what Supabase's own function_search_path_mutable advisor recommends. Rejecting it
-- would hand the next author a build failure telling them to append pg_temp to the safest
-- thing they could have written, which is a guard arguing for the weaker configuration.
-- public.enforce_companion_cap already carries exactly this pin, and escapes this block
-- only by being SECURITY INVOKER.
--
-- Extension-owned functions are out of scope: citext, pgcrypto, pg_trgm and uuid-ossp are
-- installed into `public`, nothing here can ALTER what an extension owns, and CREATE
-- EXTENSION is not the surface being guarded. `pg_depend.deptype = 'e'` is that test — a
-- guard that demanded zero rows without it would be unsatisfiable rather than strict.
DO $$
DECLARE unpinned text;
BEGIN
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
       AND p.prosecdef
       AND NOT EXISTS (
            SELECT 1 FROM pg_depend d
             WHERE d.classid = 'pg_proc'::regclass
               AND d.objid   = p.oid
               AND d.deptype = 'e'
           )
       AND (
            sp.value IS NULL
            OR (
                 -- The empty pin is not an offender; see the paragraph above.
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
            'SECURITY DEFINER functions in public must end their search_path with pg_temp, '
            'so a temp relation cannot shadow a real one inside a function running as the '
            'table owner: %', unpinned;
    END IF;
END $$;

-- The projection, asserted from the catalog. This is the property an Edge Function's
-- hand-written column list cannot have.
DO $$
BEGIN
    IF pg_get_function_result('public.agent_availability_self'::regproc) LIKE '%refresh_token%'
    THEN
        RAISE EXCEPTION
            'agent_availability_self() names the encrypted calendar refresh token '
            '(Data-Model §7.3 marks it Tokenized — it must be unnameable, not unselected)';
    END IF;
END $$;

COMMIT;
