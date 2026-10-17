-- Privilege assertions for the money tables a client must never read: audit_event and
-- commission.
--
-- WHAT THIS FILE IS FOR, AND WHY A COUNT IS NOT ENOUGH.
--
-- Before 20260917090000_payment_domain_lockdown.sql six tables had RLS enabled, zero
-- policies, and a live table-level SELECT grant to both `anon` and `authenticated`. Four of
-- them were the card tables, which 20261021120000_supplier_pay_links.sql dropped on
-- 2026-10-16 (the app holds no card at all now, §3.6). The other two, `audit_event` and
-- `commission`, are still here and still must hold no client-role privilege.
--
-- Nothing leaked back then, because zero policies fails closed. That is exactly what made it
-- dangerous: `SELECT count(*)` returned 0 and looked like proof of a locked table, when it was
-- only proof of a missing policy. So every assertion here demands a PRIVILEGE ERROR, not an
-- empty result. A zero-row answer and a permission-denied answer are different claims.
--
-- Run against a freshly reset local database:
--     supabase db reset
--     psql "$(supabase status -o json | jq -r .DB_URL)" -v ON_ERROR_STOP=1 \
--          -f supabase/tests/rls_payment.sql
--
-- CI picks it up by glob — see .github/workflows/ci.yml's supabase job.

\set ON_ERROR_STOP on

BEGIN;

-- Seeded ids, from supabase/seed.sql.
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

-- Reading a column the role has no privilege on raises 42501, and so does any query against
-- a table the role holds no column privilege on at all — `count(*)` included.
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
        json_build_object('sub', account::text, 'role', 'authenticated', 'aal', 'aal2')::text,
        true
    );
END;
$$;

-- ── As a signed-in traveler ──────────────────────────────────────────────────────

SELECT pg_temp.become(:jordan::uuid);

SELECT pg_temp.expect_denied(
    'SELECT count(*) FROM public.audit_event',
    'client cannot read audit_event — §21.2 names it server-only');
SELECT pg_temp.expect_denied(
    'SELECT metadata FROM public.audit_event',
    'client cannot read audit_event.metadata, which holds pay link history');
SELECT pg_temp.expect_denied(
    'SELECT count(*) FROM public.commission',
    'client cannot read commission — agency earnings, never the traveler''s (BRD §10.5)');

-- A write is denied for the same reason a read is: no grant at all.
SELECT pg_temp.expect_denied(
    'INSERT INTO public.audit_event (id, event_type, metadata)
     VALUES (gen_random_uuid(), ''payment_milestone.marked_paid'', ''{}''::jsonb)',
    'client cannot forge an audit_event — a fake "marked paid" row in Payment History');
SELECT pg_temp.expect_denied(
    'UPDATE public.commission SET notes = ''mine'' WHERE true',
    'client cannot write commission through PostgREST');

RESET ROLE;

-- ── As an anonymous visitor ──────────────────────────────────────────────────────

SET ROLE anon;

SELECT pg_temp.expect_denied(
    'SELECT count(*) FROM public.audit_event',
    'anon cannot read audit_event');
SELECT pg_temp.expect_denied(
    'SELECT count(*) FROM public.commission',
    'anon cannot read commission');

RESET ROLE;

-- ── The posture itself ───────────────────────────────────────────────────────────

SELECT pg_temp.assert(
    NOT EXISTS (
        SELECT 1 FROM information_schema.role_table_grants
         WHERE table_schema = 'public'
           AND grantee IN ('anon', 'authenticated')
           AND table_name IN ('audit_event', 'commission')
    ),
    'neither audit_event nor commission grants any privilege to anon or authenticated');

SELECT pg_temp.assert(
    NOT EXISTS (
        SELECT 1 FROM information_schema.column_privileges
         WHERE table_schema = 'public'
           AND grantee IN ('anon', 'authenticated')
           AND table_name IN ('audit_event', 'commission')
    ),
    'no audit_event or commission column grant survives the table revoke');

-- RLS stays on regardless: the service role bypasses both, and a role added later would
-- meet neither defence if this were dropped.
SELECT pg_temp.assert(
    (SELECT bool_and(c.relrowsecurity)
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname IN ('audit_event', 'commission')),
    'RLS remains enabled on audit_event and commission');

-- The card tables are gone, not merely locked (§3.6, 2026-10-16).
SELECT pg_temp.assert(
    to_regclass('public.payment_card') IS NULL
    AND to_regclass('public.card_authorization') IS NULL
    AND to_regclass('public.authorization_request') IS NULL
    AND to_regclass('public.card_use_event') IS NULL,
    'the four card tables no longer exist');

ROLLBACK;
