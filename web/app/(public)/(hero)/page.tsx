// Screen 2.0.1 App Subdomain Public Landing — see docs/Screen-Inventory.md §2.0.1 (Pattern H,
// §4.4) and design/source-prototype/screens/client-public.jsx (C201_PublicLanding) +
// client-public-mobile.jsx (M201_PublicLanding). P1.
import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/public/Container";
import { FeatureCard } from "@/components/public/FeatureCard";
import { HeroBleed } from "@/components/public/HeroBleed";
import { ScriptureLine } from "@/components/public/ScriptureLine";
import { Icon } from "@/components/ui/Icon";
import { env } from "@/lib/env";
import { staImg } from "@/lib/images";
import { LANDING, landingJsonLd, serializeJsonLd } from "./content";

export const metadata: Metadata = {
  title: { absolute: LANDING.meta.title },
  description: LANDING.meta.description,
  alternates: { canonical: "/" },
  openGraph: {
    title: LANDING.meta.title,
    description: LANDING.meta.description,
    url: "/",
    images: [{ url: staImg("turks", 1200, 630), width: 1200, height: 630 }],
  },
};

const [firstVerse, secondVerse] = LANDING.scripture;

export default function LandingPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(landingJsonLd(env.siteUrl)) }}
      />

      <HeroBleed
        image="turks"
        size="fill"
        scrim="landing"
        align="center"
        contentWidth={660}
        titleClass="t-hero-l"
        overline={LANDING.overline}
        title={LANDING.title}
        script={LANDING.script}
        sub={LANDING.sub}
      >
        {/* CTAs from `md` up — desktop order (C201): Sign in leads. */}
        <div className="mt-5.5 hidden gap-2.5 md:flex md:flex-wrap">
          <Link href="/login" className="btn btn-orange btn-lg">
            {LANDING.cta.signIn}
          </Link>
          <Link href="/join" className="btn btn-glass btn-lg">
            {LANDING.cta.create}
          </Link>
          <Link href="/how-it-works" className="btn btn-text btn-lg text-white">
            {LANDING.cta.tour}
          </Link>
        </div>
        {/* CTAs below `md` — the mobile artboard (M201) leads with Create an account, full width. */}
        <div className="mt-6 flex w-full flex-col gap-2 md:hidden">
          <Link href="/join" className="btn btn-orange btn-lg w-full">
            {LANDING.cta.create}
          </Link>
          <Link href="/login" className="btn btn-glass btn-lg w-full">
            {LANDING.cta.signIn}
          </Link>
          <Link href="/how-it-works" className="btn btn-text btn-sm text-white/85">
            {LANDING.cta.tour}
          </Link>
        </div>

        {/* Scripture strip — one line on mobile, both from `md`. */}
        <div className="mt-4.5 flex flex-wrap items-baseline gap-x-4.5 gap-y-1.5 border-t border-white/18 pt-3.5 text-white/78 md:mt-6 md:pt-4">
          <ScriptureLine tone="on-photo" quote={firstVerse.quote} reference={firstVerse.reference} />
          <span className="hidden md:contents">
            <span aria-hidden="true" className="opacity-30">
              ·
            </span>
            <ScriptureLine tone="on-photo" quote={secondVerse.quote} reference={secondVerse.reference} />
          </span>
        </div>

        {/* Glass chips — desktop artboard only; on mobile the menu and footer carry these links. */}
        <div className="mt-4.5 hidden gap-2.5 md:flex md:flex-wrap">
          <Link href="/explore" className="chip chip-glass">
            {LANDING.chips.browse}
          </Link>
          <a
            href={LANDING.chips.marketing.href}
            target="_blank"
            rel="noopener noreferrer"
            className="chip chip-glass"
          >
            <Icon name="external" size={12} /> {LANDING.chips.marketing.label}
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        </div>
      </HeroBleed>

      {/* "What you can do here" — mobile artboard section, kept through tablet as a 3-up grid. */}
      <section aria-labelledby="landing-features" className="web:hidden bg-bg">
        <Container size="wide" className="py-6 pb-7.5 md:py-8">
          <h2 id="landing-features" className="t-label-s text-brand-orange">
            {LANDING.features.overline}
          </h2>
          <div className="mt-2.5 flex flex-col gap-2.5 md:grid md:grid-cols-3">
            {LANDING.features.items.map((feature) => (
              <FeatureCard
                key={feature.title}
                layout="row"
                iconSize={36}
                icon={feature.icon}
                title={feature.title}
                body={feature.body}
                titleClass="t-title-s"
              />
            ))}
          </div>
        </Container>
      </section>
    </>
  );
}
