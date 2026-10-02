"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";

import { TRIP_DETAIL_TABS, validTripTab } from "@/lib/agent/tripTabs";
import { TAP_TARGET } from "@/lib/mui/sx";

/**
 * Screen 3.4.2's eight tabs, exactly `AgentViews.tsx`'s pattern: plain `<Link>`s carrying
 * `?tab=`, `aria-current`, no client state but the pathname/search params needed to build
 * the hrefs and mark the active one.
 *
 * DRAWN AS MUI CHIPS THAT ARE LINKS (step 2 of the migration, PR 6), the way the client's
 * trip filter strip is: outlined at rest, filled secondary for the one you are on. Still a
 * `<nav>` of anchors with `aria-current="page"`, not a `role="tablist"` — these navigate,
 * and there are no tabpanels for a tablist to own. The tap area reaches 44px on a touch
 * screen through TAP_TARGET's invisible ::after, where the legacy `.agent-view-link` grew
 * its own min-height under `(pointer: coarse)`.
 */

const TAB_SX = { ...TAP_TARGET, flexShrink: 0 } as const;

export function TripDetailTabs() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const active = validTripTab(searchParams.get("tab") ?? undefined);

  return (
    <Box
      component="nav"
      aria-label="Trip detail views"
      sx={{ mt: 2, display: "flex", flexWrap: "wrap", gap: 0.75 }}
    >
      {TRIP_DETAIL_TABS.map((t) => {
        const on = t.id === active;
        return (
          <Chip
            key={t.id}
            component={Link}
            href={t.id === "overview" ? pathname : `${pathname}?tab=${t.id}`}
            clickable
            label={t.label}
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
