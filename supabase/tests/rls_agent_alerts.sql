-- §3.12 Agent Settings, PR 2 — alerts, rest hours, quote requests, signature, auto-reply.
--
-- WHAT THIS FILE IS GUARDING.
--
--   1. The alert switches: §3.12.3's defaults (a missing key is the default, not "on"), the
--      Notifications save (audited; unchanged writes nothing), and that the switches decide.
--   2. Rest hours follow working hours and time away (agent_rest_until), against fixed times.
--   3. A client message: an alert email only with its switch on, carrying no words; reading
--      the thread clears it; push only with its switch on.
--   4. A quote request: alert_quote_request() queues the email and the push, and the claim
--      hands out the trip's destination and dates; a trip that is not an inquiry alerts no one.
--   5. The out-of-office auto-reply: once per thread per block, as the advisor, tagged, raising
--      the client's count (so it is emailed) and never the advisor's read state, and never
--      counting as an answer on the reply-owed clock.
--   6. The signature save (the default stores NULL), the time-away reply rule, and the grants.
--
-- Run against a freshly reset local database:
--     supabase db reset
--     psql "$(supabase status -o json | jq -r .DB_URL)" -v ON_ERROR_STOP=1 \
--          -f supabase/tests/rls_agent_alerts.sql

\set ON_ERROR_STOP on

BEGIN;

\set gyasi    '''0195a2c0-1a00-7000-8000-000000000010'''
\set jordan   '''0195a2c0-1a00-7000-8000-000000000011'''
\set agent    '''0195a2c0-1a00-7000-8000-000000000001'''
\set conv     '''0195a2c0-1a00-7000-8000-0000000000b0'''
\set z_agent  '''0c312a00-0000-7000-8000-000000000001'''
\set off_z    '''0c312a00-0000-7000-8000-000000000101'''
\set off_now  '''0c312a00-0000-7000-8000-000000000102'''
\set off_new  '''0c312a00-0000-7000-8000-000000000103'''
\set msg1     '''0c312a00-0000-7000-8000-000000000201'''
\set msg2     '''0c312a00-0000-7000-8000-000000000202'''
\set trip_q   '''0c312a00-0000-7000-8000-000000000301'''

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

-- A client message in the seed thread, recorded the way trip-message records one.
CREATE OR REPLACE FUNCTION pg_temp.client_writes(p_conv uuid, p_msg uuid, p_body text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO public.message (id, conversation_id, sender_user_id, sender_role, body, created_at)
    SELECT p_msg, p_conv, pu.id, 'client', p_body, clock_timestamp()
      FROM public.conversation cv
      JOIN public.platform_user pu ON pu.client_id = cv.client_id AND pu.role = 'client'
     WHERE cv.id = p_conv;
    PERFORM public.conversation_record_client_message(p_msg);
END;
$$;

SELECT pu.id AS actor FROM public.platform_user pu WHERE pu.account_id = :gyasi::uuid \gset
\set actor '''':actor''''

-- Start every thread read, every queue empty, so what this file queues is all there is.
UPDATE public.conversation SET agent_unread_count = 0 WHERE agent_id = :agent::uuid;
DELETE FROM public.push_outbox;
DELETE FROM public.agent_alert_email;
DELETE FROM public.email_outbox;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Switches
-- ─────────────────────────────────────────────────────────────────────────────

SELECT pg_temp.assert(
    public.agent_alert_on(:agent::uuid, 'client_messages', 'push')
    AND NOT public.agent_alert_on(:agent::uuid, 'client_messages', 'email')
    AND public.agent_alert_on(:agent::uuid, 'quote_requests', 'push')
    AND public.agent_alert_on(:agent::uuid, 'quote_requests', 'email'),
    'with no saved row, the §3.12.3 defaults: client messages push only, quote requests both');

SELECT pg_temp.assert(
    public.agent_settings_update_notifications(:agent::uuid, true, false, true, true,
        public.uuid_v7(), :actor::uuid, null, 'test') = 'unchanged'
    AND NOT EXISTS (SELECT 1 FROM public.audit_event WHERE event_type = 'agent.notifications_updated'),
    'saving the defaults unchanged writes nothing and audits nothing');

SELECT public.agent_settings_update_notifications(:agent::uuid, true, true, true, true,
        public.uuid_v7(), :actor::uuid, null, 'test') AS r \gset
SELECT pg_temp.assert(
    :'r' = 'updated'
    AND public.agent_alert_on(:agent::uuid, 'client_messages', 'email')
    AND (SELECT metadata -> 'changes' -> 'clientMessages' ->> 'to' FROM public.audit_event
          WHERE event_type = 'agent.notifications_updated') IS NOT NULL,
    'turning client-message email on saves and audits the change');

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Rest hours from working hours and time away (fixed times, a UTC advisor)
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.agent (id, display_name, email, status, time_zone)
VALUES (:z_agent::uuid, 'Zone Test', 'zone.test@example.com', 'active', 'UTC');
UPDATE public.agent_availability
   SET weekly_schedule = '{"mon":{"start":"09:00","end":"17:00"},"tue":{"start":"09:00","end":"17:00"},'
                         '"wed":{"start":"09:00","end":"17:00"},"thu":{"start":"09:00","end":"17:00"},'
                         '"fri":{"start":"09:00","end":"17:00"},"sat":null,"sun":null}'
 WHERE agent_id = :z_agent::uuid;

-- 2026-10-19 is a Monday.
SELECT pg_temp.assert(
    (SELECT due_at = '2026-10-19 10:00+00' AND reason IS NULL
       FROM public.agent_rest_until(:z_agent::uuid, '2026-10-19 10:00+00')),
    'inside working hours: now, no reason');
SELECT pg_temp.assert(
    (SELECT due_at = '2026-10-20 09:00+00' AND reason = 'rest'
       FROM public.agent_rest_until(:z_agent::uuid, '2026-10-19 18:00+00')),
    'after hours: the next morning''s start, for rest');
SELECT pg_temp.assert(
    (SELECT due_at = '2026-10-19 09:00+00' AND reason = 'rest'
       FROM public.agent_rest_until(:z_agent::uuid, '2026-10-17 12:00+00')),
    'a Saturday (a day off): Monday''s start');
SELECT pg_temp.assert(
    (SELECT due_at = '2026-10-19 09:00+00'
       FROM public.agent_rest_until(:z_agent::uuid, '2026-10-19 08:59+00')),
    'early on a working day: that day''s start');

INSERT INTO public.agent_time_off (id, agent_id, starts_on, ends_on)
VALUES (:off_z::uuid, :z_agent::uuid, '2026-10-20', '2026-10-21');
SELECT pg_temp.assert(
    (SELECT due_at = '2026-10-22 09:00+00' AND reason = 'away'
       FROM public.agent_rest_until(:z_agent::uuid, '2026-10-19 18:00+00')),
    'time away is skipped, and the reason says away');
SELECT pg_temp.assert(
    (SELECT due_at = '2026-10-22 09:00+00' AND reason = 'away'
       FROM public.agent_rest_until(:z_agent::uuid, '2026-10-20 11:00+00')),
    'during time away, even inside working hours: the first working day after it');

UPDATE public.agent_availability
   SET weekly_schedule = '{"mon":null,"tue":null,"wed":null,"thu":null,"fri":null,"sat":null,"sun":null}'
 WHERE agent_id = :z_agent::uuid;
SELECT pg_temp.assert(
    (SELECT due_at = '2026-10-19 18:00+00' AND reason IS NULL
       FROM public.agent_rest_until(:z_agent::uuid, '2026-10-19 18:00+00')),
    'an advisor with no working day at all is never held (a notification that could never go)');

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. A client message
-- ─────────────────────────────────────────────────────────────────────────────

-- A device, so push has somewhere to go.
INSERT INTO public.push_device (id, platform_user_id, platform, web_endpoint, web_p256dh, web_auth)
VALUES (public.uuid_v7(), :actor::uuid, 'web', 'https://push.example.com/abc', 'k', 'a');

-- Built at run time: the repo's card-number guard refuses the literal (CLAUDE.md rule 1).
SELECT pg_temp.client_writes(:conv::uuid, :msg1::uuid, 'Card ' || repeat('4242 ', 3) || '4242, see you soon');
SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_alert_email
      WHERE conversation_id = :conv::uuid AND state = 'pending' AND kind = 'client_message') = 1,
    'with email on, a client message queues one alert email');
SELECT pg_temp.assert(
    (SELECT count(*) FROM public.push_outbox WHERE conversation_id = :conv::uuid AND state = 'pending') = 1,
    'and, with push on and a device, one push');
SELECT pg_temp.assert(
    (SELECT (p.held AND p.hold_reason IS NOT NULL) OR (NOT p.held AND p.hold_reason IS NULL)
       FROM public.push_outbox p WHERE p.conversation_id = :conv::uuid AND p.state = 'pending'),
    'a held push says why; a live one does not');

SELECT pg_temp.client_writes(:conv::uuid, :msg2::uuid, 'And one more thing');
SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_alert_email WHERE conversation_id = :conv::uuid) = 1,
    'a second message adds no second email while the first waits');

SELECT pg_temp.assert(
    (SELECT to_jsonb(c) ?& ARRAY['recipient', 'client_name', 'trip_title']
            AND NOT to_jsonb(c) ? 'body' AND NOT to_jsonb(c)::text LIKE '%4242%'
            AND c.recipient = 'gyasi@example.com'
       FROM public.agent_alert_email_claim(10) c),
    'the claim carries the name, trip and sign-in address, and never the client''s words');
SELECT pg_temp.assert(
    public.agent_alert_email_finish(
        (SELECT id FROM public.agent_alert_email WHERE state = 'sending' LIMIT 1), true) = 'sent',
    'a sent alert is marked sent');

-- Read: what is still waiting is cleared.
SELECT pg_temp.client_writes(:conv::uuid, public.uuid_v7(), 'Third');
UPDATE public.conversation SET agent_unread_count = 0 WHERE id = :conv::uuid;
SELECT pg_temp.assert(
    NOT EXISTS (SELECT 1 FROM public.agent_alert_email WHERE conversation_id = :conv::uuid AND state = 'pending')
    AND NOT EXISTS (SELECT 1 FROM public.push_outbox WHERE conversation_id = :conv::uuid AND state = 'pending'),
    'reading the thread clears the waiting email and push');

-- Both client-message switches off: nothing queued.
SELECT public.agent_settings_update_notifications(:agent::uuid, false, false, true, true,
        public.uuid_v7(), :actor::uuid, null, 'test') AS r \gset
DELETE FROM public.push_outbox;
SELECT pg_temp.client_writes(:conv::uuid, public.uuid_v7(), 'Anyone there?');
SELECT pg_temp.assert(
    NOT EXISTS (SELECT 1 FROM public.push_outbox WHERE conversation_id = :conv::uuid)
    AND NOT EXISTS (SELECT 1 FROM public.agent_alert_email WHERE conversation_id = :conv::uuid AND state = 'pending'),
    'with both client-message switches off, nothing is queued');
UPDATE public.conversation SET agent_unread_count = 0 WHERE id = :conv::uuid;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. A quote request
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.trip (id, client_id, agent_id, title, trip_type, start_date, end_date, destinations)
SELECT :trip_q::uuid, cv.client_id, :agent::uuid, 'Hotel in Negril', (enum_range(null::trip_type))[1],
       '2027-02-10', '2027-02-14', ARRAY['Negril', 'Jamaica']
  FROM public.conversation cv WHERE cv.id = :conv::uuid;

SELECT pg_temp.assert(public.alert_quote_request(:trip_q::uuid) = 'email push',
    'a quote request queues the email and the push (both on by default)');
SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_alert_email WHERE trip_id = :trip_q::uuid AND kind = 'quote_request') = 1,
    'one quote-request email');

UPDATE public.push_outbox SET due_at = now() - interval '1 minute' WHERE trip_id = :trip_q::uuid;
SELECT pg_temp.assert(
    (SELECT c.kind = 'quote_request' AND c.trip_id = :trip_q::uuid AND c.destination = 'Negril, Jamaica'
            AND c.start_date = '2027-02-10' AND c.end_date = '2027-02-14' AND c.client_name IS NOT NULL
            AND c.preview IS NULL
       FROM public.push_claim_due(50) c WHERE c.kind = 'quote_request'),
    'the claim hands out the quote request with destination and dates, and no message preview');

UPDATE public.trip SET status = 'proposal' WHERE id = :trip_q::uuid;
SELECT pg_temp.assert(public.alert_quote_request(:trip_q::uuid) = 'none',
    'a trip that is not an inquiry alerts no one');

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. The auto-reply
-- ─────────────────────────────────────────────────────────────────────────────

SELECT public.agent_local_today(:agent::uuid) AS today \gset
\set today '''':today''''

SELECT pg_temp.assert(
    public.agent_settings_save_time_off(:off_new::uuid, :agent::uuid, true, :today::date + 5, :today::date + 6,
        null, true, '   ', public.uuid_v7(), :actor::uuid, null, 'test') = 'reply_needs_text',
    'an auto-reply that is on needs its words');

-- Spaces inside the braces are accepted on save, so they must be filled on send too.
INSERT INTO public.agent_time_off (id, agent_id, starts_on, ends_on, auto_reply_enabled, auto_reply_text)
VALUES (:off_now::uuid, :agent::uuid, :today::date - 1, :today::date + 2, true,
        'Thanks for writing! I''m away resting until {{ return_date }}.');

SELECT cv.client_unread_count AS c_before FROM public.conversation cv WHERE cv.id = :conv::uuid \gset
SELECT pg_temp.client_writes(:conv::uuid, public.uuid_v7(), 'Hello while you are away');

SELECT pg_temp.assert(
    (SELECT count(*) FROM public.message m WHERE m.conversation_id = :conv::uuid AND m.is_auto_reply) = 1
    AND (SELECT m.sender_role = 'agent' AND m.body LIKE 'Thanks for writing! I''m away resting until %day, %.'
                AND m.body NOT LIKE '%{{%'
           FROM public.message m WHERE m.conversation_id = :conv::uuid AND m.is_auto_reply),
    'one automatic reply, from the advisor, with the return date filled in');
SELECT pg_temp.assert(
    (SELECT cv.agent_unread_count = 1 AND cv.client_unread_count = :c_before + 1
       FROM public.conversation cv WHERE cv.id = :conv::uuid),
    'it raises the client''s count (so it is emailed) and leaves the thread unread for the advisor');
SELECT pg_temp.assert(
    EXISTS (SELECT 1 FROM public.email_outbox o WHERE o.conversation_id = :conv::uuid AND o.state = 'pending'),
    'and the usual message email is queued for the client');

SELECT public.agent_settings_update_notifications(:agent::uuid, true, true, true, true,
        public.uuid_v7(), :actor::uuid, null, 'test') AS r \gset
-- A client merge raises the count by MOVING old messages (UPDATE), not writing new ones: no
-- second reply, no alert email (20261024120000's merge raises agent_unread_count on the kept thread).
DELETE FROM public.agent_alert_email;
UPDATE public.conversation SET agent_unread_count = agent_unread_count + 2 WHERE id = :conv::uuid;
SELECT pg_temp.assert(
    NOT EXISTS (SELECT 1 FROM public.agent_alert_email),
    'a raised count with no new message (a merge) queues no alert email');

SELECT pg_temp.client_writes(:conv::uuid, public.uuid_v7(), 'And again');
SELECT pg_temp.assert(
    (SELECT count(*) FROM public.message m WHERE m.conversation_id = :conv::uuid AND m.is_auto_reply) = 1,
    'a second client message in the same block gets no second reply');

-- agent_threads_for_current_agent() is internal (no client role may run it), so it is read as
-- the owner with the advisor's claims set; the accessor below is read as the advisor.
SELECT set_config('request.jwt.claims',
    json_build_object('sub', :gyasi, 'role', 'authenticated', 'aal', 'aal2')::text, true);
SELECT pg_temp.assert(
    (SELECT th.last_sender_role = 'client' AND th.awaiting_since IS NOT NULL
       FROM public.agent_threads_for_current_agent() th WHERE th.conversation_id = :conv::uuid),
    'the reply-owed clock still runs: an automatic reply is not an answer');
SELECT pg_temp.become(:gyasi::uuid, 'aal2');
SELECT pg_temp.assert(
    (SELECT bool_or(x.is_auto_reply) FROM public.agent_conversation_messages(:conv::uuid) x),
    'the advisor''s thread carries the tag');
RESET role;

SELECT pg_temp.become(:jordan::uuid);
SELECT pg_temp.assert(
    (SELECT count(*) FROM public.message m WHERE m.conversation_id = :conv::uuid AND m.is_auto_reply) = 1,
    'the client can read the tag');
SELECT pg_temp.expect_denied('SELECT * FROM public.agent_alert_email',
    'a client cannot read the advisor''s alert queue');
SELECT pg_temp.expect_denied('SELECT * FROM public.agent_auto_reply',
    'a client cannot read the auto-reply ledger');
SELECT pg_temp.expect_denied(format('SELECT public.alert_quote_request(%L)', :trip_q),
    'a client cannot raise a quote-request alert directly');
RESET role;

SELECT pg_temp.become(:gyasi::uuid, 'aal2');
SELECT pg_temp.expect_denied(format(
    'SELECT public.agent_settings_update_notifications(%L, true, true, true, true, public.uuid_v7(), %L, null, null)',
    :agent, :actor), 'an advisor cannot call the notifications write directly');
SELECT pg_temp.expect_denied(format('SELECT * FROM public.agent_signature_for_conversation(%L)', :conv),
    'nor read the signature helper');
RESET role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. The signature
-- ─────────────────────────────────────────────────────────────────────────────

SELECT pg_temp.assert(
    public.agent_settings_update_signature(:agent::uuid, public.agent_default_signature(),
        public.uuid_v7(), :actor::uuid, null, 'test') = 'unchanged',
    'saving the default text is no change: NULL stays NULL, so a new default reaches them');
SELECT public.agent_settings_update_signature(:agent::uuid, E'Gyasi\nTravel Advisor',
        public.uuid_v7(), :actor::uuid, null, 'test') AS r \gset
SELECT pg_temp.assert(
    :'r' = 'updated'
    AND (SELECT email_signature FROM public.agent WHERE id = :agent::uuid) = E'Gyasi\nTravel Advisor'
    AND (SELECT signature FROM public.agent_signature_for_conversation(:conv::uuid)) = E'Gyasi\nTravel Advisor',
    'a custom signature saves, and the email helper reads it');
SELECT pg_temp.expect_error(format(
    'SELECT public.agent_settings_update_signature(%L, %L, public.uuid_v7(), %L, null, null)',
    :agent, repeat(E'line\n', 8) || 'ninth', :actor), '23514', 'nine lines are refused by the table');

ROLLBACK;
