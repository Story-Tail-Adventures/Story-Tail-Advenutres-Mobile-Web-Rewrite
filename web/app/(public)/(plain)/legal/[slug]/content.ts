// Screen 2.0.7 Footer Pages — copy module. Desktop copy (C207) is the source; the mobile artboard
// (M207) only shortens the nav labels, which come from each document's `navLabel`. The documents
// themselves live in web/content/public/legal/*.ts. P1.
import type { LegalSlug } from "@/content/public/types";

export const LEGAL_PAGE = {
  /** Accessible name of the section <nav>. */
  navLabel: "Legal pages",
  navHeading: "LEGAL & COMPLIANCE",
  overline: "LEGAL",
  lastUpdated: "Last updated",
  // Brief correction: the prototype's "Printable view" and "Download PDF" (there is no PDF
  // pipeline) collapse into one print action.
  print: "Print this page",
  tip: "Need to print? Use “Print this page” at the top of any page.",
  /** Shown while a document's `status` is "draft" — counsel has not reviewed the text yet. */
  draftNotice:
    "Draft — this page has not been reviewed yet. It describes how the portal is meant to work; the final wording may change.",
} as const;

export function legalHref(slug: LegalSlug): string {
  return `/legal/${slug}`;
}

const LONG_DATE = new Intl.DateTimeFormat("en-US", {
  month: "long",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

/**
 * "2026-09-02" → "September 2, 2026". Formatted in UTC so the server render and the client
 * hydration agree on the day whatever the visitor's time zone (a date-only ISO string parses as
 * UTC midnight; local formatting would print the previous day west of Greenwich).
 */
export function formatLegalDate(isoDate: string): string {
  const stamp = isoDate.length === 10 ? `${isoDate}T00:00:00Z` : isoDate;
  return LONG_DATE.format(new Date(stamp));
}
