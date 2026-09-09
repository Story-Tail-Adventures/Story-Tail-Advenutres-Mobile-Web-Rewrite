/**
 * Cache identity.
 *
 * The expensive failure here is not a hash collision — it is canonicalisation DRIFT: two
 * searches that should be one key becoming two (which doubles the bill on a 250-a-month
 * tier), or two that should differ colliding (which serves one visitor another's prices for
 * the wrong dates).
 */
import { assertEquals, assertNotEquals } from "jsr:@std/assert@^1";
import {
  cacheKey,
  canonicalize,
  normalizeDestination,
  providerParams,
  type SearchInput,
  ttlSeconds,
} from "./cache.ts";

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

Deno.test("accents, case and padding are one destination", async () => {
  // Otherwise the free tier pays three times for one answer.
  const a = await keyOf({ destination: "Curaçao" });
  const b = await keyOf({ destination: "CURACAO" });
  const c = await keyOf({ destination: "  curaçao  " });
  assertEquals(a, b);
  assertEquals(b, c);
});

Deno.test("child ages are order-independent", async () => {
  assertEquals(await keyOf({ childrenAges: [8, 5] }), await keyOf({ childrenAges: [5, 8] }));
});

Deno.test("filter lists are order-independent and deduped", async () => {
  assertEquals(
    await keyOf({ amenities: ["6", "11"] }),
    await keyOf({ amenities: ["11", "6", "11"] }),
  );
});

Deno.test("an absent sort and an empty sort are the same search", async () => {
  // And, below, the same outgoing params — which is what keeps SerpApi's own free hourly
  // cache working for us instead of billing twice.
  assertEquals(await keyOf({ sortBy: "" }), await keyOf({}));
});

Deno.test("dates, party size and sort each change the key", async () => {
  const base = await keyOf({});
  assertNotEquals(base, await keyOf({ checkOut: "2026-10-27" }));
  assertNotEquals(base, await keyOf({ checkIn: "2026-10-20" }));
  assertNotEquals(base, await keyOf({ adults: 3 }));
  assertNotEquals(base, await keyOf({ sortBy: "3" }));
  assertNotEquals(base, await keyOf({ minPrice: 100 }));
});

Deno.test("the canonical struct never carries the api key", () => {
  const canonical = canonicalize(BASE) as unknown as Record<string, unknown>;
  assertEquals(Object.hasOwn(canonical, "api_key"), false);
});

Deno.test("empty parameters are OMITTED, never sent empty", () => {
  const params = providerParams(canonicalize(BASE));
  // SerpApi keys its own cache on the exact param set, so `sort_by=` and no sort_by are
  // two different searches to them, and both bill.
  assertEquals(Object.hasOwn(params, "sort_by"), false);
  assertEquals(Object.hasOwn(params, "rating"), false);
  assertEquals(Object.hasOwn(params, "min_price"), false);
  assertEquals(Object.hasOwn(params, "children"), false);
  assertEquals(params.engine, "google_hotels");
  assertEquals(params.q, "aruba");
  assertEquals(params.check_in_date, "2026-10-19");
  assertEquals(params.adults, "2");
});

Deno.test("no_cache is never sent, and cannot be", () => {
  // Their cache is free and does not count against quota. A code path that could set this
  // is a code path somebody will set.
  const params = providerParams(canonicalize({ ...BASE, sortBy: "3" }));
  assertEquals(Object.hasOwn(params, "no_cache"), false);
});

Deno.test("children is derived from the ages actually given", () => {
  const params = providerParams(canonicalize({ ...BASE, childrenAges: [5, 8] }));
  assertEquals(params.children_ages, "5,8");
  assertEquals(params.children, "2");
});

Deno.test("TTL is short near-term and long far-out", () => {
  const base = 21_600; // 6h
  // Near-term rates move.
  assertEquals(ttlSeconds("2026-10-20", "2026-10-19", base), 7_200);
  assertEquals(ttlSeconds("2026-11-10", "2026-10-19", base), base);
  // Far-out rates barely move — and this is where a bot's randomised dates land.
  assertEquals(ttlSeconds("2027-06-01", "2026-10-19", base), 86_400);
});

Deno.test("normalizeDestination caps length so a huge string cannot become a key", () => {
  assertEquals(normalizeDestination("x".repeat(500)).length, 60);
});
