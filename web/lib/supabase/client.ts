"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/supabase";
import { env } from "@/lib/env";

/**
 * Supabase client for Client Components.
 *
 * Prefer the server client wherever possible — a Server Action or RSC keeps passwords
 * and query logic off the client entirely. Use this one for realtime subscriptions and
 * browser-only reads, which genuinely need a browser-side session.
 */
export function createClient() {
  return createBrowserClient<Database>(env.supabaseUrl, env.supabaseAnonKey);
}
