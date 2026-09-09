/**
 * Typed, fail-fast access to the web app's environment.
 *
 * Only NEXT_PUBLIC_* values belong here — they are inlined into the browser bundle.
 * SUPABASE_SERVICE_ROLE_KEY must NEVER appear in `web/`: it bypasses RLS and belongs
 * only to Edge Functions, which get it injected automatically. See docs/Data-Model.md §21.2.
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
};
