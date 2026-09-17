import { z } from "zod";
import type { Currency } from "@/content/public/types";
import { env } from "@/lib/env";
import type { HotelSearchResponse } from "@/lib/hotels/types";
import { createSerpApiClient, SerpApiError } from "@/lib/hotels/client";
import { toSearchInput } from "@/lib/hotels/input";
import { mapSearchResponse } from "@/lib/hotels/map";
import { providerFetch } from "@/lib/hotels/provider-fetch";
import { canonicalize, echo, providerParams } from "@/lib/hotels/query";

/**
 * The public hotel type, and the one place the app calls SerpApi. Screen 2.0.4, Hotels mode. P2.
 *
 * THIS MODULE IS NOW THE WHOLE FEATURE. It used to POST to a `hotel-search` Edge Function
 * which owned a six-hour Postgres cache, a monthly budget ledger and a per-IP rate limiter.
 * Those are gone by decision, with their costs spelled out: hotel search is one call to one
 * provider with one secret, and there is no database in the path at all. A consequence worth
 * naming, because it is easy to reach for the old shape: `web/` still does not need
 * `SUPABASE_SERVICE_ROLE_KEY`, and the prohibition in `lib/env.ts` and `.env.example`
 * stays true.
 *
 * SERVER-SIDE BY CONSTRUCTION, not by convention — and the stake went up with the
 * simplification. This module reads `SERPAPI_API_KEY`, which is the metered credential
 * itself rather than a token that merely unlocked a function of ours, and the absence of a
 * `NEXT_PUBLIC_` prefix is what protects it: Next inlines only `NEXT_PUBLIC_*` into the
 * browser bundle, so importing this into a client component yields `undefined` and a quiet
 * "unavailable", never a leaked key. (`server-only` would make that a build error instead,
 * which is nicer, and the argument for the dependency is stronger now that the value at risk
 * is the provider credential — but it is still not installed here, and the env naming is
 * what holds today.)
 *
 * THE KEY MUST ALSO NOT REACH NEXT'S PATCHED `fetch`, which is why `lib/hotels/provider-fetch.ts`
 * exists and is handed to the client as `fetchImpl` below. SerpApi carries its credential in
 * the query string, and Next's replacement for the global writes the full href into an
 * OpenTelemetry span name and into the Data Cache key on disk. Read that file's header
 * before touching the call.
 *
 * TWO COMPLIANCE BELTS, BOTH KEPT, DELIBERATELY NOT COLLAPSED INTO ONE.
 *   1. `lib/hotels/map.ts` is an allow-list by construction: it copies every field by name,
 *      so `prices[].source`, `logo`, `link`, `ads` and sponsored placements never exist
 *      downstream, whatever the provider sends (Free-Travel-APIs §1.3.5 and §10.2).
 *   2. `responseSchema` below re-checks the mapper's output before it becomes a
 *      `PublicHotel`. On the happy path it is redundant, and that is the point: the mapper is
 *      the belt someone adding a field would edit, and this is the one that would catch them.
 *
 * THE TYPE HAS NOWHERE TO PUT A BOOKING SITE. There is no `source`, no `link`, no `logo`,
 * no `prices[]`, no `bookingUrl` — so no JSX can render one, whatever the provider sends.
 * That is §10.2's technique ("the cleanest enforcement is structural"), pointed at the field
 * that actually matters here: §1.3.5 says this site may promote the advisor's travel business
 * and nothing else.
 *
 * The zod schema strips rather than throws. `.strict()` would take the page down the day the
 * provider adds a field; stripping silently discards it, which is the behaviour a public
 * marketing page wants.
 */

/**
 * Hosts whose images we will point a visitor's browser at.
 *
 * Repeated from `lib/hotels/map.ts` ON PURPOSE. `web/next.config.ts` registers a CUSTOM
 * image loader, and a custom loader means `remotePatterns` is never consulted — any URL that
 * reaches `<Image src>` is fetched by the visitor's browser from whatever origin we named.
 * So the guarantee has to hold even if the mapper changes, and the cheapest way to make it
 * hold is to check it again here. The two lists sat on opposite sides of a network boundary
 * before the search moved in-process; they are now two modules apart, which is a weaker
 * separation but the same argument — this is the one field that reaches a third party from a
 * page with a published privacy policy.
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

/**
 * Parse the assembled response body into the public shape. Exported for tests, which is
 * most of why it is a separate function: it is the seam the poisoned-payload assertions in
 * `hotels.test.ts` push a fabricated booking site through.
 */
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
 * Run the search: canonicalise → provider params → one SerpApi call → map → parse.
 *
 * NEVER THROWS. A provider hiccup on a public marketing page must be a quiet fallback to the
 * curated catalog, not an error boundary — so every failure becomes a discriminant and the
 * page picks a state. That includes the pure steps: `canonicalize` is inside the `try` even
 * though nothing in it can realistically fail, because "realistically" is not a guarantee
 * and this function's contract is total.
 *
 * THERE IS NO LONGER AN OUTER ABORT, and removing it was the point of the change rather than
 * an oversight. A 14s `AbortSignal.timeout` used to sit on the HTTP call to the Edge
 * Function, where it meant "the caller gives up while the server finishes warming a cache" —
 * wasteful, but the work still landed somewhere useful and a retry hit the warm row. In
 * process there is no server and no cache: aborting would kill a BILLED provider request
 * mid-flight, spend the search, and store nothing. `client.ts`'s own 12s per-attempt timeout
 * is the real bound now (three attempts worst case, and only network-class failures retry).
 * The visitor is watching the Suspense skeleton from 2.0.4's streaming boundary, not a blank
 * page.
 *
 * NOTHING CACHES ANY MORE, which follows from the same decision. The old 5-minute
 * `next: { revalidate }` rode on the patched `fetch` we now deliberately bypass, and putting
 * it back would key Next's Data Cache on a URL containing `api_key` — see
 * `provider-fetch.ts`. Every distinct search is a billed search; the only cache left is
 * SerpApi's own free one-hour reuse of an identical parameter set, which is why
 * `lib/hotels/input.ts` treats its defaults as an interface.
 */
export async function searchHotels(args: HotelSearchArgs): Promise<HotelSearchResult> {
  const apiKey = env.serpApiKey;
  if (!env.hotelSearchEnabled || !apiKey) {
    // SAYS WHICH ONE, and it used to say nothing at all. A visitor sees "the hotel feed is
    // quiet right now" either way — they should not be shown our configuration — but
    // returning that silently meant a developer with no key saw a message about a provider
    // outage and no signal anywhere that the feature had simply never been switched on. The
    // distinction is invisible in the UI by design, so it has to be loud in the log.
    console.warn("[hotels] search skipped — not configured", {
      hotelSearchEnabled: env.hotelSearchEnabled,
      providerKey: apiKey ? "set" : "MISSING (SERPAPI_API_KEY)",
    });
    return { status: "unavailable" };
  }

  try {
    const canonical = canonicalize(toSearchInput(args));
    const client = createSerpApiClient({
      // NOT the global: Next's patched fetch would put `api_key` into a span name and a
      // Data Cache key on disk. See `lib/hotels/provider-fetch.ts`.
      fetchImpl: providerFetch,
      apiKey,
      // NO `onRequest` RECORDER, deliberately. The client fires it before it judges the
      // response, which is exactly what a budget ledger needs — and there is no ledger to
      // feed. Passing a logger here instead would be the worst of both: the record carries
      // the sanitised query, which is the visitor's destination and dates.
    });

    const raw = await client.search(providerParams(canonical));
    const payload = mapSearchResponse(raw, canonical.currency);

    // Assembled field by field into the shape `parseSearchResponse` already validates — the
    // body the Edge Function used to return. Named rather than spread, in the same spirit as
    // the mapper: a field that appears in `HotelSearchPayload` tomorrow has to be added here
    // before it can reach the schema.
    //
    // ANNOTATED `HotelSearchResponse` DELIBERATELY, because `parseSearchResponse` takes
    // `unknown` and would have type-checked this literal against nothing at all. That is the
    // one failure mode in this module that is both total and silent: misspell `totalAvailable`
    // or drop `hasMore` and `responseSchema.safeParse` fails, every search returns
    // `unavailable`, the page shows "the feed is quiet" forever — and typecheck, lint and the
    // whole suite stay green, because no test covers this assembly. The annotation is what
    // turns that into a compile error.
    const body: HotelSearchResponse = {
      version: payload.version,
      currency: payload.currency,
      totalAvailable: payload.totalAvailable,
      results: payload.results,
      hasMore: payload.hasMore,
      // "live" is the only honest value left; `cache` and `stale` described rows in a table
      // that no longer exists. `staleAsOf` is null for the same reason — without a cache
      // nothing is ever stale, so the page's stale-data footnote simply never renders.
      source: "live",
      degraded: null,
      asOf: new Date().toISOString(),
      staleAsOf: null,
      query: echo(canonical),
    };
    return parseSearchResponse(body);
  } catch (cause) {
    if (isQuotaExhausted(cause)) {
      console.warn("[hotels] the provider says the month is spent", {
        status: cause instanceof SerpApiError ? cause.status : null,
      });
      return { status: "budget_exhausted" };
    }

    // WHAT IS LOGGED IS DELIBERATELY NARROW. Never the args and never the response body: a
    // destination plus dates is a visitor's travel plan. And never `detail` on a
    // `network_error`, which is the trap — that detail is the runtime's own message, and the
    // runtime's message embeds the request URL, so it carries `q=<destination>` and the
    // dates. `redact()` strips the credential from it, not the query. For every other code
    // the detail is the provider's own `error` string, which describes our request rather
    // than quoting it, and it is the difference between "bad key" and "no results that week"
    // at 3am.
    const isProvider = cause instanceof SerpApiError;
    console.warn("[hotels] search failed", {
      code: isProvider ? cause.code : "unexpected",
      status: isProvider ? cause.status : null,
      detail: isProvider && cause.code !== "network_error" ? cause.detail : undefined,
    });
    return { status: "unavailable" };
  }
}

/**
 * The provider's own refusal, matched on its wording.
 *
 * A STRING MATCH, AND THE PROVIDER GIVES US NOTHING BETTER. SerpApi answers an exhausted
 * plan with the same HTTP status it uses for a bad key — the discriminant is only in the
 * `error` string ("Your account has run out of searches", and its plan-limit variants). So
 * the status is not usable and this list is. It is matched case-insensitively against a
 * handful of phrasings rather than one exact sentence, because the exact sentence is not
 * part of any contract and has changed before.
 *
 * WHY IT IS WORTH THE FRAGILITY: with the budget ledger gone, the provider's refusal is the
 * only signal that the month is spent, and the UI has a distinct state for it
 * (`HotelState kind="exhausted"`, which tells the visitor to come back rather than implying
 * the site is broken). A miss here is not a failure, it is the generic "unavailable" state —
 * so this degrades to the old behaviour rather than to a wrong page.
 *
 * `network_error` is excluded before matching: its detail is a request URL, and a
 * destination that happened to contain one of these phrases would be a false positive.
 */
const QUOTA_PHRASES = [
  "run out of searches",
  "ran out of searches",
  "exceeded your searches",
  "searches per month",
  "monthly limit",
  "plan limit",
  "account credit",
];

function isQuotaExhausted(cause: unknown): boolean {
  if (!(cause instanceof SerpApiError)) return false;
  if (cause.code === "network_error") return false;
  const detail = cause.detail.toLowerCase();
  return QUOTA_PHRASES.some((phrase) => detail.includes(phrase));
}
