import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "@/types/supabase";
import { env } from "@/lib/env";

/** Route groups that require a signed-in user. */
const PROTECTED_PREFIXES = ["/dashboard", "/trips", "/account", "/agent"];

/** Auth screens a signed-in user should be bounced away from. */
const AUTH_ONLY_PREFIXES = ["/login", "/register", "/forgot-password"];

function startsWithAny(pathname: string, prefixes: string[]): boolean {
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
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

  if (!user && startsWithAny(pathname, PROTECTED_PREFIXES)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (user && startsWithAny(pathname, AUTH_ONLY_PREFIXES)) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
