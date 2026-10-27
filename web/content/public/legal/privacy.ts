import type { LegalDoc } from "../types";

/**
 * DRAFT — not yet reviewed by counsel. Screen Inventory 2.0.7.
 *
 * Payments, as ruled 2026-10-16 (Screen Inventory §3.6, Data-Model §9): the app never
 * collects, stores or shows a card number. Clients pay each supplier directly through a pay
 * link the advisor adds to a payment. The card tables, Stripe and the planned "reveal" step
 * are gone, so section 2 below says that and nothing more.
 */
export const PRIVACY: LegalDoc = {
  slug: "privacy",
  title: "Privacy policy",
  navLabel: "Privacy",
  description: "What Story-Tail Adventures collects, how you pay for your trip, and your data rights.",
  lastUpdated: "2026-10-21",
  status: "draft",
  sections: [
    {
      heading: "1. What we collect",
      paragraphs: [
        "Story-Tail Adventures collects contact information, trip details, travel preferences, and travel-document details you choose to share, only to plan and support your trips. The portal has no place to enter a card number, so please don't type one into a message.",
        "We do not sell your information, and we do not share it with marketing third parties. When you use the portal in a web browser, we also count page views without tying them to your name. Section 3 explains who receives what, and why.",
        // Added 2026-10-21 with the 2.0.12 Message Gyasi form (BRD §6.5, Data-Model §11).
        // lead_retention_sweep() and the CHECKs on lead / lead_message are what make each
        // clause true; change one and you must change the other.
        "If you send Gyasi a note without an account, we keep your name, your email, any phone number you add, your note, and the page or link you wrote from. We keep them so Gyasi can reply and see where people find us. To stop spam, we also keep a scrambled form of your network address for one day. We never email you automatically, and the form refuses card numbers. If you create an account with the same email later, your note joins it. If not, we delete it 24 months after Gyasi closes it.",
      ],
    },
    {
      heading: "2. How you pay for your trip",
      paragraphs: [
        "You pay each supplier directly, on their own secure site. Your advisor adds a pay link to each payment on your trip: the supplier's own payment page, or a Travefy invoice when the supplier doesn't have one. A Travefy invoice passes along supplier costs only. Story-Tail never charges you a planning, consultation or service fee.",
        "Story-Tail never asks for your card number, and the portal has nowhere to keep one. For each payment it keeps the amount, the due date and the pay link, and once your advisor marks it paid, the date, any confirmation number and your advisor's own note. Only your advisor can add or change a pay link, and every change is recorded.",
      ],
    },
    {
      heading: "3. Who we share it with",
      paragraphs: [
        "Trip details and traveler names go to the suppliers who deliver your trip (airlines, resorts, cruise lines, tour operators) and to Inteletravel, the host agency that issues bookings. When you pay a supplier, or a Travefy invoice, you pay them directly on their own site, under their own privacy policy. Our hosting and database providers process data on our behalf under contract.",
        // Added 2026-09-09 with the live hotel search. HotelCard.tsx points here in a code
        // comment; before this the page said we shared nothing with third parties while the
        // results page was loading images from Google's CDN on every visit.
        "When you search for hotels, the destination and dates you enter are sent to SerpApi, which returns results from Google Hotels. We do not send your name, your email, or anything else about you — only the search itself.",
        "Hotel photographs on the results page are loaded directly from Google's image servers. That means Google receives your IP address and browser details when a photo loads, as it would for any image on the web. We ask your browser not to tell Google which page you were on.",
        // hotel_search_gc() in 20260909120000_hotel_search.sql is what makes this true.
        // If that sweep is ever unscheduled, this sentence becomes a false statement about
        // our own handling — change one and you must change the other.
        "We keep a record of each hotel search so we can stay inside the search allowance we pay for. The destination and dates are cleared from that record after 30 days; the cached results themselves expire within hours.",
        // Added 2026-10-15 with Google Analytics (components/FirebaseAnalytics.tsx). Every
        // clause is a rule in that file or in lib/analytics.ts; change one and change this.
        "If you say yes, the website also counts your visit with Google Analytics, a Google service we reach through Firebase. Nothing is sent to Google until you agree, and you can say no and still use everything. Google Analytics sets its own cookies to tell one visit from another, and it records the page, the site that sent you, your approximate location, and your device and browser. It gets a cleaned-up web address, with ID numbers removed and everything after the “?” dropped except campaign tags, and it never sees the advisor's own pages. We turn off Google's ad features and do not give Google your name or email. You can change your answer any time on the Privacy & data page in your account, or by clearing your browser's site data; turning it off deletes Google's cookies and the visitor code Firebase keeps in your browser. You can read how Google handles this data at policies.google.com/privacy.",
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
        "We keep trip and payment records for as long as tax and host-agency rules require, and delete or anonymize the rest when you close your account. Access to sensitive data is logged, and every change to a pay link or a paid payment is recorded.",
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
