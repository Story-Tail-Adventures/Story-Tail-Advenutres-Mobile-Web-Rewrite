"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";

import { SETTINGS_COPY } from "@/lib/agent/settingsCopy";
import { SETTINGS_TABS, validSettingsTab } from "@/lib/agent/settingsTabs";
import { TAP_TARGET } from "@/lib/mui/sx";

const TAB_SX = { ...TAP_TARGET, flexShrink: 0 } as const;

/**
 * §3.12's tab bar: links, one URL per tab (`?tab=`), drawn as Client Detail's chips so the
 * two tabbed agent pages look alike. A tab with unsaved changes stops a switch through the
 * form's own `useUnsavedGuard`, which catches every in-app link, these included.
 */
export function SettingsTabs() {
  const searchParams = useSearchParams();
  const active = validSettingsTab(searchParams.get("tab") ?? undefined);
  return (
    <Box component="nav" aria-label={SETTINGS_COPY.tabsLabel} sx={{ mt: 2, display: "flex", flexWrap: "wrap", gap: 0.75 }}>
      {SETTINGS_TABS.map((t) => {
        const on = t.id === active;
        return (
          <Chip
            key={t.id}
            component={Link}
            href={t.id === "profile" ? "/agent/settings" : `/agent/settings?tab=${t.id}`}
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
