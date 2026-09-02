/**
 * Story-Tail Adventures — TypeScript design tokens for the web app.
 *
 * Mirrors the canonical token definitions in
 *   design/source-prototype/styles/tokens.css
 *
 * Any change here must propagate to that file and vice versa.
 * The mobile app's parallel tokens live in
 *   design/compose-theme/StoryTailColors.kt
 *   design/compose-theme/StoryTailTypography.kt
 *   design/compose-theme/StoryTailShape.kt
 *
 * Treat the three sources (CSS / Kotlin / TypeScript) as a single
 * source of truth that must stay in sync.
 */

// ─── Brand source colors ───────────────────────────────────────────
export const brand = {
  burgundy:     "#7A1A1F",
  burgundyDark: "#5C0F13",
  orange:       "#E87722",
  orangeLight:  "#F59E4E",
  sunset:       "#F5A623",  // Sunset Gold
  ocean:        "#1565C0",
  navy:         "#0D2137",
  cream:        "#FBF6EE",
  sand:         "#F1E7D5",
} as const;

// ─── Light scheme (default) ────────────────────────────────────────
export const lightColors = {
  primary:                "#7A1A1F",
  onPrimary:              "#FFFFFF",
  primaryContainer:       "#FFDAD5",
  onPrimaryContainer:     "#410005",

  secondary:              "#C75A14",
  onSecondary:            "#FFFFFF",
  secondaryContainer:     "#FFDCC1",
  onSecondaryContainer:   "#321200",

  tertiary:               "#1565C0",
  onTertiary:             "#FFFFFF",
  tertiaryContainer:      "#D5E3FF",
  onTertiaryContainer:    "#001A41",

  error:                  "#BA1A1A",
  onError:                "#FFFFFF",
  errorContainer:         "#FFDAD6",
  onErrorContainer:       "#410002",

  success:                "#1B6E3F",
  successContainer:       "#B6F2C8",

  warning:                "#B7691C",
  warningContainer:       "#FFDDB4",

  background:             "#FBF6EE",
  onBackground:           "#1C1B1A",

  surface:                "#FBF8F3",
  onSurface:              "#1C1B1A",
  surfaceDim:             "#E1DCD3",
  surfaceBright:          "#FFFEFA",

  surface1:               "#FFFFFF",   // containerLowest
  surface2:               "#F6F1EA",   // containerLow
  surface3:               "#F0EAE2",   // container
  surface4:               "#EAE4DB",   // containerHigh
  surface5:               "#E4DDD4",   // containerHighest

  onSurfaceVariant:       "#524540",
  outline:                "#847370",
  outlineVariant:         "#D7C2BD",
  scrim:                  "rgba(0,0,0,0.4)",
} as const;

// ─── Dark scheme (tropical logo) ───────────────────────────────────
export const darkColors = {
  primary:                "#5BB6FF",
  onPrimary:              "#00264D",
  primaryContainer:       "#003E78",
  onPrimaryContainer:     "#C5E0FF",

  secondary:              "#FFC83F",
  onSecondary:            "#4A2C00",
  secondaryContainer:     "#6F4400",
  onSecondaryContainer:   "#FFE3B5",

  tertiary:               "#6CD279",
  onTertiary:             "#003915",
  tertiaryContainer:      "#105228",
  onTertiaryContainer:    "#B6F2C8",

  error:                  "#FFB4AB",

  onError:               "#690005",
  errorContainer:         "#93000A",

  onErrorContainer:      "#FFDAD6",

  success:                "#8DDCA4",
  successContainer:       "#00522A",

  warning:                "#FFD09C",
  warningContainer:       "#6D4400",

  background:             "#050D1A",
  onBackground:           "#E8F0FC",

  surface:                "#07111F",
  onSurface:              "#E8F0FC",
  surfaceDim:             "#07111F",
  surfaceBright:          "#2A3D55",

  surface1:               "#0A1828",
  surface2:               "#0F2034",
  surface3:               "#142A41",
  surface4:               "#1A314D",
  surface5:               "#21395A",

  onSurfaceVariant:       "#C3D3E6",
  outline:                "#6A8AAE",
  outlineVariant:         "#2A4566",
  scrim:                  "rgba(0,0,0,0.65)",
} as const;

// ─── Status chip colors ────────────────────────────────────────────
// Each status gets a (background, foreground) pair per scheme.
// Use these — never hardcode trip-status colors elsewhere.
export const lightStatusColors = {
  proposal:  { bg: "#FFE3B7", fg: "#6B3F00" },
  booked:    { bg: "#C7E9D4", fg: "#0A4A26" },
  due:       { bg: "#FCD3D0", fg: "#6E1313" },
  traveling: { bg: "#C9DDF8", fg: "#0A3669" },
  past:      { bg: "#E2DBD2", fg: "#4A3F38" },
  lead:      { bg: "#F4D9F6", fg: "#4E124E" },
  inquiry:   { bg: "#E1D7F4", fg: "#2C1761" },
} as const;

export const darkStatusColors = {
  proposal:  { bg: "#6B4400", fg: "#FFE3B7" },
  booked:    { bg: "#0D5A2F", fg: "#C7E9D4" },
  due:       { bg: "#6E1313", fg: "#FCD3D0" },
  traveling: { bg: "#0E4A85", fg: "#C9DDF8" },
  past:      { bg: "#1F3450", fg: "#C3D3E6" },
  lead:      { bg: "#4E124E", fg: "#F4D9F6" },
  inquiry:   { bg: "#2A1559", fg: "#E1D7F4" },
} as const;

export type StatusName = keyof typeof lightStatusColors;

// ─── Typography ────────────────────────────────────────────────────
export const fonts = {
  sans:   "'Poppins', system-ui, -apple-system, 'Segoe UI', sans-serif",
  script: "'Caveat', 'Poppins', cursive",
  mono:   "'JetBrains Mono', ui-monospace, monospace",
} as const;

// Material-3-style ramp tuned for Poppins. Values are CSS strings,
// ready to drop into font: <weight> <size>/<line-height> declarations.
export const typeRamp = {
  displayL:  { family: fonts.sans, weight: 800, size: "57px", lineHeight: 1.05, letterSpacing: "-1.5px" },
  display:   { family: fonts.sans, weight: 800, size: "45px", lineHeight: 1.08, letterSpacing: "-1px" },
  displayS:  { family: fonts.sans, weight: 700, size: "36px", lineHeight: 1.10, letterSpacing: "-0.6px" },
  headline:  { family: fonts.sans, weight: 700, size: "28px", lineHeight: 1.15, letterSpacing: "-0.4px" },
  titleL:    { family: fonts.sans, weight: 600, size: "22px", lineHeight: 1.20, letterSpacing: "-0.2px" },
  title:     { family: fonts.sans, weight: 600, size: "18px", lineHeight: 1.25, letterSpacing: "-0.1px" },
  titleS:    { family: fonts.sans, weight: 600, size: "15px", lineHeight: 1.30, letterSpacing: "0" },
  bodyL:     { family: fonts.sans, weight: 400, size: "16px", lineHeight: 1.50, letterSpacing: "0" },
  body:      { family: fonts.sans, weight: 400, size: "14px", lineHeight: 1.50, letterSpacing: "0" },
  bodyS:     { family: fonts.sans, weight: 400, size: "13px", lineHeight: 1.45, letterSpacing: "0" },
  labelL:    { family: fonts.sans, weight: 500, size: "14px", lineHeight: 1.30, letterSpacing: "0" },
  label:     { family: fonts.sans, weight: 500, size: "12px", lineHeight: 1.30, letterSpacing: "0.4px" },
  labelS:    { family: fonts.sans, weight: 600, size: "11px", lineHeight: 1.30, letterSpacing: "0.6px", textTransform: "uppercase" as const },
  script:    { family: fonts.script, weight: 700, size: "32px", lineHeight: 1.00, letterSpacing: "0" },
  mono:      { family: fonts.mono, weight: 400, size: "12px", lineHeight: 1.40, letterSpacing: "0" },
} as const;

// ─── Shape / radius ────────────────────────────────────────────────
export const radii = {
  xs:   "6px",
  sm:   "10px",
  md:   "14px",
  lg:   "20px",
  xl:   "28px",
  full: "999px",
} as const;

// ─── Elevation / shadow ────────────────────────────────────────────
export const lightShadows = {
  level1: "0 1px 2px rgba(28,17,15,0.08), 0 1px 3px rgba(28,17,15,0.06)",
  level2: "0 2px 4px rgba(28,17,15,0.10), 0 4px 10px rgba(28,17,15,0.06)",
  level3: "0 4px 12px rgba(28,17,15,0.12), 0 10px 28px rgba(28,17,15,0.08)",
  level4: "0 8px 24px rgba(28,17,15,0.16), 0 18px 48px rgba(28,17,15,0.10)",
} as const;

export const darkShadows = {
  level1: "0 1px 2px rgba(0,0,0,0.55), 0 1px 3px rgba(0,0,0,0.35)",
  level2: "0 2px 4px rgba(0,0,0,0.60), 0 4px 12px rgba(0,0,0,0.40)",
  level3: "0 4px 14px rgba(0,0,0,0.70), 0 12px 32px rgba(0,0,0,0.50)",
  level4: "0 8px 28px rgba(0,0,0,0.75), 0 22px 54px rgba(0,0,0,0.55)",
} as const;

// ─── Tropical gradient stops ───────────────────────────────────────
export const tropicalGradient = {
  start: brand.sunset,
  mid:   brand.ocean,
  end:   brand.navy,
} as const;

// ─── Aggregate export for Tailwind / consumers ─────────────────────
export const tokens = {
  brand,
  colors: {
    light: lightColors,
    dark:  darkColors,
  },
  statusColors: {
    light: lightStatusColors,
    dark:  darkStatusColors,
  },
  fonts,
  typeRamp,
  radii,
  shadows: {
    light: lightShadows,
    dark:  darkShadows,
  },
  tropicalGradient,
} as const;

export type Tokens = typeof tokens;
