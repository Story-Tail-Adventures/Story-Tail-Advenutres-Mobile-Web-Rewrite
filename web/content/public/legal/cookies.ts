import type { LegalDoc } from "../types";

/** DRAFT — not yet reviewed by counsel. Screen Inventory 2.0.7. */
export const COOKIES: LegalDoc = {
  slug: "cookies",
  title: "Cookies",
  navLabel: "Cookies",
  description: "The small number of cookies and browser storage keys the Story-Tail portal uses, and what each one does.",
  lastUpdated: "2026-09-02",
  status: "draft",
  sections: [
    {
      heading: "1. What we use",
      paragraphs: [
        "The portal uses cookies only to keep you signed in and to remember a few preferences. We do not use advertising cookies or third-party trackers on the app subdomain.",
      ],
      bullets: [
        "Sign-in session cookies (set by our authentication provider, Supabase) so you stay signed in between pages.",
        "A light-or-dark appearance preference, stored in your browser's local storage.",
        "A note that you dismissed the “sign in to save” banner on the search pages, stored in local storage.",
      ],
    },
    {
      heading: "2. Payment forms",
      paragraphs: [
        "When you add a card, the form is served by Stripe and may set Stripe's own cookies to prevent fraud. Those are governed by Stripe's privacy policy.",
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
