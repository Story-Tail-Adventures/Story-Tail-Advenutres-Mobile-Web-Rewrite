-- Constraint invariants for the hotel search domain (migration 20260909120000).
--
-- Each of these is a failure that would be silent in application code and expensive in
-- production: a credential persisted where it outlives the incident, a visitor IP kept on a
-- public marketing route, a cache row that can never expire, or a limiter that lets a burst
-- through. Written as invariants rather than fixture counts, so a growing seed cannot make
-- them vacuous.
\set ON_ERROR_STOP on
BEGIN;

-- ── The API key must not be able to reach the database ───────────────────────
-- The provider takes its credential as a query parameter, so the client is built to attach
-- it last and derive the sanitised copy first. These constraints are what makes that
-- ordering enforceable rather than merely intended.

DO $$ BEGIN
    INSERT INTO public.hotel_api_request (id, endpoint, path, query)
    VALUES (gen_random_uuid(), 'search', '/search', '{"api_key":"leaked"}'::jsonb);
    RAISE EXCEPTION 'hotel_api_request accepted a query containing api_key';
EXCEPTION WHEN check_violation THEN NULL;
END $$;

DO $$ BEGIN
    INSERT INTO public.hotel_api_request (id, endpoint, path, query)
    VALUES (gen_random_uuid(), 'search', '/search?api_key=leaked', '{}'::jsonb);
    RAISE EXCEPTION 'hotel_api_request accepted a path containing api_key';
EXCEPTION WHEN check_violation THEN NULL;
END $$;

DO $$ BEGIN
    INSERT INTO public.hotel_search_cache
        (id, cache_key, payload_version, query_fingerprint, payload, result_count, currency, expires_at)
    VALUES (gen_random_uuid(), 'k1', 1, '{"api_key":"leaked"}'::jsonb, '{}'::jsonb, 0, 'USD', now() + interval '6 hours');
    RAISE EXCEPTION 'hotel_search_cache accepted a fingerprint containing api_key';
EXCEPTION WHEN check_violation THEN NULL;
END $$;

-- ── A visitor's IP must never be stored, hashed or not ───────────────────────
-- Data-Model classifies IP as PII. A rate counter is not a licence to keep a visitor log.

DO $$ BEGIN
    INSERT INTO public.hotel_search_rate_bucket (bucket_key, window_kind, window_start)
    VALUES ('ip:203.0.113.7', 'minute', now());
    RAISE EXCEPTION 'hotel_search_rate_bucket accepted a raw IP as a bucket key';
EXCEPTION WHEN check_violation THEN NULL;
END $$;

DO $$ BEGIN
    -- Too short to be a SHA-256: a truncated or differently-hashed key is also refused.
    INSERT INTO public.hotel_search_rate_bucket (bucket_key, window_kind, window_start)
    VALUES ('ip:abc123', 'minute', now());
    RAISE EXCEPTION 'hotel_search_rate_bucket accepted a malformed hash';
EXCEPTION WHEN check_violation THEN NULL;
END $$;

-- The three legitimate shapes are accepted.
INSERT INTO public.hotel_search_rate_bucket (bucket_key, window_kind, window_start) VALUES
    ('global',  'hour',   date_trunc('hour', now())),
    ('unknown', 'hour',   date_trunc('hour', now())),
    ('ip:' || encode(sha256('203.0.113.7pepper'::bytea), 'hex'), 'minute', date_trunc('minute', now()));

-- ── The cache must describe a real window ────────────────────────────────────

DO $$ BEGIN
    INSERT INTO public.hotel_search_cache
        (id, cache_key, payload_version, query_fingerprint, payload, result_count, currency, fetched_at, expires_at)
    VALUES (gen_random_uuid(), 'k2', 1, '{}'::jsonb, '{}'::jsonb, 0, 'USD', now(), now() - interval '1 hour');
    RAISE EXCEPTION 'hotel_search_cache accepted expires_at before fetched_at';
EXCEPTION WHEN check_violation THEN NULL;
END $$;

DO $$ BEGIN
    INSERT INTO public.hotel_search_cache
        (id, cache_key, payload_version, query_fingerprint, payload, result_count, currency, expires_at)
    VALUES (gen_random_uuid(), 'k3', 1, '{}'::jsonb, '{}'::jsonb, 0, 'usd', now() + interval '6 hours');
    RAISE EXCEPTION 'hotel_search_cache accepted a lowercase currency';
EXCEPTION WHEN check_violation THEN NULL;
END $$;

DO $$ BEGIN
    INSERT INTO public.hotel_search_cache
        (id, cache_key, payload_version, query_fingerprint, payload, result_count, currency, expires_at, lowest_rate_cents)
    VALUES (gen_random_uuid(), 'k4', 1, '{}'::jsonb, '{}'::jsonb, 0, 'USD', now() + interval '6 hours', -1);
    RAISE EXCEPTION 'hotel_search_cache accepted a negative rate';
EXCEPTION WHEN check_violation THEN NULL;
END $$;

-- ── payload_version participates in identity ─────────────────────────────────
-- Two rows may share a cache_key at different versions; one version may not be duplicated.
-- This is what makes a shape change a cold cache rather than a mixed one.
INSERT INTO public.hotel_search_cache
    (id, cache_key, payload_version, query_fingerprint, payload, result_count, currency, expires_at)
VALUES
    (gen_random_uuid(), 'shared', 1, '{}'::jsonb, '{}'::jsonb, 0, 'USD', now() + interval '6 hours'),
    (gen_random_uuid(), 'shared', 2, '{}'::jsonb, '{}'::jsonb, 0, 'USD', now() + interval '6 hours');

DO $$ BEGIN
    INSERT INTO public.hotel_search_cache
        (id, cache_key, payload_version, query_fingerprint, payload, result_count, currency, expires_at)
    VALUES (gen_random_uuid(), 'shared', 1, '{}'::jsonb, '{}'::jsonb, 0, 'USD', now() + interval '6 hours');
    RAISE EXCEPTION 'hotel_search_cache accepted a duplicate (cache_key, payload_version)';
EXCEPTION WHEN unique_violation THEN NULL;
END $$;

-- ── The config table is a singleton ──────────────────────────────────────────
DO $$ BEGIN
    INSERT INTO public.hotel_search_config (id) VALUES (true);
    RAISE EXCEPTION 'hotel_search_config accepted a second row';
EXCEPTION WHEN unique_violation THEN NULL;
END $$;

-- ── The limiter counts, and refuses past the limit ───────────────────────────
DO $$
DECLARE
    r1 record; r2 record; r3 record;
    w timestamptz := date_trunc('minute', now()) + interval '1 hour'; -- a window of our own
BEGIN
    SELECT * INTO r1 FROM public.hotel_search_take_token('global', 'minute', w, 2);
    SELECT * INTO r2 FROM public.hotel_search_take_token('global', 'minute', w, 2);
    SELECT * INTO r3 FROM public.hotel_search_take_token('global', 'minute', w, 2);
    IF NOT (r1.hits = 1 AND r1.allowed) THEN RAISE EXCEPTION 'first token: % / %', r1.hits, r1.allowed; END IF;
    IF NOT (r2.hits = 2 AND r2.allowed) THEN RAISE EXCEPTION 'second token: % / %', r2.hits, r2.allowed; END IF;
    IF NOT (r3.hits = 3 AND NOT r3.allowed) THEN RAISE EXCEPTION 'third token: % / %', r3.hits, r3.allowed; END IF;
END $$;

ROLLBACK;
