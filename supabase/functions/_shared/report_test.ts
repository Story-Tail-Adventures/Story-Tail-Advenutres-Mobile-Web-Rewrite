import { assertEquals, assertThrows } from "jsr:@std/assert@^1";
import { HttpError } from "./problem.ts";
import {
  BASES,
  PERIODS,
  cohortLabel,
  readBasis,
  readPeriod,
  readReport,
  readReportPeriod,
  REPORTS,
  reportCsv,
  reportFileName,
} from "./report.ts";

/**
 * The `agent-report` route's request checks and its CSVs (§3.11).
 *
 * Run: deno test --allow-env --config supabase/functions/deno.json supabase/functions/
 */

function is400(fn: () => unknown) {
  const err = assertThrows(fn, HttpError);
  assertEquals((err as HttpError).status, 400);
}

Deno.test("the sets match the SQL's own spellings", () => {
  assertEquals([...REPORTS], ["revenue", "suppliers", "destinations", "clients", "funnel", "pipeline"]);
  assertEquals([...PERIODS], ["ytd", "12mo", "qtd"]);
  assertEquals([...BASES], ["booked", "received"]);
});

Deno.test("report and period are one of the known values", () => {
  assertEquals(readReport("suppliers"), "suppliers");
  assertEquals(readPeriod("12mo"), "12mo");
  is400(() => readReport("payroll"));
  is400(() => readReport(undefined));
  is400(() => readPeriod("week"));
  is400(() => readPeriod(12));
});

Deno.test("basis is required for revenue and refused elsewhere", () => {
  assertEquals(readBasis("revenue", "received"), "received");
  is400(() => readBasis("revenue", undefined));
  is400(() => readBasis("revenue", "gross"));
  assertEquals(readBasis("suppliers", undefined), null);
  assertEquals(readBasis("destinations", null), null);
  is400(() => readBasis("suppliers", "booked"));
});

Deno.test("revenue: months as YYYY-MM, exact cents, and an empty prior is empty, not 0.00", () => {
  const csv = reportCsv("revenue", "booked", [
    { month_start: "2026-09-01", cents: "2032500", item_count: 2, prior_cents: null },
    { month_start: "2026-10-01", cents: "5", item_count: 1, prior_cents: "30000" },
  ]);
  assertEquals(
    csv,
    "Month,Booked value,Trips,Same month last year\r\n" +
      "2026-09,20325.00,2,\r\n" +
      "2026-10,0.05,1,300.00\r\n",
  );
  assertEquals(
    reportCsv("revenue", "received", []).split("\r\n")[0],
    "Month,Commission received,Commission payments,Same month last year",
  );
});

Deno.test("suppliers: a typed name that looks like a formula is neutralised", () => {
  const csv = reportCsv("suppliers", null, [
    { supplier_name: "=HYPERLINK(\"x\")", received_cents: "20000", owed_cents: "40000", line_count: 3, set_aside_count: 2, set_aside_received_cents: "1500" },
    { supplier_name: "Sandals, Resorts", received_cents: "0", owed_cents: "1", line_count: 1, set_aside_count: 0, set_aside_received_cents: "0" },
  ]);
  assertEquals(
    csv,
    "Supplier,Received,Still owed,Commission lines,Set aside (disputed or lost),Already received on set-aside lines\r\n" +
      "\"'=HYPERLINK(\"\"x\"\")\",200.00,400.00,3,2,15.00\r\n" +
      "\"Sandals, Resorts\",0.00,0.01,1,0,0.00\r\n",
  );
});

Deno.test("destinations: the no-stop row is labelled, never blank", () => {
  const csv = reportCsv("destinations", null, [
    { destination: "Nassau", trip_count: 2, value_cents: "116667" },
    { destination: null, trip_count: 2, value_cents: "30000" },
  ]);
  assertEquals(
    csv,
    "Destination,Trips,Value\r\nNassau,2,1166.67\r\nNo destination yet,2,300.00\r\n",
  );
});

Deno.test("a row of the wrong shape fails the file rather than writing a bad one", () => {
  assertThrows(() =>
    reportCsv("revenue", "booked", [{ month_start: "Oct", cents: "1", item_count: 1, prior_cents: null }])
  );
  assertThrows(() =>
    reportCsv("destinations", null, [{ destination: "X", trip_count: 1, value_cents: "1.5" }])
  );
  assertThrows(() =>
    reportCsv("suppliers", null, [
      { supplier_name: "X", received_cents: "1", owed_cents: "1", line_count: -1, set_aside_count: 0, set_aside_received_cents: "0" },
    ])
  );
});

Deno.test("the file name carries the report, basis and period", () => {
  assertEquals(
    reportFileName("revenue", "booked", "2026-01-01", "2026-10-21"),
    "revenue-booked-2026-01-01-to-2026-10-21.csv",
  );
  assertEquals(
    reportFileName("suppliers", null, "2026-10-01", "2026-10-21"),
    "suppliers-2026-10-01-to-2026-10-21.csv",
  );
  assertThrows(() => reportFileName("suppliers", null, "Oct 1", "2026-10-21"));
});

Deno.test("lifetime value takes no period; every other report needs one", () => {
  assertEquals(readReportPeriod("clients", undefined), null);
  is400(() => readReportPeriod("clients", "ytd"));
  assertEquals(readReportPeriod("funnel", "qtd"), "qtd");
  assertEquals(readReportPeriod("pipeline", undefined), null);
  is400(() => readReportPeriod("pipeline", "12mo"));
  is400(() => readReportPeriod("funnel", undefined));
});

Deno.test("clients: ranked, cohort as a quarter, and before-tracking said in words", () => {
  assertEquals(cohortLabel("2025-01-01"), "2025 Q1");
  assertEquals(cohortLabel("2026-10-01"), "2026 Q4");
  assertEquals(cohortLabel(null), "Before tracking");
  assertThrows(() => cohortLabel("2025-02-01"));
  const csv = reportCsv("clients", null, [
    { display_name: "Bo Diddley", trip_count: 1, value_cents: "200000", commission_cents: "30000", cohort_start: null },
    { display_name: "Ada Lovelace", trip_count: 2, value_cents: "150000", commission_cents: "15000", cohort_start: "2025-01-01" },
  ]);
  assertEquals(
    csv,
    "Rank,Client,Trips,Lifetime value,Commission,Cohort\r\n" +
      "1,Bo Diddley,1,2000.00,300.00,Before tracking\r\n" +
      "2,Ada Lovelace,2,1500.00,150.00,2025 Q1\r\n",
  );
  assertEquals(reportFileName("clients", null, null, null, "2026-10-21"), "clients-lifetime-value-2026-10-21.csv");
});

Deno.test("funnel: four named stages, then days to book once", () => {
  const stage = (s: number, reached: number, open: number, cancelled: number) => ({
    stage: s, reached, open_here: open, cancelled_here: cancelled, book_days_avg: "7.0", book_days_n: 3,
  });
  const csv = reportCsv("funnel", null, [stage(1, 7, 1, 0), stage(2, 6, 1, 1), stage(3, 4, 2, 1), stage(4, 1, 0, 0)]);
  assertEquals(
    csv,
    "Stage,Reached,\"Stopped here, still open\",\"Stopped here, cancelled\"\r\n" +
      "Inquiry,7,1,0\r\nProposal,6,1,1\r\nBooked,4,2,1\r\nTraveled,1,0,0\r\n" +
      "\r\nAverage days from inquiry to booked,7.0\r\nTrips in that average,3\r\n",
  );
  assertThrows(() => reportCsv("funnel", null, [stage(5, 1, 0, 0)]));
  // jsonb sends 18.0 as the number 18; the file still says 18.0.
  const asNumber = reportCsv("funnel", null, [{ ...stage(1, 1, 0, 0), book_days_avg: 18 }]);
  assertEquals(asNumber.includes("Average days from inquiry to booked,18.0\r\n"), true);
  const none = reportCsv("funnel", null, [{ ...stage(1, 1, 1, 0), book_days_avg: null, book_days_n: 0 }]);
  assertEquals(none.includes("Average days from inquiry to booked,\r\nTrips in that average,0\r\n"), true);
});

Deno.test("pipeline: the stage table, a blank line, then the months, later and undated", () => {
  const csv = reportCsv("pipeline", null, [
    { kind: "stage", status: "inquiry", weight_pct: 25, trip_count: 3, gross_cents: "100005", weighted_cents: "25001" },
    { kind: "stage", status: "in_progress", weight_pct: 100, trip_count: 1, gross_cents: "11111", weighted_cents: "11111" },
    { kind: "past", month_start: null, trip_count: 1, weighted_cents: "77777" },
    { kind: "month", month_start: "2026-10-01", trip_count: 2, weighted_cents: "88888" },
    { kind: "later", month_start: null, trip_count: 1, weighted_cents: "15001" },
    { kind: "undated", month_start: null, trip_count: 0, weighted_cents: "0" },
  ]);
  assertEquals(
    csv,
    "Stage,Trips,Full value,Weight %,Weighted\r\n" +
      "Inquiry,3,1000.05,25,250.01\r\nTraveling,1,111.11,100,111.11\r\n" +
      "\r\nTravel month,Trips,Weighted\r\n" +
      "Start date passed,1,777.77\r\n2026-10,2,888.88\r\nLater,1,150.01\r\nNo travel dates yet,0,0.00\r\n",
  );
  assertThrows(() => reportCsv("pipeline", null, [
    { kind: "stage", status: "cancelled", weight_pct: 0, trip_count: 1, gross_cents: "1", weighted_cents: "0" },
  ]));
  assertEquals(reportFileName("pipeline", null, null, null, "2026-10-21"), "pipeline-2026-10-21.csv");
});
