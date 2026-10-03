import MuiButton from "@mui/material/Button";
import type { SxProps, Theme } from "@mui/material/styles";
import NextLink from "@/components/mui/NextLink";
import type { IconName } from "@/components/ui/Icon";

interface CtaBase {
  label: string;
  icon?: IconName;
}

/**
 * Either navigates (`href` — a route, a `mailto:` or an external URL) or submits a form
 * elsewhere in the document by id (`submitFor`). 2.0.3 needs the second form: the artboard's
 * one Search control is the sticky bar, but the fields live in a card further up the page,
 * so the bar has to be the form's submit rather than a link that drops what was typed.
 *
 * `?: undefined` rather than `?: never` on the opposite member — that is what lets
 * `cta.submitFor !== undefined` narrow the union.
 */
export type CtaLink =
  | (CtaBase & { href: string; submitFor?: undefined })
  | (CtaBase & { submitFor: string; href?: undefined });

/** The two looks the sticky bar uses: text primary, and contained primary (legacy .btn-filled). */
export type CtaVariant = "text" | "filled";

const LOOK = {
  text: { variant: "text", color: "primary" },
  filled: { variant: "contained", color: "primary" },
} as const;

/** The legacy box: 44px tall (`min-h-11`), never squashed, 8px to an inline icon. */
const BASE = { minHeight: 44, flexShrink: 0, gap: 1, whiteSpace: "nowrap" } as const;

/**
 * An MUI Button that is next/link for same-origin paths, a plain anchor for mailto: and
 * external hrefs, or a submit button bound to a form by id.
 *
 * Lives in its own module rather than inside StickyCta so the client island that swaps the
 * sticky bar's secondary control (StickyCtaSecondary) can render through the same thing,
 * without the two files importing each other. No "use client": StickyCta is a Server
 * Component, so `sx` must be plain objects.
 */
export function CtaControl({
  cta,
  className,
  children,
  dataAuth,
  variant = "text",
  sx,
}: {
  cta: CtaLink;
  className?: string;
  children: React.ReactNode;
  /**
   * Renders as `data-auth`, which is how the pre-paint gate in styles/public.css scopes
   * itself to the unresolved state. Only StickyCtaSecondary passes it.
   */
  dataAuth?: string;
  variant?: CtaVariant;
  sx?: SxProps<Theme>;
}) {
  const look = LOOK[variant];
  const common = {
    className,
    "data-auth": dataAuth,
    sx: [BASE, ...(Array.isArray(sx) ? sx : [sx])],
  };
  if (cta.submitFor !== undefined) {
    return (
      <MuiButton {...look} type="submit" form={cta.submitFor} {...common}>
        {children}
      </MuiButton>
    );
  }
  if (cta.href.startsWith("/")) {
    return (
      <MuiButton {...look} component={NextLink} href={cta.href} {...common}>
        {children}
      </MuiButton>
    );
  }
  return (
    <MuiButton {...look} component="a" href={cta.href} {...common}>
      {children}
    </MuiButton>
  );
}
