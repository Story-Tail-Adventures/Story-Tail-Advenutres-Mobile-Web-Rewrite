"use client";

import * as React from "react";
import Link from "next/link";
import Avatar from "@mui/material/Avatar";
import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";

import { stopPushHere } from "@/lib/agent/pushClient";
import { signOutAction } from "@/lib/auth/actions";
import { Icon } from "@/components/ui/Icon";
import { SETTINGS_COPY } from "@/lib/agent/settingsCopy";

/**
 * §3.12's avatar menu (Q2): the way to Settings, and Sign out.
 *
 * SIGN OUT MOVED IN HERE from its own button in the bar, as ruled. It stays one tap from
 * every agent page at every width (the trigger is always drawn, and is the bar's last
 * control), which is the property the old button existed for: §3.2 sends an advisor off
 * every client route, so this is the only sign-out an advisor has on the web.
 *
 * Sign-out is a real MenuItem, a direct child of the menu list, so arrow keys reach it. (A
 * <form> wrapped around it inside the list is invalid there, and MUI's roving focus skips it,
 * which left keyboard users unable to sign out.) It does what AgentSignOutForm does: turn off
 * this browser's notifications, then the sign-out server action, which redirects.
 */
export function AgentAccountMenu({ initials }: { initials: string }) {
  const [anchorEl, setAnchorEl] = React.useState<HTMLElement | null>(null);
  const open = anchorEl !== null;
  const buttonId = React.useId();
  const menuId = React.useId();
  const close = () => setAnchorEl(null);
  const [signingOut, startSignOut] = React.useTransition();
  const signOut = () => {
    if (signingOut) return;
    startSignOut(async () => {
      await stopPushHere();
      await signOutAction();
    });
  };

  return (
    <>
      <IconButton
        id={buttonId}
        aria-label={SETTINGS_COPY.menu.trigger}
        aria-haspopup="menu"
        aria-controls={open ? menuId : undefined}
        aria-expanded={open ? "true" : undefined}
        onClick={(event) => setAnchorEl(event.currentTarget)}
        sx={TRIGGER_SX}
      >
        <Avatar aria-hidden="true" sx={AVATAR_SX}>
          {initials}
        </Avatar>
      </IconButton>

      <Menu
        id={menuId}
        anchorEl={anchorEl}
        open={open}
        onClose={close}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        slotProps={{
          list: { "aria-labelledby": buttonId, dense: true },
          paper: { sx: PAPER_SX },
        }}
      >
        <MenuItem component={Link} href="/agent/settings" onClick={close}>
          <ListItemIcon>
            <Icon name="user" size={18} />
          </ListItemIcon>
          <ListItemText>{SETTINGS_COPY.menu.settings}</ListItemText>
        </MenuItem>
        <Divider />
        <MenuItem onClick={signOut} disabled={signingOut}>
          <ListItemIcon>
            <Icon name="lock" size={18} />
          </ListItemIcon>
          <ListItemText>{SETTINGS_COPY.menu.signOut}</ListItemText>
        </MenuItem>
      </Menu>
    </>
  );
}

// 44px: the §4.2 touch minimum, around the 36px avatar the bar always drew.
const TRIGGER_SX = { width: 44, height: 44, p: 0.25 } as const;

const AVATAR_SX = {
  width: 36,
  height: 36,
  fontSize: 13,
  fontWeight: 600,
  bgcolor: "primary.main",
  color: "primary.contrastText",
} as const;

const PAPER_SX = { mt: 0.5, minWidth: 200 } as const;
