-- Track B: the cron ticks send STA_CRON_SECRET to the Go service (migration 20261106120000,
-- docs/GO-MIGRATION.md §5.6).
--
-- WHAT THIS FILE IS GUARDING.
--
--   1. The bearer follows the URL: a Supabase Edge Functions URL still gets the service-role
--      key (so nothing changes until a URL is moved), any other URL gets sta_cron_secret.
--   2. A URL moved to Go without sta_cron_secret, or with a short one, RAISES. Never quiet:
--      that is the placeholder secret that 401'd the cruise sync for weeks.
--   3. Nothing that reads these secrets is executable by an API role. cron_bearer_for returns
--      a secret, so service_role is barred from it too.
--   4. The ticks still answer idle/unprovisioned exactly as before.
--
-- Run against a freshly reset local database:
--     supabase db reset
--     psql "$(supabase status -o json | jq -r .DB_URL)" -v ON_ERROR_STOP=1 \
--          -f supabase/tests/cron_sta_cron_secret.sql

\set ON_ERROR_STOP on

BEGIN;

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
    RAISE EXCEPTION 'FAILED: %: statement succeeded', description;
EXCEPTION
    WHEN OTHERS THEN
        IF SQLERRM LIKE 'FAILED:%' THEN RAISE; END IF;
        IF position(fragment IN SQLERRM) = 0 THEN
            RAISE EXCEPTION 'FAILED: %: expected "%", got %', description, fragment, SQLERRM;
        END IF;
        RAISE NOTICE '  ok    %', description;
END;
$$;

-- A clean slate inside this transaction: whatever this database's vault holds is set aside.
DELETE FROM vault.secrets
 WHERE name IN ('sta_cron_secret', 'cruise_sync_service_role_key', 'push_dispatch_function_url',
                'email_inbox_function_url', 'email_dispatch_function_url', 'cruise_sync_function_url');

-- 1. The URL rule.
SELECT pg_temp.assert(public.cron_url_is_edge_function('https://abcdefghij.supabase.co/functions/v1/push-dispatch'),
    'a hosted Supabase function URL is an Edge Function');
SELECT pg_temp.assert(public.cron_url_is_edge_function('http://kong:8000/functions/v1/email-inbox'),
    'the local gateway is an Edge Function');
SELECT pg_temp.assert(NOT public.cron_url_is_edge_function('https://storytail.onrender.com/functions/v1/push-dispatch'),
    'any other host is the Go service');
SELECT pg_temp.assert(NOT public.cron_url_is_edge_function('https://evil.example/a.supabase.co/functions/v1/x'),
    'a supabase.co lookalike in the path is not an Edge Function');
SELECT pg_temp.assert(NOT public.cron_url_is_edge_function('https://abc.supabase.co.evil.com/functions/v1/x'),
    'a supabase.co lookalike host is not an Edge Function');
SELECT pg_temp.assert(public.cron_url_is_edge_function('HTTPS://ABCDEF.SUPABASE.CO:443/functions/v1/x'),
    'a real Supabase URL in capitals with :443 is still an Edge Function');

-- An Edge Function URL with no key is unprovisioned (NULL), as before.
SELECT pg_temp.assert(public.cron_bearer_for('http://kong:8000/functions/v1/push-dispatch', 't') IS NULL,
    'an Edge Function URL with no service key is quietly unprovisioned');

-- 2. A Go URL without a real secret is loud.
SELECT pg_temp.expect_raise(
    $$SELECT public.cron_bearer_for('https://go.example/functions/v1/push-dispatch', 'push_dispatch_tick')$$,
    'sta_cron_secret is missing', 'a Go URL with no sta_cron_secret raises');
SELECT vault.create_secret('placeholder', 'sta_cron_secret');
SELECT pg_temp.expect_raise(
    $$SELECT public.cron_bearer_for('https://go.example/functions/v1/push-dispatch', 'push_dispatch_tick')$$,
    'too short', 'a placeholder sta_cron_secret raises');
SELECT vault.update_secret((SELECT id FROM vault.secrets WHERE name = 'sta_cron_secret'),
    '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef');
SELECT vault.create_secret('a.b.c', 'cruise_sync_service_role_key');
SELECT pg_temp.assert(
    public.cron_bearer_for('https://go.example/functions/v1/push-dispatch', 't')
        = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    'a Go URL gets sta_cron_secret');
SELECT pg_temp.assert(public.cron_bearer_for('http://kong:8000/functions/v1/push-dispatch', 't') = 'a.b.c',
    'an Edge Function URL still gets the service key, never the cron secret');

-- 3. The ticks.
SELECT pg_temp.assert(public.push_dispatch_tick() IN ('idle', 'unprovisioned', 'dispatched'),
    'push_dispatch_tick still runs');
SELECT pg_temp.assert(public.email_inbox_tick() = 'unprovisioned',
    'email_inbox_tick with no URL is unprovisioned');
SELECT vault.create_secret('https://go.example/functions/v1/email-inbox', 'email_inbox_function_url');
SELECT pg_temp.assert(public.email_inbox_tick() = 'dispatched',
    'email_inbox_tick with a Go URL and the secret dispatches');

-- The cruise tick: its JWT-shape guard is for the Edge Function path only; a Go URL with the
-- cron secret dispatches, and with a short secret the TICK itself raises.
SELECT vault.create_secret('https://go.example/functions/v1/cruise-sync', 'cruise_sync_function_url');
SELECT pg_temp.assert(public.cruise_sync_tick() IS NOT NULL,
    'cruise_sync_tick with a Go URL dispatches (the JWT guard does not apply to the cron secret)');
SELECT vault.update_secret((SELECT id FROM vault.secrets WHERE name = 'cruise_sync_function_url'),
    'http://kong:8000/functions/v1/cruise-sync');
SELECT vault.update_secret((SELECT id FROM vault.secrets WHERE name = 'cruise_sync_service_role_key'), 'placeholder');
SELECT pg_temp.expect_raise($$SELECT public.cruise_sync_tick()$$, 'is not a JWT',
    'an Edge URL still gets the JWT-shape guard on the service key');
SELECT vault.update_secret((SELECT id FROM vault.secrets WHERE name = 'cruise_sync_function_url'),
    'https://go.example/functions/v1/cruise-sync');
SELECT vault.update_secret((SELECT id FROM vault.secrets WHERE name = 'sta_cron_secret'), 'short');
SELECT pg_temp.expect_raise($$SELECT public.cruise_sync_tick()$$, 'too short',
    'cruise_sync_tick itself raises when its Go URL has a short cron secret');
SELECT pg_temp.expect_raise($$SELECT public.cruise_sync_watchdog()$$, 'too short',
    'the cruise watchdog goes red for the same misconfiguration');

-- email_dispatch_tick with work waiting and a Go URL.
SELECT vault.update_secret((SELECT id FROM vault.secrets WHERE name = 'sta_cron_secret'),
    '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef');
SELECT vault.create_secret('https://go.example/functions/v1/email-dispatch', 'email_dispatch_function_url');
SELECT pg_temp.assert(public.email_dispatch_tick() IN ('idle', 'dispatched'),
    'email_dispatch_tick with a Go URL runs (idle when nothing is due, else dispatched)');

-- 4. No API role.
DO $$
DECLARE r text;
BEGIN
    FOREACH r IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
        IF has_function_privilege(r, 'public.cron_bearer_for(text, text)', 'EXECUTE') THEN
            RAISE EXCEPTION 'FAILED: % can execute cron_bearer_for', r;
        END IF;
    END LOOP;
    FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
        IF has_function_privilege(r, 'public.push_dispatch_tick()', 'EXECUTE')
           OR has_function_privilege(r, 'public.email_dispatch_tick()', 'EXECUTE')
           OR has_function_privilege(r, 'public.email_inbox_tick()', 'EXECUTE')
           OR has_function_privilege(r, 'public.cruise_sync_tick()', 'EXECUTE')
           OR has_function_privilege(r, 'public.cruise_sync_watchdog(interval)', 'EXECUTE') THEN
            RAISE EXCEPTION 'FAILED: % can execute a cron tick', r;
        END IF;
    END LOOP;
    RAISE NOTICE '  ok    no API role can run the ticks or read the bearer';
END $$;

ROLLBACK;
