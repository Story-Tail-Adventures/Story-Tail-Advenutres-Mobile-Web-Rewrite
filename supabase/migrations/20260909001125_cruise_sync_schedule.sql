-- Weekly schedule for the cruise sync (Data-Model §24.7). P2.
--
-- WHY THE SCHEDULE LIVES IN SQL. deploy.yml spends a paragraph on the deploy split: this
-- repo's GitHub Actions own the frontend, and Supabase's own GitHub integration applies
-- migrations and Edge Functions over its OAuth connection, so that "a database password that
-- never enters GitHub cannot leak from GitHub." A scheduled GitHub Actions workflow calling
-- this function would need a Supabase credential in GitHub and break that property for one
-- cron line. pg_cron keeps the schedule version-controlled, deployed by the same integration
-- that deploys the function it calls, and visible in the database next to what it writes.
--
-- THREE NEW PRIMITIVES, none of them previously used here: pg_cron, pg_net, and Vault. That
-- is the cost, and it is worth stating plainly rather than discovering later. Vault is the
-- unavoidable one — pg_net has to present a service-role JWT to a function whose
-- config.toml sets verify_jwt = true, and a JWT in a migration is a JWT in git.
--
-- THE SECRETS ARE NOT IN THIS FILE AND CANNOT BE. cruise_sync_tick() reads two Vault
-- secrets and NO-OPS QUIETLY when either is absent:
--
--   cruise_sync_function_url        e.g. https://<ref>.supabase.co/functions/v1/cruise-sync
--   cruise_sync_service_role_key    the project's service-role key
--
-- So a fresh local stack schedules a job that does nothing, which is exactly right — a
-- laptop should not be spending a 100-request monthly budget in the background. Production
-- starts working when someone adds the two secrets. See supabase/README.md.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

COMMENT ON EXTENSION pg_cron IS
    'Scheduler for the weekly cruise sync (migration 20260909001125). First cron primitive '
    'in this project — see that migration''s header for why the schedule is not a GitHub '
    'Actions workflow.';

-- ─────────────────────────────────────────────────────────────────────────────
-- The tick. Deliberately thin: it decides nothing about what to sync — that is
-- cruise_sync_scope's job, read by the Edge Function — and only answers "poke the function,
-- if we have been told how."
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.cruise_sync_tick()
RETURNS bigint
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    fn_url      text;
    service_key text;
    request_id  bigint;
BEGIN
    SELECT decrypted_secret INTO fn_url
      FROM vault.decrypted_secrets WHERE name = 'cruise_sync_function_url';
    SELECT decrypted_secret INTO service_key
      FROM vault.decrypted_secrets WHERE name = 'cruise_sync_service_role_key';

    IF fn_url IS NULL OR service_key IS NULL THEN
        -- Not an error. This is the expected state on a laptop and on any environment
        -- nobody has provisioned, and raising here would turn every local `db reset` into a
        -- red cron job for a budget it should not be spending anyway.
        RAISE NOTICE 'cruise_sync_tick: vault secrets absent, skipping';
        RETURN NULL;
    END IF;

    -- Fire-and-forget by design: net.http_post is async and returns immediately with a
    -- request id, so a slow sync cannot hold a cron worker. The reply lands in
    -- net._http_response; the authoritative record of what the run did is the
    -- cruise_sync_run and cruise_api_request rows the function itself writes.
    SELECT net.http_post(
        url     => fn_url,
        body    => jsonb_build_object('trigger', 'cron'),
        headers => jsonb_build_object(
            'Content-Type',  'application/json',
            'Authorization', 'Bearer ' || service_key
        ),
        timeout_milliseconds => 10000
    ) INTO request_id;

    RETURN request_id;
END $$;

COMMENT ON FUNCTION public.cruise_sync_tick() IS
    'Pokes the cruise-sync Edge Function with a service-role JWT read from Vault. Returns '
    'the pg_net request id, or NULL when the Vault secrets are absent (the expected state '
    'locally). SECURITY DEFINER and executable by nobody but the owner: it cannot leak the '
    'key, but anyone who could call it could spend a metered monthly budget.';

-- Executable by the owner only. Not `authenticated`, not `service_role`: cron runs this as
-- the owner, and there is no legitimate caller-initiated path to it. A manual run goes
-- through the Edge Function's own `manual` trigger, which is audited and budget-checked.
REVOKE ALL ON FUNCTION public.cruise_sync_tick() FROM public;
REVOKE ALL ON FUNCTION public.cruise_sync_tick() FROM anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Schedule. Weekly, because the arithmetic says so: three reference requests a run against
-- 100 a month is ~12, which leaves ~88 for quote-time detail fetches and manual runs. Daily
-- would cost ~90 and leave nothing.
--
-- 09:17 on Mondays. pg_cron runs in UTC, so this is early morning US Eastern — after the
-- provider's own overnight price collection (their /coverage docs describe a daily
-- recompute "after the morning price collection") and before anyone is looking at the site.
-- The odd minute is deliberate: :00 is where every scheduled job in the world piles up.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cruise-sync-weekly') THEN
        PERFORM cron.unschedule('cruise-sync-weekly');
    END IF;

    PERFORM cron.schedule(
        'cruise-sync-weekly',
        '17 9 * * 1',
        'SELECT public.cruise_sync_tick();'
    );
END $$;
