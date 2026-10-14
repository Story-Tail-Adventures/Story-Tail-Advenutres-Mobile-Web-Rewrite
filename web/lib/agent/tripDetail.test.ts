import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * §3.4.16's open-lines read (§3.7 Stage 5): the SQL's columns mapped to what the cancel dialog
 * shows and sends back. The dialog tests feed already-mapped objects, so a renamed column
 * would pass every one of them; this is where it fails.
 */

const mocks = vi.hoisted(() => ({ callAgentRead: vi.fn() }));
vi.mock("@/lib/agent/api", () => ({ callAgentRead: mocks.callAgentRead }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import { loadTripOpenCommission } from "./tripDetail";

beforeEach(() => vi.clearAllMocks());

describe("loadTripOpenCommission", () => {
  it("maps each line to its id, version, supplier, status label and amount", async () => {
    mocks.callAgentRead.mockResolvedValue({
      ok: true,
      rows: [
        { commission_id: "a", supplier_name: "Sandals Negril", status: "expected", expected_commission_cents: "97000", currency: "USD", version: 1 },
        { commission_id: "b", supplier_name: "Delta", status: "invoiced", expected_commission_cents: "34800", currency: "USD", version: 4 },
      ],
    });
    await expect(loadTripOpenCommission("t1")).resolves.toEqual([
      { commissionId: "a", version: 1, supplierName: "Sandals Negril", statusLabel: "Expected", amountLabel: "$970" },
      { commissionId: "b", version: 4, supplierName: "Delta", statusLabel: "Invoiced", amountLabel: "$348" },
    ]);
    expect(mocks.callAgentRead).toHaveBeenCalledWith("agent_trip_open_commission", { p_trip_id: "t1" });
  });

  it("shows a status it does not know as it came, rather than dropping the line", async () => {
    mocks.callAgentRead.mockResolvedValue({
      ok: true,
      rows: [{ commission_id: "a", supplier_name: "X", status: "on_hold", expected_commission_cents: "100", currency: "USD", version: 1 }],
    });
    const lines = await loadTripOpenCommission("t1");
    expect(lines?.[0].statusLabel).toBe("on_hold");
  });

  it("is null when the read fails, an empty list when there is nothing open", async () => {
    mocks.callAgentRead.mockResolvedValue({ ok: false, kind: "unavailable" });
    await expect(loadTripOpenCommission("t1")).resolves.toBeNull();
    mocks.callAgentRead.mockResolvedValue({ ok: true, rows: [] });
    await expect(loadTripOpenCommission("t1")).resolves.toEqual([]);
  });
});
