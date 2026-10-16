import { assert, assertEquals, assertThrows } from "jsr:@std/assert@^1";
import { HttpError } from "./problem.ts";
import {
  hasCardNumber,
  isNamedHost,
  luhnValid,
  MAX_PAY_URL,
  readPaidNote,
  readPaidOn,
  readPaidReference,
  readPayUrl,
} from "./payLink.ts";

/**
 * Card numbers are BUILT AT RUNTIME: the repo's guard refuses any Luhn-valid literal in
 * source, tests included. `withCheckDigit` appends the digit that makes a body Luhn-valid,
 * found by trying all ten, which only needs `luhnValid` to be right (tested below against
 * the textbook example first).
 */
function withCheckDigit(body: string): string {
  for (let d = 0; d <= 9; d++) {
    if (luhnValid(body + d)) return body + d;
  }
  throw new Error("unreachable");
}

function wrongCheckDigit(body: string): string {
  const good = Number(withCheckDigit(body).slice(-1));
  return body + ((good + 1) % 10);
}

const card16 = () => withCheckDigit("4" + "1".repeat(14));
const grouped = (digits: string) => digits.replace(/(\d{4})(?=\d)/g, "$1 ");

Deno.test("luhn: the textbook example", () => {
  assert(luhnValid("79927398713"));
  assert(!luhnValid("79927398710"));
});

Deno.test("hasCardNumber: a Luhn-valid run, solid or grouped", () => {
  assert(hasCardNumber(card16()));
  assert(hasCardNumber(`paid with ${grouped(card16())} today`));
  assert(hasCardNumber(card16().replace(/(\d{4})(?=\d)/g, "$1-")));
  assert(hasCardNumber(card16().replace(/(\d{4})(?=\d)/g, "$1 ")));
});

Deno.test("hasCardNumber: references that are not card numbers pass", () => {
  assert(!hasCardNumber("SRB-220119-FINAL"));
  assert(!hasCardNumber(wrongCheckDigit("4" + "1".repeat(14))), "fails Luhn");
  assert(!hasCardNumber("123456789012"), "12 digits is too short");
  assert(!hasCardNumber(""));
});

Deno.test("hasCardNumber: what one greedy match used to miss", () => {
  const pan = card16();
  assert(hasCardNumber(`Paid 12 ${pan}`), "a short number in front");
  assert(hasCardNumber(`ref${pan}`), "letters touching the front");
  assert(hasCardNumber(`x_${pan}x`), "an underscore and a trailing letter");
  assert(hasCardNumber(`https://a.com/pay?x=ref${pan}`), "inside a query value");
  assert(hasCardNumber(pan.replace(/(\d{4})(?=\d)/g, "$1  ")), "double spaces");
  assert(hasCardNumber(pan.replace(/(\d{4})(?=\d)/g, "$1 - ")), "a spaced dash");
  assert(!hasCardNumber("Invoice 2026 10 16 booking 4471"), "short numbers pass");
});

Deno.test("isNamedHost: only a dotted name", () => {
  assert(isNamedHost("sandals.com"));
  assert(isNamedHost("xn--sndals-3nf.com"));
  assert(!isNamedHost("203.0.113.9"));
  assert(!isNamedHost("[::1]"));
  assert(!isNamedHost("intranet"));
  assert(!isNamedHost("pay.localhost"));
});

Deno.test("readPayUrl: null, undefined and blank remove the link", () => {
  assertEquals(readPayUrl(null), null);
  assertEquals(readPayUrl(undefined), null);
  assertEquals(readPayUrl("   "), null);
});

Deno.test("readPayUrl: stores the parsed href", () => {
  assertEquals(
    readPayUrl("  https://WWW.Sandals.com/pay/SRB-220119  "),
    "https://www.sandals.com/pay/SRB-220119",
  );
  assertEquals(readPayUrl("https://travefy.com"), "https://travefy.com/");
  // A look-alike host (a Cyrillic "а" in place of the Latin "a") is stored in its ASCII
  // punycode form, which is what the client is shown, so it cannot pass as sandals.com.
  const lookalike = readPayUrl("https://sand\u0430ls.com/pay") ?? "";
  assert(
    lookalike.startsWith("https://xn--") && lookalike.endsWith(".com/pay"),
    lookalike,
  );
  assert(/^[\x20-\x7e]+$/.test(lookalike), "stored as plain ASCII");
});

Deno.test("readPayUrl: refuses anything but a clean https link", () => {
  for (
    const bad of [
      "http://www.sandals.com/pay",
      "javascript:alert(1)",
      "ftp://sandals.com/x",
      "sandals.com/pay",
      "https://jordan:secret@sandals.com/pay",
      "https://jordan@sandals.com/pay",
      "not a link",
      42,
    ]
  ) {
    assertThrows(() => readPayUrl(bad), HttpError, undefined, String(bad));
  }
});

Deno.test("readPayUrl: length is checked on what would be stored", () => {
  const base = "https://sandals.com/";
  assertEquals(
    readPayUrl(base + "a".repeat(MAX_PAY_URL - base.length))?.length,
    MAX_PAY_URL,
  );
  assertThrows(
    () => readPayUrl(base + "a".repeat(MAX_PAY_URL - base.length + 1)),
    HttpError,
  );
});

Deno.test("readPayUrl: refuses a card number anywhere in the link", () => {
  assertThrows(() => readPayUrl(`https://pay.example.com/c/${card16()}`), HttpError);
  assertThrows(() => readPayUrl(`https://pay.example.com/?card=${card16()}`), HttpError);
  // A long booking number that is not a card number is fine.
  const notCard = wrongCheckDigit("4" + "1".repeat(14));
  assertEquals(
    readPayUrl(`https://pay.example.com/b/${notCard}`),
    `https://pay.example.com/b/${notCard}`,
  );
});

Deno.test("readPaidReference / readPaidNote: absent keeps, blank clears, trimmed", () => {
  assertEquals(readPaidReference(undefined), null);
  assertEquals(readPaidReference(null), null);
  assertEquals(readPaidReference("   "), "");
  assertEquals(readPaidReference("  SRB-220119-FINAL "), "SRB-220119-FINAL");
  assertEquals(readPaidNote(" Paid on sandals.com. "), "Paid on sandals.com.");
});

Deno.test("readPaidReference / readPaidNote: length and card numbers", () => {
  assertEquals(readPaidReference("R".repeat(100))?.length, 100);
  assertThrows(() => readPaidReference("R".repeat(101)), HttpError);
  assertEquals(readPaidNote("n".repeat(1000))?.length, 1000);
  assertThrows(() => readPaidNote("n".repeat(1001)), HttpError);
  assertThrows(() => readPaidReference(grouped(card16())), HttpError);
  assertThrows(() => readPaidNote(`Jordan paid with ${card16()}`), HttpError);
  assertThrows(() => readPaidReference(12345), HttpError);
});

Deno.test("readPaidOn: a real date, not in the future", () => {
  const now = new Date("2026-10-16T15:00:00Z");
  assertEquals(readPaidOn(undefined, now), null);
  assertEquals(readPaidOn("", now), null);
  assertEquals(readPaidOn("2026-10-14", now), "2026-10-14");
  assertEquals(
    readPaidOn("2026-10-17", now),
    "2026-10-17",
    "tomorrow in UTC: the SQL decides",
  );
  assertThrows(() => readPaidOn("2026-10-18", now), HttpError);
  assertThrows(() => readPaidOn("2026-02-30", now), HttpError);
  assertThrows(() => readPaidOn("10/14/2026", now), HttpError);
});
