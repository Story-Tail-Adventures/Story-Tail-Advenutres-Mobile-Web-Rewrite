-- The cruise sync stops reporting green when it did nothing.
--
-- ── THE INCIDENT, AND WHICH HALF OF IT IS STILL OPEN ────────────────────────────────────
--
-- Production's cruise catalog is empty. The cause was a `vault.secrets` entry holding the
-- literal placeholder `<legacy service role key…>`, so every weekly call carried a bogus
-- Bearer token, the gateway rejected it with 401 before the function ran, and nothing was
-- written for weeks.
--
-- 20260926180000 closed the "the guard only tested presence" half: the tick now validates
-- the SHAPE of both secrets and raises on a malformed one. That is not this migration.
--
-- What is still open is the part that let it run for weeks: **three separate layers all
-- reported success the entire time.**
--
--   1. `cron.job_run_details` is green because it measures whether the STATEMENT ran.
--      `SELECT cruise_sync_tick()` returns a request id, so one row, so green. It says
--      nothing about what the HTTP call it dispatched came back with.
--   2. The tick is fire-and-forget by design (pg_net is async so a slow sync cannot hold a
--      cron worker). The reply lands in `net._http_response`, which NOTHING reads, and
--      pg_net prunes it within hours.
--   3. `cruise_sync_run` had zero rows — and zero rows is also exactly what a brand-new
--      project looks like. There is no admin UI, and the only user-visible surface is the
--      public results page, whose "empty" copy is correct for a genuinely empty catalog and
--      indistinguishable from one that never synced.
--
-- And shape is not validity. A JWT-shaped but expired, wrong-project or `anon`-role key
-- passes the regex and 401s exactly as silently as the placeholder did. A stricter regex
-- cannot fix that. Only closing the loop can.
--
-- ── WHAT CLOSES IT ──────────────────────────────────────────────────────────────────────
--
-- A second weekly job, 13 minutes behind the first, that RAISES when the sync did not
-- happen. Raising is the entire product: `cron.job_run_details` going red is the only
-- channel this system has, and a verdict written to a table nobody reads would be a fourth
-- layer reporting into the void rather than a fix.
--
-- One job catches all of: a JWT-shaped-but-invalid key, an expired key, a wrong-project
-- key, a missing TRACK_CRUISES_API_KEY (403), a `[functions.cruise-sync]` block dropped
-- from config.toml (404), a gateway change, and a run stranded at `running`.
--
-- COST: ZERO provider requests. The 401 in this incident was the SUPABASE GATEWAY, not
-- track.cruises — the function never ran, so it never called out. Everything here reads
-- local tables, so none of it touches the 100-requests-per-month budget.
--
-- ── WHY A DISPATCH TABLE, WHICH IS THE ONLY NEW STORAGE HERE ────────────────────────────
--
-- `net._http_response` carries `id, status_code, error_msg, timed_out, created` and NO url,
-- and `net.http_request_queue` holds the url only while the request is still pending. So
-- there is no way to ask "what did the cruise-sync call come back with" after the fact
-- without having kept the request id. The tick has always returned it and nothing has ever
-- stored it.
--
-- Two columns, one row a week. Deliberately NOT a verdict log: a raise rolls its own
-- transaction back, so anything the watchdog wrote about a FAILURE would vanish — which is
-- the one case worth recording. The cron log is the record.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. The correlation key
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.cruise_sync_dispatch (
    request_id    bigint      PRIMARY KEY,
    dispatched_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX cruise_sync_dispatch_recent
    ON public.cruise_sync_dispatch (dispatched_at DESC);

COMMENT ON TABLE public.cruise_sync_dispatch IS
    'One row per cruise_sync_tick() that actually dispatched an HTTP call. Exists solely so '
    'cruise_sync_watchdog() can find the matching net._http_response row, which carries no '
    'URL of its own. Not a run log: cruise_sync_run is that, and it is written by the Edge '
    'Function. A tick that raised on a bad secret, or no-opped because the vault is empty, '
    'writes nothing here — which is the absence the watchdog is looking for.';

-- Same posture as every other cruise table (20260909001124:610-620).
ALTER TABLE public.cruise_sync_dispatch ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cruise_sync_dispatch FROM anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. The tick records what it dispatched
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Byte-for-byte the body from 20260926180000 apart from the INSERT, restated in full
-- because CREATE OR REPLACE takes a whole body and because CREATE OR REPLACE also drops the
-- search_path pin, which is why it is set here rather than re-applied with ALTER.

CREATE OR REPLACE FUNCTION public.cruise_sync_tick()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
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
        -- The expected state on a laptop and on any environment nobody has provisioned.
        -- Raising here would turn every local `db reset` into a red cron job for a budget
        -- it should not be spending anyway. The watchdog makes the SAME distinction, for
        -- the same reason: absence is quiet, malformation is loud.
        RAISE NOTICE 'cruise_sync_tick: vault secrets absent, skipping';
        RETURN NULL;
    END IF;

    IF fn_url !~ '^https?://' THEN
        RAISE EXCEPTION
            -- Plain %, NOT %L: RAISE's only placeholder is %. `%L` is a format() specifier,
            -- and RAISE consumes the % then prints a stray "L".
            'cruise_sync_tick: vault secret cruise_sync_function_url is not a URL '
            '(% chars, starts "%"). Expected https://<project-ref>.supabase.co/functions/v1/'
            'cruise-sync, or http://kong:8000/functions/v1/cruise-sync locally. '
            'See supabase/README.md.',
            length(fn_url), left(fn_url, 8);
    END IF;

    IF service_key !~ '^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$' THEN
        RAISE EXCEPTION
            'cruise_sync_tick: vault secret cruise_sync_service_role_key is not a JWT '
            '(% chars, starts "%"). cruise-sync sets verify_jwt = true, so the gateway rejects '
            'anything else with UNAUTHORIZED_INVALID_JWT_FORMAT before the function runs — '
            'which is what a placeholder like ''<service-role key>'' does, silently, forever. '
            'Use the project''s LEGACY service-role key (three dot-separated base64url '
            'segments), not an sb_secret_ key. Fix: SELECT vault.update_secret((SELECT id FROM '
            'vault.secrets WHERE name = ''cruise_sync_service_role_key''), ''<the real JWT>'');',
            length(service_key), left(service_key, 4);
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

    -- NEW. Without this the reply is unfindable: net._http_response has no url column, and
    -- the queue row that did is gone once the request completes.
    INSERT INTO public.cruise_sync_dispatch (request_id) VALUES (request_id);

    RETURN request_id;
END $$;

-- `authenticated` BY NAME, not just `public`. Supabase grants EXECUTE on every new public
-- function to anon, authenticated and service_role by name, so `FROM public, anon` leaves
-- authenticated holding it — which the assertion at the foot of this migration caught
-- while this migration was being written, on cruise_sync_watchdog below. 20260909001125:109
-- already knew: it revokes from public AND from anon, authenticated, in two statements.
REVOKE ALL ON FUNCTION public.cruise_sync_tick() FROM public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. The watchdog
-- ─────────────────────────────────────────────────────────────────────────────

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
    service_key   text;
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
    SELECT decrypted_secret INTO service_key
      FROM vault.decrypted_secrets WHERE name = 'cruise_sync_service_role_key';

    -- ABSENCE IS QUIET, exactly as the tick treats it. A laptop with no vault secrets
    -- dispatches nothing, so there is nothing for this to be unhappy about, and a red cron
    -- job on every dev machine every Monday would train the eye to ignore the one that
    -- matters. Mirrors 20260926180000's posture on purpose.
    IF fn_url IS NULL OR service_key IS NULL THEN
        RETURN 'unprovisioned';
    END IF;

    -- ── (a) Reconcile rows stranded at 'running' ────────────────────────────────
    --
    -- `runSync` can throw past `finishRun` (supabase/functions/_shared/cruise/sync.ts, the
    -- scope-read error), leaving a row at status='running' forever. The table's own CHECK
    -- permits it and the comment there calls such a row "a row nobody will ever reconcile".
    -- This is who reconciles it. Done BEFORE the checks below so a stranded row cannot be
    -- mistaken for a successful run.
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
            'it got as far as dispatching — in which case its own job is already red and '
            'carries the specific message. See supabase/README.md.',
            p_window;
    END IF;

    -- ── (c) What did the gateway say? ───────────────────────────────────────────
    SELECT status_code, error_msg, timed_out, true
      INTO r_status, r_error, r_timed_out, r_found
      FROM net._http_response
     WHERE id = d_request_id;

    IF coalesce(r_found, false) AND r_status IS NOT NULL AND r_status NOT BETWEEN 200 AND 299 THEN
        -- The diagnostic the incident did not have. Each of these was reachable and silent.
        hint := CASE
            WHEN r_status = 401 THEN
                'The gateway rejected the token. It is JWT-SHAPED (the tick''s guard passed) '
                'but not valid for this project: expired, wrong project, or the anon key '
                'rather than the LEGACY service-role key. Fix with vault.update_secret on '
                'cruise_sync_service_role_key.'
            WHEN r_status = 403 THEN
                'The function ran and refused. Most likely TRACK_CRUISES_API_KEY is unset in '
                'the Edge Function secrets, which cruise-sync reports as 403 deliberately so '
                'it is distinguishable from a budget skip.'
            WHEN r_status = 404 THEN
                'No such function. cruise-sync is not deployed, or its '
                '[functions.cruise-sync] block is missing from supabase/config.toml — the '
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
    --
    -- The assertion the whole migration exists for. A 2xx means the gateway accepted the
    -- call; it does not mean anything was written. cruise-sync returns 200 even when the
    -- run status is 'failed' or 'partial', so the HTTP code alone would have learned
    -- nothing here either.
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

    -- Healthy. Prune the correlation keys; one row a week is nothing, but a table that only
    -- grows is a table someone eventually has to think about.
    DELETE FROM public.cruise_sync_dispatch WHERE dispatched_at < now() - interval '90 days';

    RETURN CASE WHEN stranded > 0
                THEN 'ok (closed ' || stranded || ' stranded run(s))'
                ELSE 'ok' END;
END $$;

REVOKE ALL ON FUNCTION public.cruise_sync_watchdog(interval) FROM public, anon, authenticated;

COMMENT ON FUNCTION public.cruise_sync_watchdog(interval) IS
    'Weekly check that the cruise sync actually happened, 13 minutes behind the tick. Quiet '
    'when the vault is unprovisioned; RAISES otherwise, because cron.job_run_details going '
    'red is the only alerting channel this system has. Costs zero provider requests: every '
    'read here is a local table. Also closes runs stranded at ''running''.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Schedule it
-- ─────────────────────────────────────────────────────────────────────────────
--
-- 09:30 Monday against the tick's 09:17. Thirteen minutes is chosen against two clocks: the
-- tick's own pg_net timeout is 10s and a full sync spends at most a handful of requests, so
-- a healthy run is finished in well under a minute; and pg_net's response retention is
-- hours, so the reply is still there to read. Far enough to avoid a false alarm, near enough
-- that net._http_response has not been pruned.

DO $$
BEGIN
    PERFORM cron.unschedule('cruise-sync-watchdog')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cruise-sync-watchdog');

    PERFORM cron.schedule(
        'cruise-sync-watchdog',
        '30 9 * * 1',
        'SELECT public.cruise_sync_watchdog();'
    );
END $$;

-- ── ASSERTIONS ───────────────────────────────────────────────────────────────────
--
-- Restated here rather than inherited: a DO block is a statement, not a constraint, and the
-- copies in earlier migrations say nothing about the two functions this one just wrote.

DO $$
DECLARE
    names    text[] := ARRAY['cruise_sync_tick', 'cruise_sync_watchdog'];
    leaked   text;
    unpinned text;
BEGIN
    SELECT string_agg(p.proname, ', ') INTO leaked
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname = ANY (names)
       AND (has_function_privilege('anon', p.oid, 'EXECUTE')
            OR has_function_privilege('authenticated', p.oid, 'EXECUTE'));

    IF leaked IS NOT NULL THEN
        RAISE EXCEPTION
            'a client role can execute the cruise sync entry points: %. Both read vault '
            'secrets and one dispatches an authenticated call as service_role.', leaked;
    END IF;

    SELECT string_agg(p.proname, ', ') INTO unpinned
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      LEFT JOIN LATERAL (
            SELECT substr(cfg, length('search_path=') + 1) AS value
              FROM unnest(coalesce(p.proconfig, ARRAY[]::text[])) cfg
             WHERE cfg LIKE 'search\_path=%'
             LIMIT 1
           ) sp ON true
     WHERE n.nspname = 'public'
       AND p.proname = ANY (names)
       AND (sp.value IS NULL
            OR btrim((string_to_array(sp.value, ','))[
                   cardinality(string_to_array(sp.value, ','))], ' "') <> 'pg_temp');

    IF unpinned IS NOT NULL THEN
        RAISE EXCEPTION
            'cruise sync entry points must end their search_path with pg_temp: %', unpinned;
    END IF;
END $$;

-- Both jobs exist and neither was clobbered. The tick's schedule is asserted too, because
-- the watchdog's window is derived from the gap between them: move one without the other
-- and the watchdog either fires before the sync could finish, or after pg_net has pruned
-- the reply it needs to read.
DO $$
DECLARE
    tick_sched     text;
    watchdog_sched text;
BEGIN
    SELECT schedule INTO tick_sched     FROM cron.job WHERE jobname = 'cruise-sync-weekly';
    SELECT schedule INTO watchdog_sched FROM cron.job WHERE jobname = 'cruise-sync-watchdog';

    IF tick_sched IS NULL OR watchdog_sched IS NULL THEN
        RAISE EXCEPTION
            'both cruise jobs must be scheduled: tick=%, watchdog=%',
            coalesce(tick_sched, '<missing>'), coalesce(watchdog_sched, '<missing>');
    END IF;

    IF tick_sched <> '17 9 * * 1' OR watchdog_sched <> '30 9 * * 1' THEN
        RAISE EXCEPTION
            'the watchdog must run AFTER the tick on the same day, close enough that '
            'net._http_response has not been pruned. tick=%, watchdog=%',
            tick_sched, watchdog_sched;
    END IF;
END $$;

COMMIT;
