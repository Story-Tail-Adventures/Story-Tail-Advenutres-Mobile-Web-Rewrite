import { assertEquals, assertThrows } from "jsr:@std/assert@^1";
import { HttpError } from "./problem.ts";
import {
  centsToDecimal,
  COMMISSION_STATUSES,
  CREATE_STATUSES,
  csvCell,
  type ExportRow,
  MAX_CLOSE_LINES,
  PAYMENT_STATUSES,
  readCloseLines,
  readDate,
  readLagDays,
  readLedgerFilters,
  readNotes,
  readRate,
  readReference,
  readStatus,
  readTerms,
  readWeights,
  requireCents,
  toCsv,
} from "./commission.ts";

/**
 * The `agent-commission` route's request checks and its CSV.
 *
 * Every case below would otherwise reach Postgres and come back as a bodyless 500 — or, for
 * the CSV, run as a formula on the advisor's own machine.
 *
 * Run: deno test --allow-env --config supabase/functions/deno.json supabase/functions/
 */

function is400(fn: () => unknown) {
  const err = assertThrows(fn, HttpError);
  assertEquals((err as HttpError).status, 400);
}

Deno.test("the status sets match commission_status, and new lines start unpaid", () => {
  assertEquals([...COMMISSION_STATUSES], ["expected", "invoiced", "received", "disputed", "lost"]);
  assertEquals([...CREATE_STATUSES], ["expected", "invoiced"]);
  assertEquals([...PAYMENT_STATUSES], ["received", "disputed"]);
  is400(() => readStatus("received", CREATE_STATUSES));
  is400(() => readStatus("lost", CREATE_STATUSES));
  assertEquals(readStatus("invoiced", CREATE_STATUSES), "invoiced");
});

Deno.test("terms are the enum, not prose", () => {
  assertEquals(readTerms("after_travel"), "after_travel");
  is400(() => readTerms("60 days after travel"));
});

Deno.test("a rate is 0 to 100, two decimals, and required", () => {
  assertEquals(readRate("12.5"), 12.5);
  assertEquals(readRate(12.505), 12.51);
  assertEquals(readRate(0), 0);
  assertEquals(readRate(100), 100);
  is400(() => readRate(""));
  is400(() => readRate(100.01));
  is400(() => readRate(-1));
  is400(() => readRate("twelve"));
});

Deno.test("loose inputs that Number() would accept are refused", () => {
  // Number(" ") is 0 and Number([5]) is 5 — neither is a rate anyone typed.
  is400(() => readRate(" "));
  is400(() => readRate([5]));
  is400(() => readLagDays(" "));
  is400(() => readLagDays([]));
});

Deno.test("a required amount refuses blank instead of reading it as $0", () => {
  is400(() => requireCents(undefined, "Gross"));
  is400(() => requireCents("", "Amount received"));
  assertEquals(requireCents(0, "Gross"), 0);
  assertEquals(requireCents("97040", "Gross"), 97040);
});

Deno.test("text Postgres would refuse is a 400, not a 500", () => {
  is400(() => readNotes("hello\u0000world"));
  is400(() => readReference("ITV-\uD800"));
});

Deno.test("payment days are a whole number, 0 to 365", () => {
  assertEquals(readLagDays(60), 60);
  assertEquals(readLagDays("0"), 0);
  is400(() => readLagDays(366));
  is400(() => readLagDays(30.5));
  is400(() => readLagDays(""));
  is400(() => readLagDays(null));
});

Deno.test("a blank reference or note is none, and long ones are refused", () => {
  assertEquals(readReference("  ITV-1  "), "ITV-1");
  assertEquals(readReference("   "), null);
  assertEquals(readNotes(""), null);
  is400(() => readReference("x".repeat(65)));
  is400(() => readNotes("x".repeat(4001)));
});

Deno.test("a date must exist, not just look like one", () => {
  assertEquals(readDate("2026-02-28", "Date"), "2026-02-28");
  is400(() => readDate("2026-02-31", "Date"));
  is400(() => readDate("0000-01-01", "Date"));
  is400(() => readDate("Feb 3", "Date"));
});

Deno.test("ledger filters: empty status list means all; ids and dates are checked", () => {
  assertEquals(readLedgerFilters({}).p_status, null);
  assertEquals(readLedgerFilters({ statuses: [] }).p_status, null);
  assertEquals(readLedgerFilters({ statuses: ["lost", "lost"] }).p_status, ["lost"]);
  is400(() => readLedgerFilters({ statuses: ["paid"] }));
  is400(() => readLedgerFilters({ supplierId: "sandals" }));
  is400(() => readLedgerFilters({ travelFrom: "2026-13-01" }));
});

Deno.test("cents become an exact decimal string, through no float", () => {
  assertEquals(centsToDecimal("0"), "0.00");
  assertEquals(centsToDecimal("5"), "0.05");
  assertEquals(centsToDecimal("97040"), "970.40");
  assertEquals(centsToDecimal("123456789012345678"), "1234567890123456.78");
  assertEquals(centsToDecimal("-2558"), "-25.58");
});

Deno.test("a cell that starts like a formula is neutralised; quoting follows RFC 4180", () => {
  assertEquals(csvCell("=HYPERLINK(\"http://x\")"), `"'=HYPERLINK(""http://x"")"`);
  assertEquals(csvCell("+1-555"), "'+1-555");
  assertEquals(csvCell("-Smith"), "'-Smith");
  assertEquals(csvCell("@sum"), "'@sum");
  assertEquals(csvCell("Hayes, Jordan"), `"Hayes, Jordan"`);
  assertEquals(csvCell("plain"), "plain");
  // A NUMBER cell is left alone: a negative amount must stay a number.
  assertEquals(csvCell("-25.58", false), "-25.58");
  assertEquals(csvCell(null), "");
});

Deno.test("the CSV has a header, exact cents, readable terms and CRLF lines", () => {
  const row: ExportRow = {
    trip_title: "=cmd",
    client_display_name: "Jordan Hayes",
    supplier_name: "Sandals Resorts",
    travel_start: "2026-12-17",
    travel_end: "2026-12-23",
    status: "received",
    gross_booking_cents: "1010300",
    commission_pct: 12,
    expected_commission_cents: "121236",
    processing_fee_cents: "1246",
    received_commission_cents: "119990",
    received_at: "2027-02-21",
    payment_terms: "after_travel",
    payment_lag_days: 60,
    inteletravel_reference: null,
    currency: "USD",
  };
  const csv = toCsv([row]);
  const lines = csv.split("\r\n");
  assertEquals(lines[0].startsWith("Trip,Client,Supplier,"), true);
  assertEquals(
    lines[1],
    "'=cmd,Jordan Hayes,Sandals Resorts,2026-12-17,2026-12-23,received,10103.00,12,1212.36,12.46,1199.90,2027-02-21,After travel,60,,USD",
  );
  assertEquals(csv.endsWith("\r\n"), true);
});

Deno.test("an unknown payment-terms value fails the export rather than reading as After travel", () => {
  assertThrows(() => toCsv([{
    trip_title: "x", client_display_name: "y", supplier_name: "z", travel_start: null,
    travel_end: null, status: "expected", gross_booking_cents: "0", commission_pct: 0,
    expected_commission_cents: "0", processing_fee_cents: "0", received_commission_cents: "0",
    received_at: null, payment_terms: "on_departure", payment_lag_days: 0,
    inteletravel_reference: null, currency: "USD",
  }]));
});

Deno.test("readWeights: exactly the four open stages, whole numbers 0 to 100", () => {
  const ok = { inquiry: 20, proposal: 50, booked: 100, in_progress: 100 };
  assertEquals(readWeights(ok), ok);
  assertEquals(readWeights({ ...ok, inquiry: 0 }).inquiry, 0);
  assertThrows(() => readWeights({ ...ok, proposal: 101 }), HttpError);
  assertThrows(() => readWeights({ ...ok, proposal: 50.5 }), HttpError);
  assertThrows(() => readWeights({ ...ok, proposal: "50" }), HttpError);
  assertThrows(() => readWeights({ inquiry: 20, proposal: 50, booked: 100 }), HttpError);
  assertThrows(() => readWeights({ ...ok, completed: 100 }), HttpError);
  assertThrows(() => readWeights([20, 50, 100, 100]), HttpError);
});

Deno.test("readCloseLines: absent is none; each line an id and the version the dialog showed", () => {
  const a = "0195a2c0-1a00-7000-8000-000000000201";
  const b = "0195a2c0-1a00-7000-8000-000000000202";
  assertEquals(readCloseLines(undefined), []);
  assertEquals(readCloseLines(null), []);
  assertEquals(readCloseLines([]), []);
  assertEquals(readCloseLines([{ id: a, version: 1 }, { id: b, version: 3 }]), [
    { id: a, version: 1 },
    { id: b, version: 3 },
  ]);
  assertThrows(() => readCloseLines({ id: a, version: 1 }), HttpError);
  assertThrows(() => readCloseLines([{ id: "not-a-line", version: 1 }]), HttpError);
  assertThrows(() => readCloseLines([{ id: a }]), HttpError);
  assertThrows(() => readCloseLines([{ id: a, version: 0 }]), HttpError);
  assertThrows(() => readCloseLines([{ id: a, version: 1.5 }]), HttpError);
  assertThrows(() => readCloseLines([{ id: a, version: "1" }]), HttpError);
  assertThrows(() => readCloseLines([null]), HttpError);
  // The same line twice, even in another case, is a request nobody's dialog sends.
  assertThrows(() => readCloseLines([{ id: a, version: 1 }, { id: a.toUpperCase(), version: 1 }]), HttpError);
  const tooMany = Array.from({ length: MAX_CLOSE_LINES + 1 }, (_, i) => ({
    id: `0195a2c0-1a00-7000-8000-${String(i).padStart(12, "0")}`,
    version: 1,
  }));
  assertThrows(() => readCloseLines(tooMany), HttpError);
  assertEquals(readCloseLines(tooMany.slice(0, MAX_CLOSE_LINES)).length, MAX_CLOSE_LINES);
});
