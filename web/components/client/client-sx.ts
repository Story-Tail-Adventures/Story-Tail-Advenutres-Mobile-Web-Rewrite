/**
 * Serializable sx shared by the §2.4 wallet and §2.6 messaging screens on MUI.
 *
 * NO REACT, NO MUI IMPORTS. Everything here is a plain object or a function returning one,
 * so a Server Component can spread it into `sx` and pass the result across the boundary.
 *
 * TYPE: stock MUI variants, the mapping every converted client screen uses (Gyasi's "lean
 * into stock MUI"): .t-headline → h5/700, .t-title-l → h5, .t-title-s → subtitle1/600,
 * .t-body and .t-body-s → body2, .t-label → caption/500. The constants only carry what the
 * variant does not. BUTTONS: the legacy `.btn` boxes on MUI's Button, written out because a
 * link styled as a button is
 * `<MuiButton component={NextLink}>`, which components/ui/Button does not take.
 */
import { TAP_TARGET } from "@/lib/mui/sx";

// ── Type ───────────────────────────────────────────────────────────────────────────────

/** `.t-headline` on `variant="h5"`. */
export const HEADLINE = { fontWeight: 700 } as const;

/** `.t-title-l` on `variant="h5"`: the variant is the whole style. */
export const TITLE_L = {} as const;

/** `.t-title-s` on `variant="subtitle1"`. */
export const TITLE_S = { fontWeight: 600 } as const;

/** `.t-body` on `variant="body2"`: the variant is the whole style. */
export const BODY = {} as const;

/** `.t-body-s` on `variant="body2"`: the variant is the whole style. */
export const BODY_S = {} as const;

/** `.t-label` on `variant="caption"`. */
export const LABEL = {
  display: "block",
  fontWeight: 500,
  lineHeight: 1.3,
  letterSpacing: "0.4px",
} as const;

// ── Buttons ────────────────────────────────────────────────────────────────────────────

/** The legacy `.btn.btn-sm` box on an MUI Button: 32px tall, 16px sides, 8px icon gap. */
export const BTN_SM = { minHeight: 32, px: "16px", gap: 1, whiteSpace: "nowrap" } as const;

/** The legacy `.btn.h-11`: the 44px box the wallet and messaging CTAs were given. */
export const BTN_44 = { minHeight: 44, px: "24px", gap: 1, whiteSpace: "nowrap" } as const;

/** `.btn.btn-text.btn-sm.tap-44.-ml-1.mb-1` — the back link above a page heading. */
export const BACK_LINK_SX = { ...BTN_SM, ...TAP_TARGET, ml: -0.5, mb: 0.5 } as const;

/** The legacy `.btn-icon.tap-44`: a 40px icon button with the 44px touch area. */
export const ICON_BTN_SX = { width: 40, height: 40, flexShrink: 0, ...TAP_TARGET } as const;

/** The legacy `.chip.tap-44.h-8` filter-strip chip. */
export const FILTER_CHIP_SX = { height: 32, flexShrink: 0, ...TAP_TARGET } as const;

// ── Layout ─────────────────────────────────────────────────────────────────────────────

/** Tailwind's `max-w-3xl` / `max-w-2xl`, in px. */
export const MAX_W_3XL = 768;
export const MAX_W_2XL = 672;

/** Legacy `.card`'s 16px inner padding on CardContent, with MUI's last-child rule cancelled. */
export const CARD_PAD = { p: 2, "&:last-child": { pb: 2 } } as const;

/**
 * A page column: `mx-auto w-full max-w-* px-4 py-5 md:px-6 md:py-7`. `mdPy` is the one
 * value that varies (2.4.4 uses `md:py-9`).
 */
export function pageSx(maxWidth: number, mdPy = 3.5) {
  return {
    mx: "auto",
    width: "100%",
    maxWidth,
    px: { xs: 2, md: 3 },
    py: { xs: 2.5, md: mdPy },
  } as const;
}

/**
 * The advisor's initials avatar — "GS" on the brand burgundy, in every §2.6 header and row.
 * `brandSource` rather than `primary` because the legacy `bg-brand-burgundy` is
 * scheme-invariant: it stays burgundy in the dark scheme, where primary goes ocean blue.
 */
export function advisorAvatarSx(size: number, fontSize: number) {
  return {
    width: size,
    height: size,
    flexShrink: 0,
    bgcolor: "brandSource.burgundy",
    color: "common.white",
    fontSize,
    fontWeight: 700,
  } as const;
}

/**
 * The inbox master pane (2.6.1 / 2.6.2): the full width below `web`, a fixed 340px column
 * with a right rule from it. The page decides whether it shows below `web` (2.6.1 does;
 * 2.6.2 hides it, because there the thread is the whole screen).
 */
export const INBOX_PANE_SX = {
  display: "flex",
  flexDirection: "column",
  minHeight: 0,
  width: { xs: "100%", web: 340 },
  flexShrink: { web: 0 },
  borderRight: { web: 1 },
  borderColor: "divider",
} as const;

/** The thread header bar (2.2.7 / 2.6.2) and its centred 768px row. */
export const THREAD_HEADER_SX = {
  flexShrink: 0,
  borderBottom: 1,
  borderColor: "divider",
  bgcolor: "surface.main",
  px: { xs: 2, md: 3 },
  py: 1.5,
} as const;

export const THREAD_ROW_SX = {
  mx: "auto",
  display: "flex",
  width: "100%",
  maxWidth: MAX_W_3XL,
  alignItems: "center",
  gap: 1.5,
} as const;

export { VISUALLY_HIDDEN } from "@/lib/mui/sx";
