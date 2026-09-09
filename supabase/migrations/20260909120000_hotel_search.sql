-- Hotel search — live SerpApi Google Hotels lookups for Screen 2.0.4 (Hotels mode). P2.
--
-- THIS IS THE ONE PLACE THE ARCHITECTURE INVERTS, AND IT IS DELIBERATE.
-- docs/Free-Travel-APIs.md §10.1 says sync, don't proxy — pull content once, store it,
-- render from Postgres. That reasoning holds for everything it was written about: a resort's
-- photographs and description are the same at 3pm as at 3am. It does not hold here. A visitor
-- asks "what is available in Aruba, 12–19 August, for two" and the answer is a function of the
-- dates, so there is nothing static to mirror. §10.1's own escape hatch covers it: "a
-- request-time proxy is still right for the interactive bits."
--
-- What that costs, and therefore what these tables are for: the provider's free tier is
-- 250 searches a MONTH at 50 an hour, and unlike a nightly sync the spend is driven by
-- strangers. Hence a response cache that is checked before anything is spent, a rate limiter
-- that is checked before that, and an append-only ledger so month-to-date is a fact rather
-- than an estimate.
--
-- THE ANON-READ QUESTION 20260909001124 DEFERRED "to the search work" IS ANSWERED HERE, AND
-- THE ANSWER IS NEITHER OF ITS TWO CANDIDATES.
--   * An anon SELECT gated on a published flag was about reading a synced catalog. This
--     feature has no catalog to read — there is no hotel table, by design.
--   * "A service-role read from a Next.js server component, which is how
--     web/lib/onboarding/api.ts already talks to the backend" mis-states that file, which
--     says the opposite in bold: the caller's own token is forwarded, never the service-role
--     key, and web/lib/env.ts restates that the service-role key must never appear in web/.
-- So: no anon policy on anything, RLS on with zero policies, and the EDGE FUNCTION is the
-- boundary rather than a table. It presents the anon key to satisfy the gateway and a
-- server-only shared secret to prove it is our own server — the anon key is inlined into the
-- browser bundle and authenticates nobody. See supabase/functions/hotel-search/index.ts.
--
-- NOTHING HERE IS IN PCI SCOPE. No PAN, no Stripe token, no card FK. The rates are public
-- retail prices for display, not amounts anyone is charged — BRD §10.5 forbids charging a
-- client at all. The audit-pci skill should read this paragraph and move on.

-- ─────────────────────────────────────────────────────────────────────────────
-- Enums. Three vocabularies, all of them OURS — which is why they are enums at all. Per
-- Data-Model §24.0 rule 4, anything belonging to the provider stays `text`.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TYPE public.hotel_search_endpoint AS ENUM ('search', 'account');

CREATE TYPE public.hotel_search_outcome AS ENUM (
    'served_live',
    'served_cache',
    'served_stale',
    'rate_limited',
    'budget_exhausted',
    'provider_unavailable',
    'rejected'
);

CREATE TYPE public.hotel_rate_window AS ENUM ('minute', 'hour', 'day');

-- ─────────────────────────────────────────────────────────────────────────────
-- The response cache. Six hours by default, and it is the throttle as much as the cache:
-- it is consulted before the budget is touched, so a crawler replaying the same URL is
-- stopped by an index lookup rather than by a bill.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.hotel_search_cache (
    id                 uuid        PRIMARY KEY,
    cache_key          text        NOT NULL,
    -- Bumped in map.ts whenever the normalised shape changes, and part of the unique index,
    -- so a deploy gets a COLD cache rather than a mixed one. Without it a renamed field is
    -- read back from old-shaped JSON and either throws or silently blanks a public page.
    payload_version    integer     NOT NULL,
    -- The canonical query struct the key was hashed from. Kept so a support question is
    -- answerable without reversing a hash, and so a canonicalisation bug is DETECTABLE: a
    -- read recomputes it and treats a mismatch as a miss. Collisions are not the risk here;
    -- drift is.
    query_fingerprint  jsonb       NOT NULL,
    provider           text        NOT NULL DEFAULT 'serpapi_google_hotels',
    -- NORMALISED, NOT RAW — a deliberate departure from Data-Model §24.0 rule 1, which says
    -- to keep the provider's payload beside the mapped row so a mapping bug is a
    -- re-derivation rather than a re-fetch. That rule is right for a durable catalog and
    -- wrong for a six-hour row about dated prices: re-deriving from a stale body produces a
    -- stale answer, which is worse than the fetch it saved. And decisively — the raw body
    -- carries prices[].source, the booking-site logos and their links. Free-Travel-APIs
    -- §1.3.5 forbids putting another business on this site, and the surest way never to
    -- render something is never to store it.
    payload            jsonb       NOT NULL,
    result_count       integer     NOT NULL,
    currency           char(3)     NOT NULL,
    -- Denormalised out of the payload so a price sort or band filter answers without
    -- parsing jsonb. Integer cents per CLAUDE.md rule 5.
    lowest_rate_cents  bigint,
    highest_rate_cents bigint,
    fetched_at         timestamptz NOT NULL DEFAULT now(),
    -- A COLUMN, not a computed TTL, because it buys two things: an index-backed sweep, and
    -- stale-while-exhausted — when the month's budget is gone, an expired-but-recent row
    -- with an honest "prices as of…" line beats an empty page, and is arguably more
    -- compliant, since it makes the indicative nature explicit.
    expires_at         timestamptz NOT NULL,
    created_at         timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT hotel_search_cache_window    CHECK (expires_at > fetched_at),
    CONSTRAINT hotel_search_cache_count     CHECK (result_count >= 0),
    CONSTRAINT hotel_search_cache_currency  CHECK (currency = upper(currency) AND currency ~ '^[A-Z]{3}$'),
    CONSTRAINT hotel_search_cache_low       CHECK (lowest_rate_cents IS NULL OR lowest_rate_cents >= 0),
    CONSTRAINT hotel_search_cache_spread    CHECK (
        highest_rate_cents IS NULL OR lowest_rate_cents IS NULL OR highest_rate_cents >= lowest_rate_cents
    ),
    -- The provider takes its credential as a QUERY PARAMETER, which collides head-on with
    -- this codebase's rule that a key never appears in a URL. The client is built so the key
    -- is attached last and the sanitised copy taken before — but a comment is not a control.
    -- This is: the database refuses to be the place the mistake outlives the incident.
    CONSTRAINT hotel_search_cache_no_key    CHECK (NOT (query_fingerprint ? 'api_key'))
);

CREATE UNIQUE INDEX hotel_search_cache_key
    ON public.hotel_search_cache (cache_key, payload_version);

CREATE INDEX hotel_search_cache_expiry
    ON public.hotel_search_cache (expires_at);

-- ─────────────────────────────────────────────────────────────────────────────
-- The ledger. One row per HTTP attempt, append-only, mirroring cruise_api_request.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.hotel_api_request (
    id                 uuid    PRIMARY KEY,
    provider           text    NOT NULL DEFAULT 'serpapi_google_hotels',
    endpoint           public.hotel_search_endpoint NOT NULL,
    path               text    NOT NULL,
    -- SANITISED. Request parameters only, never headers, and never the API key.
    query              jsonb   NOT NULL DEFAULT '{}'::jsonb,
    cache_key          text,
    -- NULL when the request never completed — a timeout or a DNS failure still cost us the
    -- attempt as far as the provider may be concerned, so it is still a row.
    status_code        integer,
    rows_returned      integer,
    duration_ms        integer,
    provider_search_id text,
    -- From account.json, which is free and does not count against quota. quota_remaining is
    -- the authoritative figure; our own month-to-date count is only a pre-flight guard.
    quota_limit        integer,
    quota_remaining    integer,
    quota_month_usage  integer,
    quota_this_hour    integer,
    quota_hour_limit   integer,
    quota_observed_at  timestamptz,
    error_code         text,
    -- ALREADY REDACTED at construction, not here. It reaches five readers and redacting at
    -- one of them protects one of them.
    error_detail       text,
    created_at         timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT hotel_api_request_rows     CHECK (rows_returned IS NULL OR rows_returned >= 0),
    CONSTRAINT hotel_api_request_duration CHECK (duration_ms IS NULL OR duration_ms >= 0),
    CONSTRAINT hotel_api_request_no_key   CHECK (NOT (query ? 'api_key')),
    CONSTRAINT hotel_api_request_no_key_path CHECK (path NOT LIKE '%api_key%')
);

-- Partial, unlike the cruise equivalent: account.json is free and must never be counted as
-- spend. Both budget reads — month-to-date and hour-to-date — scan this one index.
CREATE INDEX hotel_api_request_spent
    ON public.hotel_api_request (created_at DESC)
    WHERE endpoint = 'search';

CREATE INDEX hotel_api_request_quota
    ON public.hotel_api_request (quota_observed_at DESC)
    WHERE quota_remaining IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- Rate limiting. There is no application-level limiter anywhere else in this codebase,
-- because nothing else was both callable by strangers and metered per call.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.hotel_search_rate_bucket (
    bucket_key   text                     NOT NULL,
    window_kind  public.hotel_rate_window NOT NULL,
    window_start timestamptz              NOT NULL,
    hits         integer                  NOT NULL DEFAULT 0,
    created_at   timestamptz              NOT NULL DEFAULT now(),

    PRIMARY KEY (bucket_key, window_kind, window_start),
    CONSTRAINT hotel_search_rate_bucket_hits CHECK (hits >= 0),
    -- THE RAW IP MUST NEVER LAND HERE. The function hashes it with a pepper before it ever
    -- leaves Deno; a peppered SHA-256 is 64 hex characters. Data-Model classifies IP as PII,
    -- and a counter is not a licence to keep a visitor log on a public marketing route. The
    -- two unhashed keys are the global bucket and the no-header fallback.
    CONSTRAINT hotel_search_rate_bucket_key CHECK (
        bucket_key IN ('global', 'unknown') OR bucket_key ~ '^ip:[0-9a-f]{64}$'
    )
);

CREATE INDEX hotel_search_rate_bucket_sweep
    ON public.hotel_search_rate_bucket (window_start);

-- Increment and test in ONE statement.
--
-- A SELECT followed by an UPDATE races: a burst of parallel requests all read the same
-- pre-increment value and all decide they are under the limit, which is exactly the traffic
-- shape a limiter exists to stop. INSERT … ON CONFLICT DO UPDATE … RETURNING is atomic.
--
-- Postgres rather than an in-memory Map because edge_runtime is per-worker: a counter in an
-- isolate is per-isolate and vanishes on cold start. The database is the only state the
-- function already shares.
CREATE OR REPLACE FUNCTION public.hotel_search_take_token(
    p_bucket_key   text,
    p_window_kind  public.hotel_rate_window,
    p_window_start timestamptz,
    p_limit        integer
) RETURNS TABLE (hits integer, allowed boolean)
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
    INSERT INTO public.hotel_search_rate_bucket AS b
        (bucket_key, window_kind, window_start, hits)
    VALUES (p_bucket_key, p_window_kind, p_window_start, 1)
    ON CONFLICT (bucket_key, window_kind, window_start)
        DO UPDATE SET hits = b.hits + 1
    RETURNING b.hits, b.hits <= p_limit;
$$;

REVOKE ALL ON FUNCTION public.hotel_search_take_token(
    text, public.hotel_rate_window, timestamptz, integer
) FROM public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Operational config. The free tier is a PARAMETER, not a constant compiled into the
-- handler — the cruise_sync_scope lesson. Widening after a plan upgrade is an UPDATE, not a
-- deploy.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.hotel_search_config (
    id                  boolean     PRIMARY KEY DEFAULT true,
    enabled             boolean     NOT NULL DEFAULT true,
    monthly_ceiling     integer     NOT NULL DEFAULT 200,
    hourly_ceiling      integer     NOT NULL DEFAULT 40,
    cache_ttl_seconds   integer     NOT NULL DEFAULT 21600,
    cache_grace_hours   integer     NOT NULL DEFAULT 72,
    rate_per_minute     integer     NOT NULL DEFAULT 6,
    rate_per_hour       integer     NOT NULL DEFAULT 30,
    rate_per_day        integer     NOT NULL DEFAULT 60,
    global_per_hour     integer     NOT NULL DEFAULT 40,
    updated_at          timestamptz NOT NULL DEFAULT now(),

    -- One row, forever. The boolean primary key defaulting to true is the standard trick.
    CONSTRAINT hotel_search_config_singleton CHECK (id),
    CONSTRAINT hotel_search_config_positive CHECK (
        monthly_ceiling > 0 AND hourly_ceiling > 0 AND cache_ttl_seconds > 0
        AND cache_grace_hours >= 0 AND rate_per_minute > 0 AND rate_per_hour > 0
        AND rate_per_day > 0 AND global_per_hour > 0
    )
);

-- The ceilings sit BELOW the plan limits on purpose. 200 of 250 a month and 40 of 50 an
-- hour; the reserve is for the inquiry step that follows this one — a visitor clicking a
-- hotel needs a property-details fetch, which is another billable search — plus manual
-- verification. Same argument as the cruise sync holding 10 of 100 back for quote-time
-- fetches: a client acting on intent is worth more than a background refresh.
INSERT INTO public.hotel_search_config (id) VALUES (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- Access posture: RLS on, zero policies, no grants to a client role. Load-bearing rather
-- than decorative, because config.toml sets auto_expose_new_tables = true.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE t text;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'hotel_search_cache',
        'hotel_api_request',
        'hotel_search_rate_bucket',
        'hotel_search_config'
    ]
    LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    END LOOP;
END $$;

-- Assert the posture rather than assume it, exactly as 20260909001124 does. If a future
-- migration or a config change hands these tables to a client role, this is where it gets
-- caught — at deploy time, not by a reviewer noticing.
DO $$
DECLARE
    leaked text;
BEGIN
    SELECT string_agg(DISTINCT table_name, ', ')
      INTO leaked
      FROM information_schema.role_table_grants
     WHERE table_schema = 'public'
       AND grantee IN ('anon', 'authenticated')
       AND table_name LIKE 'hotel%';

    IF leaked IS NOT NULL THEN
        RAISE EXCEPTION
            'Hotel search tables still grant privileges to anon or authenticated: %',
            leaked;
    END IF;
END $$;
