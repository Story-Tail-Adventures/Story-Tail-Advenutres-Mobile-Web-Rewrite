-- RLS assertions for the auth_bridge policies.
--
-- The `rls-policy` skill's step 5 exists because a policy that passes the happy path and
-- leaks to another user looks identical to a working one until you execute it as that
-- other user. This file is that execution, committed so it runs on every PR rather than
-- living in someone's shell history.
--
-- Run against a freshly reset local database:
--     supabase db reset
--     psql "$(supabase status -o json | jq -r .DB_URL)" -v ON_ERROR_STOP=1 \
--          -f supabase/tests/rls_auth_bridge.sql
--
-- Any failed assertion raises and, with ON_ERROR_STOP=1, exits non-zero.

\set ON_ERROR_STOP on

BEGIN;

-- Seeded ids, from supabase/seed.sql.
\set gyasi  '''0195a2c0-1a00-7000-8000-000000000010'''
\set jordan '''0195a2c0-1a00-7000-8000-000000000011'''
\set sam    '''0195a2c0-1a00-7000-8000-000000000012'''

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

-- Impersonate a signed-in user the way PostgREST does.
-- Reading a column the role has no privilege on raises 42501, and so does any query
-- against a table the role holds no column privilege on at all — `count(*)` included.
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

-- ── A client sees exactly themselves ────────────────────────────────────────────
SELECT pg_temp.become(:jordan);

SELECT pg_temp.assert(
    (SELECT count(*) FROM public.account) = 1,
    'client sees exactly one account row');
SELECT pg_temp.assert(
    (SELECT email FROM public.account) = 'jordan.hayes@example.com',
    'client sees their OWN account, not someone else''s');
SELECT pg_temp.assert(
    (SELECT count(*) FROM public.platform_user) = 1,
    'client sees exactly one platform_user row');
SELECT pg_temp.assert(
    (SELECT first_name FROM public.client) = 'Jordan',
    'client sees their own client row');
-- Was "client sees no trips yet (no policy — full RLS pass pending)", which asserted the
-- absence of a policy rather than a rule. 20260904140753 added `trip_self_select` because
-- Screen 2.1.13 needs it; the scoping assertions now live in rls_onboarding.sql, and what
-- belongs here is that the bridge hands the client the right rows.
SELECT pg_temp.assert(
    (SELECT count(*) FROM public.trip) >= 1,
    'client sees their own trips through the auth bridge');
SELECT pg_temp.assert(
    (SELECT count(*) FROM public.payment_card) = 0,
    'client sees no payment_card rows (rule 4)');

-- ── …and not one column of what the agent wrote about them ─────────────────────
--
-- `client_self_select` is a whole-row policy, and for the first three days it shipped that
-- is exactly what a traveler got: `SELECT * FROM client` returned the agent's private notes
-- on them. RLS decides which ROWS; only a GRANT decides which COLUMNS. These assertions are
-- the ones that would have caught it — every one of them passed before
-- client_column_grant, because the query succeeded.
SELECT pg_temp.expect_denied(
    'SELECT notes FROM public.client',
    'client cannot read notes — the agent''s private prose about them');
SELECT pg_temp.expect_denied(
    'SELECT tags FROM public.client',
    'client cannot read tags — the agent''s own categorisation');
SELECT pg_temp.expect_denied(
    'SELECT lifetime_value_cents FROM public.client',
    'client cannot read lifetime_value_cents (BRD §10.5 — not their number)');
SELECT pg_temp.expect_denied(
    'SELECT status FROM public.client',
    'client cannot read status — the agent-side lifecycle');
SELECT pg_temp.expect_denied(
    'SELECT merged_into_client_id FROM public.client',
    'client cannot read merged_into_client_id — it discloses another row''s id');
SELECT pg_temp.expect_denied(
    'SELECT * FROM public.client',
    'select * on client is refused outright, rather than quietly returning fewer columns');

-- The other half of the rule: narrowing the grant must not have broken the reads the
-- onboarding screens actually make. These are the exact column lists in
-- web/app/(onboarding)/**/page.tsx and mobile/.../api/OnboardingRepository.kt.
SELECT pg_temp.assert(
    (SELECT preferred_name IS NOT DISTINCT FROM preferred_name FROM public.client
     WHERE first_name IS NOT NULL),
    'Screens 2.1.9 / 2.1m.9 can still read first_name and preferred_name');
SELECT pg_temp.assert(
    (SELECT count(*) FROM (
        SELECT first_name, preferred_name, phone, date_of_birth, mailing_address_id
        FROM public.client) x) = 1,
    'Screens 2.1.14 / 2.1m.14 can still read the completion summary columns');
SELECT pg_temp.assert(
    (SELECT count(*) FROM (
        SELECT phone, date_of_birth, emergency_contact, mailing_address_id
        FROM public.client) x) = 1,
    'Screen 2.1.10 can still read the profile prefill columns');

RESET ROLE;

-- ── A different client sees only themselves ────────────────────────────────────
SELECT pg_temp.become(:sam);

SELECT pg_temp.assert(
    (SELECT email FROM public.account) = 'sam.rivera@example.com',
    'second client sees their own account, not the first client''s');
SELECT pg_temp.assert(
    (SELECT count(*) FROM public.client) = 1,
    'second client cannot see the other client''s row');

RESET ROLE;

-- ── The agent ──────────────────────────────────────────────────────────────────
SELECT pg_temp.become(:gyasi);

SELECT pg_temp.assert(
    (SELECT email FROM public.account) = 'gyasi@example.com',
    'agent sees their own account');
SELECT pg_temp.assert(
    (SELECT role FROM public.platform_user)::text = 'agent',
    'agent resolves to the agent role');
-- Documented scope limit, not a bug: client_self_select keys on platform_user.client_id,
-- which is NULL for an agent. The agent's book of business needs the full RLS pass.
SELECT pg_temp.assert(
    (SELECT count(*) FROM public.client) = 0,
    'agent sees no clients yet (book-of-business policies still to come)');

RESET ROLE;

-- ── An unrecognised subject ────────────────────────────────────────────────────
SELECT pg_temp.become('00000000-0000-0000-0000-0000000000aa');

SELECT pg_temp.assert(
    (SELECT count(*) FROM public.account) = 0,
    'unknown subject sees nothing');

RESET ROLE;

-- ── Function EXECUTE matches what the comments promise ─────────────────────────
--
-- `REVOKE EXECUTE ... FROM public` is a no-op against Supabase's defaults, which grant
-- EXECUTE to anon / authenticated / service_role by NAME. Three functions carried comments
-- describing a lockdown the catalog did not have. Asserted here rather than trusted,
-- because the failure mode is a comment that stays true-looking while the grant drifts.
SELECT pg_temp.assert(
    NOT has_function_privilege('anon', 'public.current_platform_user()', 'EXECUTE'),
    'anon cannot execute current_platform_user()');
SELECT pg_temp.assert(
    has_function_privilege('authenticated', 'public.current_platform_user()', 'EXECUTE'),
    'authenticated still can — client_self_select is built on it');
SELECT pg_temp.assert(
    NOT has_function_privilege('anon', 'public.current_client_mailing_address_id()', 'EXECUTE'),
    'anon cannot execute current_client_mailing_address_id()');
SELECT pg_temp.assert(
    has_function_privilege('authenticated', 'public.current_client_mailing_address_id()', 'EXECUTE'),
    'authenticated still can — address_self_select is built on it');
SELECT pg_temp.assert(
    NOT has_function_privilege('anon', 'public.client_invite_code_hash(text)', 'EXECUTE'),
    'anon cannot execute client_invite_code_hash()');
SELECT pg_temp.assert(
    NOT has_function_privilege('authenticated', 'public.client_invite_code_hash(text)', 'EXECUTE'),
    'authenticated cannot either — redemption belongs behind the Edge Function that rate '
    'limits and audits it');
SELECT pg_temp.assert(
    has_function_privilege('service_role', 'public.client_invite_code_hash(text)', 'EXECUTE'),
    'service_role can — it is the only caller');

-- ── Anonymous ──────────────────────────────────────────────────────────────────
SET LOCAL ROLE anon;

SELECT pg_temp.assert(
    (SELECT count(*) FROM public.account) = 0,
    'anon sees no accounts');
-- Was `count(*) = 0` — anon could run the query and RLS filtered it to nothing. Since
-- client_column_grant, anon holds no column privilege on this table at all, so the query is
-- refused outright and never reaches the policy. Strictly stronger, and the assertion has to
-- say which of the two is being relied on.
SELECT pg_temp.expect_denied(
    'SELECT count(*) FROM public.client',
    'anon cannot read the client table at all');

RESET ROLE;

ROLLBACK;
