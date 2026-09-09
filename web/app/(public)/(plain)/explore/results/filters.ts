import type { InquiryField } from "@/components/public/InquiryBar";
import type { TripType, Vibe } from "@/content/public/types";
import {
  effectiveMode,
  HOTEL_AMENITIES,
  RATE_BANDS,
  resultsHref,
  STAR_CLASSES,
  stayLabel,
  TRIP_TYPE_LABELS,
  VIBE_LABELS,
  type AmenityId,
  type ResultsMode,
  type RateBand,
  type SearchQuery,
  type StarClass,
} from "@/lib/public/search";
import { RESULTS } from "./content";

/**
 * Pure view-model helpers for 2.0.4. The URL is the only filter state, so every chip is a
 * link to "the same search with one value toggled", and the header pill is derived from the
 * parsed query. Nothing here touches React.
 */

export type ChipParam =
  | { kind: "type"; value: TripType }
  | { kind: "vibe"; value: Vibe }
  | { kind: "star"; value: StarClass }
  | { kind: "amenity"; value: AmenityId }
  | { kind: "rate"; value: RateBand };

export interface FilterChip {
  id: string;
  label: string;
  param: ChipParam;
}

/** Mobile / tablet quick-filter strip (M204), in artboard order. Budget lives in the sheet. */
export const MOBILE_CHIPS: readonly FilterChip[] = [
  { id: "all-inclusive", label: TRIP_TYPE_LABELS["all-inclusive"], param: { kind: "type", value: "all-inclusive" } },
  { id: "cruise", label: TRIP_TYPE_LABELS.cruise, param: { kind: "type", value: "cruise" } },
  { id: "hotel", label: TRIP_TYPE_LABELS.hotel, param: { kind: "type", value: "hotel" } },
  { id: "adults-only", label: VIBE_LABELS["adults-only"], param: { kind: "vibe", value: "adults-only" } },
  { id: "family", label: VIBE_LABELS.family, param: { kind: "vibe", value: "family" } },
];

/** The same three axes FilterRail gives Hotels mode, as chips (Screen Inventory 2.3.3). */
const HOTEL_CHIPS: readonly FilterChip[] = [
  ...STAR_CLASSES.map((s) => ({
    id: `star-${s}`,
    label: RESULTS.hotels.starClassLabel(Number(s)),
    param: { kind: "star", value: s } as const,
  })),
  ...HOTEL_AMENITIES.map((a) => ({
    id: `amenity-${a.id}`,
    label: a.label,
    param: { kind: "amenity", value: a.id } as const,
  })),
  ...RATE_BANDS.map((b) => ({
    id: `rate-${b.id}`,
    label: b.label,
    param: { kind: "rate", value: b.id } as const,
  })),
];

/**
 * The quick-filter strip for a mode.
 *
 * This exists because the strip used to be `MOBILE_CHIPS` unconditionally, which put
 * "All-inclusive / Cruise / Hotel / Adults-only / Family" above a list of Google hotels —
 * five curated-catalog filters that a hotel search does not read, so tapping one changed the
 * URL and not the results. FilterRail has always swapped by mode; only this strip did not,
 * and since it is `web:hidden` the gap was invisible at desktop widths.
 *
 * Cruises returns nothing on purpose: the public cruise catalog is departure-ordered and has
 * no filter vocabulary yet, which is the same reason FilterRail renders only hidden echoes
 * for that mode.
 */
export function chipsFor(mode: ResultsMode): readonly FilterChip[] {
  if (mode === "hotels") return HOTEL_CHIPS;
  if (mode === "cruises") return [];
  return MOBILE_CHIPS;
}

export function chipIsOn(q: SearchQuery, chip: FilterChip): boolean {
  switch (chip.param.kind) {
    case "type":
      return q.types.includes(chip.param.value);
    case "vibe":
      return q.vibes.includes(chip.param.value);
    case "star":
      return q.stars.includes(chip.param.value);
    case "amenity":
      return q.amenities.includes(chip.param.value);
    case "rate":
      return q.rates.includes(chip.param.value);
  }
}

function toggle<T>(list: readonly T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

/** The same search with ONE value switched on/off; every other param is preserved. */
export function toggleChip(q: SearchQuery, chip: FilterChip): SearchQuery {
  switch (chip.param.kind) {
    case "type":
      return { ...q, types: toggle(q.types, chip.param.value) };
    case "vibe":
      return { ...q, vibes: toggle(q.vibes, chip.param.value) };
    case "star":
      return { ...q, stars: toggle(q.stars, chip.param.value) };
    case "amenity":
      return { ...q, amenities: toggle(q.amenities, chip.param.value) };
    case "rate":
      return { ...q, rates: toggle(q.rates, chip.param.value) };
  }
}

export function chipHref(q: SearchQuery, chip: FilterChip): string {
  return resultsHref(toggleChip(q, chip));
}

/**
 * How many filter values are switched on (shown on the "Filters" chip).
 *
 * Counts the axes the CURRENT mode actually filters by. Counting all of them would show a
 * count for curated filters that a hotel search ignores, which reads as "3 filters applied"
 * over results that no filter touched.
 */
export function activeFilterCount(q: SearchQuery): number {
  const mode = effectiveMode(q);
  if (mode === "hotels") return q.stars.length + q.amenities.length + q.rates.length;
  if (mode === "cruises") return 0;
  return q.types.length + q.vibes.length + q.budgets.length;
}

/** Header pill cells derived from the query (C204: destination / dates / travelers / type). */
export function inquiryFields(q: SearchQuery): InquiryField[] {
  const single = q.types.length === 1 ? q.types[0] : undefined;
  return [
    { label: RESULTS.pill.destination, value: q.dest ?? RESULTS.pill.anywhere, icon: "map" },
    { label: RESULTS.pill.dates, value: stayLabel(q) ?? RESULTS.pill.flexibleDates, icon: "calendar" },
    {
      label: RESULTS.pill.travelers,
      value: q.travelers ? RESULTS.pill.travelersCount(q.travelers) : RESULTS.pill.anyGroup,
      icon: "user",
    },
    { label: RESULTS.pill.tripType, value: single ? TRIP_TYPE_LABELS[single] : RESULTS.pill.anyType, icon: "palm" },
  ];
}

/** One-line mobile summary ("Caribbean · Aug 12 – 19 · 2 travelers"). */
export function inquirySummary(q: SearchQuery): string {
  return inquiryFields(q)
    .slice(0, 3)
    .map((f) => f.value)
    .join(" · ");
}
