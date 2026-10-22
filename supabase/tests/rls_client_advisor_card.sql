-- §3.12 Agent Settings, PR 3 — the client's "Your advisor" card (client_advisor_card()).
--
-- WHAT THIS FILE IS GUARDING.
--
--   1. A client reads their own advisor's client-facing fields, and nothing private: no email,
--      phone, hours, zone or time-away label.
--   2. awayUntil is the first day back only while a block runs; otherwise null.
--   3. Anyone who is not a client gets NULL; anon cannot run it.
--
-- Run against a freshly reset local database:
--     supabase db reset
--     psql "$(supabase status -o json | jq -r .DB_URL)" -v ON_ERROR_STOP=1 \
--          -f supabase/tests/rls_client_advisor_card.sql

\set ON_ERROR_STOP on

BEGIN;

\set gyasi    '''0195a2c0-1a00-7000-8000-000000000010'''
\set jordan   '''0195a2c0-1a00-7000-8000-000000000011'''
\set agent    '''0195a2c0-1a00-7000-8000-000000000001'''
\set off_now  '''0c312b00-0000-7000-8000-000000000101'''

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

CREATE OR REPLACE FUNCTION pg_temp.become(account uuid, aal text DEFAULT 'aal1')
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    PERFORM set_config('role', 'authenticated', true);
    PERFORM set_config('request.jwt.claims',
        json_build_object('sub', account::text, 'role', 'authenticated', 'aal', aal)::text, true);
END;
$$;

UPDATE public.agent
   SET social_links = '{"instagram":"https://instagram.com/story.tail"}', avatar_url = NULL
 WHERE id = :agent::uuid;

SELECT pg_temp.become(:jordan::uuid);
SELECT pg_temp.assert(
    (SELECT c ->> 'displayName' = 'Gyasi Story' AND c ->> 'firstName' = 'Gyasi'
            AND c ->> 'pronouns' = 'he/him' AND c ? 'bio' AND c ? 'avatarPath'
            AND c -> 'socialLinks' ->> 'instagram' = 'https://instagram.com/story.tail'
            AND (c ->> 'responseTimeHours')::int = 4
            AND c -> 'awayUntil' = 'null'::jsonb
       FROM (SELECT public.client_advisor_card() c) x),
    'a client reads their own advisor''s card: name, pronouns, bio, photo, links, reply time');
SELECT pg_temp.assert(
    (SELECT NOT (c ?| ARRAY['email', 'phone', 'timeZone', 'weeklySchedule', 'label', 'emailSignature'])
            AND c::text NOT LIKE '%gyasi@example.com%' AND c::text NOT LIKE '%555-0100%'
       FROM (SELECT public.client_advisor_card() c) x),
    'and nothing private: no email, phone, hours, zone, time-away label or signature');
RESET role;

-- A running block: the first day back. Its label stays private.
SELECT public.agent_local_today(:agent::uuid) AS today \gset
\set today '''':today''''
INSERT INTO public.agent_time_off (id, agent_id, starts_on, ends_on, label)
VALUES (:off_now::uuid, :agent::uuid, :today::date - 1, :today::date + 3, 'Private reason');

SELECT pg_temp.become(:jordan::uuid);
SELECT pg_temp.assert(
    (SELECT (public.client_advisor_card() ->> 'awayUntil')::date = :today::date + 4),
    'while away, awayUntil is the first day back');
SELECT pg_temp.assert(public.client_advisor_card()::text NOT LIKE '%Private reason%',
    'the time-away label never reaches the client');
RESET role;

UPDATE public.agent_time_off SET starts_on = :today::date + 10, ends_on = :today::date + 12
 WHERE id = :off_now::uuid;
SELECT pg_temp.become(:jordan::uuid);
SELECT pg_temp.assert(public.client_advisor_card() -> 'awayUntil' = 'null'::jsonb,
    'time away still ahead does not show yet');
RESET role;

SELECT pg_temp.become(:gyasi::uuid, 'aal2');
SELECT pg_temp.assert(public.client_advisor_card() IS NULL, 'an advisor gets NULL (not a client)');
RESET role;

SET LOCAL role anon;
SELECT pg_temp.expect_denied('SELECT public.client_advisor_card()', 'anon cannot run it');
RESET role;

ROLLBACK;
