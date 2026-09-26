/**
 * Query canonicalisation and the outbound provider parameter set.
 *
 * RENAMED FROM `cache.ts`, CONTENT UNCHANGED. It was called that because the same
 * canonical form keyed the six-hour Postgres cache; that cache is gone, so the old name
 * would now describe something this file does not do. The body is a verbatim copy of
 * `supabase/functions/_shared/hotels/cache.ts` — every function here is pure and none ever
 * took a database handle, which is why it survives the simplification intact.
 *
 * `providerParams` IS LOAD-BEARING FOR THE BILL, not just for correctness. SerpApi serves
 * identical parameter sets free for an hour and does not count them against the 250/month
 * tier (Free-Travel-APIs.md:294-296). Two requests that differ only in key order or in a
 * field we started sending are two billed searches rather than one. Change this function
 * and you change the free-cache hit rate, so treat it as an interface.
 *
 * `cacheKey` and `ttlSeconds` are kept although nothing calls them now. They are pure, they
 * cost nothing, and they are exactly what a future cache would need — re-deriving them
 * later would be the third time this logic was written.
 */
import type { HotelSearchEcho } from "./types";

export interface SearchInput {
  destination: string;
  checkIn: string;
  checkOut: string;
  adults: number;
  childrenAges: number[];
  currency: string;
  /** SerpApi sort ids: "3" lowest price, "8" highest rating, "13" most reviewed. */
  sortBy: string;
  /** "7" 3.5+, "8" 4.0+, "9" 4.5+. */
  rating: string;
  hotelClass: string[];
  amenities: string[];
  propertyTypes: string[];
  minPrice: number | null;
  maxPrice: number | null;
  freeCancellation: boolean;
}

/**
 * Canonical, with a FIXED key order declared by this object literal rather than by
 * insertion. `JSON.stringify` walks own properties in definition order, so the hash is
 * stable across callers only because this shape is written once, here.
 */
export interface CanonicalQuery {
  destination: string;
  checkIn: string;
  checkOut: string;
  adults: number;
  childrenAges: string;
  currency: string;
  sortBy: string;
  rating: string;
  hotelClass: string;
  amenities: string;
  propertyTypes: string;
  minPrice: string;
  maxPrice: string;
  freeCancellation: string;
}

/**
 * Destination normalisation.
 *
 * Mirrors `normalize()` and `cleanText()` in web/lib/public/search.ts — Deno cannot import
 * from web/, so this is a parallel implementation and the same vectors are asserted on both
 * sides. "Curaçao", "CURACAO" and "  curaçao  " must be one search, or the free tier pays
 * three times for one answer.
 */
export function normalizeDestination(raw: string): string {
  return raw
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[\p{Cc}]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .slice(0, 60);
}

function sortedList(values: string[]): string {
  return [...new Set(values.map((v) => v.trim()).filter(Boolean))].sort().join(",");
}

export function canonicalize(input: SearchInput): CanonicalQuery {
  return {
    destination: normalizeDestination(input.destination),
    checkIn: input.checkIn,
    checkOut: input.checkOut,
    adults: input.adults,
    // Sorted: two adults with an 8- and a 5-year-old is one search however it was typed.
    childrenAges: [...input.childrenAges].sort((a, b) => a - b).join("-"),
    currency: input.currency.toUpperCase(),
    sortBy: input.sortBy,
    rating: input.rating,
    hotelClass: sortedList(input.hotelClass),
    amenities: sortedList(input.amenities),
    propertyTypes: sortedList(input.propertyTypes),
    minPrice: input.minPrice === null ? "" : String(Math.round(input.minPrice)),
    maxPrice: input.maxPrice === null ? "" : String(Math.round(input.maxPrice)),
    freeCancellation: input.freeCancellation ? "1" : "0",
  };
}

/**
 * The provider query, derived from the same canonical struct.
 *
 * OMITTED IS NOT EMPTY. SerpApi's own free one-hour cache keys on the exact parameter set,
 * so sending `sort_by=` where another call omits it presents two different searches and
 * bills for both. Empty values are dropped, never sent — the same rule the cruise client
 * already applies.
 */
export function providerParams(canonical: CanonicalQuery): Record<string, string> {
  const raw: Record<string, string> = {
    engine: "google_hotels",
    q: canonical.destination,
    check_in_date: canonical.checkIn,
    check_out_date: canonical.checkOut,
    adults: String(canonical.adults),
    children_ages: canonical.childrenAges.split("-").filter(Boolean).join(","),
    currency: canonical.currency,
    gl: "us",
    hl: "en",
    sort_by: canonical.sortBy,
    rating: canonical.rating,
    hotel_class: canonical.hotelClass,
    amenities: canonical.amenities,
    property_types: canonical.propertyTypes,
    min_price: canonical.minPrice,
    max_price: canonical.maxPrice,
    free_cancellation: canonical.freeCancellation === "1" ? "true" : "",
  };

  const clean: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (value !== undefined && value !== "") clean[key] = value;
  }
  // `children` is only meaningful alongside ages, and only when there are any.
  const ages = clean.children_ages;
  if (ages) clean.children = String(ages.split(",").length);
  return clean;
}

/** SHA-256 of the canonical struct, hex. */
export async function cacheKey(canonical: CanonicalQuery): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(canonical));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function nightsBetween(checkIn: string, checkOut: string): number {
  const a = Date.parse(`${checkIn}T12:00:00Z`);
  const b = Date.parse(`${checkOut}T12:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.round((b - a) / 86_400_000);
}

export function echo(canonical: CanonicalQuery): HotelSearchEcho {
  return {
    destination: canonical.destination,
    checkIn: canonical.checkIn,
    checkOut: canonical.checkOut,
    adults: canonical.adults,
    nights: nightsBetween(canonical.checkIn, canonical.checkOut),
  };
}

/**
 * How long a result stays fresh, by how far out the stay is.
 *
 * Near-term rates move and far-term ones barely do — and the long tail is also where a bot
 * throwing randomised future dates lands, so the generous TTL helps most exactly where it
 * is needed. `base` is the configured default (6h) and anchors the middle band, so setting
 * every band to it gives a flat TTL if that is ever preferred.
 */
export function ttlSeconds(checkIn: string, today: string, base: number): number {
  const horizon = nightsBetween(today, checkIn);
  if (horizon <= 3) return Math.min(base, 7_200);
  if (horizon > 30) return Math.max(base, 86_400);
  return base;
}
