/**
 * Outward links from the public surface. The marketing site is out of Phase 1 scope
 * (BRD §4.2); the app subdomain only links back to it.
 */
export const MARKETING_SITE_URL = "https://adventures.story-tail.com";
export const MARKETING_SITE_LABEL = "adventures.story-tail.com";

/** Legal / footer pages, in footer order. */
export const FOOTER_LEGAL_LINKS = [
  { href: "/legal/privacy", label: "Privacy" },
  { href: "/legal/terms", label: "Terms" },
  { href: "/legal/cookies", label: "Cookies" },
  { href: "/legal/accessibility", label: "Accessibility" },
] as const;

/** Public top-bar navigation (design: ScreenTopBar role="public"). */
export const PUBLIC_NAV_LINKS = [
  { href: "/explore", label: "Explore" },
  { href: "/caribbean", label: "Caribbean" },
  { href: "/cruises", label: "Cruises" },
  { href: "/honeymoons", label: "Honeymoons" },
  { href: "/about", label: "About Gyasi" },
] as const;
