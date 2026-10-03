"use client";

import { useCallback, useSyncExternalStore } from "react";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import type { SxProps, Theme } from "@mui/material/styles";
import { Icon } from "@/components/ui/Icon";

/**
 * A tiny external store over localStorage so React reads the dismissed flag through
 * useSyncExternalStore (server snapshot: not dismissed) instead of setting state in an
 * effect. Same-window writes notify subscribers directly; other tabs arrive via `storage`.
 */
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function readDismissed(storageKey: string): boolean {
  try {
    return window.localStorage.getItem(storageKey) === "1";
  } catch {
    return false;
  }
}

function writeDismissed(storageKey: string) {
  try {
    window.localStorage.setItem(storageKey, "1");
  } catch {
    /* storage blocked — the banner just stays for this visit */
  }
  listeners.forEach((l) => l());
}

/**
 * Wraps a banner with a dismiss button remembered in localStorage.
 *
 * Deliberately not a cookie: reading a cookie in the page would make every public route
 * dynamic. The banner renders on the server and disappears on hydration for visitors who
 * dismissed it before — a brief flash for them, static HTML for everyone.
 *
 * `sx` is where a caller's breakpoint gate goes (SigninBanner shows from `md`). It belongs
 * on THIS wrapper rather than on SignedOutOnly — see that file for why a display rule on
 * the gated element would quietly defeat the pre-paint gate.
 */
export function DismissibleBanner({
  storageKey,
  children,
  className,
  sx,
}: {
  storageKey: string;
  children: React.ReactNode;
  className?: string;
  sx?: SxProps<Theme>;
}) {
  const getSnapshot = useCallback(() => readDismissed(storageKey), [storageKey]);
  const dismissed = useSyncExternalStore(subscribe, getSnapshot, () => false);

  if (dismissed) return null;

  return (
    <Box className={className} sx={[{ position: "relative" }, ...(Array.isArray(sx) ? sx : [sx])]}>
      {children}
      <IconButton
        aria-label="Dismiss"
        onClick={() => writeDismissed(storageKey)}
        sx={{
          position: "absolute",
          top: "50%",
          right: 8,
          transform: "translateY(-50%)",
          width: 32,
          height: 32,
          color: "text.primary",
          "@media (pointer: coarse)": { minWidth: 44, minHeight: 44 },
        }}
      >
        <Icon name="close" size={16} />
      </IconButton>
    </Box>
  );
}
