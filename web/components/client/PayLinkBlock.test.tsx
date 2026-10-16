import { describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * §2.2.3's pay block (ruled 2026-10-16). The button opens the SUPPLIER's site in a new tab and
 * is named from the label; the site name comes from the link; "I've paid" only sends a
 * message (the action is mocked here: it posts through trip-message and never writes the
 * milestone) and then thanks the traveler.
 */

const mocks = vi.hoisted(() => ({ sendPaidNote: vi.fn() }));
vi.mock("@/lib/trips/actions", () => ({ sendPaidNote: mocks.sendPaidNote }));

import { PayLinkBlock } from "./PayLinkBlock";
import { renderWithTheme } from "@/test/render";

describe("PayLinkBlock", () => {
  it("opens the supplier's own site in a new tab, named from the label, with the site name under it", () => {
    renderWithTheme(
      <PayLinkBlock tripId="t1" milestoneId="m1" label="Final balance" payUrl="https://www.sandals.com/pay/SRB-220119" />,
    );
    const pay = screen.getByRole("link", { name: /Pay final balance/ });
    expect(pay).toHaveAttribute("href", "https://www.sandals.com/pay/SRB-220119");
    expect(pay).toHaveAttribute("target", "_blank");
    expect(pay).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getByText("sandals.com")).toBeInTheDocument();
    expect(screen.getByText("Paid directly to the supplier on their secure site.")).toBeInTheDocument();
  });

  it("renders nothing for a link that is not https", () => {
    const { container } = renderWithTheme(
      <PayLinkBlock tripId="t1" milestoneId="m1" label="Deposit" payUrl="http://sandals.com/pay" />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("I've paid sends the note and then says Gyasi will check", async () => {
    mocks.sendPaidNote.mockResolvedValueOnce({ status: "sent" });
    renderWithTheme(
      <PayLinkBlock tripId="t1" milestoneId="m1" label="Deposit" payUrl="https://sandals.com/pay" />,
    );
    await userEvent.click(screen.getByRole("button", { name: "I've paid" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Thanks. Gyasi will check and mark it paid."));
    expect(mocks.sendPaidNote).toHaveBeenCalledWith("t1", "m1", { status: "idle" }, expect.anything());
  });

  it("says so when the message did not send", async () => {
    mocks.sendPaidNote.mockResolvedValueOnce({ status: "error", message: null });
    renderWithTheme(
      <PayLinkBlock tripId="t1" milestoneId="m1" label="Deposit" payUrl="https://sandals.com/pay" />,
    );
    await userEvent.click(screen.getByRole("button", { name: "I've paid" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("That didn't send."));
  });
});
