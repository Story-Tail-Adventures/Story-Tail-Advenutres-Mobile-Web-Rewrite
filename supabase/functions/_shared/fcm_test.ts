import { assert, assertEquals, assertFalse } from "jsr:@std/assert@^1";
import { androidData, fcmMessage, fcmOutcome, signedAssertion } from "./fcm.ts";
import { dismissPayload, messagePayload, summaryPayload, type ClaimedRow } from "./push.ts";

const CONV = "0195a2c0-1a00-7000-8000-0000000000b0";
const row: ClaimedRow = {
  outbox_id: "o1",
  agent_id: "a1",
  conversation_id: CONV,
  held: false,
  message_count: 2,
  client_name: "Jordan Hayes",
  trip_title: "Anniversary Week in Negril",
  preview: "Is the airport transfer included?",
  latest_created_at: "2026-10-15T14:02:11.123456+00:00",
};

Deno.test("an Android payload carries no name, trip or message text (Google can read it)", () => {
  const payloads = [
    messagePayload(row),
    summaryPayload([row, { ...row, client_name: "Maya Carter" }], new Date("2026-10-15T15:00:00Z")),
    dismissPayload(CONV, "2026-10-15T14:02:11.123456+00:00"),
  ];
  for (const p of payloads) {
    const wire = JSON.stringify(fcmMessage("token-123", p));
    for (const secret of ["Jordan", "Hayes", "Maya", "Negril", "airport", "rested"]) {
      assertFalse(wire.includes(secret), `${p.kind} leaked "${secret}"`);
    }
  }
  assertEquals(androidData(messagePayload(row)), {
    v: "1",
    kind: "message",
    tag: CONV,
    conversationId: CONV,
    seenUpTo: "2026-10-15T14:02:11.123456+00:00",
    count: "2",
  });
  assertEquals(androidData(payloads[1]), { v: "1", kind: "summary", tag: "summary", count: "4" });
  assertEquals(androidData(payloads[2]), {
    v: "1",
    kind: "dismiss",
    tag: CONV,
    readUpTo: "2026-10-15T14:02:11.123456+00:00",
  });
});

Deno.test("a data message at high priority, one waiting per thread", () => {
  const m = fcmMessage("tok", messagePayload(row)).message;
  assertEquals(m.token, "tok");
  assertEquals(m.android.priority, "HIGH");
  assertEquals(m.android.collapse_key, CONV);
  assertFalse("notification" in m, "a notification block would let the system draw it, not the app");
});

Deno.test("only a dead token is forgotten; our own bad request never is", () => {
  assertEquals(fcmOutcome(200, null), "ok");
  assertEquals(fcmOutcome(404, "UNREGISTERED"), "gone");
  // A bare 404 is also what a wrong project gets: never a reason to delete every phone.
  assertEquals(fcmOutcome(404, null), "error");
  assertEquals(fcmOutcome(400, "INVALID_ARGUMENT"), "error");
  assertEquals(fcmOutcome(401, null), "error");
  assertEquals(fcmOutcome(503, "UNAVAILABLE"), "error");
});

Deno.test("the service-account assertion is a verifiable RS256 JWT for FCM", async () => {
  const pair = await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"],
  );
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey));
  let b = "";
  for (const x of pkcs8) b += String.fromCharCode(x);
  const pem = `-----BEGIN PRIVATE KEY-----\n${btoa(b).replace(/.{64}/g, "$&\n")}\n-----END PRIVATE KEY-----\n`;

  const jwt = await signedAssertion({ project_id: "p", client_email: "svc@p.iam.gserviceaccount.com", private_key: pem }, 1_000);
  const [h, c, sig] = jwt.split(".");
  const dec = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "=")), (ch) => ch.charCodeAt(0));
  const claims = JSON.parse(new TextDecoder().decode(dec(c)));
  assertEquals(JSON.parse(new TextDecoder().decode(dec(h))), { alg: "RS256", typ: "JWT" });
  assertEquals(claims, {
    iss: "svc@p.iam.gserviceaccount.com",
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: 1_000,
    exp: 4_600,
  });
  assert(await crypto.subtle.verify("RSASSA-PKCS1-v1_5", pair.publicKey, dec(sig), new TextEncoder().encode(`${h}.${c}`)));
});
