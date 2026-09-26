"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";
import {
  AGENT_NAV_MESSAGES,
  activeAgentDestinationId,
  agentDestinationsFor,
  isBuilt,
  type AgentDestination,
} from "@/lib/agent/nav";

/**
 * The agent app's navigation, in its two forms.
 *
 * Both read one registry (`@/lib/agent/nav`), so a destination cannot exist on the rail and
 * be forgotten on the bar. Separate components rather than one responsive component, for the
 * reason ClientNav gives: the rail is `position: sticky` inside a flex row while the bar is
 * `position: fixed`, and the same element cannot be both.
 *
 * NO TABLET-ONLY STRIP, which is the one simplification over the client side. §6.5 asks for
 * a collapsible icon rail on tablet; the rail here is icon-and-label at 72px on every size
 * above `md`, so tablet and web share it and there is no `md:max-web:` construct. That
 * matters: `web:` is px-based and `md:` is rem-based, so Tailwind emits `web:` first and an
 * unqualified `max-web:` applies at phone width too — a bug four places in web/ have hit.
 * Not needing the construct is better than getting it right. Hover-to-expand is deferred; it
 * needs client state plus a width transition that reflows the grid, and "icon-only by
 * default" is already satisfied.
 *
 * THREE AVAILABILITY STATES, NOT TWO. A `planned` destination says which section builds it;
 * a `deferred` one carries its own sentence, because the reason IS the content. Leads is the
 * only `deferred` entry and the type exists for it — see the registry's header.
 */

function tooltipFor(d: AgentDestination): string | undefined {
  switch (d.availability.kind) {
    case "built":
      return undefined;
    case "planned":
      return `${d.label} — ${AGENT_NAV_MESSAGES.plannedLabel} ${d.availability.section}`;
    case "deferred":
      return `${d.label} — ${d.availability.reason}`;
  }
}

function srTextFor(d: AgentDestination): string | null {
  switch (d.availability.kind) {
    case "built":
      return null;
    case "planned":
      return `${d.label} ${AGENT_NAV_MESSAGES.plannedAria}`;
    case "deferred":
      return `${d.label} ${AGENT_NAV_MESSAGES.deferredAria}`;
  }
}

function NavItem({
  destination,
  active,
  variant,
}: {
  destination: AgentDestination;
  active: boolean;
  variant: "rail" | "tab";
}) {
  const base = variant === "rail" ? "agent-rail-item" : "agent-tab";
  const labelClass = variant === "rail" ? "agent-rail-label" : "agent-tab-label";
  const size = variant === "rail" ? 18 : 19;

  const inner = (
    <>
      <span className="pill">
        <Icon name={destination.icon} size={size} />
      </span>
      <span className={labelClass}>{destination.label}</span>
    </>
  );

  // A destination with no route renders as a span, not a Link. Next would prefetch a 404
  // for an href that does not exist, and a disabled anchor is still focusable.
  if (!isBuilt(destination)) {
    const srText = srTextFor(destination);
    return (
      <span
        className={cn(base, "agent-nav-item-disabled")}
        aria-disabled="true"
        title={tooltipFor(destination)}
      >
        {inner}
        {srText && <span className="sr-only">{srText}</span>}
      </span>
    );
  }

  return (
    <Link href={destination.href} className={base} aria-current={active ? "page" : undefined}>
      {inner}
    </Link>
  );
}

export function AgentNavRail() {
  const pathname = usePathname();
  const activeId = activeAgentDestinationId(pathname);

  return (
    <nav className="agent-rail hidden md:flex" aria-label="Main">
      {agentDestinationsFor("rail").map((d) => (
        <NavItem key={d.id} destination={d} active={d.id === activeId} variant="rail" />
      ))}
    </nav>
  );
}

export function AgentBottomNav() {
  const pathname = usePathname();
  const activeId = activeAgentDestinationId(pathname);

  return (
    <nav className="agent-bottom-nav md:hidden" aria-label="Main">
      {agentDestinationsFor("bar").map((d) => (
        <NavItem key={d.id} destination={d} active={d.id === activeId} variant="tab" />
      ))}
    </nav>
  );
}
