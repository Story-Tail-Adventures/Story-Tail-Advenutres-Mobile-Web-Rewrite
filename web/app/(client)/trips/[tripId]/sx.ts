/**
 * Serializable sx constants shared by the §2.2.3–2.2.11 trip-detail screens.
 *
 * Pure data, like lib/mui/sx.ts: no React, no MUI, no functions. Every page in this folder
 * is a Server Component and hands these to MUI as plain objects.
 *
 * TYPE is stock MUI, as across the rest of the client app (PR 5 ruling): the legacy ramp
 * maps `.t-headline` → h5/700, `.t-title-s` → subtitle1/600, `.t-body` → body2, `.t-body-s`
 * → body2 for a paragraph and caption for a meta line, `.t-label` / `.t-label-s` →
 * overline. The two hero titles are the exception: they sit in fixed-height photo bands
 * laid out around their size, so they keep an explicit one.
 *
 * The BUTTON constants are the legacy `.btn` boxes (40px, 24px sides; `.btn-sm` 32px, 16px
 * sides) on MUI's Button, the same mapping components/ui/Button uses — written out here
 * because a link styled as a button is `<MuiButton component={NextLink}>`, which the
 * primitive does not take.
 */

/** 2.2.3's hero title (`.t-display-s`), kept at 36px for the 220px band it sits in. On h3. */
export const HERO_TITLE = {
  fontWeight: 700,
  fontSize: 36,
  lineHeight: 1.1,
  letterSpacing: "-0.6px",
} as const;

/** 2.2.11's hero title (`.t-headline`), kept at 28px for its 230px band. On h5. */
export const BAND_TITLE = {
  fontWeight: 700,
  fontSize: 28,
  lineHeight: 1.15,
  letterSpacing: "-0.4px",
} as const;

/** `.t-headline` on `variant="h5"`: stock size, bold. */
export const HEADLINE = { fontWeight: 700 } as const;

/** `.t-title-s` on `variant="subtitle1"`: stock size, semibold — the artboards' subtitle1 600. */
export const TITLE_S = { fontWeight: 600 } as const;

/**
 * `.t-label` / `.t-label-s` on `variant="overline"`. MUI's 2.66 line-height suits a lone
 * overline; over a value or under a heading it is 1.3, as the design kit draws it.
 */
export const OVERLINE = { display: "block", lineHeight: 1.3 } as const;

/** The legacy `.btn` box on MUI's Button: 40px tall, 24px sides, 8px gap for an inline icon. */
export const BTN = { minHeight: 40, px: "24px", gap: 1, whiteSpace: "nowrap" } as const;

/** `.btn.btn-sm`: 32px tall, 16px sides. */
export const BTN_SM = { minHeight: 32, px: "16px", gap: 1, whiteSpace: "nowrap" } as const;

/** The back link every sub-screen opens with: a body2 secondary-text row with an arrow glyph. */
export const BACK_LINK = {
  typography: "body2",
  display: "inline-flex",
  alignItems: "center",
  gap: 0.5,
  color: "text.secondary",
} as const;

/** The header band under the top bar: a rule, the surface colour, 16px (24px from md) sides. */
export const HEADER_BAND = {
  borderBottom: 1,
  borderColor: "divider",
  bgcolor: "surface.main",
  px: { xs: 2, md: 3 },
  py: 2,
} as const;

/** `mx-auto w-full max-w-3xl` — the reading column §4.4 Pattern I caps at ~720pt. */
export const PROSE_COL = { mx: "auto", width: "100%", maxWidth: 768 } as const;

/** `p-4 md:p-6`. */
export const PAD = { p: { xs: 2, md: 3 } } as const;

/** Legacy `.card`'s 16px inner padding on CardContent, with MUI's last-child rule cancelled. */
export const CARD_PAD = { p: 2, "&:last-child": { pb: 2 } } as const;

/** The 14px padding the rail cards used (`p-3.5`). */
export const CARD_PAD_SM = { p: 1.75, "&:last-child": { pb: 1.75 } } as const;

/**
 * The hero scrim: brand navy at 34% fading to clear by a third of the way down, then to navy
 * at 78% at the bottom, so white copy reads over any photograph. It was an inline style on
 * `var(--brand-navy)`; the same colour is the theme's own `brandSource.navy` variable, and it
 * is scheme-independent on purpose — white on a photo stays white in both schemes.
 */
export const HERO_SCRIM = {
  position: "absolute",
  inset: 0,
  background:
    "linear-gradient(180deg, color-mix(in srgb, var(--mui-palette-brandSource-navy) 34%, transparent) 0%, transparent 32%, color-mix(in srgb, var(--mui-palette-brandSource-navy) 78%, transparent) 100%)",
} as const;

/** The 36px rounded icon tile the artboard draws in front of a row (C22_MuiIconTile). */
export const ICON_TILE = {
  width: 36,
  height: 36,
  borderRadius: 1,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
} as const;
