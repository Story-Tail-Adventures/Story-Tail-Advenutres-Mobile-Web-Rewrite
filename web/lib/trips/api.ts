import { env } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

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
  | "quote-request";

export type TripCallResult =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; kind: "unauthenticated" | "rejected" | "unavailable"; detail?: string };

export async function callTripFunction(
  fn: TripFunction,
  init: { method: "GET"; query: Record<string, string> } | { method: "POST"; body: Record<string, unknown> },
): Promise<TripCallResult> {
  if (env.authChecksDisabledForLocalDev) {
    return { ok: false, kind: "unavailable" };
  }

  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    return { ok: false, kind: "unauthenticated" };
  }

  const url = new URL(`${env.supabaseUrl}/functions/v1/${fn}`);
  if (init.method === "GET") {
    for (const [key, value] of Object.entries(init.query)) url.searchParams.set(key, value);
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: init.method,
      headers: {
        apikey: env.supabaseAnonKey,
        Authorization: `Bearer ${session.access_token}`,
        ...(init.method === "POST" ? { "Content-Type": "application/json" } : {}),
      },
      ...(init.method === "POST" ? { body: JSON.stringify(init.body) } : {}),
    });
  } catch (cause) {
    // Never log the body: it is a traveler's message text or a document filename.
    console.warn("[trip] request failed", { fn, cause: String(cause) });
    return { ok: false, kind: "unavailable" };
  }

  if (response.ok) {
    return { ok: true, data: (await response.json().catch(() => ({}))) as Record<string, unknown> };
  }

  if (response.status === 401 || response.status === 403) {
    return { ok: false, kind: "unauthenticated" };
  }

  if (response.status >= 400 && response.status < 500) {
    let detail: string | undefined;
    try {
      const body = (await response.json()) as { detail?: unknown };
      if (typeof body.detail === "string") detail = body.detail;
    } catch {
      /* not a problem+json body */
    }
    return { ok: false, kind: "rejected", detail };
  }

  console.warn("[trip] function failed", { fn, status: response.status });
  return { ok: false, kind: "unavailable" };
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
