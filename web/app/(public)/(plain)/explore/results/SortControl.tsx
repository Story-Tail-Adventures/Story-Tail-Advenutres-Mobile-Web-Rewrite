"use client";

import * as React from "react";
import Link from "next/link";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import FormControl from "@mui/material/FormControl";
import FormLabel from "@mui/material/FormLabel";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import NativeSelect from "@mui/material/NativeSelect";
import OutlinedInput from "@mui/material/OutlinedInput";
import { Icon } from "@/components/ui/Icon";
import { TAP_TARGET } from "@/lib/mui/sx";
import {
  effectiveMode,
  resultsHref,
  SORT_LABELS,
  sortKeysFor,
  type ResultsMode,
  type SearchQuery,
  type SortKey,
} from "@/lib/public/search";
import { RESULTS } from "./content";

/**
 * "use client" because SortMenu holds the Menu's anchor state. SortControl rides along: it is
 * a leaf with string props, so FilterRail (a Server Component) renders it unchanged. Nothing
 * but components is exported from here, which is what keeps that safe — a string exported
 * from a client module reaches a Server Component as a client reference, not a string.
 */

/**
 * Labelled sort `<select>` inside the filter form (FilterRail / FilterSheet). MUI's
 * NativeSelect, not its Select: the control stays a real `<select name="sort">`, so the GET
 * form submits it with no JavaScript involved and the page test can find it by name.
 */
export function SortControl({ id, value, mode }: { id: string; value: SortKey; mode: ResultsMode }) {
  // The provider has no "price high to low", so hotels mode does not offer one rather than
  // faking it over a single page of results. Cruises offer none at all — see SortMenu.
  const keys = sortKeysFor(mode);
  if (keys.length === 0) return null;
  return (
    <FormControl fullWidth sx={{ mt: 0.5, mb: 1.75 }}>
      <FormLabel htmlFor={id} sx={{ mb: 0.25, typography: "subtitle1", color: "text.primary" }}>
        {RESULTS.sort.label}
      </FormLabel>
      <NativeSelect id={id} name="sort" defaultValue={value} input={<OutlinedInput size="small" />}>
        {keys.map((key) => (
          <option key={key} value={key}>
            {SORT_LABELS[key]}
          </option>
        ))}
      </NativeSelect>
    </FormControl>
  );
}

/**
 * The "Sort · Best fit ▾" chip in the results header (design C204), as an MUI Menu of links:
 * each option is the current search with `sort` changed, so the second click goes straight to
 * Next's router. It replaced a native `<details>` (MUI everywhere, 2026-10-01). What the Menu
 * brings that the `<details>` did not: Escape, click-away, arrow keys between the options,
 * focus back on the chip when it closes, and a portal so the list is never clipped. What it
 * gives up is opening with JavaScript off, which was accepted in that ruling.
 */
export function SortMenu({ q }: { q: SearchQuery }) {
  const mode = effectiveMode(q);
  const keys = sortKeysFor(mode);
  // A sort the mode cannot honour still shows as "Best fit" and keeps its URL value, so
  // switching back to the curated catalog restores it.
  const shown = keys.includes(q.sort) ? q.sort : "best-fit";

  const [anchorEl, setAnchorEl] = React.useState<HTMLElement | null>(null);
  const buttonId = React.useId();
  const menuId = React.useId();
  const open = anchorEl !== null;
  const close = () => setAnchorEl(null);

  // Cruises come back in departure order and carry no public fare, so every key would be a
  // no-op. Rendering nothing is more honest than a menu that does not move anything.
  if (keys.length === 0) return null;

  return (
    <>
      <Chip
        id={buttonId}
        component="button"
        clickable
        variant="outlined"
        aria-haspopup="menu"
        aria-controls={open ? menuId : undefined}
        aria-expanded={open ? "true" : undefined}
        onClick={(event: React.MouseEvent<HTMLElement>) => setAnchorEl(event.currentTarget)}
        label={
          <Box component="span" sx={{ display: "inline-flex", alignItems: "center", gap: 0.75 }}>
            {RESULTS.sort.chip(SORT_LABELS[shown])}
            <Box
              component="span"
              sx={{ display: "inline-flex", transition: "rotate 200ms ease", rotate: open ? "180deg" : "0deg" }}
            >
              <Icon name="chevron_down" size={12} />
            </Box>
          </Box>
        }
        sx={{ ...TAP_TARGET, flexShrink: 0 }}
      />

      <Menu
        id={menuId}
        anchorEl={anchorEl}
        open={open}
        onClose={close}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        slotProps={{
          list: { "aria-labelledby": buttonId, dense: true },
          // The old list sat 4px under the chip and was at least 180px wide (`mt-1 min-w-45`).
          paper: { sx: { mt: 0.5, minWidth: 180 } },
        }}
      >
        {keys.map((key) => {
          const current = key === shown;
          return (
            <MenuItem
              key={key}
              component={Link}
              href={resultsHref({ ...q, sort: key })}
              prefetch={mode === "hotels" ? false : undefined}
              selected={current}
              aria-current={current ? "true" : undefined}
              onClick={close}
            >
              {SORT_LABELS[key]}
            </MenuItem>
          );
        })}
      </Menu>
    </>
  );
}
