-- §3.10 Stage 1 — Screens 3.10.1 Inbox and 3.10.2 Thread: the advisor's reads, send, read and
-- archive, and the client's read-clearing.
--
-- WHAT THIS FILE IS GUARDING.
--
--   1. An advisor sees exactly their own live threads (conversation AND trip on them), with
--      who spoke last, whether a reply is owed, and when it falls due: one business day,
--      Sundays never count, in the advisor's zone (Gyasi, 2026-10-13).
--   2. A reply moves what the client reads (preview, time, their unread count). An internal
--      note moves NONE of it: those columns are in the client's grant.
--   3. The inbox's archive is the advisor's own (`agent_archived_at`), never the client's
--      `archived_at`, and the next message brings a thread back.
--   4. A client clears only their own unread count.
--   5. One live thread per trip, and one general thread, per client.
--   6. Reading clears only up to the newest message on screen, on both sides: one that landed
--      after stays unread.
--   7. `trip-message`'s thread bump is one statement and never moves the thread backwards.
--
-- The fixtures' updated_at is three days old ON PURPOSE: the file is one transaction, so now()
-- is frozen, and a fixture stamped now() could not tell a write of now() from no write at all.
--
-- A SECOND ADVISOR with a client who can sign in and one who cannot; every assertion is a
-- literal.
--
-- Run against a freshly reset local database:
--     supabase db reset
--     psql "$(supabase status -o json | jq -r .DB_URL)" -v ON_ERROR_STOP=1 \
--          -f supabase/tests/rls_agent_messaging.sql

\set ON_ERROR_STOP on

BEGIN;

\set gyasi      '''0195a2c0-1a00-7000-8000-000000000010'''
\set jordan     '''0195a2c0-1a00-7000-8000-000000000011'''
\set agent      '''0195a2c0-1a00-7000-8000-000000000001'''
\set seed_conv  '''0195a2c0-1a00-7000-8000-0000000000b0'''
\set b_agent    '''0c7f0000-0000-7000-8000-000000000001'''
\set b_account  '''0c7f0000-0000-7000-8000-000000000002'''
\set k_account  '''0c7f0000-0000-7000-8000-000000000003'''
\set n_client   '''0c7f0000-0000-7000-8000-000000000004'''
\set tk1        '''0c7f0000-0000-7000-8000-000000000011'''
\set tk2        '''0c7f0000-0000-7000-8000-000000000012'''
\set tx         '''0c7f0000-0000-7000-8000-000000000013'''
\set tn         '''0c7f0000-0000-7000-8000-000000000014'''
\set cv1        '''0c7f0000-0000-7000-8000-0000000000c1'''
\set cv2        '''0c7f0000-0000-7000-8000-0000000000c2'''
\set cv3        '''0c7f0000-0000-7000-8000-0000000000c3'''
\set cv5        '''0c7f0000-0000-7000-8000-0000000000c5'''
\set cvx        '''0c7f0000-0000-7000-8000-0000000000c6'''
\set cvb        '''0c7f0000-0000-7000-8000-0000000000c8'''

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

CREATE OR REPLACE FUNCTION pg_temp.become(account uuid)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    PERFORM set_config('role', 'authenticated', true);
    PERFORM set_config('request.jwt.claims',
        json_build_object('sub', account::text, 'role', 'authenticated', 'aal', 'aal2')::text, true);
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 0. A second advisor, a client of theirs who can sign in (K), one who cannot (N)
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.agent (id, display_name, email, status, time_zone)
VALUES (:b_agent::uuid, 'Messaging Test Advisor', 'msg.advisor@example.com', 'active', 'America/New_York');

INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change)
VALUES
    (:b_account::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'msg.advisor.login@example.com', 'x', now(),
     '{"provider":"email","providers":["email"]}'::jsonb,
     '{"first_name":"Msg","last_name":"Advisor","agent_id":"0195a2c0-1a00-7000-8000-000000000001"}'::jsonb,
     now(), now(), '', '', '', ''),
    -- The bridge provisions K as a client of the advisor named here.
    (:k_account::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'kai.traveler@example.com', 'x', now(),
     '{"provider":"email","providers":["email"]}'::jsonb,
     '{"first_name":"Kai","last_name":"Traveler","agent_id":"0c7f0000-0000-7000-8000-000000000001"}'::jsonb,
     now(), now(), '', '', '', '');

DO $$
DECLARE v_client_id uuid;
BEGIN
    SELECT client_id INTO v_client_id FROM public.platform_user
     WHERE account_id = '0c7f0000-0000-7000-8000-000000000002';
    UPDATE public.platform_user
       SET role = 'agent', agent_id = '0c7f0000-0000-7000-8000-000000000001', client_id = NULL
     WHERE account_id = '0c7f0000-0000-7000-8000-000000000002';
    DELETE FROM public.client WHERE id = v_client_id;
END $$;

SELECT pu.id AS b_actor FROM public.platform_user pu WHERE pu.account_id = :b_account::uuid \gset
SELECT pu.id AS k_user, pu.client_id AS k_client
  FROM public.platform_user pu WHERE pu.account_id = :k_account::uuid \gset
SELECT pu.id AS a_actor FROM public.platform_user pu WHERE pu.account_id = :gyasi::uuid \gset
\set b_actor  '''':b_actor''''
\set k_user   '''':k_user''''
\set k_client '''':k_client''''
\set a_actor  '''':a_actor''''

-- Nora goes by Nori: a search for her legal name must still find her.
INSERT INTO public.client (id, agent_id, first_name, preferred_name, last_name, email)
VALUES (:n_client::uuid, :b_agent::uuid, 'Nora', 'Nori', 'Nologin', 'nora@example.com');

-- One of advisor A's trips with no live thread yet, read as the owner: B's row security would
-- hide it later.
SELECT t.id AS a_trip, t.client_id AS a_client
  FROM public.trip t
 WHERE t.agent_id = :agent::uuid
   AND NOT EXISTS (SELECT 1 FROM public.conversation cv
                    WHERE cv.client_id = t.client_id AND cv.trip_id = t.id AND cv.archived_at IS NULL)
 ORDER BY t.id LIMIT 1 \gset
\set a_trip   '''':a_trip''''
\set a_client '''':a_client''''

INSERT INTO public.trip (id, client_id, agent_id, title, trip_type, status)
VALUES (:tk1::uuid, :k_client, :b_agent::uuid, 'Kai · Bonaire dive week', 'custom', 'booked'),
       (:tk2::uuid, :k_client, :b_agent::uuid, 'Kai · Alaska cruise',     'custom', 'proposal'),
       -- B's trip, whose thread was written under ANOTHER advisor's id: belongs to neither view.
       (:tx::uuid,  :k_client, :b_agent::uuid, 'Kai · mismatched thread', 'custom', 'inquiry'),
       -- Nora's trip, with no thread yet.
       (:tn::uuid,  :n_client::uuid, :b_agent::uuid, 'Nora · Lisbon', 'custom', 'inquiry');

-- Threads, with last_message_at / preview as the writers keep them.
INSERT INTO public.conversation (id, client_id, agent_id, trip_id, subject, last_message_at,
                                 last_message_preview, client_unread_count, agent_unread_count,
                                 archived_at, updated_at)
VALUES
    -- CV1: Kai asked three days ago and nobody answered (a note does not answer): OVERDUE.
    (:cv1::uuid, :k_client, :b_agent::uuid, :tk1::uuid, 'Kai · Bonaire dive week',
     now() - interval '3 days', 'Can we add a night dive?', 0, 1, NULL, now() - interval '3 days'),
    -- CV2: Kai's general thread, asked an hour ago: awaiting, not yet due. Unread 2.
    (:cv2::uuid, :k_client, :b_agent::uuid, NULL, NULL,
     now() - interval '1 hour', 'Quick question about passports', 3, 2, NULL, now() - interval '3 days'),
    -- CV3: the advisor spoke last.
    (:cv3::uuid, :k_client, :b_agent::uuid, :tk2::uuid, 'Kai · Alaska cruise',
     now() - interval '2 days', 'Here are the two sailings', 1, 0, NULL, now() - interval '3 days'),
    -- CV5: removed FOR THE CLIENT. Never in anyone's inbox, and closed to every write. Unread 2,
    -- so a read or archive that ignored the removal would show.
    (:cv5::uuid, :k_client, :b_agent::uuid, :tk1::uuid, 'old thread',
     now() - interval '30 days', 'old', 0, 2, now() - interval '20 days', now() - interval '3 days'),
    -- CVX: a trip of B's with the conversation under advisor A's id.
    (:cvx::uuid, :k_client, :agent::uuid, :tx::uuid, 'mismatch',
     now() - interval '4 days', 'mismatch', 0, 5, NULL, now() - interval '3 days'),
    -- CVB: the mirror. Under B's id, on a trip of advisor A's (the trip was handed over): B's
    -- conversation id alone must not open it.
    (:cvb::uuid, :a_client, :b_agent::uuid, :a_trip, 'handed over',
     now() - interval '5 days', 'handed over', 0, 4, NULL, now() - interval '3 days');

INSERT INTO public.message (id, conversation_id, sender_user_id, sender_role, body, is_internal_note, created_at)
VALUES
    (gen_random_uuid(), :cv1::uuid, :k_user,  'client', 'Can we add a night dive?',            false, now() - interval '3 days'),
    (gen_random_uuid(), :cv1::uuid, :b_actor, 'agent',  'NOTE: ask Buddy Dive about lionfish', true,  now() - interval '2 days'),
    (gen_random_uuid(), :cv2::uuid, :b_actor, 'agent',  'Welcome aboard!',                     false, now() - interval '5 days'),
    (gen_random_uuid(), :cv2::uuid, :k_user,  'client', 'First question',                      false, now() - interval '2 hours'),
    (gen_random_uuid(), :cv2::uuid, :k_user,  'client', 'Quick question about passports',      false, now() - interval '1 hour'),
    (gen_random_uuid(), :cv3::uuid, :k_user,  'client', 'Which sailings fit 100% of us?',      false, now() - interval '3 days'),
    (gen_random_uuid(), :cv3::uuid, :b_actor, 'agent',  'Here are the two sailings',           false, now() - interval '2 days'),
    (gen_random_uuid(), :cvx::uuid, :k_user,  'client', 'mismatch',                            false, now() - interval '4 days'),
    (gen_random_uuid(), :cvb::uuid, :k_user,  'client', 'handed over',                         false, now() - interval '5 days');

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Privileges
-- ─────────────────────────────────────────────────────────────────────────────

SELECT pg_temp.become(:b_account::uuid);
SELECT pg_temp.expect_denied(
    format($q$SELECT * FROM public.agent_send_message(%L, %L, gen_random_uuid(), 'x', false, p_conversation_id => %L)$q$,
           :b_agent, :b_actor, :cv2),
    'even the owning advisor cannot call agent_send_message over /rpc/');
SELECT pg_temp.expect_denied(
    format($q$SELECT public.agent_mark_conversation_read(%L, %L, now())$q$, :b_agent, :cv2),
    'nor the read');
SELECT pg_temp.expect_denied(
    format($q$SELECT public.agent_set_conversations_archived(%L, ARRAY[%L]::uuid[], true)$q$, :b_agent, :cv2),
    'nor the archive');
SELECT pg_temp.expect_denied(
    $q$SELECT public.message_preview('x')$q$,
    'nor the internal helpers');
RESET ROLE;

SELECT pg_temp.become(:k_account::uuid);
SELECT pg_temp.expect_denied(
    'SELECT agent_archived_at FROM public.conversation',
    'the inbox archive is withheld from the client''s column grant');
SELECT pg_temp.expect_denied(
    'SELECT public.conversation_record_client_message(gen_random_uuid())',
    'and a client cannot bump a thread''s count themselves: that is trip-message''s, server side');
RESET ROLE;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. When a reply falls due: one business day, Sundays never count, in the advisor's zone
-- ─────────────────────────────────────────────────────────────────────────────

SELECT pg_temp.assert(
    public.conversation_reply_due_at('2026-10-09 15:00 America/New_York', 'America/New_York') = '2026-10-11 00:00 America/New_York'
    AND public.conversation_reply_due_at('2026-10-10 10:00 America/New_York', 'America/New_York') = '2026-10-13 00:00 America/New_York'
    AND public.conversation_reply_due_at('2026-10-11 10:00 America/New_York', 'America/New_York') = '2026-10-13 00:00 America/New_York'
    AND public.conversation_reply_due_at('2026-10-12 23:30 America/New_York', 'America/New_York') = '2026-10-14 00:00 America/New_York',
    'Friday is due at the end of Saturday; Saturday and Sunday at the end of Monday; Monday at the end of Tuesday');

SELECT pg_temp.assert(
    -- 02:00 UTC on Monday is still Sunday evening in New York.
    public.conversation_reply_due_at('2026-10-12 02:00 UTC', 'America/New_York') = '2026-10-13 00:00 America/New_York',
    'the day is the advisor''s, not UTC''s');

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. The inbox
-- ─────────────────────────────────────────────────────────────────────────────

-- Worked out here, as the owner: the helper is not a client role's to call.
SELECT public.conversation_reply_due_at(m.created_at, 'America/New_York') AS cv2_due
  FROM public.message m WHERE m.conversation_id = :cv2::uuid AND m.body = 'First question' \gset

SELECT pg_temp.become(:b_account::uuid);

SELECT pg_temp.assert(
    (SELECT array_agg(conversation_id::text || ' ' || last_sender_role || ' u' || agent_unread_count
                      || CASE WHEN overdue THEN ' OVERDUE' ELSE '' END
                      || CASE WHEN reply_due_at IS NULL THEN ' no-reply-owed' ELSE '' END
                      ORDER BY last_message_at DESC)
       FROM public.agent_message_threads())
    = ARRAY['0c7f0000-0000-7000-8000-0000000000c2 client u2',
            '0c7f0000-0000-7000-8000-0000000000c3 agent u0 no-reply-owed',
            '0c7f0000-0000-7000-8000-0000000000c1 client u1 OVERDUE'],
    'the advisor sees their three live threads, newest first: not the client-removed one, not the '
    'one under another advisor''s id, not their own on a trip handed to another advisor; a note '
    'does not answer Kai, so the dive thread is overdue');

SELECT pg_temp.assert(
    (SELECT array_agg(conversation_id::text ORDER BY last_message_at DESC) FROM public.agent_inbox(20))
      = ARRAY['0c7f0000-0000-7000-8000-0000000000c2', '0c7f0000-0000-7000-8000-0000000000c3',
              '0c7f0000-0000-7000-8000-0000000000c1']
    AND (SELECT count(*) FROM public.agent_client_conversations(:k_client::uuid)) = 3,
    'the worklist''s Recent messages and Client Detail list the same threads, so every row opens');

SELECT pg_temp.assert(
    (SELECT reply_due_at = :'cv2_due'::timestamptz
       FROM public.agent_message_threads() WHERE conversation_id = :cv2::uuid),
    'a reply is owed from the FIRST unanswered client message, not the latest');

SELECT pg_temp.assert(
    (SELECT array_agg(conversation_id::text ORDER BY last_message_at DESC) FROM public.agent_message_threads(p_unread => true))
      = ARRAY['0c7f0000-0000-7000-8000-0000000000c2', '0c7f0000-0000-7000-8000-0000000000c1']
    AND (SELECT array_agg(conversation_id::text) FROM public.agent_message_threads(p_overdue => true))
      = ARRAY['0c7f0000-0000-7000-8000-0000000000c1']
    AND (SELECT array_agg(conversation_id::text) FROM public.agent_message_threads(p_trip_id => :tk2::uuid))
      = ARRAY['0c7f0000-0000-7000-8000-0000000000c3']
    AND (SELECT count(*) FROM public.agent_message_threads(p_client_id => :n_client::uuid)) = 0,
    'unread, overdue, one trip and one client each filter the list');

SELECT pg_temp.assert(
    (SELECT array_agg(conversation_id::text) FROM public.agent_message_threads(p_search => 'lionfish'))
      = ARRAY['0c7f0000-0000-7000-8000-0000000000c1']
    AND (SELECT array_agg(conversation_id::text) FROM public.agent_message_threads(p_search => '100%'))
      = ARRAY['0c7f0000-0000-7000-8000-0000000000c3']
    AND (SELECT array_agg(conversation_id::text) FROM public.agent_message_threads(p_search => '%'))
      = ARRAY['0c7f0000-0000-7000-8000-0000000000c3']
    -- As a wildcard this would match "Kai · Bonaire dive week"; as a character it matches nothing.
    AND (SELECT count(*) FROM public.agent_message_threads(p_search => 'Bon%week')) = 0
    AND (SELECT count(*) FROM public.agent_message_threads(p_search => 'Bon_ire')) = 0
    AND (SELECT count(*) FROM public.agent_message_threads(p_search => 'alaska')) = 1,
    'search reads every body (notes too), the trip, and takes % as a character, not a wildcard');

SELECT pg_temp.assert(
    (SELECT open_threads = 3 AND unread_threads = 2 AND unread_messages = 3
            AND overdue_threads = 1 AND archived_threads = 0
       FROM public.agent_message_summary()),
    'the header counts every open thread: 2 unread (3 messages), 1 overdue');

SELECT pg_temp.assert(
    (SELECT array_agg(sender_role || CASE WHEN is_internal_note THEN '/note' ELSE '' END ORDER BY created_at)
       FROM public.agent_conversation_messages(:cv1::uuid)) = ARRAY['client', 'agent/note']
    AND (SELECT client_first_name = 'Kai' AND client_can_sign_in AND overdue
           FROM public.agent_conversation(:cv1::uuid))
    AND (SELECT bool_and(total_messages = 3) FROM public.agent_conversation_messages(:cv2::uuid))
    AND (SELECT client_can_sign_in = false AND conversation_id IS NULL
           FROM public.agent_message_target(:n_client::uuid)),
    'the thread shows the advisor''s notes and its whole length; Kai can sign in to read a reply, '
    'Nora cannot and has no thread yet');

SELECT pg_temp.assert(
    (SELECT conversation_id = :cv1::uuid FROM public.agent_message_target(:k_client::uuid, :tk1::uuid))
    AND (SELECT conversation_id = :cv2::uuid FROM public.agent_message_target(:k_client::uuid))
    AND NOT EXISTS (SELECT 1 FROM public.agent_message_target(:k_client::uuid, :a_trip::uuid))
    -- The advisor's own trip, but Nora's: not a trip of Kai's to message him about.
    AND NOT EXISTS (SELECT 1 FROM public.agent_message_target(:k_client::uuid, :tn::uuid)),
    '"Message client" finds the live thread for a trip, or the general one; another advisor''s '
    'trip, or another client''s, is nobody''s');
RESET ROLE;

SELECT pg_temp.become(:gyasi::uuid);
SELECT pg_temp.assert(
    NOT EXISTS (SELECT 1 FROM public.agent_message_threads() WHERE client_id = :k_client::uuid)
    AND NOT EXISTS (SELECT 1 FROM public.agent_conversation(:cv1::uuid))
    AND NOT EXISTS (SELECT 1 FROM public.agent_conversation_messages(:cv1::uuid))
    AND NOT EXISTS (SELECT 1 FROM public.agent_message_target(:k_client::uuid))
    AND NOT EXISTS (SELECT 1 FROM public.agent_conversation(:cvb::uuid)),
    'another advisor sees none of it, not even the thread filed under their own id on B''s trip, '
    'nor B''s thread on a trip that is now theirs');
RESET ROLE;

SELECT pg_temp.become(:k_account::uuid);
SELECT pg_temp.assert(
    NOT EXISTS (SELECT 1 FROM public.agent_message_threads())
    AND NOT EXISTS (SELECT 1 FROM public.agent_message_summary())
    AND NOT EXISTS (SELECT 1 FROM public.agent_conversation_messages(:cv1::uuid)),
    'a client gets no advisor reads, and no row of zeros either');
RESET ROLE;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Sending
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TEMP TABLE cv2_before AS
SELECT last_message_at, last_message_preview, client_unread_count, updated_at
  FROM public.conversation WHERE id = :cv2::uuid;
CREATE TEMP TABLE cv1_before AS
SELECT last_message_at, last_message_preview, client_unread_count, updated_at
  FROM public.conversation WHERE id = :cv1::uuid;

-- An internal note in the overdue thread, written with everything on screen.
SELECT outcome AS note_outcome FROM public.agent_send_message(
    :b_agent::uuid, :b_actor::uuid, '0c7f0000-0000-7000-8000-0000000000d1', 'NOTE: Buddy Dive confirmed', true,
    p_seen_up_to => clock_timestamp(), p_conversation_id => :cv1::uuid) \gset

SELECT pg_temp.assert(
    :'note_outcome' = 'sent'
    AND (SELECT c.last_message_at = b.last_message_at AND c.last_message_preview = b.last_message_preview
                AND c.client_unread_count = b.client_unread_count AND c.updated_at = b.updated_at
                AND c.agent_unread_count = 0
           FROM public.conversation c, cv1_before b WHERE c.id = :cv1::uuid),
    'an internal note moves nothing the client can read: preview, time, their count, updated_at');

SELECT pg_temp.become(:b_account::uuid);
SELECT pg_temp.assert(
    (SELECT overdue FROM public.agent_message_threads() WHERE conversation_id = :cv1::uuid),
    'and the thread is still overdue: a note is not a reply');
RESET ROLE;

-- A reply in Kai's general thread, from a page drawn after "First question" (2h ago) and
-- before "Quick question about passports" (1h ago).
SELECT outcome AS reply_outcome, created_at AS reply_at FROM public.agent_send_message(
    :b_agent::uuid, :b_actor::uuid, '0c7f0000-0000-7000-8000-0000000000d2',
    '  Your passport needs six months left on it after you get home, so check the date before we book anything for you and the kids. ' || repeat('More detail. ', 5) || '  ',
    false, p_seen_up_to => now() - interval '90 minutes', p_conversation_id => :cv2::uuid) \gset

SELECT pg_temp.assert(
    :'reply_outcome' = 'sent'
    AND (SELECT c.last_message_at = :'reply_at'::timestamptz
                AND c.last_message_preview = public.message_preview(m.body)
                AND right(c.last_message_preview, 1) = '…' AND length(c.last_message_preview) <= 141
                AND c.client_unread_count = b.client_unread_count + 1
                AND c.updated_at = :'reply_at'::timestamptz
                AND m.body = btrim(m.body) AND m.sender_role = 'agent' AND NOT m.is_internal_note
           FROM public.conversation c, cv2_before b, public.message m
          WHERE c.id = :cv2::uuid AND m.id = '0c7f0000-0000-7000-8000-0000000000d2'),
    'a reply moves the preview (cut like trip-message''s), the time and the client''s count');

SELECT pg_temp.assert(
    (SELECT agent_unread_count FROM public.conversation WHERE id = :cv2::uuid) = 1
    AND :'reply_at'::timestamptz > now(),
    'and reads only what was on screen: the passport question that came in after stays unread; '
    'the reply is stamped when it is written, not when its transaction began');

SELECT pg_temp.become(:b_account::uuid);
SELECT pg_temp.assert(
    (SELECT last_sender_role = 'agent' AND reply_due_at IS NULL AND NOT overdue
       FROM public.agent_message_threads() WHERE conversation_id = :cv2::uuid),
    'and nothing is owed on it any more');
RESET ROLE;

-- To a client: Nora has no thread, so one is made; Kai's Alaska trip already has one.
SELECT outcome AS new_outcome, conversation_id AS new_conv FROM public.agent_send_message(
    :b_agent::uuid, :b_actor::uuid, '0c7f0000-0000-7000-8000-0000000000d3', 'Hi Nora, glad to help!', false,
    p_new_conversation_id => '0c7f0000-0000-7000-8000-0000000000e1', p_client_id => :n_client::uuid) \gset
SELECT outcome AS existing_outcome, conversation_id AS existing_conv FROM public.agent_send_message(
    :b_agent::uuid, :b_actor::uuid, '0c7f0000-0000-7000-8000-0000000000d4', 'One more thing about Alaska', false,
    p_new_conversation_id => '0c7f0000-0000-7000-8000-0000000000e2',
    p_client_id => :k_client::uuid, p_trip_id => :tk2::uuid) \gset

SELECT pg_temp.assert(
    :'new_outcome' = 'sent' AND :'new_conv' = '0c7f0000-0000-7000-8000-0000000000e1'
    AND (SELECT trip_id IS NULL AND subject IS NULL AND agent_id = :b_agent::uuid AND client_unread_count = 1
                AND last_message_preview = 'Hi Nora, glad to help!'
           FROM public.conversation WHERE id = '0c7f0000-0000-7000-8000-0000000000e1')
    AND :'existing_conv' = :cv3
    AND NOT EXISTS (SELECT 1 FROM public.conversation WHERE id = '0c7f0000-0000-7000-8000-0000000000e2'),
    'a message to a client with no thread starts one; to a trip that has one, it goes in that one');

SELECT pg_temp.become(:b_account::uuid);
SELECT pg_temp.assert(
    (SELECT array_agg(conversation_id::text) FROM public.agent_message_threads(p_search => 'Nora Nologin'))
      = ARRAY['0c7f0000-0000-7000-8000-0000000000e1']
    AND (SELECT client_display_name = 'Nori Nologin' FROM public.agent_message_threads(p_search => 'nori')),
    'search finds a client by the name they go by and by their legal name');
RESET ROLE;

SELECT pg_temp.assert(
    (SELECT outcome = 'note_needs_thread' FROM public.agent_send_message(
        :b_agent::uuid, :b_actor::uuid, gen_random_uuid(), 'note first', true,
        p_new_conversation_id => gen_random_uuid(), p_client_id => :n_client::uuid, p_trip_id => :tn::uuid))
    AND NOT EXISTS (SELECT 1 FROM public.conversation WHERE trip_id = :tn::uuid),
    'an internal note cannot start a thread: the client would see one with nothing in it');

SELECT pg_temp.assert(
    NOT EXISTS (SELECT 1 FROM public.agent_send_message(:b_agent::uuid, :b_actor::uuid, gen_random_uuid(), 'x', false,
                                                         p_conversation_id => :seed_conv::uuid))
    AND NOT EXISTS (SELECT 1 FROM public.agent_send_message(:b_agent::uuid, :b_actor::uuid, gen_random_uuid(), 'x', false,
                                                         p_conversation_id => :cv5::uuid))
    AND NOT EXISTS (SELECT 1 FROM public.agent_send_message(:b_agent::uuid, :b_actor::uuid, gen_random_uuid(), 'x', false,
                                                         p_conversation_id => :cvx::uuid))
    AND NOT EXISTS (SELECT 1 FROM public.agent_send_message(:b_agent::uuid, :b_actor::uuid, gen_random_uuid(), 'x', false,
                                                         p_conversation_id => :cvb::uuid))
    AND NOT EXISTS (SELECT 1 FROM public.agent_send_message(:agent::uuid, :a_actor::uuid, gen_random_uuid(), 'x', false,
                                                         p_new_conversation_id => gen_random_uuid(),
                                                         p_client_id => :n_client::uuid))
    AND NOT EXISTS (SELECT 1 FROM public.agent_send_message(:b_agent::uuid, :b_actor::uuid, gen_random_uuid(), 'x', false,
                                                         p_new_conversation_id => gen_random_uuid(),
                                                         p_client_id => :n_client::uuid, p_trip_id => :tk1::uuid))
    -- B's own client and trip, but the live thread for it is filed under advisor A.
    AND NOT EXISTS (SELECT 1 FROM public.agent_send_message(:b_agent::uuid, :b_actor::uuid, gen_random_uuid(), 'x', false,
                                                         p_new_conversation_id => gen_random_uuid(),
                                                         p_client_id => :k_client::uuid, p_trip_id => :tx::uuid))
    -- B's thread, with somebody else's login as the actor.
    AND NOT EXISTS (SELECT 1 FROM public.agent_send_message(:b_agent::uuid, :a_actor::uuid, gen_random_uuid(), 'x', false,
                                                         p_conversation_id => :cv2::uuid))
    AND (SELECT count(*) FROM public.message WHERE body = 'x') = 0,
    'nothing is written to another advisor''s thread or client, a client-removed thread, a thread '
    'under another advisor''s id or on a trip handed to one, a trip that is not that client''s, '
    'or by a login that is not the advisor''s');

UPDATE public.agent SET status = 'archived' WHERE id = :b_agent::uuid;
SELECT pg_temp.assert(
    NOT EXISTS (SELECT 1 FROM public.agent_send_message(:b_agent::uuid, :b_actor::uuid, gen_random_uuid(), 'archived', false,
                                                         p_conversation_id => :cv2::uuid)),
    'an archived advisor writes nothing');
UPDATE public.agent SET status = 'active' WHERE id = :b_agent::uuid;

-- An archived client can still be answered in the thread they have; nobody starts a new one.
UPDATE public.client SET status = 'archived', archived_at = now() WHERE id = :n_client::uuid;
SELECT outcome AS archived_client_reply FROM public.agent_send_message(
    :b_agent::uuid, :b_actor::uuid, gen_random_uuid(), 'Still here for you, Nora', false,
    p_conversation_id => '0c7f0000-0000-7000-8000-0000000000e1') \gset
SELECT pg_temp.assert(
    :'archived_client_reply' = 'sent'
    AND NOT EXISTS (SELECT 1 FROM public.agent_send_message(:b_agent::uuid, :b_actor::uuid, gen_random_uuid(), 'x', false,
                                                         p_new_conversation_id => gen_random_uuid(),
                                                         p_client_id => :n_client::uuid, p_trip_id => :tn::uuid)),
    'an archived client''s thread can still be answered, and a new one cannot be started');
UPDATE public.client SET status = 'merged_into', archived_at = now() WHERE id = :n_client::uuid;
SELECT pg_temp.become(:b_account::uuid);
SELECT pg_temp.assert(
    NOT EXISTS (SELECT 1 FROM public.agent_message_threads(p_client_id => :n_client::uuid)),
    'a client merged into another leaves the inbox');
RESET ROLE;
SELECT pg_temp.assert(
    NOT EXISTS (SELECT 1 FROM public.agent_send_message(:b_agent::uuid, :b_actor::uuid, gen_random_uuid(), 'x', false,
                                                         p_conversation_id => '0c7f0000-0000-7000-8000-0000000000e1')),
    'and their old thread takes no more replies');
UPDATE public.client SET status = 'active', archived_at = NULL WHERE id = :n_client::uuid;

SELECT pg_temp.expect_error(
    format($q$SELECT * FROM public.agent_send_message(%L, %L, gen_random_uuid(), '   ', false, p_conversation_id => %L)$q$,
           :b_agent, :b_actor, :cv2),
    'P0001', 'an empty message is refused');
SELECT pg_temp.expect_error(
    format($q$SELECT * FROM public.agent_send_message(%L, %L, gen_random_uuid(), repeat('x', 8001), false, p_conversation_id => %L)$q$,
           :b_agent, :b_actor, :cv2),
    'P0001', 'and so is one over 8,000 characters');
SELECT pg_temp.expect_error(
    format($q$SELECT * FROM public.agent_send_message(%L, %L, gen_random_uuid(), 'x', false, p_conversation_id => %L, p_client_id => %L)$q$,
           :b_agent, :b_actor, :cv2, :n_client),
    'P0001', 'and one addressed to a thread and a client at once');
SELECT pg_temp.expect_error(
    format($q$SELECT * FROM public.agent_send_message(%L, %L, gen_random_uuid(), 'x', NULL, p_conversation_id => %L)$q$,
           :b_agent, :b_actor, :cv2),
    'P0001', 'and one that does not say whether it is a note: a missing flag is never "public"');
SELECT pg_temp.expect_error(
    format($q$SELECT * FROM public.agent_send_message(%L, %L, NULL, 'x', false, p_conversation_id => %L)$q$,
           :b_agent, :b_actor, :cv2),
    'P0001', 'and one without its id');

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Read, and the inbox archive
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE public.conversation SET agent_unread_count = 4 WHERE id = :cv3::uuid;
UPDATE public.conversation SET agent_unread_count = 2 WHERE id = :cv1::uuid;
-- One call per statement: a write and a read of its effect in one statement see the old row.
SELECT public.agent_mark_conversation_read(:b_agent::uuid, :cv3::uuid, clock_timestamp()) AS read_first \gset
SELECT public.agent_mark_conversation_read(:b_agent::uuid, :cv3::uuid, clock_timestamp()) AS read_again \gset
SELECT public.agent_mark_conversation_read(:agent::uuid, :cv1::uuid, clock_timestamp()) AS read_other \gset
-- A GENERAL thread too: with no trip, only the conversation's own advisor id stands in the way.
UPDATE public.conversation SET agent_unread_count = 3 WHERE id = :cv2::uuid;
SELECT public.agent_mark_conversation_read(:agent::uuid, :cv2::uuid, clock_timestamp()) AS read_other_general \gset
-- B's own conversation id, on a trip handed to A; and a thread removed for the client.
SELECT public.agent_mark_conversation_read(:b_agent::uuid, :cvb::uuid, clock_timestamp()) AS read_handed_over \gset
SELECT public.agent_mark_conversation_read(:b_agent::uuid, :cv5::uuid, clock_timestamp()) AS read_removed \gset
SELECT pg_temp.assert(
    :'read_first' = 't' AND :'read_again' = 'f' AND :'read_other' = 'f' AND :'read_other_general' = 'f'
    AND :'read_handed_over' = 'f' AND :'read_removed' = 'f'
    AND (SELECT agent_unread_count FROM public.conversation WHERE id = :cv3::uuid) = 0
    AND (SELECT agent_unread_count FROM public.conversation WHERE id = :cv1::uuid) = 2
    AND (SELECT agent_unread_count FROM public.conversation WHERE id = :cv2::uuid) = 3
    AND (SELECT agent_unread_count FROM public.conversation WHERE id = :cvb::uuid) = 4
    AND (SELECT agent_unread_count FROM public.conversation WHERE id = :cv5::uuid) = 2,
    'opening a thread clears the advisor''s count once; another advisor''s open, a thread on a trip '
    'handed away, or one removed for the client changes nothing');

-- A page drawn four days ago, before Kai's question three days ago: that question stays unread.
SELECT public.agent_mark_conversation_read(:b_agent::uuid, :cv1::uuid, now() - interval '4 days') AS read_stale \gset
SELECT pg_temp.assert(
    :'read_stale' = 't' AND (SELECT agent_unread_count FROM public.conversation WHERE id = :cv1::uuid) = 1,
    'opening reads only up to the newest message on screen');
SELECT pg_temp.expect_error(
    format($q$SELECT public.agent_mark_conversation_read(%L, %L, NULL)$q$, :b_agent, :cv1),
    'P0001', 'and must say which message that was');

-- Archive, in the order trip-message races it: Kai's next message is already in, the thread's
-- bump has not happened yet.
UPDATE public.conversation SET agent_unread_count = 2 WHERE id = :cv3::uuid;
SELECT updated_at AS cv3_updated, last_message_at AS cv3_last FROM public.conversation WHERE id = :cv3::uuid \gset
INSERT INTO public.message (id, conversation_id, sender_user_id, sender_role, body, created_at)
VALUES ('0c7f0000-0000-7000-8000-0000000000f1', :cv3::uuid, :k_user, 'client', 'Actually, one more question', clock_timestamp());

SELECT public.agent_set_conversations_archived(
    :b_agent::uuid, ARRAY[:cv3::uuid, :seed_conv::uuid, :cvb::uuid, :cv5::uuid], true) AS archived_n \gset
SELECT public.agent_set_conversations_archived(:agent::uuid, ARRAY[:cv2::uuid], true) AS archived_other \gset
SELECT pg_temp.assert(
    :archived_n = 1 AND :archived_other = 0
    AND (SELECT archived_at IS NULL AND agent_archived_at = :'cv3_last'::timestamptz
                AND agent_unread_count = 0 AND updated_at = :'cv3_updated'::timestamptz
           FROM public.conversation WHERE id = :cv3::uuid)
    AND (SELECT agent_archived_at IS NULL FROM public.conversation WHERE id = :cv2::uuid)
    AND (SELECT agent_archived_at IS NULL AND agent_unread_count = 4 FROM public.conversation WHERE id = :cvb::uuid)
    AND (SELECT agent_archived_at IS NULL AND agent_unread_count = 2 FROM public.conversation WHERE id = :cv5::uuid)
    AND (SELECT agent_archived_at IS NULL FROM public.conversation WHERE id = :seed_conv::uuid),
    'archiving files the advisor''s own thread through its last message and clears their count; it '
    'never sets the client''s archived_at or updated_at, and skips threads that are not theirs');

SELECT pg_temp.become(:b_account::uuid);
SELECT pg_temp.assert(
    NOT EXISTS (SELECT 1 FROM public.agent_message_threads() WHERE conversation_id = :cv3::uuid)
    AND (SELECT array_agg(conversation_id::text) FROM public.agent_message_threads(p_archived => true))
        = ARRAY['0c7f0000-0000-7000-8000-0000000000c3']
    AND (SELECT open_threads = 3 AND archived_threads = 1 FROM public.agent_message_summary())
    AND NOT EXISTS (SELECT 1 FROM public.agent_inbox(20) WHERE conversation_id = :cv3::uuid)
    AND EXISTS (SELECT 1 FROM public.agent_client_conversations(:k_client::uuid) WHERE conversation_id = :cv3::uuid),
    'an archived thread leaves the inbox and the worklist for the archived view; Client Detail keeps it as history');
RESET ROLE;

SELECT pg_temp.become(:k_account::uuid);
SELECT pg_temp.assert(
    EXISTS (SELECT 1 FROM public.conversation WHERE id = :cv3::uuid),
    'and the client still has it: the inbox archive is the advisor''s alone');
RESET ROLE;

-- trip-message's bump for the message that raced the archive.
SELECT public.conversation_record_client_message('0c7f0000-0000-7000-8000-0000000000f1') AS bumped \gset
SELECT pg_temp.assert(
    :'bumped' = 't'
    AND (SELECT agent_unread_count = 1 AND last_message_preview = 'Actually, one more question'
                AND last_message_at = m.created_at
           FROM public.conversation c, public.message m
          WHERE c.id = :cv3::uuid AND m.id = '0c7f0000-0000-7000-8000-0000000000f1'),
    'the bump counts the message once and makes it the thread''s latest');

SELECT pg_temp.become(:b_account::uuid);
SELECT pg_temp.assert(
    (SELECT NOT archived AND last_sender_role = 'client' FROM public.agent_message_threads() WHERE conversation_id = :cv3::uuid),
    'and brings the archived thread back to the inbox');
RESET ROLE;

-- A client message stamped BEFORE the thread's latest (it committed late): counted, but the
-- thread's time and preview stay on the newer message.
INSERT INTO public.message (id, conversation_id, sender_user_id, sender_role, body, created_at)
VALUES ('0c7f0000-0000-7000-8000-0000000000f2', :cv3::uuid, :k_user, 'client', 'late arrival', now() - interval '10 days'),
       ('0c7f0000-0000-7000-8000-0000000000f3', :cv3::uuid, :b_actor, 'agent', 'not a client message', clock_timestamp());
SELECT public.conversation_record_client_message('0c7f0000-0000-7000-8000-0000000000f2') AS bumped_late \gset
SELECT public.conversation_record_client_message('0c7f0000-0000-7000-8000-0000000000f3') AS bumped_agent \gset
SELECT pg_temp.assert(
    :'bumped_late' = 't' AND :'bumped_agent' = 'f'
    AND (SELECT agent_unread_count = 2 AND last_message_preview = 'Actually, one more question'
                AND last_message_at = m.created_at
           FROM public.conversation c, public.message m
          WHERE c.id = :cv3::uuid AND m.id = '0c7f0000-0000-7000-8000-0000000000f1'),
    'the bump never moves a thread backwards, and touches nothing for an advisor''s message');

SELECT public.agent_set_conversations_archived(:b_agent::uuid, ARRAY[:cv3::uuid], false) AS unarchived_n \gset
SELECT pg_temp.assert(
    :unarchived_n = 1
    AND (SELECT agent_archived_at IS NULL AND agent_unread_count = 2 FROM public.conversation WHERE id = :cv3::uuid),
    'bringing a thread back clears the marker and leaves the count');

SELECT pg_temp.expect_error(
    format($q$SELECT public.agent_set_conversations_archived(%L, (SELECT array_agg(gen_random_uuid()) FROM generate_series(1, 101)), true)$q$,
           :b_agent),
    'P0001', 'one archive moves at most 100 threads');

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. The client clears their own count
-- ─────────────────────────────────────────────────────────────────────────────

-- CV2's client count: 3 seeded, plus the reply in section 4. Kai's screen was drawn an hour ago,
-- before that reply, then again after it.
SELECT pg_temp.become(:k_account::uuid);
SELECT public.client_mark_conversation_read(:cv2::uuid, now() - interval '1 hour') AS k_stale \gset
SELECT public.client_mark_conversation_read(:cv2::uuid, :'reply_at'::timestamptz) AS k_cleared \gset
SELECT public.client_mark_conversation_read(:cv2::uuid, :'reply_at'::timestamptz) AS k_again \gset
SELECT public.client_mark_conversation_read(:seed_conv::uuid, clock_timestamp()) AS k_other \gset
SELECT pg_temp.expect_error(
    format($q$SELECT public.client_mark_conversation_read(%L, NULL)$q$, :cv2),
    'P0001', 'the client says which message was the newest on screen too');
RESET ROLE;

SELECT pg_temp.assert(
    :'k_stale' = 't' AND :'k_cleared' = 't' AND :'k_again' = 'f' AND :'k_other' = 'f'
    AND (SELECT client_unread_count FROM public.conversation WHERE id = :cv2::uuid) = 0
    AND (SELECT client_unread_count FROM public.conversation WHERE id = :seed_conv::uuid) = 2,
    'a client clears their own thread''s count up to what they saw, and nobody else''s');

SET LOCAL ROLE anon;
SELECT pg_temp.expect_denied(
    format($q$SELECT public.client_mark_conversation_read(%L, now())$q$, :cv2),
    'anon cannot clear anything');
RESET ROLE;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. One live thread per trip, and one general thread, per client
-- ─────────────────────────────────────────────────────────────────────────────

SELECT pg_temp.expect_error(
    format($q$INSERT INTO public.conversation (id, client_id, agent_id, trip_id) VALUES (gen_random_uuid(), %L, %L, %L)$q$,
           :k_client, :b_agent, :tk1),
    '23505', 'a second live thread for a trip is refused');
SELECT pg_temp.expect_error(
    format($q$INSERT INTO public.conversation (id, client_id, agent_id, trip_id) VALUES (gen_random_uuid(), %L, %L, NULL)$q$,
           :k_client, :b_agent),
    '23505', 'and a second live general thread');
SELECT pg_temp.assert(
    (SELECT count(*) FROM public.conversation WHERE client_id = :k_client::uuid AND trip_id = :tk1::uuid) = 2,
    'while a removed thread for the same trip (CV5) never blocked the live one');

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. A reply is owed from the FIRST unanswered message, on days that tell them apart
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.conversation (id, client_id, agent_id, trip_id, subject, last_message_at, last_message_preview)
VALUES ('0c7f0000-0000-7000-8000-0000000000c7', :n_client::uuid, :b_agent::uuid, :tn::uuid, 'Nora · Lisbon',
        '2026-01-07 10:00 America/New_York', 'And one more');
INSERT INTO public.message (id, conversation_id, sender_user_id, sender_role, body, created_at)
VALUES (gen_random_uuid(), '0c7f0000-0000-7000-8000-0000000000c7', :k_user, 'client', 'Monday''s question', '2026-01-05 10:00 America/New_York'),
       (gen_random_uuid(), '0c7f0000-0000-7000-8000-0000000000c7', :k_user, 'client', 'And one more',      '2026-01-07 10:00 America/New_York');

SELECT pg_temp.become(:b_account::uuid);
SELECT pg_temp.assert(
    (SELECT reply_due_at = '2026-01-07 00:00 America/New_York' AND overdue
       FROM public.agent_message_threads() WHERE conversation_id = '0c7f0000-0000-7000-8000-0000000000c7'),
    'Monday''s unanswered question was due at the end of Tuesday, however many followed it');
RESET ROLE;

ROLLBACK;
