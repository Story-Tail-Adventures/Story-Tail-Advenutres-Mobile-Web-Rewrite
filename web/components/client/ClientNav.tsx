"use client";

import BottomNavigation from "@mui/material/BottomNavigation";
import BottomNavigationAction from "@mui/material/BottomNavigationAction";
import Box from "@mui/material/Box";
import ListItemButton from "@mui/material/ListItemButton";
import Typography from "@mui/material/Typography";
import { usePathname } from "next/navigation";

import NextLink from "@/components/mui/NextLink";
import { Icon } from "@/components/ui/Icon";
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
 * WHICH ONE SHOWS AT WHICH WIDTH:
 *
 *   mobile  (<768)       bar    display: { xs: "flex", md: "none" }
 *   tablet  (768–1199)   rail   display: { xs: "none", md: "flex" }
 *   web     (>=1200)     rail
 *
 * Visibility is an sx breakpoint object, not a class string. MUI emits the min-width
 * queries in ascending breakpoint order, so a later key always beats an earlier one. The
 * old Tailwind trap — `web:` was px-based and `md:` rem-based, so an unqualified
 * below-web variant was emitted first and leaked the tablet chrome onto phones — cannot
 * recur here. A tablet-only element, should one ever be needed, is
 * `{ xs: "none", md: "flex", web: "none" }`.
 *
 * ON MUI (step 2 of the migration). The rail is a sticky column of ListItemButtons, the
 * way design/source-prototype/shared/mui-kit.jsx draws RailItem: `selected` gives the
 * active one MUI's tinted background and the icon goes primary. The bar is BottomNavigation
 * with labels always shown. A destination with no route is a plain span styled like its
 * neighbours at MUI's disabled opacity rather than a disabled button — ButtonBase would
 * hand it role="button", and the element never had a role. Next would also prefetch a 404
 * for an href that does not exist, and a disabled anchor is still focusable.
 *
 * `.client-bottom-nav` stays on the bar as a CSS hook: web/styles/client.css reserves space
 * under it through `.client-surface:has(.client-bottom-nav) .client-main`, bounded to the
 * widths the bar renders at.
 */

/** Tailwind's `sr-only`, as sx: present for assistive tech, no box on screen. */
const VISUALLY_HIDDEN = {
  position: "absolute",
  width: 1,
  height: 1,
  p: 0,
  m: "-1px",
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
  border: 0,
} as const;

/** MUI's disabled treatment (action.disabledOpacity) on an element that is not a control. */
const DISABLED_SX = {
  opacity: 0.38,
  pointerEvents: "none",
  cursor: "default",
  color: "text.secondary",
} as const;

/** Coarse pointers get the 44pt minimum §4.2 requires. */
const TAP_44 = { "@media (pointer: coarse)": { minHeight: 44, minWidth: 44 } } as const;

// ── Rail (tablet and web) ───────────────────────────────────────────────────────────────

const RAIL_SX = {
  position: "sticky",
  top: 0,
  alignSelf: "flex-start",
  flexShrink: 0,
  width: 72,
  height: "100dvh",
  py: 1.75,
  display: { xs: "none", md: "flex" },
  flexDirection: "column",
  alignItems: "center",
  gap: 0.25,
  bgcolor: "surface.main",
  borderRight: 1,
  borderColor: "divider",
} as const;

const RAIL_ITEM_SX = {
  width: 60,
  flexGrow: 0,
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 0.25,
  py: 0.75,
  px: 0.5,
  borderRadius: 1,
  textAlign: "center",
  ...TAP_44,
} as const;

function RailItem({
  destination,
  active,
}: {
  destination: ClientDestination;
  active: boolean;
}) {
  const inner = (
    <>
      {/* The legacy 46×26 pill slot, transparent now that `selected` tints the whole item,
          kept so each item (and the rail's rhythm) stays the height it was. */}
      <Box
        sx={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 46,
          height: 26,
          color: active ? "primary.main" : "text.secondary",
        }}
      >
        <Icon name={destination.icon} size={18} />
      </Box>
      {/* Wraps rather than truncating, like the legacy label: "Documents" at 9.5px is about
          the width of the item. */}
      <Typography
        variant="caption"
        sx={{
          maxWidth: "100%",
          fontSize: 9.5,
          fontWeight: 600,
          lineHeight: 1.2,
          color: active ? "text.primary" : "text.secondary",
        }}
      >
        {destination.label}
      </Typography>
    </>
  );

  if (!destination.built) {
    return (
      <Box
        component="span"
        aria-disabled="true"
        title={`${destination.label} — ${CLIENT_NAV_MESSAGES.notYetLabel}`}
        sx={{ display: "flex", ...RAIL_ITEM_SX, ...DISABLED_SX }}
      >
        {inner}
        <Box component="span" sx={VISUALLY_HIDDEN}>
          {destination.label} {CLIENT_NAV_MESSAGES.notYetAria}
        </Box>
      </Box>
    );
  }

  return (
    <ListItemButton
      component={NextLink}
      href={destination.href}
      selected={active}
      aria-current={active ? "page" : undefined}
      sx={RAIL_ITEM_SX}
    >
      {inner}
    </ListItemButton>
  );
}

export function ClientNavRail() {
  const pathname = usePathname();
  const activeId = activeDestinationId(pathname);

  return (
    <Box component="nav" aria-label="Main" sx={RAIL_SX}>
      {destinationsFor("rail").map((d) => (
        <RailItem key={d.id} destination={d} active={d.id === activeId} />
      ))}
    </Box>
  );
}

// ── Bottom bar (phone) ──────────────────────────────────────────────────────────────────

const BAR_SX = {
  position: "fixed",
  left: 0,
  right: 0,
  bottom: 0,
  zIndex: 30,
  display: { xs: "flex", md: "none" },
  // MUI's 56px of tabs, then the safe-area padding the legacy bar drew. client.css reserves
  // 64px + the same safe-area under `.client-main`, so the bar never covers content.
  height: "auto",
  minHeight: 56,
  px: 0.75,
  pb: "max(env(safe-area-inset-bottom), 8px)",
  borderTop: 1,
  borderColor: "divider",
} as const;

const TAB_SX = { minWidth: 56, ...TAP_44 } as const;

/**
 * BottomNavigation clones every child with `selected`, `showLabel`, `value` and `onChange`.
 * Declared so they land on this function component and not on a DOM <span>; ignored,
 * because this tab is never selected and never changes anything.
 */
interface DisabledTabProps {
  destination: ClientDestination;
  value?: unknown;
  selected?: boolean;
  showLabel?: boolean;
  onChange?: unknown;
}

function DisabledTab({ destination }: DisabledTabProps) {
  return (
    <Box
      component="span"
      aria-disabled="true"
      title={`${destination.label} — ${CLIENT_NAV_MESSAGES.notYetLabel}`}
      sx={{
        // BottomNavigationAction's box, so the four tabs share the width evenly.
        display: "flex",
        flex: 1,
        maxWidth: 168,
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        px: 1.5,
        ...TAB_SX,
        ...DISABLED_SX,
      }}
    >
      <Icon name={destination.icon} size={22} />
      <Typography variant="caption" sx={{ fontSize: 12 }}>
        {destination.label}
      </Typography>
      <Box component="span" sx={VISUALLY_HIDDEN}>
        {destination.label} {CLIENT_NAV_MESSAGES.notYetAria}
      </Box>
    </Box>
  );
}

export function ClientBottomNav() {
  const pathname = usePathname();
  const activeId = activeDestinationId(pathname);

  return (
    <BottomNavigation
      component="nav"
      aria-label="Main"
      className="client-bottom-nav"
      showLabels
      // `false` matches no tab, so nothing is selected off the registry's routes.
      value={activeId ?? false}
      sx={BAR_SX}
    >
      {destinationsFor("bar").map((d) =>
        d.built ? (
          <BottomNavigationAction
            key={d.id}
            component={NextLink}
            href={d.href}
            value={d.id}
            label={d.label}
            icon={<Icon name={d.icon} size={22} />}
            aria-current={d.id === activeId ? "page" : undefined}
            sx={TAB_SX}
          />
        ) : (
          <DisabledTab key={d.id} destination={d} value={d.id} />
        ),
      )}
    </BottomNavigation>
  );
}
