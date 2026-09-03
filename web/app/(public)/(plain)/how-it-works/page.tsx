// Screen 2.0.2 About / How It Works — see docs/Screen-Inventory.md §2.0.2 (Pattern I (H),
// §4.4) and design/source-prototype/screens/client-public.jsx (C202_About) +
// client-public-mobile.jsx (M202_About). P2.
import type { Metadata } from "next";
import Link from "next/link";
import * as React from "react";
import { AdvisorCard } from "@/components/public/AdvisorCard";
import { Container } from "@/components/public/Container";
import { FaqList } from "@/components/public/FaqList";
import { FeatureCard } from "@/components/public/FeatureCard";
import { ScriptureLine } from "@/components/public/ScriptureLine";
import { StickyCta } from "@/components/public/StickyCta";
import { Icon } from "@/components/ui/Icon";
import { HOW_IT_WORKS_FAQ } from "@/content/public/faq/how-it-works";
import { staImg } from "@/lib/images";
import { inquiryHref } from "@/lib/public/inquiry";
import { joinHref, loginHref } from "@/lib/public/links";
import { HOW_IT_WORKS, type RichText } from "./content";

const PATH = "/how-it-works";

export const metadata: Metadata = {
  title: HOW_IT_WORKS.meta.title,
  description: HOW_IT_WORKS.meta.description,
  alternates: { canonical: PATH },
  openGraph: {
    title: HOW_IT_WORKS.meta.title,
    description: HOW_IT_WORKS.meta.description,
    url: PATH,
    images: [{ url: staImg("turks", 1200, 630), width: 1200, height: 630 }],
  },
};

function Rich({ parts }: { parts: RichText }) {
  return (
    <>
      {parts.map((part, index) =>
        typeof part === "string" ? (
          <React.Fragment key={index}>{part}</React.Fragment>
        ) : (
          <i key={index}>{part.em}</i>
        ),
      )}
    </>
  );
}

export default function HowItWorksPage() {
  const quoteHref = joinHref({ intent: "quote", next: PATH });
  const messageHref = inquiryHref({ source: "how-it-works" });
  const { heart, closing } = HOW_IT_WORKS;

  return (
    <>
      <Container size="prose" className="pt-5 pb-6 md:pt-8 md:pb-12">
        <header>
          <p className="t-label-s text-brand-orange">{HOW_IT_WORKS.overline}</p>
          <h1 className="t-page-title mt-1 mb-1.5 text-on-surface">{HOW_IT_WORKS.title}</h1>
          <p className="t-body-l max-w-180 text-on-surface-variant">{HOW_IT_WORKS.lead}</p>
        </header>

        {/* Steps */}
        <ol className="mt-4.5 flex flex-col gap-2.5 md:mt-6 md:grid md:grid-cols-3 md:gap-4">
          {HOW_IT_WORKS.steps.map((step) => (
            <li key={step.overline} className="flex">
              <FeatureCard
                icon={step.icon}
                iconSize={40}
                overline={step.overline}
                title={step.title}
                body={step.body}
                className="flex-1"
              />
            </li>
          ))}
        </ol>

        {/* Our heart — why we do this */}
        <section
          aria-labelledby="our-heart"
          className="panel-heart relative mt-5.5 overflow-hidden rounded-lg p-4.5 pb-5 md:mt-7 md:p-6 md:pb-6.5"
        >
          <div aria-hidden="true" className="glow-orange absolute -top-10 -right-10 size-60 rounded-full" />
          <div className="relative">
            <p className="t-label-s text-brand-orange">{heart.overline}</p>
            <h2 id="our-heart" className="t-section mt-1 mb-1.5 max-w-190 text-on-surface">
              <Rich parts={heart.title} />
            </h2>
            <p className="t-body mb-3 max-w-180 text-on-surface-variant md:mb-4.5">{heart.intro}</p>

            <div className="flex flex-col gap-2 md:grid md:grid-cols-2 md:gap-3.5">
              {heart.pillars.map((pillar) => (
                <FeatureCard
                  key={pillar.overline}
                  icon={pillar.icon}
                  iconTone={pillar.tone}
                  iconSize={44}
                  overline={pillar.overline}
                  title={pillar.title}
                  body={pillar.body}
                  className="md:p-5"
                  footer={
                    <ScriptureLine
                      tone="surface"
                      quote={pillar.scripture.quote}
                      reference={pillar.scripture.reference}
                    />
                  }
                />
              ))}
            </div>

            {/* Design-System §2.4: the explicit welcome line. */}
            <div className="mt-3 flex items-center gap-2.5 rounded-md bg-surface-1 px-4 py-3 md:mt-4">
              <Icon name="info" size={16} className="shrink-0 text-on-surface-variant" />
              <p className="t-body-s text-on-surface-variant">
                <b className="font-semibold text-on-surface">{heart.welcome.strong}</b> {heart.welcome.rest}
              </p>
            </div>
          </div>
        </section>

        <AdvisorCard variant="bio" className="mt-5.5 md:mt-6" />

        {/* FAQ — the four desktop questions (the mobile artboard's three are a subset in spirit). */}
        <section aria-labelledby="faq" className="mt-5.5 md:mt-6">
          <h2 id="faq" className="t-title-l text-on-surface">
            {HOW_IT_WORKS.faqTitle}
          </h2>
          <FaqList items={HOW_IT_WORKS_FAQ} className="mt-2 md:mt-2.5" />
        </section>

        {/* Closing panel — stacked below `md`, where the sticky bar also carries the CTA. */}
        <section
          aria-labelledby="closing"
          className="mt-6 flex flex-col gap-4 rounded-lg bg-primary-container p-5 text-on-primary-container md:mt-7.5 md:flex-row md:items-center"
        >
          <div className="flex-1">
            <h2 id="closing" className="t-title-l">
              {closing.title}
            </h2>
            <p className="t-body-s mt-1 opacity-85">
              {closing.bodyBefore}
              <a href={messageHref} className="underline underline-offset-2">
                {closing.bodyLink}
              </a>
              {closing.bodyAfter}
            </p>
          </div>
          <Link href="/join" className="btn btn-filled btn-invert w-full shrink-0 md:w-auto">
            {closing.cta}
          </Link>
        </section>
      </Container>

      <StickyCta
        primary={{ label: HOW_IT_WORKS.sticky.primary, href: quoteHref }}
        secondary={{ label: HOW_IT_WORKS.sticky.secondary, href: loginHref() }}
      />
    </>
  );
}
