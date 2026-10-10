import type { LegalDoc } from "../types";

/**
 * DRAFT — not yet reviewed by counsel. Screen Inventory 2.0.7.
 *
 * The prototype sentence "Story-Tail never sees the full card number" was not accurate:
 * BRD §10.4 and Screen Inventory 3.6.4 define an audited, MFA-gated reveal for suppliers
 * who can only take payment by hand. The card section below describes what actually
 * happens (Data-Model §9, §18).
 */
export const PRIVACY: LegalDoc = {
  slug: "privacy",
  title: "Privacy policy",
  navLabel: "Privacy",
  description: "What Story-Tail Adventures collects, how payment cards are handled, and your data rights.",
  lastUpdated: "2026-10-10",
  status: "draft",
  sections: [
    {
      heading: "1. What we collect",
      paragraphs: [
        "Story-Tail Adventures collects contact information, trip details, travel preferences, and travel-document details you choose to share, only to plan and support your trips. Payment cards are collected through Stripe and stored as tokens; we keep the card brand, last four digits and expiration so you can recognize a card, never the full number.",
        "We do not sell your information, and we do not share it with marketing third parties. When you use the portal in a web browser, we also count page views without tying them to your name. Section 3 explains who receives what, and why.",
      ],
    },
    {
      heading: "2. How payment cards are handled",
      paragraphs: [
        "Cards you add through the portal are tokenized by Stripe before they leave your browser. The full card number is stored only by Stripe. Story-Tail uses your card only to pay travel suppliers on your behalf, up to the limit you authorize for a trip — never to charge you a planning, consultation or service fee.",
        "Most suppliers are paid directly through Stripe. A few suppliers can only accept payment by hand. For those, your advisor can view a card number through a time-limited, audited step that requires a second sign-in factor; every view is recorded and you are notified. You can revoke a stored card at any time.",
      ],
    },
    {
      heading: "3. Who we share it with",
      paragraphs: [
        "Trip details and traveler names go to the suppliers who deliver your trip (airlines, resorts, cruise lines, tour operators) and to Inteletravel, the host agency that issues bookings. Payment processing is handled by Stripe. Our hosting and database providers process data on our behalf under contract.",
        // Added 2026-09-09 with the live hotel search. HotelCard.tsx points here in a code
        // comment; before this the page said we shared nothing with third parties while the
        // results page was loading images from Google's CDN on every visit.
        "When you search for hotels, the destination and dates you enter are sent to SerpApi, which returns results from Google Hotels. We do not send your name, your email, or anything else about you — only the search itself.",
        "Hotel photographs on the results page are loaded directly from Google's image servers. That means Google receives your IP address and browser details when a photo loads, as it would for any image on the web. We ask your browser not to tell Google which page you were on.",
        // hotel_search_gc() in 20260909120000_hotel_search.sql is what makes this true.
        // If that sweep is ever unscheduled, this sentence becomes a false statement about
        // our own handling — change one and you must change the other.
        "We keep a record of each hotel search so we can stay inside the search allowance we pay for. The destination and dates are cleared from that record after 30 days; the cached results themselves expire within hours.",
        // Added 2026-10-10 with Vercel Web Analytics. The data points are Vercel's own list
        // (vercel.com/docs/analytics/privacy-policy, "Data point information"); the id, query
        // string and /agent rules are web/lib/analytics.ts. Change either and this must change too.
        "When you use the portal in a web browser, our hosting provider, Vercel, records each page view. It notes the page and the time, the site that sent you, your approximate location (country, region and city), and your device type, operating system and browser. Vercel says it sets no cookies for this, does not follow you to other sites, and does not tie a visit to your name, email or IP address. To tell visits apart for a day, it uses a code made from your browser's request and throws that code away after 24 hours. Before anything is sent, we remove ID numbers from the web address and everything after the “?”, except campaign tags that show which link brought you here. We use the counts to see which pages people visit, which links bring them here, and what to improve. You can read Vercel's own description at vercel.com/docs/analytics/privacy-policy.",
      ],
    },
    {
      heading: "4. Your data rights",
      paragraphs: [
        "You can ask for a copy of the personal data we hold about you, ask us to correct it, or ask us to close your account. Account closure preserves booking and payment records for tax and compliance reasons but anonymizes your personal identifiers. Email us and we will respond within 30 days.",
      ],
    },
    {
      heading: "5. Retention and security",
      paragraphs: [
        "We keep trip and payment records for as long as tax and host-agency rules require, and delete or anonymize the rest when you close your account. Access to sensitive data is logged, and every payment-card action generates an audit record.",
      ],
    },
    {
      heading: "6. Contact",
      paragraphs: [
        "Questions about this policy or your data: use the “Message Gyasi” link on any page.",
      ],
    },
  ],
};
