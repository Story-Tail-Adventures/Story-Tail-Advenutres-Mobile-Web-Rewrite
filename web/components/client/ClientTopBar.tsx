import AppBar from "@mui/material/AppBar";
import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import Link from "@mui/material/Link";
import Toolbar from "@mui/material/Toolbar";

import { BrandMark } from "@/components/brand/BrandMark";
import NextLink from "@/components/mui/NextLink";
import { Icon } from "@/components/ui/Icon";
import { ThemeToggle } from "@/components/ui/ThemeToggle";

/**
 * The authenticated top bar (Design-System §9.1: 104px, brand mark, search pill, actions).
 *
 * Two departures from §9.1, both deliberate and both about not promising things:
 *
 *  * §9.1 specifies a role-aware SEARCH PILL. Search is §2.3, which is Phase 2, so there is
 *    nothing behind it. A search field that does nothing is worse than no field, so it is
 *    absent rather than disabled — unlike the nav rail, where a placeholder keeps the
 *    layout stable.
 *  * §9.1 specifies an action cluster of help, messages-with-dot, notifications-with-badge
 *    and an avatar with name and role. Help is §2.5.11 and notifications are §2.5.6,
 *    neither built. What ships is the bell (inert, and marked so) and the initials avatar.
 *
 * ON MUI (step 2 of the migration): a sticky AppBar on a dense Toolbar, the way
 * design/source-prototype/shared/mui-kit.jsx draws MuiScreenTopBar for role="client" —
 * elevation 0, a divider underneath, the bell in an IconButton and the initials in an
 * Avatar on primary. The HEIGHT is not the kit's 56px but `--client-topbar-h` (104px,
 * web/styles/client.css): the brand lockup is 80px tall, and the itinerary's day strip
 * sticks at `top: var(--client-topbar-h)`, so the bar and its dependants cannot drift.
 * The background is 92% surface with a blur, as before — the one colour here that is not
 * a palette path, because sx has no alpha for paths and MUI's own channel variable is the
 * scheme-following way to write one.
 *
 * This is a server component: it holds no state and reads no pathname, so it does not need
 * to be. Only the nav does. Every prop below is serialisable (plain sx, strings, a client
 * reference for the link).
 */
export function ClientTopBar({ initials }: { initials: string }) {
  return (
    <AppBar position="sticky" color="inherit" elevation={0} sx={TOPBAR_SX}>
      <Toolbar variant="dense" disableGutters sx={TOOLBAR_SX}>
        <Link
          component={NextLink}
          href="/dashboard"
          aria-label="Story-Tail Adventures — your trips"
          underline="none"
          color="inherit"
          sx={{ display: "inline-flex", minWidth: 0 }}
        >
          <BrandMark size={80} alt="" />
        </Link>

        <Box sx={{ flex: 1 }} />

        <ThemeToggle />

        <IconButton
          aria-label="Notifications — not available yet"
          aria-disabled="true"
          disabled
          sx={{ width: 40, height: 40, flex: "0 0 auto" }}
        >
          <Icon name="bell" size={18} />
        </IconButton>

        {/* Gyasi has no licensed photograph and neither does any client, so initials it is —
            the same choice §2.0's About page made for his portrait. */}
        <Avatar aria-hidden="true" title="Your account" sx={AVATAR_SX}>
          {initials}
        </Avatar>
      </Toolbar>
    </AppBar>
  );
}

const TOPBAR_SX = {
  // The bar's TOTAL height is the variable, border included, as it was under the legacy
  // CSS (border-box). Sized on the Toolbar instead, the 1px divider sat on top of it and
  // every offset that reads the variable (sticky strips, fill heights) came out 1px short.
  height: "var(--client-topbar-h)",
  boxSizing: "border-box",
  top: 0,
  // The legacy bar's z-index, kept: pages stack against it (the itinerary strip is 20).
  zIndex: 30,
  bgcolor: "rgba(var(--mui-palette-surface-mainChannel) / 0.92)",
  backdropFilter: "blur(10px)",
  borderBottom: 1,
  borderColor: "divider",
} as const;

const TOOLBAR_SX = {
  height: "100%",
  minHeight: { xs: 0 },
  px: 2,
  gap: 1.5,
} as const;

const AVATAR_SX = {
  width: 36,
  height: 36,
  fontSize: 13,
  fontWeight: 600,
  bgcolor: "primary.main",
  color: "primary.contrastText",
  flexShrink: 0,
} as const;
