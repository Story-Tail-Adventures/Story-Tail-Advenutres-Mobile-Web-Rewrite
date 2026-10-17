-- §3.12 Agent Profile & Settings, PR 1 — Profile and Availability (Screens 3.12.1, 3.12.2).
--
-- WHAT THIS FILE IS GUARDING.
--
--   1. The shapes: weekly_schedule, social_links and the signature are checked by the
--      database, not only by the Edge Function. The seed's old schedule arrays were converted.
--   2. Every advisor has an availability row, including one added after the migration.
--   3. agent_settings_self(): the caller's own settings at aal2, NULL at aal1 and for a client,
--      never the calendar refresh token, and only out-of-office blocks still ahead.
--   4. The writes: a change writes one audit row with {from, to}; an unchanged save writes
--      nothing and audits nothing; an archived advisor is refused.
--   5. Out-of-office: no overlap, no start in the past, an upcoming block can be edited, a
--      running one only ended early, another advisor's id is a conflict.
--   6. The photo URL must sit in the advisor's own folder of the public bucket.
--   7. No client role can read agent_time_off or run a write.
--
-- Run against a freshly reset local database:
--     supabase db reset
--     psql "$(supabase status -o json | jq -r .DB_URL)" -v ON_ERROR_STOP=1 \
--          -f supabase/tests/rls_agent_settings.sql

\set ON_ERROR_STOP on

BEGIN;

\set gyasi    '''0195a2c0-1a00-7000-8000-000000000010'''
\set jordan   '''0195a2c0-1a00-7000-8000-000000000011'''
\set agent    '''0195a2c0-1a00-7000-8000-000000000001'''
\set b_agent  '''0c312000-0000-7000-8000-000000000001'''
\set off_a    '''0c312000-0000-7000-8000-000000000101'''
\set off_b    '''0c312000-0000-7000-8000-000000000102'''
\set off_run  '''0c312000-0000-7000-8000-000000000103'''
\set off_now  '''0c312000-0000-7000-8000-000000000104'''
\set off_x    '''0c312000-0000-7000-8000-000000000105'''

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

CREATE OR REPLACE FUNCTION pg_temp.audits(p_type text) RETURNS bigint LANGUAGE sql AS $$
    SELECT count(*) FROM public.audit_event WHERE event_type = p_type;
$$;

SELECT pu.id AS actor FROM public.platform_user pu WHERE pu.account_id = :gyasi::uuid \gset
\set actor '''':actor''''

SELECT public.agent_local_today(:agent::uuid) AS today \gset
\set today '''':today''''

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Shapes
-- ─────────────────────────────────────────────────────────────────────────────

SELECT pg_temp.assert(
    (SELECT weekly_schedule -> 'fri' = '{"start":"09:00","end":"15:00"}'::jsonb
            AND weekly_schedule -> 'sun' = 'null'::jsonb
       FROM public.agent_availability WHERE agent_id = :agent::uuid),
    'the seed''s schedule is in the declared shape (Friday ends early, Sunday off)');

SELECT pg_temp.assert(public.agent_weekly_schedule_valid(public.agent_default_weekly_schedule()),
    'the default schedule passes its own check');
SELECT pg_temp.assert(NOT public.agent_weekly_schedule_valid(
    public.agent_default_weekly_schedule() - 'sun'), 'a schedule missing a day is refused');
SELECT pg_temp.assert(NOT public.agent_weekly_schedule_valid(
    jsonb_set(public.agent_default_weekly_schedule(), '{mon}', '{"start":"09:15","end":"17:00"}')),
    'a time off the half hour is refused');
SELECT pg_temp.assert(NOT public.agent_weekly_schedule_valid(
    jsonb_set(public.agent_default_weekly_schedule(), '{mon}', '{"start":"17:00","end":"09:00"}')),
    'an end before its start is refused');
SELECT pg_temp.assert(public.agent_weekly_schedule_valid(
    jsonb_set(public.agent_default_weekly_schedule(), '{mon}', '{"start":"00:00","end":"24:00"}')),
    'working all day (00:00 to 24:00) is allowed');
SELECT pg_temp.assert(NOT public.agent_weekly_schedule_valid(
    jsonb_set(public.agent_default_weekly_schedule(), '{mon}', '{"start":"09:00","end":"17:00","x":1}')),
    'an extra key in a day is refused');
-- These two once came back NULL, which a CHECK lets through.
SELECT pg_temp.assert(public.agent_weekly_schedule_valid('{}') IS FALSE,
    'an empty schedule is false, not NULL');
SELECT pg_temp.assert(public.agent_weekly_schedule_valid(
    jsonb_set(public.agent_default_weekly_schedule(), '{mon}', '{}')) IS FALSE,
    'an empty day is false, not NULL');
SELECT pg_temp.assert(public.agent_social_links_valid('[]') IS FALSE,
    'social links that are not an object are false, not NULL');

SELECT pg_temp.assert(public.agent_social_links_valid(
    '{"instagram":"https://instagram.com/story","website":"https://story-tail.com"}'),
    'two https links pass');
SELECT pg_temp.assert(NOT public.agent_social_links_valid('{"tiktok":"https://tiktok.com/x"}'),
    'a network outside the four is refused');
SELECT pg_temp.assert(NOT public.agent_social_links_valid('{"website":"http://story-tail.com"}'),
    'a plain http link is refused');
SELECT pg_temp.assert(NOT public.agent_social_links_valid('{"website":"javascript:alert(1)"}'),
    'a javascript: link is refused');

SELECT pg_temp.expect_error(format(
    'UPDATE public.agent SET email_signature = %L WHERE id = %L',
    repeat(E'line\n', 8) || 'ninth', :agent), '23514', 'a nine-line signature is refused');
SELECT pg_temp.expect_error(format(
    'UPDATE public.agent SET email_signature = %L WHERE id = %L', repeat('x', 501), :agent),
    '23514', 'a 501-character signature is refused');
SELECT pg_temp.expect_error(format(
    'UPDATE public.agent_availability SET response_time_hours = 3 WHERE agent_id = %L', :agent),
    '23514', 'a reply time outside 2/4/12/24/48 is refused');

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Every advisor has a row
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.agent (id, display_name, email, status, time_zone)
VALUES (:b_agent::uuid, 'Settings Test Advisor', 'settings.advisor@example.com', 'active', 'America/Denver');

SELECT pg_temp.assert(
    (SELECT weekly_schedule = public.agent_default_weekly_schedule() AND response_time_hours = 24
       FROM public.agent_availability WHERE agent_id = :b_agent::uuid),
    'a new advisor gets an availability row with the defaults');

SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_time_off WHERE agent_id = :agent::uuid) = 2
    AND (SELECT time_off_blocks FROM public.agent_availability WHERE agent_id = :agent::uuid) = '[]'::jsonb,
    'the seed''s two holidays live in agent_time_off and the old blob is empty');

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. The read
-- ─────────────────────────────────────────────────────────────────────────────

SELECT pg_temp.become(:gyasi::uuid, 'aal1');
SELECT pg_temp.assert(public.agent_settings_self() IS NULL, 'agent_settings_self() is NULL at aal1');

SELECT pg_temp.become(:gyasi::uuid, 'aal2');
SELECT pg_temp.assert(
    (SELECT s -> 'profile' ->> 'displayName' = 'Gyasi Story'
            AND s -> 'availability' ->> 'timeZone' IS NOT NULL
            AND (s -> 'availability' ->> 'responseTimeHours')::int = 4
            AND jsonb_typeof(s -> 'timeOff') = 'array'
       FROM (SELECT public.agent_settings_self() s) x),
    'agent_settings_self() answers the advisor''s own profile and availability at aal2');
SELECT pg_temp.assert(public.agent_settings_self()::text NOT LIKE '%refresh_token%',
    'the read never carries the calendar refresh token');
SELECT pg_temp.expect_denied('SELECT * FROM public.agent_time_off',
    'an advisor cannot read agent_time_off directly');
SELECT pg_temp.expect_denied(format(
    'SELECT public.agent_settings_update_profile(%L, ''x'', null, null, null, ''{}'', public.uuid_v7(), %L, null, null)',
    :agent, :actor), 'an advisor cannot call the profile write directly');
SELECT pg_temp.expect_denied(format(
    'SELECT public.agent_settings_end_time_off(public.uuid_v7(), %L, public.uuid_v7(), %L, null, null)',
    :agent, :actor), 'an advisor cannot call the time-off write directly');

SELECT pg_temp.become(:jordan::uuid, 'aal2');
SELECT pg_temp.assert(public.agent_settings_self() IS NULL, 'agent_settings_self() is NULL for a client');
RESET role;

SET LOCAL role anon;
SELECT pg_temp.expect_denied('SELECT public.agent_settings_self()', 'anon cannot run agent_settings_self()');
RESET role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Profile and availability writes
-- ─────────────────────────────────────────────────────────────────────────────

SELECT pg_temp.assert(
    public.agent_settings_update_profile(:agent::uuid, 'Gyasi Story', 'he/him', '+1-555-0100',
        (SELECT bio FROM public.agent WHERE id = :agent::uuid),
        (SELECT social_links FROM public.agent WHERE id = :agent::uuid),
        public.uuid_v7(), :actor::uuid, '203.0.113.7', 'test') = 'unchanged'
    AND pg_temp.audits('agent.profile_updated') = 0,
    'saving the profile unchanged writes nothing and audits nothing');

SELECT pg_temp.assert(
    public.agent_settings_update_profile(:agent::uuid, 'Gyasi Story', 'he/him', '+1-555-0100',
        'New bio.', '{"instagram":"https://instagram.com/story.tail"}',
        public.uuid_v7(), :actor::uuid, '203.0.113.7, 10.0.0.1', 'test') = 'updated',
    'a changed profile saves');
SELECT pg_temp.assert(
    (SELECT metadata -> 'changes' ? 'bio' AND metadata -> 'changes' ? 'socialLinks'
            AND NOT metadata -> 'changes' ? 'displayName'
            AND metadata -> 'changes' -> 'bio' ->> 'to' = 'New bio.'
            AND ip_address = '203.0.113.7'::inet
       FROM public.audit_event WHERE event_type = 'agent.profile_updated'),
    'one audit row naming only the changed fields, with from and to, and the first forwarded hop');

-- The write and the read are separate statements: a read in the same statement as a
-- volatile write sees the snapshot from before it.
SELECT public.agent_settings_update_availability(:agent::uuid, 'America/New_York',
        jsonb_set(public.agent_default_weekly_schedule(), '{sat}', 'null'), 12,
        public.uuid_v7(), :actor::uuid, null, 'test') AS r \gset
SELECT pg_temp.assert(
    :'r' = 'updated'
    AND (SELECT time_zone FROM public.agent WHERE id = :agent::uuid) = 'America/New_York'
    AND (SELECT response_time_hours FROM public.agent_availability WHERE agent_id = :agent::uuid) = 12,
    'zone, hours and reply time save together');
SELECT pg_temp.assert(
    (SELECT metadata -> 'changes' ?& ARRAY['timeZone', 'weeklySchedule', 'responseTimeHours']
       FROM public.audit_event WHERE event_type = 'agent_availability.updated'),
    'the availability audit row holds all three changes');
SELECT pg_temp.assert(
    public.agent_settings_update_availability(:agent::uuid, 'America/New_York',
        jsonb_set(public.agent_default_weekly_schedule(), '{sat}', 'null'), 12,
        public.uuid_v7(), :actor::uuid, null, 'test') = 'unchanged'
    AND pg_temp.audits('agent_availability.updated') = 1,
    'saving availability unchanged audits nothing');
SELECT pg_temp.expect_error(format(
    'SELECT public.agent_settings_update_availability(%L, ''Mars/Olympus'', public.agent_default_weekly_schedule(), 24, public.uuid_v7(), %L, null, null)',
    :agent, :actor), 'P0001', 'an unknown time zone is refused');
SELECT pg_temp.expect_error(format(
    'SELECT public.agent_settings_update_availability(%L, ''America/Chicago'', ''{}''::jsonb, 24, public.uuid_v7(), %L, null, null)',
    :agent, :actor), '23514', 'a malformed schedule is refused by the table');

-- Re-read today: the zone just changed.
SELECT public.agent_local_today(:agent::uuid) AS today \gset
\set today '''':today''''

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Out-of-office
-- ─────────────────────────────────────────────────────────────────────────────

SELECT pg_temp.assert(
    public.agent_settings_save_time_off(:off_a::uuid, :agent::uuid, true, :today::date + 10, :today::date + 12,
        'Beach week', public.uuid_v7(), :actor::uuid, null, 'test') = 'created'
    AND pg_temp.audits('agent_time_off.created') = 1,
    'an upcoming block is created and audited');
SELECT pg_temp.assert(
    public.agent_settings_save_time_off(:off_a::uuid, :agent::uuid, true, :today::date + 10, :today::date + 12,
        'Beach week', public.uuid_v7(), :actor::uuid, null, 'test') = 'unchanged',
    'saving the same block again is a no-op (a retried request)');
SELECT pg_temp.assert(
    public.agent_settings_save_time_off(:off_b::uuid, :agent::uuid, true, :today::date + 12, :today::date + 14,
        null, public.uuid_v7(), :actor::uuid, null, 'test') = 'overlap',
    'a block sharing a day with another is refused');
SELECT pg_temp.assert(
    public.agent_settings_save_time_off(:off_b::uuid, :agent::uuid, true, :today::date + 13, :today::date + 14,
        null, public.uuid_v7(), :actor::uuid, null, 'test') = 'created',
    'a block starting the day after another ends is fine');
SELECT pg_temp.assert(
    public.agent_settings_save_time_off(public.uuid_v7(), :agent::uuid, false, :today::date + 40, :today::date + 41,
        null, public.uuid_v7(), :actor::uuid, null, 'test') = 'not_found',
    'an "edit" of a block that does not exist creates nothing (only a vetted new id may insert)');
SELECT pg_temp.assert(
    public.agent_settings_save_time_off(:off_x::uuid, :agent::uuid, true, :today::date - 1, :today::date + 1,
        null, public.uuid_v7(), :actor::uuid, null, 'test') = 'starts_in_past',
    'a new block cannot start before today');
SELECT public.agent_settings_save_time_off(:off_a::uuid, :agent::uuid, true, :today::date + 9, :today::date + 11,
        'Beach days', public.uuid_v7(), :actor::uuid, null, 'test') AS r \gset
SELECT pg_temp.assert(
    :'r' = 'updated'
    AND (SELECT metadata -> 'changes' ?& ARRAY['startsOn', 'endsOn', 'label']
           FROM public.audit_event WHERE event_type = 'agent_time_off.updated'),
    'an upcoming block can be edited, and the audit row holds the changes');
SELECT pg_temp.assert(
    public.agent_settings_save_time_off(:off_a::uuid, :b_agent::uuid, true, :today::date + 30, :today::date + 31,
        null, public.uuid_v7(), :actor::uuid, null, 'test') = 'conflict',
    'another advisor''s block id is a conflict');
SELECT pg_temp.assert(
    public.agent_settings_end_time_off(:off_a::uuid, :b_agent::uuid, public.uuid_v7(), :actor::uuid, null, 'test') = 'not_found',
    'another advisor cannot end someone else''s block');

-- A running block, planted directly (no write path creates one in the past).
INSERT INTO public.agent_time_off (id, agent_id, starts_on, ends_on, label)
VALUES (:off_run::uuid, :agent::uuid, :today::date - 2, :today::date + 2, 'Running');

SELECT pg_temp.assert(
    public.agent_settings_save_time_off(:off_run::uuid, :agent::uuid, false, :today::date - 2, :today::date + 2,
        'New label', public.uuid_v7(), :actor::uuid, null, 'test') = 'started',
    'a running block cannot be edited, even just its label, and it says "started"');
SELECT public.agent_settings_end_time_off(:off_run::uuid, :agent::uuid, public.uuid_v7(), :actor::uuid, null, 'test') AS r \gset
SELECT pg_temp.assert(
    :'r' = 'ended'
    AND (SELECT ends_on FROM public.agent_time_off WHERE id = :off_run::uuid) = :today::date - 1,
    '"I''m back" ends a running block yesterday');
SELECT pg_temp.assert(
    public.agent_settings_end_time_off(:off_run::uuid, :agent::uuid, public.uuid_v7(), :actor::uuid, null, 'test') = 'past',
    'a past block is left alone');

INSERT INTO public.agent_time_off (id, agent_id, starts_on, ends_on)
VALUES (:off_now::uuid, :agent::uuid, :today::date, :today::date + 3);
SELECT public.agent_settings_end_time_off(:off_now::uuid, :agent::uuid, public.uuid_v7(), :actor::uuid, null, 'test') AS r \gset
SELECT pg_temp.assert(
    :'r' = 'deleted'
    AND NOT EXISTS (SELECT 1 FROM public.agent_time_off WHERE id = :off_now::uuid),
    'ending a block that began today removes it');
SELECT pg_temp.assert(
    public.agent_settings_end_time_off(:off_b::uuid, :agent::uuid, public.uuid_v7(), :actor::uuid, null, 'test') = 'deleted'
    AND pg_temp.audits('agent_time_off.deleted') = 2,
    'an upcoming block is deleted, and each delete is audited');

SELECT pg_temp.become(:gyasi::uuid, 'aal2');
SELECT pg_temp.assert(
    (SELECT bool_and((b ->> 'endsOn')::date >= :today::date)
       FROM jsonb_array_elements(public.agent_settings_self() -> 'timeOff') b),
    'the read lists only blocks still ahead');
RESET role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. The photo
-- ─────────────────────────────────────────────────────────────────────────────

SELECT pg_temp.expect_error(format(
    'SELECT * FROM public.agent_settings_set_avatar(%L, %L, public.uuid_v7(), %L, null, null)',
    :agent, '/storage/v1/object/public/agent-avatars/' || :agent
            || '/../x/0195a2c0-1a00-7000-8000-000000000001.jpg', :actor),
    'P0001', 'a URL outside the advisor''s own folder is refused');
SELECT pg_temp.expect_error(format(
    'SELECT * FROM public.agent_settings_set_avatar(%L, %L, public.uuid_v7(), %L, null, null)',
    :agent, '/storage/v1/object/public/agent-avatars/' || :b_agent
            || '/0195a2c0-1a00-7000-8000-000000000001.jpg', :actor),
    'P0001', 'another advisor''s folder is refused');
SELECT pg_temp.expect_error(format(
    'SELECT * FROM public.agent_settings_set_avatar(%L, %L, public.uuid_v7(), %L, null, null)',
    :agent, 'https://evil.example.com/storage/v1/object/public/agent-avatars/' || :agent
            || '/0195a2c0-1a00-7000-8000-000000000001.jpg', :actor),
    'P0001', 'an absolute URL is refused: the column holds a path, so no host can be planted');

SELECT pg_temp.assert(
    (SELECT outcome = 'updated' AND previous_url IS NULL
       FROM public.agent_settings_set_avatar(:agent::uuid,
            '/storage/v1/object/public/agent-avatars/' || :agent
            || '/0195a2c0-1a00-7000-8000-000000000001.jpg', public.uuid_v7(), :actor::uuid, null, 'test')),
    'a photo in the advisor''s folder is accepted');
SELECT pg_temp.assert(
    (SELECT outcome = 'updated' AND previous_url LIKE '%/0195a2c0-1a00-7000-8000-000000000001.jpg'
       FROM public.agent_settings_set_avatar(:agent::uuid, null, public.uuid_v7(), :actor::uuid, null, 'test'))
    AND pg_temp.audits('agent.avatar_removed') = 1
    AND pg_temp.audits('agent.avatar_changed') = 1,
    'removing it hands back the old URL to delete, and both are audited');

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. An archived advisor
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE public.agent SET status = 'archived' WHERE id = :b_agent::uuid;
SELECT pg_temp.assert(
    public.agent_settings_update_profile(:b_agent::uuid, 'Gone', null, null, null, '{}',
        public.uuid_v7(), :actor::uuid, null, 'test') = 'not_found'
    AND public.agent_settings_snapshot(:b_agent::uuid) IS NULL,
    'an archived advisor can neither save nor be read');

ROLLBACK;
