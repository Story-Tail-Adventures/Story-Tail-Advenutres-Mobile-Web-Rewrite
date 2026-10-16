-- §3.10 Stage 4: the email queue, the tokens and inbound replies (Data-Model §12.8 to §12.10).
--
-- WHAT THIS FILE IS GUARDING.
--
--   1. An advisor reply queues ONE email per thread; a second reply joins it and pushes the
--      send out; an internal note queues and changes nothing.
--   2. A client who reads in the app first gets no email; a client with no account gets no row.
--   3. Claiming is exclusive and carries exactly the replies the email is about, never a note.
--   4. A sent email stamps `emailed_at` on what it carried, and only that; a failure retries or
--      fails as it should.
--   5. The opt-out turns off this email only, is audited, and is honoured by a row already queued.
--   6. An inbound reply is accepted ONLY with a live token, the right verified sender and an open
--      thread; it lands like an in-app client message; a repeat webhook is a no-op.
--   7. Everything is service-role only, and a client cannot read `emailed_at`.
--
-- Run against a freshly reset local database:
--     supabase db reset
--     psql "$(supabase status -o json | jq -r .DB_URL)" -v ON_ERROR_STOP=1 \
--          -f supabase/tests/email_messages.sql

\set ON_ERROR_STOP on

BEGIN;

\set gyasi_account  '''0195a2c0-1a00-7000-8000-000000000010'''
\set jordan_account '''0195a2c0-1a00-7000-8000-000000000011'''
\set agent          '''0195a2c0-1a00-7000-8000-000000000001'''
\set conv           '''0195a2c0-1a00-7000-8000-0000000000b0'''
\set r1             '''0e8f0000-0000-7000-8000-0000000000a1'''
\set r2             '''0e8f0000-0000-7000-8000-0000000000a2'''
\set r3             '''0e8f0000-0000-7000-8000-0000000000a3'''
\set r4             '''0e8f0000-0000-7000-8000-0000000000a4'''
\set r5             '''0e8f0000-0000-7000-8000-0000000000a5'''
\set n1             '''0e8f0000-0000-7000-8000-0000000000b1'''
\set in1            '''0e8f0000-0000-7000-8000-0000000000c1'''
\set in2            '''0e8f0000-0000-7000-8000-0000000000c2'''
\set n_client       '''0e8f0000-0000-7000-8000-0000000000d1'''
\set n_conv         '''0e8f0000-0000-7000-8000-0000000000d2'''
\set nr1            '''0e8f0000-0000-7000-8000-0000000000d3'''

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

CREATE OR REPLACE FUNCTION pg_temp.become(account uuid)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    PERFORM set_config('role', 'authenticated', true);
    PERFORM set_config('request.jwt.claims',
        json_build_object('sub', account::text, 'role', 'authenticated')::text, true);
END;
$$;

SELECT pu.id AS gyasi_user FROM public.platform_user pu WHERE pu.account_id = :gyasi_account::uuid \gset
SELECT pu.id AS jordan_user FROM public.platform_user pu WHERE pu.account_id = :jordan_account::uuid \gset
SELECT a.email AS jordan_email FROM public.account a WHERE a.id = :jordan_account::uuid \gset
\set gyasi_user '''':gyasi_user''''
\set jordan_user '''':jordan_user''''
\set jordan_email '''':jordan_email''''

-- An advisor reply (or note) the way agent-message sends one.
CREATE OR REPLACE FUNCTION pg_temp.advisor_says(p_conv uuid, p_id uuid, p_body text, p_note boolean)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_out text;
BEGIN
    SELECT s.outcome INTO v_out FROM public.agent_send_message(
        '0195a2c0-1a00-7000-8000-000000000001',
        (SELECT pu.id FROM public.platform_user pu WHERE pu.account_id = '0195a2c0-1a00-7000-8000-000000000010'),
        p_id, p_body, p_note, NULL, NULL, p_conv) s;
    IF v_out IS DISTINCT FROM 'sent' THEN
        RAISE EXCEPTION 'advisor send did not go through: %', v_out;
    END IF;
END;
$$;

-- Start from a thread the client has read and an empty queue.
UPDATE public.conversation SET client_unread_count = 0 WHERE id = :conv::uuid;
DELETE FROM public.email_outbox;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Queue: one email per thread
-- ─────────────────────────────────────────────────────────────────────────────

SELECT pg_temp.advisor_says(:conv::uuid, :r1::uuid, 'Your ferry is booked for 9am.', false);
SELECT pg_temp.assert(
    (SELECT count(*) = 1 AND bool_and(state = 'pending' AND latest_message_id = :r1::uuid
                                      AND client_user_id = :jordan_user::uuid
                                      AND first_message_at = (SELECT created_at FROM public.message WHERE id = :r1::uuid))
       FROM public.email_outbox),
    'an advisor reply queues one pending email about it, for the client''s account');
SELECT pg_temp.assert(
    (SELECT due_at = public.push_due_at(now() + interval '5 minutes', 'America/Chicago') FROM public.email_outbox),
    'it falls due five minutes on, moved past the client''s rest hours');

SELECT pg_temp.advisor_says(:conv::uuid, :n1::uuid, 'Remember: Jordan prefers aisle seats.', true);
SELECT pg_temp.assert(
    (SELECT count(*) = 1 AND bool_and(latest_message_id = :r1::uuid) FROM public.email_outbox),
    'an internal note queues nothing and moves nothing');

SELECT pg_temp.advisor_says(:conv::uuid, :r2::uuid, 'And the hotel has your late checkout.', false);
SELECT pg_temp.assert(
    (SELECT count(*) = 1 AND bool_and(latest_message_id = :r2::uuid
                                      AND first_message_at = (SELECT created_at FROM public.message WHERE id = :r1::uuid))
       FROM public.email_outbox),
    'a second reply joins the same email and keeps where it started');

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Read first, no email; no account, no row
-- ─────────────────────────────────────────────────────────────────────────────

SELECT pg_temp.become(:jordan_account::uuid);
SELECT public.client_mark_conversation_read(:conv::uuid, clock_timestamp());
RESET role;
SELECT pg_temp.assert(
    (SELECT state FROM public.email_outbox WHERE latest_message_id = :r2::uuid) = 'cleared',
    'a client who read it in the app first is not emailed');

INSERT INTO public.client (id, agent_id, first_name, last_name, email)
VALUES (:n_client::uuid, :agent::uuid, 'Noel', 'Nologin', 'noel@example.com');
INSERT INTO public.conversation (id, client_id, agent_id, trip_id, client_unread_count, agent_unread_count)
VALUES (:n_conv::uuid, :n_client::uuid, :agent::uuid, NULL, 0, 0);
SELECT pg_temp.advisor_says(:n_conv::uuid, :nr1::uuid, 'Hi Noel, welcome!', false);
SELECT pg_temp.assert(
    NOT EXISTS (SELECT 1 FROM public.email_outbox WHERE conversation_id = :n_conv::uuid),
    'a client who cannot sign in gets no row (the advisor is warned instead)');

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Claim: exclusive, and exactly the replies it is about
-- ─────────────────────────────────────────────────────────────────────────────

SELECT pg_temp.advisor_says(:conv::uuid, :r3::uuid, 'Card on file ends 4242 — all set.', false);
SELECT pg_temp.assert(
    (SELECT count(*) FROM public.email_claim_due()) = 0,
    'nothing is claimed before it falls due');

UPDATE public.email_outbox SET due_at = now() - interval '1 minute' WHERE state = 'pending';
CREATE TEMP TABLE claim1 AS SELECT * FROM public.email_claim_due();
SELECT pg_temp.assert(
    (SELECT count(*) = 1 FROM claim1)
    AND (SELECT recipient = :jordan_email AND client_first_name = 'Jordan' AND agent_first_name = 'Gyasi'
           AND previous_outbox_id IS NULL FROM claim1),
    'a due email is claimed for the verified account address, with both first names');
SELECT pg_temp.assert(
    (SELECT jsonb_array_length(messages) = 1 AND messages -> 0 ->> 'message_id' = :r3 FROM claim1),
    'it carries only the replies since it was queued (not the cleared ones, never the note)');
SELECT pg_temp.assert(
    (SELECT count(*) FROM public.email_claim_due()) = 0
    AND (SELECT state FROM public.email_outbox WHERE latest_message_id = :r3::uuid) = 'sending',
    'a claimed email is not handed out twice');

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Finish: the Emailed mark, retries, failure
-- ─────────────────────────────────────────────────────────────────────────────

SELECT outbox_id AS ob1 FROM claim1 \gset
\set ob1 '''':ob1''''
SELECT public.email_record_tokens(:ob1::uuid, decode(repeat('a1', 32), 'hex'), decode(repeat('b1', 32), 'hex'));
SELECT pg_temp.assert(
    (SELECT count(*) FROM public.email_token WHERE outbox_id = :ob1::uuid) = 2,
    'the reply and unsubscribe tokens are saved, as hashes, before the send');
SELECT pg_temp.assert(public.email_finish(:ob1::uuid, true) = 'sent', 'an accepted send is sent');
SELECT pg_temp.assert(
    (SELECT emailed_at IS NOT NULL FROM public.message WHERE id = :r3::uuid)
    AND (SELECT bool_and(emailed_at IS NULL) FROM public.message WHERE id IN (:r1::uuid, :r2::uuid, :n1::uuid)),
    'emailed_at marks the reply it carried, and not the read ones or the note');
SELECT pg_temp.assert(public.email_finish(:ob1::uuid, true) = 'not_claimed',
    'finishing twice does nothing');

SELECT pg_temp.advisor_says(:conv::uuid, :r4::uuid, 'One more thing: bring sandals.', false);
UPDATE public.email_outbox SET due_at = now() - interval '1 minute' WHERE state = 'pending';
CREATE TEMP TABLE claim2 AS SELECT * FROM public.email_claim_due();
SELECT pg_temp.assert(
    (SELECT previous_outbox_id = :ob1::uuid FROM claim2),
    'the next email names the last one, so mail apps keep one conversation');
SELECT outbox_id AS ob2 FROM claim2 \gset
\set ob2 '''':ob2''''
SELECT pg_temp.assert(public.email_finish(:ob2::uuid, false, false, '421 try again later') = 'pending',
    'a transient failure goes back to wait');
SELECT pg_temp.assert(
    (SELECT attempts = 1 AND due_at > now() AND last_error = '421 try again later'
       FROM public.email_outbox WHERE id = :ob2::uuid)
    AND (SELECT emailed_at IS NULL FROM public.message WHERE id = :r4::uuid),
    'with a try counted, a later due time, and no Emailed mark');
UPDATE public.email_outbox SET due_at = now() - interval '1 minute' WHERE id = :ob2::uuid;
SELECT count(*) AS reclaimed FROM public.email_claim_due();
SELECT pg_temp.assert(public.email_finish(:ob2::uuid, false, true, repeat('x', 300)) = 'failed',
    'a permanent (5xx) failure fails at once');
SELECT pg_temp.assert(
    (SELECT char_length(last_error) = 200 FROM public.email_outbox WHERE id = :ob2::uuid),
    'and the stored error is cut to 200 characters');

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. The opt-out
-- ─────────────────────────────────────────────────────────────────────────────

SELECT pg_temp.assert(public.email_unsubscribe_status(decode(repeat('b1', 32), 'hex')) = 'on',
    'the opt-out page reads "on" for a live token');
SELECT pg_temp.assert(public.email_unsubscribe_status(decode(repeat('a1', 32), 'hex')) = 'invalid',
    'a REPLY token cannot open the opt-out page');
SELECT pg_temp.assert(public.email_set_messages_email(decode(repeat('b1', 32), 'hex'), false) = 'off',
    'one click turns the messages email off');
SELECT pg_temp.assert(
    (SELECT channels = '{"messages": {"email": false}}'::jsonb FROM public.notification_preference
      WHERE user_id = :jordan_user::uuid),
    'it writes channels.messages.email = false and nothing else');
SELECT pg_temp.assert(
    EXISTS (SELECT 1 FROM public.audit_event WHERE event_type = 'notification_preference.updated'
             AND actor_user_id = :jordan_user::uuid AND metadata ->> 'on' = 'false'),
    'and is audited');

SELECT pg_temp.advisor_says(:conv::uuid, :r5::uuid, 'See you Saturday!', false);
UPDATE public.email_outbox SET due_at = now() - interval '1 minute' WHERE state = 'pending';
SELECT pg_temp.assert((SELECT count(*) FROM public.email_claim_due()) = 0,
    'an opted-out client''s queued email is not claimed');
SELECT pg_temp.assert(
    (SELECT state = 'skipped' AND skip_reason = 'opted_out' FROM public.email_outbox
      WHERE latest_message_id = :r5::uuid),
    'it is skipped, with the reason');

SELECT pg_temp.assert(public.email_set_messages_email(decode(repeat('b1', 32), 'hex'), true) = 'on',
    '"Turn them back on" works through the same token');
SELECT pg_temp.assert(
    (SELECT channels -> 'messages' -> 'email' = 'true'::jsonb FROM public.notification_preference
      WHERE user_id = :jordan_user::uuid),
    'and only flips that one switch');
SELECT pg_temp.assert(public.email_set_messages_email(decode(repeat('ee', 32), 'hex'), false) = 'invalid',
    'an unknown token changes nothing');

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. A reply by email
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE public.conversation SET agent_unread_count = 0 WHERE id = :conv::uuid;

SELECT pg_temp.assert(
    (SELECT outcome = 'unknown_token' AND reply_to IS NULL FROM public.email_inbound_record(
        'rs-1', decode(repeat('ee', 32), 'hex'), :jordan_email, true, 'Thanks!', 0, :in1::uuid)),
    'an unknown token is rejected, with no one to answer');
SELECT pg_temp.assert(
    (SELECT outcome = 'unknown_token' FROM public.email_inbound_record(
        'rs-2', decode(repeat('b1', 32), 'hex'), :jordan_email, true, 'Thanks!', 0, :in1::uuid)),
    'an UNSUBSCRIBE token cannot post a reply');
SELECT pg_temp.assert(
    (SELECT outcome = 'sender_mismatch' AND reply_to IS NULL FROM public.email_inbound_record(
        'rs-3', decode(repeat('a1', 32), 'hex'), 'someone.else@example.com', true, 'Thanks!', 0, :in1::uuid)),
    'the right token from the wrong address is rejected');
SELECT pg_temp.assert(
    (SELECT outcome = 'sender_mismatch' FROM public.email_inbound_record(
        'rs-4', decode(repeat('a1', 32), 'hex'), :jordan_email, false, 'Thanks!', 0, :in1::uuid)),
    'the right address that failed SPF/DKIM is rejected (From is easy to fake)');
SELECT pg_temp.assert(
    (SELECT outcome = 'empty' FROM public.email_inbound_record(
        'rs-5', decode(repeat('a1', 32), 'hex'), :jordan_email, true, E'  \n\t ', 0, :in1::uuid)),
    'a reply with no new words is rejected');
SELECT pg_temp.assert(
    (SELECT outcome = 'too_long' FROM public.email_inbound_record(
        'rs-6', decode(repeat('a1', 32), 'hex'), :jordan_email, true, repeat('a', 8001), 0, :in1::uuid)),
    'a reply over the message ceiling is rejected');
SELECT pg_temp.assert(
    (SELECT outcome = 'auto_reply' AND reply_to IS NULL FROM public.email_inbound_record(
        'rs-6b', decode(repeat('a1', 32), 'hex'), :jordan_email, true, 'I am away until Monday.', 0, :in1::uuid, true)),
    'an out-of-office answer, even with a good token and sender, is dropped');
SELECT pg_temp.assert(
    NOT EXISTS (SELECT 1 FROM public.message WHERE id = :in1::uuid)
    AND (SELECT count(*) FROM public.inbound_email WHERE outcome <> 'accepted') = 7,
    'no rejection writes a message, and each is counted once');

SELECT pg_temp.assert(
    (SELECT outcome = 'accepted' AND message_id = :in1::uuid AND NOT duplicate AND reply_to = :jordan_email
       FROM public.email_inbound_record(
        'rs-7', decode(repeat('a1', 32), 'hex'), upper(:jordan_email), true,
        'Perfect, see you then!', 2, :in1::uuid)),
    'the right token from the verified sender (any case) is accepted');
SELECT pg_temp.assert(
    (SELECT sender_role = 'client' AND channel = 'email' AND NOT is_internal_note
            AND sender_user_id = :jordan_user::uuid AND body = 'Perfect, see you then!'
       FROM public.message WHERE id = :in1::uuid),
    'it is a client message in the thread, marked as by email');
SELECT pg_temp.assert(
    (SELECT agent_unread_count = 1 AND last_message_preview = 'Perfect, see you then!'
       FROM public.conversation WHERE id = :conv::uuid),
    'and lands like an in-app message: the advisor''s count and the preview move');
SELECT pg_temp.assert(
    (SELECT files_dropped = 2 FROM public.inbound_email WHERE provider_email_id = 'rs-7')
    AND EXISTS (SELECT 1 FROM public.audit_event WHERE target_id = :in1::uuid
                 AND event_type = 'message.created' AND metadata ->> 'channel' = 'email'),
    'the dropped files are counted, and the message is audited');

SELECT pg_temp.assert(
    (SELECT duplicate AND outcome = 'accepted' AND message_id = :in1::uuid FROM public.email_inbound_record(
        'rs-7', decode(repeat('a1', 32), 'hex'), :jordan_email, true, 'Perfect, see you then!', 2, :in2::uuid)),
    'a retried webhook is a no-op that answers the first outcome');
SELECT pg_temp.assert(
    NOT EXISTS (SELECT 1 FROM public.message WHERE id = :in2::uuid)
    AND (SELECT agent_unread_count FROM public.conversation WHERE id = :conv::uuid) = 1,
    'and writes no second message');

UPDATE public.email_token SET expires_at = now() - interval '1 second' WHERE token_hash = decode(repeat('a1', 32), 'hex');
SELECT pg_temp.assert(
    (SELECT outcome = 'expired_token' FROM public.email_inbound_record(
        'rs-8', decode(repeat('a1', 32), 'hex'), :jordan_email, true, 'Hello again', 0, :in2::uuid)),
    'an expired token is rejected');
UPDATE public.email_token SET expires_at = now() + interval '1 day' WHERE token_hash = decode(repeat('a1', 32), 'hex');
UPDATE public.conversation SET archived_at = now() WHERE id = :conv::uuid;
SELECT pg_temp.assert(
    (SELECT outcome = 'thread_closed' FROM public.email_inbound_record(
        'rs-9', decode(repeat('a1', 32), 'hex'), :jordan_email, true, 'Hello again', 0, :in2::uuid)),
    'a reply to a thread the client deleted is rejected');
UPDATE public.conversation SET archived_at = NULL WHERE id = :conv::uuid;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Privileges, and the advisor's view
-- ─────────────────────────────────────────────────────────────────────────────

SELECT pg_temp.become(:jordan_account::uuid);
SELECT pg_temp.expect_denied('SELECT * FROM public.email_claim_due()', 'a client cannot claim emails');
SELECT pg_temp.expect_denied('SELECT * FROM public.email_outbox', 'a client cannot read the queue');
SELECT pg_temp.expect_denied('SELECT * FROM public.email_token', 'a client cannot read the tokens');
SELECT pg_temp.expect_denied(
    format('SELECT public.email_set_messages_email(%L, false)', decode(repeat('b1', 32), 'hex')),
    'a client cannot call the opt-out directly');
SELECT pg_temp.expect_denied('SELECT emailed_at FROM public.message LIMIT 1',
    'a client cannot read emailed_at');
RESET role;

SELECT pg_temp.become(:gyasi_account::uuid);
SELECT pg_temp.assert(
    (SELECT emailed_at IS NOT NULL AND channel = 'app' FROM public.agent_conversation_messages(:conv::uuid)
      WHERE message_id = :r3::uuid)
    AND (SELECT channel = 'email' AND emailed_at IS NULL FROM public.agent_conversation_messages(:conv::uuid)
          WHERE message_id = :in1::uuid),
    'the advisor''s thread reads the Emailed mark and the by-email channel');
SELECT pg_temp.expect_denied('SELECT * FROM public.email_outbox', 'an advisor cannot read the queue either');
RESET role;

ROLLBACK;
