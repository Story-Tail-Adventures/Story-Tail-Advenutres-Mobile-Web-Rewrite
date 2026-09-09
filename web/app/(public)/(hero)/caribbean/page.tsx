// Screen 2.0.8 Caribbean — see docs/Screen-Inventory.md §2.0.8 (Pattern H, §4.4) and
// design/source-prototype/screens/client-public-topics.jsx (C208_Caribbean) +
// client-public-mobile.jsx (M208_Caribbean). P2 (built ahead of phase, September 2026).
import type { Metadata } from "next";
import Link from "next/link";
import { Fragment } from "react";
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
import { joinHref } from "@/lib/public/links";
import { countByTopic, resultsHref, tripsForTopic } from "@/lib/public/search";
import {
  CARIBBEAN_CLOSING,
  CARIBBEAN_HERO,
  CARIBBEAN_HERO_IMAGE,
  CARIBBEAN_INQUIRY_FIELDS,
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
 * Pattern H topic page. Everything is a Server Component: the inquiry bar is display text
 * plus a link, tiles link to the detail page or the sign-up gate, and the mobile sticky bar
 * replaces the inquiry bar below `md` (Screen Inventory §4.4).
 */
export default function CaribbeanPage() {
  const trips = tripsForTopic(TRIPS, TOPIC);
  const total = countByTopic(TRIPS, TOPIC);
  const quoteHref = joinHref({ intent: "quote", next: CARIBBEAN_PATH });
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

      <InquiryBar
        sticky
        fields={CARIBBEAN_INQUIRY_FIELDS}
        action={{ label: REQUEST_QUOTE, href: quoteHref, icon: "message" }}
      />

      <Container size="wide" className="pt-4.5 pb-6 md:pt-8 md:pb-14">
        {/* Intro band — icon-square rows on mobile (M208), bare-icon stacks from md (C208). */}
        <div className="mb-4.5 grid gap-2.5 md:mb-9 md:grid-cols-3 md:gap-3.5">
          {CARIBBEAN_INTRO.map((point) => (
            <Fragment key={point.title}>
              <FeatureCard
                icon={point.icon}
                iconTone="primary"
                iconSize={32}
                layout="row"
                card={false}
                title={point.title}
                body={point.body}
                titleClass="t-title-s"
                className="md:hidden"
              />
              <FeatureCard
                icon={point.icon}
                iconTone="bare"
                layout="stack"
                card={false}
                title={point.title}
                body={point.body}
                className="max-md:hidden px-4 py-3.5"
              />
            </Fragment>
          ))}
        </div>

        {/* Islands — one row of six from web, two rows of three on tablet, a snap strip below md.
            `md:max-web:` scopes the tablet column count to 768–1199 so it cannot outrank `web:`:
            globals.css declares --breakpoint-web in px while md is rem, and Tailwind emits the
            unsortable web: block before md:, so a plain `md:grid-cols-3 web:grid-cols-6` stays at 3. */}
        <section aria-labelledby={ISLANDS_HEADING_ID}>
          <SectionLabel
            id={ISLANDS_HEADING_ID}
            overline={CARIBBEAN_ISLANDS.overline}
            title={CARIBBEAN_ISLANDS.title}
            sub={CARIBBEAN_ISLANDS.sub}
          />
          <div className="mb-9 hidden gap-2.5 md:grid md:max-web:grid-cols-3 web:grid-cols-6">
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
          </div>
          <div className="h-scroll mb-4.5 md:hidden">
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
          </div>
        </section>

        {/* Hand-picked trips — every trip placed on this topic, in the designer's order. */}
        <section aria-labelledby={TRIPS_HEADING_ID}>
          <SectionLabel
            id={TRIPS_HEADING_ID}
            overline={caribbeanTripsOverline(trips.length)}
            title={CARIBBEAN_TRIPS.title}
            sub={CARIBBEAN_TRIPS.sub}
          />
          <div className="mb-3 grid gap-2.5 md:mb-6 md:max-web:grid-cols-2 md:gap-3.5 web:grid-cols-3">
            {trips.map((trip) => (
              <TripTile key={trip.slug} trip={trip} topic={TOPIC} next={CARIBBEAN_PATH} />
            ))}
          </div>
          <div className="mb-6 flex justify-center md:mb-9">
            <Link href={browseHref} className="btn btn-tonal w-full md:w-auto">
              {caribbeanSeeAllLabel(total)}
            </Link>
          </div>
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
