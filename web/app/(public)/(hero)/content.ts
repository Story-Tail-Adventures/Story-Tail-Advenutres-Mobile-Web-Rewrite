// Screen 2.0.1 App Subdomain Public Landing — copy module. Desktop copy (C201) is the source;
// the mobile artboard (M201) adds the "WHAT YOU CAN DO HERE" section and flips the CTA order.
import type { IconName } from "@/components/ui/Icon";
import { MARKETING_SITE_LABEL, MARKETING_SITE_URL } from "@/content/public/contact";
import { claim } from "@/content/public/proof";

export interface LandingFeature {
  icon: IconName;
  title: string;
  body: string;
}

export const LANDING = {
  meta: {
    /** Absolute so the root layout's "%s · Story-Tail Adventures" template does not double the brand. */
    title: "Story-Tail Adventures · Your travel portal",
    description:
      "Your portal for everything Story-Tail — trips in motion, cards authorized for suppliers, and a place to dream up what's next.",
  },
  overline: "REST IS A GIFT · CREATION IS A GIFT",
  title: "Plan a rest worthy of the",
  script: "world He made.",
  sub: "Your portal for everything Story-Tail — trips in motion, cards authorized for suppliers, and a place to dream up what's next. We believe vacation is rest, and rest is sacred.",
  cta: {
    signIn: "Sign in",
    create: "Create an account",
    tour: "Take a quick tour →",
  },
  /** Only the first line shows below `md`, as on the mobile artboard. */
  scripture: [
    { quote: "“On the seventh day God rested.”", reference: "GEN 2 : 2" },
    { quote: "“It was very good.”", reference: "GEN 1 : 31" },
  ],
  chips: {
    browse: "Browse trip ideas →",
    marketing: { label: MARKETING_SITE_LABEL, href: MARKETING_SITE_URL },
  },
  features: {
    overline: "WHAT YOU CAN DO HERE",
    items: [
      // Brief correction: "offline at the resort" → "always in your pocket" (offline is P3).
      { icon: "plane", title: "View your trips", body: "Itinerary, day-by-day, always in your pocket." },
      { icon: "card", title: "Authorize cards", body: "Stripe-secured. We pay suppliers — never charge fees." },
      // The reply-time figure comes from the claims registry, never typed here.
      { icon: "message", title: "Message Gyasi", body: `Threaded by trip. Reply usually ${claim("avgReplyTime")}.` },
    ] satisfies readonly LandingFeature[],
  },
} as const;

/**
 * schema.org TravelAgency for the app subdomain. Deliberately minimal: no postal address
 * (Gyasi works remotely) and no aggregateRating (the figures are unverified — proof.ts).
 */
export function landingJsonLd(siteUrl: string) {
  return {
    "@context": "https://schema.org",
    "@type": "TravelAgency",
    name: "Story-Tail Adventures",
    url: siteUrl,
    sameAs: [MARKETING_SITE_URL],
  } as const;
}

/**
 * Serialise for a `<script type="application/ld+json">`. `<` is escaped so a value can never
 * close the script element (the pattern Next's JSON-LD guide recommends).
 */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
