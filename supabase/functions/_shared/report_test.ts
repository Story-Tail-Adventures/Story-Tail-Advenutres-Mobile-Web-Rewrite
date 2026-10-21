import { assertEquals, assertThrows } from "jsr:@std/assert@^1";
import { HttpError } from "./problem.ts";
import {
  BASES,
  PERIODS,
  readBasis,
  readPeriod,
  readReport,
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
  assertEquals([...REPORTS], ["revenue", "suppliers", "destinations"]);
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
