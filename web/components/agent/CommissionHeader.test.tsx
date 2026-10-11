import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";

import { CommissionHeader } from "./CommissionHeader";
import { renderWithTheme } from "@/test/render";

/**
 * The reason an unbuilt control is disabled must reach everyone: visible on a touch screen,
 * which has no hover, and announced with the button, which a keyboard cannot focus. The
 * first draft hid it in a hover title, and that reached nobody.
 */
describe("CommissionHeader", () => {
  const ACTIONS = [
    { label: "Import CSV", reason: "Importing arrives with §3.7.5.", icon: "upload" as const },
    { label: "Export", reason: "Export arrives with §3.7.3.", icon: "download" as const },
  ];

  it("shows each reason as visible text", () => {
    renderWithTheme(<CommissionHeader title="Commissions" subtitle="Sub" actions={ACTIONS} />);
    expect(screen.getByText("Importing arrives with §3.7.5.")).toBeVisible();
    expect(screen.getByText("Export arrives with §3.7.3.")).toBeVisible();
  });

  it("names each disabled button by its label and describes it by its own reason", () => {
    renderWithTheme(<CommissionHeader title="Commissions" subtitle="Sub" actions={ACTIONS} />);
    const exportButton = screen.getByRole("button", { name: "Export" });
    expect(exportButton).toBeDisabled();
    expect(exportButton).toHaveAccessibleDescription("Export arrives with §3.7.3.");
    expect(screen.getByRole("button", { name: "Import CSV" })).toHaveAccessibleDescription(
      "Importing arrives with §3.7.5.",
    );
  });
});
