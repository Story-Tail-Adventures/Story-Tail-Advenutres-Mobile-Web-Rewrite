/**
 * Supabase clients for Edge Functions.
 *
 * The distinction between these two is the whole point of the file.
 */
// Bare specifier, resolved by supabase/functions/deno.json. An inline "jsr:" prefix
// pins the version at the import site, so upgrading means editing every file.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types.ts";

export type Db = SupabaseClient<Database>;

function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing ${name} in the function environment.`);
  return value;
}

/**
 * A client acting as the CALLER. RLS applies.
 *
 * This is the default. If a query returns nothing you did not expect, that is usually
 * RLS doing its job — fix the policy or the query, don't reach for serviceClient().
 */
export function userClient(req: Request): Db {
  const authorization = req.headers.get("Authorization") ?? "";
  return createClient<Database>(
    requireEnv("SUPABASE_URL"),
    requireEnv("SUPABASE_ANON_KEY"),
    {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}

/**
 * A client that BYPASSES RLS entirely.
 *
 * Legitimate uses are narrow: writing `audit_event` (which has no insert policy by
 * design), and handling Stripe tokens. Everything else should use `userClient`.
 *
 * Every call site needs a comment saying why the caller's own permissions are not
 * enough — `supabase-reviewer` flags the ones that don't have it.
 */
export function serviceClient(): Db {
  return createClient<Database>(
    requireEnv("SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
