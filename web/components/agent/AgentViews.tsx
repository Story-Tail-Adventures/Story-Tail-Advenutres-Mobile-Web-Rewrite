"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";

import { AGENT_WORKLIST_VIEWS, activeAgentViewId } from "@/lib/agent/nav";

/**
 * §3.2's three views, under one rail destination.
 *
 * Plain links with `aria-current`, no client state — the prototype treats Worklist, Pipeline
 * and Calendar as one `tab="home"` destination, and Gyasi took that shape provisionally on
 * 2026-09-19 (revisited at §3.3). Links rather than buttons so each view is shareable and
 * the back button means what it says.
 *
 * `"use client"` only for `usePathname`. Nothing crosses the boundary but the pathname.
 *
 * ON MUI (step 2 of the migration, the agent app PR): each view is an MUI Chip rendered as
 * a Next Link — outlined at rest, filled secondary when it is the current view, which is how
 * every converted screen draws a chosen filter chip and how the §3.2 artboards draw their
 * Month / Week / Agenda row. The BOX is the legacy `.agent-view-link` one — 34px tall, 14px
 * sides, 6px apart, a 44px minimum on coarse pointers — so the row under every §3.2 header
 * keeps its height. `aria-current` stays on the link itself.
 */
export function AgentViews() {
  const pathname = usePathname();
  const activeId = activeAgentViewId(pathname);

  return (
    <Box component="nav" aria-label="Worklist views" sx={VIEWS_SX}>
      {AGENT_WORKLIST_VIEWS.map((v) => {
        const active = v.id === activeId;
        return (
          <Chip
            key={v.id}
            component={Link}
            href={v.href}
            clickable
            label={v.label}
            color={active ? "secondary" : "default"}
            variant={active ? "filled" : "outlined"}
            aria-current={active ? "page" : undefined}
            sx={VIEW_LINK_SX}
          />
        );
      })}
    </Box>
  );
}

/** The legacy `.agent-views` row: 6px between pills, wrapping. */
const VIEWS_SX = { display: "flex", gap: 0.75, flexWrap: "wrap" } as const;

/**
 * The legacy `.agent-view-link` box on MUI's Chip. `height: auto` releases the Chip's fixed
 * 32px so the 34px minimum (and the 44px one on touch screens, the rule agent.css carried
 * for this element) can take over; 999px keeps it a pill at either height.
 */
const VIEW_LINK_SX = {
  height: "auto",
  minHeight: 34,
  borderRadius: 999,
  fontWeight: 600,
  "& .MuiChip-label": { px: 1.75 },
  "@media (pointer: coarse)": { minHeight: 44 },
} as const;
