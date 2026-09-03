import type { Trip } from "@/content/public/types";
import { env } from "@/lib/env";
import { tripHref } from "@/lib/public/links";
import { DETAIL } from "./content";

/**
 * Structured data for 2.0.5 (risk plan §3: BreadcrumbList only — no Product/Offer while prices
 * are illustrative, no AggregateRating while reviews are unverified).
 */
export function breadcrumbList(trip: Pick<Trip, "slug" | "name">) {
  const base = env.siteUrl;
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: DETAIL.breadcrumbExplore, item: `${base}/explore` },
      { "@type": "ListItem", position: 2, name: trip.name, item: `${base}${tripHref(trip.slug)}` },
    ],
  } as const;
}

/** JSON-LD serialiser: `<` is escaped so catalog text can never close the script element. */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
