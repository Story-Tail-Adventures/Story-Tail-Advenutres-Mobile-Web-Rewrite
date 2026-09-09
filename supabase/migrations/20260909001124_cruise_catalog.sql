-- Cruise catalog — provider-sourced cruise content (Data-Model §24). P2.
--
-- The tables Free-Travel-APIs.md §10.1 names: cruise_line, ship, sailing, port_call, plus
-- the machinery that keeps a metered feed honest. §1.0 fixes the scope — cruise line, ship,
-- itinerary (ports and sailing dates), price optional, no availability, no booking — and
-- §10.1 fixes the shape: a scheduled sync into Postgres, never a request-time proxy.
--
-- WHAT THE PROVIDER'S FREE TIER MAKES POSSIBLE, because it explains the odd bits below.
-- track.cruises BASIC is 100 requests/month at 10 rows/request — 1,000 rows/month — against
-- a sailing inventory of order 100,000 rows. Mirroring sailings would take about eight years,
-- so this schema is built to hold the reference catalogue (which three unpaginated requests
-- refresh completely) and to hold sailings as and when quota allows. That is why
-- cruise_sync_scope exists, why it ships with sailing scopes disabled, and why every request
-- is written to a ledger.
--
-- FOUR RULES FROM §10.1, each visible in the DDL:
--   1. Raw payload beside the normalised row  -> provider_payload jsonb everywhere.
--   2. Provider ids are external references   -> own uuid PK + (provider, provider_key).
--   3. Curated wins over synced, as a layer   -> slug / display_order / is_booked are OURS.
--   4. Provider vocabularies stay text        -> company, locale, cabin_code are not enums.
--
-- NOT IN PCI SCOPE. No PAN, no Stripe token, no card FK. The prices here are supplier fares
-- for display and quoting; BRD §10.5 forbids charging a client anything at all. audit-pci
-- should read this header and move on.
--
-- Money is bigint cents plus char(3) currency (rule 5). Ids are UUIDv7 supplied by the
-- caller (rule 6) — no defaults, same as every other table in this schema.

-- ─────────────────────────────────────────────────────────────────────────────
-- Enums. Only the three vocabularies this platform owns; see rule 4 above.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TYPE public.cruise_sync_endpoint AS ENUM (
    'cruise_lines', 'filter_options', 'coverage', 'ships', 'ports', 'cruises', 'cruise_detail'
);
CREATE TYPE public.cruise_sync_status   AS ENUM ('running', 'ok', 'partial', 'skipped', 'failed');
CREATE TYPE public.cruise_sync_trigger  AS ENUM ('cron', 'manual');

-- ─────────────────────────────────────────────────────────────────────────────
-- 24.1 cruise_line
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.cruise_line (
    id                  uuid PRIMARY KEY,
    slug                text NOT NULL,
    name                text NOT NULL,
    supplier_id         uuid REFERENCES public.supplier(id),
    display_order       integer NOT NULL DEFAULT 0,
    is_booked           boolean NOT NULL DEFAULT false,
    ship_count          integer,
    sailing_count       integer,
    destination_count   integer,
    earliest_departure  date,
    latest_departure    date,
    destinations        text[] NOT NULL DEFAULT '{}',
    locales             text[] NOT NULL DEFAULT '{}',
    provider            text,
    provider_key        text,
    provider_payload    jsonb,
    provider_updated_at timestamptz,
    synced_at           timestamptz,
    first_seen_at       timestamptz NOT NULL DEFAULT now(),
    last_seen_at        timestamptz,
    archived_at         timestamptz,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    CHECK (slug = lower(slug) AND slug ~ '^[a-z0-9-]+$'),
    -- A provenance pair is all-or-nothing. Half of it means a row that claims to come from
    -- a feed but cannot be matched back to one, which no upsert can ever reconcile.
    CHECK ((provider IS NULL) = (provider_key IS NULL)),
    CHECK (latest_departure IS NULL OR earliest_departure IS NULL
           OR latest_departure >= earliest_departure)
);

CREATE UNIQUE INDEX cruise_line_slug     ON public.cruise_line (slug);
CREATE UNIQUE INDEX cruise_line_provider ON public.cruise_line (provider, provider_key)
    WHERE provider IS NOT NULL;
CREATE INDEX cruise_line_booked ON public.cruise_line (is_booked, display_order)
    WHERE archived_at IS NULL;

COMMENT ON TABLE public.cruise_line IS
    'A cruise line as synced provider content plus an editorial layer (Data-Model §24.1). '
    'Not public-readable: see the RLS block at the foot of this migration.';

COMMENT ON COLUMN public.cruise_line.slug IS
    'OURS, not the provider''s, and the provider never writes it. web/content/public/'
    'cruise-lines.ts already ships eight URL-stable slugs; track.cruises agrees on four and '
    'disagrees on three (celebrity-cruises/disney-cruise-line/ncl vs celebrity/disney/'
    'norwegian). Mapping happens in _shared/cruise/map.ts so the URL never moves.';

COMMENT ON COLUMN public.cruise_line.is_booked IS
    'True for a line Story-Tail actually books — the "LINES WE BOOK" row on screen 2.0.9. '
    'Editorial, never synced. Virgin Voyages is the proof this column is needed: Gyasi '
    'books it and track.cruises has no coverage for it at all, so it can only ever exist '
    'here as a curated row with a null provider.';

COMMENT ON COLUMN public.cruise_line.supplier_id IS
    'Optional link to the commission-and-payment record. supplier.kind already has a '
    'cruise_line value, but supplier is Internal plumbing (default_commission_pct, '
    'payment_portal_url) with a lookup-table posture; this is catalog content on a refresh '
    'cadence. Different things, different sensitivity, so: a FK, not a projection.';

COMMENT ON COLUMN public.cruise_line.first_seen_at IS
    'DEFAULT now() and NEVER written by the sync, which is what makes it mean "first". '
    'PostgREST builds an upsert''s DO UPDATE SET from the keys actually present in the '
    'payload, so a column the mapper omits keeps its stored value on conflict and takes the '
    'default on insert. Putting it in the payload would rewrite it to "now" on every run.';

COMMENT ON COLUMN public.cruise_line.last_seen_at IS
    'Last sync that still saw this row in the feed. Drives archival — a line that stops '
    'being returned is soft-archived (§20.1), never deleted, because a Trip may reference '
    'a sailing under it.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 24.2 cruise_ship
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.cruise_ship (
    id                  uuid PRIMARY KEY,
    cruise_line_id      uuid NOT NULL REFERENCES public.cruise_line(id),
    name                text NOT NULL,
    slug                text,
    sailing_count       integer,
    earliest_departure  date,
    latest_departure    date,
    provider            text,
    provider_key        text,
    provider_payload    jsonb,
    provider_updated_at timestamptz,
    synced_at           timestamptz,
    first_seen_at       timestamptz NOT NULL DEFAULT now(),
    last_seen_at        timestamptz,
    archived_at         timestamptz,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    CHECK (slug IS NULL OR (slug = lower(slug) AND slug ~ '^[a-z0-9-]+$')),
    CHECK ((provider IS NULL) = (provider_key IS NULL))
);

CREATE UNIQUE INDEX cruise_ship_line_name ON public.cruise_ship (cruise_line_id, name);
CREATE UNIQUE INDEX cruise_ship_provider  ON public.cruise_ship (provider, provider_key)
    WHERE provider IS NOT NULL;

COMMENT ON TABLE public.cruise_ship IS
    'A ship in a line''s fleet with its own coverage window (Data-Model §24.2). Filter input '
    'for the screen 2.3.4 rail: cruise line, ship, ports, length, departure port.';

COMMENT ON COLUMN public.cruise_ship.provider_key IS
    'The provider identifies ships by NAME, not by id — /ships returns {ship_name, company, '
    'sailing_count}. So this holds "<company>:<ship_name>", which is what makes the upsert '
    'idempotent across runs.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 24.3 cruise_port
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.cruise_port (
    id                  uuid PRIMARY KEY,
    name                text NOT NULL,
    sailing_count       integer,
    latitude            numeric(9,6),
    longitude           numeric(9,6),
    provider            text,
    provider_key        text,
    provider_payload    jsonb,
    provider_updated_at timestamptz,
    synced_at           timestamptz,
    first_seen_at       timestamptz NOT NULL DEFAULT now(),
    last_seen_at        timestamptz,
    archived_at         timestamptz,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    CHECK ((provider IS NULL) = (provider_key IS NULL)),
    CHECK (latitude  IS NULL OR (latitude  BETWEEN -90  AND 90)),
    CHECK (longitude IS NULL OR (longitude BETWEEN -180 AND 180)),
    -- Half a coordinate cannot be plotted, and a null island at (0,0) is worse than no pin.
    CHECK ((latitude IS NULL) = (longitude IS NULL))
);

CREATE UNIQUE INDEX cruise_port_name     ON public.cruise_port (name);
CREATE UNIQUE INDEX cruise_port_provider ON public.cruise_port (provider, provider_key)
    WHERE provider IS NOT NULL;

COMMENT ON TABLE public.cruise_port IS
    'An embarkation port or port of call (Data-Model §24.3). Provider format is '
    '"Barcelona, Spain" — city and country in one free-text field, not normalised.';

COMMENT ON COLUMN public.cruise_port.name IS
    'Unique, and PROVIDER-LOCALISED — which is a known limitation, not an oversight. A live '
    'GET /cruises returns "Rhodes, Greece" for en_US, "Rodi, Grecia" for it_IT and '
    '"Rodes, Grecia" for pt_BR: one physical port under three names, with nothing in the '
    'payload connecting them. There is no provider port id to reconcile them by. Every '
    'shipped sailing scope is therefore locale en_US, and the day a second locale is '
    'enabled this table gains duplicate rows for the same quay. Fixing it properly needs a '
    'canonical port identity from open data (Free-Travel-APIs §4.7 point 5, the same source '
    'the coordinates above are waiting on), not a heuristic on the name.';

COMMENT ON COLUMN public.cruise_port.latitude IS
    'Deliberately nullable and unpopulated. track.cruises supplies no coordinates, and the '
    'synchronised map in Pattern F (Screen-Inventory §4.4) is not built. Free-Travel-APIs '
    '§4.7 point 5 has the plan: fill this from Wikidata/GeoNames open data, not by guessing. '
    'An invented coordinate is worse than an absent pin.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 24.4 cruise_sailing
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.cruise_sailing (
    id                   uuid PRIMARY KEY,
    cruise_line_id       uuid NOT NULL REFERENCES public.cruise_line(id),
    ship_id              uuid REFERENCES public.cruise_ship(id),
    provider             text NOT NULL,
    provider_key         text NOT NULL,
    provider_locale      text NOT NULL,
    title                text,
    departure_date       date NOT NULL,
    duration_nights      integer,
    lead_price_cents     bigint,
    currency             char(3),
    lead_price_eur_cents bigint,
    destinations         text[] NOT NULL DEFAULT '{}',
    itinerary_url        text,
    provider_payload     jsonb,
    provider_updated_at  timestamptz,
    synced_at            timestamptz,
    first_seen_at        timestamptz NOT NULL DEFAULT now(),
    last_seen_at         timestamptz,
    archived_at          timestamptz,
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now(),
    CHECK (duration_nights IS NULL OR duration_nights > 0),
    CHECK (lead_price_cents IS NULL OR lead_price_cents >= 0),
    CHECK (lead_price_eur_cents IS NULL OR lead_price_eur_cents >= 0),
    -- A fare without its currency is not a fare. The provider sends price and currency
    -- independently and either can be null, so this is a real case, not a theoretical one.
    CHECK ((lead_price_cents IS NULL) OR (currency IS NOT NULL))
);

-- The natural key is a TRIPLE. Their spec: cruise ids are unique only per cruise line
-- (Princess and Holland America share the Y731 voyage-code format), and the same id recurs
-- per locale with different pricing and currency. Keying on provider_key alone would
-- silently merge two different sailings — the worst kind of bug, because the row still looks
-- plausible afterwards.
CREATE UNIQUE INDEX cruise_sailing_provider
    ON public.cruise_sailing (provider, provider_key, provider_locale);

CREATE INDEX cruise_sailing_departure ON public.cruise_sailing (departure_date)
    WHERE archived_at IS NULL;
CREATE INDEX cruise_sailing_line_departure
    ON public.cruise_sailing (cruise_line_id, departure_date) WHERE archived_at IS NULL;
CREATE INDEX cruise_sailing_ship ON public.cruise_sailing (ship_id)
    WHERE ship_id IS NOT NULL;
-- For the incremental pass. The provider has no "updated since" filter, but it does offer
-- sort=updated_at:desc, so a refresh reads newest-first and stops at the high-water mark.
CREATE INDEX cruise_sailing_provider_freshness
    ON public.cruise_sailing (provider, provider_updated_at DESC);

COMMENT ON TABLE public.cruise_sailing IS
    'One dated departure (Data-Model §24.4) — the row a quote request eventually points at. '
    'Natural key is (provider, provider_key, provider_locale); see the index comment.';

COMMENT ON COLUMN public.cruise_sailing.provider_locale IS
    'The provider''s market identifier (en_US, de_DE, ...). Part of the natural key, not '
    'decoration: the same sailing exists once per market with a different price and '
    'currency. It also determines `currency`, which is why that column is not defaulted.';

COMMENT ON COLUMN public.cruise_sailing.ship_id IS
    'Nullable because the provider''s ship_name is nullable. A sailing whose ship we cannot '
    'resolve is still a real sailing with a real date, and dropping it would lose inventory '
    'to a missing lookup.';

COMMENT ON COLUMN public.cruise_sailing.lead_price_cents IS
    'INTERNAL. The lowest per-person fare the provider saw, in `currency`. Stored because '
    'Gyasi quotes from it and because the provider''s own min/max price filters operate on '
    'it — but granted to no client role. Free-Travel-APIs §10.2 says the PUBLIC CONTENT '
    'TYPE carries no price; if this ever reaches a public surface it must carry the hedging '
    'web/content/public/types.ts already defines (pricePlaceholder, priceSource, priceAsOf), '
    'because §4.7 is explicit that a displayed fare goes stale and re-opens compliance §9.2.';

COMMENT ON COLUMN public.cruise_sailing.lead_price_eur_cents IS
    'The provider''s cross-market comparable (price_euro). Kept because it is the only '
    'figure comparable across locales, and the only one min_price_eur/max_price_eur filter '
    'on. Not a converted value we computed — do not treat it as an FX rate.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 24.5 cruise_port_call
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.cruise_port_call (
    id           uuid PRIMARY KEY,
    sailing_id   uuid NOT NULL REFERENCES public.cruise_sailing(id) ON DELETE CASCADE,
    port_id      uuid REFERENCES public.cruise_port(id),
    port_name    text NOT NULL,
    sequence     integer NOT NULL,
    day          integer,
    arrival_at   timestamptz,
    departure_at timestamptz,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now(),
    CHECK (sequence > 0),
    CHECK (day IS NULL OR day > 0)
);

CREATE UNIQUE INDEX cruise_port_call_order ON public.cruise_port_call (sailing_id, sequence);
CREATE INDEX cruise_port_call_port ON public.cruise_port_call (port_id)
    WHERE port_id IS NOT NULL;

COMMENT ON TABLE public.cruise_port_call IS
    'One itinerary stop on a sailing, in order (Data-Model §24.5 — the port_call entity '
    'named in Free-Travel-APIs §10.1). No archived_at: port calls are wholly owned by their '
    'sailing and replaced as a set on each sync, which is why the FK cascades.';

COMMENT ON COLUMN public.cruise_port_call.sequence IS
    'OURS, and the ordering key. Dense, 1-based, from the array position the provider '
    'returned. It exists because `day` cannot be trusted for ordering — see that column.';

COMMENT ON COLUMN public.cruise_port_call.day IS
    'The provider''s 1-indexed day within the itinerary, and DISPLAY ONLY. Their spec: null '
    'whenever the source feed omitted it, which is EVERY Holland America sailing, with the '
    'instruction to treat null as "unknown day" rather than 0 or 1. Ordering an itinerary by '
    'a column that is null for an entire cruise line scrambles it, hence `sequence`.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 24.6 cruise_sailing_cabin_price
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.cruise_sailing_cabin_price (
    id          uuid PRIMARY KEY,
    sailing_id  uuid NOT NULL REFERENCES public.cruise_sailing(id) ON DELETE CASCADE,
    cabin_code  text NOT NULL,
    price_cents bigint NOT NULL,
    currency    char(3) NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    CHECK (price_cents >= 0),
    CHECK (cabin_code = upper(cabin_code) AND cabin_code ~ '^[A-Z0-9_]+$')
);

CREATE UNIQUE INDEX cruise_sailing_cabin_price_key
    ON public.cruise_sailing_cabin_price (sailing_id, cabin_code);

COMMENT ON TABLE public.cruise_sailing_cabin_price IS
    'Per-cabin per-person fare for a sailing (Data-Model §24.6). INTERNAL pricing. Rows '
    'exist only for sailings someone spent a detail request on: only GET /cruises/{id} '
    'returns cabin_prices_per_person, the list endpoint omits it. On the free tier that '
    'means the handful a client has asked to be quoted, so ABSENCE OF ROWS IS NORMAL and is '
    'not a sync failure. The provider also notes Costa''s cabin source has been unavailable '
    'since 2026-04-21, so Costa sailings legitimately have none.';

COMMENT ON COLUMN public.cruise_sailing_cabin_price.cabin_code IS
    'text, not an enum, per Data-Model §22.4. The documented set (INTERIOR, OCEANVIEW, '
    'BALCONY, MINISUITE, SUITE) is open-ended by the provider''s own admission — "plus '
    'line-specific tiers like CONCIERGE, AQUA, VISTA_SUITE, NEPTUNE_SUITE, HAVEN" — and an '
    'enum''s failure mode here is a sync that dies on a tier a line invented last week. The '
    'CHECK constrains the shape without freezing the vocabulary.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 24.7 cruise_sync_scope — what the sync may fetch. Configuration, not code.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.cruise_sync_scope (
    id                    uuid PRIMARY KEY,
    label                 text NOT NULL,
    endpoint              public.cruise_sync_endpoint NOT NULL,
    enabled               boolean NOT NULL DEFAULT false,
    priority              integer NOT NULL DEFAULT 100,
    company               text,
    locale                text,
    destination           text,
    departure_within_days integer,
    max_rows_per_request  integer NOT NULL DEFAULT 10,
    max_requests_per_run  integer NOT NULL DEFAULT 1,
    cursor                text,
    cursor_set_at         timestamptz,
    high_water_updated_at timestamptz,
    last_run_at           timestamptz,
    last_status           public.cruise_sync_status,
    last_error            text,
    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_at            timestamptz NOT NULL DEFAULT now(),
    CHECK (priority >= 0),
    CHECK (max_rows_per_request BETWEEN 1 AND 1000),
    CHECK (max_requests_per_run BETWEEN 1 AND 500),
    CHECK (departure_within_days IS NULL OR departure_within_days > 0),
    -- A cursor without a timestamp cannot be aged out, and a stale cursor is how a resume
    -- loop starts paging through a result set the filters no longer describe.
    CHECK ((cursor IS NULL) = (cursor_set_at IS NULL))
);

CREATE UNIQUE INDEX cruise_sync_scope_label ON public.cruise_sync_scope (label);
CREATE INDEX cruise_sync_scope_queue ON public.cruise_sync_scope (priority, id)
    WHERE enabled;

COMMENT ON TABLE public.cruise_sync_scope IS
    'What the cruise sync is allowed to fetch (Data-Model §24.7). One row is one unit of '
    'work. This table is the reason the free tier is a PARAMETER rather than a constraint '
    'baked into the handler: 100 req/mo at 10 rows/req cannot mirror a 100,000-row sailing '
    'inventory, but it refreshes the whole reference catalogue in three unpaginated calls. '
    'So reference scopes ship enabled, sailing scopes ship disabled, and a tier upgrade is '
    'an UPDATE ... SET enabled = true plus a wider max_rows_per_request — not a rewrite.';

COMMENT ON COLUMN public.cruise_sync_scope.enabled IS
    'Defaults to FALSE. Nothing runs unless it was deliberately switched on — the right '
    'default when every run spends a metered, non-renewing monthly budget.';

COMMENT ON COLUMN public.cruise_sync_scope.departure_within_days IS
    'A ROLLING window from today, deliberately not a departure_after/departure_before pair. '
    'A scheduled job configured with absolute dates keeps reporting success while silently '
    'syncing nothing, from the moment the window falls into the past. A rolling window '
    'cannot expire.';

COMMENT ON COLUMN public.cruise_sync_scope.cursor IS
    'Persisted next_cursor. The provider''s pagination is cursor-only — starting_after with '
    'no page or offset parameter — so a catalogue pass that takes weeks of daily budget must '
    'resume where it stopped or it re-pays for pages it already holds. It is also why no '
    'single invocation comes near the 150s Edge Function ceiling (Tech-Recommendations §7).';

COMMENT ON COLUMN public.cruise_sync_scope.high_water_updated_at IS
    'Newest provider updated_at already ingested for this scope. The incremental lever: '
    'there is no "updated since" filter, but sort=updated_at:desc plus this mark means a '
    'refresh reads newest-first and stops as soon as it recognises what it has.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 24.8 cruise_sync_run
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.cruise_sync_run (
    id                  uuid PRIMARY KEY,
    trigger             public.cruise_sync_trigger NOT NULL,
    status              public.cruise_sync_status NOT NULL DEFAULT 'running',
    started_at          timestamptz NOT NULL DEFAULT now(),
    finished_at         timestamptz,
    scopes_run          integer NOT NULL DEFAULT 0,
    requests_spent      integer NOT NULL DEFAULT 0,
    rows_upserted       integer NOT NULL DEFAULT 0,
    rows_archived       integer NOT NULL DEFAULT 0,
    quota_limit         integer,
    quota_remaining     integer,
    quota_reset_seconds integer,
    error_code          text,
    error_detail        text,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    CHECK (scopes_run >= 0 AND requests_spent >= 0
           AND rows_upserted >= 0 AND rows_archived >= 0),
    CHECK (finished_at IS NULL OR finished_at >= started_at),
    -- 'running' is the only status that may lack an end. Anything else without one is a row
    -- nobody will ever reconcile.
    CHECK (status = 'running' OR finished_at IS NOT NULL)
);

CREATE INDEX cruise_sync_run_recent ON public.cruise_sync_run (started_at DESC);

COMMENT ON TABLE public.cruise_sync_run IS
    'One invocation of the cruise sync and what it spent (Data-Model §24.8). The OPERATIONAL '
    'record, deliberately not the audit trail — see the audit note in the RLS block below.';

COMMENT ON COLUMN public.cruise_sync_run.error_detail IS
    'Never contains the API key. The client redacts credentials before any error is '
    'persisted or logged; a leaked key in a table that outlives the incident is worse than '
    'the incident.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 24.9 cruise_api_request — the quota ledger. Append-only.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.cruise_api_request (
    id                  uuid PRIMARY KEY,
    run_id              uuid REFERENCES public.cruise_sync_run(id),
    provider            text NOT NULL DEFAULT 'track_cruises',
    endpoint            public.cruise_sync_endpoint NOT NULL,
    path                text NOT NULL,
    query               jsonb NOT NULL DEFAULT '{}',
    status_code         integer,
    rows_returned       integer,
    duration_ms         integer,
    provider_request_id text,
    quota_limit         integer,
    quota_remaining     integer,
    quota_reset_seconds integer,
    error_code          text,
    error_detail        text,
    created_at          timestamptz NOT NULL DEFAULT now(),
    CHECK (rows_returned IS NULL OR rows_returned >= 0),
    CHECK (duration_ms IS NULL OR duration_ms >= 0)
);

-- The ledger read is "how many calls this calendar month", so the index is on time alone.
CREATE INDEX cruise_api_request_spent ON public.cruise_api_request (created_at DESC);
CREATE INDEX cruise_api_request_run   ON public.cruise_api_request (run_id)
    WHERE run_id IS NOT NULL;

COMMENT ON TABLE public.cruise_api_request IS
    'Append-only ledger of every provider HTTP call (Data-Model §24.9) — hence created_at '
    'and no updated_at, the same posture as card_use_event and audit_event. Separate from '
    'cruise_sync_run because not every request belongs to a run: a quote-time detail refetch '
    'spends quota outside any sync, so month-to-date has to be counted here.';

COMMENT ON COLUMN public.cruise_api_request.query IS
    'SANITISED. Request parameters only, never headers, and never the API key.';

COMMENT ON COLUMN public.cruise_api_request.status_code IS
    'Every request is logged BEFORE it is judged — failures and 429s included — because a '
    'rejected request has usually still been counted by the relay. A ledger that recorded '
    'only successes would drift optimistic in exactly the situation where accuracy matters. '
    'Null means the request never completed at all (timeout, DNS, abort).';

COMMENT ON COLUMN public.cruise_api_request.rows_returned IS
    'Detects a silent tier clamp. The provider clamps an over-tier `limit` to the cap and '
    'still answers 200, so a run that asks for 100 and is quietly given 10 looks healthy; '
    'this column is what makes that visible.';

COMMENT ON COLUMN public.cruise_api_request.quota_remaining IS
    'x-ratelimit-requests-remaining, as reported by the RapidAPI relay — and it WINS. When '
    'the header says fewer requests remain than this ledger implies (quota spent from '
    'another environment, a manual curl, a colleague''s test), the header is authoritative, '
    'the drift is recorded, and the run stops. The local count is a pre-flight guard, not '
    'the source of truth.';

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS. Explicit enable + revoke on every table, because auto_expose_new_tables is on and
-- 20260907113546_revoke_write_grants.sql already ran — it will not cover a later table.
--
-- NO POLICIES, so this is service-role only: writes come from the cruise-sync Edge Function.
--
-- There is deliberately no anon policy. This catalog is the first thing in the schema that
-- will genuinely want anonymous reads — the public cruise pages — and the codebase has zero
-- `TO anon` policies today. The two candidates are an anon SELECT gated on a published flag
-- (the testimonial / itinerary.published_at pattern, where the gate doubles as the
-- compliance review Free-Travel-APIs §10.1 wants before a synced page goes live) or a
-- service-role read from a Next.js server component, which is how web/lib/onboarding/api.ts
-- already talks to the backend. That belongs with the search work, not with the sync, and
-- until it is decided nothing reads these tables unauthenticated.
--
-- AUDIT: one audit_event per RUN, not per row. CLAUDE.md rule 3 names the tables it governs
-- — payment_card, card_authorization, commission, client — and none of these are among them;
-- onboarding-step already sets the precedent of deliberately writing no audit row with a
-- comment saying why. A per-row trail here would also be actively harmful: thousands of rows
-- per run through the non-atomic path _shared/audit.ts documents at length. The sync writes
-- one 'cruise.synced' event with counts in metadata; cruise_sync_run carries the detail.
-- The actor is null on both columns — §15.1 makes them nullable expressly for system events.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
    t text;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'cruise_line', 'cruise_ship', 'cruise_port', 'cruise_sailing',
        'cruise_port_call', 'cruise_sailing_cabin_price',
        'cruise_sync_scope', 'cruise_sync_run', 'cruise_api_request'
    ]
    LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    END LOOP;
END $$;

-- Assert the posture rather than assume it, the way 20260907031256 does. If a future
-- migration or a config change hands these tables back to a client role, this is where it
-- gets caught — at deploy time, not by a reviewer noticing.
DO $$
DECLARE
    leaked text;
BEGIN
    SELECT string_agg(DISTINCT table_name, ', ')
      INTO leaked
      FROM information_schema.role_table_grants
     WHERE table_schema = 'public'
       AND grantee IN ('anon', 'authenticated')
       AND table_name LIKE 'cruise%';

    IF leaked IS NOT NULL THEN
        RAISE EXCEPTION
            'Cruise catalog tables still grant privileges to anon or authenticated: %',
            leaked;
    END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Scope configuration. These are not seed data — they are the operational contract, and
-- production needs them as much as a laptop does, so they live in the migration rather than
-- in seed.sql. Ids follow the schema's convention for hand-authored rows: a fixed UUIDv7
-- timestamp prefix (2026-09-09T00:00:00Z) with a readable sequential tail, exactly as
-- seed.sql does with 0195a2c0-1a00-7000-8000-*.
--
-- HOW THE BUDGET IS SPENT. Free tier is 100 requests/month. The three reference scopes are
-- unpaginated — one request each, regardless of how much they return — so a weekly run costs
-- 3 and a month costs ~12. Everything else ships DISABLED:
--
--   * ships / ports are paginated at 10 rows/request. Enumerating ports alone would cost
--     more than a month's entire quota, which is why /filter-options is the cheap way to
--     the same vocabulary and these two exist only for a paid tier.
--   * the sailing scopes are the ones that need a tier upgrade to mean anything. They are
--     written out rather than left to be invented later so the widening is an UPDATE, and so
--     the intended shape (US market, rolling window, lines Gyasi actually books) is on the
--     record.
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.cruise_sync_scope
    (id, label, endpoint, enabled, priority, company, locale,
     departure_within_days, max_rows_per_request, max_requests_per_run)
VALUES
    -- Reference catalogue. Unpaginated, one request each, and between them they answer the
    -- whole of Free-Travel-APIs §1.0 for cruises except the sailings themselves.
    ('01a08376-dc00-7000-8000-000000000001', 'reference:cruise-lines',
     'cruise_lines',    true,  10, NULL, NULL,  NULL,  10,  1),
    ('01a08376-dc00-7000-8000-000000000002', 'reference:filter-options',
     'filter_options',  true,  20, NULL, NULL,  NULL,  10,  1),
    ('01a08376-dc00-7000-8000-000000000003', 'reference:coverage',
     'coverage',        true,  30, NULL, NULL,  NULL,  10,  1),

    -- Paginated catalogues. Disabled: /filter-options already yields these vocabularies for
    -- one request, so paying 10 rows at a time for them is only rational on a paid tier.
    ('01a08376-dc00-7000-8000-000000000010', 'catalog:ships',
     'ships',           false, 40, NULL, NULL,  NULL,  10,  2),
    ('01a08376-dc00-7000-8000-000000000011', 'catalog:ports',
     'ports',           false, 50, NULL, NULL,  NULL,  10,  2),

    -- Sailings, en_US, rolling 12-month window, one scope per line Story-Tail books and
    -- track.cruises covers. Virgin Voyages is absent on purpose: the provider has no
    -- coverage for it, so it can only ever be a curated cruise_line row.
    ('01a08376-dc00-7000-8000-000000000020', 'sailings:royal-caribbean',
     'cruises',         false, 100, 'royal-caribbean',   'en_US', 365, 10, 2),
    ('01a08376-dc00-7000-8000-000000000021', 'sailings:celebrity',
     'cruises',         false, 110, 'celebrity-cruises', 'en_US', 365, 10, 2),
    ('01a08376-dc00-7000-8000-000000000022', 'sailings:disney',
     'cruises',         false, 120, 'disney-cruise-line','en_US', 365, 10, 2),
    ('01a08376-dc00-7000-8000-000000000023', 'sailings:princess',
     'cruises',         false, 130, 'princess',          'en_US', 365, 10, 2),
    ('01a08376-dc00-7000-8000-000000000024', 'sailings:carnival',
     'cruises',         false, 140, 'carnival',          'en_US', 365, 10, 2),
    ('01a08376-dc00-7000-8000-000000000025', 'sailings:norwegian',
     'cruises',         false, 150, 'ncl',               'en_US', 365, 10, 2),
    ('01a08376-dc00-7000-8000-000000000026', 'sailings:holland-america',
     'cruises',         false, 160, 'holland-america',   'en_US', 365, 10, 2);

-- Virgin Voyages. Story-Tail books it, screen 2.0.9 lists it, and track.cruises has no
-- coverage for it at all — so it exists here as a curated row with a null provenance pair,
-- which is Free-Travel-APIs §10.1's "curated content wins" rule in its most literal form.
-- The other seven lines arrive from the feed and are matched to their slugs by
-- _shared/cruise/map.ts; inserting them here would race the sync for the same unique key.
INSERT INTO public.cruise_line (id, slug, name, display_order, is_booked)
VALUES ('01a08376-dc00-7000-8000-000000000100', 'virgin-voyages', 'Virgin Voyages', 60, true);

COMMENT ON COLUMN public.cruise_line.display_order IS
    'Editorial ordering, matching the prototype order in web/content/public/cruise-lines.ts '
    '(Royal Caribbean, Celebrity, Disney, Princess, Carnival, Virgin Voyages, Norwegian, '
    'Holland America). The provider sorts by cruise_count and never writes this.';
