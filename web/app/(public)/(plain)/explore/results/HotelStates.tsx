import Box from "@mui/material/Box";
import MuiButton from "@mui/material/Button";
import Card from "@mui/material/Card";
import Typography from "@mui/material/Typography";
import NextLink from "@/components/mui/NextLink";
import { inquiryHref } from "@/lib/public/inquiry";
import { resultsHref, type SearchQuery } from "@/lib/public/search";
import { RESULTS } from "./content";
import { SEARCH_ANCHOR } from "./SearchUpdateBar";

export type HotelStateKind =
  | "need-destination"
  | "need-dates"
  | "empty"
  | "unavailable"
  | "exhausted"
  | "cruise-empty"
  | "cruise-unavailable";

const COPY = {
  "need-destination": RESULTS.hotels.needDestination,
  "need-dates": RESULTS.hotels.needDates,
  empty: RESULTS.hotels.empty,
  unavailable: RESULTS.hotels.unavailable,
  exhausted: RESULTS.hotels.exhausted,
  "cruise-empty": RESULTS.cruises.empty,
  "cruise-unavailable": RESULTS.cruises.unavailable,
} as const;

/** Legacy .btn-tonal (outlined secondary) and .btn-text (text primary) boxes, Design-System §8. */
const TONAL_SX = { minHeight: 40, px: "24px", whiteSpace: "nowrap" } as const;
const TEXT_SX = { minHeight: 40, px: "12px", whiteSpace: "nowrap" } as const;

/**
 * The five ways hotels mode can have nothing to show.
 *
 * Never a dead end — the same rule EmptyResults follows. Every one of these offers the
 * curated catalog and a way to reach Gyasi, because a visitor who came looking for a week
 * away should not leave holding an error.
 *
 * There is deliberately NO "try again" button on the unavailable state: a link to the same
 * URL will not refetch inside the cache window, and a retry that does nothing is worse than
 * an honest offer of the alternative.
 */
export function HotelState({ kind, q }: { kind: HotelStateKind; q: SearchQuery }) {
  const copy = COPY[kind];
  return (
    <Card sx={{ p: 4, textAlign: "center" }}>
      <Typography component="h2" variant="h5">
        {copy.title}
      </Typography>
      <Typography component="p" variant="body2" sx={{ mx: "auto", mt: 0.75, maxWidth: 500, color: "text.secondary" }}>
        {copy.body}
      </Typography>
      <Box sx={{ mt: 2, display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "center", gap: 1 }}>
        {(kind === "need-destination" || kind === "need-dates") && (
          // An anchor to the form at the top of this page, NOT a link to /explore — which
          // was blank, so "change your search" meant "retype your search".
          <MuiButton component="a" href={`#${SEARCH_ANCHOR}`} variant="outlined" color="secondary" sx={TONAL_SX}>
            {RESULTS.hotels.editSearch}
          </MuiButton>
        )}
        <MuiButton component={NextLink} href={resultsHref({ ...q, mode: "picks" })} variant="outlined" color="secondary" sx={TONAL_SX}>
          {RESULTS.hotels.seePicks}
        </MuiButton>
        <MuiButton component="a" href={inquiryHref({ source: "results" })} variant="text" color="primary" sx={TEXT_SX}>
          {RESULTS.empty.message}
        </MuiButton>
      </Box>
    </Card>
  );
}

/** The cruise modes reuse the same shell — same rule, same CTAs, different copy. */
export const CruiseState = HotelState;
