import { afterEach, describe, expect, it, vi } from "vitest";
import { toggleScheme } from "./theme";

/**
 * The transition guard in toggleScheme: MUI surfaces animate their colors, so a scheme flip
 * without it fades each one from the old scheme to the new. The guard must be in place at
 * the moment of the flip and gone right after, or hover/focus animations stay dead for the
 * rest of the visit.
 */
const guards = () =>
  [...document.head.querySelectorAll("style")].filter((s) =>
    s.textContent?.includes("transition:none!important"),
  );

afterEach(() => {
  vi.useRealTimers();
  document.documentElement.classList.remove("scheme-dark");
  vi.unstubAllGlobals();
});

describe("toggleScheme", () => {
  it("switches transitions off for the flip and back on right after", () => {
    vi.useFakeTimers();
    // Storage may be missing under jsdom; the flip must not depend on it.
    vi.stubGlobal("localStorage", { setItem: vi.fn(), getItem: vi.fn() });

    expect(toggleScheme()).toBe("dark");
    // The class has flipped and the guard is still up: the browser's next style pass sees
    // the new colors with transitions off.
    expect(document.documentElement.classList.contains("scheme-dark")).toBe(true);
    expect(guards()).toHaveLength(1);

    vi.runAllTimers();
    expect(guards()).toHaveLength(0);
  });
});
