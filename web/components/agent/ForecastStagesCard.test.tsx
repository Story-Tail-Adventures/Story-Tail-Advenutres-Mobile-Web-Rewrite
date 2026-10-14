import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * §3.7.7's weights: previewed as typed, saved on purpose, and a refused save keeps every
 * number typed (the Stage 2 form-reset lesson).
 */

const mocks = vi.hoisted(() => ({ saveWeightsAction: vi.fn() }));
vi.mock("@/app/(agent)/agent/commission/forecast/actions", () => mocks);

import { ForecastStagesCard } from "./ForecastStagesCard";
import type { ForecastStageView } from "@/lib/agent/forecast";
import { renderWithTheme } from "@/test/render";

const STAGES: ForecastStageView[] = [
  { stage: "inquiry", label: "Inquiry", weightPct: 20, tripCount: 2, tripCountLabel: "2 trips", rawCents: 0, weightedLabel: "$0" },
  { stage: "proposal", label: "Proposal", weightPct: 50, tripCount: 3, tripCountLabel: "3 trips", rawCents: 345120, weightedLabel: "$1,726" },
  { stage: "booked", label: "Booked", weightPct: 100, tripCount: 5, tripCountLabel: "5 trips", rawCents: 675196, weightedLabel: "$6,752" },
  { stage: "in_progress", label: "Traveling", weightPct: 100, tripCount: 1, tripCountLabel: "1 trip", rawCents: 89760, weightedLabel: "$898" },
];

function renderCard() {
  return renderWithTheme(
    <ForecastStagesCard totalLabel="$9,375" acrossLabel="Of $11,101 across 11 open trips · 84% confidence" stages={STAGES} currency="USD" />,
  );
}

beforeEach(() => vi.clearAllMocks());

describe("ForecastStagesCard", () => {
  it("shows the weights read-only until the advisor chooses to adjust them", async () => {
    const user = userEvent.setup();
    renderCard();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByText("50%")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Adjust weights" }));
    expect(screen.getByRole("textbox", { name: "Proposal Weight (%)" })).toHaveValue("50");
  });

  it("previews a stage's amount as the weight is typed, from the server's own arithmetic", async () => {
    const user = userEvent.setup();
    renderCard();
    await user.click(screen.getByRole("button", { name: "Adjust weights" }));
    const proposal = screen.getByRole("textbox", { name: "Proposal Weight (%)" });
    await user.clear(proposal);
    await user.type(proposal, "80");
    expect(screen.getByText("$2,761")).toBeInTheDocument();
    expect(mocks.saveWeightsAction).not.toHaveBeenCalled();
  });

  it("a refused save stays in edit mode and keeps every number typed", async () => {
    const user = userEvent.setup();
    mocks.saveWeightsAction.mockResolvedValue({
      formError: "These weights were changed somewhere else, so yours weren't saved. Reload the page and try again.",
    });
    renderCard();
    await user.click(screen.getByRole("button", { name: "Adjust weights" }));
    const proposal = screen.getByRole("textbox", { name: "Proposal Weight (%)" });
    await user.clear(proposal);
    await user.type(proposal, "80");
    await user.click(screen.getByRole("button", { name: "Save weights" }));
    await waitFor(() => expect(screen.getByText(/changed somewhere else/)).toBeInTheDocument());
    expect(screen.getByRole("textbox", { name: "Proposal Weight (%)" })).toHaveValue("80");
    const posted = mocks.saveWeightsAction.mock.calls[0][1] as FormData;
    expect(posted.get("weight-proposal")).toBe("80");
    expect(posted.get("expected-proposal")).toBe("50");
  });

  it("Cancel leaves edit mode even after a refused save (it once could not)", async () => {
    const user = userEvent.setup();
    mocks.saveWeightsAction.mockResolvedValue({ formError: "That didn't save. Try again in a moment." });
    renderCard();
    await user.click(screen.getByRole("button", { name: "Adjust weights" }));
    await user.click(screen.getByRole("button", { name: "Save weights" }));
    await waitFor(() => expect(screen.getByText("That didn't save. Try again in a moment.")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByText("That didn't save. Try again in a moment.")).toBeNull();
    // And focus goes back to where the advisor started.
    expect(screen.getByRole("button", { name: "Adjust weights" })).toHaveFocus();
  });

  it("previews the new TOTAL too, rounded once as the server rounds it", async () => {
    const user = userEvent.setup();
    renderCard();
    await user.click(screen.getByRole("button", { name: "Adjust weights" }));
    expect(screen.getByRole("textbox", { name: "Inquiry Weight (%)" })).toHaveFocus();
    const proposal = screen.getByRole("textbox", { name: "Proposal Weight (%)" });
    await user.clear(proposal);
    await user.type(proposal, "80");
    // 0 + 276,096 + 675,196 + 89,760 = 1,041,052 cents of 1,110,076: 94%.
    expect(screen.getByText("New total: $10,411 · 94% confidence")).toBeInTheDocument();
  });

  it("says why a weight is invalid, against that weight", async () => {
    const user = userEvent.setup();
    renderCard();
    await user.click(screen.getByRole("button", { name: "Adjust weights" }));
    const proposal = screen.getByRole("textbox", { name: "Proposal Weight (%)" });
    await user.clear(proposal);
    await user.type(proposal, "150");
    expect(proposal).toHaveAttribute("aria-invalid", "true");
    expect(proposal).toHaveAccessibleDescription("Each weight is a whole number from 0 to 100.");
    // No total is previewed from a weight that cannot be saved.
    expect(screen.queryByText(/^New total/)).toBeNull();
  });

  it("Cancel puts the saved weights back", async () => {
    const user = userEvent.setup();
    renderCard();
    await user.click(screen.getByRole("button", { name: "Adjust weights" }));
    const proposal = screen.getByRole("textbox", { name: "Proposal Weight (%)" });
    await user.clear(proposal);
    await user.type(proposal, "80");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByText("$1,726")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Adjust weights" }));
    expect(screen.getByRole("textbox", { name: "Proposal Weight (%)" })).toHaveValue("50");
  });
});
