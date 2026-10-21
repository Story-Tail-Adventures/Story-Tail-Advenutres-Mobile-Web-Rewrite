-- §3.11.8 Export Center (migration 20261030120000_agent_export_center).
--
-- WHAT THIS FILE IS GUARDING.
--
--   1. Trips by travel start and milestones by due date, inside an inclusive From/To range;
--      archived trips out, cancelled ones in (the books should see what fell through).
--   2. Clients is the whole list, and contact details appear ONLY when asked; asking for them
--      on any other type, or sending dates with Clients, is refused rather than ignored.
--   3. Every export writes its audit row in the same call; a refused one leaves none.
--   4. Recent exports are this advisor's own audit rows, per-report and ledger ones included.
--   5. No client role reaches the export bodies or the file door.
--
-- A FOURTH ADVISOR in Pacific/Pago_Pago with a book placed at fixed 2026 dates, so the range
-- edges are literal. Every expected value is worked out by hand.
--
--     psql "$(supabase status -o json | jq -r .DB_URL)" -v ON_ERROR_STOP=1 \
--          -f supabase/tests/rls_agent_export_center.sql

\set ON_ERROR_STOP on

BEGIN;

\set d_agent   '''0c80000a-0000-7000-8000-000000000001'''
\set d_account '''0c80000a-0000-7000-8000-000000000002'''
\set k_ana     '''0c80000a-0000-7000-8000-000000000011'''
\set k_ben     '''0c80000a-0000-7000-8000-000000000012'''
\set addr      '''0c80000a-0000-7000-8000-000000000021'''

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

-- 22023 (invalid_parameter_value) is what the report functions raise on unknown input.
CREATE OR REPLACE FUNCTION pg_temp.expect_invalid(stmt text, description text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    EXECUTE stmt;
    RAISE EXCEPTION 'FAILED: % — statement succeeded, expected 22023', description;
EXCEPTION
    WHEN invalid_parameter_value THEN RAISE NOTICE '  ok    %', description;
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
-- 0. The fourth advisor and their book
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.agent (id, display_name, email, status, time_zone)
VALUES (:d_agent::uuid, 'Export Test Advisor', 'export.advisor@example.com', 'active', 'Pacific/Pago_Pago');

INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change)
VALUES (:d_account::uuid,
        '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        'export.advisor.login@example.com', 'x', now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        ('{"first_name":"Export","last_name":"Advisor",'
         || '"agent_id":"0195a2c0-1a00-7000-8000-000000000001"}')::jsonb,
        now(), now(), '', '', '', '');

DO $$
DECLARE v_client_id uuid;
BEGIN
    SELECT client_id INTO v_client_id FROM public.platform_user
     WHERE account_id = '0c80000a-0000-7000-8000-000000000002';
    UPDATE public.platform_user
       SET role = 'agent', agent_id = '0c80000a-0000-7000-8000-000000000001', client_id = NULL
     WHERE account_id = '0c80000a-0000-7000-8000-000000000002';
    DELETE FROM public.client WHERE id = v_client_id;
END $$;

SELECT pu.id AS d_actor FROM public.platform_user pu WHERE pu.account_id = :d_account::uuid \gset
\set d_actor '''':d_actor''''

INSERT INTO public.address (id, line1, line2, city, region, postal_code, country)
VALUES (:addr::uuid, '12 Harbor Way', 'Unit 4', 'Tampa', 'FL', '33602', 'US');

INSERT INTO public.client (id, agent_id, first_name, last_name, preferred_name, email, phone,
                           mailing_address_id, status)
VALUES (:k_ana::uuid, :d_agent::uuid, 'Anabel', 'Ruiz', 'Ana', 'ana.ruiz@example.com', '+1-555-0101', :addr::uuid, 'active'),
       (:k_ben::uuid, :d_agent::uuid, 'Ben',    'Ode',  NULL,  'ben.ode@example.com',  NULL,          NULL,        'archived');

INSERT INTO public.trip (id, client_id, agent_id, title, trip_type, status, start_date, end_date,
                         archived_at, total_value_cents, total_commission_cents, destinations)
VALUES
    ('0c80000a-0000-7000-8000-000000000101', :k_ana::uuid, :d_agent::uuid, 'T1 Lisbon',      'custom', 'booked',    '2026-03-10', '2026-03-17', NULL,  100000, 10000, ARRAY['Lisbon', 'Porto']),
    ('0c80000a-0000-7000-8000-000000000102', :k_ana::uuid, :d_agent::uuid, 'T2 fell through', 'custom', 'cancelled', '2026-06-01', '2026-06-05', NULL,   20000,  2000, '{}'),
    ('0c80000a-0000-7000-8000-000000000103', :k_ana::uuid, :d_agent::uuid, 'X archived',     'custom', 'booked',    '2026-05-01', '2026-05-03', now(), 99900,  9990, '{}'),
    ('0c80000a-0000-7000-8000-000000000104', :k_ben::uuid, :d_agent::uuid, 'X Dec 31 2025',  'custom', 'completed', '2025-12-31', '2026-01-02', NULL,   30000,  3000, '{}'),
    ('0c80000a-0000-7000-8000-000000000105', :k_ben::uuid, :d_agent::uuid, 'X no dates',     'custom', 'inquiry',   NULL,         NULL,         NULL,   40000,  4000, '{}'),
    ('0c80000a-0000-7000-8000-000000000106', :k_ben::uuid, :d_agent::uuid, 'T6 Dec 31',      'custom', 'proposal',  '2026-12-31', '2027-01-03', NULL,   50000,  5000, '{}'),
    -- On D's book but its client is another advisor's (Jordan, Gyasi's): out of every file.
    ('0c80000a-0000-7000-8000-000000000107', (SELECT id FROM public.client WHERE email = 'jordan.hayes@example.com'), :d_agent::uuid, 'X foreign client', 'custom', 'booked', '2026-04-01', '2026-04-05', NULL, 1, 1, '{}');

-- T1 first committed at 23:30 on Feb 28 in Pago Pago (Mar 1 in UTC): its date is Feb 28.
INSERT INTO public.trip_status_history (id, trip_id, from_status, to_status, changed_at)
VALUES (gen_random_uuid(), '0c80000a-0000-7000-8000-000000000101', 'proposal', 'booked',
        '2026-02-28 23:30'::timestamp AT TIME ZONE 'Pacific/Pago_Pago');

INSERT INTO public.payment_milestone (id, trip_id, kind, label, amount_cents, due_date, status,
                                      paid_at, paid_cents, pay_url, paid_note, order_index)
VALUES
    ('0c80000a-0000-7000-8000-000000000201', '0c80000a-0000-7000-8000-000000000101', 'deposit', 'Deposit',
     50000, '2026-02-01', 'paid', '2026-02-01 12:00'::timestamp AT TIME ZONE 'Pacific/Pago_Pago', 50000,
     'https://www.royalcaribbean.com/pay?ref=abc', 'paid with the card ending 4242', 0),
    ('0c80000a-0000-7000-8000-000000000202', '0c80000a-0000-7000-8000-000000000106', 'final', 'Final payment',
     40000, '2026-12-31', 'scheduled', NULL, 0, NULL, NULL, 0),
    -- Out: due next year, no due date, on an archived trip.
    ('0c80000a-0000-7000-8000-000000000203', '0c80000a-0000-7000-8000-000000000101', 'final', 'Final',
     50000, '2027-01-05', 'scheduled', NULL, 0, NULL, NULL, 1),
    ('0c80000a-0000-7000-8000-000000000204', '0c80000a-0000-7000-8000-000000000106', 'interim', 'No date',
     10000, NULL, 'scheduled', NULL, 0, NULL, NULL, 1),
    ('0c80000a-0000-7000-8000-000000000205', '0c80000a-0000-7000-8000-000000000103', 'deposit', 'Archived',
     10000, '2026-05-01', 'scheduled', NULL, 0, NULL, NULL, 0);

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Trips and milestones over a range
-- ─────────────────────────────────────────────────────────────────────────────

SELECT public.agent_export_center(:d_agent::uuid, :d_actor::uuid, 'trips', '2026-01-01', '2026-12-31', false,
           '0c80000a-0000-7000-8000-0000000003c1', NULL, NULL) AS trips \gset

-- By hand: T1 (Mar 10), T2 (Jun 1, cancelled: in), T6 (Dec 31: the inclusive edge). Not the
-- archived one, not Dec 31 2025, not the undated one.
SELECT pg_temp.assert(
    (SELECT array_agg(e ->> 'trip_title' ORDER BY o) FROM jsonb_array_elements((:'trips'::jsonb) -> 'rows') WITH ORDINALITY AS x(e, o))
        = ARRAY['T1 Lisbon', 'T2 fell through', 'T6 Dec 31'],
    'trips by travel start, inclusive at both ends; cancelled in, archived and undated out');
SELECT pg_temp.assert(
    (:'trips'::jsonb) #>> '{rows,0,destinations}' = 'Lisbon; Porto'
    AND (:'trips'::jsonb) #>> '{rows,0,client_name}' = 'Ana Ruiz'
    AND (:'trips'::jsonb) #>> '{rows,0,value_cents}' = '100000'
    AND (:'trips'::jsonb) #>> '{rows,0,first_booked_on}' = '2026-02-28'
    AND (:'trips'::jsonb) #> '{rows,1,first_booked_on}' = 'null'::jsonb,
    'a trip row: preferred name, its stops, exact cents, first booked in the advisor''s zone');

SELECT public.agent_export_center(:d_agent::uuid, :d_actor::uuid, 'milestones', '2026-01-01', '2026-12-31', false,
           '0c80000a-0000-7000-8000-0000000003c2', NULL, NULL) AS ms \gset

SELECT pg_temp.assert(
    (SELECT array_agg(e ->> 'label' ORDER BY o) FROM jsonb_array_elements((:'ms'::jsonb) -> 'rows') WITH ORDINALITY AS x(e, o))
        = ARRAY['Deposit', 'Final payment'],
    'milestones by due date in the range; next year''s, undated and archived-trip ones out');
SELECT pg_temp.assert(
    (:'ms'::jsonb) #>> '{rows,0,pay_site}' = 'royalcaribbean.com'
    AND (:'ms'::jsonb) #>> '{rows,0,paid_on}' = '2026-02-01'
    AND NOT ((:'ms'::jsonb) -> 'rows' -> 0 ? 'paid_note')
    AND (:'ms'::jsonb)::text NOT LIKE '%4242%'
    AND (:'ms'::jsonb)::text NOT LIKE '%ref=abc%',
    'the pay link leaves as its host only, and the free-text paid note not at all');

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Clients: the whole list, contact details only when asked
-- ─────────────────────────────────────────────────────────────────────────────

SELECT public.agent_export_center(:d_agent::uuid, :d_actor::uuid, 'clients', NULL, NULL, false,
           '0c80000a-0000-7000-8000-0000000003c3', NULL, NULL) AS bare \gset
SELECT public.agent_export_center(:d_agent::uuid, :d_actor::uuid, 'clients', NULL, NULL, true,
           '0c80000a-0000-7000-8000-0000000003c4', NULL, NULL) AS full \gset

-- By hand: Ben (archived, still a client; his completed Dec 2025 trip is committed, 30000; T6
-- is a proposal) and Ana (T1 booked, 100000; T2 cancelled and the archived one out), by last
-- name. The Clients list has no range, so the 2025 trip counts.
SELECT pg_temp.assert(
    (SELECT array_agg((e ->> 'client_name') || ':' || (e ->> 'status') || ':' || (e ->> 'trip_count') || ':' || (e ->> 'value_cents') ORDER BY o)
       FROM jsonb_array_elements((:'bare'::jsonb) -> 'rows') WITH ORDINALITY AS x(e, o))
        = ARRAY['Ben Ode:archived:1:30000', 'Ana Ruiz:active:1:100000'],
    'every client, archived ones too, with committed trips and lifetime value');
SELECT pg_temp.assert(
    (SELECT bool_and(e -> 'email' = 'null'::jsonb AND e -> 'phone' = 'null'::jsonb AND e -> 'city' = 'null'::jsonb)
       FROM jsonb_array_elements((:'bare'::jsonb) -> 'rows') e)
    AND (:'bare'::jsonb)::text NOT LIKE '%example.com%'
    AND (:'bare'::jsonb)::text NOT LIKE '%Harbor%',
    'without the switch, no email, phone or address anywhere in the file');
SELECT pg_temp.assert(
    (:'full'::jsonb) #>> '{rows,1,email}' = 'ana.ruiz@example.com'
    AND (:'full'::jsonb) #>> '{rows,1,address_line1}' = '12 Harbor Way'
    AND (:'full'::jsonb) #>> '{rows,1,country}' = 'US'
    AND (:'full'::jsonb) #> '{rows,0,phone}' = 'null'::jsonb,
    'with the switch, the contact details each client has');
SELECT pg_temp.assert(
    (SELECT (metadata ->> 'include_contact')::boolean FROM public.audit_event WHERE id = '0c80000a-0000-7000-8000-0000000003c4')
    AND NOT (SELECT (metadata ->> 'include_contact')::boolean FROM public.audit_event WHERE id = '0c80000a-0000-7000-8000-0000000003c3')
    AND (SELECT metadata ->> 'source' FROM public.audit_event WHERE id = '0c80000a-0000-7000-8000-0000000003c4') = 'export_center',
    'the audit row says whether contact details went out');

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Refusals leave no audit row
-- ─────────────────────────────────────────────────────────────────────────────

SELECT pg_temp.expect_invalid(
    format('SELECT public.agent_export_center(%L, %L, %L, %L, %L, false, %L, NULL, NULL)',
           :d_agent, :d_actor, 'trips', '2026-12-31', '2026-01-01', '0c80000a-0000-7000-8000-0000000003d1'),
    'a From after its To is refused');
SELECT pg_temp.expect_invalid(
    format('SELECT public.agent_export_center(%L, %L, %L, NULL, NULL, false, %L, NULL, NULL)',
           :d_agent, :d_actor, 'trips', '0c80000a-0000-7000-8000-0000000003d2'),
    'a dated export with no dates is refused');
SELECT pg_temp.expect_invalid(
    format('SELECT public.agent_export_center(%L, %L, %L, %L, %L, false, %L, NULL, NULL)',
           :d_agent, :d_actor, 'clients', '2026-01-01', '2026-12-31', '0c80000a-0000-7000-8000-0000000003d3'),
    'dates sent with the Clients list are refused, not ignored');
SELECT pg_temp.expect_invalid(
    format('SELECT public.agent_export_center(%L, %L, %L, %L, %L, true, %L, NULL, NULL)',
           :d_agent, :d_actor, 'trips', '2026-01-01', '2026-12-31', '0c80000a-0000-7000-8000-0000000003d4'),
    'contact details asked for on a trips export are refused');
SELECT pg_temp.expect_invalid(
    format('SELECT public.agent_export_center(%L, %L, %L, %L, %L, false, %L, NULL, NULL)',
           :d_agent, :d_actor, 'payroll', '2026-01-01', '2026-12-31', '0c80000a-0000-7000-8000-0000000003d5'),
    'an unknown type is refused');
SELECT pg_temp.expect_denied(
    format('SELECT public.agent_export_center(%L, %L, %L, %L, %L, false, %L, NULL, NULL)',
           '0195a2c0-1a00-7000-8000-000000000001', :d_actor, 'trips', '2026-01-01', '2026-12-31',
           '0c80000a-0000-7000-8000-0000000003d6'),
    'an export filed under another advisor''s sign-in is refused');
SELECT pg_temp.assert(
    NOT EXISTS (SELECT 1 FROM public.audit_event WHERE id::text LIKE '0c80000a-0000-7000-8000-0000000003d%'),
    'and none of the refusals left an audit row');

-- The audit row is the LAST step: if it cannot be written (here, an id already used), the whole
-- call fails and no rows come back. A file never leaves without its record.
DO $$
BEGIN
    PERFORM public.agent_export_center('0c80000a-0000-7000-8000-000000000001',
        (SELECT id FROM public.platform_user WHERE account_id = '0c80000a-0000-7000-8000-000000000002'),
        'clients', NULL, NULL, true, '0c80000a-0000-7000-8000-0000000003c4', NULL, NULL);
    RAISE EXCEPTION 'FAILED: an export whose audit row failed still returned';
EXCEPTION
    WHEN unique_violation THEN RAISE NOTICE '  ok    an export whose audit row cannot be written fails whole';
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Recent exports, from the audit rows
-- ─────────────────────────────────────────────────────────────────────────────

-- A per-report export and a ledger export too: the history reads them all.
SELECT public.agent_report_export(:d_agent::uuid, :d_actor::uuid, 'suppliers', 'ytd', NULL,
           '0c80000a-0000-7000-8000-0000000003c5', NULL, NULL) IS NOT NULL AS ok1 \gset
SELECT public.agent_export_commission(:d_agent::uuid, :d_actor::uuid, NULL, NULL, NULL,
           '2026-01-01', '2026-12-31', '0c80000a-0000-7000-8000-0000000003c6', NULL, NULL) IS NOT NULL AS ok2 \gset

SELECT pg_temp.become(:d_account::uuid);
CREATE TEMP TABLE hist AS SELECT * FROM public.agent_export_history(20);

SELECT pg_temp.assert(
    (SELECT count(*) FROM hist) = 6
    AND (SELECT count(*) FROM hist WHERE event_type = 'commission.exported') = 1
    AND (SELECT count(*) FROM hist WHERE metadata ->> 'source' = 'export_center') = 4,
    'recent exports: the four Export Center files, the per-report one and the ledger one');
SELECT pg_temp.assert(
    NOT EXISTS (SELECT 1 FROM hist WHERE audit_id::text LIKE '0c7e%' OR audit_id::text LIKE '0c7f%'),
    'only this advisor''s own exports');

-- Signed in without the second factor: the advisor side answers nothing, history included.
SELECT set_config('request.jwt.claims',
    json_build_object('sub', :d_account, 'role', 'authenticated', 'aal', 'aal1')::text, true);
SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_export_history(20)) = 0,
    'no export history below aal2');
SELECT pg_temp.become(:d_account::uuid);

SELECT pg_temp.expect_denied(
    format('SELECT * FROM public.report_export_clients(%L, true)', '0195a2c0-1a00-7000-8000-000000000001'),
    'an advisor cannot read another book''s client list through the internal function');
SELECT pg_temp.expect_denied(
    format('SELECT * FROM public.report_export_trips(%L, %L, %L)', '0195a2c0-1a00-7000-8000-000000000001', '2026-01-01', '2026-12-31'),
    'nor its trips');
SELECT pg_temp.expect_denied(
    format('SELECT * FROM public.report_export_milestones(%L, %L, %L)', '0195a2c0-1a00-7000-8000-000000000001', '2026-01-01', '2026-12-31'),
    'nor its milestones');
SELECT pg_temp.expect_denied(
    format('SELECT public.agent_export_center(%L, %L, %L, NULL, NULL, true, %L, NULL, NULL)',
           :d_agent, :d_actor, 'clients', '0c80000a-0000-7000-8000-0000000003d7'),
    'nor call the file door directly');

RESET ROLE;
SET LOCAL role anon;
SELECT pg_temp.expect_denied('SELECT * FROM public.agent_export_history(20)', 'anon cannot read export history');
RESET ROLE;

UPDATE public.agent SET status = 'archived' WHERE id = :d_agent::uuid;
SELECT public.agent_export_center(:d_agent::uuid, :d_actor::uuid, 'clients', NULL, NULL, true,
           '0c80000a-0000-7000-8000-0000000003d8', NULL, NULL) IS NULL AS archived_null \gset
SELECT pg_temp.assert(
    :'archived_null'::boolean
    AND NOT EXISTS (SELECT 1 FROM public.audit_event WHERE id = '0c80000a-0000-7000-8000-0000000003d8'),
    'an archived advisor exports nothing and nothing is audited');

ROLLBACK;
