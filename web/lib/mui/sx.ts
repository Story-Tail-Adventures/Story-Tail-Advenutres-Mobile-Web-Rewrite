/**
 * Serializable sx helpers, safe to use from Server Components.
 *
 * NO REACT, NO MUI, NO FUNCTIONS IN THE EXPORTED VALUES. A Server Component may pass plain
 * objects and strings to an MUI component, never a function — so anything that needs "the
 * dark scheme" or "below the web breakpoint" lives here as a string, not as an sx callback.
 */
import { BREAKPOINTS } from "./tokens";

/**
 * Nested selector for the dark scheme. Use inside an sx object:
 * `sx={{ color: "text.primary", [DARK]: { color: "secondary.main" } }}`.
 * Prefer palette paths, which already switch with the scheme; this is for the rare value
 * that is not a palette color (an image, a gradient).
 */
export const DARK = ".scheme-dark &";

/** Nested selector for the light scheme, which is "no .scheme-dark on <html>". */
export const LIGHT = "html:not(.scheme-dark) &";

/**
 * Hide in the dark scheme / hide in the light scheme. CSS only, so there is no flash and no
 * hydration diff. Neither one sets a display value of its own, so the element keeps
 * whatever display it already has (flex, inline-flex) in the scheme where it shows.
 */
export const lightOnly = { [DARK]: { display: "none" } } as const;
export const darkOnly = { [LIGHT]: { display: "none" } } as const;

type Bp = keyof typeof BREAKPOINTS;

/** `@media (min-width:1200px)` — the Tailwind `web:` prefix. Same as sx breakpoint keys, as a string. */
export function up(bp: Bp): string {
  return `@media (min-width:${BREAKPOINTS[bp]}px)`;
}

/** `@media (max-width:1199.95px)` — the Tailwind `max-web:` prefix. */
export function down(bp: Bp): string {
  return `@media (max-width:${BREAKPOINTS[bp] - 0.05}px)`;
}

export const UP_MD = up("md");
export const UP_LG = up("lg");
export const UP_WEB = up("web");
export const DOWN_MD = down("md");
export const DOWN_WEB = down("web");

/** Tablet only, 768–1199px: Tailwind's `md:max-web:`. */
export const MD_TO_WEB = `@media (min-width:${BREAKPOINTS.md}px) and (max-width:${BREAKPOINTS.web - 0.05}px)`;

/**
 * The legacy `.tap-44`: on a touch screen, grow the TAP AREA to at least 44px without
 * growing the visible control. An invisible ::after extends 8px past every edge, so a 28–36px
 * button stays that size on screen and still meets the 44px touch minimum (Screen Inventory
 * §4.2). Use this, not `minHeight: 44`, wherever the old markup had `tap-44`: a min-height
 * changes the layout, which the migration must not do.
 *
 * It sets `position: relative` on touch screens (the ::after needs a containing block), so
 * do not spread it onto an element that is itself absolutely positioned: wrap that element
 * in a positioned Box and put TAP_TARGET on the child instead.
 */
export const TAP_TARGET = {
  "@media (pointer: coarse)": {
    position: "relative",
    "&::after": { content: '""', position: "absolute", inset: "-8px" },
  },
} as const;

/**
 * Off-screen but read aloud: MUI's `visuallyHidden`, as a plain object a Server Component can
 * pass. Use this rather than writing your own.
 *
 * Note the "1px" STRINGS. In sx, a bare number from 0 to 1 for width/height is a FRACTION, so
 * `width: 1` means 100%. Several hand-written copies said `width: 1, height: 1`, which made
 * every "hidden" checkbox as wide as its container and pushed the trips roster 229px past a
 * phone's edge. test/visually-hidden.test.ts fails if a local copy appears again.
 */
export const VISUALLY_HIDDEN = {
  position: "absolute",
  width: "1px",
  height: "1px",
  p: 0,
  m: "-1px",
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
  border: 0,
} as const;

/**
 * The search cells' shared paint: the 2.0.3 pill and card (explore/SearchBar), the 2.0.4
 * header (explore/results/SearchUpdateBar) and the topic pages' InquiryBar. One copy, so a fix
 * to one search cell reaches all of them.
 */

/** The brand-orange glyph beside a value, as every search cell draws it. */
export const SEARCH_GLYPH = { display: "inline-flex", flexShrink: 0, color: "brand.main" } as const;

/**
 * A search cell's hint at full-opacity `text.secondary`. MUI's default is `currentColor` at
 * 42%, under 4.5:1, and these hints carry the artboards' example values, so they have to be
 * readable. Spread into an InputBase's sx.
 */
export const SEARCH_PLACEHOLDER = {
  "& .MuiInputBase-input::placeholder": { color: "text.secondary", opacity: 1 },
} as const;

/** A borderless pill input in the cell's own type, so the pill reads as text until you type. */
export const SEARCH_PILL_INPUT = {
  typography: "subtitle2",
  lineHeight: 1.2,
  "& .MuiInputBase-input": { height: "auto", py: "2px" },
  ...SEARCH_PLACEHOLDER,
} as const;
