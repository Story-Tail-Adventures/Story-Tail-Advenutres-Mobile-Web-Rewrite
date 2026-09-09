import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "@/types/supabase";
import { env } from "@/lib/env";
import { safeNext } from "@/lib/safe-next";

/** Route groups that require a signed-in user. */
const PROTECTED_PREFIXES = [
  "/dashboard",
  "/trips",
  "/account",
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
const AUTH_ONLY_PREFIXES = ["/login", "/register", "/join", "/forgot-password"];

/**
 * Screen 2.1.7 MFA Challenge. It lives under /login because that is what it is — the
 * second half of signing in — but it is NOT an auth-only page: reaching it requires a
 * session, just a half-assured one.
 */
const MFA_CHALLENGE = "/login/mfa";

function startsWithAny(pathname: string, prefixes: string[]): boolean {
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
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
 *      session and logs the user out at random.
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
    return NextResponse.next({ request });
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

  const { pathname } = request.nextUrl;
  const target = authRedirectFor(
    pathname,
    Boolean(user),
    await assuranceOf(supabase, user),
    request.nextUrl.searchParams.get("next"),
  );

  if (target === "/login" || target === MFA_CHALLENGE) {
    const url = request.nextUrl.clone();
    url.pathname = target;
    url.search = "";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (target) {
    // The target may carry its own query — `resolveSignedInNext` returns the visitor's
    // destination intact, and blanking the search here would drop exactly the context this
    // branch exists to preserve. Parsed against the request's origin so a path and a path
    // with a query are handled the same way; `safeNext` has already proved it is relative.
    const url = new URL(target, request.nextUrl.origin);
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
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
