/**
 * Shared constants for the 2.0.4 results files.
 *
 * PURE DATA: no React, no MUI. Both the Server Components on this route and its two client
 * islands import from here, so nothing in this file may be a function or a client module.
 */
import { MD_TO_WEB, UP_WEB } from "@/lib/mui/sx";

/**
 * THE SHEET'S ANCHOR LIVES HERE, NOT IN FilterSheet.tsx.
 *
 * FilterSheet.tsx is "use client". A string imported from a client module into a Server
 * Component is not a string any more — every export of a client module becomes a client
 * reference — and `#${ref}` rendered as `href="#function() {…"` in the sticky bar (seen in the
 * dev server's SSR HTML on 2026-10-02). So the sticky "Filter" link never matched the
 * `a[href="#filters"]` listener that opens the sheet, and without JavaScript it scrolled
 * nowhere. Vitest never saw it: it renders in-process, with no RSC boundary.
 *
 * FilterSheet re-exports this for client-side callers; page.tsx imports it from here.
 */
export const FILTER_SHEET_ANCHOR = "filters";

/** Tablet only — the old Tailwind `md:max-web:` prefix. */

/**
 * The results list: one column below md, a 2-up grid on tablet, rows again at web. Shared by
 * the three result lists and both skeletons so the fallback has the same shape as what
 * replaces it.
 */
export const RESULT_LIST_SX = {
  listStyle: "none",
  m: 0,
  p: 0,
  display: "flex",
  flexDirection: "column",
  gap: 1.25,
  [MD_TO_WEB]: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.75 },
} as const;

/**
 * The page column: full width with the public gutter, narrowed to 32px sides at web.
 *
 * This replaces `.pub-container web:px-8` in sx entirely rather than keeping the class as a
 * hook: `.pub-container` lives in `@layer components`, which beats MUI's layer, so an sx
 * padding could never override its 48px gutter at web — the layout would have changed.
 */
export const RESULTS_COLUMN_SX = {
  width: "100%",
  mx: "auto",
  px: "var(--gutter)",
  [UP_WEB]: { px: 4 },
} as const;

/** The web filter rail's frame: 220px, a right rule, 16px inside. Hidden below web by the caller. */
export const RAIL_FRAME_SX = {
  width: 220,
  flexShrink: 0,
  borderRight: 1,
  borderColor: "divider",
  pr: 2,
} as const;

/** Tailwind's `sr-only`, as sx: visually hidden, still read by assistive technology. */
export const VISUALLY_HIDDEN_SX = {
  position: "absolute",
  width: "1px",
  height: "1px",
  p: 0,
  m: "-1px",
  overflow: "hidden",
  clip: "rect(0, 0, 0, 0)",
  whiteSpace: "nowrap",
  border: 0,
} as const;
