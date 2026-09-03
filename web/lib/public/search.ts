import type {
  BudgetBand,
  Topic,
  Trip,
  TripType,
  Vibe,
} from "@/content/public/types";
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
  /** Free-text dates as typed ("Aug 12 – 19"); display only. */
  when?: string;
  /** 1–20. */
  travelers?: number;
}

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

export function parseSearchParams(sp: RawSearchParams | URLSearchParams | undefined): SearchQuery {
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
  const travelersNum = travelersRaw ? Number.parseInt(travelersRaw, 10) : NaN;

  return {
    dest: cleanText(get("dest")),
    topic: topicRaw && (TOPICS as readonly string[]).includes(topicRaw) ? (topicRaw as Topic) : undefined,
    types: pickAllowed(asList(get("type")), TRIP_TYPES),
    vibes: pickAllowed(asList(get("vibe")), VIBES),
    budgets: pickAllowed(asList(get("budget")), BUDGET_BANDS),
    sort: sortRaw && (SORT_KEYS as readonly string[]).includes(sortRaw) ? (sortRaw as SortKey) : "best-fit",
    when: cleanText(get("when")),
    travelers: Number.isFinite(travelersNum) ? Math.min(20, Math.max(1, travelersNum)) : undefined,
  };
}

/** Canonical query string (stable key order) for links and tests. */
export function resultsHref(query: Partial<SearchQuery>): string {
  const params = new URLSearchParams();
  if (query.dest) params.set("dest", query.dest);
  if (query.topic) params.set("topic", query.topic);
  for (const t of query.types ?? []) params.append("type", t);
  for (const v of query.vibes ?? []) params.append("vibe", v);
  for (const b of query.budgets ?? []) params.append("budget", b);
  if (query.when) params.set("when", query.when);
  if (query.travelers) params.set("travelers", String(query.travelers));
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

/** True when the visitor has narrowed the search at all. */
export function hasActiveFilters(q: SearchQuery): boolean {
  return Boolean(q.dest || q.topic || q.types.length || q.vibes.length || q.budgets.length);
}
