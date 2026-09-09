/**
 * The one bit of auth state the PUBLIC pages are allowed to know: "somebody is signed in".
 *
 * ── WHY A COOKIE OF OUR OWN ──────────────────────────────────────────────────────
 *
 * The public shell reads no request-time APIs, which is what keeps every marketing page
 * prerendered as static HTML (app/(public)/layout.tsx). So the signed-in chrome has to be
 * decided in the browser, and the browser needs a signal it can read before first paint.
 *
 * The tempting signal is Supabase's own `sb-*-auth-token` cookie. It is the wrong one, three
 * times over:
 *
 *   1. Its name is `sb-${hostname.split(".")[0]}-auth-token` (supabase-js), so it is
 *      `sb-127-auth-token` against local Supabase and `sb-<ref>-auth-token` in production —
 *      a regex written for one silently fails on the other.
 *   2. @supabase/ssr splits it into `.0`/`.1` chunks past 3180 bytes, which one OAuth
 *      identity's claims will cross. Then the unchunked name does not exist at all.
 *   3. Deriving the exact name needs NEXT_PUBLIC_SUPABASE_URL, and no prerendered route may
 *      read that — CI builds the app without it on purpose (.github/workflows/ci.yml), so
 *      lib/env.ts would throw the build.
 *
 * And it would be UNVERIFIED: that cookie has a 400-day maxAge against a 1-hour JWT expiry,
 * so a long-dead session still leaves it sitting there. Trusting it would show a previous
 * user's initials on a shared browser — exactly what lib/supabase/middleware.ts refuses to do
 * for the auth check itself.
 *
 * So the proxy — which already calls getUser() on essentially every request, and throws the
 * answer away — publishes it here instead. The flag is getUser()-backed, carries no identity,
 * and costs no extra round trip.
 *
 * This module imports nothing, deliberately: the proxy, a server component and a client
 * island all need it, so it must be safe in every environment.
 */

/** Not httpOnly — the pre-paint script has to read it. It says nothing but "yes". */
export const AUTH_FLAG_COOKIE = "sta-authed";
export const AUTH_FLAG_VALUE = "1";

/** Set on <html> by the pre-paint script; the CSS gate in styles/public.css keys off it. */
export const AUTH_FLAG_ATTR = "data-sta-auth";

/**
 * Source of the cookie match, shared so the inline script and `hasAuthFlag()` cannot drift.
 * Anchored on both sides: `(?:^|;\s*)` stops it matching a longer cookie name that merely
 * ends in ours, and `(?:;|$)` stops `=1` matching a value of `10`.
 */
export const AUTH_FLAG_PATTERN = `(?:^|;\\s*)${AUTH_FLAG_COOKIE}=${AUTH_FLAG_VALUE}(?:;|$)`;

/** Browser-only. Returns false rather than throwing where cookies are blocked. */
export function hasAuthFlag(): boolean {
  try {
    return new RegExp(AUTH_FLAG_PATTERN).test(document.cookie);
  } catch {
    return false;
  }
}

/**
 * What the proxy should do with the flag on this response, or null to leave it alone.
 *
 * Returning null for the steady state is the point: without it every public page response
 * would carry a redundant Set-Cookie.
 */
export function authFlagAction(
  current: string | undefined,
  signedIn: boolean,
): "set" | "clear" | null {
  if (signedIn) return current === AUTH_FLAG_VALUE ? null : "set";
  return current === undefined ? null : "clear";
}

/**
 * The pre-paint inline script, mirroring components/ThemeScript.tsx. It only ever ADDS the
 * attribute — absence is the signed-out default, so a visitor with JS disabled, cookies
 * blocked or no session gets the static HTML unchanged.
 */
export function authFlagScript(): string {
  return `
(function () {
  try {
    if (new RegExp(${JSON.stringify(AUTH_FLAG_PATTERN)}).test(document.cookie)) {
      document.documentElement.setAttribute(${JSON.stringify(AUTH_FLAG_ATTR)}, ${JSON.stringify(AUTH_FLAG_VALUE)});
    }
  } catch (e) {
    /* Cookies blocked — fall through to the signed-out chrome. */
  }
})();
`.trim();
}
