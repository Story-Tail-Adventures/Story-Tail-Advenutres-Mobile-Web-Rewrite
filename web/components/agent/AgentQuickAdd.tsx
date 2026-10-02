"use client";

import * as React from "react";
import Link from "next/link";
import IconButton from "@mui/material/IconButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";

import { Icon, type IconName } from "@/components/ui/Icon";

/**
 * The top bar's quick-add menu (§3.3.9 + §3.4.3), as an MUI Menu.
 *
 * THE ONLY CLIENT ISLAND IN THE AGENT TOP BAR. The bar itself stays a Server Component and
 * hands this the two entries as plain data, so the hrefs and the labels keep living beside
 * the bar's other copy rather than in here. This file holds the mechanism only: one piece
 * of state (which element the menu is anchored to) and the ARIA wiring between the trigger
 * and the list.
 *
 * It replaced a native `<details>` on 2026-10-01 (MUI everywhere). What the Menu brings
 * that the `<details>` did not: Escape, click-away, arrow-key movement between the entries,
 * a focus return to the trigger on close, and a portal so the list is never clipped by the
 * bar. What it gives up is opening with JavaScript off, which was accepted in that ruling.
 *
 * Each entry is an `<a role="menuitem">` — MUI's own pattern for a menu of links — so the
 * second click goes straight to Next's router rather than through an onClick.
 */

export interface QuickAddItem {
  href: string;
  icon: IconName;
  label: string;
}

export interface AgentQuickAddProps {
  /** Accessible name of the trigger button. */
  label: string;
  items: readonly QuickAddItem[];
}

export function AgentQuickAdd({ label, items }: AgentQuickAddProps) {
  const [anchorEl, setAnchorEl] = React.useState<HTMLElement | null>(null);
  const open = anchorEl !== null;
  const buttonId = React.useId();
  const menuId = React.useId();
  const close = () => setAnchorEl(null);

  return (
    <>
      <IconButton
        id={buttonId}
        aria-label={label}
        aria-haspopup="menu"
        aria-controls={open ? menuId : undefined}
        aria-expanded={open ? "true" : undefined}
        onClick={(event) => setAnchorEl(event.currentTarget)}
        sx={TRIGGER_SX}
      >
        <Icon name="plus" size={18} />
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
        {items.map((item) => (
          <MenuItem key={item.href} component={Link} href={item.href} onClick={close}>
            <ListItemIcon>
              <Icon name={item.icon} size={18} />
            </ListItemIcon>
            <ListItemText>{item.label}</ListItemText>
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}

// The legacy .btn-icon box, so the bar's controls stay one size.
const TRIGGER_SX = { width: 40, height: 40 } as const;

// The old list sat 4px under the bar and was 176px wide (`mt-1 w-44`).
const PAPER_SX = { mt: 0.5, minWidth: 176 } as const;
