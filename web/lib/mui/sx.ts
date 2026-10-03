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
