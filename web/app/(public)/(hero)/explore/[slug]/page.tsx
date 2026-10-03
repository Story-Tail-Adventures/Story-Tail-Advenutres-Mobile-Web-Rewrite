// Screen 2.0.5 Public Property / Cruise / Tour Detail — see docs/Screen-Inventory.md §2.0.5
// (Pattern C, §4.4) and design/source-prototype/screens/client-public.jsx (C205_PublicDetail) +
// client-public-mobile.jsx (M205_PublicDetail). P2.
//
// Statically generated for every catalog slug; unknown slugs 404 via `dynamicParams = false`.
// "Message Gyasi without an account" is the Phase 1 prefilled email (Screen Inventory 2.0.5 note).
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Box from "@mui/material/Box";
import MuiChip from "@mui/material/Chip";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";
import NextLink from "@/components/mui/NextLink";
import { AdvisorCard } from "@/components/public/AdvisorCard";
import { AmenityPill } from "@/components/public/AmenityPill";
import { Container } from "@/components/public/Container";
import { HeroBleed } from "@/components/public/HeroBleed";
import { NumberedRow } from "@/components/public/NumberedRow";
import { StickyCta } from "@/components/public/StickyCta";
import { Icon } from "@/components/ui/Icon";
import { TRIP_REVIEWS } from "@/content/public/proof";
import { findTrip, TRIP_SLUGS } from "@/content/public/trips";
import { staImg } from "@/lib/images";
import { UP_LG, UP_MD, UP_WEB } from "@/lib/mui/sx";
import { inquiryHref } from "@/lib/public/inquiry";
import { joinHref, tripHref } from "@/lib/public/links";
import { advisorTitle, DETAIL, tripBadge } from "./content";
import { PriceCard } from "./PriceCard";
import { breadcrumbList, serializeJsonLd } from "./seo";

export const dynamicParams = false;

export function generateStaticParams() {
  return TRIP_SLUGS.map((slug) => ({ slug }));
}

type Params = Promise<{ slug: string }>;

/** Off-screen but read aloud — the box MUI's visuallyHidden draws. */
const VISUALLY_HIDDEN = {
  position: "absolute",
  width: "1px",
  height: "1px",
  p: 0,
  m: "-1px",
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
  border: 0,
} as const;

/**
 * The page grid public.css called `.detail-layout`: one column, and from 1024 the 340px
 * right rail. `lg` is the one public-page use of that breakpoint, because the rail splits at
 * exactly that width (fidelity spec §2.0.5).
 */
const DETAIL_LAYOUT = {
  display: "grid",
  gap: 2.25,
  pt: 2.25,
  pb: 2.25,
  [UP_MD]: { pt: 2.5, pb: 4 },
  [UP_LG]: { gridTemplateColumns: "1fr 340px" },
} as const;

/**
 * The hero ramp public.css gave `.t-hero-s` (26 / 32 / 36px), on MUI's h3 with the artboard's
 * 700 weight. Sizes are the current web layout's and stay; only the face moves to MUI.
 */
const HERO_TITLE = {
  mt: 1,
  mb: 0.5,
  color: "common.white",
  fontWeight: 700,
  fontSize: 26,
  lineHeight: 1.1,
  letterSpacing: "-0.4px",
  [UP_MD]: { mb: 0.25, fontSize: 32 },
  [UP_WEB]: { fontSize: 36, letterSpacing: "-0.6px" },
} as const;

/** Inline icon + text pair in the hero meta row. */
const META_ITEM = { display: "inline-flex", alignItems: "center", gap: 0.5 } as const;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const trip = findTrip(slug);
  if (!trip) return {};
  const url = tripHref(trip.slug);
  return {
    title: trip.name,
    description: trip.description,
    alternates: { canonical: url },
    openGraph: {
      title: trip.name,
      description: trip.description,
      url,
      images: [{ url: staImg(trip.heroImageKey ?? trip.imageKey, 1200, 630), width: 1200, height: 630 }],
    },
  };
}

export default async function TripDetailPage({ params }: { params: Params }) {
  const { slug } = await params;
  const trip = findTrip(slug);
  if (!trip) notFound();

  const path = tripHref(trip.slug);
  const quote = joinHref({ intent: "quote", trip: trip.slug, next: path });
  const save = joinHref({ intent: "save", trip: trip.slug, next: path });
  const message = inquiryHref({ source: "detail", trip: { slug: trip.slug, name: trip.name } });
  const review = TRIP_REVIEWS[trip.slug];
  const title = advisorTitle(trip.slug);

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbList(trip)) }} />

      <HeroBleed
        image={trip.heroImageKey ?? trip.imageKey}
        size="compact"
        scrim="bottom-detail"
        custom={
          <Box sx={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 1.5, color: "common.white" }}>
            <Box sx={{ minWidth: 0 }}>
              {/* The light pill on the photo stays white in both schemes (`--hero-pill-bg`),
                  so its text is the brand burgundy rather than a scheme-switching role. */}
              <MuiChip
                size="small"
                label={tripBadge(trip)}
                sx={{
                  height: 20,
                  bgcolor: "var(--hero-pill-bg)",
                  color: "brandSource.burgundy",
                  fontWeight: 700,
                  fontSize: 10,
                  letterSpacing: 0.5,
                  textTransform: "uppercase",
                }}
              />
              <Typography variant="h3" component="h1" sx={HERO_TITLE}>
                {trip.name}
              </Typography>
              {/* Meta row: 12px on M205, 13px on C205 — the nearest ramp steps. */}
              <Typography
                component="p"
                variant="caption"
                sx={{
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "center",
                  gap: { xs: 1.5, md: 1.75 },
                  fontWeight: 500,
                  color: "var(--hero-fg-muted)",
                  [UP_MD]: { fontSize: 13 },
                }}
              >
                <Box component="span" sx={META_ITEM}>
                  <Icon name="pin" size={13} />
                  {trip.destination.place}
                </Box>
                {review && (
                  <Box component="span" sx={META_ITEM}>
                    <Box component="span" sx={{ display: "inline-flex", color: "brandSource.sunset" }}>
                      <Icon name="star" size={13} filled />
                    </Box>
                    {review.display}
                  </Box>
                )}
              </Typography>
            </Box>
            {/* Below md the heart lives in the sticky price bar (M205). */}
            <IconButton
              component={NextLink}
              href={save}
              aria-label={DETAIL.saveAria(trip.name)}
              sx={{
                display: { xs: "none", md: "inline-flex" },
                width: 40,
                height: 40,
                flexShrink: 0,
                bgcolor: "var(--hero-pill-bg)",
                color: "brandSource.navy",
                "&:hover": { bgcolor: "common.white" },
              }}
            >
              <Icon name="heart" size={18} />
            </IconButton>
          </Box>
        }
      />

      <Container sx={DETAIL_LAYOUT}>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h5" component="h2" sx={{ color: "text.primary" }}>
            {DETAIL.whatItIs}
          </Typography>
          <Typography variant="body2" sx={{ mt: 0.75, mb: 1.75, color: "text.secondary" }}>
            {trip.description}
          </Typography>

          <Box
            component="ul"
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "repeat(2, 1fr)", md: "repeat(4, 1fr)" },
              gap: 1,
              listStyle: "none",
              m: 0,
              p: 0,
            }}
          >
            {trip.highlights.map((highlight) => (
              <AmenityPill key={highlight.text} icon={highlight.icon} label={highlight.text} />
            ))}
          </Box>

          <Typography variant="h5" component="h2" sx={{ mt: { xs: 2.25, md: 1.75 }, color: "text.primary" }}>
            {DETAIL.sampleItinerary}
          </Typography>
          <Box
            component="ol"
            sx={{ m: 0, p: 0, mt: 1, display: "flex", flexDirection: "column", gap: { xs: 0.75, md: 1 }, listStyle: "none" }}
          >
            {trip.sampleItinerary.map((day, index) => (
              <NumberedRow key={day} n={index + 1} label={day} />
            ))}
          </Box>
        </Box>

        {/* Tablet (768–1023): first, full-width under the hero. From 1024: the 340px right rail. */}
        <Box
          component="aside"
          aria-labelledby="detail-aside-heading"
          sx={{ display: "flex", flexDirection: "column", gap: 1.75, order: { md: -1, lg: 0 } }}
        >
          <Typography component="h2" id="detail-aside-heading" sx={VISUALLY_HIDDEN}>
            {DETAIL.asideHeading}
          </Typography>
          <Box sx={{ display: { xs: "none", md: "block" } }}>
            <PriceCard trip={trip} quoteHref={quote} saveHref={save} messageHref={message} />
          </Box>
          <Box sx={{ display: { xs: "none", md: "block" } }}>
            <AdvisorCard variant="planned" title={title} />
          </Box>
          <Box sx={{ mt: 0.5, display: { xs: "flex", md: "none" }, flexDirection: "column", gap: 1.75 }}>
            {/* PriceCard is hidden below md, so its price note would be lost — while the
                sticky bar still shows the price it qualifies. */}
            <Typography variant="caption" component="p" sx={{ color: "text.secondary" }}>
              {trip.priceNote}
            </Typography>
            {/* Tinted surface.2 on phones, where it sits straight on the page background. */}
            <Box sx={{ "& > .MuiPaper-root": { bgcolor: "surface.2" } }}>
              <AdvisorCard variant="planned" title={title} action={{ label: DETAIL.advisor.message, href: message }} />
            </Box>
          </Box>
        </Box>
      </Container>

      {/* §4.4: "'Message Gyasi without an account' is a sticky bottom button on mobile, a
          side rail CTA on tablet/web." The artboard's price/heart/quote row stays row one
          (four controls will not fit 360px), and the guest path wraps to a full-width
          second row rather than being reachable only as a mid-page "Message →" link. */}
      <StickyCta
        primary={{ label: DETAIL.price.requestQuote, href: quote }}
        price={{ from: trip.from, saveHref: save }}
        guest={{ label: DETAIL.price.messageGuest, href: message }}
      />
    </>
  );
}
