import { describe, expect, it, vi } from "vitest";

/**
 * §3.7.7's view model.
 *
 * WHAT THIS FILE PINS:
 *  1. The caption repeats the worklist tile's own figure (unweighted total, confidence), so the
 *     two screens are seen to agree; the confidence is NULL, not 0%, on an empty pipeline.
 *  2. The calendar always shows twelve months; overdue, later and undated only when they hold
 *     money; the year only where it turns.
 */

vi.mock("@/lib/agent/api", () => ({ callAgentRead: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import type { AgentCommissionCashInRow, AgentCommissionForecastRow } from "./api";
import { forecastView } from "./forecast";

function stage(status: string, weight: number, n: number, raw: string, weighted: string): AgentCommissionForecastRow {
  return {
    status, weight_pct: weight, trip_count: n, raw_cents: raw, weighted_cents: weighted,
    total_raw_cents: "1110076", total_weighted_cents: "937516", as_of_date: "2026-10-12",
  };
}

const STAGES = [
  stage("inquiry", 20, 2, "0", "0"),
  stage("proposal", 50, 3, "345120", "172560"),
  stage("booked", 100, 5, "675196", "675196"),
  stage("in_progress", 100, 1, "89760", "89760"),
];

function months(start: string, amounts: number[]): AgentCommissionCashInRow[] {
  const [y, m] = start.split("-").map(Number);
  return amounts.map((a, i) => {
    const d = new Date(Date.UTC(y, m - 1 + i, 1));
    return { bucket: "month", month_start: d.toISOString().slice(0, 10), cents: String(a), trip_count: a ? 1 : 0, received_cents: "0" };
  });
}

function calendar(over: Partial<Record<"overdue" | "later" | "undated", number>> = {}, received = "0"): AgentCommissionCashInRow[] {
  const extra = (bucket: string, cents = 0): AgentCommissionCashInRow =>
    ({ bucket, month_start: null, cents: String(cents), trip_count: cents ? 1 : 0, received_cents: received });
  return [
    extra("overdue", over.overdue),
    ...months("2026-10-01", [0, 0, 151200, 168756, 147400, 0, 57840, 114720, 0, 297600, 0, 0])
      .map((r) => ({ ...r, received_cents: received })),
    extra("later", over.later),
    extra("undated", over.undated),
  ];
}

describe("forecastView", () => {
  it("leads with the weighted total, and captions it with the worklist tile's own figure", () => {
    const v = forecastView(STAGES, calendar());
    expect(v.totalLabel).toBe("$9,375");
    expect(v.acrossLabel).toBe("Of $11,101 across 11 open trips · 84% confidence");
    expect(v.stages.map((s) => [s.label, s.weightPct, s.weightedLabel])).toEqual([
      ["Inquiry", 20, "$0"],
      ["Proposal", 50, "$1,726"],
      ["Booked", 100, "$6,752"],
      ["Traveling", 100, "$898"],
    ]);
    expect(v.stages[1].tripCountLabel).toBe("3 trips");
    expect(v.stages[3].tripCountLabel).toBe("1 trip");
  });

  it("an empty pipeline has no confidence to report, not 0%", () => {
    const empty = STAGES.map((s) => ({ ...s, raw_cents: "0", weighted_cents: "0", trip_count: 0, total_raw_cents: "0", total_weighted_cents: "0" }));
    const v = forecastView(empty, calendar());
    // No caption at all: "Of $0 across 0 open trips" says nothing.
    expect(v.acrossLabel).toBeNull();
    expect(v.anyCommission).toBe(false);
  });

  it("shows twelve months always, with the year only where it turns", () => {
    const v = forecastView(STAGES, calendar());
    expect(v.calendar).toHaveLength(12);
    expect(v.calendar.map((r) => r.label)).toEqual([
      "Oct 2026", "Nov", "Dec", "Jan 2027", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep",
    ]);
    // Against the largest row: July's $2,976 is the full bar.
    expect(v.calendar[9].barPct).toBe(100);
    expect(v.calendar[0].barPct).toBe(0);
  });

  it("adds overdue first and later / date not set last, only when they hold money, and says what was received", () => {
    const v = forecastView(STAGES, calendar({ overdue: 20000, undated: 40000 }, "20000"));
    expect(v.calendar[0]).toMatchObject({ kind: "overdue", label: "Overdue", amountLabel: "$200" });
    expect(v.calendar.at(-1)).toMatchObject({ kind: "undated", label: "No travel dates yet", amountLabel: "$400" });
    expect(v.calendar.some((r) => r.kind === "later")).toBe(false);
    expect(v.receivedNote).toBe("$200 of the forecast is already received, so the calendar leaves it out.");
  });

  it("drops a bucket it does not know, and gives any money at all a visible sliver of bar", () => {
    const rows = calendar();
    rows[3] = { ...rows[3], cents: "500" };
    rows.push({ bucket: "someday", month_start: null, cents: "999", trip_count: 1, received_cents: "0" });
    const v = forecastView(STAGES, rows);
    expect(v.calendar).toHaveLength(12);
    // $5 beside July's $2,976: still drawn.
    expect(v.calendar[2].barPct).toBe(2);
  });
});
