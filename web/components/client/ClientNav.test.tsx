import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithTheme } from "@/test/render";
import { emotionRulesFor } from "@/test/emotion-css";

vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard" }));

import { ClientBottomNav, ClientNavRail } from "./ClientNav";

/**
 * Which chrome shows at which width (Screen Inventory §4.1): the bottom bar on phones, the
 * rail from 768px up. Under Tailwind this was guarded by scanning ClientNav's SOURCE for an
 * unqualified `max-web:` (Tailwind emitted the px-based `web:` before the rem-based `md:`, so
 * `max-web:` leaked onto phones). MUI emits its breakpoints in ascending px order, so that
 * trap is gone; what is left to pin is the rule itself, read from the CSS emotion wrote.
 */
describe("ClientNav breakpoints", () => {
  it("shows the rail from 768px up, never on a phone", () => {
    renderWithTheme(<ClientNavRail />);
    const rail = emotionRulesFor(screen.getByRole("navigation", { name: "Main" }));
    expect(rail.base).toMatch(/display:none/);
    expect(rail.media["(min-width:768px)"]).toMatch(/display:flex/);
  });

  it("shows the bottom bar on phones only", () => {
    renderWithTheme(<ClientBottomNav />);
    const bar = emotionRulesFor(screen.getByRole("navigation", { name: "Main" }));
    expect(bar.base).toMatch(/display:flex/);
    expect(bar.media["(min-width:768px)"]).toMatch(/display:none/);
  });

  it("keeps the hook the page-bottom reserve keys on", () => {
    // client.css reserves space under the page with
    // .client-surface:has(.client-bottom-nav) .client-main — lose the class and the last
    // row of every page hides behind the bar.
    renderWithTheme(<ClientBottomNav />);
    expect(screen.getByRole("navigation", { name: "Main" })).toHaveClass("client-bottom-nav");
  });
});
