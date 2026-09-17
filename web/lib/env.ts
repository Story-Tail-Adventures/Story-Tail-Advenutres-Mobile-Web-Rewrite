/**
 * Typed, fail-fast access to the web app's environment.
 *
 * Most of what belongs here is NEXT_PUBLIC_* — inlined into the browser bundle, and safe to
 * be. Everything else is server-only, and the rule for those is absolute: no NEXT_PUBLIC_
 * prefix, ever, and never read from a client component. A server-only getter evaluated in
 * the browser yields undefined, which is the failure mode we want rather than one to fix.
 *
 * SUPABASE_SERVICE_ROLE_KEY — A DELIBERATE REVERSAL, 2026-09-16.
 *
 * This header used to say the service-role key must NEVER appear under `web/`, that it
 * belongs only to Edge Functions, and that they receive it automatically. That prohibition
 * was real and it was load-bearing — `supabase/functions/hotel-search` cites it by name as
 * the reason it exists as a function at all. It is recorded here rather than quietly
 * deleted, because it did not turn out to be wrong. It was overridden, with the cost known.
 *
 * WHAT CHANGED. Live hotel search (Screen 2.0.4, Hotels mode, P2) moved out of that Edge
 * Function and now runs in-process in this app. Its four tables — `hotel_search_cache`,
 * `hotel_api_request`, `hotel_search_rate_bucket`, `hotel_search_config` — have RLS enabled
 * with zero policies, because the caller is an anonymous visitor and no predicate can
 * express "this stranger may read this cached search". The function reached them with the
 * service role the platform injected. Running here, this app has to hold that key itself or
 * the feature does not work. There is no third option: an `anon` policy on those tables
 * would publish the ledger and the rate buckets to the internet.
 *
 * WHAT IT COSTS, PLAINLY. The service role bypasses RLS for the ENTIRE schema, not just the
 * four hotel tables. Supabase has no key scoped to a subset of tables, so there is nothing
 * narrower to ask for. The blast radius of an accidental client-component import, a leaked
 * build log, or a handler that echoes its own config is therefore every row we hold —
 * `client`, `trip`, `commission`, `payment_card` metadata, `audit_event` — and not merely a
 * cache of hotel prices. That is strictly worse than the posture this file held before, and
 * the replacement safeguards are procedural rather than structural: server-only reads, no
 * NEXT_PUBLIC_ prefix, and the value never crossing into a response body or a log line.
 * Treat any diff that moves it toward the client as a defect, not a style question.
 *
 * See docs/Data-Model.md §21.2, docs/Free-Travel-APIs.md §10.1, and web/README.md.
 */

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Missing ${name}. Copy web/.env.example to web/.env.local and fill it in — ` +
        `run \`supabase status\` to get the local values.`,
    );
  }
  return value;
}

export const env = {
  get supabaseConfigured(): boolean {
    return Boolean(
      process.env.NEXT_PUBLIC_SUPABASE_URL &&
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    );
  },

  /**
   * True only when Supabase is unconfigured AND we are not in production.
   *
   * This is the escape hatch that lets the app render — and the design system be
   * reviewed — before a container runtime and `supabase start` exist: the proxy skips
   * session handling instead of throwing on every request.
   *
   * It is gated on NODE_ENV deliberately. Without that gate, a production deploy that
   * simply forgot its env vars would silently skip every auth check and serve the whole
   * authenticated app to anyone. Missing config in production must fail closed — the
   * getters below throw, which yields a 500 rather than an open door.
   */
  get authChecksDisabledForLocalDev(): boolean {
    return (
      process.env.NODE_ENV !== "production" && !this.supabaseConfigured
    );
  },
  get supabaseUrl(): string {
    return required(
      "NEXT_PUBLIC_SUPABASE_URL",
      process.env.NEXT_PUBLIC_SUPABASE_URL,
    );
  },
  get supabaseAnonKey(): string {
    return required(
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    );
  },
  /**
   * OAuth providers are only offered once their client credentials exist in
   * supabase/config.toml. Until then the buttons render disabled rather than
   * throwing on click. See Screen Inventory 2.1.1 and 2.1.8.
   */
  get googleAuthEnabled(): boolean {
    return process.env.NEXT_PUBLIC_AUTH_GOOGLE_ENABLED === "true";
  },
  get appleAuthEnabled(): boolean {
    return process.env.NEXT_PUBLIC_AUTH_APPLE_ENABLED === "true";
  },

  /**
   * Canonical origin of the app subdomain, for metadataBase, canonical URLs, the sitemap,
   * robots.txt and the auth callback's emailRedirectTo. Production must set it; outside
   * production the dev server's origin is a safe default.
   */
  get siteUrl(): string {
    const configured = process.env.NEXT_PUBLIC_SITE_URL;
    if (configured) return configured.replace(/\/+$/, "");
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "Missing NEXT_PUBLIC_SITE_URL. Set it to the app subdomain origin (e.g. https://app.story-tail.com).",
      );
    }
    return "http://localhost:3000";
  },

  /**
   * Where "Message Gyasi without an account" emails go (Screen Inventory 2.0.5 / 2.0.6).
   * The no-account path is a prefilled email, and stays one: per BRD §6.5 a quote request
   * creates a Trip and so needs an account, and the Lead entity is deferred. Outside production
   * the seed agent's address stands in; in production an unset value returns null and the
   * guest CTAs fall back to the sign-up gate rather than inventing an address.
   */
  get inquiryEmail(): string | null {
    const configured = process.env.NEXT_PUBLIC_INQUIRY_EMAIL;
    if (configured) return configured;
    if (process.env.NODE_ENV === "production") return null;
    return "gyasi@example.com";
  },

  /**
   * The shared secret proving a hotel-search call came from our own server.
   *
   * NOT `NEXT_PUBLIC_` — deliberately, and it is the reason this getter exists at all. The
   * anon key satisfies the Edge Function's gateway but authenticates nobody, because it is
   * inlined into the browser bundle; this value never is. Reading it in a client component
   * yields undefined, which is the failure mode we want.
   *
   * Null rather than throwing when unset: the hotels mode then reports itself unavailable
   * and the page falls back to the curated catalog, which is a better outcome on a public
   * marketing route than a 500.
   */
  get hotelSearchToken(): string | null {
    return process.env.STA_HOTEL_SEARCH_TOKEN ?? null;
  },

  /**
   * The kill switch. Live hotel search spends a metered third-party budget on a public
   * page, so it needs to be one env var from off without a deploy or a code change.
   */
  get hotelSearchEnabled(): boolean {
    if (process.env.HOTEL_SEARCH_ENABLED === "false") return false;
    return Boolean(process.env.STA_HOTEL_SEARCH_TOKEN);
  },

  /**
   * SerpApi's key, for the Google Hotels engine. Previously a Supabase Edge Function secret;
   * it lives here now because the search that spends it does.
   *
   * Server-only, and the prefix rule bites hardest here of anything in this file: this is a
   * metered credential billed to us, so a NEXT_PUBLIC_ prefix would not leak data, it would
   * hand strangers our monthly quota. The free tier is 250 searches a month and an overspent
   * month cannot be bought back.
   *
   * Null rather than throwing when unset, for the same reason hotelSearchToken is: the
   * hotels mode reports itself unavailable and the page falls back to the curated catalog.
   * "Nobody configured this" and "the month is gone" stay distinguishable to whoever reads
   * the log, which is why this is a separate signal from the budget's.
   */
  get serpApiKey(): string | null {
    return process.env.SERPAPI_API_KEY ?? null;
  },

  /**
   * The server-only pepper the rate limiter hashes a caller's IP with before it becomes a
   * bucket key. The raw address never reaches Postgres — Data-Model classifies IP as PII, a
   * counter is not a licence to keep a visitor log on a public marketing route, and the
   * table's CHECK constraint refuses anything that is not a digest.
   *
   * Empty string rather than null, which is exactly what the Edge Function passed: an unset
   * pepper still yields a stable digest, so the limiter keeps working rather than failing
   * closed on a public page. It works WEAKLY, though — an unpeppered digest of an IPv4
   * address is brute-forceable in seconds, so the anonymity this exists for is only real
   * once the value is set. Set it in every deployed environment.
   */
  get hotelSearchIpPepper(): string {
    return process.env.HOTEL_SEARCH_IP_PEPPER ?? "";
  },

  /**
   * The Supabase service-role key. READ THE REVERSAL NOTE AT THE TOP OF THIS FILE before
   * adding a second caller: this key bypasses RLS for the whole schema, and hotel search is
   * the one use case that justified admitting it to `web/`.
   *
   * Server-only. It must never gain a NEXT_PUBLIC_ prefix and must never be imported,
   * directly or transitively, from a component that ships to the browser.
   *
   * Null rather than throwing when unset, so a deployment that has not been given the key
   * degrades hotel search to unavailable instead of 500ing a public route — and so every
   * other route in the app, which needs no such privilege, still boots without it.
   */
  get supabaseServiceRoleKey(): string | null {
    return process.env.SUPABASE_SERVICE_ROLE_KEY ?? null;
  },
};
