/**
 * Provider payload -> row shapes. Pure functions, no I/O, no clock beyond what is passed in.
 *
 * This file is where every mismatch between their model and ours is handled, once, in a
 * place tests can reach without a network or a key. The four that matter:
 *
 *   1. SLUGS. Their `company` is not our `slug`. web/content/public/cruise-lines.ts already
 *      ships eight URL-stable slugs feeding screen 2.0.9, and a URL that moves because a
 *      provider spells a line differently is a regression. See COMPANY_SLUG.
 *   2. MONEY. They send floats; rule 5 says bigint cents. See toCents, and read the comment
 *      before touching it — the naive multiply is wrong in a way that rounds real money.
 *   3. DATES. They send date-times where a date is meant. Parsing and re-formatting those
 *      through a Date object shifts a departure by a day for half the world's offsets.
 *   4. ORDERING. `ports_list` day numbers are null for entire cruise lines, so ordering
 *      comes from array position instead. See toPortCalls.
 */
import type {
  ProviderCruise,
  ProviderCruiseLine,
  ProviderPortStop,
  ProviderShip,
} from "./types.ts";

export const PROVIDER = "track_cruises";

/**
 * Their `company` -> our `slug`.
 *
 * Four agree, three do not, and the three that do not are the whole reason this map exists:
 * `celebrity-cruises`, `disney-cruise-line` and `ncl` would otherwise mint second
 * cruise_line rows alongside the slugs screen 2.0.9 already links to.
 *
 * Three of their lines (`costa`, `msc`, `aida`) are not lines Story-Tail books. They still
 * get rows — the catalogue is allowed to be wider than the storefront — but they arrive with
 * is_booked false, and the slug is simply their company value since we have no editorial
 * name for them.
 *
 * Virgin Voyages appears nowhere here BECAUSE THE PROVIDER HAS NO COVERAGE FOR IT. Gyasi
 * books it and 2.0.9 lists it, so it exists as a curated row inserted by migration
 * 20260909001124 with a null provenance pair. That asymmetry is Free-Travel-APIs §10.1's
 * "curated content wins" rule, and it is why sync must never delete a row it did not create.
 */
export const COMPANY_SLUG: Readonly<Record<string, string>> = {
  "royal-caribbean": "royal-caribbean",
  "celebrity-cruises": "celebrity",
  "disney-cruise-line": "disney",
  "princess": "princess",
  "carnival": "carnival",
  "ncl": "norwegian",
  "holland-america": "holland-america",
  "costa": "costa",
  "msc": "msc",
  "aida": "aida",
};

/** The lines Story-Tail books, by OUR slug — the is_booked source of truth. */
export const BOOKED_SLUGS: ReadonlySet<string> = new Set([
  "royal-caribbean",
  "celebrity",
  "disney",
  "princess",
  "carnival",
  "virgin-voyages",
  "norwegian",
  "holland-america",
]);

/** Editorial order from web/content/public/cruise-lines.ts, then everything else after. */
const DISPLAY_ORDER: Readonly<Record<string, number>> = {
  "royal-caribbean": 10,
  "celebrity": 20,
  "disney": 30,
  "princess": 40,
  "carnival": 50,
  "virgin-voyages": 60,
  "norwegian": 70,
  "holland-america": 80,
};

const UNBOOKED_ORDER_BASE = 900;

export function companyToSlug(company: string): string {
  return COMPANY_SLUG[company] ?? slugify(company);
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Float -> integer cents (rule 5).
 *
 * `Math.round(value * 100)` is exact for every 2-decimal fare — verified by sweeping all of
 * them from 0 to 10,000 — so this is NOT the usual float-panic. It is wrong specifically on
 * HALF-CENT values, where the binary residue lands just below the midpoint and rounds the
 * wrong way: 1199.995 * 100 is 119999.49999999999, which rounds DOWN to 119999 instead of
 * up to 120000. Settling the residue at four decimal places first gives 119999.5000, and
 * then 120000.
 *
 * Three-decimal input is not hypothetical here: `price` is typed `number` with no stated
 * scale, and `price_euro` is a cross-market conversion, which is exactly where a third
 * decimal comes from.
 *
 * Rejects non-finite and negative values by returning null rather than storing a nonsense
 * fare; the column's CHECK would refuse a negative anyway, and a failed run is worse than
 * a missing price on a field their spec already marks nullable.
 */
export function toCents(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(Number((value * 100).toFixed(4)));
}

/** ISO 4217 for a char(3) column. Anything else is dropped, not coerced. */
export function toCurrency(value: string | null | undefined): string | null {
  if (!value) return null;
  const upper = value.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(upper) ? upper : null;
}

/**
 * Date-time string -> `date`, WITHOUT going through a Date object.
 *
 * Their schema types `departure_date` as date-time. `new Date(s).toISOString().slice(0,10)`
 * on "2026-11-14T00:00:00-05:00" yields 2026-11-14 in one timezone and 2026-11-13 in
 * another, so a cruise sails a day early depending on where the function ran. The leading
 * ten characters of an ISO string are the calendar date the provider meant; take them.
 */
export function toDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value.trim());
  return match ? match[1] : null;
}

/** Date-times we DO want as instants (arrival/departure at a port) keep their offset. */
export function toTimestamp(value: string | null | undefined): string | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

export function toIntOrNull(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.trunc(value);
}

export interface CruiseLineRow {
  slug: string;
  name: string;
  display_order: number;
  is_booked: boolean;
  ship_count: number | null;
  sailing_count: number | null;
  destination_count: number | null;
  earliest_departure: string | null;
  latest_departure: string | null;
  destinations: string[];
  locales: string[];
  provider: string;
  provider_key: string;
}

export function mapCruiseLine(line: ProviderCruiseLine): CruiseLineRow {
  const slug = companyToSlug(line.company);
  return {
    slug,
    name: line.display_name?.trim() || slug,
    display_order: DISPLAY_ORDER[slug] ?? UNBOOKED_ORDER_BASE,
    is_booked: BOOKED_SLUGS.has(slug),
    // Their field is `cruise_count`; ours is `sailing_count`, because a "cruise" in their
    // vocabulary is one dated sailing, and calling it a cruise count invites someone to
    // read it as distinct itineraries.
    sailing_count: toIntOrNull(line.cruise_count),
    ship_count: toIntOrNull(line.ship_count),
    destination_count: toIntOrNull(line.destination_count),
    earliest_departure: toDate(line.earliest_departure),
    latest_departure: toDate(line.latest_departure),
    destinations: dedupeStrings(line.destinations),
    locales: dedupeStrings(line.locales),
    provider: PROVIDER,
    provider_key: line.company,
  };
}

export interface ShipRow {
  name: string;
  slug: string;
  sailing_count: number | null;
  earliest_departure: string | null;
  latest_departure: string | null;
  provider: string;
  provider_key: string;
  /** Resolved to cruise_line_id by the caller. */
  company: string;
}

/**
 * The provenance key for a ship.
 *
 * The provider identifies a ship by NAME — /ships returns {ship_name, company,
 * sailing_count} with no id — so the key has to be composite: without the company prefix,
 * two lines that both sail a "Discovery" collide on one row.
 *
 * THIS EXISTS AS A FUNCTION BECAUSE TWO CODE PATHS WRITE cruise_ship, and they diverged.
 * /ships arrives through mapShip; a sailing naming a ship we have no row for mints a stub
 * through sync.ts. When the stub built its key from the internal cruise_line UUID instead of
 * the company slug, one ship could hold either format depending on which path saw it first
 * — a UUID in a column documented as "the provider's identifier", and a provenance key that
 * would change if the line row were ever recreated. Both paths now call this.
 */
export function shipProviderKey(company: string, shipName: string): string {
  return `${company}:${shipName.trim()}`;
}

export function mapShip(ship: ProviderShip): ShipRow {
  return {
    name: ship.ship_name.trim(),
    slug: slugify(ship.ship_name),
    sailing_count: toIntOrNull(ship.sailing_count),
    earliest_departure: toDate(ship.earliest_departure),
    latest_departure: toDate(ship.latest_departure),
    provider: PROVIDER,
    provider_key: shipProviderKey(ship.company, ship.ship_name),
    company: ship.company,
  };
}

export interface PortRow {
  name: string;
  sailing_count: number | null;
  provider: string;
  provider_key: string;
}

/**
 * Port names arrive dirty, and only the unambiguous artifacts are cleaned.
 *
 * A live /filter-options response contains 4,566 entries including `'Bucht von Palma'` and
 * `'Ionisches Meer 'darkest spot'` — stray apostrophes that are plainly encoding debris, not
 * part of any port's name. Those are stripped, because leaving them makes the natural key
 * unstable: the day the provider fixes its quoting we would gain a duplicate row for the
 * same quay.
 *
 * WHAT IS DELIBERATELY NOT CLEANED: entries like `38.6 N 19.8 E - Ionian Sea` are at-sea
 * positions rather than ports, and they are real itinerary stops. Dropping them would put
 * holes in port-call sequences for every sailing with a sea day. They belong in the table;
 * deciding which rows a departure-port filter should offer is the search work's job, and
 * `sailing_count` is the signal it will want.
 */
export function mapPort(name: string, sailingCount?: number): PortRow {
  const clean = name.trim().replace(/^['"`\s]+|['"`\s]+$/g, "").trim();
  return {
    name: clean,
    sailing_count: toIntOrNull(sailingCount),
    provider: PROVIDER,
    provider_key: clean,
  };
}

export interface SailingRow {
  provider: string;
  provider_key: string;
  provider_locale: string;
  title: string | null;
  departure_date: string;
  duration_nights: number | null;
  lead_price_cents: number | null;
  currency: string | null;
  lead_price_eur_cents: number | null;
  destinations: string[];
  itinerary_url: string | null;
  provider_updated_at: string | null;
  /** Resolved to ids by the caller. */
  company: string;
  ship_name: string | null;
}

/**
 * Returns null for a sailing with no usable departure date. That is the one field the row
 * cannot do without: `departure_date` is NOT NULL, it is what every search filters on, and
 * a sailing whose date we cannot read is not inventory. Everything else may be absent.
 */
export function mapSailing(cruise: ProviderCruise): SailingRow | null {
  const departure = toDate(cruise.departure_date);
  if (!departure || !cruise.cruise_id || !cruise.locale) return null;

  const currency = toCurrency(cruise.currency);
  const cents = toCents(cruise.price);

  return {
    provider: PROVIDER,
    provider_key: cruise.cruise_id,
    provider_locale: cruise.locale,
    title: cruise.title?.trim() || null,
    departure_date: departure,
    duration_nights: positiveOrNull(cruise.duration),
    // The column's CHECK refuses a fare without a currency, so drop the number rather than
    // fail the whole upsert over a provider row that sent one and not the other.
    lead_price_cents: currency ? cents : null,
    currency,
    lead_price_eur_cents: toCents(cruise.price_euro),
    destinations: dedupeStrings(cruise.destinations),
    itinerary_url: cruise.itinerary_url?.trim() || null,
    provider_updated_at: toTimestamp(cruise.updated_at),
    company: cruise.company,
    ship_name: cruise.ship_name?.trim() || null,
  };
}

export interface PortCallRow {
  port_name: string;
  sequence: number;
  day: number | null;
  arrival_at: string | null;
  departure_at: string | null;
}

/**
 * Itinerary stops, ordered by ARRAY POSITION rather than by `day`.
 *
 * Their spec: `day` is null whenever the source feed omitted it, and Holland America's feed
 * omits every one, "so all HAL sailings return null here. Buyers should treat null as
 * 'unknown day' rather than zero or one." Sorting by a null column scrambles an entire
 * cruise line's itineraries, and coalescing null to 0 or 1 invents facts. So `sequence` is
 * dense and 1-based from the order they sent, `day` is carried through untouched for
 * display, and the ordering guarantee lives in a column we control.
 *
 * Stops with an empty port name are dropped BEFORE numbering, so the sequence stays dense
 * and the unique index on (sailing_id, sequence) cannot be tripped by a gap.
 */
export function toPortCalls(stops: ProviderPortStop[] | null | undefined): PortCallRow[] {
  if (!Array.isArray(stops)) return [];
  return stops
    .filter((stop) => typeof stop?.port === "string" && stop.port.trim() !== "")
    .map((stop, index) => ({
      port_name: stop.port.trim(),
      sequence: index + 1,
      day: positiveOrNull(stop.day),
      arrival_at: toTimestamp(stop.arrival),
      departure_at: toTimestamp(stop.departure),
    }));
}

export interface CabinPriceRow {
  cabin_code: string;
  price_cents: number;
  currency: string;
}

/**
 * `cabin_prices_per_person` -> rows. Only ever present on GET /cruises/{id}.
 *
 * The cabin vocabulary is open — their spec lists five normalised codes "plus line-specific
 * tiers like CONCIERGE, AQUA, VISTA_SUITE, NEPTUNE_SUITE, HAVEN" — so codes are normalised
 * in shape (upper, underscored) but never checked against a list. A tier a line invents
 * next month must land as a row, not fail a sync.
 */
export function toCabinPrices(
  cabinPrices: Record<string, number> | null | undefined,
  currency: string | null,
): CabinPriceRow[] {
  if (!cabinPrices || !currency) return [];
  const rows: CabinPriceRow[] = [];
  for (const [rawCode, rawPrice] of Object.entries(cabinPrices)) {
    const code = rawCode.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
    const cents = toCents(rawPrice);
    if (!code || cents === null) continue;
    rows.push({ cabin_code: code, price_cents: cents, currency });
  }
  return rows;
}

/**
 * Ship and port names arrive from several endpoints for the same entity, so duplicates
 * within one payload are normal. Order is preserved because destination arrays are rendered
 * in the order the provider chose.
 */
export function dedupeStrings(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    if (typeof value !== "string") continue;
    const clean = value.trim();
    if (clean === "" || seen.has(clean)) continue;
    seen.add(clean);
    out.push(clean);
  }
  return out;
}

function positiveOrNull(value: number | null | undefined): number | null {
  const int = toIntOrNull(value);
  return int !== null && int > 0 ? int : null;
}
