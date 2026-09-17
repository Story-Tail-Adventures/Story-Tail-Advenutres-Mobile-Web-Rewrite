/**
 * The service-role Supabase client for the four hotel-search tables. P2.
 *
 * THIS MODULE HOLDS THE MOST DANGEROUS CREDENTIAL IN THE REPO. `SUPABASE_SERVICE_ROLE_KEY`
 * bypasses RLS on every table in the project — client, payment_card, card_authorization,
 * commission, audit_event, all of it. A leak is not "someone can read the hotel cache", it
 * is a full read/write of the database. Everything below exists to keep that key on the
 * server and out of anything a browser can reach.
 *
 * ON THE REVERSAL — READ THIS BEFORE YOU "FIX" THE COMMENTS THAT CONTRADICT IT.
 * `web/lib/env.ts` and `web/.env.example` both say, in as many words, that the service-role
 * key must NEVER appear under `web/`, and `supabase/functions/hotel-search/index.ts` cites
 * that prohibition as the reason live hotel search was built as an Edge Function at all.
 * The owner reversed that prohibition deliberately, with the cost understood, in order to
 * move hotel search into Next.js. So:
 *   * This is a real widening of blast radius, not a technicality. The Edge Function ran the
 *     key in a Deno sandbox that serves one function; `web/` is a Next server that also
 *     renders the public marketing site. Any SSRF, any prototype-pollution, any dependency
 *     with a postinstall hook now shares a process with a key that owns the database.
 *   * What it buys is one runtime instead of two for the same request path: no second
 *     deploy target, no shared caller token to keep in step across two secret stores, no
 *     14-second client timeout racing a 12-second provider timeout across a network hop.
 *   * The prohibition is now scoped rather than absolute: the key belongs to THIS module and
 *     the hotel-search path that imports it. It is still wrong everywhere else in `web/`.
 *     Reads on behalf of a signed-in person go through `web/lib/supabase/server.ts`, which
 *     carries their cookies and gets RLS applied. If you reach for `serviceClient()` to make
 *     a query return rows, that is RLS working — fix the policy or the query.
 *
 * WHY THE SERVICE ROLE IS THE RIGHT CLIENT HERE, AND ONLY HERE.
 * The caller is nobody: an anonymous visitor on the public Explore surface (Screen 2.0.4,
 * Hotels mode). The four hotel tables — `hotel_search_config`, `hotel_search_cache`,
 * `hotel_api_request`, `hotel_search_rate_bucket` — have RLS on with zero policies, and
 * there is no predicate that could express "this anonymous visitor may read this cached
 * search" or "may decrement this shared budget". A rate limiter a caller can bypass by not
 * authenticating is not a rate limiter. So the bypass is the design, and the access control
 * lives in the code paths above it (`ratelimit.ts`, `budget.ts`) rather than in a policy.
 *
 * WHY `import "server-only"` IS THE FIRST LINE.
 * The previous guard was the env naming convention: no `NEXT_PUBLIC_` prefix, so Next never
 * inlines the value and a client component importing this would read `undefined`. That is a
 * real guard but it fails quietly and at runtime. `server-only` makes the same mistake a
 * BUILD error the moment a Client Component pulls this into its graph — which is what the
 * audit flagged as missing, and why the package is now a dependency instead of a note in
 * `web/lib/public/hotels.ts` saying it was not worth one. For a key of this blast radius it
 * plainly is.
 */
import "server-only";

// Not `@supabase/ssr`. That package's clients exist to read and write the session cookie;
// this one must never touch a visitor's session — it is not acting for them.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import { env } from "@/lib/env";

/**
 * Kept under exactly this name because the seven runtime modules were copied verbatim from
 * `supabase/functions/_shared/hotels/` with only their import specifiers edited, and they
 * all take a `Db`. Renaming it would turn a zero-diff move into a diff nobody can review.
 */
export type Db = SupabaseClient<Database>;

/**
 * One client per server process, built on first use.
 *
 * LAZY IS LOAD-BEARING, NOT TIDINESS. Building this at module scope would read the key —
 * and throw when it is absent — during `next build`, while the `(public)` route group is
 * being static-prerendered. The build machine has no service-role key and should not,
 * `.github/scripts/check_public_prerender.py` machine-checks that those routes stay static,
 * and the failure would arrive as a prerender error in a marketing page that has nothing to
 * do with hotels. Reading the environment inside the function means the key is required at
 * request time, on the one path that actually needs it.
 *
 * Memoised because supabase-js warns about multiple client instances in one process, and
 * because there is nothing per-request to vary: no cookies, no session, no `Authorization`
 * header. Re-reading `process.env` on every search would buy nothing.
 *
 * The cost is that a test cannot flip the environment between cases against a warm
 * module. No reset seam is exported yet because nothing needs one — add one when a suite
 * does, rather than shipping an exported mutator on the module that holds this key on spec.
 */
let client: Db | null = null;

export function serviceClient(): Db {
  if (client) return client;

  client = createClient<Database>(env.supabaseUrl, serviceRoleKey(), {
    // No session to persist and no token to refresh — this client authenticates as the
    // project, not as a person. Left on, supabase-js would start a refresh timer per
    // process for a session that will never exist.
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}

/**
 * Read the key, or fail with something a human can act on.
 *
 * FAIL RATHER THAN CONSTRUCT A BROKEN CLIENT. `createClient` accepts an empty string
 * happily and every query then comes back as a PostgREST 401 — which `budget.ts` and
 * `search.ts` are built to swallow into a quiet "the hotel feed is unavailable", because
 * that is the right answer when a third party is having a bad afternoon. A misconfiguration
 * would wear that same costume forever and nobody would look. Throwing here means the
 * hotel-search entry point logs one unmistakable line instead.
 *
 * THE MESSAGE NAMES THE VARIABLE AND NEVER THE VALUE. Nothing in this file interpolates,
 * logs, or returns the key — not in an error, not in a debug branch, not in a thrown cause.
 * A secret that reaches a log line has leaked to every system that ingests that log.
 */
function serviceRoleKey(): string {
  const value = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!value) {
    throw new Error(
      "Missing SUPABASE_SERVICE_ROLE_KEY. Hotel search reads and writes the four " +
        "hotel_* tables, which have RLS on with no policies, so it cannot run as the " +
        "anon role. Get the value from `supabase status` locally, and set it as a " +
        "server-side (NOT NEXT_PUBLIC_) environment variable in the deployment.",
    );
  }
  return value;
}
