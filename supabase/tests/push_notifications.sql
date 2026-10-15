-- §3.10 Stage 3b: the notification queue (Data-Model §12.6 / §12.7).
--
-- WHAT THIS FILE IS GUARDING.
--
--   1. A client's message queues a notification ONLY for an advisor with a device; a second
--      message updates the same row (one notification per thread).
--   2. An internal note and the advisor's own reply never queue anything.
--   3. Reading a thread before it went clears it; reading after it went owes a dismiss.
--   4. Claiming is exclusive: a claimed row is not handed out again.
--   5. Devices: advisors only; a token moves to whoever signed in last; unregister removes
--      only the caller's own.
--   6. Everything is service-role only.
--
-- The rest-hours edges are asserted in the migration itself (push_due_at). Here `held` is
-- checked against push_due_at(now()), because now() is the real clock in this transaction.
--
-- Run against a freshly reset local database:
--     supabase db reset
--     psql "$(supabase status -o json | jq -r .DB_URL)" -v ON_ERROR_STOP=1 \
--          -f supabase/tests/push_notifications.sql

\set ON_ERROR_STOP on

BEGIN;

\set gyasi_account '''0195a2c0-1a00-7000-8000-000000000010'''
\set jordan_account '''0195a2c0-1a00-7000-8000-000000000011'''
\set agent        '''0195a2c0-1a00-7000-8000-000000000001'''
\set conv         '''0195a2c0-1a00-7000-8000-0000000000b0'''
\set dev_web      '''0e7f0000-0000-7000-8000-0000000000d1'''
\set dev_android  '''0e7f0000-0000-7000-8000-0000000000d2'''
\set m1           '''0e7f0000-0000-7000-8000-0000000000f1'''
\set m2           '''0e7f0000-0000-7000-8000-0000000000f2'''
\set m3           '''0e7f0000-0000-7000-8000-0000000000f3'''
\set note         '''0e7f0000-0000-7000-8000-0000000000f4'''

CREATE OR REPLACE FUNCTION pg_temp.assert(condition boolean, description text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    IF condition THEN RAISE NOTICE '  ok    %', description;
    ELSE RAISE EXCEPTION 'FAILED: %', description;
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.expect_raise(stmt text, fragment text, description text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    EXECUTE stmt;
    RAISE EXCEPTION 'FAILED: % — statement succeeded', description;
EXCEPTION
    WHEN OTHERS THEN
        IF SQLERRM LIKE 'FAILED:%' THEN RAISE; END IF;
        IF position(fragment IN SQLERRM) = 0 THEN
            RAISE EXCEPTION 'FAILED: % — expected "%", got %', description, fragment, SQLERRM;
        END IF;
        RAISE NOTICE '  ok    %', description;
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

SELECT pu.id AS gyasi_user FROM public.platform_user pu WHERE pu.account_id = :gyasi_account::uuid \gset
SELECT pu.id AS jordan_user FROM public.platform_user pu WHERE pu.account_id = :jordan_account::uuid \gset
\set gyasi_user '''':gyasi_user''''
\set jordan_user '''':jordan_user''''

-- A client message, the way trip-message records one: the row, then the thread bump.
CREATE OR REPLACE FUNCTION pg_temp.client_says(p_id uuid, p_body text, p_user uuid)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO public.message (id, conversation_id, sender_user_id, sender_role, body, created_at)
    VALUES (p_id, '0195a2c0-1a00-7000-8000-0000000000b0', p_user, 'client', p_body, clock_timestamp());
    PERFORM public.conversation_record_client_message(p_id);
END;
$$;

-- Start from a read thread, so the unread count has somewhere to rise from.
UPDATE public.conversation SET agent_unread_count = 0 WHERE id = :conv::uuid;
DELETE FROM public.push_outbox;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. No device, no queue
-- ─────────────────────────────────────────────────────────────────────────────

SELECT pg_temp.client_says(:m1::uuid, 'Is the transfer included?', :jordan_user::uuid);
SELECT pg_temp.assert((SELECT count(*) FROM public.push_outbox) = 0,
    'an advisor with no device gets no queued notification');

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Devices
-- ─────────────────────────────────────────────────────────────────────────────

SELECT pg_temp.expect_raise(
    format('SELECT public.push_register_device(%L, %L, ''web'', NULL, ''https://push.example.com/a'', ''k'', ''a'', NULL)', :jordan_user, :dev_web),
    'notifications are for advisors', 'a traveler cannot register (advisors only in 3b)');

SELECT pg_temp.assert(
    public.push_register_device(:gyasi_user::uuid, :dev_web::uuid, 'web', NULL,
        'https://push.example.com/a', 'p256dh-key', 'auth-key', 'Chrome · macOS') = :dev_web::uuid,
    'the advisor registers a browser');
SELECT pg_temp.assert(
    public.push_register_device(:gyasi_user::uuid, gen_random_uuid(), 'web', NULL,
        'https://push.example.com/a', 'p256dh-key-2', 'auth-key-2', 'Chrome · macOS') = :dev_web::uuid,
    're-registering the same endpoint refreshes that device, never a second row');
SELECT pg_temp.assert(
    (SELECT web_p256dh FROM public.push_device WHERE id = :dev_web::uuid) = 'p256dh-key-2',
    'and takes the new keys');
SELECT pg_temp.expect_raise(
    format('INSERT INTO public.push_device (id, platform_user_id, platform, fcm_token) VALUES (%L, %L, ''web'', ''tok'')', gen_random_uuid(), :gyasi_user),
    'push_device_check', 'a web device must carry a web subscription, not an FCM token');

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Queue: one row per thread
-- ─────────────────────────────────────────────────────────────────────────────

SELECT pg_temp.client_says(:m2::uuid, 'Also, can we add a spa day?', :jordan_user::uuid);
SELECT pg_temp.assert(
    (SELECT count(*) = 1 AND bool_and(state = 'pending' AND message_count = 1 AND latest_message_id = :m2::uuid)
       FROM public.push_outbox),
    'a client message queues one pending notification about it');
SELECT pg_temp.assert(
    (SELECT held = (public.push_due_at(now(), (SELECT time_zone FROM public.agent WHERE id = :agent::uuid)) > now())
       FROM public.push_outbox),
    'held is exactly "this fell in rest hours"');

SELECT pg_temp.client_says(:m3::uuid, 'And a late checkout!', :jordan_user::uuid);
SELECT pg_temp.assert(
    (SELECT count(*) = 1 AND bool_and(message_count = 2 AND latest_message_id = :m3::uuid) FROM public.push_outbox),
    'a second message updates the same row: one notification per thread');

-- An internal note never moves the client-message count, so it queues nothing.
INSERT INTO public.message (id, conversation_id, sender_user_id, sender_role, body, is_internal_note)
VALUES (:note::uuid, :conv::uuid, :gyasi_user::uuid, 'agent', 'private', true);
SELECT pg_temp.assert(
    (SELECT message_count FROM public.push_outbox WHERE state = 'pending') = 2,
    'an internal note queues nothing');

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Claim, send
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE public.push_outbox SET due_at = now() - interval '1 second', held = false;

CREATE TEMP TABLE claim1 AS SELECT * FROM public.push_claim_due(10);
SELECT pg_temp.assert(
    (SELECT count(*) = 1 AND bool_and(preview = 'And a late checkout!' AND message_count = 2
            AND client_name LIKE '% %' AND trip_title IS NOT NULL) FROM claim1),
    'a due row is claimed with the preview, the client and the trip');
SELECT pg_temp.assert((SELECT count(*) FROM public.push_claim_due(10)) = 0,
    'a claimed row is not handed out twice');
SELECT pg_temp.assert(
    (SELECT count(*) FROM public.push_devices_for_agent(:agent::uuid)) = 1,
    'the advisor''s devices are listed for the send');

SELECT pg_temp.assert(public.push_finish((SELECT outbox_id FROM claim1), true) = 'sent', 'finish ok marks it sent');
SELECT pg_temp.assert(public.push_finish((SELECT outbox_id FROM claim1), true) = 'not_claimed',
    'finishing twice changes nothing');

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Clear and dismiss
-- ─────────────────────────────────────────────────────────────────────────────

-- Read after it was sent: a dismiss is owed.
UPDATE public.conversation SET agent_unread_count = 0 WHERE id = :conv::uuid;
SELECT pg_temp.assert(
    (SELECT needs_dismiss FROM public.push_outbox WHERE id = (SELECT outbox_id FROM claim1)),
    'reading a sent thread owes a dismiss to every device');
-- Two statements: a statement cannot see the row its own function call just updated.
SELECT pg_temp.assert((SELECT count(*) FROM public.push_claim_dismissals(10)) = 1,
    'the owed dismiss is claimed');
SELECT pg_temp.assert(NOT (SELECT needs_dismiss FROM public.push_outbox WHERE id = (SELECT outbox_id FROM claim1))
    AND (SELECT count(*) FROM public.push_claim_dismissals(10)) = 0,
    'and only once');

-- Read BEFORE it went: cleared, never sent.
SELECT pg_temp.client_says(gen_random_uuid(), 'One more thing', :jordan_user::uuid);
UPDATE public.conversation SET agent_unread_count = 0 WHERE id = :conv::uuid;
SELECT pg_temp.assert(
    (SELECT state FROM public.push_outbox ORDER BY created_at DESC LIMIT 1) = 'cleared',
    'a thread read before its notification went is cleared, not sent');

-- A failed send retries later, then gives up after three.
SELECT pg_temp.client_says(gen_random_uuid(), 'Hello?', :jordan_user::uuid);
UPDATE public.push_outbox SET due_at = now() - interval '1 second' WHERE state = 'pending';
CREATE TEMP TABLE claim2 AS SELECT * FROM public.push_claim_due(10);
SELECT pg_temp.assert(public.push_finish((SELECT outbox_id FROM claim2), false) = 'pending',
    'a failed send goes back to pending');
SELECT pg_temp.assert((SELECT due_at > now() FROM public.push_outbox WHERE id = (SELECT outbox_id FROM claim2)),
    'a little later');

-- ─────────────────────────────────────────────────────────────────────────────
-- 5b. Races around a send in flight (review findings, 2026-10-15)
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE public.push_outbox SET state = 'sent', needs_dismiss = false WHERE state IN ('pending', 'sending');
UPDATE public.conversation SET agent_unread_count = 0 WHERE id = :conv::uuid;

-- A message while the last one is sending gets a row of its own.
SELECT pg_temp.client_says(gen_random_uuid(), 'First', :jordan_user::uuid);
UPDATE public.push_outbox SET due_at = now() - interval '1 second' WHERE state = 'pending';
CREATE TEMP TABLE claim3 AS SELECT * FROM public.push_claim_due(10);
SELECT pg_temp.client_says(gen_random_uuid(), 'Second, while the first is in flight', :jordan_user::uuid);
SELECT pg_temp.assert(
    (SELECT count(*) FROM public.push_outbox WHERE conversation_id = :conv::uuid AND state = 'pending') = 1,
    'a message during a send queues its own notification, not folded into the one in flight');

-- That send fails: the newer pending row will say it, so the failed one is cleared.
SELECT pg_temp.assert(public.push_finish((SELECT outbox_id FROM claim3), false) = 'cleared',
    'a failed send with a newer one waiting steps aside rather than doubling up');

-- Read while sending: the dismiss waits for the send, then is owed.
UPDATE public.push_outbox SET due_at = now() - interval '1 second' WHERE state = 'pending';
CREATE TEMP TABLE claim4 AS SELECT * FROM public.push_claim_due(10);
UPDATE public.conversation SET agent_unread_count = 0 WHERE id = :conv::uuid;
-- (Older sent rows for this thread may be dismissed now; the one in flight must not be.)
SELECT count(*) FROM public.push_claim_dismissals(10);
SELECT pg_temp.assert((SELECT needs_dismiss FROM public.push_outbox WHERE id = (SELECT outbox_id FROM claim4)),
    'a dismiss never overtakes the notification it dismisses');
SELECT public.push_finish((SELECT outbox_id FROM claim4), true);
SELECT pg_temp.assert((SELECT needs_dismiss FROM public.push_outbox WHERE id = (SELECT outbox_id FROM claim4)),
    'a thread read while its notification was sending is dismissed once it lands');

-- A pass that died mid-send: reclaimed after five minutes, and that counts as a try.
SELECT pg_temp.client_says(gen_random_uuid(), 'Anyone there?', :jordan_user::uuid);
UPDATE public.push_outbox SET due_at = now() - interval '1 second' WHERE state = 'pending';
CREATE TEMP TABLE claim5 AS SELECT * FROM public.push_claim_due(10);
UPDATE public.push_outbox SET claimed_at = now() - interval '6 minutes' WHERE id = (SELECT outbox_id FROM claim5);
SELECT pg_temp.assert((SELECT count(*) FROM public.push_claim_due(10) c WHERE c.outbox_id = (SELECT outbox_id FROM claim5)) = 1,
    'a row stuck sending is handed out again');
SELECT pg_temp.assert((SELECT attempts FROM public.push_outbox WHERE id = (SELECT outbox_id FROM claim5)) = 1,
    'and the stuck attempt counted toward the three');
UPDATE public.push_outbox SET state = 'sent' WHERE state IN ('pending', 'sending');
UPDATE public.conversation SET agent_unread_count = 0 WHERE id = :conv::uuid;

-- An archived advisor is told nothing.
UPDATE public.agent SET status = 'archived' WHERE id = :agent::uuid;
SELECT pg_temp.client_says(gen_random_uuid(), 'Hello?', :jordan_user::uuid);
SELECT pg_temp.assert(NOT EXISTS (SELECT 1 FROM public.push_outbox WHERE state = 'pending'),
    'an archived advisor gets no notification queued');
SELECT pg_temp.assert((SELECT count(*) FROM public.push_devices_for_agent(:agent::uuid)) = 0,
    'nor any device to send to');
UPDATE public.agent SET status = 'active' WHERE id = :agent::uuid;
UPDATE public.conversation SET agent_unread_count = 0 WHERE id = :conv::uuid;

-- A refresh without a label keeps the one it had; an id already taken is refused.
SELECT public.push_register_device(:gyasi_user::uuid, gen_random_uuid(), 'web', NULL,
    'https://push.example.com/a', 'p256dh-key-3', 'auth-key-3', NULL);
SELECT pg_temp.assert((SELECT label FROM public.push_device WHERE id = :dev_web::uuid) = 'Chrome · macOS',
    'a refresh without a label keeps the old one');
SELECT pg_temp.expect_raise(
    format('SELECT public.push_register_device(%L, %L, ''web'', NULL, ''https://push.example.com/b'', ''k'', ''a'', NULL)', :gyasi_user, :dev_web),
    'already in use', 'a device id already taken is refused, not reported as registered');

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Devices move and go
-- ─────────────────────────────────────────────────────────────────────────────

SELECT pg_temp.assert(
    public.push_unregister_device(:jordan_user::uuid, NULL, 'https://push.example.com/a') = 0,
    'unregister touches only the caller''s own devices');
SELECT pg_temp.assert(
    public.push_unregister_device(:gyasi_user::uuid, NULL, 'https://push.example.com/a') = 1,
    'sign-out removes the device');
SELECT pg_temp.assert(NOT EXISTS (SELECT 1 FROM public.push_device WHERE id = :dev_web::uuid),
    'and it is gone');

SELECT public.push_register_device(:gyasi_user::uuid, :dev_android::uuid, 'android', 'fcm-token-1', NULL, NULL, NULL, 'Pixel');
SELECT public.push_device_gone(:dev_android::uuid);
SELECT pg_temp.assert(NOT EXISTS (SELECT 1 FROM public.push_device WHERE id = :dev_android::uuid),
    'a device the service reports gone is forgotten');

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. The tick, and who can call what
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE public.push_outbox SET state = 'sent' WHERE state IN ('pending', 'sending');
UPDATE public.push_outbox SET needs_dismiss = false;
SELECT pg_temp.assert(public.push_dispatch_tick() = 'idle', 'an idle minute makes no HTTP call');
SELECT pg_temp.assert(
    (SELECT count(*) FROM cron.job WHERE jobname = 'push-dispatch' AND schedule = '* * * * *') = 1,
    'the tick is scheduled every minute');

SELECT set_config('role', 'authenticated', true);
SELECT pg_temp.expect_denied('SELECT * FROM public.push_device', 'a signed-in user cannot read devices');
SELECT pg_temp.expect_denied('SELECT * FROM public.push_outbox', 'a signed-in user cannot read the queue');
SELECT pg_temp.expect_denied('SELECT * FROM public.push_claim_due(1)', 'a signed-in user cannot claim');
SELECT pg_temp.expect_denied(
    format('SELECT public.push_register_device(%L, %L, ''web'', NULL, ''x'', ''y'', ''z'', NULL)', :gyasi_user, gen_random_uuid()),
    'a signed-in user cannot register directly (only through push-device)');
RESET ROLE;

ROLLBACK;
