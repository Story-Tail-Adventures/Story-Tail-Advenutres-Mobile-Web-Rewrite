"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import { TRIP_DETAIL_TABS, validTripTab } from "@/lib/agent/tripTabs";

/**
 * Screen 3.4.2's eight tabs, exactly `AgentViews.tsx`'s pattern: plain `<Link>`s carrying
 * `?tab=`, `aria-current`, no client state but the pathname/search params needed to build
 * the hrefs and mark the active one.
 */
export function TripDetailTabs() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const active = validTripTab(searchParams.get("tab") ?? undefined);

  return (
    <nav className="agent-views mt-4" aria-label="Trip detail views">
      {TRIP_DETAIL_TABS.map((t) => (
        <Link
          key={t.id}
          href={t.id === "overview" ? pathname : `${pathname}?tab=${t.id}`}
          className="agent-view-link"
          aria-current={t.id === active ? "page" : undefined}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
