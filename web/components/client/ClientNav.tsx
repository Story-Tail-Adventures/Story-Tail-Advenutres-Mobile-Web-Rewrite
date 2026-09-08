"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";
import {
  CLIENT_NAV_MESSAGES,
  activeDestinationId,
  destinationsFor,
  type ClientDestination,
} from "@/lib/client/nav";

/**
 * The client app's navigation, in its three forms.
 *
 * All three read one registry (`@/lib/client/nav`), so a destination cannot exist on the
 * rail and be forgotten on the bar. They are separate components rather than one responsive
 * component because the rail is `position: sticky` inside a flex row while the bar is
 * `position: fixed` — the same element cannot be both, and trying makes the reserve
 * calculation for the fixed bar impossible to reason about.
 *
 * WHICH ONE SHOWS AT WHICH WIDTH, and the trap in it:
 *
 *   mobile  (<768)       bar
 *   tablet  (768–1199)   rail   — the strip is `hidden md:max-web:flex`
 *   web     (>=1200)     rail
 *
 * `md:max-web:` is deliberate and `md:flex max-web:flex` would be a bug. `web:` is
 * px-based and `md:` is rem-based, so Tailwind emits `web:` FIRST — an unqualified
 * `max-web:flex` therefore applies at 375px too and the tablet strip would render on a
 * phone, alongside the bottom bar. Four existing places in web/ pair `md:X` with `web:Y`
 * on the same property and lose the `web:` value for the same reason.
 */

function itemClasses(destination: ClientDestination, base: string) {
  return cn(base, !destination.built && "client-nav-item-disabled");
}

function NavItem({
  destination,
  active,
  variant,
}: {
  destination: ClientDestination;
  active: boolean;
  variant: "rail" | "tab";
}) {
  const base = variant === "rail" ? "client-rail-item" : "client-tab";
  const labelClass = variant === "rail" ? "client-rail-label" : "client-tab-label";
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
  if (!destination.built) {
    return (
      <span
        className={itemClasses(destination, base)}
        aria-disabled="true"
        title={`${destination.label} — ${CLIENT_NAV_MESSAGES.notYetLabel}`}
      >
        {inner}
        <span className="sr-only">
          {destination.label} {CLIENT_NAV_MESSAGES.notYetAria}
        </span>
      </span>
    );
  }

  return (
    <Link
      href={destination.href}
      className={itemClasses(destination, base)}
      aria-current={active ? "page" : undefined}
    >
      {inner}
    </Link>
  );
}

export function ClientNavRail() {
  const pathname = usePathname();
  const activeId = activeDestinationId(pathname);

  return (
    <nav
      className="client-rail hidden md:flex"
      aria-label="Main"
    >
      {destinationsFor("rail").map((d) => (
        <NavItem key={d.id} destination={d} active={d.id === activeId} variant="rail" />
      ))}
    </nav>
  );
}

export function ClientBottomNav() {
  const pathname = usePathname();
  const activeId = activeDestinationId(pathname);

  return (
    <nav className="client-bottom-nav md:hidden" aria-label="Main">
      {destinationsFor("bar").map((d) => (
        <NavItem key={d.id} destination={d} active={d.id === activeId} variant="tab" />
      ))}
    </nav>
  );
}
