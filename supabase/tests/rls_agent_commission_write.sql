-- §3.7 Stage 2 — the commission writes, the detail read, and the audited export.
--
-- WHAT THIS FILE IS GUARDING.
--
--   1. The writes take `p_agent_id` as trusted input, so no client role may call them.
--   2. Each write's audit row lands IN THE SAME TRANSACTION as the change. The property is
--      tested by making the audit insert FAIL and checking the change did not land — a test
--      that only checks "an audit row exists after a successful write" passes against the
--      old two-round-trip shape too.
--   3. Gyasi's rulings (2026-10-11): payment terms are an enum plus days; a line may be
--      removed only while `expected` with no Inteletravel reference.
--   4. Tenancy for writes: neither advisor can touch the other's line or trip, and a line
--      whose two agent ids disagree is touchable by nobody.
--
-- Run against a freshly reset local database:
--     supabase db reset
--     psql "$(supabase status -o json | jq -r .DB_URL)" -v ON_ERROR_STOP=1 \
--          -f supabase/tests/rls_agent_commission_write.sql

\set ON_ERROR_STOP on

BEGIN;

\set gyasi    '''0195a2c0-1a00-7000-8000-000000000010'''
\set jordan   '''0195a2c0-1a00-7000-8000-000000000011'''
\set agent    '''0195a2c0-1a00-7000-8000-000000000001'''
\set sandals  '''0195a2c0-1a00-7000-8000-000000000030'''
\set allianz  '''0195a2c0-1a00-7000-8000-000000000034'''
-- Kyoto: booked, no ledger line, dates relative to the seed's run day.
\set kyoto    '''0195a2c0-1a00-7000-8000-000000000112'''
\set barbados '''0195a2c0-1a00-7000-8000-0000000000af'''
\set other_agent  '''0c7b0000-0000-7000-8000-000000000001'''
\set other_client '''0c7b0000-0000-7000-8000-000000000002'''
\set other_trip   '''0c7b0000-0000-7000-8000-000000000003'''
\set line_a   '''0c7b0000-0000-7000-8000-0000000000a1'''
\set line_b   '''0c7b0000-0000-7000-8000-0000000000b1'''
\set line_c   '''0c7b0000-0000-7000-8000-0000000000c1'''
\set line_x   '''0c7b0000-0000-7000-8000-0000000000e1'''
\set line_y   '''0c7b0000-0000-7000-8000-0000000000e2'''
\set line_d   '''0c7b0000-0000-7000-8000-0000000000d1'''
\set line_e   '''0c7b0000-0000-7000-8000-0000000000f1'''

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

-- A statement that must RAISE (any error), with nothing it touched surviving.
CREATE OR REPLACE FUNCTION pg_temp.expect_error(stmt text, description text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    EXECUTE stmt;
    RAISE EXCEPTION 'FAILED: % — statement succeeded, expected an error', description;
EXCEPTION
    WHEN raise_exception OR unique_violation OR check_violation OR not_null_violation THEN
        IF SQLERRM LIKE 'FAILED:%' THEN RAISE; END IF;
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

-- THE TWO PLATFORM_USER IDS: `actor_user_id` points at platform_user.id, not the auth id.
SELECT pu.id AS actor FROM public.platform_user pu WHERE pu.account_id = :gyasi::uuid \gset
\set actor '''':actor''''

-- A fresh audit id per call. v7 in production (the Edge Function mints it); any uuid here.
CREATE OR REPLACE FUNCTION pg_temp.aid() RETURNS uuid LANGUAGE sql AS $$ SELECT gen_random_uuid() $$;

CREATE OR REPLACE FUNCTION pg_temp.audits(target uuid, event text) RETURNS bigint
LANGUAGE sql AS $$
    SELECT count(*) FROM public.audit_event WHERE target_id = target AND event_type = event
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 0. Fixtures that make the assertions able to fail
-- ─────────────────────────────────────────────────────────────────────────────

-- A second advisor with their own client and trip. Only the agent-domain rows: the writes
-- take p_agent_id directly, so no login is needed to prove they refuse the wrong one.
INSERT INTO public.agent (id, display_name, email, status)
VALUES (:other_agent::uuid, 'Other Advisor', 'other.advisor.writes@example.com', 'active');
INSERT INTO public.client (id, agent_id, first_name, last_name, email)
VALUES (:other_client::uuid, :other_agent::uuid, 'Other', 'Client', 'other.client.w@example.com');
INSERT INTO public.trip (id, client_id, agent_id, title, trip_type, status, start_date, end_date)
VALUES (:other_trip::uuid, :other_client::uuid, :other_agent::uuid, 'Other''s trip', 'custom',
        'booked', current_date + 20, current_date + 27);

SELECT pg_temp.assert(
    NOT EXISTS (SELECT 1 FROM public.commission WHERE trip_id = :kyoto::uuid),
    'Kyoto has no ledger line yet, so the create below is the only one on it');

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. No client role can write, export, or reach the helpers
-- ─────────────────────────────────────────────────────────────────────────────

SELECT pg_temp.become(:gyasi::uuid);

SELECT pg_temp.expect_denied(
    format($q$SELECT public.agent_create_commission(%L, %L, gen_random_uuid(), %L, %L, 1000, 10,
             'after_travel', 30, 'expected', NULL, NULL, gen_random_uuid(), NULL, NULL)$q$,
           :agent, :actor, :kyoto, :sandals),
    'even the owning advisor cannot call agent_create_commission over /rpc/');
SELECT pg_temp.expect_denied(
    $q$SELECT public.agent_update_commission(NULL, NULL, NULL, 1, NULL, 0, 0, 'after_travel', 0,
             'expected', NULL, NULL, NULL, NULL, NULL)$q$,
    'nor agent_update_commission');
SELECT pg_temp.expect_denied(
    $q$SELECT public.agent_record_commission_payment(NULL, NULL, NULL, 1, 'received', 0, 0,
             current_date, NULL, NULL, NULL)$q$,
    'nor agent_record_commission_payment');
SELECT pg_temp.expect_denied(
    $q$SELECT public.agent_remove_commission(NULL, NULL, NULL, 1, NULL, NULL, NULL)$q$,
    'nor agent_remove_commission');
SELECT pg_temp.expect_denied(
    $q$SELECT public.agent_export_commission(NULL, NULL, NULL, NULL, NULL, NULL, NULL,
             NULL, NULL, NULL)$q$,
    'nor agent_export_commission');
SELECT pg_temp.expect_denied(
    'SELECT * FROM public.commission_lines_for_current_agent()',
    'nor the scope helper — it is reached only through the definer accessors');
SELECT pg_temp.expect_denied(
    $q$SELECT public.commission_audit(gen_random_uuid(), NULL, 'x', 'x', NULL, '{}', NULL, NULL)$q$,
    'nor the audit helper — an advisor cannot write audit rows');
SELECT pg_temp.expect_denied(
    'UPDATE public.commission SET notes = ''x''',
    'and the table itself is still closed');

RESET ROLE;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Create
-- ─────────────────────────────────────────────────────────────────────────────

SELECT pg_temp.assert(
    (SELECT outcome = 'created' AND version = 1
       FROM public.agent_create_commission(:agent::uuid, :actor::uuid, :line_a::uuid, :kyoto::uuid,
            :sandals::uuid, 123456, 12.5, 'after_travel', 45, 'expected', '  ', '  Call Sandals ',
            pg_temp.aid(), '203.0.113.7', 'psql test')),
    'a line is created on the advisor''s own trip at version 1');

SELECT pg_temp.assert(
    (SELECT expected_commission_cents = 15432 AND currency = 'USD'
        AND payment_terms = 'after_travel' AND payment_lag_days = 45
        AND inteletravel_reference IS NULL AND notes = 'Call Sandals'
        AND received_commission_cents = 0 AND processing_fee_cents = 0
       FROM public.commission WHERE id = :line_a::uuid),
    'expected is computed server-side (123,456 × 12.5% = 15,432), the currency is the trip''s, '
    'a blank reference is stored as NULL and notes are trimmed');

SELECT pg_temp.assert(
    pg_temp.audits(:line_a::uuid, 'commission.created') = 1
    AND (SELECT actor_user_id = :actor::uuid AND actor_role = 'agent'
            AND ip_address = '203.0.113.7'::inet
            AND (metadata->>'expected_commission_cents')::bigint = 15432
            AND metadata->>'has_notes' = 'true'
            AND NOT (metadata::text LIKE '%Call Sandals%')
           FROM public.audit_event
          WHERE target_id = :line_a::uuid AND event_type = 'commission.created'),
    'exactly one audit row: actor, ip, the money — and whether there are notes, never what '
    'they say');

SELECT pg_temp.assert(
    (SELECT outcome FROM public.agent_create_commission(:agent::uuid, :actor::uuid,
        gen_random_uuid(), :other_trip::uuid, :sandals::uuid, 1000, 10, 'after_travel', 30,
        'expected', NULL, NULL, pg_temp.aid(), NULL, NULL)) = 'trip_not_found',
    'an advisor cannot add a line to another advisor''s trip');

SELECT pg_temp.assert(
    (SELECT outcome FROM public.agent_create_commission(:agent::uuid, :actor::uuid,
        gen_random_uuid(), :barbados::uuid, :sandals::uuid, 1000, 10, 'after_travel', 30,
        'expected', NULL, NULL, pg_temp.aid(), NULL, NULL)) = 'trip_not_found',
    'nor to an ARCHIVED trip of their own');

SELECT pg_temp.assert(
    (SELECT outcome FROM public.agent_create_commission(:agent::uuid, :actor::uuid,
        gen_random_uuid(), :kyoto::uuid, gen_random_uuid(), 1000, 10, 'after_travel', 30,
        'expected', NULL, NULL, pg_temp.aid(), NULL, NULL)) = 'supplier_not_found',
    'an unknown supplier is an outcome, not a 500');

SELECT pg_temp.assert(
    (SELECT outcome FROM public.agent_create_commission(:agent::uuid, :actor::uuid,
        gen_random_uuid(), :kyoto::uuid, :sandals::uuid, 1000, 10, 'after_travel', 30,
        'invoiced', 'ITV-2026-0912', NULL, pg_temp.aid(), NULL, NULL)) = 'duplicate_reference',
    'an Inteletravel reference already on another line is refused as an outcome');

SELECT pg_temp.expect_error(
    format($q$SELECT public.agent_create_commission(%L, %L, gen_random_uuid(), %L, %L, 1000, 10,
             'after_travel', 30, 'received', NULL, NULL, gen_random_uuid(), NULL, NULL)$q$,
           :agent, :actor, :kyoto, :sandals),
    'a new line cannot start as received — money arrives through the payment write');

-- `lost` is the case only the function's own check stops: the table's CHECKs allow a lost
-- line with no date and no money, so without this a mistyped status would land.
SELECT pg_temp.expect_error(
    format($q$SELECT public.agent_create_commission(%L, %L, gen_random_uuid(), %L, %L, 1000, 10,
             'after_travel', 30, 'lost', NULL, NULL, gen_random_uuid(), NULL, NULL)$q$,
           :agent, :actor, :kyoto, :sandals),
    'nor as lost — a line that never existed was not lost');

SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_create_commission(:other_agent::uuid, :actor::uuid,
        gen_random_uuid(), :kyoto::uuid, :sandals::uuid, 1000, 10, 'after_travel', 30,
        'expected', NULL, NULL, pg_temp.aid(), NULL, NULL)
      WHERE outcome = 'created') = 0,
    'the other advisor cannot add a line to Gyasi''s trip either');

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. THE AUDIT ROW AND THE CHANGE ARE ONE TRANSACTION
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Reuse an audit id that already exists, so the audit insert hits the primary key. Under the
-- old shape (audit afterwards, from the Edge Function) the line would already be in. Here
-- the whole call must fail and leave nothing behind.

SELECT id AS used_audit_id FROM public.audit_event
 WHERE target_id = :line_a::uuid AND event_type = 'commission.created' \gset

SELECT pg_temp.expect_error(
    format($q$SELECT public.agent_create_commission(%L, %L, %L, %L, %L, 5000, 10,
             'after_travel', 30, 'expected', NULL, NULL, %L, NULL, NULL)$q$,
           :agent, :actor, :line_b, :kyoto, :sandals, :'used_audit_id'),
    'a create whose audit insert fails raises …');
SELECT pg_temp.assert(
    NOT EXISTS (SELECT 1 FROM public.commission WHERE id = :line_b::uuid),
    '… and the line it tried to create does not exist');

SELECT pg_temp.expect_error(
    format($q$SELECT public.agent_create_commission(%L, %L, %L, %L, %L, 5000, 10,
             'after_travel', 30, 'expected', NULL, NULL, NULL, NULL, NULL)$q$,
           :agent, :actor, :line_b, :kyoto, :sandals),
    'a create with NO audit id is refused outright …');
SELECT pg_temp.assert(
    NOT EXISTS (SELECT 1 FROM public.commission WHERE id = :line_b::uuid),
    '… and leaves nothing behind either');

SELECT pg_temp.expect_error(
    format($q$SELECT public.agent_update_commission(%L, %L, %L, 1, %L, 999999, 50,
             'after_travel', 45, 'expected', NULL, 'Call Sandals', %L, NULL, NULL)$q$,
           :agent, :actor, :line_a, :sandals, :'used_audit_id'),
    'an edit whose audit insert fails raises …');
SELECT pg_temp.assert(
    (SELECT gross_booking_cents = 123456 AND version = 1 FROM public.commission
      WHERE id = :line_a::uuid),
    '… and the line still says what it said before, at the same version');

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. The detail read
-- ─────────────────────────────────────────────────────────────────────────────

SELECT pg_temp.become(:gyasi::uuid);
SELECT pg_temp.assert(
    (SELECT l.expected_payment_date = l.trip_end_date + 45 AND l.can_remove AND l.version = 1
            AND l.supplier_name = 'Sandals Resorts' AND l.trip_title = 'Kyoto in the spring'
       FROM public.agent_commission_line(:line_a::uuid) l),
    'after_travel 45 days dates the payment 45 days after the trip ends, and an expected line '
    'with no reference may be removed');
SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_commission_line(gen_random_uuid())) = 0,
    'an unknown id is no row');
SELECT pg_temp.assert(
    (SELECT commission_payment_terms = 'after_travel' AND commission_payment_lag_days = 30
           FROM public.agent_suppliers() WHERE supplier_id = :sandals::uuid),
    'the supplier picker carries each supplier''s default terms, for 3.7.4''s prefill');
RESET ROLE;

-- at_booking dates from the FIRST booked transition, in the agent's zone.
INSERT INTO public.trip_status_history (id, trip_id, from_status, to_status, changed_at, changed_by_user_id)
VALUES (gen_random_uuid(), :kyoto::uuid, 'proposal', 'booked', '2020-01-15 18:00:00+00', :actor::uuid);

SELECT pg_temp.assert(
    (SELECT outcome FROM public.agent_update_commission(:agent::uuid, :actor::uuid, :line_a::uuid,
        1, :sandals::uuid, 123456, 12.5, 'at_booking', 30, 'expected', NULL, 'Call Sandals',
        pg_temp.aid(), NULL, NULL)) = 'changed',
    'terms move to at_booking, 30 days');
SELECT pg_temp.become(:gyasi::uuid);
SELECT pg_temp.assert(
    (SELECT booked_on = '2020-01-15' AND expected_payment_date = '2020-02-14'
       FROM public.agent_commission_line(:line_a::uuid)),
    'at_booking dates the payment from the trip''s FIRST booking (Jan 15 2020 + 30 days)');
RESET ROLE;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Edit
-- ─────────────────────────────────────────────────────────────────────────────

SELECT pg_temp.assert(
    (SELECT outcome = 'stale' AND version = 2
       FROM public.agent_update_commission(:agent::uuid, :actor::uuid, :line_a::uuid, 1,
            :sandals::uuid, 1, 1, 'at_booking', 30, 'expected', NULL, NULL, pg_temp.aid(), NULL, NULL))
    AND (SELECT gross_booking_cents = 123456 FROM public.commission WHERE id = :line_a::uuid),
    'an edit naming an old version is refused as stale, and changes nothing');

SELECT count(*) AS audits_before FROM public.audit_event WHERE target_id = :line_a::uuid \gset
SELECT pg_temp.assert(
    (SELECT outcome = 'noop' AND version = 2
       FROM public.agent_update_commission(:agent::uuid, :actor::uuid, :line_a::uuid, 2,
            :sandals::uuid, 123456, 12.5, 'at_booking', 30, 'expected', NULL, 'Call Sandals',
            pg_temp.aid(), NULL, NULL))
    AND (SELECT count(*) FROM public.audit_event WHERE target_id = :line_a::uuid) = :audits_before,
    'a re-save of identical values is a no-op: no version bump, no audit row');

-- Every row written in this one test transaction shares `created_at` (it defaults to now(),
-- the transaction start), so "the newest audit row" is not a thing to query. The audit id is
-- chosen here and looked up by id.
SELECT gen_random_uuid() AS edit_audit \gset
SELECT pg_temp.assert(
    (SELECT outcome = 'changed' AND version = 3
       FROM public.agent_update_commission(:agent::uuid, :actor::uuid, :line_a::uuid, 2,
            :allianz::uuid, 200000, 14, 'after_travel', 60, 'invoiced', 'ITV-TEST-0001',
            'Call Sandals', :'edit_audit'::uuid, NULL, NULL)),
    'a real edit bumps the version');
SELECT pg_temp.assert(
    (SELECT expected_commission_cents = 28000 AND status = 'invoiced'
       FROM public.commission WHERE id = :line_a::uuid)
    AND (SELECT (metadata->'changes'->'gross_booking_cents'->>'from')::bigint = 123456
            AND (metadata->'changes'->'gross_booking_cents'->>'to')::bigint = 200000
            AND (metadata->'changes'->'expected_commission_cents'->>'to')::bigint = 28000
            AND metadata->'changes'->'status'->>'to' = 'invoiced'
            AND metadata->>'notes_changed' = 'false'
           FROM public.audit_event WHERE id = :'edit_audit'::uuid),
    'expected is recomputed, and the audit keeps before AND after for each financial field');

SELECT pg_temp.assert(
    (SELECT outcome FROM public.agent_update_commission(:agent::uuid, :actor::uuid, :line_a::uuid, 3,
        :allianz::uuid, 200000, 14, 'after_travel', 60, 'received', 'ITV-TEST-0001', 'Call Sandals',
        pg_temp.aid(), NULL, NULL)) = 'needs_payment',
    'the edit cannot MOVE a line to received — that is the payment write''s job');

SELECT pg_temp.assert(
    (SELECT outcome FROM public.agent_update_commission(:agent::uuid, :actor::uuid, :line_a::uuid, 3,
        :allianz::uuid, 200000, 14, 'after_travel', 60, 'invoiced', 'ITV-2026-0912', 'Call Sandals',
        pg_temp.aid(), NULL, NULL)) = 'duplicate_reference',
    'an edit to a reference another line holds is refused');

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Mark received
-- ─────────────────────────────────────────────────────────────────────────────

SELECT pg_temp.assert(
    (SELECT outcome FROM public.agent_record_commission_payment(:agent::uuid, :actor::uuid,
        :line_a::uuid, 3, 'received', 27000, 500, current_date + 400, pg_temp.aid(), NULL, NULL))
        = 'bad_date',
    'money cannot be recorded as arriving in the future');

SELECT pg_temp.assert(
    (SELECT outcome = 'recorded' AND version = 4 AND gap_cents = '500'
       FROM public.agent_record_commission_payment(:agent::uuid, :actor::uuid, :line_a::uuid, 3,
            'disputed', 27000, 500, current_date - 1, pg_temp.aid(), NULL, NULL)),
    'a short payment is recorded as disputed, and the gap (28,000 − 500 − 27,000 = 500) comes back');
SELECT pg_temp.assert(
    (SELECT status = 'disputed' AND received_commission_cents = 27000
            AND processing_fee_cents = 500 AND received_at = current_date - 1
       FROM public.commission WHERE id = :line_a::uuid)
    AND pg_temp.audits(:line_a::uuid, 'commission.payment_recorded') = 1,
    'the line carries the money, the fee and the date, with one audit row');

-- Moving a paid line back clears the payment — but only when the caller SAYS so.
SELECT outcome AS unflagged FROM public.agent_update_commission(:agent::uuid, :actor::uuid,
    :line_a::uuid, 4, :allianz::uuid, 200000, 14, 'after_travel', 60, 'invoiced', 'ITV-TEST-0001',
    'Call Sandals', pg_temp.aid(), NULL, NULL) \gset
SELECT pg_temp.assert(
    :'unflagged' = 'payment_would_clear'
    AND (SELECT status = 'disputed' AND received_commission_cents = 27000 AND version = 4
           FROM public.commission WHERE id = :line_a::uuid),
    'without p_clear_payment the edit refuses to wipe a recorded payment, and changes nothing');

-- With the flag it clears, and the audit keeps what was cleared.
--
-- THE WRITE AND ITS CHECK ARE SEPARATE STATEMENTS from here on. A subquery reads the
-- snapshot its STATEMENT started with, so `(SELECT outcome FROM write(...)) AND (SELECT ...
-- FROM commission)` in one SELECT checks the row as it was BEFORE the write — and AND's
-- evaluation order is not promised either. Capture the outcome, then look.
SELECT gen_random_uuid() AS clear_audit \gset
SELECT outcome AS clear_outcome FROM public.agent_update_commission(:agent::uuid, :actor::uuid,
    :line_a::uuid, 4, :allianz::uuid, 200000, 14, 'after_travel', 60, 'invoiced', 'ITV-TEST-0001',
    'Call Sandals', :'clear_audit'::uuid, NULL, NULL, true) \gset
SELECT pg_temp.assert(
    :'clear_outcome' = 'changed'
    AND (SELECT received_at IS NULL AND received_commission_cents = 0 AND processing_fee_cents = 0
           FROM public.commission WHERE id = :line_a::uuid)
    AND (SELECT (metadata->'changes'->'payment_cleared'->>'received_commission_cents')::bigint = 27000
           FROM public.audit_event WHERE id = :'clear_audit'::uuid),
    'moving a disputed line back to invoiced clears its payment, and the audit says what was there');

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Remove — Gyasi's rule
-- ─────────────────────────────────────────────────────────────────────────────

SELECT pg_temp.assert(
    (SELECT outcome FROM public.agent_remove_commission(:agent::uuid, :actor::uuid, :line_a::uuid,
        5, pg_temp.aid(), NULL, NULL)) = 'not_removable',
    'an invoiced line with a reference cannot be removed');

SELECT outcome AS c_created FROM public.agent_create_commission(:agent::uuid, :actor::uuid,
    :line_c::uuid, :kyoto::uuid, :sandals::uuid, 10000, 10, 'after_travel', 30, 'expected',
    'ITV-TEST-0002', NULL, pg_temp.aid(), NULL, NULL) \gset
SELECT outcome AS c_removed FROM public.agent_remove_commission(:agent::uuid, :actor::uuid,
    :line_c::uuid, 1, pg_temp.aid(), NULL, NULL) \gset
SELECT pg_temp.assert(
    :'c_created' = 'created' AND :'c_removed' = 'not_removable',
    'an EXPECTED line that already carries an Inteletravel reference cannot be removed either');

SELECT pg_temp.assert(
    (SELECT outcome FROM public.agent_create_commission(:agent::uuid, :actor::uuid, :line_b::uuid,
        :kyoto::uuid, :sandals::uuid, 10000, 10, 'after_travel', 30, 'expected', NULL, NULL,
        pg_temp.aid(), NULL, NULL)) = 'created',
    'a line entered by mistake');

SELECT pg_temp.become(:gyasi::uuid);
SELECT count(*) AS ledger_before FROM public.agent_commission_ledger(NULL, NULL, NULL, NULL, NULL, 500, 0) \gset
RESET ROLE;

SELECT outcome AS b_removed, version AS b_version FROM public.agent_remove_commission(
    :agent::uuid, :actor::uuid, :line_b::uuid, 1, pg_temp.aid(), NULL, NULL) \gset
SELECT pg_temp.assert(
    :'b_removed' = 'removed' AND :b_version = 2
    AND (SELECT archived_at IS NOT NULL FROM public.commission WHERE id = :line_b::uuid)
    AND pg_temp.audits(:line_b::uuid, 'commission.removed') = 1,
    'an expected line with no reference is removed: hidden, not deleted, and audited');

SELECT pg_temp.become(:gyasi::uuid);
SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_commission_ledger(NULL, NULL, NULL, NULL, NULL, 500, 0))
        = :ledger_before - 1
    AND (SELECT count(*) FROM public.agent_commission_line(:line_b::uuid)) = 0
    AND (SELECT total_count FROM public.agent_commission_ledger_summary()) = :ledger_before - 1,
    'a removed line leaves the ledger, the chip counts and the detail read');
RESET ROLE;

SELECT pg_temp.assert(
    (SELECT outcome FROM public.agent_remove_commission(:agent::uuid, :actor::uuid, :line_b::uuid,
        2, pg_temp.aid(), NULL, NULL)) = 'not_found',
    'and cannot be removed — or edited — twice');

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. Tenancy for writes: the wrong advisor, and a line whose two agent ids disagree
-- ─────────────────────────────────────────────────────────────────────────────

SELECT pg_temp.assert(
    (SELECT outcome FROM public.agent_update_commission(:other_agent::uuid, :actor::uuid,
        :line_a::uuid, 5, :sandals::uuid, 1, 1, 'after_travel', 0, 'lost', NULL, NULL,
        pg_temp.aid(), NULL, NULL)) = 'not_found'
    AND (SELECT outcome FROM public.agent_record_commission_payment(:other_agent::uuid,
        :actor::uuid, :line_a::uuid, 5, 'received', 1, 0, current_date, pg_temp.aid(), NULL, NULL))
        = 'not_found',
    'the other advisor can neither edit nor mark received a line of Gyasi''s');

-- Gyasi's agent id on the other advisor's trip: the schema allows it, nothing should touch it.
INSERT INTO public.commission (id, trip_id, agent_id, supplier_id, gross_booking_cents,
    commission_pct, expected_commission_cents, currency, payment_terms, status)
VALUES (:line_x::uuid, :other_trip::uuid, :agent::uuid, :sandals::uuid, 1000, 10, 100, 'USD',
        'after_travel', 'expected');

SELECT pg_temp.assert(
    (SELECT outcome FROM public.agent_update_commission(:agent::uuid, :actor::uuid, :line_x::uuid,
        1, :sandals::uuid, 1, 1, 'after_travel', 0, 'lost', NULL, NULL, pg_temp.aid(), NULL, NULL))
        = 'not_found'
    AND (SELECT outcome FROM public.agent_update_commission(:other_agent::uuid, :actor::uuid,
        :line_x::uuid, 1, :sandals::uuid, 1, 1, 'after_travel', 0, 'lost', NULL, NULL,
        pg_temp.aid(), NULL, NULL)) = 'not_found'
    AND (SELECT outcome FROM public.agent_remove_commission(:agent::uuid, :actor::uuid,
        :line_x::uuid, 1, pg_temp.aid(), NULL, NULL)) = 'not_found',
    'a line whose two agent ids disagree cannot be written by either advisor');

-- Payment on the mismatched line, from either advisor: same answer.
SELECT pg_temp.assert(
    (SELECT outcome FROM public.agent_record_commission_payment(:agent::uuid, :actor::uuid,
        :line_x::uuid, 1, 'received', 100, 0, current_date - 1, pg_temp.aid(), NULL, NULL)) = 'not_found'
    AND (SELECT outcome FROM public.agent_record_commission_payment(:other_agent::uuid, :actor::uuid,
        :line_x::uuid, 1, 'received', 100, 0, current_date - 1, pg_temp.aid(), NULL, NULL)) = 'not_found',
    'nor can it be marked received by either');

-- And the mirror image: the OTHER advisor's id on GYASI's trip.
INSERT INTO public.commission (id, trip_id, agent_id, supplier_id, gross_booking_cents,
    commission_pct, expected_commission_cents, currency, payment_terms, status)
VALUES (:line_y::uuid, :kyoto::uuid, :other_agent::uuid, :sandals::uuid, 2000, 10, 200, 'USD',
        'after_travel', 'expected');

-- An archived advisor writes nothing.
UPDATE public.agent SET status = 'archived' WHERE id = :other_agent::uuid;
SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_create_commission(:other_agent::uuid, :actor::uuid,
        gen_random_uuid(), :other_trip::uuid, :sandals::uuid, 1000, 10, 'after_travel', 30,
        'expected', NULL, NULL, pg_temp.aid(), NULL, NULL)) = 0,
    'an archived advisor gets no answer at all, not even trip_not_found');

-- A traveler asking for one of Gyasi's lines by id gets nothing.
SELECT pg_temp.become(:jordan::uuid);
SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_commission_line(:line_a::uuid)) = 0,
    'a traveler gets no row from agent_commission_line, even with a real line id');
RESET ROLE;

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. The export — one jsonb array, so PostgREST's max_rows cannot cut it short
-- ─────────────────────────────────────────────────────────────────────────────

SELECT pg_temp.become(:gyasi::uuid);
SELECT count(*) AS ledger_lines FROM public.agent_commission_ledger(NULL, NULL, NULL, NULL, NULL, 500, 0) \gset
SELECT count(*) AS ledger_lost FROM public.agent_commission_ledger(ARRAY['lost']::commission_status[], NULL, NULL, NULL, NULL, 500, 0) \gset
SELECT count(*) AS ledger_allianz FROM public.agent_commission_ledger(NULL, :allianz::uuid, NULL, NULL, NULL, 500, 0) \gset
SELECT count(*) AS ledger_kyoto FROM public.agent_commission_ledger(NULL, NULL, :kyoto::uuid, NULL, NULL, 500, 0) \gset
SELECT count(*) AS ledger_dated FROM public.agent_commission_ledger(NULL, NULL, NULL, current_date - 200, current_date + 200, 500, 0) \gset
RESET ROLE;

SELECT gen_random_uuid() AS export_audit \gset
SELECT public.agent_export_commission(:agent::uuid, :actor::uuid, NULL, NULL, NULL, NULL, NULL,
    :'export_audit'::uuid, NULL, NULL) AS export_rows \gset

SELECT pg_temp.assert(
    jsonb_typeof(:'export_rows'::jsonb) = 'array'
    AND jsonb_array_length(:'export_rows'::jsonb) = :ledger_lines,
    'an unfiltered export is one array holding exactly the ledger''s lines');

SELECT pg_temp.assert(
    NOT EXISTS (SELECT 1 FROM jsonb_array_elements(:'export_rows'::jsonb) e
                 WHERE e->>'trip_title' = 'Other''s trip')
    AND (SELECT count(*) FROM jsonb_array_elements(:'export_rows'::jsonb) e
          WHERE e->>'trip_title' = 'Kyoto in the spring') = :ledger_kyoto,
    'neither mismatched line is in it — not Gyasi''s id on the other trip, not the other id on Kyoto');

SELECT pg_temp.assert(
    (SELECT event_type = 'commission.exported' AND target_entity = 'agent'
            AND target_id = :agent::uuid AND (metadata->>'row_count')::int = :ledger_lines
       FROM public.audit_event WHERE id = :'export_audit'::uuid),
    'and writes one audit row naming the advisor and the row count');

SELECT gen_random_uuid() AS export_audit_2 \gset
SELECT jsonb_array_length(public.agent_export_commission(:agent::uuid, :actor::uuid,
    ARRAY['lost']::commission_status[], NULL, NULL, NULL, NULL, :'export_audit_2'::uuid, NULL, NULL))
    AS lost_exported \gset
SELECT pg_temp.assert(
    :lost_exported = :ledger_lost
    AND (SELECT metadata->'filters'->'status' = '["lost"]'::jsonb
           FROM public.audit_event WHERE id = :'export_audit_2'::uuid),
    'a status-filtered export applies the ledger''s filter and records it');

-- The other three filters are a second copy of the ledger's predicate. Each against the
-- ledger's own count for the same filter.
SELECT pg_temp.assert(
    jsonb_array_length(public.agent_export_commission(:agent::uuid, :actor::uuid, NULL,
        :allianz::uuid, NULL, NULL, NULL, gen_random_uuid(), NULL, NULL)) = :ledger_allianz
    AND jsonb_array_length(public.agent_export_commission(:agent::uuid, :actor::uuid, NULL,
        NULL, :kyoto::uuid, NULL, NULL, gen_random_uuid(), NULL, NULL)) = :ledger_kyoto
    AND jsonb_array_length(public.agent_export_commission(:agent::uuid, :actor::uuid, NULL,
        NULL, NULL, current_date - 200, current_date + 200, gen_random_uuid(), NULL, NULL)) = :ledger_dated
    AND :ledger_allianz > 0 AND :ledger_kyoto > 0 AND :ledger_dated > 0,
    'the supplier, trip and travel-date filters match the ledger''s for the same filter');

SELECT pg_temp.expect_error(
    format($q$SELECT public.agent_export_commission(%L, %L, NULL, NULL, NULL, NULL, NULL,
             %L, NULL, NULL)$q$, :agent, :actor, :'export_audit'),
    'an export whose audit row cannot be written fails — no rows leave without a record');

-- ─────────────────────────────────────────────────────────────────────────────
-- 10. The terms shape is enforced
-- ─────────────────────────────────────────────────────────────────────────────

SELECT pg_temp.expect_error(
    $q$UPDATE public.commission SET payment_lag_days = 400 WHERE id = '0c7b0000-0000-7000-8000-0000000000a1'$q$,
    'a lag over 365 days is refused');
SELECT pg_temp.expect_error(
    $q$UPDATE public.supplier SET commission_payment_terms = NULL, commission_payment_lag_days = 30
        WHERE id = '0195a2c0-1a00-7000-8000-000000000030'$q$,
    'a supplier lag with no terms ("30 days after… something") is refused');

-- ─────────────────────────────────────────────────────────────────────────────
-- 11. The remove rule is about HISTORY, and the payment write's own edges
-- ─────────────────────────────────────────────────────────────────────────────
--
-- The walk-around review found: invoice it, pay it, edit it back to expected with the
-- reference blanked — then the current-state test passed and the line could be removed.

SELECT outcome AS d1 FROM public.agent_create_commission(:agent::uuid, :actor::uuid, :line_d::uuid,
    :kyoto::uuid, :sandals::uuid, 50000, 10, 'after_travel', 30, 'invoiced', 'ITV-TEST-0003', NULL,
    pg_temp.aid(), NULL, NULL) \gset
SELECT outcome AS d2 FROM public.agent_record_commission_payment(:agent::uuid, :actor::uuid,
    :line_d::uuid, 1, 'received', 5000, 0, current_date - 1, pg_temp.aid(), NULL, NULL) \gset
SELECT outcome AS d3 FROM public.agent_update_commission(:agent::uuid, :actor::uuid, :line_d::uuid,
    2, :sandals::uuid, 50000, 10, 'after_travel', 30, 'expected', '', NULL, pg_temp.aid(), NULL, NULL,
    true) \gset
SELECT outcome AS d4 FROM public.agent_remove_commission(:agent::uuid, :actor::uuid, :line_d::uuid,
    3, pg_temp.aid(), NULL, NULL) \gset
SELECT pg_temp.assert(
    :'d1' = 'created' AND :'d2' = 'recorded' AND :'d3' = 'changed' AND :'d4' = 'not_removable'
    AND (SELECT status = 'expected' AND inteletravel_reference IS NULL AND on_record_at IS NOT NULL
                AND archived_at IS NULL
           FROM public.commission WHERE id = :line_d::uuid),
    'a line that was ever invoiced stays unremovable, even edited back to expected with no '
    'reference — on_record_at remembers');

UPDATE public.commission SET on_record_at = NULL WHERE id = :line_d::uuid;
SELECT pg_temp.assert(
    (SELECT on_record_at IS NOT NULL FROM public.commission WHERE id = :line_d::uuid),
    'and the stamp cannot be cleared by a direct UPDATE either — the trigger keeps it');

SELECT pg_temp.expect_error(
    format($q$SELECT public.agent_record_commission_payment(%L, %L, %L, 3, 'received', 0, 0,
             current_date - 1, gen_random_uuid(), NULL, NULL)$q$, :agent, :actor, :line_d),
    'a line recorded as RECEIVED needs an amount — $0 received is disputed or lost, not received');

-- Payment and remove are atomic with their audit rows too, not only create, edit and export.
SELECT pg_temp.expect_error(
    format($q$SELECT public.agent_record_commission_payment(%L, %L, %L, 3, 'received', 4000, 0,
             current_date - 1, %L, NULL, NULL)$q$, :agent, :actor, :line_d, :'used_audit_id'),
    'a payment whose audit insert fails raises …');
SELECT pg_temp.assert(
    (SELECT status = 'expected' AND received_commission_cents = 0 AND version = 3
       FROM public.commission WHERE id = :line_d::uuid),
    '… and the line is exactly as it was');

SELECT pg_temp.assert(
    (SELECT outcome FROM public.agent_create_commission(:agent::uuid, :actor::uuid, :line_e::uuid,
        :kyoto::uuid, :sandals::uuid, 10000, 10, 'after_travel', 30, 'expected', NULL, NULL,
        pg_temp.aid(), NULL, NULL)) = 'created',
    'a fresh, removable line');
SELECT pg_temp.expect_error(
    format($q$SELECT public.agent_remove_commission(%L, %L, %L, 1, %L, NULL, NULL)$q$,
           :agent, :actor, :line_e, :'used_audit_id'),
    'a remove whose audit insert fails raises …');
SELECT pg_temp.assert(
    (SELECT archived_at IS NULL AND version = 1 FROM public.commission WHERE id = :line_e::uuid),
    '… and the line is still there');

-- "Not in the future" is the ADVISOR's future. Give Gyasi a zone whose date differs from
-- UTC's right now (UTC+14 or UTC-11), then test his tomorrow and his today.
UPDATE public.agent
   SET time_zone = CASE WHEN (now() AT TIME ZONE 'Pacific/Kiritimati')::date
                             <> (now() AT TIME ZONE 'UTC')::date
                        THEN 'Pacific/Kiritimati' ELSE 'Pacific/Pago_Pago' END
 WHERE id = :agent::uuid;
SELECT (now() AT TIME ZONE a.time_zone)::date AS local_today FROM public.agent a
 WHERE a.id = :agent::uuid \gset
SELECT pg_temp.assert(
    :'local_today'::date <> (now() AT TIME ZONE 'UTC')::date,
    'the advisor''s date now differs from UTC''s, so a UTC slip cannot hide');

SELECT outcome AS tz_tomorrow FROM public.agent_record_commission_payment(:agent::uuid, :actor::uuid,
    :line_e::uuid, 1, 'received', 1000, 0, (:'local_today'::date + 1), pg_temp.aid(), NULL, NULL) \gset
SELECT outcome AS tz_today FROM public.agent_record_commission_payment(:agent::uuid, :actor::uuid,
    :line_e::uuid, 1, 'received', 1000, 0, :'local_today'::date, pg_temp.aid(), NULL, NULL) \gset
SELECT pg_temp.assert(
    :'tz_tomorrow' = 'bad_date' AND :'tz_today' = 'recorded',
    'the advisor''s tomorrow is refused and the advisor''s today is accepted');

ROLLBACK;
