/**
 * Outward links from the public surface. The marketing site is out of Phase 1 scope
 * (BRD §4.2); the app subdomain only links back to it.
 */
export declare const MARKETING_SITE_URL = "https://adventures.story-tail.com";
export declare const MARKETING_SITE_LABEL = "adventures.story-tail.com";
/** Legal / footer pages, in footer order. */
export declare const FOOTER_LEGAL_LINKS: readonly [{
    readonly href: "/legal/privacy";
    readonly label: "Privacy";
}, {
    readonly href: "/legal/terms";
    readonly label: "Terms";
}, {
    readonly href: "/legal/cookies";
    readonly label: "Cookies";
}, {
    readonly href: "/legal/accessibility";
    readonly label: "Accessibility";
}];
/** Public top-bar navigation (design: ScreenTopBar role="public"). */
export declare const PUBLIC_NAV_LINKS: readonly [{
    readonly href: "/explore";
    readonly label: "Explore";
}, {
    readonly href: "/caribbean";
    readonly label: "Caribbean";
}, {
    readonly href: "/cruises";
    readonly label: "Cruises";
}, {
    readonly href: "/honeymoons";
    readonly label: "Honeymoons";
}, {
    readonly href: "/about";
    readonly label: "About Gyasi";
}];
