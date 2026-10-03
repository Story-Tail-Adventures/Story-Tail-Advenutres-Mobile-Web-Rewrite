"use client";

import Box from "@mui/material/Box";
import MuiButton from "@mui/material/Button";
import Drawer from "@mui/material/Drawer";
import IconButton from "@mui/material/IconButton";
import MuiLink from "@mui/material/Link";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import Stack from "@mui/material/Stack";
import { cn } from "@/lib/cn";
import NextLink from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Icon } from "@/components/ui/Icon";
import { BrandMark } from "@/components/brand/BrandMark";
import { UP_WEB } from "@/lib/mui/sx";
import { useAuthChrome } from "@/lib/auth/use-auth-chrome";

export interface NavLink {
  href: string;
  label: string;
}

interface PublicNavProps {
  links: readonly NavLink[];
  /** Below `md` the bar sits on a photo, so the hamburger is white. */
  overlay?: boolean;
  /**
   * Chrome that belongs to the right-hand group but has to sit BEFORE the menu trigger —
   * the theme toggle. It comes through here rather than straight from PublicTopBar because
   * this component returns a fragment: its <nav> and its trigger are both direct flex
   * children of the header, so nothing outside can be placed between them.
   */
  actions?: ReactNode;
}

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** The artboard's nav link: body2 at 12.5px, text.secondary, text.primary and 600 when current. */
const NAV_LINK = {
  fontSize: 12.5,
  lineHeight: 1,
  fontWeight: 500,
  color: "text.secondary",
  px: "5px",
  py: "10px",
  borderRadius: 1,
  whiteSpace: "nowrap",
  "&:hover": { color: "text.primary" },
  '&[aria-current="page"]': { color: "text.primary", fontWeight: 600 },
  [UP_WEB]: { px: 1 },
} as const;

/** The legacy .btn-lg box (48px, 28px sides) on MUI's large button. */
const DRAWER_BUTTON = { minHeight: 48, px: "28px" } as const;

/**
 * The only client island in the public shell besides the auth cluster: desktop links need
 * the current path for `aria-current`, and the mobile menu is an MUI Drawer (focus trap,
 * Escape, backdrop and focus return are the Modal's). Closes itself after navigation.
 *
 * The open state is "opened on this path": the Drawer is open while the path it was opened
 * from is still the current one, so a route change closes it with no effect and no
 * setState-in-effect. The Modal then hands focus back to the trigger on its own.
 */
export function PublicNav({ links, overlay = false, actions }: PublicNavProps) {
  const pathname = usePathname();
  const { status: authStatus } = useAuthChrome();
  const [openedOn, setOpenedOn] = useState<string | null>(null);
  const open = openedOn === pathname;

  const openMenu = () => setOpenedOn(pathname);
  const closeMenu = () => setOpenedOn(null);

  return (
    <>
      <Stack
        component="nav"
        aria-label="Primary"
        direction="row"
        sx={{
          display: { xs: "none", md: "flex" },
          alignItems: "center",
          gap: 0.25,
          ml: 0.5,
          [UP_WEB]: { ml: 1, gap: 0.5 },
        }}
      >
        {links.map((link) => {
          const active = isActive(pathname, link.href);
          return (
            <MuiLink
              key={link.href}
              component={NextLink}
              href={link.href}
              underline="none"
              variant="body2"
              aria-current={active ? "page" : undefined}
              sx={NAV_LINK}
            >
              {link.label}
            </MuiLink>
          );
        })}
      </Stack>

      {/* THE ONE AUTO MARGIN IN THIS HEADER, and it is a spacer rather than an `ml: auto` on
          whichever control happens to be visible. It used to be the latter: the trigger
          below carried one and PublicAuthCluster carried another, and exactly one of them
          was ever displayed — which mattered, because flexbox splits free space EQUALLY
          among multiple auto margins, so two live ones would have parked both mid-bar.
          That held only while nothing else joined the group. The theme toggle did, and it
          has to sit left of the trigger to match the design, so the group now opens with an
          explicit spacer — the idiom ClientTopBar and AgentTopBar already use — and
          everything after it simply falls in order. */}
      <Box sx={{ flex: 1 }} />

      {actions}

      <IconButton
        // `.pub-topbar-glass` RATHER THAN a white colour utility: the overlay bar is only
        // transparent below `md` — it goes solid at 768px — and the class gates itself back
        // off there (styles/public.css). ThemeToggle wears the same class, so the pair match.
        className={cn("tap-44", overlay && "pub-topbar-glass")}
        aria-haspopup="dialog"
        aria-expanded={open}
        // Only while open: the Drawer is not mounted when closed, and aria-controls must
        // not point at an id that is not in the document.
        aria-controls={open ? "pub-menu" : undefined}
        aria-label="Open menu"
        onClick={openMenu}
        sx={{
          // 36px, the legacy size-9, matching the theme toggle beside it. `tap-44` below
          // grows the touch target to 44px without growing the visible chip.
          width: 36,
          height: 36,
          // Through tablet, not just mobile: from `md` the inline links are back but the
          // sign-in buttons are not, and the drawer is where they live.
          display: { lg: "none" },
        }}
      >
        <Icon name="menu" size={20} />
      </IconButton>

      <Drawer
        anchor="right"
        open={open}
        onClose={closeMenu}
        slotProps={{
          paper: {
            id: "pub-menu",
            role: "dialog",
            "aria-modal": true,
            "aria-label": "Menu",
            sx: { width: "100%", maxWidth: 360 },
          },
        }}
      >
        {/* Any link followed from the drawer closes it. Route changes alone are not enough:
            the open state is "opened on this path", so without this, following a link and
            pressing Back reopened the drawer on the page it was opened from. */}
        <Box
          onClick={(event) => {
            if ((event.target as Element).closest("a")) closeMenu();
          }}
          sx={{ display: "flex", height: "100%", flexDirection: "column", p: 2.5 }}
        >
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <Box
              component={NextLink}
              href="/"
              aria-label="Story-Tail Adventures home"
              onClick={closeMenu}
              sx={{ display: "inline-flex" }}
            >
              <BrandMark size={80} alt="" />
            </Box>
            <IconButton aria-label="Close menu" onClick={closeMenu} sx={{ width: 44, height: 44 }}>
              <Icon name="close" size={20} />
            </IconButton>
          </Box>

          <Box component="nav" aria-label="Primary" sx={{ mt: 3 }}>
            <List disablePadding>
              {links.map((link) => {
                const active = isActive(pathname, link.href);
                return (
                  <ListItem key={link.href} disablePadding>
                    <ListItemButton
                      component={NextLink}
                      href={link.href}
                      selected={active}
                      aria-current={active ? "page" : undefined}
                      sx={{
                        minHeight: 44,
                        borderRadius: 1,
                        px: 1,
                        py: 1.25,
                        "&.Mui-selected, &.Mui-selected:hover": {
                          bgcolor: "secondary.container",
                          color: "secondary.onContainer",
                        },
                      }}
                    >
                      <ListItemText
                        primary={link.label}
                        sx={{ my: 0 }}
                        slotProps={{
                          primary: { variant: "subtitle1", sx: { fontWeight: 600, lineHeight: 1.25 } },
                        }}
                      />
                    </ListItemButton>
                  </ListItem>
                );
              })}
            </List>
          </Box>

          {/* The drawer is the ONLY home for these below `lg` — PublicTopBar's cluster shows
              from `lg` — so it has to answer to the session too, or every tablet and phone
              visitor keeps being asked to sign in while signed in.
              No CSS gate is needed here, unlike the top bar: the Drawer mounts on open,
              so nobody can see it before the store has resolved. */}
          <Stack spacing={1} sx={{ mt: "auto", pt: 3 }}>
            {authStatus === "in" ? (
              <MuiButton
                component={NextLink}
                href="/dashboard"
                variant="contained"
                size="large"
                fullWidth
                onClick={closeMenu}
                sx={DRAWER_BUTTON}
              >
                Your trips
              </MuiButton>
            ) : (
              <>
                <MuiButton
                  component={NextLink}
                  href="/join"
                  variant="contained"
                  size="large"
                  fullWidth
                  sx={DRAWER_BUTTON}
                >
                  Create an account
                </MuiButton>
                <MuiButton
                  component={NextLink}
                  href="/login"
                  variant="outlined"
                  size="large"
                  fullWidth
                  sx={DRAWER_BUTTON}
                >
                  Sign in
                </MuiButton>
              </>
            )}
          </Stack>

          <Stack
            component="ul"
            direction="row"
            useFlexGap
            sx={{
              flexWrap: "wrap",
              columnGap: 2,
              rowGap: 1,
              m: 0,
              mt: 2.5,
              p: 0,
              listStyle: "none",
              color: "text.secondary",
            }}
          >
            <li>
              <MuiLink component={NextLink} href="/how-it-works" underline="hover" variant="caption" color="inherit" sx={{ fontWeight: 500 }}>
                How it works
              </MuiLink>
            </li>
            <li>
              <MuiLink component={NextLink} href="/legal/privacy" underline="hover" variant="caption" color="inherit" sx={{ fontWeight: 500 }}>
                Privacy
              </MuiLink>
            </li>
            <li>
              <MuiLink component={NextLink} href="/legal/terms" underline="hover" variant="caption" color="inherit" sx={{ fontWeight: 500 }}>
                Terms
              </MuiLink>
            </li>
          </Stack>
        </Box>
      </Drawer>
    </>
  );
}
