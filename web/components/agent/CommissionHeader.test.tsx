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
  it("renders a live action as a link, and a download as a plain anchor", () => {
    renderWithTheme(
      <CommissionHeader
        title="Commission ledger"
        subtitle="Sub"
        actions={[
          { label: "Add line", href: "/agent/commission/ledger/new", icon: "plus", primary: true },
          { label: "Export", href: "/agent/commission/ledger/export?status=lost", icon: "download", download: true },
          { label: "Import CSV", reason: "Importing arrives with §3.7.5.", icon: "upload" },
        ]}
      />,
    );
    expect(screen.getByRole("link", { name: "Add line" })).toHaveAttribute("href", "/agent/commission/ledger/new");
    // No `download` attribute: the route's Content-Disposition makes it a download, and
    // without the attribute a failure or a sign-in redirect is shown, not saved as a file.
    const exportLink = screen.getByRole("link", { name: "Export" });
    expect(exportLink).toHaveAttribute("href", "/agent/commission/ledger/export?status=lost");
    expect(exportLink).not.toHaveAttribute("download");
    // The deferred one is still described by its OWN reason, though it is third in the list.
    expect(screen.getByRole("button", { name: "Import CSV" })).toHaveAccessibleDescription(
      "Importing arrives with §3.7.5.",
    );
  });

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
