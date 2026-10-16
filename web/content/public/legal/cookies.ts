import type { LegalDoc } from "../types";

/** DRAFT — not yet reviewed by counsel. Screen Inventory 2.0.7. */
export const COOKIES: LegalDoc = {
  slug: "cookies",
  title: "Cookies",
  navLabel: "Cookies",
  description: "The small number of cookies and browser storage keys the Story-Tail portal uses, and what each one does.",
  lastUpdated: "2026-10-15",
  status: "draft",
  sections: [
    {
      heading: "1. What we use",
      paragraphs: [
        "The portal uses cookies to keep you signed in and to remember a few preferences. If you allow it, Google Analytics sets a few more to count visits. We do not use advertising cookies.",
      ],
      bullets: [
        "Sign-in session cookies (set by our authentication provider, Supabase) so you stay signed in between pages.",
        "A light-or-dark appearance preference, stored in your browser's local storage.",
        "A note that you dismissed the “sign in to save” banner on the search pages, stored in local storage.",
        "Page-view counts from Vercel, our hosting provider, so we can see which pages people visit and what to improve. Vercel sets no cookies for this and does not follow you to other sites. Our privacy policy describes what it records.",
        // components/FirebaseAnalytics.tsx and lib/analytics-consent.ts make this true.
        "Google Analytics cookies (named _ga and _ga_ followed by a code), only if you say yes when the site asks or on the Privacy & data page in your account. They let Google tell one visit from another. Google's ad features are off. Firebase also keeps a visitor code for Google Analytics in your browser's storage. Your answer is kept in your browser's local storage, and turning Google Analytics off deletes these cookies and that code.",
      ],
    },
    {
      heading: "2. Paying suppliers",
      paragraphs: [
        "The portal has no payment form and never asks for a card. When you pay a supplier, you do it on their own site (or on Travefy's, for a Travefy invoice), which may set its own cookies. Those are governed by that site's privacy policy.",
      ],
    },
    {
      heading: "3. Your choices",
      paragraphs: [
        "You can clear cookies and local storage in your browser at any time. Clearing the session cookie signs you out; the portal keeps working for browsing without an account.",
      ],
    },
  ],
};
