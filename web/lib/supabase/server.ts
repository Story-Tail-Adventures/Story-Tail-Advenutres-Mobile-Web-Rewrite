import { cookies } from "next/headers";
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
