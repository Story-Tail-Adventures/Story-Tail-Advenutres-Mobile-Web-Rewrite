// Screen 2.0.4 Public Search Results — see docs/Screen-Inventory.md §2.0.4 (Pattern F, §4.4)
// and design/source-prototype/screens/client-public.jsx (C204_PublicSearchResults) +
// client-public-mobile.jsx (M204_PublicSearchResults). P2.
//
// The URL is the only state: `parseSearchParams` reads it, `searchTrips` filters the curated
// catalog in memory, and every control (search pill, rail, chips, sort) is a GET form or a link
// back to this route. Phase 2 swaps `TRIPS` for the travel-API search without touching the page.
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { StickyCta } from "@/components/public/StickyCta";
import { tripRating } from "@/content/public/proof";
import { TRIPS } from "@/content/public/trips";
import { cn } from "@/lib/cn";
import { staImg } from "@/lib/images";
import { joinHref } from "@/lib/public/links";
import {
  describeQuery,
  effectiveMode,
  parseSearchParams,
  resultsHref,
  searchTrips,
  type RawSearchParams,
} from "@/lib/public/search";
import { RESULTS } from "./content";
import { CruiseResults } from "./CruiseResults";
import { HotelResults } from "./HotelResults";
import { HotelRowsSkeleton } from "./ResultsSkeleton";
import { ModeSwitch } from "./ModeSwitch";
import { SearchUpdateBar } from "./SearchUpdateBar";
import { EmptyResults } from "./EmptyResults";
import { FilterRail } from "./FilterRail";
import { FILTER_SHEET_ANCHOR, FilterSheet } from "./FilterSheet";
import { activeFilterCount, chipHref, chipIsOn, MOBILE_CHIPS } from "./filters";
import { ResultCard } from "./ResultCard";
import { SortMenu } from "./SortControl";

const SEARCH_ENTRY = "/explore";

export const metadata: Metadata = {
  title: RESULTS.meta.title,
  description: RESULTS.meta.description,
  // Filtered result pages are not indexed; /explore is the canonical entry.
  robots: { index: false, follow: true },
  alternates: { canonical: SEARCH_ENTRY },
  openGraph: {
    title: RESULTS.meta.title,
    description: RESULTS.meta.description,
    url: SEARCH_ENTRY,
    images: [{ url: staImg("bahamas", 1200, 630), width: 1200, height: 630 }],
  },
};

export default async function ResultsPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const q = parseSearchParams(await searchParams);
  const mode = effectiveMode(q);
  const results = searchTrips(TRIPS, q, tripRating);
  const current = resultsHref(q);
  const activeCount = activeFilterCount(q);

  return (
    <>
      {/* Header band: compact inquiry pill (md+) / summary pill + quick-filter chips (below web). */}
      <div className="border-b border-outline-variant bg-surface-1 pt-2 md:py-3.5">
        <div className="pub-container web:px-8">
          {/* A real form, not a read-only pill with a link to a blank one — see the
              component. Editing happens here because this route is already dynamic. */}
          <SearchUpdateBar q={q} />
          <div className="pt-2.5">
            <ModeSwitch q={q} />
          </div>
          <nav aria-label={RESULTS.chips.label} className="h-scroll items-center pt-2.5 pb-3 web:hidden">
            {MOBILE_CHIPS.map((chip) => {
              const on = chipIsOn(q, chip);
              return (
                <Link
                  key={chip.id}
                  href={chipHref(q, chip)}
                  aria-current={on ? "true" : undefined}
                  className={cn("chip chip-filter tap-44 h-8 px-3 text-on-surface", on && "is-on")}
                >
                  {chip.label}
                </Link>
              );
            })}
            <FilterSheet
              label={activeCount ? RESULTS.chips.filtersWithCount(activeCount) : RESULTS.chips.filters}
              title={RESULTS.filters.label}
              closeLabel={RESULTS.filters.close}
            >
              <FilterRail q={q} idPrefix="sheet" overline={false} />
            </FilterSheet>
          </nav>
        </div>
      </div>

      {/* Body: filter rail (web) | results. */}
      <div className="pub-container web:px-8 flex flex-1 gap-4 pt-3.5 pb-4.5 md:py-4">
        <FilterRail q={q} idPrefix="rail" className="hidden w-55 shrink-0 border-r border-outline-variant pr-4 web:block" />

        <section className="min-w-0 flex-1" aria-labelledby="results-heading">
          {/* M204 sets the count as a t-label line; C204 as t-title-l (fidelity spec §6.5). */}
          <div className="mb-2.5 flex items-center justify-between gap-3 md:mb-3">
            <h1 id="results-heading" className="t-label md:t-title-l text-on-surface-variant md:text-on-surface">
              {mode === "picks"
                ? RESULTS.heading(results.length, describeQuery(q))
                : `${mode === "hotels" ? RESULTS.mode.hotels : RESULTS.mode.cruises} · ${describeQuery(q)}`}
            </h1>
            <SortMenu q={q} />
          </div>

          {mode === "hotels" ? (
            /* `key` on the search so a changed query shows the skeleton again rather than
               holding the previous list while the next one loads. */
            <Suspense key={current} fallback={<HotelRowsSkeleton />}>
              <HotelResults q={q} current={current} />
            </Suspense>
          ) : mode === "cruises" ? (
            <Suspense key={current} fallback={<HotelRowsSkeleton />}>
              <CruiseResults q={q} />
            </Suspense>
          ) : results.length > 0 ? (
            <>
              {/* Stacked cards: one column below md, a 2-up grid on tablet, rows at web. The tablet
                  rules are scoped with `md:max-web:` because Tailwind emits the px-based `web:`
                  block BEFORE the rem-based `md:` block, so a plain `web:flex` would lose. */}
              <ul className="flex flex-col gap-2.5 md:max-web:grid md:max-web:grid-cols-2 md:max-web:gap-3.5">
                {results.map((trip) => (
                  <li key={trip.slug}>
                    <ResultCard trip={trip} rating={tripRating(trip.slug)} next={current} />
                  </li>
                ))}
              </ul>
              <p className="t-body-s mt-2.5 text-center text-on-surface-variant md:mt-2">{RESULTS.footnote}</p>
            </>
          ) : (
            <EmptyResults />
          )}
        </section>
      </div>

      <StickyCta
        primary={{ label: RESULTS.sticky.primary, href: joinHref({ intent: "save", next: current }), icon: "heart" }}
        secondary={{ label: RESULTS.sticky.secondary, href: `#${FILTER_SHEET_ANCHOR}` }}
      />
    </>
  );
}
