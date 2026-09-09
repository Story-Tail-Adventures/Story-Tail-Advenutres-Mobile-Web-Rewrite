// Screen 2.0.3 Public Search Landing — copy module. Desktop copy (C203) is the source; the
// mobile artboard (M203) only shortens labels the layout truncates anyway. P2.
import type { IconName } from "@/components/ui/Icon";
import type { InspirationTile } from "@/content/public/types";
import type { SearchQuery } from "@/lib/public/search";

export interface SearchField {
  /**
   * `dates` is not an input name — it is the slot the DateRangePicker occupies, and the
   * picker writes `in` and `out`. The other two are the query keys `parseSearchParams` reads.
   */
  name: "dest" | "dates" | "travelers";
  label: string;
  placeholder: string;
  icon: IconName;
  type: "text" | "number" | "dates";
}

/** The three cells of the search pill, in prototype order. */
export const SEARCH_FIELDS: readonly SearchField[] = [
  { name: "dest", label: "Destination", placeholder: "Caribbean", icon: "map", type: "text" },
  // NOT "Aug 12 – 19", which is what the C203 artboard shows — but the artboard is drawing
  // the FILLED state, and the empty one was never in it. The other two cells are text inputs
  // where a plausible value reads as a placeholder, because you can type over it. This cell
  // is a BUTTON: its label is its value, so a specific date range reads as a chosen one, and
  // people searched believing they had picked dates when they had not.
  { name: "dates", label: "Dates", placeholder: "Add dates", icon: "calendar", type: "dates" },
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
  /**
   * Date picker copy. Voice check (Design-System §2.6): plain, unhurried, no urgency —
   * "When would you like to arrive?" rather than "Select your check-in date now".
   */
  dates: {
    open: "Choose your dates",
    close: "Close the calendar",
    prevMonth: "Previous month",
    nextMonth: "Next month",
    clear: "Clear",
    done: "Done",
    pickCheckIn: "When would you like to arrive?",
    pickCheckOut: "And when would you head home?",
    keyboardHint: "Arrow keys move by day. Enter chooses a date. Escape closes the calendar.",
    checkInLabel: "Check-in",
    checkOutLabel: "Check-out",
    night: "night",
    nights: "nights",
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
    // An inspiration tile is a curated-catalog search: no dates, so no hotels mode.
    stars: [],
    amenities: [],
    rates: [],
  };
}
