"use client";

import { useCallback, useSyncExternalStore } from "react";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";

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
 */
export function DismissibleBanner({
  storageKey,
  children,
  className,
}: {
  storageKey: string;
  children: React.ReactNode;
  className?: string;
}) {
  const getSnapshot = useCallback(() => readDismissed(storageKey), [storageKey]);
  const dismissed = useSyncExternalStore(subscribe, getSnapshot, () => false);

  if (dismissed) return null;

  return (
    <div className={cn("relative", className)}>
      {children}
      <button
        type="button"
        className="btn-icon tap-44 absolute top-1/2 right-2 size-8 -translate-y-1/2 text-on-surface"
        aria-label="Dismiss"
        onClick={() => writeDismissed(storageKey)}
      >
        <Icon name="close" size={16} />
      </button>
    </div>
  );
}
