import { headers } from "next/headers";
import { z } from "zod";
import type { Currency } from "@/content/public/types";
import { env } from "@/lib/env";
import { readConfig } from "@/lib/hotels/budget";
import type { SearchInput } from "@/lib/hotels/cache";
import { serviceClient } from "@/lib/hotels/db";
import { bucketKey, clientIp, retryAfterSeconds, takeTokens } from "@/lib/hotels/ratelimit";
import { providerFetch } from "@/lib/hotels/provider-fetch";
import { runSearch } from "@/lib/hotels/search";
import type { HotelSearchResponse } from "@/lib/hotels/types";
import { MAX_BOOKING_DAYS_AHEAD, MAX_STAY_NIGHTS } from "@/lib/public/search";

/**
 * The public hotel type, and the one place the app RUNS a hotel search.
 *
 * ── WHAT CHANGED, AND WHAT IT COST ───────────────────────────────────────────────
 *
 * This module used to POST to `supabase/functions/hotel-search`. It now runs the same
 * pipeline in process: `@/lib/hotels/*` is that function's `_shared/hotels/*` copied across
 * verbatim (only the import specifiers differ), so the cache, the ledger, the limiter, the
 * budget and the provider client are the same code doing the same things in the same order
 * — one HTTP hop shorter.
 *
 * THE PRICE IS THE SERVICE-ROLE KEY, AND IT IS A DELIBERATE REVERSAL. The four hotel tables
 * have RLS on with zero policies and no predicate that could express "this anonymous
 * visitor may read this cached search", so the pipeline needs a client that bypasses RLS.
 * `web/lib/env.ts` and `web/.env.example` say — still, at the time of writing — that
 * `SUPABASE_SERVICE_ROLE_KEY` must NEVER appear under `web/`; that prohibition was written
 * when the only thing on this side of the wire was a browser bundle and a thin server that
 * proxied to functions. The owner reversed it knowingly for this feature: `web/` now holds
 * the key, and anything that runs in this process can reach every row in the database.
 *
 * So the honest statement of the new posture is:
 *   * The key is a server-only env var. It is NOT `NEXT_PUBLIC_`, it is never read from a
 *     client component, and its value is never logged — only its presence, and only in the
 *     not-configured warning below.
 *   * Nothing here hands a caller a query. `runHotelSearchPipeline` accepts a validated
 *     `SearchInput` and touches exactly the four hotel tables the modules under
 *     `@/lib/hotels` name. There is no generic "run this against the database" surface.
 *   * The blast radius is honest and larger than it was: an RCE or an SSRF in the web app
 *     now reads the whole database rather than the public schema an anon key can see. That
 *     is the trade, and it belongs in a threat model rather than in a comment that pretends
 *     the wall is still there.
 *
 * ── SERVER-SIDE BY CONSTRUCTION, not by convention ───────────────────────────────
 *
 * This module reads `STA_HOTEL_SEARCH_TOKEN`, `SERPAPI_API_KEY`, `HOTEL_SEARCH_IP_PEPPER`
 * and (through `@/lib/hotels/db`) `SUPABASE_SERVICE_ROLE_KEY`. Two things keep them here.
 *
 * The naming convention is the first: no `NEXT_PUBLIC_` prefix on any of them, so Next
 * never inlines a value, and a client component that imported this would read `undefined`
 * and get a quiet "unavailable" rather than a leaked secret. That guard is real, but it
 * fails at runtime and silently.
 *
 * `@/lib/hotels/db` is the second and the stronger one: its first line is
 * `import "server-only"`, which makes pulling this module into a Client Component's graph a
 * BUILD error rather than a mystery. It arrives transitively — every path through this file
 * reaches the service client — which is why there is no second copy of that import here.
 *
 * THE TYPE HAS NOWHERE TO PUT A BOOKING SITE. There is no `source`, no `link`, no `logo`,
 * no `prices[]`, no `bookingUrl` — so no JSX can render one, whatever the provider sends.
 * That is Free-Travel-APIs §10.2's technique ("the cleanest enforcement is structural"),
 * pointed at the field that actually matters here: §1.3.5 says this site may promote the
 * advisor's travel business and nothing else.
 *
 * The zod schema below is the second line, and it strips rather than throws. `.strict()`
 * would take the page down the day the provider adds a field; stripping silently discards
 * it, which is the behaviour a public marketing page wants. It is worth MORE now than it
 * was over the wire, not less: the pipeline's own `HotelResult` is a TypeScript type, and a
 * TypeScript type erases at runtime. The zod pass is the only thing that still exists when
 * `map.ts` gains a field.
 */

/**
 * Hosts whose images we will point a visitor's browser at.
 *
 * Repeated from the pipeline's mapper ON PURPOSE. `web/next.config.ts` registers a CUSTOM
 * image loader, and a custom loader means `remotePatterns` is never consulted — any URL
 * that reaches `<Image src>` is fetched by the visitor's browser from whatever origin we
 * named. So the guarantee has to hold even if `@/lib/hotels/map.ts` changes, and that file
 * is a verbatim copy of provider-shaped code that will be re-synced when the provider moves.
 * The cheapest way to make the guarantee hold is to check it again here.
 */
const IMAGE_HOSTS = new Set([
  "lh3.googleusercontent.com",
  "lh4.googleusercontent.com",
  "lh5.googleusercontent.com",
  "lh6.googleusercontent.com",
  "encrypted-tbn0.gstatic.com",
  "encrypted-tbn1.gstatic.com",
  "encrypted-tbn2.gstatic.com",
  "encrypted-tbn3.gstatic.com",
  "streetviewpixels-pa.googleapis.com",
]);

function isAllowedImage(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && IMAGE_HOSTS.has(parsed.hostname);
  } catch {
    return false;
  }
}

const rateSchema = z.object({
  // Integer cents as a string on the wire — CLAUDE.md rule 5. Parsed to a number here,
  // once, at the edge.
  amountCents: z.string().regex(/^\d+$/),
  currency: z.literal("USD"),
  basis: z.literal("night"),
  beforeTaxesFees: z.boolean(),
});

const hotelSchema = z.object({
  id: z.string().min(1).max(220),
  propertyToken: z.string().max(220).nullable(),
  name: z.string().min(1).max(200),
  description: z.string().max(700).nullable(),
  propertyType: z.string().max(80).nullable(),
  hotelClass: z.number().int().min(1).max(5).nullable(),
  overallRating: z.number().min(0).max(5).nullable(),
  reviewCount: z.number().int().min(0).nullable(),
  location: z.object({ latitude: z.number(), longitude: z.number() }).nullable(),
  checkInTime: z.string().max(20).nullable(),
  checkOutTime: z.string().max(20).nullable(),
  amenities: z.array(z.string().max(80)).max(12),
  images: z.array(z.object({ url: z.string().url() })).max(6),
  ecoCertified: z.boolean(),
  rate: rateSchema.nullable(),
});

const responseSchema = z.object({
  version: z.number().int(),
  currency: z.literal("USD"),
  totalAvailable: z.number().int().nullable(),
  results: z.array(hotelSchema),
  hasMore: z.literal(false),
  source: z.enum(["live", "cache", "stale"]),
  degraded: z.enum(["budget_exhausted", "provider_unavailable"]).nullable(),
  asOf: z.string(),
  staleAsOf: z.string().nullable(),
  query: z.object({
    destination: z.string(),
    checkIn: z.string(),
    checkOut: z.string(),
    adults: z.number().int(),
    nights: z.number().int(),
  }),
});

export interface PublicHotel {
  id: string;
  propertyToken: string | null;
  name: string;
  description: string | null;
  propertyType: string | null;
  hotelClass: number | null;
  rating: number | null;
  reviewCount: number | null;
  amenities: string[];
  photos: string[];
  ecoCertified: boolean;
  /** Integer cents, or null when the provider gave no parseable figure. */
  nightlyCents: number | null;
  currency: Currency;
}

/**
 * Four outcomes, as a discriminated union so the page's branch is exhaustive and a new
 * state becomes a type error rather than a blank section.
 */
export type HotelSearchResult =
  | { status: "ok"; hotels: PublicHotel[]; asOf: string; stale: string | null; total: number | null }
  | { status: "empty" }
  | { status: "budget_exhausted" }
  | { status: "unavailable" };

export interface HotelSearchArgs {
  destination: string;
  checkIn: string;
  checkOut: string;
  adults: number;
  hotelClass: string[];
  amenities: string[];
  minPrice: number | null;
  maxPrice: number | null;
  sortBy: string;
}

/** The allow-listed keys of a parsed hotel — asserted by a test, so widening is visible. */
export const HOTEL_KEYS = [
  "amenities",
  "currency",
  "description",
  "ecoCertified",
  "hotelClass",
  "id",
  "name",
  "nightlyCents",
  "photos",
  "propertyToken",
  "propertyType",
  "rating",
  "reviewCount",
] as const;

export function toPublicHotel(parsed: z.infer<typeof hotelSchema>, currency: Currency): PublicHotel {
  return {
    id: parsed.id,
    propertyToken: parsed.propertyToken,
    name: parsed.name,
    description: parsed.description,
    propertyType: parsed.propertyType,
    hotelClass: parsed.hotelClass,
    rating: parsed.overallRating,
    reviewCount: parsed.reviewCount,
    amenities: parsed.amenities,
    // Checked again here — see IMAGE_HOSTS.
    photos: parsed.images.map((i) => i.url).filter(isAllowedImage),
    ecoCertified: parsed.ecoCertified,
    nightlyCents: parsed.rate ? Number(parsed.rate.amountCents) : null,
    currency: parsed.rate?.currency ?? currency,
  };
}

/** Parse a raw pipeline response into the public shape. Exported for tests. */
export function parseSearchResponse(raw: unknown): HotelSearchResult {
  const parsed = responseSchema.safeParse(raw);
  if (!parsed.success) return { status: "unavailable" };

  const body = parsed.data;
  if (body.degraded === "budget_exhausted" && body.results.length === 0) {
    return { status: "budget_exhausted" };
  }
  if (body.degraded === "provider_unavailable" && body.results.length === 0) {
    return { status: "unavailable" };
  }
  if (body.results.length === 0) return { status: "empty" };

  return {
    status: "ok",
    hotels: body.results.map((r) => toPublicHotel(r, body.currency)),
    asOf: body.asOf,
    stale: body.staleAsOf,
    total: body.totalAvailable,
  };
}

/**
 * The two provider-side secrets, read through `@/lib/env` like every other variable here.
 *
 * An earlier draft of this file read them from `process.env` directly, on the grounds that
 * env.ts's header still forbade what this feature now does. That header has since been
 * rewritten and the getters added, so the duplicate reads were removed: one accessor is
 * what makes "what does this read from the environment?" answerable, and web/README.md
 * claims exactly that. Neither value is ever logged, only its presence.
 *
 * The one deliberate exception is web/lib/hotels/db.ts, which reads
 * SUPABASE_SERVICE_ROLE_KEY itself — it sits behind `import "server-only"`, which is a
 * stronger guard than this module can offer, and that is where the key belongs.
 */
function providerKey(): string | null {
  return env.serpApiKey;
}

/**
 * Empty string is the documented default, not a misconfiguration: `bucketKey` hashes the
 * address with it, and an unpeppered digest is still a digest. It weakens the "cannot be
 * enumerated back to an address" property, which is why the env var exists, but it must not
 * take the feature down.
 */
function ipPepper(): string {
  return env.hotelSearchIpPepper;
}

/** Everything the pipeline needs from the environment, in one place for the warning below. */
function configuration() {
  return {
    enabled: env.hotelSearchEnabled,
    callerToken: env.hotelSearchToken,
    supabase: env.supabaseConfigured,
    // PRESENCE ONLY. This is the key that bypasses RLS; it must not reach a log line even
    // truncated, because a truncated service-role JWT still names the project and the role.
    serviceRole: Boolean(env.supabaseServiceRoleKey),
    apiKey: providerKey(),
  };
}

/* ────────────────────────────────────────────────────────────────────────────────
 * Request validation — a port of `parseBody` in supabase/functions/hotel-search/index.ts.
 * ──────────────────────────────────────────────────────────────────────────────── */

/**
 * Validate everything before anything is spent.
 *
 * Carried over from the Edge Function with its reasoning intact: a rejection costs zero
 * provider requests; a malformed query that reaches SerpApi costs one and cannot be
 * refunded. The function's copy is still there and still byte-identical — this PR moves the
 * runtime, it does not delete the function — so for one release the rules exist twice. The
 * duplicate goes when the function does.
 *
 * TOTAL, NOT THROWING, which is the one deliberate departure from the original. The Edge
 * Function threw `badRequest` and turned it into a 400 at the boundary; in process there is
 * no boundary to throw at, and `searchHotels` may not throw at all. Returning the reason
 * lets the page log it and the route handler render it as the same 400 with the same text.
 *
 * TWO BOUNDS ARE NOW SHARED RATHER THAN MIRRORED. `MAX_STAY_NIGHTS` and
 * `MAX_BOOKING_DAYS_AHEAD` come from `@/lib/public/search`, which is the file whose comment
 * warns that they "MUST NOT EXCEED" the function's constants — they once differed (550 vs
 * 500) and a stay in the gap passed validation in the UI and was rejected upstream. Deno
 * could not import from `web/`, so the only available fix was a comment. In one runtime it
 * is an import, and the class of bug is gone.
 */
export type ParsedSearchBody =
  | { ok: true; input: SearchInput }
  | { ok: false; detail: string };

export function parseHotelSearchBody(body: unknown): ParsedSearchBody {
  const fields = (body ?? {}) as Record<string, unknown>;

  const destination = text(fields.destination, 60);
  if (!destination) return { ok: false, detail: "destination is required." };

  const checkIn = isoDate(fields.checkIn);
  const checkOut = isoDate(fields.checkOut);
  if (!checkIn || !checkOut) {
    return { ok: false, detail: "checkIn and checkOut must be YYYY-MM-DD." };
  }

  const nights = Math.round(
    (Date.parse(`${checkOut}T12:00:00Z`) - Date.parse(`${checkIn}T12:00:00Z`)) / 86_400_000,
  );
  if (nights < 1) return { ok: false, detail: "checkOut must be after checkIn." };
  if (nights > MAX_STAY_NIGHTS) {
    return { ok: false, detail: `A stay may be at most ${MAX_STAY_NIGHTS} nights.` };
  }

  // UTC, as the Edge Function computed it. NOT `SEARCH_TIME_ZONE`, even though the page's
  // own `parseStay` uses the Orlando day and this one does not: a stay starting today, read
  // late on a US evening, is already past midnight in UTC and is rejected here after the UI
  // accepted it. That mismatch is not new and fixing it LOOSENS validation, so it is a
  // decision for the owner rather than a free ride on a runtime move.
  const today = new Date().toISOString().slice(0, 10);
  if (checkIn < today) return { ok: false, detail: "checkIn is in the past." };
  const horizon = new Date(Date.now() + MAX_BOOKING_DAYS_AHEAD * 86_400_000)
    .toISOString()
    .slice(0, 10);
  if (checkIn > horizon) return { ok: false, detail: "checkIn is too far ahead to price." };

  return {
    ok: true,
    input: {
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
    },
  };
}

/**
 * Google's amenity and property-type ids, allow-listed so an arbitrary value cannot be
 * forwarded. The ones the Hotels rail actually offers, per Screen Inventory 2.3.3's
 * "price, star rating, amenities" grouping:
 *   6 Pool · 10 Spa · 11 Beach access · 12 Child-friendly · 52 All-inclusive available
 *   9 Free breakfast · 35 Free Wi-Fi · 53 Wheelchair accessible · 19 Pet-friendly
 *
 * A SUPERSET of `AMENITY_IDS` in `@/lib/public/search`, which is the five the rail draws.
 * The two are not the same list on purpose — this one is what the provider may be asked
 * for, that one is what a visitor may click — so they are not shared the way the stay
 * bounds above are.
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

function allowedList(value: unknown, values: readonly string[]): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((v): v is string => typeof v === "string" && values.includes(v)))];
}

function bounded(value: unknown): number | null {
  const n = typeof value === "number" ? Math.round(value) : NaN;
  if (!Number.isFinite(n) || n < 0 || n > 100_000) return null;
  return n;
}

/* ────────────────────────────────────────────────────────────────────────────────
 * The deadline.
 * ──────────────────────────────────────────────────────────────────────────────── */

/**
 * One provider attempt's own ceiling. MUST MATCH `DEFAULT_TIMEOUT_MS` in
 * `@/lib/hotels/client.ts`, which does not export it. Copied rather than imported because
 * that file is a verbatim copy of the function's client and this PR does not edit it; if
 * the two ever drift, this number being the LARGER one is the safe direction (we would
 * decline to start an attempt we could in fact have afforded).
 */
const PROVIDER_ATTEMPT_MS = 12_000;

/**
 * The whole pipeline's wall-clock budget, from the first database read to the last
 * provider byte.
 *
 * ── WHY THE OLD NUMBER CANNOT SURVIVE THE MOVE ───────────────────────────────────
 *
 * Over the wire this was `AbortSignal.timeout(14_000)` around an HTTP hop, and the comment
 * it replaces told the story of getting that number wrong: it was 6s against a function
 * that allows 12s per provider attempt, so every cold search was cut off mid-flight and
 * shown as "the hotel feed is quiet", a retry looked like a fix because the abandoned
 * request had warmed the six-hour cache, and we were billed for the call either way.
 *
 * In process that abort means something worse. There is no server left running behind it to
 * finish the work and fill the cache: aborting is just killing a metered call we have
 * already committed to and throwing the answer away. The provider chain is up to three
 * attempts (1 + 2 retries) of 12s with 0.5s and 1s of backoff between them — about 37s of
 * worst case — so "wrap it in an outer abort" would orphan a billed call on a bad afternoon,
 * every time.
 *
 * ── WHAT WE DO INSTEAD ───────────────────────────────────────────────────────────
 *
 * Bound the chain, not the caller. `runSearch` takes an injected `fetchImpl` and `sleep`
 * (they exist so tests are deterministic; nothing else passes them in production), and that
 * is enough to enforce a deadline from INSIDE the chain without editing a single line of
 * the copied modules:
 *
 *   * `deadlineFetch` refuses to START an attempt that cannot finish inside the budget. It
 *     never aborts one that is already running. So we never pay for an answer we discard —
 *     the only calls we abandon are ones the client's own 12s timeout was going to abandon
 *     anyway.
 *   * `deadlineSleep` collapses the backoff once the next attempt is unaffordable. Sleeping
 *     1s to then decline is pure latency on a visitor's page.
 *
 * A declined attempt surfaces to `client.ts` as a `network_error`, which is exactly what it
 * is, and `search.ts` degrades it the way it degrades any provider failure: stale cache
 * inside the grace window, otherwise an empty result with `degraded: "provider_unavailable"`.
 * No new code path, no new state for the page to render.
 *
 * ── WHY 15 SECONDS ───────────────────────────────────────────────────────────────
 *
 * Because a dispatch needs 12s of room, the real control is the cutoff at
 * `deadline − PROVIDER_ATTEMPT_MS` — three seconds in. Before it an attempt may start,
 * after it none may, and the worst case is therefore a dispatch at t=3s ending at t=15s.
 *
 * That gives the shape we want out of the retry chain for free:
 *   * A slow first attempt gets ONE try. It times out at ~12s, the cutoff is long past, and
 *     the retry is declined instead of making a visitor wait 12s more for the same answer
 *     from the same unhappy provider.
 *   * A fast failure gets the full three. Two immediate 500s land inside the cutoff with
 *     their 0.5s and 1s backoffs, and the third attempt still has its whole 12s.
 * A retry is worth what it costs when the failure was cheap, and not when it was expensive;
 * nothing in the chain had to learn that rule, it falls out of one number.
 *
 * 15s also keeps the visitor's wait roughly where the old 14s `AbortSignal.timeout` put it,
 * which matters: the Suspense skeleton in 2.0.4 was tuned against that, and this is meant to
 * be the same wait enforced from a place that does not throw away what it paid for.
 *
 * The one case it makes worse is a hanging `account.json` poll — free, and only made above
 * 85% of the monthly ceiling — which can eat the window and leave the search declining its
 * own first attempt. `search.ts` already treats a failed poll as non-fatal, so the result is
 * a degraded response rather than an error, and a provider whose free endpoint hangs for 12s
 * was not going to answer a search either.
 *
 * The route's `maxDuration` is 20s: above this, with room for the cache write that follows a
 * successful provider call. The page's own render is NOT covered by that.
 * `app/(public)/(plain)/explore/results` needs its own `maxDuration` at or above this
 * budget, or the platform cuts the render off at its default and produces exactly the
 * orphaned billed call this is written to avoid. Flagged in the PR; it is not this file's
 * export to add.
 */
export const HOTEL_SEARCH_DEADLINE_MS = 15_000;

function deadlineFetch(deadlineAt: number): typeof fetch {
  const bounded = (
    input: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1],
  ): Promise<Response> => {
    const remaining = deadlineAt - Date.now();
    if (remaining < PROVIDER_ATTEMPT_MS) {
      // Rejected rather than aborted, and rejected BEFORE the request is made: no socket is
      // opened, so no metered search is spent. The message carries no URL — `client.ts`
      // redacts its own, but the credential travels in SerpApi's query string and the
      // cheapest way not to leak it is not to hold it.
      return Promise.reject(
        new Error(
          `hotel-search deadline: ${Math.max(0, remaining)}ms left, an attempt needs ${PROVIDER_ATTEMPT_MS}ms`,
        ),
      );
    }
    // providerFetch, NOT the global: under Next the global is a patched fetch that writes
    // the full href into an OTel span name, into workStore.fetchMetrics, and into the Data
    // Cache key — and SerpApi carries its credential in the query string. This one line is
    // what keeps the api_key out of all three.
    return providerFetch(input, init);
  };
  return bounded as typeof fetch;
}

function deadlineSleep(deadlineAt: number): (ms: number) => Promise<void> {
  return (ms: number) => {
    // REJECT, do not resolve. Resolving here let client.ts fall through to `continue`,
    // re-enter its retry loop and call the recorder again — three hotel_api_request rows
    // for one search, inflating the very ledger the 200/month ceiling is counted from.
    // Rejecting ends the attempt loop instead of pretending a wait happened.
    if (Date.now() + ms > deadlineAt - PROVIDER_ATTEMPT_MS) {
      return Promise.reject(
        new Error("hotel-search deadline: no time remains for another provider attempt"),
      );
    }
    return new Promise((resolve) => setTimeout(resolve, ms));
  };
}

/* ────────────────────────────────────────────────────────────────────────────────
 * The pipeline.
 * ──────────────────────────────────────────────────────────────────────────────── */

/**
 * Either the pipeline's own response, or the limiter's refusal.
 *
 * The refusal is a separate outcome rather than a degraded response because the two mean
 * different things to different callers: the page turns it into the same quiet fallback as
 * everything else, and `/api/hotel-search` owes its caller an honest 429 with a Retry-After.
 */
export type HotelPipelineOutcome =
  | { status: "ok"; response: HotelSearchResponse }
  | { status: "rate_limited"; retryAfter: number };

/**
 * Everything the Edge Function did after it had authenticated its caller and validated the
 * body, in the same order it did it.
 *
 * THE ORDER IS THE DESIGN and it is worth stating, because the obvious summary of the old
 * handler ("config, then limiter, then search") leaves out where the two cheap refusals sat.
 * Read against `supabase/functions/hotel-search/index.ts`, the sequence is:
 *
 *   1. caller token            — callers do this; see `searchHotels` and the route handler
 *   2. SERPAPI_API_KEY present — likewise, because a missing key was a 403 and not a search
 *   3. parse the body          — `parseHotelSearchBody`, before any client is constructed
 *   4. service client
 *   5. readConfig              — AFTER the body is parsed, so a bad query costs no query
 *   6. rate limit              — before the budget and before the provider, so a caller
 *                                cannot spend our month by looping, whatever else is true
 *   7. runSearch               — which then does cache → kill switch → budget → provider
 *
 * Steps 1–3 stay with the callers because that is where they were: the function answered an
 * unauthenticated caller before it read a body, and this function has no HTTP status to
 * return anyway.
 */
export async function runHotelSearchPipeline(
  input: SearchInput,
  options: { apiKey: string; ip: string | null },
): Promise<HotelPipelineOutcome> {
  // Started here, not after the reads below: the budget is the visitor's wait, and a slow
  // database is part of it.
  const deadlineAt = Date.now() + HOTEL_SEARCH_DEADLINE_MS;

  // BYPASSES RLS, and this is the call site that owes the explanation. The four hotel
  // tables have RLS on with zero policies: the caller is an anonymous visitor with no row
  // to own, and "may this stranger read this cached search?" is not a predicate. See the
  // header for what that costs now that the key lives under `web/`.
  const db = serviceClient();
  const config = await readConfig(db);

  const key = await bucketKey(options.ip, ipPepper());
  const verdict = await takeTokens(db, key, {
    minute: config.ratePerMinute,
    hour: config.ratePerHour,
    day: config.ratePerDay,
  });
  if (!verdict.allowed && verdict.refusedBy) {
    return { status: "rate_limited", retryAfter: retryAfterSeconds(verdict.refusedBy) };
  }

  const response = await runSearch(input, {
    db,
    apiKey: options.apiKey,
    config,
    fetchImpl: deadlineFetch(deadlineAt),
    sleep: deadlineSleep(deadlineAt),
  });

  return { status: "ok", response };
}

/**
 * The visitor's address, for the rate limiter and nothing else.
 *
 * Read here rather than passed down because this is the only place it is used, and reading
 * it in the page would put a request-scoped API into a component that has no other reason to
 * be dynamic. `/explore/results` already reads searchParams, so it is dynamic regardless.
 *
 * Returns an empty object rather than a header when there is nothing to forward, so
 * `ratelimit.ts`'s own "no header means the tighter shared bucket" rule still applies to
 * anything that genuinely arrives without one.
 */
async function visitorForwardedFor(): Promise<Record<string, string>> {
  try {
    const incoming = await headers();
    const forwarded = incoming.get("x-forwarded-for") ?? incoming.get("x-real-ip");
    return forwarded ? { "x-forwarded-for": forwarded } : {};
  } catch {
    // Outside a request scope (a build-time render, a test) there is no visitor to limit.
    return {};
  }
}

/**
 * The same address, reduced to the one entry the limiter keys on.
 *
 * `clientIp` in `ratelimit.ts` takes a `Request` — it was written for a handler that had
 * one — and a server component does not. Rather than fork its "left-most entry is the
 * client, the rest are proxies that appended themselves" rule into a second two-line
 * implementation that can drift, the header goes back into a throwaway `Request` and the
 * original does the parsing. The URL is never used.
 */
async function visitorIp(): Promise<string | null> {
  return clientIp(new Request("https://hotel-search.internal/", {
    headers: await visitorForwardedFor(),
  }));
}

/**
 * Run a hotel search for the public Explore surface.
 *
 * Never throws: a provider hiccup on a public marketing page must be a quiet fallback to
 * the curated catalog, not an error boundary. That contract is why every step below either
 * returns a discriminant or is inside the try — and why the try wraps the pipeline rather
 * than each call in it. A thrown error from `serviceClient()` (no key), from the database
 * (no such table), or from anywhere in the chain is the same thing to a visitor.
 */
export async function searchHotels(args: HotelSearchArgs): Promise<HotelSearchResult> {
  const config = configuration();
  if (
    !config.enabled ||
    !config.callerToken ||
    !config.supabase ||
    !config.serviceRole ||
    !config.apiKey
  ) {
    // SAYS WHY, and it used to say nothing at all. A visitor sees "the hotel feed is quiet
    // right now" either way — they should not be shown our configuration — but returning
    // that silently meant a developer with no key saw a message about a provider outage and
    // no signal anywhere that the feature had simply never been switched on. The distinction
    // is invisible in the UI by design, so it has to be loud in the log.
    //
    // `hotelSearchEnabled` IS THE KILL SWITCH AND IT IS FIRST. `HOTEL_SEARCH_ENABLED=false`
    // short-circuits here, before a database client exists, let alone a provider call — one
    // env var, no deploy, no code change, which is what a metered feature on a public page
    // needs. (`hotel_search_config.enabled` in the database is the other switch and lives
    // inside `runSearch`; that one takes effect even for a request already past this point.)
    //
    // THE CALLER TOKEN NO LONGER AUTHENTICATES ANYTHING HERE — there is no hop left to
    // present it on — but it stays in this condition on purpose: `env.hotelSearchEnabled`
    // is defined in terms of it, and `/api/hotel-search` still checks it for real. Dropping
    // it would give the operator two switches with one name.
    console.warn(
      "[hotels] search skipped — not configured",
      {
        hotelSearchEnabled: config.enabled,
        callerToken: config.callerToken ? "set" : "MISSING (STA_HOTEL_SEARCH_TOKEN)",
        supabase: config.supabase ? "configured" : "MISSING (NEXT_PUBLIC_SUPABASE_*)",
        serviceRole: config.serviceRole ? "set" : "MISSING (SUPABASE_SERVICE_ROLE_KEY)",
        provider: config.apiKey ? "set" : "MISSING (SERPAPI_API_KEY)",
      },
    );
    return { status: "unavailable" };
  }

  try {
    // The page validated these too (`parseStay`, `pickAllowed`), and they are validated
    // again for the same reason the Edge Function validated what our own server sent it:
    // the cost of a bad query is a request we cannot get back, and "the caller already
    // checked" is an assumption, not a guard.
    const parsed = parseHotelSearchBody(args);
    if (!parsed.ok) {
      // The detail is one of this module's own fixed strings — never the args. A
      // destination plus dates is a visitor's travel plan.
      console.warn("[hotels] search rejected", { detail: parsed.detail });
      return { status: "unavailable" };
    }

    const outcome = await runHotelSearchPipeline(parsed.input, {
      apiKey: config.apiKey,
      ip: await visitorIp(),
    });

    if (outcome.status === "rate_limited") {
      // Not an error the visitor should see — it degrades to the same quiet fallback as an
      // exhausted budget. Worth a line in the log because it is OUR limiter refusing, not
      // the provider's, and the two are fixed in different places.
      console.warn("[hotels] rate limited by our own limiter, not by the provider", {
        retryAfter: outcome.retryAfter,
      });
      return { status: "unavailable" };
    }

    return parseSearchResponse(outcome.response);
  } catch (cause) {
    // Never log the body or the args: a destination plus dates is a visitor's travel plan.
    console.warn("[hotels] search failed", { cause: String(cause) });
    return { status: "unavailable" };
  }
}
