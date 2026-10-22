-- §3.8 Leads (revived 2026-10-21, BRD §6.5, Data-Model §11).
--
-- WHAT THIS FILE IS GUARDING.
--
--   1. Nobody but the service role touches the lead tables or the write functions; the
--      advisor's reads need an aal2 advisor, and return nothing to a client.
--   2. The public form (lead_submit): a new lead; a second message joins the open lead and
--      fills what was missing without overwriting; an email on a client record is saved as
--      "Already a client" (converted at once); five sends an hour per address, then refused.
--   3. Every form message alerts through the quote-request switch: email by default, push only
--      with a device, and the claims hand out the lead's name, not the words.
--   4. The advisor's actions and their refusals, including reopen's one-open-lead conflict and
--      that a converted lead cannot be deleted as spam.
--   5. Add lead: an email on a client record writes nothing; on an open lead it joins.
--   6. Linking: a client row made by the advisor links at once; a sign-up links only once its
--      address is confirmed.
--   7. 3.11.9 Lead Sources leaves "Already a client" out and lists every source.
--   8. The sweep: closed leads after 24 months (not before), the throttle after a day.
--
-- Run against a freshly reset local database:
--     supabase db reset
--     psql "$(supabase status -o json | jq -r .DB_URL)" -v ON_ERROR_STOP=1 \
--          -f supabase/tests/rls_leads.sql

\set ON_ERROR_STOP on

BEGIN;

\set agent    '''0195a2c0-1a00-7000-8000-000000000001'''
\set gyasi    '''0195a2c0-1a00-7000-8000-000000000010'''
\set z_agent  '''0c1ead00-0000-7000-8000-000000000001'''
\set signup   '''0c1ead00-0000-7000-8000-000000000002'''

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

-- A form send with the usual extras. Returns the outcome.
CREATE OR REPLACE FUNCTION pg_temp.send(ip text, first text, email text, body text,
                                        last text DEFAULT NULL, phone text DEFAULT NULL)
RETURNS text LANGUAGE sql AS $$
    SELECT s.outcome FROM public.lead_submit(ip, first, last, email, phone, body, 'topic', 'topic',
        'caribbean', 'a Caribbean week', 'instagram', 'social', 'fall') s;
$$;

SELECT pg_temp.assert(public.lead_active_agent() = :agent::uuid, 'the seed has one active advisor');

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Grants
-- ─────────────────────────────────────────────────────────────────────────────

SET LOCAL ROLE anon;
SELECT pg_temp.expect_denied('SELECT 1 FROM public.lead', 'anon cannot read lead');
SELECT pg_temp.expect_denied('SELECT 1 FROM public.lead_message', 'anon cannot read lead_message');
SELECT pg_temp.expect_denied(
    $q$SELECT public.lead_submit('1.1.1.1','A',null,'a@example.com',null,'hi',null,null,null,null,null,null,null)$q$,
    'anon cannot call lead_submit (only the lead-message function can)');
SELECT pg_temp.expect_denied('SELECT * FROM public.agent_leads()', 'anon cannot call agent_leads');
RESET ROLE;

SELECT pg_temp.become(:gyasi::uuid);
SELECT pg_temp.expect_denied('SELECT 1 FROM public.lead', 'the advisor cannot read lead directly');
SELECT pg_temp.expect_denied(
    format($q$SELECT public.agent_lead_write(%L, public.uuid_v7(), 'mark_contacted', null, null, null)$q$, :agent),
    'the advisor cannot call agent_lead_write directly (agent-lead does, after its checks)');
SELECT pg_temp.expect_denied(
    format($q$SELECT public.agent_lead_create(%L, 'A', null, 'a@example.com', null, 'phone', 'x')$q$, :agent),
    'the advisor cannot call agent_lead_create directly');
SELECT pg_temp.expect_denied('SELECT public.lead_retention_sweep()', 'nobody signed in runs the sweep');
RESET ROLE;
RESET request.jwt.claims;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. The public form
-- ─────────────────────────────────────────────────────────────────────────────

SELECT pg_temp.assert(pg_temp.send('10.0.0.1', 'Dana', 'dana@example.com', 'Thinking about a honeymoon.')
                      = 'created', 'a first message makes a lead');
SELECT pg_temp.assert(pg_temp.send('10.0.0.2', 'Dana', 'DANA@example.com', 'Also: June works.', 'Reyes', '555 0100')
                      = 'added', 'a second message from the same email (any case) joins the open lead');
SELECT pg_temp.assert(
    (SELECT count(*) FROM public.lead WHERE email = 'dana@example.com') = 1
    AND (SELECT count(*) FROM public.lead_message m JOIN public.lead l ON l.id = m.lead_id
          WHERE l.email = 'dana@example.com') = 2,
    'one lead, two messages');
SELECT pg_temp.assert(
    (SELECT last_name = 'Reyes' AND phone = '555 0100' AND source = 'website' AND status = 'new'
            AND utm_source = 'instagram' AND NOT already_client
       FROM public.lead WHERE email = 'dana@example.com'),
    'the second message filled the missing last name and phone; the lead is a new website lead');
SELECT pg_temp.send('10.0.0.2', 'Dana', 'dana@example.com', 'One more.', 'Smith', '555 9999');
SELECT pg_temp.assert(
    (SELECT last_name = 'Reyes' AND phone = '555 0100' FROM public.lead WHERE email = 'dana@example.com'),
    'a later message never overwrites what the lead already gave');
SELECT pg_temp.assert(
    (SELECT about_label = 'a Caribbean week' AND page = 'topic' AND NOT entered_by_agent
       FROM public.lead_message m JOIN public.lead l ON l.id = m.lead_id
      WHERE l.email = 'dana@example.com' ORDER BY m.created_at LIMIT 1),
    'each message keeps what the visitor was viewing');

-- Jordan Hayes is a client in the seed.
SELECT pg_temp.assert(pg_temp.send('10.0.0.3', 'Jordan', 'jordan.hayes@example.com', 'Quick question.')
                      = 'already_client', 'an email on a client record is "Already a client"');
SELECT pg_temp.assert(
    (SELECT already_client AND status = 'converted' AND converted_at IS NOT NULL
            AND client_id = (SELECT id FROM public.client WHERE email = 'jordan.hayes@example.com')
       FROM public.lead WHERE email = 'jordan.hayes@example.com'),
    'it is saved, linked to the client and converted at once');

-- Throttle: five an hour from one address.
SELECT pg_temp.send('10.9.9.9', 'Bot', 'b' || g || '@example.com', 'spam') FROM generate_series(1, 5) g;
SELECT pg_temp.assert(pg_temp.send('10.9.9.9', 'Bot', 'b6@example.com', 'spam') = 'throttled',
                      'the sixth send in an hour from one address is refused');
SELECT pg_temp.assert(NOT EXISTS (SELECT 1 FROM public.lead WHERE email = 'b6@example.com'),
                      'a refused send writes nothing');
SELECT pg_temp.assert(pg_temp.send('10.9.9.8', 'Kai', 'kai@example.com', 'Hello!') = 'created',
                      'another address is not held back');
SELECT pg_temp.assert(NOT EXISTS (SELECT 1 FROM public.lead_submit_throttle t
                                   WHERE position(convert_to('10.9.9.9', 'UTF8') IN t.ip_hash) > 0),
                      'the address itself is never stored');
UPDATE public.lead_submit_throttle SET created_at = now() - interval '61 minutes';
SELECT pg_temp.assert(pg_temp.send('10.9.9.9', 'Bot', 'b7@example.com', 'later') = 'created',
                      'an hour later the address may send again');

-- A card number never gets in (CLAUDE.md rule 1, Data-Model §18.1a). Built at run time, as the
-- repo's guard refuses a Luhn-valid literal in source.
DO $$
DECLARE v_body text := '4' || repeat('1', 14);
        v_pan  text;
BEGIN
    FOR d IN 0..9 LOOP
        IF public.text_has_card_digits(v_body || d) THEN v_pan := v_body || d; EXIT; END IF;
    END LOOP;
    PERFORM set_config('test.pan', v_pan, true);
END $$;
SELECT pg_temp.expect_error(
    format($q$SELECT pg_temp.send('10.0.0.4', 'Card', 'card@example.com', %L)$q$,
           'my card is ' || current_setting('test.pan')),
    '23514', 'a message holding a card number is refused by the table');
SELECT pg_temp.expect_error(
    format($q$SELECT pg_temp.send('10.0.0.4', 'Card', 'card@example.com', 'hi', null, %L)$q$,
           current_setting('test.pan')),
    '23514', 'so is a phone field holding one');

-- A second active advisor: nobody to own a lead (P3 routing), so nothing is written.
SAVEPOINT two_agents;
INSERT INTO public.agent (id, display_name, email, status, time_zone)
VALUES (:z_agent::uuid, 'Second Advisor', 'second.advisor@example.com', 'active', 'America/New_York');
SELECT pg_temp.assert(pg_temp.send('10.0.0.5', 'Ivy', 'ivy@example.com', 'Hi') = 'no_advisor',
                      'with two active advisors the form owns nothing');
ROLLBACK TO SAVEPOINT two_agents;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Alerts
-- ─────────────────────────────────────────────────────────────────────────────

SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_alert_email a JOIN public.lead l ON l.id = a.lead_id
      WHERE a.kind = 'lead_message' AND l.email = 'dana@example.com') = 3,
    'every form message queues an alert email (the quote-request switch is on by default)');
SELECT pg_temp.assert(NOT EXISTS (SELECT 1 FROM public.push_outbox WHERE kind = 'lead_message'),
                      'no push without a device to tell');

INSERT INTO public.push_device (id, platform_user_id, platform, fcm_token)
SELECT public.uuid_v7(), pu.id, 'android', 'test-token' FROM public.platform_user pu
 WHERE pu.account_id = :gyasi::uuid;
SELECT pg_temp.send('10.0.0.6', 'Lena', 'lena@example.com', 'Hi there', 'Moss');
SELECT pg_temp.assert(
    EXISTS (SELECT 1 FROM public.push_outbox o JOIN public.lead l ON l.id = o.lead_id
             WHERE o.kind = 'lead_message' AND l.email = 'lena@example.com'),
    'with a device, a push is queued too');

-- The switch decides.
INSERT INTO public.notification_preference (user_id, channels)
SELECT pu.id, '{"quote_requests":{"email":false,"push":false}}'::jsonb
  FROM public.platform_user pu WHERE pu.account_id = :gyasi::uuid
ON CONFLICT (user_id) DO UPDATE SET channels = EXCLUDED.channels;
SELECT pg_temp.send('10.0.0.7', 'Omar', 'omar@example.com', 'Hello');
SELECT pg_temp.assert(
    NOT EXISTS (SELECT 1 FROM public.agent_alert_email a JOIN public.lead l ON l.id = a.lead_id
                 WHERE l.email = 'omar@example.com')
    AND NOT EXISTS (SELECT 1 FROM public.push_outbox o JOIN public.lead l ON l.id = o.lead_id
                     WHERE l.email = 'omar@example.com'),
    'with the "New inquiries and messages" switch off, nothing is queued');

-- The claims hand out the name, never the words. (Make everything due now: rest hours may hold
-- the push, depending on when this runs.)
UPDATE public.push_outbox SET due_at = now() - interval '1 second', held = false, hold_reason = NULL
 WHERE kind = 'lead_message';
CREATE TEMP TABLE claimed_push AS SELECT * FROM public.push_claim_due(200);
SELECT pg_temp.assert(
    (SELECT client_name = 'Lena Moss' AND preview IS NULL AND lead_id IS NOT NULL
       FROM claimed_push WHERE kind = 'lead_message'),
    'push_claim_due names the lead and carries no preview');
CREATE TEMP TABLE claimed_mail AS SELECT * FROM public.agent_alert_email_claim(100);
SELECT pg_temp.assert(
    EXISTS (SELECT 1 FROM claimed_mail WHERE kind = 'lead_message' AND client_name = 'Dana Reyes'
                                         AND lead_id IS NOT NULL AND trip_id IS NULL),
    'agent_alert_email_claim names the lead');

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. The advisor's actions
-- ─────────────────────────────────────────────────────────────────────────────

SELECT id AS dana FROM public.lead WHERE email = 'dana@example.com' \gset
\set dana '''':dana''''

SELECT pg_temp.assert(
    (SELECT outcome = 'changed' AND status = 'contacted'
       FROM public.agent_lead_write(:agent, :dana, 'mark_contacted', null, null, null)),
    'mark contacted: new -> contacted');
SELECT pg_temp.assert(
    (SELECT outcome FROM public.agent_lead_write(:agent, :dana, 'mark_contacted', null, null, null)) = 'noop',
    'marking it again changes nothing');
SELECT pg_temp.assert(
    NOT EXISTS (SELECT 1 FROM public.agent_lead_write(:z_agent, :dana, 'mark_contacted', null, null, null)),
    'another advisor gets zero rows (one answer for "not yours" and "no such lead")');
SELECT pg_temp.expect_error(
    format($q$SELECT * FROM public.agent_lead_write(%L, %L, 'close', null, null, null)$q$, :agent, :dana),
    '22023', 'a close needs a reason');
SELECT pg_temp.assert(
    (SELECT outcome = 'changed' AND status = 'closed'
       FROM public.agent_lead_write(:agent, :dana, 'close', 'went_elsewhere', '  booked direct ', null)),
    'close with a reason and a private note');
SELECT pg_temp.assert(
    (SELECT close_note = 'booked direct' AND closed_at IS NOT NULL FROM public.lead WHERE id = :dana::uuid),
    'the note is trimmed and the close time set');
SELECT pg_temp.assert(
    (SELECT outcome FROM public.agent_lead_write(:agent, :dana, 'close', 'not_a_fit', 'booked direct', null)) = 'changed',
    'a new reason on a closed lead is a correction');
SELECT pg_temp.assert(
    (SELECT outcome FROM public.agent_lead_write(:agent, :dana, 'mark_contacted', null, null, null)) = 'refused',
    'a closed lead cannot be marked contacted');

-- Closed, so a new message from Dana starts a NEW lead.
SELECT pg_temp.assert(pg_temp.send('10.0.0.8', 'Dana', 'dana@example.com', 'Me again!') = 'created',
                      'after closing, a new message is a new lead');
SELECT pg_temp.assert(
    (SELECT outcome FROM public.agent_lead_write(:agent, :dana, 'reopen', null, null, null)) = 'conflict',
    'reopening would make a second open lead for the email: conflict, nothing changes');
SELECT id AS dana2 FROM public.lead WHERE email = 'dana@example.com' AND status = 'new' \gset
\set dana2 '''':dana2''''
SELECT pg_temp.assert(
    (SELECT outcome FROM public.agent_lead_write(:agent, :dana2, 'delete_spam', null, null, null)) = 'deleted',
    'delete as spam removes a new lead');
SELECT pg_temp.assert(NOT EXISTS (SELECT 1 FROM public.lead WHERE id = :dana2::uuid)
                      AND NOT EXISTS (SELECT 1 FROM public.lead_message WHERE lead_id = :dana2::uuid)
                      AND NOT EXISTS (SELECT 1 FROM public.agent_alert_email WHERE lead_id = :dana2::uuid),
                      'its messages and alerts go with it');
SELECT pg_temp.assert(
    (SELECT outcome = 'changed' AND status = 'contacted'
       FROM public.agent_lead_write(:agent, :dana, 'reopen', null, null, null)),
    'reopen: back to contacted, because it was contacted before');
SELECT pg_temp.assert(
    (SELECT closed_at IS NULL AND close_reason IS NULL AND close_note IS NULL
       FROM public.lead WHERE id = :dana::uuid),
    'reopening clears the close');

SELECT pg_temp.assert(
    NOT EXISTS (SELECT 1 FROM public.agent_lead_write(:agent, :dana, 'convert', null, null, public.uuid_v7())),
    'convert to a client that is not this advisor''s: zero rows');
SELECT pg_temp.assert(
    (SELECT outcome = 'changed' AND status = 'converted'
       FROM public.agent_lead_write(:agent, :dana, 'convert', null, null,
            (SELECT id FROM public.client WHERE email = 'maya.carter@example.com'))),
    'convert links the lead to the client');
SELECT pg_temp.assert(
    (SELECT outcome FROM public.agent_lead_write(:agent, :dana, 'delete_spam', null, null, null)) = 'refused',
    'a converted lead is client history: it cannot be deleted as spam');
SELECT pg_temp.expect_error(
    format($q$SELECT * FROM public.agent_lead_write(%L, %L, 'shred', null, null, null)$q$, :agent, :dana),
    '22023', 'an unknown op is refused');

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Add lead
-- ─────────────────────────────────────────────────────────────────────────────

SELECT pg_temp.assert(
    (SELECT outcome = 'client_exists' AND lead_id IS NULL AND client_id IS NOT NULL
       FROM public.agent_lead_create(:agent, 'Maya', null, 'MAYA.CARTER@example.com', null, 'phone', 'Called')),
    'an email on a client record writes nothing and names the client');
SELECT pg_temp.assert(
    (SELECT outcome FROM public.agent_lead_create(:agent, 'Pat', 'Lee', 'pat@example.com', null, 'referral',
                                                  'Referred by the Hayes family.')) = 'created',
    'a new email makes a lead');
SELECT pg_temp.assert(
    (SELECT outcome FROM public.agent_lead_create(:agent, 'Pat', null, 'pat@example.com', '555 0199', 'phone',
                                                  'Called back about dates.')) = 'added',
    'the same email again joins the open lead');
SELECT pg_temp.assert(
    (SELECT source = 'referral' AND phone = '555 0199'
            AND (SELECT bool_and(entered_by_agent) FROM public.lead_message m WHERE m.lead_id = l.id)
       FROM public.lead l WHERE email = 'pat@example.com'),
    'the first source stays, the phone is filled, and the notes are marked as the advisor''s');
SELECT pg_temp.expect_error(
    format($q$SELECT * FROM public.agent_lead_create(%L, 'Q', null, 'q@example.com', null, 'website', 'x')$q$, :agent),
    '22023', 'website leads come only from the form');

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Linking a lead to the client they became
-- ─────────────────────────────────────────────────────────────────────────────

-- The advisor creates a client with Kai's email (3.3.9, or 3.8.3's invite): no sign-in, links.
INSERT INTO public.client (id, agent_id, first_name, last_name, email)
VALUES (public.uuid_v7(), :agent::uuid, 'Kai', 'Nakamura', 'kai@example.com');
SELECT pg_temp.assert(
    (SELECT status = 'converted' AND client_id = (SELECT id FROM public.client WHERE email = 'kai@example.com')
       FROM public.lead WHERE email = 'kai@example.com'),
    'a client row made by the advisor converts the open lead with that email');

-- Omar signs up himself and has not confirmed yet: nothing links.
INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change)
VALUES (:signup::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        'omar@example.com', 'x', NULL,
        '{"provider":"email","providers":["email"]}'::jsonb,
        '{"first_name":"Omar","last_name":"Haddad"}'::jsonb,
        now(), now(), '', '', '', '');
SELECT pg_temp.assert(
    (SELECT status = 'new' AND client_id IS NULL FROM public.lead WHERE email = 'omar@example.com'),
    'an unconfirmed sign-up does not link (anybody can type somebody else''s email)');
UPDATE auth.users SET email_confirmed_at = now() WHERE id = :signup::uuid;
SELECT pg_temp.assert(
    (SELECT l.status = 'converted' AND l.client_id = pu.client_id
       FROM public.lead l, public.platform_user pu
      WHERE l.email = 'omar@example.com' AND pu.account_id = :signup::uuid),
    'confirming the address links the lead to the account''s client');

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Reads and the report
-- ─────────────────────────────────────────────────────────────────────────────

SELECT count(*) AS lead_total FROM public.lead \gset
SELECT count(*) AS web_total FROM public.lead WHERE source = 'website' AND NOT already_client \gset
SELECT id AS maya FROM public.client WHERE email = 'maya.carter@example.com' \gset
\set maya '''':maya''''
SELECT id AS jordan FROM public.client WHERE email = 'jordan.hayes@example.com' \gset
\set jordan '''':jordan''''

SELECT pg_temp.become(:gyasi::uuid, 'aal1');
SELECT pg_temp.assert(NOT EXISTS (SELECT 1 FROM public.agent_leads()),
                      'an advisor without a second factor reads nothing');
SELECT pg_temp.become(:signup::uuid);
SELECT pg_temp.assert(NOT EXISTS (SELECT 1 FROM public.agent_leads()),
                      'a client reads nothing');
SELECT pg_temp.become(:gyasi::uuid);
SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_leads()) = :lead_total,
    'the advisor reads every lead');
SELECT pg_temp.assert(
    (SELECT message_count = 3 AND latest_preview = 'One more.' AND status = 'converted'
       FROM public.agent_leads() WHERE id = :dana::uuid),
    'the list carries the count and the latest message');
SELECT pg_temp.assert((SELECT count(*) FROM public.agent_lead_messages(:dana::uuid)) = 3,
                      'the advisor reads the messages');
SELECT pg_temp.assert(
    (SELECT lead_id = :dana::uuid FROM public.agent_client_lead_origin(:maya::uuid)),
    'the client page finds the lead they started as');
SELECT pg_temp.assert(
    NOT EXISTS (SELECT 1 FROM public.agent_client_lead_origin(:jordan::uuid)),
    'an "Already a client" message is not how a client first reached out');

SELECT pg_temp.assert((SELECT count(*) FROM public.agent_report_lead_sources('ytd')) = 6,
                      'Lead Sources lists all six sources');
SELECT pg_temp.assert(
    (SELECT lead_count FROM public.agent_report_lead_sources('ytd') WHERE source = 'website')
      = :web_total,
    'website counts leave "Already a client" out');
SELECT pg_temp.assert(
    (SELECT lead_count = 1 AND open_count = 1 FROM public.agent_report_lead_sources('ytd') WHERE source = 'referral'),
    'the hand-added referral is counted and open');
SELECT pg_temp.assert(
    EXISTS (SELECT 1 FROM public.agent_report_lead_campaigns('ytd') WHERE utm_source = 'instagram'),
    'campaign tags are counted');
RESET ROLE;
RESET request.jwt.claims;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. The sweep
-- ─────────────────────────────────────────────────────────────────────────────

SELECT public.agent_lead_write(:agent, l.id, 'close', 'no_reply', null, null)
  FROM public.lead l WHERE l.email IN ('lena@example.com', 'b1@example.com');
UPDATE public.lead SET closed_at = now() - interval '25 months' WHERE email = 'lena@example.com';
UPDATE public.lead SET closed_at = now() - interval '23 months' WHERE email = 'b1@example.com';
INSERT INTO public.lead_submit_throttle (ip_hash, created_at) VALUES ('\x00'::bytea, now() - interval '25 hours');
SELECT pg_temp.assert(public.lead_retention_sweep() = 1, 'the sweep deletes one lead');
SELECT pg_temp.assert(NOT EXISTS (SELECT 1 FROM public.lead WHERE email = 'lena@example.com'),
                      'closed 25 months ago: deleted');
SELECT pg_temp.assert(EXISTS (SELECT 1 FROM public.lead WHERE email = 'b1@example.com'),
                      'closed 23 months ago: kept');
SELECT pg_temp.assert(NOT EXISTS (SELECT 1 FROM public.lead_submit_throttle WHERE created_at < now() - interval '1 day'),
                      'the throttle forgets after a day');

ROLLBACK;
