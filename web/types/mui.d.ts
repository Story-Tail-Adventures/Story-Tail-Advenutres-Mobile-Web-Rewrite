/**
 * Type augmentation for the Story-Tail MUI theme (lib/mui/theme.ts).
 *
 * Each key here mirrors a palette or typography key the theme actually sets, which in turn
 * mirrors design/source-prototype/shared/mui-theme.jsx. Add a key in all three places or
 * none. docs/Design-System.md §12.2 has the token → palette-path table.
 */
import type { CSSProperties } from "react";
import type { StatusColors, StatusKind } from "@/lib/mui/tokens";

interface StaSurface {
  main: string;
  dim: string;
  bright: string;
  1: string;
  2: string;
  3: string;
  4: string;
  5: string;
  on: string;
  onVariant: string;
}

interface StaOutline {
  main: string;
  variant: string;
}

interface StaBrandSource {
  burgundy: string;
  burgundyDark: string;
  orange: string;
  orangeLight: string;
  sunset: string;
  gold: string;
  ocean: string;
  navy: string;
  cream: string;
  sand: string;
}

declare module "@mui/material/styles" {
  // Material 3 container roles on the standard colors (tokens.css --md-*-container).
  interface PaletteColor {
    container?: string;
    onContainer?: string;
  }
  interface SimplePaletteColorOptions {
    container?: string;
    onContainer?: string;
  }

  interface Palette {
    tertiary: PaletteColor;
    brand: PaletteColor;
    surface: StaSurface;
    outline: StaOutline;
    status: Record<StatusKind, StatusColors>;
    scrim: string;
    brandSource: StaBrandSource;
  }
  interface PaletteOptions {
    tertiary?: SimplePaletteColorOptions;
    brand?: SimplePaletteColorOptions;
    surface?: StaSurface;
    outline?: StaOutline;
    status?: Record<StatusKind, StatusColors>;
    scrim?: string;
    brandSource?: StaBrandSource;
  }

  interface TypographyVariants {
    script: CSSProperties;
    /** A font-family string, not a variant. Use `sx={{ fontFamily: "mono" }}`. */
    mono: string;
  }
  interface TypographyVariantsOptions {
    script?: CSSProperties;
    mono?: string;
  }

  interface BreakpointOverrides {
    web: true;
  }

  // The theme always runs with cssVariables, so theme.vars exists and ThemeProvider
  // accepts colorSchemeNode / storageManager.
  interface CssThemeVariables {
    enabled: true;
  }
}

declare module "@mui/material/Typography" {
  interface TypographyPropsVariantOverrides {
    script: true;
  }
}

declare module "@mui/material/Button" {
  interface ButtonPropsColorOverrides {
    tertiary: true;
    brand: true;
  }
}
declare module "@mui/material/IconButton" {
  interface IconButtonPropsColorOverrides {
    tertiary: true;
    brand: true;
  }
}
declare module "@mui/material/Chip" {
  interface ChipPropsColorOverrides {
    tertiary: true;
    brand: true;
  }
}
declare module "@mui/material/Fab" {
  interface FabPropsColorOverrides {
    tertiary: true;
    brand: true;
  }
}
declare module "@mui/material/Badge" {
  interface BadgePropsColorOverrides {
    tertiary: true;
    brand: true;
  }
}
declare module "@mui/material/SvgIcon" {
  interface SvgIconPropsColorOverrides {
    tertiary: true;
    brand: true;
  }
}
