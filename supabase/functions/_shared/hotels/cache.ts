/**
 * Cache identity: one canonical form of a search, feeding both the cache key and the
 * outgoing provider query.
 *
 * THE SAME STRUCT DRIVES BOTH, and that is deliberate. If the key were derived separately
 * from the request we send, two logically identical searches could hash the same and hit
 * one cache row while presenting two different param sets to the provider — or the reverse,
 * which quietly doubles the bill. Deriving both from one struct makes that class of bug
 * impossible rather than unlikely.
 *
 * `api_key` is not in `params` and never can be: the client attaches it to the URL after
 * this struct is built. So it is structurally absent from the hash, from the fingerprint we
 * store, and from the ledger — and a CHECK constraint refuses a row that contains it anyway.
 */
import type { HotelSearchEcho } from "./types.ts";

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
