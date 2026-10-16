import { cookies, headers } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "@/types/supabase";
import { env } from "@/lib/env";

/**
 * Supabase client for Server Components, Route Handlers and Server Actions.
 *
 * The session lives in cookies written by @supabase/ssr, so every RSC in a protected
 * route group can read it without a client round-trip.
 *
 * Those cookies are not HttpOnly — the library leaves them readable so the browser
 * client can share the session. Treat the access token as XSS-reachable and rely on
 * RLS, not cookie flags, as the real access boundary.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(env.supabaseUrl, env.supabaseAnonKey, {
    global: { headers: await callerHeaders() },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component, where cookies are read-only. Safe to
          // ignore: web/proxy.ts refreshes the session on every request.
        }
      },
    },
  });
}

/**
 * The browser's user agent and address, passed on to Supabase (§3.9.6, 2026-10-16).
 *
 * Web sign-ins run HERE, on the server (`signInWithPassword` in a Server Action, `verifyOtp` in
 * `/auth/confirm`), so without this GoTrue records the server's own address and Node's user
 * agent on every web session, and the advisor's Login activity shows every traveler signing in
 * from the same machine. GoTrue takes the first `X-Forwarded-For` entry as the client.
 *
 * Only the FIRST forwarded hop, which Vercel sets from the real connection (a value a browser
 * sends is replaced, not trusted). Both are informational: nothing decides access on them.
 * Outside a request (a build, a script) there are no headers and nothing is added.
 */
async function callerHeaders(): Promise<Record<string, string>> {
  try {
    const h = await headers();
    const out: Record<string, string> = {};
    const ua = h.get("user-agent");
    const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim();
    if (ua) out["user-agent"] = ua.slice(0, 500);
    if (ip) out["x-forwarded-for"] = ip;
    return out;
  } catch {
    return {};
  }
}
