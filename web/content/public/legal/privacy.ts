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
  lastUpdated: "2026-09-02",
  status: "draft",
  sections: [
    {
      heading: "1. What we collect",
      paragraphs: [
        "Story-Tail Adventures collects contact information, trip details, travel preferences, and travel-document details you choose to share, only to plan and support your trips. Payment cards are collected through Stripe and stored as tokens; we keep the card brand, last four digits and expiration so you can recognize a card, never the full number.",
        "We do not sell your information, and we do not share it with marketing third parties.",
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
