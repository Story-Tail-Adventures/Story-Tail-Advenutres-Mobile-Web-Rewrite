import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import NextLink from "@/components/mui/NextLink";
import { Icon } from "@/components/ui/Icon";
import type { Money } from "@/content/public/types";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/public/money";
import { CtaControl, type CtaLink } from "./CtaControl";
import { StickyCtaSecondary } from "./StickyCtaSecondary";

interface StickyCtaProps {
  primary: CtaLink;
  secondary?: CtaLink;
  /**
   * What `secondary` becomes for somebody already signed in. §4.4 makes this bar the mobile
   * equivalent of the /explore sign-in banner, so a page whose secondary is "Sign in" has to
   * say what replaces it — otherwise the fault this fixes survives on phones.
   */
  secondarySignedIn?: CtaLink;
  /** 2.0.5: "FROM $3,290 /pp" + heart + Request a quote. */
  price?: { from: Money; saveHref: string };
  /**
   * 2.0.5 only: the guest "message without an account" path §4.4 puts on the mobile
   * bottom bar. Rendered as a full-width second row, because four controls do not fit
   * one 360px row.
   */
  guest?: CtaLink;
}

/**
 * The bar's own geometry. Every measurement is a `--sticky-cta-*` variable from
 * styles/public.css, because the shell's height reserve (`.pub-surface:has(.sticky-cta)`)
 * is derived from the same variables and must not drift from the bar. Hidden from `md`.
 */
const BAR = {
  position: "fixed",
  left: 0,
  right: 0,
  bottom: 0,
  zIndex: 40,
  display: { xs: "flex", md: "none" },
  alignItems: "center",
  gap: "var(--sticky-cta-gap)",
  px: "14px",
  pt: "var(--sticky-cta-pad)",
  pb: "var(--sticky-cta-pad-bottom)",
  borderTop: 1,
  borderColor: "divider",
  // Two-row variant (2.0.5): the guest path wraps to a second, full-width row.
  "& > .sticky-cta-row2": { flex: "1 0 100%" },
} as const;

/**
 * Mobile-only bottom bar (design: MStickyCTA; Screen Inventory §4.3 Pattern H "sticky
 * bottom CTA"). Fixed to the viewport with safe-area padding; hidden from `md`.
 *
 * It deliberately renders NO spacer of its own. The bar is fixed, so the page must reserve
 * its height, but a spacer here would sit inside `<main>` — above PublicFooter — and leave
 * the footer under the bar. The reserve lives on `.pub-surface` in public.css instead, so
 * it lands after the footer. `.sticky-cta` / `.sticky-cta-tall` / `.sticky-cta-row2` stay
 * on the elements as the hooks that reserve, the print rule and the tests read.
 */
export function StickyCta({ primary, secondary, secondarySignedIn, price, guest }: StickyCtaProps) {
  return (
    <Paper
      square
      elevation={0}
      className={cn("sticky-cta", guest && "sticky-cta-tall")}
      sx={{ ...BAR, flexWrap: guest ? "wrap" : "nowrap" }}
    >
      {price ? (
        <>
          <Box sx={{ flex: 1 }}>
            <Typography
              component="div"
              variant="caption"
              sx={{ color: "text.secondary", fontWeight: 500, letterSpacing: "0.4px", lineHeight: 1.3 }}
            >
              FROM
            </Typography>
            <Typography component="div" variant="h6" sx={{ color: "text.primary", fontWeight: 700, lineHeight: 1 }}>
              {formatMoney(price.from, { whole: true })}
              <Typography component="span" variant="caption" sx={{ color: "text.secondary", fontWeight: 500 }}>
                {" "}
                /pp
              </Typography>
            </Typography>
          </Box>
          <IconButton
            component={NextLink}
            href={price.saveHref}
            aria-label="Save this trip"
            sx={{
              width: 44,
              height: 44,
              bgcolor: "secondary.container",
              color: "secondary.onContainer",
              "&:hover": { bgcolor: "secondary.container" },
            }}
          >
            <Icon name="heart" size={16} />
          </IconButton>
          <CtaControl cta={primary} variant="filled" sx={{ flex: 1 }}>
            {primary.label}
          </CtaControl>
        </>
      ) : (
        <>
          {secondary &&
            (secondarySignedIn ? (
              <StickyCtaSecondary signedOut={secondary} signedIn={secondarySignedIn} />
            ) : (
              <CtaControl cta={secondary}>{secondary.label}</CtaControl>
            ))}
          <CtaControl cta={primary} variant="filled" sx={{ flex: 1 }}>
            <Icon name={primary.icon ?? "message"} size={14} /> {primary.label}
          </CtaControl>
        </>
      )}

      {guest && (
        <CtaControl cta={guest} className="sticky-cta-row2" sx={{ width: "100%" }}>
          <Icon name={guest.icon ?? "message"} size={14} /> {guest.label}
        </CtaControl>
      )}
    </Paper>
  );
}
