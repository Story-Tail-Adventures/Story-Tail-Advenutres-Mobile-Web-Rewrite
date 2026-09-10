/**
 * SerpApi Google Hotels fixtures, plus the provider stub.
 *
 * THE POISONED FIXTURE IS THE POINT. `SEARCH_PAGE` carries a full `prices[]` with real
 * booking-site names, their logos and their links, an `ads[]` block, a sponsored property
 * and a `deal_description`. Without those, the tests asserting that none of it survives the
 * mapper would pass against a payload that never contained them — which is to say they
 * would assert nothing. Any fixture added here should keep the hostile fields.
 *
 * CI runs `deno test --allow-env` with no network and no read permission, so fixtures are
 * TypeScript modules rather than JSON on disk, and the library's calls are injected.
 */
import type { ProviderAccount, ProviderSearchResponse } from "../types.ts";

export const API_KEY = "test-serpapi-key-do-not-use";

/** A second, different-looking key, to prove the pattern redactor is not just an equality check. */
export const ROTATED_KEY =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

export const SEARCH_PAGE: ProviderSearchResponse = {
  search_metadata: { id: "68c0f0aa1e3b4a0001b2c3d4", status: "Success" },
  search_information: { total_results: 148 },
  brands: [{ id: 33, name: "Marriott" }],
  ads: [
    {
      name: "Sponsored — Book on Expedia",
      source: "Expedia",
      link: "https://www.expedia.com/h123456.Hotel-Information",
      logo: "https://www.gstatic.com/travel-hotels/branding/expedia.png",
    },
  ],
  properties: [
    {
      type: "hotel",
      name: "Bucuti & Tara Beach Resort",
      description: "Adults-only beachfront resort on Eagle Beach.",
      link: "https://www.google.com/travel/hotels/entity/CgoI...",
      property_token: "ChkIvNqzr5aQnPCLARoML2cvMTFjNl9nZjNfEAE",
      serpapi_property_details_link:
        "https://serpapi.com/search.json?engine=google_hotels&property_token=ChkI",
      gps_coordinates: { latitude: 12.5567, longitude: -70.0428 },
      check_in_time: "3:00 PM",
      check_out_time: "11:00 AM",
      rate_per_night: {
        lowest: "$412",
        extracted_lowest: 412,
        before_taxes_fees: "$372",
        extracted_before_taxes_fees: 372,
      },
      total_rate: { lowest: "$2,884", extracted_lowest: 2884 },
      // Every hostile field the mapper must drop, in the shape the provider really sends.
      prices: [
        {
          source: "Booking.com",
          logo: "https://www.gstatic.com/travel-hotels/branding/booking.png",
          link: "https://www.booking.com/hotel/aw/bucuti.html",
          num_guests: 2,
          rate_per_night: { lowest: "$412", extracted_lowest: 412 },
          free_cancellation: true,
        },
        {
          source: "Hotels.com",
          logo: "https://www.gstatic.com/travel-hotels/branding/hotels.png",
          link: "https://www.hotels.com/ho123456",
          num_guests: 2,
          rate_per_night: { lowest: "$429", extracted_lowest: 429 },
        },
      ],
      hotel_class: "5-star hotel",
      extracted_hotel_class: 5,
      images: [
        {
          thumbnail:
            "https://lh3.googleusercontent.com/proxy/abc=s287-w287-h192-n-k-no-v1",
          original_image: "https://lh3.googleusercontent.com/proxy/abc",
        },
        {
          // Not on the allow-list — must be dropped rather than pointed at from our page.
          thumbnail: "https://cdn.some-ota.example/photo.jpg",
          original_image: "https://cdn.some-ota.example/photo.jpg",
        },
      ],
      overall_rating: 4.8,
      reviews: 2140,
      location_rating: 4.9,
      amenities: ["Beach access", "Spa", "Free Wi-Fi", "Spa", "Restaurant"],
      excluded_amenities: ["Kid-friendly"],
      property_type: "Resort",
      eco_certified: true,
      deal: "22% off",
      deal_description: "Cheaper than usual on Booking.com",
      nearby_places: [{ name: "Eagle Beach" }],
    },
    {
      type: "hotel",
      name: "Renaissance Wind Creek Aruba",
      property_token: "ChkIvNqzr5aQnPCLARoML2cvMTFjNl9nZjNfEAF",
      gps_coordinates: { latitude: 12.5186, longitude: -70.0358 },
      rate_per_night: { lowest: "$318", extracted_lowest: 318.5 },
      extracted_hotel_class: 4,
      overall_rating: 4.4,
      reviews: 5120,
      amenities: ["Pool", "Restaurant"],
      images: [{ thumbnail: "https://lh5.googleusercontent.com/proxy/def=s287" }],
    },
    {
      // Paid placement: dropped, because we cannot label a placement we do not control on a
      // page InteleTravel compliance has to approve.
      type: "hotel",
      name: "Sponsored Beach Club",
      sponsored: true,
      property_token: "ChkSPONSORED",
      rate_per_night: { lowest: "$199", extracted_lowest: 199 },
    },
    {
      // No extracted rate — kept, with a null rate, rather than dropped. Dropping would
      // silently shrink the page and we would never know why.
      type: "hotel",
      name: "Boardwalk Boutique Hotel",
      property_token: "ChkNOPRICE",
      rate_per_night: { lowest: "$1,148" },
      extracted_hotel_class: 4,
      overall_rating: 4.9,
      reviews: 640,
      images: [{ thumbnail: "https://lh3.googleusercontent.com/proxy/ghi=s287" }],
    },
  ],
  serpapi_pagination: { next_page_token: "eyJwYWdlIjoy" },
};

/** A destination that genuinely has nothing — must still be cached, not re-fetched. */
export const EMPTY_PAGE: ProviderSearchResponse = {
  search_metadata: { id: "68c0f0aa1e3b4a0001b2c3d5", status: "Success" },
  search_information: { total_results: 0 },
  properties: [],
};

/** `properties` absent entirely, which the docs do not promise but the API does. */
export const SHAPELESS_PAGE: ProviderSearchResponse = {
  search_metadata: { id: "68c0f0aa1e3b4a0001b2c3d6", status: "Success" },
};

export const ACCOUNT: ProviderAccount = {
  plan_name: "Free",
  searches_per_month: 250,
  plan_searches_left: 187,
  total_searches_left: 187,
  this_month_usage: 63,
  this_hour_searches: 4,
  account_rate_limit_per_hour: 50,
};

export const ERROR_BODY = {
  error: "Invalid API key. Your API key should be here: /manage-api-key",
};

/** A rate-limit refusal, as the provider words it. Permanence is now inferred from this. */
export const RATE_LIMITED_BODY = {
  error: "Your account has hit its rate limit. Please slow down your requests.",
};

/** A transient upstream failure whose wording matches none of the permanent patterns. */
export const TRANSIENT_BODY = { error: "Backend responded with 502" };

export interface StubResponse {
  /** Resolve with this. The library resolves only on HTTP 200. */
  body?: unknown;
  /**
   * Reject with this. The library's error channel is a RAW BODY STRING on any non-200 — no
   * status code, not an Error — so that is what these tests hand back. An Error here stands
   * in for a transport failure instead.
   */
  rejects?: unknown;
}

/**
 * A stub for the library's two calls, replacing the old fetch stub.
 *
 * `calls` records the PARAMETER OBJECTS we handed the library rather than URLs, because
 * this module no longer builds a URL. That is what lets the tests below still assert both
 * halves of the credential rule: the key goes to the provider, and never into the ledger.
 */
export function stubProvider(responses: StubResponse[]) {
  const calls: Record<string, string | number>[] = [];
  const queue = [...responses];

  const impl = (params: Record<string, string | number>): Promise<unknown> => {
    calls.push(params);
    const next = queue.shift();
    if (!next) return Promise.reject(new Error("stubProvider: no queued response"));
    if ("rejects" in next) return Promise.reject(next.rejects);
    return Promise.resolve(next.body);
  };

  return { impl, calls, remaining: () => queue.length };
}
