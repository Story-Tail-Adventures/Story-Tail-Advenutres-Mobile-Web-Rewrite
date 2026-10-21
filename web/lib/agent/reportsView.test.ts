import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  destinationReport,
  periodChips,
  periodRangeLabel,
  readBasis,
  readCompare,
  readPeriod,
  reportExportHref,
  reportStateHref,
  revenueReport,
  supplierReport,
} from "@/lib/agent/reportsView";
import { REPORTS_COPY, suppliersSetAside } from "@/lib/agent/reportsCopy";

/**
 * §3.11's view models (ruled 2026-10-21). The SQL owns what is counted; these tests guard
 * what the screen SAYS about it: the period in the URL, the year-over-year rule, the shares,
 * and the honest labels for "nothing" (a NULL prior is not $0, a stopless trip is not dropped).
 */

describe("the URL", () => {
  it("reads the period, basis and compare, with anything unknown as the default", () => {
    expect(readPeriod("12mo")).toBe("12mo");
    expect(readPeriod(["qtd", "ytd"])).toBe("qtd");
    expect(readPeriod("week")).toBe("ytd");
    expect(readPeriod(undefined)).toBe("ytd");
    expect(readBasis("received")).toBe("received");
    expect(readBasis("gross")).toBe("booked");
    expect(readCompare("1")).toBe(true);
    expect(readCompare("yes")).toBe(false);
  });

  it("leaves defaults out, so the bare URL is the canonical one", () => {
    expect(reportStateHref("revenue", { period: "ytd", basis: "booked" })).toBe("/agent/reports/revenue");
    expect(reportStateHref("revenue", { period: "12mo", basis: "received", compare: true })).toBe(
      "/agent/reports/revenue?period=12mo&basis=received&compare=1",
    );
  });

  it("keeps the basis and compare when the period changes, and marks the current chip", () => {
    const chips = periodChips("revenue", "qtd", { basis: "received", compare: true });
    expect(chips.map((c) => c.label)).toEqual(["Year to date", "Last 12 months", "This quarter"]);
    expect(chips.filter((c) => c.selected).map((c) => c.period)).toEqual(["qtd"]);
    expect(chips[1].href).toBe("/agent/reports/revenue?period=12mo&basis=received&compare=1");
  });

  it("exports to /download (the Export Center owns /export), with a basis only for revenue", () => {
    expect(reportExportHref("revenue", "12mo", "received")).toBe(
      "/agent/reports/download?report=revenue&period=12mo&basis=received",
    );
    expect(reportExportHref("suppliers", "ytd")).toBe("/agent/reports/download?report=suppliers&period=ytd");
  });

  it("says the period's dates in words, with both years only when it crosses one", () => {
    expect(periodRangeLabel("2026-01-01", "2026-10-21")).toBe("Jan 1 to Oct 21, 2026");
    expect(periodRangeLabel("2025-11-01", "2026-10-21")).toBe("Nov 1, 2025 to Oct 21, 2026");
  });
});

describe("3.11.2 Revenue by Month", () => {
  const month = (m: string, cents: string, n = 1, prior: string | null = null) => ({
    month_start: m,
    cents,
    item_count: n,
    prior_cents: prior,
  });

  it("totals the months and marks the advisor's current month", () => {
    const r = revenueReport(
      [month("2026-08-01", "0", 0), month("2026-09-01", "2032500", 2), month("2026-10-01", "512000")],
      "2026-10-21",
    );
    expect(r.totalLabel).toBe("$25,445");
    expect(r.months.map((m) => m.isCurrent)).toEqual([false, false, true]);
    expect(r.months[1]).toMatchObject({ label: "Sep", longLabel: "September 2026", amountLabel: "$20,325" });
    expect(r.months[0].heightPct).toBe(0);
    expect(r.empty).toBe(false);
  });

  it("hides year over year until some month has a figure a year back", () => {
    const r = revenueReport([month("2026-09-01", "1000"), month("2026-10-01", "3000")], "2026-10-21");
    expect(r.hasPrior).toBe(false);
    expect(r.change).toBeNull();
    expect(r.months.every((m) => m.priorLabel === null)).toBe(true);
  });

  it("compares like for like: only months that HAVE a prior figure", () => {
    // Sep has no prior: its 9000 must not count as growth against nothing.
    const r = revenueReport(
      [month("2026-09-01", "9000"), month("2026-10-01", "1200", 1, "1000")],
      "2026-10-21",
    );
    expect(r.hasPrior).toBe(true);
    expect(r.change).toBe("+20% vs last year");
    expect(r.months[0].priorLabel).toBeNull();
    expect(r.months[1].priorLabel).toBe("$10");
  });

  it("says a fall plainly, and no change as no change", () => {
    expect(revenueReport([month("2026-10-01", "800", 1, "1000")], "2026-10-21").change).toBe("−20% vs last year");
    expect(revenueReport([month("2026-10-01", "1000", 1, "1000")], "2026-10-21").change).toBe("Same as last year");
    // A prior month recorded as exactly 0 is data, but there is no base to change from.
    expect(revenueReport([month("2026-10-01", "1000", 1, "0")], "2026-10-21").change).toBeNull();
  });

  it("draws this year and last on one scale, and a small month still shows", () => {
    const r = revenueReport(
      [month("2026-09-01", "100000", 1, "200000"), month("2026-10-01", "100", 1, null)],
      "2026-10-21",
    );
    expect(r.months[0].priorHeightPct).toBeGreaterThan(r.months[0].heightPct);
    expect(r.months[1].heightPct).toBe(2);
  });

  it("reads a missing prior as no prior, never as $0 last year", () => {
    const r = revenueReport([{ month_start: "2026-10-01", cents: "100", item_count: 1 } as never], "2026-10-21");
    expect(r.hasPrior).toBe(false);
  });

  it("is empty when every month is zero", () => {
    expect(revenueReport([month("2026-10-01", "0", 0)], "2026-10-21").empty).toBe(true);
  });
});

describe("3.11.3 Commission by Supplier", () => {
  const row = (id: string, name: string, received: string, owed: string, setAside = 0, setAsideReceived = "0") => ({
    supplier_id: id,
    supplier_name: name,
    received_cents: received,
    owed_cents: owed,
    line_count: 1,
    set_aside_count: setAside,
    set_aside_received_cents: setAsideReceived,
  });

  it("links each supplier to the ledger with the same travel dates", () => {
    const r = supplierReport([row("s1", "Sandals", "20000", "40000")], { from: "2026-01-01", to: "2026-10-21" });
    expect(r.rows[0].href).toBe("/agent/commission/ledger?supplier=s1&from=2026-01-01&to=2026-10-21");
  });

  it("shares add to about 100 and the received part of each bar is its own split", () => {
    const r = supplierReport(
      [row("s1", "One", "20000", "40000", 2), row("s2", "Two", "50000", "0")],
      { from: "2026-01-01", to: "2026-10-21" },
    );
    expect(r.rows.map((x) => x.shareLabel)).toEqual(["55%", "45%"]);
    expect(r.rows.map((x) => x.receivedPct)).toEqual([33, 100]);
    expect(r.receivedTotalLabel).toBe("$700");
    expect(r.owedTotalLabel).toBe("$400");
    expect(r.setAsideCount).toBe(2);
  });

  it("keeps a supplier with only disputed lines out of the table but in the footnote", () => {
    const r = supplierReport([row("s3", "Disputed Only", "0", "0", 3)], { from: "2026-01-01", to: "2026-10-21" });
    expect(r.rows).toEqual([]);
    expect(r.empty).toBe(true);
    expect(r.setAsideCount).toBe(3);
    expect(suppliersSetAside(3)).toBe("3 disputed or lost lines are set aside and not counted here.");
    expect(suppliersSetAside(1)).toBe("1 disputed or lost line is set aside and not counted here.");
    expect(suppliersSetAside(0)).toBeNull();
  });

  it("names money already received on set-aside lines, so it does not vanish", () => {
    const r = supplierReport(
      [row("s1", "One", "20000", "0", 1, "1500"), row("s2", "Two", "100", "0", 1, "0")],
      { from: "2026-01-01", to: "2026-10-21" },
    );
    expect(r.setAsideReceivedLabel).toBe("$15");
    expect(suppliersSetAside(r.setAsideCount, r.setAsideReceivedLabel)).toBe(
      "2 disputed or lost lines are set aside and not counted here, including $15 already received on them.",
    );
    expect(supplierReport([row("s1", "One", "1", "0")], { from: "2026-01-01", to: "2026-10-21" }).setAsideReceivedLabel).toBeNull();
  });
});

describe("3.11.4 Top Destinations", () => {
  it("labels the stopless row instead of dropping it, and totals to the cent", () => {
    const r = destinationReport([
      { destination: "Nassau", trip_count: 2, value_cents: "116667" },
      { destination: "Exuma", trip_count: 1, value_cents: "33334" },
      { destination: null, trip_count: 2, value_cents: "30000" },
    ]);
    expect(r.rows.map((x) => x.name)).toEqual(["Nassau", "Exuma", REPORTS_COPY.noDestination]);
    expect(r.rows[2].unnamed).toBe(true);
    expect(r.totalLabel).toBe("$1,800");
    // Bars against the leader: the top row is a full bar.
    expect(r.rows[0].sharePct).toBe(100);
  });

  it("is empty with no rows", () => {
    expect(destinationReport([]).empty).toBe(true);
  });

  it("formats a negative value instead of throwing (a 500 in a Server Component)", () => {
    const r = destinationReport([{ destination: "Credit", trip_count: 1, value_cents: "-5000" }]);
    expect(r.rows[0].valueLabel).toBe("−$50");
    expect(r.rows[0].sharePct).toBe(0);
  });
});

describe("the CSV and the screen say the same words", () => {
  // CI runs the Deno tests without --allow-read, so the cross-file check lives here.
  const deno = readFileSync(resolve(__dirname, "../../..", "supabase/functions/_shared/report.ts"), "utf8");

  it("labels the stopless row the same way in the file as on the screen", () => {
    expect(deno).toContain(`export const NO_DESTINATION = "${REPORTS_COPY.noDestination}";`);
  });
});
