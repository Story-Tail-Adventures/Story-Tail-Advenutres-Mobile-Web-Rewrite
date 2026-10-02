import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithTheme } from "@/test/render";
import { emotionRulesFor } from "@/test/emotion-css";

vi.mock("next/navigation", () => ({ usePathname: () => "/agent" }));

import { AgentBottomNav, AgentNavRail } from "./AgentNav";

/**
 * Rail from 768px up, bottom bar below it. This replaces a Tailwind-era scan of AgentNav's
 * source for `max-web:` (see components/client/ClientNav.test.tsx for why that trap no longer
 * exists under MUI); what it protected — no tablet chrome on a phone — is pinned here from
 * the CSS emotion generated.
 */
describe("AgentNav breakpoints", () => {
  it("shows the rail from 768px up, never on a phone", () => {
    renderWithTheme(<AgentNavRail />);
    const rail = emotionRulesFor(screen.getByRole("navigation", { name: "Main" }));
    expect(rail.base).toMatch(/display:none/);
    expect(rail.media["(min-width:768px)"]).toMatch(/display:flex/);
  });

  it("shows the bottom bar on phones only", () => {
    renderWithTheme(<AgentBottomNav />);
    const bar = emotionRulesFor(screen.getByRole("navigation", { name: "Main" }));
    expect(bar.base).toMatch(/display:flex/);
    expect(bar.media["(min-width:768px)"]).toMatch(/display:none/);
  });
});
