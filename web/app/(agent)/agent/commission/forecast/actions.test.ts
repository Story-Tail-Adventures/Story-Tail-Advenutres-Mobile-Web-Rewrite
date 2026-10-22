// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 3.7.7's save: a bad weight never reaches the function, a stale save is said in words, and a
 * saved one refreshes the worklist too (its confidence uses the same weights).
 */

const mocks = vi.hoisted(() => ({
  callAgentFunction: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT ${url}`);
  }),
}));
vi.mock("@/lib/agent/api", () => ({ callAgentFunction: mocks.callAgentFunction }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

import { saveWeightsAction } from "./actions";

function form(proposal: string) {
  const f = new FormData();
  for (const [k, v] of Object.entries({ inquiry: "20", proposal, booked: "100", in_progress: "100" })) {
    f.set(`weight-${k}`, v);
  }
  for (const [k, v] of Object.entries({ inquiry: "20", proposal: "50", booked: "100", in_progress: "100" })) {
    f.set(`expected-${k}`, v);
  }
  return f;
}

beforeEach(() => vi.clearAllMocks());

describe("saveWeightsAction", () => {
  it("never sends a bad weight", async () => {
    const out = await saveWeightsAction({}, form("150"));
    expect(out.formError).toBe("Each weight is a whole number from 0 to 100.");
    expect(mocks.callAgentFunction).not.toHaveBeenCalled();
  });

  it("sends the new weights and the ones the screen showed; refreshes the forecast and the worklist", async () => {
    mocks.callAgentFunction.mockResolvedValue({ ok: true, data: { outcome: "saved" } });
    await expect(saveWeightsAction({}, form("80"))).rejects.toThrow("REDIRECT /agent/commission/forecast");
    expect(mocks.callAgentFunction).toHaveBeenCalledWith("agent-commission", {
      op: "weights",
      weights: { inquiry: 20, proposal: 80, booked: 100, in_progress: 100 },
      expected: { inquiry: 20, proposal: 50, booked: 100, in_progress: 100 },
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/agent");
  });

  it("from the pipeline report, comes back to it and refreshes both screens (§3.11.7)", async () => {
    mocks.callAgentFunction.mockResolvedValue({ ok: true, data: { outcome: "saved" } });
    const f = form("80");
    f.set("returnTo", "pipeline");
    await expect(saveWeightsAction({}, f)).rejects.toThrow("REDIRECT /agent/reports/pipeline");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/agent/reports/pipeline");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/agent/commission/forecast");
  });

  it("never redirects to a path the form names", async () => {
    mocks.callAgentFunction.mockResolvedValue({ ok: true, data: { outcome: "saved" } });
    const f = form("80");
    f.set("returnTo", "https://evil.example/");
    await expect(saveWeightsAction({}, f)).rejects.toThrow("REDIRECT /agent/commission/forecast");
  });

  it("a stale save says so", async () => {
    mocks.callAgentFunction.mockResolvedValue({ ok: false, kind: "rejected", conflict: true, detail: "x" });
    const out = await saveWeightsAction({}, form("80"));
    expect(out.formError).toMatch(/changed somewhere else, so yours weren't saved/);
  });
});
