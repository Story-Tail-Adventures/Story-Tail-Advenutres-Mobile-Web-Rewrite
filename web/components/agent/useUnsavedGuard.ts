"use client";

import { useEffect } from "react";

/**
 * While `dirty`, the browser's own prompt on reload or close, and a confirm on any in-app
 * link (capture phase, so it runs before Next's Link starts the navigation). The same guard
 * MessageTemplateEditor carries, shared here for §3.12's tabs (Q25: leaving a tab with unsaved
 * changes asks first).
 */
export function useUnsavedGuard(dirty: boolean, message: string): void {
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    const guardLinks = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
      // A new tab, a download or a jump within the page discards nothing.
      if (a.target === "_blank" || a.hasAttribute("download") || a.getAttribute("href")?.startsWith("#")) return;
      if (!window.confirm(message)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", warn);
    document.addEventListener("click", guardLinks, true);
    return () => {
      window.removeEventListener("beforeunload", warn);
      document.removeEventListener("click", guardLinks, true);
    };
  }, [dirty, message]);
}
