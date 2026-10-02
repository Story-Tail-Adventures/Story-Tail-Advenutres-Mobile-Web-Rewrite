import * as React from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import type { ImageKey } from "@/lib/images";
import { cn } from "@/lib/cn";
import { Container } from "./Container";
import { Photo } from "./Photo";

export type HeroSize = "fill" | "tall" | "normal" | "compact";
export type HeroScrim = "landing" | "topic" | "navy" | "bottom" | "bottom-detail";

/**
 * `.hero-*` and `.scrim-*` stay as classes from styles/public.css. The heights use `dvh`
 * against `--public-topbar-h`, and the scrims are brand-token gradients that must not switch
 * with the scheme (white stays white on a beach photo); both are measurements the
 * stylesheet owns, so the hero keeps them as hooks rather than restating them in sx.
 */
const SIZE_CLASS: Record<HeroSize, string> = {
  fill: "hero-fill",
  tall: "hero-tall",
  normal: "hero-normal",
  compact: "hero-compact",
};

const SCRIM_CLASS: Record<HeroScrim, string> = {
  landing: "scrim-landing",
  topic: "scrim-topic",
  navy: "scrim-navy",
  bottom: "scrim-bottom",
  "bottom-detail": "scrim-bottom-detail",
};

export type HeroTitleClass = "t-hero-l" | "t-hero" | "t-hero-s";

/**
 * The hero title ramp (mobile → tablet → web), as the legacy `.t-hero*` classes drew it.
 * The MUI artboards draw a stock `h2` at 1440; these sizes are kept because the hero's
 * height is fixed by `.hero-*` and the copy has to fit inside it at every width.
 */
const TITLE_SX: Record<HeroTitleClass, object> = {
  "t-hero-l": {
    fontWeight: 800,
    fontSize: { xs: 32, md: 40, web: 45 },
    lineHeight: 1.05,
    letterSpacing: { xs: "-0.6px", md: "-0.8px", web: "-1px" },
  },
  "t-hero": {
    fontWeight: 800,
    fontSize: { xs: 26, md: 36, web: 45 },
    lineHeight: { xs: 1.08, md: 1.06, web: 1.04 },
    letterSpacing: { xs: "-0.4px", md: "-0.6px", web: "-1px" },
  },
  "t-hero-s": {
    fontWeight: { xs: 800, md: 700 },
    fontSize: { xs: 26, md: 32, web: 36 },
    lineHeight: 1.1,
    letterSpacing: { xs: "-0.4px", web: "-0.6px" },
  },
};

export interface HeroBleedProps {
  image: ImageKey;
  size?: HeroSize;
  scrim?: HeroScrim;
  /** Vertical placement of the copy from `md` up; mobile always anchors to the bottom. */
  align?: "center" | "end";
  /** Copy column width: 660 (landing) or 760 (topic / explore). */
  contentWidth?: 660 | 760;
  /** Hero title ramp (the legacy class names, kept as the prop's vocabulary). */
  titleClass?: HeroTitleClass;
  overline?: string;
  /** Required unless `custom` replaces the copy block. */
  title?: React.ReactNode;
  /** Gold script tail of the headline ("rest.", "world He made."). */
  script?: string;
  sub?: string;
  /** Rendered under the copy (CTAs, scripture strip, chips). */
  children?: React.ReactNode;
  /** Rendered edge-to-edge inside the hero, below the copy (e.g. a search pill). */
  footer?: React.ReactNode;
  /** Replaces the default copy block entirely (2.0.5 detail hero). */
  custom?: React.ReactNode;
  className?: string;
}

/**
 * Full-bleed photo hero with a brand scrim and white/gold copy
 * (design: HeroBleed / MHero, and the hand-built heroes on 2.0.1, 2.0.3, 2.0.5).
 * Everything on the photo is scheme-independent: `common.white` and `brandSource.gold` are
 * the same in both schemes, and the scrim classes are built from :root-only brand tokens.
 * `.on-photo` stays as the hook for the on-photo focus ring in styles/public.css.
 */
export function HeroBleed({
  image,
  size = "normal",
  scrim = "topic",
  align = "end",
  contentWidth = 760,
  titleClass = "t-hero",
  overline,
  title,
  script,
  sub,
  children,
  footer,
  custom,
  className,
}: HeroBleedProps) {
  return (
    <Box
      component="section"
      className={cn("on-photo", SIZE_CLASS[size], className)}
      sx={{ position: "relative", display: "flex", flexDirection: "column", overflow: "hidden" }}
    >
      <Photo image={image} fill sizes="100vw" preload alt="" />
      <Box aria-hidden="true" className={SCRIM_CLASS[scrim]} sx={{ position: "absolute", inset: 0 }} />

      {/* The wide Container is load-bearing: without the 1280px column the hero copy sits at
          the viewport gutter while SigninBanner and every Container below it centre in
          1280px, so they disagree at any width past 1376px. The 1440 artboards align all
          three (C203 puts hero, banner and body all at a 48px gutter). */}
      <Container
        size="wide"
        sx={{
          position: "relative",
          display: "flex",
          flex: 1,
          flexDirection: "column",
          justifyContent: { xs: "flex-end", md: align === "center" ? "center" : "flex-end" },
          pt: { xs: 10, md: 5 },
          pb: { xs: 2.5, md: 5 },
          color: "common.white",
        }}
      >
        {custom ?? (
          <Box sx={{ display: "flex", flexDirection: "column", maxWidth: contentWidth === 660 ? 660 : 760 }}>
            {overline && (
              <Typography
                component="p"
                variant="overline"
                sx={{ display: "block", mb: { xs: 1, md: 1.25 }, color: "brandSource.gold", fontWeight: 600, lineHeight: 1.3 }}
              >
                {overline}
              </Typography>
            )}
            <Typography component="h1" variant="h2" sx={{ ...TITLE_SX[titleClass], color: "common.white" }}>
              {title}
              {script && (
                <>
                  {" "}
                  <Typography
                    component="span"
                    variant="script"
                    sx={{ fontSize: "1.35em", lineHeight: 1, letterSpacing: 0, color: "brandSource.gold" }}
                  >
                    {script}
                  </Typography>
                </>
              )}
            </Typography>
            {sub && (
              <Typography
                component="p"
                variant="body1"
                sx={{
                  mt: { xs: 0.75, md: 1.5 },
                  maxWidth: 620,
                  fontSize: { xs: 13, md: 16 },
                  lineHeight: { xs: 1.45, md: 1.5 },
                  color: "common.white",
                  opacity: 0.9,
                }}
              >
                {sub}
              </Typography>
            )}
            {children}
          </Box>
        )}
        {footer && <Box sx={{ mt: { xs: 2, md: 2.5 } }}>{footer}</Box>}
      </Container>
    </Box>
  );
}
