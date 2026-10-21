import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  clientReport,
  cohortName,
  destinationReport,
  funnelReport,
  pipelineReport,
  readCohort,
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

describe("3.11.5 Client Lifetime Value", () => {
  const row = (id: string, name: string, value: string, cohort: string | null) => ({
    client_id: id,
    display_name: name,
    trip_count: 1,
    value_cents: value,
    commission_cents: "1000",
    cohort_start: cohort,
  });
  const rows = [
    row("c1", "Bo Diddley", "200000", null),
    row("c2", "Ada Lovelace", "150000", "2025-01-01"),
    row("c3", "Cy Young", "90000", "2026-07-01"),
  ];

  it("ranks the whole book and links each client to their page", () => {
    const r = clientReport(rows, null);
    expect(r.rows.map((x) => [x.rank, x.name, x.valueLabel, x.cohortLabel])).toEqual([
      [1, "Bo Diddley", "$2,000", "Before tracking"],
      [2, "Ada Lovelace", "$1,500", "2025 Q1"],
      [3, "Cy Young", "$900", "2026 Q3"],
    ]);
    expect(r.rows[0].href).toBe("/agent/clients/c1");
  });

  it("filters by cohort and keeps each client's true rank", () => {
    const r = clientReport(rows, "2026-q3");
    expect(r.rows.map((x) => [x.rank, x.name])).toEqual([[3, "Cy Young"]]);
    expect(r.cohorts.map((c) => [c.label, c.selected])).toEqual([
      ["All clients", false],
      ["2026 Q3", true],
      ["2025 Q1", false],
      ["Before tracking", false],
    ]);
    expect(r.cohorts[3].href).toBe("/agent/reports/clients?cohort=none");
    expect(r.empty).toBe(false);
  });

  it("reads only real cohort keys from the URL", () => {
    expect(readCohort("2025-q1")).toBe("2025-q1");
    expect(readCohort("none")).toBe("none");
    expect(readCohort("2025-q5")).toBeNull();
    expect(readCohort("drop table")).toBeNull();
    expect(cohortName("2025-10-01")).toBe("2025 Q4");
  });

  it("is empty only when the book has nobody ranked", () => {
    expect(clientReport([], null).empty).toBe(true);
    expect(clientReport(rows, "2020-q1")).toMatchObject({ empty: false, rows: [] });
  });
});

describe("3.11.6 Conversion Funnel", () => {
  const stage = (s: number, reached: number, open: number, cancelled: number, days: number | string | null = 7, n = 3) => ({
    stage: s, reached, open_here: open, cancelled_here: cancelled, book_days_avg: days, book_days_n: n,
  });

  it("summarises inquiries to traveled, and splits each stop into open and cancelled", () => {
    const r = funnelReport([stage(1, 142, 30, 58), stage(2, 54, 10, 6), stage(3, 38, 6, 0), stage(4, 32, 0, 0)]);
    expect(r.summary).toBe("142 inquiries → 32 traveled · 22.5% made it all the way");
    expect(r.stages.map((s) => s.pctLabel)).toEqual(["100%", "38%", "26.8%", "22.5%"]);
    expect(r.stages[0].stoppedLabel).toBe("−88 · 30 still open, 58 cancelled");
    expect(r.stages[2].stoppedLabel).toBe("−6 · 6 still open");
    expect(r.stages[3].stoppedLabel).toBeNull();
    expect(r.bookDaysLabel).toBe("7.0 days on average from inquiry to booked, across 3 trips.");
  });

  it("says plainly when nothing has booked yet, and when nothing came in", () => {
    const none = funnelReport([stage(1, 2, 2, 0, null, 0), stage(2, 0, 0, 0, null, 0), stage(3, 0, 0, 0, null, 0), stage(4, 0, 0, 0, null, 0)]);
    expect(none.bookDaysLabel).toBe("No trips from this period have booked yet.");
    expect(none.summary).toBe("2 inquiries → 0 traveled · 0% made it all the way");
    const empty = funnelReport([stage(1, 0, 0, 0, null, 0), stage(2, 0, 0, 0, null, 0), stage(3, 0, 0, 0, null, 0), stage(4, 0, 0, 0, null, 0)]);
    expect(empty.empty).toBe(true);
    expect(empty.summary).toBe("0 inquiries → 0 traveled");
  });

  it("reads days to book whether PostgREST sends a number or a string", () => {
    expect(funnelReport([stage(1, 1, 0, 0, "18.36", 38)]).bookDaysLabel).toBe("18.4 days on average from inquiry to booked, across 38 trips.");
  });
});

describe("3.11.7 Pipeline Value", () => {
  const st = (status: string, w: number, n: number, gross: string, weighted: string) => ({
    status, weight_pct: w, trip_count: n, gross_cents: gross, weighted_cents: weighted,
    total_gross_cents: "1296594", total_weighted_cents: "817740",
  });
  const mo = (bucket: string, m: string | null, n: number, c: string) => ({ bucket, month_start: m, trip_count: n, weighted_cents: c });
  const months = [
    mo("past", null, 1, "77777"),
    mo("month", "2026-12-01", 2, "88888"),
    mo("month", "2027-01-01", 1, "25000"),
    ...Array.from({ length: 10 }, (_, i) => mo("month", `2027-${String(i + 2).padStart(2, "0")}-01`, 0, "0")),
    mo("later", null, 1, "15001"),
    mo("undated", null, 0, "0"),
  ];

  it("leads with the totals and hands the weights card GROSS value per stage", () => {
    const r = pipelineReport(
      [st("inquiry", 25, 3, "100005", "25001"), st("proposal", 50, 3, "807701", "403851"),
       st("booked", 100, 3, "177777", "177777"), st("in_progress", 100, 3, "211111", "211111")],
      months,
    );
    expect(r.grossLabel).toBe("$12,966");
    expect(r.weightedLabel).toBe("$8,177");
    expect(r.openSub).toBe("12 trips, at full value");
    expect(r.stages.map((s) => [s.label, s.weightPct, s.rawCents, s.weightedLabel])).toEqual([
      ["Inquiry", 25, 100005, "$250"],
      ["Proposal", 50, 807701, "$4,039"],
      ["Booked", 100, 177777, "$1,778"],
      ["Traveling", 100, 211111, "$2,111"],
    ]);
  });

  it("labels the year where it turns, and shows the set-apart rows only when they hold a trip", () => {
    const r = pipelineReport([st("inquiry", 20, 1, "1", "0")], months);
    const monthsOnly = r.months.filter((m) => !m.extra);
    expect(monthsOnly.slice(0, 3).map((m) => m.label)).toEqual(["Dec 2026", "Jan 2027", "Feb"]);
    expect(r.months.filter((m) => m.extra).map((m) => m.label)).toEqual(["Start date passed · 1 trip", "Later · 1 trip"]);
    expect(monthsOnly[0].barPct).toBe(100);
    expect(monthsOnly[2].barPct).toBe(0);
  });

  it("scales the month bars against the months only, never a big undated figure", () => {
    const r = pipelineReport([st("inquiry", 20, 1, "1", "0")], [
      mo("month", "2026-12-01", 1, "1000"),
      mo("undated", null, 9, "900000"),
    ]);
    expect(r.months[0].barPct).toBe(100);
    expect(r.months[1]).toMatchObject({ extra: true, barPct: 0 });
  });

  it("drops a bucket it does not know, and says when nothing is open", () => {
    const r = pipelineReport([], [mo("overdue", null, 3, "900"), mo("month", "2026-12-01", 2, "88888")]);
    expect(r.months.map((m) => m.key)).toEqual(["2026-12-01"]);
    expect(r.empty).toBe(true);
    expect(r.grossLabel).toBe("$0");
  });
});
