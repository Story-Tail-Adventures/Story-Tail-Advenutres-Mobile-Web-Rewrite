/**
 * Tests for §3.8's lead rules (`_shared/lead.ts`).
 *
 * The failures worth pinning: a card number getting into a lead at all, a bot that the two
 * store-nothing checks let through, a malformed "what they were viewing" stopping a real
 * person, and a direct caller choosing its own address for the per-address limit.
 */
import { assert, assertEquals, assertThrows } from "jsr:@std/assert@^1";
import { luhnValid } from "./cardDigits.ts";
import {
  CARD_NUMBER_REFUSAL,
  clientAddress,
  looksAutomated,
  MIN_FILL_MS,
  parseClose,
  parseLeadForm,
  parseManualLead,
  requireLeadOp,
  sameSecret,
} from "./lead.ts";
import { HttpError } from "./problem.ts";

/**
 * Card numbers are BUILT AT RUNTIME, as in cardDigits_test.ts: the repo's guard refuses any
 * Luhn-valid literal in source, tests included.
 */
function withCheckDigit(body: string): string {
  for (let d = 0; d <= 9; d++) {
    if (luhnValid(body + d)) return body + d;
  }
  throw new Error("unreachable");
}
// Written with spaces, the way a person types one.
const CARD = withCheckDigit("4" + "1".repeat(14)).replace(/(\d{4})(?=\d)/g, "$1 ");

const form = () => ({
  firstName: "  Dana ",
  lastName: "Reyes",
  email: "dana@example.com",
  phone: "(555) 010-0100",
  message: "Thinking about a honeymoon in June.\nTwo of us.",
  page: "topic",
  about: { kind: "topic", slug: "honeymoons", label: "a honeymoon" },
  utm: { source: "instagram", medium: "social", campaign: "fall" },
  website: "",
  startedAt: 0,
});

function refusedWith(fn: () => unknown, text: string | RegExp) {
  const err = assertThrows(fn, HttpError);
  assertEquals(err.status, 400);
  const detail = err.detail ?? "";
  if (typeof text === "string") assertEquals(detail, text);
  else assert(text.test(detail), detail);
}

Deno.test("the form's fields are trimmed and kept", () => {
  const f = parseLeadForm(form());
  assertEquals(f.firstName, "Dana");
  assertEquals(f.lastName, "Reyes");
  assertEquals(f.email, "dana@example.com");
  assertEquals(f.message, "Thinking about a honeymoon in June.\nTwo of us.");
  assertEquals(f.page, "topic");
  assertEquals([f.aboutKind, f.aboutSlug, f.aboutLabel], ["topic", "honeymoons", "a honeymoon"]);
  assertEquals([f.utmSource, f.utmMedium, f.utmCampaign], ["instagram", "social", "fall"]);
});

Deno.test("first name, email and a message are required", () => {
  refusedWith(() => parseLeadForm({ ...form(), firstName: "  " }), /first name/);
  refusedWith(() => parseLeadForm({ ...form(), email: "not-an-email" }), /email/);
  refusedWith(() => parseLeadForm({ ...form(), message: " \n " }), /few words/);
  refusedWith(() => parseLeadForm({ ...form(), message: "x".repeat(2001) }), /too long/);
  assertEquals(parseLeadForm({ ...form(), message: "x".repeat(2000) }).message.length, 2000);
});

Deno.test("a card number is refused, in a message, an Add lead note or a close note", () => {
  refusedWith(() => parseLeadForm({ ...form(), message: `My card is ${CARD}` }), CARD_NUMBER_REFUSAL);
  refusedWith(() => parseManualLead({ ...form(), source: "phone", message: `card ${CARD}` }), CARD_NUMBER_REFUSAL);
  refusedWith(() => parseClose({ reason: "other", note: `left ${CARD}` }), CARD_NUMBER_REFUSAL);
  // A phone number, a date and a confirmation code are not card numbers.
  assertEquals(parseLeadForm({ ...form(), message: "Call 555-010-0100 after 6/14. Ref SRB-220119." }).page, "topic");
});

Deno.test("a malformed 'what they were viewing' is dropped, never a refusal", () => {
  const f = parseLeadForm({ ...form(), about: { kind: "trip", slug: "../../etc", label: "x" }, page: "nowhere" });
  assertEquals([f.aboutKind, f.aboutSlug, f.aboutLabel, f.page], [null, null, null, null]);
  const g = parseLeadForm({ ...form(), utm: { source: "x".repeat(101) } });
  assertEquals(g.utmSource, null);
});

Deno.test("control characters and line breaks never reach a one-line field", () => {
  const f = parseLeadForm({ ...form(), firstName: "Da\u0000na\r\nX", lastName: "\t" });
  assertEquals(f.firstName, "Dana X");
  assertEquals(f.lastName, null);
});

Deno.test("the hidden field and the clock catch a bot; a person passes", () => {
  const now = 1_000_000;
  assertEquals(looksAutomated({ ...form(), startedAt: now - MIN_FILL_MS - 1 }, now), false);
  assertEquals(looksAutomated({ ...form(), startedAt: now - 500 }, now), true);
  assertEquals(looksAutomated({ ...form(), website: "http://spam", startedAt: 0 }, now), true);
  assertEquals(looksAutomated({ ...form(), website: 1, startedAt: 0 }, now), true);
  refusedWith(() => looksAutomated({ ...form(), startedAt: "soon" }, now), /startedAt/);
});

Deno.test("Add lead takes one of five sources, never 'website'", () => {
  const m = parseManualLead({ ...form(), source: "referral" });
  assertEquals(m.source, "referral");
  refusedWith(() => parseManualLead({ ...form(), source: "website" }), /source must be/);
});

Deno.test("a close needs a listed reason; the note is optional", () => {
  assertEquals(parseClose({ reason: "no_reply" }), { reason: "no_reply", note: null });
  assertEquals(parseClose({ reason: "other", note: "  booked direct  " }).note, "booked direct");
  refusedWith(() => parseClose({ reason: "rude" }), /reason must be/);
  refusedWith(() => parseClose({ reason: "other", note: "x".repeat(501) }), /too long/);
});

Deno.test("ops", () => {
  assertEquals(requireLeadOp("create"), "create");
  assertEquals(requireLeadOp("delete_spam"), "delete_spam");
  refusedWith(() => requireLeadOp("shred"), /op must be/);
});

Deno.test("the forwarded visitor address counts only with the right key", () => {
  const h = new Headers({
    "x-sta-form-key": "k-123",
    "x-sta-client-ip": "203.0.113.9",
    "cf-connecting-ip": "198.51.100.1",
    "x-forwarded-for": "192.0.2.7, 10.0.0.1",
  });
  assertEquals(clientAddress(h, "k-123"), "203.0.113.9");
  assertEquals(clientAddress(h, "other"), "198.51.100.1");
  assertEquals(clientAddress(h, null), "198.51.100.1");
  h.delete("cf-connecting-ip");
  assertEquals(clientAddress(h, null), "192.0.2.7");
  // x-real-ip is the local gateway's own address, never the visitor's.
  assertEquals(clientAddress(new Headers({ "x-real-ip": "172.18.0.1", "x-forwarded-for": "192.0.2.7" }), null), "192.0.2.7");
  assertEquals(clientAddress(new Headers(), null), null);
  assert(sameSecret("abc", "abc"));
  assert(!sameSecret("abc", "abcd"));
});
