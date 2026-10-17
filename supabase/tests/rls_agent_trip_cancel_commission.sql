-- §3.7 Stage 5 — Screen 3.4.16: cancelling a trip closes its open commission lines.
--
-- WHAT THIS FILE IS GUARDING.
--
--   1. The cancel dialog lists exactly the trip's Expected and Invoiced lines, the caller's own
--      (both agent ids), never a removed one.
--   2. A cancel closes ONLY the lines it names, at the version it names, and only while they
--      are still Expected or Invoiced: Received, Disputed, Lost, removed, another trip's and
--      another advisor's lines are never touched, whatever the request says (Gyasi,
--      2026-10-12: offered in the dialog, on by default).
--   3. Each closed line gets its own audit row, in the same transaction as the cancel: an
--      audit row that cannot be written takes the cancel with it.
--   4. A stale trip closes nothing; an already-cancelled trip ("Save details") still can.
--
-- A SECOND ADVISOR with a known book; every assertion is a literal.
--
-- Run against a freshly reset local database:
--     supabase db reset
--     psql "$(supabase status -o json | jq -r .DB_URL)" -v ON_ERROR_STOP=1 \
--          -f supabase/tests/rls_agent_trip_cancel_commission.sql

\set ON_ERROR_STOP on

BEGIN;

\set gyasi     '''0195a2c0-1a00-7000-8000-000000000010'''
\set jordan    '''0195a2c0-1a00-7000-8000-000000000011'''
\set agent     '''0195a2c0-1a00-7000-8000-000000000001'''
\set b_agent   '''0c7e0000-0000-7000-8000-000000000001'''
\set b_account '''0c7e0000-0000-7000-8000-000000000002'''
\set b_client  '''0c7e0000-0000-7000-8000-000000000003'''
\set s1        '''0c7e0000-0000-7000-8000-0000000000a1'''
\set ta        '''0c7e0000-0000-7000-8000-000000000011'''
\set tb        '''0c7e0000-0000-7000-8000-000000000012'''
\set tc        '''0c7e0000-0000-7000-8000-000000000013'''
\set td        '''0c7e0000-0000-7000-8000-000000000014'''
\set te        '''0c7e0000-0000-7000-8000-000000000015'''
\set tf        '''0c7e0000-0000-7000-8000-000000000016'''
\set tg        '''0c7e0000-0000-7000-8000-000000000017'''

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

-- By SQLSTATE, so an error for the wrong reason (a typo, a missing column) fails the check
-- rather than passing it.
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
-- 0. The second advisor and their book
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.agent (id, display_name, email, status, time_zone)
VALUES (:b_agent::uuid, 'Cancel Test Advisor', 'cancel.advisor@example.com', 'active', 'America/New_York');

INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change)
VALUES (:b_account::uuid,
        '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        'cancel.advisor.login@example.com', 'x', now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        ('{"first_name":"Cancel","last_name":"Advisor",'
         || '"agent_id":"0195a2c0-1a00-7000-8000-000000000001"}')::jsonb,
        now(), now(), '', '', '', '');

DO $$
DECLARE v_client_id uuid;
BEGIN
    SELECT client_id INTO v_client_id FROM public.platform_user
     WHERE account_id = '0c7e0000-0000-7000-8000-000000000002';
    UPDATE public.platform_user
       SET role = 'agent', agent_id = '0c7e0000-0000-7000-8000-000000000001', client_id = NULL
     WHERE account_id = '0c7e0000-0000-7000-8000-000000000002';
    DELETE FROM public.client WHERE id = v_client_id;
END $$;

SELECT pu.id AS b_actor FROM public.platform_user pu WHERE pu.account_id = :b_account::uuid \gset
\set b_actor '''':b_actor''''

INSERT INTO public.client (id, agent_id, first_name, last_name, email)
VALUES (:b_client::uuid, :b_agent::uuid, 'Cancel', 'Traveler', 'cancel.traveler@example.com');

INSERT INTO public.supplier (id, name, kind, commission_payment_terms, commission_payment_lag_days)
VALUES (:s1::uuid, 'Fixture Resort', 'resort', 'after_travel', 30);

INSERT INTO public.trip (id, client_id, agent_id, title, trip_type, status, cancellation_reason)
VALUES (:ta::uuid, :b_client::uuid, :b_agent::uuid, 'TA every status',     'custom', 'booked',    NULL),
       (:tb::uuid, :b_client::uuid, :b_agent::uuid, 'TB another trip',     'custom', 'booked',    NULL),
       (:tc::uuid, :b_client::uuid, :b_agent::uuid, 'TC stale trip',       'custom', 'booked',    NULL),
       (:td::uuid, :b_client::uuid, :b_agent::uuid, 'TD already cancelled','custom', 'cancelled', 'Client changed plans'),
       (:te::uuid, :b_client::uuid, :b_agent::uuid, 'TE audit fails',      'custom', 'booked',    NULL),
       (:tf::uuid, :b_client::uuid, :b_agent::uuid, 'TF nothing named',    'custom', 'booked',    NULL),
       (:tg::uuid, :b_client::uuid, :b_agent::uuid, 'TG only a lost line', 'custom', 'booked',    NULL);

-- One line per case. Expected = gross / 10 at 10%, which the table's CHECK requires.
INSERT INTO public.commission
    (id, trip_id, agent_id, supplier_id, gross_booking_cents, commission_pct,
     expected_commission_cents, processing_fee_cents, received_commission_cents, currency,
     payment_terms, payment_lag_days, status, received_at, inteletravel_reference)
SELECT v.id::uuid, v.trip::uuid, v.agent::uuid, :s1::uuid,
       v.gross, 10, v.gross / 10, 0, v.received, 'USD', 'after_travel', 30, v.status::commission_status,
       CASE WHEN v.received > 0 THEN current_date - 1 END, v.ref
  FROM (VALUES
        -- TA: the two that close…
        ('0c7e0000-0000-7000-8000-000000000201', :ta, :b_agent, 100000,     0, 'expected', NULL),
        ('0c7e0000-0000-7000-8000-000000000202', :ta, :b_agent, 200000,     0, 'invoiced', 'ITV-202'),
        -- …and the ones that never do, whatever the request names.
        ('0c7e0000-0000-7000-8000-000000000203', :ta, :b_agent, 300000, 30000, 'received', 'ITV-203'),
        ('0c7e0000-0000-7000-8000-000000000204', :ta, :b_agent, 400000, 10000, 'disputed', 'ITV-204'),
        ('0c7e0000-0000-7000-8000-000000000205', :ta, :b_agent, 500000,     0, 'lost',     NULL),
        ('0c7e0000-0000-7000-8000-000000000206', :ta, :b_agent, 600000,     0, 'expected', NULL),  -- removed below
        ('0c7e0000-0000-7000-8000-000000000207', :ta, :agent,   700000,     0, 'expected', NULL),  -- another advisor's id
        -- Another of this advisor's trips.
        ('0c7e0000-0000-7000-8000-000000000208', :tb, :b_agent, 800000,     0, 'expected', NULL),
        ('0c7e0000-0000-7000-8000-000000000209', :tc, :b_agent, 900000,     0, 'expected', NULL),
        ('0c7e0000-0000-7000-8000-00000000020a', :td, :b_agent, 110000,     0, 'invoiced', 'ITV-20A'),
        ('0c7e0000-0000-7000-8000-00000000020b', :td, :b_agent, 120000,     0, 'expected', NULL),
        ('0c7e0000-0000-7000-8000-00000000020c', :te, :b_agent, 130000,     0, 'expected', NULL),
        ('0c7e0000-0000-7000-8000-00000000020d', :tf, :b_agent, 140000,     0, 'expected', NULL),
        -- A Lost line alone: the one closed status no table CHECK stops being "closed" again.
        ('0c7e0000-0000-7000-8000-00000000020e', :tg, :b_agent, 150000,     0, 'lost',     NULL)
       ) AS v(id, trip, agent, gross, received, status, ref);

UPDATE public.commission SET archived_at = now() WHERE id = '0c7e0000-0000-7000-8000-000000000206';

-- The state every "never touched" check compares against.
CREATE TEMP TABLE line_before AS
SELECT id, status, version FROM public.commission WHERE id::text LIKE '0c7e0000-%';

SELECT pg_temp.assert(
    (SELECT count(*) FROM line_before) = 14 AND (SELECT bool_and(version = 1) FROM line_before),
    'fixture: fourteen lines, every one at version 1');

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. No client role writes
-- ─────────────────────────────────────────────────────────────────────────────

SELECT pg_temp.become(:b_account::uuid);
SELECT pg_temp.expect_denied(
    format($q$SELECT * FROM public.agent_cancel_trip(%L, %L, %L, 1, 'x', NULL, NULL, '[]', NULL, NULL, NULL)$q$,
           :ta, :b_agent, :b_actor),
    'even the owning advisor cannot call agent_cancel_trip over /rpc/');
RESET ROLE;

SET LOCAL ROLE anon;
SELECT pg_temp.expect_denied(
    format($q$SELECT * FROM public.agent_trip_open_commission(%L)$q$, :ta),
    'anon cannot read a trip''s open lines');
RESET ROLE;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. What the dialog lists
-- ─────────────────────────────────────────────────────────────────────────────

SELECT pg_temp.become(:b_account::uuid);
SELECT pg_temp.assert(
    (SELECT array_agg(commission_id::text || ' ' || status || ' ' || expected_commission_cents
                      || ' ' || currency || ' v' || version || ' ' || supplier_name
                      ORDER BY commission_id)
       FROM public.agent_trip_open_commission(:ta::uuid))
    = ARRAY['0c7e0000-0000-7000-8000-000000000201 expected 10000 USD v1 Fixture Resort',
            '0c7e0000-0000-7000-8000-000000000202 invoiced 20000 USD v1 Fixture Resort'],
    'the advisor sees exactly TA''s Expected and Invoiced lines: not paid, lost, removed, or '
    'a line carrying another advisor''s id');
RESET ROLE;

SELECT pg_temp.become(:gyasi::uuid);
SELECT pg_temp.assert(
    NOT EXISTS (SELECT 1 FROM public.agent_trip_open_commission(:ta::uuid)),
    'another advisor sees none of them, not even the line with their own id on it');
RESET ROLE;

SELECT pg_temp.become(:jordan::uuid);
SELECT pg_temp.assert(
    NOT EXISTS (SELECT 1 FROM public.agent_trip_open_commission(:ta::uuid)),
    'and a traveler sees nothing');
RESET ROLE;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3a. A line already Lost is left as it is
-- ─────────────────────────────────────────────────────────────────────────────
-- First and on its own: a Received or Disputed line is also stopped by the table's own
-- payment CHECKs, so only a Lost line shows the function's status guard doing the work.

SELECT version AS tg_version FROM public.trip WHERE id = :tg::uuid \gset

SELECT outcome AS g_outcome, lines_closed AS g_closed, lines_skipped AS g_skipped
  FROM public.agent_cancel_trip(
        :tg::uuid, :b_agent::uuid, :b_actor::uuid, :tg_version, 'Client changed plans', NULL, NULL,
        '[{"id": "0c7e0000-0000-7000-8000-00000000020e", "version": 1}]',
        ARRAY['0c7e0000-0000-7000-8000-0000000003e1']::uuid[], NULL, NULL) \gset

SELECT pg_temp.assert(
    :'g_outcome' = 'changed' AND :g_closed = 0 AND :g_skipped = 1
    AND (SELECT status = 'lost' AND version = 1 FROM public.commission
          WHERE id = '0c7e0000-0000-7000-8000-00000000020e')
    AND NOT EXISTS (SELECT 1 FROM public.audit_event WHERE id = '0c7e0000-0000-7000-8000-0000000003e1'),
    'a line already Lost is skipped: no new version, no audit row');

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Cancel TA, naming every line there is (and one from another trip)
-- ─────────────────────────────────────────────────────────────────────────────

SELECT version AS ta_version FROM public.trip WHERE id = :ta::uuid \gset

SELECT outcome AS a_outcome, lines_closed AS a_closed, lines_skipped AS a_skipped
  FROM public.agent_cancel_trip(
        :ta::uuid, :b_agent::uuid, :b_actor::uuid, :ta_version, 'Client changed plans',
        'none_expected', NULL,
        (SELECT jsonb_agg(jsonb_build_object('id', id, 'version', version) ORDER BY id DESC)
           FROM line_before WHERE id::text BETWEEN '0c7e0000-0000-7000-8000-000000000201'
                                          AND '0c7e0000-0000-7000-8000-000000000208'),
        ARRAY['0c7e0000-0000-7000-8000-0000000003a1', '0c7e0000-0000-7000-8000-0000000003a2',
              '0c7e0000-0000-7000-8000-0000000003a3', '0c7e0000-0000-7000-8000-0000000003a4',
              '0c7e0000-0000-7000-8000-0000000003a5', '0c7e0000-0000-7000-8000-0000000003a6',
              '0c7e0000-0000-7000-8000-0000000003a7', '0c7e0000-0000-7000-8000-0000000003a8']::uuid[],
        '203.0.113.9, 10.0.0.1', 'psql test') \gset

SELECT pg_temp.assert(
    :'a_outcome' = 'changed' AND :a_closed = 2 AND :a_skipped = 6,
    'the trip is cancelled; 2 lines closed, 6 skipped');

SELECT pg_temp.assert(
    (SELECT status = 'cancelled' AND cancellation_reason = 'Client changed plans'
            AND refund_status = 'none_expected' AND version = :ta_version + 1
       FROM public.trip WHERE id = :ta::uuid)
    AND (SELECT count(*) = 1 FROM public.trip_status_history
          WHERE trip_id = :ta::uuid AND from_status = 'booked' AND to_status = 'cancelled'),
    'the cancel itself is agent_set_trip_status''s, unchanged: status, reason, refund, one history row');

SELECT pg_temp.assert(
    (SELECT array_agg(id::text || ' ' || status || ' v' || version ORDER BY id)
       FROM public.commission
      WHERE id IN ('0c7e0000-0000-7000-8000-000000000201', '0c7e0000-0000-7000-8000-000000000202'))
    = ARRAY['0c7e0000-0000-7000-8000-000000000201 lost v2',
            '0c7e0000-0000-7000-8000-000000000202 lost v2'],
    'the Expected and the Invoiced line are Lost, each one version on');

SELECT pg_temp.assert(
    NOT EXISTS (
        SELECT 1 FROM public.commission c JOIN line_before b USING (id)
         WHERE c.id::text BETWEEN '0c7e0000-0000-7000-8000-000000000203'
                              AND '0c7e0000-0000-7000-8000-000000000208'
           AND (c.status <> b.status OR c.version <> b.version)),
    'received, disputed, lost, removed, another advisor''s and another trip''s lines: untouched');

-- In id order, line i takes audit id i: …201 → …3a1, …202 → …3a2.
SELECT pg_temp.assert(
    (SELECT array_agg(a.id::text || ' ' || a.target_id::text || ' '
                      || (a.metadata #>> '{changes,status,from}') || '>' || (a.metadata #>> '{changes,status,to}')
                      ORDER BY a.id)
       FROM public.audit_event a
      WHERE a.target_entity = 'commission' AND a.target_id::text LIKE '0c7e0000-%')
    = ARRAY['0c7e0000-0000-7000-8000-0000000003a1 0c7e0000-0000-7000-8000-000000000201 expected>lost',
            '0c7e0000-0000-7000-8000-0000000003a2 0c7e0000-0000-7000-8000-000000000202 invoiced>lost'],
    'one commission audit row per closed line, and none for a skipped one');

SELECT pg_temp.assert(
    (SELECT bool_and(a.event_type = 'commission.updated'
                     AND a.metadata ->> 'via' = 'trip_cancelled'
                     AND a.metadata ->> 'trip_id' = :ta
                     AND (a.metadata ->> 'version')::int = 2
                     AND a.actor_user_id = :b_actor::uuid
                     AND a.ip_address = '203.0.113.9'::inet)
       FROM public.audit_event a WHERE a.target_id::text LIKE '0c7e0000-%'),
    'each says why it moved (via trip_cancelled, the trip), who, and from where');

SELECT pg_temp.become(:b_account::uuid);
SELECT pg_temp.assert(
    NOT EXISTS (SELECT 1 FROM public.agent_trip_open_commission(:ta::uuid)),
    'and the dialog has nothing left to list');
RESET ROLE;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. A stale trip closes nothing
-- ─────────────────────────────────────────────────────────────────────────────

SELECT outcome AS c_outcome, lines_closed AS c_closed
  FROM public.agent_cancel_trip(
        :tc::uuid, :b_agent::uuid, :b_actor::uuid, 99, 'Weather', NULL, NULL,
        '[{"id": "0c7e0000-0000-7000-8000-000000000209", "version": 1}]',
        ARRAY['0c7e0000-0000-7000-8000-0000000003b1']::uuid[], NULL, NULL) \gset

SELECT pg_temp.assert(
    :'c_outcome' = 'stale' AND :c_closed = 0
    AND (SELECT status = 'booked' FROM public.trip WHERE id = :tc::uuid)
    AND (SELECT status = 'expected' AND version = 1 FROM public.commission
          WHERE id = '0c7e0000-0000-7000-8000-000000000209')
    AND NOT EXISTS (SELECT 1 FROM public.audit_event WHERE id = '0c7e0000-0000-7000-8000-0000000003b1'),
    'a trip that moved under the dialog is stale: not cancelled, and its line stays open');

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. An already-cancelled trip, and a line that moved under the dialog
-- ─────────────────────────────────────────────────────────────────────────────

SELECT version AS td_version FROM public.trip WHERE id = :td::uuid \gset

SELECT outcome AS d_outcome, lines_closed AS d_closed, lines_skipped AS d_skipped, version AS d_version
  FROM public.agent_cancel_trip(
        :td::uuid, :b_agent::uuid, :b_actor::uuid, :td_version, 'Client changed plans', NULL, NULL,
        '[{"id": "0c7e0000-0000-7000-8000-00000000020a", "version": 1},
          {"id": "0c7e0000-0000-7000-8000-00000000020b", "version": 7}]',
        ARRAY['0c7e0000-0000-7000-8000-0000000003c1', '0c7e0000-0000-7000-8000-0000000003c2']::uuid[],
        NULL, NULL) \gset

SELECT pg_temp.assert(
    :'d_outcome' = 'noop' AND :d_closed = 1 AND :d_skipped = 1 AND :d_version = :td_version
    AND (SELECT status = 'lost' FROM public.commission WHERE id = '0c7e0000-0000-7000-8000-00000000020a')
    AND (SELECT status = 'expected' AND version = 1 FROM public.commission
          WHERE id = '0c7e0000-0000-7000-8000-00000000020b'),
    '"Save details" on a trip already cancelled closes its open line (the trip itself is a '
    'no-op), and a line named at a version it is no longer at is skipped, not overwritten');

-- A corrected reason on that same cancelled trip (outcome reason_changed) closes too.
SELECT version AS td_version2 FROM public.trip WHERE id = :td::uuid \gset

SELECT outcome AS d2_outcome, lines_closed AS d2_closed
  FROM public.agent_cancel_trip(
        :td::uuid, :b_agent::uuid, :b_actor::uuid, :td_version2, 'Weather closed the port', NULL, NULL,
        '[{"id": "0c7e0000-0000-7000-8000-00000000020b", "version": 1}]',
        ARRAY['0c7e0000-0000-7000-8000-0000000003c3']::uuid[], NULL, NULL) \gset

SELECT pg_temp.assert(
    :'d2_outcome' = 'reason_changed' AND :d2_closed = 1
    AND (SELECT cancellation_reason = 'Weather closed the port' AND version = :td_version2 + 1
           FROM public.trip WHERE id = :td::uuid)
    AND (SELECT status = 'lost' AND version = 2 FROM public.commission
          WHERE id = '0c7e0000-0000-7000-8000-00000000020b'),
    'a corrected reason lands and the named line closes, in the one call');

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Unchecked: nothing named, nothing closed
-- ─────────────────────────────────────────────────────────────────────────────

SELECT version AS tf_version FROM public.trip WHERE id = :tf::uuid \gset

SELECT outcome AS f_outcome, lines_closed AS f_closed, lines_skipped AS f_skipped
  FROM public.agent_cancel_trip(
        :tf::uuid, :b_agent::uuid, :b_actor::uuid, :tf_version, 'Supplier will still pay',
        NULL, NULL, NULL, NULL, NULL, NULL) \gset

SELECT pg_temp.assert(
    :'f_outcome' = 'changed' AND :f_closed = 0 AND :f_skipped = 0
    AND (SELECT status = 'cancelled' FROM public.trip WHERE id = :tf::uuid)
    AND (SELECT status = 'expected' AND version = 1 FROM public.commission
          WHERE id = '0c7e0000-0000-7000-8000-00000000020d'),
    'with the box unchecked the trip is cancelled and its open line stays open');

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Not this advisor's trip
-- ─────────────────────────────────────────────────────────────────────────────

SELECT pg_temp.assert(
    NOT EXISTS (
        SELECT 1 FROM public.agent_cancel_trip(
            :tb::uuid, :agent::uuid, :b_actor::uuid, 1, 'Not mine', NULL, NULL,
            '[{"id": "0c7e0000-0000-7000-8000-000000000208", "version": 1}]',
            ARRAY['0c7e0000-0000-7000-8000-0000000003d1']::uuid[], NULL, NULL)),
    'another advisor naming this trip gets no rows back');
SELECT pg_temp.assert(
    (SELECT status = 'booked' FROM public.trip WHERE id = :tb::uuid)
    AND (SELECT status = 'expected' AND version = 1 FROM public.commission
          WHERE id = '0c7e0000-0000-7000-8000-000000000208'),
    'and neither the trip nor its line moved');

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. One transaction: an audit row that cannot be written takes the cancel with it
-- ─────────────────────────────────────────────────────────────────────────────

SELECT version AS te_version FROM public.trip WHERE id = :te::uuid \gset

-- …3a1 is already an audit row (section 3), so this line's audit insert collides.
SELECT pg_temp.expect_error(
    format($q$SELECT * FROM public.agent_cancel_trip(%L, %L, %L, %s, 'Audit test', NULL, NULL,
             '[{"id": "0c7e0000-0000-7000-8000-00000000020c", "version": 1}]',
             ARRAY['0c7e0000-0000-7000-8000-0000000003a1']::uuid[], NULL, NULL)$q$,
           :te, :b_agent, :b_actor, :te_version),
    '23505', 'an audit row that cannot be written fails the call');

SELECT pg_temp.assert(
    (SELECT status = 'booked' AND version = :te_version FROM public.trip WHERE id = :te::uuid)
    AND NOT EXISTS (SELECT 1 FROM public.trip_status_history WHERE trip_id = :te::uuid)
    AND (SELECT status = 'expected' AND version = 1 FROM public.commission
          WHERE id = '0c7e0000-0000-7000-8000-00000000020c'),
    'and nothing landed: the trip is not cancelled, no history row, the line still open');

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. A malformed list is refused before anything is written
-- ─────────────────────────────────────────────────────────────────────────────

SELECT pg_temp.expect_error(
    format($q$SELECT * FROM public.agent_cancel_trip(%L, %L, %L, %s, 'x', NULL, NULL,
             '[{"id": "0c7e0000-0000-7000-8000-00000000020c", "version": 1},
               {"id": "0c7e0000-0000-7000-8000-00000000020c", "version": 1}]',
             ARRAY[gen_random_uuid(), gen_random_uuid()], NULL, NULL)$q$,
           :te, :b_agent, :b_actor, :te_version),
    'P0001', 'a line named twice is refused');

SELECT pg_temp.expect_error(
    format($q$SELECT * FROM public.agent_cancel_trip(%L, %L, %L, %s, 'x', NULL, NULL,
             '[{"id": "0c7e0000-0000-7000-8000-00000000020c", "version": 1}]',
             ARRAY[]::uuid[], NULL, NULL)$q$,
           :te, :b_agent, :b_actor, :te_version),
    'P0001', 'so is a list with no audit id for its line');

-- The list is refused whole even when its line would only be skipped (here, a version it is
-- not at): a short list is a caller that forgot the audit, not one that chose to skip it.
SELECT pg_temp.expect_error(
    format($q$SELECT * FROM public.agent_cancel_trip(%L, %L, %L, %s, 'x', NULL, NULL,
             '[{"id": "0c7e0000-0000-7000-8000-00000000020c", "version": 99}]',
             ARRAY[]::uuid[], NULL, NULL)$q$,
           :te, :b_agent, :b_actor, :te_version),
    'P0001', 'even for a line that would be skipped');

SELECT pg_temp.expect_error(
    format($q$SELECT * FROM public.agent_cancel_trip(%L, %L, %L, %s, 'x', NULL, NULL,
             '[{"id": "0c7e0000-0000-7000-8000-00000000020c", "version": 1.5}]',
             ARRAY[gen_random_uuid()], NULL, NULL)$q$,
           :te, :b_agent, :b_actor, :te_version),
    'P0001', 'a version that is not a whole number');

SELECT pg_temp.expect_error(
    format($q$SELECT * FROM public.agent_cancel_trip(%L, %L, %L, %s, 'x', NULL, NULL,
             '[{"id": "0c7e0000-0000-7000-8000-00000000020c", "version": "1"}]',
             ARRAY[gen_random_uuid()], NULL, NULL)$q$,
           :te, :b_agent, :b_actor, :te_version),
    'P0001', 'a version sent as text');

SELECT pg_temp.expect_error(
    format($q$SELECT * FROM public.agent_cancel_trip(%L, %L, %L, %s, 'x', NULL, NULL,
             '[{"id": "not-a-line", "version": 1}]',
             ARRAY[gen_random_uuid()], NULL, NULL)$q$,
           :te, :b_agent, :b_actor, :te_version),
    '22P02', 'an id that is not a uuid');

SELECT pg_temp.expect_error(
    format($q$SELECT * FROM public.agent_cancel_trip(%L, %L, %L, %s, 'x', NULL, NULL,
             (SELECT jsonb_agg(jsonb_build_object('id', gen_random_uuid(), 'version', 1))
                FROM generate_series(1, 101)),
             (SELECT array_agg(gen_random_uuid()) FROM generate_series(1, 101)), NULL, NULL)$q$,
           :te, :b_agent, :b_actor, :te_version),
    'P0001', 'and more than 100 lines');

SELECT pg_temp.assert(
    (SELECT status = 'booked' AND version = :te_version FROM public.trip WHERE id = :te::uuid),
    'none of the refusals cancelled the trip');

ROLLBACK;
