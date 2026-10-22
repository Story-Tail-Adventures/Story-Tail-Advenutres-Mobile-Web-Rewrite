import { assertEquals, assertStringIncludes, assertThrows } from "jsr:@std/assert@^1";
import { HttpError } from "./problem.ts";
import { MAX_MESSAGE_BODY } from "./message.ts";
import {
  MAX_TAGS,
  readCategory,
  readTags,
  readTemplateBody,
  readTemplateName,
  refuseUnfilledFields,
  unfilledFields,
  unknownTokens,
} from "./messageTemplate.ts";

/** The sentence a 400 carries: HttpError keeps it in `detail`, its message is the title. */
function detailOf(fn: () => unknown): string {
  const err = assertThrows(fn, HttpError);
  return err.detail ?? "";
}

Deno.test("unknownTokens: names each unknown inside once, ignores the known ones", () => {
  assertEquals(unknownTokens("Hi {{client.firstName}}, {{ trip.dates }}"), []);
  assertEquals(unknownTokens("{{client.firstname}} {{trip.when}} {{client.firstname}}"), [
    "client.firstname",
    "trip.when",
  ]);
  assertEquals(unknownTokens("a {single} brace and {{ }}"), [""]);
});

Deno.test("refuseUnfilledFields: only known fields count", () => {
  refuseUnfilledFields("All filled in, Maya.");
  refuseUnfilledFields("A client's own {{braces}} are not a field");
  assertEquals(unfilledFields("{{trip.dates}} and {{ trip.dates }} and {{payment.amount}}"), [
    "trip.dates",
    "payment.amount",
  ]);
  assertStringIncludes(detailOf(() => refuseUnfilledFields("See you {{trip.dates}}")), "Fill in {{trip.dates}}");
});

Deno.test("readTemplateBody: keeps its shape, under one message, known fields only", () => {
  assertEquals(readTemplateBody("Hi {{client.firstName}},\n\n"), "Hi {{client.firstName}},\n\n");
  assertEquals(readTemplateBody("x".repeat(MAX_MESSAGE_BODY)).length, MAX_MESSAGE_BODY);
  assertThrows(() => readTemplateBody("x".repeat(MAX_MESSAGE_BODY + 1)), HttpError);
  assertThrows(() => readTemplateBody("   "), HttpError);
  assertThrows(() => readTemplateBody(null), HttpError);
  assertStringIncludes(detailOf(() => readTemplateBody("Hi {{client.firstname}}")), "{{client.firstname}} isn't a merge field");
});

Deno.test("readTemplateName and readCategory", () => {
  assertEquals(readTemplateName("  Lead response "), "Lead response");
  assertEquals(readTemplateName("n".repeat(80)).length, 80);
  assertThrows(() => readTemplateName("n".repeat(81)), HttpError);
  assertThrows(() => readTemplateName(" "), HttpError);
  assertEquals(readCategory("payment_reminder"), "payment_reminder");
  assertThrows(() => readCategory("newsletter"), HttpError);
});

Deno.test("readTags: trimmed, no blanks or repeats, first spelling kept, limits", () => {
  assertEquals(readTags(undefined), []);
  assertEquals(readTags(["Beach", " beach ", "", "Honeymoon"]), ["Beach", "Honeymoon"]);
  assertThrows(() => readTags(Array.from({ length: MAX_TAGS + 1 }, (_, i) => `t${i}`)), HttpError);
  assertThrows(() => readTags(["x".repeat(31)]), HttpError);
  assertThrows(() => readTags("Beach"), HttpError);
});
