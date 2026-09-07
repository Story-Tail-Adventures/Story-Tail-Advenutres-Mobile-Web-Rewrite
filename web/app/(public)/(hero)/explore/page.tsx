// Screen 2.0.3 Public Search Landing — see docs/Screen-Inventory.md §2.0.3 (Pattern F entry,
// §4.4) and design/source-prototype/screens/client-public.jsx (C203_PublicSearchLanding) +
// client-public-mobile.jsx (M203_PublicSearchLanding). P2.
import type { Metadata } from "next";
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
        <SearchBar variant="pill" className="md:mt-3" />
      </HeroBleed>

      {/* M203: below md the same form is a stacked card in the body, not in the hero. */}
      <Container className="pt-4 md:hidden">
        <SearchBar variant="stacked" />
      </Container>

      <SigninBanner next={PATH} />

      <Container as="section" className="pt-5.5 pb-6 md:pt-6 md:pb-8">
        <h2 className="t-title-l text-on-surface">{EXPLORE.inspiration.title}</h2>
        <p className="t-body-s mt-1 mb-2.5 text-on-surface-variant md:mb-3.5">{EXPLORE.inspiration.sub}</p>
        <ul className="grid grid-cols-2 gap-2 md:grid-cols-3 md:gap-3.5">
          {INSPIRATION_TILES.map((tile) => {
            const query = tileSearchQuery(tile);
            return (
              <li key={tile.slug}>
                <PhotoTile
                  image={tile.imageKey}
                  label={tile.title}
                  sub={tripCountLabel(filterTrips(TRIPS, query).length)}
                  href={resultsHref(query)}
                  aspect="5/4"
                  className="md:aspect-5/3"
                  sizes="(min-width: 1200px) 400px, (min-width: 768px) 33vw, 50vw"
                />
              </li>
            );
          })}
        </ul>

        {/* Trust row — every figure comes from the claims registry via trustLine(). */}
        <div className="mt-4.5 flex items-center gap-2.5 rounded-2xl bg-surface-2 p-3.5 md:mt-5.5 md:items-start md:gap-4 md:p-4.5">
          <Icon name="shield" size={20} className="shrink-0 text-secondary" />
          <div className="min-w-0">
            <h2 className="t-title-s text-on-surface">{EXPLORE.trust.title}</h2>
            <p className="t-body-s text-on-surface-variant">{trustLine()}</p>
          </div>
        </div>
      </Container>

      <StickyCta
        primary={{
          label: EXPLORE.sticky.primary,
          submitFor: STACKED_SEARCH_FORM_ID,
          icon: "search",
        }}
        secondary={{ label: EXPLORE.sticky.secondary, href: loginHref(PATH) }}
      />
    </>
  );
}
