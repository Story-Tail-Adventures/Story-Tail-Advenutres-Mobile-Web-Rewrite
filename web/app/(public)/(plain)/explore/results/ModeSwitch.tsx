import Box from "@mui/material/Box";
import MuiButton from "@mui/material/Button";
import NextLink from "@/components/mui/NextLink";
import { TAP_TARGET } from "@/lib/mui/sx";
import { effectiveMode, resultsHref, type SearchQuery } from "@/lib/public/search";
import { RESULTS } from "./content";

/**
 * "Gyasi's picks" / "Hotels" / "Cruises".
 *
 * Three links, not a tablist and not a ToggleButtonGroup: these are navigations, and
 * `aria-current="page"` is the honest attribute for "you are here" (`aria-pressed` belongs to
 * a toggle button, which a link is not). No JavaScript, like every other control on this page.
 *
 * On MUI: a segmented group of small Buttons on a `surface.2` track — the active one contained
 * primary, the others text — in the same 32px pill-row box as before.
 *
 * `prefetch={false}` on the Hotels link is not a performance tweak — a hovered prefetch
 * would spend a metered provider request the visitor never asked for.
 */
export function ModeSwitch({ q }: { q: SearchQuery }) {
  const current = effectiveMode(q);
  const options = [
    { mode: "picks" as const, label: RESULTS.mode.picks },
    { mode: "hotels" as const, label: RESULTS.mode.hotels },
    { mode: "cruises" as const, label: RESULTS.mode.cruises },
  ];

  return (
    <Box
      component="nav"
      aria-label={RESULTS.mode.label}
      sx={{ display: "flex", width: "fit-content", gap: 0.25, p: 0.25, borderRadius: 1, bgcolor: "surface.2" }}
    >
      {options.map((option) => {
        const on = current === option.mode;
        return (
          <MuiButton
            key={option.mode}
            component={NextLink}
            href={resultsHref({ ...q, mode: option.mode })}
            aria-current={on ? "page" : undefined}
            // Only hotels are metered; a cruise read is our own catalog, so it may prefetch.
            prefetch={option.mode === "hotels" ? false : undefined}
            variant={on ? "contained" : "text"}
            color="primary"
            size="small"
            disableElevation
            sx={{
              ...TAP_TARGET,
              height: 32,
              minHeight: 32,
              minWidth: 0,
              px: 1.75,
              whiteSpace: "nowrap",
              ...(!on && { color: "text.secondary" }),
            }}
          >
            {option.label}
          </MuiButton>
        );
      })}
    </Box>
  );
}
