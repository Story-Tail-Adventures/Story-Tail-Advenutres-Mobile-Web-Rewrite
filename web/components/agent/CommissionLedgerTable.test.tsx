import { describe, expect, it } from "vitest";
import { screen, within } from "@testing-library/react";

import { CommissionLedgerTable } from "./CommissionLedgerTable";
import { KpiTile } from "./KpiTile";
import type { LedgerRow } from "@/lib/agent/commission";
import { renderWithTheme } from "@/test/render";

/**
 * §3.7.2's rows and the shared KPI tile's link.
 *
 * The rule worth a component test: a link must go somewhere real. An archived trip's line
 * stays in the ledger (a tax record), but Trip Detail will not open an archived trip, so its
 * title must render as text. And a tile with an `href` must be ONE link whose name is the
 * tile's own text — not an unnamed wrapper a screen reader announces as "link".
 */

function row(over: Partial<LedgerRow> = {}): LedgerRow {
  return {
    commissionId: "l1",
    tripTitle: "Getaway #2",
    tripHref: "/agent/trips/t1",
    tripArchived: false,
    clientName: "Noah Castillo",
    supplierName: "Sandals Resorts",
    travelLabel: "Jun 29, 2026",
    grossLabel: "$2,700",
    rateLabel: "12%",
    commissionLabel: "$324",
    status: "received",
    statusChip: "booked",
    statusLabel: "Received",
    ...over,
  };
}

describe("CommissionLedgerTable", () => {
  it("links a live trip's title to its detail page", () => {
    renderWithTheme(<CommissionLedgerTable rows={[row()]} />);
    expect(screen.getByRole("link", { name: "Getaway #2" })).toHaveAttribute(
      "href",
      "/agent/trips/t1",
    );
  });

  it("renders an archived trip's title as text, and says it is archived", () => {
    renderWithTheme(
      <CommissionLedgerTable
        rows={[row({ tripTitle: "Cabo, cancelled", tripHref: null, tripArchived: true })]}
      />,
    );
    expect(screen.queryByRole("link", { name: /Cabo/ })).toBeNull();
    expect(screen.getByText("Cabo, cancelled")).toBeInTheDocument();
    expect(screen.getByText(/Noah Castillo · Archived/)).toBeInTheDocument();
  });

  it("prints the seven columns the artboard draws, in its order", () => {
    renderWithTheme(<CommissionLedgerTable rows={[row()]} />);
    const headers = screen.getAllByRole("columnheader").map((h) => h.textContent);
    expect(headers).toEqual(["Trip · client", "Supplier", "Travel", "Gross", "Rate", "Comm", "Status"]);
    const cells = within(screen.getAllByRole("row")[1]).getAllByRole("cell");
    expect(cells.map((c) => c.textContent)).toEqual([
      "Getaway #2Noah Castillo",
      "Sandals Resorts",
      "Jun 29, 2026",
      "$2,700",
      "12%",
      "$324",
      "Received",
    ]);
  });

  it("says when a trip has no dates", () => {
    renderWithTheme(<CommissionLedgerTable rows={[row({ travelLabel: null })]} />);
    expect(screen.getByText("No dates yet")).toBeInTheDocument();
  });
});

describe("KpiTile", () => {
  const TILE = {
    id: "risk",
    label: "At risk",
    value: "$26",
    sub: "1 disputed",
    unavailable: null,
    accent: "surface" as const,
    icon: "warning" as const,
  };

  it("is one link, named by its own text, when it has somewhere to go", () => {
    renderWithTheme(<KpiTile kpi={{ ...TILE, href: "/agent/commission/ledger?status=disputed" }} />);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/agent/commission/ledger?status=disputed");
    expect(link).toHaveTextContent("At risk$261 disputed");
  });

  it("is not a link without an href", () => {
    renderWithTheme(<KpiTile kpi={TILE} />);
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("renders the explanation instead of a value when there is none", () => {
    renderWithTheme(
      <KpiTile kpi={{ ...TILE, value: null, sub: null, unavailable: "Nothing received yet this year." }} />,
    );
    expect(screen.getByText("Nothing received yet this year.")).toBeInTheDocument();
  });
});
