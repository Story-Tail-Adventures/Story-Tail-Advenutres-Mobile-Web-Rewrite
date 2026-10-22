-- §3.7 Stage 3 — import an Inteletravel statement (3.7.5) and reconcile it (3.7.6).
--
-- WHAT THIS FILE IS GUARDING.
--
--   1. The writes take `p_agent_id` as trusted input, so no client role may call them, and
--      the reads show an advisor their own statements only.
--   2. Gyasi's rulings (2026-10-11): a row matching a line already received or disputed NEVER
--      changes it — including a line paid by hand between the import and the reconcile; one
--      row per booking (a second is a duplicate); an unmatched row can become a new line.
--   3. NOTHING TOUCHES THE LEDGER UNTIL RECONCILE, and reconcile is all-or-nothing: tested by
--      making one of its audit inserts FAIL and checking that no line moved.
--   4. The matcher's three kinds of evidence each find what they should and only that.
--
-- Run against a freshly reset local database:
--     supabase db reset
--     psql "$(supabase status -o json | jq -r .DB_URL)" -v ON_ERROR_STOP=1 \
--          -f supabase/tests/rls_agent_commission_import.sql

\set ON_ERROR_STOP on

BEGIN;

\set gyasi    '''0195a2c0-1a00-7000-8000-000000000010'''
\set jordan   '''0195a2c0-1a00-7000-8000-000000000011'''
\set agent    '''0195a2c0-1a00-7000-8000-000000000001'''
\set sandals  '''0195a2c0-1a00-7000-8000-000000000030'''
\set rcl      '''0195a2c0-1a00-7000-8000-000000000033'''
\set kyoto    '''0195a2c0-1a00-7000-8000-000000000112'''
\set barbados '''0195a2c0-1a00-7000-8000-0000000000af'''
-- Seeded ledger lines this file leans on (supabase/seed.sql):
\set l_quintero '''01a0b1c2-d300-7000-8000-000000000084'''
\set l_negril   '''01a0b1c2-d300-7000-8000-000000000070'''
\set l_oyelaran '''01a0b1c2-d300-7000-8000-000000000083'''
\set l_cabo     '''01a0b1c2-d300-7000-8000-000000000074'''
\set l_sandoval '''01a0b1c2-d300-7000-8000-000000000085'''
\set other_agent  '''0c7c0000-0000-7000-8000-000000000001'''
\set other_client '''0c7c0000-0000-7000-8000-000000000002'''
\set other_trip   '''0c7c0000-0000-7000-8000-000000000003'''
\set other_line   '''0c7c0000-0000-7000-8000-000000000004'''
\set imp_a    '''0c7c0000-0000-7000-8000-0000000000a0'''
\set imp_b    '''0c7c0000-0000-7000-8000-0000000000b0'''
\set imp_b2   '''0c7c0000-0000-7000-8000-0000000000b2'''
\set imp_c    '''0c7c0000-0000-7000-8000-0000000000c0'''
\set doc_a    '''0c7c0000-0000-7000-8000-0000000000da'''
\set doc_b    '''0c7c0000-0000-7000-8000-0000000000db'''
\set doc_b2   '''0c7c0000-0000-7000-8000-0000000000d2'''
\set doc_c    '''0c7c0000-0000-7000-8000-0000000000dc'''
\set new_line '''0c7c0000-0000-7000-8000-0000000000ee'''
\set aid_once '''0c7c0000-0000-7000-8000-0000000000ff'''

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

SELECT pu.id AS actor FROM public.platform_user pu WHERE pu.account_id = :gyasi::uuid \gset
\set actor '''':actor''''

-- 1,001 fresh audit ids, as the Edge Function sends.
CREATE OR REPLACE FUNCTION pg_temp.aids() RETURNS uuid[] LANGUAGE sql AS $$
    SELECT array_agg(gen_random_uuid()) FROM generate_series(1, 1001)
$$;

CREATE OR REPLACE FUNCTION pg_temp.ver(p_import uuid) RETURNS integer LANGUAGE sql AS $$
    SELECT version FROM public.commission_import WHERE id = p_import
$$;

CREATE OR REPLACE FUNCTION pg_temp.row_state(p_import uuid, p_n integer)
RETURNS public.commission_import_row_state LANGUAGE sql AS $$
    SELECT state FROM public.commission_import_row WHERE import_id = p_import AND row_number = p_n
$$;

CREATE OR REPLACE FUNCTION pg_temp.row_id(p_import uuid, p_n integer) RETURNS uuid LANGUAGE sql AS $$
    SELECT id FROM public.commission_import_row WHERE import_id = p_import AND row_number = p_n
$$;

-- An upload's rows: one fresh id per row and its cells.
CREATE OR REPLACE FUNCTION pg_temp.rows_of(VARIADIC cells text[]) RETURNS jsonb LANGUAGE sql AS $$
    SELECT jsonb_agg(jsonb_build_object('id', gen_random_uuid(),
                                        'cells', to_jsonb(string_to_array(c, '|'))) ORDER BY n)
      FROM unnest(cells) WITH ORDINALITY AS u(c, n)
$$;

-- A map's rows: what the Edge Function read from each, keyed by row number.
CREATE OR REPLACE FUNCTION pg_temp.parsed(p_import uuid, p_rows jsonb) RETURNS jsonb LANGUAGE sql AS $$
    SELECT jsonb_agg(x.v || jsonb_build_object('id', r.id) ORDER BY r.row_number)
      FROM public.commission_import_row r
      JOIN jsonb_array_elements(p_rows) WITH ORDINALITY AS x(v, n) ON x.n = r.row_number
     WHERE r.import_id = p_import
$$;

CREATE OR REPLACE FUNCTION pg_temp.audits(target uuid, event text) RETURNS bigint
LANGUAGE sql AS $$
    SELECT count(*) FROM public.audit_event WHERE target_id = target AND event_type = event
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 0. Fixtures
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.agent (id, display_name, email, status)
VALUES (:other_agent::uuid, 'Other Advisor', 'other.advisor.import@example.com', 'active');
INSERT INTO public.client (id, agent_id, first_name, last_name, email)
VALUES (:other_client::uuid, :other_agent::uuid, 'Pat', 'Quintero', 'other.client.imp@example.com');
INSERT INTO public.trip (id, client_id, agent_id, title, trip_type, status, start_date, end_date)
VALUES (:other_trip::uuid, :other_client::uuid, :other_agent::uuid, 'Other''s trip', 'custom',
        'booked', current_date + 20, current_date + 27);
INSERT INTO public.commission
    (id, trip_id, agent_id, supplier_id, gross_booking_cents, commission_pct,
     expected_commission_cents, processing_fee_cents, received_commission_cents, currency,
     payment_terms, payment_lag_days, status)
VALUES (:other_line::uuid, :other_trip::uuid, :other_agent::uuid, :sandals::uuid, 480000, 12,
        57600, 0, 0, 'USD', 'after_travel', 30, 'expected');

SELECT pg_temp.assert(
    (SELECT status = 'invoiced' AND inteletravel_reference = 'ITV-2026-0846'
       FROM public.commission WHERE id = :l_quintero::uuid)
    AND (SELECT status = 'expected' AND inteletravel_reference IS NULL
           FROM public.commission WHERE id = :l_negril::uuid)
    AND (SELECT status = 'received' FROM public.commission WHERE id = :l_oyelaran::uuid)
    AND (SELECT status = 'expected' AND inteletravel_reference IS NULL
           FROM public.commission WHERE id = :l_cabo::uuid)
    AND EXISTS (SELECT 1 FROM public.trip_component
                 WHERE trip_id = (SELECT trip_id FROM public.commission WHERE id = :l_negril::uuid)
                   AND confirmation_number = 'SRB-220119'),
    'the seed still has the lines this file matches against');

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. No client role can write or reach the helpers
-- ─────────────────────────────────────────────────────────────────────────────

SELECT pg_temp.become(:gyasi::uuid);

SELECT pg_temp.expect_denied(
    $q$SELECT public.agent_upload_commission_statement(NULL, NULL, NULL, NULL, 'x', 1, '\x00',
             'k', '{}', '{}', '[]', NULL, NULL, NULL)$q$,
    'even the owning advisor cannot call agent_upload_commission_statement over /rpc/');
SELECT pg_temp.expect_denied(
    $q$SELECT public.agent_map_commission_import(NULL, NULL, 1, '{}', NULL, '[]')$q$,
    'nor agent_map_commission_import');
SELECT pg_temp.expect_denied(
    $q$SELECT public.agent_resolve_commission_import_row(NULL, NULL, 1, NULL, 'ignore')$q$,
    'nor agent_resolve_commission_import_row');
SELECT pg_temp.expect_denied(
    $q$SELECT public.agent_reconcile_commission_import(NULL, NULL, NULL, 1, NULL, NULL, NULL)$q$,
    'nor agent_reconcile_commission_import');
SELECT pg_temp.expect_denied(
    $q$SELECT public.agent_discard_commission_import(NULL, NULL, NULL, 1, NULL, NULL, NULL)$q$,
    'nor agent_discard_commission_import');
SELECT pg_temp.expect_denied(
    $q$SELECT public.commission_import_match(NULL, NULL)$q$,
    'nor the matcher');
SELECT pg_temp.expect_denied(
    'SELECT * FROM public.commission_import_row',
    'and an imported statement''s rows are closed to the advisor''s own session');

RESET ROLE;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Upload
-- ─────────────────────────────────────────────────────────────────────────────

-- Statement A, nine rows, each built to exercise one path:
--   1 reference already on an invoiced line      → confirmed (Quintero)
--   2 a supplier confirmation number             → confirmed (Negril, via SRB-220119)
--   3 reference on a line already received       → already_recorded (Oyelaran)
--   4 supplier + traveler + close amount         → suggested (Cabo, Carter)
--   5 nothing                                    → unmatched
--   6 row 1's reference again                    → duplicate
--   7 an unreadable amount                       → unreadable
--   8 a date after today                         → unreadable
--   9 nothing paid                               → unreadable
SELECT pg_temp.assert(
    (SELECT outcome = 'uploaded' AND import_id = :imp_a::uuid
       FROM public.agent_upload_commission_statement(
            :agent::uuid, :actor::uuid, :imp_a::uuid, :doc_a::uuid, 'april.csv', 2048,
            '\xaa01'::bytea, 'k/a.csv',
            ARRAY['BookingRef','SupplierName','PaxName','GrossAmt','CommissionAmt','Fee','PaidOn'],
            '{"reference":0,"supplier":1,"traveler":2,"gross":3,"received":4,"fee":5,"paid_on":6}',
            pg_temp.rows_of(
                'ITV-2026-0846|Sandals|J Quintero|4800.00|540.00|36.00|x',
                'SRB-220119|Sandals Resorts|M Hayes|10000|1100.00|0|x',
                'ITV-2026-0888|Sandals|Oyelaran|4500|500.00|0|x',
                '|Sandals Resorts|Ray Carter|5000|580.00||x',
                'UNK-441|Princess|Pat Nobody|2000|284.00||x',
                'itv-2026-0846 |Sandals|J Quintero|4800.00|540.00|36.00|x',
                'XYZ|Sandals|Someone|1|abc||x',
                'FUT-1|Sandals|Someone|1|100.00||x',
                'ZERO-1|Sandals|Someone|1|0||x'),
            gen_random_uuid(), '203.0.113.9, 10.0.0.1', 'psql test')),
    'a statement uploads');

SELECT pg_temp.assert(
    (SELECT status = 'mapping' AND total_rows = 9 AND matched_rows = 0 AND unmatched_rows = 9
            AND version = 1 AND agent_id = :agent::uuid AND document_id = :doc_a::uuid
            AND headers[2] = 'SupplierName' AND (column_map->>'received')::int = 4
       FROM public.commission_import WHERE id = :imp_a::uuid)
    AND (SELECT kind = 'csv_import' AND storage_bucket = 'commission-statements'
                AND is_sensitive AND client_id IS NULL AND trip_id IS NULL
           FROM public.document WHERE id = :doc_a::uuid)
    AND (SELECT count(*) = 9 AND bool_and(state = 'unmatched' AND reference IS NULL)
           FROM public.commission_import_row WHERE import_id = :imp_a::uuid)
    AND (SELECT cells = ARRAY['ITV-2026-0846','Sandals','J Quintero','4800.00','540.00','36.00','x']
           FROM public.commission_import_row WHERE import_id = :imp_a::uuid AND row_number = 1),
    'the import waits for its map, its file is a sensitive csv_import document in the private '
    'bucket, and each row keeps its cells in file order — nothing read from them yet');

SELECT pg_temp.assert(
    pg_temp.audits(:imp_a::uuid, 'commission.statement_uploaded') = 1
    AND (SELECT ip_address = '203.0.113.9'::inet AND (metadata->>'row_count')::int = 9
                AND metadata->>'checksum_sha256' = 'aa01'
           FROM public.audit_event
          WHERE target_id = :imp_a::uuid AND event_type = 'commission.statement_uploaded'),
    'the upload is audited with its row count and checksum');

SELECT pg_temp.assert(
    (SELECT outcome = 'duplicate_file' AND import_id = :imp_a::uuid
       FROM public.agent_upload_commission_statement(
            :agent::uuid, :actor::uuid, gen_random_uuid(), gen_random_uuid(), 'april-again.csv',
            2048, '\xaa01'::bytea, 'k', ARRAY['a'], '{}', pg_temp.rows_of('x'),
            gen_random_uuid(), NULL, NULL)),
    'the same file again is refused as a duplicate, naming the import that has it');

SELECT pg_temp.expect_error(
    format($q$SELECT * FROM public.agent_upload_commission_statement(%L, %L, gen_random_uuid(),
             gen_random_uuid(), 'big.csv', 1, '\xbb'::bytea, 'k', ARRAY['a'], '{}',
             (SELECT jsonb_agg(jsonb_build_object('id', gen_random_uuid(), 'cells', '["x"]'::jsonb))
                FROM generate_series(1, 1001)), gen_random_uuid(), NULL, NULL)$q$,
           :agent, :actor),
    'a statement of more than 1,000 rows is refused');

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Map, and the matcher
-- ─────────────────────────────────────────────────────────────────────────────

SELECT pg_temp.expect_error(
    format($q$SELECT * FROM public.agent_map_commission_import(%L, %L, 1, '{}', NULL,
             (SELECT jsonb_agg(x) FROM (SELECT jsonb_build_object('id', id) AS x
                FROM public.commission_import_row WHERE import_id = %L LIMIT 8) s))$q$,
           :agent, :imp_a, :imp_a),
    'a map that leaves a row unread is refused');

SELECT pg_temp.expect_error(
    format($q$SELECT * FROM public.agent_map_commission_import(%L, %L, 1, '{}', NULL,
             (SELECT jsonb_agg(jsonb_build_object('id', r.id) ORDER BY r.row_number)
                FROM public.commission_import_row r WHERE r.import_id = %L AND r.row_number <> 9)
             || jsonb_build_array(jsonb_build_object('id', pg_temp.row_id(%L, 1))))$q$,
           :agent, :imp_a, :imp_a, :imp_a),
    'and so is one that reads a row twice in place of another');

SELECT pg_temp.assert(
    (SELECT outcome FROM public.agent_map_commission_import(:other_agent::uuid, :imp_a::uuid, 1,
        '{}', NULL, '[]')) = 'not_found',
    'another advisor cannot map this advisor''s statement');

SELECT pg_temp.assert(
    (SELECT outcome FROM public.agent_map_commission_import(:agent::uuid, :imp_a::uuid, 99,
        '{}', NULL, '[]')) = 'stale',
    'a map naming an old version is stale');

SELECT pg_temp.assert(
    (SELECT outcome = 'mapped' AND version = 2
       FROM public.agent_map_commission_import(:agent::uuid, :imp_a::uuid, 1,
            '{"reference":0,"supplier":1,"traveler":2,"gross":3,"received":4,"fee":5}',
            current_date - 5,
            pg_temp.parsed(:imp_a::uuid, jsonb_build_array(
                jsonb_build_object('reference','ITV-2026-0846','supplier','Sandals','traveler','J Quintero','gross_cents',480000,'received_cents',54000,'fee_cents',3600,'paid_on',current_date - 5),
                jsonb_build_object('reference','SRB-220119','supplier','Sandals Resorts','traveler','M Hayes','gross_cents',1000000,'received_cents',110000,'fee_cents',0,'paid_on',current_date - 5),
                jsonb_build_object('reference','ITV-2026-0888','supplier','Sandals','traveler','Oyelaran','received_cents',50000,'fee_cents',0,'paid_on',current_date - 5),
                jsonb_build_object('reference',NULL,'supplier','Sandals Resorts','traveler','Ray Carter','received_cents',58000,'paid_on',current_date - 5),
                jsonb_build_object('reference','UNK-441','supplier','Princess','traveler','Pat Nobody','received_cents',28400,'paid_on',current_date - 5),
                jsonb_build_object('reference','itv-2026-0846 ','supplier','Sandals','traveler','J Quintero','received_cents',54000,'fee_cents',3600,'paid_on',current_date - 5),
                jsonb_build_object('reference','XYZ','supplier','Sandals','parse_error','"abc" is not an amount.'),
                jsonb_build_object('reference','FUT-1','supplier','Sandals','received_cents',10000,'paid_on',current_date + 3),
                jsonb_build_object('reference','ZERO-1','supplier','Sandals','received_cents',0,'paid_on',current_date - 5))))),
    'the map lands and bumps the version');

SELECT pg_temp.assert(
    pg_temp.row_state(:imp_a::uuid, 1) = 'confirmed'
    AND (SELECT match_basis = 'reference' AND commission_id = :l_quintero::uuid
           FROM public.commission_import_row WHERE import_id = :imp_a::uuid AND row_number = 1),
    'row 1: a reference already on a line confirms it');

SELECT pg_temp.assert(
    pg_temp.row_state(:imp_a::uuid, 2) = 'confirmed'
    AND (SELECT match_basis = 'confirmation' AND commission_id = :l_negril::uuid
           FROM public.commission_import_row WHERE import_id = :imp_a::uuid AND row_number = 2),
    'row 2: a supplier confirmation number on one of the advisor''s bookings confirms that '
    'trip''s line for the supplier');

SELECT pg_temp.assert(
    pg_temp.row_state(:imp_a::uuid, 3) = 'already_recorded'
    AND (SELECT commission_id = :l_oyelaran::uuid
           FROM public.commission_import_row WHERE import_id = :imp_a::uuid AND row_number = 3),
    'row 3: a line already received is "already recorded", never confirmed');

SELECT pg_temp.assert(
    pg_temp.row_state(:imp_a::uuid, 4) = 'suggested'
    AND (SELECT match_basis = 'supplier_and_traveler' AND suggested_commission_id = :l_cabo::uuid
                AND commission_id IS NULL
           FROM public.commission_import_row WHERE import_id = :imp_a::uuid AND row_number = 4),
    'row 4: supplier + traveler + a close amount only SUGGESTS a line (Carter has three, and '
    'only Cabo is within a quarter of $580)');

SELECT pg_temp.assert(
    pg_temp.row_state(:imp_a::uuid, 5) = 'unmatched'
    AND pg_temp.row_state(:imp_a::uuid, 6) = 'duplicate'
    AND (SELECT suggested_commission_id = :l_quintero::uuid
           FROM public.commission_import_row WHERE import_id = :imp_a::uuid AND row_number = 6),
    'row 5 matches nothing; row 6 is row 1''s booking again ("itv-2026-0846 " is the same key) '
    'and is a duplicate, not a second payment');

SELECT pg_temp.assert(
    (SELECT bool_and(state = 'unreadable') AND count(*) = 3
            AND bool_or(parse_error = '"abc" is not an amount.')
            AND bool_or(parse_error = 'The paid-on date is after today.')
            AND bool_or(parse_error = 'No commission amount on this row.')
       FROM public.commission_import_row WHERE import_id = :imp_a::uuid AND row_number IN (7, 8, 9)),
    'rows 7–9 are unreadable, each with its reason: the function''s, a date after the '
    'advisor''s today, nothing paid');

SELECT pg_temp.assert(
    (SELECT status = 'review' AND matched_rows = 4 AND unmatched_rows = 5
            AND period_start = current_date - 5 AND period_end = current_date - 5
            AND statement_date = current_date - 5
       FROM public.commission_import WHERE id = :imp_a::uuid),
    'the statement is in review, with the matcher''s count and its period from readable rows');

SELECT pg_temp.assert(
    (SELECT status = 'invoiced' AND received_commission_cents = 0 AND import_id IS NULL
       FROM public.commission WHERE id = :l_quintero::uuid)
    AND (SELECT status = 'expected' AND inteletravel_reference IS NULL
           FROM public.commission WHERE id = :l_negril::uuid),
    'and NOTHING in the ledger has moved');

SELECT pg_temp.assert(
    NOT EXISTS (SELECT 1 FROM public.commission_import_row r
                 WHERE r.import_id = :imp_a::uuid
                   AND coalesce(r.commission_id, r.suggested_commission_id) = :other_line::uuid),
    'Pat Quintero is another advisor''s client: their Sandals line is never matched here');

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Reads
-- ─────────────────────────────────────────────────────────────────────────────

-- Captured as the owner: an advisor's session cannot read the row table to look it up.
SELECT pg_temp.row_id(:imp_a::uuid, 4) AS a4 \gset

SELECT pg_temp.become(:gyasi::uuid);

SELECT pg_temp.assert(
    (SELECT count(*) = 1 FROM public.agent_commission_imports() WHERE import_id = :imp_a::uuid)
    AND (SELECT confirmed_count = 2 AND suggested_count = 1 AND unmatched_count = 1
                AND duplicate_count = 1 AND unreadable_count = 3 AND already_recorded_count = 1
                AND version = 2 AND jsonb_array_length(sample_rows) = 3
           FROM public.agent_commission_import(:imp_a::uuid)),
    'the advisor reads the statement, its counts by state and three sample rows');

SELECT pg_temp.assert(
    (SELECT count(*) = 9 FROM public.agent_commission_import_rows(:imp_a::uuid))
    AND (SELECT line_id = :l_cabo::uuid AND line_client_name LIKE '%Carter' AND line_status = 'expected'
                AND line_expected_cents = '61440'
           FROM public.agent_commission_import_rows(:imp_a::uuid) WHERE row_number = 4),
    'every row reads, beside the line it pays or was suggested');

SELECT pg_temp.assert(
    (SELECT commission_id FROM public.agent_commission_import_candidates(:imp_a::uuid,
        :'a4'::uuid) LIMIT 1) = :l_cabo::uuid
    AND NOT EXISTS (SELECT 1 FROM public.agent_commission_import_candidates(:imp_a::uuid,
        :'a4'::uuid) WHERE commission_id IN (:l_oyelaran::uuid, :l_quintero::uuid)),
    'candidates for row 4 lead with the suggestion, and leave out a paid line and a line '
    'another row of this statement already pays');

RESET ROLE;

SELECT pg_temp.become(:jordan::uuid);
SELECT pg_temp.assert(
    NOT EXISTS (SELECT 1 FROM public.agent_commission_imports())
    AND NOT EXISTS (SELECT 1 FROM public.agent_commission_import(:imp_a::uuid))
    AND NOT EXISTS (SELECT 1 FROM public.agent_commission_import_rows(:imp_a::uuid))
    AND NOT EXISTS (SELECT 1 FROM public.agent_commission_import_candidates(:imp_a::uuid,
                        :'a4'::uuid)),
    'a traveler reads nothing from any of the four');
RESET ROLE;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Resolve
-- ─────────────────────────────────────────────────────────────────────────────

SELECT pg_temp.assert(
    (SELECT outcome FROM public.agent_resolve_commission_import_row(:agent::uuid, :imp_a::uuid,
        1, pg_temp.row_id(:imp_a::uuid, 4), 'confirm')) = 'stale',
    'a decision naming an old version is stale');

SELECT pg_temp.assert(
    (SELECT outcome FROM public.agent_resolve_commission_import_row(:agent::uuid, :imp_a::uuid,
        2, pg_temp.row_id(:imp_a::uuid, 3), 'ignore')) = 'not_allowed',
    'a row already recorded against a paid line has nothing to decide');

SELECT pg_temp.assert(
    (SELECT outcome FROM public.agent_resolve_commission_import_row(:agent::uuid, :imp_a::uuid,
        2, pg_temp.row_id(:imp_a::uuid, 7), 'match', :l_cabo::uuid)) = 'not_allowed',
    'an unreadable row cannot pay a line');

SELECT pg_temp.assert(
    (SELECT outcome FROM public.agent_resolve_commission_import_row(:agent::uuid, :imp_a::uuid,
        2, pg_temp.row_id(:imp_a::uuid, 4), 'match', :l_oyelaran::uuid)) = 'line_unavailable'
    AND (SELECT outcome FROM public.agent_resolve_commission_import_row(:agent::uuid, :imp_a::uuid,
        2, pg_temp.row_id(:imp_a::uuid, 4), 'match', :other_line::uuid)) = 'line_unavailable'
    AND (SELECT outcome FROM public.agent_resolve_commission_import_row(:agent::uuid, :imp_a::uuid,
        2, pg_temp.row_id(:imp_a::uuid, 6), 'confirm')) = 'line_unavailable',
    'a row cannot be matched to a paid line, another advisor''s line, or a line another row '
    'already pays (the duplicate''s suggestion)');

SELECT pg_temp.assert(
    (SELECT outcome FROM public.agent_resolve_commission_import_row(:agent::uuid, :imp_a::uuid,
        2, pg_temp.row_id(:imp_a::uuid, 5), 'create', NULL, :other_trip::uuid, :rcl::uuid,
        200000, 14.2, :new_line::uuid)) = 'trip_not_found'
    AND (SELECT outcome FROM public.agent_resolve_commission_import_row(:agent::uuid, :imp_a::uuid,
        2, pg_temp.row_id(:imp_a::uuid, 5), 'create', NULL, :barbados::uuid, :rcl::uuid,
        200000, 14.2, :new_line::uuid)) = 'trip_not_found'
    AND (SELECT outcome FROM public.agent_resolve_commission_import_row(:agent::uuid, :imp_a::uuid,
        2, pg_temp.row_id(:imp_a::uuid, 5), 'create', NULL, :kyoto::uuid, gen_random_uuid(),
        200000, 14.2, :new_line::uuid)) = 'supplier_not_found',
    'a new line goes on one of the advisor''s LIVE trips, with a live supplier');

SELECT pg_temp.assert(
    pg_temp.ver(:imp_a::uuid) = 2,
    'and none of those refusals moved the version');

SELECT pg_temp.assert(
    (SELECT outcome = 'resolved' AND version = 3 FROM public.agent_resolve_commission_import_row(
        :agent::uuid, :imp_a::uuid, 2, pg_temp.row_id(:imp_a::uuid, 4), 'confirm')),
    'row 4: the advisor confirms the suggestion');
SELECT pg_temp.assert(
    (SELECT outcome FROM public.agent_resolve_commission_import_row(:agent::uuid, :imp_a::uuid,
        3, pg_temp.row_id(:imp_a::uuid, 5), 'create', NULL, :kyoto::uuid, :rcl::uuid,
        200000, 14.2, :new_line::uuid)) = 'resolved',
    'row 5: the advisor creates a line for it on Kyoto');
SELECT pg_temp.assert(
    (SELECT outcome FROM public.agent_resolve_commission_import_row(:agent::uuid, :imp_a::uuid,
        4, pg_temp.row_id(:imp_a::uuid, 6), 'ignore')) = 'resolved'
    AND (SELECT outcome FROM public.agent_resolve_commission_import_row(:agent::uuid, :imp_a::uuid,
        5, pg_temp.row_id(:imp_a::uuid, 7), 'ignore')) = 'resolved'
    AND (SELECT outcome FROM public.agent_resolve_commission_import_row(:agent::uuid, :imp_a::uuid,
        6, pg_temp.row_id(:imp_a::uuid, 8), 'ignore')) = 'resolved',
    'rows 6–8 are set aside');

SELECT pg_temp.assert(
    pg_temp.row_state(:imp_a::uuid, 4) = 'confirmed'
    AND (SELECT commission_id = :l_cabo::uuid AND match_basis = 'supplier_and_traveler'
           FROM public.commission_import_row WHERE import_id = :imp_a::uuid AND row_number = 4)
    AND pg_temp.row_state(:imp_a::uuid, 5) = 'to_create'
    AND (SELECT new_commission_pct = 14.20 AND new_commission_id = :new_line::uuid
           FROM public.commission_import_row WHERE import_id = :imp_a::uuid AND row_number = 5),
    'each decision is on its row');

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Reconcile
-- ─────────────────────────────────────────────────────────────────────────────

SELECT pg_temp.ver(:imp_a::uuid) AS va \gset

SELECT pg_temp.assert(
    (SELECT outcome = 'needs_decisions' AND blocking_count = 1
       FROM public.agent_reconcile_commission_import(:agent::uuid, :actor::uuid, :imp_a::uuid,
            :va, pg_temp.aids(), NULL, NULL)),
    'reconcile refuses while a row still needs a decision (row 9)');

SELECT pg_temp.assert(
    (SELECT outcome FROM public.agent_resolve_commission_import_row(:agent::uuid, :imp_a::uuid,
        :va, pg_temp.row_id(:imp_a::uuid, 9), 'ignore')) = 'resolved',
    'row 9 is set aside too');

SELECT pg_temp.ver(:imp_a::uuid) AS va \gset

-- ATOMICITY. An audit id that already exists makes the THIRD audit insert fail, after two
-- lines were written in this same call. If reconcile were not one transaction, those two
-- would survive.
INSERT INTO public.audit_event (id, actor_user_id, actor_role, event_type, target_entity, target_id, metadata)
VALUES (:aid_once::uuid, :actor::uuid, 'agent', 'test.placeholder', 'x', NULL, '{}');

SELECT pg_temp.expect_error(
    format($q$SELECT * FROM public.agent_reconcile_commission_import(%L, %L, %L, %s,
             ARRAY[gen_random_uuid(), gen_random_uuid(), %L::uuid] || pg_temp.aids(), NULL, NULL)$q$,
           :agent, :actor, :imp_a, :va, :aid_once),
    'a reconcile whose third audit row cannot be written fails as a whole');

SELECT pg_temp.assert(
    (SELECT status = 'invoiced' AND received_commission_cents = 0 AND version = 1
       FROM public.commission WHERE id = :l_quintero::uuid)
    AND (SELECT status = 'expected' FROM public.commission WHERE id = :l_negril::uuid)
    AND NOT EXISTS (SELECT 1 FROM public.commission WHERE id = :new_line::uuid)
    AND (SELECT status = 'review' FROM public.commission_import WHERE id = :imp_a::uuid),
    'and no line it had already paid stayed paid: nothing landed');

-- PAID BY HAND IN BETWEEN. The advisor marks Cabo received on its own screen after confirming
-- row 4. Reconcile must leave Cabo exactly as the advisor recorded it.
SELECT pg_temp.assert(
    (SELECT outcome FROM public.agent_record_commission_payment(:agent::uuid, :actor::uuid,
        :l_cabo::uuid, (SELECT version FROM public.commission WHERE id = :l_cabo::uuid),
        'received', 61440, 0, current_date - 1, gen_random_uuid(), NULL, NULL)) = 'recorded',
    'the advisor pays Cabo by hand before reconciling');

SELECT version AS cabo_v FROM public.commission WHERE id = :l_cabo::uuid \gset
SELECT version AS oy_v, received_commission_cents AS oy_cents FROM public.commission
 WHERE id = :l_oyelaran::uuid \gset

SELECT pg_temp.assert(
    (SELECT outcome = 'reconciled' AND paid_count = 2 AND created_count = 1 AND already_count = 2
       FROM public.agent_reconcile_commission_import(:agent::uuid, :actor::uuid, :imp_a::uuid,
            :va, pg_temp.aids(), '198.51.100.4', 'psql test')),
    'reconcile pays two lines, creates one, and counts two already recorded');

SELECT pg_temp.assert(
    (SELECT status = 'received' AND received_commission_cents = 54000 AND processing_fee_cents = 3600
            AND received_at = current_date - 5 AND import_id = :imp_a::uuid
            AND inteletravel_reference = 'ITV-2026-0846' AND version = 2
       FROM public.commission WHERE id = :l_quintero::uuid),
    'Quintero: $540 + $36 fee covers $576 expected, so Received, with the date and the import');

SELECT pg_temp.assert(
    (SELECT status = 'disputed' AND received_commission_cents = 110000 AND processing_fee_cents = 0
            AND inteletravel_reference = 'SRB-220119' AND on_record_at IS NOT NULL
       FROM public.commission WHERE id = :l_negril::uuid),
    'Negril: $1,100 against $1,212.36 expected is short, so Disputed — and it takes the '
    'statement''s reference, so next month matches it directly');

SELECT pg_temp.assert(
    (SELECT status = 'received' AND received_commission_cents = 61440 AND received_at = current_date - 1
            AND import_id IS NULL AND version = :cabo_v
       FROM public.commission WHERE id = :l_cabo::uuid)
    AND pg_temp.row_state(:imp_a::uuid, 4) = 'already_recorded',
    'Cabo, paid by hand in between, is exactly as the advisor left it; its row now says '
    'already recorded');

SELECT pg_temp.assert(
    (SELECT received_commission_cents = :oy_cents AND version = :oy_v
       FROM public.commission WHERE id = :l_oyelaran::uuid),
    'Oyelaran, already received before the import, is untouched (Gyasi, 2026-10-11)');

SELECT pg_temp.assert(
    (SELECT trip_id = :kyoto::uuid AND supplier_id = :rcl::uuid AND agent_id = :agent::uuid
            AND gross_booking_cents = 200000 AND commission_pct = 14.20
            AND expected_commission_cents = 28400 AND received_commission_cents = 28400
            AND status = 'received' AND received_at = current_date - 5
            AND payment_terms = 'after_travel' AND payment_lag_days = 0
            AND inteletravel_reference = 'UNK-441' AND import_id = :imp_a::uuid
            AND currency = 'USD' AND version = 1
       FROM public.commission WHERE id = :new_line::uuid)
    AND (SELECT commission_id = :new_line::uuid
           FROM public.commission_import_row WHERE import_id = :imp_a::uuid AND row_number = 5),
    'row 5''s new line exists on Kyoto, paid, with the supplier''s terms (Royal Caribbean has '
    'none: after travel, 0 days) and the row''s reference');

SELECT pg_temp.assert(
    pg_temp.audits(:l_quintero::uuid, 'commission.reconciled') = 1
    AND pg_temp.audits(:l_negril::uuid, 'commission.reconciled') = 1
    AND pg_temp.audits(:l_cabo::uuid, 'commission.reconciled') = 0
    AND pg_temp.audits(:new_line::uuid, 'commission.created') = 1
    AND pg_temp.audits(:imp_a::uuid, 'commission.statement_reconciled') = 1
    AND (SELECT metadata->>'match_basis' = 'confirmation'
                AND (metadata->'status'->>'to') = 'disputed' AND (metadata->>'gap_cents')::bigint = 11236
                AND ip_address = '198.51.100.4'::inet
           FROM public.audit_event
          WHERE target_id = :l_negril::uuid AND event_type = 'commission.reconciled')
    AND (SELECT metadata->>'source' = 'statement'
           FROM public.audit_event
          WHERE target_id = :new_line::uuid AND event_type = 'commission.created'),
    'one audit row per line paid or created, none for the line left alone, one for the '
    'statement; each says how the line was found and what moved');

SELECT pg_temp.assert(
    (SELECT status = 'reconciled' AND reconciled_at IS NOT NULL
            AND matched_rows = 5 AND unmatched_rows = 4
       FROM public.commission_import WHERE id = :imp_a::uuid),
    'the statement is reconciled: five rows tied to lines, four set aside');

SELECT pg_temp.ver(:imp_a::uuid) AS va \gset
SELECT pg_temp.assert(
    (SELECT outcome FROM public.agent_resolve_commission_import_row(:agent::uuid, :imp_a::uuid,
        :va, pg_temp.row_id(:imp_a::uuid, 6), 'ignore')) = 'not_open'
    AND (SELECT outcome FROM public.agent_discard_commission_import(:agent::uuid, :actor::uuid,
        :imp_a::uuid, :va, gen_random_uuid(), NULL, NULL)) = 'not_open'
    AND (SELECT outcome FROM public.agent_map_commission_import(:agent::uuid, :imp_a::uuid,
        :va, '{}', NULL, '[]')) = 'not_open'
    AND (SELECT outcome FROM public.agent_reconcile_commission_import(:agent::uuid, :actor::uuid,
        :imp_a::uuid, :va, pg_temp.aids(), NULL, NULL)) = 'not_open',
    'a reconciled statement is closed: no decision, discard, remap or second reconcile');

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Remap resets decisions; a line removed in between sends its row back
-- ─────────────────────────────────────────────────────────────────────────────

SELECT pg_temp.assert(
    (SELECT outcome FROM public.agent_upload_commission_statement(
        :agent::uuid, :actor::uuid, :imp_b::uuid, :doc_b::uuid, 'may.csv', 64, '\xbb02'::bytea,
        'k/b.csv', ARRAY['Supplier','Pax','Paid'], '{}',
        pg_temp.rows_of('Sandals|Sandoval|612.00'), gen_random_uuid(), NULL, NULL)) = 'uploaded',
    'statement B uploads');

SELECT pg_temp.assert(
    (SELECT outcome FROM public.agent_map_commission_import(:agent::uuid, :imp_b::uuid, 1,
        '{"supplier":0,"traveler":1,"received":2}', current_date - 2,
        pg_temp.parsed(:imp_b::uuid, jsonb_build_array(jsonb_build_object(
            'supplier','Sandals','traveler','Sandoval','received_cents',61200,'paid_on',current_date - 2)))))
    = 'mapped'
    AND pg_temp.row_state(:imp_b::uuid, 1) = 'suggested',
    'its one row suggests Sandoval''s line');

SELECT pg_temp.assert(
    (SELECT outcome FROM public.agent_resolve_commission_import_row(:agent::uuid, :imp_b::uuid,
        2, pg_temp.row_id(:imp_b::uuid, 1), 'confirm')) = 'resolved'
    AND pg_temp.row_state(:imp_b::uuid, 1) = 'confirmed',
    'the advisor confirms it');

SELECT pg_temp.assert(
    (SELECT outcome FROM public.agent_map_commission_import(:agent::uuid, :imp_b::uuid, 3,
        '{"supplier":0,"traveler":1,"received":2}', current_date - 2,
        pg_temp.parsed(:imp_b::uuid, jsonb_build_array(jsonb_build_object(
            'supplier','Sandals','traveler','Sandoval','received_cents',61200,'paid_on',current_date - 2)))))
    = 'mapped'
    AND pg_temp.row_state(:imp_b::uuid, 1) = 'suggested',
    'remapping a statement in review resets every decision to what the matcher finds');

SELECT pg_temp.assert(
    (SELECT outcome FROM public.agent_resolve_commission_import_row(:agent::uuid, :imp_b::uuid,
        4, pg_temp.row_id(:imp_b::uuid, 1), 'confirm')) = 'resolved',
    'confirmed again');

SELECT pg_temp.assert(
    (SELECT outcome FROM public.agent_remove_commission(:agent::uuid, :actor::uuid,
        :l_sandoval::uuid, (SELECT version FROM public.commission WHERE id = :l_sandoval::uuid),
        gen_random_uuid(), NULL, NULL)) = 'removed',
    'and then the advisor removes Sandoval''s line, entered by mistake');

SELECT pg_temp.assert(
    (SELECT outcome = 'needs_decisions' AND blocking_count = 1 AND version = 6
       FROM public.agent_reconcile_commission_import(:agent::uuid, :actor::uuid, :imp_b::uuid,
            5, pg_temp.aids(), NULL, NULL))
    AND pg_temp.row_state(:imp_b::uuid, 1) = 'unmatched'
    AND pg_temp.ver(:imp_b::uuid) = 6,
    'reconcile sends the row back to needing a decision rather than paying a removed line, '
    'and the version moves so the screen reloads');

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. Discard
-- ─────────────────────────────────────────────────────────────────────────────

-- The write and the reads of its effect are separate statements: one statement reads the
-- snapshot from before its own write.
SELECT outcome AS discard_outcome FROM public.agent_discard_commission_import(:agent::uuid,
    :actor::uuid, :imp_b::uuid, 6, gen_random_uuid(), NULL, NULL) \gset

SELECT pg_temp.assert(
    :'discard_outcome' = 'discarded'
    AND (SELECT status = 'discarded' FROM public.commission_import WHERE id = :imp_b::uuid)
    AND (SELECT archived_at IS NOT NULL FROM public.document WHERE id = :doc_b::uuid)
    AND pg_temp.audits(:imp_b::uuid, 'commission.statement_discarded') = 1,
    'statement B is discarded: its file archived, the discard audited');

SELECT pg_temp.assert(
    (SELECT outcome FROM public.agent_upload_commission_statement(
        :agent::uuid, :actor::uuid, :imp_b2::uuid, :doc_b2::uuid, 'may.csv', 64, '\xbb02'::bytea,
        'k/b2.csv', ARRAY['Supplier','Pax','Paid'], '{}',
        pg_temp.rows_of('Sandals|Sandoval|612.00'), gen_random_uuid(), NULL, NULL)) = 'uploaded',
    'and the same file can be uploaded again');

SELECT pg_temp.become(:gyasi::uuid);
SELECT pg_temp.assert(
    NOT EXISTS (SELECT 1 FROM public.agent_commission_imports() WHERE import_id = :imp_b::uuid)
    AND NOT EXISTS (SELECT 1 FROM public.agent_commission_import(:imp_b::uuid))
    AND NOT EXISTS (SELECT 1 FROM public.agent_commission_import_rows(:imp_b::uuid)),
    'a discarded statement leaves every read');
RESET ROLE;

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. Another advisor's statement
-- ─────────────────────────────────────────────────────────────────────────────

SELECT pg_temp.assert(
    (SELECT outcome FROM public.agent_upload_commission_statement(
        :other_agent::uuid, :actor::uuid, :imp_c::uuid, :doc_c::uuid, 'theirs.csv', 64,
        '\xaa01'::bytea, 'k/c.csv', ARRAY['Ref'], '{}', pg_temp.rows_of('ITV-2026-0846'),
        gen_random_uuid(), NULL, NULL)) = 'uploaded',
    'another advisor uploads a file with the same bytes — duplicates are per advisor');

SELECT pg_temp.become(:gyasi::uuid);
SELECT pg_temp.assert(
    NOT EXISTS (SELECT 1 FROM public.agent_commission_imports() WHERE import_id = :imp_c::uuid)
    AND NOT EXISTS (SELECT 1 FROM public.agent_commission_import(:imp_c::uuid))
    AND NOT EXISTS (SELECT 1 FROM public.agent_commission_import_rows(:imp_c::uuid)),
    'and this advisor reads none of it');
RESET ROLE;

SELECT pg_temp.assert(
    (SELECT outcome FROM public.agent_resolve_commission_import_row(:agent::uuid, :imp_c::uuid,
        1, pg_temp.row_id(:imp_c::uuid, 1), 'ignore')) = 'not_found'
    AND (SELECT outcome FROM public.agent_reconcile_commission_import(:agent::uuid, :actor::uuid,
        :imp_c::uuid, 1, pg_temp.aids(), NULL, NULL)) = 'not_found'
    AND (SELECT outcome FROM public.agent_discard_commission_import(:agent::uuid, :actor::uuid,
        :imp_c::uuid, 1, gen_random_uuid(), NULL, NULL)) = 'not_found',
    'nor decides, reconciles or discards it');

-- ─────────────────────────────────────────────────────────────────────────────
-- 10. The row constraints
-- ─────────────────────────────────────────────────────────────────────────────

SELECT pg_temp.expect_error(
    format($q$UPDATE public.commission_import_row SET state = 'confirmed', commission_id = %L
               WHERE import_id = %L AND row_number = 6$q$, :l_quintero, :imp_a),
    'two rows of one statement can never both pay one line');
SELECT pg_temp.expect_error(
    format($q$UPDATE public.commission_import_row SET state = 'unreadable', parse_error = NULL
               WHERE import_id = %L AND row_number = 1$q$, :imp_a),
    'an unreadable row says why');
SELECT pg_temp.expect_error(
    format($q$UPDATE public.commission_import_row SET state = 'to_create', new_trip_id = NULL
               WHERE import_id = %L AND row_number = 6$q$, :imp_a),
    'a row set to create a line names everything the line needs');

-- ─────────────────────────────────────────────────────────────────────────────
-- 11. Review findings: what the matcher may not confirm, and what reconcile re-checks
-- ─────────────────────────────────────────────────────────────────────────────

\set imp_h  '''0c7c0000-0000-7000-8000-0000000000a8'''
\set imp_e1 '''0c7c0000-0000-7000-8000-0000000000e1'''
\set imp_e2 '''0c7c0000-0000-7000-8000-0000000000e2'''
\set imp_f  '''0c7c0000-0000-7000-8000-0000000000f0'''
\set imp_g  '''0c7c0000-0000-7000-8000-0000000000a9'''
\set l_aruba  '''01a0b1c2-d300-7000-8000-000000000071'''
\set l_island '''0c7c0000-0000-7000-8000-0000000000b9'''
\set island   '''0195a2c0-1a00-7000-8000-000000000032'''

-- A statement of the given parsed rows, uploaded and mapped (version 2 afterwards).
CREATE OR REPLACE FUNCTION pg_temp.statement(p_import uuid, p_sum bytea, p_rows jsonb)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    PERFORM public.agent_upload_commission_statement(
        '0195a2c0-1a00-7000-8000-000000000001', (SELECT pu.id FROM public.platform_user pu
            WHERE pu.account_id = '0195a2c0-1a00-7000-8000-000000000010'),
        p_import, gen_random_uuid(), 'x.csv', 1, p_sum, 'k', ARRAY['a'], '{}',
        (SELECT jsonb_agg(jsonb_build_object('id', gen_random_uuid(), 'cells', '["x"]'::jsonb))
           FROM jsonb_array_elements(p_rows)),
        gen_random_uuid(), NULL, NULL);
    PERFORM public.agent_map_commission_import(
        '0195a2c0-1a00-7000-8000-000000000001', p_import, 1, '{"received":0}', current_date - 1,
        pg_temp.parsed(p_import, p_rows));
END;
$$;

-- A Sandals-only trip gets an Island Routes line, so its excursion's confirmation number has a
-- line to point at.
INSERT INTO public.commission
    (id, trip_id, agent_id, supplier_id, gross_booking_cents, commission_pct,
     expected_commission_cents, processing_fee_cents, received_commission_cents, currency,
     payment_terms, payment_lag_days, status)
SELECT :l_island::uuid, tc.trip_id, :agent::uuid, :island::uuid, 40000, 10, 4000, 0, 0, 'USD',
       'after_travel', 30, 'expected'
  FROM public.trip_component tc WHERE tc.confirmation_number = 'IR-88214';

SELECT pg_temp.statement(:imp_h::uuid, '\xcc01'::bytea, jsonb_build_array(
    jsonb_build_object('reference', 'IR-88214', 'supplier', 'Princess Cruises', 'traveler', 'Someone',
                       'received_cents', 200, 'paid_on', current_date - 1),
    jsonb_build_object('reference', 'A1', 'supplier', 'Nobody', 'received_cents', 100, 'paid_on', current_date - 1),
    jsonb_build_object('reference', 'a 1', 'supplier', 'Nobody', 'received_cents', 100, 'paid_on', current_date - 1)));

SELECT pg_temp.assert(
    pg_temp.row_state(:imp_h::uuid, 1) = 'suggested'
    AND (SELECT match_basis = 'confirmation' AND suggested_commission_id = :l_island::uuid
           FROM public.commission_import_row WHERE import_id = :imp_h::uuid AND row_number = 1),
    'a confirmation number on a row naming ANOTHER supplier only suggests its line: review '
    'confirmed a $2 Princess row onto a Sandals booking');

SELECT pg_temp.assert(
    pg_temp.row_state(:imp_h::uuid, 2) = 'unmatched' AND pg_temp.row_state(:imp_h::uuid, 3) = 'unmatched',
    'a reference shorter than four characters is not a key: "A1" twice is not a duplicate');

-- Two statements open at once, each creating a line for booking DUP-900.
SELECT pg_temp.statement(:imp_e1::uuid, '\xe101'::bytea, jsonb_build_array(jsonb_build_object(
    'reference', 'DUP-900', 'supplier', 'Princess', 'traveler', 'Pat Nobody', 'received_cents', 28400,
    'paid_on', current_date - 1)));
SELECT pg_temp.statement(:imp_e2::uuid, '\xe202'::bytea, jsonb_build_array(jsonb_build_object(
    'reference', 'DUP-900', 'supplier', 'Princess', 'traveler', 'Pat Nobody', 'received_cents', 28400,
    'paid_on', current_date - 1)));

SELECT pg_temp.assert(
    (SELECT outcome FROM public.agent_resolve_commission_import_row(:agent::uuid, :imp_e1::uuid, 2,
        pg_temp.row_id(:imp_e1::uuid, 1), 'create', NULL, :kyoto::uuid, :rcl::uuid, 200000, 14.2,
        gen_random_uuid())) = 'resolved'
    AND (SELECT outcome FROM public.agent_resolve_commission_import_row(:agent::uuid, :imp_e2::uuid, 2,
        pg_temp.row_id(:imp_e2::uuid, 1), 'create', NULL, :kyoto::uuid, :rcl::uuid, 200000, 14.2,
        gen_random_uuid())) = 'resolved',
    'both statements set the same booking to create a line');

SELECT pg_temp.assert(
    (SELECT outcome = 'reconciled' AND created_count = 1
       FROM public.agent_reconcile_commission_import(:agent::uuid, :actor::uuid, :imp_e1::uuid, 3,
            pg_temp.aids(), NULL, NULL)),
    'the first reconcile creates it');

SELECT pg_temp.assert(
    (SELECT outcome = 'reconciled' AND created_count = 0 AND already_count = 1 AND version = 5
       FROM public.agent_reconcile_commission_import(:agent::uuid, :actor::uuid, :imp_e2::uuid, 3,
            pg_temp.aids(), NULL, NULL)),
    'the second finds the booking already in the ledger, paid, and creates nothing');

SELECT pg_temp.assert(
    (SELECT status = 'reconciled' AND version = 5 FROM public.commission_import WHERE id = :imp_e2::uuid),
    'and the version it reports is the one stored: moved once for the row it re-pointed, once for '
    'the reconcile');

SELECT pg_temp.assert(
    (SELECT count(*) FROM public.commission
      WHERE agent_id = :agent::uuid AND public.commission_ref_key(inteletravel_reference) = 'DUP-900') = 1
    AND (SELECT sum(received_commission_cents) FROM public.commission
          WHERE agent_id = :agent::uuid AND import_id IN (:imp_e1::uuid, :imp_e2::uuid)) = 28400,
    'one line for DUP-900, and its $284 counted once (review: it was counted twice)');

-- A confirmed row whose line is given a DIFFERENT reference by hand before reconcile.
SELECT pg_temp.statement(:imp_f::uuid, '\xf001'::bytea, jsonb_build_array(jsonb_build_object(
    'reference', 'FX-1001', 'supplier', 'Sandals Resorts', 'traveler', 'Maya Carter',
    'received_cents', 115680, 'paid_on', current_date - 1)));

SELECT pg_temp.assert(
    (SELECT suggested_commission_id = :l_aruba::uuid
       FROM public.commission_import_row WHERE import_id = :imp_f::uuid AND row_number = 1)
    AND (SELECT outcome FROM public.agent_resolve_commission_import_row(:agent::uuid, :imp_f::uuid, 2,
            pg_temp.row_id(:imp_f::uuid, 1), 'confirm')) = 'resolved',
    'its row is confirmed onto Aruba');

UPDATE public.commission SET inteletravel_reference = 'HAND-REF-9' WHERE id = :l_aruba::uuid;

SELECT outcome AS f_outcome FROM public.agent_reconcile_commission_import(:agent::uuid, :actor::uuid,
    :imp_f::uuid, 3, pg_temp.aids(), NULL, NULL) \gset

SELECT pg_temp.assert(
    :'f_outcome' = 'needs_decisions'
    AND pg_temp.row_state(:imp_f::uuid, 1) = 'unmatched'
    AND (SELECT status = 'expected' AND received_commission_cents = 0 AND inteletravel_reference = 'HAND-REF-9'
           FROM public.commission WHERE id = :l_aruba::uuid),
    'reconcile will not pay a line that now carries another booking''s reference: the row '
    'needs a decision again and the line is untouched');

-- Within one statement: a duplicate row set to create a line for a booking its earlier row
-- already creates.
SELECT pg_temp.statement(:imp_g::uuid, '\xa901'::bytea, jsonb_build_array(
    jsonb_build_object('reference', 'GG-5000', 'supplier', 'Princess', 'received_cents', 10000, 'paid_on', current_date - 1),
    jsonb_build_object('reference', 'GG-5000', 'supplier', 'Princess', 'received_cents', 10000, 'paid_on', current_date - 1)));

SELECT pg_temp.assert(pg_temp.row_state(:imp_g::uuid, 2) = 'duplicate', 'the second GG-5000 row is a duplicate');

SELECT pg_temp.assert(
    (SELECT outcome FROM public.agent_resolve_commission_import_row(:agent::uuid, :imp_g::uuid, 2,
        pg_temp.row_id(:imp_g::uuid, 1), 'create', NULL, :kyoto::uuid, :rcl::uuid, 100000, 10, gen_random_uuid())) = 'resolved'
    AND (SELECT outcome FROM public.agent_resolve_commission_import_row(:agent::uuid, :imp_g::uuid, 3,
        pg_temp.row_id(:imp_g::uuid, 2), 'create', NULL, :kyoto::uuid, :rcl::uuid, 100000, 10, gen_random_uuid())) = 'resolved',
    'the advisor sets both to create');

SELECT outcome AS g_outcome FROM public.agent_reconcile_commission_import(:agent::uuid, :actor::uuid,
    :imp_g::uuid, 4, pg_temp.aids(), NULL, NULL) \gset

SELECT pg_temp.assert(
    :'g_outcome' = 'needs_decisions'
    AND pg_temp.row_state(:imp_g::uuid, 2) = 'duplicate'
    AND NOT EXISTS (SELECT 1 FROM public.commission
                     WHERE public.commission_ref_key(inteletravel_reference) = 'GG-5000'),
    'reconcile sends the second back as a duplicate: one row per booking, and nothing created');

SELECT pg_temp.expect_error(
    format($q$UPDATE public.commission_import_row SET received_cents = 10000000000
               WHERE import_id = %L AND row_number = 1$q$, :imp_g),
    'an amount over $99,999,999.99 cannot be stored: a wrongly mapped column is not $90 trillion');

SELECT pg_temp.become(:gyasi::uuid);
SELECT pg_temp.assert(
    (SELECT created_on IS NOT NULL FROM public.agent_commission_imports() WHERE import_id = :imp_a::uuid)
    AND (SELECT reconciled_on IS NOT NULL FROM public.agent_commission_import(:imp_a::uuid)),
    'the reads carry the advisor''s own calendar dates for upload and reconcile');
RESET ROLE;

ROLLBACK;
