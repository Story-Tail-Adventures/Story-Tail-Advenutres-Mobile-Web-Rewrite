// Screen 2.0.11 About Gyasi — see docs/Screen-Inventory.md §2.0.11 (Pattern H + I, §4.4) and
// design/source-prototype/screens/client-public-topics.jsx (C2011_AboutGyasi) +
// client-public-mobile.jsx (M2011_AboutGyasi). P1-eligible.
import type { Metadata } from "next";
import * as React from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { ClosingCta } from "@/components/public/ClosingCta";
import { Container } from "@/components/public/Container";
import { CredentialCard } from "@/components/public/CredentialCard";
import { FaqList } from "@/components/public/FaqList";
import { SectionLabel } from "@/components/public/SectionLabel";
import { StatStrip } from "@/components/public/StatStrip";
import { StickyCta } from "@/components/public/StickyCta";
import { TestimonialCard } from "@/components/public/TestimonialCard";
import { GYASI_FAQ } from "@/content/public/faq/gyasi";
import { TESTIMONIALS } from "@/content/public/proof";
import { staImg } from "@/lib/images";
import { DARK, UP_MD, UP_WEB } from "@/lib/mui/sx";
import { inquiryHref } from "@/lib/public/inquiry";
import { joinHref } from "@/lib/public/links";
import { AdvisorHero } from "./AdvisorHero";
import { ABOUT, ABOUT_CREDENTIALS, ABOUT_STATS, type RichText } from "./content";

const PATH = "/about";

export const metadata: Metadata = {
  title: ABOUT.meta.title,
  description: ABOUT.meta.description,
  alternates: { canonical: PATH },
  openGraph: {
    title: ABOUT.meta.title,
    description: ABOUT.meta.description,
    url: PATH,
    images: [{ url: staImg("sunset", 1200, 630), width: 1200, height: 630 }],
  },
};

/** Section rhythm: 32px between blocks on phones, 44px from `md`. */
const SECTION_GAP = { mb: { xs: 4, md: 5.5 } } as const;

/**
 * The testimonials list: the legacy `.h-scroll` snap strip below `md` (bleeding into the
 * gutters by `--gutter`, the same variable Container pads with), a 2-up grid at tablet and
 * 3-up on web. All of it is here rather than on the class, because `.h-scroll` lives in a
 * cascade layer above MUI's and an sx `display: grid` could not override it.
 */
const TESTIMONIAL_STRIP = {
  listStyle: "none",
  m: 0,
  display: "flex",
  gap: 1,
  overflowX: "auto",
  scrollSnapType: "x mandatory",
  pb: 1.25,
  mx: "calc(-1 * var(--gutter))",
  px: "var(--gutter)",
  scrollbarWidth: "none",
  "&::-webkit-scrollbar": { display: "none" },
  "& > *": { scrollSnapAlign: "start", flexShrink: 0 },
  [UP_MD]: {
    display: "grid",
    gridTemplateColumns: "repeat(2, 1fr)",
    gap: 1.75,
    overflow: "visible",
    mx: 0,
    px: 0,
    pb: 0,
  },
  [UP_WEB]: { gridTemplateColumns: "repeat(3, 1fr)" },
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

export default function AboutGyasiPage() {
  const quoteHref = joinHref({ intent: "quote", next: PATH });
  const messageHref = inquiryHref({ source: "about" });

  return (
    <>
      <AdvisorHero
        overline={ABOUT.hero.overline}
        title={ABOUT.hero.title}
        script={ABOUT.hero.script}
        lead={ABOUT.hero.lead}
        primary={{ label: ABOUT.hero.primary, href: quoteHref }}
        secondary={{ label: ABOUT.hero.secondary, href: messageHref }}
      />

      <StatStrip stats={ABOUT_STATS} />

      <Container size="wide" sx={{ pt: { xs: 2.5, md: 5 }, pb: { xs: 3, md: 7 } }}>
        {/* Bio + credentials */}
        <Box
          sx={{
            ...SECTION_GAP,
            display: "grid",
            gap: 3.5,
            [UP_WEB]: { gridTemplateColumns: "1.4fr 1fr" },
          }}
        >
          <section aria-labelledby="story">
            <SectionLabel id="story" overline={ABOUT.story.overline} title={ABOUT.story.title} />
            <Box sx={{ maxWidth: 640, textWrap: "pretty", color: "text.primary" }}>
              {ABOUT.story.paragraphs.map((paragraph, index) => (
                <Typography key={index} variant="body1" component="p" sx={{ mb: 1.75, "&:last-child": { mb: 0 } }}>
                  <Rich parts={paragraph} />
                </Typography>
              ))}
            </Box>
            {/* Script accent: burgundy in light; the dark tropical scheme swaps to sunset
                gold, because burgundy on navy measures ~1.5:1. */}
            <Typography
              variant="script"
              component="p"
              sx={{
                mt: { xs: 1.5, md: 2.25 },
                fontSize: { xs: 26, md: 30 },
                color: "primary.main",
                [DARK]: { color: "secondary.main" },
              }}
            >
              {ABOUT.story.signature}
            </Typography>
          </section>

          <section aria-labelledby="credentials">
            <SectionLabel id="credentials" overline={ABOUT.credentials.overline} title={ABOUT.credentials.title} />
            <Box
              component="ul"
              sx={{ display: "flex", flexDirection: "column", gap: { xs: 0.75, md: 1 }, listStyle: "none", m: 0, p: 0 }}
            >
              {ABOUT_CREDENTIALS.map((credential) => (
                <CredentialCard key={credential.display} title={credential.display} detail={credential.detail} />
              ))}
            </Box>
          </section>
        </Box>

        {/* Testimonials — snap strip below `md`, 2-up at tablet, 3-up on web. */}
        <Box component="section" aria-labelledby="testimonials" sx={SECTION_GAP}>
          <SectionLabel id="testimonials" overline={ABOUT.testimonials.overline} title={ABOUT.testimonials.title} />
          <Box component="ul" sx={TESTIMONIAL_STRIP}>
            {TESTIMONIALS.map((testimonial) => (
              // `grid` so the one card stretches to the row's full height and width.
              <Box component="li" key={testimonial.who} sx={{ display: "grid", width: { xs: 288, md: "auto" } }}>
                <TestimonialCard testimonial={testimonial} />
              </Box>
            ))}
          </Box>
        </Box>

        {/* FAQ — the five desktop questions. */}
        <Box component="section" aria-labelledby="faq" sx={SECTION_GAP}>
          <SectionLabel id="faq" overline={ABOUT.faq.overline} title={ABOUT.faq.title} />
          <FaqList items={GYASI_FAQ} answerSize="m" />
        </Box>

        <ClosingCta
          image="sunset"
          title={ABOUT.closing.title}
          body={ABOUT.closing.body}
          primary={{ label: ABOUT.closing.primary, href: quoteHref }}
          secondary={{ label: ABOUT.closing.secondary, href: messageHref }}
        />
      </Container>

      <StickyCta
        primary={{ label: ABOUT.sticky.primary, href: quoteHref }}
        secondary={{ label: ABOUT.sticky.secondary, href: messageHref }}
      />
    </>
  );
}
