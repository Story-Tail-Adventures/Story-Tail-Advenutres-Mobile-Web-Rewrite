import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithTheme } from "@/test/render";

// The real module is "use server" and pulls in @/lib/env and @/lib/supabase/server, neither
// of which is configured in a unit run. The bar only needs something to hand <form action>.
vi.mock("@/lib/auth/actions", () => ({ signOutAction: vi.fn() }));

import { AgentTopBar } from "./AgentTopBar";

describe("AgentTopBar", () => {
  // Both halves of the toggle are always in the DOM — CSS hides one, and vitest applies no
  // CSS — so query an exact name; `/Switch to/` matches both and throws.
  it("ships the theme toggle, enabled", () => {
    render(<AgentTopBar initials="GS" />);
    expect(screen.getByRole("button", { name: "Switch to dark mode" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Switch to light mode" })).toBeEnabled();
  });

  // The bell is still drawn disabled with its reason; this pins that the toggle did not get
  // swept in with it by a copy-paste.
  //
  // QUICK-ADD LEFT THIS TEST WHEN §3.3.9 SHIPPED. It was one disabled button standing for
  // two unbuilt actions; creating a client is built now, so it is a LINK to
  // /agent/clients/new. When §3.4.3 lands it becomes a menu with two entries.
  it("leaves notifications disabled, and the toggle enabled", () => {
    render(<AgentTopBar initials="GS" />);
    expect(screen.getByRole("button", { name: /Notifications/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Switch to dark mode" })).toBeEnabled();
  });

  /** Quick-add is an MUI Menu (MUI v9 migration): its entries exist only once it is open. */
  async function openQuickAdd() {
    renderWithTheme(<AgentTopBar initials="GS" />);
    const trigger = screen.getByRole("button", { name: "New" });
    expect(trigger).toHaveAttribute("aria-haspopup", "menu");
    await userEvent.setup().click(trigger);
    return within(screen.getByRole("menu"));
  }

  it("points quick-add at creating a client", async () => {
    const menu = await openQuickAdd();
    expect(menu.getByRole("menuitem", { name: "New client" }))
      .toHaveAttribute("href", "/agent/clients/new");
  });

  // The disabled placeholder yields to the working toggle on a phone, so the brand lockup
  // keeps its size — see the measurement table on the component. vitest evaluates no media
  // queries, so this pins the RULE in the stylesheet emotion generated for the wrapper: hidden
  // by default, shown from sm (640px) up. The numbers behind it came from Chrome.
  it("hides quick-add below sm so the lockup keeps its width", () => {
    renderWithTheme(<AgentTopBar initials="GS" />);
    const slot = screen.getByRole("button", { name: "New" }).parentElement!;
    const cls = [...slot.classList].find((c) => /^(mui|css)-/.test(c))!;
    const css = [...document.querySelectorAll("style")].map((s) => s.textContent).join("");
    const esc = cls.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");

    expect(css).toMatch(new RegExp(`\\.${esc}\\{[^}]*display:none`));
    expect(css).toMatch(new RegExp(`@media \\(min-width:640px\\)\\{\\.${esc}\\{[^}]*display:flex`));
    // The toggle must NOT pick up the same treatment: it is the one control that works.
    const toggle = screen.getByRole("button", { name: "Switch to dark mode" });
    expect(slot.contains(toggle)).toBe(false);
  });

  it("offers both things an advisor can now create", async () => {
    // It was a disabled button for two unbuilt actions, then a plain link when only one of
    // them existed. Both exist as of §3.4.3, so the menu has two entries and the label has
    // lost its object.
    const menu = await openQuickAdd();
    expect(menu.getByRole("menuitem", { name: "New client" }))
      .toHaveAttribute("href", "/agent/clients/new");
    expect(menu.getByRole("menuitem", { name: "New trip" }))
      .toHaveAttribute("href", "/agent/trips/new");
  });

  /**
   * Sign-out has to stay the LAST control in the bar. §3.2 redirects an agent off every
   * (client) route, so this form is the only sign-out an advisor has on the web — an
   * advisor on a shared laptop who cannot find it leaves a live session behind. The toggle
   * was inserted at the head of the cluster precisely so this stayed put.
   */
  it("keeps sign-out anchored after the toggle", () => {
    render(<AgentTopBar initials="GS" />);
    const buttons = screen.getAllByRole("button");

    expect(buttons.at(-1)).toHaveAccessibleName("Sign out");
    expect(buttons[0]).toHaveAccessibleName("Switch to dark mode");
  });
});
