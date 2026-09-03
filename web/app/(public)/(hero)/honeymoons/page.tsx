// Screen 2.0.10 Honeymoons — see docs/Screen-Inventory.md §2.0.10 (Pattern H, §4.4) and
// design/source-prototype/screens/client-public-topics.jsx (C2010_Honeymoons) +
// client-public-mobile.jsx (M2010_Honeymoons). P2 (built ahead of phase, September 2026).
import type { Metadata } from "next";
import Link from "next/link";
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
import { inquiryHref } from "@/lib/public/inquiry";
import { joinHref } from "@/lib/public/links";
import { resultsHref, tripsForTopic } from "@/lib/public/search";
import {
  HONEYMOONS_CHRISTIAN_CARD,
  HONEYMOONS_CLOSING,
  HONEYMOONS_FEATURED,
  HONEYMOONS_HERO,
  HONEYMOONS_HERO_IMAGE,
  HONEYMOONS_INQUIRY_FIELDS,
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

/**
 * Pattern H topic page with the tall hero. The curated-list link filters results to the
 * honeymoon vibe; "Message Gyasi" is the guest inquiry (email, or the gate when no address
 * is configured).
 */
export default function HoneymoonsPage() {
  const trips = tripsForTopic(TRIPS, TOPIC);
  const quoteHref = joinHref({ intent: "quote", next: HONEYMOONS_PATH });
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

      <InquiryBar
        sticky
        fields={HONEYMOONS_INQUIRY_FIELDS}
        action={{ label: REQUEST_QUOTE, href: quoteHref, icon: "message" }}
      />

      <Container size="wide" className="pt-4.5 pb-6 md:pt-8 md:pb-14">
        {/* Gyasi's letter */}
        <AdvisorCard
          variant="note"
          overline={HONEYMOONS_NOTE.overline}
          className="mb-5 md:mb-9"
          body={
            <p>
              {HONEYMOONS_NOTE.before}
              <i>{HONEYMOONS_NOTE.question}</i>
              {HONEYMOONS_NOTE.after}
            </p>
          }
        />

        {/* Three ways to honeymoon — media cards; image-beside-text rows below md. */}
        <section aria-labelledby={STYLES_HEADING_ID}>
          <SectionLabel
            id={STYLES_HEADING_ID}
            overline={HONEYMOONS_STYLES_SECTION.overline}
            title={HONEYMOONS_STYLES_SECTION.title}
          />
          <div className="mb-5 grid gap-2.5 md:mb-9 md:grid-cols-3 md:gap-3.5">
            {HONEYMOONS_STYLES.map((style) => (
              <MediaCard key={style.tag} image={style.image} tag={style.tag} title={style.title} body={style.body} />
            ))}
          </div>
        </section>

        {/* Featured packages — every trip placed on this topic, in the designer's order.
            `md:max-web:` keeps the tablet column count from outranking `web:` (globals.css declares
            --breakpoint-web in px while md is rem, so Tailwind emits web: before md:). */}
        <section aria-labelledby={FEATURED_HEADING_ID}>
          <SectionLabel
            id={FEATURED_HEADING_ID}
            overline={honeymoonsFeaturedOverline(trips.length)}
            title={HONEYMOONS_FEATURED.title}
          />
          <div className="mb-5 grid gap-2.5 md:mb-9 md:max-web:grid-cols-2 md:gap-3.5 web:grid-cols-3">
            {trips.map((trip) => (
              <TripTile key={trip.slug} trip={trip} topic={TOPIC} next={HONEYMOONS_PATH} />
            ))}
          </div>
        </section>

        {/* Opt-in card for couples who want a faith-shaped rhythm to the week (Screen Inventory
            §2.0.10). Colours are container roles so the panel survives the dark tropical scheme. */}
        <section
          aria-labelledby={CHRISTIAN_HEADING_ID}
          className="christian-card christian-card-grid mb-5 overflow-hidden rounded-lg p-4.5 md:mb-9 md:p-7 md:px-8"
        >
          <div>
            <p className="t-label-s text-on-primary-container">{HONEYMOONS_CHRISTIAN_CARD.overline}</p>
            <h3 id={CHRISTIAN_HEADING_ID} className="t-headline-r mt-1 mb-2 text-on-primary-container">
              {HONEYMOONS_CHRISTIAN_CARD.title}
            </h3>
            <p className="t-body max-w-135 text-on-primary-container opacity-85">{HONEYMOONS_CHRISTIAN_CARD.body}</p>
            <div className="mt-4 flex flex-wrap gap-2.5">
              <Link href={quoteHref} className="btn btn-filled">
                {HONEYMOONS_CHRISTIAN_CARD.primary}
              </Link>
              <Link href={curatedHref} className="btn btn-text">
                {HONEYMOONS_CHRISTIAN_CARD.secondary}
              </Link>
            </div>
          </div>
          <div className="relative hidden aspect-5/4 overflow-hidden rounded-lg md:block">
            <Photo image={HONEYMOONS_CHRISTIAN_CARD.image} fill sizes="280px" alt="" className="object-cover" />
          </div>
        </section>

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
