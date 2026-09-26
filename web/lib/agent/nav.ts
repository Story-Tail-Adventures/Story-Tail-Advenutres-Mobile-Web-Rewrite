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
 * WHY AVAILABILITY IS THREE STATES AND NOT `built: boolean`.
 *
 * The client registry's two states cannot say what Leads is. §3.8 is not "not yet" — the
 * `lead` domain is specified and deliberately UNBUILT (Data-Model §11), because a quote
 * request creates a trip in `inquiry` status instead (BRD §6.5, amended 2026-09-09). Its
 * blockquote says to treat §3.8 as "unbuilt and unplanned". Rendering it with the client
 * rail's "Coming with the next release" would be a lie in the one place Gyasi reads it.
 *
 * So: `built`, `planned` (a section will build it, and which), and `deferred` (a decision
 * was taken not to, and why).
 */

export type AgentSurface = "rail" | "bar" | "tablet";

export type AgentAvailability =
  | { kind: "built" }
  | { kind: "planned"; phase: "P1" | "P2" | "P3"; section: string }
  | { kind: "deferred"; section: string; reason: string };

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
    availability: { kind: "planned", phase: "P1", section: "§3.4" },
  },
  {
    id: "leads",
    href: "/agent/leads",
    icon: "inbox",
    label: "Leads",
    surfaces: ["rail", "tablet"],
    // The only `deferred` entry, and the type exists for it. See the header.
    availability: {
      kind: "deferred",
      section: "§3.8",
      reason:
        "There is no Leads inbox. A quote request creates a trip in Inquiry instead — it is in New inquiries on the worklist.",
    },
  },
  {
    id: "messages",
    href: "/agent/messages",
    icon: "message",
    label: "Messages",
    surfaces: ["rail", "bar", "tablet"],
    availability: { kind: "planned", phase: "P1", section: "§3.10" },
  },
  {
    id: "commission",
    href: "/agent/commission",
    icon: "dollar",
    label: "Commission",
    surfaces: ["rail", "tablet"],
    availability: { kind: "planned", phase: "P1", section: "§3.7" },
  },
  {
    id: "reports",
    href: "/agent/reports",
    icon: "chart",
    label: "Reports",
    surfaces: ["rail", "tablet"],
    availability: { kind: "planned", phase: "P2", section: "§3.11" },
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

/** Which of the three views is showing. Null outside §3.2. */
export function activeAgentViewId(pathname: string): string | null {
  return AGENT_WORKLIST_VIEWS.find((v) => v.href === pathname)?.id ?? null;
}

/**
 * Copy for the disabled states, kept here so the rail and the bar cannot disagree.
 *
 * Two messages rather than the client rail's one, because the two kinds of unavailable are
 * different claims. `plannedLabel` takes the section; `deferred` carries its own sentence
 * per destination, because the reason IS the content.
 */
export const AGENT_NAV_MESSAGES = {
  plannedLabel: "Arrives with",
  plannedAria: "not available yet",
  deferredAria: "not planned",
} as const;
