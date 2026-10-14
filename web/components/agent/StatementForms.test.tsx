import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * §3.7.5 / §3.7.6's client forms, round-tripped through a REFUSED save — the test Stage 2
 * learned to write after a reset form recorded a status nobody chose.
 */

const mocks = vi.hoisted(() => ({
  uploadStatementAction: vi.fn(),
  mapStatementAction: vi.fn(),
  resolveRowAction: vi.fn(),
  reconcileStatementAction: vi.fn(),
  discardStatementAction: vi.fn(),
}));
vi.mock("@/app/(agent)/agent/commission/import/actions", () => mocks);

import { StatementMapForm } from "./StatementMapForm";
import { StatementRowResolve } from "./StatementRowResolve";
import { StatementUploadForm } from "./StatementUploadForm";
import type { SupplierGroup } from "@/lib/agent/tripBuilder";
import { renderWithTheme } from "@/test/render";

const value = (id: string) => (document.getElementById(id) as HTMLInputElement | HTMLSelectElement).value;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("StatementMapForm", () => {
  function renderMap() {
    return renderWithTheme(
      <StatementMapForm
        importId="i1"
        version={2}
        headers={["Res #", "Vendor", "Net Paid"]}
        samples={["ITV-1", "Sandals", "540.00"]}
        initialSelections={["", "supplier", "received"]}
        statementDate=""
        totalRows={5}
        today="2026-10-12"
        isRemap={false}
      />,
    );
  }

  it("shows each column's sample, and marks a guessed field Auto and a changed one Manual", async () => {
    const user = userEvent.setup();
    renderMap();
    expect(screen.getByText("Example: ITV-1")).toBeInTheDocument();
    expect(screen.getAllByText("Auto")).toHaveLength(2);
    await user.selectOptions(document.getElementById("col-0")!, "reference");
    expect(screen.getByText("Manual")).toBeInTheDocument();
  });

  it("asks for a statement date only while no column holds the paid-on date", async () => {
    const user = userEvent.setup();
    renderMap();
    expect(document.getElementById("statement-date")).not.toBeNull();
    await user.selectOptions(document.getElementById("col-0")!, "paid_on");
    expect(document.getElementById("statement-date")).toBeNull();
  });

  it("keeps every choice after a REFUSED save", async () => {
    const user = userEvent.setup();
    mocks.mapStatementAction.mockResolvedValue({ fieldErrors: { map: "Supplier is chosen for two columns. Pick one." } });
    renderMap();
    await user.selectOptions(document.getElementById("col-0")!, "supplier");
    await user.click(screen.getByRole("button", { name: "Import 5 rows" }));
    await waitFor(() => expect(screen.getByText("Supplier is chosen for two columns. Pick one.")).toBeInTheDocument());
    expect(value("col-0")).toBe("supplier");
    expect(value("col-1")).toBe("supplier");
    expect(value("col-2")).toBe("received");
    const posted = mocks.mapStatementAction.mock.calls[0][1] as FormData;
    expect(posted.get("col-0")).toBe("supplier");
    expect(posted.get("headerCount")).toBe("3");
  });
});

describe("StatementRowResolve", () => {
  const SUPPLIERS: SupplierGroup[] = [{
    kindLabel: "Cruise lines",
    suppliers: [{ supplierId: "s9", name: "Royal Caribbean", kindLabel: "Cruise lines", defaultCommissionPct: 16, paymentTerms: null, paymentLagDays: null }],
  }];

  function renderResolve(over: Partial<Parameters<typeof StatementRowResolve>[0]> = {}) {
    return renderWithTheme(
      <StatementRowResolve
        importId="i1"
        version={3}
        rowId="r4"
        canDecideMoney
        suggestion={null}
        candidates={[
          { commissionId: "c1", title: "Getaway #18", meta: "Sandals Resorts · Wren Sandoval · expected $612.00", travelLabel: null },
          { commissionId: "c2", title: "Cabo, Four Nights", meta: "Sandals Resorts · Maya Carter · expected $614.40", travelLabel: null },
        ]}
        createTrip={{ tripId: "t1", title: "Kyoto in the spring", clientName: "Pri Raghunathan" }}
        suppliers={SUPPLIERS}
        initialSupplierId=""
        initialGross="2400.00"
        initialRate="13"
        {...over}
      />,
    );
  }

  it("pre-chooses no line: Match stays disabled until the advisor picks one", async () => {
    const user = userEvent.setup();
    renderResolve();
    const match = screen.getByRole("button", { name: "Match this line" });
    expect(match).toBeDisabled();
    await user.click(screen.getByRole("radio", { name: /Cabo, Four Nights/ }));
    expect(match).toBeEnabled();
  });

  it("shows a refusal in the card that asked, and keeps the create form's values", async () => {
    const user = userEvent.setup();
    mocks.resolveRowAction.mockResolvedValue({ formError: "Enter a commission rate from 0 to 100.", action: "create" });
    renderResolve();
    await user.selectOptions(document.getElementById("create-supplier")!, "s9");
    await user.clear(document.getElementById("create-rate")!);
    await user.type(document.getElementById("create-rate")!, "abc");
    await user.click(screen.getByRole("button", { name: "Create line when reconciled" }));

    const card = screen.getByRole("heading", { name: "Create a new line" }).closest("section")!;
    await waitFor(() => expect(within(card).getByText("Enter a commission rate from 0 to 100.")).toBeInTheDocument());
    // Not repeated in any other card.
    expect(screen.getAllByText("Enter a commission rate from 0 to 100.")).toHaveLength(1);
    expect(value("create-supplier")).toBe("s9");
    expect(value("create-gross")).toBe("2400.00");
    expect(value("create-rate")).toBe("abc");
    const posted = mocks.resolveRowAction.mock.calls[0][1] as FormData;
    expect(posted.get("action")).toBe("create");
    expect(posted.get("tripId")).toBe("t1");
  });

  it("the rate follows the supplier until the advisor types one", async () => {
    const user = userEvent.setup();
    renderResolve({ initialRate: "13" });
    await user.selectOptions(document.getElementById("create-supplier")!, "s9");
    // Royal Caribbean's default.
    expect(value("create-rate")).toBe("16");
    await user.clear(document.getElementById("create-rate")!);
    await user.type(document.getElementById("create-rate")!, "14");
    await user.selectOptions(document.getElementById("create-supplier")!, "s9");
    expect(value("create-rate")).toBe("14");
  });

  it("Use this match posts a confirm and no line id: only the server's suggestion can be confirmed", async () => {
    const user = userEvent.setup();
    mocks.resolveRowAction.mockResolvedValue({});
    renderResolve({ suggestion: { label: "Sandals Resorts · Maya Carter · Cabo", note: null } });
    await user.click(screen.getByRole("button", { name: "Use this match" }));
    await waitFor(() => expect(mocks.resolveRowAction).toHaveBeenCalledTimes(1));
    const posted = mocks.resolveRowAction.mock.calls[0][1] as FormData;
    expect(posted.get("action")).toBe("confirm");
    expect(posted.get("commissionId")).toBeNull();
  });

  it("an unreadable row can only be set aside", () => {
    renderResolve({ canDecideMoney: false });
    expect(screen.queryByRole("button", { name: "Match this line" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Create line when reconciled" })).toBeNull();
    expect(screen.getByRole("button", { name: "Set aside" })).toBeInTheDocument();
  });
});

describe("StatementUploadForm", () => {
  it("refuses a missing or oversized file before anything is sent", async () => {
    const user = userEvent.setup();
    renderWithTheme(<StatementUploadForm />);
    await user.click(screen.getByRole("button", { name: "Upload statement" }));
    expect(screen.getByText("Choose a CSV file first.")).toBeInTheDocument();

    const big = new File(["x".repeat(512 * 1024 + 1)], "big.csv", { type: "text/csv" });
    await user.upload(document.getElementById("statement-file") as HTMLInputElement, big);
    await user.click(screen.getByRole("button", { name: "Upload statement" }));
    expect(screen.getByText("That file is larger than 512 KB. Check it's the statement.")).toBeInTheDocument();
    expect(mocks.uploadStatementAction).not.toHaveBeenCalled();
  });

  it("links to the statement that already has this file", async () => {
    const user = userEvent.setup();
    mocks.uploadStatementAction.mockResolvedValue({
      formError: "You've already imported this file.",
      duplicateHref: "/agent/commission/import/abc",
    });
    renderWithTheme(<StatementUploadForm />);
    await user.upload(
      document.getElementById("statement-file") as HTMLInputElement,
      new File(["Ref,Paid\nA,1"], "may.csv", { type: "text/csv" }),
    );
    await user.click(screen.getByRole("button", { name: "Upload statement" }));
    await waitFor(() => expect(screen.getByRole("link", { name: "Open that statement" })).toHaveAttribute(
      "href", "/agent/commission/import/abc",
    ));
  });
});
