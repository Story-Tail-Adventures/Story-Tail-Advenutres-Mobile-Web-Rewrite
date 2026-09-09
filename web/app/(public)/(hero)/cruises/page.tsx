// Screen 2.0.9 Cruises — see docs/Screen-Inventory.md §2.0.9 (Pattern H, §4.4) and
// design/source-prototype/screens/client-public-topics.jsx (C209_Cruises) +
// client-public-mobile.jsx (M209_Cruises). P2 (built ahead of phase, September 2026).
import type { Metadata } from "next";
import Link from "next/link";
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

      <Container size="wide" className="pt-4.5 pb-6 md:pt-8 md:pb-14">
        {/* Who it's for — three media cards; image-beside-text rows below md. */}
        <section aria-labelledby={TYPES_HEADING_ID}>
          <SectionLabel
            id={TYPES_HEADING_ID}
            overline={CRUISES_TYPES_SECTION.overline}
            title={CRUISES_TYPES_SECTION.title}
            sub={CRUISES_TYPES_SECTION.sub}
          />
          <div className="mb-4.5 grid gap-2.5 md:mb-9 md:grid-cols-3 md:gap-3.5">
            {CRUISES_TYPES.map((type) => (
              <MediaCard key={type.tag} image={type.image} tag={type.tag} title={type.title} body={type.body} />
            ))}
          </div>
        </section>

        {/* Lines we book — display chips, in the designer's order. */}
        <section aria-labelledby={LINES_HEADING_ID}>
          <SectionLabel
            id={LINES_HEADING_ID}
            overline={CRUISES_LINES_SECTION.overline}
            title={CRUISES_LINES_SECTION.title}
          />
          <ul aria-labelledby={LINES_HEADING_ID} className="mb-4.5 flex flex-wrap gap-1.5 md:mb-9 md:gap-2">
            {CRUISE_LINES.map((line) => (
              <li key={line.slug} className="chip h-auto px-2.5 py-1.5 md:px-3.5 md:py-2">
                {line.name}
              </li>
            ))}
          </ul>
        </section>

        {/* Hand-picked sailings — every trip placed on this topic, in the designer's order.
            `md:max-web:` keeps the tablet column count from outranking `web:` (globals.css declares
            --breakpoint-web in px while md is rem, so Tailwind emits web: before md:). */}
        <section aria-labelledby={SAILINGS_HEADING_ID}>
          <SectionLabel
            id={SAILINGS_HEADING_ID}
            overline={cruisesTripsOverline(trips.length)}
            title={CRUISES_TRIPS.title}
          />
          <div className="mb-3 grid gap-2.5 md:mb-6 md:max-web:grid-cols-2 md:gap-3.5 web:grid-cols-3">
            {trips.map((trip) => (
              <TripTile key={trip.slug} trip={trip} topic={TOPIC} next={CRUISES_PATH} />
            ))}
          </div>
          <div className="mb-6 flex justify-center md:mb-9">
            <Link href={allSailingsHref} className="btn btn-tonal w-full md:w-auto">
              {cruisesSeeAllLabel(total)}
            </Link>
          </div>
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
