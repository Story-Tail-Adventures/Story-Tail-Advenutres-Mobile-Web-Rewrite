// Screen 2.0.9 Cruises — copy module for /cruises. Every user-facing string on the page that
// is not already in web/content/public/* lives here. Desktop prototype copy wins
// (design/source-prototype/screens/client-public-topics.jsx C209_Cruises); business claims
// come from the registry (web/content/public/proof.ts) and counts are derived from the
// catalog by the page, never typed here. P2 (built ahead of phase, September 2026).
import type { InquiryField } from "@/components/public/InquiryBar";
import { claim } from "@/content/public/proof";
import type { ImageKey } from "@/lib/images";

export interface MediaCardCopy {
  image: ImageKey;
  tag: string;
  title: string;
  body: string;
}

export interface SectionCopy {
  overline: string;
  title: string;
  sub?: string;
}

export interface ClosingCopy {
  image: ImageKey;
  title: string;
  body: string;
  primary: string;
  secondary: string;
}

export const CRUISES_PATH = "/cruises";
export const CRUISES_HERO_IMAGE: ImageKey = "cruiseAerial";

/** Shared CTA label — inquiry bar, sticky bar and closing band all say the same thing. */
export const REQUEST_QUOTE = "Request a quote";

const HERO_SUB =
  "Unpack once. See three islands. The ship handles dinner, the towel art, the kids' club — you handle being on a balcony at sunrise.";

export const CRUISES_META = {
  title: "Cruises",
  description: HERO_SUB,
};

export const CRUISES_HERO = {
  overline: "CRUISING",
  title: "A floating Sabbath,",
  script: "every morning new.",
  sub: HERO_SUB,
};

/**
 * The inquire bar's CTA.
 *
 * Deliberately NOT "Request a quote", which is what it used to be — that went to the sign-up
 * gate and returned here, so a bar summarising a search led nowhere near a result. It now
 * opens the live sailing list, which is a genuinely different destination from the
 * "See all N sailings" link below it: that one is Gyasi's nine hand-picked sailings, this is
 * what the lines are actually running. The labels have to say which is which.
 */
export const CRUISES_INQUIRY_CTA = "See what's sailing";

export const CRUISES_INQUIRY_FIELDS: readonly InquiryField[] = [
  { label: "Destination", value: "Caribbean cruise", icon: "map" },
  { label: "When", value: "Flexible · 7 nights", icon: "calendar" },
  { label: "Travelers", value: "2 adults", icon: "user" },
  { label: "Vibe", value: "Family · Adults · Group", icon: "palm" },
];

export const CRUISES_TYPES_SECTION: SectionCopy = {
  overline: "WHO IT'S FOR",
  title: "Three kinds of cruise, one advisor.",
  sub: claim("sailsEachLineYearly"),
};

export const CRUISES_TYPES: readonly MediaCardCopy[] = [
  {
    image: "cruiseShip",
    tag: "FAMILY",
    title: "Family cruises",
    body: "Multi-gen sailings with waterparks, character meet-ups, and rooms that connect.",
  },
  {
    image: "cruiseAerial",
    tag: "ADULTS",
    title: "Adults-only",
    body: "Virgin, Viking, premium Celebrity — quieter ships, real dining, no kids underfoot.",
  },
  {
    image: "overwater",
    tag: "GROUP",
    title: "Group cruises",
    body: "8+ travelers — birthday, anniversary, ministry, friends week. Group rates + a coordinator.",
  },
];

/**
 * "Eight lines" is spelled out in the designed headline; the chip row renders
 * web/content/public/cruise-lines.ts, and content.test.ts pins that list to eight so the
 * two cannot drift apart silently.
 */
export const CRUISES_LINES_SECTION: SectionCopy = {
  overline: "LINES WE BOOK",
  title: "Eight lines, picked for the trip — not the loyalty points.",
};

/** "HAND-PICKED · 9 SAILINGS" — the count is the number of tiles actually rendered. */
export function cruisesTripsOverline(count: number): string {
  return `HAND-PICKED · ${count} ${count === 1 ? "SAILING" : "SAILINGS"}`;
}

export const CRUISES_TRIPS = {
  title: "Sailings worth booking this season",
};

/** "See all 9 sailings →" — the count is countByTopic, not a typed figure. */
export function cruisesSeeAllLabel(count: number): string {
  return `See all ${count} ${count === 1 ? "sailing" : "sailings"} →`;
}

export const CRUISES_CLOSING: ClosingCopy = {
  image: "cruiseShip",
  title: "Tell me how many people, when, and roughly your budget.",
  body: "I'll come back with three sailings, on three lines, with honest notes on what each ship is actually good at.",
  primary: REQUEST_QUOTE,
  secondary: "Message Gyasi first",
};

export const CRUISES_STICKY = {
  primary: REQUEST_QUOTE,
  secondary: "All sailings",
};
