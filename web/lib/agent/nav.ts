import type { IconName } from "@/components/ui/icon-paths";

/**
 * The agent destinations, for the web rail and the mobile bar.
 *
 * WHY SEVEN AND NOT ELEVEN. Screen-Inventory §6.4 names eleven — Dashboard, Pipeline,
 * Calendar, Clients, Trips, Leads, Messages, Commissions, Reports, Templates, Settings. The
 * prototype's `itemsAgent` (design/source-prototype/shared/screen-frame.jsx:91-99) draws
 * seven, and all three §3.2 frames pass `tab="home"` — so the drawing treats §3.2 as ONE
 * rail destination carrying three views rather than three destinations.
 *
 * Gyasi took the prototype's seven on 2026-09-19, provisionally, with the final shape to be
 * revisited at §3.3 once there was more than one agent section to use the rail with. That
 * revisit happened on 2026-09-26 when §3.3.1 shipped and Clients became the second live
 * destination: THE SEVEN ARE FINAL. §6.4 is amended to match, so the eleven it named are no
 * longer an outstanding claim against this file.
 *
 * What the second destination settled that one could not: the rail's job is to hold sections,
 * and §3.2's three views (Worklist, Pipeline, Calendar) are three views of one section — they
 * share a read model, a date scope and a header. Promoting them to three rail entries would
 * have made the rail's first three rows one screen while Clients, Trips and Commission were
 * each a whole area. Templates and Settings stay off it for the reason §6.6 gives about the
 * phone bar: depth is not the same as reach.
 *
 * AVAILABILITY: `built`, or `planned` (a section will build it, and which).
 *
 * There was a third state, `deferred` (a decision was taken not to build it, and why), and
 * Leads was its only entry: §3.8 was deliberately unbuilt after the 2026-09-09 ruling that a
 * quote request creates a trip. On 2026-10-21 Gyasi revived §3.8 in a smaller shape (BRD
 * §6.5: a message from somebody without an account is a lead), Leads became a live
 * destination, and the state went with it rather than linger with no members.
 */

export type AgentSurface = "rail" | "bar" | "tablet";

export type AgentAvailability =
  | { kind: "built" }
  | { kind: "planned"; phase: "P1" | "P2" | "P3"; section: string };

export type AgentDestination = {
  id: string;
  /** The route, once it exists. Also the active-state match prefix. */
  href: string;
  icon: IconName;
  label: string;
  surfaces: readonly AgentSurface[];
  availability: AgentAvailability;
};

export const AGENT_DESTINATIONS: readonly AgentDestination[] = [
  {
    id: "worklist",
    href: "/agent",
    icon: "pulse",
    label: "Worklist",
    surfaces: ["rail", "bar", "tablet"],
    availability: { kind: "built" },
  },
  {
    id: "clients",
    href: "/agent/clients",
    icon: "users",
    label: "Clients",
    surfaces: ["rail", "bar", "tablet"],
    availability: { kind: "built" },
  },
  {
    id: "trips",
    href: "/agent/trips",
    icon: "briefcase",
    label: "Trips",
    surfaces: ["rail", "tablet"],
    // Built 2026-09-27 with §3.4.1. The rail entry has always pointed at the LIST; §3.4.2
    // shipped two days earlier and was reachable only from the worklist, the pipeline and
    // the calendar.
    availability: { kind: "built" },
  },
  {
    id: "leads",
    href: "/agent/leads",
    icon: "inbox",
    label: "Leads",
    surfaces: ["rail", "tablet"],
    // Built 2026-10-21 with §3.8's web PR (P2, BRD §6.5). Rail and tablet only: the phone has
    // no Leads screen, and its worklist shows a "New leads" count that points here instead.
    availability: { kind: "built" },
  },
  {
    id: "messages",
    href: "/agent/messages",
    icon: "message",
    label: "Messages",
    surfaces: ["rail", "bar", "tablet"],
    availability: { kind: "built" },
  },
  {
    id: "commission",
    href: "/agent/commission",
    icon: "dollar",
    label: "Commission",
    surfaces: ["rail", "tablet"],
    // Built 2026-10-11 with §3.7.1 and §3.7.2. Rail and tablet only, still: §6.6's phone bar
    // is four and Commission is not one of them.
    availability: { kind: "built" },
  },
  {
    id: "reports",
    href: "/agent/reports",
    icon: "chart",
    label: "Reports",
    surfaces: ["rail", "tablet"],
    // Built 2026-10-21 with §3.11's PR 1 (P1, ruled 2026-10-21). Rail and tablet only: §3.11
    // is web only, and the phone gets no Reports door at all.
    availability: { kind: "built" },
  },
  {
    id: "more",
    href: "/agent/more",
    icon: "more_vert",
    label: "More",
    // Bar only. §6.6's fourth tab is a SHEET, not a rail destination — the rail has room
    // for the things it would contain. It is the eventual home of sign-out, which an agent
    // on mobile has no other way to reach; that is §3.12's to build.
    surfaces: ["bar"],
    availability: { kind: "planned", phase: "P1", section: "§3.12" },
  },
] as const;

/**
 * §3.7's views under its one rail destination — the shape §3.2 settled, for the reason
 * nav.ts's header gives: a rail entry holds a SECTION, and the dashboard and the ledger are
 * two views of one section's money. The prototype draws no view strip for §3.7 (its header
 * carries Import and Export only), so this is a departure, taken because without it the
 * ledger would be reachable only through tiles. Statements (§3.7.5 import and §3.7.6
 * reconciliation, one list of uploaded statements) joined with Stage 3, and Forecast
 * (§3.7.7) with Stage 4.
 */
export const AGENT_COMMISSION_VIEWS = [
  { id: "dashboard", href: "/agent/commission", label: "Dashboard" },
  { id: "ledger", href: "/agent/commission/ledger", label: "Ledger" },
  { id: "statements", href: "/agent/commission/import", label: "Statements" },
  { id: "forecast", href: "/agent/commission/forecast", label: "Forecast" },
] as const;

export type AgentView = { id: string; href: string; label: string };

/**
 * The three views §3.2 carries under one rail destination.
 *
 * Plain links with `aria-current`, not client state: month and view move through
 * searchParams so the pages stay server-rendered, shareable and back-button-correct.
 */
export const AGENT_WORKLIST_VIEWS = [
  { id: "worklist", href: "/agent", label: "Worklist" },
  { id: "pipeline", href: "/agent/pipeline", label: "Pipeline" },
  { id: "calendar", href: "/agent/calendar", label: "Calendar" },
] as const;

export function agentDestinationsFor(surface: AgentSurface): readonly AgentDestination[] {
  return AGENT_DESTINATIONS.filter((d) => d.surfaces.includes(surface));
}

export function isBuilt(d: AgentDestination): boolean {
  return d.availability.kind === "built";
}

/**
 * Which rail destination a pathname belongs to.
 *
 * `/agent/pipeline` and `/agent/calendar` both resolve to `worklist`, because they are
 * VIEWS of it rather than destinations — the same reason `activeDestinationId` folds
 * `/trips/abc/documents` into Trips. Longest-prefix wins otherwise, and `/` boundaries are
 * exact so `/agent/clients-archive` never matches `/agent/clients`.
 */
export function activeAgentDestinationId(pathname: string): string | null {
  if (AGENT_WORKLIST_VIEWS.some((v) => v.href === pathname)) return "worklist";

  let best: AgentDestination | null = null;
  for (const d of AGENT_DESTINATIONS) {
    if (pathname === d.href || pathname.startsWith(`${d.href}/`)) {
      if (!best || d.href.length > best.href.length) best = d;
    }
  }
  return best?.id ?? null;
}

/**
 * Which view of a list is showing. Defaults to §3.2's three; §3.7 passes its own.
 *
 * Exact match first; then a view's SUB-route lights it (the ledger's `/ledger/new` and
 * `/ledger/<id>` are the ledger) — but never the list's first view, which is its root: every
 * path under `/agent` would otherwise light Worklist.
 */
export function activeAgentViewId(
  pathname: string,
  views: readonly AgentView[] = AGENT_WORKLIST_VIEWS,
): string | null {
  const exact = views.find((v) => v.href === pathname);
  if (exact) return exact.id;
  const nested = views
    .slice(1)
    .filter((v) => pathname.startsWith(`${v.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0];
  return nested?.id ?? null;
}

/**
 * Copy for the disabled states, kept here so the rail and the bar cannot disagree.
 *
 * `plannedLabel` takes the section. (`deferredAria` went with the `deferred` state on
 * 2026-10-21; see the header.)
 */
export const AGENT_NAV_MESSAGES = {
  plannedLabel: "Arrives with",
  plannedAria: "not available yet",
} as const;
