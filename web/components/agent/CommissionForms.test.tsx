import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * §3.7.3 / §3.7.4's two client forms, round-tripped through a REFUSED save.
 *
 * WHY THIS FILE EXISTS. Both forms shipped with React 19's form reset intact, and review
 * found what it does: after any refused save a `<select>` returns to its mount-time value
 * (React ignores a changed defaultValue on a select) and an MUI Radio to its first-render
 * default. So the line form's corrected resubmit saved a status nobody chose, and the
 * payment form recorded a short payment as Received. Nothing caught it because no test ever
 * submitted a form and looked at it afterwards. These do.
 */

const mocks = vi.hoisted(() => ({
  createLineAction: vi.fn(),
  updateLineAction: vi.fn(),
  recordPaymentAction: vi.fn(),
  removeLineAction: vi.fn(),
}));
vi.mock("@/app/(agent)/agent/commission/ledger/actions", () => mocks);

import { CommissionLineForm } from "./CommissionLineForm";
import { CommissionPaymentForm } from "./CommissionPaymentForm";
import { CREATE_STATUS_OPTIONS, editStatusOptions, type LineValues } from "@/lib/agent/commissionForm";
import type { SupplierGroup } from "@/lib/agent/tripBuilder";
import { renderWithTheme } from "@/test/render";

const SUPPLIERS: SupplierGroup[] = [
  {
    kindLabel: "Resorts",
    suppliers: [
      { supplierId: "s1", name: "Sandals Resorts", kindLabel: "Resorts", defaultCommissionPct: 12, paymentTerms: "at_booking", paymentLagDays: 30 },
      { supplierId: "s2", name: "Beaches", kindLabel: "Resorts", defaultCommissionPct: null, paymentTerms: null, paymentLagDays: null },
    ],
  },
];

const EMPTY: LineValues = {
  supplierId: "", gross: "", rate: "", paymentTerms: "after_travel", paymentLagDays: "",
  status: "expected", inteletravelReference: "", notes: "",
};

const value = (id: string) => (document.getElementById(id) as HTMLInputElement | HTMLSelectElement).value;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("CommissionLineForm", () => {
  function renderCreate() {
    return renderWithTheme(
      <CommissionLineForm
        mode={{ kind: "create", tripId: "t1", prefill: { s1: { grossCents: 648000, rate: 12.5 } } }}
        suppliers={SUPPLIERS}
        initial={EMPTY}
        statusOptions={CREATE_STATUS_OPTIONS}
        currency="USD"
        cancelHref="/agent/commission/ledger"
      />,
    );
  }

  it("fills a supplier's figures into untouched fields: the trip's bookings first, then its defaults", async () => {
    const user = userEvent.setup();
    renderCreate();
    await user.selectOptions(document.getElementById("line-supplier")!, "s1");
    expect(value("line-gross")).toBe("6480.00");
    expect(value("line-rate")).toBe("12.5");
    expect(value("line-terms")).toBe("at_booking");
    expect(value("line-lag")).toBe("30");
    expect(screen.getByText(/filled in from this trip's Sandals Resorts bookings/)).toBeInTheDocument();
  });

  it("switching supplier clears the last supplier's prefill instead of keeping it", async () => {
    const user = userEvent.setup();
    renderCreate();
    await user.selectOptions(document.getElementById("line-supplier")!, "s1");
    await user.selectOptions(document.getElementById("line-supplier")!, "s2");
    // Beaches has no bookings on this trip and no defaults: nothing of Sandals' may remain.
    expect(value("line-gross")).toBe("");
    expect(value("line-rate")).toBe("");
    expect(value("line-terms")).toBe("after_travel");
    expect(value("line-lag")).toBe("");
    expect(screen.queryByText(/filled in from this trip's/)).toBeNull();
  });

  it("never overwrites a field the advisor typed in", async () => {
    const user = userEvent.setup();
    renderCreate();
    await user.type(document.getElementById("line-gross")!, "100.00");
    await user.selectOptions(document.getElementById("line-supplier")!, "s1");
    expect(value("line-gross")).toBe("100.00");
    expect(value("line-rate")).toBe("12.5");
  });

  it("keeps every select as chosen after a REFUSED save", async () => {
    const user = userEvent.setup();
    mocks.createLineAction.mockResolvedValue({ fieldErrors: { rate: "Enter a rate from 0 to 100." } });
    renderCreate();
    await user.selectOptions(document.getElementById("line-supplier")!, "s1");
    await user.selectOptions(document.getElementById("line-status")!, "invoiced");
    await user.click(screen.getByRole("button", { name: "Save line" }));

    await waitFor(() => expect(screen.getByText("Enter a rate from 0 to 100.")).toBeInTheDocument());
    expect(mocks.createLineAction).toHaveBeenCalledTimes(1);
    // The bug: these snapped back to "", "after_travel" and "expected".
    expect(value("line-supplier")).toBe("s1");
    expect(value("line-terms")).toBe("at_booking");
    expect(value("line-status")).toBe("invoiced");
  });

  it("asks for an explicit yes before an edit wipes a recorded payment", async () => {
    const user = userEvent.setup();
    renderWithTheme(
      <CommissionLineForm
        mode={{ kind: "edit", tripId: "t1", commissionId: "c1", version: 4 }}
        suppliers={SUPPLIERS}
        initial={{ ...EMPTY, supplierId: "s1", gross: "100.00", rate: "10", paymentLagDays: "60", status: "received" }}
        statusOptions={editStatusOptions("received")}
        currency="USD"
        cancelHref="/agent/commission/ledger"
      />,
    );
    expect(screen.queryByRole("checkbox", { name: "Yes, clear the recorded payment" })).toBeNull();
    await user.selectOptions(document.getElementById("line-status")!, "invoiced");
    const box = screen.getByRole("checkbox", { name: "Yes, clear the recorded payment" });
    expect(box).toBeRequired();
    expect(box).not.toBeChecked();
  });
});

describe("CommissionPaymentForm", () => {
  it("suggests Disputed for a shortfall — and still says Disputed after a REFUSED save", async () => {
    const user = userEvent.setup();
    mocks.recordPaymentAction.mockResolvedValue({ fieldErrors: { receivedAt: "Use today or an earlier date." } });
    renderWithTheme(
      <CommissionPaymentForm
        commissionId="c1"
        tripId="t1"
        version={2}
        today="2026-10-11"
        expectedCents={100000}
        currency="USD"
        initial={{ status: "received", received: "", fee: "0.00", receivedAt: "2026-10-11" }}
      />,
    );
    await user.type(document.getElementById("pay-received")!, "900.00");
    expect(screen.getByRole("radio", { name: "Disputed" })).toBeChecked();
    expect(screen.getByRole("status")).toHaveTextContent("$100 short of expected, after the fee.");

    await user.click(screen.getByRole("button", { name: "Save payment" }));
    await waitFor(() => expect(mocks.recordPaymentAction).toHaveBeenCalledTimes(1));
    await act(async () => {});

    // The bug: the radio showed Received here, and the next save posted it.
    expect(screen.getByRole("radio", { name: "Disputed" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Received" })).not.toBeChecked();
    expect(value("pay-received")).toBe("900.00");
    const posted = mocks.recordPaymentAction.mock.calls[0][1] as FormData;
    expect(posted.get("status")).toBe("disputed");
  });
});
