-- §3.10 Stage 2: Screens 3.10.3 Picker, 3.10.4 Library and 3.10.5 Editor. The template reads,
-- writes, merge data and starters.
--
-- WHAT THIS FILE IS GUARDING.
--
--   1. An advisor reads only their own templates, and only through the accessors; the writes
--      are service_role only, because each takes p_agent_id as trusted input.
--   2. A body with an unknown merge field never saves (Data-Model §12.4's fixed set).
--   3. Create and duplicate are idempotent on the browser's id, and an id that is someone
--      else's is a conflict, never a write.
--   4. A Save that changes nothing does not move "Last edited".
--   5. Archive is the only delete, and Restore brings it back.
--   6. The merge data answers for the caller's own client, trip and milestone only, and the
--      payment amount is what is still OWED.
--   7. The seven starters are there, use only known fields, and are never added twice.
--
-- A SECOND ADVISOR (B), created after the migration, so they start with no templates.
--
-- Run against a freshly reset local database:
--     supabase db reset
--     psql "$(supabase status -o json | jq -r .DB_URL)" -v ON_ERROR_STOP=1 \
--          -f supabase/tests/rls_agent_message_templates.sql

\set ON_ERROR_STOP on

BEGIN;

\set gyasi      '''0195a2c0-1a00-7000-8000-000000000010'''
\set agent      '''0195a2c0-1a00-7000-8000-000000000001'''
\set maya       '''0195a2c0-1a00-7000-8000-000000000013'''
\set maya_trip  '''0195a2c0-1a00-7000-8000-000000000046'''
\set other_trip '''0195a2c0-1a00-7000-8000-000000000044'''
\set b_agent    '''0d7f0000-0000-7000-8000-000000000001'''
\set b_account  '''0d7f0000-0000-7000-8000-000000000002'''
\set pm         '''0d7f0000-0000-7000-8000-0000000000e1'''
\set t1         '''0d7f0000-0000-7000-8000-0000000000a1'''
\set t2         '''0d7f0000-0000-7000-8000-0000000000a2'''
\set t3         '''0d7f0000-0000-7000-8000-0000000000a3'''

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

CREATE OR REPLACE FUNCTION pg_temp.expect_raise(stmt text, fragment text, description text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    EXECUTE stmt;
    RAISE EXCEPTION 'FAILED: % — statement succeeded, expected an error mentioning "%"', description, fragment;
EXCEPTION
    WHEN OTHERS THEN
        IF SQLERRM LIKE 'FAILED:%' THEN RAISE; END IF;
        IF position(fragment IN SQLERRM) = 0 THEN
            RAISE EXCEPTION 'FAILED: % — expected "%", got % (%)', description, fragment, SQLSTATE, SQLERRM;
        END IF;
        RAISE NOTICE '  ok    %', description;
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

-- ─────────────────────────────────────────────────────────────────────────────
-- 0. A second advisor with a login, and a part-paid milestone on Maya's trip
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.agent (id, display_name, email, status, time_zone)
VALUES (:b_agent::uuid, 'Robin Template-Tester', 'tpl.advisor@example.com', 'active', 'America/New_York');

INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change)
VALUES
    (:b_account::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'tpl.advisor.login@example.com', 'x', now(),
     '{"provider":"email","providers":["email"]}'::jsonb,
     '{"first_name":"Robin","last_name":"Tester","agent_id":"0195a2c0-1a00-7000-8000-000000000001"}'::jsonb,
     now(), now(), '', '', '', '');

DO $$
DECLARE v_client_id uuid;
BEGIN
    SELECT client_id INTO v_client_id FROM public.platform_user
     WHERE account_id = '0d7f0000-0000-7000-8000-000000000002';
    UPDATE public.platform_user
       SET role = 'agent', agent_id = '0d7f0000-0000-7000-8000-000000000001', client_id = NULL
     WHERE account_id = '0d7f0000-0000-7000-8000-000000000002';
    DELETE FROM public.client WHERE id = v_client_id;
END $$;

INSERT INTO public.payment_milestone (id, trip_id, kind, label, amount_cents, paid_cents, currency, due_date, status)
VALUES (:pm::uuid, :maya_trip::uuid, 'final', 'Final balance', 250000, 50000, 'USD', '2026-11-02', 'scheduled');

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. The starters
-- ─────────────────────────────────────────────────────────────────────────────

SELECT pg_temp.assert(
    (SELECT count(*) FROM public.message_template WHERE agent_id = :agent::uuid AND archived_at IS NULL) = 7,
    'the seed advisor has the seven starters');

SELECT pg_temp.assert(
    (SELECT array_agg(DISTINCT category ORDER BY category) FROM public.message_template WHERE agent_id = :agent::uuid)
      = ARRAY['booking_confirmation', 'lead_response', 'payment_reminder', 'post_trip', 'pre_trip', 'proposal'],
    'the starters cover every category but other');

SELECT pg_temp.assert(
    NOT EXISTS (SELECT 1 FROM public.message_template
                 WHERE cardinality(public.message_template_unknown_tokens(body_markdown)) > 0),
    'no starter uses an unknown merge field');

SELECT pg_temp.assert(
    (SELECT bool_and(substr(id::text, 15, 1) = '7') FROM public.message_template WHERE agent_id = :agent::uuid),
    'every starter id is a v7');

SELECT pg_temp.assert(
    public.seed_starter_message_templates(:agent::uuid) = 0,
    'seeding an advisor who already has templates writes nothing');

SELECT pg_temp.assert(
    (SELECT body_markdown FROM public.message_template
      WHERE agent_id = :agent::uuid AND category = 'payment_reminder') LIKE '%goes to the supplier, not to Story-Tail%',
    'the payment reminder is about paying the supplier (BRD §10.5)');

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Who can call what
-- ─────────────────────────────────────────────────────────────────────────────

SET LOCAL ROLE anon;
SELECT pg_temp.expect_denied('SELECT * FROM public.agent_message_templates()', 'anon cannot read templates');
SELECT pg_temp.expect_denied('SELECT * FROM public.message_template', 'anon cannot read the table');
RESET ROLE;

SELECT pg_temp.become(:b_account::uuid);
SELECT pg_temp.expect_denied(
    format('SELECT * FROM public.agent_create_message_template(%L, %L, ''other'', ''x'', ''y'', ARRAY[]::text[])', :t1, :b_agent),
    'a signed-in user cannot call create');
SELECT pg_temp.expect_denied(
    format('SELECT * FROM public.agent_update_message_template(%L, %L, ''other'', ''x'', ''y'', ARRAY[]::text[])', :t1, :b_agent),
    'a signed-in user cannot call update');
SELECT pg_temp.expect_denied(
    format('SELECT * FROM public.agent_duplicate_message_template(%L, %L, %L)', :t1, :t2, :b_agent),
    'a signed-in user cannot call duplicate');
SELECT pg_temp.expect_denied(
    format('SELECT * FROM public.agent_set_message_template_archived(%L, %L, true)', :t1, :b_agent),
    'a signed-in user cannot call archive');
SELECT pg_temp.expect_denied(
    format('SELECT public.seed_starter_message_templates(%L)', :b_agent),
    'a signed-in user cannot seed starters');
SELECT pg_temp.expect_denied('SELECT * FROM public.message_template', 'a signed-in user cannot read the table directly');
SELECT pg_temp.assert((SELECT count(*) FROM public.agent_message_templates()) = 0,
    'an advisor created after the migration starts with no templates');
RESET ROLE;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Create
-- ─────────────────────────────────────────────────────────────────────────────

SELECT pg_temp.assert(
    (SELECT outcome FROM public.agent_create_message_template(:t1::uuid, :b_agent::uuid, 'pre_trip',
        '  Packing list  ', E'Hi {{ client.firstName }},\nPack light for {{trip.destination}}.',
        ARRAY['Packing', ' packing ', '', 'Beach'])) = 'created',
    'create answers created');

SELECT pg_temp.assert(
    (SELECT name = 'Packing list' AND tags = ARRAY['Packing', 'Beach'] AND subject IS NULL
       FROM public.message_template WHERE id = :t1::uuid),
    'the name is trimmed and the tags lose blanks and repeats, first spelling kept');

SELECT pg_temp.assert(
    (SELECT outcome FROM public.agent_create_message_template(:t1::uuid, :b_agent::uuid, 'pre_trip',
        'Packing list', 'Different words', ARRAY[]::text[])) = 'exists',
    'the same id again is exists, and writes nothing');
SELECT pg_temp.assert(
    (SELECT body_markdown LIKE 'Hi {{ client.firstName }}%' FROM public.message_template WHERE id = :t1::uuid),
    'a repeated create did not overwrite the first');

SELECT pg_temp.assert(
    (SELECT outcome FROM public.agent_create_message_template(:t1::uuid, :agent::uuid, 'other',
        'Mine now', 'Body', ARRAY[]::text[])) = 'conflict',
    'another advisor naming that id is a conflict');
SELECT pg_temp.assert(
    (SELECT agent_id FROM public.message_template WHERE id = :t1::uuid) = :b_agent::uuid,
    'and the template stays its owner''s');

SELECT pg_temp.expect_raise(
    format('SELECT * FROM public.agent_create_message_template(%L, %L, ''other'', ''Typo'', ''Hi {{client.firstname}} and {{trip.when}}'', ARRAY[]::text[])', :t2, :b_agent),
    'unknown merge fields: client.firstname, trip.when',
    'an unknown merge field is refused, every one named');
SELECT pg_temp.expect_raise(
    format('SELECT * FROM public.agent_create_message_template(%L, %L, ''newsletter'', ''x'', ''y'', ARRAY[]::text[])', :t2, :b_agent),
    'unknown template category', 'an unknown category is refused');
SELECT pg_temp.expect_raise(
    format('SELECT * FROM public.agent_create_message_template(%L, %L, ''other'', %L, ''y'', ARRAY[]::text[])', :t2, :b_agent, repeat('n', 81)),
    '1 to 80 characters', 'an 81-character name is refused');
SELECT pg_temp.expect_raise(
    format('SELECT * FROM public.agent_create_message_template(%L, %L, ''other'', ''x'', %L, ARRAY[]::text[])', :t2, :b_agent, repeat('b', 8001)),
    '1 to 8000 characters', 'a body longer than one message is refused');
SELECT pg_temp.expect_raise(
    format('SELECT * FROM public.agent_create_message_template(%L, %L, ''other'', ''x'', ''   '', ARRAY[]::text[])', :t2, :b_agent),
    '1 to 8000 characters', 'a blank body is refused');
SELECT pg_temp.assert(
    NOT EXISTS (SELECT 1 FROM public.message_template WHERE id = :t2::uuid),
    'nothing refused was written');

SELECT pg_temp.assert(
    public.message_template_unknown_tokens('{{payment.amount}} {{ payment.dueDate }} {{agent.firstName}} {not a token}') = ARRAY[]::text[],
    'every documented field passes, with or without inner spaces');
SELECT pg_temp.assert(
    public.message_template_unknown_tokens(E'{{client.firstName\n}} {{\tagent.firstName}}') = ARRAY[]::text[],
    'tabs and newlines inside the braces trim as the Edge Function trims them');

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Reads and update
-- ─────────────────────────────────────────────────────────────────────────────

-- Push "Last edited" into the past so a write of now() is visible inside one transaction.
UPDATE public.message_template SET updated_at = '2026-01-01' WHERE id = :t1::uuid;

SELECT id AS seed_tpl FROM public.message_template WHERE agent_id = :agent::uuid LIMIT 1 \gset
\set seed_tpl '''':seed_tpl''''

SELECT pg_temp.become(:b_account::uuid);
SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_message_templates()) = 1
    AND (SELECT name FROM public.agent_message_template(:t1::uuid)) = 'Packing list',
    'B reads their one template');
SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_message_template(:seed_tpl::uuid)) = 0,
    'B reads none of the seed advisor''s');
RESET ROLE;

SELECT pg_temp.become(:gyasi::uuid);
SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_message_templates()) = 7
    AND (SELECT count(*) FROM public.agent_message_template(:t1::uuid)) = 0,
    'the seed advisor reads their seven and not B''s');
RESET ROLE;

SELECT pg_temp.assert(
    (SELECT outcome FROM public.agent_update_message_template(:t1::uuid, :b_agent::uuid, 'pre_trip',
        'Packing list', E'Hi {{ client.firstName }},\nPack light for {{trip.destination}}.', ARRAY['Packing', 'Beach'])) = 'noop',
    'saving the same words is a noop');
SELECT pg_temp.assert(
    (SELECT updated_at = '2026-01-01' FROM public.message_template WHERE id = :t1::uuid),
    'and "Last edited" did not move');

SELECT pg_temp.assert(
    (SELECT outcome FROM public.agent_update_message_template(:t1::uuid, :b_agent::uuid, 'pre_trip',
        'Packing list', 'Pack light for {{trip.destination}}, {{client.firstName}}.', ARRAY['Packing'])) = 'changed',
    'a real edit is changed');
SELECT pg_temp.assert(
    (SELECT updated_at > '2026-01-01' AND tags = ARRAY['Packing'] FROM public.message_template WHERE id = :t1::uuid),
    'and moves "Last edited" and the tags');

SELECT pg_temp.assert(
    (SELECT outcome FROM public.agent_update_message_template(:t1::uuid, :agent::uuid, 'other',
        'Hijack', 'Body', ARRAY[]::text[])) = 'not_found',
    'another advisor cannot edit it');
SELECT pg_temp.expect_raise(
    format('SELECT * FROM public.agent_update_message_template(%L, %L, ''pre_trip'', ''x'', ''{{trip.dates}} {{client.lastName}}'', ARRAY[]::text[])', :t1, :b_agent),
    'unknown merge fields: client.lastName', 'an edit with an unknown field is refused');

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Duplicate, archive, restore
-- ─────────────────────────────────────────────────────────────────────────────

SELECT pg_temp.assert(
    (SELECT outcome FROM public.agent_duplicate_message_template(:t1::uuid, :t2::uuid, :b_agent::uuid)) = 'created',
    'duplicate answers created');
SELECT pg_temp.assert(
    (SELECT name = 'Copy of Packing list' AND category = 'pre_trip' AND tags = ARRAY['Packing']
       FROM public.message_template WHERE id = :t2::uuid),
    'the copy is "Copy of …" in the same category with the same tags');
SELECT pg_temp.assert(
    (SELECT outcome FROM public.agent_duplicate_message_template(:t1::uuid, :t2::uuid, :b_agent::uuid)) = 'exists',
    'duplicating again with the same new id is exists');
SELECT pg_temp.assert(
    (SELECT outcome FROM public.agent_duplicate_message_template(:t1::uuid, :t3::uuid, :agent::uuid)) = 'not_found'
    AND NOT EXISTS (SELECT 1 FROM public.message_template WHERE id = :t3::uuid),
    'another advisor cannot duplicate it');

UPDATE public.message_template SET name = repeat('L', 80) WHERE id = :t2::uuid;
-- Each check that reads a row a function just wrote is its own statement: a statement's
-- subqueries share the snapshot it started with, which is from before the write.
SELECT pg_temp.assert(
    (SELECT outcome FROM public.agent_duplicate_message_template(:t2::uuid, :t3::uuid, :b_agent::uuid)) = 'created',
    'a copy of an 80-character name is created');
SELECT pg_temp.assert(
    (SELECT char_length(name) FROM public.message_template WHERE id = :t3::uuid) = 80,
    'and its name is cut to fit, not refused');

SELECT pg_temp.assert(
    (SELECT outcome FROM public.agent_set_message_template_archived(:t3::uuid, :b_agent::uuid, true)) = 'changed'
    AND (SELECT outcome FROM public.agent_set_message_template_archived(:t3::uuid, :b_agent::uuid, true)) = 'noop',
    'archive is changed, then noop');
SELECT pg_temp.assert(
    (SELECT outcome FROM public.agent_update_message_template(:t3::uuid, :b_agent::uuid, 'other', 'x', 'y', ARRAY[]::text[])) = 'not_found'
    AND (SELECT outcome FROM public.agent_duplicate_message_template(:t3::uuid, gen_random_uuid(), :b_agent::uuid)) = 'not_found',
    'an archived template cannot be edited or duplicated');

SELECT pg_temp.become(:b_account::uuid);
SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_message_templates()) = 2
    AND (SELECT count(*) FROM public.agent_message_templates(true)) = 1
    AND (SELECT archived FROM public.agent_message_template(:t3::uuid)),
    'the live list drops it and the archived list has it');
RESET ROLE;

SELECT pg_temp.assert(
    (SELECT outcome FROM public.agent_set_message_template_archived(:t3::uuid, :agent::uuid, false)) = 'not_found',
    'another advisor cannot restore it');
SELECT pg_temp.assert(
    (SELECT outcome FROM public.agent_set_message_template_archived(:t3::uuid, :b_agent::uuid, false)) = 'changed',
    'restore answers changed');
SELECT pg_temp.assert(
    (SELECT archived_at IS NULL FROM public.message_template WHERE id = :t3::uuid),
    'and brings it back');

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Merge data
-- ─────────────────────────────────────────────────────────────────────────────

SELECT start_date AS maya_start, end_date AS maya_end FROM public.trip WHERE id = :maya_trip::uuid \gset
\set maya_start '''':maya_start''''
\set maya_end '''':maya_end''''

SELECT pg_temp.become(:gyasi::uuid);
SELECT pg_temp.assert(
    (SELECT client_first_name = 'Maya' AND agent_first_name = 'Gyasi'
            AND trip_title = 'Saint Lucia · Between Semesters'
            AND trip_destinations = ARRAY['Soufriere, Saint Lucia']
            -- The seed dates this trip off current_date, so compare with the row (read as owner,
            -- above), never a literal: a literal only held on the day it was written.
            AND trip_start_date = :maya_start::date AND trip_end_date = :maya_end::date
            AND payment_label = 'Final balance' AND payment_owed_cents = '200000'
            AND payment_currency = 'USD' AND payment_due_date = '2026-11-02'
       FROM public.agent_message_merge_context(:maya::uuid, :maya_trip::uuid, :pm::uuid)),
    'the merge data fills every field, and the amount is what is still owed');
SELECT pg_temp.assert(
    (SELECT trip_title IS NULL AND payment_label IS NULL AND client_first_name = 'Maya'
       FROM public.agent_message_merge_context(:maya::uuid)),
    'a general thread has the client and advisor, and no trip or payment');
SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_message_merge_context(:maya::uuid, :other_trip::uuid)) = 0,
    'another client''s trip is no row');
SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_message_merge_context(:maya::uuid, NULL, :pm::uuid)) = 0,
    'a milestone without its trip is no row');
SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_message_merge_context(:maya::uuid, :maya_trip::uuid,
        '0195a2c0-1a00-7000-8000-0000000e0001'::uuid)) = 0,
    'a milestone of another trip is no row');
RESET ROLE;

SELECT pg_temp.become(:b_account::uuid);
SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_message_merge_context(:maya::uuid, :maya_trip::uuid, :pm::uuid)) = 0,
    'another advisor gets no row for the seed advisor''s client');
RESET ROLE;

UPDATE public.payment_milestone SET paid_cents = 300000 WHERE id = :pm::uuid;
SELECT pg_temp.become(:gyasi::uuid);
SELECT pg_temp.assert(
    (SELECT payment_owed_cents FROM public.agent_message_merge_context(:maya::uuid, :maya_trip::uuid, :pm::uuid)) = '0',
    'an overpaid milestone owes zero, never a negative');
RESET ROLE;

ROLLBACK;
