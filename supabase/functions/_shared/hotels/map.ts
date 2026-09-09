/**
 * Provider payload → the normalised shape we publish.
 *
 * THE MAPPING IS AN ALLOW-LIST, AND THAT IS THE COMPLIANCE CONTROL. Every field is copied
 * BY NAME. There is no spread, no `Object.assign`, no `JSON.parse(JSON.stringify(p))`. A
 * field the provider adds tomorrow — or one we simply did not think about, like
 * `prices[].source` — does not exist downstream, because nothing here names it.
 *
 * Free-Travel-APIs §10.2 asks for exactly this ("the cleanest enforcement is structural"),
 * and §1.3.5 is the rule it enforces: the site may promote the advisor's travel business
 * and nothing else. A booking-site name, its logo or its link on this page is a contract
 * problem, not a layout bug, so it is prevented by construction and pinned by a test that
 * asserts on the serialised output rather than on individual fields.
 */
import type {
  HotelImage,
  HotelRate,
  HotelResult,
  HotelSearchPayload,
  ProviderProperty,
  ProviderSearchResponse,
} from "./types.ts";

/**
 * Bumped whenever the shape below changes. It is part of the cache's unique index, so a
 * deploy gets a cold cache rather than a mixed one — without it a renamed field is read
 * back from old-shaped JSON and either throws or silently blanks a public page.
 */
export const PAYLOAD_VERSION = 1;

/** At most this many results, and this many photos each. Page one only. */
export const MAX_RESULTS = 20;
export const MAX_IMAGES = 6;
export const MAX_AMENITIES = 12;

/**
 * Hosts whose images we will point a visitor's browser at.
 *
 * `web/next.config.ts` registers a CUSTOM image loader, which means `remotePatterns` is
 * never consulted and any URL we return would be fetched by the visitor's browser from
 * whatever origin we name. So the allow-list has to live somewhere, and here is the earlier
 * of the two places. The web side repeats it; belt and braces is correct for the one field
 * that reaches out to a third party from a page with a published privacy policy.
 */
const IMAGE_HOSTS = [
  "lh3.googleusercontent.com",
  "lh4.googleusercontent.com",
  "lh5.googleusercontent.com",
  "lh6.googleusercontent.com",
  "encrypted-tbn0.gstatic.com",
  "encrypted-tbn1.gstatic.com",
  "encrypted-tbn2.gstatic.com",
  "encrypted-tbn3.gstatic.com",
  "streetviewpixels-pa.googleapis.com",
];

function isAllowedImage(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && IMAGE_HOSTS.includes(parsed.hostname);
  } catch {
    return false;
  }
}

function text(value: unknown, max = 400): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/[\p{Cc}]/gu, " ").replace(/\s+/g, " ").trim();
  return cleaned ? cleaned.slice(0, max) : null;
}

function wholeNumber(value: unknown, min: number, max: number): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const rounded = Math.round(value);
  return rounded >= min && rounded <= max ? rounded : null;
}

/**
 * The rate, in integer cents.
 *
 * `extracted_lowest` is the only field trusted. `lowest` is a display string ("$1,148") and
 * parsing it means guessing at a currency symbol, a thousands separator and a locale — and
 * a wrong number on a public page is a compliance problem rather than a layout one. No
 * extracted value means no rate, and the card says so.
 */
export function mapRate(property: ProviderProperty, currency: string): HotelRate | null {
  const nightly = property.rate_per_night;
  if (!nightly) return null;

  const dollars = nightly.extracted_lowest;
  if (typeof dollars !== "number" || !Number.isFinite(dollars) || dollars < 0) return null;

  // One conversion, here, so a float never travels further than this line.
  const cents = Math.round(dollars * 100);
  if (cents <= 0) return null;

  return {
    amountCents: String(cents),
    currency,
    basis: "night",
    beforeTaxesFees: typeof nightly.extracted_before_taxes_fees === "number",
  };
}

function mapImages(property: ProviderProperty): HotelImage[] {
  if (!Array.isArray(property.images)) return [];
  const out: HotelImage[] = [];
  for (const image of property.images) {
    if (out.length >= MAX_IMAGES) break;
    // `original_image` is full-size and unbounded; the thumbnail is what a card wants.
    const url = typeof image?.thumbnail === "string" ? image.thumbnail : null;
    if (!url || !isAllowedImage(url)) continue;
    out.push({ url, width: null });
  }
  return out;
}

function mapAmenities(property: ProviderProperty): string[] {
  if (!Array.isArray(property.amenities)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of property.amenities) {
    if (out.length >= MAX_AMENITIES) break;
    const value = text(raw, 60);
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

/**
 * One property, or null when it must not be shown.
 *
 * Two reasons to drop rather than render:
 *   * no name — there is nothing to put on the card;
 *   * `sponsored` — paid placement on a page that InteleTravel compliance has to approve
 *     (§1.3.1) is the first thing a reviewer will ask about, and we cannot label it as an
 *     ad because we do not control the placement.
 */
export function mapProperty(
  property: ProviderProperty,
  currency: string,
  index: number,
): HotelResult | null {
  if (property.sponsored === true) return null;

  const name = text(property.name, 160);
  if (!name) return null;

  const token = text(property.property_token, 200);
  const lat = property.gps_coordinates?.latitude;
  const lng = property.gps_coordinates?.longitude;
  const hasCoords = typeof lat === "number" && typeof lng === "number" &&
    Number.isFinite(lat) && Number.isFinite(lng);

  return {
    id: token ?? `p${index}`,
    propertyToken: token,
    name,
    description: text(property.description, 600),
    propertyType: text(property.property_type ?? property.type, 60),
    hotelClass: wholeNumber(property.extracted_hotel_class, 1, 5),
    // Guarded rather than passed through: a string, or a 9.2 out of 10, would render as a
    // star rating that is simply wrong.
    overallRating: typeof property.overall_rating === "number" &&
        Number.isFinite(property.overall_rating) &&
        property.overall_rating >= 0 && property.overall_rating <= 5
      ? Math.round(property.overall_rating * 10) / 10
      : null,
    reviewCount: wholeNumber(property.reviews, 0, 10_000_000),
    location: hasCoords ? { latitude: lat, longitude: lng } : null,
    checkInTime: text(property.check_in_time, 20),
    checkOutTime: text(property.check_out_time, 20),
    amenities: mapAmenities(property),
    images: mapImages(property),
    ecoCertified: property.eco_certified === true,
    rate: mapRate(property, currency),
  };
}

/**
 * The whole response.
 *
 * Note what is NOT read: `ads` (paid placement), `serpapi_pagination` (our vendor's URLs,
 * and page two is another bill), `deal`/`deal_description` (they can name a booking site),
 * `total_rate` (reads like a quote), `nearby_places`, `reviews_breakdown`, `essential_info`.
 * Every field carried is a field a compliance reviewer has to read.
 */
export function mapSearchResponse(
  raw: ProviderSearchResponse,
  currency: string,
): HotelSearchPayload {
  const properties = Array.isArray(raw.properties) ? raw.properties : [];
  const results: HotelResult[] = [];

  for (const [index, property] of properties.entries()) {
    if (results.length >= MAX_RESULTS) break;
    const mapped = mapProperty(property, currency, index);
    if (mapped) results.push(mapped);
  }

  const total = raw.search_information?.total_results;

  return {
    version: PAYLOAD_VERSION,
    currency,
    totalAvailable: typeof total === "number" && Number.isFinite(total) && total >= 0
      ? Math.round(total)
      : null,
    results,
    hasMore: false,
  };
}

/** Lowest and highest nightly rate in cents, denormalised onto the cache row. */
export function rateSpread(
  payload: HotelSearchPayload,
): { lowest: number | null; highest: number | null } {
  const cents = payload.results
    .map((r) => (r.rate ? Number(r.rate.amountCents) : NaN))
    .filter((n) => Number.isFinite(n));
  if (cents.length === 0) return { lowest: null, highest: null };
  return { lowest: Math.min(...cents), highest: Math.max(...cents) };
}
