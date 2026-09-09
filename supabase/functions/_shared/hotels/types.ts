/**
 * SerpApi Google Hotels shapes, and the normalised type we publish.
 *
 * Two halves, and the boundary between them is the compliance control this feature rests
 * on. Above: what the provider sends, transcribed from https://serpapi.com/google-hotels-api,
 * loosely typed because it is someone else's payload and every field is optional in
 * practice. Below: `HotelResult`, which is an allow-list — a field that is not named here
 * does not survive the mapper and therefore cannot reach a page.
 */

// ─────────────────────────────────────────────────────────────────────────────
// What the provider sends. Everything is optional: this is a scrape of a page.
// ─────────────────────────────────────────────────────────────────────────────

export interface ProviderRate {
  lowest?: string;
  /** A FLOAT in dollars (148.0), which is why the mapper converts once, to integer cents. */
  extracted_lowest?: number;
  before_taxes_fees?: string;
  extracted_before_taxes_fees?: number;
}

export interface ProviderImage {
  thumbnail?: string;
  original_image?: string;
}

export interface ProviderProperty {
  type?: string;
  name?: string;
  description?: string;
  /** Google's own booking module. Never mapped — §1.3.2 routes bookings elsewhere. */
  link?: string;
  property_token?: string;
  serpapi_property_details_link?: string;
  gps_coordinates?: { latitude?: number; longitude?: number };
  check_in_time?: string;
  check_out_time?: string;
  rate_per_night?: ProviderRate;
  total_rate?: ProviderRate;
  /**
   * ONE ENTRY PER BOOKING SITE, each with `source`, `logo` and `link`. This is the field
   * the whole normalisation exists to drop. It is typed as `unknown[]` on purpose: giving
   * it a shape would invite someone to read it.
   */
  prices?: unknown[];
  hotel_class?: string;
  extracted_hotel_class?: number;
  images?: ProviderImage[];
  overall_rating?: number;
  reviews?: number;
  location_rating?: number;
  amenities?: string[];
  excluded_amenities?: string[];
  essential_info?: string[];
  property_type?: string;
  sponsored?: boolean;
  eco_certified?: boolean;
  deal?: string;
  deal_description?: string;
  nearby_places?: unknown[];
}

export interface ProviderSearchResponse {
  search_metadata?: { id?: string; status?: string };
  search_information?: { total_results?: number };
  properties?: ProviderProperty[];
  /** Brand facet for their own filter UI. Never mapped. */
  brands?: unknown[];
  /** Paid placement. Never mapped. */
  ads?: unknown[];
  serpapi_pagination?: { next_page_token?: string };
  error?: string;
}

/** GET https://serpapi.com/account.json — free, and not counted against the quota. */
export interface ProviderAccount {
  plan_name?: string;
  searches_per_month?: number;
  plan_searches_left?: number;
  total_searches_left?: number;
  this_month_usage?: number;
  this_hour_searches?: number;
  account_rate_limit_per_hour?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// What we publish.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * One indicative nightly rate. DELIBERATELY NOT A LIST.
 *
 * The provider returns `prices[]`, one entry per booking site, each carrying `source`,
 * `logo` and `link`. Free-Travel-APIs §1.3.5 forbids promoting another business on this
 * site, and §10.2 asks for that to be structural rather than remembered. A `HotelRate[]`
 * with the OTA fields merely omitted would still invite the next developer to "add the
 * source back for attribution". A single scalar cannot. That is the point of the shape.
 *
 * The number is the lowest nightly rate the provider reported across all sources, with no
 * claim about who offers it — because we are not sending anyone there.
 */
export interface HotelRate {
  /** Integer cents as a STRING on the wire. CLAUDE.md rule 5; a float is the hazard. */
  amountCents: string;
  currency: string;
  /**
   * "night" is the only basis we publish. A total-for-the-stay reads like a quote, and
   * §1.0 is explicit that the advisor prices the trip.
   */
  basis: "night";
  beforeTaxesFees: boolean;
}

export interface HotelImage {
  url: string;
  /** Provider imagery carries no alt text; the card supplies its own or renders it decorative. */
  width: number | null;
}

export interface HotelLocation {
  latitude: number;
  longitude: number;
}

export interface HotelResult {
  /** Stable within a response; derived from the property token when there is one. */
  id: string;
  /**
   * The provider's opaque token, carried for exactly one reason: the inquiry step (not
   * built yet) has to be able to name which hotel the visitor picked. It is not a URL and
   * resolves to nothing without our key.
   */
  propertyToken: string | null;
  name: string;
  description: string | null;
  propertyType: string | null;
  /** 2–5. */
  hotelClass: number | null;
  /** 0–5. */
  overallRating: number | null;
  reviewCount: number | null;
  location: HotelLocation | null;
  checkInTime: string | null;
  checkOutTime: string | null;
  amenities: string[];
  images: HotelImage[];
  ecoCertified: boolean;
  rate: HotelRate | null;
}

export type HotelSearchSource = "live" | "cache" | "stale";
export type HotelSearchDegraded = "budget_exhausted" | "provider_unavailable" | null;

export interface HotelSearchEcho {
  destination: string;
  checkIn: string;
  checkOut: string;
  adults: number;
  nights: number;
}

export interface HotelSearchPayload {
  version: number;
  currency: string;
  totalAvailable: number | null;
  results: HotelResult[];
  /**
   * Always false. Every extra page is another billable search, and on 250 a month letting a
   * visitor click "next" three times triples a session's cost. A literal type rather than a
   * comment, so adding pagination is a compile error somewhere rather than a silent
   * multiplier on the bill.
   */
  hasMore: false;
}

export interface HotelSearchResponse extends HotelSearchPayload {
  source: HotelSearchSource;
  degraded: HotelSearchDegraded;
  /** ISO instant the provider was actually called. */
  asOf: string;
  /** Set only when `source === "stale"`, so the page can say how old the prices are. */
  staleAsOf: string | null;
  query: HotelSearchEcho;
}
