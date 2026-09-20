-- The agent read surface: that it returns what only an agent may see, nothing to anyone
-- else, and nothing of one agent's to another.
--
-- WHAT THIS FILE IS REALLY ASSERTING. The §3.x design turns on one claim: a SECURITY DEFINER
-- accessor can return columns the caller has no grant on, scoped by a predicate the caller
-- cannot influence. Every other decision in 20260919140000_agent_read_surface.sql follows
-- from that. So the load-bearing assertion here is not that the functions return rows — it is
-- that `trip.notes` and `trip.total_commission_cents` come back NON-NULL to an agent who,
-- selecting them directly one statement earlier, gets 42501.
--
-- Run against a freshly reset local database:
--     supabase db reset
--     psql "$(supabase status -o json | jq -r .DB_URL)" -v ON_ERROR_STOP=1 \
--          -f supabase/tests/rls_agent_reads.sql

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

-- Expected counts, captured as the table owner BEFORE dropping into the agent's role.
-- An agent reading `trip` directly gets ZERO rows — trip_self_select is predicated on
-- platform_user.client_id, which is NULL for them, which is exactly what
-- rls_trip_graph.sql:361-377 asserts. So a comparison against a direct read would compare
-- against 0 and pass for nothing at all.
CREATE TEMP TABLE expected AS
SELECT (SELECT count(*) FROM public.trip
         WHERE agent_id = '0195a2c0-1a00-7000-8000-000000000001' AND archived_at IS NULL)
           AS trips,
       (SELECT count(*) FROM public.trip
         WHERE agent_id = '0195a2c0-1a00-7000-8000-000000000001'
           AND archived_at IS NULL AND status = 'inquiry')
           AS inquiries;

-- The temp table belongs to the migration role, so the assertions below — which run as
-- `authenticated` — need reading rights on it. It lives in pg_temp and dies with the
-- transaction; nothing in the schema is widened.
GRANT SELECT ON expected TO authenticated;

-- ── As the agent ─────────────────────────────────────────────────────────────────

SELECT pg_temp.become(:gyasi::uuid);

SELECT pg_temp.assert(
    public.current_agent_id() = '0195a2c0-1a00-7000-8000-000000000001'::uuid,
    'current_agent_id() resolves the agent from their JWT');

SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_kpis()) = 1,
    'agent_kpis() returns exactly one row for an agent');

-- THE ASSERTION THE WHOLE DESIGN RESTS ON. Both columns are outside the `authenticated`
-- column grant (20260904140753:33-38 and the trip_read_policies migration), so the two
-- statements below are a matched pair: refused directly, delivered through the accessor.
SELECT pg_temp.expect_denied(
    'SELECT total_commission_cents FROM public.trip',
    'agent is refused trip.total_commission_cents directly — the client grant binds them too');
SELECT pg_temp.expect_denied(
    'SELECT notes FROM public.trip',
    'agent is refused trip.notes directly');

SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_trip_board()
      WHERE total_commission_cents IS NOT NULL AND total_commission_cents <> '0') > 0,
    'agent_trip_board() DOES return total_commission_cents — the definer defeats the revoke');
SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_trip_board() WHERE notes IS NOT NULL) > 0,
    'agent_trip_board() DOES return trip.notes');

SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_trip_board()) = (SELECT trips FROM expected)
      AND (SELECT trips FROM expected) > 0,
    'agent_trip_board() returns every non-archived trip in the agent''s book, and no more');

-- Money is a digit-string, not a JSON number. A sum over bigint is where the contract's
-- convention earns itself; see contracts/openapi.yaml:36 and the migration header.
SELECT pg_temp.assert(
    (SELECT pipeline_value_cents ~ '^-?\d+$' FROM public.agent_kpis()),
    'agent_kpis() renders money as a digit-string');
SELECT pg_temp.assert(
    (SELECT bool_and(total_value_cents ~ '^-?\d+$') FROM public.agent_trip_board()),
    'agent_trip_board() renders money as a digit-string');

-- Null, not zero, for the two figures that have no data behind them yet. This is the
-- "not enough history" state Data-Model §8.8 promises the screen will render honestly; a 0
-- here would be a claim rather than an absence.
SELECT pg_temp.assert(
    (SELECT inquiry_to_book_days IS NULL AND inquiry_to_book_sample = 0
       FROM public.agent_kpis()),
    'inquiry_to_book is NULL with a zero sample until trip_status_history accumulates');

SELECT pg_temp.assert(
    (SELECT new_inquiry_count FROM public.agent_kpis()) = (SELECT inquiries FROM expected),
    'new_inquiry_count counts inquiry-status trips — there is no lead entity');

SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_inbox()) > 0,
    'agent_inbox() returns the agent''s conversations');
SELECT pg_temp.expect_denied(
    'SELECT agent_unread_count FROM public.conversation',
    'agent is refused conversation.agent_unread_count directly — the accessor is the way in');

SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_payments_due(365)) > 0,
    'agent_payments_due() returns scheduled milestones');

RESET ROLE;

-- ── As a signed-in traveler ──────────────────────────────────────────────────────
--
-- ZERO ROWS, NOT AN ERROR, and that is a deliberate choice rather than an accident of the
-- `me` CTE. Every read boundary in this schema answers this way — RLS filters rather than
-- raising, and rls_trip_graph.sql:355-359 states that as the design. A 403 would turn an
-- authorization decision into an error branch on both clients, for a case the UI cannot
-- produce, while telling a prober that the endpoint exists and they are not it. The
-- distinction a screen actually needs is preserved: agent_kpis() gives one row of zeros to
-- an agent with an empty book and NO row to a non-agent.

SELECT pg_temp.become(:jordan::uuid);

SELECT pg_temp.assert(public.current_agent_id() IS NULL,
    'current_agent_id() is NULL for a client');
SELECT pg_temp.assert((SELECT count(*) FROM public.agent_kpis()) = 0,
    'agent_kpis() is empty for a client — zero rows, not an error');
SELECT pg_temp.assert((SELECT count(*) FROM public.agent_trip_board()) = 0,
    'agent_trip_board() is empty for a client, including their OWN trips');
SELECT pg_temp.assert((SELECT count(*) FROM public.agent_inbox()) = 0,
    'agent_inbox() is empty for a client');
SELECT pg_temp.assert((SELECT count(*) FROM public.agent_payments_due()) = 0,
    'agent_payments_due() is empty for a client');
SELECT pg_temp.assert((SELECT count(*) FROM public.agent_availability_self()) = 0,
    'agent_availability_self() is empty for a client');

RESET ROLE;

-- ── As an anonymous visitor ──────────────────────────────────────────────────────
--
-- Two layers, and this asserts the outer one. Even if EXECUTE were restored, auth.uid() is
-- NULL for anon and `me` would be empty — but the grant is what should stop it first.

SET ROLE anon;

SELECT pg_temp.expect_denied('SELECT * FROM public.agent_kpis()',
    'anon cannot execute agent_kpis()');
SELECT pg_temp.expect_denied('SELECT * FROM public.agent_trip_board()',
    'anon cannot execute agent_trip_board()');
SELECT pg_temp.expect_denied('SELECT * FROM public.agent_payments_due()',
    'anon cannot execute agent_payments_due()');
SELECT pg_temp.expect_denied('SELECT * FROM public.agent_inbox()',
    'anon cannot execute agent_inbox()');
SELECT pg_temp.expect_denied('SELECT * FROM public.agent_availability_self()',
    'anon cannot execute agent_availability_self()');
SELECT pg_temp.expect_denied('SELECT public.current_agent_id()',
    'anon cannot execute current_agent_id()');

RESET ROLE;

-- ── The admin hole ───────────────────────────────────────────────────────────────
--
-- platform_user's CHECK has a bare `(role = 'admin')` branch, so an admin row may legally
-- carry an agent_id. `pu.agent_id IS NOT NULL` would have let an admin act as whichever
-- agent someone typed into their row; `pu.role = 'agent'` is what closes it. Without this
-- test that predicate reads like a redundant belt.

-- `platform_user_agent` is UNIQUE, so the admin cannot borrow Gyasi's agent_id — it has to
-- point at an agent of its own. That is also the realistic shape of the hole: an admin row
-- carrying SOME agent_id, not a duplicate of a real advisor's.
INSERT INTO public.agent (id, display_name, email, status)
VALUES ('0195a2c0-1a00-7000-8000-0000000000e0', 'Admin Probe Agent',
        'admin.probe.agent@example.com', 'active');

-- With two active agents, handle_new_user()'s fallback raises too_many_rows. Naming an
-- agent_id in the signup metadata takes the explicit branch (20260902020243:96-113) — the
-- same trap the second-agent fixture below hits.
INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change)
VALUES ('0195a2c0-1a00-7000-8000-0000000000e1',
        '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        'admin.probe@example.com', 'x', now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        ('{"first_name":"Admin","last_name":"Probe",'
         || '"agent_id":"0195a2c0-1a00-7000-8000-000000000001"}')::jsonb,
        now(), now(), '', '', '', '');

UPDATE public.platform_user
   SET role = 'admin', agent_id = '0195a2c0-1a00-7000-8000-0000000000e0', client_id = NULL
 WHERE account_id = '0195a2c0-1a00-7000-8000-0000000000e1';

SELECT pg_temp.become('0195a2c0-1a00-7000-8000-0000000000e1'::uuid);
SELECT pg_temp.assert(public.current_agent_id() IS NULL,
    'an admin carrying an agent_id is NOT resolved as that agent');
SELECT pg_temp.assert((SELECT count(*) FROM public.agent_trip_board()) = 0,
    'an admin sees no agent''s book');
RESET ROLE;

-- ── A second agent ───────────────────────────────────────────────────────────────
--
-- One agent exists today, so tenancy is untested by the seed and the predicate that enforces
-- it would fail silently — a missing `WHERE agent_id =` returns MORE rows, which looks like
-- a working screen. P3 is when this matters; the assertion is cheap now.
--
-- Same metadata trap as the admin fixture above: several active agents now exist, so the
-- signup must name one rather than let handle_new_user() guess.

INSERT INTO public.agent (id, display_name, email, status)
VALUES ('0195a2c0-1a00-7000-8000-0000000000e2', 'Second Advisor',
        'second.advisor@example.com', 'active');

INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change)
VALUES ('0195a2c0-1a00-7000-8000-0000000000e3',
        '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        'second.advisor.login@example.com', 'x', now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        ('{"first_name":"Second","last_name":"Advisor",'
         || '"agent_id":"0195a2c0-1a00-7000-8000-000000000001"}')::jsonb,
        now(), now(), '', '', '', '');

-- Promote exactly as seed.sql:109-126 does, then drop the stand-in client row.
UPDATE public.platform_user
   SET role = 'agent', agent_id = '0195a2c0-1a00-7000-8000-0000000000e2', client_id = NULL
 WHERE account_id = '0195a2c0-1a00-7000-8000-0000000000e3';

INSERT INTO public.client (id, agent_id, first_name, last_name, email)
VALUES ('0195a2c0-1a00-7000-8000-0000000000e4',
        '0195a2c0-1a00-7000-8000-0000000000e2', 'Other', 'Traveler',
        'other.traveler@example.com');

INSERT INTO public.trip (id, client_id, agent_id, title, trip_type, status, total_value_cents)
VALUES ('0195a2c0-1a00-7000-8000-0000000000e5',
        '0195a2c0-1a00-7000-8000-0000000000e4',
        '0195a2c0-1a00-7000-8000-0000000000e2',
        'Someone else''s trip', 'custom', 'proposal', 999999);

SELECT pg_temp.become('0195a2c0-1a00-7000-8000-0000000000e3'::uuid);
SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_trip_board()) = 1,
    'the second agent sees exactly their own one trip');
SELECT pg_temp.assert(
    (SELECT trip_id FROM public.agent_trip_board())
        = '0195a2c0-1a00-7000-8000-0000000000e5'::uuid,
    'and it is theirs, not Gyasi''s');
SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_inbox()) = 0,
    'the second agent sees none of Gyasi''s conversations');
RESET ROLE;

SELECT pg_temp.become(:gyasi::uuid);
SELECT pg_temp.assert(
    NOT EXISTS (SELECT 1 FROM public.agent_trip_board()
                 WHERE trip_id = '0195a2c0-1a00-7000-8000-0000000000e5'),
    'and Gyasi''s board is unchanged by the second agent''s existence');
RESET ROLE;

-- ── The posture itself ───────────────────────────────────────────────────────────

-- The projection as a catalog fact — the property a hand-written column list in TypeScript
-- cannot have. Data-Model §7.3 marks the refresh token Tokenized.
SELECT pg_temp.assert(
    pg_get_function_result('public.agent_availability_self'::regproc) NOT LIKE '%refresh_token%',
    'agent_availability_self() cannot name the encrypted calendar refresh token');

-- Schema-wide, so it catches the next definer function anyone writes, not just these six.
SELECT pg_temp.assert(
    NOT EXISTS (
        SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.prosecdef
           AND NOT EXISTS (
                SELECT 1 FROM unnest(coalesce(p.proconfig, ARRAY[]::text[])) cfg
                 WHERE cfg LIKE 'search\_path=%')
    ),
    'every SECURITY DEFINER function in public pins search_path');

SELECT pg_temp.assert(
    NOT EXISTS (
        SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public'
           AND (p.proname LIKE 'agent\_%' OR p.proname = 'current_agent_id')
           AND has_function_privilege('anon', p.oid, 'EXECUTE')
    ),
    'no agent read function is executable by anon');

-- The two new tables are agency data, reachable only through the accessors.
SELECT pg_temp.assert(
    NOT EXISTS (
        SELECT 1 FROM information_schema.role_table_grants
         WHERE table_schema = 'public' AND grantee IN ('anon', 'authenticated')
           AND table_name IN ('trip_status_history', 'pipeline_weight')
    ),
    'trip_status_history and pipeline_weight grant nothing to a client role');

SELECT pg_temp.assert(
    (SELECT count(*) FROM public.pipeline_weight
      WHERE agent_id = '0195a2c0-1a00-7000-8000-0000000000e2') = 6,
    'the trigger gave the second agent a complete weight set');

ROLLBACK;
