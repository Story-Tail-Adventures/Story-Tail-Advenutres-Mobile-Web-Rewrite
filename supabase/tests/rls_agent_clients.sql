-- §3.3.1's read surface: that the agent's book of business reaches its own advisor in full,
-- including three columns their Postgres role is forbidden to select, and reaches nobody
-- else at all.
--
-- WHAT THIS FILE IS REALLY ASSERTING. `20260905171542_client_column_grant` revoked table
-- SELECT on `client` and held back five columns; three of them — `status`, `tags`,
-- `lifetime_value_cents` — are roster columns. An AGENT is also the Postgres role
-- `authenticated`, so that grant binds them too. The load-bearing assertion here is therefore
-- not that agent_client_roster() returns rows: it is that those three come back NON-NULL to
-- an agent who, selecting them directly one statement earlier, gets 42501.
--
-- THE MARKER THIS FILE CLOSES. rls_auth_bridge.sql asserted, deliberately, that an agent
-- "sees no clients yet (book-of-business policies still to come)". That sentence was left
-- for §3.3. It still holds as written — the agent still sees nothing through a DIRECT read,
-- because client_self_select keys on platform_user.client_id, which is NULL for them — and
-- this file is the other half: the accessor is how the book arrives.
--
-- FIXTURES EXIST TO MAKE ASSERTIONS FALSIFIABLE. The seed's §3.3 block already carries a
-- merged tombstone, a two-currency client and a client with no trips, each for a branch that
-- would otherwise compare a number against itself. The only thing it cannot carry is a
-- SECOND ADVISOR, because one agent exists in the seed and a missing `WHERE agent_id =`
-- returns MORE rows — which looks like a working screen.
--
-- Run against a freshly reset local database:
--     supabase db reset
--     psql "$(supabase status -o json | jq -r .DB_URL)" -v ON_ERROR_STOP=1 \
--          -f supabase/tests/rls_agent_clients.sql

\set ON_ERROR_STOP on

BEGIN;

\set gyasi  '''0195a2c0-1a00-7000-8000-000000000010'''
\set jordan '''0195a2c0-1a00-7000-8000-000000000011'''

CREATE OR REPLACE FUNCTION pg_temp.assert(condition boolean, description text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    IF condition THEN
        RAISE NOTICE '  ok    %', description;
    ELSE
        RAISE EXCEPTION 'FAILED: %', description;
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.expect_denied(stmt text, description text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    EXECUTE stmt;
    RAISE EXCEPTION 'FAILED: % — statement succeeded, expected a privilege error', description;
EXCEPTION
    WHEN insufficient_privilege THEN
        RAISE NOTICE '  ok    %', description;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.become(account uuid)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    PERFORM set_config('role', 'authenticated', true);
    PERFORM set_config(
        'request.jwt.claims',
        json_build_object('sub', account::text, 'role', 'authenticated')::text,
        true
    );
END;
$$;

-- Captured as the table owner, BEFORE dropping into the agent's role, so every count below
-- is compared against the database rather than against a number typed into this file. A
-- literal would go stale the moment the seed gains a client, and a stale literal fails in a
-- way that reads as a broken accessor.
CREATE TEMP TABLE expected AS
SELECT
    (SELECT count(*) FROM public.client
      WHERE agent_id = '0195a2c0-1a00-7000-8000-000000000001'
        AND status = 'active')                             AS active_clients,
    (SELECT count(*) FROM public.client
      WHERE agent_id = '0195a2c0-1a00-7000-8000-000000000001'
        AND status = 'archived')                           AS archived_clients,
    (SELECT count(*) FROM public.client
      WHERE agent_id = '0195a2c0-1a00-7000-8000-000000000001'
        AND status = 'merged_into')                        AS merged_clients,
    (SELECT lifetime_value_cents FROM public.client
      WHERE email = 'jordan.hayes@example.com')            AS jordan_cached_ltv;

-- The temp table is owned by postgres; every assertion below reads it while the session has
-- dropped into `authenticated`, which holds no grant on it by default.
GRANT SELECT ON expected TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. The claim the whole §3.3 design rests on
-- ─────────────────────────────────────────────────────────────────────────────

SELECT pg_temp.become(:gyasi::uuid);

SELECT pg_temp.expect_denied(
    'SELECT status FROM public.client',
    'agent cannot select client.status directly');
SELECT pg_temp.expect_denied(
    'SELECT tags FROM public.client',
    'agent cannot select client.tags directly');
SELECT pg_temp.expect_denied(
    'SELECT lifetime_value_cents FROM public.client',
    'agent cannot select client.lifetime_value_cents directly');
SELECT pg_temp.expect_denied(
    'SELECT * FROM public.client',
    'select * on client is refused outright rather than quietly returning fewer columns');

-- ... and the same three, one statement later, through the accessor. Non-NULL, not merely
-- present: a projection that returned NULLs would satisfy a column-name check and prove
-- nothing about the grant.
SELECT pg_temp.assert(
    (SELECT bool_and(status IS NOT NULL AND tags IS NOT NULL
                     AND lifetime_value_cents IS NOT NULL)
       FROM public.agent_client_roster(NULL, NULL, NULL, 200, 0)),
    'status, tags and lifetime_value_cents all arrive NON-NULL through the accessor');

SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_client_roster_summary()) = 1,
    'the summary accessor answers the agent at all');

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Scope: the merged tombstone, and the filter that cannot ask for it
-- ─────────────────────────────────────────────────────────────────────────────

SELECT pg_temp.assert(
    (SELECT merged_clients FROM expected) > 0,
    'the seed carries a merged_into client, so the next two assertions can fail');

SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_client_roster(NULL, NULL, NULL, 200, 0))
        = (SELECT active_clients + archived_clients FROM expected),
    'a NULL status filter returns active + archived, and excludes the merged tombstone');

-- Asking for it BY NAME still does not return it. `merged_into` is a legal value of the
-- parameter's own enum type, so the exclusion has to be in the body rather than in the
-- caller's discipline.
SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_client_roster(
        ARRAY['active','archived','merged_into']::client_status[], NULL, NULL, 200, 0))
        = (SELECT active_clients + archived_clients FROM expected),
    'p_status => merged_into cannot surface a tombstone: the exclusion is unconditional');

SELECT pg_temp.assert(
    (SELECT active_count FROM public.agent_client_roster_summary())
        = (SELECT active_clients FROM expected)
    AND
    (SELECT archived_count FROM public.agent_client_roster_summary())
        = (SELECT archived_clients FROM expected),
    'the summary counts agree with the table for both statuses it reports');

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Money: derived, and scoped to one currency
-- ─────────────────────────────────────────────────────────────────────────────

-- The cache is NOT the source. Jordan's seeded client.lifetime_value_cents is a stale
-- hand-written figure and nothing in the repository maintains it. The cached value is read
-- ABOVE, as the table owner, because an agent selecting that column is denied — which is
-- itself the reason the accessor has to derive the number.
SELECT pg_temp.assert(
    (SELECT lifetime_value_cents::bigint
       FROM public.agent_client_roster(NULL, NULL, 'jordan.hayes@example.com', 10, 0))
    <> (SELECT jordan_cached_ltv FROM expected),
    'lifetime value is derived from committed trips, not read from the unmaintained cache');

-- The two-currency client, asserted against figures read off the seed BY HAND rather than
-- recomputed with the accessor's own expression. A fixture derived from the implementation
-- agrees with the implementation whatever either one does, which is how a money bug ships
-- green. Priya's committed trips are EUR 812,000 (Lisbon, completed), USD 1,140,000 (Kyoto,
-- booked) and USD 690,000 (Amalfi, completed): two USD rows to one EUR, so USD dominates,
-- and the sum it names is 1,140,000 + 690,000.
SELECT pg_temp.assert(
    (SELECT lifetime_currency FROM public.agent_client_roster(NULL, NULL, 'Raghunathan', 10, 0))
        = 'USD',
    'the dominant currency is the one with the most committed trips, not the largest total');

SELECT pg_temp.assert(
    (SELECT lifetime_currency_count
       FROM public.agent_client_roster(NULL, NULL, 'Raghunathan', 10, 0)) = 2,
    'a client with trips in two currencies reports currency_count = 2');

SELECT pg_temp.assert(
    (SELECT lifetime_value_cents
       FROM public.agent_client_roster(NULL, NULL, 'Raghunathan', 10, 0)) = '1830000',
    'the sum is the USD trips alone — the EUR 812,000 is excluded, not converted or added');

-- A client with nothing committed reports NULL currency, not a confident zero in a currency
-- they have never transacted in.
SELECT pg_temp.assert(
    (SELECT lifetime_currency IS NULL AND lifetime_value_cents = '0'
       FROM public.agent_client_roster(NULL, NULL, 'eli.park@example.com', 10, 0)),
    'a client with no committed trips has a NULL currency rather than a labelled $0');

-- A cancelled trip is money that never moved, and it must not reach either trip column
-- either: Dana's row has to read exactly like a client with no trips at all.
SELECT pg_temp.assert(
    (SELECT lifetime_value_cents = '0' AND last_trip_title IS NULL AND next_trip_title IS NULL
       FROM public.agent_client_roster(NULL, NULL, 'dana.okonkwo@example.com', 10, 0)),
    'a cancelled-only client contributes no money and shows no last or next trip');

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Search, filters, and the paginator's total
-- ─────────────────────────────────────────────────────────────────────────────

SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_client_roster(NULL, NULL, 'Raghunathan', 10, 0)) = 1,
    'search matches a surname');
SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_client_roster(NULL, NULL, 'eli.park@example', 10, 0)) = 1,
    'search matches an email fragment');
SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_client_roster(NULL, NULL, 'Pri', 10, 0)) >= 1,
    'search matches a preferred name');
-- The prototype's placeholder promises "name, email, trip", and the trip half is the one a
-- name-and-email search would silently drop.
SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_client_roster(NULL, NULL, 'Kyoto', 10, 0)) = 1,
    'search matches a TRIP title, which the placeholder promises and nothing else covers');
SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_client_roster(NULL, NULL, '   ', 200, 0))
        = (SELECT active_clients + archived_clients FROM expected),
    'a whitespace-only search is not a filter');

SELECT pg_temp.assert(
    (SELECT bool_and(tags && ARRAY['vip'])
       FROM public.agent_client_roster(NULL, ARRAY['vip'], NULL, 200, 0)),
    'the tag filter returns only rows carrying that tag');

-- The chips are derived from the book, not from a constant. `client.tags` is free-form and
-- has no vocabulary table, so a hardcoded chip row would offer filters matching nothing.
SELECT pg_temp.assert(
    (SELECT jsonb_array_length(tag_facets) FROM public.agent_client_roster_summary()) > 0,
    'tag_facets is populated from the agent''s own book');

-- Every chip must return at least one row when clicked. A facet whose count disagrees with
-- the filter is the specific failure this catches: both read client.tags, and if the facet
-- counted archived clients while the default roster shows active ones, the chip would look
-- live and return nothing.
SELECT pg_temp.assert(
    (SELECT bool_and(
        (SELECT count(*) FROM public.agent_client_roster(
             ARRAY['active']::client_status[], ARRAY[f.tag], NULL, 200, 0)) = f.n)
       FROM (SELECT x->>'tag' AS tag, (x->>'count')::integer AS n
               FROM public.agent_client_roster_summary() s,
                    jsonb_array_elements(s.tag_facets) x) f),
    'every tag facet count equals what that chip actually returns');

-- total_count is the count BEFORE the page window, which is the only thing a paginator can
-- use. A window-aware count would equal the page size and the last page would never render.
SELECT pg_temp.assert(
    (SELECT DISTINCT total_count FROM public.agent_client_roster(
        ARRAY['active']::client_status[], NULL, NULL, 3, 0))
        = (SELECT active_clients FROM expected)::integer,
    'total_count is the pre-window total, not the size of the page returned');

SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_client_roster(
        ARRAY['active']::client_status[], NULL, NULL, 3, 0)) = 3,
    'p_limit bounds the page');

-- Offsetting past the end is an empty page, not an error and not a wrapped first page.
SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_client_roster(
        ARRAY['active']::client_status[], NULL, NULL, 10, 100000)) = 0,
    'an offset past the end returns no rows rather than wrapping');

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Nobody else gets the book
-- ─────────────────────────────────────────────────────────────────────────────

-- A traveler is `authenticated` too, and holds EXECUTE on these functions by the same grant
-- the agent does. The only thing standing between them and the whole roster is
-- current_agent_id() resolving to NULL for a platform_user whose role is not 'agent'.
SELECT pg_temp.become(:jordan::uuid);

SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_client_roster(NULL, NULL, NULL, 200, 0)) = 0,
    'a signed-in TRAVELER gets zero rows from the roster, not their own row and not the book');

SELECT pg_temp.assert(
    (SELECT active_count + in_motion_count + inquiry_count + archived_count
       FROM public.agent_client_roster_summary()) = 0,
    'a traveler''s summary is all zeroes rather than the agent''s counts');

RESET ROLE;

-- ── A second advisor ─────────────────────────────────────────────────────────────
--
-- One agent exists in the seed, so tenancy is untested by it and a missing
-- `WHERE agent_id =` would fail silently — by returning MORE rows, which reads as a working
-- screen. Both accessors carry that predicate independently, so both get their own check.
--
-- The signup names an agent explicitly: several active agents exist by this point and
-- handle_new_user() would otherwise guess.

INSERT INTO public.agent (id, display_name, email, status)
VALUES ('0195a2c0-1a00-7000-8000-000000000400', 'Roster Rival',
        'roster.rival@example.com', 'active');

INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change)
VALUES ('0195a2c0-1a00-7000-8000-000000000401',
        '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        'roster.rival.login@example.com', 'x', now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        ('{"first_name":"Roster","last_name":"Rival",'
         || '"agent_id":"0195a2c0-1a00-7000-8000-000000000001"}')::jsonb,
        now(), now(), '', '', '', '');

-- Promote, then drop the stand-in client handle_new_user() created. Without the DELETE that
-- row joins Gyasi's book and every count above becomes wrong by one — after the fact, which
-- is the worst time to discover it.
DO $$
DECLARE v_client_id uuid;
BEGIN
    SELECT client_id INTO v_client_id
      FROM public.platform_user
     WHERE account_id = '0195a2c0-1a00-7000-8000-000000000401';

    UPDATE public.platform_user
       SET role = 'agent', agent_id = '0195a2c0-1a00-7000-8000-000000000400', client_id = NULL
     WHERE account_id = '0195a2c0-1a00-7000-8000-000000000401';

    DELETE FROM public.client WHERE id = v_client_id;
END $$;

INSERT INTO public.client (id, agent_id, first_name, last_name, email, tags, status)
VALUES ('0195a2c0-1a00-7000-8000-000000000402',
        '0195a2c0-1a00-7000-8000-000000000400', 'Someone', 'Elses-Client',
        'someone.elses.client@example.com', ARRAY['vip'], 'active');

SELECT pg_temp.become('0195a2c0-1a00-7000-8000-000000000401'::uuid);

SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_client_roster(NULL, NULL, NULL, 200, 0)) = 1,
    'the second advisor sees exactly their own one client');

SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_client_roster(NULL, NULL, 'Raghunathan', 200, 0)) = 0,
    'searching for one of Gyasi''s clients by name returns nothing to another advisor');

SELECT pg_temp.assert(
    (SELECT active_count FROM public.agent_client_roster_summary()) = 1,
    'the summary is the second advisor''s own book, not the platform''s');

-- The predicate the roster is scoped by is the CLIENT's agent_id; the trip join carries its
-- own. A trip whose agent_id points elsewhere must not contribute money to this roster — a
-- split or reassigned booking is exactly how that happens in practice.
RESET ROLE;
INSERT INTO public.trip (id, client_id, agent_id, title, trip_type, status,
                         start_date, end_date, total_value_cents, total_paid_cents,
                         total_commission_cents, currency)
VALUES ('0195a2c0-1a00-7000-8000-000000000403',
        '0195a2c0-1a00-7000-8000-000000000402',
        '0195a2c0-1a00-7000-8000-000000000001',   -- GYASI's id on the rival's client's trip
        'A trip booked by the other advisor', 'custom', 'completed',
        current_date - 30, current_date - 23, 500000, 500000, 60000, 'USD');

SELECT pg_temp.become('0195a2c0-1a00-7000-8000-000000000401'::uuid);

SELECT pg_temp.assert(
    (SELECT lifetime_value_cents FROM public.agent_client_roster(NULL, NULL, 'Elses-Client', 10, 0))
        = '0',
    'a trip carrying another advisor''s agent_id adds nothing to this roster''s money');

RESET ROLE;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. anon holds nothing
-- ─────────────────────────────────────────────────────────────────────────────

SELECT pg_temp.assert(
    NOT has_function_privilege('anon',
        'public.agent_client_roster(client_status[], text[], text, integer, integer)'::regprocedure,
        'EXECUTE'),
    'anon cannot execute agent_client_roster');

SELECT pg_temp.assert(
    NOT has_function_privilege('anon',
        'public.agent_client_roster_summary()'::regprocedure, 'EXECUTE'),
    'anon cannot execute agent_client_roster_summary');

SELECT pg_temp.assert(
    has_function_privilege('authenticated',
        'public.agent_client_roster(client_status[], text[], text, integer, integer)'::regprocedure,
        'EXECUTE'),
    'authenticated CAN execute it — the scoping is current_agent_id(), not the grant');

ROLLBACK;
