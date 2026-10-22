import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * §3.7.5 / §3.7.6's view models.
 *
 * WHAT THIS FILE PINS:
 *
 *  1. THE NOTE IS THE SCREEN'S REASON TO EXIST. A short payment says how short and, against
 *     the line's BOOKED gross, at what rate it was really paid — the prototype's "Sandals
 *     applied 14% not 15%". The first draft divided by the statement's own gross and told an
 *     advisor a SHORT payment was paid at a HIGHER rate.
 *  2. "Auto ✓" ONLY WHERE THE MATCHER WAS CERTAIN. A suggestion the advisor confirmed says
 *     Matched; calling it Auto would claim a certainty nobody had.
 *  3. Rows that need the advisor come first, and only they block reconciling.
 *  4. Money to the cent: a statement is the record of what was paid.
 */

const mocks = vi.hoisted(() => ({
  callAgentRead: vi.fn(),
  createClient: vi.fn(),
}));

vi.mock("@/lib/agent/api", () => ({ callAgentRead: mocks.callAgentRead }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));

import type { AgentCommissionImportLineRow, AgentCommissionImportRow } from "./api";
import {
  impliedRate,
  loadRowToResolve,
  loadStatement,
  loadStatementRows,
  statementLabel,
  statementRowView,
  statementView,
} from "./statements";

const IMPORT = "01a12dbb-c2b9-7a83-8f04-f7b6b2cc0f4f";

function row(over: Partial<AgentCommissionImportLineRow> = {}): AgentCommissionImportLineRow {
  return {
    row_id: "r1",
    row_number: 1,
    state: "confirmed",
    match_basis: "reference",
    reference: "ITV-1",
    supplier_text: "Sandals",
    traveler_text: "J Quintero",
    gross_cents: null,
    received_cents: "54000",
    fee_cents: "3600",
    paid_on: "2026-10-09",
    currency: "USD",
    parse_error: null,
    line_id: "c1",
    line_trip_id: "t1",
    line_trip_title: "Getaway #16",
    line_client_name: "Jordan Quintero",
    line_supplier_name: "Sandals Resorts",
    line_status: "invoiced",
    line_gross_cents: "480000",
    line_commission_pct: 12,
    line_expected_cents: "57600",
    line_fee_cents: "0",
    line_received_cents: "0",
    line_received_at: null,
    new_trip_id: null,
    new_trip_title: null,
    new_supplier_id: null,
    new_supplier_name: null,
    new_gross_cents: null,
    new_commission_pct: null,
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("statementRowView", () => {
  it("a payment that covers the line says nothing more; the matcher's certainty is Auto", () => {
    const v = statementRowView(row(), IMPORT);
    expect(v.note).toBeNull();
    expect(v.doneLabel).toBe("Auto-matched");
    expect(v.needsYou).toBe(false);
    expect(v.statementLine).toBe("ITV-1 · Sandals · J Quintero");
    // Always to the cent on these screens, so a column of amounts lines up.
    expect(v.amountLabel).toBe("$540.00");
    // The client's whole name: "Van Der Berg" is not "Berg".
    expect(v.matchLabel).toBe("Sandals Resorts · Jordan Quintero · Getaway #16");
    expect(v.matchHref).toBe("/agent/commission/ledger/c1");
  });

  it("a short payment says how short, and the rate it was paid at against the BOOKED gross", () => {
    // Expected $1,212.36 on a $10,103 booking at 12%. The statement's own gross ($9,000)
    // would make $1,180 look like 13.1% — higher than 12% for a payment that is short.
    const v = statementRowView(row({
      match_basis: "supplier_and_traveler",
      state: "suggested",
      gross_cents: "900000",
      received_cents: "118000",
      fee_cents: "0",
      line_gross_cents: "1010300",
      line_expected_cents: "121236",
    }), IMPORT);
    expect(v.note).toBe(
      "Expected $1,212.36. Paid $1,180.00. That's $32.36 short, so it will be marked Disputed. "
      + "Paid at about 11.7% of the booking, not 12%.",
    );
    expect(v.needsYou).toBe(true);
    expect(v.confidenceLabel).toBe("Medium");
  });

  it("once reconciled, the shortfall is in the past tense", () => {
    const v = statementRowView(row({ received_cents: "50000", fee_cents: "0" }), IMPORT, true);
    expect(v.note).toMatch(/so it was marked Disputed\./);
  });

  it("names the fee, so the three numbers on the page add up", () => {
    // $576 expected, $500 paid, $36 fee: $40 short.
    expect(statementRowView(row({ received_cents: "50000", fee_cents: "3600" }), IMPORT).note)
      .toMatch(/^Expected \$576\.00\. Paid \$500\.00 plus a \$36\.00 fee\. That's \$40\.00 short/);
  });

  it("an overpayment says so, without a rate", () => {
    expect(statementRowView(row({ received_cents: "56000" }), IMPORT).note).toBe("$20.00 more than expected.");
  });

  it("a suggestion the advisor confirmed is Matched, never Auto", () => {
    expect(statementRowView(row({ match_basis: "supplier_and_traveler" }), IMPORT).doneLabel).toBe("Matched");
    expect(statementRowView(row({ match_basis: "manual" }), IMPORT).doneLabel).toBe("Matched");
    expect(statementRowView(row({ match_basis: "confirmation" }), IMPORT).doneLabel).toBe("Auto-matched");
  });

  it("a row against a paid line says what the ledger holds, and that it will not change", () => {
    const same = statementRowView(row({
      state: "already_recorded", line_status: "received", received_cents: "32400", line_received_cents: "32400",
    }), IMPORT);
    expect(same.note).toBe("Already marked Received ($324.00). This import won't change it.");
    const differs = statementRowView(row({
      state: "already_recorded", line_status: "received", received_cents: "33000", line_received_cents: "32400",
    }), IMPORT);
    expect(differs.note).toBe("Your ledger says $324.00; this statement says $330.00. If the ledger's wrong, fix it on the line.");
    expect(differs.doneLabel).toBe("Already recorded");
  });

  it("a line disputed by hand says Disputed, and never renders an empty amount", () => {
    // A line moved to disputed with nothing received: the first draft read "Your ledger says ;".
    const v = statementRowView(row({
      state: "already_recorded", line_status: "disputed", received_cents: "33000", line_received_cents: null,
    }), IMPORT);
    expect(v.note).toBe("Already marked Disputed on your ledger. This import won't change it.");
  });

  it("a row set to create a line names the trip and supplier, and is not a link yet", () => {
    const v = statementRowView(row({
      state: "to_create", line_id: null, new_trip_title: "Kyoto", new_supplier_name: "Royal Caribbean",
      new_gross_cents: "240000", new_commission_pct: 13,
    }), IMPORT);
    expect(v.matchLabel).toBe("Royal Caribbean · Kyoto");
    expect(v.matchHref).toBeNull();
    expect(v.note).toBe("$2,400.00 at 13%");
    expect(v.doneLabel).toBe("New line");
    // The matcher's old confidence no longer describes a row the advisor decided.
    expect(v.confidenceLabel).toBeNull();
  });

  it("a new line that will start short says so; once reconciled it links to the line", () => {
    // $9,999.00 at 12.35% expects $1,234.88; the row paid $1,234.56.
    const short = statementRowView(row({
      state: "to_create", line_id: null, new_trip_title: "Kyoto", new_supplier_name: "Royal Caribbean",
      new_gross_cents: "999900", new_commission_pct: 12.35, received_cents: "123456", fee_cents: null,
    }), IMPORT);
    expect(short.note).toBe("$9,999.00 at 12.35%. Expected $1,234.88. Paid $1,234.56. That's $0.32 short, so it will be marked Disputed.");
    const done = statementRowView(row({
      state: "to_create", line_id: "new1", new_trip_title: "Kyoto", new_supplier_name: "Royal Caribbean",
      new_gross_cents: "240000", new_commission_pct: 13, received_cents: "31200", fee_cents: null,
    }), IMPORT, true);
    expect(done.matchHref).toBe("/agent/commission/ledger/new1");
  });

  it("an unreadable row shows why, low confidence, and needs the advisor", () => {
    const v = statementRowView(row({
      state: "unreadable", match_basis: "none", line_id: null, received_cents: null,
      parse_error: '"n/a" is not an amount.',
    }), IMPORT);
    expect(v.note).toBe('"n/a" is not an amount.');
    expect(v.amountLabel).toBeNull();
    expect(v.confidenceLabel).toBe("Low");
    expect(v.needsYou).toBe(true);
  });

  it("unmatched and duplicate rows need the advisor and say why", () => {
    expect(statementRowView(row({ state: "unmatched", match_basis: "none", line_id: null }), IMPORT).note)
      .toBe("Possible new booking. Create a line?");
    expect(statementRowView(row({ state: "duplicate" }), IMPORT).note).toMatch(/^Same booking as an earlier row/);
  });
});

describe("loadStatementRows", () => {
  it("puts the rows that need the advisor first, then file order", async () => {
    mocks.callAgentRead.mockResolvedValue({
      ok: true,
      rows: [
        row({ row_id: "a", row_number: 1 }),
        row({ row_id: "b", row_number: 2, state: "unmatched", match_basis: "none", line_id: null }),
        row({ row_id: "c", row_number: 3 }),
        row({ row_id: "d", row_number: 4, state: "suggested", match_basis: "supplier_and_traveler" }),
      ],
    });
    const rows = await loadStatementRows(IMPORT);
    expect(rows?.map((r) => r.rowId)).toEqual(["b", "d", "a", "c"]);
  });

  it("is null when the read failed, not an empty statement", async () => {
    mocks.callAgentRead.mockResolvedValue({ ok: false, kind: "unavailable" });
    expect(await loadStatementRows(IMPORT)).toBeNull();
  });
});

describe("loadRowToResolve", () => {
  it("labels the suggestion as the SUGGESTED line, even on a row set to create a new one", async () => {
    // Suggested → Create → Change: the first draft's card read "Royal Caribbean · Kyoto" (the
    // new line) on a button that confirms the old suggestion.
    mocks.callAgentRead
      .mockResolvedValueOnce({
        ok: true,
        rows: [row({
          state: "to_create", match_basis: "supplier_and_traveler", line_id: "c7",
          line_supplier_name: "Sandals Resorts", line_client_name: "Maya Carter", line_trip_title: "Cabo",
          new_trip_title: "Kyoto", new_supplier_name: "Royal Caribbean", new_gross_cents: "240000", new_commission_pct: 13,
        })],
      })
      .mockResolvedValueOnce({ ok: true, rows: [] });
    const res = await loadRowToResolve(IMPORT, "r1");
    expect(res.ok && res.view.row.suggestion?.label).toBe("Sandals Resorts · Maya Carter · Cabo");
  });

  it("offers no suggestion on a duplicate: that line is the earlier row's", async () => {
    mocks.callAgentRead
      .mockResolvedValueOnce({ ok: true, rows: [row({ state: "duplicate" })] })
      .mockResolvedValueOnce({ ok: true, rows: [] });
    const res = await loadRowToResolve(IMPORT, "r1");
    expect(res.ok && res.view.row.suggestion).toBeNull();
  });
});

describe("statementView", () => {
  const base: AgentCommissionImportRow = {
    import_id: IMPORT,
    original_filename: "may.csv",
    status: "review",
    headers: ["Ref", "Paid"],
    column_map: { reference: 0, received: 1 },
    statement_date: null,
    total_rows: 38,
    period_start: "2026-04-03",
    period_end: "2026-04-28",
    version: 4,
    created_at: "2026-10-12T01:00:00Z",
    reconciled_at: null,
    reconciled_on: null,
    confirmed_count: 33,
    suggested_count: 1,
    unmatched_count: 1,
    duplicate_count: 0,
    unreadable_count: 1,
    already_recorded_count: 2,
    to_create_count: 0,
    ignored_count: 0,
    sample_rows: [["", "540.00"], ["SRB-1", "1,100.00"]],
    as_of_date: "2026-10-12",
  };

  it("counts what needs the advisor and what reconciling would do", () => {
    const v = statementView(base);
    expect(v.title).toBe("Reconcile · April 2026 statement");
    // Settled rows only: the suggestion is not matched until confirmed. 35 + 3 = 38.
    expect(v.subtitle).toBe("38 imported · 35 matched · 3 to resolve");
    expect(v.needYou).toBe(3);
    expect(v.willPay).toBe(33);
    expect(v.selections).toEqual(["reference", "received"]);
    // The first non-blank sample per column.
    expect(v.samples).toEqual(["SRB-1", "540.00"]);
  });

  it("loadStatement: no row is not-found, a failed read is unavailable", async () => {
    mocks.callAgentRead.mockResolvedValueOnce({ ok: true, rows: [] });
    expect(await loadStatement(IMPORT)).toEqual({ ok: false, reason: "not-found" });
    mocks.callAgentRead.mockResolvedValueOnce({ ok: false, kind: "unavailable" });
    expect(await loadStatement(IMPORT)).toEqual({ ok: false, reason: "unavailable" });
  });
});

describe("statementLabel and impliedRate", () => {
  it("names a one-month statement by its month, anything else by its file", () => {
    expect(statementLabel("may.csv", "2026-04-03", "2026-04-28")).toBe("April 2026 statement");
    expect(statementLabel("may.csv", "2026-04-28", "2026-05-02")).toBe("may.csv");
    expect(statementLabel("may.csv", null, null)).toBe("may.csv");
  });

  it("works out the rate a new line needs to be paid in full, rounding DOWN", () => {
    expect(impliedRate(31200, 0, 240000)).toBe("13");
    expect(impliedRate(86000, 3760, 748000)).toBe("12");
    // 12.3469…%: to nearest it was 12.35%, which expects more than arrived.
    expect(impliedRate(123456, 0, 999900)).toBe("12.34");
    expect(impliedRate(100, 0, 0)).toBe("");
  });
});
