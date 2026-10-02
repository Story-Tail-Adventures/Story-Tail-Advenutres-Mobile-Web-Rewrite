import AppBar from "@mui/material/AppBar";
import Box from "@mui/material/Box";
import Toolbar from "@mui/material/Toolbar";
import { BrandMark } from "@/components/brand/BrandMark";
import NextLink from "@/components/mui/NextLink";
import { PUBLIC_NAV_LINKS } from "@/content/public/contact";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { UP_MD, UP_WEB } from "@/lib/mui/sx";
import { cn } from "@/lib/cn";
import { PublicAuthCluster } from "./PublicAuthCluster";
import { PublicNav } from "./PublicNav";

export type TopBarVariant = "solid" | "overlay";

/** Tablet only — the old `md:max-web:` prefix. */
const MD_TO_WEB = "@media (min-width:768px) and (max-width:1199.95px)";

/**
 * The bar is a Paper with a hairline, not an elevation: `elevation={0}` plus a 1px divider,
 * exactly as the artboard's MuiScreenTopBar draws it. z-index stays the legacy 40 rather
 * than MUI's appBar (1100) so nothing in the still-legacy page CSS (`.sticky-under-topbar`
 * at 30, the sticky bottom bar at 40, the skip link at 50) changes its stacking.
 */
const SOLID = {
  zIndex: 40,
  height: "var(--public-topbar-h)",
  boxSizing: "border-box",
  bgcolor: "surface.1",
  borderBottom: 1,
  borderColor: "divider",
} as const;

/** Floats transparent over the hero below `md`, then becomes the solid sticky bar. */
const OVERLAY = {
  zIndex: 40,
  height: "var(--public-topbar-h)",
  boxSizing: "border-box",
  left: 0,
  right: 0,
  bgcolor: "transparent",
  borderBottom: 0,
  [UP_MD]: {
    position: "sticky",
    bgcolor: "surface.1",
    borderBottom: 1,
    borderColor: "divider",
  },
} as const;

/**
 * 96px public top bar (design: ScreenTopBar role="public"; mobile: MTopBar).
 *
 * `solid` — cream/navy bar, sticky at every width (About, results, gate, legal).
 * `overlay` — below `md` the bar floats transparent over the page's hero photo with white
 * text (landing, topic pages, explore, detail); from `md` it is the same solid sticky bar.
 *
 * The right cluster is a client island (PublicAuthCluster) rather than static markup,
 * because a signed-in visitor is perfectly entitled to be here — the proxy only bounces them
 * off `/` and the auth routes, not off /explore or the topic pages — and being asked to sign
 * in again reads as the site not knowing them. The signed-out pair is still what the
 * PRERENDERED html contains, which is what keeps every public page static and crawlable.
 *
 * `.pub-topbar` / `.pub-topbar-overlay` stay on the element as hooks: the print rule in
 * styles/public.css hides the bar by them. `.on-photo` keeps the on-photo focus ring.
 */
export function PublicTopBar({ variant = "solid" }: { variant?: TopBarVariant }) {
  const overlay = variant === "overlay";
  return (
    <AppBar
      component="header"
      position={overlay ? "absolute" : "sticky"}
      color="inherit"
      elevation={0}
      className={cn("pub-topbar", overlay && "pub-topbar-overlay on-photo")}
      sx={overlay ? OVERLAY : SOLID}
    >
      <Toolbar
        disableGutters
        sx={{
          // The bar's total height (border included) is --public-topbar-h, set on the
          // AppBar above: the var is the one every offset in public.css reads (hero-fill,
          // legal-layout, sticky-under-topbar). The Toolbar just fills it. The breakpoint
          // object is deliberate: Toolbar's own min-heights (56 / 48 / 64) are @media rules,
          // which stylis emits after plain declarations, so a plain `minHeight` here would
          // lose to them from 600px. Keyed on `xs` it is an @media rule too, serialised
          // last, and wins at every width.
          minHeight: { xs: 0 },
          height: "100%",
          gap: 1.25,
          px: 1.75,
          [MD_TO_WEB]: { px: 2 },
          [UP_WEB]: { gap: 1.75, px: 2.5 },
        }}
      >
        {/* The brand mark is the real lockup now: 201px wide at the 80px legibility floor,
            against ~115px for the wordmark it replaced. That +86px does not fit alongside
            five links AND two buttons at tablet — measured 823px of content in 753px at
            768px, with "Create account" clipped off the right edge. The links win the space
            because they are the only surface for that IA; the buttons move to the drawer,
            which already carries both as full-width controls, and return at `lg`. */}
        <Box
          component={NextLink}
          href="/"
          aria-label="Story-Tail Adventures home"
          sx={{ flexShrink: 0, display: "inline-flex" }}
        >
          {overlay ? (
            <>
              <Box component="span" sx={{ display: { md: "none" } }}>
                <BrandMark size={80} tone="dark" alt="" />
              </Box>
              <Box component="span" sx={{ display: { xs: "none", md: "inline-flex" } }}>
                <BrandMark size={80} alt="" />
              </Box>
            </>
          ) : (
            <BrandMark size={80} alt="" />
          )}
        </Box>

        {/* THE TOGGLE GOES THROUGH PublicNav, not straight into this header, because it has
            to sit at the HEAD of the right-hand group — left of the menu trigger and left of
            the auth buttons — the way the design's ScreenTopBar draws it. PublicNav returns
            a fragment, so its <nav> and its trigger are both direct flex children here and
            nothing rendered from this file can land between them.

            The glass chip is for the widths where this bar floats over a hero photo. */}
        <PublicNav
          links={PUBLIC_NAV_LINKS}
          overlay={overlay}
          actions={<ThemeToggle overlay={overlay} size={20} buttonSize={36} />}
        />

        <PublicAuthCluster />
      </Toolbar>
    </AppBar>
  );
}
