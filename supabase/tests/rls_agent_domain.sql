-- Privilege assertions for the seventeen tables 20260919120000_agent_domain_lockdown.sql
-- closed.
--
-- WHY THIS FILE EXISTS SEPARATELY FROM rls_payment.sql.
--
-- Same defect, same shape, one migration later: tables created in 20260514120000_initial.sql
-- with RLS enabled and nothing else, so they kept the `auto_expose_new_tables` default grant
-- to `anon` and `authenticated`. The payment lockdown fixed six of twenty-three and this one
-- fixed the rest, so the assertions live beside each other rather than inside one file.
--
-- Every assertion here demands a PRIVILEGE ERROR, not an empty result, for the reason
-- rls_payment.sql:16-18 gives: zero rows and permission-denied are different claims, and
-- only the second is the one being made. A `count(*) = 0` here would have passed every day
-- since 2026-05-14 and would keep passing on the day somebody adds the first policy.
--
-- THE SECTION WITH NO ANALOGUE IN rls_payment.sql is the agent one. An agent is also the
-- Postgres role `authenticated` — the agent/client distinction is `platform_user.role`, not
-- a database role — so the lockdown binds Gyasi exactly as it binds a traveler. The agent's
-- path to `agent` and `agent_availability` is a SECURITY DEFINER accessor, not a grant, and
-- asserting that here is what stops somebody "fixing" the agent surface with a policy.
--
-- Run against a freshly reset local database:
--     supabase db reset
--     psql "$(supabase status -o json | jq -r .DB_URL)" -v ON_ERROR_STOP=1 \
--          -f supabase/tests/rls_agent_domain.sql
--
-- CI picks it up by glob — see .github/workflows/ci.yml's supabase job.

\set ON_ERROR_STOP on

BEGIN;

-- Seeded ids, from supabase/seed.sql.
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

-- Every table closed by the Group B half. Asserted by loop rather than by hand so that a
-- table added to the migration and forgotten here is impossible.
CREATE OR REPLACE FUNCTION pg_temp.group_b() RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
    SELECT ARRAY[
        'agent', 'agent_availability', 'auth_event', 'client_invite', 'client_note',
        'commission_import', 'feature_flag', 'message_template', 'mfa_device',
        'notification_preference', 'session', 'supplier', 'trip_template'
    ];
$$;

CREATE OR REPLACE FUNCTION pg_temp.deny_all_group_b(who text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE t text;
BEGIN
    FOREACH t IN ARRAY pg_temp.group_b() LOOP
        PERFORM pg_temp.expect_denied(
            format('SELECT count(*) FROM public.%I', t),
            format('%s cannot read %s at all', who, t));
    END LOOP;
END;
$$;

-- ── As a signed-in traveler ──────────────────────────────────────────────────────

SELECT pg_temp.become(:jordan::uuid);

SELECT pg_temp.deny_all_group_b('client');

-- The four that are worse than a disclosure, named individually so the reason is in the
-- output when one of them regresses.
SELECT pg_temp.expect_denied(
    'SELECT secret_encrypted FROM public.mfa_device',
    'client cannot read mfa_device.secret_encrypted — the TOTP seed (Data-Model §21.2)');
SELECT pg_temp.expect_denied(
    'SELECT code_hash FROM public.client_invite',
    'client cannot read client_invite.code_hash — a single-use bearer credential');
SELECT pg_temp.expect_denied(
    'SELECT ip_address FROM public.session',
    'client cannot read session.ip_address — every account''s addresses and devices');
SELECT pg_temp.expect_denied(
    'SELECT event_type FROM public.auth_event',
    'client cannot read auth_event — login attempts and security events');
SELECT pg_temp.expect_denied(
    'SELECT calendar_sync_refresh_token_encrypted FROM public.agent_availability',
    'client cannot read agent_availability''s OAuth refresh token (Data-Model §7.3)');

-- Group C: the three withheld columns on a table the caller CAN otherwise read. This is the
-- only place in the schema where a column revoke has to thread a live policy.
SELECT pg_temp.expect_denied(
    'SELECT auth_provider_id FROM public.account',
    'client cannot read account.auth_provider_id (Data-Model §21.2) — readable before this');
SELECT pg_temp.expect_denied(
    'SELECT password_hash FROM public.account',
    'client cannot read account.password_hash (Data-Model §21.2)');
SELECT pg_temp.expect_denied(
    'SELECT locked_reason FROM public.account',
    'client cannot read account.locked_reason — the agency''s reasoning, not their fact');

-- THE CANARY. Everything above passes just as well if the REVOKE was too broad and took the
-- whole client read surface with it, so each Group C table gets a positive read of exactly
-- what a shipped screen selects. Same purpose as 20260907113546:69-82's trip column count.
SELECT pg_temp.assert(
    (SELECT email FROM public.account) = 'jordan.hayes@example.com',
    'account: 2.5.10 can still read its own email');
SELECT pg_temp.assert(
    (SELECT auth_provider IS NOT NULL AND mfa_enrolled_at IS NOT DISTINCT FROM mfa_enrolled_at
       FROM public.account),
    'account: 2.5.7 can still read auth_provider and mfa_enrolled_at');
SELECT pg_temp.assert(
    (SELECT role FROM public.platform_user) = 'client',
    'platform_user: the onboarding gate can still read role');
SELECT pg_temp.assert(
    (SELECT onboarding_step IS NOT DISTINCT FROM onboarding_step
        AND onboarding_completed_at IS NOT DISTINCT FROM onboarding_completed_at
        AND time_zone IS NOT NULL
       FROM public.platform_user),
    'platform_user: the gate and the trip queries can still read their columns');
SELECT pg_temp.assert(
    (SELECT count(*) FROM (
        SELECT line1, line2, city, region, postal_code, country FROM public.address) s) >= 0,
    'address: 2.1.10 and 2.5.2 can still read the six postal columns');
SELECT pg_temp.assert(
    (SELECT count(*) FROM (
        SELECT preferred_destinations, travel_styles, dietary_restrictions, dietary_notes,
               accessibility_needs, accessibility_notes, loyalty_programs, budget_band,
               favorite_past_trips
          FROM public.travel_preference) s) >= 0,
    'travel_preference: 2.1.11 and 2.5.3 can still read the whole preference set');

RESET ROLE;

-- ── As the agent ─────────────────────────────────────────────────────────────────
--
-- The section that makes the design explicit rather than accidental. Gyasi is the same
-- Postgres role as the traveler above, so the lockdown binds him identically — including on
-- `agent`, which is his OWN row. §3.2 reads it through a SECURITY DEFINER accessor, and the
-- next migration is what adds one. If somebody ever "fixes" the agent surface by granting
-- here instead, these are the assertions that say no.

SELECT pg_temp.become(:gyasi::uuid);

SELECT pg_temp.deny_all_group_b('agent');

SELECT pg_temp.expect_denied(
    'SELECT commission_split_pct FROM public.agent',
    'agent cannot read their own agent row through a grant — §3.x uses a definer accessor');
SELECT pg_temp.expect_denied(
    'SELECT secret_encrypted FROM public.mfa_device',
    'agent cannot read mfa_device.secret_encrypted either');
SELECT pg_temp.expect_denied(
    'SELECT auth_provider_id FROM public.account',
    'agent cannot read account.auth_provider_id either');

RESET ROLE;

-- ── As an anonymous visitor ──────────────────────────────────────────────────────

SET ROLE anon;

SELECT pg_temp.deny_all_group_b('anon');

SELECT pg_temp.expect_denied(
    'SELECT count(*) FROM public.account',
    'anon cannot read account');
SELECT pg_temp.expect_denied(
    'SELECT count(*) FROM public.platform_user',
    'anon cannot read platform_user');
SELECT pg_temp.expect_denied(
    'SELECT count(*) FROM public.address',
    'anon cannot read address');
SELECT pg_temp.expect_denied(
    'SELECT count(*) FROM public.travel_preference',
    'anon cannot read travel_preference');

RESET ROLE;

-- ── The posture itself ───────────────────────────────────────────────────────────

SELECT pg_temp.assert(
    NOT EXISTS (
        SELECT 1 FROM information_schema.role_table_grants
         WHERE table_schema = 'public' AND grantee IN ('anon', 'authenticated')
           AND table_name = ANY (pg_temp.group_b())
    ),
    'no Group B table grants any privilege to anon or authenticated');

SELECT pg_temp.assert(
    NOT EXISTS (
        SELECT 1 FROM information_schema.column_privileges
         WHERE table_schema = 'public' AND grantee IN ('anon', 'authenticated')
           AND table_name = ANY (pg_temp.group_b())
    ),
    'no Group B column grant survives the table revoke');

-- The invariant this migration made true for the first time. `anon` has no policy anywhere
-- in this schema, so it should hold no privilege anywhere; those seventeen tables were the
-- last place it did.
SELECT pg_temp.assert(
    NOT EXISTS (
        SELECT 1 FROM information_schema.column_privileges
         WHERE table_schema = 'public' AND grantee = 'anon'
    ),
    'anon holds no column privilege anywhere in public');

-- The class rather than the instance. This is the assertion that would have caught the
-- payment domain in May rather than September, and the agent domain with it.
SELECT pg_temp.assert(
    NOT EXISTS (
        WITH granted AS (
            SELECT table_name FROM information_schema.role_table_grants
             WHERE table_schema = 'public' AND grantee IN ('anon', 'authenticated')
            UNION
            SELECT table_name FROM information_schema.column_privileges
             WHERE table_schema = 'public' AND grantee IN ('anon', 'authenticated')
        )
        SELECT 1 FROM granted WHERE table_name <> ALL (ARRAY[
            'account', 'address', 'client', 'companion', 'conversation', 'document',
            'itinerary', 'itinerary_activity', 'itinerary_day', 'message',
            'message_attachment', 'payment_milestone', 'platform_user', 'proposal',
            'testimonial', 'travel_document', 'travel_preference', 'trip', 'trip_component'
        ])
    ),
    'no table outside the nineteen-table client read surface grants to a client role');

-- RLS stays on regardless, for the reason rls_payment.sql:175-177 gives: a future reader
-- must not be able to conclude that revoking made RLS unnecessary.
SELECT pg_temp.assert(
    (SELECT bool_and(c.relrowsecurity)
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = ANY (pg_temp.group_b())),
    'RLS remains enabled on all thirteen Group B tables');

ROLLBACK;
