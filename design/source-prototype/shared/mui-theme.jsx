/* global React, MUI */
// Story-Tail Adventures — MUI v9 theme for the design prototype.
//
// Direction (Gyasi, 2026-09-30): "lean into stock MUI". The brand keeps its
// COLORS (both schemes, from styles/tokens.css) and its FONTS (Poppins /
// Caveat / JetBrains Mono). Everything else is MUI's default: shape (4px),
// spacing (8px), elevation, and the stock typography ramp.
//
// Two separate themes (light, dark) rather than one theme with colorSchemes,
// so any artboard can pin its own scheme (StaMuiScheme's `scheme` prop) and
// a page can show light and dark side by side. The dark scheme is a full tropical rebrand
// (ocean-blue primary, sunset-gold secondary, deep-navy surfaces), not an
// inversion of light.
//
// Classic script (no import/export). Wrapped in an IIFE so nothing here
// collides with other files' top-level names. Publishes:
//   window.StaMuiThemes = { light, dark }
//   window.StaMuiScheme  — drop-in for the page's legacy <Scheme> wrapper
//   window.StaMuiTokens  — the raw token tables, for anything that needs hex
(() => {
  const { createTheme, ThemeProvider, ScopedCssBaseline } = window.MUI;

  // ─── Fonts (Design-System §5) ───────────────────────────────────────────
  const FONT_SANS = '"Poppins", system-ui, -apple-system, "Segoe UI", sans-serif';
  const FONT_SCRIPT = '"Caveat", "Poppins", cursive';
  const FONT_MONO = '"JetBrains Mono", ui-monospace, monospace';

  // ─── Brand source colors (tokens.css :root, Design-System §3) ───────────
  const BRAND = {
    burgundy: '#7A1A1F',
    burgundyDark: '#5C0F13',
    orange: '#E87722',
    orangeLight: '#F59E4E',
    sunset: '#F5A623',
    gold: '#FFC83F',
    ocean: '#1565C0',
    navy: '#0D2137',
    cream: '#FBF6EE',
    sand: '#F1E7D5',
  };

  // ─── Scheme tokens, copied 1:1 from styles/tokens.css --md-* ────────────
  const TOKENS = {
    light: {
      primary: '#7A1A1F', onPrimary: '#FFFFFF', primaryContainer: '#FFDAD5', onPrimaryContainer: '#410005',
      secondary: '#C75A14', onSecondary: '#FFFFFF', secondaryContainer: '#FFDCC1', onSecondaryContainer: '#321200',
      tertiary: '#1565C0', onTertiary: '#FFFFFF', tertiaryContainer: '#D5E3FF', onTertiaryContainer: '#001A41',
      error: '#BA1A1A', onError: '#FFFFFF', errorContainer: '#FFDAD6', onErrorContainer: '#410002',
      success: '#1B6E3F', successContainer: '#B6F2C8',
      warning: '#B7691C', warningContainer: '#FFDDB4',
      bg: '#FBF6EE', onBg: '#1C1B1A',
      surface: '#FBF8F3', onSurface: '#1C1B1A', surfaceDim: '#E1DCD3', surfaceBright: '#FFFEFA',
      surface1: '#FFFFFF', surface2: '#F6F1EA', surface3: '#F0EAE2', surface4: '#EAE4DB', surface5: '#E4DDD4',
      onSurfaceVariant: '#524540', outline: '#847370', outlineVariant: '#D7C2BD', scrim: 'rgba(0,0,0,0.4)',
    },
    dark: {
      primary: '#5BB6FF', onPrimary: '#00264D', primaryContainer: '#003E78', onPrimaryContainer: '#C5E0FF',
      secondary: '#FFC83F', onSecondary: '#4A2C00', secondaryContainer: '#6F4400', onSecondaryContainer: '#FFE3B5',
      tertiary: '#6CD279', onTertiary: '#003915', tertiaryContainer: '#105228', onTertiaryContainer: '#B6F2C8',
      error: '#FFB4AB', onError: '#690005', errorContainer: '#93000A', onErrorContainer: '#FFDAD6',
      success: '#8DDCA4', successContainer: '#00522A',
      warning: '#FFD09C', warningContainer: '#6D4400',
      bg: '#050D1A', onBg: '#E8F0FC',
      surface: '#07111F', onSurface: '#E8F0FC', surfaceDim: '#07111F', surfaceBright: '#2A3D55',
      surface1: '#0A1828', surface2: '#0F2034', surface3: '#142A41', surface4: '#1A314D', surface5: '#21395A',
      onSurfaceVariant: '#C3D3E6', outline: '#6A8AAE', outlineVariant: '#2A4566', scrim: 'rgba(0,0,0,0.65)',
    },
  };

  // ─── Status chip colors (Design-System §4.3) ────────────────────────────
  const STATUS = {
    light: {
      proposal:  { bg: '#FFE3B7', fg: '#6B3F00' },
      booked:    { bg: '#C7E9D4', fg: '#0A4A26' },
      due:       { bg: '#FCD3D0', fg: '#6E1313' },
      traveling: { bg: '#C9DDF8', fg: '#0A3669' },
      past:      { bg: '#E2DBD2', fg: '#4A3F38' },
      lead:      { bg: '#F4D9F6', fg: '#4E124E' },
      inquiry:   { bg: '#E1D7F4', fg: '#2C1761' },
      cancelled: { bg: '#D7DFE6', fg: '#3D352E' },
    },
    dark: {
      proposal:  { bg: '#6B4400', fg: '#FFE3B7' },
      booked:    { bg: '#0D5A2F', fg: '#C7E9D4' },
      due:       { bg: '#6E1313', fg: '#FCD3D0' },
      traveling: { bg: '#0E4A85', fg: '#C9DDF8' },
      past:      { bg: '#1F3450', fg: '#C3D3E6' },
      lead:      { bg: '#4E124E', fg: '#F4D9F6' },
      inquiry:   { bg: '#2A1559', fg: '#E1D7F4' },
      cancelled: { bg: '#2A3340', fg: '#C9D2DC' },
    },
  };

  function buildTheme(mode) {
    const t = TOKENS[mode];
    // A throwaway theme gives us augmentColor() with the right mode, so the
    // custom palette keys (tertiary, brand) get light/dark/contrastText the
    // same way MUI computes them for primary & friends.
    const base = createTheme({ palette: { mode } });
    const aug = (name, color) => base.palette.augmentColor({ color, name });

    const palette = {
      mode,
      primary: {
        main: t.primary, contrastText: t.onPrimary,
        container: t.primaryContainer, onContainer: t.onPrimaryContainer,
      },
      secondary: {
        main: t.secondary, contrastText: t.onSecondary,
        container: t.secondaryContainer, onContainer: t.onSecondaryContainer,
      },
      tertiary: {
        ...aug('tertiary', { main: t.tertiary, contrastText: t.onTertiary }),
        container: t.tertiaryContainer, onContainer: t.onTertiaryContainer,
      },
      // The brand orange is scheme-independent in tokens.css (:root only), so
      // it is the same in both themes. White text matches the legacy
      // .btn-orange exactly.
      brand: aug('brand', { main: BRAND.orange, contrastText: '#FFFFFF' }),
      error: {
        main: t.error, contrastText: t.onError,
        container: t.errorContainer, onContainer: t.onErrorContainer,
      },
      warning: { main: t.warning, container: t.warningContainer },
      // tokens.css has no "info" role. Light reuses the ocean blue (same as
      // tertiary); dark uses the mid-ocean so it stays distinct from primary.
      info: { main: mode === 'light' ? BRAND.ocean : '#1E92E5' },
      success: { main: t.success, container: t.successContainer },
      background: { default: t.bg, paper: t.surface1 },
      text: { primary: t.onSurface, secondary: t.onSurfaceVariant },
      divider: t.outlineVariant,
      // Extra keys the conversion needs. Reachable from sx as
      // 'surface.2', 'surface.main', 'outline.main', 'status.booked.bg' …
      surface: {
        main: t.surface, dim: t.surfaceDim, bright: t.surfaceBright,
        1: t.surface1, 2: t.surface2, 3: t.surface3, 4: t.surface4, 5: t.surface5,
        on: t.onSurface, onVariant: t.onSurfaceVariant,
      },
      outline: { main: t.outline, variant: t.outlineVariant },
      scrim: t.scrim,
      status: STATUS[mode],
      brandSource: BRAND,
    };

    return createTheme({
      palette,
      typography: {
        fontFamily: FONT_SANS,
        // All-caps buttons fight the warm, friend-who's-done-this voice
        // (Design-System §2). This is the one deliberate typographic override.
        button: { textTransform: 'none' },
        // Custom variant for the "Story-Tail" wordmark and script accents.
        script: { fontFamily: FONT_SCRIPT, fontWeight: 700, fontSize: 32, lineHeight: 1 },
        // Not a variant: a font-family string for confirmation numbers / kbd.
        // Use as sx={{ fontFamily: (theme) => theme.typography.mono }}.
        mono: FONT_MONO,
      },
      components: {
        MuiTypography: {
          defaultProps: { variantMapping: { script: 'span' } },
        },
      },
    });
  }

  const StaMuiThemes = { light: buildTheme('light'), dark: buildTheme('dark') };

  // Follows the page's theme toggle the same way the legacy <Scheme> does.
  function usePageTheme() {
    const [theme, setTheme] = React.useState(window.__stTheme || 'light');
    React.useEffect(() => {
      const h = (e) => setTheme(e.detail);
      window.addEventListener('st-theme-change', h);
      return () => window.removeEventListener('st-theme-change', h);
    }, []);
    return theme;
  }

  // Drop-in for the page's legacy Scheme({ scheme, children, bg }).
  // Keeps the `scheme-dark` class so legacy CSS-variable content inside
  // (brand-mark gradients, chip-status, .tropical-gradient…) still themes.
  function StaMuiScheme({ scheme, children, bg }) {
    const themed = usePageTheme();
    const mode = scheme || themed;
    const theme = StaMuiThemes[mode] || StaMuiThemes.light;
    return (
      <ThemeProvider theme={theme}>
        <ScopedCssBaseline
          className={mode === 'dark' ? 'scheme-dark' : ''}
          sx={{ width: '100%', height: '100%', overflow: 'hidden', bgcolor: bg || 'background.default', color: 'text.primary' }}
        >
          {children}
        </ScopedCssBaseline>
      </ThemeProvider>
    );
  }

  Object.assign(window, {
    StaMuiThemes,
    StaMuiScheme,
    StaMuiTokens: { BRAND, TOKENS, STATUS, FONT_SANS, FONT_SCRIPT, FONT_MONO },
  });
})();
