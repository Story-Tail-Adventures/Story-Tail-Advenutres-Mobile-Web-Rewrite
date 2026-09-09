"use client";

import * as React from "react";

/**
 * The popover mechanics shared by every date picker in the app.
 *
 * Extracted because this is the fiddly, drift-prone half — anchoring, viewport clamping,
 * flipping, mirroring `open` for `aria-expanded`, and returning focus on a programmatic
 * close. The half that is NOT here is the grid and the keyboard model, which genuinely
 * differ between a range picker (two months, no past dates) and a single-date one (one
 * month, an explicit min/max, and a year that has to be reachable in one gesture).
 *
 * WHY `popover="auto"` AT ALL. `HeroBleed` puts `overflow-hidden` on a 280px-tall hero and a
 * month grid is taller than that, so an absolutely-positioned panel is clipped by its own
 * ancestor — the default outcome, not a risk. The top layer is immune to ancestor overflow,
 * z-index and transforms, and brings Escape, light-dismiss and focus-return for free.
 */

/** Client capability, read through useSyncExternalStore so there is no setState-in-effect. */
const noopSubscribe = () => () => {};
const clientSnapshot = () => typeof HTMLElement.prototype.showPopover === "function";
const serverSnapshot = () => false;

export function usePopoverSupported(): boolean {
  return React.useSyncExternalStore(noopSubscribe, clientSnapshot, serverSnapshot);
}

export interface DatePopover {
  open: boolean;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
  panelRef: React.RefObject<HTMLDivElement | null>;
  /** Hide and put focus back on the trigger. */
  close: () => void;
}

export function useDatePopover(enabled: boolean): DatePopover {
  const [open, setOpen] = React.useState(false);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);

  // Anchor under the trigger, clamped into the viewport, flipped above when there is no room
  // below. Anchor positioning would do this in CSS but is not portable yet.
  const position = React.useCallback(() => {
    const trigger = triggerRef.current;
    const panel = panelRef.current;
    if (!trigger || !panel) return;
    const rect = trigger.getBoundingClientRect();
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - panel.offsetWidth - 8));
    panel.style.left = `${left}px`;
    const below = window.innerHeight - rect.bottom;
    const height = panel.offsetHeight;
    panel.style.top = below < height + 16 && rect.top > height + 16
      ? `${rect.top - height - 8}px`
      : `${rect.bottom + 8}px`;
  }, []);

  React.useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const onToggle = (event: Event) => {
      const next = (event as ToggleEvent).newState === "open";
      setOpen(next);
      if (next) position();
    };
    panel.addEventListener("toggle", onToggle);
    return () => panel.removeEventListener("toggle", onToggle);
  }, [enabled, position]);

  React.useEffect(() => {
    if (!open) return;
    const onScroll = () => panelRef.current?.hidePopover();
    window.addEventListener("resize", position);
    // Capture, because the scroller is an ancestor rather than the window on some layouts.
    window.addEventListener("scroll", onScroll, { capture: true });
    return () => {
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", onScroll, { capture: true });
    };
  }, [open, position]);

  /**
   * The popover API returns focus to the invoker on light-dismiss and Escape, but NOT on a
   * programmatic `hidePopover()` — that leaves focus on a now-hidden node, which for a
   * keyboard user means focus falls back to <body> and their place in the form is lost.
   */
  const close = React.useCallback(() => {
    panelRef.current?.hidePopover();
    triggerRef.current?.focus();
  }, []);

  return { open, triggerRef, panelRef, close };
}
