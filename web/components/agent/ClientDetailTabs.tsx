"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import { CLIENT_DETAIL_TABS, validClientTab } from "@/lib/agent/clientTabs";
import { CLIENT_COPY } from "@/lib/agent/content";

/**
 * Screen 3.3.2's tab strip, exactly `TripDetailTabs`'s pattern: plain `<Link>`s carrying
 * `?tab=`, `aria-current`, no client state beyond the pathname and search params needed to
 * build the hrefs and mark the active one.
 *
 * The seventh entry is the prototype's "Account admin", rendered as a disabled `<span>`
 * rather than a `<Link>` — Next would otherwise prefetch a route that 404s. See
 * `clientTabs.ts` for why it is disabled rather than cut.
 */
export function ClientDetailTabs({ counts }: { counts: { trips: number; documents: number; notes: number } }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const active = validClientTab(searchParams.get("tab") ?? undefined);

  // The prototype bakes counts into two labels ("Trips · 4", "Documents · 5"). Notes gets
  // one too: all three are counts the Overview already reads, so showing them costs nothing
  // and a tab that says how much is behind it saves a click that finds nothing.
  const countFor = (id: string): number | null =>
    id === "trips" ? counts.trips
      : id === "documents" ? counts.documents
      : id === "notes" ? counts.notes
      : null;

  return (
    <nav className="agent-views mt-4" aria-label="Client detail views">
      {CLIENT_DETAIL_TABS.map((t) => {
        const n = countFor(t.id);
        return (
          <Link
            key={t.id}
            href={t.id === "overview" ? pathname : `${pathname}?tab=${t.id}`}
            className="agent-view-link"
            aria-current={t.id === active ? "page" : undefined}
          >
            {n === null ? t.label : `${t.label} · ${n}`}
          </Link>
        );
      })}
      <span className="agent-view-link opacity-40" aria-disabled title={CLIENT_COPY.accountAdminDeferred}>
        Account admin
        <span className="sr-only"> — {CLIENT_COPY.accountAdminDeferred}</span>
      </span>
    </nav>
  );
}
