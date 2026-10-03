import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, onTestFinished, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import Button from "@mui/material/Button";
import { MuiRegistry } from "./MuiRegistry";

/**
 * MuiRegistry must leave the scheme entirely to ThemeScript (components/ThemeScript.tsx).
 *
 * MUI's ThemeProvider, left on its defaults, does three things this app cannot have: it
 * replaces the `scheme-*` class on <html> with its own guess from the OS, it reads and
 * writes its own localStorage keys, and it can render different markup per mode. Each
 * would undo the pre-paint script: a flash of the wrong scheme, a toggle that does not
 * stick, a hydration mismatch. These tests pin all three shut.
 */
afterEach(() => {
  document.documentElement.className = "";
  vi.restoreAllMocks();
});

describe("MuiRegistry", () => {
  it("never touches the scheme class on <html>", () => {
    document.documentElement.className = "scheme-dark font-x";
    render(
      <MuiRegistry>
        <Button>Plan a trip</Button>
      </MuiRegistry>,
    );
    expect(screen.getByRole("button", { name: "Plan a trip" })).toBeInTheDocument();
    expect(document.documentElement.className).toBe("scheme-dark font-x");

    document.documentElement.className = "";
    render(
      <MuiRegistry>
        <Button>Again</Button>
      </MuiRegistry>,
    );
    expect(document.documentElement.classList.contains("scheme-light")).toBe(false);
    expect(document.documentElement.classList.contains("scheme-dark")).toBe(false);
  });

  it("never reads or writes localStorage", () => {
    // jsdom under vitest does not always expose window.localStorage (see the shim in
    // components/ui/ThemeToggle.test.tsx), so give MUI a spy-backed one to find. Its
    // default storage manager reads `window.localStorage` and would call getItem on mount.
    const get = vi.fn(() => null);
    const set = vi.fn();
    const storage = { getItem: get, setItem: set, removeItem: vi.fn(), clear: vi.fn(), key: vi.fn(), length: 0 };
    vi.stubGlobal("localStorage", storage);
    const own = Object.getOwnPropertyDescriptor(window, "localStorage");
    Object.defineProperty(window, "localStorage", { value: storage, configurable: true });
    onTestFinished(() => {
      vi.unstubAllGlobals();
      if (own) Object.defineProperty(window, "localStorage", own);
      else delete (window as { localStorage?: Storage }).localStorage;
    });
    render(
      <MuiRegistry>
        <Button>Plan a trip</Button>
      </MuiRegistry>,
    );
    expect(get).not.toHaveBeenCalled();
    expect(set).not.toHaveBeenCalled();
  });

  it("renders the same server HTML whatever the scheme", () => {
    const html = () =>
      renderToString(
        <MuiRegistry>
          <Button variant="contained">Plan a trip</Button>
        </MuiRegistry>,
      );
    document.documentElement.className = "";
    const light = html();
    document.documentElement.className = "scheme-dark";
    const dark = html();
    expect(dark).toBe(light);
  });
});
