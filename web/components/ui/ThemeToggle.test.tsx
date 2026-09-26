import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ICON_PATHS } from "./icon-paths";
import { ThemeToggle } from "./ThemeToggle";

/**
 * MAKE BARE `localStorage` REAL BEFORE ANYTHING IMPORTS THE CODE UNDER TEST.
 *
 * jsdom implements storage on `window`, but vitest's `globals: true` copy does not carry
 * every accessor property across to globalThis, so the bare `localStorage` identifier — the
 * one `lib/theme.ts` and the pre-paint script use, and the one every browser provides — can
 * be undefined here. Left alone that does not fail loudly: `toggleScheme` wraps its write in
 * try/catch precisely so blocked storage cannot break the flip, so the persistence
 * assertions below would be testing a swallowed TypeError rather than a stored value.
 *
 * The round-trip assertion is the point. A shim that silently no-ops would make every
 * "remembers it" case green while proving nothing.
 */
function installStorage() {
  const store = new Map<string, string>();
  const shim: Storage = {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (k) => (store.has(k) ? store.get(k)! : null),
    key: (i) => [...store.keys()][i] ?? null,
    removeItem: (k) => void store.delete(k),
    setItem: (k, v) => void store.set(k, String(v)),
  };

  const existing = globalThis.localStorage ?? window?.localStorage;
  const usable = (() => {
    try {
      existing?.setItem("__probe__", "1");
      existing?.removeItem("__probe__");
      return Boolean(existing);
    } catch {
      return false;
    }
  })();

  vi.stubGlobal("localStorage", usable ? existing : shim);

  localStorage.setItem("__probe__", "1");
  if (localStorage.getItem("__probe__") !== "1") {
    throw new Error("localStorage does not round-trip in this environment.");
  }
  localStorage.removeItem("__probe__");
}

installStorage();

/**
 * BOTH BUTTONS ARE ALWAYS IN THE DOM — the component emits the light and dark halves and
 * lets CSS hide one, and vitest applies no CSS, so here both are present and queryable.
 * Query the one whose turn it would be: `toDark` is what a light page shows.
 *
 * Do NOT collapse these into one `/Switch to/` regex query; it matches both and throws.
 */
const toDark = () => screen.getByRole("button", { name: "Switch to dark mode" });
const toLight = () => screen.getByRole("button", { name: "Switch to light mode" });

beforeEach(() => {
  document.documentElement.className = "";
  localStorage.clear();
});

describe("ThemeToggle — the prerendered markup", () => {
  const html = renderToStaticMarkup(<ThemeToggle />);

  // The scheme is not knowable at SSR, so the server cannot pick a glyph. Both ship and CSS
  // chooses, exactly as BrandMark does with the two lockups.
  it("carries both glyphs", () => {
    expect(html).toContain(ICON_PATHS.moon);
    expect(html).toContain(ICON_PATHS.sun);
  });

  // Each half is a whole button with a STATIC aria-label. The earlier shape — one button
  // with an sr-only label per glyph — computed to no accessible name at all in Chrome,
  // because clipped text does not contribute to name-from-content. jsdom disagrees with
  // Chrome here, so this assertion is the DOM contract; the browser is what proved it.
  it("names each half with an aria-label rather than clipped text", () => {
    expect(html).toContain('aria-label="Switch to dark mode"');
    expect(html).toContain('aria-label="Switch to light mode"');
    expect(html).not.toContain("sr-only");
  });

  // On the buttons themselves, so the hidden half leaves the tab order too.
  it("gates the two buttons for CSS to choose between", () => {
    expect(html).toContain("sta-light-only");
    expect(html).toContain("sta-dark-only");
  });

  it("takes the glass chip only when asked, and never with a text-white utility", () => {
    expect(html).not.toContain("pub-topbar-glass");

    const overlayHtml = renderToStaticMarkup(<ThemeToggle overlay />);
    expect(overlayHtml).toContain("pub-topbar-glass");
    // A utility would outrank the class's own `md` reset and put the white-on-white back.
    expect(overlayHtml).not.toContain("text-white");
  });
});

/**
 * The real hydration guarantee, stated as a property: the output does not depend on browser
 * state. That is stronger than diffing a client render against renderToStaticMarkup, which
 * can differ in incidental whitespace and attribute order.
 */
describe("ThemeToggle — the markup does not depend on the scheme", () => {
  it("renders identically whether or not the page is already dark", () => {
    const { container: light } = render(<ThemeToggle />);
    const lightHtml = light.innerHTML;

    document.documentElement.classList.add("scheme-dark");
    const { container: dark } = render(<ThemeToggle />);

    expect(dark.innerHTML).toBe(lightHtml);
    expect(lightHtml).not.toBe("");
  });
});

describe("ThemeToggle — pressing it", () => {
  it("turns a light page dark and remembers it", async () => {
    render(<ThemeToggle />);
    await userEvent.click(toDark());

    expect(document.documentElement).toHaveClass("scheme-dark");
    expect(localStorage.getItem("sta-theme")).toBe("dark");
  });

  it("turns a dark page light and remembers that", async () => {
    document.documentElement.classList.add("scheme-dark");
    render(<ThemeToggle />);
    await userEvent.click(toLight());

    expect(document.documentElement).not.toHaveClass("scheme-dark");
    expect(localStorage.getItem("sta-theme")).toBe("light");
  });

  // It reads the live class rather than any state of its own, so it cannot drift out of step
  // with the page.
  it("returns to where it started after two presses", async () => {
    render(<ThemeToggle />);
    await userEvent.click(toDark());
    // Both buttons share one handler that reads the live class, so either can undo the
    // other — which is what keeps the pair from drifting out of step with the page.
    await userEvent.click(toLight());

    expect(document.documentElement).not.toHaveClass("scheme-dark");
    expect(localStorage.getItem("sta-theme")).toBe("light");
  });

  // A failed write is not a failed toggle: storage throws in a private window, and the
  // scheme should still flip for this page even though it will not survive the reload.
  it("still flips the scheme when storage is blocked", async () => {
    // The instance, not Storage.prototype: the fallback shim above is a plain object and
    // a prototype spy would miss it, leaving this case green against a working storage.
    vi.spyOn(localStorage, "setItem").mockImplementation(() => {
      throw new Error("The operation is insecure.");
    });

    render(<ThemeToggle />);
    await expect(userEvent.click(toDark())).resolves.not.toThrow();
    expect(document.documentElement).toHaveClass("scheme-dark");

    vi.restoreAllMocks();
  });
});
