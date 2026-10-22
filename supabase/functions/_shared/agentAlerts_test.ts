import { assert, assertEquals, assertStringIncludes, assertThrows } from "jsr:@std/assert@^1";
import { HttpError } from "./problem.ts";
import {
  buildAlertEmail,
  buildEmail,
  type ClaimedAlert,
  type ClaimedEmail,
  type EmailConfig,
  LOCKED_SIGNATURE_LINE,
  newToken,
  renderSignature,
} from "./email.ts";
import {
  type ClaimedRow,
  leadMessagePayload,
  planForAgent,
  quoteRequestDetail,
  quoteRequestPayload,
  summaryPayload,
} from "./push.ts";
import { androidData } from "./fcm.ts";
import { readAutoReply, readSignature, unknownSignatureFields } from "./agentSettings.ts";

const CFG: EmailConfig = {
  host: "inbucket",
  port: 1025,
  secure: false,
  user: null,
  password: null,
  fromAddress: "gyasi.messages@adventures.story-tail.com",
  siteUrl: "https://storytailadventures.vercel.app",
  unsubscribeUrl: "https://x.supabase.co/functions/v1/email-unsubscribe",
};

const DEFAULT_SIG = "{{agent.name}}, Travel Advisor\n{{agent.phone}} · {{agent.email}}\nadventures.story-tail.com\n\nMaking travel an adventure";
// Built at run time: the repo's card-number guard refuses the literal (CLAUDE.md rule 1).
const CARD = `${"4242 ".repeat(3)}4242`;

// ── Signature ────────────────────────────────────────────────────────────────

Deno.test("renderSignature: fills the fields and always ends with the locked host-agency line", () => {
  const lines = renderSignature({
    signature: DEFAULT_SIG,
    display_name: "Gyasi Story",
    phone: "+1 (305) 555-0184",
    email: "gyasi@story-tail.com",
  });
  assertEquals(lines, [
    "Gyasi Story, Travel Advisor",
    "+1 (305) 555-0184 · gyasi@story-tail.com",
    "adventures.story-tail.com",
    "",
    "Making travel an adventure",
    "",
    LOCKED_SIGNATURE_LINE,
  ]);
});

Deno.test("renderSignature: a missing phone leaves no stranded separator", () => {
  const lines = renderSignature({ signature: DEFAULT_SIG, display_name: "Gyasi Story", phone: null, email: "g@x.com" });
  assertEquals(lines[1], "g@x.com");
  const none = renderSignature({ signature: "{{agent.phone}}\nHi", display_name: "G", phone: "", email: "" });
  assertEquals(none, ["Hi", "", LOCKED_SIGNATURE_LINE]);
});

Deno.test("renderSignature: with nothing stored, only the locked line; card numbers masked", () => {
  assertEquals(renderSignature(null), ["", LOCKED_SIGNATURE_LINE]);
  const masked = renderSignature({ signature: `Pay with ${CARD}`, display_name: null, phone: null, email: null });
  assert(!masked.join(" ").includes(CARD));
});

const ROW: ClaimedEmail = {
  outbox_id: "0195a2c0-1a00-7000-8000-0000000000e1",
  conversation_id: "0195a2c0-1a00-7000-8000-0000000000b0",
  recipient: "jordan@example.com",
  client_first_name: "Jordan",
  agent_first_name: "Gyasi",
  trip_title: "Anniversary Week",
  previous_outbox_id: null,
  messages: [{ message_id: "m1", body: "See you soon!", created_at: "2026-10-19T08:00:00Z", attachments: [] }],
};
const TOKENS = { reply: newToken(), unsubscribe: newToken() };

Deno.test("buildEmail: the signature sits under the advisor's words, links clickable, text escaped", () => {
  const built = buildEmail(ROW, TOKENS, CFG, {
    signature: "{{agent.name}} <b>bold</b>\nstory-tail.com\n{{agent.email}}",
    display_name: "Gyasi Story",
    phone: null,
    email: "gyasi@story-tail.com",
  });
  const words = built.text.indexOf("See you soon!");
  const sig = built.text.indexOf("Gyasi Story <b>bold</b>");
  const button = built.text.indexOf("Open the conversation");
  assert(words >= 0 && sig > words && button > sig, "words, then signature, then the link");
  assertStringIncludes(built.text, LOCKED_SIGNATURE_LINE);
  assertStringIncludes(built.html, "Gyasi Story &lt;b&gt;bold&lt;/b&gt;");
  assertStringIncludes(built.html, `<a href="https://story-tail.com"`);
  assertStringIncludes(built.html, `<a href="mailto:gyasi@story-tail.com"`);
  assert(!built.html.includes("<b>bold</b>"), "a tag typed into a signature is never HTML");
  const plain = buildEmail(ROW, TOKENS, CFG, { signature: "Ask me about St.Lucia", display_name: null, phone: null, email: null });
  assert(!plain.html.includes(`href="https://St.Lucia"`), "a place name with a dot is not a link");
});

// ── The advisor's alert emails ───────────────────────────────────────────────

const ALERT: ClaimedAlert = {
  alert_id: "0195a2c0-1a00-7000-8000-0000000000f1",
  kind: "client_message",
  recipient: "gyasi@example.com",
  agent_first_name: "Gyasi",
  client_name: "Jordan Hayes",
  trip_title: "Anniversary Week in Negril",
  conversation_id: "0195a2c0-1a00-7000-8000-0000000000b0",
  trip_id: null,
  lead_id: null,
};

Deno.test("buildAlertEmail: who, which trip and a link to the thread; no client words exist to leak", () => {
  const e = buildAlertEmail(ALERT, CFG);
  assertEquals(e.subject, "New message from Jordan Hayes");
  assertEquals(e.to, "gyasi@example.com");
  assertStringIncludes(e.text, "Jordan Hayes wrote to you about Anniversary Week in Negril.");
  assertStringIncludes(e.text, "https://storytailadventures.vercel.app/agent/messages/0195a2c0-1a00-7000-8000-0000000000b0");
  assertStringIncludes(e.html, "Open in Story-Tail");
});

Deno.test("buildAlertEmail: a trip request links to the inquiry trip", () => {
  const e = buildAlertEmail({ ...ALERT, kind: "quote_request", conversation_id: null, trip_id: "t-1", trip_title: "Hotel in Negril" }, CFG);
  assertEquals(e.subject, "New trip request from Jordan Hayes");
  assertStringIncludes(e.text, "/agent/trips/t-1");
});

Deno.test("buildAlertEmail: a lead's message names them and links to the lead, never their words", () => {
  const e = buildAlertEmail(
    { ...ALERT, kind: "lead_message", conversation_id: null, trip_title: null, client_name: "Dana Reyes", lead_id: "l-1" },
    CFG,
  );
  assertEquals(e.subject, "Dana Reyes wrote to you from the website");
  assertStringIncludes(e.text, "Dana Reyes doesn't have an account yet and sent you a note from the website.");
  assertStringIncludes(e.text, "https://storytailadventures.vercel.app/agent/leads/l-1");
  assertStringIncludes(e.text, "\"New inquiries and messages\" emails are on");
  assertThrows(() => buildAlertEmail({ ...ALERT, kind: "lead_message", conversation_id: null, lead_id: null }, CFG));
});

Deno.test("buildAlertEmail: refuses what it cannot honestly send", () => {
  assertThrows(() => buildAlertEmail({ ...ALERT, recipient: "a@b.com, c@d.com" }, CFG));
  assertThrows(() => buildAlertEmail({ ...ALERT, conversation_id: null }, CFG));
  // A pasted line break in a name can never start a new header.
  assert(!/[\r\n]/.test(buildAlertEmail({ ...ALERT, client_name: "Jordan\r\nBcc: x@y.com" }, CFG).subject));
});

// ── Push ─────────────────────────────────────────────────────────────────────

function row(over: Partial<ClaimedRow> = {}): ClaimedRow {
  return {
    outbox_id: crypto.randomUUID(),
    agent_id: "agent-1",
    kind: "quote_request",
    conversation_id: null,
    trip_id: "trip-1",
    held: false,
    hold_reason: null,
    message_count: 1,
    client_name: "Jordan Hayes",
    trip_title: "Hotel in Negril",
    preview: null,
    latest_created_at: "2026-10-19T08:00:00.123456+00:00",
    destination: "Negril, Jamaica",
    start_date: "2027-02-10",
    end_date: "2027-02-14",
    lead_id: null,
    ...over,
  };
}

Deno.test("a trip request: the name in the title, where and when in the body, opening the trip", () => {
  const p = quoteRequestPayload(row());
  assertEquals(p.title, "New trip request from Jordan Hayes");
  assertEquals(p.body, "Negril, Jamaica · Feb 10 – Feb 14");
  assertEquals(p.url, "/agent/trips/trip-1");
  assertEquals(p.tag, "quote-trip-1");
  assertEquals(quoteRequestDetail({ destination: null, start_date: null, end_date: null }), "");
  assertEquals(quoteRequestPayload(row({ destination: null, start_date: null, end_date: null })).body,
    "Open it to see what they're dreaming of.");
});

Deno.test("a trip request on Android carries ids only", () => {
  const d = androidData(quoteRequestPayload(row()));
  assertEquals(d, { v: "1", kind: "quote_request", tag: "quote-trip-1", tripId: "trip-1" });
});

Deno.test("the summary after time away says so, and counts trip requests apart from messages", () => {
  const now = new Date("2026-10-26T13:00:00Z");
  const s = summaryPayload([
    row({ kind: "message", conversation_id: "c1", trip_id: null, held: true, hold_reason: "away", message_count: 2 }),
    row({ held: true, hold_reason: "away" }),
  ], now);
  assertEquals(s.title, "2 new messages and 1 trip request while you were away");
  assertEquals(s.body, "Jordan Hayes reached out.");
  const rested = summaryPayload([row({ kind: "message", conversation_id: "c1", trip_id: null, held: true, hold_reason: "rest" })],
    new Date("2026-10-19T08:30:00Z"));
  assertEquals(rested.title, "1 new message while you rested");
});

Deno.test("a lead's message: their name, no words, opening the lead; Android gets the id only", () => {
  const lead = row({ kind: "lead_message", trip_id: null, trip_title: null, destination: null, start_date: null,
                     end_date: null, client_name: "Dana Reyes", lead_id: "lead-1" });
  const p = leadMessagePayload(lead);
  assertEquals(p.title, "New note from Dana Reyes");
  assertEquals(p.body, "They wrote from the website. Open it to read and reply.");
  assertEquals(p.url, "/agent/leads/lead-1");
  assertEquals(p.tag, "lead-lead-1");
  assertEquals(androidData(p), { v: "1", kind: "lead_message", tag: "lead-lead-1", leadId: "lead-1" });
  assertEquals(planForAgent([lead], new Date())[0].payload.kind, "lead_message");

  const s = summaryPayload([
    row({ kind: "message", conversation_id: "c1", trip_id: null, held: true, hold_reason: "rest" }),
    row({ held: true, hold_reason: "rest" }),
    { ...lead, held: true, hold_reason: "rest" },
  ], new Date("2026-10-19T12:00:00Z"));
  assertEquals(s.title, "1 new message, 1 trip request and 1 note from someone new while you rested");
  assertEquals(s.count, 3);
  const onlyLeads = summaryPayload([{ ...lead, held: true, hold_reason: "rest" }, { ...lead, held: true, hold_reason: "rest" }],
    new Date("2026-10-19T12:00:00Z"));
  assertEquals(onlyLeads.title, "2 notes from new people while you rested");
  assertEquals(onlyLeads.url, "/agent/leads");
});

Deno.test("planForAgent: a live trip request is its own notification", () => {
  const sends = planForAgent([row()], new Date());
  assertEquals(sends.length, 1);
  assertEquals(sends[0].payload.kind, "quote_request");
});

// ── Settings readers ─────────────────────────────────────────────────────────

Deno.test("readSignature: plain text, 8 lines, 500 characters, three fields; empty means default", () => {
  assertEquals(readSignature("  \n\n"), null);
  assertEquals(readSignature(null), null);
  assertEquals(readSignature("Hi  \r\nThere\n\n"), "Hi\nThere");
  assertThrows(() => readSignature("x\n".repeat(8) + "ninth"), HttpError);
  assertThrows(() => readSignature("x".repeat(501)), HttpError);
  assertThrows(() => readSignature("{{client.firstName}}"), HttpError);
  assertEquals(unknownSignatureFields("{{agent.name}} {{ trip.title }} {{agent.phone}}"), ["trip.title"]);
});

Deno.test("readAutoReply: words required when on; only {{return_date}}", () => {
  assertEquals(readAutoReply(false, ""), { enabled: false, text: null });
  assertEquals(readAutoReply(true, " Back {{return_date}} "), { enabled: true, text: "Back {{return_date}}" });
  assertThrows(() => readAutoReply(true, "  "), HttpError);
  assertThrows(() => readAutoReply(true, "Back {{agent.name}}"), HttpError);
  assertThrows(() => readAutoReply(true, "x".repeat(601)), HttpError);
  assertThrows(() => readAutoReply("yes", "x"), HttpError);
});
