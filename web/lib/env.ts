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
};
