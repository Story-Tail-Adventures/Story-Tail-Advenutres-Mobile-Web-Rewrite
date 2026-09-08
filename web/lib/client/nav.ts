import type { IconName } from "@/components/ui/icon-paths";

/**
 * The authenticated client destinations, for all three viewports.
 *
 * WHY THIS IS A UNION AND NOT ONE LIST WITH A PROJECTION.
 *
 * Four different sets are mandated by four different sources, and none of them is a subset
 * of another:
 *
 *   prototype ScreenNavRail   Trips · Discover · Messages · Wallet · Documents · Account
 *   prototype StaMobileTabs   Trips · Discover · Messages · Account
 *   Screen-Inventory §6.1     Trips · Search · Messages · Profile      (a TOP nav)
 *   Screen-Inventory §6.3     Home · Trips · Search · Messages · Profile  (+ a Help FAB)
 *
 * The rail has no "Home"; §6.3's bar has one AND treats it as distinct from Trips. The rail
 * has Wallet and Documents; the bar has neither. And the same destination carries different
 * mandated labels per surface — Discover vs Search, Account vs Profile. So "one array plus a
 * filter" cannot express it: there are seven concepts, each of which appears on some
 * surfaces under some label.
 *
 * Gyasi settled this on 2026-09-06: the PROTOTYPE wins. Six items on the web rail, four
 * tabs on mobile, no Help FAB. Screen-Inventory §6.1/§6.3 and Design-System §9.2-§9.3 are
 * being amended to match rather than the other way round — §6.1 is the surprising one, since
 * it specifies a top nav for authenticated client web and the left rail appears only at §6.4
 * for agents.
 *
 * WHY `built` IS SEPARATE FROM `phase`.
 *
 * Filtering on phase removes exactly one destination: Discover (§2.3 is Phase 2). The other
 * five have no route after §2.2 ships and four of them are Phase ONE — Messages (§2.6),
 * Wallet (§2.4), Documents (§2.5.4) and Account (§2.5.1) — so a phase filter leaves four
 * dead links pointing at pages that do not exist. `built` is what the shell actually renders
 * against; `phase` is only there to say why something is not built yet.
 */

export type ClientSurface = "rail" | "bar" | "tablet";

export type ClientDestination = {
  id: string;
  /** The route, once it exists. Also the active-state match prefix. */
  href: string;
  icon: IconName;
  /**
   * Per-surface labels, because the sources mandate different words for the same place.
   * `rail` is authoritative; the others fall back to it.
   */
  label: string;
  /** Which surfaces this destination appears on. */
  surfaces: readonly ClientSurface[];
  /**
   * False while the destination has no route. A `built: false` item renders disabled with a
   * tooltip rather than vanishing: the rail is the design of record, and a rail that grows
   * an item per release moves every other item under the user's cursor.
   */
  built: boolean;
  /** Why it is not built. Null once it is. */
  phase: "P1" | "P2" | null;
  /** Which Screen Inventory section will build it, for the disabled tooltip and for grep. */
  section: string;
};

export const CLIENT_DESTINATIONS: readonly ClientDestination[] = [
  {
    id: "trips",
    href: "/dashboard",
    icon: "home",
    label: "Trips",
    surfaces: ["rail", "bar", "tablet"],
    built: true,
    phase: null,
    section: "§2.2",
  },
  {
    id: "discover",
    href: "/discover",
    icon: "search",
    label: "Discover",
    surfaces: ["rail", "bar", "tablet"],
    built: false,
    phase: "P2",
    section: "§2.3",
  },
  {
    id: "messages",
    href: "/messages",
    icon: "message",
    label: "Messages",
    surfaces: ["rail", "bar", "tablet"],
    built: false,
    phase: "P1",
    section: "§2.6",
  },
  {
    id: "wallet",
    href: "/wallet",
    icon: "card",
    label: "Wallet",
    // Not on the mobile bar: the prototype's StaMobileTabs has four tabs and this is not
    // one of them. It is reachable from a trip's Payments tile either way.
    surfaces: ["rail", "tablet"],
    built: false,
    phase: "P1",
    section: "§2.4",
  },
  {
    id: "documents",
    href: "/documents",
    icon: "passport",
    label: "Documents",
    // Also absent from the mobile bar. Per-trip documents live at
    // /trips/[tripId]/documents, which §2.2.6 does build; this is the account-wide library.
    surfaces: ["rail", "tablet"],
    built: false,
    phase: "P1",
    section: "§2.5.4",
  },
  {
    id: "account",
    href: "/account",
    icon: "user",
    label: "Account",
    surfaces: ["rail", "bar", "tablet"],
    built: false,
    phase: "P1",
    section: "§2.5.1",
  },
] as const;

export function destinationsFor(surface: ClientSurface): readonly ClientDestination[] {
  return CLIENT_DESTINATIONS.filter((d) => d.surfaces.includes(surface));
}

/**
 * Which destination a pathname belongs to.
 *
 * Longest-prefix wins, so `/trips/abc/documents` resolves to Trips rather than Documents —
 * a per-trip document library is somewhere you got to *through* a trip, and the rail should
 * keep saying so. Exact `/` boundaries only, so `/documents-archive` never matches
 * `/documents`.
 */
export function activeDestinationId(pathname: string): string | null {
  let best: ClientDestination | null = null;
  for (const d of CLIENT_DESTINATIONS) {
    if (pathname === d.href || pathname.startsWith(`${d.href}/`)) {
      if (!best || d.href.length > best.href.length) best = d;
    }
  }
  // Trip sub-routes live under /trips/… but Trips itself is /dashboard, so they need
  // naming explicitly rather than by prefix.
  if (!best && (pathname === "/trips" || pathname.startsWith("/trips/"))) {
    return "trips";
  }
  return best?.id ?? null;
}

/** Copy for the disabled state, kept here so the rail and the bar cannot disagree. */
export const CLIENT_NAV_MESSAGES = {
  notYetLabel: "Coming with the next release",
  notYetAria: "not available yet",
} as const;
