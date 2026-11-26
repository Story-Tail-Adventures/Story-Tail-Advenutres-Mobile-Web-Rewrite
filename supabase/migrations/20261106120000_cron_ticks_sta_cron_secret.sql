-- Track B (docs/GO-MIGRATION.md §5.6, ruling 13): the four pg_cron ticks that call a function
-- send STA_CRON_SECRET to the Go service instead of the service-role key.
--
-- WHAT CHANGES. push_dispatch_tick, email_dispatch_tick, email_inbox_tick and cruise_sync_tick
-- (and cruise_sync_watchdog, which reads the same secrets) no longer read
-- `cruise_sync_service_role_key` unconditionally. Each asks cron_bearer_for() which bearer its
-- URL takes:
--
--   * a Supabase Edge Functions URL (https://<ref>.supabase.co/functions/v1/..., or the local
--     gateway http://kong:8000/functions/v1/...) keeps getting the service-role key, exactly as
--     before, so nothing changes until the URL is moved;
--   * ANY OTHER URL is the Go service, and gets the new vault secret `sta_cron_secret`.
--
-- So the switch is two vault edits per job and can never half-break: the bearer follows the URL.
-- Pointing a URL at Go without `sta_cron_secret` (or with a short one) RAISES, loudly, in the
-- tick's own cron job: a placeholder secret that 401'd silently for weeks is how production's
-- cruise catalog stayed empty (20260926180000, 20260930110000).
--
-- WHY NOT JUST SEND BOTH. Sending the service-role key to the Go service would put the one
-- secret that bypasses RLS on a second wire for no reason; Go checks STA_CRON_SECRET in constant
-- time and accepts nothing else on a cron route.
--
-- What Gyasi sets in vault, per environment, when Go is live (also in the PR description):
--
--   select vault.create_secret('<64 hex chars, the same value as Render's STA_CRON_SECRET>',
--                              'sta_cron_secret');
--   select vault.update_secret((select id from vault.secrets where name = 'push_dispatch_function_url'),
--                              'https://<go-host>/functions/v1/push-dispatch');
--   -- and the same for email_dispatch_function_url, email_inbox_function_url,
--   -- cruise_sync_function_url
--
-- Then read net._http_response after the next tick and confirm a 2xx (the cruise watchdog does
-- this for the cruise sync on its own).

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Which bearer a URL takes
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.cron_url_is_edge_function(p_url text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
    -- Lower-cased, and an explicit :443 allowed, so a real Supabase URL written another way is
    -- not mistaken for the Go service (which would send it the cron secret and 401). The rule
    -- still cannot send the service-role key anywhere but a *.supabase.co host over https or
    -- the local gateway.
    SELECT lower(p_url) ~ '^https://[a-z0-9]+\.supabase\.co(:443)?/functions/v1/'
        OR lower(p_url) ~ '^http://(kong|supabase_kong_[a-z0-9_-]+):8000/functions/v1/';
$$;

COMMENT ON FUNCTION public.cron_url_is_edge_function(text) IS
    'True for a Supabase Edge Functions URL (hosted, or the local gateway). Any other URL a '
    'cron tick calls is the Go service. See 20261106120000.';

-- Returns a SECRET. Callable by postgres (pg_cron) alone: revoked from every API role below,
-- and asserted at the foot of this migration, because an rpc/cron_bearer_for reachable by anon
-- would hand out the service-role key.
CREATE OR REPLACE FUNCTION public.cron_bearer_for(p_url text, p_job text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    secret text;
BEGIN
    IF public.cron_url_is_edge_function(p_url) THEN
        -- Unchanged behaviour: may be NULL, which the caller treats as unprovisioned (quiet).
        SELECT decrypted_secret INTO secret
          FROM vault.decrypted_secrets WHERE name = 'cruise_sync_service_role_key';
        RETURN secret;
    END IF;

    SELECT decrypted_secret INTO secret
      FROM vault.decrypted_secrets WHERE name = 'sta_cron_secret';
    IF secret IS NULL OR length(secret) < 32 THEN
        -- Loud, never quiet: the URL says someone moved this job to Go, so a missing or
        -- placeholder secret is a half-done switch, and every tick would 401 with nobody told.
        RAISE EXCEPTION
            '%: the function URL points at the Go service, but vault secret sta_cron_secret '
            'is % (it must be at least 32 characters and equal the Go service''s '
            'STA_CRON_SECRET). Fix: SELECT vault.create_secret(''<value>'', ''sta_cron_secret''); '
            'or vault.update_secret. See supabase/migrations/20261106120000.',
            p_job, CASE WHEN secret IS NULL THEN 'missing' ELSE 'too short (' || length(secret) || ' chars)' END;
    END IF;
    RETURN secret;
END $$;

REVOKE ALL ON FUNCTION public.cron_bearer_for(text, text) FROM public, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.cron_url_is_edge_function(text) FROM public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. The ticks, each as its latest migration wrote it, with only the bearer changed
-- ─────────────────────────────────────────────────────────────────────────────

-- From 20261017120000.
CREATE OR REPLACE FUNCTION public.push_dispatch_tick()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    fn_url text;
    bearer text;
BEGIN
    DELETE FROM public.push_outbox
     WHERE state IN ('sent', 'cleared', 'failed') AND NOT needs_dismiss
       AND created_at < now() - interval '30 days';

    IF NOT EXISTS (SELECT 1 FROM public.push_outbox WHERE state = 'pending' AND due_at <= now())
       AND NOT EXISTS (SELECT 1 FROM public.push_outbox WHERE needs_dismiss)
       AND NOT EXISTS (SELECT 1 FROM public.push_outbox WHERE state = 'sending' AND claimed_at < now() - interval '5 minutes')
    THEN
        RETURN 'idle';
    END IF;

    SELECT decrypted_secret INTO fn_url FROM vault.decrypted_secrets WHERE name = 'push_dispatch_function_url';
    IF fn_url IS NULL THEN
        RETURN 'unprovisioned';
    END IF;
    bearer := public.cron_bearer_for(fn_url, 'push_dispatch_tick');
    IF bearer IS NULL THEN
        RETURN 'unprovisioned';
    END IF;

    PERFORM net.http_post(
        url := fn_url,
        headers := jsonb_build_object('Authorization', 'Bearer ' || bearer, 'Content-Type', 'application/json'),
        body := jsonb_build_object('trigger', 'cron'),
        timeout_milliseconds := 20000
    );
    RETURN 'dispatched';
END;
$$;

-- From 20261026130000.
CREATE OR REPLACE FUNCTION public.email_dispatch_tick()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    fn_url text;
    bearer text;
BEGIN
    DELETE FROM public.email_token WHERE expires_at < now() - interval '30 days';
    DELETE FROM public.email_outbox o
     WHERE o.state IN ('sent', 'cleared', 'skipped', 'failed')
       AND o.created_at < now() - interval '30 days';
    DELETE FROM public.agent_alert_email o
     WHERE o.state IN ('sent', 'cleared', 'failed')
       AND o.created_at < now() - interval '30 days';
    DELETE FROM public.inbound_email WHERE received_at < now() - interval '90 days';

    IF NOT EXISTS (SELECT 1 FROM public.email_outbox WHERE state = 'pending' AND due_at <= now())
       AND NOT EXISTS (SELECT 1 FROM public.email_outbox WHERE state = 'sending' AND claimed_at < now() - interval '15 minutes')
       AND NOT EXISTS (SELECT 1 FROM public.agent_alert_email WHERE state = 'pending')
       AND NOT EXISTS (SELECT 1 FROM public.agent_alert_email WHERE state = 'sending' AND claimed_at < now() - interval '15 minutes')
    THEN
        RETURN 'idle';
    END IF;

    SELECT decrypted_secret INTO fn_url FROM vault.decrypted_secrets WHERE name = 'email_dispatch_function_url';
    IF fn_url IS NULL THEN
        RETURN 'unprovisioned';
    END IF;
    bearer := public.cron_bearer_for(fn_url, 'email_dispatch_tick');
    IF bearer IS NULL THEN
        RETURN 'unprovisioned';
    END IF;

    PERFORM net.http_post(
        url := fn_url,
        headers := jsonb_build_object('Authorization', 'Bearer ' || bearer, 'Content-Type', 'application/json'),
        body := jsonb_build_object('trigger', 'cron'),
        timeout_milliseconds := 30000
    );
    RETURN 'dispatched';
END;
$$;

-- From 20261020120000.
CREATE OR REPLACE FUNCTION public.email_inbox_tick()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    fn_url text;
    bearer text;
BEGIN
    SELECT decrypted_secret INTO fn_url FROM vault.decrypted_secrets WHERE name = 'email_inbox_function_url';
    IF fn_url IS NULL THEN
        RETURN 'unprovisioned';
    END IF;
    bearer := public.cron_bearer_for(fn_url, 'email_inbox_tick');
    IF bearer IS NULL THEN
        RETURN 'unprovisioned';
    END IF;

    PERFORM net.http_post(
        url := fn_url,
        headers := jsonb_build_object('Authorization', 'Bearer ' || bearer, 'Content-Type', 'application/json'),
        body := jsonb_build_object('trigger', 'cron'),
        timeout_milliseconds := 30000
    );
    RETURN 'dispatched';
END;
$$;

-- From 20260930110000. The JWT-shape guard stays, for the Edge Function path only: it is the
-- check that caught the placeholder. The Go path is guarded inside cron_bearer_for().
CREATE OR REPLACE FUNCTION public.cruise_sync_tick()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    fn_url     text;
    bearer     text;
    request_id bigint;
BEGIN
    SELECT decrypted_secret INTO fn_url
      FROM vault.decrypted_secrets WHERE name = 'cruise_sync_function_url';

    IF fn_url IS NULL THEN
        RAISE NOTICE 'cruise_sync_tick: vault secrets absent, skipping';
        RETURN NULL;
    END IF;

    IF fn_url !~ '^https?://' THEN
        RAISE EXCEPTION
            'cruise_sync_tick: vault secret cruise_sync_function_url is not a URL '
            '(% chars, starts "%"). Expected https://<project-ref>.supabase.co/functions/v1/'
            'cruise-sync, https://<go-host>/functions/v1/cruise-sync, or '
            'http://kong:8000/functions/v1/cruise-sync locally. See supabase/README.md.',
            length(fn_url), left(fn_url, 8);
    END IF;

    bearer := public.cron_bearer_for(fn_url, 'cruise_sync_tick');
    IF bearer IS NULL THEN
        RAISE NOTICE 'cruise_sync_tick: vault secrets absent, skipping';
        RETURN NULL;
    END IF;

    IF public.cron_url_is_edge_function(fn_url)
       AND bearer !~ '^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$' THEN
        RAISE EXCEPTION
            'cruise_sync_tick: vault secret cruise_sync_service_role_key is not a JWT '
            '(% chars, starts "%"). cruise-sync sets verify_jwt = true, so the gateway rejects '
            'anything else with UNAUTHORIZED_INVALID_JWT_FORMAT before the function runs, '
            'which is what a placeholder like ''<service-role key>'' does, silently, forever. '
            'Use the project''s LEGACY service-role key (three dot-separated base64url '
            'segments), not an sb_secret_ key. Fix: SELECT vault.update_secret((SELECT id FROM '
            'vault.secrets WHERE name = ''cruise_sync_service_role_key''), ''<the real JWT>'');',
            length(bearer), left(bearer, 4);
    END IF;

    SELECT net.http_post(
        url     => fn_url,
        body    => jsonb_build_object('trigger', 'cron'),
        headers => jsonb_build_object(
            'Content-Type',  'application/json',
            'Authorization', 'Bearer ' || bearer
        ),
        timeout_milliseconds => 10000
    ) INTO request_id;

    INSERT INTO public.cruise_sync_dispatch (request_id) VALUES (request_id);

    RETURN request_id;
END $$;

REVOKE ALL ON FUNCTION public.cruise_sync_tick() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.push_dispatch_tick() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.email_dispatch_tick() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.email_inbox_tick() FROM public, anon, authenticated;

-- From 20260930110000: the weekly check that the sync happened. Its "unprovisioned" test now
-- asks cron_bearer_for(), and its hints name the Go service's answers too.
CREATE OR REPLACE FUNCTION public.cruise_sync_watchdog(
    p_window interval DEFAULT interval '25 minutes'
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    fn_url        text;
    bearer        text;
    to_go         boolean;
    d_request_id  bigint;
    d_at          timestamptz;
    r_status      integer;
    r_error       text;
    r_timed_out   boolean;
    r_found       boolean;
    stranded      integer;
    hint          text;
BEGIN
    SELECT decrypted_secret INTO fn_url
      FROM vault.decrypted_secrets WHERE name = 'cruise_sync_function_url';
    IF fn_url IS NULL THEN
        RETURN 'unprovisioned';
    END IF;
    bearer := public.cron_bearer_for(fn_url, 'cruise_sync_watchdog');
    IF bearer IS NULL THEN
        RETURN 'unprovisioned';
    END IF;
    to_go := NOT public.cron_url_is_edge_function(fn_url);

    -- ── (a) Reconcile rows stranded at 'running' ────────────────────────────────
    -- A run can throw past its finish (or its worker die), leaving a row at 'running'
    -- forever. Done BEFORE the checks below so a stranded row is not mistaken for a run.
    UPDATE public.cruise_sync_run
       SET status      = 'failed',
           finished_at = now(),
           error_code  = 'stranded',
           error_detail = 'No completion recorded. The function threw past finishRun, or the '
                          'worker died mid-run. Closed by cruise_sync_watchdog.',
           updated_at  = now()
     WHERE status = 'running'
       AND started_at < now() - interval '30 minutes';
    GET DIAGNOSTICS stranded = ROW_COUNT;

    -- ── (b) Did a tick dispatch anything at all? ────────────────────────────────
    SELECT request_id, dispatched_at INTO d_request_id, d_at
      FROM public.cruise_sync_dispatch
     WHERE dispatched_at > now() - p_window
     ORDER BY dispatched_at DESC
     LIMIT 1;

    IF d_request_id IS NULL THEN
        RAISE EXCEPTION
            'cruise_sync_watchdog: no cruise_sync_tick() dispatched a call in the last %. '
            'Either pg_cron did not run the job (check cron.job_run_details for '
            '''cruise-sync-weekly''), or the tick raised on a malformed vault secret before '
            'it got as far as dispatching: in which case its own job is already red and '
            'carries the specific message. See supabase/README.md.',
            p_window;
    END IF;

    -- ── (c) What did the function (or the gateway) say? ─────────────────────────
    SELECT status_code, error_msg, timed_out, true
      INTO r_status, r_error, r_timed_out, r_found
      FROM net._http_response
     WHERE id = d_request_id;

    IF coalesce(r_found, false) AND r_status IS NOT NULL AND r_status NOT BETWEEN 200 AND 299 THEN
        hint := CASE
            WHEN to_go AND r_status IN (401, 403) THEN
                'The Go service refused the cron bearer (401: none reached it; 403: it did '
                'not match). Vault sta_cron_secret must equal the Go service''s '
                'STA_CRON_SECRET exactly. A 403 can also be TRACK_CRUISES_API_KEY unset on '
                'the Go service, which cruise-sync reports as 403 deliberately.'
            WHEN r_status = 401 THEN
                'The gateway rejected the token. It is JWT-SHAPED (the tick''s guard passed) '
                'but not valid for this project: expired, wrong project, or the anon key '
                'rather than the LEGACY service-role key. Fix with vault.update_secret on '
                'cruise_sync_service_role_key.'
            WHEN r_status = 403 THEN
                'The function ran and refused. Most likely TRACK_CRUISES_API_KEY is unset in '
                'the Edge Function secrets, which cruise-sync reports as 403 deliberately so '
                'it is distinguishable from a budget skip.'
            WHEN to_go AND r_status = 404 THEN
                'The Go service does not serve cruise-sync at that URL. Check '
                'cruise_sync_function_url ends in /functions/v1/cruise-sync.'
            WHEN r_status = 404 THEN
                'No such function. cruise-sync is not deployed, or its '
                '[functions.cruise-sync] block is missing from supabase/config.toml; the '
                'local stack serves every directory regardless, so nothing local catches it.'
            WHEN r_status >= 500 THEN
                'The function threw. Check its logs and cruise_sync_run.error_detail.'
            ELSE 'Unexpected status.'
        END;

        RAISE EXCEPTION
            'cruise_sync_watchdog: the weekly sync call came back %. %  (request id %, '
            'dispatched %)', r_status, hint, d_request_id, d_at;
    END IF;

    IF coalesce(r_timed_out, false) THEN
        RAISE EXCEPTION
            'cruise_sync_watchdog: the weekly sync call timed out (request id %, dispatched '
            '%). pg_net gave up before the function answered; the run may still have '
            'completed, so check cruise_sync_run before re-running.', d_request_id, d_at;
    END IF;

    -- ── (d) Did the function actually record a run? ─────────────────────────────
    -- A 2xx means the call was accepted, not that anything was written: cruise-sync answers
    -- 200 even when the run failed, so the HTTP code alone learns nothing here.
    IF NOT EXISTS (
        SELECT 1 FROM public.cruise_sync_run
         WHERE trigger = 'cron'
           AND started_at > d_at - interval '2 minutes'
    ) THEN
        RAISE EXCEPTION
            'cruise_sync_watchdog: the call was dispatched and the gateway did not refuse '
            'it, but no cruise_sync_run row exists for it (request id %, dispatched %, '
            'reply %). The function did not reach the point where it opens a run. Zero rows '
            'in cruise_sync_run is ALSO what a project that has never synced looks like, '
            'which is how this went unnoticed for weeks.',
            d_request_id, d_at, coalesce(r_status::text, 'not recorded');
    END IF;

    -- Healthy. Prune the correlation keys.
    DELETE FROM public.cruise_sync_dispatch WHERE dispatched_at < now() - interval '90 days';

    RETURN CASE WHEN stranded > 0
                THEN 'ok (closed ' || stranded || ' stranded run(s))'
                ELSE 'ok' END;
END $$;

REVOKE ALL ON FUNCTION public.cruise_sync_watchdog(interval) FROM public, anon, authenticated;

-- ── ASSERTIONS ───────────────────────────────────────────────────────────────────
--
-- No API role may run anything that reads these secrets. cron_bearer_for RETURNS one, so
-- service_role is barred from it too: the ticks run as postgres.

DO $$
DECLARE
    leaked text;
BEGIN
    SELECT string_agg(p.proname || ' to ' || r.rolname, ', ') INTO leaked
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      CROSS JOIN (VALUES ('anon'), ('authenticated'), ('service_role')) AS r(rolname)
     WHERE n.nspname = 'public'
       AND (
            (p.proname = 'cron_bearer_for')
         OR (p.proname IN ('push_dispatch_tick', 'email_dispatch_tick', 'email_inbox_tick',
                           'cruise_sync_tick', 'cruise_sync_watchdog')
             AND r.rolname <> 'service_role')
       )
       AND has_function_privilege(r.rolname, p.oid, 'EXECUTE');

    IF leaked IS NOT NULL THEN
        RAISE EXCEPTION 'a cron entry point or the bearer helper is executable by an API role: %', leaked;
    END IF;

    -- The URL rule, both ways.
    IF NOT public.cron_url_is_edge_function('https://abcdefghijklmnop.supabase.co/functions/v1/cruise-sync')
       OR NOT public.cron_url_is_edge_function('http://kong:8000/functions/v1/push-dispatch')
       OR public.cron_url_is_edge_function('https://storytail-web.onrender.com/functions/v1/push-dispatch')
       OR public.cron_url_is_edge_function('http://host.docker.internal:8080/functions/v1/email-inbox')
       OR public.cron_url_is_edge_function('https://evil.example/x.supabase.co/functions/v1/a')
    THEN
        RAISE EXCEPTION 'cron_url_is_edge_function misreads a URL';
    END IF;
END $$;
