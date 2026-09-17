import { timingSafeEqual } from "node:crypto";

import { env } from "@/lib/env";
import { clientIp } from "@/lib/hotels/ratelimit";
import { parseHotelSearchBody, runHotelSearchPipeline } from "@/lib/public/hotels";

/**
 * Live hotel search over HTTP — the successor to `supabase/functions/hotel-search`. P2.
 *
 * ── WHO CALLS THIS ───────────────────────────────────────────────────────────────
 *
 * Nobody, today. The web surface calls `searchHotels()` in process and never comes through
 * here; the Compose app's Hotels rail (Screen Inventory 2.3.3) is not built. This exists
 * because the Edge Function was the mobile app's only way in, and moving the pipeline into
 * `web/` would otherwise have quietly deleted a door that a planned screen walks through.
 * Building it now, beside the move, is what keeps the deletion in the next PR honest.
 *
 * An unused endpoint still has to be safe, so it is written as if 2.3.3 shipped.
 *
 * ── WHY IT IS NOT A THIN PROXY OF ITS OWN ────────────────────────────────────────
 *
 * Everything below the caller check is `runHotelSearchPipeline`, the same function the page
 * calls, given the same validated `SearchInput`. The limiter, the budget, the cache and the
 * deadline are therefore not "the same rules" as the web path — they are the same code. Two
 * entry points that each enforced their own copy of a 250-a-month budget is exactly how a
 * metered feature gets spent twice.
 *
 * ── THE STATUS CODES ARE THE EDGE FUNCTION'S ─────────────────────────────────────
 *
 * 401 for a caller that is not us, 403 for a server that is not configured, 400 for a body
 * we will not forward, 429 from our own limiter with a Retry-After, 200 with a discriminant
 * for everything else — including every degraded state, because a client of this endpoint
 * must not show an error card when a third party is having a bad afternoon. A generated
 * Kotlin client written against the function's contract keeps working.
 *
 * Two deliberate differences:
 *   * A GET gets 405 from Next's router rather than the function's 403. Both refuse; the
 *     405 is the truthful one and it costs nothing, because the reason POST is required is
 *     cache-key stability (one serialisation of the filter arrays), not authentication.
 *   * 503 when the operator's kill switch is off — see below. The function had no such
 *     switch; `web/` does, and an endpoint that ignored it would be a way around it.
 *
 * ── NO CORS HEADERS, ON PURPOSE ──────────────────────────────────────────────────
 *
 * The Edge Function carried them because it lived on a different origin from everything and
 * the `_shared/cors.ts` preflight was the house pattern. The caller here is a native app,
 * which is not subject to CORS at all. Omitting the headers means a page on someone else's
 * origin cannot read a response even if it somehow obtained the token.
 */

/** The Edge Runtime is deprecated in Next 16 and `nodejs` is already the default; stated
 * anyway because this route is not portable to it — the pipeline holds a service-role key,
 * builds a Supabase client and talks to a metered provider on a 20s budget. */
export const runtime = "nodejs";

/**
 * Five seconds of headroom over the pipeline's own 15s deadline.
 *
 * The deadline is the thing that actually protects the provider budget (see
 * `HOTEL_SEARCH_DEADLINE_MS` in `lib/public/hotels.ts`): it declines to START a provider
 * attempt it cannot wait out, so no metered call is ever orphaned. This is the platform's
 * outer bound, and it MUST stay the larger of the two or it becomes the real timeout — a
 * platform kill lands mid-flight, which is the exact failure the deadline exists to
 * prevent. The gap covers the cache write that follows a successful provider call.
 *
 * It is a literal because Next requires route segment config to be statically analysable;
 * it cannot be derived from the constant it is paired with, so the two are kept in step by
 * this comment and the one over there.
 */
export const maxDuration = 20;

export async function POST(request: Request): Promise<Response> {
  // 1. THE CALLER, FIRST. Same order as the Edge Function, and for the same reason: a
  //    caller we have not authenticated learns nothing about our configuration, not even
  //    whether the feature is switched on.
  const expected = env.hotelSearchToken;
  if (!expected) {
    return problem(403, "Forbidden", "STA_HOTEL_SEARCH_TOKEN is not set. See supabase/README.md.");
  }
  const presented = request.headers.get("X-STA-Search-Token");
  if (!presented || !constantTimeEqual(presented, expected)) {
    return problem(401, "Unauthorized", "This endpoint is not called directly.");
  }

  // 2. THE KILL SWITCH. `HOTEL_SEARCH_ENABLED=false` takes the feature down for every
  //    entry point, or it is not a kill switch. Checked before anything is constructed.
  if (!env.hotelSearchEnabled) {
    return problem(503, "Service Unavailable", "Hotel search is switched off.");
  }

  // 3. CONFIGURATION. A missing provider key was a 403 in the function and stays one: it is
  //    "nobody configured this", which needs a different response from whoever reads the
  //    log than "the month is gone" does. The service-role key joins it — the pipeline
  //    cannot read its own cache without one (see lib/public/hotels.ts for why `web/` holds
  //    it at all), and failing here is clearer than failing inside a client constructor.
  const apiKey = env.serpApiKey;
  if (!apiKey) {
    return problem(403, "Forbidden", "SERPAPI_API_KEY is not set. See supabase/README.md.");
  }
  if (!env.supabaseConfigured || !env.supabaseServiceRoleKey) {
    return problem(403, "Forbidden", "Supabase is not configured for this deployment.");
  }

  // 4. THE BODY, validated before anything is spent. A 400 costs zero provider requests; a
  //    malformed query that reaches SerpApi costs one and cannot be refunded.
  const parsed = parseHotelSearchBody(await request.json().catch(() => null));
  if (!parsed.ok) return problem(400, "Bad Request", parsed.detail);

  try {
    // 5. The shared pipeline: service client → config → limiter → cache → budget →
    //    provider. `clientIp` reads the left-most x-forwarded-for entry, which on a
    //    platform edge is the device's address; `ratelimit.ts` hashes it with a server-only
    //    pepper before it is used as a key, so the raw address never reaches the database.
    //    No header at all lands in the shared "unknown" bucket, which is tighter — missing
    //    a header must not be the way around the limiter.
    const outcome = await runHotelSearchPipeline(parsed.input, {
      apiKey,
      ip: clientIp(request),
    });

    if (outcome.status === "rate_limited") {
      return problem(429, "Too Many Requests", "Too many searches from this caller.", {
        "Retry-After": String(outcome.retryAfter),
      });
    }

    return Response.json(outcome.response, {
      status: 200,
      // The pipeline's own six-hour cache is the one that matters, and it is keyed on the
      // canonical query rather than on a URL. A shared HTTP cache in front of a POST would
      // key on nothing useful and could serve one caller's rate-limit refusal to another.
      headers: { "Cache-Control": "no-store" },
    });
  } catch (cause) {
    // NOTHING HERE 500s WITH A REASON. The pipeline degrades internally — a spent budget, a
    // provider outage and a stale cache are all 200s with a discriminant — so reaching this
    // catch means our own infrastructure failed (no database, a bad client). The caller
    // gets a bare 503; the detail stays in the log, where it cannot describe our
    // configuration to a stranger. Never log the body: a destination plus dates is a
    // visitor's travel plan.
    console.error("[hotel-search] request failed", { cause: String(cause) });
    return problem(503, "Service Unavailable", "The hotel feed is unavailable.");
  }
}

/**
 * `application/problem+json`, matching `supabase/functions/_shared/problem.ts`.
 *
 * Reimplemented rather than imported: `supabase/` is a hard stack boundary (it is Deno, and
 * this is Node), and this PR leaves every byte of it alone. Four fields, so a client that
 * parsed the function's errors parses these.
 */
function problem(
  status: number,
  title: string,
  detail: string,
  headers: Record<string, string> = {},
): Response {
  return new Response(
    JSON.stringify({ type: "about:blank", title, status, detail }),
    {
      status,
      headers: { "Content-Type": "application/problem+json", ...headers },
    },
  );
}

/**
 * A shared secret compared in constant time.
 *
 * The Edge Function hand-rolled the XOR loop because that was the portable thing to do in
 * Deno. In Node the platform has the real primitive, so it is used: `timingSafeEqual` is
 * the same guarantee with none of the ways a hand-rolled loop gets optimised into an early
 * exit. It throws on a length mismatch, hence the guard — which does leak the length, as
 * the original's `if (left.length !== right.length) return false` also did. That is the
 * accepted residual: length-leaking on a value an attacker can retry is worth avoiding for
 * the CONTENT, and a token whose length is secret is not a design anyone relies on.
 */
function constantTimeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
