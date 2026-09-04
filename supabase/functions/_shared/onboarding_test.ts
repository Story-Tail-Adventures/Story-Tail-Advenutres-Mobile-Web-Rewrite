import { assertEquals, assertMatch, assertThrows } from "jsr:@std/assert@^1";
import { HttpError } from "./problem.ts";
import { optionalPhone } from "./onboarding.ts";

/**
 * The first Deno test in the repo, and it exists for one reason: `optionalPhone` is a
 * PARALLEL IMPLEMENTATION of `normalizePhone` in web/lib/validation/profile.ts, and a rule
 * written twice is a rule that will eventually be two rules.
 *
 * The vectors below are the same ones web/lib/validation/profile.test.ts asserts. When
 * either side changes, both files change — that is what the docstring on `optionalPhone`
 * means by "change both", and this is what makes it checkable rather than aspirational.
 *
 * Run: deno test --config supabase/functions/deno.json supabase/functions/
 */

function phone(value: string | null): string | null | undefined {
  return optionalPhone({ phone: value }, "phone");
}

/**
 * The `detail` of the 400 a call threw.
 *
 * `HttpError`'s `message` is its TITLE — "Bad Request" for every one of these — so matching
 * on the message would pass no matter which rule fired. The detail is the sentence a
 * traveler actually reads.
 */
function rejection(call: () => unknown): string {
  const error = assertThrows(call, HttpError);
  return (error as HttpError).detail ?? "";
}

Deno.test("the tri-state survives: absent, null and empty are all distinct", () => {
  assertEquals(optionalPhone({}, "phone"), undefined);
  assertEquals(phone(null), null);
  assertEquals(phone("   "), null);
});

Deno.test("normalises the formats people actually type", () => {
  const cases: [string, string][] = [
    ["+1 (305) 555-0184", "+13055550184"],
    ["(305) 555-0184", "+13055550184"],
    ["305.555.0184", "+13055550184"],
    ["1 305 555 0184", "+13055550184"],
    ["+44 20 7946 0958", "+442079460958"],
  ];
  for (const [input, expected] of cases) {
    assertEquals(phone(input), expected, input);
  }
});

Deno.test("refuses ten digits that cannot ring anywhere", () => {
  // A NANP area code and exchange code both begin 2-9. Guessing +1 at these would store a
  // well-formed number nobody could tell from a real one.
  for (const input of ["1234567890", "0234567890", "3050550184", "3051550184"]) {
    assertMatch(rejection(() => phone(input)), /does not look like a phone number/, input);
  }
});

Deno.test("asks for a country code rather than guessing at a foreign number", () => {
  assertMatch(rejection(() => phone("020 7946 0958")), /needs a country code/);
});

Deno.test("refuses what is not a phone number at all", () => {
  for (const input of ["not a phone", "+", "+1234", "+1234567890123456"]) {
    assertThrows(() => phone(input), HttpError, undefined, input);
  }
});

Deno.test("takes an explicit country code at its word", () => {
  // We guess only for North America; a +1 somebody typed is their claim to make.
  assertEquals(phone("+11234567890"), "+11234567890");
});

Deno.test("names the field it is complaining about", () => {
  // The nested emergency contact reuses the key `phone`, so the label is what tells a
  // traveler which of the two numbers on Screen 2.1.10 was rejected.
  assertMatch(
    rejection(() => optionalPhone({ phone: "abc" }, "phone", "The emergency contact's phone")),
    /^The emergency contact's phone /,
  );
});
