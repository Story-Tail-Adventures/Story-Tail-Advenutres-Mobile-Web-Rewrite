import Box from "@mui/material/Box";
import Skeleton from "@mui/material/Skeleton";
import { UP_MD, UP_WEB } from "@/lib/mui/sx";
import { RESULTS } from "./content";
import { RAIL_FRAME_SX, RESULT_LIST_SX, RESULTS_COLUMN_SX, VISUALLY_HIDDEN_SX } from "./sx";

const RAIL_GROUPS = [0, 1, 2];
const ROWS = [0, 1, 2];

/**
 * Loading UI for /explore/results (fidelity spec §5.7): header pill, the 220px rail with three
 * groups, three grey result rows. Same wrappers as the page so nothing jumps when it resolves.
 *
 * MUI Skeletons, whose pulse already stops under prefers-reduced-motion through the theme.
 * Heights go through `sx`, not the `height` prop: the prop writes an inline style, which no
 * breakpoint rule could then override.
 */
export function ResultsSkeleton() {
  return (
    <Box aria-busy="true" sx={{ display: "flex", flex: 1, flexDirection: "column" }}>
      <Box component="p" sx={VISUALLY_HIDDEN_SX}>
        {RESULTS.loading}
      </Box>

      <Box sx={{ borderBottom: 1, borderColor: "divider", bgcolor: "background.paper", py: 1, [UP_MD]: { py: 1.75 } }}>
        <Box sx={RESULTS_COLUMN_SX}>
          <Skeleton variant="rounded" sx={{ height: 36, [UP_MD]: { height: 44 } }} />
          <Box sx={{ mt: 1.25, display: "flex", gap: 1, pb: 0.5, [UP_WEB]: { display: "none" } }}>
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} variant="rounded" width={80} sx={{ height: 28 }} />
            ))}
          </Box>
        </Box>
      </Box>

      <Box sx={{ ...RESULTS_COLUMN_SX, display: "flex", flex: 1, gap: 2, pt: 1.75, pb: 2.25, [UP_MD]: { py: 2 } }}>
        <Box sx={{ ...RAIL_FRAME_SX, display: { xs: "none", web: "flex" }, flexDirection: "column", gap: 2 }}>
          {RAIL_GROUPS.map((g) => (
            <Box key={g} sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
              <Skeleton variant="rounded" width={96} sx={{ height: 16 }} />
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} variant="rounded" width={144} sx={{ height: 14 }} />
              ))}
            </Box>
          ))}
        </Box>

        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Box sx={{ mb: 1.5, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <Skeleton variant="rounded" width={224} sx={{ height: 24 }} />
            <Skeleton variant="rounded" width={112} sx={{ height: 32 }} />
          </Box>
          {/* Same responsive shape as the results list. */}
          <Box sx={RESULT_LIST_SX}>
            {ROWS.map((i) => (
              <Skeleton key={i} variant="rounded" sx={{ height: 240, [UP_WEB]: { height: 120 } }} />
            ))}
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

/**
 * Rows only, for the Suspense boundary inside the results page.
 *
 * Taller than a trip row (144px against the trip row's 120px) because a hotel row carries an
 * amenity line the trip row does not — a fallback that is the wrong height makes the page
 * jump when it resolves, which is the one thing a skeleton exists to prevent.
 */
export function HotelRowsSkeleton() {
  return (
    <Box aria-busy="true">
      <Box component="p" sx={VISUALLY_HIDDEN_SX}>
        {RESULTS.loading}
      </Box>
      <Box sx={RESULT_LIST_SX}>
        {ROWS.map((i) => (
          <Skeleton key={i} variant="rounded" sx={{ height: 240, [UP_WEB]: { height: 144 } }} />
        ))}
      </Box>
    </Box>
  );
}
