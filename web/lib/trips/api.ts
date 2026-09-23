import { env } from "@/lib/env";
import { callEdgeFunction, type EdgeCallResult } from "@/lib/supabase/edge";

/**
 * Calling a §2.2 Edge Function from a server action.
 *
 * Same shape and the same reasoning as `web/lib/onboarding/api.ts`: the tables these
 * functions touch have SELECT-only RLS and no write policy, so a PostgREST `.insert()` from
 * the browser would match nothing and quietly succeed. The caller's own access token is
 * forwarded and never the service-role key — that key does not exist in `web/` at all
 * (Data-Model §21.2).
 *
 * WHY THESE ARE SERVER ACTIONS and not fetches from the browser. The access token lives in
 * an httpOnly cookie; a client component cannot read it, and giving it one that could is a
 * worse trade than a round trip. It also means the one place that knows how to join a signed
 * path to an origin is server-side, next to the env that holds the origin.
 */

export type TripFunction =
  | "trip-message"
  | "trip-document"
  | "trip-document-url"
  | "testimonial"
  | "quote-request"
  // §2.4. Unlike the five above, these two are not a convenience over PostgREST — the
  // payment tables hold no client-role privilege at all, so they are the only path there is.
  | "payment-wallet"
  | "card-authorization";

export type TripCallResult = EdgeCallResult;

/**
 * The §2.x door onto [callEdgeFunction].
 *
 * The transport moved to `lib/supabase/edge.ts` when §3.2 needed a second door. This keeps
 * the union, so an agent route cannot be called through it and the type goes on meaning
 * what its comment says.
 */
export async function callTripFunction(
  fn: TripFunction,
  init: { method: "GET"; query: Record<string, string> } | { method: "POST"; body: Record<string, unknown> },
): Promise<TripCallResult> {
  return callEdgeFunction(fn, init, "trip");
}

/**
 * Join a signed storage path to the origin this deployment actually serves.
 *
 * `trip-document-url` returns a PATH on purpose — Storage signs against the origin the
 * function sees from inside its own container, which locally is `http://kong:8000` and
 * resolves nowhere in a browser. See `toStoragePath` in supabase/functions/_shared/trip.ts.
 * `env.supabaseUrl` is the public origin, which is exactly the missing half.
 */
export function absoluteStorageUrl(path: string): string {
  return new URL(path, env.supabaseUrl).toString();
}
