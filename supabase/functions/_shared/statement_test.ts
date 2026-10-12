import { assertEquals, assertThrows } from "jsr:@std/assert@^1";
import { HttpError } from "./problem.ts";
import {
  decodeStatement,
  guessColumnMap,
  MAX_ROWS,
  normalizeHeader,
  parseAmountCents,
  parseCsv,
  parseDate,
  parseRows,
  readColumnMap,
  readFileBase64,
  readFilename,
  readStatementFile,
  toHex,
} from "./statement.ts";

/**
 * The `commission-import` route's file handling. Every case here is either a statement that
 * would otherwise be read as the wrong money (a comma in the wrong place, a negative, a date
 * that rolls into the next month) or one that would reach Postgres as a 500.
 *
 * Run: deno test --allow-env --config supabase/functions/deno.json supabase/functions/
 */

const enc = (s: string) => new TextEncoder().encode(s);

Deno.test("parseCsv: quotes, doubled quotes, commas and line breaks inside a cell", () => {
  assertEquals(
    parseCsv('a,"b, c","say ""hi""","two\nlines"\r\n1,2,3,4'),
    [["a", "b, c", 'say "hi"', "two\nlines"], ["1", "2", "3", "4"]],
  );
});

Deno.test("parseCsv: CRLF, LF and lone CR all end a row; a trailing newline adds none", () => {
  assertEquals(parseCsv("a,b\r\n1,2\n3,4\r5,6\n"), [["a", "b"], ["1", "2"], ["3", "4"], ["5", "6"]]);
});

Deno.test("parseCsv: empty cells are kept, so columns stay where they are", () => {
  assertEquals(parseCsv("a,,c\n,,"), [["a", "", "c"], ["", "", ""]]);
});

Deno.test("parseCsv: a quote that never closes is an error naming its line", () => {
  const err = assertThrows(() => parseCsv('a,b\n1,"open\n2,3'), HttpError);
  assertEquals(err.detail?.includes("Line 2"), true);
});

Deno.test("decodeStatement: UTF-8 with a BOM, and Windows-1252 from Excel, both read Peña", () => {
  assertEquals(decodeStatement(new Uint8Array([0xef, 0xbb, 0xbf, ...enc("Peña")])), "Peña");
  // "Peña" in Windows-1252: ñ is the single byte 0xF1, which is not valid UTF-8.
  assertEquals(decodeStatement(new Uint8Array([0x50, 0x65, 0xf1, 0x61])), "Peña");
});

Deno.test("decodeStatement: an Excel workbook is named, and binary is refused", () => {
  const xlsx = assertThrows(() => decodeStatement(new Uint8Array([0x50, 0x4b, 3, 4, 0, 0])), HttpError);
  assertEquals(xlsx.detail?.includes("Excel"), true);
  assertThrows(() => decodeStatement(new Uint8Array([0x61, 0x00, 0x62])), HttpError);
});

Deno.test("readStatementFile: blank lines dropped, rows padded, blank headers named", () => {
  const f = readStatementFile("Ref,,Paid\nA1,x\n\n,,\nA2,y,3.00,extra\n");
  assertEquals(f.headers, ["Ref", "Column 2", "Paid", "Column 4"]);
  assertEquals(f.rows, [["A1", "x", "", ""], ["A2", "y", "3.00", "extra"]]);
});

Deno.test("readStatementFile: a title line above the header is skipped, not taken for it", () => {
  const f = readStatementFile("Commission Statement\n\nRef,Paid\nA1,3.00\n");
  assertEquals(f.headers, ["Ref", "Paid"]);
  assertEquals(f.rows, [["A1", "3.00"]]);
});

Deno.test("readStatementFile: a long header is cut by character, never through an emoji", () => {
  const f = readStatementFile(`${"x".repeat(99)}😀😀,Paid\nA,1\n`);
  assertEquals(f.headers[0], `${"x".repeat(99)}😀`);
  assertEquals(f.headers[0].isWellFormed(), true);
});

Deno.test("readStatementFile: needs a header and a row; refuses more than the row cap", () => {
  assertThrows(() => readStatementFile("Ref,Paid\n"), HttpError);
  const big = "Ref,Paid\n" + Array.from({ length: MAX_ROWS + 1 }, (_, i) => `R${i},1`).join("\n");
  assertThrows(() => readStatementFile(big), HttpError);
  assertEquals(readStatementFile("Ref,Paid\n" + Array.from({ length: MAX_ROWS }, (_, i) => `R${i},1`).join("\n")).rows.length, MAX_ROWS);
});

Deno.test("normalizeHeader: punctuation, case and accents do not matter", () => {
  assertEquals(normalizeHeader(" Booking Ref # "), "bookingref");
  assertEquals(normalizeHeader("Réservation_No"), "reservationno");
});

Deno.test("guessColumnMap: the prototype's headers map as the prototype shows", () => {
  const headers = ["BookingRef", "SupplierName", "GrossAmt", "CommissionAmt", "StatementDate", "PaxName"];
  assertEquals(guessColumnMap(headers), {
    reference: 0, supplier: 1, gross: 2, received: 3, paid_on: 4, traveler: 5,
  });
});

Deno.test("guessColumnMap: a net-paid column is what arrived, not the gross commission", () => {
  const map = guessColumnMap(["Commission", "Net Paid", "Host Fee"]);
  assertEquals(map.received, 1);
  assertEquals(map.fee, 2);
});

Deno.test("guessColumnMap: a travel or booking DATE is never taken for the paid-on date or the reference", () => {
  const map = guessColumnMap(["Booking Date", "Travel Date", "Commission"]);
  assertEquals(map.paid_on, undefined);
  assertEquals(map.reference, undefined);
});

Deno.test("guessColumnMap: last month's map wins, by header name, even when columns move", () => {
  const previous = { headers: ["Res #", "Amount", "When"], columnMap: { reference: 0, received: 1, paid_on: 2 } };
  assertEquals(guessColumnMap(["When", "Res #", "Amount", "Who"], previous), {
    reference: 1, received: 2, paid_on: 0,
  });
});

Deno.test("readColumnMap: known fields, real columns, no column twice, and a commission column", () => {
  assertEquals(readColumnMap({ reference: 0, received: 2, fee: null }, 3), { reference: 0, received: 2 });
  assertThrows(() => readColumnMap({ received: 3 }, 3), HttpError);
  assertThrows(() => readColumnMap({ received: 1, fee: 1 }, 3), HttpError);
  assertThrows(() => readColumnMap({ reference: 0 }, 3), HttpError);
  assertThrows(() => readColumnMap({ received: 0, payee: 1 }, 3), HttpError);
  assertThrows(() => readColumnMap({ received: 1.5 }, 3), HttpError);
  assertThrows(() => readColumnMap([1], 3), HttpError);
});

Deno.test("parseAmountCents: dollars to exact cents", () => {
  assertEquals(parseAmountCents("$1,234.56"), { cents: 123456 });
  assertEquals(parseAmountCents("1234.5"), { cents: 123450 });
  assertEquals(parseAmountCents("USD 80"), { cents: 8000 });
  assertEquals(parseAmountCents(".07"), { cents: 7 });
  assertEquals(parseAmountCents("  "), { cents: null });
  // 0.1 + 0.2 in a float is 0.30000000000000004; read from the digits it is 30 cents.
  assertEquals(parseAmountCents("0.30"), { cents: 30 });
});

Deno.test("parseAmountCents: commas must be thousands, and three decimals are not cents", () => {
  assertEquals("error" in parseAmountCents("12,34"), true);
  assertEquals("error" in parseAmountCents("1.234,56"), true);
  assertEquals("error" in parseAmountCents("12.345"), true);
  assertEquals("error" in parseAmountCents("abc"), true);
});

Deno.test("parseAmountCents: a wrongly mapped column is too large, not $90 trillion", () => {
  assertEquals(parseAmountCents("99,999,999.99"), { cents: 9_999_999_999 });
  assertEquals("error" in parseAmountCents("100000000.00"), true);
  assertEquals("error" in parseAmountCents("90071992547409"), true);
});

Deno.test("parseAmountCents: a fee shown as a deduction is the amount kept", () => {
  assertEquals(parseAmountCents("(36.00)", { deduction: true }), { cents: 3600 });
  assertEquals(parseAmountCents("-36", { deduction: true }), { cents: 3600 });
});

Deno.test("parseAmountCents: a negative amount (a clawback) is refused by name, a negative zero is not", () => {
  const neg = parseAmountCents("(12.00)");
  assertEquals("error" in neg && neg.error.includes("negative"), true);
  assertEquals("error" in parseAmountCents("-5"), true);
  assertEquals("error" in parseAmountCents("$-5"), true);
  assertEquals(parseAmountCents("-0.00"), { cents: 0 });
});

Deno.test("parseDate: the formats a US statement writes", () => {
  assertEquals(parseDate("2026-04-15"), { date: "2026-04-15" });
  assertEquals(parseDate("4/15/2026"), { date: "2026-04-15" });
  assertEquals(parseDate("04/05/26"), { date: "2026-04-05" });
  assertEquals(parseDate("Apr 15, 2026"), { date: "2026-04-15" });
  assertEquals(parseDate("15-Apr-2026"), { date: "2026-04-15" });
  assertEquals(parseDate("4/15/2026 0:00"), { date: "2026-04-15" });
  assertEquals(parseDate("2026-04-15T00:00:00Z"), { date: "2026-04-15" });
  assertEquals(parseDate(""), { date: null });
});

Deno.test("parseDate: a date that does not exist is refused, not rolled forward", () => {
  assertEquals("error" in parseDate("2/30/2026"), true);
  assertEquals("error" in parseDate("13/1/2026"), true);
  assertEquals("error" in parseDate("Smarch 1, 2026"), true);
  assertEquals("error" in parseDate("1/1/1999"), true);
});

Deno.test("parseRows: each row read under the map, with the statement date standing in", () => {
  const rows = [
    ["ITV-1", "Sandals", "J Q", "4,800.00", "540.00", "36", "4/10/2026"],
    ["ITV-2", "Sandals", "", "", "$100", "", ""],
  ];
  const map = { reference: 0, supplier: 1, traveler: 2, gross: 3, received: 4, fee: 5, paid_on: 6 };
  assertEquals(parseRows(rows, map, "2026-04-30"), [
    {
      reference: "ITV-1", supplier: "Sandals", traveler: "J Q", gross_cents: 480000,
      received_cents: 54000, fee_cents: 3600, paid_on: "2026-04-10", parse_error: null,
    },
    {
      reference: "ITV-2", supplier: "Sandals", traveler: null, gross_cents: null,
      received_cents: 10000, fee_cents: null, paid_on: "2026-04-30", parse_error: null,
    },
  ]);
});

Deno.test("parseRows: an unreadable row keeps its FIRST problem and is still returned", () => {
  const map = { reference: 0, received: 1, paid_on: 2 };
  const [bad, none, zero, date, nodate] = parseRows(
    [["A", "abc", "4/1/2026"], ["B", "", "4/1/2026"], ["C", "0", "4/1/2026"], ["D", "5", "4/31/2026"], ["E", "5", ""]],
    map,
    null,
  );
  assertEquals(bad.parse_error, '"abc" is not an amount.');
  assertEquals(bad.received_cents, null);
  assertEquals(none.parse_error, "No commission amount on this row.");
  assertEquals(zero.parse_error, "Nothing was paid on this row.");
  assertEquals(date.parse_error?.startsWith('"4/31/2026" is not a date'), true);
  assertEquals(date.paid_on, null);
  assertEquals(nodate.parse_error, "No paid-on date for this row.");
});

Deno.test("parseRows: a fee column in accounting style reads; a 65-character reference does not", () => {
  const [ok, long] = parseRows(
    [["ITV-1", "540.00", "(36.00)"], ["R".repeat(65), "1", ""]],
    { reference: 0, received: 1, fee: 2 },
    "2026-04-30",
  );
  assertEquals(ok.fee_cents, 3600);
  assertEquals(ok.parse_error, null);
  assertEquals(long.parse_error, "The booking reference is longer than 64 characters.");
});

Deno.test("readFileBase64 and readFilename: the cap is checked before decoding; paths are dropped", () => {
  assertEquals(readFileBase64(btoa("a,b\n1,2")), enc("a,b\n1,2"));
  assertThrows(() => readFileBase64("A".repeat(800_000)), HttpError);
  assertThrows(() => readFileBase64("%%%"), HttpError);
  assertThrows(() => readFileBase64(""), HttpError);
  assertEquals(readFilename("C:\\Users\\me\\april.csv"), "april.csv");
  assertEquals(readFilename("../../etc/passwd"), "passwd");
  assertThrows(() => readFilename("a\u0000b"), HttpError);
  assertThrows(() => readFilename("  "), HttpError);
});

Deno.test("toHex: bytes as PostgREST's bytea hex", () => {
  assertEquals(toHex(new Uint8Array([0, 15, 255])), "000fff");
});
