/**
 * Story-Tail design tokens as plain data, for the MUI theme (lib/mui/theme.ts).
 *
 * NO REACT, NO MUI, NO CSS IN THIS FILE. It is imported by the theme, by tests, and may be
 * imported by Node-side scripts. Keep it pure data.
 *
 * Every value is copied 1:1 from web/styles/tokens.css (the --md-* roles, :root and
 * .scheme-dark) and from the .chip-status rules in web/styles/components.css. Those CSS
 * files are themselves a mirror of design/web-tokens/tokens.css. lib/mui/tokens.test.ts
 * parses all three and fails on any drift, so change the CSS source first, then here.
 *
 * Shadows and radii are deliberately absent: web follows MUI's default shape and elevation
 * (docs/Design-System.md §6–7, decided 2026-09-30).
 */

/** Brand source colors. Scheme-independent: they exist only on :root in tokens.css. */
export const BRAND = {
  burgundy: "#7A1A1F",
  burgundyDark: "#5C0F13",
  orange: "#E87722",
  orangeLight: "#F59E4E",
  sunset: "#F5A623",
  gold: "#FFC83F",
  ocean: "#1565C0",
  navy: "#0D2137",
  cream: "#FBF6EE",
  sand: "#F1E7D5",
} as const;

/** One scheme's --md-* roles, camel-cased (`--md-on-primary-container` → onPrimaryContainer). */
export interface SchemeTokens {
  primary: string;
  onPrimary: string;
  primaryContainer: string;
  onPrimaryContainer: string;
  secondary: string;
  onSecondary: string;
  secondaryContainer: string;
  onSecondaryContainer: string;
  tertiary: string;
  onTertiary: string;
  tertiaryContainer: string;
  onTertiaryContainer: string;
  error: string;
  onError: string;
  errorContainer: string;
  onErrorContainer: string;
  success: string;
  successContainer: string;
  warning: string;
  warningContainer: string;
  bg: string;
  onBg: string;
  surface: string;
  onSurface: string;
  surfaceDim: string;
  surfaceBright: string;
  surface1: string;
  surface2: string;
  surface3: string;
  surface4: string;
  surface5: string;
  onSurfaceVariant: string;
  outline: string;
  outlineVariant: string;
  scrim: string;
}

export type SchemeName = "light" | "dark";

export const SCHEME: Record<SchemeName, SchemeTokens> = {
  light: {
    primary: "#7A1A1F", onPrimary: "#FFFFFF", primaryContainer: "#FFDAD5", onPrimaryContainer: "#410005",
    secondary: "#C75A14", onSecondary: "#FFFFFF", secondaryContainer: "#FFDCC1", onSecondaryContainer: "#321200",
    tertiary: "#1565C0", onTertiary: "#FFFFFF", tertiaryContainer: "#D5E3FF", onTertiaryContainer: "#001A41",
    error: "#BA1A1A", onError: "#FFFFFF", errorContainer: "#FFDAD6", onErrorContainer: "#410002",
    success: "#1B6E3F", successContainer: "#B6F2C8",
    warning: "#B7691C", warningContainer: "#FFDDB4",
    bg: "#FBF6EE", onBg: "#1C1B1A",
    surface: "#FBF8F3", onSurface: "#1C1B1A", surfaceDim: "#E1DCD3", surfaceBright: "#FFFEFA",
    surface1: "#FFFFFF", surface2: "#F6F1EA", surface3: "#F0EAE2", surface4: "#EAE4DB", surface5: "#E4DDD4",
    onSurfaceVariant: "#524540", outline: "#847370", outlineVariant: "#D7C2BD", scrim: "rgba(0,0,0,0.4)",
  },
  dark: {
    primary: "#5BB6FF", onPrimary: "#00264D", primaryContainer: "#003E78", onPrimaryContainer: "#C5E0FF",
    secondary: "#FFC83F", onSecondary: "#4A2C00", secondaryContainer: "#6F4400", onSecondaryContainer: "#FFE3B5",
    tertiary: "#6CD279", onTertiary: "#003915", tertiaryContainer: "#105228", onTertiaryContainer: "#B6F2C8",
    error: "#FFB4AB", onError: "#690005", errorContainer: "#93000A", onErrorContainer: "#FFDAD6",
    success: "#8DDCA4", successContainer: "#00522A",
    warning: "#FFD09C", warningContainer: "#6D4400",
    bg: "#050D1A", onBg: "#E8F0FC",
    surface: "#07111F", onSurface: "#E8F0FC", surfaceDim: "#07111F", surfaceBright: "#2A3D55",
    surface1: "#0A1828", surface2: "#0F2034", surface3: "#142A41", surface4: "#1A314D", surface5: "#21395A",
    onSurfaceVariant: "#C3D3E6", outline: "#6A8AAE", outlineVariant: "#2A4566", scrim: "rgba(0,0,0,0.65)",
  },
};

/** Trip-status chip colors, Design-System §4.3 (plus `cancelled`, see components.css). */
export const STATUS_KINDS = [
  "proposal",
  "booked",
  "due",
  "traveling",
  "past",
  "lead",
  "inquiry",
  "cancelled",
] as const;
export type StatusKind = (typeof STATUS_KINDS)[number];
export interface StatusColors {
  bg: string;
  fg: string;
}

export const STATUS: Record<SchemeName, Record<StatusKind, StatusColors>> = {
  light: {
    proposal: { bg: "#FFE3B7", fg: "#6B3F00" },
    booked: { bg: "#C7E9D4", fg: "#0A4A26" },
    due: { bg: "#FCD3D0", fg: "#6E1313" },
    traveling: { bg: "#C9DDF8", fg: "#0A3669" },
    past: { bg: "#E2DBD2", fg: "#4A3F38" },
    lead: { bg: "#F4D9F6", fg: "#4E124E" },
    inquiry: { bg: "#E1D7F4", fg: "#2C1761" },
    cancelled: { bg: "#D7DFE6", fg: "#3D352E" },
  },
  dark: {
    proposal: { bg: "#6B4400", fg: "#FFE3B7" },
    booked: { bg: "#0D5A2F", fg: "#C7E9D4" },
    due: { bg: "#6E1313", fg: "#FCD3D0" },
    traveling: { bg: "#0E4A85", fg: "#C9DDF8" },
    past: { bg: "#1F3450", fg: "#C3D3E6" },
    lead: { bg: "#4E124E", fg: "#F4D9F6" },
    inquiry: { bg: "#2A1559", fg: "#E1D7F4" },
    cancelled: { bg: "#2A3340", fg: "#C9D2DC" },
  },
};

/**
 * Font stacks. The first entry of each is the next/font CSS variable declared on <html> by
 * app/fonts.ts. Keep those classes on <html>: MUI declares its --mui-font-* vars on :root,
 * and a var() inside a custom property resolves where it is declared.
 */
export const FONT = {
  sans: 'var(--font-poppins), system-ui, -apple-system, "Segoe UI", sans-serif',
  script: "var(--font-caveat), var(--font-poppins), cursive",
  mono: "var(--font-jetbrains-mono), ui-monospace, monospace",
} as const;

/**
 * Breakpoints, matching what web/ used under Tailwind: sm 640, md 768 (tablet,
 * Screen Inventory §4.1), lg 1024 (the auth split pane), web 1200 (the web layout,
 * §4.1), xl 1280. MUI's defaults (600/900/1200/1536) do not match and are replaced.
 */
export const BREAKPOINTS = {
  xs: 0,
  sm: 640,
  md: 768,
  lg: 1024,
  web: 1200,
  xl: 1280,
} as const;

/** "#7A1A1F" → "122 26 31", the space-separated channel form MUI's alpha() reads. */
export function hexToChannel(hex: string): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new Error(`hexToChannel: expected #RRGGBB, got ${hex}`);
  const n = parseInt(m[1], 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
}
