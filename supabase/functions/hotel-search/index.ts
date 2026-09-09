/**
 * Live hotel search for the public Explore surface (Screen 2.0.4, Hotels mode). P2.
 *
 * Roles: none — the caller is our own Next.js server, acting for an anonymous visitor.
 * Sensitive mutation: no (own cache, own ledger, own counters).
 * MFA step-up: not required.
 *
 * THIS IS THE FIRST FUNCTION HERE WITH NO HUMAN BEHIND IT AND NO SERVICE ROLE IN FRONT,
 * and it answers the question 20260909001124 deferred "to the search work". Neither of that
 * migration's two candidates applies: there is no catalog table to grant `anon` a policy
 * on, and a service-role read from `web/` is barred outright — `web/lib/env.ts` and
 * `.env.example` both say the service-role key must never appear under `web/`.
 *
 * So the posture is:
 *   * `verify_jwt = true`, unchanged from every neighbour. The caller presents the project
 *     anon key, which is a valid JWT, so the gateway is satisfied. There is no CORS
 *     preflight to be eaten because the caller is a server, not a browser.
 *   * THE ANON KEY AUTHENTICATES NOBODY. It is inlined into the browser bundle. So the real
 *     credential is `X-STA-Search-Token`, which is server-only on both ends. Missing config
 *     fails closed, the way cruise-sync does with its provider key.
 *   * `serviceClient()` for the database, because the caller is nobody: the four hotel
 *     tables have RLS on with zero policies and there is no predicate that could express
 *     "this anonymous visitor may read this cached search".
 *
 * NOTHING HERE 500s AT A VISITOR. Every degraded path is a 200 with a discriminant, because
 * the public surface must not show an error card when a third party is having a bad
 * afternoon. The one exception is a refusal by the rate limiter, which is an honest 429.
 */
import { corsHeaders, handlePreflight } from "../_shared/cors.ts";
import { serviceClient } from "../_shared/db.ts";
import { badRequest, forbidden, problem, unauthorized } from "../_shared/problem.ts";
import { readConfig } from "../_shared/hotels/budget.ts";
import type { SearchInput } from "../_shared/hotels/cache.ts";
import { bucketKey, clientIp, retryAfterSeconds, takeTokens } from "../_shared/hotels/ratelimit.ts";
import { runSearch } from "../_shared/hotels/search.ts";

const MAX_NIGHTS = 30;
const MAX_DAYS_AHEAD = 500;

Deno.serve(async (req: Request) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  try {
    if (req.method !== "POST") {
      // POST rather than GET so the filter arrays cannot be serialised two ways by two
      // callers — which is precisely the cache-key hazard this design is built around. It
      // also stops a link preview or a prefetch spending a request.
      return problem(forbidden("Use POST to search."));
    }

    requireCallerToken(req);

    const apiKey = Deno.env.get("SERPAPI_API_KEY");
    if (!apiKey) {
      // Distinguished from a spent budget on purpose: "nobody configured this" and "the
      // month is gone" need different responses from whoever reads the log.
      return problem(forbidden("SERPAPI_API_KEY is not set. See supabase/README.md."));
    }

    const input = parseBody(await req.json().catch(() => null));
    const db = serviceClient();
    const config = await readConfig(db);

    // Rate limit BEFORE the budget, and both before the provider. A caller cannot spend our
    // month by looping, whatever else is true.
    const pepper = Deno.env.get("HOTEL_SEARCH_IP_PEPPER") ?? "";
    const key = await bucketKey(clientIp(req), pepper);
    const verdict = await takeTokens(db, key, {
      minute: config.ratePerMinute,
      hour: config.ratePerHour,
      day: config.ratePerDay,
    });
    if (!verdict.allowed && verdict.refusedBy) {
      const retry = retryAfterSeconds(verdict.refusedBy);
      return new Response(
        JSON.stringify({
          type: "about:blank",
          title: "Too Many Requests",
          status: 429,
          detail: "Too many searches from this caller.",
        }),
        {
          status: 429,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/problem+json",
            "Retry-After": String(retry),
          },
        },
      );
    }

    const result = await runSearch(input, { db, apiKey, config });

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return problem(err);
  }
});

/**
 * The caller is our own server, and this is what says so.
 *
 * Compared with `timingSafeEqual`-style care elsewhere: this is a shared secret compared in
 * constant time, because a length-leaking compare on a value an attacker can retry is worth
 * avoiding even when the practical risk is small.
 */
function requireCallerToken(req: Request): void {
  const expected = Deno.env.get("HOTEL_SEARCH_CALLER_TOKEN");
  if (!expected) {
    throw forbidden("HOTEL_SEARCH_CALLER_TOKEN is not set. See supabase/README.md.");
  }
  const presented = req.headers.get("X-STA-Search-Token");
  if (!presented || !constantTimeEqual(presented, expected)) {
    throw unauthorized("This endpoint is not called directly.");
  }
}

function constantTimeEqual(a: string, b: string): boolean {
  const left = new TextEncoder().encode(a);
  const right = new TextEncoder().encode(b);
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) diff |= left[i] ^ right[i];
  return diff === 0;
}

/**
 * Validate everything before anything is spent.
 *
 * A 400 costs zero provider requests; a malformed query that reaches SerpApi costs one and
 * cannot be refunded. Same reasoning as cruise-sync's `readBody`: a bad id must never reach
 * the provider.
 */
export function parseBody(body: unknown): SearchInput {
  const fields = (body ?? {}) as Record<string, unknown>;

  const destination = text(fields.destination, 60);
  if (!destination) throw badRequest("destination is required.");

  const checkIn = isoDate(fields.checkIn);
  const checkOut = isoDate(fields.checkOut);
  if (!checkIn || !checkOut) throw badRequest("checkIn and checkOut must be YYYY-MM-DD.");

  const nights = Math.round(
    (Date.parse(`${checkOut}T12:00:00Z`) - Date.parse(`${checkIn}T12:00:00Z`)) / 86_400_000,
  );
  if (nights < 1) throw badRequest("checkOut must be after checkIn.");
  if (nights > MAX_NIGHTS) throw badRequest(`A stay may be at most ${MAX_NIGHTS} nights.`);

  const today = new Date().toISOString().slice(0, 10);
  if (checkIn < today) throw badRequest("checkIn is in the past.");
  const horizon = new Date(Date.now() + MAX_DAYS_AHEAD * 86_400_000).toISOString().slice(0, 10);
  if (checkIn > horizon) throw badRequest("checkIn is too far ahead to price.");

  return {
    destination,
    checkIn,
    checkOut,
    adults: clamp(fields.adults, 1, 8, 2),
    childrenAges: ages(fields.childrenAges),
    currency: "USD",
    sortBy: allowed(fields.sortBy, ["3", "8", "13"]),
    rating: allowed(fields.rating, ["7", "8", "9"]),
    hotelClass: allowedList(fields.hotelClass, ["2", "3", "4", "5"]),
    amenities: allowedList(fields.amenities, AMENITY_IDS),
    propertyTypes: allowedList(fields.propertyTypes, PROPERTY_TYPE_IDS),
    minPrice: bounded(fields.minPrice),
    maxPrice: bounded(fields.maxPrice),
    freeCancellation: fields.freeCancellation === true,
  };
}

/**
 * Google's amenity and property-type ids, allow-listed so an arbitrary value cannot be
 * forwarded. The ones the Hotels rail actually offers, per Screen Inventory 2.3.3's
 * "price, star rating, amenities" grouping:
 *   6 Pool · 10 Spa · 11 Beach access · 12 Child-friendly · 52 All-inclusive available
 *   9 Free breakfast · 35 Free Wi-Fi · 53 Wheelchair accessible · 19 Pet-friendly
 */
const AMENITY_IDS = ["6", "9", "10", "11", "12", "19", "35", "52", "53"];
/** 12 Beach hotels · 13 Boutique · 17 Resorts · 18 Spa hotels · 19 B&B · 21 Apartment hotels */
const PROPERTY_TYPE_IDS = ["12", "13", "17", "18", "19", "21"];

function text(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/[\p{Cc}]/gu, " ").replace(/\s+/g, " ").trim().slice(0, max);
  return cleaned || null;
}

function isoDate(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split("-").map(Number);
  // Round-trip: 2026-02-30 parses into March 2 and would otherwise be forwarded.
  const date = new Date(Date.UTC(y, m - 1, d, 12));
  const real = date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 &&
    date.getUTCDate() === d;
  return real ? value : null;
}

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === "number" ? Math.round(value) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function ages(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => (typeof v === "number" ? Math.round(v) : NaN))
    .filter((n) => Number.isFinite(n) && n >= 0 && n <= 17)
    .slice(0, 6);
}

function allowed(value: unknown, values: string[]): string {
  return typeof value === "string" && values.includes(value) ? value : "";
}

function allowedList(value: unknown, values: string[]): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((v): v is string => typeof v === "string" && values.includes(v)))];
}

function bounded(value: unknown): number | null {
  const n = typeof value === "number" ? Math.round(value) : NaN;
  if (!Number.isFinite(n) || n < 0 || n > 100_000) return null;
  return n;
}
