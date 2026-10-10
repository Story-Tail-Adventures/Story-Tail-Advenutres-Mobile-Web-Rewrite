// Screen 2.0.8 Caribbean — see docs/Screen-Inventory.md §2.0.8 (Pattern H, §4.4) and
// design/source-prototype/screens/client-public-topics.jsx (C208_Caribbean) +
// client-public-mobile.jsx (M208_Caribbean). P2 (built ahead of phase, September 2026).
import type { Metadata } from "next";
import { Fragment } from "react";
import Box from "@mui/material/Box";
import MuiButton from "@mui/material/Button";
import { topicQuoteLink } from "@/app/quote/href";
import NextLink from "@/components/mui/NextLink";
import { ClosingCta } from "@/components/public/ClosingCta";
import { Container } from "@/components/public/Container";
import { FeatureCard } from "@/components/public/FeatureCard";
import { HeroBleed } from "@/components/public/HeroBleed";
import { InquiryBar } from "@/components/public/InquiryBar";
import { PhotoTile } from "@/components/public/PhotoTile";
import { SectionLabel } from "@/components/public/SectionLabel";
import { StickyCta } from "@/components/public/StickyCta";
import { TripTile } from "@/components/public/TripTile";
import { ISLANDS } from "@/content/public/islands";
import { TRIPS } from "@/content/public/trips";
import type { Topic } from "@/content/public/types";
import { staImg } from "@/lib/images";
import { inquiryHref } from "@/lib/public/inquiry";
import { countByTopic, resultsHref, tripsForTopic } from "@/lib/public/search";
import {
  CARIBBEAN_CLOSING,
  CARIBBEAN_HERO,
  CARIBBEAN_HERO_IMAGE,
  CARIBBEAN_INQUIRY_FIELDS,
  CARIBBEAN_INQUIRY_LABEL,
  CARIBBEAN_INTRO,
  CARIBBEAN_ISLANDS,
  CARIBBEAN_META,
  CARIBBEAN_PATH,
  CARIBBEAN_STICKY,
  CARIBBEAN_TRIPS,
  REQUEST_QUOTE,
  caribbeanSeeAllLabel,
  caribbeanTripsOverline,
} from "./content";

const TOPIC: Topic = "caribbean";
const ISLANDS_HEADING_ID = "islands";
const TRIPS_HEADING_ID = "hand-picked-trips";

/**
 * Hourly, so the `today` the inquiry bar's date picker is prerendered with (its native-input
 * floor before hydration, and with no JavaScript at all) is never more than an hour old.
 * Built once and left, it would accept dates long past and parseStay would drop them.
 */
export const revalidate = 3600;

export const metadata: Metadata = {
  title: CARIBBEAN_META.title,
  description: CARIBBEAN_META.description,
  alternates: { canonical: CARIBBEAN_PATH },
  openGraph: {
    title: CARIBBEAN_META.title,
    description: CARIBBEAN_META.description,
    url: CARIBBEAN_PATH,
    images: [{ url: staImg(CARIBBEAN_HERO_IMAGE, 1200, 630), width: 1200, height: 630 }],
  },
};

/**
 * The legacy `.h-scroll` snap strip, in sx: bleeds into the gutters by `--gutter` (the same
 * variable Container pads with), snaps per tile, hides its scrollbar. Here rather than on
 * the class because `.h-scroll` sits in a cascade layer above MUI's, so an sx
 * `display: none` at `md` could not override its `display: flex`.
 */
const SNAP_STRIP = {
  display: { xs: "flex", md: "none" },
  gap: 1,
  overflowX: "auto",
  scrollSnapType: "x mandatory",
  pb: 1.25,
  mx: "calc(-1 * var(--gutter))",
  px: "var(--gutter)",
  scrollbarWidth: "none",
  "&::-webkit-scrollbar": { display: "none" },
  "& > *": { scrollSnapAlign: "start", flexShrink: 0 },
} as const;

/** Trip grid: one column on phones, two at tablet, three on web. */
const TRIP_GRID = {
  display: "grid",
  gap: { xs: 1.25, md: 1.75 },
  gridTemplateColumns: { md: "repeat(2, minmax(0, 1fr))", web: "repeat(3, minmax(0, 1fr))" },
} as const;

/**
 * Pattern H topic page. Everything is a Server Component: the inquiry bar is a GET form,
 * tiles link to the detail page or the sign-up gate, and the mobile sticky bar replaces the
 * inquiry bar below `md` (Screen Inventory §4.4).
 */
export default function CaribbeanPage() {
  const trips = tripsForTopic(TRIPS, TOPIC);
  const total = countByTopic(TRIPS, TOPIC);
  // Straight to the quote form for this topic, through the gate. It used to be the gate with
  // this page as `next`, which forwarded a signed-in visitor right back here.
  const quoteHref = topicQuoteLink(TOPIC);
  const browseHref = resultsHref({ topic: TOPIC });
  const messageHref = inquiryHref({ source: "topic", topic: TOPIC });

  return (
    <>
      <HeroBleed
        image={CARIBBEAN_HERO_IMAGE}
        size="normal"
        scrim="topic"
        align="end"
        titleClass="t-hero"
        overline={CARIBBEAN_HERO.overline}
        title={CARIBBEAN_HERO.title}
        script={CARIBBEAN_HERO.script}
        sub={CARIBBEAN_HERO.sub}
      />

      {/* Submits to /quote, which carries what was typed into the quote request. */}
      <InquiryBar
        fields={CARIBBEAN_INQUIRY_FIELDS}
        form={{ to: "quote", label: CARIBBEAN_INQUIRY_LABEL, hidden: { topic: "caribbean" } }}
        action={{ label: REQUEST_QUOTE, icon: "message" }}
      />

      <Container size="wide" sx={{ pt: { xs: 2.25, md: 4 }, pb: { xs: 3, md: 7 } }}>
        {/* Intro band — icon-square rows on mobile (M208), bare-icon stacks from md (C208). */}
        <Box
          sx={{
            mb: { xs: 2.25, md: 4.5 },
            display: "grid",
            gap: { xs: 1.25, md: 1.75 },
            gridTemplateColumns: { md: "repeat(3, minmax(0, 1fr))" },
          }}
        >
          {CARIBBEAN_INTRO.map((point) => (
            <Fragment key={point.title}>
              <Box sx={{ display: { md: "none" } }}>
                <FeatureCard
                  icon={point.icon}
                  iconTone="primary"
                  iconSize={32}
                  layout="row"
                  card={false}
                  title={point.title}
                  body={point.body}
                  titleClass="t-title-s"
                />
              </Box>
              <Box sx={{ display: { xs: "none", md: "block" }, px: 2, py: 1.75 }}>
                <FeatureCard
                  icon={point.icon}
                  iconTone="bare"
                  layout="stack"
                  card={false}
                  title={point.title}
                  body={point.body}
                />
              </Box>
            </Fragment>
          ))}
        </Box>

        {/* Islands — one row of six from web, two rows of three on tablet, a snap strip below md. */}
        <section aria-labelledby={ISLANDS_HEADING_ID}>
          <SectionLabel
            id={ISLANDS_HEADING_ID}
            overline={CARIBBEAN_ISLANDS.overline}
            title={CARIBBEAN_ISLANDS.title}
            sub={CARIBBEAN_ISLANDS.sub}
          />
          <Box
            sx={{
              mb: 4.5,
              display: { xs: "none", md: "grid" },
              gap: 1.25,
              gridTemplateColumns: { md: "repeat(3, minmax(0, 1fr))", web: "repeat(6, minmax(0, 1fr))" },
            }}
          >
            {ISLANDS.map((island) => (
              <PhotoTile
                key={island.slug}
                image={island.imageKey}
                label={island.name}
                href={resultsHref({ dest: island.name })}
                aspect="4/5"
                scrim="bottom-island"
                sizes="(min-width: 1200px) 220px, 33vw"
              />
            ))}
          </Box>
          <Box sx={{ ...SNAP_STRIP, mb: 2.25 }}>
            {ISLANDS.map((island) => (
              <PhotoTile
                key={island.slug}
                image={island.imageKey}
                label={island.name}
                href={resultsHref({ dest: island.name })}
                aspect="4/5"
                scrim="bottom-island"
                strip
              />
            ))}
          </Box>
        </section>

        {/* Hand-picked trips — every trip placed on this topic, in the designer's order. */}
        <section aria-labelledby={TRIPS_HEADING_ID}>
          <SectionLabel
            id={TRIPS_HEADING_ID}
            overline={caribbeanTripsOverline(trips.length)}
            title={CARIBBEAN_TRIPS.title}
            sub={CARIBBEAN_TRIPS.sub}
          />
          <Box sx={{ ...TRIP_GRID, mb: { xs: 1.5, md: 3 } }}>
            {trips.map((trip) => (
              <TripTile key={trip.slug} trip={trip} topic={TOPIC} next={CARIBBEAN_PATH} />
            ))}
          </Box>
          <Box sx={{ mb: { xs: 3, md: 4.5 }, display: "flex", justifyContent: "center" }}>
            <MuiButton
              component={NextLink}
              href={browseHref}
              variant="outlined"
              color="secondary"
              sx={{ minHeight: 40, px: 3, width: { xs: "100%", md: "auto" } }}
            >
              {caribbeanSeeAllLabel(total)}
            </MuiButton>
          </Box>
        </section>

        <ClosingCta
          image={CARIBBEAN_CLOSING.image}
          title={CARIBBEAN_CLOSING.title}
          body={CARIBBEAN_CLOSING.body}
          primary={{ label: CARIBBEAN_CLOSING.primary, href: quoteHref }}
          secondary={{ label: CARIBBEAN_CLOSING.secondary, href: messageHref }}
        />
      </Container>

      <StickyCta
        primary={{ label: CARIBBEAN_STICKY.primary, href: quoteHref, icon: "message" }}
        secondary={{ label: CARIBBEAN_STICKY.secondary, href: browseHref }}
      />
    </>
  );
}
