-- Access posture for the hotel search domain.
--
-- The whole feature rests on one claim: these tables are unreachable by a client role, and
-- the Edge Function — not a policy — is the boundary. That claim is only worth as much as
-- this file. Mirrors rls_cruise_catalog.sql.
\set ON_ERROR_STOP on
BEGIN;

-- ── No grants to anon or authenticated, on any hotel table ───────────────────
-- Load-bearing rather than decorative: config.toml sets auto_expose_new_tables = true, so a
-- table added without the REVOKE would be served by PostgREST.
DO $$
DECLARE leaked text;
BEGIN
    SELECT string_agg(DISTINCT table_name || ' (' || grantee || ':' || privilege_type || ')', ', ')
      INTO leaked
      FROM information_schema.role_table_grants
     WHERE table_schema = 'public'
       AND grantee IN ('anon', 'authenticated')
       AND table_name LIKE 'hotel%';
    IF leaked IS NOT NULL THEN
        RAISE EXCEPTION 'hotel tables grant privileges to a client role: %', leaked;
    END IF;
END $$;

-- ── RLS enabled everywhere, with deliberately zero policies ──────────────────
DO $$
DECLARE unprotected text;
BEGIN
    SELECT string_agg(c.relname, ', ')
      INTO unprotected
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relname LIKE 'hotel%'
       AND c.relkind = 'r'
       AND NOT c.relrowsecurity;
    IF unprotected IS NOT NULL THEN
        RAISE EXCEPTION 'hotel tables without RLS enabled: %', unprotected;
    END IF;
END $$;

DO $$
DECLARE policied text;
BEGIN
    SELECT string_agg(DISTINCT tablename, ', ')
      INTO policied
      FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename LIKE 'hotel%';
    IF policied IS NOT NULL THEN
        -- Not a style preference: a policy here would mean something other than the Edge
        -- Function can reach this data, which is the decision the migration header settles.
        RAISE EXCEPTION 'hotel tables have policies, so something other than the function can read them: %', policied;
    END IF;
END $$;

-- ── The limiter RPC is not callable by a client role ─────────────────────────
-- It is SECURITY DEFINER; if anon could execute it, anon could inflate anyone's bucket.
DO $$
DECLARE grantee_name text;
BEGIN
    FOREACH grantee_name IN ARRAY ARRAY['anon', 'authenticated']
    LOOP
        IF has_function_privilege(
            grantee_name,
            'public.hotel_search_take_token(text, public.hotel_rate_window, timestamptz, integer)',
            'EXECUTE'
        ) THEN
            RAISE EXCEPTION 'hotel_search_take_token is executable by %', grantee_name;
        END IF;
    END LOOP;
END $$;

-- ── An anon session reads nothing, even with rows present ────────────────────
-- set_config(..., true) is transaction-local, which is exactly why this is inside BEGIN:
-- run as separate psql statements it would silently test nothing.
INSERT INTO public.hotel_search_cache
    (id, cache_key, payload_version, query_fingerprint, payload, result_count, currency, expires_at)
VALUES (gen_random_uuid(), 'rls-probe', 1, '{}'::jsonb, '{}'::jsonb, 3, 'USD', now() + interval '6 hours');

DO $$
DECLARE visible integer;
BEGIN
    SET LOCAL ROLE anon;
    BEGIN
        SELECT count(*) INTO visible FROM public.hotel_search_cache;
        RESET ROLE;
        RAISE EXCEPTION 'anon could read hotel_search_cache (% rows)', visible;
    EXCEPTION WHEN insufficient_privilege THEN
        RESET ROLE;
    END;
END $$;

ROLLBACK;
