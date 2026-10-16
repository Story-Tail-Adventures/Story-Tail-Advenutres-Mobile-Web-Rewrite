import { assert, assertEquals, assertMatch, assertThrows } from "jsr:@std/assert@^1";
import {
  buildEmail,
  type ClaimedEmail,
  classifySmtpError,
  type EmailConfig,
  emailConfigFromEnv,
  inboxConfigFromEnv,
  isToken,
  newToken,
  tokenHashParam,
} from "./email.ts";

const prodEnv: Record<string, string> = {
  EMAIL_SMTP_HOST: "smtp.ionos.com",
  EMAIL_SMTP_USER: "gyasi.messages@adventures.story-tail.com",
  EMAIL_SMTP_PASSWORD: "secret",
  EMAIL_FROM_ADDRESS: "gyasi.messages@adventures.story-tail.com",
  EMAIL_SITE_URL: "https://app.story-tail.com/",
  EMAIL_UNSUBSCRIBE_URL: "https://x.supabase.co/functions/v1/email-unsubscribe",
};
const envOf = (over: Record<string, string | undefined> = {}) => (name: string) =>
  name in over ? over[name] : prodEnv[name];

const cfg: EmailConfig = emailConfigFromEnv(envOf())!;

const T1 = "abcdefghijklmnopqrstuvwxyz";
const T2 = "234567abcdefghijklmnopqrst";
const TOKENS = { reply: T1, unsubscribe: T2 };

function row(over: Partial<ClaimedEmail> = {}): ClaimedEmail {
  return {
    outbox_id: "0195a2c0-0000-7000-8000-0000000000e1",
    conversation_id: "0195a2c0-1a00-7000-8000-0000000000b0",
    recipient: "jordan.hayes@example.com",
    client_first_name: "Jordan",
    agent_first_name: "Gyasi",
    trip_title: "Bahamas Anniversary",
    previous_outbox_id: null,
    messages: [{
      message_id: "m1",
      body: "Your ferry is booked for 9am.",
      created_at: "2026-10-16T14:00:00.123456+00:00",
      attachments: [],
    }],
    ...over,
  };
}

const said = (body: string, attachments: string[] = []) => [{ message_id: "m", body, created_at: "", attachments }];

// ── Config ──────────────────────────────────────────────────────────────────

Deno.test("config: production settings are TLS on 465, with credentials", () => {
  assertEquals(cfg.port, 465);
  assertEquals(cfg.secure, true);
  assertEquals(cfg.siteUrl, "https://app.story-tail.com");
});

Deno.test("config: not set up is null, so the dispatcher refuses before claiming", () => {
  assertEquals(emailConfigFromEnv(envOf({ EMAIL_SMTP_HOST: undefined })), null);
});

Deno.test("config: any port but 465 is refused for a real server (no STARTTLS, no cleartext)", () => {
  assertThrows(() => emailConfigFromEnv(envOf({ EMAIL_SMTP_PORT: "587" })), Error, "465 only");
  assertThrows(() => emailConfigFromEnv(envOf({ EMAIL_SMTP_PORT: "25" })), Error, "465 only");
});

Deno.test("config: the local catcher may be plain, but never with a password", () => {
  const local = emailConfigFromEnv(envOf({
    EMAIL_SMTP_HOST: "supabase_inbucket_storytail-adventures",
    EMAIL_SMTP_PORT: "1025",
    EMAIL_SMTP_USER: undefined,
    EMAIL_SMTP_PASSWORD: undefined,
    EMAIL_SITE_URL: "http://localhost:3000",
    EMAIL_UNSUBSCRIBE_URL: "http://127.0.0.1:54321/functions/v1/email-unsubscribe",
  }))!;
  assertEquals(local.secure, false);
  assertThrows(
    () => emailConfigFromEnv(envOf({ EMAIL_SMTP_HOST: "supabase_inbucket_storytail-adventures", EMAIL_SMTP_PORT: "1025" })),
    Error,
    "465 only",
  );
});

Deno.test("config: a real server without a login, half a login, or an http link is refused", () => {
  assertThrows(() => emailConfigFromEnv(envOf({ EMAIL_SMTP_USER: undefined, EMAIL_SMTP_PASSWORD: undefined })), Error, "needs");
  assertThrows(() => emailConfigFromEnv(envOf({ EMAIL_SMTP_PASSWORD: undefined })), Error, "both");
  assertThrows(() => emailConfigFromEnv(envOf({ EMAIL_SITE_URL: "http://app.story-tail.com" })), Error, "EMAIL_SITE_URL");
});

Deno.test("inbox config: the sending login, port 993 with TLS, and nothing without a login", () => {
  const c = inboxConfigFromEnv(envOf())!;
  assertEquals([c.host, c.port, c.secure, c.mailbox], ["imap.ionos.com", 993, true, "gyasi.messages@adventures.story-tail.com"]);
  assertEquals(inboxConfigFromEnv(envOf({ EMAIL_SMTP_PASSWORD: undefined })), null);
  assertThrows(() => inboxConfigFromEnv(envOf({ EMAIL_IMAP_PORT: "143" })), Error, "993 only");
  const local = inboxConfigFromEnv(envOf({ EMAIL_IMAP_HOST: "host.docker.internal", EMAIL_IMAP_PORT: "3143" }))!;
  assertEquals(local.secure, false);
});

// ── Tokens ──────────────────────────────────────────────────────────────────

Deno.test("tokens: 26 lowercase base32 characters, different every time", () => {
  const a = newToken();
  const b = newToken();
  assert(isToken(a) && isToken(b));
  assertMatch(a, /^[a-z2-7]{26}$/);
  assert(a !== b);
  assertEquals(newToken(() => new Uint8Array(16)), "a".repeat(26));
});

Deno.test("tokens: hashed as SHA-256 in PostgREST's bytea hex form", async () => {
  // SHA-256 of the empty string.
  assertEquals(await tokenHashParam(""), "\\xe3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  assertEquals(await tokenHashParam(T1.toUpperCase()), await tokenHashParam(T1));
});

// ── The email ───────────────────────────────────────────────────────────────

Deno.test("email: from the advisor at Story-Tail, to the bare address, replies to the token", () => {
  const e = buildEmail(row(), TOKENS, cfg);
  assertEquals(e.from, { name: "Gyasi at Story-Tail Adventures", address: cfg.fromAddress });
  assertEquals(e.to, "jordan.hayes@example.com");
  // Replies come back to the mailbox itself, matched by the token in the plus address.
  assertEquals(e.replyTo, `gyasi.messages+${T1}@adventures.story-tail.com`);
  assertEquals(e.subject, "Gyasi wrote about Bahamas Anniversary");
  assertEquals(buildEmail(row({ trip_title: null }), TOKENS, cfg).subject, "A note from Gyasi");
});

Deno.test("email: with no advisor name, it says 'your advisor', capitalised only to start a sentence", () => {
  const e = buildEmail(row({ agent_first_name: null, trip_title: null, messages: said("Hello", ["a.pdf"]) }), TOKENS, cfg);
  assertEquals(e.subject, "A note from your advisor");
  assertEquals(e.from.name, "Your advisor at Story-Tail Adventures");
  assert(e.text.includes("Your advisor shared a file with you: a.pdf."));
  assert(e.text.includes("Reply to this email and your advisor will see it"));
});

Deno.test("email: a card number in a trip title is masked in the subject", () => {
  const visa = Array(4).fill("4242").join(" ");
  assertEquals(buildEmail(row({ trip_title: `Card ${visa}` }), TOKENS, cfg).subject, "Gyasi wrote about Card •••• 4242");
});

Deno.test("email: carries the words, the thread link and both opt-out paths", () => {
  const e = buildEmail(row(), TOKENS, cfg);
  assert(e.text.includes("Your ferry is booked for 9am."));
  assert(e.text.includes("https://app.story-tail.com/messages/0195a2c0-1a00-7000-8000-0000000000b0"));
  assert(e.text.includes(`https://app.story-tail.com/email/unsubscribe?t=${T2}`));
  assertEquals(e.headers["List-Unsubscribe"], `<${cfg.unsubscribeUrl}?t=${T2}>`);
  assertEquals(e.headers["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
  assert(!e.text.includes(T1) && !e.html.includes(T1), "the reply token is only in Reply-To");
});

Deno.test("email: card numbers are masked in both parts", () => {
  // Built at runtime: the PCI guard refuses any Luhn-valid number in source, tests included.
  const visa = Array(4).fill("4242").join(" ");
  const e = buildEmail(row({ messages: said(`Card ${visa} is on file.`) }), TOKENS, cfg);
  assert(!e.text.includes(visa) && e.text.includes("•••• 4242"));
  assert(!e.html.includes(visa) && e.html.includes("•••• 4242"));
});

Deno.test("email: card numbers split by dots or no-break spaces are masked too (review)", () => {
  const dotted = Array(4).fill("4242").join(".");
  const nbsp = Array(4).fill("4242").join("\u00a0");
  const e = buildEmail(row({ messages: said(`A ${dotted} and B ${nbsp}.`) }), TOKENS, cfg);
  assert(!e.text.includes(dotted) && !e.text.includes(nbsp));
  assertEquals((e.text.match(/•••• 4242/g) ?? []).length, 2);
});

Deno.test("email: the advisor's words are escaped, never HTML", () => {
  const e = buildEmail(row({ messages: said("<script>alert(1)</script> & <b>hi</b>") }), TOKENS, cfg);
  assert(!e.html.includes("<script>"));
  assert(e.html.includes("&lt;script&gt;alert(1)&lt;/script&gt; &amp; &lt;b&gt;hi&lt;/b&gt;"));
});

Deno.test("email: files are named, never attached", () => {
  const e = buildEmail(row({ messages: said("Here you go.", ["boarding-pass.pdf"]) }), TOKENS, cfg);
  assert(e.text.includes("Gyasi shared a file with you: boarding-pass.pdf"));
  assert(!("attachments" in e));
});

Deno.test("email: threads under the previous email so mail apps keep one conversation", () => {
  const first = buildEmail(row(), TOKENS, cfg);
  assertEquals(first.messageId, "<0195a2c0-0000-7000-8000-0000000000e1@adventures.story-tail.com>");
  assertEquals(first.inReplyTo, undefined);
  const next = buildEmail(
    row({ outbox_id: "0195a2c0-0000-7000-8000-0000000000e2", previous_outbox_id: "0195a2c0-0000-7000-8000-0000000000e1" }),
    TOKENS,
    cfg,
  );
  assertEquals(next.inReplyTo, first.messageId);
  assertEquals(next.references, first.messageId);
});

Deno.test("email: anything that would break a header, or reach two people, is refused", () => {
  // A line break in a trip title is cleaned into a space, never a second header (found in review:
  // it used to fail the email for good).
  const odd = buildEmail(row({ trip_title: "Bahamas\r\nBcc: evil@example.com" }), TOKENS, cfg);
  assertEquals(odd.subject, "Gyasi wrote about Bahamas Bcc: evil@example.com");
  // A name is cut to its first word, so a line break in it never reaches the From header.
  assertEquals(buildEmail(row({ agent_first_name: "Gyasi\nX-Evil: 1" }), TOKENS, cfg).from.name, "Gyasi at Story-Tail Adventures");
  assertThrows(() => buildEmail(row({ recipient: "a@example.com, b@example.com" }), TOKENS, cfg), Error, "single");
  assertThrows(() => buildEmail(row({ messages: [] }), TOKENS, cfg), Error, "no replies");
  assertThrows(() => buildEmail(row(), { reply: "short", unsubscribe: T2 }, cfg), Error, "token");
});

// ── SMTP outcomes ───────────────────────────────────────────────────────────

Deno.test("smtp errors: 5xx is permanent, 4xx and network trouble retry", () => {
  assertEquals(classifySmtpError({ responseCode: 550, response: "550 mailbox unavailable" }).permanent, true);
  assertEquals(classifySmtpError({ responseCode: 421, response: "421 try later" }).permanent, false);
  assertEquals(classifySmtpError({ code: "ETIMEDOUT", message: "Connection timeout" }).permanent, false);
});

Deno.test("smtp errors: the kept text names no address and is at most 200 characters", () => {
  const r = classifySmtpError({ responseCode: 550, response: `550 <jordan.hayes@example.com> rejected ${"x".repeat(400)}` });
  assert(!r.error.includes("jordan.hayes@example.com"));
  assert(r.error.includes("[address]"));
  assert(r.error.length <= 200);
});
