-- §3.9 Login Support, PR 1 — Screens 3.9.1 to 3.9.6: sign-in recording, the account admin
-- snapshot, and the writes behind its buttons.
--
-- WHAT THIS FILE IS GUARDING.
--
--   1. Every new auth.sessions row is one login_success auth_event (with its IP and user agent,
--      either of which may be null) and moves account.last_login_at. A refresh records nothing.
--   2. The tab's read answers only the client's own advisor, and only once the session is aal2.
--      Before that it says needsMfa and nothing about the account.
--   3. A duplicate email is reported (with the id only when it is the same advisor's record).
--   4. Sign-in emails are capped at 3 per client per hour, counted from their audit rows.
--   5. Lock sets locked_at + reason and ends every session; unlock clears both; a reason is
--      required; another advisor's client is untouched.
--   6. Sign out everywhere ends sessions without locking.
--   7. Flag marks only this client's own sign-in, is idempotent, and clears.
--   8. No client role can execute a write or read auth_event / auth_event_flag.
--
-- Run against a freshly reset local database:
--     supabase db reset
--     psql "$(supabase status -o json | jq -r .DB_URL)" -v ON_ERROR_STOP=1 \
--          -f supabase/tests/rls_login_support.sql

\set ON_ERROR_STOP on

BEGIN;

\set gyasi      '''0195a2c0-1a00-7000-8000-000000000010'''
\set jordan     '''0195a2c0-1a00-7000-8000-000000000011'''
\set agent      '''0195a2c0-1a00-7000-8000-000000000001'''
\set b_agent    '''0c39a000-0000-7000-8000-000000000001'''
\set b_account  '''0c39a000-0000-7000-8000-000000000002'''
\set n_client   '''0c39a000-0000-7000-8000-000000000004'''
\set d_client   '''0c39a000-0000-7000-8000-000000000005'''
\set x_client   '''0c39a000-0000-7000-8000-000000000006'''
\set s1         '''0c39a000-0000-7000-8000-0000000000a1'''
\set s2         '''0c39a000-0000-7000-8000-0000000000a2'''
\set s3         '''0c39a000-0000-7000-8000-0000000000a3'''

CREATE OR REPLACE FUNCTION pg_temp.assert(condition boolean, description text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    IF condition THEN RAISE NOTICE '  ok    %', description;
    ELSE RAISE EXCEPTION 'FAILED: %', description;
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.expect_denied(stmt text, description text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    EXECUTE stmt;
    RAISE EXCEPTION 'FAILED: % — statement succeeded, expected a privilege error', description;
EXCEPTION
    WHEN insufficient_privilege THEN RAISE NOTICE '  ok    %', description;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.expect_error(stmt text, state text, description text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    EXECUTE stmt;
    RAISE EXCEPTION 'FAILED: % — statement succeeded, expected SQLSTATE %', description, state;
EXCEPTION
    WHEN OTHERS THEN
        IF SQLERRM LIKE 'FAILED:%' THEN RAISE; END IF;
        IF SQLSTATE <> state THEN
            RAISE EXCEPTION 'FAILED: % — expected SQLSTATE %, got % (%)', description, state, SQLSTATE, SQLERRM;
        END IF;
        RAISE NOTICE '  ok    %', description;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.become(account uuid, aal text DEFAULT 'aal2')
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    PERFORM set_config('role', 'authenticated', true);
    PERFORM set_config('request.jwt.claims',
        json_build_object('sub', account::text, 'role', 'authenticated', 'aal', aal)::text, true);
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 0. Fixtures: a second advisor B, Gyasi's client N with no sign-in, a same-email duplicate D
--    of Jordan in Gyasi's book, and one X in B's book.
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.agent (id, display_name, email, status, time_zone)
VALUES (:b_agent::uuid, 'Login Test Advisor', 'login.advisor@example.com', 'active', 'America/New_York');

INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change)
VALUES
    (:b_account::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'login.advisor.signin@example.com', 'x', now(),
     '{"provider":"email","providers":["email"]}'::jsonb,
     '{"first_name":"Login","last_name":"Advisor","agent_id":"0195a2c0-1a00-7000-8000-000000000001"}'::jsonb,
     now(), now(), '', '', '', '');

DO $$
DECLARE v_client_id uuid;
BEGIN
    SELECT client_id INTO v_client_id FROM public.platform_user
     WHERE account_id = '0c39a000-0000-7000-8000-000000000002';
    UPDATE public.platform_user
       SET role = 'agent', agent_id = '0c39a000-0000-7000-8000-000000000001', client_id = NULL
     WHERE account_id = '0c39a000-0000-7000-8000-000000000002';
    DELETE FROM public.client WHERE id = v_client_id;
END $$;

SELECT pu.id AS a_actor FROM public.platform_user pu WHERE pu.account_id = :gyasi::uuid \gset
SELECT pu.id AS b_actor FROM public.platform_user pu WHERE pu.account_id = :b_account::uuid \gset
SELECT pu.client_id AS j_client FROM public.platform_user pu WHERE pu.account_id = :jordan::uuid \gset
SELECT c.email::text AS j_email FROM public.client c WHERE c.id = :'j_client'::uuid \gset
\set a_actor  '''':a_actor''''
\set b_actor  '''':b_actor''''
\set j_client '''':j_client''''
\set j_email  '''':j_email''''

INSERT INTO public.client (id, agent_id, first_name, last_name, email, status)
VALUES (:n_client::uuid, :agent::uuid, 'Nora', 'NoLogin', 'nora.nologin@example.com', 'active');

-- Clean slate for Jordan's sessions and sign-in history, so counts below are literals.
DELETE FROM auth.sessions WHERE user_id = :jordan::uuid;
DELETE FROM public.auth_event WHERE account_id = :jordan::uuid;
UPDATE public.account SET last_login_at = NULL WHERE id = :jordan::uuid;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Recording sign-ins
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO auth.sessions (id, user_id, created_at, updated_at, user_agent, ip)
VALUES (:s1::uuid, :jordan::uuid, now() - interval '2 hours', now() - interval '2 hours',
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/605.1', '99.244.18.4');
INSERT INTO auth.sessions (id, user_id, created_at, updated_at, user_agent, ip)
VALUES (:s2::uuid, :jordan::uuid, now() - interval '1 hour', now() - interval '1 hour', NULL, NULL);

SELECT pg_temp.assert(
    (SELECT count(*) FROM public.auth_event
      WHERE account_id = :jordan::uuid AND event_type = 'login_success' AND result = 'success') = 2,
    'two sessions are two login_success rows');
SELECT pg_temp.assert(
    (SELECT host(ip_address) FROM public.auth_event
      WHERE account_id = :jordan::uuid AND user_agent LIKE '%iPhone%') = '99.244.18.4',
    'the session IP is recorded');
SELECT pg_temp.assert(
    EXISTS (SELECT 1 FROM public.auth_event
             WHERE account_id = :jordan::uuid AND ip_address IS NULL AND user_agent IS NULL),
    'a session with no IP or user agent is still recorded, with nulls');
SELECT pg_temp.assert(
    (SELECT last_login_at FROM public.account WHERE id = :jordan::uuid)
      = now() - interval '1 hour',
    'last_login_at is the newest session''s start');

UPDATE auth.sessions SET refreshed_at = (now() AT TIME ZONE 'UTC'), updated_at = now()
 WHERE id = :s1::uuid;
SELECT pg_temp.assert(
    (SELECT count(*) FROM public.auth_event WHERE account_id = :jordan::uuid) = 2,
    'a refresh (UPDATE) records nothing');

-- An older session arriving late never moves last_login_at backwards.
INSERT INTO auth.sessions (id, user_id, created_at, updated_at, user_agent, ip)
VALUES (:s3::uuid, :jordan::uuid, now() - interval '5 hours', now() - interval '5 hours',
        'Mozilla/5.0 (Macintosh) Chrome/130', '24.117.220.5');
SELECT pg_temp.assert(
    (SELECT last_login_at FROM public.account WHERE id = :jordan::uuid)
      = now() - interval '1 hour',
    'last_login_at never moves backwards');

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. The tab's read
-- ─────────────────────────────────────────────────────────────────────────────

-- Since 20261023120000_agent_mfa_required.sql an aal1 agent has no agent identity at all
-- (current_agent_id() is NULL), so the read answers NULL before its own needsMfa branch is
-- reached. That branch stays as a second lock; rls_agent_mfa.sql covers the global gate.
SELECT pg_temp.become(:gyasi::uuid, 'aal1');
SELECT pg_temp.assert(
    public.agent_client_account_admin(:j_client::uuid) IS NULL,
    'aal1: nothing at all, not even the gate shape');

SELECT pg_temp.become(:gyasi::uuid, 'aal2');
SELECT public.agent_client_account_admin(:j_client::uuid) AS snap \gset
RESET ROLE;
SELECT pg_temp.assert((:'snap'::jsonb ->> 'needsMfa')::boolean = false, 'aal2: needsMfa false');
SELECT pg_temp.assert((:'snap'::jsonb ->> 'hasSignIn')::boolean, 'Jordan has a sign-in');
SELECT pg_temp.assert(jsonb_array_length(:'snap'::jsonb -> 'sessions') = 3, 'three live sessions');
SELECT pg_temp.assert(jsonb_array_length(:'snap'::jsonb -> 'activity') = 3, 'three sign-ins in activity');
SELECT pg_temp.assert(
    (:'snap'::jsonb -> 'activity' -> 0 ->> 'ip') IS NULL
    AND (:'snap'::jsonb -> 'activity' -> 1 ->> 'ip') = '99.244.18.4',
    'activity is newest first (the null-IP session was newest)');
SELECT pg_temp.assert((:'snap'::jsonb ->> 'duplicateEmail')::boolean = false, 'no duplicate yet');
SELECT pg_temp.assert((:'snap'::jsonb ->> 'signInEmailsLastHour')::int = 0, 'no sends yet');

SELECT pg_temp.become(:b_account::uuid, 'aal2');
SELECT pg_temp.assert(public.agent_client_account_admin(:j_client::uuid) IS NULL,
    'another advisor reads NULL for Jordan');
SELECT pg_temp.become(:jordan::uuid, 'aal2');
SELECT pg_temp.assert(public.agent_client_account_admin(:j_client::uuid) IS NULL,
    'the client themself reads NULL');
RESET ROLE;

SELECT pg_temp.assert(
    (public.account_admin_target(:agent::uuid, :n_client::uuid) ->> 'hasSignIn')::boolean = false
    AND NOT public.account_admin_target(:agent::uuid, :n_client::uuid) ? 'sessions',
    'a client with no sign-in: hasSignIn false and no account fields');

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Duplicate email
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.client (id, agent_id, first_name, last_name, email, status)
VALUES (:x_client::uuid, :b_agent::uuid, 'Jordan', 'Elsewhere', :j_email, 'active');
SELECT pg_temp.assert(
    (public.account_admin_target(:agent::uuid, :j_client::uuid) ->> 'duplicateEmail')::boolean
    AND public.account_admin_target(:agent::uuid, :j_client::uuid) -> 'duplicateEmailClientId' = 'null'::jsonb,
    'another advisor''s duplicate: true, with no id');

INSERT INTO public.client (id, agent_id, first_name, last_name, email, status)
VALUES (:d_client::uuid, :agent::uuid, 'Jordan', 'Dupe', :j_email, 'active');
SELECT pg_temp.assert(
    (public.account_admin_target(:agent::uuid, :j_client::uuid) ->> 'duplicateEmailClientId')::uuid = :d_client::uuid,
    'own duplicate: its id');

UPDATE public.client SET status = 'merged_into', merged_into_client_id = :j_client::uuid
 WHERE id IN (:d_client::uuid, :x_client::uuid);
SELECT pg_temp.assert(
    (public.account_admin_target(:agent::uuid, :j_client::uuid) ->> 'duplicateEmail')::boolean = false,
    'merged-away records are not duplicates');
SELECT pg_temp.assert(public.account_admin_target(:agent::uuid, :d_client::uuid) IS NULL,
    'a merged-away record has no account admin');

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. The sign-in email cap
-- ─────────────────────────────────────────────────────────────────────────────

SELECT pg_temp.assert(public.account_admin_claim_signin_email(
    :agent::uuid, :a_actor::uuid, public.uuid_v7(), :j_client::uuid, 'reset') = 'claimed', 'send 1 claimed');
SELECT pg_temp.assert(public.account_admin_claim_signin_email(
    :agent::uuid, :a_actor::uuid, public.uuid_v7(), :j_client::uuid, 'magic_link') = 'claimed', 'send 2 claimed');
SELECT pg_temp.assert(public.account_admin_claim_signin_email(
    :agent::uuid, :a_actor::uuid, public.uuid_v7(), :j_client::uuid, 'reset') = 'claimed', 'send 3 claimed');
SELECT pg_temp.assert(public.account_admin_claim_signin_email(
    :agent::uuid, :a_actor::uuid, public.uuid_v7(), :j_client::uuid, 'magic_link') = 'capped', 'send 4 capped');
SELECT pg_temp.assert(
    (SELECT count(*) FROM public.audit_event
      WHERE target_id = :j_client::uuid AND event_type = 'client.signin_email_requested') = 3,
    'three audit rows, none for the capped send');
SELECT pg_temp.assert(
    NOT EXISTS (SELECT 1 FROM public.audit_event
                 WHERE target_id = :j_client::uuid AND event_type = 'client.signin_email_requested'
                   AND metadata - 'kind' <> '{}'::jsonb),
    'the audit row holds only the kind');
SELECT pg_temp.assert(
    (public.account_admin_target(:agent::uuid, :j_client::uuid) ->> 'signInEmailsLastHour')::int = 3,
    'the snapshot counts them');

UPDATE public.audit_event SET created_at = now() - interval '61 minutes'
 WHERE target_id = :j_client::uuid AND event_type = 'client.signin_email_requested';
SELECT pg_temp.assert(public.account_admin_claim_signin_email(
    :agent::uuid, :a_actor::uuid, public.uuid_v7(), :j_client::uuid, 'reset') = 'claimed',
    'an hour later the cap has room');

SELECT pg_temp.assert(public.account_admin_claim_signin_email(
    :b_agent::uuid, :b_actor::uuid, public.uuid_v7(), :j_client::uuid, 'reset') = 'not_found',
    'another advisor cannot claim for Jordan');
SELECT pg_temp.expect_error(format(
    'SELECT public.account_admin_claim_signin_email(%L, %L, public.uuid_v7(), %L, %L)',
    :agent, :a_actor, :j_client, 'password'), '22023', 'an unknown kind is refused');
SELECT pg_temp.expect_error(format(
    'SELECT public.account_admin_claim_signin_email(%L, NULL, public.uuid_v7(), %L, %L)',
    :agent, :n_client, 'invite'), 'P0001', 'no actor, no claim (the audit is mandatory)');

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Lock / unlock
-- ─────────────────────────────────────────────────────────────────────────────

SELECT pg_temp.expect_error(format(
    'SELECT public.account_admin_set_lock(%L, %L, public.uuid_v7(), %L, true, %L)',
    :agent, :a_actor, :j_client, '   '), '22023', 'a blank reason is refused');
SELECT pg_temp.assert(public.account_admin_set_lock(
    :b_agent::uuid, :b_actor::uuid, public.uuid_v7(), :j_client::uuid, true, 'not mine') IS NULL,
    'another advisor cannot lock Jordan');
SELECT pg_temp.assert(public.account_admin_set_lock(
    :agent::uuid, :a_actor::uuid, public.uuid_v7(), :n_client::uuid, true, 'no login') IS NULL,
    'a client with no sign-in cannot be locked');
SELECT pg_temp.assert(
    (SELECT locked_at FROM public.account WHERE id = :jordan::uuid) IS NULL
    AND (SELECT count(*) FROM auth.sessions WHERE user_id = :jordan::uuid) = 3,
    'refused locks changed nothing');

SELECT pg_temp.assert((public.account_admin_set_lock(
    :agent::uuid, :a_actor::uuid, public.uuid_v7(), :j_client::uuid, true,
    '  Sign-in from a device she does not own  ') ->> 'sessionsEnded')::int = 3,
    'lock ends all three sessions');
SELECT pg_temp.assert(
    (SELECT locked_at IS NOT NULL AND locked_reason = 'Sign-in from a device she does not own'
       FROM public.account WHERE id = :jordan::uuid),
    'lock sets locked_at and the trimmed reason');
SELECT pg_temp.assert((SELECT count(*) FROM auth.sessions WHERE user_id = :jordan::uuid) = 0,
    'no sessions remain');
SELECT pg_temp.assert(
    (SELECT metadata ->> 'reason' FROM public.audit_event
      WHERE target_id = :j_client::uuid AND event_type = 'client.account_locked')
      = 'Sign-in from a device she does not own',
    'the lock is audited with its reason');

SELECT pg_temp.assert((public.account_admin_set_lock(
    :agent::uuid, :a_actor::uuid, public.uuid_v7(), :j_client::uuid, false, 'Confirmed by phone')
    ->> 'sessionsEnded')::int = 0, 'unlock ends nothing');
SELECT pg_temp.assert(
    (SELECT locked_at IS NULL AND locked_reason IS NULL FROM public.account WHERE id = :jordan::uuid),
    'unlock clears locked_at and the reason');
SELECT pg_temp.assert(
    EXISTS (SELECT 1 FROM public.audit_event
             WHERE target_id = :j_client::uuid AND event_type = 'client.account_unlocked'
               AND (metadata ->> 'wasLocked')::boolean),
    'the unlock is audited');

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Sign out everywhere
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO auth.sessions (id, user_id, created_at, updated_at, user_agent, ip)
VALUES (public.uuid_v7(), :jordan::uuid, now(), now(), 'Mozilla/5.0 (Android 15) Chrome/130', '24.117.220.5'),
       (public.uuid_v7(), :jordan::uuid, now(), now(), 'Mozilla/5.0 (Macintosh) Safari/605.1', '99.244.18.4');

SELECT pg_temp.assert(public.account_admin_sign_out_everywhere(
    :b_agent::uuid, :b_actor::uuid, public.uuid_v7(), :j_client::uuid) IS NULL,
    'another advisor cannot sign Jordan out');
SELECT pg_temp.assert(public.account_admin_sign_out_everywhere(
    :agent::uuid, :a_actor::uuid, public.uuid_v7(), :j_client::uuid) = 2, 'two sessions ended');
SELECT pg_temp.assert(
    (SELECT count(*) FROM auth.sessions WHERE user_id = :jordan::uuid) = 0
    AND (SELECT locked_at FROM public.account WHERE id = :jordan::uuid) IS NULL,
    'signed out, and not locked');

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Flag
-- ─────────────────────────────────────────────────────────────────────────────

SELECT e.id AS ev FROM public.auth_event e
 WHERE e.account_id = :jordan::uuid AND host(e.ip_address) = '24.117.220.5'
 ORDER BY e.created_at LIMIT 1 \gset
\set ev '''':ev''''

SELECT pg_temp.assert(public.account_admin_set_flag(
    :agent::uuid, :a_actor::uuid, public.uuid_v7(), :j_client::uuid, :ev::uuid, true) = 'changed', 'flag');
SELECT pg_temp.assert(public.account_admin_set_flag(
    :agent::uuid, :a_actor::uuid, public.uuid_v7(), :j_client::uuid, :ev::uuid, true) = 'noop', 'flag again is a no-op');
SELECT pg_temp.assert(
    (SELECT count(*) FROM public.audit_event
      WHERE target_id = :j_client::uuid AND event_type = 'client.signin_flagged') = 1,
    'one audit row for one change');
SELECT pg_temp.assert(
    (SELECT bool_or((a ->> 'flagged')::boolean AND a ->> 'id' = :ev)
       FROM jsonb_array_elements(public.account_admin_target(:agent::uuid, :j_client::uuid) -> 'activity') a),
    'the activity shows it flagged');
SELECT pg_temp.assert(
    (SELECT locked_at FROM public.account WHERE id = :jordan::uuid) IS NULL,
    'a flag locks nothing');
SELECT pg_temp.assert(public.account_admin_set_flag(
    :agent::uuid, :a_actor::uuid, public.uuid_v7(), :n_client::uuid, :ev::uuid, true) = 'not_found',
    'another client''s sign-in cannot be flagged through Nora');
SELECT pg_temp.assert(public.account_admin_set_flag(
    :b_agent::uuid, :b_actor::uuid, public.uuid_v7(), :j_client::uuid, :ev::uuid, false) = 'not_found',
    'another advisor cannot unflag it');
SELECT pg_temp.assert(public.account_admin_set_flag(
    :agent::uuid, :a_actor::uuid, public.uuid_v7(), :j_client::uuid, :ev::uuid, false) = 'changed', 'unflag');
SELECT pg_temp.assert(NOT EXISTS (SELECT 1 FROM public.auth_event_flag WHERE auth_event_id = :ev::uuid),
    'the flag row is gone');

-- ─────────────────────────────────────────────────────────────────────────────
-- 7b. The invite binds to the invited client, and acceptance does not re-adopt
-- ─────────────────────────────────────────────────────────────────────────────

\set nora_acct  '''0c39a000-0000-7000-8000-0000000000e1'''
\set dup2       '''0c39a000-0000-7000-8000-0000000000e2'''

-- What generateLink(type: invite) does: an unconfirmed auth user, which handle_new_user()
-- gives a fresh blank client of the advisor named in the metadata.
INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password, invited_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change)
VALUES
    (:nora_acct::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'nora.nologin@example.com', '', now(),
     '{"provider":"email","providers":["email"]}'::jsonb,
     '{"first_name":"Nora","last_name":"NoLogin","agent_id":"0195a2c0-1a00-7000-8000-000000000001"}'::jsonb,
     now(), now(), '', '', '', '');

SELECT pu.client_id AS fresh FROM public.platform_user pu WHERE pu.account_id = :nora_acct::uuid \gset
\set fresh '''':fresh''''
SELECT pg_temp.assert(:fresh::uuid <> :n_client::uuid, 'the invite first lands on a blank client');

SELECT pg_temp.assert(public.account_admin_bind_invite(
    :b_agent::uuid, :b_actor::uuid, public.uuid_v7(), :n_client::uuid, :nora_acct::uuid) = 'not_found',
    'another advisor cannot bind it');
SELECT pg_temp.assert(public.account_admin_bind_invite(
    :agent::uuid, :a_actor::uuid, public.uuid_v7(), :n_client::uuid, :jordan::uuid) = 'conflict',
    'a sign-in with a different email is refused');
-- Pre-hijack: the same unconfirmed user, but with a password set by whoever signed it up.
UPDATE auth.users SET encrypted_password = 'attacker-set' WHERE id = :nora_acct::uuid;
SELECT pg_temp.assert(public.account_admin_bind_invite(
    :agent::uuid, :a_actor::uuid, public.uuid_v7(), :n_client::uuid, :nora_acct::uuid) = 'conflict',
    'a sign-up someone else made (it has a password) is never bound to the record');
UPDATE auth.users SET encrypted_password = '' WHERE id = :nora_acct::uuid;

-- The record's address in mixed case still matches GoTrue's lowercased one.
UPDATE public.client SET email = 'Nora.NoLogin@Example.com' WHERE id = :n_client::uuid;
SELECT pg_temp.assert(public.account_admin_bind_invite(
    :agent::uuid, :a_actor::uuid, public.uuid_v7(), :n_client::uuid, :nora_acct::uuid) = 'bound',
    'bind (mixed-case record email)');
SELECT pg_temp.assert(
    (SELECT client_id FROM public.platform_user WHERE account_id = :nora_acct::uuid) = :n_client::uuid,
    'the sign-in now points at the invited client');
SELECT pg_temp.assert(NOT EXISTS (SELECT 1 FROM public.client WHERE id = :fresh::uuid),
    'the blank client is gone from the roster');
SELECT pg_temp.assert(
    (SELECT raw_app_meta_data ->> 'invited_client_id' FROM auth.users WHERE id = :nora_acct::uuid) = :n_client,
    'the auth user carries the invite marker');
SELECT pg_temp.assert(
    EXISTS (SELECT 1 FROM public.audit_event WHERE target_id = :n_client::uuid AND event_type = 'client.invited'),
    'the invite is audited');
SELECT pg_temp.assert(public.account_admin_bind_invite(
    :agent::uuid, :a_actor::uuid, public.uuid_v7(), :n_client::uuid, :nora_acct::uuid) = 'already',
    'a resend finds it already bound');
SELECT pg_temp.assert(
    (public.account_admin_target(:agent::uuid, :n_client::uuid) ->> 'hasSignIn')::boolean
    AND public.account_admin_target(:agent::uuid, :n_client::uuid) ->> 'invitedAt' IS NOT NULL
    AND public.account_admin_target(:agent::uuid, :n_client::uuid) -> 'emailVerifiedAt' = 'null'::jsonb,
    'the tab sees a pending invite');

-- A same-email record made before she accepts must NOT be adopted on acceptance.
INSERT INTO public.client (id, agent_id, first_name, last_name, email, status)
VALUES (:dup2::uuid, :agent::uuid, 'Nora', 'Second', 'nora.nologin@example.com', 'active');
UPDATE auth.users SET email_confirmed_at = now() WHERE id = :nora_acct::uuid;
SELECT pg_temp.assert(
    (SELECT client_id FROM public.platform_user WHERE account_id = :nora_acct::uuid) = :n_client::uuid
    AND (SELECT status FROM public.client WHERE id = :n_client::uuid) = 'active',
    'accepting keeps the invited client; the newer duplicate is not adopted');

SELECT pg_temp.assert(public.account_admin_bind_invite(
    :agent::uuid, :a_actor::uuid, public.uuid_v7(), :dup2::uuid, :nora_acct::uuid) = 'conflict',
    'a confirmed sign-in cannot be re-bound to another record');

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. Grants
-- ─────────────────────────────────────────────────────────────────────────────

SELECT pg_temp.become(:gyasi::uuid, 'aal2');
SELECT pg_temp.expect_denied(format(
    'SELECT public.account_admin_target(%L, %L)', :agent, :j_client),
    'an advisor cannot call the service-role snapshot directly');
SELECT pg_temp.expect_denied(format(
    'SELECT public.account_admin_set_lock(%L, %L, public.uuid_v7(), %L, true, %L)',
    :agent, :a_actor, :j_client, 'x'), 'an advisor cannot call lock directly');
SELECT pg_temp.expect_denied(format(
    'SELECT public.account_admin_claim_signin_email(%L, %L, public.uuid_v7(), %L, %L)',
    :agent, :a_actor, :j_client, 'reset'), 'an advisor cannot claim a send directly');
SELECT pg_temp.expect_denied('SELECT 1 FROM public.auth_event_flag', 'auth_event_flag is unreadable');
SELECT pg_temp.expect_denied('SELECT 1 FROM public.auth_event', 'auth_event is unreadable');
RESET ROLE;

SET LOCAL ROLE anon;
SELECT pg_temp.expect_denied(format(
    'SELECT public.agent_client_account_admin(%L)', :j_client), 'anon cannot read the tab');
RESET ROLE;

ROLLBACK;
