import { assert, assertEquals } from "jsr:@std/assert@^1";
import { findCardSpans, hasCardNumber, luhnValid, maskCardNumbers } from "./cardDigits.ts";

/**
 * Card numbers are BUILT AT RUNTIME: the repo's guard refuses any Luhn-valid literal in
 * source, tests included. `withCheckDigit` appends the digit that makes a body Luhn-valid.
 */
function withCheckDigit(body: string): string {
  for (let d = 0; d <= 9; d++) {
    if (luhnValid(body + d)) return body + d;
  }
  throw new Error("unreachable");
}

const pan = withCheckDigit("4" + "1".repeat(14));
const last4 = pan.slice(-4);
const joined = (sep: string) => pan.replace(/(\d{4})(?=\d)/g, `$1${sep}`);

Deno.test("mask: a short number in front cannot hide the card", () => {
  assertEquals(maskCardNumbers(`Paid 12 ${joined(" ")}`), `Paid 12 •••• ${last4}`);
  assertEquals(maskCardNumbers(`Paid 12 ${pan}`), `Paid 12 •••• ${last4}`);
});

Deno.test("mask: letters or an underscore touching the digits", () => {
  assertEquals(maskCardNumbers(`ref${pan}`), `ref•••• ${last4}`);
  assertEquals(maskCardNumbers(`x_${pan}x`), `x_•••• ${last4}x`);
  assertEquals(maskCardNumbers(`card:${joined("-")}.`), `card:•••• ${last4}.`);
});

Deno.test("mask: double spaces and a spaced dash", () => {
  assertEquals(maskCardNumbers(`a ${joined("  ")} b`), `a •••• ${last4} b`);
  assertEquals(maskCardNumbers(`a ${joined(" - ")} b`), `a •••• ${last4} b`);
  assertEquals(maskCardNumbers(`a ${joined(" ")} b`), `a •••• ${last4} b`, "thin spaces");
});

Deno.test("mask: fullwidth digits are left alone, without a crash", () => {
  const wide = [...pan].map((c) => String.fromCharCode(0xff10 + Number(c))).join("");
  assertEquals(maskCardNumbers(`card ${wide}`), `card ${wide}`);
  assert(!hasCardNumber(wide), "the guard and the masker agree");
});

Deno.test("mask: short and unrelated numbers stay", () => {
  const plain = "$7,845 due 10/29, call 312-555-0142, conf 8841207, Invoice 2026 10 16 booking 4471";
  assertEquals(maskCardNumbers(plain), plain);
  assertEquals(maskCardNumbers("123456789012"), "123456789012");
  // A long number that fails Luhn is a reference, not a card: the guard lets it through too.
  const notCard = pan.slice(0, -1) + ((Number(pan.slice(-1)) + 1) % 10);
  assertEquals(maskCardNumbers(`ref ${notCard}`), `ref ${notCard}`);
  assertEquals(maskCardNumbers(""), "");
});

Deno.test("mask: two cards in one message, both masked, text between kept", () => {
  assertEquals(maskCardNumbers(`${pan} or ${joined(" ")}?`), `•••• ${last4} or •••• ${last4}?`);
});

Deno.test("mask and guard read the same spans", () => {
  for (const text of [`Paid 12 ${pan}`, `ref${pan}`, joined("  "), "Invoice 2026 10 16 booking 4471"]) {
    assertEquals(hasCardNumber(text), findCardSpans(text).length > 0);
    assertEquals(hasCardNumber(text), maskCardNumbers(text) !== text);
  }
});
