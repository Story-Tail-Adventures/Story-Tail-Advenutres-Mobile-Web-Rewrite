import { unlicensedImages } from "@/lib/images";
import { draftLegalDocs } from "./legal";
import { TRIPS } from "./trips";
import type { Claim, Testimonial } from "./types";

/**
 * MARKETING CLAIMS REGISTRY — every statement about Gyasi's business that a visitor could
 * take as fact lives here, once, with a `verified` flag.
 *
 * Nothing in this file is verified yet. The values are the design prototype's placeholder
 * copy, kept verbatim (user decision) so the pages match the artboards while the real
 * figures are gathered. Two things make it impossible to ship them by accident:
 *
 *  1. `<PlaceholderBanner/>` renders on every public page while `unverifiedClaims()` is
 *     non-empty (or a photo is unlicensed, a legal page is a draft, or a price is a
 *     placeholder).
 *  2. With PUBLIC_CLAIMS_MODE=strict in the environment — set ONLY in the production
 *     deployment — this module throws at import, so `next build` fails.
 *
 * To verify a claim: change the value if needed, set `verified: true`, and record the
 * `source` and `verifiedOn`. The pinned list in proof.test.ts must be updated in the same
 * change, so a new placeholder is always a visible diff.
 *
 * Pronouns: Gyasi Story is he/him (supabase/seed.sql). The prototype copy said "mom of
 * three" and "she"; it is corrected here and the parent line stays unverified.
 */

export const CLAIM_IDS = [
  "travelersServed",
  "ratingValue",
  "reviewCount",
  "avgReplyTime",
  "yearsSpecialist",
  "credInteletravel",
  "credClia",
  "credSandals",
  "credRoyal",
  "bioParent",
  "bioIslands",
  "bioStarted",
  "bioNamed",
  "plannedRoyalBahamian",
  "catalogUpdatedMonthly",
  "sailsEachLineYearly",
  "replyWithin48h",
  "islandsPlannedAll",
  "tripDetails",
] as const;

export type ClaimId = (typeof CLAIM_IDS)[number];

export const CLAIMS: Record<ClaimId, Claim> = {
  travelersServed: { display: "240+", detail: "Travelers served", verified: false },
  ratingValue: { display: "4.9", detail: "Average rating", verified: false },
  reviewCount: { display: "138", detail: "Reviews", verified: false },
  /**
   * VERIFYING THIS ONE MEANS RECONCILING IT WITH §2.2, not just flipping the flag.
   *
   * Three reply-time promises existed across the app. §2.2 settled on "Usually replies the
   * same day" — see `web/lib/trips/thread.ts` — and §2.1's completion screen already said
   * it, so the authenticated surface is consistent. These two registry entries are the
   * public surface's, still carrying the artboards' figures verbatim by user decision.
   *
   * Whoever measures the real number should either bring §2.2's string here or bring this
   * figure there, in the same change. Setting `verified: true` on "< 2h" while the trip
   * screens promise "the same day" would ship a public claim the product contradicts the
   * moment somebody logs in — and it is the public one that is legally a marketing claim.
   */
  avgReplyTime: { display: "< 2h", detail: "Avg reply time", verified: false },
  yearsSpecialist: { display: "5 yrs", detail: "Caribbean specialist", verified: false },
  credInteletravel: {
    display: "Hosted by Inteletravel",
    detail: "IATA-accredited host agency · Full supplier access",
    verified: false,
  },
  credClia: {
    display: "CLIA Member",
    detail: "Cruise Lines International Association · Sailings booked yearly",
    verified: false,
  },
  credSandals: {
    display: "Sandals Certified Specialist",
    detail: "Trained on all properties in Jamaica, Bahamas, St. Lucia, Turks",
    verified: false,
  },
  credRoyal: {
    display: "Royal Caribbean Master",
    detail: "Master-level certification · Symphony, Wonder, Icon class",
    verified: false,
  },
  bioParent: { display: "dad of three", verified: false },
  bioIslands: { display: "I lived in the islands.", verified: false },
  bioStarted: { display: "2019", detail: "Started planning trips for friends", verified: false },
  bioNamed: { display: "2021", detail: "Story-Tail Adventures got its name", verified: false },
  plannedRoyalBahamian: { display: "14", detail: "Sandals Royal Bahamian trips planned", verified: false },
  catalogUpdatedMonthly: { display: "Updated monthly.", verified: false },
  sailsEachLineYearly: {
    display: "I sail with each line at least once a year, so the recommendation isn't a brochure — it's lived.",
    verified: false,
  },
  /** Same reconciliation as `avgReplyTime` above, and note these two already disagree. */
  replyWithin48h: { display: "within 48 hours", verified: false },
  islandsPlannedAll: {
    display: "Twelve islands. One advisor who's planned every one of them.",
    verified: false,
  },
  tripDetails: {
    display: "Trip descriptions, highlights and sample itineraries",
    detail: "Drafted from the design prototype and public supplier information; confirm with suppliers.",
    verified: false,
  },
};

export function claim(id: ClaimId): string {
  return CLAIMS[id].display;
}

/** "Hosted by Inteletravel · CLIA member · 4.9★ from 138 travelers" (2.0.3 trust row). */
export function trustLine(): string {
  return `Hosted by Inteletravel · CLIA member · ${claim("ratingValue")}★ from ${claim("reviewCount")} travelers`;
}

/** Third-party ratings the prototype shows on result cards and the detail hero. */
export const TRIP_REVIEWS: Record<string, Claim & { rating: number; count: number }> = {
  "sandals-royal-bahamian": { display: "4.9 · 312 reviews", rating: 4.9, count: 312, verified: false },
  "symphony-of-the-seas": { display: "4.7", rating: 4.7, count: 0, verified: false },
  "beaches-turks-and-caicos": { display: "4.8", rating: 4.8, count: 0, verified: false },
  "couples-negril": { display: "4.6", rating: 4.6, count: 0, verified: false },
};

export function tripRating(slug: string): number | undefined {
  return TRIP_REVIEWS[slug]?.rating;
}

export const ADVISOR = {
  name: "Gyasi Story",
  firstName: "Gyasi",
  pronouns: "he/him",
  initials: "GS",
  title: "Travel Advisor",
  /** 2.0.11 hero line — the parent claim is unverified; the rest is from the prototype. */
  heroLine: `Caribbean specialist, ${claim("bioParent")}, Sandals-certified, hosted by Inteletravel. I plan the kind of week that turns into a story your family tells for years — and I don't disappear after the deposit clears.`,
  shortBio:
    "Caribbean specialist hosted by Inteletravel. Family travel, honeymoons, cruises, and the kind of all-inclusive weeks that turn into stories worth retelling.",
} as const;

/**
 * Testimonials — prototype placeholders. Publishing an endorsement without the person's
 * consent is unlawful for a US business (16 CFR Part 465), so every entry is
 * `consented: false` until a real, permissioned quote replaces it. Pronouns corrected to
 * he/him.
 */
export const TESTIMONIALS: readonly Testimonial[] = [
  {
    quote:
      "Gyasi planned our first family cruise. Three kids, two grandparents, one mom who needed a break. He didn't miss a detail — even called when our connection got cancelled in Miami.",
    who: "The Westbrook Family",
    trip: "Symphony · Dec 2024",
    initials: "WF",
    consented: false,
  },
  {
    quote:
      "He steered us to a quieter resort than what we picked online — saved us thousands too. Best honeymoon week we could've asked for.",
    who: "Reggie & Marc",
    trip: "Sandals St. Lucia · May 2024",
    initials: "RM",
    consented: false,
  },
  {
    quote:
      "I message him at 9pm with random questions and he replies. That's the whole pitch right there — he actually cares.",
    who: "Aisha Patel",
    trip: "Atlantis · Mar 2024",
    initials: "AP",
    consented: false,
  },
  {
    quote:
      "We did a multi-gen group trip — 12 people, two cabins, three flights from three cities. He made it feel small.",
    who: "The Khan Family",
    trip: "Beaches T&C · Aug 2024",
    initials: "KF",
    consented: false,
  },
  {
    quote:
      "No high-pressure sales, no upselling. Just real options, real prices, and a person who picks up the phone.",
    who: "Tasha Whitfield",
    trip: "Aruba · Oct 2023",
    initials: "TW",
    consented: false,
  },
  {
    quote:
      "I was nervous about authorizing a card online. He walked me through every step, sent me the audit log, never made me feel silly.",
    who: "Linda Gomez",
    trip: "Riviera Maya · Jan 2024",
    initials: "LG",
    consented: false,
  },
];

export interface PlaceholderReport {
  claims: ClaimId[];
  reviews: string[];
  testimonials: number;
  unlicensedImages: string[];
  draftLegal: string[];
  placeholderPrices: string[];
}

export function placeholderReport(): PlaceholderReport {
  return {
    claims: CLAIM_IDS.filter((id) => !CLAIMS[id].verified),
    reviews: Object.keys(TRIP_REVIEWS).filter((slug) => !TRIP_REVIEWS[slug].verified),
    testimonials: TESTIMONIALS.filter((t) => !t.consented).length,
    unlicensedImages: unlicensedImages(),
    draftLegal: draftLegalDocs().map((d) => d.slug),
    placeholderPrices: TRIPS.filter((t) => t.pricePlaceholder).map((t) => t.slug),
  };
}

export function unverifiedClaims(): ClaimId[] {
  return placeholderReport().claims;
}

export function hasPlaceholders(report: PlaceholderReport = placeholderReport()): boolean {
  return (
    report.claims.length > 0 ||
    report.reviews.length > 0 ||
    report.testimonials > 0 ||
    report.unlicensedImages.length > 0 ||
    report.draftLegal.length > 0 ||
    report.placeholderPrices.length > 0
  );
}

export const PLACEHOLDER_BANNER =
  "Preview content — some figures, quotes, prices and photos are placeholders pending verification.";

/**
 * Production gate. Runs at import so a strict build cannot render a page that depends on
 * this module while anything above is still a placeholder.
 */
export function assertProductionReady(
  mode: string | undefined = process.env.PUBLIC_CLAIMS_MODE,
  report: PlaceholderReport = placeholderReport(),
): void {
  if (mode !== "strict") return;
  if (!hasPlaceholders(report)) return;
  const lines = [
    "PUBLIC_CLAIMS_MODE=strict: the public pages still contain placeholder content.",
    report.claims.length ? `  unverified claims: ${report.claims.join(", ")}` : "",
    report.reviews.length ? `  unverified ratings: ${report.reviews.join(", ")}` : "",
    report.testimonials ? `  testimonials without consent: ${report.testimonials}` : "",
    report.unlicensedImages.length ? `  unlicensed images: ${report.unlicensedImages.join(", ")}` : "",
    report.draftLegal.length ? `  draft legal pages: ${report.draftLegal.join(", ")}` : "",
    report.placeholderPrices.length ? `  placeholder prices: ${report.placeholderPrices.length} trips` : "",
    "See web/content/public/proof.ts.",
  ].filter(Boolean);
  throw new Error(lines.join("\n"));
}

assertProductionReady();
