"use client";

import { useEffect } from "react";

import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";
import { applyScheme, THEME_STORAGE_KEY, toggleScheme } from "@/lib/theme";

export interface ThemeToggleProps {
  /**
   * The bar this sits in floats transparent over a hero photo (PublicTopBar's `overlay`
   * variant). Adds the glass chip, which gates itself back off at `md` where that bar
   * goes solid.
   */
  overlay?: boolean;
  /** Glyph size. 18 to sit with the bell in the authenticated bars, 20 with the hamburger. */
  size?: number;
  className?: string;
}

/**
 * The light/dark toggle — Design-System §10.1, one press, two states.
 *
 * It is the write half of a mechanism that has been half-built since the start: the
 * pre-paint script in components/ThemeScript.tsx has always READ `sta-theme`, and until
 * now nothing anywhere wrote it, because §10.1 put the override on a Settings → Appearance
 * screen the Screen Inventory never specified. The control moved into the top bar instead.
 *
 * TWO STATES, NOT THREE. Pressing this stores an explicit choice and the OS is ignored
 * from then on; there is no "match my device" anywhere, so going back means clearing site
 * data. Accepted deliberately on 2026-09-25 to keep this to a single press.
 *
 * ── It holds no state, and that is the whole design ───────────────────────────────────
 *
 * The scheme is not knowable at SSR — it lives in localStorage — so the server cannot pick
 * the right control. BOTH are emitted and CSS hides one, exactly as BrandMark does with the
 * two lockups and for exactly the same reason.
 *
 * Because the markup never depends on the scheme, the server and client renders are
 * identical by construction: there is nothing to reconcile, so no hydration mismatch, and
 * no frame showing the wrong icon — the CSS gate resolves at the same moment ThemeScript
 * sets the class, before first paint. The click handler reads the current scheme straight
 * off <html>, which is the real source of truth.
 *
 * A useSyncExternalStore store (the use-auth-chrome.ts pattern) would buy nothing here.
 * `getServerSnapshot` feeds the hydration render too, so both halves would still have to
 * ship — the same markup, plus a store, plus a re-render per click.
 *
 * ── TWO WHOLE BUTTONS, NOT ONE BUTTON WITH TWO LABELS ─────────────────────────────────
 *
 * The gate is on the <button> itself, so each one carries a plain static `aria-label`.
 * The first attempt was one button holding both glyphs with an `sr-only` label beside
 * each, on the theory that `display: none` drops the hidden label out of the accessibility
 * tree and leaves exactly one name. Measured in Chrome, that button had NO accessible name
 * at all: Tailwind's `sr-only` (`clip-path: inset(50%)` on a 1×1 box) does not contribute
 * to name-from-content, so hiding one label left nothing behind. Plain text and
 * `aria-label` both name a button; clipped text does not.
 *
 * Nothing in a unit test catches that — jsdom's accname implementation DOES count sr-only
 * text, so the one-button version passed while shipping an unlabelled control into a
 * product whose BRD §9 requires WCAG 2.1 AA. It took a real browser.
 *
 * Only one button is rendered at a time, so only one is focusable and only one is in the
 * tree; `display: none` is reliable for that even though it is not reliable for naming.
 * The static label also buys back a `title`, which now covers the whole 40px target
 * instead of just the glyph.
 *
 * `shrink-0` is not decoration: .btn-icon sets a width but no flex-shrink, so the button
 * squashes in a cramped bar without it.
 *
 * ── The one effect, and why it is not about the scheme ────────────────────────────────
 *
 * The class is set before first paint and needs nothing after. The ADDRESS-BAR TINT does:
 * React re-emits the metadata it carries in the RSC payload during hydration, which can
 * land after the pre-paint script has already rewritten the theme-color metas, leaving a
 * stale one in the document. Re-applying once on mount catches whatever arrived late.
 *
 * It touches <meta> only. The class it also writes is already correct, so this cannot
 * flash, cannot reorder anything, and does not make the rendered output depend on browser
 * state — the property the whole design rests on still holds.
 *
 * `tap-44` buys the §4.2 touch minimum on coarse pointers. It does it with a ::after inset
 * of -8px rather than a min-height, which matters for a ROUND button: the `min-height:
 * 44px` the agent bar uses on .agent-signout would turn a 40px circle into a 40×44 oval.
 * The class is defined in public.css but is generic and globally available (its
 * @layer components block is not scoped), and reusing it beats a third mechanism.
 */
export function ThemeToggle({ overlay = false, size = 18, className }: ThemeToggleProps) {
  const base = cn("btn-icon tap-44 shrink-0", overlay && "pub-topbar-glass", className);
  const flip = () => toggleScheme();

  useEffect(() => {
    try {
      // Only with an explicit override. Without one the static pair layout.tsx emits is
      // already right, and rewriting it would break the OS-follows case.
      if (localStorage.getItem(THEME_STORAGE_KEY)) {
        applyScheme(document.documentElement.classList.contains("scheme-dark"));
      }
    } catch {
      /* Storage blocked — nothing was overridden, so the static pair stands. */
    }
  }, []);

  return (
    <>
      {/* THE GLYPH IS THE SCHEME YOU ARE SWITCHING *TO*. The button shown while the page is
          light carries a moon; the one shown while it is dark carries a sun. It reads
          backwards at a glance and it is correct — the label says what pressing does. */}
      <button
        type="button"
        className={cn(base, "sta-light-only")}
        aria-label="Switch to dark mode"
        title="Switch to dark mode"
        onClick={flip}
      >
        <Icon name="moon" size={size} />
      </button>

      <button
        type="button"
        className={cn(base, "sta-dark-only")}
        aria-label="Switch to light mode"
        title="Switch to light mode"
        onClick={flip}
      >
        <Icon name="sun" size={size} />
      </button>
    </>
  );
}
