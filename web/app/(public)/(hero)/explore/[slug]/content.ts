// Screen 2.0.5 Public Property / Cruise / Tour Detail — copy module. Desktop copy (C205) is the
// source; per-trip text (description, highlights, itinerary, price note) comes from the catalog. P2.
import { claim, type ClaimId } from "@/content/public/proof";
import type { Trip } from "@/content/public/types";
import { TRIP_TYPE_LABELS } from "@/lib/public/search";

export const DETAIL = {
  whatItIs: "What it is",
  sampleItinerary: "Sample itinerary",
  /** Visually hidden heading for the price / advisor rail. */
  asideHeading: "Pricing and next steps",
  price: {
    startingAt: "STARTING AT",
    perPerson: "/person",
    requestQuote: "Request a quote",
    favorite: "Favorite",
    orNote: "* Requires an account, or...",
    messageGuest: "Message Gyasi without an account →",
  },
  advisor: {
    planned: (count: string) => `Gyasi planned ${count} of these`,
    knowsWell: "Gyasi knows this one well",
    message: "Message →",
  },
  saveAria: (name: string) => `Save ${name} for later`,
  nights: (n: number) => `${n} ${n === 1 ? "night" : "nights"}`,
  breadcrumbExplore: "Explore",
} as const;

/** Which registry claim backs "Gyasi planned N of these" for a trip; the rest get the soft line. */
const PLANNED_CLAIM_BY_SLUG: Readonly<Partial<Record<string, ClaimId>>> = {
  "sandals-royal-bahamian": "plannedRoyalBahamian",
};

export function advisorTitle(slug: string): string {
  const id = PLANNED_CLAIM_BY_SLUG[slug];
  return id ? DETAIL.advisor.planned(claim(id)) : DETAIL.advisor.knowsWell;
}

/** Hero badge: "All-inclusive · 7 nights" (type label + nights when the catalog has them). */
export function tripBadge(trip: Pick<Trip, "type" | "nights">): string {
  const parts = [TRIP_TYPE_LABELS[trip.type]];
  if (trip.nights) parts.push(DETAIL.nights(trip.nights));
  return parts.join(" · ");
}
