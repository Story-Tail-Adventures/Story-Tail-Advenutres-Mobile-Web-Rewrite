import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * §3.4.16's "Mark these as Lost" (§3.7 Stage 5; Gyasi, 2026-10-12: offered, on by default
 * when cancelling). The dialog lists the trip's open ledger lines, sends each at the version it
 * listed, keeps everything the advisor set through a refused save, and leaves a receipt that
 * leads with the trip and never claims a line it cannot account for.
 */

const mocks = vi.hoisted(() => ({ cancelTripAction: vi.fn(), refresh: vi.fn() }));
vi.mock("@/app/(agent)/agent/trips/[tripId]/actions", () => ({ cancelTripAction: mocks.cancelTripAction }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));

import { CancelTripDialog } from "./CancelTripDialog";
import type { TripDetailOverview, TripOpenCommissionLine } from "@/lib/agent/tripDetail";
import { renderWithTheme } from "@/test/render";

const OVERVIEW: TripDetailOverview = {
  tripId: "t1",
  clientId: "c1",
  clientName: "Jordan Hayes",
  title: "Anniversary Week in Negril",
  tripType: "all_inclusive",
  status: "booked",
  startLabel: "Dec 4",
  endLabel: "Dec 11",
  destinations: ["Negril, Jamaica"],
  travelerCount: 2,
  totalValueLabel: "$12,845",
  totalPaidLabel: "$0",
  totalCommissionLabel: "$1,318",
  cancellationReason: null,
  refundStatus: null,
  refundDetail: null,
  notes: null,
  version: 3,
  lastActivityLabel: null,
  componentCount: 0,
  manualComponentCount: 0,
  apiComponentCount: 0,
  today: "2026-10-12",
  nextUnpaidDueDate: null,
};

const CANCELLED: TripDetailOverview = {
  ...OVERVIEW,
  status: "cancelled",
  cancellationReason: "Family schedule conflict",
};

const LINES: TripOpenCommissionLine[] = [
  { commissionId: "line-a", version: 1, supplierName: "Sandals Negril", statusLabel: "Expected", amountLabel: "$970" },
  { commissionId: "line-b", version: 4, supplierName: "Delta", statusLabel: "Invoiced", amountLabel: "$348" },
];

function renderDialog(overview = OVERVIEW, openCommission: TripOpenCommissionLine[] | null = LINES) {
  return renderWithTheme(<CancelTripDialog overview={overview} openCommission={openCommission} />);
}

async function openAndGiveReason(user: ReturnType<typeof userEvent.setup>, opener = /^Cancel trip/) {
  await user.click(screen.getByRole("button", { name: opener }));
  const dialog = screen.getByRole("dialog");
  const reason = within(dialog).getByRole("textbox", { name: /Reason/ });
  if ((reason as HTMLTextAreaElement).value === "") await user.type(reason, "Family schedule conflict");
  return dialog;
}

const confirm = (dialog: HTMLElement) => within(dialog).getByRole("button", { name: "Cancel trip" });
const box = (dialog: HTMLElement, n = 2) =>
  within(dialog).getByRole("checkbox", { name: n === 1 ? "Mark this line as Lost" : `Mark these ${n} lines as Lost` });

beforeEach(() => vi.clearAllMocks());

describe("CancelTripDialog: the trip's open commission", () => {
  it("lists each open line under one checkbox, checked by default when cancelling", async () => {
    const user = userEvent.setup();
    renderDialog();
    const dialog = await openAndGiveReason(user);
    const list = within(dialog).getByRole("list", { name: "COMMISSION STILL OPEN" });
    expect(within(list).getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "Sandals Negril · Expected · $970",
      "Delta · Invoiced · $348",
    ]);
    expect(box(dialog)).toBeChecked();
    expect(box(dialog)).toHaveAccessibleDescription(/Received and Disputed lines are left alone/);
  });

  it("sends each line at the version it listed; the receipt leads with the trip and is read with Done", async () => {
    const user = userEvent.setup();
    mocks.cancelTripAction.mockResolvedValue({ ok: true, linesClosed: 2, linesSkipped: 0 });
    renderDialog();
    const dialog = await openAndGiveReason(user);
    await user.click(confirm(dialog));

    expect(mocks.cancelTripAction).toHaveBeenCalledWith(
      expect.objectContaining({
        tripId: "t1",
        expectedVersion: 3,
        closeCommission: [
          { id: "line-a", version: 1 },
          { id: "line-b", version: 4 },
        ],
      }),
    );
    expect(await screen.findByRole("status")).toHaveTextContent("Trip cancelled. 2 commission lines marked Lost.");
    const done = screen.getByRole("button", { name: "Done" });
    expect(done).toHaveFocus();
    expect(done).toHaveAccessibleDescription("Trip cancelled. 2 commission lines marked Lost.");

    await user.click(done);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    // Focus goes back to the button that opened it, not to the page.
    await waitFor(() => expect(screen.getByRole("button", { name: /^Cancel trip/ })).toHaveFocus());
  });

  it("says out loud when a line moved since the page loaded and was left alone", async () => {
    const user = userEvent.setup();
    mocks.cancelTripAction.mockResolvedValue({ ok: true, linesClosed: 1, linesSkipped: 1 });
    renderDialog();
    const dialog = await openAndGiveReason(user);
    await user.click(confirm(dialog));
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Trip cancelled. 1 commission line marked Lost. 1 line changed since the page loaded, so it was left alone.",
    );
  });

  it("never closes silently over lines it sent but the answer does not account for", async () => {
    const user = userEvent.setup();
    // An Edge Function that predates the list ignores it and answers with no counts.
    mocks.cancelTripAction.mockResolvedValue({ ok: true, linesClosed: 0, linesSkipped: 0 });
    renderDialog();
    const dialog = await openAndGiveReason(user);
    await user.click(confirm(dialog));
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Trip cancelled. We couldn't confirm 2 lines were marked Lost. Check them in the ledger.",
    );
  });

  it("unchecked, it sends no lines and closes as it always has", async () => {
    const user = userEvent.setup();
    mocks.cancelTripAction.mockResolvedValue({ ok: true, linesClosed: 0, linesSkipped: 0 });
    renderDialog();
    const dialog = await openAndGiveReason(user);
    await user.click(box(dialog));
    await user.click(confirm(dialog));

    expect(mocks.cancelTripAction).toHaveBeenCalledWith(expect.objectContaining({ closeCommission: [] }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("a refused cancel keeps everything the advisor set", async () => {
    const user = userEvent.setup();
    mocks.cancelTripAction.mockResolvedValue({
      ok: false,
      message: "This trip moved since the page loaded. Reload and try again.",
      stale: true,
    });
    renderDialog();
    const dialog = await openAndGiveReason(user);
    await user.click(box(dialog));
    await user.type(within(dialog).getByRole("textbox", { name: /Refund detail/ }), "Credit through Dec");
    await user.click(confirm(dialog));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent("This trip moved");
    // Re-queried, not held from before the save: a remount would pass a stale reference.
    const after = screen.getByRole("dialog");
    expect(box(after)).not.toBeChecked();
    expect(within(after).getByRole("textbox", { name: /Reason/ })).toHaveValue("Family schedule conflict");
    expect(within(after).getByRole("textbox", { name: /Refund detail/ })).toHaveValue("Credit through Dec");
  });

  it("sends the versions it listed, not ones a refresh brings in behind the open dialog", async () => {
    const user = userEvent.setup();
    mocks.cancelTripAction.mockResolvedValue({ ok: true, linesClosed: 0, linesSkipped: 2 });
    const { rerender } = renderDialog();
    const dialog = await openAndGiveReason(user);
    rerender(
      <CancelTripDialog
        overview={OVERVIEW}
        openCommission={LINES.map((l) => ({ ...l, version: l.version + 1 }))}
      />,
    );
    await user.click(confirm(dialog));
    expect(mocks.cancelTripAction).toHaveBeenCalledWith(
      expect.objectContaining({
        closeCommission: [
          { id: "line-a", version: 1 },
          { id: "line-b", version: 4 },
        ],
      }),
    );
  });

  it("keeps its heading while the receipt is up, though the save flips the trip to cancelled", async () => {
    const user = userEvent.setup();
    mocks.cancelTripAction.mockResolvedValue({ ok: true, linesClosed: 2, linesSkipped: 0 });
    const { rerender } = renderDialog();
    const dialog = await openAndGiveReason(user);
    await user.click(confirm(dialog));
    await screen.findByRole("status");
    // What router.refresh() brings in.
    rerender(<CancelTripDialog overview={CANCELLED} openCommission={[]} />);
    expect(screen.getByRole("dialog", { name: "Cancel trip" })).toBeInTheDocument();
    expect(screen.getByText("CANCEL TRIP")).toBeInTheDocument();
  });

  it("reopened after a receipt, it is the form again, with the lines as they are now", async () => {
    const user = userEvent.setup();
    mocks.cancelTripAction.mockResolvedValue({ ok: true, linesClosed: 2, linesSkipped: 0 });
    const { rerender } = renderDialog();
    let dialog = await openAndGiveReason(user);
    await user.click(box(dialog)); // unchecked, then checked again below by the reopen
    await user.click(box(dialog));
    await user.click(confirm(dialog));
    await user.click(await screen.findByRole("button", { name: "Done" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    // The page now shows the trip cancelled, with one line reopened since.
    rerender(<CancelTripDialog overview={CANCELLED} openCommission={[{ ...LINES[1], version: 6 }]} />);
    await user.click(screen.getByRole("button", { name: /^Save details/ }));
    dialog = screen.getByRole("dialog");
    expect(within(dialog).queryByRole("status")).toBeNull();
    expect(within(dialog).getByRole("listitem")).toHaveTextContent("Delta · Invoiced · $348");
    expect(box(dialog, 1)).not.toBeChecked();
  });

  it("on Save details the lines are offered unchecked, so a line reopened on purpose is not lost again", async () => {
    const user = userEvent.setup();
    mocks.cancelTripAction.mockResolvedValue({ ok: true, linesClosed: 0, linesSkipped: 0 });
    renderDialog(CANCELLED, LINES.slice(0, 1));
    const dialog = await openAndGiveReason(user, /^Save details/);
    expect(box(dialog, 1)).not.toBeChecked();
    await user.click(within(dialog).getByRole("button", { name: "Save details" }));
    expect(mocks.cancelTripAction).toHaveBeenCalledWith(expect.objectContaining({ closeCommission: [] }));
  });

  it("ticked on Save details, the receipt says the details were saved", async () => {
    const user = userEvent.setup();
    mocks.cancelTripAction.mockResolvedValue({ ok: true, linesClosed: 1, linesSkipped: 0 });
    renderDialog(CANCELLED, LINES.slice(0, 1));
    const dialog = await openAndGiveReason(user, /^Save details/);
    await user.click(box(dialog, 1));
    await user.click(within(dialog).getByRole("button", { name: "Save details" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Details saved. 1 commission line marked Lost.");
  });

  it("Escape does not close it while saving, so the receipt is not lost", async () => {
    const user = userEvent.setup();
    let answer: (v: unknown) => void = () => {};
    mocks.cancelTripAction.mockReturnValue(new Promise((r) => (answer = r)));
    renderDialog();
    const dialog = await openAndGiveReason(user);
    await user.click(confirm(dialog));
    // On the dialog itself: every control is disabled while saving, so the keyboard's focus is
    // not inside it in jsdom, and a key "pressed" there would never reach the Modal.
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    // Long enough for a close to finish: MUI unmounts after its exit, so a check made at once
    // would pass even if the dialog were already on its way out.
    await act(() => new Promise((r) => setTimeout(r, 100)));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    answer({ ok: true, linesClosed: 1, linesSkipped: 1 });
    expect(await screen.findByRole("status")).toHaveTextContent("1 line changed since the page loaded");
  });

  it("with no open lines there is nothing to offer, and nothing is sent", async () => {
    const user = userEvent.setup();
    mocks.cancelTripAction.mockResolvedValue({ ok: true, linesClosed: 0, linesSkipped: 0 });
    renderDialog(OVERVIEW, []);
    const dialog = await openAndGiveReason(user);
    expect(within(dialog).queryByRole("checkbox")).toBeNull();
    await user.click(confirm(dialog));
    expect(mocks.cancelTripAction).toHaveBeenCalledWith(expect.objectContaining({ closeCommission: [] }));
  });

  it("when the lines could not be read, it says so rather than offering nothing", async () => {
    const user = userEvent.setup();
    renderDialog(OVERVIEW, null);
    const dialog = await openAndGiveReason(user);
    expect(within(dialog).queryByRole("checkbox")).toBeNull();
    expect(within(dialog).getByText(/couldn't check this trip's commission lines/)).toBeInTheDocument();
  });
});
