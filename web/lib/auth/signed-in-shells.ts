/**
 * Which paths signOutAction has to invalidate.
 *
 * ── WHY THIS IS NOT IN lib/auth/actions.ts, WHERE IT IS USED ─────────────────────
 *
 * That file is `"use server"`, and such a file may export ONLY async functions — Next
 * rejects anything else at module evaluation with "A 'use server' file can only export async
 * functions, found object". The failure is invisible to `tsc`, to eslint and to the unit
 * tests, because it is enforced by the server-actions loader at runtime: what it actually
 * does is 500 every POST to a route that imports the module, which means every sign-in
 * attempt. Do not move this back.
 */

/**
 * The URL roots of the two shells that render somebody's signed-in state: the client portal
 * (§2.2 onward) and the onboarding wizard (§2.1.9-2.1.14). Route groups do not appear in URLs,
 * so these are the paths, not the group names.
 *
 * ── WHY NOT `revalidatePath("/", "layout")`, WHICH IS WHAT THIS WAS ──────────────
 *
 * That is the root layout, so it invalidated every route in the app — including all 33
 * statically prerendered marketing pages, which then have to be regenerated on next request.
 * Sign-out is rare enough that the cost is survivable, but it is pure collateral damage: it
 * throws away exactly the "public pages are files on a CDN" property the rest of this feature
 * is built to protect, and it protected nothing extra in return.
 *
 * Nothing extra, because none of the authenticated routes is server-cached in the first place
 * — every one of them is dynamic, so there is no Full Route Cache entry to evict. What
 * actually needs clearing is the CLIENT Router Cache, which is holding the signed-in RSC
 * payload; a `revalidatePath` from a Server Function clears that for every page the visitor
 * has already been to, whatever path it is given.
 *
 * Which is also why these paths are named out rather than relying on that: Next documents the
 * blanket client-side clear as "temporary and will be updated in the future to apply only to
 * the specific path" (revalidatePath.md). When that lands, a single narrow call would stop
 * clearing /trips and the shell would survive a sign-out. Naming the shells keeps working.
 *
 * The two MFA screens are here for the same reason rather than because they carry chrome:
 * both require a session and both render what it says about the person. `/login/mfa` sits
 * under /login but is not an auth-only page — reaching it means holding a half-assured
 * session — so it needs clearing while bare `/login` must NOT be listed.
 *
 * `/account` (§2.5.1) and `/agent` (§3.x) have no routes yet. Add them when they do; the
 * cross-check in signed-in-shells.test.ts fails until they are, by walking the app directory
 * and asking the proxy which of the routes it finds require a session.
 */
export const SIGNED_IN_SHELLS = [
  "/dashboard",
  "/trips",
  // §2.5. Both are signed-in shells, so both have to be evicted on sign-out or the next
  // navigation renders a cached page belonging to whoever just left.
  "/account",
  "/documents",
  "/welcome",
  "/onboarding",
  "/mfa",
  "/login/mfa",
] as const;
