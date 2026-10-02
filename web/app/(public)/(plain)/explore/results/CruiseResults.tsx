import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { searchCruises } from "@/lib/public/cruises";
import type { SearchQuery } from "@/lib/public/search";
import { RESULTS } from "./content";
import { CruiseCard } from "./CruiseCard";
import { CruiseState } from "./HotelStates";
import { RESULT_LIST_SX } from "./sx";

/**
 * The Cruises mode's results. Its own component for the same reason `HotelResults` is: it is
 * the only thing on the page that awaits a fetch, so the page can wrap it in Suspense and
 * paint everything else immediately.
 *
 * No precondition guard, unlike hotels. A cruise search with no destination and no dates is
 * a perfectly good question — "what is sailing?" — and answering it costs one indexed query
 * against our own catalog rather than a metered provider request.
 */
export async function CruiseResults({ q }: { q: SearchQuery }) {
  const result = await searchCruises({
    destination: q.dest,
    // The search bar's check-in is a hint about WHEN, not a sailing date to match exactly.
    from: q.checkIn,
  });

  if (result.status === "unavailable") return <CruiseState kind="cruise-unavailable" q={q} />;
  if (result.status === "empty") return <CruiseState kind="cruise-empty" q={q} />;

  return (
    <>
      <Box component="ul" sx={RESULT_LIST_SX}>
        {result.sailings.map((sailing) => (
          <li key={sailing.id}>
            <CruiseCard sailing={sailing} />
          </li>
        ))}
      </Box>
      {/* The one line that stands in for the price column this card deliberately lacks. */}
      <Typography component="p" variant="caption" sx={{ display: "block", mt: 1.25, textAlign: "center", color: "text.secondary" }}>
        {RESULTS.cruises.priceNote}
      </Typography>
      <Typography component="p" variant="caption" sx={{ display: "block", mt: 0.5, textAlign: "center", color: "text.secondary" }}>
        {RESULTS.footnote}
      </Typography>
    </>
  );
}
