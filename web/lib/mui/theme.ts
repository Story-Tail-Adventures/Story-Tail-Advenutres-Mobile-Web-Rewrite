"use client";

/**
 * The Story-Tail MUI theme. A port of design/source-prototype/shared/mui-theme.jsx.
 *
 * Direction (Gyasi, 2026-09-30): "lean into stock MUI". The brand keeps its COLORS (both
 * schemes, from lib/mui/tokens.ts) and its FONTS (Poppins / Caveat / JetBrains Mono).
 * Everything else is MUI's default: shape (4px), spacing (8px), elevation, and the stock
 * typography ramp. The one typographic override is sentence-case buttons.
 *
 * ONE THEME, TWO COLOR SCHEMES. The prototype builds two separate themes so an artboard page
 * can show light and dark side by side. The app has one <html> and one scheme at a time, so
 * here both palettes live in one theme as CSS variables: light lands on `:root`, dark on
 * `.scheme-dark`, which is the class components/ThemeScript.tsx sets before first paint and
 * lib/theme.ts flips at runtime. MUI never touches that class (see MuiRegistry.tsx), so the
 * server HTML is identical in both schemes and nothing here may branch on `palette.mode`.
 *
 * `disableCssColorScheme` because app/globals.css already sets `color-scheme` from the same
 * class; two authors for one property is how a scrollbar ends up the wrong colour.
 *
 * "use client" because createTheme() builds functions (augmentColor, alpha, …) that cannot
 * cross the RSC boundary. Server Components never import this file; they pass palette PATHS
 * ("surface.2") in plain sx objects and the client-side ThemeProvider resolves them.
 * lib/mui/theme.test.ts pins the selector contract and every token → path mapping.
 */
import { createTheme, type PaletteOptions, type ThemeOptions } from "@mui/material/styles";
import { BRAND, BREAKPOINTS, FONT, SCHEME, STATUS, type SchemeName } from "./tokens";

/**
 * Two values the prototype sets that are NOT tokens. Neither has a --md-* or --brand-* role
 * in tokens.css, and lib/mui/tokens.ts may only hold what that CSS holds (its drift test
 * parses the CSS), so they live here:
 *
 *   - the brand (orange) button's text is white in both schemes, matching the legacy
 *     .btn-orange exactly;
 *   - tokens.css has no "info" role. Light reuses the brand ocean (the same hue as tertiary);
 *     dark uses a mid-ocean so it stays distinct from the ocean-blue dark primary.
 */
const BRAND_CONTRAST_TEXT = "#FFFFFF";
const INFO_DARK = "#1E92E5";

function buildPalette(mode: SchemeName): PaletteOptions {
  const t = SCHEME[mode];

  // A throwaway theme gives us augmentColor() with the right mode, so the custom palette
  // keys (tertiary, brand) get light/dark/contrastText the same way MUI computes them for
  // primary and friends. createPalette only augments the six built-in keys on its own.
  const base = createTheme({ palette: { mode } });
  const aug = (name: string, main: string, contrastText: string) =>
    base.palette.augmentColor({ color: { main, contrastText }, name });

  return {
    mode,
    primary: {
      main: t.primary,
      contrastText: t.onPrimary,
      container: t.primaryContainer,
      onContainer: t.onPrimaryContainer,
    },
    secondary: {
      main: t.secondary,
      contrastText: t.onSecondary,
      container: t.secondaryContainer,
      onContainer: t.onSecondaryContainer,
    },
    tertiary: {
      ...aug("tertiary", t.tertiary, t.onTertiary),
      container: t.tertiaryContainer,
      onContainer: t.onTertiaryContainer,
    },
    // The brand orange is scheme-independent in tokens.css (:root only), so it is the same
    // in both schemes.
    brand: aug("brand", BRAND.orange, BRAND_CONTRAST_TEXT),
    error: {
      main: t.error,
      contrastText: t.onError,
      container: t.errorContainer,
      onContainer: t.onErrorContainer,
    },
    warning: { main: t.warning, container: t.warningContainer },
    info: { main: mode === "light" ? BRAND.ocean : INFO_DARK },
    success: { main: t.success, container: t.successContainer },
    background: { default: t.bg, paper: t.surface1 },
    text: { primary: t.onSurface, secondary: t.onSurfaceVariant },
    divider: t.outlineVariant,
    // Extra keys the screens need. Reachable from sx as 'surface.2', 'surface.main',
    // 'outline.main', 'status.booked.bg' … (docs/Design-System.md §12.2). Only objects
    // with a `main` get a `mainChannel`, so alpha() works on tertiary/brand/surface but NOT
    // on surface.2 or status.*.bg — those are flat strings.
    surface: {
      main: t.surface,
      dim: t.surfaceDim,
      bright: t.surfaceBright,
      1: t.surface1,
      2: t.surface2,
      3: t.surface3,
      4: t.surface4,
      5: t.surface5,
      on: t.onSurface,
      onVariant: t.onSurfaceVariant,
    },
    outline: { main: t.outline, variant: t.outlineVariant },
    scrim: t.scrim,
    status: STATUS[mode],
    brandSource: BRAND,
  };
}

/**
 * The options, exported separately so test/render.tsx can build the same theme with motion
 * switched off. No top-level `palette` here on purpose: with colorSchemes, a top-level
 * palette merges into the LIGHT scheme only and the dark one silently keeps MUI's defaults.
 */
export const themeOptions: ThemeOptions = {
  cssVariables: {
    // `%s` is the scheme name, so dark becomes `.scheme-dark` — the class ThemeScript owns.
    colorSchemeSelector: ".scheme-%s",
    disableCssColorScheme: true,
  },
  colorSchemes: {
    light: { palette: buildPalette("light") },
    dark: { palette: buildPalette("dark") },
  },
  defaultColorScheme: "light",
  breakpoints: { values: BREAKPOINTS },
  typography: {
    fontFamily: FONT.sans,
    // All-caps buttons fight the warm, friend-who's-done-this voice (Design-System §2).
    button: { textTransform: "none" },
    // Custom variant for the "Story-Tail" wordmark and script accents.
    script: { fontFamily: FONT.script, fontWeight: 700, fontSize: 32, lineHeight: 1 },
    // Not a variant: a font-family string for confirmation numbers / kbd.
    // Use as sx={{ fontFamily: "mono" }}.
    mono: FONT.mono,
  },
  // The curated keyboard ring (2px primary outline, 2px offset) on every Mui-focusVisible.
  focusVisible: true,
  // Honour prefers-reduced-motion. test/render.tsx overrides this to "always".
  motion: { reducedMotion: "system" },
  components: {
    MuiTypography: {
      defaultProps: { variantMapping: { script: "span" } },
    },
  },
};

export const theme = createTheme(themeOptions);
