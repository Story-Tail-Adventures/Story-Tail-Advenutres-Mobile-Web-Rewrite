-- Assertions for the §2.1 onboarding schema: the claim-an-existing-client trigger and the
-- self-read policies on travel_preference, companion, travel_document and address.
--
-- Companion file to rls_auth_bridge.sql, and it exists for the same reason: a policy that
-- passes the happy path and leaks to another user looks identical to a working one until
-- you execute it as that other user.
--
-- Run against a freshly reset local database:
--     supabase db reset
--     psql "$(supabase status -o json | jq -r .DB_URL)" -v ON_ERROR_STOP=1 \
--          -f supabase/tests/rls_onboarding.sql
--
-- Any failed assertion raises and, with ON_ERROR_STOP=1, exits non-zero.

\set ON_ERROR_STOP on

BEGIN;

-- Seeded ids, from supabase/seed.sql.
\set agent  '''0195a2c0-1a00-7000-8000-000000000001'''
\set jordan '''0195a2c0-1a00-7000-8000-000000000011'''
\set sam    '''0195a2c0-1a00-7000-8000-000000000012'''
\set jordan_address '''0195a2c0-1a00-7000-8000-000000000020'''

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

-- An INSERT with no INSERT policy raises 42501. So does reading a column the role has no
-- privilege on.
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

-- An UPDATE or DELETE with no matching policy does NOT raise — the rows are simply not
-- visible to it, so it silently affects nothing. Asserting the row count is the only way
-- to tell "denied" from "there was nothing to change".
CREATE OR REPLACE FUNCTION pg_temp.expect_no_rows(stmt text, description text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE n integer;
BEGIN
    EXECUTE stmt;
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n = 0 THEN
        RAISE NOTICE '  ok    %', description;
    ELSE
        RAISE EXCEPTION 'FAILED: % — % row(s) affected', description, n;
    END IF;
END;
$$;

-- Inserting an auth.users row the way GoTrue does at sign-up: UNCONFIRMED. The four empty
-- strings are the NULL-scan trap documented in seed.sql.
CREATE OR REPLACE FUNCTION pg_temp.signup(id uuid, email text, first_name text, last_name text)
RETURNS void LANGUAGE sql AS $$
    INSERT INTO auth.users (
        id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
        confirmation_token, recovery_token, email_change_token_new, email_change
    ) VALUES (
        id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        email, extensions.crypt('DevPassword!234', extensions.gen_salt('bf')), NULL,
        '{"provider":"email","providers":["email"]}'::jsonb,
        json_build_object('first_name', first_name, 'last_name', last_name)::jsonb,
        now(), now(), '', '', '', ''
    );
$$;

-- What GoTrue does when the emailed link is opened, and the ONLY thing that can adopt a
-- pre-created client. Splitting it from signup() is the point of these tests: the two used
-- to be one step, and the adoption happened before anyone proved they could read the mail.
CREATE OR REPLACE FUNCTION pg_temp.confirm_email(id uuid)
RETURNS void LANGUAGE sql AS $$
    UPDATE auth.users SET email_confirmed_at = now() WHERE auth.users.id = confirm_email.id;
$$;

CREATE OR REPLACE FUNCTION pg_temp.client_id_of(account uuid)
RETURNS uuid LANGUAGE sql AS $$
    SELECT client_id FROM public.platform_user WHERE account_id = account;
$$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- handle_new_user(): claiming a pre-created client
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── Exactly one unclaimed match: the sign-up adopts it ─────────────────────────
--
-- This is the case Screen 2.1.13 promises — "we'll find them automatically by email".

INSERT INTO public.client (id, agent_id, first_name, last_name, email, phone)
VALUES ('0195a2c0-1a00-7000-8000-0000000000a1', :agent,
        'Priya', 'Raghunathan', 'precreated@example.com', '+1-555-0170');

SELECT pg_temp.signup(
    '0195a2c0-1a00-7000-8000-0000000000b1',
    'precreated@example.com',
    -- Deliberately a different spelling from what the agent typed.
    'priya', 'raghu');

-- ── Before the address is proved, NOTHING is adopted ──
--
-- This is the property the whole split exists for. Knowing somebody's email address is not
-- evidence of anything: sign-up alone must not hand over their name, phone or trips, and
-- must not consume the record so the rightful owner arrives to find it already taken.
SELECT pg_temp.assert(
    (SELECT count(*) FROM public.client WHERE email = 'precreated@example.com') = 2,
    'an unconfirmed signup gets its OWN blank client, adopting nothing');
SELECT pg_temp.assert(
    (SELECT count(*) FROM public.platform_user pu
      WHERE pu.client_id = '0195a2c0-1a00-7000-8000-0000000000a1') = 0,
    'the pre-created client is still unclaimed, waiting for its real owner');
SELECT pg_temp.assert(
    pg_temp.client_id_of('0195a2c0-1a00-7000-8000-0000000000b1')
      <> '0195a2c0-1a00-7000-8000-0000000000a1',
    'the unconfirmed account cannot see the pre-created record');

-- ── Opening the emailed link is what adopts it ──
SELECT pg_temp.confirm_email('0195a2c0-1a00-7000-8000-0000000000b1');

SELECT pg_temp.assert(
    (SELECT count(*) FROM public.client WHERE email = 'precreated@example.com') = 1,
    'signup claims the pre-created client instead of duplicating it');
SELECT pg_temp.assert(
    pg_temp.client_id_of('0195a2c0-1a00-7000-8000-0000000000b1')
      = '0195a2c0-1a00-7000-8000-0000000000a1',
    'the confirmed account points at the pre-created client row');
SELECT pg_temp.assert(
    (SELECT display_name FROM public.platform_user
      WHERE account_id = '0195a2c0-1a00-7000-8000-0000000000b1') = 'Priya Raghunathan',
    'the display name follows the agent''s spelling, not the sign-up form''s');
SELECT pg_temp.assert(
    (SELECT first_name || ' ' || last_name FROM public.client
      WHERE id = '0195a2c0-1a00-7000-8000-0000000000a1') = 'Priya Raghunathan',
    'the claim does not overwrite the agent''s spelling of the name');
SELECT pg_temp.assert(
    (SELECT phone FROM public.client
      WHERE id = '0195a2c0-1a00-7000-8000-0000000000a1') = '+1-555-0170',
    'the claim preserves the detail the agent had already entered');

-- ── Two unclaimed matches: ambiguous, so create a fresh row rather than guess ───
--
-- Duplicate client rows with one email are a real state — Screen 3.9.7 exists to merge
-- them. Picking arbitrarily would show one traveler another's trips.

INSERT INTO public.client (id, agent_id, first_name, last_name, email) VALUES
    ('0195a2c0-1a00-7000-8000-0000000000a2', :agent, 'Dana', 'Okafor',  'ambiguous@example.com'),
    ('0195a2c0-1a00-7000-8000-0000000000a3', :agent, 'Dana', 'Okafor-B','ambiguous@example.com');

SELECT pg_temp.signup(
    '0195a2c0-1a00-7000-8000-0000000000b2',
    'ambiguous@example.com', 'Dana', 'Okafor');
SELECT pg_temp.confirm_email('0195a2c0-1a00-7000-8000-0000000000b2');

SELECT pg_temp.assert(
    (SELECT count(*) FROM public.client WHERE email = 'ambiguous@example.com') = 3,
    'two candidates is ambiguous, so the signup keeps its own row');
SELECT pg_temp.assert(
    pg_temp.client_id_of('0195a2c0-1a00-7000-8000-0000000000b2')
      NOT IN ('0195a2c0-1a00-7000-8000-0000000000a2',
              '0195a2c0-1a00-7000-8000-0000000000a3'),
    'the ambiguous signup adopted neither candidate');

-- ── An already-claimed row is not a candidate ──────────────────────────────────
--
-- Two rows share this email, but one is already bound to an account, so exactly one is
-- unclaimed and the sign-up must adopt that one. Without the NOT EXISTS check this would
-- read as ambiguous and create a third row.
--
-- Sam's platform_user is repointed to stage that "already claimed" state; Sam's own client
-- row is archived in the seed, so it cannot become a candidate for anything.

INSERT INTO public.client (id, agent_id, first_name, last_name, email) VALUES
    ('0195a2c0-1a00-7000-8000-0000000000a4', :agent, 'Theo', 'Marchetti', 'oneleft@example.com'),
    ('0195a2c0-1a00-7000-8000-0000000000a5', :agent, 'Theo', 'Marchetti', 'oneleft@example.com');

UPDATE public.platform_user
   SET client_id = '0195a2c0-1a00-7000-8000-0000000000a4'
 WHERE account_id = :sam;

SELECT pg_temp.signup(
    '0195a2c0-1a00-7000-8000-0000000000b3',
    'oneleft@example.com', 'Theo', 'Marchetti');
SELECT pg_temp.confirm_email('0195a2c0-1a00-7000-8000-0000000000b3');

SELECT pg_temp.assert(
    (SELECT count(*) FROM public.client WHERE email = 'oneleft@example.com') = 2,
    'a claimed duplicate is skipped, so the one unclaimed row is adopted');
SELECT pg_temp.assert(
    pg_temp.client_id_of('0195a2c0-1a00-7000-8000-0000000000b3')
      = '0195a2c0-1a00-7000-8000-0000000000a5',
    'the sign-up adopted the unclaimed row, not the claimed one');

-- ── An archived row is not a candidate ─────────────────────────────────────────

INSERT INTO public.client (id, agent_id, first_name, last_name, email, status, archived_at)
VALUES ('0195a2c0-1a00-7000-8000-0000000000a6', :agent,
        'Nils', 'Bergstrom', 'archived@example.com', 'archived', now());

SELECT pg_temp.signup(
    '0195a2c0-1a00-7000-8000-0000000000b4',
    'archived@example.com', 'Nils', 'Bergstrom');
SELECT pg_temp.confirm_email('0195a2c0-1a00-7000-8000-0000000000b4');

SELECT pg_temp.assert(
    (SELECT count(*) FROM public.client WHERE email = 'archived@example.com') = 2,
    'an archived client is not adopted — a fresh row is created');

-- ── A brand-new email still provisions from scratch ────────────────────────────

SELECT pg_temp.signup(
    '0195a2c0-1a00-7000-8000-0000000000b5',
    'brandnew@example.com', 'Wren', 'Abasi');
SELECT pg_temp.confirm_email('0195a2c0-1a00-7000-8000-0000000000b5');

SELECT pg_temp.assert(
    (SELECT count(*) FROM public.client WHERE email = 'brandnew@example.com') = 1,
    'an unrecognised email provisions a new client, as before');
SELECT pg_temp.assert(
    (SELECT agent_id FROM public.client WHERE email = 'brandnew@example.com') = :agent,
    'the new client is owned by the sole active agent');
SELECT pg_temp.assert(
    (SELECT onboarding_completed_at FROM public.platform_user
      WHERE account_id = '0195a2c0-1a00-7000-8000-0000000000b5') IS NULL,
    'a new account starts with onboarding incomplete, so it routes to 2.1.9');

-- ═══════════════════════════════════════════════════════════════════════════════
-- handle_new_user(): the name a social sign-in actually sends
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- `signInWithOAuth` has no options.data, so no OAuth path can send first_name/last_name.
-- Supabase fills raw_user_meta_data from the provider's OIDC claims instead. Before
-- 20260903221802 every Google and Apple sign-up therefore became "New Traveler" — in the
-- greeting, in Gyasi's CRM, and on the trip.

CREATE OR REPLACE FUNCTION pg_temp.oauth_signup(id uuid, email text, meta jsonb, provider text)
RETURNS void LANGUAGE sql AS $$
    INSERT INTO auth.users (
        id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
        confirmation_token, recovery_token, email_change_token_new, email_change
    ) VALUES (
        id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        email, '', now(),
        json_build_object('provider', provider, 'providers', json_build_array(provider))::jsonb,
        meta, now(), now(), '', '', '', ''
    );
$$;

CREATE OR REPLACE FUNCTION pg_temp.name_of(p_email text)
RETURNS text LANGUAGE sql AS $$
    SELECT c.first_name || ' ' || c.last_name FROM public.client c WHERE c.email = p_email;
$$;

-- Google, and Apple's first authorization: the standard OIDC claims.
SELECT pg_temp.oauth_signup('0195a2c0-1a00-7000-8000-0000000000f1', 'google@example.com',
    '{"sub":"1","name":"Wren Abasi","given_name":"Wren","family_name":"Abasi"}'::jsonb, 'google');
SELECT pg_temp.assert(
    pg_temp.name_of('google@example.com') = 'Wren Abasi',
    'a social sign-in takes its name from given_name/family_name');

-- A provider that sends only a display name.
SELECT pg_temp.oauth_signup('0195a2c0-1a00-7000-8000-0000000000f3', 'display@example.com',
    '{"sub":"3","full_name":"Priya Raghunathan"}'::jsonb, 'google');
SELECT pg_temp.assert(
    pg_temp.name_of('display@example.com') = 'Priya Raghunathan',
    'a display name is split on the first space');

-- A mononym must not have the given name repeated back as a surname.
SELECT pg_temp.oauth_signup('0195a2c0-1a00-7000-8000-0000000000f4', 'mono@example.com',
    '{"sub":"4","name":"Prince"}'::jsonb, 'google');
SELECT pg_temp.assert(
    pg_temp.name_of('mono@example.com') = 'Prince Traveler',
    'a one-word name keeps the placeholder surname rather than repeating itself');

-- Apple on a REPEAT authorization sends no name claims at all, so the placeholder has to
-- stay reachable however good the branches above it are.
SELECT pg_temp.oauth_signup('0195a2c0-1a00-7000-8000-0000000000f2', 'apple@example.com',
    '{"sub":"2","email":"apple@example.com"}'::jsonb, 'apple');
SELECT pg_temp.assert(
    pg_temp.name_of('apple@example.com') = 'New Traveler',
    'with no name claims at all the placeholder still applies');
SELECT pg_temp.assert(
    (SELECT auth_provider FROM public.account WHERE email = 'apple@example.com')::text = 'apple',
    'the provider is recorded on the account');

-- Our own sign-up form is unaffected by any of it.
SELECT pg_temp.oauth_signup('0195a2c0-1a00-7000-8000-0000000000f5', 'ourform@example.com',
    '{"first_name":"Jordan","last_name":"Hayes"}'::jsonb, 'email');
SELECT pg_temp.assert(
    pg_temp.name_of('ourform@example.com') = 'Jordan Hayes',
    'first_name/last_name still win when the form sent them');

-- ═══════════════════════════════════════════════════════════════════════════════
-- Self-read policies
-- ═══════════════════════════════════════════════════════════════════════════════

-- Give Jordan the onboarding rows the wizard would have written. The seed already gives
-- Jordan a mailing address.
INSERT INTO public.travel_preference (id, client_id, preferred_destinations, travel_styles)
SELECT '0195a2c0-1a00-7000-8000-0000000000c1', pu.client_id,
       ARRAY['Caribbean'], ARRAY['resort']
  FROM public.platform_user pu WHERE pu.account_id = :jordan;

INSERT INTO public.companion (id, client_id, first_name, last_name, relationship,
                              passport_number_encrypted)
SELECT '0195a2c0-1a00-7000-8000-0000000000c2', pu.client_id,
       'Alex', 'Hayes', 'Spouse', '\xdeadbeef'::bytea
  FROM public.platform_user pu WHERE pu.account_id = :jordan;

INSERT INTO public.travel_document (id, client_id, kind, expires_on, issuing_country,
                                    document_number_encrypted)
SELECT '0195a2c0-1a00-7000-8000-0000000000c3', pu.client_id,
       'passport', '2031-08-01', 'US', '\xdeadbeef'::bytea
  FROM public.platform_user pu WHERE pu.account_id = :jordan;

-- A second client's rows, to prove the policies actually scope.
INSERT INTO public.travel_preference (id, client_id, travel_styles)
VALUES ('0195a2c0-1a00-7000-8000-0000000000c4',
        '0195a2c0-1a00-7000-8000-0000000000a1', ARRAY['cruise']);
INSERT INTO public.companion (id, client_id, first_name, last_name)
VALUES ('0195a2c0-1a00-7000-8000-0000000000c5',
        '0195a2c0-1a00-7000-8000-0000000000a1', 'Ravi', 'Raghunathan');

-- ── Jordan reads their own rows and nobody else's ──────────────────────────────
SELECT pg_temp.become(:jordan);

SELECT pg_temp.assert(
    (SELECT count(*) FROM public.travel_preference) = 1,
    'client sees exactly their own travel_preference row');
SELECT pg_temp.assert(
    (SELECT travel_styles FROM public.travel_preference) = ARRAY['resort'],
    'client sees THEIR preference, not the other client''s');
SELECT pg_temp.assert(
    (SELECT count(*) FROM public.companion) = 1,
    'client sees exactly their own companion');
SELECT pg_temp.assert(
    (SELECT first_name FROM public.companion) = 'Alex',
    'client sees their own companion, not the other client''s');
SELECT pg_temp.assert(
    (SELECT count(*) FROM public.travel_document) = 1,
    'client sees their own travel_document');
SELECT pg_temp.assert(
    (SELECT count(*) FROM public.address) = 1,
    'client sees exactly one address — their own mailing address');
SELECT pg_temp.assert(
    (SELECT city FROM public.address) = 'Chicago',
    'client sees their own address row');
SELECT pg_temp.assert(
    (SELECT count(*) FROM public.client_invite) = 0,
    'client_invite is invisible — redemption is service-role only');

-- ── The ciphertext columns are unreadable, by privilege not by policy ──────────
SELECT pg_temp.expect_denied(
    'SELECT document_number_encrypted FROM public.travel_document',
    'client cannot read travel_document.document_number_encrypted');
SELECT pg_temp.expect_denied(
    'SELECT passport_number_encrypted FROM public.companion',
    'client cannot read companion.passport_number_encrypted');
SELECT pg_temp.assert(
    (SELECT expires_on FROM public.travel_document) = '2031-08-01'::date,
    'the non-sensitive travel_document columns are still readable');

-- ── Every write is denied: they go through an audited Edge Function ───────────
SELECT pg_temp.expect_denied(
    $$INSERT INTO public.travel_preference (id, client_id, travel_styles)
      VALUES ('0195a2c0-1a00-7000-8000-0000000000d1',
              (SELECT client_id FROM public.current_platform_user()), ARRAY['cruise'])$$,
    'client cannot INSERT their own travel_preference');
SELECT pg_temp.expect_denied(
    $$INSERT INTO public.companion (id, client_id, first_name, last_name)
      VALUES ('0195a2c0-1a00-7000-8000-0000000000d2',
              (SELECT client_id FROM public.current_platform_user()), 'Mallory', 'X')$$,
    'client cannot INSERT a companion');
SELECT pg_temp.expect_denied(
    $$INSERT INTO public.travel_document (id, client_id, kind)
      VALUES ('0195a2c0-1a00-7000-8000-0000000000d3',
              (SELECT client_id FROM public.current_platform_user()), 'passport')$$,
    'client cannot INSERT a travel_document');
SELECT pg_temp.expect_denied(
    $$INSERT INTO public.client_invite (id, client_id, code_hash, issued_by_user_id, expires_at)
      VALUES ('0195a2c0-1a00-7000-8000-0000000000d4',
              (SELECT client_id FROM public.current_platform_user()), 'x',
              (SELECT id FROM public.current_platform_user()), now() + interval '1 day')$$,
    'client cannot mint themselves an invite');

SELECT pg_temp.expect_no_rows(
    $$UPDATE public.travel_preference SET budget_band = 'luxury'$$,
    'client cannot UPDATE their travel_preference');
SELECT pg_temp.expect_no_rows(
    $$UPDATE public.client SET phone = '+1-555-9999'$$,
    'client cannot UPDATE their own client row — rule 3 sends it through audit');
SELECT pg_temp.expect_no_rows(
    $$UPDATE public.platform_user SET role = 'agent'$$,
    'client cannot escalate their own role');
SELECT pg_temp.expect_no_rows(
    $$UPDATE public.platform_user SET onboarding_completed_at = now()$$,
    'client cannot mark their own onboarding complete');
SELECT pg_temp.expect_no_rows(
    $$DELETE FROM public.companion$$,
    'client cannot DELETE a companion');

RESET ROLE;

-- ── The other client sees none of Jordan's rows ────────────────────────────────
SELECT pg_temp.become('0195a2c0-1a00-7000-8000-0000000000b1');

SELECT pg_temp.assert(
    (SELECT count(*) FROM public.travel_preference) = 1,
    'the other client sees exactly one travel_preference — their own');
SELECT pg_temp.assert(
    (SELECT travel_styles FROM public.travel_preference) = ARRAY['cruise'],
    'the other client sees THEIR preference, not Jordan''s');
SELECT pg_temp.assert(
    (SELECT first_name FROM public.companion) = 'Ravi',
    'the other client sees their own companion only');
SELECT pg_temp.assert(
    (SELECT count(*) FROM public.travel_document) = 0,
    'the other client sees none of Jordan''s travel documents');
SELECT pg_temp.assert(
    (SELECT count(*) FROM public.address) = 0,
    'the other client sees none of Jordan''s addresses');

RESET ROLE;

-- ── trip: their own, and not the agent's half of it ────────────────────────────
--
-- Added with 20260904140753 for Screen 2.1.13's "trips we already have for you" panel.
-- `trip` had RLS on and no policy at all, so this used to return nothing and look like a
-- traveler had no trips rather than like a missing policy.
SELECT pg_temp.become(:jordan);

SELECT pg_temp.assert(
    (SELECT count(*) FROM public.trip) >= 1,
    'client sees their own trip');
SELECT pg_temp.assert(
    (SELECT count(*) FROM public.trip t
       JOIN public.platform_user pu ON pu.account_id = :jordan
      WHERE t.client_id <> pu.client_id) = 0,
    'client sees no trip belonging to anybody else');

-- The policy decides rows; the grant decides columns. Without the second, `notes` — where
-- the agent writes what he thinks — comes back with the rest of the row.
SELECT pg_temp.expect_denied(
    'SELECT notes FROM public.trip',
    'client is refused trip.notes, the agent''s own notes');
SELECT pg_temp.expect_denied(
    'SELECT total_commission_cents FROM public.trip',
    'client is refused trip.total_commission_cents, which is not their number');

-- ── Anonymous ──────────────────────────────────────────────────────────────────
SET LOCAL ROLE anon;

SELECT pg_temp.assert(
    (SELECT count(*) FROM public.travel_preference) = 0, 'anon sees no preferences');
SELECT pg_temp.assert(
    (SELECT count(*) FROM public.address) = 0, 'anon sees no addresses');
SELECT pg_temp.assert(
    (SELECT count(*) FROM public.client_invite) = 0, 'anon sees no invites');
SELECT pg_temp.expect_denied(
    'SELECT count(*) FROM public.trip',
    'anon is refused trip outright, before RLS is consulted');

-- companion and travel_document are stronger than empty for anon: taking table-level
-- SELECT away to make the ciphertext columns unreadable was only re-granted to
-- `authenticated`, so the pre-login role is refused at the privilege layer and never
-- reaches a policy at all. Nothing public reads either table.
SELECT pg_temp.expect_denied(
    'SELECT count(*) FROM public.companion',
    'anon is refused companion outright, before RLS is consulted');
SELECT pg_temp.expect_denied(
    'SELECT count(*) FROM public.travel_document',
    'anon is refused travel_document outright, before RLS is consulted');

RESET ROLE;

ROLLBACK;
