/**
 * `HotelSearchArgs` (what the results page has) → `SearchInput` (what `query.ts` takes). P2.
 *
 * PORTED FROM THE EDGE FUNCTION'S `parseBody`, near-verbatim and on purpose. When the
 * search ran in `supabase/functions/hotel-search`, that function owned the whole outbound
 * parameter set: the page posted a loose body and `parseBody` clamped, allow-listed and
 * defaulted it before `providerParams` ever saw it. With the function gone there is nothing
 * between the page and SerpApi, so that work has to happen here or not at all.
 *
 * FIDELITY MATTERS FOR THE BILL, NOT ONLY FOR CORRECTNESS. SerpApi serves an identical
 * parameter set free for an hour and does not count it against the 250-a-month tier
 * (Free-Travel-APIs.md:294-296). A default that differs from the one the function sent —
 * `currency` omitted instead of `USD`, `adults` unclamped, an amenity id we now forward and
 * did not before — presents a *different* search to that free cache, so the same visitor
 * question is billed twice. Every literal below is therefore copied rather than re-decided,
 * and the five allow-listed id sets are the same arrays the function held.
 *
 * WHAT IS DELIBERATELY NOT PORTED is the validation half of `parseBody` — the destination
 * text clean, `isoDate`'s calendar round-trip, the nights bound, the past/horizon checks.
 * They are not dropped, they moved earlier: `parseStay` in `lib/public/search.ts` already
 * applies the same rules to the URL (real calendar date, check-out after check-in, not in
 * the past, at most `MAX_STAY_NIGHTS` and `MAX_BOOKING_DAYS_AHEAD` out) and `HotelResults`
 * refuses to search without both, so `args.checkIn` / `args.checkOut` only exist when they
 * have already passed. `normalizeDestination` in `query.ts` does the rest of `text()`:
 * control characters out, whitespace collapsed, 60 characters, lower-cased. Re-checking here
 * would be a second copy of a rule that is asserted upstream.
 *
 * The clamps and allow-lists ARE kept, because their inputs are different in kind: they
 * originate in URL query parameters that nothing upstream bounds. `?travelers=9999` is a
 * real request a crawler can make, and `adults=9999` is a parameter set of its own — one
 * that misses the free cache and bills us — so `clamp` is an input guard, not ceremony.
 */
import type { HotelSearchArgs } from "@/lib/public/hotels";
import type { SearchInput } from "./query";

/**
 * The five allow-lists, exactly as the Edge Function held them.
 *
 * These are Google's own opaque ids, and the allow-list is what stops an arbitrary `?a=`
 * value being forwarded — a value SerpApi does not recognise is still a billed search, and
 * one it does recognise but we never intended is a filter no chip on the page can undo.
 *
 * `RATING_IDS` and `PROPERTY_TYPE_IDS` have no caller today because Screen 2.0.4's rail
 * offers no control for either. They are exported rather than deleted for the same reason
 * `query.ts` keeps `cacheKey`: they are the id sets a future chip has to validate against,
 * and re-deriving them from the provider's docs would be the third time they were written.
 */

/**
 * The amenities the Hotels rail actually offers, per Screen Inventory 2.3.3's "price, star
 * rating, amenities" grouping:
 *   6 Pool · 10 Spa · 11 Beach access · 12 Child-friendly · 52 All-inclusive available
 *   9 Free breakfast · 35 Free Wi-Fi · 53 Wheelchair accessible · 19 Pet-friendly
 */
export const AMENITY_IDS = ["6", "9", "10", "11", "12", "19", "35", "52", "53"];
/** 12 Beach hotels · 13 Boutique · 17 Resorts · 18 Spa hotels · 19 B&B · 21 Apartment hotels */
export const PROPERTY_TYPE_IDS = ["12", "13", "17", "18", "19", "21"];
/** SerpApi sort ids: "3" lowest price, "8" highest rating, "13" most reviewed. */
export const SORT_IDS = ["3", "8", "13"];
/** Minimum-rating ids: "7" 3.5+, "8" 4.0+, "9" 4.5+. */
export const RATING_IDS = ["7", "8", "9"];
/** Star classes the rail offers. There is no "1 star" chip, so there is no "1" id here. */
export const HOTEL_CLASS_IDS = ["2", "3", "4", "5"];

/**
 * Map the page's arguments onto the provider input.
 *
 * `SearchInput` is a SUPERSET of `HotelSearchArgs`: the page has no control for children,
 * currency, minimum rating, property type or free cancellation, so those five are supplied
 * here at the function's own defaults. They are not placeholders to be filled in later —
 * they are the values that were already going to SerpApi, and changing one changes the
 * parameter set and therefore the free-cache hit rate. If the rail ever grows a control for
 * one of them, the default here is what it has to keep matching for unfiltered searches.
 */
export function toSearchInput(args: HotelSearchArgs): SearchInput {
  return {
    destination: args.destination,
    checkIn: args.checkIn,
    checkOut: args.checkOut,
    // `?travelers=` reaches this unbounded. 8 is the provider's own ceiling for the field.
    adults: clamp(args.adults, 1, 8, 2),
    // EMPTY, ALWAYS, TODAY. Screen 2.0.4's rail counts travelers, not ages, so there is no
    // source field for this and no `ages()` helper ported to guard one. Empty is the value
    // that matters rather than a stand-in: `canonicalize` joins it to `""` and
    // `providerParams` then omits both `children_ages` and `children` entirely, which is
    // exactly the parameter set the Edge Function's own searches were billed under. Sending
    // `children_ages=` blank instead would be a different search to SerpApi's free cache.
    // If a children control ever lands, the function's helper is the one to copy: round to
    // an integer, keep 0-17, and take at most six.
    childrenAges: [],
    // USD, always. The rate schema in `lib/public/hotels.ts` is `z.literal("USD")` and
    // `claim("hotelRateBasis")` says so in the footnote — a second currency is a copy and a
    // compliance decision, not a parameter.
    currency: "USD",
    sortBy: allowed(args.sortBy, SORT_IDS),
    // No minimum-rating chip in the rail either, so `""` — which `providerParams` drops
    // rather than sends blank. `RATING_IDS` is kept as the allow-list a future chip must
    // validate against, since a `rating` SerpApi does not recognise is a wasted search.
    rating: "",
    hotelClass: allowedList(args.hotelClass, HOTEL_CLASS_IDS),
    amenities: allowedList(args.amenities, AMENITY_IDS),
    // Same again: no property-type chip, so nothing is forwarded and the parameter is
    // omitted. `PROPERTY_TYPE_IDS` stays for the same reason `RATING_IDS` does.
    propertyTypes: [],
    // Bounded for the same reason `adults` is clamped, and it used to be bounded on the far
    // side of the network. The rate bands in `search.ts` only ever produce values inside
    // this range; a hand-edited `?rates=` does not have to.
    minPrice: bounded(args.minPrice),
    maxPrice: bounded(args.maxPrice),
    freeCancellation: false,
  };
}

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === "number" ? Math.round(value) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/** One id or none. An unrecognised value becomes `""`, which `providerParams` then drops. */
function allowed(value: unknown, values: string[]): string {
  return typeof value === "string" && values.includes(value) ? value : "";
}

/** De-duplicated, because two copies of `"4"` are the same filter and a different URL. */
function allowedList(value: unknown, values: string[]): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((v): v is string => typeof v === "string" && values.includes(v)))];
}

function bounded(value: unknown): number | null {
  const n = typeof value === "number" ? Math.round(value) : NaN;
  if (!Number.isFinite(n) || n < 0 || n > 100_000) return null;
  return n;
}
