// Screen 2.0.10 Honeymoons — see docs/Screen-Inventory.md §2.0.10 (Pattern H, §4.4) and
// design/source-prototype/screens/client-public-topics.jsx (C2010_Honeymoons) +
// client-public-mobile.jsx (M2010_Honeymoons). P2 (built ahead of phase, September 2026).
import type { Metadata } from "next";
import Box from "@mui/material/Box";
import MuiButton from "@mui/material/Button";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { topicQuoteLink } from "@/app/quote/href";
import NextLink from "@/components/mui/NextLink";
import { AdvisorCard } from "@/components/public/AdvisorCard";
import { ClosingCta } from "@/components/public/ClosingCta";
import { Container } from "@/components/public/Container";
import { HeroBleed } from "@/components/public/HeroBleed";
import { InquiryBar } from "@/components/public/InquiryBar";
import { MediaCard } from "@/components/public/MediaCard";
import { Photo } from "@/components/public/Photo";
import { SectionLabel } from "@/components/public/SectionLabel";
import { StickyCta } from "@/components/public/StickyCta";
import { TripTile } from "@/components/public/TripTile";
import { TRIPS } from "@/content/public/trips";
import type { Topic } from "@/content/public/types";
import { staImg } from "@/lib/images";
import { UP_MD } from "@/lib/mui/sx";
import { inquiryHref } from "@/lib/public/inquiry";
import { resultsHref, tripsForTopic } from "@/lib/public/search";
import {
  HONEYMOONS_CHRISTIAN_CARD,
  HONEYMOONS_CLOSING,
  HONEYMOONS_FEATURED,
  HONEYMOONS_HERO,
  HONEYMOONS_HERO_IMAGE,
  HONEYMOONS_INQUIRY_FIELDS,
  HONEYMOONS_INQUIRY_LABEL,
  HONEYMOONS_META,
  HONEYMOONS_NOTE,
  HONEYMOONS_PATH,
  HONEYMOONS_STICKY,
  HONEYMOONS_STYLES,
  HONEYMOONS_STYLES_SECTION,
  REQUEST_QUOTE,
  honeymoonsFeaturedOverline,
} from "./content";

const TOPIC: Topic = "honeymoons";
const STYLES_HEADING_ID = "three-ways-to-honeymoon";
const FEATURED_HEADING_ID = "featured-packages";
const CHRISTIAN_HEADING_ID = "for-christian-couples";

/**
 * Hourly, so the `today` the inquiry bar's date picker is prerendered with (its native-input
 * floor before hydration, and with no JavaScript at all) is never more than an hour old.
 * Built once and left, it would accept dates long past and parseStay would drop them.
 */
export const revalidate = 3600;

export const metadata: Metadata = {
  title: HONEYMOONS_META.title,
  description: HONEYMOONS_META.description,
  alternates: { canonical: HONEYMOONS_PATH },
  openGraph: {
    title: HONEYMOONS_META.title,
    description: HONEYMOONS_META.description,
    url: HONEYMOONS_PATH,
    images: [{ url: staImg(HONEYMOONS_HERO_IMAGE, 1200, 630), width: 1200, height: 630 }],
  },
};

/** Section rhythm: 20px between blocks on phones, 36px from `md`. */
const SECTION_GAP = { mb: { xs: 2.5, md: 4.5 } } as const;

/** Three-up from `md`, a single column below it. */
const THREE_UP = {
  display: "grid",
  gap: { xs: 1.25, md: 1.75 },
  gridTemplateColumns: { md: "repeat(3, minmax(0, 1fr))" },
} as const;

/** Trip grid: one column on phones, two at tablet, three on web. */
const TRIP_GRID = {
  display: "grid",
  gap: { xs: 1.25, md: 1.75 },
  gridTemplateColumns: { md: "repeat(2, minmax(0, 1fr))", web: "repeat(3, minmax(0, 1fr))" },
} as const;

/**
 * The Christian-couples panel (C2010): a container-role gradient, so it survives the dark
 * tropical scheme, drawn from the theme's own variables (the ones the palette paths
 * resolve to), and a 1fr / 280px grid from `md` with the photo on the right.
 */
const CHRISTIAN_CARD = {
  ...SECTION_GAP,
  position: "relative",
  overflow: "hidden",
  p: 2.25,
  background:
    "linear-gradient(135deg, var(--mui-palette-primary-container) 0%, var(--mui-palette-secondary-container) 110%)",
  display: "grid",
  gap: 3.5,
  alignItems: "center",
  [UP_MD]: { py: 3.5, px: 4, gridTemplateColumns: "minmax(0, 1fr) 280px" },
} as const;

/**
 * Pattern H topic page with the tall hero. The curated-list link filters results to the
 * honeymoon vibe; "Message Gyasi" is the guest inquiry (email, or the gate when no address
 * is configured).
 */
export default function HoneymoonsPage() {
  const trips = tripsForTopic(TRIPS, TOPIC);
  // Straight to the quote form for this topic, through the gate. It used to be the gate with
  // this page as `next`, which forwarded a signed-in visitor right back here.
  const quoteHref = topicQuoteLink(TOPIC);
  const curatedHref = resultsHref({ vibes: ["honeymoon"] });
  const messageHref = inquiryHref({ source: "topic", topic: TOPIC });

  return (
    <>
      <HeroBleed
        image={HONEYMOONS_HERO_IMAGE}
        size="tall"
        scrim="topic"
        align="end"
        titleClass="t-hero"
        overline={HONEYMOONS_HERO.overline}
        title={HONEYMOONS_HERO.title}
        script={HONEYMOONS_HERO.script}
        sub={HONEYMOONS_HERO.sub}
      />

      {/* Submits to /quote, which carries what was typed into the quote request. */}
      <InquiryBar
        fields={HONEYMOONS_INQUIRY_FIELDS}
        form={{ to: "quote", label: HONEYMOONS_INQUIRY_LABEL, hidden: { topic: "honeymoons" } }}
        action={{ label: REQUEST_QUOTE, icon: "message" }}
      />

      <Container size="wide" sx={{ pt: { xs: 2.25, md: 4 }, pb: { xs: 3, md: 7 } }}>
        {/* Gyasi's letter */}
        <Box sx={SECTION_GAP}>
          <AdvisorCard
            variant="note"
            overline={HONEYMOONS_NOTE.overline}
            body={
              <p>
                {HONEYMOONS_NOTE.before}
                <i>{HONEYMOONS_NOTE.question}</i>
                {HONEYMOONS_NOTE.after}
              </p>
            }
          />
        </Box>

        {/* Three ways to honeymoon — media cards; image-beside-text rows below md. */}
        <section aria-labelledby={STYLES_HEADING_ID}>
          <SectionLabel
            id={STYLES_HEADING_ID}
            overline={HONEYMOONS_STYLES_SECTION.overline}
            title={HONEYMOONS_STYLES_SECTION.title}
          />
          <Box sx={{ ...THREE_UP, ...SECTION_GAP }}>
            {HONEYMOONS_STYLES.map((style) => (
              <MediaCard key={style.tag} image={style.image} tag={style.tag} title={style.title} body={style.body} />
            ))}
          </Box>
        </section>

        {/* Featured packages — every trip placed on this topic, in the designer's order. */}
        <section aria-labelledby={FEATURED_HEADING_ID}>
          <SectionLabel
            id={FEATURED_HEADING_ID}
            overline={honeymoonsFeaturedOverline(trips.length)}
            title={HONEYMOONS_FEATURED.title}
          />
          <Box sx={{ ...TRIP_GRID, ...SECTION_GAP }}>
            {trips.map((trip) => (
              <TripTile key={trip.slug} trip={trip} topic={TOPIC} next={HONEYMOONS_PATH} />
            ))}
          </Box>
        </section>

        {/* Opt-in card for couples who want a faith-shaped rhythm to the week (Screen Inventory
            §2.0.10). Colours are container roles so the panel survives the dark tropical scheme. */}
        <Paper component="section" aria-labelledby={CHRISTIAN_HEADING_ID} elevation={0} sx={CHRISTIAN_CARD}>
          <Box>
            <Typography
              variant="overline"
              component="p"
              sx={{ display: "block", color: "primary.onContainer", fontWeight: 600, lineHeight: 1.3 }}
            >
              {HONEYMOONS_CHRISTIAN_CARD.overline}
            </Typography>
            <Typography
              variant="h4"
              component="h3"
              id={CHRISTIAN_HEADING_ID}
              sx={{ mt: 0.5, mb: 1, fontWeight: 700, color: "primary.onContainer" }}
            >
              {HONEYMOONS_CHRISTIAN_CARD.title}
            </Typography>
            <Typography variant="body2" sx={{ maxWidth: 540, color: "primary.onContainer", opacity: 0.85 }}>
              {HONEYMOONS_CHRISTIAN_CARD.body}
            </Typography>
            <Stack direction="row" useFlexGap sx={{ mt: 2, flexWrap: "wrap", gap: 1.25 }}>
              <MuiButton component={NextLink} href={quoteHref} variant="contained" sx={{ minHeight: 40, px: 3 }}>
                {HONEYMOONS_CHRISTIAN_CARD.primary}
              </MuiButton>
              <MuiButton component={NextLink} href={curatedHref} variant="text" sx={{ minHeight: 40, px: 1.5 }}>
                {HONEYMOONS_CHRISTIAN_CARD.secondary}
              </MuiButton>
            </Stack>
          </Box>
          <Box
            sx={{
              position: "relative",
              display: { xs: "none", md: "block" },
              aspectRatio: "5 / 4",
              overflow: "hidden",
              borderRadius: 1,
              "& img": { objectFit: "cover" },
            }}
          >
            <Photo image={HONEYMOONS_CHRISTIAN_CARD.image} fill sizes="280px" alt="" />
          </Box>
        </Paper>

        <ClosingCta
          image={HONEYMOONS_CLOSING.image}
          title={HONEYMOONS_CLOSING.title}
          body={HONEYMOONS_CLOSING.body}
          primary={{ label: HONEYMOONS_CLOSING.primary, href: quoteHref }}
          secondary={{ label: HONEYMOONS_CLOSING.secondary, href: messageHref }}
        />
      </Container>

      <StickyCta
        primary={{ label: HONEYMOONS_STICKY.primary, href: quoteHref, icon: "message" }}
        secondary={{ label: HONEYMOONS_STICKY.secondary, href: messageHref }}
      />
    </>
  );
}
