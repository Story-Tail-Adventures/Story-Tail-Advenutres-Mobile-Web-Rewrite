import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { ClientTopBar } from "./ClientTopBar";

/**
 * The traveler's bar. It had no test before the theme toggle landed, so this covers the
 * shape as well as the new control.
 *
 * Nothing is asserted about the brand artwork: BrandMark reads `.src`/`.width`/`.height`
 * off a Next static-image import, and vite hands back a bare URL string, so those are
 * undefined under vitest. The image renders; its attributes are not meaningful here.
 */
describe("ClientTopBar", () => {
  // Both halves of the toggle are always in the DOM — CSS hides one, and vitest applies no
  // CSS — so query an exact name; `/Switch to/` matches both and throws.
  it("ships the theme toggle, enabled", () => {
    render(<ClientTopBar initials="JH" />);
    expect(screen.getByRole("button", { name: "Switch to dark mode" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Switch to light mode" })).toBeEnabled();
  });

  // The toggle is the only control here with anything behind it; the bell is deliberately
  // inert until §2.5.6 exists, and this pins that it stayed that way.
  it("leaves notifications disabled", () => {
    render(<ClientTopBar initials="JH" />);
    expect(screen.getByRole("button", { name: /Notifications/ })).toBeDisabled();
  });

  it("links the brand mark to the dashboard and shows the initials", () => {
    render(<ClientTopBar initials="JH" />);
    expect(
      screen.getByRole("link", { name: "Story-Tail Adventures — your trips" }),
    ).toHaveAttribute("href", "/dashboard");
    expect(screen.getByTitle("Your account")).toHaveTextContent("JH");
  });
});
