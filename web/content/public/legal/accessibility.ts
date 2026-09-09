import type { LegalDoc } from "../types";

/**
 * DRAFT — not yet reviewed. Screen Inventory 2.0.7.
 *
 * The "known limitations" section records the two design-system colour pairs that measure
 * below WCAG AA for small text (brand-orange overlines on cream, white on brand-orange
 * buttons) so the gap is documented rather than silent. Remove the lines when the design
 * system resolves them.
 */
export const ACCESSIBILITY: LegalDoc = {
  slug: "accessibility",
  title: "Accessibility statement",
  navLabel: "Accessibility",
  description: "How the Story-Tail portal is built to be usable by everyone, what we know still falls short, and how to tell us.",
  lastUpdated: "2026-09-02",
  status: "draft",
  sections: [
    {
      heading: "1. Our commitment",
      paragraphs: [
        "Rest is for everyone, and so is this portal. We build to the Web Content Accessibility Guidelines (WCAG) 2.2 at level AA: semantic headings and landmarks, visible focus, keyboard access to every control, text alternatives for images that carry meaning, and layouts that reflow on small screens and at 200% zoom.",
      ],
    },
    {
      heading: "2. What works today",
      paragraphs: [],
      bullets: [
        "Every page has one main heading and a skip-to-content link.",
        "Menus, filters and forms work with a keyboard and screen reader; the mobile menu traps focus and closes with Escape.",
        "Light and dark appearance follow your device or your choice.",
        "Animations respect the “reduce motion” setting.",
        "Legal pages print cleanly in a light palette.",
      ],
    },
    {
      heading: "3. Known limitations",
      paragraphs: [
        "Two brand colour pairs measure below the AA contrast ratio for small text: orange section labels on the cream background, and white text on orange buttons. Both are legible at their sizes but we are working with the designer on adjustments.",
        "Hero photographs carry decorative text overlays; the same information is always available as plain text on the page.",
      ],
    },
    {
      heading: "4. Tell us",
      paragraphs: [
        "If something is hard to use, use the “Message Gyasi” link on any page and describe what happened and what you were trying to do. We will fix what we can quickly and tell you when we have.",
      ],
    },
  ],
};
