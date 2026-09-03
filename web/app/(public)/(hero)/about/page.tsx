// Screen 2.0.11 About Gyasi — see docs/Screen-Inventory.md §2.0.11 (Pattern H + I, §4.4) and
// design/source-prototype/screens/client-public-topics.jsx (C2011_AboutGyasi) +
// client-public-mobile.jsx (M2011_AboutGyasi). P1-eligible.
import type { Metadata } from "next";
import * as React from "react";
import { ClosingCta } from "@/components/public/ClosingCta";
import { Container } from "@/components/public/Container";
import { CredentialCard } from "@/components/public/CredentialCard";
import { FaqList } from "@/components/public/FaqList";
import { SectionLabel } from "@/components/public/SectionLabel";
import { StatStrip } from "@/components/public/StatStrip";
import { StickyCta } from "@/components/public/StickyCta";
import { TestimonialCard } from "@/components/public/TestimonialCard";
import { GYASI_FAQ } from "@/content/public/faq/gyasi";
import { TESTIMONIALS } from "@/content/public/proof";
import { staImg } from "@/lib/images";
import { inquiryHref } from "@/lib/public/inquiry";
import { joinHref } from "@/lib/public/links";
import { AdvisorHero } from "./AdvisorHero";
import { ABOUT, ABOUT_CREDENTIALS, ABOUT_STATS, type RichText } from "./content";

const PATH = "/about";

export const metadata: Metadata = {
  title: ABOUT.meta.title,
  description: ABOUT.meta.description,
  alternates: { canonical: PATH },
  openGraph: {
    title: ABOUT.meta.title,
    description: ABOUT.meta.description,
    url: PATH,
    images: [{ url: staImg("sunset", 1200, 630), width: 1200, height: 630 }],
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

export default function AboutGyasiPage() {
  const quoteHref = joinHref({ intent: "quote", next: PATH });
  const messageHref = inquiryHref({ source: "about" });

  return (
    <>
      <AdvisorHero
        overline={ABOUT.hero.overline}
        title={ABOUT.hero.title}
        script={ABOUT.hero.script}
        lead={ABOUT.hero.lead}
        primary={{ label: ABOUT.hero.primary, href: quoteHref }}
        secondary={{ label: ABOUT.hero.secondary, href: messageHref }}
      />

      <StatStrip stats={ABOUT_STATS} />

      <Container size="wide" className="pt-5 pb-6 md:pt-10 md:pb-14">
        {/* Bio + credentials */}
        <div className="bio-grid mb-8 md:mb-11">
          <section aria-labelledby="story">
            <SectionLabel id="story" overline={ABOUT.story.overline} title={ABOUT.story.title} />
            <div className="t-body-l max-w-160 text-pretty text-on-surface">
              {ABOUT.story.paragraphs.map((paragraph, index) => (
                <p key={index} className="mb-3.5 last:mb-0">
                  <Rich parts={paragraph} />
                </p>
              ))}
            </div>
            <p className="t-script-sign text-script-accent mt-3 md:mt-4.5">{ABOUT.story.signature}</p>
          </section>

          <section aria-labelledby="credentials">
            <SectionLabel id="credentials" overline={ABOUT.credentials.overline} title={ABOUT.credentials.title} />
            <ul className="flex flex-col gap-1.5 md:gap-2">
              {ABOUT_CREDENTIALS.map((credential) => (
                <CredentialCard key={credential.display} title={credential.display} detail={credential.detail} />
              ))}
            </ul>
          </section>
        </div>

        {/* Testimonials — snap strip below `md`, 2-up at tablet, 3-up on web. */}
        <section aria-labelledby="testimonials" className="mb-8 md:mb-11">
          <SectionLabel id="testimonials" overline={ABOUT.testimonials.overline} title={ABOUT.testimonials.title} />
          <ul className="h-scroll md:mx-0 md:grid md:grid-cols-2 md:gap-3.5 md:overflow-visible md:px-0 md:pb-0 web:grid-cols-3">
            {TESTIMONIALS.map((testimonial) => (
              <li key={testimonial.who} className="flex w-72 md:w-auto">
                <TestimonialCard testimonial={testimonial} className="flex-1" />
              </li>
            ))}
          </ul>
        </section>

        {/* FAQ — the five desktop questions. */}
        <section aria-labelledby="faq" className="mb-8 md:mb-11">
          <SectionLabel id="faq" overline={ABOUT.faq.overline} title={ABOUT.faq.title} />
          <FaqList items={GYASI_FAQ} answerSize="m" />
        </section>

        <ClosingCta
          image="sunset"
          title={ABOUT.closing.title}
          body={ABOUT.closing.body}
          primary={{ label: ABOUT.closing.primary, href: quoteHref }}
          secondary={{ label: ABOUT.closing.secondary, href: messageHref }}
        />
      </Container>

      <StickyCta
        primary={{ label: ABOUT.sticky.primary, href: quoteHref }}
        secondary={{ label: ABOUT.sticky.secondary, href: messageHref }}
      />
    </>
  );
}
