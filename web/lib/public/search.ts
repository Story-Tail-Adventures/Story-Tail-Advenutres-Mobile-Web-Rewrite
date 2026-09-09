import type {
  BudgetBand,
  Topic,
  Trip,
  TripType,
  Vibe,
} from "@/content/public/types";
import { addDays, formatRange, isValidIsoDate, nightsBetween, todayIso } from "./dates";
import { bandFromCents } from "./money";

/**
 * Search over the curated catalog behind 2.0.3 / 2.0.4 (Screen Inventory §2.0).
 *
 * Everything here is pure and total: `parseSearchParams` never throws on hostile input,
 * unknown values are dropped, lengths are capped, and sorting has a deterministic slug
 * tie-break so the same URL always renders the same order. Phase 2 swaps `TRIPS` for the
 * travel-API results without touching the pages.
 */

export const TRIP_TYPES: readonly TripType[] = ["all-inclusive", "cruise", "hotel", "tour"];
export const VIBES: readonly Vibe[] = [
  "adults-only",
  "family",
  "honeymoon",
  "five-star",
  "couples",
  "group",
  "boutique",
  "adventure",
];
export const BUDGET_BANDS: readonly BudgetBand[] = ["under-2k", "2k-4k", "4k-plus"];
export const TOPICS: readonly Topic[] = ["caribbean", "cruises", "honeymoons"];
export const SORT_KEYS = ["best-fit", "price-asc", "price-desc", "rating"] as const;
export type SortKey = (typeof SORT_KEYS)[number];

/**
 * Which catalog the results page is showing.
 *
 * `picks` is Gyasi's curated catalog and stays the default. `hotels` is the live provider
 * search. Left undefined in the URL when it is derivable, exactly as `sort` omits
 * "best-fit" — so a search carrying dates lands on hotels without a param, and an explicit
 * click on "Gyasi's picks" writes `mode=picks` and survives every later filter click.
 */
export const MODES = ["picks", "hotels", "cruises"] as const;
export type ResultsMode = (typeof MODES)[number];

/**
 * Star class, as Google classifies a property. Distinct from the guest rating, which is the
 * 4.8 on the card — the rail filters on the classification.
 */
export const STAR_CLASSES = ["3", "4", "5"] as const;
export type StarClass = (typeof STAR_CLASSES)[number];

/**
 * Amenity ids are Google's, not ours (Data-Model §24.0 rule 4: a provider's vocabulary is
 * text, and it grows without notice). The five below are the ones Screen Inventory 2.3.3's
 * rail asks for and the prototype draws.
 */
export const HOTEL_AMENITIES = [
  { id: "11", label: "Beach access" },
  { id: "6", label: "Pool" },
  { id: "10", label: "Spa" },
  { id: "52", label: "All-inclusive" },
  { id: "12", label: "Family-friendly" },
] as const;
export type AmenityId = (typeof HOTEL_AMENITIES)[number]["id"];
export const AMENITY_IDS: readonly AmenityId[] = HOTEL_AMENITIES.map((a) => a.id);

/**
 * Nightly rate bands, in cents.
 *
 * A SEPARATE axis from `budget`, which is a per-person TRIP total. Reusing that param would
 * make one key mean two different things depending on the mode, and a mode switch would
 * silently reinterpret the visitor's filter.
 */
export const RATE_BANDS = [
  { id: "under-150", label: "Under $150 / night", min: null, max: 150 },
  { id: "150-300", label: "$150 – $300", min: 150, max: 300 },
  { id: "300-plus", label: "$300+", min: 300, max: null },
] as const;
export type RateBand = (typeof RATE_BANDS)[number]["id"];
export const RATE_BAND_IDS = RATE_BANDS.map((b) => b.id);

/**
 * Sort keys offered in hotels mode, and their SerpApi ids.
 *
 * The provider has no "best fit" and no price-descending. Best fit maps to omitting
 * `sort_by` entirely, which is Google's own relevance — the honest equivalent. A URL
 * carrying `price-desc` from picks mode degrades to relevance rather than silently sorting
 * by something else, and keeps its value so switching back restores it.
 */
export const HOTEL_SORT_KEYS: readonly SortKey[] = ["best-fit", "price-asc", "rating"];

export function serpSortBy(sort: SortKey): string {
  if (sort === "price-asc") return "3";
  if (sort === "rating") return "8";
  return "";
}

export function sortKeysFor(mode: ResultsMode): readonly SortKey[] {
  // Cruises come back in departure order from our own catalog and there is no fare on the
  // public surface to sort by (Free-Travel-APIs §4.7), so the menu would offer three keys
  // that all do nothing. It is hidden instead.
  if (mode === "cruises") return [];
  return mode === "hotels" ? HOTEL_SORT_KEYS : SORT_KEYS;
}

export const SORT_LABELS: Record<SortKey, string> = {
  "best-fit": "Best fit",
  "price-asc": "Price · low to high",
  "price-desc": "Price · high to low",
  rating: "Rating",
};

export const TRIP_TYPE_LABELS: Record<TripType, string> = {
  "all-inclusive": "All-inclusive",
  cruise: "Cruise",
  hotel: "Hotel",
  tour: "Tour",
};

export const VIBE_LABELS: Record<Vibe, string> = {
  "adults-only": "Adults-only",
  family: "Family",
  honeymoon: "Honeymoon",
  "five-star": "5★",
  couples: "Couples",
  group: "Group",
  boutique: "Boutique",
  adventure: "Adventure",
};

export interface SearchQuery {
  /** Free-text destination ("Caribbean", "Nassau"). Trimmed, ≤ 60 chars. */
  dest?: string;
  topic?: Topic;
  types: TripType[];
  vibes: Vibe[];
  budgets: BudgetBand[];
  sort: SortKey;
  /**
   * Check-in / check-out as `YYYY-MM-DD`. Always both or neither — a half-range cannot be
   * sent to a hotel API and reads as "flexible dates" everywhere it is displayed.
   */
  checkIn?: string;
  checkOut?: string;
  /**
   * The pre-dates free-text value (`?when=Aug 12 – 19`). Kept so links shared before the
   * picker shipped still render their dates in the header pill. DISPLAY ONLY — it is never
   * parsed and never reaches a provider. New links write `in`/`out` instead.
   */
  when?: string;
  /** 1–20. */
  travelers?: number;
  /** Undefined when derivable — see `effectiveMode`. */
  mode?: ResultsMode;
  stars: StarClass[];
  amenities: string[];
  rates: RateBand[];
}

/**
 * Which catalog to render. Dates imply hotels; an explicit mode always wins.
 *
 * Kept separate from `parseSearchParams` so the parsed query stays a faithful reading of
 * the URL and the derivation lives in one place both the page and the links can call.
 */
export function effectiveMode(q: SearchQuery): ResultsMode {
  // `cruises` is never derived — a sailing is chosen by where and roughly when, not by the
  // exact check-in/check-out a hotel needs, so there is no signal in the query that means
  // "they wanted cruises". It is only ever an explicit choice.
  return q.mode ?? (q.checkIn && q.checkOut ? "hotels" : "picks");
}

/**
 * Bounds on a stay, so a hostile or fat-fingered URL cannot become an expensive upstream
 * query. A hotel search is metered per request (see supabase/functions/_shared/hotels), and
 * `check_out_date` a decade out returns nothing while still costing one.
 */
export const MAX_STAY_NIGHTS = 30;
/**
 * ~16 months. MUST NOT EXCEED `MAX_DAYS_AHEAD` in supabase/functions/hotel-search/index.ts,
 * which is the same number: this was 550 against the function's 500, so a stay in that
 * 50-day gap passed validation here, was rejected there, and the visitor got "that search
 * didn't come back" for a date the UI had accepted. The stricter of two bounds has to be the
 * one the visitor is told about, and the provider-facing one is the real limit.
 */
export const MAX_BOOKING_DAYS_AHEAD = 500;

/**
 * The zone "today" means on a public page, where there is no signed-in visitor to read a
 * `platform_user.time_zone` from. Story-Tail operates from Orlando, so the business day is
 * the honest default — and it is one fixed zone rather than the server's, which on Vercel is
 * UTC and would make a late-evening search in the US reject a stay starting today.
 */
export const SEARCH_TIME_ZONE = "America/New_York";

export type RawSearchParams = Record<string, string | string[] | undefined>;

const MAX_TEXT = 60;
const MAX_MULTI = 8;

function asList(value: string | string[] | undefined): string[] {
  if (value === undefined) return [];
  const list = Array.isArray(value) ? value : value.split(",");
  return list.map((v) => v.trim()).filter(Boolean).slice(0, MAX_MULTI);
}

function pickAllowed<T extends string>(values: string[], allowed: readonly T[]): T[] {
  const out: T[] = [];
  for (const v of values) {
    if ((allowed as readonly string[]).includes(v) && !out.includes(v as T)) out.push(v as T);
  }
  return out;
}

function cleanText(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== "string") return undefined;
  // Strip control characters and collapse whitespace; keep it short.
  const cleaned = raw.replace(/[\p{Cc}]/gu, "").replace(/\s+/g, " ").trim().slice(0, MAX_TEXT);
  return cleaned.length ? cleaned : undefined;
}

export function parseSearchParams(
  sp: RawSearchParams | URLSearchParams | undefined,
  /**
   * The visitor's today, as `YYYY-MM-DD`. Defaults to the SERVER's day, which is a fallback
   * and not a correct answer — a page rendered at 23:00 in Orlando is already tomorrow in
   * UTC, and a range starting "today" would be silently dropped as past. Callers that know
   * the reader's zone should pass it.
   */
  today: string = todayIso(SEARCH_TIME_ZONE),
): SearchQuery {
  const get = (key: string): string | string[] | undefined => {
    if (!sp) return undefined;
    if (sp instanceof URLSearchParams) {
      const all = sp.getAll(key);
      return all.length === 0 ? undefined : all.length === 1 ? all[0] : all;
    }
    return sp[key];
  };

  const topicRaw = cleanText(get("topic"));
  const sortRaw = cleanText(get("sort"));
  const travelersRaw = cleanText(get("travelers"));
  const modeRaw = cleanText(get("mode"));
  const travelersNum = travelersRaw ? Number.parseInt(travelersRaw, 10) : NaN;

  const stay = parseStay(cleanText(get("in")), cleanText(get("out")), today);

  return {
    dest: cleanText(get("dest")),
    topic: topicRaw && (TOPICS as readonly string[]).includes(topicRaw) ? (topicRaw as Topic) : undefined,
    types: pickAllowed(asList(get("type")), TRIP_TYPES),
    vibes: pickAllowed(asList(get("vibe")), VIBES),
    budgets: pickAllowed(asList(get("budget")), BUDGET_BANDS),
    sort: sortRaw && (SORT_KEYS as readonly string[]).includes(sortRaw) ? (sortRaw as SortKey) : "best-fit",
    checkIn: stay?.checkIn,
    checkOut: stay?.checkOut,
    when: cleanText(get("when")),
    travelers: Number.isFinite(travelersNum) ? Math.min(20, Math.max(1, travelersNum)) : undefined,
    mode: modeRaw && (MODES as readonly string[]).includes(modeRaw) ? (modeRaw as ResultsMode) : undefined,
    stars: pickAllowed(asList(get("star")), STAR_CLASSES),
    amenities: pickAllowed(asList(get("amenity")), AMENITY_IDS),
    rates: pickAllowed(asList(get("rate")), RATE_BAND_IDS),
  };
}

/**
 * Validate a check-in/check-out pair, or return null.
 *
 * Total, like everything else here: hostile input is dropped, never thrown on. Both dates go
 * or neither stays — a lone check-in would render as a range with a missing half and cannot
 * be sent upstream. The rules, in the order they are cheapest to check:
 *
 *   * both present, and both real calendar dates (so `2026-02-30` is rejected, which a shape
 *     regex alone would wave through)
 *   * check-out strictly after check-in — a zero-night stay is not a stay
 *   * not in the past, against the CALLER'S day rather than the server's
 *   * at most MAX_STAY_NIGHTS long and MAX_BOOKING_DAYS_AHEAD out
 */
export function parseStay(
  rawIn: string | undefined,
  rawOut: string | undefined,
  today: string,
): { checkIn: string; checkOut: string } | null {
  if (!isValidIsoDate(rawIn) || !isValidIsoDate(rawOut)) return null;

  const nights = nightsBetween(rawIn, rawOut);
  if (nights === null || nights < 1 || nights > MAX_STAY_NIGHTS) return null;

  if (rawIn < today) return null;

  const horizon = addDays(today, MAX_BOOKING_DAYS_AHEAD);
  if (horizon && rawIn > horizon) return null;

  return { checkIn: rawIn, checkOut: rawOut };
}

/** Canonical query string (stable key order) for links and tests. */
export function resultsHref(query: Partial<SearchQuery>): string {
  const params = new URLSearchParams();
  if (query.dest) params.set("dest", query.dest);
  if (query.topic) params.set("topic", query.topic);
  for (const t of query.types ?? []) params.append("type", t);
  for (const v of query.vibes ?? []) params.append("vibe", v);
  for (const b of query.budgets ?? []) params.append("budget", b);
  if (query.checkIn && query.checkOut) {
    params.set("in", query.checkIn);
    params.set("out", query.checkOut);
  } else if (query.when) {
    // Only carried when there is no real range to carry instead, so a link that has been
    // through the picker never keeps the stale free-text label alongside it.
    params.set("when", query.when);
  }
  if (query.travelers) params.set("travelers", String(query.travelers));
  for (const s of query.stars ?? []) params.append("star", s);
  for (const a of query.amenities ?? []) params.append("amenity", a);
  for (const r of query.rates ?? []) params.append("rate", r);
  // Only when explicit: a dated search derives `hotels` without polluting the URL, the same
  // way "best-fit" is omitted below.
  if (query.mode) params.set("mode", query.mode);
  if (query.sort && query.sort !== "best-fit") params.set("sort", query.sort);
  const qs = params.toString();
  return qs ? `/explore/results?${qs}` : "/explore/results";
}

function normalize(text: string): string {
  // Strip combining marks so "Curaçao" matches "curacao".
  return text.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Destination text matches place, region, island slug or trip name. */
function matchesDest(trip: Trip, dest: string): boolean {
  const needle = normalize(dest);
  if (!needle) return true;
  // "Caribbean" is the whole catalog's home region; treat it as a match for
  // every trip whose region is Caribbean-adjacent, plus explicit region hits.
  const haystack = [
    trip.destination.place,
    trip.destination.region,
    trip.destination.island ?? "",
    trip.name,
    trip.tagline,
  ]
    .map(normalize)
    .join(" | ");
  return needle.split(" ").every((word) => haystack.includes(word));
}

export function filterTrips(trips: readonly Trip[], q: SearchQuery): Trip[] {
  return trips.filter((trip) => {
    if (q.topic && !trip.topics[q.topic]) return false;
    if (q.types.length && !q.types.includes(trip.type)) return false;
    if (q.vibes.length && !q.vibes.some((v) => trip.vibes.includes(v))) return false;
    if (q.budgets.length && !q.budgets.includes(bandFromCents(trip.from.amountCents))) return false;
    if (q.dest && !matchesDest(trip, q.dest)) return false;
    return true;
  });
}

const BADGE_WEIGHT: Record<string, number> = {
  "Gyasi's pick": 0,
  "Great for groups": 1,
  "Off-the-beaten": 1,
};

function bestFitRank(trip: Trip): number {
  const badge = trip.badge ? (BADGE_WEIGHT[trip.badge] ?? 2) : 3;
  const placements = Object.values(trip.topics).map((p) => p?.order ?? 99);
  const best = placements.length ? Math.min(...placements) : 99;
  return badge * 100 + best;
}

export type RatingLookup = (slug: string) => number | undefined;

export function sortTrips(trips: readonly Trip[], sort: SortKey, rating?: RatingLookup): Trip[] {
  const bySlug = (a: Trip, b: Trip) => a.slug.localeCompare(b.slug);
  const copy = [...trips];
  switch (sort) {
    case "price-asc":
      return copy.sort((a, b) => a.from.amountCents - b.from.amountCents || bySlug(a, b));
    case "price-desc":
      return copy.sort((a, b) => b.from.amountCents - a.from.amountCents || bySlug(a, b));
    case "rating":
      return copy.sort((a, b) => (rating?.(b.slug) ?? 0) - (rating?.(a.slug) ?? 0) || bySlug(a, b));
    case "best-fit":
    default:
      return copy.sort((a, b) => bestFitRank(a) - bestFitRank(b) || bySlug(a, b));
  }
}

export function searchTrips(trips: readonly Trip[], q: SearchQuery, rating?: RatingLookup): Trip[] {
  return sortTrips(filterTrips(trips, q), q.sort, rating);
}

/** Trips featured on a topic page, in the designer's order. */
export function tripsForTopic(trips: readonly Trip[], topic: Topic): Trip[] {
  return trips
    .filter((t) => t.topics[topic])
    .sort((a, b) => (a.topics[topic]?.order ?? 99) - (b.topics[topic]?.order ?? 99));
}

export function countByTopic(trips: readonly Trip[], topic: Topic): number {
  return trips.filter((t) => t.topics[topic]).length;
}

/** Heading text for the results page: "148 trips · Caribbean". */
export function describeQuery(q: SearchQuery): string {
  if (q.dest) return q.dest;
  if (q.topic) return q.topic === "cruises" ? "Cruises" : q.topic === "honeymoons" ? "Honeymoons" : "Caribbean";
  if (q.types.length === 1) return TRIP_TYPE_LABELS[q.types[0]];
  if (q.vibes.length === 1) return VIBE_LABELS[q.vibes[0]];
  return "Everywhere Gyasi plans";
}

/**
 * How the Dates cell reads: the picked range, else the pre-picker free text, else nothing.
 * The caller supplies the fallback ("Flexible dates") so this stays free of copy.
 */
export function stayLabel(q: SearchQuery, timeZone: string = SEARCH_TIME_ZONE): string | undefined {
  if (q.checkIn && q.checkOut) return formatRange(q.checkIn, q.checkOut, timeZone);
  return q.when;
}

/** Nights in the picked stay, when there is one. Drives "3 nights" in the results heading. */
export function stayNights(q: SearchQuery): number | undefined {
  if (!q.checkIn || !q.checkOut) return undefined;
  return nightsBetween(q.checkIn, q.checkOut) ?? undefined;
}

/** True when the visitor has narrowed the search at all. */
export function hasActiveFilters(q: SearchQuery): boolean {
  return Boolean(q.dest || q.topic || q.types.length || q.vibes.length || q.budgets.length);
}
