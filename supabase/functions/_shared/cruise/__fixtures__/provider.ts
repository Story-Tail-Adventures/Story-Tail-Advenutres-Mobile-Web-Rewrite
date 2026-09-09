/**
 * Provider response fixtures, transcribed from the examples in their OpenAPI spec
 * (https://www.track.cruises/openapi.json) plus the two error shapes their §RateLimited
 * response documents.
 *
 * Committed rather than recorded live because ci.yml runs the PR workflow with no secrets
 * and no network. When the spec changes, these and types.ts move together.
 */
import type {
  ProviderCruise,
  ProviderCruiseLine,
  ProviderListEnvelope,
} from "../types.ts";

export const CRUISE_LINES_PAGE: ProviderListEnvelope<ProviderCruiseLine> = {
  data: [
    {
      company: "royal-caribbean",
      display_name: "Royal Caribbean",
      cruise_count: 9214,
      ship_count: 28,
      destination_count: 41,
      destinations: ["Caribbean", "Alaska", "Mediterranean"],
      locales: ["en_US", "en_GB", "en_CA"],
      earliest_departure: "2026-09-12T00:00:00Z",
      latest_departure: "2028-05-04T00:00:00Z",
    },
    {
      company: "ncl",
      display_name: "Norwegian Cruise Line",
      cruise_count: 6103,
      ship_count: 19,
      destination_count: 37,
      destinations: ["Caribbean", "Bermuda"],
      locales: ["en_US", "en_GB"],
      earliest_departure: "2026-09-14T00:00:00Z",
      latest_departure: "2028-03-19T00:00:00Z",
    },
    {
      company: "aida",
      display_name: "AIDA Cruises",
      cruise_count: 2044,
      ship_count: 11,
      destination_count: 22,
      destinations: ["Mittelmeer", "Kanaren"],
      locales: ["de_DE", "de_AT"],
      earliest_departure: "2026-09-20T00:00:00Z",
      latest_departure: "2027-11-02T00:00:00Z",
    },
  ],
  request_id: "01JSAX0000000000000000001",
};

/**
 * A Holland America sailing: every ports_list day is null, which their spec calls out
 * explicitly for HAL's feed. This is the fixture that keeps `sequence` honest.
 */
export const HAL_SAILING: ProviderCruise = {
  cruise_id: "Y731",
  itinerary_id: "ITIN-Y731",
  title: "Eastern Caribbean Holiday",
  company: "holland-america",
  locale: "en_US",
  ship_name: "Eurodam",
  departure_date: "2027-01-09T00:00:00Z",
  duration: 11,
  price: 2640.5,
  price_euro: 2431.995,
  currency: "USD",
  destinations: ["Caribbean", "Panama Canal"],
  ports_list: [
    { port: "Fort Lauderdale", day: null },
    { port: "Half Moon Cay", day: null },
    { port: "Grand Turk", day: null },
  ],
  itinerary_url: "https://example.invalid/hal/y731",
  updated_at: "2026-09-07T04:12:09Z",
};

/** A Princess sailing sharing HAL's voyage-code format — the natural-key collision case. */
export const PRINCESS_SAILING: ProviderCruise = {
  cruise_id: "Y731",
  company: "princess",
  locale: "en_US",
  ship_name: "Caribbean Princess",
  departure_date: "2027-02-14T00:00:00Z",
  duration: 10,
  price: 1850,
  price_euro: 1703.4,
  currency: "USD",
  destinations: ["Southern Caribbean"],
  ports_list: [
    { port: "Port Everglades", day: 1, departure: "2027-02-14T17:00:00Z" },
    { port: "Aruba", day: 4, arrival: "2027-02-17T08:00:00Z" },
  ],
  updated_at: "2026-09-07T05:01:44Z",
};

export const CRUISES_PAGE_ONE: ProviderListEnvelope<ProviderCruise> = {
  data: [HAL_SAILING, PRINCESS_SAILING],
  has_more: true,
  next_cursor: "cursor-page-2",
  request_id: "01JSAX0000000000000000002",
};

export const CRUISES_PAGE_TWO: ProviderListEnvelope<ProviderCruise> = {
  data: [{
    cruise_id: "AB12",
    company: "carnival",
    locale: "en_US",
    ship_name: "Mardi Gras",
    departure_date: "2027-03-06T00:00:00Z",
    duration: 7,
    price: 1290,
    currency: "USD",
    destinations: ["Western Caribbean"],
    ports_list: [{ port: "Port Canaveral", day: 1 }],
    updated_at: "2026-09-06T22:10:00Z",
  }],
  has_more: false,
  next_cursor: null,
  request_id: "01JSAX0000000000000000003",
};

/** Their backend's shape: RFC 9457 problem+json, with a code and a request_id. */
export const PROBLEM_429 = {
  type: "https://track.cruises/problems/rate-limit",
  title: "Too Many Requests",
  status: 429,
  code: "rate_limit_exceeded",
  detail: "Per-key monthly quota exhausted",
  request_id: "01JSAX0000000000000000429",
  retry_after_seconds: 2,
};

export const PROBLEM_403 = {
  type: "https://track.cruises/problems/tier",
  title: "Forbidden",
  status: 403,
  code: "tier_insufficient",
  detail: "price-history requires a higher tier",
  request_id: "01JSAX0000000000000000403",
  required_tier: "PRO",
};

/**
 * The relay's shape, which arrives instead of the above when RapidAPI's own throttle trips
 * or the key is bad. No code, no request_id. Observed verbatim from a keyless probe.
 */
export const RELAY_429 = {
  message:
    "You have exceeded the rate limit per minute for your plan, BASIC, by the API provider",
};

export const RELAY_401 = {
  message: "Invalid API key. Go to https://docs.rapidapi.com/docs/keys for more info.",
};

export interface StubCall {
  url: string;
  headers: Record<string, string>;
}

export interface StubResponse {
  status?: number;
  body: unknown;
  headers?: Record<string, string>;
}

/** A fetch stub that replays a queue of responses and records what it was asked for. */
export function stubFetch(responses: StubResponse[]) {
  const calls: StubCall[] = [];
  const queue = [...responses];

  const impl: typeof fetch = (input, init) => {
    const url = typeof input === "string" ? input : String(input);
    const headers: Record<string, string> = {};
    new Headers(init?.headers).forEach((value, key) => {
      headers[key] = value;
    });
    calls.push({ url, headers });

    const next = queue.shift();
    if (!next) throw new Error(`stubFetch: no queued response for ${url}`);

    return Promise.resolve(
      new Response(JSON.stringify(next.body), {
        status: next.status ?? 200,
        headers: { "Content-Type": "application/json", ...(next.headers ?? {}) },
      }),
    );
  };

  return { impl, calls, remaining: () => queue.length };
}

/** The quota triple, as the relay sends it. */
export function quotaHeaders(
  remaining: number,
  limit = 100,
  reset = 1_209_600,
): Record<string, string> {
  return {
    "x-ratelimit-requests-limit": String(limit),
    "x-ratelimit-requests-remaining": String(remaining),
    "x-ratelimit-requests-reset": String(reset),
  };
}

/**
 * A real GET /cruises page, trimmed to the rows that matter.
 *
 * Captured live in September 2026, and it carries four things the spec's own examples do
 * not. Each one is asserted in map_test.ts:
 *
 *   1. THE SAME cruise_id ACROSS LOCALES, with different prices, currencies, titles,
 *      durations and even itinerary_ids. 61020 is 23 nights in en_US and 21 in nl_NL.
 *      This is the natural-key case made concrete.
 *   2. `pt_BR`, WHICH IS NOT IN THEIR PUBLISHED LocaleEnum. Priced in BRL.
 *   3. LOCALISED PORT NAMES. "Rhodes, Greece" / "Rodi, Grecia" / "Rodes, Grécia" /
 *      "Alexandria, Ägypten" are the same physical port under four names, and nothing in
 *      the payload connects them.
 *   4. departure_date at 04:00Z — midnight US Eastern, i.e. the exact shape that makes a
 *      timezone-naive date conversion move a sailing by a day.
 */
export const LIVE_CRUISES_PAGE: ProviderListEnvelope<ProviderCruise> = {
  data: [
    {
      cruise_id: "61020",
      itinerary_id: "DBXCRUISETOUR6SKY21PIRRHOALYSOKSGASSHAQBJEDMCTDOHABUDBX",
      title: "Dubai Cruisetour",
      company: "ncl",
      locale: "en_US",
      ship_name: "Norwegian Sky",
      departure_date: "2026-09-09T04:00:00+00:00",
      duration: 23,
      price: 4368,
      price_euro: 3739.44,
      currency: "USD",
      destinations: ["Asia"],
      ports_list: [
        { port: "Athens (Piraeus), Greece", day: 1 },
        { port: "Rhodes, Greece", day: 2 },
        { port: "Alexandria, Egypt", day: 3 },
      ],
      itinerary_url: "https://www.ncl.com/us/en/cruises/dubai-cruisetour",
      updated_at: "2026-05-15T05:42:43.591+00:00",
    },
    {
      cruise_id: "61020",
      itinerary_id: "SKY21PIRRHOALYSOKSGASSHAQBJEDMCTDOHABUDBX",
      title: "Middle East & Africa: Greece, Qatar, Egypt & Jordan",
      company: "ncl",
      locale: "nl_NL",
      ship_name: "Norwegian Sky",
      departure_date: "2026-09-09T04:00:00+00:00",
      duration: 21,
      price: 3420,
      price_euro: 3420,
      currency: "EUR",
      destinations: ["Africa Cruises", "Asia", "Mediterranean"],
      ports_list: [
        { port: "Athens (Piraeus), Greece", day: 1 },
        { port: "Rhodes, Greece", day: 2 },
      ],
      updated_at: "2026-05-16T04:22:51.147+00:00",
    },
    {
      cruise_id: "61020",
      itinerary_id: "SKY21PIRRHOALYSOKSGASSHAQBJEDMCTDOHABUDBX",
      title: "Medio Oriente e Africa: Grecia, Qatar, Egitto e Giordania",
      company: "ncl",
      locale: "it_IT",
      ship_name: "Norwegian Sky",
      departure_date: "2026-09-09T04:00:00+00:00",
      duration: 21,
      price: 3420,
      price_euro: 3420,
      currency: "EUR",
      destinations: ["Africa Cruises", "Asia", "Mediterranean"],
      ports_list: [
        { port: "Athens (Piraeus), Greece", day: 1 },
        { port: "Rodi, Grecia", day: 2 },
        { port: "Alessandria, Egitto", day: 3 },
      ],
      updated_at: "2026-05-15T06:22:32.148+00:00",
    },
    {
      cruise_id: "63120",
      itinerary_id: "SKY18PIRRHOALYSOKSSHSGAAQBJEDMCT",
      title: "Oriente Médio & África: Grécia, Egito & Jordânia",
      company: "ncl",
      // Not in their published LocaleEnum.
      locale: "pt_BR",
      ship_name: "Norwegian Sky",
      departure_date: "2026-09-09T04:00:00+00:00",
      duration: 18,
      price: 11121,
      price_euro: 1896.71,
      currency: "BRL",
      destinations: ["Africa Cruises", "Asia", "Greek Isles Cruises"],
      ports_list: [
        { port: "Athens (Piraeus), Greece", day: 1 },
        { port: "Rodes, Grécia", day: 2 },
      ],
      updated_at: "2026-07-31T09:07:41.87+00:00",
    },
  ],
  has_more: true,
  // Base64url JSON: {"s":"departure_date:asc","v":"2026-09-09T04:00:00+00:00","i":"63120"}
  // The cursor encodes the sort, which is why their spec insists the sort and filters stay
  // identical across a paginated series.
  next_cursor:
    "eyJzIjoiZGVwYXJ0dXJlX2RhdGU6YXNjIiwidiI6IjIwMjYtMDktMDlUMDQ6MDA6MDArMDA6MDAiLCJpIjoiNjMxMjAifQ",
  request_id: "01M21SS6QTSF2YY37ND1CRBAGH",
};
