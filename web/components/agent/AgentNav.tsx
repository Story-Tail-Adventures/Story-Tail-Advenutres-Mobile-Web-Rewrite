"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Box from "@mui/material/Box";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import Typography from "@mui/material/Typography";
import type { SxProps, Theme } from "@mui/material/styles";

import { Icon } from "@/components/ui/Icon";
import {
  AGENT_NAV_MESSAGES,
  activeAgentDestinationId,
  agentDestinationsFor,
  isBuilt,
  type AgentDestination,
} from "@/lib/agent/nav";
import { VISUALLY_HIDDEN as VISUALLY_HIDDEN_SX } from "@/lib/mui/sx";

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
 * above `md`, so tablet and web share it and there is no tablet-only media query. That
 * mattered under Tailwind, where `md:` and `max-web:` were emitted in an order that made an
 * unqualified `max-web:` apply at phone width too — a bug four places in web/ hit. Not
 * needing the construct is better than getting it right. Hover-to-expand is deferred; it
 * needs client state plus a width transition that reflows the grid, and "icon-only by
 * default" is already satisfied.
 *
 * THREE AVAILABILITY STATES, NOT TWO. A `planned` destination says which section builds it;
 * a `deferred` one carries its own sentence, because the reason IS the content. Leads is the
 * only `deferred` entry and the type exists for it — see the registry's header.
 *
 * MUI SINCE 2026-10-01, on the prototype's RailItem (shared/mui-kit.jsx): each destination
 * is a `ListItemButton` laid out as a column, `selected` tints it, and the glyph goes
 * primary while the label goes `text.primary`. The GEOMETRY is the one the legacy CSS had —
 * 72px rail, 60px items, a 56×28 glyph slot, 10px labels, 2px between items; the bar's
 * 56px-minimum tabs with their 3px gap and safe-area padding — so the rail's height, the
 * bar's height and the reserve `(agent)/layout.tsx` keeps under the bar are unchanged. The
 * glyph slot kept its 28px height after losing its pill background for exactly that reason.
 *
 * A destination with no route is a plain `<span>`, as it always was: not a Link (Next would
 * prefetch a 404) and not a `ListItemButton` (ButtonBase would give the span `role="button"`,
 * and a thing you cannot press is not a button). It keeps `aria-disabled`, the title and
 * the visually-hidden sentence that says why.
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

type Variant = "rail" | "tab";

function NavItem({
  destination,
  active,
  variant,
}: {
  destination: AgentDestination;
  active: boolean;
  variant: Variant;
}) {
  const size = variant === "rail" ? 18 : 19;

  const inner = (
    <>
      <Box component="span" sx={active ? GLYPH_ACTIVE_SX : GLYPH_SX}>
        <Icon name={destination.icon} size={size} />
      </Box>
      <Typography component="span" variant="caption" sx={active ? LABEL_ACTIVE_SX : LABEL_SX}>
        {destination.label}
      </Typography>
    </>
  );

  if (!isBuilt(destination)) {
    const srText = srTextFor(destination);
    return (
      <Box
        component="span"
        sx={DISABLED_SX[variant]}
        aria-disabled="true"
        title={tooltipFor(destination)}
      >
        {inner}
        {srText && (
          <Box component="span" sx={VISUALLY_HIDDEN_SX}>
            {srText}
          </Box>
        )}
      </Box>
    );
  }

  return (
    <ListItemButton
      component={Link}
      href={destination.href}
      selected={active}
      aria-current={active ? "page" : undefined}
      sx={ITEM_SX[variant]}
    >
      {inner}
    </ListItemButton>
  );
}

export function AgentNavRail() {
  const pathname = usePathname();
  const activeId = activeAgentDestinationId(pathname);

  return (
    <List component="nav" aria-label="Main" disablePadding sx={RAIL_SX}>
      {agentDestinationsFor("rail").map((d) => (
        <NavItem key={d.id} destination={d} active={d.id === activeId} variant="rail" />
      ))}
    </List>
  );
}

export function AgentBottomNav() {
  const pathname = usePathname();
  const activeId = activeAgentDestinationId(pathname);

  return (
    <List component="nav" aria-label="Main" disablePadding sx={BAR_SX}>
      {agentDestinationsFor("bar").map((d) => (
        <NavItem key={d.id} destination={d} active={d.id === activeId} variant="tab" />
      ))}
    </List>
  );
}

// ── The rail (tablet and web) ──────────────────────────────────────────────────────────
// Sticky inside the layout's flex row, full viewport height, 72px (the prototype's, not
// §9.2's 88 — settled 2026-09-06), 14px vertical padding, 2px between items.
const RAIL_SX: SxProps<Theme> = {
  display: { xs: "none", md: "flex" },
  position: "sticky",
  top: 0,
  alignSelf: "flex-start",
  flexShrink: 0,
  width: 72,
  height: "100dvh",
  py: 1.75,
  flexDirection: "column",
  alignItems: "center",
  gap: 0.25,
  bgcolor: "surface.main",
  borderRight: 1,
  borderColor: "divider",
  color: "text.secondary",
};

// ── The bottom bar (mobile, §6.6) ──────────────────────────────────────────────────────
// Fixed, above the page (30), with the safe-area inset folded into the bottom padding.
// `(agent)/layout.tsx` reserves room under it on the same widths it shows.
const BAR_SX: SxProps<Theme> = {
  display: { xs: "flex", md: "none" },
  position: "fixed",
  left: 0,
  right: 0,
  bottom: 0,
  zIndex: 30,
  alignItems: "flex-start",
  justifyContent: "space-around",
  pt: 1,
  px: 0.75,
  pb: "max(env(safe-area-inset-bottom), 8px)",
  bgcolor: "surface.1",
  borderTop: 1,
  borderColor: "divider",
  color: "text.secondary",
};

// The column every item is: glyph slot over label. ListItemButton's own row layout, gutters
// and `flexGrow: 1` are all overridden, because the registry's geometry is the layout here.
const COLUMN_SX = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  flexGrow: 0,
  borderRadius: 1,
  textDecoration: "none",
  color: "inherit",
} as const;

const ITEM_SX: Record<Variant, SxProps<Theme>> = {
  rail: { ...COLUMN_SX, width: 60, py: 0.75, px: 0, gap: 0.25 },
  tab: {
    ...COLUMN_SX,
    minWidth: 56,
    py: 0,
    px: 0.5,
    gap: "3px",
    // §4.2's touch minimum on coarse pointers: the tab computes to 43px on its own.
    "@media (pointer: coarse)": { minHeight: 44 },
  },
};

// One disabled treatment for both surfaces, at the same 0.38 alpha every other deferral in
// this product uses. `cursor: default` rather than `not-allowed`: the destination is not
// forbidden, it does not exist yet.
const DISABLED_SX: Record<Variant, SxProps<Theme>> = {
  rail: { ...(ITEM_SX.rail as object), opacity: 0.38, cursor: "default" },
  tab: { ...(ITEM_SX.tab as object), opacity: 0.38, cursor: "default" },
};

// The 56×28 slot the legacy pill occupied. Transparent now — `selected` on the
// ListItemButton is the indicator — but the same height, so item heights do not move.
const GLYPH_SX: SxProps<Theme> = {
  width: 56,
  height: 28,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};
const GLYPH_ACTIVE_SX: SxProps<Theme> = { ...(GLYPH_SX as object), color: "primary.main" };

const LABEL_SX: SxProps<Theme> = {
  fontSize: 10,
  fontWeight: 600,
  lineHeight: 1.2,
  textAlign: "center",
  color: "text.secondary",
};
const LABEL_ACTIVE_SX: SxProps<Theme> = { ...(LABEL_SX as object), color: "text.primary" };

