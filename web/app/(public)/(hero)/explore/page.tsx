// Screen 2.0.3 Public Search Landing — see docs/Screen-Inventory.md §2.0.3 (Pattern F entry,
// §4.4) and design/source-prototype/screens/client-public.jsx (C203_PublicSearchLanding) +
// client-public-mobile.jsx (M203_PublicSearchLanding). P2.
import type { Metadata } from "next";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import { Container } from "@/components/public/Container";
import { HeroBleed } from "@/components/public/HeroBleed";
import { PhotoTile } from "@/components/public/PhotoTile";
import { SigninBanner } from "@/components/public/SigninBanner";
import { StickyCta } from "@/components/public/StickyCta";
import { Icon } from "@/components/ui/Icon";
import { INSPIRATION_TILES } from "@/content/public/inspiration";
import { trustLine } from "@/content/public/proof";
import { TRIPS } from "@/content/public/trips";
import { staImg, type ImageKey } from "@/lib/images";
import { UP_MD } from "@/lib/mui/sx";
import { loginHref } from "@/lib/public/links";
import { filterTrips, resultsHref } from "@/lib/public/search";
import { EXPLORE, tileSearchQuery, tripCountLabel } from "./content";
import { SearchBar, STACKED_SEARCH_FORM_ID } from "./SearchBar";

const HERO_IMAGE: ImageKey = "bahamas";
const PATH = "/explore";

export const metadata: Metadata = {
  title: EXPLORE.meta.title,
  description: EXPLORE.meta.description,
  alternates: { canonical: PATH },
  openGraph: {
    title: EXPLORE.meta.title,
    description: EXPLORE.meta.description,
    url: PATH,
    images: [{ url: staImg(HERO_IMAGE, 1200, 630), width: 1200, height: 630 }],
  },
};

export default function ExplorePage() {
  return (
    <>
      <HeroBleed
        image={HERO_IMAGE}
        size="compact"
        scrim="navy"
        align="center"
        titleClass="t-hero-s"
        overline={EXPLORE.hero.overline}
        title={EXPLORE.hero.title}
      >
        {/* C203: the pill sits inside the 760px copy column, 12px under the h1 (md+ only). */}
        <Box sx={{ mt: { md: 1.5 } }}>
          <SearchBar variant="pill" />
        </Box>
      </HeroBleed>

      {/* M203: below md the same form is a stacked card in the body, not in the hero. */}
      <Container sx={{ pt: 2, display: { md: "none" } }}>
        <SearchBar variant="stacked" />
      </Container>

      <SigninBanner next={PATH} />

      <Container as="section" sx={{ pt: { xs: 2.75, md: 3 }, pb: { xs: 3, md: 4 } }}>
        <Typography variant="h5" component="h2" sx={{ color: "text.primary" }}>
          {EXPLORE.inspiration.title}
        </Typography>
        <Typography
          variant="caption"
          component="p"
          sx={{ mt: 0.5, mb: { xs: 1.25, md: 1.75 }, color: "text.secondary" }}
        >
          {EXPLORE.inspiration.sub}
        </Typography>
        <Box
          component="ul"
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "repeat(2, 1fr)", md: "repeat(3, 1fr)" },
            gap: { xs: 1, md: 1.75 },
            listStyle: "none",
            m: 0,
            p: 0,
          }}
        >
          {INSPIRATION_TILES.map((tile) => {
            const query = tileSearchQuery(tile);
            return (
              // 5/4 on phones, 5/3 from `md` (the C203 tiles). PhotoTile takes one aspect, so
              // the tablet-and-up ratio is set from the list item onto the tile's Card root.
              <Box component="li" key={tile.slug} sx={{ "& > .MuiCard-root": { [UP_MD]: { aspectRatio: "5 / 3" } } }}>
                <PhotoTile
                  image={tile.imageKey}
                  label={tile.title}
                  sub={tripCountLabel(filterTrips(TRIPS, query).length)}
                  href={resultsHref(query)}
                  aspect="5/4"
                  sizes="(min-width: 1200px) 400px, (min-width: 768px) 33vw, 50vw"
                />
              </Box>
            );
          })}
        </Box>

        {/* Trust row — every figure comes from the claims registry via trustLine(). */}
        <Paper
          elevation={0}
          sx={{
            display: "flex",
            alignItems: { xs: "center", md: "flex-start" },
            gap: { xs: 1.25, md: 2 },
            mt: { xs: 2.25, md: 2.75 },
            p: { xs: 1.75, md: 2.25 },
            bgcolor: "surface.2",
          }}
        >
          <Box component="span" sx={{ display: "inline-flex", flexShrink: 0, color: "secondary.main" }}>
            <Icon name="shield" size={20} />
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="subtitle1" component="h2" sx={{ color: "text.primary" }}>
              {EXPLORE.trust.title}
            </Typography>
            <Typography variant="caption" component="p" sx={{ color: "text.secondary" }}>
              {trustLine()}
            </Typography>
          </Box>
        </Paper>
      </Container>

      <StickyCta
        primary={{
          label: EXPLORE.sticky.primary,
          submitFor: STACKED_SEARCH_FORM_ID,
          icon: "search",
        }}
        secondary={{ label: EXPLORE.sticky.secondary, href: loginHref(PATH) }}
        secondarySignedIn={{ label: EXPLORE.sticky.secondarySignedIn, href: "/dashboard" }}
      />
    </>
  );
}
