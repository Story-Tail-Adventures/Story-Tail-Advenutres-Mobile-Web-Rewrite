// Screen 2.0.10 Honeymoons — copy module for /honeymoons. Every user-facing string on the
// page that is not already in web/content/public/* lives here. Desktop prototype copy wins
// (design/source-prototype/screens/client-public-topics.jsx C2010_Honeymoons); business
// claims come from the registry (web/content/public/proof.ts) and counts are derived from
// the catalog by the page, never typed here. P2 (built ahead of phase, September 2026).
//
// Voice note: the "FOR CHRISTIAN COUPLES" card is kept exactly as designed (builder brief,
// decisions list) — it is offered, never assumed (Design-System §2.5; Screen Inventory
// §2.0.10 "opt-in card").
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

export const HONEYMOONS_PATH = "/honeymoons";
export const HONEYMOONS_HERO_IMAGE: ImageKey = "overwater";

/** Shared CTA label — inquiry bar, sticky bar, Christian-couples card and closing band. */
export const REQUEST_QUOTE = "Request a quote";

const HERO_SUB =
  "A week that begins your marriage — quiet, unhurried, and built around the two of you. We handle the moving parts so you can be present.";

export const HONEYMOONS_META = {
  title: "Honeymoons",
  description: HERO_SUB,
};

export const HONEYMOONS_HERO = {
  overline: "HONEYMOONS",
  title: "The first rest,",
  script: "after the I-do's.",
  sub: HERO_SUB,
};

export const HONEYMOONS_INQUIRY_FIELDS: readonly InquiryField[] = [
  { label: "Destination", value: "Anywhere romantic", icon: "map" },
  { label: "When", value: "After your wedding date", icon: "calendar" },
  { label: "Travelers", value: "2 adults", icon: "user" },
  { label: "Vibe", value: "Quiet · Beach · Spa", icon: "palm" },
];

/**
 * Gyasi's letter (AdvisorCard variant="note"). Split around the italic question so the page
 * can render the <i> without the copy module holding JSX.
 */
export const HONEYMOONS_NOTE = {
  overline: "A NOTE FROM GYASI",
  before:
    "Honeymoons are the most personal trip I plan. Some couples want the resort with no decisions to make. Some want two islands and a snorkel boat between them. I ask the same question first either way: ",
  question: "what kind of rest does your marriage need to begin with?",
  after: " Then we plan from there.",
};

export const HONEYMOONS_STYLES_SECTION: SectionCopy = {
  overline: "THREE WAYS TO HONEYMOON",
  title: "Pick the rhythm. We pick the rest.",
};

export const HONEYMOONS_STYLES: readonly MediaCardCopy[] = [
  {
    image: "overwater",
    tag: "ALL-INCLUSIVE",
    title: "Adults-only resorts",
    body: "Sandals, Couples, Excellence — all-inclusive, no kids, real spas.",
  },
  {
    image: "overwater",
    tag: "OVERWATER",
    title: "Overwater bungalows",
    body: "A door to the ocean from your bed. Tahiti, Maldives, El Dorado Maroma.",
  },
  {
    image: "sunset",
    tag: "MULTI-STOP",
    title: "Multi-stop",
    body: "Two islands. Or a city + a beach. We sequence the rhythm — busy first, rest second.",
  },
];

/** "FEATURED · 6 PACKAGES" — the count is the number of tiles actually rendered. */
export function honeymoonsFeaturedOverline(count: number): string {
  return `FEATURED · ${count} ${count === 1 ? "PACKAGE" : "PACKAGES"}`;
}

export const HONEYMOONS_FEATURED = {
  title: "Honeymoons booked this year",
};

export interface ChristianCardCopy {
  overline: string;
  title: string;
  body: string;
  primary: string;
  secondary: string;
  image: ImageKey;
}

export const HONEYMOONS_CHRISTIAN_CARD: ChristianCardCopy = {
  overline: "FOR CHRISTIAN COUPLES",
  title: "A honeymoon that honors what you just promised.",
  body: "If you're building a Christ-centered marriage, your first week away matters. We'll steer you toward resorts that fit — quieter properties, family-owned boutiques, an Adventist-friendly Sabbath rhythm if that matters to you. Just tell me on the inquiry form. No upcharge, no judgment, no awkward conversation.",
  primary: REQUEST_QUOTE,
  secondary: "See the curated list →",
  image: "candlelit",
};

export const HONEYMOONS_CLOSING: ClosingCopy = {
  image: "honeymoon",
  title: "When's the wedding? I'll start there.",
  body: `Tell me the date, your two priorities (rest? adventure? privacy?), and a budget range. I'll send three honest options ${claim("replyWithin48h")}.`,
  primary: REQUEST_QUOTE,
  secondary: "Message Gyasi first",
};

export const HONEYMOONS_STICKY = {
  primary: REQUEST_QUOTE,
  secondary: "Message Gyasi",
};
