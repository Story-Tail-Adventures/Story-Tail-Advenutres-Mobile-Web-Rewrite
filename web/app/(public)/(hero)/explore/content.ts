// Screen 2.0.3 Public Search Landing — copy module. Desktop copy (C203) is the source; the
// mobile artboard (M203) only shortens labels the layout truncates anyway. P2.
import type { IconName } from "@/components/ui/Icon";
import type { InspirationTile } from "@/content/public/types";
import type { SearchQuery } from "@/lib/public/search";

export interface SearchField {
  /** Must match the keys `parseSearchParams` reads. */
  name: "dest" | "when" | "travelers";
  label: string;
  placeholder: string;
  icon: IconName;
  type: "text" | "number";
}

/** The three cells of the search pill, in prototype order. */
export const SEARCH_FIELDS: readonly SearchField[] = [
  { name: "dest", label: "Destination", placeholder: "Caribbean", icon: "map", type: "text" },
  { name: "when", label: "Dates", placeholder: "Aug 12 – 19", icon: "calendar", type: "text" },
  { name: "travelers", label: "Travelers", placeholder: "2 adults", icon: "user", type: "number" },
];

export const EXPLORE = {
  meta: {
    title: "Explore",
    description:
      "Find your next chapter. Browse Caribbean escapes, family cruises, honeymoons and all-inclusive weeks — no account needed.",
  },
  hero: {
    overline: "BROWSE WITHOUT AN ACCOUNT",
    title: "Find your next chapter.",
  },
  search: {
    formLabel: "Search trips",
    submit: "Search",
  },
  inspiration: {
    title: "Inspiration · curated",
    sub: "Six trip types we live and breathe. Tap any to start a search.",
  },
  trust: {
    title: "Trusted",
  },
  sticky: {
    primary: "Search",
    secondary: "Sign in",
  },
} as const;

/** Tile sub-line ("12 trips"). Counts are derived from the catalog, never typed. */
export function tripCountLabel(n: number): string {
  return `${n} ${n === 1 ? "trip" : "trips"}`;
}

/** The full SearchQuery an inspiration tile pre-fills (arrays built properly, no casts). */
export function tileSearchQuery(tile: InspirationTile): SearchQuery {
  return {
    dest: tile.query.dest,
    topic: tile.query.topic,
    types: tile.query.type ? [tile.query.type] : [],
    vibes: tile.query.vibe ? [tile.query.vibe] : [],
    budgets: [],
    sort: "best-fit",
  };
}
