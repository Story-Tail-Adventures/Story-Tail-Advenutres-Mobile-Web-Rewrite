-- cruise_sync_tick() stops trusting a secret just because it is present. P2.
--
-- WHAT THIS FIXES, MEASURED IN PRODUCTION ON 2026-09-26. `cruise_sailing` had zero rows and
-- always had. The weekly job had run at least twice (2026-09-14, 2026-09-21), `cron.job_run_details`
-- recorded `succeeded` for both, and every one of them 401'd at the gateway:
--
--     status_code 401
--     {"code":"UNAUTHORIZED_INVALID_JWT_FORMAT",
--      "message":"Auth header is not 'Bearer {token}'"}
--
-- The Vault secret `cruise_sync_service_role_key` did not hold a key. It held a TEMPLATE
-- PLACEHOLDER — 32 characters, opening `<leg`, containing spaces, not JWT-shaped — of the kind
-- supabase/README.md prints as `'<service-role key>'` in the very `vault.create_secret` call an
-- operator copies. So `'Bearer ' || service_key` produced a header with spaces in it, and the
-- gateway rejected the request before the function ran.
--
-- THE OLD GUARD TESTED PRESENCE, AND PRESENCE WAS NEVER THE QUESTION. The NULL check below is
-- deliberate and stays exactly as it was: a laptop with no secrets should schedule a job that
-- quietly does nothing rather than turn every `supabase db reset` into a red cron job for a
-- budget it should not be spending. But "absent" and "provisioned correctly" are not the only
-- two states, and the third one — provisioned with garbage — passed a NULL check and then
-- failed somewhere nobody was looking.
--
-- WHY NOTHING SURFACED IT. Three layers each independently reported success:
--
--   1. `cron.job_run_details` says `succeeded` because it measures whether the STATEMENT ran.
--      `SELECT public.cruise_sync_tick()` returns a request id, so one row, so green. It says
--      nothing about what the HTTP call it dispatched came back with.
--   2. The tick is fire-and-forget on purpose (`net.http_post` is async so a slow sync cannot
--      hold a cron worker). The reply lands in `net._http_response`, which nothing reads, and
--      pg_net prunes it — so by the time anyone looks, usually only the last attempt survives.
--   3. `/explore/results?mode=cruises` renders "No sailings on the books for that yet." That
--      copy is CORRECT for an empty catalog and indistinguishable from one that is empty because
--      the sync has never succeeded.
--
-- This is the third instance of one shape on this project: a config value that is present but
-- wrong, behind a check that only tests presence, failing into a UI state that reads as
-- legitimate emptiness. `STA_HOTEL_SEARCH_TOKEN` was the first (absent everywhere, cruise search
-- silently "unavailable"); SERPAPI_API_KEY's un-rotated value was the second. The answer is the
-- same each time: make the guard test the PROPERTY THE CALLER DEPENDS ON, not the field's
-- existence.
--
-- ── WHY THIS ONE RAISES, WHEN THE NULL CHECK RETURNS ─────────────────────────────
--
-- Absence is a legitimate state, so it gets a NOTICE and a NULL. Malformation is not: no
-- environment ever wants a secret that cannot possibly authenticate, and the cost of being
-- wrong about that is a year of green cron rows over an empty catalog. Raising makes the
-- weekly job go RED in `cron.job_run_details`, which is the signal that was missing.
--
-- It cannot fire on a laptop that simply has not been provisioned: that database has no secret
-- at all and leaves through the NULL branch above. To reach a RAISE here you must have run
-- `vault.create_secret` with something that is not a key, which is always a mistake worth
-- stopping on.
--
-- ── WHY JWT-SHAPED, AND NOT MERELY "NOT A PLACEHOLDER" ───────────────────────────
--
-- `cruise-sync` sets `verify_jwt = true`, so the gateway parses this value as a JWT before the
-- function is reached. A three-segment base64url string is exactly what survives that, and it
-- is the property the call actually depends on — which is why the test is shaped like the
-- gateway's, not like a blocklist of `<`-wrapped placeholders. It also rejects, for free, the
-- NEW-FORMAT `sb_secret_…` keys: those are not JWTs, the gateway will not take one here, and a
-- tick that fails on Monday morning is strictly worse than a migration that says so now. If
-- Supabase ever accepts the new format on a `verify_jwt` function, this regex is the one line
-- to change, and the error message below names itself so the next reader finds it.
--
-- The URL gets the same treatment for the same reason, one class cheaper: `net.http_post`
-- against a non-URL fails in pg_net's own worker, off to the side, with the same silence.

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
        -- Unchanged, and deliberately so. This is the expected state on a laptop and on any
        -- environment nobody has provisioned, and raising here would turn every local
        -- `db reset` into a red cron job for a budget it should not be spending anyway.
        RAISE NOTICE 'cruise_sync_tick: vault secrets absent, skipping';
        RETURN NULL;
    END IF;

    -- ── THE SECRETS ARE PRESENT. ARE THEY USABLE? ────────────────────────────────
    --
    -- Everything from here down is new. Note both messages quote the OFFENDING SHAPE and never
    -- the value: these run in a cron log that is not a secret store, and a guard that leaks the
    -- credential it is validating would be a poor trade for a clearer error.

    IF fn_url !~ '^https?://' THEN
        RAISE EXCEPTION
            -- Plain %, NOT %L: RAISE's only placeholder is %. `%L` is a format() specifier,
            -- and RAISE consumes the % then prints a stray "L" — which is precisely what the
            -- first version of this migration did (`starts <legL`). Quote by hand.
            'cruise_sync_tick: vault secret cruise_sync_function_url is not a URL '
            '(% chars, starts "%"). Expected https://<project-ref>.supabase.co/functions/v1/'
            'cruise-sync, or http://kong:8000/functions/v1/cruise-sync locally. '
            'See supabase/README.md.',
            length(fn_url), left(fn_url, 8);
    END IF;

    IF service_key !~ '^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$' THEN
        RAISE EXCEPTION
            -- Plain %, not %L. See the note on the URL raise above.
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

    RETURN request_id;
END $$;

-- CREATE OR REPLACE drops the pin that the agent_read_surface migration set with ALTER
-- FUNCTION, so it is restated in the body above rather than re-applied here — and that
-- migration's schema-wide assertion is what would have caught it if it were not. Same reason
-- its header gives for being schema-wide rather than a list: handle_new_user() lost its pin
-- three times that way.

REVOKE EXECUTE ON FUNCTION public.cruise_sync_tick() FROM public, anon;

COMMENT ON FUNCTION public.cruise_sync_tick() IS
    'Weekly pg_cron entry point for the cruise sync. No-ops quietly when the Vault secrets are '
    'absent (a laptop), and RAISES when they are present but unusable — a placeholder key 401s '
    'at the gateway and leaves cron reporting success over an empty catalog. See '
    'supabase/README.md.';

-- ── ASSERTIONS ───────────────────────────────────────────────────────────────────

-- The guard is only worth having if it actually rejects the thing that got us here. Both
-- probes run the regex against literals rather than against Vault, so this passes identically
-- on a laptop with no secrets and on production with real ones.
DO $$
DECLARE
    jwt_re CONSTANT text := '^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$';
BEGIN
    -- The exact class of value found in production, plus the README's own placeholder.
    IF '<service-role key>'           ~ jwt_re
       OR '<legacy service-role key>' ~ jwt_re
       OR 'sb_secret_abc123'          ~ jwt_re
       OR ''                          ~ jwt_re
    THEN
        RAISE EXCEPTION
            'cruise_sync_tick guard is not strict enough: a placeholder or sb_secret_ key '
            'satisfies the JWT test, so the 401 this migration exists to prevent can recur.';
    END IF;

    -- ...and does NOT reject a real one. A service-role JWT is three base64url segments; this
    -- literal is structurally a JWT and carries no key material.
    IF NOT ('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.c2lnbmF0dXJl'
            ~ jwt_re)
    THEN
        RAISE EXCEPTION
            'cruise_sync_tick guard is TOO strict: it rejects a well-formed service-role JWT, '
            'which would take the weekly sync down rather than letting it run.';
    END IF;
END $$;

-- The pin, asserted from the catalog rather than trusted from the text above, because a
-- CREATE OR REPLACE that forgets it is exactly how the other seven lost theirs.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname = 'cruise_sync_tick'
           AND p.proconfig::text LIKE '%search_path=public, pg_temp%')
    THEN
        RAISE EXCEPTION
            'cruise_sync_tick lost its search_path pin in this replace; the agent_read_surface '
            'migration requires every SECURITY DEFINER function in public to end its '
            'search_path with pg_temp.';
    END IF;
END $$;
