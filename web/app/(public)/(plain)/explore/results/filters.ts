import type { InquiryField } from "@/components/public/InquiryBar";
import type { TripType, Vibe } from "@/content/public/types";
import { resultsHref, TRIP_TYPE_LABELS, VIBE_LABELS, type SearchQuery } from "@/lib/public/search";
import { RESULTS } from "./content";

/**
 * Pure view-model helpers for 2.0.4. The URL is the only filter state, so every chip is a
 * link to "the same search with one value toggled", and the header pill is derived from the
 * parsed query. Nothing here touches React.
 */

export type ChipParam = { kind: "type"; value: TripType } | { kind: "vibe"; value: Vibe };

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

export function chipIsOn(q: SearchQuery, chip: FilterChip): boolean {
  return chip.param.kind === "type" ? q.types.includes(chip.param.value) : q.vibes.includes(chip.param.value);
}

function toggle<T>(list: readonly T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

/** The same search with ONE type or vibe switched on/off; every other param is preserved. */
export function toggleChip(q: SearchQuery, chip: FilterChip): SearchQuery {
  if (chip.param.kind === "type") return { ...q, types: toggle(q.types, chip.param.value) };
  return { ...q, vibes: toggle(q.vibes, chip.param.value) };
}

export function chipHref(q: SearchQuery, chip: FilterChip): string {
  return resultsHref(toggleChip(q, chip));
}

/** How many filter values are switched on (shown on the "Filters" chip). */
export function activeFilterCount(q: SearchQuery): number {
  return q.types.length + q.vibes.length + q.budgets.length;
}

/** Header pill cells derived from the query (C204: destination / dates / travelers / type). */
export function inquiryFields(q: SearchQuery): InquiryField[] {
  const single = q.types.length === 1 ? q.types[0] : undefined;
  return [
    { label: RESULTS.pill.destination, value: q.dest ?? RESULTS.pill.anywhere, icon: "map" },
    { label: RESULTS.pill.dates, value: q.when ?? RESULTS.pill.flexibleDates, icon: "calendar" },
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
