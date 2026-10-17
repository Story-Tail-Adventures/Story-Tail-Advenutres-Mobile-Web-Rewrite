-- §3.9 Login Support, PR 2 — merging duplicate client records (Screens 3.9.7 / 3.3.11).
--
-- WHAT THIS FILE IS GUARDING.
--
--   1. Everything attached to the retired record moves to the kept one: trips (and so their
--      commission), conversations, notes, companions (both links), travel documents,
--      testimonials and invites. The retired record is merged_into, pointing at the kept one,
--      and still exists.
--   2. The two general threads become one: the messages move in, in time order; the emptied
--      thread is closed; the advisor's unread count carries over; no email is queued.
--   3. Fields: the kept value by default, the retired one when the kept one is empty, a flip
--      when asked; the email is pinned to the surviving sign-in.
--   4. Sign-ins: one on the retired record moves; one on each locks the retired one
--      ("Merged into <name>", sessions ended), and only when the Edge Function says it banned
--      that same account.
--   5. Refusals: a stale version, another advisor's record, an unknown field, a kept record
--      that is archived, more than 12 companions.
--   6. The audit row holds every value from before and every moved id.
--   7. The page's read is aal2-gated and answers only the record's own advisor; no client role
--      can run the write.
--
-- Uses the seed's Maya Carter (5 trips, 4 commission rows, no sign-in) and Jordan Hayes (signed
-- in). Run against a freshly reset local database:
--     supabase db reset
--     psql "$(supabase status -o json | jq -r .DB_URL)" -v ON_ERROR_STOP=1 \
--          -f supabase/tests/rls_client_merge.sql

\set ON_ERROR_STOP on

BEGIN;

\set gyasi      '''0195a2c0-1a00-7000-8000-000000000010'''
\set jordan     '''0195a2c0-1a00-7000-8000-000000000011'''
\set agent      '''0195a2c0-1a00-7000-8000-000000000001'''
\set maya       '''0195a2c0-1a00-7000-8000-000000000013'''
\set b_agent    '''0c39b000-0000-7000-8000-000000000001'''
\set k_client   '''0c39b000-0000-7000-8000-000000000010'''
\set k2_client  '''0c39b000-0000-7000-8000-000000000011'''
\set x_client   '''0c39b000-0000-7000-8000-000000000012'''
\set r3_account '''0c39b000-0000-7000-8000-000000000020'''
\set k_thread   '''0c39b000-0000-7000-8000-000000000030'''
\set m_thread   '''0c39b000-0000-7000-8000-000000000031'''
\set m_trip_th  '''0c39b000-0000-7000-8000-000000000032'''
\set r3_session '''0c39b000-0000-7000-8000-000000000040'''
\set audit1     '''0c39b000-0000-7000-8000-0000000000a1'''
\set audit2     '''0c39b000-0000-7000-8000-0000000000a2'''
\set audit3     '''0c39b000-0000-7000-8000-0000000000a3'''

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

CREATE OR REPLACE FUNCTION pg_temp.become(account uuid, aal text DEFAULT 'aal1')
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    PERFORM set_config('role', 'authenticated', true);
    PERFORM set_config('request.jwt.claims',
        json_build_object('sub', account::text, 'role', 'authenticated', 'aal', aal)::text, true);
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 0. Fixtures
--
-- K: a newer "Maya Carter-Reyes" with the same email, a different phone, no date of birth,
--    a general thread with two messages, and a preference row.
-- Maya (the seed's): 5 trips + commission. Given here a general thread with two messages
--    (one the advisor has not read, one waiting as an email to... nobody, she has no sign-in),
--    a trip thread, a note, two companions (one of them IS K), a travel document and a
--    preference row.
-- X: another advisor's client.
-- ─────────────────────────────────────────────────────────────────────────────

SELECT pu.id AS a_actor FROM public.platform_user pu WHERE pu.account_id = :gyasi::uuid \gset
\set a_actor '''':a_actor''''

INSERT INTO public.agent (id, display_name, email, status, time_zone)
VALUES (:b_agent::uuid, 'Merge Test Advisor', 'merge.advisor@example.com', 'active', 'America/Chicago');

INSERT INTO public.client (id, agent_id, first_name, last_name, email, phone, tags, created_at)
VALUES (:k_client::uuid, :agent::uuid, 'Maya', 'Carter-Reyes', 'maya.carter@example.com',
        '305-555-0100', '{VIP}', now() - interval '10 days');
INSERT INTO public.client (id, agent_id, first_name, last_name, email)
VALUES (:x_client::uuid, :b_agent::uuid, 'Xavier', 'Elsewhere', 'xavier@example.com');

UPDATE public.client SET phone = '305-555-0199', date_of_birth = '1988-04-02', tags = '{Cruise}'
 WHERE id = :maya::uuid;

INSERT INTO public.travel_preference (id, client_id, dietary_restrictions)
VALUES (public.uuid_v7(), :k_client::uuid, '{vegetarian}');
DELETE FROM public.travel_preference WHERE client_id = :maya::uuid;
INSERT INTO public.travel_preference (id, client_id, preferred_destinations, dietary_restrictions, budget_band)
VALUES (public.uuid_v7(), :maya::uuid, '{Lisbon,Porto}', '{pescatarian}', 'premium');

-- Gyasi has a phone, so raising an unread count would queue a push.
INSERT INTO public.push_device (id, platform_user_id, platform, fcm_token)
VALUES (public.uuid_v7(), :a_actor::uuid, 'android', 'merge-test-token');

-- Threads. Times interleave so "in time order" is something the test can see.
INSERT INTO public.conversation (id, client_id, agent_id, trip_id, last_message_at, last_message_preview,
                                 agent_unread_count, client_unread_count)
VALUES (:k_thread::uuid, :k_client::uuid, :agent::uuid, NULL, now() - interval '1 day', 'K two', 0, 0),
       (:m_thread::uuid, :maya::uuid, :agent::uuid, NULL, now() - interval '2 hours', 'M two', 1, 1);
INSERT INTO public.conversation (id, client_id, agent_id, trip_id, last_message_at)
VALUES (:m_trip_th::uuid, :maya::uuid, :agent::uuid, '0195a2c0-1a00-7000-8000-000000000048', now() - interval '3 days');

INSERT INTO public.message (id, conversation_id, sender_user_id, sender_role, body, created_at) VALUES
    (public.uuid_v7(), :k_thread::uuid, :a_actor::uuid, 'agent', 'K one', now() - interval '5 days'),
    (public.uuid_v7(), :m_thread::uuid, :a_actor::uuid, 'agent', 'M one', now() - interval '4 days'),
    (public.uuid_v7(), :k_thread::uuid, :a_actor::uuid, 'agent', 'K two', now() - interval '1 day'),
    (public.uuid_v7(), :m_thread::uuid, :a_actor::uuid, 'agent', 'M two', now() - interval '2 hours');

INSERT INTO public.client_note (id, client_id, author_user_id, body)
VALUES (public.uuid_v7(), :maya::uuid, :a_actor::uuid, 'Prefers aisle seats.');
INSERT INTO public.companion (id, client_id, first_name, last_name, relationship, linked_client_id)
VALUES (public.uuid_v7(), :maya::uuid, 'Theo', 'Carter', 'Son', NULL),
       (public.uuid_v7(), :maya::uuid, 'Maya', 'Carter-Reyes', 'Self', :k_client::uuid);
INSERT INTO public.travel_document (id, client_id, kind)
VALUES (public.uuid_v7(), :maya::uuid, (enum_range(NULL::public.travel_doc_kind))[1]);

SELECT count(*) AS m_commissions FROM public.commission cm JOIN public.trip t ON t.id = cm.trip_id
 WHERE t.client_id = :maya::uuid \gset
SELECT version AS k_version FROM public.client WHERE id = :k_client::uuid \gset
SELECT version AS m_version FROM public.client WHERE id = :maya::uuid \gset

SELECT pg_temp.assert(:m_commissions::int > 0, 'fixture: Maya''s trips carry commission rows');

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. The preview
-- ─────────────────────────────────────────────────────────────────────────────

SELECT public.client_merge_preview(:agent::uuid, :k_client::uuid, :maya::uuid) AS pv \gset

SELECT pg_temp.assert((:'pv'::jsonb #>> '{retire,counts,trips}')::int = 5, 'preview counts Maya''s 5 trips');
SELECT pg_temp.assert((:'pv'::jsonb #>> '{retire,counts,conversations}')::int = 2, 'preview counts 2 conversations');
SELECT pg_temp.assert(:'pv'::jsonb ->> 'signInPlan' = 'none', 'no sign-ins: plan is none');
SELECT pg_temp.assert(:'pv'::jsonb ->> 'blocked' IS NULL, 'nothing blocks this merge');
SELECT pg_temp.assert(
    (SELECT f ->> 'default' FROM jsonb_array_elements(:'pv'::jsonb -> 'fields') f WHERE f ->> 'field' = 'phone') = 'keep',
    'phone defaults to the kept value');
SELECT pg_temp.assert(
    (SELECT f ->> 'default' FROM jsonb_array_elements(:'pv'::jsonb -> 'fields') f WHERE f ->> 'field' = 'date_of_birth') = 'retire',
    'an empty kept date of birth falls back to the retired one');
SELECT pg_temp.assert(
    (SELECT f ->> 'default' FROM jsonb_array_elements(:'pv'::jsonb -> 'fields') f WHERE f ->> 'field' = 'budget_band') = 'retire',
    'preference fields follow the same rule');

SELECT pg_temp.assert(public.client_merge_preview(:agent::uuid, :k_client::uuid, :x_client::uuid) IS NULL,
    'another advisor''s record cannot be previewed');
SELECT pg_temp.assert(public.client_merge_preview(:agent::uuid, :k_client::uuid, :k_client::uuid) IS NULL,
    'a record cannot be merged with itself');

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Refusals that change nothing
-- ─────────────────────────────────────────────────────────────────────────────

SELECT pg_temp.assert(
    public.account_admin_merge_clients(:agent::uuid, :a_actor::uuid, public.uuid_v7(), :k_client::uuid, :maya::uuid,
        :k_version::int - 1, :m_version::int, '{}'::jsonb, NULL) ->> 'outcome' = 'stale',
    'a stale kept version is refused');
SELECT pg_temp.assert(
    public.account_admin_merge_clients(:b_agent::uuid, :a_actor::uuid, public.uuid_v7(), :k_client::uuid, :maya::uuid,
        :k_version::int, :m_version::int, '{}'::jsonb, NULL) ->> 'outcome' = 'not_found',
    'another advisor cannot merge Gyasi''s records');
SELECT pg_temp.expect_error(
    format('SELECT public.account_admin_merge_clients(%L, %L, public.uuid_v7(), %L, %L, %s, %s, %L, NULL)',
           :agent, :a_actor, :k_client, :maya, :k_version, :m_version, '{"lifetime_value_cents":"retire"}'),
    '22023', 'a field the picker does not offer is refused');
SELECT pg_temp.expect_error(
    format('SELECT public.account_admin_merge_clients(%L, %L, public.uuid_v7(), %L, %L, %s, %s, %L, NULL)',
           :agent, :a_actor, :k_client, :maya, :k_version, :m_version, '{"phone":"both"}'),
    '22023', 'a choice other than keep or retire is refused');

-- Archived kept record.
UPDATE public.client SET archived_at = now() WHERE id = :k_client::uuid;
SELECT pg_temp.assert(
    public.account_admin_merge_clients(:agent::uuid, :a_actor::uuid, public.uuid_v7(), :k_client::uuid, :maya::uuid,
        :k_version::int, :m_version::int, '{}'::jsonb, NULL) ->> 'reason' = 'kept_archived',
    'merging into an archived record is refused');
UPDATE public.client SET archived_at = NULL WHERE id = :k_client::uuid;

-- The companion cap: K gets 11 more, so 1 (Theo) + 11 = 12 is fine and one more is not.
INSERT INTO public.companion (id, client_id, first_name, last_name)
SELECT public.uuid_v7(), :k_client::uuid, 'Cap', 'Fill ' || g FROM generate_series(1, 12) g;
SELECT pg_temp.assert(
    public.account_admin_merge_clients(:agent::uuid, :a_actor::uuid, public.uuid_v7(), :k_client::uuid, :maya::uuid,
        :k_version::int, :m_version::int, '{}'::jsonb, NULL) ->> 'reason' = 'companion_cap',
    'a merge past 12 companions is refused');
DELETE FROM public.companion WHERE client_id = :k_client::uuid AND first_name = 'Cap';

SELECT pg_temp.assert(
    (SELECT count(*) FROM public.trip WHERE client_id = :maya::uuid) = 5
    AND (SELECT status FROM public.client WHERE id = :maya::uuid) = 'active'
    AND NOT EXISTS (SELECT 1 FROM public.audit_event WHERE event_type = 'client.merged'),
    'the refusals moved nothing and wrote no merge audit row');

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. The merge (no sign-ins). Phone flipped to the retired value.
-- ─────────────────────────────────────────────────────────────────────────────

SELECT public.account_admin_merge_clients(:agent::uuid, :a_actor::uuid, :audit1::uuid, :k_client::uuid, :maya::uuid,
           :k_version::int, :m_version::int, '{"phone":"retire"}'::jsonb, NULL, '203.0.113.9', 'test') AS r1 \gset

SELECT pg_temp.assert(:'r1'::jsonb ->> 'outcome' = 'merged', 'merge succeeds');
SELECT pg_temp.assert((:'r1'::jsonb #>> '{counts,trips}')::int = 5, 'result reports 5 trips moved');

SELECT pg_temp.assert(
    (SELECT status = 'merged_into' AND merged_into_client_id = :k_client::uuid FROM public.client WHERE id = :maya::uuid),
    'the retired record is merged_into the kept one');
SELECT pg_temp.assert(EXISTS (SELECT 1 FROM public.client WHERE id = :maya::uuid), 'the retired record still exists');

SELECT pg_temp.assert((SELECT count(*) FROM public.trip WHERE client_id = :k_client::uuid) = 5
                      AND NOT EXISTS (SELECT 1 FROM public.trip WHERE client_id = :maya::uuid),
    'all 5 trips moved');
SELECT pg_temp.assert(
    (SELECT count(*) FROM public.commission cm JOIN public.trip t ON t.id = cm.trip_id
      WHERE t.client_id = :k_client::uuid) = :m_commissions::int,
    'commission rode along with the trips');
SELECT pg_temp.assert(NOT EXISTS (SELECT 1 FROM public.conversation WHERE client_id = :maya::uuid),
    'no conversation is left on the retired record');
SELECT pg_temp.assert(
    (SELECT client_id FROM public.conversation WHERE id = :m_trip_th::uuid) = :k_client::uuid,
    'the trip thread moved');
SELECT pg_temp.assert(
    (SELECT count(*) FROM public.conversation
      WHERE client_id = :k_client::uuid AND trip_id IS NULL AND archived_at IS NULL) = 1,
    'exactly one live general thread');
SELECT pg_temp.assert(
    (SELECT string_agg(body, ',' ORDER BY created_at) FROM public.message WHERE conversation_id = :k_thread::uuid)
        = 'K one,M one,K two,M two',
    'the messages are in the kept thread, in time order');
SELECT pg_temp.assert(
    (SELECT archived_at IS NOT NULL FROM public.conversation WHERE id = :m_thread::uuid)
    AND NOT EXISTS (SELECT 1 FROM public.message WHERE conversation_id = :m_thread::uuid),
    'the retired thread is closed and empty');
SELECT pg_temp.assert(
    (SELECT agent_unread_count = 1 AND client_unread_count = 0 AND last_message_preview = 'M two'
       FROM public.conversation WHERE id = :k_thread::uuid),
    'the advisor''s unread count carries over; the client''s is not raised; preview is the newest');
SELECT pg_temp.assert(
    NOT EXISTS (SELECT 1 FROM public.push_outbox o
                 WHERE o.conversation_id IN (:k_thread::uuid, :m_thread::uuid) AND o.state = 'pending'),
    'the merge queues no push for messages the advisor was already told about');
SELECT pg_temp.assert(
    NOT EXISTS (SELECT 1 FROM public.email_outbox o
                 WHERE o.conversation_id IN (:k_thread::uuid, :m_thread::uuid) AND o.state = 'pending'),
    'no email to the client is queued');

SELECT pg_temp.assert((SELECT count(*) FROM public.client_note WHERE client_id = :k_client::uuid) = 1, 'the note moved');
SELECT pg_temp.assert((SELECT count(*) FROM public.travel_document WHERE client_id = :k_client::uuid) = 1, 'the travel document moved');
SELECT pg_temp.assert(
    (SELECT count(*) FROM public.companion WHERE client_id = :k_client::uuid AND archived_at IS NULL) = 1
    AND (SELECT archived_at IS NOT NULL FROM public.companion WHERE linked_client_id = :k_client::uuid),
    'Theo moved; the companion that was K itself is closed');

SELECT pg_temp.assert(
    (SELECT phone = '305-555-0199' AND last_name = 'Carter-Reyes' AND date_of_birth = '1988-04-02'
            AND tags = '{VIP}' AND version = :k_version::int + 1
       FROM public.client WHERE id = :k_client::uuid),
    'fields: the flip, the kept default, the fallback, and a version bump');
SELECT pg_temp.assert(
    (SELECT dietary_restrictions = '{vegetarian}' AND preferred_destinations = '{Lisbon,Porto}' AND budget_band = 'premium'
       FROM public.travel_preference WHERE client_id = :k_client::uuid),
    'preference: kept value kept, empty ones filled from the retired row');
SELECT pg_temp.assert(EXISTS (SELECT 1 FROM public.travel_preference WHERE client_id = :maya::uuid),
    'the retired preference row stays on the retired record');

SELECT pg_temp.assert(
    (SELECT metadata #>> '{before,retired,phone}' = '305-555-0199'
            AND metadata #>> '{before,kept,phone}' = '305-555-0100'
            AND jsonb_array_length(metadata #> '{moved,trips}') = 5
            AND metadata #>> '{before,retiredPreference,budget_band}' = 'premium'
            AND (metadata ->> 'messagesMoved')::int = 2
            AND target_id = :k_client::uuid AND ip_address = '203.0.113.9'
       FROM public.audit_event WHERE id = :audit1::uuid AND event_type = 'client.merged'),
    'the audit row holds the before-values and every moved id');
SELECT pg_temp.assert(
    EXISTS (SELECT 1 FROM public.audit_event WHERE event_type = 'client.merged_away' AND target_id = :maya::uuid
              AND metadata ->> 'mergeAuditId' = :audit1),
    'the retired record''s history says where it went');

SELECT pg_temp.assert(
    public.account_admin_merge_clients(:agent::uuid, :a_actor::uuid, public.uuid_v7(), :k_client::uuid, :maya::uuid,
        :k_version::int + 1, :m_version::int + 1, '{}'::jsonb, NULL) ->> 'outcome' = 'not_found',
    'a merged record cannot be merged again');

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Only the retired record has a sign-in: it moves, and the email is pinned to it.
-- ─────────────────────────────────────────────────────────────────────────────

SELECT pu.client_id AS j_client FROM public.platform_user pu WHERE pu.account_id = :jordan::uuid \gset
\set j_client '''':j_client''''
SELECT u.email AS j_email FROM auth.users u WHERE u.id = :jordan::uuid \gset

INSERT INTO public.client (id, agent_id, first_name, last_name, email)
VALUES (:k2_client::uuid, :agent::uuid, 'Jordan', 'Hayes', 'jordan.old@example.com');

SELECT public.client_merge_preview(:agent::uuid, :k2_client::uuid, :j_client::uuid) AS pv2 \gset
SELECT pg_temp.assert(:'pv2'::jsonb ->> 'signInPlan' = 'move', 'only the retired record signs in: plan is move');
SELECT pg_temp.assert(
    (SELECT (f ->> 'pinned')::boolean FROM jsonb_array_elements(:'pv2'::jsonb -> 'fields') f WHERE f ->> 'field' = 'email'),
    'the email row is pinned');

SELECT public.account_admin_merge_clients(:agent::uuid, :a_actor::uuid, :audit2::uuid, :k2_client::uuid, :j_client::uuid,
           1, (SELECT version FROM public.client WHERE id = :j_client::uuid),
           '{"email":"keep"}'::jsonb, NULL) AS r2 \gset
SELECT pg_temp.assert(:'r2'::jsonb ->> 'outcome' = 'merged', 'sign-in move merge succeeds');
SELECT pg_temp.assert(
    (SELECT client_id FROM public.platform_user WHERE account_id = :jordan::uuid) = :k2_client::uuid,
    'Jordan''s sign-in now points at the kept record');
SELECT pg_temp.assert(
    (SELECT email::text FROM public.client WHERE id = :k2_client::uuid) = :'j_email',
    'the email is the sign-in''s, whatever the choice said');
SELECT pg_temp.assert(
    (SELECT locked_at IS NULL FROM public.account WHERE id = :jordan::uuid), 'a moved sign-in is not locked');

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Both records have a sign-in: the retired one is locked.
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change)
VALUES
    (:r3_account::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'jordan.second@example.com', 'x', now(),
     '{"provider":"email","providers":["email"]}'::jsonb,
     '{"first_name":"Jordan","last_name":"H","agent_id":"0195a2c0-1a00-7000-8000-000000000001"}'::jsonb,
     now(), now(), '', '', '', '');
SELECT pu.client_id AS r3_client FROM public.platform_user pu WHERE pu.account_id = :r3_account::uuid \gset
\set r3_client '''':r3_client''''
INSERT INTO auth.sessions (id, user_id, created_at, updated_at) VALUES (:r3_session::uuid, :r3_account::uuid, now(), now());

SELECT pg_temp.assert(
    public.client_merge_preview(:agent::uuid, :k2_client::uuid, :r3_client::uuid) ->> 'signInPlan' = 'lock_retired',
    'both sign in: plan is lock the retired one');

SELECT pg_temp.assert(
    public.account_admin_merge_clients(:agent::uuid, :a_actor::uuid, public.uuid_v7(), :k2_client::uuid, :r3_client::uuid,
        (SELECT version FROM public.client WHERE id = :k2_client::uuid), 1, '{}'::jsonb, NULL) ->> 'outcome' = 'stale',
    'without the ban the Edge Function made, the merge is stale');

SELECT public.account_admin_merge_clients(:agent::uuid, :a_actor::uuid, :audit3::uuid, :k2_client::uuid, :r3_client::uuid,
           (SELECT version FROM public.client WHERE id = :k2_client::uuid), 1, '{}'::jsonb, :r3_account::uuid) AS r3 \gset
SELECT pg_temp.assert(:'r3'::jsonb ->> 'outcome' = 'merged', 'two-sign-in merge succeeds');
SELECT pg_temp.assert(
    (SELECT locked_at IS NOT NULL AND locked_reason = 'Merged into Jordan Hayes' FROM public.account WHERE id = :r3_account::uuid),
    'the retired sign-in is locked "Merged into Jordan Hayes"');
SELECT pg_temp.assert(NOT EXISTS (SELECT 1 FROM auth.sessions WHERE user_id = :r3_account::uuid),
    'its sessions are ended');
SELECT pg_temp.assert(
    (SELECT client_id FROM public.platform_user WHERE account_id = :jordan::uuid) = :k2_client::uuid
    AND (SELECT locked_at IS NULL FROM public.account WHERE id = :jordan::uuid),
    'the kept sign-in stays, unlocked');
SELECT pg_temp.assert(
    EXISTS (SELECT 1 FROM public.audit_event WHERE event_type = 'client.account_locked' AND target_id = :r3_client::uuid)
    AND (SELECT metadata ->> 'retiredSignInEmail' FROM public.audit_event WHERE id = :audit3::uuid) = 'jordan.second@example.com',
    'the lock has its own audit row, and the merge row keeps the locked address');

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. The page's read, and privileges
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.client (id, agent_id, first_name, last_name, email)
VALUES ('0c39b000-0000-7000-8000-000000000013', :agent::uuid, 'Jordan', 'Hayes', 'jordan.third@example.com');

SELECT pg_temp.become(:gyasi::uuid, 'aal1');
SELECT pg_temp.assert(
    (public.agent_client_merge_view(:k2_client::uuid) ->> 'needsMfa')::boolean
    AND public.agent_client_merge_view(:k2_client::uuid) -> 'candidates' IS NULL,
    'aal1: the read says needsMfa and nothing else');

SELECT pg_temp.become(:gyasi::uuid, 'aal2');
SELECT pg_temp.assert(
    EXISTS (SELECT 1 FROM jsonb_array_elements(public.agent_client_merge_view(:k2_client::uuid) -> 'candidates') c
             WHERE c ->> 'clientId' = '0c39b000-0000-7000-8000-000000000013' AND c ->> 'reason' = 'name'),
    'aal2: a same-name record is offered as a likely duplicate');
SELECT pg_temp.assert(
    NOT EXISTS (SELECT 1 FROM jsonb_array_elements(public.agent_client_merge_view(:k2_client::uuid) -> 'candidates') c
                 WHERE c ->> 'clientId' IN (:maya, :r3_client)),
    'merged-away records are never offered');
SELECT pg_temp.assert(
    jsonb_array_length(public.agent_client_merge_view(:k2_client::uuid, '0c39b000-0000-7000-8000-000000000013') #> '{preview,fields}') = 20,
    'with another record, the read carries the preview');
SELECT pg_temp.assert(public.agent_client_merge_view(:x_client::uuid) IS NULL, 'another advisor''s record reads as nothing');

SELECT pg_temp.expect_denied(
    format('SELECT public.account_admin_merge_clients(%L, %L, public.uuid_v7(), %L, %L, 1, 1, ''{}'', NULL)',
           :agent, :a_actor, :k2_client, '0c39b000-0000-7000-8000-000000000013'),
    'a signed-in user cannot run the merge write');
SELECT pg_temp.expect_denied(
    format('SELECT public.client_merge_preview(%L, %L, %L)', :agent, :k2_client, '0c39b000-0000-7000-8000-000000000013'),
    'a signed-in user cannot run the service-role preview');
RESET role;

ROLLBACK;
