// @vitest-environment node
// A server action runs on Node: its File and FormData are Node's, not jsdom's (whose File has no arrayBuffer).
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * §3.7.5 / §3.7.6's server actions.
 *
 * WHAT THIS FILE PINS:
 *  1. ONLY RECONCILE REFRESHES THE LEDGER'S PAGES — it is the only action that changes a line.
 *  2. Every refusal outcome becomes a sentence, and staleness is read off `conflict`, never the
 *     function's English.
 *  3. A bad create (no trip, no rate) never reaches the function.
 */

const mocks = vi.hoisted(() => ({
  callAgentFunction: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT ${url}`);
  }),
}));

vi.mock("@/lib/agent/api", () => ({ callAgentFunction: mocks.callAgentFunction, callAgentRead: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import {
  discardStatementAction,
  mapStatementAction,
  reconcileStatementAction,
  resolveRowAction,
  uploadStatementAction,
} from "./actions";

const IMPORT = "01a12dbb-c2b9-7a83-8f04-f7b6b2cc0f4f";

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("uploadStatementAction", () => {
  it("sends the file as base64 and lands on the new statement", async () => {
    mocks.callAgentFunction.mockResolvedValue({ ok: true, data: { outcome: "uploaded", importId: IMPORT } });
    const fd = new FormData();
    fd.set("file", new File(["Ref,Paid\nA,1\n"], "may.csv", { type: "text/csv" }));
    await expect(uploadStatementAction({}, fd)).rejects.toThrow(`REDIRECT /agent/commission/import/${IMPORT}`);
    expect(mocks.callAgentFunction).toHaveBeenCalledWith("commission-import", {
      op: "upload",
      filename: "may.csv",
      fileBase64: Buffer.from("Ref,Paid\nA,1\n").toString("base64"),
    });
  });

  it("a duplicate links to the statement that has it; an Excel file never leaves", async () => {
    mocks.callAgentFunction.mockResolvedValue({ ok: true, data: { outcome: "duplicate_file", importId: IMPORT } });
    const fd = new FormData();
    fd.set("file", new File(["x"], "may.csv"));
    expect(await uploadStatementAction({}, fd)).toEqual({
      formError: "You've already imported this file.",
      duplicateHref: `/agent/commission/import/${IMPORT}`,
    });

    const xlsx = new FormData();
    xlsx.set("file", new File(["x"], "may.xlsx"));
    mocks.callAgentFunction.mockClear();
    expect((await uploadStatementAction({}, xlsx)).formError).toMatch(/save it as CSV/);
    expect(mocks.callAgentFunction).not.toHaveBeenCalled();
  });
});

describe("mapStatementAction", () => {
  it("sends field → column, and the statement date only when no column holds one", async () => {
    mocks.callAgentFunction.mockResolvedValue({ ok: true, data: { outcome: "mapped" } });
    await expect(mapStatementAction({}, form({
      importId: IMPORT, version: "2", headerCount: "3",
      "col-0": "reference", "col-1": "", "col-2": "received", statementDate: "2026-10-01",
    }))).rejects.toThrow("REDIRECT");
    expect(mocks.callAgentFunction).toHaveBeenCalledWith("commission-import", {
      op: "map", importId: IMPORT, expectedVersion: 2,
      columnMap: { reference: 0, received: 2 }, statementDate: "2026-10-01",
    });
    // Mapping changes no ledger line.
    expect(mocks.revalidatePath).not.toHaveBeenCalledWith("/agent/commission/ledger");
  });

  it("a stale map says so and keeps what the advisor chose", async () => {
    mocks.callAgentFunction.mockResolvedValue({ ok: false, kind: "rejected", conflict: true, detail: "x" });
    const out = await mapStatementAction({}, form({
      importId: IMPORT, version: "2", headerCount: "1", "col-0": "received", statementDate: "2026-10-01",
    }));
    expect(out.formError).toMatch(/changed since you opened it/);
    expect(out.values?.selections).toEqual(["received"]);
  });
});

describe("resolveRowAction", () => {
  const base = { importId: IMPORT, rowId: "r1", version: "3" };

  it("says which form was refused, so the page shows it in that card", async () => {
    mocks.callAgentFunction.mockResolvedValue({ ok: true, data: { outcome: "line_unavailable" } });
    expect(await resolveRowAction({}, form({ ...base, action: "match", commissionId: "c1" }))).toEqual({
      formError: expect.stringMatching(/can't take this payment/),
      action: "match",
    });
  });

  it.each([
    ["line_unavailable", /can't take this payment anymore/],
    ["trip_not_found", /trip isn't available/],
    ["supplier_not_found", /supplier isn't available/],
    ["not_allowed", /isn't available for this row/],
    ["not_open", /already reconciled or discarded/],
  ])("%s becomes a sentence", async (outcome, sentence) => {
    mocks.callAgentFunction.mockResolvedValue({ ok: true, data: { outcome } });
    expect((await resolveRowAction({}, form({ ...base, action: "ignore" }))).formError).toMatch(sentence);
  });

  it("a create with no trip or no rate never reaches the function", async () => {
    expect((await resolveRowAction({}, form({ ...base, action: "create", gross: "100", rate: "10" }))).formError)
      .toBe("Choose a trip first.");
    expect((await resolveRowAction({}, form({ ...base, action: "create", tripId: "t1", gross: "100", rate: "abc" }))).formError)
      .toBe("Enter a commission rate from 0 to 100.");
    expect((await resolveRowAction({}, form({ ...base, action: "create", tripId: "t1", gross: "", rate: "10" }))).formError)
      .toBe("Enter the gross booking, like 6480.00.");
    expect(mocks.callAgentFunction).not.toHaveBeenCalled();
  });

  it("a good create sends cents and the rate, then returns to the statement", async () => {
    mocks.callAgentFunction.mockResolvedValue({ ok: true, data: { outcome: "resolved" } });
    await expect(resolveRowAction({}, form({
      ...base, action: "create", tripId: "t1", supplierId: "s9", gross: "2,400.00", rate: "13",
    }))).rejects.toThrow(`REDIRECT /agent/commission/import/${IMPORT}`);
    expect(mocks.callAgentFunction).toHaveBeenCalledWith("commission-import", expect.objectContaining({
      op: "resolve", action: "create", tripId: "t1", supplierId: "s9", grossCents: 240000, commissionPct: 13,
    }));
  });
});

describe("reconcileStatementAction", () => {
  it("is the only action that refreshes the ledger's pages", async () => {
    mocks.callAgentFunction.mockResolvedValue({ ok: true, data: { outcome: "reconciled" } });
    await expect(reconcileStatementAction({}, form({ importId: IMPORT, version: "5" }))).rejects.toThrow("REDIRECT");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/agent/commission");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/agent/commission/ledger");
  });

  it("a row that changed underneath sends the advisor back to it, ledger untouched", async () => {
    mocks.callAgentFunction.mockResolvedValue({ ok: true, data: { outcome: "needs_decisions" } });
    const out = await reconcileStatementAction({}, form({ importId: IMPORT, version: "5" }));
    expect(out.formError).toMatch(/needs you again/);
    expect(mocks.revalidatePath).not.toHaveBeenCalledWith("/agent/commission/ledger");
  });

  it("a call that never answered does not promise the ledger is unchanged", async () => {
    mocks.callAgentFunction.mockResolvedValue({ ok: false, kind: "unavailable" });
    expect((await reconcileStatementAction({}, form({ importId: IMPORT, version: "5" }))).formError)
      .toMatch(/^That didn't finish\. Reload the page/);
    mocks.callAgentFunction.mockResolvedValue({ ok: false, kind: "rejected", detail: "x" });
    expect((await reconcileStatementAction({}, form({ importId: IMPORT, version: "5" }))).formError)
      .toMatch(/Nothing in your ledger changed/);
  });
});

describe("discardStatementAction", () => {
  it("returns to the import page; a reconciled statement cannot be discarded", async () => {
    mocks.callAgentFunction.mockResolvedValueOnce({ ok: true, data: { outcome: "discarded" } });
    await expect(discardStatementAction({}, form({ importId: IMPORT, version: "2" })))
      .rejects.toThrow("REDIRECT /agent/commission/import");
    mocks.callAgentFunction.mockResolvedValueOnce({ ok: true, data: { outcome: "not_open" } });
    expect((await discardStatementAction({}, form({ importId: IMPORT, version: "2" }))).formError)
      .toMatch(/already reconciled or discarded/);
  });
});
