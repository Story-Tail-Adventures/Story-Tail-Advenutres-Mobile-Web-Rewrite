import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

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

  it("points quick-add at the one thing it can now do", () => {
    render(<AgentTopBar initials="GS" />);
    const quickAdd = screen.getByRole("link", { name: "New client" });

    expect(quickAdd).toHaveAttribute("href", "/agent/clients/new");
  });

  // The disabled placeholder yields to the working toggle on a phone, so the brand lockup
  // keeps its size — see the measurement table on the component. vitest applies no CSS, so
  // this pins the CLASSES that carry the rule; the numbers behind it came from Chrome.
  it("hides quick-add below sm so the lockup keeps its width", () => {
    render(<AgentTopBar initials="GS" />);
    // A link now rather than a button — see above. The RULE it carries is unchanged, and
    // that rule is what the measurement table on the component is about.
    const quickAdd = screen.getByRole("link", { name: "New client" });

    expect(quickAdd).toHaveClass("hidden", "sm:inline-flex");
    // The toggle must NOT pick up the same treatment: it is the one control that works.
    expect(screen.getByRole("button", { name: "Switch to dark mode" })).not.toHaveClass("hidden");
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
