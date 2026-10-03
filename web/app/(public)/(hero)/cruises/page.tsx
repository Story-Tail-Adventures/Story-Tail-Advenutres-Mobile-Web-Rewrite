// Screen 2.0.9 Cruises — see docs/Screen-Inventory.md §2.0.9 (Pattern H, §4.4) and
// design/source-prototype/screens/client-public-topics.jsx (C209_Cruises) +
// client-public-mobile.jsx (M209_Cruises). P2 (built ahead of phase, September 2026).
import type { Metadata } from "next";
import Box from "@mui/material/Box";
import MuiButton from "@mui/material/Button";
import MuiChip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import NextLink from "@/components/mui/NextLink";
import { ClosingCta } from "@/components/public/ClosingCta";
import { Container } from "@/components/public/Container";
import { HeroBleed } from "@/components/public/HeroBleed";
import { InquiryBar } from "@/components/public/InquiryBar";
import { MediaCard } from "@/components/public/MediaCard";
import { SectionLabel } from "@/components/public/SectionLabel";
import { StickyCta } from "@/components/public/StickyCta";
import { TripTile } from "@/components/public/TripTile";
import { CRUISE_LINES } from "@/content/public/cruise-lines";
import { TRIPS } from "@/content/public/trips";
import type { Topic } from "@/content/public/types";
import { staImg } from "@/lib/images";
import { inquiryHref } from "@/lib/public/inquiry";
import { joinHref } from "@/lib/public/links";
import { countByTopic, resultsHref, tripsForTopic } from "@/lib/public/search";
import {
  CRUISES_CLOSING,
  CRUISES_HERO,
  CRUISES_HERO_IMAGE,
  CRUISES_INQUIRY_CTA,
  CRUISES_INQUIRY_FIELDS,
  CRUISES_LINES_SECTION,
  CRUISES_META,
  CRUISES_PATH,
  CRUISES_STICKY,
  CRUISES_TRIPS,
  CRUISES_TYPES,
  CRUISES_TYPES_SECTION,
  cruisesSeeAllLabel,
  cruisesTripsOverline,
} from "./content";

const TOPIC: Topic = "cruises";
const TYPES_HEADING_ID = "who-its-for";
const LINES_HEADING_ID = "lines-we-book";
const SAILINGS_HEADING_ID = "hand-picked-sailings";

export const metadata: Metadata = {
  title: CRUISES_META.title,
  description: CRUISES_META.description,
  alternates: { canonical: CRUISES_PATH },
  openGraph: {
    title: CRUISES_META.title,
    description: CRUISES_META.description,
    url: CRUISES_PATH,
    images: [{ url: staImg(CRUISES_HERO_IMAGE, 1200, 630), width: 1200, height: 630 }],
  },
};

/** Three-up from `md`, a single column below it. */
const THREE_UP = {
  display: "grid",
  gap: { xs: 1.25, md: 1.75 },
  gridTemplateColumns: { md: "repeat(3, 1fr)" },
} as const;

/** Trip grid: one column on phones, two at tablet, three on web. */
const TRIP_GRID = {
  display: "grid",
  gap: { xs: 1.25, md: 1.75 },
  gridTemplateColumns: { md: "repeat(2, 1fr)", web: "repeat(3, 1fr)" },
} as const;

/**
 * Pattern H topic page (same skeleton as 2.0.8). The cruise-line chips are display text —
 * the prototype has no action on them and the catalog does not search by line yet.
 */
export default function CruisesPage() {
  const trips = tripsForTopic(TRIPS, TOPIC);
  const total = countByTopic(TRIPS, TOPIC);
  const quoteHref = joinHref({ intent: "quote", next: CRUISES_PATH });
  const allSailingsHref = resultsHref({ topic: TOPIC });
  // The live catalog, not the curated nine. `dest` matches the sailing titles and their
  // destination arrays, which is how cruise-search narrows; no dates, because a sailing is
  // chosen by its own departure rather than by a check-in the visitor picked.
  const liveSailingsHref = resultsHref({ mode: "cruises", dest: "Caribbean" });
  const messageHref = inquiryHref({ source: "topic", topic: TOPIC });

  return (
    <>
      <HeroBleed
        image={CRUISES_HERO_IMAGE}
        size="normal"
        scrim="topic"
        align="end"
        titleClass="t-hero"
        overline={CRUISES_HERO.overline}
        title={CRUISES_HERO.title}
        script={CRUISES_HERO.script}
        sub={CRUISES_HERO.sub}
      />

      <InquiryBar
        sticky
        fields={CRUISES_INQUIRY_FIELDS}
        action={{ label: CRUISES_INQUIRY_CTA, href: liveSailingsHref, icon: "search" }}
      />

      <Container size="wide" sx={{ pt: { xs: 2.25, md: 4 }, pb: { xs: 3, md: 7 } }}>
        {/* Who it's for — three media cards; image-beside-text rows below md. */}
        <section aria-labelledby={TYPES_HEADING_ID}>
          <SectionLabel
            id={TYPES_HEADING_ID}
            overline={CRUISES_TYPES_SECTION.overline}
            title={CRUISES_TYPES_SECTION.title}
            sub={CRUISES_TYPES_SECTION.sub}
          />
          <Box sx={{ ...THREE_UP, mb: { xs: 2.25, md: 4.5 } }}>
            {CRUISES_TYPES.map((type) => (
              <MediaCard key={type.tag} image={type.image} tag={type.tag} title={type.title} body={type.body} />
            ))}
          </Box>
        </section>

        {/* Lines we book — display chips, in the designer's order. */}
        <section aria-labelledby={LINES_HEADING_ID}>
          <SectionLabel
            id={LINES_HEADING_ID}
            overline={CRUISES_LINES_SECTION.overline}
            title={CRUISES_LINES_SECTION.title}
          />
          <Stack
            component="ul"
            aria-labelledby={LINES_HEADING_ID}
            direction="row"
            useFlexGap
            sx={{ m: 0, p: 0, mb: { xs: 2.25, md: 4.5 }, flexWrap: "wrap", gap: { xs: 0.75, md: 1 }, listStyle: "none" }}
          >
            {CRUISE_LINES.map((line) => (
              <MuiChip key={line.slug} component="li" variant="outlined" label={line.name} />
            ))}
          </Stack>
        </section>

        {/* Hand-picked sailings — every trip placed on this topic, in the designer's order. */}
        <section aria-labelledby={SAILINGS_HEADING_ID}>
          <SectionLabel
            id={SAILINGS_HEADING_ID}
            overline={cruisesTripsOverline(trips.length)}
            title={CRUISES_TRIPS.title}
          />
          <Box sx={{ ...TRIP_GRID, mb: { xs: 1.5, md: 3 } }}>
            {trips.map((trip) => (
              <TripTile key={trip.slug} trip={trip} topic={TOPIC} next={CRUISES_PATH} />
            ))}
          </Box>
          <Box sx={{ mb: { xs: 3, md: 4.5 }, display: "flex", justifyContent: "center" }}>
            <MuiButton
              component={NextLink}
              href={allSailingsHref}
              variant="outlined"
              color="secondary"
              sx={{ minHeight: 40, px: 3, width: { xs: "100%", md: "auto" } }}
            >
              {cruisesSeeAllLabel(total)}
            </MuiButton>
          </Box>
        </section>

        <ClosingCta
          image={CRUISES_CLOSING.image}
          title={CRUISES_CLOSING.title}
          body={CRUISES_CLOSING.body}
          primary={{ label: CRUISES_CLOSING.primary, href: quoteHref }}
          secondary={{ label: CRUISES_CLOSING.secondary, href: messageHref }}
        />
      </Container>

      <StickyCta
        primary={{ label: CRUISES_STICKY.primary, href: quoteHref, icon: "message" }}
        secondary={{ label: CRUISES_STICKY.secondary, href: allSailingsHref }}
      />
    </>
  );
}
