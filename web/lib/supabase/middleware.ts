import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "@/types/supabase";
import { env } from "@/lib/env";
import { safeNext } from "@/lib/safe-next";
import {
  AUTH_FLAG_COOKIE,
  AUTH_FLAG_VALUE,
  authFlagAction,
} from "@/lib/auth/chrome-flag";

/**
 * Route groups that require a signed-in user.
 *
 * Exported because web/proxy.ts's matcher has to cover every one of them, and a matcher that
 * silently stopped covering one would take the gate off it. proxy.test.ts holds the two in
 * step.
 */
export const PROTECTED_PREFIXES = [
  "/dashboard",
  "/trips",
  "/account",
  // Screen 2.5.4's account-wide library. The (client) layout gates it too, but the proxy is
  // the first line and a route that lists somebody's passports should not depend on the
  // second one being correct.
  "/documents",
  // §2.6. A thread is somebody's correspondence with their advisor; the (client) layout gates
  // it too, but the proxy is the first line and this should not depend on the second.
  "/messages",
  "/agent",
  "/mfa",
  // The onboarding wizard, Screens 2.1.9-2.1.14. It reads and writes a traveler's own
  // record, so it needs a session as much as the dashboard does.
  "/welcome",
  "/onboarding",
];

/**
 * Auth screens a signed-in user should be bounced away from (incl. the 2.0.6 gate).
 *
 * Two 2.1.x routes are deliberately absent:
 *
 *   /reset-password — arriving there MEANS holding a session, the recovery one GoTrue just
 *     issued. Listing it here would bounce every reset to the dashboard with the password
 *     still unchanged.
 *   /verify-email   — reachable both ways. Usually there is no session (GoTrue withholds
 *     one until the address is confirmed), but someone who confirms and comes back has one,
 *     and the page sends them on itself rather than the proxy doing it blindly.
 *
 * /link-account is likewise absent: the person arriving has just authenticated at a social
 * provider and may or may not have a session here yet.
 */
export const AUTH_ONLY_PREFIXES = ["/login", "/register", "/join", "/forgot-password"];

/**
 * Screen 2.1.7 MFA Challenge. It lives under /login because that is what it is — the
 * second half of signing in — but it is NOT an auth-only page: reaching it requires a
 * session, just a half-assured one.
 */
const MFA_CHALLENGE = "/login/mfa";

function startsWithAny(pathname: string, prefixes: readonly string[]): boolean {
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Whether this request carries a Supabase session cookie at all.
 *
 * @supabase/ssr stores the session in `sb-<project-ref>-auth-token`, split into `.0`/`.1`
 * chunks past 3180 bytes. The ref differs between local and production, so this matches on
 * the SHAPE rather than on a derived name — lib/auth/chrome-flag.ts lists the three ways
 * deriving the exact name goes wrong. Matching the shape is safe here where exactness is
 * not: a false positive costs one needless lookup, and there is no false negative, because
 * a session cannot exist without that cookie.
 *
 * The PKCE `…-auth-token-code-verifier` cookie matches too. That is the right direction —
 * mid-OAuth it means "pay for the lookup", not "skip a real session".
 *
 * ── WHY IT IS HERE ───────────────────────────────────────────────────────────────
 *
 * No cookie means no session, so `getUser()` can only answer null, and it spends a network
 * round trip to Supabase to do it. Every crawler, every scanner and every first-time visitor
 * was paying that. It is the bulk of the Fluid Active CPU behind the 2026-10-26 Hobby pause
 * (9h44m against a 4h limit, on about 700K requests of which roughly none were human).
 */
export function hasSessionCookie(names: readonly string[]): boolean {
  return names.some((name) => name.startsWith("sb-") && name.includes("-auth-token"));
}

/**
 * How far through authentication this request is.
 *
 *   "none"      — no verified second factor on the account; aal1 is all there is
 *   "required"  — a factor IS enrolled and the session has not been challenged yet
 *   "satisfied" — the second factor has been verified on this session
 *
 * Supabase spells this as `{ currentLevel, nextLevel }`; the three-way name is here
 * because "aal1" alone cannot tell those first two cases apart, and they route to
 * completely different places.
 */
export type Assurance = "none" | "required" | "satisfied";

/**
 * The pure routing decision behind `updateSession`, kept separate so it can be unit
 * tested without a Supabase client: where this request should be redirected, or `null`
 * to let it through. The caller adds `?next=` when the answer is "/login".
 */
export function authRedirectFor(
  pathname: string,
  signedIn: boolean,
  assurance: Assurance = "none",
  /**
   * The request's own `?next=`, when it has one.
   *
   * Only consulted for a signed-in visitor on an auth-only page. Before this existed those
   * were sent to /dashboard unconditionally, which silently dropped whatever they had been
   * trying to do: a signed-in client clicking "Request a quote" links to
   * `/join?intent=quote&next=…` (Screen 2.0.6 gates the CTA, not the visitor), so they were
   * bounced to their dashboard and the request was lost. There was no way for them to ask
   * for a quote at all.
   */
  next?: string | null,
): string | null {
  // The challenge screen is judged on its own terms, before the /login prefix rule below
  // can mistake it for a page a signed-in visitor should be bounced off.
  if (pathname === MFA_CHALLENGE) {
    if (!signedIn) return "/login";
    // Nothing to challenge: either there is no second factor or it is already done. Sitting
    // on a code entry that can never succeed is a dead end.
    if (assurance !== "required") return "/dashboard";
    return null;
  }

  if (!signedIn && startsWithAny(pathname, PROTECTED_PREFIXES)) return "/login";

  // A half-authenticated session finishes signing in before it goes anywhere that assumes
  // it is signed in — including the pages it would otherwise be bounced off for being
  // signed in already.
  if (signedIn && assurance === "required") {
    if (
      startsWithAny(pathname, PROTECTED_PREFIXES) ||
      startsWithAny(pathname, AUTH_ONLY_PREFIXES) ||
      pathname === "/"
    ) {
      return MFA_CHALLENGE;
    }
    // Anything else — the public pages — stays readable. Someone halfway through signing
    // in has no less right to read about Aruba than someone who never started.
    return null;
  }

  if (signedIn && startsWithAny(pathname, AUTH_ONLY_PREFIXES)) {
    return resolveSignedInNext(next);
  }
  // A signed-in traveler on the public front door (exactly "/") goes straight to their trips.
  if (signedIn && pathname === "/") return "/dashboard";
  return null;
}

/**
 * Where a signed-in visitor on an auth-only page actually wants to be.
 *
 * `safeNext` does the open-redirect work — same-origin relative paths only, and it keeps
 * the query, which is the whole point here: the destination carries the quote context.
 *
 * The second guard is this function's own: a `next` pointing back at an auth-only page, or
 * at "/", would bounce straight back through this branch and loop. Those fall through to
 * the dashboard, which is where they were going before.
 */
function resolveSignedInNext(next?: string | null): string {
  const resolved = safeNext(next, "/dashboard");
  const [pathname] = resolved.split("?");
  if (pathname === "/" || startsWithAny(pathname, AUTH_ONLY_PREFIXES)) return "/dashboard";
  return resolved;
}

/**
 * Refreshes the Supabase session on every request and gates the protected route
 * groups.
 *
 * Two rules that are easy to get wrong and expensive to debug:
 *   1. Always return `supabaseResponse` (or copy its cookies onto whatever you do
 *      return). Dropping it desynchronises the browser's cookies from the refreshed
 *      session and logs the user out at random. The redirects below do the copying, via
 *      `redirectKeepingCookies` — they cannot return `supabaseResponse` itself, because it
 *      is a `next()` and they need a 307. This rule was violated here for a long time.
 *   2. Use getUser(), never getSession(), for the auth check — getSession() reads the
 *      cookie without revalidating the JWT against the auth server, so a tampered or
 *      expired token would pass.
 */
export async function updateSession(request: NextRequest) {
  // Before `supabase start` has ever run there is no URL or anon key. In development,
  // render the app rather than 500ing on every request — the design system and static
  // screens are still worth looking at. In production this does NOT apply: the getters
  // below throw, so a deploy with missing config fails closed instead of serving the
  // authenticated app to everyone.
  if (env.authChecksDisabledForLocalDev) {
    // Nobody can be signed in without Supabase, so clear any flag left over from a run that
    // had it configured. A no-op when there is none, which is the normal case.
    return applyAuthFlag(
      NextResponse.next({ request }),
      authFlagAction(request.cookies.get(AUTH_FLAG_COOKIE)?.value, false),
    );
  }

  // Nothing to refresh and nobody to look up. Answer from the routing table alone, without
  // building a client or touching the network — see `hasSessionCookie`.
  if (!hasSessionCookie(request.cookies.getAll().map((cookie) => cookie.name))) {
    return finish(request, NextResponse.next({ request }), false, "none");
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    env.supabaseUrl,
    env.supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          supabaseResponse = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            supabaseResponse.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // `supabaseResponse` is read HERE, after the await, on purpose: a token refresh replaces
  // the whole object through the `setAll` callback above, so anything captured earlier would
  // be the copy without the refreshed cookies on it. That is rule 1.
  return finish(request, supabaseResponse, Boolean(user), await assuranceOf(supabase, user));
}

/**
 * Turn the auth decision into the response.
 *
 * Split out because this half does not care HOW the decision was reached. `updateSession`
 * arrives here either from a Supabase round trip or — for an anonymous request, which is
 * nearly all of them — straight from the routing table with no network call at all. Both
 * have to apply the flag and build their redirects identically, and a second copy of this
 * would be a second place for rule 1 to get violated.
 */
function finish(
  request: NextRequest,
  base: NextResponse,
  signedIn: boolean,
  assurance: Assurance,
): NextResponse {
  const { pathname } = request.nextUrl;
  const target = authRedirectFor(
    pathname,
    signedIn,
    assurance,
    request.nextUrl.searchParams.get("next"),
  );

  // Publish the one bit the static public pages need (lib/auth/chrome-flag.ts), and skip it
  // entirely when it would not change. That skip matters twice over: it keeps a redundant
  // Set-Cookie off every response, and a Set-Cookie is itself a reason a CDN will not cache
  // one.
  const flag = authFlagAction(request.cookies.get(AUTH_FLAG_COOKIE)?.value, signedIn);

  if (target === "/login" || target === MFA_CHALLENGE) {
    const url = request.nextUrl.clone();
    url.pathname = target;
    url.search = "";
    url.searchParams.set("next", pathname);
    return applyAuthFlag(redirectKeepingCookies(url, base), flag);
  }

  if (target) {
    // The target may carry its own query — `resolveSignedInNext` returns the visitor's
    // destination intact, and blanking the search here would drop exactly the context this
    // branch exists to preserve. Parsed against the request's origin so a path and a path
    // with a query are handled the same way; `safeNext` has already proved it is relative.
    const url = new URL(target, request.nextUrl.origin);
    // …and it still has to go out through `redirectKeepingCookies` + `applyAuthFlag`. A bare
    // NextResponse.redirect here drops the session Supabase may have just refreshed, which is
    // the bug fixed on dev in "stop the proxy dropping a refreshed session on every redirect",
    // and it would leave the public chrome showing stale auth state.
    return applyAuthFlag(redirectKeepingCookies(url, base), flag);
  }

  return applyAuthFlag(base, flag);
}

/**
 * A redirect that carries whatever cookies Supabase just wrote.
 *
 * This is rule 1 at the top of this file, and it is not academic. `getUser()` refreshes an
 * expired access token, and the refreshed cookies land on `supabaseResponse` via the `setAll`
 * callback. Returning a bare `NextResponse.redirect` throws them away — and every
 * refresh-and-redirect combination is a real request: an expired token bounced /dashboard →
 * /login, a signed-in visitor bounced /join → /dashboard, a half-assured session sent to
 * /login/mfa. The browser then keeps the OLD token, and with refresh-token rotation the
 * refresh it never saw has already invalidated it. That is the "logs the user out at random"
 * failure, and it looks like a server bug rather than a cookie bug.
 *
 * Only the cookies move across, not the headers: `NextResponse.next()` carries its own
 * middleware signalling that means nothing on a redirect. `ResponseCookies.getAll()` returns
 * full cookie objects and `set()` takes one, so attributes (Path, HttpOnly, SameSite,
 * Max-Age) survive the copy rather than being flattened to name=value.
 *
 * Nothing here writes the public-chrome flag — `applyAuthFlag` owns that and runs after — so
 * the flag cannot be double-written.
 */
function redirectKeepingCookies(url: URL, from: NextResponse): NextResponse {
  const response = NextResponse.redirect(url);
  for (const cookie of from.cookies.getAll()) {
    response.cookies.set(cookie);
  }
  return response;
}

/**
 * Writes the decision from `authFlagAction` onto the response.
 *
 * Applied to the redirects too, not just the pass-through: signing out ends in a redirect to
 * /login, and that is the response that has to clear the flag or the public chrome would keep
 * showing an avatar until the visitor's next full page load.
 */
function applyAuthFlag(
  response: NextResponse,
  action: ReturnType<typeof authFlagAction>,
): NextResponse {
  if (action === "set") {
    response.cookies.set(AUTH_FLAG_COOKIE, AUTH_FLAG_VALUE, {
      path: "/",
      sameSite: "lax",
      // Deliberately NOT httpOnly: the pre-paint script reads it. It carries no identity.
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
      // Long, because it is never renewed: `authFlagAction` returns null while the value is
      // already correct, which is what keeps Set-Cookie off the steady-state response. A
      // short life would therefore expire under a tab left open without navigating, and the
      // chrome would flip to signed-out on its next focus. A stale flag is harmless in the
      // other direction — the proxy clears it on the next request, and /api/account/chrome
      // is the authority for the frame after that.
      maxAge: 60 * 60 * 24 * 30,
    });
  } else if (action === "clear") {
    response.cookies.delete({ name: AUTH_FLAG_COOKIE, path: "/" });
  }
  return response;
}

/**
 * Read the assurance level off the session Supabase has already verified.
 *
 * It is async but makes no network call: `getAuthenticatorAssuranceLevel` decodes the
 * access token that `getUser()` has already validated against the auth server. Cheap
 * enough to do on every request, which matters because the proxy matcher covers nearly
 * all of them.
 */
async function assuranceOf(
  supabase: ReturnType<typeof createServerClient<Database>>,
  user: unknown,
): Promise<Assurance> {
  if (!user) return "none";
  const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (data?.currentLevel === "aal2") return "satisfied";
  if (data?.nextLevel === "aal2") return "required";
  return "none";
}
