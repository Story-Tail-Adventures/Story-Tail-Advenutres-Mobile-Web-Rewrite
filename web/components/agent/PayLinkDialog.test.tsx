import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";

/**
 * §3.6.1b (ruled 2026-10-16). The preview names the site exactly as the client will see it,
 * read from what is typed, so a look-alike host shows as punycode before it is saved.
 */

const mocks = vi.hoisted(() => ({ setPayLinkAction: vi.fn(), markPaidAction: vi.fn(), push: vi.fn() }));
vi.mock("@/app/(agent)/agent/trips/[tripId]/payments/actions", () => ({
  setPayLinkAction: mocks.setPayLinkAction,
  markPaidAction: mocks.markPaidAction,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));

import { PayLinkDialog } from "./PayLinkDialog";
import { renderWithTheme } from "@/test/render";

const summary = { label: "Final balance", context: "Sandals · Jordan Hayes", amountLabel: "$4,180", dueLabel: "May 28" };

describe("PayLinkDialog", () => {
  it("previews the pay button and site name, and offers Remove only for an existing link", () => {
    renderWithTheme(
      <PayLinkDialog
        tripId="t1"
        milestoneId="m1"
        label="Final balance"
        currentUrl="https://www.sandals.com/pay/SRB-220119"
        closeHref="/agent/trips/t1/payments"
        summary={summary}
      />,
    );
    expect(screen.getByRole("heading", { name: "Edit pay link" })).toBeInTheDocument();
    expect(screen.getByText("sandals.com")).toBeInTheDocument();
    expect(screen.getByText(/Pay final balance/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Remove link/ })).toBeInTheDocument();
  });

  it("shows a look-alike host in punycode as it is typed, and no preview for http", () => {
    renderWithTheme(
      <PayLinkDialog
        tripId="t1"
        milestoneId="m1"
        label="Deposit"
        currentUrl={null}
        closeHref="/agent/trips/t1/payments"
        summary={summary}
      />,
    );
    expect(screen.getByRole("heading", { name: "Add a pay link" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Remove link/ })).toBeNull();

    const field = screen.getByLabelText("Pay link");
    fireEvent.change(field, { target: { value: `https://s${String.fromCodePoint(0x430)}ndals.com/pay` } });
    expect(screen.getByText(/^xn--/)).toBeInTheDocument();

    fireEvent.change(field, { target: { value: "http://sandals.com/pay" } });
    expect(screen.queryByText("THE CLIENT WILL SEE")).toBeNull();
  });
});
