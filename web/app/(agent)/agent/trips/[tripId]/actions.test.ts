// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * §3.4.16's cancel action, for what §3.7 Stage 5 added: the lines to mark Lost go through only
 * when there are some, the counts come back as numbers whatever the function sends, and the
 * commission screens re-read only when a line actually closed.
 */

const mocks = vi.hoisted(() => ({ callAgentFunction: vi.fn(), revalidatePath: vi.fn() }));
vi.mock("@/lib/agent/api", () => ({ callAgentFunction: mocks.callAgentFunction }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import { cancelTripAction } from "./actions";

const BASE = { tripId: "t1", expectedVersion: 3, reason: "Family schedule conflict" };

beforeEach(() => vi.clearAllMocks());

describe("cancelTripAction", () => {
  it("names the lines to close, and answers with what closed and what was left", async () => {
    mocks.callAgentFunction.mockResolvedValue({
      ok: true,
      data: { changed: true, commissionLinesClosed: 2, commissionLinesSkipped: 1 },
    });
    const lines = [{ id: "a", version: 1 }, { id: "b", version: 4 }];
    await expect(cancelTripAction({ ...BASE, closeCommission: lines })).resolves.toEqual({
      ok: true,
      linesClosed: 2,
      linesSkipped: 1,
    });
    expect(mocks.callAgentFunction).toHaveBeenCalledWith("agent-trip-status", {
      tripId: "t1",
      status: "cancelled",
      expectedVersion: 3,
      cancellationReason: "Family schedule conflict",
      closeCommission: lines,
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/agent/commission", "layout");
  });

  it("an unchecked box sends no list at all, and leaves the commission screens alone", async () => {
    mocks.callAgentFunction.mockResolvedValue({ ok: true, data: { changed: true } });
    await expect(cancelTripAction({ ...BASE, closeCommission: [] })).resolves.toEqual({
      ok: true,
      linesClosed: 0,
      linesSkipped: 0,
    });
    expect(mocks.callAgentFunction.mock.calls[0][1]).not.toHaveProperty("closeCommission");
    expect(mocks.revalidatePath).not.toHaveBeenCalledWith("/agent/commission", "layout");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/agent/trips/t1");
  });

  it("a count that is not a whole number reads as none, never NaN on screen", async () => {
    mocks.callAgentFunction.mockResolvedValue({
      ok: true,
      data: { commissionLinesClosed: "2", commissionLinesSkipped: -1 },
    });
    await expect(cancelTripAction(BASE)).resolves.toEqual({ ok: true, linesClosed: 0, linesSkipped: 0 });
  });

  it("a stale trip is said in words", async () => {
    mocks.callAgentFunction.mockResolvedValue({ ok: false, kind: "rejected", conflict: true, detail: "moved" });
    await expect(cancelTripAction(BASE)).resolves.toEqual({
      ok: false,
      message: "This trip moved since the page loaded. Reload and try again.",
      stale: true,
    });
  });
});
