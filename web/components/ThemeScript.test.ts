import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { themeScript } from "./ThemeScript";

/**
 * The pre-paint script is the ONLY thing that makes a choice made in the top bar survive a
 * reload, and none of it is reachable through the component — it ships as a string. So it
 * is evaluated here the way the browser evaluates it.
 *
 * STUB `matchMedia` EXPLICITLY IN EVERY CASE. jsdom's implementation never matches a media
 * query (`matches` is always false) and in some environments it is absent entirely — and
 * the script wraps its whole body in try/catch, so a missing `matchMedia` is swallowed, the
 * class is never set, and a test that meant to assert "follows a dark OS" goes green having
 * proved nothing.
 */

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

const run = () => new Function(themeScript)();

function setOsPrefersDark(dark: boolean) {
  window.matchMedia = vi.fn((query: string) => ({
    matches: dark && query === "(prefers-color-scheme: dark)",
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

const isDark = () => document.documentElement.classList.contains("scheme-dark");

beforeEach(() => {
  document.documentElement.className = "";
  localStorage.clear();
});

afterEach(() => {
  // NOT `vi.unstubAllGlobals()` — that would tear down the localStorage stub installed
  // above and every case after the first would see `undefined` again. `matchMedia` is
  // assigned directly rather than stubbed, and every case sets it, so nothing here leaks.
  vi.restoreAllMocks();
});

describe("ThemeScript — with nothing stored, it follows the OS", () => {
  it("sets the class on a dark device", () => {
    setOsPrefersDark(true);
    run();
    expect(isDark()).toBe(true);
  });

  it("leaves it off on a light device", () => {
    setOsPrefersDark(false);
    run();
    expect(isDark()).toBe(false);
  });
});

describe("ThemeScript — a stored choice beats the OS", () => {
  it('honours "dark" on a light device', () => {
    setOsPrefersDark(false);
    localStorage.setItem("sta-theme", "dark");
    run();
    expect(isDark()).toBe(true);
  });

  // THE WHOLE POINT OF THE FEATURE. Everything else in this file is scaffolding around it:
  // someone on a dark device who presses the toggle has to still be in light after a reload.
  it('honours "light" on a dark device', () => {
    setOsPrefersDark(true);
    localStorage.setItem("sta-theme", "light");
    run();
    expect(isDark()).toBe(false);
  });
});

describe("ThemeScript — anything that is not an explicit choice falls through to the OS", () => {
  // The regression this guards: the expression here used to be
  // `stored ? stored === "dark" : <os>`, which stopped consulting the OS as soon as
  // ANYTHING was stored. "system" is the third value ThemePreference carries and the one a
  // settings screen would write, and it rendered light on a dark device.
  it.each(["system", "", "DARK", "true", "{}"])(
    'treats %o as "follow the OS"',
    (stored) => {
      setOsPrefersDark(true);
      localStorage.setItem("sta-theme", stored);
      run();
      expect(isDark()).toBe(true);
    },
  );
});

describe("ThemeScript — blocked storage", () => {
  it("falls through to light without throwing", () => {
    setOsPrefersDark(false);
    vi.spyOn(localStorage, "getItem").mockImplementation(() => {
      throw new Error("The operation is insecure.");
    });

    expect(() => run()).not.toThrow();
    expect(isDark()).toBe(false);
  });
});

describe("ThemeScript — the address-bar tint", () => {
  function plantMetas() {
    document.head.innerHTML =
      '<meta name="theme-color" media="(prefers-color-scheme: light)" content="#FBF6EE">' +
      '<meta name="theme-color" media="(prefers-color-scheme: dark)" content="#050D1A">';
    return () =>
      [...document.head.querySelectorAll('meta[name="theme-color"]')].map((m) =>
        m.getAttribute("content"),
      );
  }

  afterEach(() => {
    document.head.innerHTML = "";
  });

  // Both, not one. The browser matches these against the OS, not against the override, so
  // the only way to be sure the matching one is right is to make them agree.
  it("rewrites BOTH metas when a choice is stored", () => {
    const contents = plantMetas();
    setOsPrefersDark(true);
    localStorage.setItem("sta-theme", "light");
    run();
    expect(contents()).toEqual(["#FBF6EE", "#FBF6EE"]);
  });

  it("rewrites both to the dark tint for a stored dark", () => {
    const contents = plantMetas();
    setOsPrefersDark(false);
    localStorage.setItem("sta-theme", "dark");
    run();
    expect(contents()).toEqual(["#050D1A", "#050D1A"]);
  });

  it("leaves the static pair alone when nothing is stored", () => {
    const contents = plantMetas();
    setOsPrefersDark(true);
    run();
    expect(contents()).toEqual(["#FBF6EE", "#050D1A"]);
  });
});
