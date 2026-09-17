/**
 * @vitest-environment node
 *
 * Cache identity.
 *
 * The expensive failure here is not a hash collision — it is canonicalisation DRIFT: two
 * searches that should be one key becoming two (which doubles the bill on a 250-a-month
 * tier), or two that should differ colliding (which serves one visitor another's prices for
 * the wrong dates).
 *
 * Ported verbatim in meaning from `supabase/functions/_shared/hotels/cache_test.ts`. Node
 * environment because nothing here touches a DOM and `cacheKey` wants `crypto.subtle`,
 * which jsdom does not provide.
 */
import { describe, expect, it } from "vitest";
import {
  cacheKey,
  canonicalize,
  normalizeDestination,
  providerParams,
  type SearchInput,
  ttlSeconds,
} from "./cache";

const BASE: SearchInput = {
  destination: "Aruba",
  checkIn: "2026-10-19",
  checkOut: "2026-10-26",
  adults: 2,
  childrenAges: [],
  currency: "USD",
  sortBy: "",
  rating: "",
  hotelClass: [],
  amenities: [],
  propertyTypes: [],
  minPrice: null,
  maxPrice: null,
  freeCancellation: false,
};

const keyOf = (over: Partial<SearchInput>) => cacheKey(canonicalize({ ...BASE, ...over }));

describe("hotel cache identity", () => {
  it("accents, case and padding are one destination", async () => {
    // Otherwise the free tier pays three times for one answer.
    const a = await keyOf({ destination: "Curaçao" });
    const b = await keyOf({ destination: "CURACAO" });
    const c = await keyOf({ destination: "  curaçao  " });
    expect(a).toEqual(b);
    expect(b).toEqual(c);
  });

  it("child ages are order-independent", async () => {
    expect(await keyOf({ childrenAges: [8, 5] })).toEqual(await keyOf({ childrenAges: [5, 8] }));
  });

  it("filter lists are order-independent and deduped", async () => {
    expect(await keyOf({ amenities: ["6", "11"] })).toEqual(
      await keyOf({ amenities: ["11", "6", "11"] }),
    );
  });

  it("an absent sort and an empty sort are the same search", async () => {
    // And, below, the same outgoing params — which is what keeps SerpApi's own free hourly
    // cache working for us instead of billing twice.
    expect(await keyOf({ sortBy: "" })).toEqual(await keyOf({}));
  });

  it("dates, party size and sort each change the key", async () => {
    const base = await keyOf({});
    expect(base).not.toEqual(await keyOf({ checkOut: "2026-10-27" }));
    expect(base).not.toEqual(await keyOf({ checkIn: "2026-10-20" }));
    expect(base).not.toEqual(await keyOf({ adults: 3 }));
    expect(base).not.toEqual(await keyOf({ sortBy: "3" }));
    expect(base).not.toEqual(await keyOf({ minPrice: 100 }));
  });

  it("the canonical struct never carries the api key", () => {
    const canonical = canonicalize(BASE) as unknown as Record<string, unknown>;
    expect(Object.hasOwn(canonical, "api_key")).toEqual(false);
  });

  it("empty parameters are OMITTED, never sent empty", () => {
    const params = providerParams(canonicalize(BASE));
    // SerpApi keys its own cache on the exact param set, so `sort_by=` and no sort_by are
    // two different searches to them, and both bill.
    expect(Object.hasOwn(params, "sort_by")).toEqual(false);
    expect(Object.hasOwn(params, "rating")).toEqual(false);
    expect(Object.hasOwn(params, "min_price")).toEqual(false);
    expect(Object.hasOwn(params, "children")).toEqual(false);
    expect(params.engine).toEqual("google_hotels");
    expect(params.q).toEqual("aruba");
    expect(params.check_in_date).toEqual("2026-10-19");
    expect(params.adults).toEqual("2");
  });

  it("no_cache is never sent, and cannot be", () => {
    // Their cache is free and does not count against quota. A code path that could set this
    // is a code path somebody will set.
    const params = providerParams(canonicalize({ ...BASE, sortBy: "3" }));
    expect(Object.hasOwn(params, "no_cache")).toEqual(false);
  });

  it("children is derived from the ages actually given", () => {
    const params = providerParams(canonicalize({ ...BASE, childrenAges: [5, 8] }));
    expect(params.children_ages).toEqual("5,8");
    expect(params.children).toEqual("2");
  });

  it("TTL is short near-term and long far-out", () => {
    const base = 21_600; // 6h
    // Near-term rates move.
    expect(ttlSeconds("2026-10-20", "2026-10-19", base)).toEqual(7_200);
    expect(ttlSeconds("2026-11-10", "2026-10-19", base)).toEqual(base);
    // Far-out rates barely move — and this is where a bot's randomised dates land.
    expect(ttlSeconds("2027-06-01", "2026-10-19", base)).toEqual(86_400);
  });

  it("normalizeDestination caps length so a huge string cannot become a key", () => {
    expect(normalizeDestination("x".repeat(500)).length).toEqual(60);
  });
});
