import { headers } from "next/headers";
import { z } from "zod";
import type { Currency } from "@/content/public/types";
import { env } from "@/lib/env";

/**
 * The public hotel type, and the one place the app talks to the hotel-search function.
 *
 * SERVER-SIDE BY CONSTRUCTION, not by convention. This module reads
 * `STA_HOTEL_SEARCH_TOKEN`, and the absence of a `NEXT_PUBLIC_` prefix is what protects it:
 * Next inlines only `NEXT_PUBLIC_*` into the browser bundle, so importing this into a
 * client component yields `undefined` and a quiet "unavailable", never a leaked secret.
 * (The `server-only` package would turn that into a build error instead, which is nicer —
 * but it is not installed here and is not worth a dependency for a guard the env naming
 * already provides.)
 *
 * THE TYPE HAS NOWHERE TO PUT A BOOKING SITE. There is no `source`, no `link`, no `logo`,
 * no `prices[]`, no `bookingUrl` — so no JSX can render one, whatever the Edge Function
 * sends. That is Free-Travel-APIs §10.2's technique ("the cleanest enforcement is
 * structural"), pointed at the field that actually matters here: §1.3.5 says this site may
 * promote the advisor's travel business and nothing else.
 *
 * The zod schema below is the second line, and it strips rather than throws. `.strict()`
 * would take the page down the day the provider adds a field; stripping silently discards
 * it, which is the behaviour a public marketing page wants.
 */

/**
 * Hosts whose images we will point a visitor's browser at.
 *
 * Repeated from the Edge Function's mapper ON PURPOSE. `web/next.config.ts` registers a
 * CUSTOM image loader, and a custom loader means `remotePatterns` is never consulted — any
 * URL that reaches `<Image src>` is fetched by the visitor's browser from whatever origin
 * we named. So the guarantee has to hold even if the function changes, and the cheapest way
 * to make it hold is to check it again here.
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

/** Parse a raw function response into the public shape. Exported for tests. */
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
 * The visitor's address, for the rate limiter and nothing else.
 *
 * Read here rather than passed down because this is the only place it is used, and reading
 * it in the page would put a request-scoped API into a component that has no other reason to
 * be dynamic. `/explore/results` already reads searchParams, so it is dynamic regardless.
 *
 * Returns an empty object rather than a header when there is nothing to forward, so the
 * function's own "no header means the tighter shared bucket" rule still applies to anything
 * that genuinely arrives without one.
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
 * Call the hotel-search Edge Function.
 *
 * Never throws: a provider hiccup on a public marketing page must be a quiet fallback to
 * the curated catalog, not an error boundary.
 *
 * THE TIMEOUT MUST NOT BE TIGHTER THAN THE FUNCTION'S OWN, and for a while it was half of
 * it. This aborted at 6s while `_shared/hotels/client.ts` allows `DEFAULT_TIMEOUT_MS`
 * 12_000 per SerpApi attempt (plus two retries), so every cold search — the first one for
 * any destination/date pair, which is most real searches — was cut off mid-flight and shown
 * as "the hotel feed is quiet". Retrying then looked like a fix, because by that point the
 * function's own six-hour cache had been warmed by the very request we abandoned. Worse, we
 * were still billed: the metered provider call completed for a caller that had already gone.
 * A cold search is slow, but the visitor is watching the Suspense skeleton, not a blank
 * page, which is what the streaming boundary in 2.0.4 exists for.
 */
export async function searchHotels(args: HotelSearchArgs): Promise<HotelSearchResult> {
  const token = env.hotelSearchToken;
  if (!env.hotelSearchEnabled || !token || !env.supabaseConfigured) {
    // SAYS WHY, and it used to say nothing at all. A visitor sees "the hotel feed is quiet
    // right now" either way — they should not be shown our configuration — but returning
    // that silently meant a developer with no key saw a message about a provider outage and
    // no signal anywhere that the feature had simply never been switched on. The distinction
    // is invisible in the UI by design, so it has to be loud in the log.
    console.warn(
      "[hotels] search skipped — not configured",
      {
        hotelSearchEnabled: env.hotelSearchEnabled,
        callerToken: token ? "set" : "MISSING (STA_HOTEL_SEARCH_TOKEN)",
        supabase: env.supabaseConfigured ? "configured" : "MISSING (NEXT_PUBLIC_SUPABASE_*)",
      },
    );
    return { status: "unavailable" };
  }

  try {
    const response = await fetch(`${env.supabaseUrl}/functions/v1/hotel-search`, {
      method: "POST",
      headers: {
        apikey: env.supabaseAnonKey,
        Authorization: `Bearer ${env.supabaseAnonKey}`,
        "X-STA-Search-Token": token,
        "Content-Type": "application/json",
        // WITHOUT THIS THE LIMITER IS GLOBAL, NOT PER-VISITOR — and that is how it shipped.
        // Every request arrived from this server with no forwarded address, so the function
        // put them all in its shared "unknown" bucket and the whole site shared one 6/min
        // allowance. The second person to search in a minute could exhaust it for everyone.
        // The function hashes this with a pepper before it is used; the raw address never
        // reaches the database (see _shared/hotels/ratelimit.ts and the CHECK on
        // hotel_search_rate_bucket.bucket_key).
        ...(await visitorForwardedFor()),
      },
      body: JSON.stringify(args),
      // 2s of headroom over one 12s provider attempt. A retry on the function's side can
      // still outlast this, and that is the case we deliberately fall back on.
      signal: AbortSignal.timeout(14_000),
      // The function has its own six-hour cache; this is a short shared cache in front of
      // it so a burst on one search does not become a burst of function invocations.
      next: { revalidate: 300, tags: ["hotel-search"] },
    });

    if (!response.ok) {
      // A 429 from the limiter is not an error the visitor should see — it degrades to the
      // same quiet fallback as an exhausted budget. 403 is the function refusing us: either
      // the caller token does not match the Supabase secret, or SERPAPI_API_KEY is unset.
      // The two refusals mean different things and are fixed in different files, which is
      // worth spelling out: both surface to a visitor as "the feed is quiet", and without
      // this the only way to tell them apart is to read the function's source.
      const hint = response.status === 401
        ? "the caller token did not match — STA_HOTEL_SEARCH_TOKEN (web/.env.local) must equal HOTEL_SEARCH_CALLER_TOKEN (supabase secrets)"
        : response.status === 403
        ? "the function is not configured — SERPAPI_API_KEY is unset in its environment"
        : response.status === 429
        ? "rate limited by our own limiter, not by the provider — see hotel_search_rate_bucket"
        : undefined;
      console.warn("[hotels] search rejected", { status: response.status, hint });
      return { status: "unavailable" };
    }

    return parseSearchResponse(await response.json());
  } catch (cause) {
    // Never log the body or the args: a destination plus dates is a visitor's travel plan.
    console.warn("[hotels] search failed", { cause: String(cause) });
    return { status: "unavailable" };
  }
}
