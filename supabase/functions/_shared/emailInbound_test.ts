import { assert, assertEquals } from "jsr:@std/assert@^1";
import {
  bareAddress,
  countFiles,
  isAutoReply,
  newWordsOnly,
  replyTokenFrom,
  senderVerified,
  verifySvix,
} from "./emailInbound.ts";

// A Svix-shaped secret: "whsec_" + base64 of the key bytes.
const KEY = new TextEncoder().encode("a test signing key for svix hmac");
const SECRET = "whsec_" + btoa(String.fromCharCode(...KEY));

async function sign(id: string, ts: string, body: string, secret = SECRET): Promise<string> {
  const raw = Uint8Array.from(atob(secret.slice(6)), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("raw", raw, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${id}.${ts}.${body}`)));
  return "v1," + btoa(String.fromCharCode(...mac));
}

const NOW = 1_792_000_000;
const BODY = '{"type":"email.received","data":{"email_id":"abc"}}';

Deno.test("svix: a correct signature over the raw body passes", async () => {
  const sig = await sign("msg_1", String(NOW), BODY);
  assert(await verifySvix(SECRET, { id: "msg_1", timestamp: String(NOW), signature: sig }, BODY, NOW));
});

Deno.test("svix: one good signature among several passes (key rotation)", async () => {
  const good = await sign("msg_1", String(NOW), BODY);
  const sig = `v1,AAAA ${good}`;
  assert(await verifySvix(SECRET, { id: "msg_1", timestamp: String(NOW), signature: sig }, BODY, NOW));
});

Deno.test("svix: a changed body, id or secret fails", async () => {
  const sig = await sign("msg_1", String(NOW), BODY);
  assert(!await verifySvix(SECRET, { id: "msg_1", timestamp: String(NOW), signature: sig }, BODY + " ", NOW));
  assert(!await verifySvix(SECRET, { id: "msg_2", timestamp: String(NOW), signature: sig }, BODY, NOW));
  const other = "whsec_" + btoa("a different key entirely, 32 by");
  assert(!await verifySvix(other, { id: "msg_1", timestamp: String(NOW), signature: sig }, BODY, NOW));
});

Deno.test("svix: a stale or future timestamp fails, so a captured request cannot be replayed", async () => {
  const old = String(NOW - 301);
  assert(!await verifySvix(SECRET, { id: "m", timestamp: old, signature: await sign("m", old, BODY) }, BODY, NOW));
  const future = String(NOW + 301);
  assert(!await verifySvix(SECRET, { id: "m", timestamp: future, signature: await sign("m", future, BODY) }, BODY, NOW));
});

Deno.test("svix: missing headers, a non-whsec secret or a v2 signature fail", async () => {
  const sig = await sign("m", String(NOW), BODY);
  assert(!await verifySvix(SECRET, { id: null, timestamp: String(NOW), signature: sig }, BODY, NOW));
  assert(!await verifySvix(SECRET.slice(6), { id: "m", timestamp: String(NOW), signature: sig }, BODY, NOW));
  assert(!await verifySvix(SECRET, { id: "m", timestamp: String(NOW), signature: sig.replace("v1,", "v2,") }, BODY, NOW));
});

Deno.test("addresses: a bare address out of the usual shapes", () => {
  assertEquals(bareAddress("Jordan Hayes <Jordan.Hayes@Example.com>"), "jordan.hayes@example.com");
  assertEquals(bareAddress(" jordan@example.com "), "jordan@example.com");
  assertEquals(bareAddress("not an address"), null);
  assertEquals(bareAddress(42), null);
});

Deno.test("addresses: a display name cannot spoof the sender (found in review)", () => {
  assertEquals(bareAddress('"<jordan.hayes@example.com>" <attacker@evil.com>'), null);
  assertEquals(bareAddress("jordan.hayes@example.com <attacker@evil.com>"), null);
  assertEquals(bareAddress("a@example.com, b@example.com"), null);
});

Deno.test("token: found only in reply+<token>@ our reply domain", () => {
  const t = "abcdefghijklmnopqrstuvwxyz";
  assertEquals(replyTokenFrom(["someone@example.com", `Gyasi <reply+${t}@reply.story-tail.com>`], "reply.story-tail.com"), t);
  assertEquals(replyTokenFrom([`reply+${t.toUpperCase()}@REPLY.story-tail.com`], "reply.story-tail.com"), t);
  assertEquals(replyTokenFrom([`reply+${t}@reply.evil.com`], "reply.story-tail.com"), null);
  assertEquals(replyTokenFrom([`reply+short@reply.story-tail.com`], "reply.story-tail.com"), null);
  assertEquals(replyTokenFrom([], "reply.story-tail.com"), null);
});

Deno.test("sender: DMARC pass, or both SPF and DKIM, and nothing less", () => {
  assert(senderVerified({ spf: "fail", dkim: "fail", dmarc: "pass" }));
  assert(senderVerified({ spf: "pass", dkim: "pass", dmarc: "unknown" }));
  assert(!senderVerified({ spf: "pass", dkim: "fail", dmarc: "unknown" }));
  assert(!senderVerified({ spf: "pass", dkim: "gray", dmarc: "fail" }));
  assert(!senderVerified(null));
});

Deno.test("words: Gmail and Apple Mail history is cut", () => {
  const text = "Perfect, see you then!\n\nOn Fri, Oct 16, 2026 at 9:05 AM Gyasi at Story-Tail Adventures <x@y.com> wrote:\n> Your ferry is booked.";
  assertEquals(newWordsOnly(text, null), "Perfect, see you then!");
});

Deno.test("words: Outlook history, quoted lines and phone signatures are cut", () => {
  assertEquals(newWordsOnly("Yes please.\n\n-----Original Message-----\nFrom: Gyasi", null), "Yes please.");
  assertEquals(newWordsOnly("Yes please.\n________________________________\nFrom: Gyasi\nSent: today", null), "Yes please.");
  assertEquals(newWordsOnly("Line one\n> quoted\nLine two\n\nSent from my iPhone", null), "Line one\nLine two");
  assertEquals(newWordsOnly("Thanks!\n-- \nJordan Hayes\n555-0100", null), "Thanks!");
});

Deno.test("words: HTML-only mail becomes text, never markup, and quotes go", () => {
  const html = "<div>Sounds <b>great</b>&nbsp;&amp; thanks</div><blockquote>old stuff</blockquote><script>x()</script>";
  assertEquals(newWordsOnly(null, html), "Sounds great & thanks");
});

Deno.test("words: nothing new is empty (the SQL then refuses it)", () => {
  assertEquals(newWordsOnly("\n\nOn Fri wrote something wrote:\n> hi", null), "");
  assertEquals(newWordsOnly(null, null), "");
});

Deno.test("files: inline signature images do not count", () => {
  assertEquals(countFiles([
    { filename: "logo.png", content_disposition: "inline", content_id: "img1" },
    { filename: "passport.pdf", content_disposition: "attachment", content_id: null },
    { filename: "photo.jpg", content_disposition: null, content_id: null },
  ]), 2);
  assertEquals(countFiles(undefined), 0);
});

Deno.test("auto replies: RFC 3834 headers, the usual vendor headers and subjects", () => {
  assert(isAutoReply({ "Auto-Submitted": "auto-replied" }, "Re: Bahamas"));
  assert(!isAutoReply({ "auto-submitted": "no" }, "Re: Bahamas"));
  assert(isAutoReply([{ name: "Precedence", value: "auto_reply" }], "Re: Bahamas"));
  assert(isAutoReply({ "X-Autoreply": "yes" }, "Re: Bahamas"));
  assert(isAutoReply({}, "Automatic reply: Gyasi wrote about Bahamas"));
  assert(isAutoReply({}, "Out of Office: back Monday"));
  assert(!isAutoReply({ from: "jordan@example.com" }, "Re: Gyasi wrote about Bahamas"));
  assert(!isAutoReply(null, "Out of this world trip, thanks!"));
});
