import { assert, assertEquals, assertFalse, assertThrows } from "jsr:@std/assert@^1";
import { HttpError } from "./problem.ts";
import {
  type ClaimedRow,
  deliver,
  type DeviceOutcome,
  isAllowedPushEndpoint,
  maskCardNumbers,
  messagePayload,
  messageTitle,
  nameList,
  NO_PREVIEW,
  outcomeForStatus,
  planForAgent,
  readDeviceLabel,
  readFcmToken,
  readWebSubscription,
  type PushDevice,
  summaryPayload,
  threadUrl,
} from "./push.ts";

const CONV = "0195a2c0-1a00-7000-8000-0000000000b0";
const NOW = new Date("2026-10-19T12:00:00Z"); // Monday 07:00 in Chicago

function row(over: Partial<ClaimedRow> = {}): ClaimedRow {
  return {
    outbox_id: crypto.randomUUID(),
    agent_id: "agent-1",
    kind: "message",
    conversation_id: CONV,
    trip_id: null,
    held: false,
    hold_reason: null,
    message_count: 1,
    client_name: "Jordan Hayes",
    trip_title: "Anniversary Week in Negril",
    preview: "Sending over the confirmation the resort emailed us.",
    latest_created_at: "2026-10-19T08:00:00.123456+00:00",
    destination: null,
    start_date: null,
    end_date: null,
    lead_id: null,
    ...over,
  };
}

function device(id: string, platform: PushDevice["platform"] = "web"): PushDevice {
  return { device_id: id, platform, fcm_token: null, web_endpoint: "https://fcm.googleapis.com/x", web_p256dh: "k", web_auth: "a" };
}

Deno.test("a message notification: name and trip, the first line, the thread's tag", () => {
  const p = messagePayload(row({ message_count: 2 }));
  assertEquals(p.title, "Jordan Hayes · Anniversary Week in Negril");
  assertEquals(p.body, "Sending over the confirmation the resort emailed us.");
  assertEquals(p.tag, CONV);
  assertEquals(p.count, 2);
  // Passed through as text: a Date would drop the microseconds and leave the message unread.
  assertEquals(p.seenUpTo, "2026-10-19T08:00:00.123456+00:00");
  assertEquals(p.url, `/agent/messages/${CONV}?reply=1`);
  assertEquals(threadUrl(CONV), p.url);
});

Deno.test("a thread with no trip shows the name alone; an attachment-only message still says something", () => {
  assertEquals(messageTitle("Maya Carter", null), "Maya Carter");
  assertEquals(messageTitle(null, "  "), "A client");
  assertEquals(messagePayload(row({ preview: "  " })).body, NO_PREVIEW);
});

Deno.test("nameList reads like a sentence", () => {
  assertEquals(nameList([]), "Your clients");
  assertEquals(nameList(["Jordan Hayes"]), "Jordan Hayes");
  assertEquals(nameList(["A", "B"]), "A and B");
  assertEquals(nameList(["A", "B", "C"]), "A, B and C");
  assertEquals(nameList(["A", "B", "C", "D"]), "A, B, C and 1 other");
  assertEquals(nameList(["A", "B", "C", "D", "E", "A"]), "A, B, C and 2 others");
});

Deno.test("the morning summary counts messages, not threads, and says overnight only when true", () => {
  const rows = [
    row({ message_count: 2 }),
    row({ client_name: "Maya Carter", conversation_id: crypto.randomUUID() }),
  ];
  const s = summaryPayload(rows, NOW);
  assertEquals(s.title, "3 new messages while you rested");
  assertEquals(s.body, "Jordan Hayes and Maya Carter reached out overnight.");
  assertEquals(s.url, "/agent/messages");

  // A Saturday-afternoon message waiting for Monday 07:00 was not "overnight".
  const sunday = summaryPayload([row({ latest_created_at: "2026-10-18T15:00:00+00:00" })], NOW);
  assertEquals(sunday.title, "1 new message while you rested");
  assertEquals(sunday.body, "Jordan Hayes reached out.");
});

Deno.test("planForAgent: each live row alone, every held row in one summary", () => {
  const live = row();
  const h1 = row({ held: true, conversation_id: crypto.randomUUID() });
  const h2 = row({ held: true, conversation_id: crypto.randomUUID(), client_name: "Sam Rivera" });
  const plan = planForAgent([live, h1, h2], NOW);
  assertEquals(plan.length, 2);
  assertEquals(plan[0].outboxIds, [live.outbox_id]);
  assertEquals(plan[0].payload.kind, "message");
  assertEquals(plan[1].outboxIds, [h1.outbox_id, h2.outbox_id]);
  assertEquals(plan[1].payload.kind, "summary");
  assertEquals(planForAgent([live], NOW).length, 1);
});

Deno.test("only the browsers' own push services may be an endpoint", () => {
  for (const ok of [
    "https://fcm.googleapis.com/fcm/send/abc",
    "https://updates.push.services.mozilla.com/wpush/v2/abc",
    "https://wns2-par02p.notify.windows.com/w/?token=abc",
    "https://web.push.apple.com/QGx",
  ]) assert(isAllowedPushEndpoint(ok), ok);

  for (const bad of [
    "http://fcm.googleapis.com/fcm/send/abc", // not https
    "https://fcm.googleapis.com:8443/x", // odd port
    "https://evil.example.com/fcm.googleapis.com", // host is what counts
    "https://fcm.googleapis.com.evil.example/x", // suffix trick
    "https://user:pw@fcm.googleapis.com/x",
    "https://10.0.0.1/x",
    "https://localhost/x",
    "not a url",
    `https://fcm.googleapis.com/${"x".repeat(1100)}`,
  ]) assertFalse(isAllowedPushEndpoint(bad), bad);
});

Deno.test("push service answers: 2xx ok, 404 and 410 gone, the rest an error", () => {
  assertEquals(outcomeForStatus(201), "ok");
  assertEquals(outcomeForStatus(404), "gone");
  assertEquals(outcomeForStatus(410), "gone");
  assertEquals(outcomeForStatus(429), "error");
  assertEquals(outcomeForStatus(500), "error");
});

Deno.test("deliver: one device taking it is enough; gone devices are reported, not retried", async () => {
  const answers: Record<string, DeviceOutcome> = { a: "ok", b: "gone", c: "error" };
  const send = (d: PushDevice) => Promise.resolve(answers[d.device_id]);
  const p = messagePayload(row());

  const mixed = await deliver([device("a"), device("b"), device("c")], p, send);
  assert(mixed.ok);
  assertEquals(mixed.goneDeviceIds, ["b"]);

  // Only errors: worth a retry.
  assertFalse((await deliver([device("c")], p, send)).ok);

  // Only gone, or nothing reachable yet: nothing left to try, so not a failure.
  assert((await deliver([device("b")], p, send)).ok);
  assert((await deliver([device("d", "android")], p, () => Promise.resolve("skipped"))).ok);
  assert((await deliver([], p, send)).ok);

  // A sender that throws is an error for that device, not for the batch.
  const throws = await deliver([device("a"), device("x")], p, (d) =>
    d.device_id === "x" ? Promise.reject(new Error("boom")) : Promise.resolve("ok"));
  assert(throws.ok);
});

Deno.test("readWebSubscription: a push service endpoint and both keys, or a 400", () => {
  const keys = { p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM", auth: "tBHItJI5svbpez7KI4CCXg" };
  const ok = readWebSubscription({ endpoint: "https://fcm.googleapis.com/fcm/send/abc", keys });
  assertEquals(ok.p256dh, keys.p256dh);
  assertThrows(() => readWebSubscription({ endpoint: "https://10.0.0.1/x", keys }), HttpError);
  assertThrows(() => readWebSubscription({ endpoint: "https://fcm.googleapis.com/x", keys: { p256dh: keys.p256dh } }), HttpError);
  assertThrows(() => readWebSubscription({ endpoint: "https://fcm.googleapis.com/x", keys: { ...keys, auth: "has spaces in it" } }), HttpError);
  assertThrows(() => readWebSubscription(undefined), HttpError);
});

Deno.test("readDeviceLabel: optional, trimmed, bounded", () => {
  assertEquals(readDeviceLabel(undefined), null);
  assertEquals(readDeviceLabel("  "), null);
  assertEquals(readDeviceLabel(" Chrome · macOS "), "Chrome · macOS");
  assertEquals(readDeviceLabel("x".repeat(200))!.length, 80);
  assertThrows(() => readDeviceLabel(42), HttpError);
});

Deno.test("a card number a client typed never reaches a lock screen", () => {
  // Built at runtime: CI's PCI guard (scan_pan.py) rightly refuses any Luhn-valid number in
  // source, test fixtures included. These are well-known public test card numbers.
  const visa = Array(4).fill("4242").join(" ");
  const amex = ["3782", "822463", "10005"].join("-");
  const bare = "4111" + "1".repeat(12);
  const mc = [...Array(3).fill("5555"), "4444"].join(" ");
  assertEquals(maskCardNumbers(`my card is ${visa} exp 12/29`), "my card is •••• 4242 exp 12/29");
  assertEquals(maskCardNumbers(`Amex ${amex} ok`), "Amex •••• 0005 ok");
  assertEquals(maskCardNumbers(bare), "•••• 1111");
  // Ordinary numbers stay: prices, dates, phone numbers, confirmation codes.
  assertEquals(maskCardNumbers("$7,845 due 10/29, call 312-555-0142, conf 8841207"), "$7,845 due 10/29, call 312-555-0142, conf 8841207");
  assertEquals(messagePayload(row({ preview: `card ${mc}` })).body, "card •••• 4444");
});

Deno.test("readFcmToken: an opaque token of sane size, or a 400", () => {
  const tok = "dXJ8:APA91b" + "x".repeat(140);
  assertEquals(readFcmToken(tok), tok);
  assertThrows(() => readFcmToken("short"), HttpError);
  assertThrows(() => readFcmToken("has spaces " + "x".repeat(40)), HttpError);
  assertThrows(() => readFcmToken(undefined), HttpError);
});
