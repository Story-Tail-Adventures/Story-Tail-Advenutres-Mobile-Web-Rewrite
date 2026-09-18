-- Privilege assertions for the payment domain.
--
-- WHAT THIS FILE IS FOR, AND WHY A COUNT IS NOT ENOUGH.
--
-- Before 20260917090000_payment_domain_lockdown.sql these six tables had RLS enabled, zero
-- policies, and a live table-level SELECT grant to both `anon` and `authenticated` covering
-- every column — `payment_card.stripe_payment_method_id`, `.stripe_customer_id` and
-- `authorization_request.token_hash` among them.
--
-- Nothing leaked, because zero policies fails closed. That is exactly what made it dangerous:
-- `SELECT count(*) FROM payment_card` returned 0 and looked like proof of a locked table,
-- when it was only proof of a missing policy. `rls_auth_bridge.sql` asserted precisely that,
-- and would have kept passing on the day a `payment_card_self_select` policy shipped the
-- tokens to a browser. That assertion is rewritten in place to call this file instead.
--
-- So every assertion here demands a PRIVILEGE ERROR, not an empty result. A zero-row answer
-- and a permission-denied answer are different claims, and only the second one is the one
-- CLAUDE.md rule 4 and Data-Model §21.2 actually make.
--
-- Run against a freshly reset local database:
--     supabase db reset
--     psql "$(supabase status -o json | jq -r .DB_URL)" -v ON_ERROR_STOP=1 \
--          -f supabase/tests/rls_payment.sql
--
-- CI picks it up by glob — see .github/workflows/ci.yml's supabase job; no workflow edit is
-- needed to add a test file here.

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
-- a table the role holds no column privilege on at all — `count(*)` included. Same helper
-- shape as rls_auth_bridge.sql:38-47.
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

-- ── As a signed-in traveler ──────────────────────────────────────────────────────

SELECT pg_temp.become(:jordan::uuid);

-- The two Stripe columns. These are the whole reason the migration exists: Data-Model §21.2
-- names both server-only, and an Edge Function on the service role is the only thing that
-- may read them.
SELECT pg_temp.expect_denied(
    'SELECT stripe_payment_method_id FROM public.payment_card',
    'client cannot read payment_card.stripe_payment_method_id (rule 4, Data-Model §21.2)');
SELECT pg_temp.expect_denied(
    'SELECT stripe_customer_id FROM public.payment_card',
    'client cannot read payment_card.stripe_customer_id (rule 4, Data-Model §21.2)');

-- Not a disclosure but an authorization-bypass primitive: this is the single-use hash behind
-- Screen 2.4.3's emailed authorization link.
SELECT pg_temp.expect_denied(
    'SELECT token_hash FROM public.authorization_request',
    'client cannot read authorization_request.token_hash — it is a bearer secret');

-- Whole-table denial, including count(*). This is the assertion rls_auth_bridge.sql used to
-- make as `count(*) = 0`, which passed for the wrong reason.
SELECT pg_temp.expect_denied(
    'SELECT count(*) FROM public.payment_card',
    'client cannot count payment_card at all — denied, not merely empty');
SELECT pg_temp.expect_denied(
    'SELECT count(*) FROM public.card_authorization',
    'client cannot count card_authorization at all');
SELECT pg_temp.expect_denied(
    'SELECT count(*) FROM public.authorization_request',
    'client cannot count authorization_request at all');
SELECT pg_temp.expect_denied(
    'SELECT count(*) FROM public.card_use_event',
    'client cannot count card_use_event at all');

-- Taken with them in the same migration: identical state, same defect class.
SELECT pg_temp.expect_denied(
    'SELECT count(*) FROM public.audit_event',
    'client cannot read audit_event — §21.2 names it server-only');
SELECT pg_temp.expect_denied(
    'SELECT count(*) FROM public.commission',
    'client cannot read commission — agency earnings, never the traveler''s (BRD §10.5)');

-- A write is denied for the same reason a read is: no grant at all. Client mutations to
-- these tables go through audited Edge Functions on the service role, never PostgREST.
SELECT pg_temp.expect_denied(
    'UPDATE public.payment_card SET nickname = ''mine'' WHERE true',
    'client cannot write payment_card through PostgREST');
SELECT pg_temp.expect_denied(
    'INSERT INTO public.card_use_event (id, card_authorization_id, payment_card_id, trip_id,
         agent_user_id, supplier_name_snapshot, amount_cents, justification)
     VALUES (gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(),
         gen_random_uuid(), ''x'', 1, ''x'')',
    'client cannot forge a card_use_event — the ledger is append-only and agent-written');

RESET ROLE;

-- ── As an anonymous visitor ──────────────────────────────────────────────────────
--
-- `anon` held the same grants as `authenticated`, which is the sharper half of the finding:
-- the tokens were reachable by a role that has not signed in at all.

SET ROLE anon;

SELECT pg_temp.expect_denied(
    'SELECT stripe_payment_method_id FROM public.payment_card',
    'anon cannot read payment_card.stripe_payment_method_id');
SELECT pg_temp.expect_denied(
    'SELECT token_hash FROM public.authorization_request',
    'anon cannot read authorization_request.token_hash');
SELECT pg_temp.expect_denied(
    'SELECT count(*) FROM public.card_use_event',
    'anon cannot read card_use_event');

RESET ROLE;

-- ── The posture itself ───────────────────────────────────────────────────────────
--
-- The statement-level assertions above would all still pass if a future migration granted a
-- narrower column set, so this asserts the catalog directly: no privilege of any kind, on
-- any of the six, to either client role.

SELECT pg_temp.assert(
    NOT EXISTS (
        SELECT 1 FROM information_schema.role_table_grants
         WHERE table_schema = 'public'
           AND grantee IN ('anon', 'authenticated')
           AND table_name IN ('payment_card', 'card_authorization', 'authorization_request',
                              'card_use_event', 'audit_event', 'commission')
    ),
    'no payment-domain table grants any privilege to anon or authenticated');

SELECT pg_temp.assert(
    NOT EXISTS (
        SELECT 1 FROM information_schema.column_privileges
         WHERE table_schema = 'public'
           AND grantee IN ('anon', 'authenticated')
           AND table_name IN ('payment_card', 'card_authorization', 'authorization_request',
                              'card_use_event', 'audit_event', 'commission')
    ),
    'no payment-domain column grants survive the table revoke');

-- RLS stays on regardless. The grants are what this file is about, but a future reader
-- should not be able to conclude that revoking made RLS unnecessary — the service role
-- bypasses both, and a role added later would meet neither defence if this were dropped.
SELECT pg_temp.assert(
    (SELECT bool_and(c.relrowsecurity)
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname IN ('payment_card', 'card_authorization', 'authorization_request',
                          'card_use_event', 'audit_event', 'commission')),
    'RLS remains enabled on all six payment-domain tables');

ROLLBACK;
