// Screen 2.0.4 Public Search Results — see docs/Screen-Inventory.md §2.0.4 (Pattern F, §4.4)
// and design/source-prototype/screens/client-public.jsx (C204_PublicSearchResults) +
// client-public-mobile.jsx (M204_PublicSearchResults). P2.
//
// The URL is the only state: `parseSearchParams` reads it, `searchTrips` filters the curated
// catalog in memory, and every control (search pill, rail, chips, sort) is a GET form or a link
// back to this route. Phase 2 swaps `TRIPS` for the travel-API search without touching the page.
//
// MUI (step 3 of the Tailwind → MUI migration): same structure, breakpoints and sizes; only the
// visual layer moved. The page stays a Server Component — the sheet and the sort menu are the
// client islands, and both take plain data.
import type { Metadata } from "next";
import { Suspense } from "react";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Typography from "@mui/material/Typography";
import NextLink from "@/components/mui/NextLink";
import { StickyCta } from "@/components/public/StickyCta";
import { tripRating } from "@/content/public/proof";
import { TRIPS } from "@/content/public/trips";
import { staImg } from "@/lib/images";
import { TAP_TARGET, UP_MD, UP_WEB } from "@/lib/mui/sx";
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
import { FilterSheet } from "./FilterSheet";
import { activeFilterCount, chipHref, chipIsOn, chipsFor } from "./filters";
import { ResultCard } from "./ResultCard";
import { SortMenu } from "./SortControl";
import { FILTER_SHEET_ANCHOR, RAIL_FRAME_SX, RESULT_LIST_SX, RESULTS_COLUMN_SX } from "./sx";

const SEARCH_ENTRY = "/explore";

export const metadata: Metadata = {
  title: RESULTS.meta.title,
  description: RESULTS.meta.description,
  // Filtered result pages are not indexed; /explore is the canonical entry.
  //
  // `follow` became false when Hotels mode landed. Every mode-switch, chip and sort link on
  // this page is a plain anchor whose href changes the cache key, and Hotels mode spends a
  // metered provider request per distinct key — so `follow: true` was an invitation to a
  // crawler to walk the combinatorial space of this page at 250 searches a month.
  // `prefetch={false}` stops Next prefetching on hover; it does nothing about a crawler.
  // Nothing here is reachable only from this page, so following it buys nothing either.
  robots: { index: false, follow: false },
  alternates: { canonical: SEARCH_ENTRY },
  openGraph: {
    title: RESULTS.meta.title,
    description: RESULTS.meta.description,
    url: SEARCH_ENTRY,
    images: [{ url: staImg("bahamas", 1200, 630), width: 1200, height: 630 }],
  },
};

/**
 * The quick-filter strip. This is the legacy `.h-scroll` written out in sx rather than kept as
 * a class: `.h-scroll` sets `display: flex` from `@layer components`, which beats MUI's layer,
 * so the `web:hidden` it needs here could not be expressed in sx beside it. It still bleeds
 * out of the column by the gutter and snaps, exactly as before.
 */
const CHIP_STRIP_SX = {
  display: "flex",
  alignItems: "center",
  gap: 1,
  overflowX: "auto",
  scrollSnapType: "x mandatory",
  pt: 1.25,
  pb: 1.5,
  mx: "calc(-1 * var(--gutter))",
  px: "var(--gutter)",
  scrollbarWidth: "none",
  "&::-webkit-scrollbar": { display: "none" },
  "& > *": { scrollSnapAlign: "start", flexShrink: 0 },
  [UP_WEB]: { display: "none" },
} as const;

export default async function ResultsPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const q = parseSearchParams(await searchParams);
  const mode = effectiveMode(q);
  const results = searchTrips(TRIPS, q, tripRating);
  const current = resultsHref(q);
  const activeCount = activeFilterCount(q);

  return (
    <>
      {/* Header band: compact inquiry pill (md+) / summary pill + quick-filter chips (below web). */}
      <Box
        sx={{
          borderBottom: 1,
          borderColor: "divider",
          bgcolor: "background.paper",
          pt: 1,
          [UP_MD]: { py: 1.75 },
        }}
      >
        <Box sx={RESULTS_COLUMN_SX}>
          {/* A real form, not a read-only pill with a link to a blank one — see the
              component. Editing happens here because this route is already dynamic. */}
          <SearchUpdateBar q={q} />
          <Box sx={{ pt: 1.25 }}>
            <ModeSwitch q={q} />
          </Box>
          <Box component="nav" aria-label={RESULTS.chips.label} sx={CHIP_STRIP_SX}>
            {chipsFor(mode).map((chip) => {
              const on = chipIsOn(q, chip);
              return (
                // `is-on` stays as a plain state marker (the page test reads it); the look is
                // the Chip's own filled/outlined pair, as the converted search screens draw a
                // chosen filter.
                <Chip
                  key={chip.id}
                  component={NextLink}
                  href={chipHref(q, chip)}
                  clickable
                  label={chip.label}
                  variant={on ? "filled" : "outlined"}
                  color={on ? "secondary" : "default"}
                  aria-current={on ? "true" : undefined}
                  className={on ? "is-on" : undefined}
                  sx={TAP_TARGET}
                />
              );
            })}
            <FilterSheet
              label={activeCount ? RESULTS.chips.filtersWithCount(activeCount) : RESULTS.chips.filters}
              title={RESULTS.filters.label}
              closeLabel={RESULTS.filters.close}
            >
              <FilterRail q={q} idPrefix="sheet" overline={false} />
            </FilterSheet>
          </Box>
        </Box>
      </Box>

      {/* Body: filter rail (web) | results. */}
      <Box
        sx={{
          ...RESULTS_COLUMN_SX,
          display: "flex",
          flex: 1,
          gap: 2,
          pt: 1.75,
          pb: 2.25,
          [UP_MD]: { py: 2 },
        }}
      >
        <Box sx={{ ...RAIL_FRAME_SX, display: { xs: "none", web: "block" } }}>
          <FilterRail q={q} idPrefix="rail" />
        </Box>

        <Box component="section" aria-labelledby="results-heading" sx={{ minWidth: 0, flex: 1 }}>
          {/* M204 sets the count as a small label line; C204 as the h5 title (fidelity spec §6.5). */}
          <Box
            sx={{
              mb: 1.25,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 1.5,
              [UP_MD]: { mb: 1.5 },
            }}
          >
            <Typography
              id="results-heading"
              component="h1"
              variant="h5"
              sx={{
                typography: { xs: "caption", md: "h5" },
                fontWeight: { xs: 500, md: 400 },
                color: { xs: "text.secondary", md: "text.primary" },
              }}
            >
              {mode === "picks"
                ? RESULTS.heading(results.length, describeQuery(q))
                : `${mode === "hotels" ? RESULTS.mode.hotels : RESULTS.mode.cruises} · ${describeQuery(q)}`}
            </Typography>
            <SortMenu q={q} />
          </Box>

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
              {/* Stacked cards: one column below md, a 2-up grid on tablet, rows at web. */}
              <Box component="ul" sx={RESULT_LIST_SX}>
                {results.map((trip) => (
                  <li key={trip.slug}>
                    <ResultCard trip={trip} rating={tripRating(trip.slug)} next={current} />
                  </li>
                ))}
              </Box>
              <Typography
                component="p"
                variant="caption"
                sx={{ display: "block", mt: 1.25, textAlign: "center", color: "text.secondary", [UP_MD]: { mt: 1 } }}
              >
                {RESULTS.footnote}
              </Typography>
            </>
          ) : (
            <EmptyResults />
          )}
        </Box>
      </Box>

      <StickyCta
        primary={{ label: RESULTS.sticky.primary, href: joinHref({ intent: "save", next: current }), icon: "heart" }}
        secondary={{ label: RESULTS.sticky.secondary, href: `#${FILTER_SHEET_ANCHOR}` }}
      />
    </>
  );
}
