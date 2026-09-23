-- Take the client-role grants away from the seventeen tables the payment lockdown left
-- behind. §3.2's first migration, and the one that has to land before any other line of the
-- agent side.
--
-- ── WHAT IS WRONG ────────────────────────────────────────────────────────────────
--
-- 20260917090000_payment_domain_lockdown.sql fixed six tables that were created in
-- 20260514120000_initial.sql with RLS enabled and nothing else, so they kept the
-- schema-wide default grant that `auto_expose_new_tables` hands out (supabase/config.toml).
-- It fixed six of twenty-three. Measured against a live database immediately before this
-- migration:
--
--     17 tables in `public` still grant SELECT to BOTH `anon` and `authenticated`
--     — and they are the ONLY 17 tables `anon` holds any privilege on at all.
--
-- They split into two groups, and the split matters because the fix differs.
--
-- GROUP B — thirteen tables no client role has any business reading, ever. RLS on, ZERO
-- policies, and no REVOKE. `REVOKE ALL`, no grant, exactly as the cruise catalog and the
-- payment domain got:
--
--     agent, agent_availability, auth_event, client_invite, client_note, commission_import,
--     feature_flag, message_template, mfa_device, notification_preference, session,
--     supplier, trip_template
--
-- GROUP C — four tables that have a policy AND still carry the table-level grant. These are
-- REVOKE-then-column-GRANT, because a client legitimately reads most of them:
--
--     account, platform_user, address, travel_preference
--
-- Group C is the live half. `account.auth_provider_id` is named server-only by Data-Model
-- §21.2 and is granted to `authenticated` today, on a table that has a working self-select
-- policy — so unlike everything else here, it is readable right now by the account's owner
-- rather than merely one policy away. (`password_hash` is also granted and also server-only,
-- but it is always NULL: 20260902020243_auth_bridge.sql:58-60. Nothing leaks from it.)
--
-- ── WHY GROUP B IS NOT A LEAK, AND WHY IT IS STILL THE URGENT HALF ───────────────
--
-- Nothing leaks. RLS is enabled on all thirteen with zero policies, which fails closed.
--
-- It is a loaded gun rather than a fired one, and this is the change that reaches for it:
-- §3.2 needs to read `agent`, and the obvious first migration for an agent surface is an
-- `agent_self_select` policy. The moment one is added, every granted column on that table
-- opens at once. The same is true of the twelve beside it, and four of those are worse than
-- a disclosure:
--
--   * `mfa_device.secret_encrypted` — the TOTP seed. Data-Model §21.2 names it server-only.
--   * `client_invite.code_hash`     — the single-use credential behind the emailed connect
--                                     link. An authorization-bypass primitive, not a leak.
--   * `session.ip_address`          — plus user_agent and device_label, for every account.
--   * `auth_event`                  — login attempts and security events, IP-indexed.
--
-- And the ordering trap, restated because it is why this is a REVOKE and not something
-- narrower: `REVOKE SELECT (col)` is a NO-OP against a standing table-level grant
-- (20260905171542:29-32). The table privilege has to go first, whatever the read path turns
-- out to be.
--
-- ── SAFE IN THE STRONGEST SENSE, AND THAT WAS CHECKED RATHER THAN ASSUMED ────────
--
-- This migration only takes privilege away, so it cannot break a screen by widening
-- anything. The question is whether it breaks one by narrowing. It does not:
--
--   * GROUP B: exactly one shipped code path reads any of the thirteen —
--     supabase/functions/onboarding-connect/index.ts:226,304 reads `client_invite`, on
--     `onboardingDb()` → `serviceClient()` (_shared/onboarding.ts:101-103). A client-role
--     REVOKE cannot touch the service role. Nothing else in web/, mobile/ or
--     supabase/functions/ selects from any of them.
--   * GROUP C: every column any client-role path selects is re-granted below. The lists were
--     derived from the call sites, not from the doc — see the note on each grant.
--
-- ── WHAT THIS MIGRATION LOCKS IN THAT NO EARLIER ONE COULD ───────────────────────
--
-- `anon` has no policy anywhere in this schema, so it should hold no privilege anywhere
-- either. Those 17 tables were the last place it held a TABLE or COLUMN privilege, and
-- after this it holds neither — asserted at the bottom, and true for the first time since
-- 2026-05-14.
--
-- Say it that narrowly on purpose. The flat sentence "anon holds nothing in public" claims
-- more than the assertion below proves and more than is achievable at all.
-- `information_schema.column_privileges` carries four privilege types — SELECT, INSERT,
-- UPDATE, REFERENCES — and no function rows whatsoever, so a query over it is blind to
-- EXECUTE. And `citext` and `pg_trgm` were installed into `public` in 20260514120000, so
-- their functions are anon-executable and will stay that way for as long as they live
-- there. Functions are a second ledger: they get their own REVOKEs and their own
-- assertion, both below, and that assertion excludes extension-owned objects because that
-- is the only form of it that can ever pass.
--
-- The second assertion is the one that closes the class rather than the instance: nothing
-- outside the nineteen-table client read surface may hold a client-role privilege, table or
-- column. The next table somebody adds is the one it catches.
--
-- ── NO AGENT POLICY IS ADDED HERE, ON PURPOSE ────────────────────────────────────
--
-- An agent is also the Postgres role `authenticated`, so an `agent_self_select` policy would
-- be the wrong shape twice over: it would open the granted columns above, and it would not
-- solve the actual §3.x problem, which is that the client column REVOKEs bind agents too
-- (20260907031255:14-19). The agent read surface is SECURITY DEFINER accessors in the next
-- migration, which is the option 20260905171542:42-49 named first and left open.
--
-- Concretely, this leaves supabase/tests/rls_trip_graph.sql:361-377 — four assertions that
-- an agent sees zero rows through the client policies — green and unedited. An agent policy
-- would have turned them into failures somebody had to rewrite, which is a bad trade for
-- assertions that are currently telling the truth.

BEGIN;

-- ── GROUP B ──────────────────────────────────────────────────────────────────────

DO $$
DECLARE
    t text;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'agent', 'agent_availability', 'auth_event', 'client_invite', 'client_note',
        'commission_import', 'feature_flag', 'message_template', 'mfa_device',
        'notification_preference', 'session', 'supplier', 'trip_template'
    ]
    LOOP
        -- Already enabled on all thirteen; restated so the posture does not depend on the
        -- initial migration staying as it is. Same reasoning as 20260917090000:72-74.
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    END LOOP;
END $$;

-- ── GROUP C ──────────────────────────────────────────────────────────────────────
--
-- REVOKE first, then name the client-visible columns. Never restore the table grant: that is
-- what put these tables in this state.
--
-- `anon` gets no grant on any of the four. All four have a self-select policy predicated on
-- `auth.uid()`, which is NULL for anon, so it already read nothing — but a table-level SELECT
-- for a role that should never read the table is a privilege waiting for the first permissive
-- policy somebody adds (20260905171542:34-36).

REVOKE ALL ON public.account           FROM anon, authenticated;
REVOKE ALL ON public.platform_user     FROM anon, authenticated;
REVOKE ALL ON public.address           FROM anon, authenticated;
REVOKE ALL ON public.travel_preference FROM anon, authenticated;

-- account. Read by 2.5.7 Security (auth_provider, mfa_enrolled_at), 2.5.8 Connected accounts
-- (auth_provider) and 2.5.10 Close account (email). Everything else stays in on the
-- 20260905171542:25-28 rule — the account holder is the data subject — except three.
GRANT SELECT (
    id, email, email_verified_at, auth_provider, mfa_required, mfa_enrolled_at,
    locked_at, last_login_at, created_at, updated_at, archived_at
) ON public.account TO authenticated;

COMMENT ON COLUMN public.account.password_hash IS
    'Never populated — Supabase Auth owns credentials and handle_new_user() leaves this '
    'NULL. Kept for schema completeness. Deliberately outside the column grant to '
    '`authenticated`: Data-Model §21.2 names it server-only, and a column that is server-'
    'only by intent should be server-only by privilege even when it is empty.';

COMMENT ON COLUMN public.account.auth_provider_id IS
    'The provider''s own subject identifier. Deliberately outside the column grant to '
    '`authenticated` — Data-Model §21.2 names it server-only. Unlike the rest of that list '
    'this one was genuinely readable before the agent_domain_lockdown migration, because '
    '`account` has had a working self-select policy since the auth bridge.';

COMMENT ON COLUMN public.account.locked_reason IS
    'Why the agency locked the account. Deliberately outside the column grant to '
    '`authenticated`: `locked_at` is the account holder''s own fact and stays in, but the '
    'agency''s reasoning about them is internal, on the same footing as client.notes. '
    'Nothing reads it today; revisit if a screen needs to explain a lock to its owner.';

-- platform_user. Read by the onboarding gate (role, onboarding_step, onboarding_completed_at)
-- on both stacks, and by web/lib/trips/queries.ts (id, time_zone). Nothing here is
-- server-only: every column is the person's own account metadata.
GRANT SELECT (
    id, account_id, role, client_id, agent_id, display_name, avatar_url,
    time_zone, locale, onboarding_completed_at, onboarding_step, created_at, updated_at
) ON public.platform_user TO authenticated;

-- address. Read by 2.1.10 Profile and 2.5.2 Personal info, both selecting the six postal
-- columns and filtering on `id` — which needs its own grant, because a column referenced in
-- a WHERE clause needs SELECT privilege just as much as one in the target list.
GRANT SELECT (
    id, line1, line2, city, region, postal_code, country, created_at, updated_at
) ON public.address TO authenticated;

-- travel_preference. Read whole by 2.1.11 and 2.5.3 on web, and by `id` on mobile's
-- completion summary. All of it is the traveler's own answers.
GRANT SELECT (
    id, client_id, preferred_destinations, travel_styles, dietary_restrictions,
    dietary_notes, accessibility_needs, accessibility_notes, loyalty_programs,
    budget_band, favorite_past_trips, updated_at
) ON public.travel_preference TO authenticated;

-- ── THE OTHER LEDGER: FUNCTION EXECUTE ───────────────────────────────────────────
--
-- A function in `public` reaches `anon` by two independent routes, and closing one leaves
-- the other wide open:
--
--   1. PostgreSQL's own hard-wired default grants EXECUTE to PUBLIC on every function ever
--      created, and `anon` is a member of PUBLIC. It is the `=X/postgres` entry in `proacl`.
--   2. Supabase's `ALTER DEFAULT PRIVILEGES` for schema `public` names `anon`,
--      `authenticated` and `service_role`, so each new function also carries `anon=X`.
--
-- That is why every function REVOKE on this branch reads `FROM public, anon` and not one or
-- the other: the REVOKE beside `seed_pipeline_weights()` in the agent_pipeline_entities
-- migration, the one beside `current_agent_id()` and the accessor loop in the
-- agent_read_surface migration, and the one under `agent_set_trip_status(...)` in the
-- agent_trip_status_write migration all name both. (Cited by statement rather than by line —
-- several agents edit those files at once, and the last number written here had already
-- drifted onto a comment inside a function body.) Route 2 is closed
-- below for the role migrations run as, which is the role that creates every function in
-- this repo. It is NOT closed for `supabase_admin`, which carries a default ACL of its own
-- over `public` and which `postgres` is not a member of, so this migration cannot amend it.
-- Route 1 CANNOT be closed at all: the stored default ACL is merged on top of the
-- hard-wired one when the function is created, so an `ALTER DEFAULT PRIVILEGES ... REVOKE
-- EXECUTE ON FUNCTIONS FROM PUBLIC` leaves no trace in the created function's `proacl`.
-- Measured on the Supabase image, PostgreSQL 17.6: after that REVOKE a brand-new function
-- still carries `=X/postgres`, and `has_function_privilege('anon', …)` is still true.
--
-- So the per-function `REVOKE ... FROM public, anon` stays mandatory, and what makes the
-- invariant hold is not anybody remembering it — it is the assertion at the bottom, which
-- fails the migration.
--
-- Three trigger functions carried both routes into this migration: `handle_new_user()` and
-- `handle_user_email_confirmed()` (20260902020243, 20260903190707) and
-- `enforce_companion_cap()` (20260904132811). All three RETURN trigger, so no caller can
-- reach them — "trigger functions can only be called as triggers" — and nothing leaks
-- today. They are revoked anyway, because an assertion that is honest about EXECUTE names
-- them, and the answer to a true assertion is to fix the state rather than narrow the
-- assertion.
--
-- Revoking cannot stop the triggers. EXECUTE on a trigger function is checked when the
-- TRIGGER is created, not each time it fires — verified against the local stack: a BEFORE
-- INSERT trigger fires for `authenticated` while `has_function_privilege` on its function
-- is false. `authenticated` is in the list for the same reason 20260919130000:116 puts it
-- there; the invariant asserted below is only about `anon`.

ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon;

REVOKE EXECUTE ON FUNCTION public.handle_new_user()
    FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_user_email_confirmed()
    FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_companion_cap()
    FROM public, anon, authenticated;

-- ── ASSERTIONS ───────────────────────────────────────────────────────────────────

-- The instance: none of the seventeen grants anything to a client role any more, except the
-- four Group C column lists above.
DO $$
DECLARE
    leaked text;
BEGIN
    SELECT string_agg(DISTINCT table_name || ' (' || grantee || ')', ', ')
      INTO leaked
      FROM information_schema.role_table_grants
     WHERE table_schema = 'public'
       AND grantee IN ('anon', 'authenticated')
       AND table_name IN (
           'agent', 'agent_availability', 'auth_event', 'client_invite', 'client_note',
           'commission_import', 'feature_flag', 'message_template', 'mfa_device',
           'notification_preference', 'session', 'supplier', 'trip_template'
       );

    IF leaked IS NOT NULL THEN
        RAISE EXCEPTION
            'Agent-domain tables still grant privileges to a client role: %', leaked;
    END IF;
END $$;

-- The four sharp ones by name, because these are the reason the migration exists and they
-- should not depend on the loop above having listed them. Column grants are catalogued
-- separately from table grants and either alone is a hole (20260917090000:103-106).
DO $$
DECLARE
    leaked text;
BEGIN
    SELECT string_agg(DISTINCT table_name || '.' || column_name || ' (' || grantee || ')', ', ')
      INTO leaked
      FROM information_schema.column_privileges
     WHERE table_schema = 'public'
       AND grantee IN ('anon', 'authenticated')
       AND (
            (table_name = 'mfa_device'    AND column_name = 'secret_encrypted') OR
            (table_name = 'client_invite' AND column_name = 'code_hash')        OR
            (table_name = 'session'       AND column_name = 'ip_address')       OR
            (table_name = 'account'       AND column_name IN ('password_hash', 'auth_provider_id'))
       );

    IF leaked IS NOT NULL THEN
        RAISE EXCEPTION 'A server-only column is still granted to a client role: %', leaked;
    END IF;
END $$;

-- The class: nothing outside the client read surface may hold a client-role privilege. The
-- next table somebody adds is the one this catches, which is the whole point — the payment
-- domain sat in this state for four months because no assertion was looking.
DO $$
DECLARE
    unexpected text;
BEGIN
    WITH granted AS (
        SELECT table_name FROM information_schema.role_table_grants
         WHERE table_schema = 'public' AND grantee IN ('anon', 'authenticated')
        UNION
        SELECT table_name FROM information_schema.column_privileges
         WHERE table_schema = 'public' AND grantee IN ('anon', 'authenticated')
    )
    SELECT string_agg(DISTINCT table_name, ', ')
      INTO unexpected
      FROM granted
     WHERE table_name <> ALL (ARRAY[
        'account', 'address', 'client', 'companion', 'conversation', 'document',
        'itinerary', 'itinerary_activity', 'itinerary_day', 'message', 'message_attachment',
        'payment_milestone', 'platform_user', 'proposal', 'testimonial', 'travel_document',
        'travel_preference', 'trip', 'trip_component'
     ]);

    IF unexpected IS NOT NULL THEN
        RAISE EXCEPTION
            'Tables outside the client read surface grant to a client role: %. Add a REVOKE, '
            'or add the table to this allowlist deliberately.', unexpected;
    END IF;
END $$;

-- And the sharper half of the same idea, said in both ledgers because neither query can see
-- the other's. `anon` has no policy anywhere in this schema, so it should hold no privilege
-- anywhere. First the table one: those seventeen tables were the last place `anon` held a
-- column privilege.
DO $$
DECLARE
    leaked text;
BEGIN
    SELECT string_agg(DISTINCT table_name, ', ')
      INTO leaked
      FROM information_schema.column_privileges
     WHERE table_schema = 'public' AND grantee = 'anon';

    IF leaked IS NOT NULL THEN
        RAISE EXCEPTION
            'anon still holds column privileges in public on: %. anon has no policy in this '
            'schema and must hold nothing.', leaked;
    END IF;
END $$;

-- Then the function one, which the query above physically cannot make: column_privileges
-- has four privilege types and no function rows. Extension-owned functions are excluded via
-- pg_depend — 20260514120000 installed citext, pgcrypto, pg_trgm and uuid-ossp into
-- `public`, and that their functions are anon-executable is a fact about where they were
-- installed, not about this schema's posture.
DO $$
DECLARE
    leaked text;
BEGIN
    SELECT string_agg(p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
                      ', ' ORDER BY p.proname)
      INTO leaked
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND has_function_privilege('anon', p.oid, 'EXECUTE')
       AND NOT EXISTS (
            SELECT 1
              FROM pg_depend d
             WHERE d.classid = 'pg_proc'::regclass
               AND d.objid   = p.oid
               AND d.deptype = 'e'
           );

    IF leaked IS NOT NULL THEN
        RAISE EXCEPTION
            'anon can execute functions in public: %. Add REVOKE EXECUTE ON FUNCTION ... '
            'FROM public, anon — both grantees, one for each route named above.', leaked;
    END IF;
END $$;

COMMIT;
