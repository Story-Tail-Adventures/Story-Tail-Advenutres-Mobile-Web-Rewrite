import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "@/types/supabase";
import { env } from "@/lib/env";
import {
  AUTH_FLAG_COOKIE,
  AUTH_FLAG_VALUE,
  authFlagAction,
} from "@/lib/auth/chrome-flag";

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

  if (signedIn && startsWithAny(pathname, AUTH_ONLY_PREFIXES)) return "/dashboard";
  // A signed-in traveler on the public front door (exactly "/") goes straight to their trips.
  if (signedIn && pathname === "/") return "/dashboard";
  return null;
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
    // Nobody can be signed in without Supabase, so clear any flag left over from a run that
    // had it configured. A no-op when there is none, which is the normal case.
    return applyAuthFlag(
      NextResponse.next({ request }),
      authFlagAction(request.cookies.get(AUTH_FLAG_COOKIE)?.value, false),
    );
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
  const signedIn = Boolean(user);
  const target = authRedirectFor(pathname, signedIn, await assuranceOf(supabase, user));

  // Publish the one bit the static public pages need (lib/auth/chrome-flag.ts). Done here
  // because getUser() above has already paid for the answer, and skipped entirely when it
  // would not change — otherwise every public page response carries a redundant Set-Cookie.
  const flag = authFlagAction(request.cookies.get(AUTH_FLAG_COOKIE)?.value, signedIn);

  if (target === "/login" || target === MFA_CHALLENGE) {
    const url = request.nextUrl.clone();
    url.pathname = target;
    url.search = "";
    url.searchParams.set("next", pathname);
    return applyAuthFlag(NextResponse.redirect(url), flag);
  }

  if (target) {
    const url = request.nextUrl.clone();
    url.pathname = target;
    url.search = "";
    return applyAuthFlag(NextResponse.redirect(url), flag);
  }

  return applyAuthFlag(supabaseResponse, flag);
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
      maxAge: 60 * 60 * 24,
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
