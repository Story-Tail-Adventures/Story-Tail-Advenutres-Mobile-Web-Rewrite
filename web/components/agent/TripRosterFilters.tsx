import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import OutlinedInput from "@mui/material/OutlinedInput";

import NextForm from "@/components/mui/NextForm";
import { Button } from "@/components/ui/Button";
import { TRIP_COPY } from "@/lib/agent/content";
import {
  isDefaultStages,
  TRIP_STATUS_FILTERS,
  type TripQuery,
  type TripStatusFilter,
} from "@/lib/agent/tripStatuses";
import { VISUALLY_HIDDEN } from "@/lib/mui/sx";

/**
 * Screen 3.4.1's search box and stage chips.
 *
 * A GET FORM VIA `next/form`, exactly as §3.3.1's filters are and for the same reasons: the
 * filters round-trip through the URL, so a filtered list is shareable, the back button means
 * what it says, the page stays a server component, and it all works with JavaScript off.
 *
 * SIX CHIPS, NOT THE PROTOTYPE'S FOUR — see `TRIP_STATUS_FILTERS`. They are CHECKBOXES, not
 * radios, which is where this departs from §3.3.1's status filter: a client is active or
 * archived and never both, but "show me proposals and booked" is an ordinary thing to want,
 * and the accessor already takes an array.
 *
 * NO `page` INPUT, deliberately. Applying a filter while on page 3 of the old result set
 * would land past the end of the new one and render an empty table over a non-zero count —
 * the trap §3.3.1's filters record.
 *
 * EACH CHIP IS A LABEL AROUND A HIDDEN CHECKBOX, the shape `components/ui/Chip`'s ChipInput
 * has — drawn here rather than through it because the chip text carries a dimmed count
 * beside the stage name, and ChipInput takes a plain string. The look is the same: outlined
 * at rest, filled secondary once ticked, the theme's focus ring when the hidden input has
 * keyboard focus, all through `:has()` so the GET form needs no state.
 */

/** ChipInput's selected/focus/disabled styling, at the legacy 28px (`h-7`). */
const FILTER_CHIP_SX = {
  height: 28,
  cursor: "pointer",
  "&:has(input:checked)": {
    bgcolor: "secondary.main",
    color: "secondary.contrastText",
    borderColor: "secondary.main",
  },
  "&:has(input:focus-visible)": {
    outline: "2px solid",
    outlineColor: "primary.main",
    outlineOffset: "2px",
  },
} as const;

export function TripRosterFilters({
  query,
  counts,
}: {
  query: TripQuery;
  counts: Record<TripStatusFilter, number>;
}) {
  const picked = new Set(query.statuses);
  // The default (the live four) is not a selection the advisor made, so the chips read as
  // unticked rather than showing four highlighted ones nobody chose.
  const isDefault = isDefaultStages(query.statuses);

  return (
    <Box
      component={NextForm}
      action="/agent/trips"
      sx={{ mb: 1.5, display: "flex", flexDirection: "column", gap: 1.25 }}
    >
      <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 1 }}>
        <Box component="label" htmlFor="trip-q" sx={VISUALLY_HIDDEN}>
          {TRIP_COPY.searchLabel}
        </Box>
        <OutlinedInput
          id="trip-q"
          type="search"
          name="q"
          defaultValue={query.search}
          placeholder={TRIP_COPY.searchPlaceholder}
          size="small"
          sx={{ flex: 1, minWidth: 0 }}
        />
        <Button type="submit" variant="tonal" size="sm">
          {TRIP_COPY.searchLabel}
        </Button>
      </Box>

      <Box
        component="fieldset"
        sx={{
          m: 0,
          p: 0,
          border: 0,
          minWidth: 0,
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 0.75,
        }}
      >
        <Box component="legend" sx={VISUALLY_HIDDEN}>
          {TRIP_COPY.colStage}
        </Box>
        {TRIP_STATUS_FILTERS.map((f) => (
          <Chip
            key={f.value}
            component="label"
            variant="outlined"
            sx={FILTER_CHIP_SX}
            label={
              <>
                <Box
                  component="input"
                  type="checkbox"
                  name="status"
                  value={f.value}
                  defaultChecked={!isDefault && picked.has(f.value)}
                  sx={VISUALLY_HIDDEN}
                />
                {f.label}
                <Box component="span" sx={{ ml: 0.5, opacity: 0.6 }}>
                  {counts[f.value]}
                </Box>
              </>
            }
          />
        ))}
      </Box>
    </Box>
  );
}
