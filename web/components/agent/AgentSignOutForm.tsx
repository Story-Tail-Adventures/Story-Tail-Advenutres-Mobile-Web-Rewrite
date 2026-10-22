"use client";

import type { ReactNode } from "react";
import Box from "@mui/material/Box";
import type { SxProps, Theme } from "@mui/material/styles";

import { stopPushHere } from "@/lib/agent/pushClient";
import { signOutAction } from "@/lib/auth/actions";

/**
 * The agent top bar's sign-out, with one step in front: this browser's notifications stop first
 * (§3.10.7: "signing out stops that device's notifications at once"). That needs the browser's
 * own subscription, which a server action cannot see, so the form's action runs here and then
 * hands over to the same `signOutAction` as before. `stopPushHere` never throws and gives up
 * after two seconds, so sign-out can never be held up by it.
 */
export function AgentSignOutForm({ children, sx }: { children: ReactNode; sx?: SxProps<Theme> }) {
  const signOut = async () => {
    await stopPushHere();
    await signOutAction();
  };
  return (
    <Box component="form" action={signOut} sx={sx}>
      {children}
    </Box>
  );
}
