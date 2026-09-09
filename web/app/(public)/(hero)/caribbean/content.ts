// Screen 2.0.8 Caribbean — copy module for /caribbean. Every user-facing string on the page
// that is not already in web/content/public/* lives here. Desktop prototype copy wins
// (design/source-prototype/screens/client-public-topics.jsx C208_Caribbean); business
// claims come from the registry (web/content/public/proof.ts) and counts are derived from
// the catalog by the page, never typed here. P2 (built ahead of phase, September 2026).
import type { InquiryField } from "@/components/public/InquiryBar";
import type { IconName } from "@/components/ui/Icon";
import { claim } from "@/content/public/proof";
import type { ImageKey } from "@/lib/images";

export interface IntroPoint {
  icon: IconName;
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

export const CARIBBEAN_PATH = "/caribbean";
export const CARIBBEAN_HERO_IMAGE: ImageKey = "turks";

/** Shared CTA label — inquiry bar, sticky bar and closing band all say the same thing. */
export const REQUEST_QUOTE = "Request a quote";

const HERO_SUB = `${claim("islandsPlannedAll")} The hard part isn't finding a good week — it's choosing which good one.`;

export const CARIBBEAN_META = {
  title: "Caribbean vacations",
  description: HERO_SUB,
};

export const CARIBBEAN_HERO = {
  overline: "CARIBBEAN VACATIONS",
  title: "A region built for",
  script: "rest.",
  sub: HERO_SUB,
};

export const CARIBBEAN_INQUIRY_FIELDS: readonly InquiryField[] = [
  { label: "Destination", value: "Anywhere Caribbean", icon: "map" },
  { label: "When", value: "Flexible · 7 nights", icon: "calendar" },
  { label: "Travelers", value: "2 adults", icon: "user" },
  { label: "Vibe", value: "Beach + rest", icon: "palm" },
];

export const CARIBBEAN_INTRO: readonly IntroPoint[] = [
  {
    icon: "palm",
    title: "You won't have to think.",
    body: "Transfers, dining reservations, the spa slot you didn't know you needed — handled before you leave Miami.",
  },
  {
    icon: "shield",
    title: "Real prices, honest takes.",
    body: "I tell you which resorts are tired and which ones are quietly the best. No commission steers my picks.",
  },
  {
    icon: "heart",
    title: "A week worth returning to.",
    body: "The point isn't the trip — it's the rest you bring home from it. We plan with that in mind.",
  },
];

export const CARIBBEAN_ISLANDS: SectionCopy = {
  overline: "ISLANDS",
  title: "Where to land",
  sub: "Tap an island to start a search, or let Gyasi suggest one based on your week.",
};

/** "HAND-PICKED · 9 TRIPS" — the count is the number of tiles actually rendered. */
export function caribbeanTripsOverline(count: number): string {
  return `HAND-PICKED · ${count} ${count === 1 ? "TRIP" : "TRIPS"}`;
}

export const CARIBBEAN_TRIPS = {
  title: "Caribbean weeks Gyasi loves right now",
  sub: `${claim("catalogUpdatedMonthly")} The $ chip is a rough range — request a quote to see real prices for your dates.`,
};

/** "See all 9 Caribbean trips →" — the count is countByTopic, not a typed figure. */
export function caribbeanSeeAllLabel(count: number): string {
  return `See all ${count} Caribbean ${count === 1 ? "trip" : "trips"} →`;
}

export const CARIBBEAN_CLOSING: ClosingCopy = {
  image: "overwater",
  title: "Tell me your week. I'll come back with three good options.",
  body: "No account needed to message. No planning fees, ever. Just a real conversation about what you actually need.",
  primary: REQUEST_QUOTE,
  secondary: "Message Gyasi first",
};

export const CARIBBEAN_STICKY = {
  primary: REQUEST_QUOTE,
  secondary: "Browse all",
};
