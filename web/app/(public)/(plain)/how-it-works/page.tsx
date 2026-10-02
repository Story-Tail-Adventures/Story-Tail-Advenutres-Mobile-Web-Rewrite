// Screen 2.0.2 About / How It Works — see docs/Screen-Inventory.md §2.0.2 (Pattern I (H),
// §4.4) and design/source-prototype/screens/client-public.jsx (C202_About) +
// client-public-mobile.jsx (M202_About). P2.
import type { Metadata } from "next";
import Box from "@mui/material/Box";
import MuiButton from "@mui/material/Button";
import MuiLink from "@mui/material/Link";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import * as React from "react";
import NextLink from "@/components/mui/NextLink";
import { AdvisorCard } from "@/components/public/AdvisorCard";
import { Container } from "@/components/public/Container";
import { FaqList } from "@/components/public/FaqList";
import { FeatureCard } from "@/components/public/FeatureCard";
import { ScriptureLine } from "@/components/public/ScriptureLine";
import { StickyCta } from "@/components/public/StickyCta";
import { Icon } from "@/components/ui/Icon";
import { HOW_IT_WORKS_FAQ } from "@/content/public/faq/how-it-works";
import { staImg } from "@/lib/images";
import { UP_MD } from "@/lib/mui/sx";
import { inquiryHref } from "@/lib/public/inquiry";
import { joinHref, loginHref } from "@/lib/public/links";
import { HOW_IT_WORKS, type RichText } from "./content";

const PATH = "/how-it-works";

export const metadata: Metadata = {
  title: HOW_IT_WORKS.meta.title,
  description: HOW_IT_WORKS.meta.description,
  alternates: { canonical: PATH },
  openGraph: {
    title: HOW_IT_WORKS.meta.title,
    description: HOW_IT_WORKS.meta.description,
    url: PATH,
    images: [{ url: staImg("turks", 1200, 630), width: 1200, height: 630 }],
  },
};

/** Brand-orange overline above each heading (artboard: Typography overline, brand.main, 600). */
const OVERLINE = { display: "block", color: "brand.main", fontWeight: 600, lineHeight: 1.3 } as const;

/** The page title's responsive ramp (28 / 32 / 36) on MUI's h4, so lines wrap where they did. */
const PAGE_TITLE = { fontWeight: 700, fontSize: { xs: 28, md: 32, web: 36 } } as const;

/** The "Our heart" heading: 18 / 24 / 28 on MUI's h4. */
const SECTION_TITLE = { fontWeight: 700, fontSize: { xs: 18, md: 24, web: 28 } } as const;

/** The legacy .btn box (40px, 24px sides) on MUI's Button; full width below `md`. */
const CTA = { minHeight: 40, px: 3, flexShrink: 0, width: { xs: "100%", md: "auto" } } as const;

/**
 * Surface-2 → primary-container wash behind "Our heart" (the artboard's Paper gradient). Drawn
 * from the theme's own CSS variables rather than a palette path because a gradient is not a
 * single colour; they switch with `.scheme-dark` exactly like the `.panel-heart` rule did.
 */
const HEART_PANEL = {
  position: "relative",
  overflow: "hidden",
  mt: { xs: 2.75, md: 3.5 },
  px: { xs: 2.25, md: 3 },
  pt: { xs: 2.25, md: 3 },
  pb: { xs: 2.5, md: 3.25 },
  background:
    "linear-gradient(135deg, var(--mui-palette-surface-2) 0%, var(--mui-palette-primary-container) 160%)",
  [UP_MD]: {
    background:
      "linear-gradient(135deg, var(--mui-palette-surface-2) 0%, var(--mui-palette-primary-container) 140%)",
  },
} as const;

/** The soft orange glow in the panel's top-right corner (brand.main at 18%). */
const GLOW = {
  position: "absolute",
  top: -40,
  right: -40,
  width: 240,
  height: 240,
  borderRadius: "50%",
  background:
    "radial-gradient(circle at 30% 30%, rgba(var(--mui-palette-brand-mainChannel) / 0.18), transparent 70%)",
} as const;

/** Stacked below `md`, a grid from it — the step and pillar rows keep their breakpoints. */
const STACK_TO_GRID = {
  display: { xs: "flex", md: "grid" },
  flexDirection: "column",
} as const;

function Rich({ parts }: { parts: RichText }) {
  return (
    <>
      {parts.map((part, index) =>
        typeof part === "string" ? (
          <React.Fragment key={index}>{part}</React.Fragment>
        ) : (
          <i key={index}>{part.em}</i>
        ),
      )}
    </>
  );
}

export default function HowItWorksPage() {
  const quoteHref = joinHref({ intent: "quote", next: PATH });
  const messageHref = inquiryHref({ source: "how-it-works" });
  const { heart, closing } = HOW_IT_WORKS;

  return (
    <>
      <Container size="prose" sx={{ pt: { xs: 2.5, md: 4 }, pb: { xs: 3, md: 6 } }}>
        <Box component="header">
          <Typography component="p" variant="overline" sx={OVERLINE}>
            {HOW_IT_WORKS.overline}
          </Typography>
          <Typography component="h1" variant="h4" sx={{ ...PAGE_TITLE, mt: 0.5, mb: 0.75 }}>
            {HOW_IT_WORKS.title}
          </Typography>
          <Typography variant="body1" sx={{ maxWidth: 720, color: "text.secondary" }}>
            {HOW_IT_WORKS.lead}
          </Typography>
        </Box>

        {/* Steps */}
        <Box
          component="ol"
          sx={{
            ...STACK_TO_GRID,
            listStyle: "none",
            m: 0,
            p: 0,
            mt: { xs: 2.25, md: 3 },
            gridTemplateColumns: { md: "repeat(3, minmax(0, 1fr))" },
            gap: { xs: 1.25, md: 2 },
          }}
        >
          {HOW_IT_WORKS.steps.map((step) => (
            <Box component="li" key={step.overline} sx={{ display: "flex", "& > *": { flex: 1 } }}>
              <FeatureCard
                icon={step.icon}
                iconSize={40}
                overline={step.overline}
                title={step.title}
                body={step.body}
              />
            </Box>
          ))}
        </Box>

        {/* Our heart — why we do this */}
        <Paper component="section" elevation={0} aria-labelledby="our-heart" sx={HEART_PANEL}>
          <Box aria-hidden="true" sx={GLOW} />
          <Box sx={{ position: "relative" }}>
            <Typography component="p" variant="overline" sx={OVERLINE}>
              {heart.overline}
            </Typography>
            <Typography
              id="our-heart"
              component="h2"
              variant="h4"
              sx={{ ...SECTION_TITLE, mt: 0.5, mb: 0.75, maxWidth: 760 }}
            >
              <Rich parts={heart.title} />
            </Typography>
            <Typography variant="body2" sx={{ mb: { xs: 1.5, md: 2.25 }, maxWidth: 720, color: "text.secondary" }}>
              {heart.intro}
            </Typography>

            <Box
              sx={{
                ...STACK_TO_GRID,
                gridTemplateColumns: { md: "repeat(2, minmax(0, 1fr))" },
                gap: { xs: 1, md: 1.75 },
              }}
            >
              {heart.pillars.map((pillar) => (
                <FeatureCard
                  key={pillar.overline}
                  icon={pillar.icon}
                  iconTone={pillar.tone}
                  iconSize={44}
                  overline={pillar.overline}
                  title={pillar.title}
                  body={pillar.body}
                  footer={
                    <ScriptureLine
                      tone="surface"
                      quote={pillar.scripture.quote}
                      reference={pillar.scripture.reference}
                    />
                  }
                />
              ))}
            </Box>

            {/* Design-System §2.4: the explicit welcome line. */}
            <Paper
              elevation={0}
              sx={{
                mt: { xs: 1.5, md: 2 },
                px: 2,
                py: 1.5,
                bgcolor: "background.paper",
                display: "flex",
                alignItems: "center",
                gap: 1.25,
              }}
            >
              <Box sx={{ display: "inline-flex", flexShrink: 0, color: "text.secondary" }}>
                <Icon name="info" size={16} />
              </Box>
              <Typography variant="body2" sx={{ color: "text.secondary" }}>
                <Box component="b" sx={{ fontWeight: 600, color: "text.primary" }}>
                  {heart.welcome.strong}
                </Box>{" "}
                {heart.welcome.rest}
              </Typography>
            </Paper>
          </Box>
        </Paper>

        <Box sx={{ mt: { xs: 2.75, md: 3 } }}>
          <AdvisorCard variant="bio" />
        </Box>

        {/* FAQ — the four desktop questions (the mobile artboard's three are a subset in spirit). */}
        <Box component="section" aria-labelledby="faq" sx={{ mt: { xs: 2.75, md: 3 } }}>
          <Typography id="faq" component="h2" variant="h5">
            {HOW_IT_WORKS.faqTitle}
          </Typography>
          <Box sx={{ mt: { xs: 1, md: 1.25 } }}>
            <FaqList items={HOW_IT_WORKS_FAQ} />
          </Box>
        </Box>

        {/* Closing panel — stacked below `md`, where the sticky bar also carries the CTA. */}
        <Paper
          component="section"
          elevation={0}
          aria-labelledby="closing"
          sx={{
            mt: { xs: 3, md: 3.75 },
            p: 2.5,
            bgcolor: "primary.container",
            color: "primary.onContainer",
            display: "flex",
            flexDirection: { xs: "column", md: "row" },
            alignItems: { md: "center" },
            gap: 2,
          }}
        >
          <Box sx={{ flex: 1 }}>
            <Typography id="closing" component="h2" variant="h5">
              {closing.title}
            </Typography>
            <Typography component="p" variant="body2" sx={{ mt: 0.5, opacity: 0.85 }}>
              {closing.bodyBefore}
              <MuiLink href={messageHref} color="inherit">
                {closing.bodyLink}
              </MuiLink>
              {closing.bodyAfter}
            </Typography>
          </Box>
          <MuiButton component={NextLink} href="/join" variant="contained" sx={CTA}>
            {closing.cta}
          </MuiButton>
        </Paper>
      </Container>

      <StickyCta
        primary={{ label: HOW_IT_WORKS.sticky.primary, href: quoteHref }}
        secondary={{ label: HOW_IT_WORKS.sticky.secondary, href: loginHref() }}
        secondarySignedIn={{ label: HOW_IT_WORKS.sticky.secondarySignedIn, href: "/dashboard" }}
      />
    </>
  );
}
