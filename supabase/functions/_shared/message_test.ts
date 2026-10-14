import { assertEquals, assertThrows } from "jsr:@std/assert@^1";
import { HttpError } from "./problem.ts";
import {
  MAX_ARCHIVE,
  MAX_MESSAGE_BODY,
  readConversationIds,
  readInternalNote,
  readMessageBody,
  readMessageId,
  readSeenUpTo,
  readThreadAddress,
} from "./message.ts";
import { uuidV7 } from "./uuid.ts";

const A = "0195a2c0-1a00-7000-8000-0000000000b0";
const C = "0195a2c0-1a00-7000-8000-000000000101";
const T = "0195a2c0-1a00-7000-8000-000000000040";

Deno.test("readMessageBody: trimmed, not empty, under the ceiling", () => {
  assertEquals(readMessageBody("  hello  "), "hello");
  assertEquals(readMessageBody("x".repeat(MAX_MESSAGE_BODY)).length, MAX_MESSAGE_BODY);
  assertThrows(() => readMessageBody("   "), HttpError);
  assertThrows(() => readMessageBody(undefined), HttpError);
  assertThrows(() => readMessageBody(42), HttpError);
  assertThrows(() => readMessageBody("x".repeat(MAX_MESSAGE_BODY + 1)), HttpError);
});

Deno.test("readThreadAddress: a thread, or a client with an optional trip, never both", () => {
  assertEquals(readThreadAddress({ conversationId: A }), { kind: "thread", conversationId: A });
  assertEquals(readThreadAddress({ clientId: C }), { kind: "client", clientId: C, tripId: null });
  assertEquals(readThreadAddress({ clientId: C, tripId: T }), { kind: "client", clientId: C, tripId: T });
  assertEquals(readThreadAddress({ conversationId: A, clientId: null, tripId: null }).kind, "thread");
  assertThrows(() => readThreadAddress({ conversationId: A, clientId: C }), HttpError);
  assertThrows(() => readThreadAddress({ conversationId: A, tripId: T }), HttpError);
  assertThrows(() => readThreadAddress({}), HttpError);
  assertThrows(() => readThreadAddress({ conversationId: "nope" }), HttpError);
  assertThrows(() => readThreadAddress({ clientId: C, tripId: "nope" }), HttpError);
});

Deno.test("readMessageId: required, a recent v7", () => {
  const fresh = uuidV7();
  assertEquals(readMessageId(fresh), fresh);
  assertThrows(() => readMessageId(undefined), HttpError);
  assertThrows(() => readMessageId(null), HttpError);
  assertThrows(() => readMessageId(A), HttpError); // v7, but from 2025
  assertThrows(() => readMessageId(crypto.randomUUID()), HttpError); // v4
  assertThrows(() => readMessageId(7), HttpError);
});

Deno.test("readInternalNote: a boolean, never defaulted", () => {
  assertEquals(readInternalNote(true), true);
  assertEquals(readInternalNote(false), false);
  // Missing is NOT "public": that default is how a private note would reach the client.
  assertThrows(() => readInternalNote(undefined), HttpError);
  assertThrows(() => readInternalNote(null), HttpError);
  assertThrows(() => readInternalNote("true"), HttpError);
  assertThrows(() => readInternalNote(1), HttpError);
});

Deno.test("readSeenUpTo: PostgREST's timestamp, kept as text to the microsecond", () => {
  const pg = "2026-10-13T14:02:11.123456+00:00";
  assertEquals(readSeenUpTo(pg, true), pg);
  assertEquals(readSeenUpTo("2026-10-13T14:02:11Z", true), "2026-10-13T14:02:11Z");
  assertEquals(readSeenUpTo("2026-10-13 14:02:11.5+00", false), "2026-10-13 14:02:11.5+00");
  assertEquals(readSeenUpTo(undefined, false), null);
  assertEquals(readSeenUpTo(null, false), null);
  assertThrows(() => readSeenUpTo(undefined, true), HttpError);
  assertThrows(() => readSeenUpTo("yesterday", false), HttpError);
  assertThrows(() => readSeenUpTo("2026-10-13T14:02:11", false), HttpError); // no zone
  assertThrows(() => readSeenUpTo("2026-13-45T14:02:11Z", false), HttpError);
  assertThrows(() => readSeenUpTo(1760364131000, false), HttpError);
});

Deno.test("readConversationIds: at least one, at most the cap, repeats folded", () => {
  assertEquals(readConversationIds([A, A.toUpperCase()]), [A]);
  assertThrows(() => readConversationIds([]), HttpError);
  assertThrows(() => readConversationIds(A), HttpError);
  assertThrows(() => readConversationIds(["nope"]), HttpError);
  const tooMany = Array.from({ length: MAX_ARCHIVE + 1 }, () => uuidV7());
  assertThrows(() => readConversationIds(tooMany), HttpError);
});
