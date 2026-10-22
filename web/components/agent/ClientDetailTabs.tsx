"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";

import { CLIENT_DETAIL_TABS, validClientTab } from "@/lib/agent/clientTabs";
import { TAP_TARGET } from "@/lib/mui/sx";

/**
 * Screen 3.3.2's tab strip, exactly `TripDetailTabs`'s pattern: plain `<Link>`s carrying
 * `?tab=`, `aria-current`, no client state beyond the pathname and search params needed to
 * build the hrefs and mark the active one.
 *
 * DRAWN AS MUI CHIPS THAT ARE LINKS (step 2 of the migration, PR 6), the way the trip
 * detail's strip is: outlined at rest, filled secondary for the one you are on. Still a
 * `<nav>` of anchors with `aria-current="page"`, not a `role="tablist"` — these navigate,
 * and there are no tabpanels for a tablist to own. The tap area reaches 44px on a touch
 * screen through TAP_TARGET's invisible ::after, where the legacy `.agent-view-link` grew
 * its own min-height under `(pointer: coarse)`.
 *
 * The seventh entry, "Account admin" (§3.9), is an ordinary tab since 2026-10-16.
 */

const TAB_SX = { ...TAP_TARGET, flexShrink: 0 } as const;

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
    <Box
      component="nav"
      aria-label="Client detail views"
      sx={{ mt: 2, display: "flex", flexWrap: "wrap", gap: 0.75 }}
    >
      {CLIENT_DETAIL_TABS.map((t) => {
        const n = countFor(t.id);
        const on = t.id === active;
        return (
          <Chip
            key={t.id}
            component={Link}
            href={t.id === "overview" ? pathname : `${pathname}?tab=${t.id}`}
            clickable
            label={n === null ? t.label : `${t.label} · ${n}`}
            color={on ? "secondary" : "default"}
            variant={on ? "filled" : "outlined"}
            aria-current={on ? "page" : undefined}
            sx={TAB_SX}
          />
        );
      })}
    </Box>
  );
}
