// Screen 2.0.5 Public Property / Cruise / Tour Detail — see docs/Screen-Inventory.md §2.0.5
// (Pattern C, §4.4) and design/source-prototype/screens/client-public.jsx (C205_PublicDetail) +
// client-public-mobile.jsx (M205_PublicDetail). P2.
//
// Statically generated for every catalog slug; unknown slugs 404 via `dynamicParams = false`.
// "Message Gyasi without an account" is the Phase 1 prefilled email (Screen Inventory 2.0.5 note).
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
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
          <div className="flex items-end justify-between gap-3 text-white">
            <div className="min-w-0">
              <span className="pill-light t-badge inline-block rounded-md px-2 py-0.75 md:rounded-lg md:px-2.5 md:py-1">
                {tripBadge(trip)}
              </span>
              <h1 className="t-hero-s mt-2 mb-1 text-white md:mb-0.5">{trip.name}</h1>
              {/* Meta row: 12px on M205, 13px on C205 — the nearest ramp steps. */}
              <p className="t-label md:t-label-l flex flex-wrap items-center gap-3 text-white/92 md:gap-3.5">
                <span className="inline-flex items-center gap-1">
                  <Icon name="pin" size={13} />
                  {trip.destination.place}
                </span>
                {review && (
                  <span className="inline-flex items-center gap-1">
                    <Icon name="star" size={13} filled className="text-brand-sunset" />
                    {review.display}
                  </span>
                )}
              </p>
            </div>
            {/* Below md the heart lives in the sticky price bar (M205). */}
            <Link
              href={save}
              className="btn-icon hidden size-10 shrink-0 rounded-full bg-white/92 text-brand-navy md:inline-flex"
              aria-label={DETAIL.saveAria(trip.name)}
            >
              <Icon name="heart" size={18} />
            </Link>
          </div>
        }
      />

      <Container className="detail-layout pt-4.5 pb-4.5 md:pt-5 md:pb-8">
        <div className="min-w-0">
          <h2 className="t-title-l text-on-surface">{DETAIL.whatItIs}</h2>
          <p className="t-body mt-1.5 mb-3.5 text-on-surface-variant">{trip.description}</p>

          <ul className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {trip.highlights.map((highlight) => (
              <AmenityPill key={highlight.text} icon={highlight.icon} label={highlight.text} />
            ))}
          </ul>

          <h2 className="t-title-l mt-4.5 text-on-surface md:mt-3.5">{DETAIL.sampleItinerary}</h2>
          <ol className="mt-2 flex flex-col gap-1.5 md:gap-2">
            {trip.sampleItinerary.map((day, index) => (
              <NumberedRow key={day} n={index + 1} label={day} />
            ))}
          </ol>
        </div>

        {/* Tablet (768–1023): first, full-width under the hero. From 1024: the 340px right rail.
            `lg:` is the one public-page use of the 1024 breakpoint, because `.detail-layout`
            (public.css) splits into two columns at exactly that width (fidelity spec §2.0.5). */}
        <aside aria-labelledby="detail-aside-heading" className="flex flex-col gap-3.5 md:order-first lg:order-none">
          <h2 id="detail-aside-heading" className="sr-only">
            {DETAIL.asideHeading}
          </h2>
          <PriceCard trip={trip} quoteHref={quote} saveHref={save} messageHref={message} className="hidden md:block" />
          <div className="hidden md:block">
            <AdvisorCard variant="planned" title={title} />
          </div>
          <div className="mt-1 md:hidden">
            <AdvisorCard
              variant="planned"
              title={title}
              action={{ label: DETAIL.advisor.message, href: message }}
              className="bg-surface-2"
            />
          </div>
        </aside>
      </Container>

      <StickyCta primary={{ label: DETAIL.price.requestQuote, href: quote }} price={{ from: trip.from, saveHref: save }} />
    </>
  );
}
