import { assert, assertEquals } from "jsr:@std/assert@^1";
import {
  bareAddress,
  countFiles,
  dedupeKey,
  fromOf,
  isAutoReply,
  newWordsOnly,
  outboxIdFrom,
  parseHeaders,
  plusAddress,
  recipientsOf,
  replyTokenFrom,
  senderVerified,
  textPart,
} from "./emailInbound.ts";

const MAILBOX = "info@adventures.story-tail.com";
const T = "abcdefghijklmnopqrstuvwxyz";
const OUTBOX = "0195a2c0-0000-7000-8000-0000000000e1";

const h = (raw: string) => parseHeaders(raw);

// ── Headers ─────────────────────────────────────────────────────────────────

Deno.test("headers: unfolded, lowercased, in order", () => {
  const parsed = h("Subject: Re: Bahamas\r\n trip\r\nFrom: Jordan <jordan@example.com>\r\nX-A: 1\r\nX-A: 2\r\n");
  assertEquals(parsed, [["subject", "Re: Bahamas trip"], ["from", "Jordan <jordan@example.com>"], ["x-a", "1"], ["x-a", "2"]]);
});

// ── Addresses ───────────────────────────────────────────────────────────────

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
  assertEquals(fromOf(h("From: a@example.com\nFrom: b@example.com")), null, "two From headers: refused");
  assertEquals(fromOf(h("From: Jordan <jordan@example.com>")), "jordan@example.com");
});

// ── The reply token ─────────────────────────────────────────────────────────

Deno.test("token: the reply address is the mailbox's own plus address", () => {
  assertEquals(plusAddress(MAILBOX, T), `info+${T}@adventures.story-tail.com`);
});

Deno.test("token: found only in OUR mailbox's plus address", () => {
  assertEquals(replyTokenFrom(["someone@example.com", `Gyasi <info+${T}@adventures.story-tail.com>`], MAILBOX), T);
  assertEquals(replyTokenFrom([`INFO+${T.toUpperCase()}@Adventures.Story-Tail.com`], MAILBOX), T);
  assertEquals(replyTokenFrom([`sales+${T}@adventures.story-tail.com`], MAILBOX), null, "another mailbox");
  assertEquals(replyTokenFrom([`info+${T}@adventures.story-tail.com.evil.com`], MAILBOX), null, "lookalike domain");
  assertEquals(replyTokenFrom([`info+short@adventures.story-tail.com`], MAILBOX), null);
  assertEquals(replyTokenFrom([], MAILBOX), null);
});

Deno.test("token: the server's delivery headers count as recipients", () => {
  const headers = h(`Delivered-To: info+${T}@adventures.story-tail.com\nTo: Gyasi at Story-Tail Adventures <info@adventures.story-tail.com>`);
  assertEquals(replyTokenFrom(recipientsOf(headers), MAILBOX), T);
});

Deno.test("fallback: the email answered, from In-Reply-To, then the last of ours in References", () => {
  assertEquals(outboxIdFrom(h(`In-Reply-To: <${OUTBOX}@adventures.story-tail.com>`), "adventures.story-tail.com"), OUTBOX);
  const older = "0195a2c0-0000-7000-8000-0000000000e0";
  assertEquals(
    outboxIdFrom(
      h(`References: <${older}@adventures.story-tail.com> <CAJ1@mail.gmail.com> <${OUTBOX}@adventures.story-tail.com>`),
      "adventures.story-tail.com",
    ),
    OUTBOX,
  );
  assertEquals(outboxIdFrom(h(`In-Reply-To: <${OUTBOX}@evil.com>`), "adventures.story-tail.com"), null, "not our domain");
  assertEquals(outboxIdFrom(h("In-Reply-To: <CAJ1@mail.gmail.com>"), "adventures.story-tail.com"), null);
});

Deno.test("dedupe: the email's own Message-ID, so a re-delivery is handled once; else the UID", () => {
  assertEquals(dedupeKey(h("Message-ID: <CAJ1@Mail.Gmail.com>"), "7", 3), "mid:<caj1@mail.gmail.com>");
  assertEquals(dedupeKey(h("Subject: no id"), "7", 3), "imap:7:3");
  assertEquals(dedupeKey(h("Message-ID: not-bracketed"), "7", 3), "imap:7:3");
});

// ── The sender's verdict ────────────────────────────────────────────────────

Deno.test("sender: DMARC pass, or both SPF and DKIM, in the TOPMOST Authentication-Results", () => {
  assert(senderVerified(h("Authentication-Results: mx.ionos.com; dmarc=pass header.from=example.com")));
  assert(senderVerified(h("Authentication-Results: mx.ionos.com; spf=pass smtp.mailfrom=example.com; dkim=pass header.d=example.com; dmarc=none")));
  assert(!senderVerified(h("Authentication-Results: mx.ionos.com; spf=pass; dkim=fail; dmarc=none")));
  assert(!senderVerified(h("Subject: hi")), "no verdict at all fails closed");
});

Deno.test("sender: a verdict the SENDER wrote lower down is ignored (RFC 8601)", () => {
  const forged = h(
    "Authentication-Results: mx.ionos.com; spf=fail; dkim=none; dmarc=fail\n" +
      "Authentication-Results: mx.ionos.com; dmarc=pass",
  );
  assert(!senderVerified(forged));
});

// ── Automatic answers ───────────────────────────────────────────────────────

Deno.test("auto replies: RFC 3834 headers, the usual vendor headers and subjects", () => {
  assert(isAutoReply(h("Auto-Submitted: auto-replied"), "Re: Bahamas"));
  assert(!isAutoReply(h("Auto-Submitted: no"), "Re: Bahamas"));
  assert(isAutoReply(h("Precedence: auto_reply"), "Re: Bahamas"));
  assert(isAutoReply(h("X-Autoreply: yes"), "Re: Bahamas"));
  assert(isAutoReply([], "Automatic reply: Gyasi wrote about Bahamas"));
  assert(isAutoReply([], "Out of Office: back Monday"));
  assert(!isAutoReply(h("From: jordan@example.com"), "Re: Gyasi wrote about Bahamas"));
  assert(!isAutoReply([], "Out of this world trip, thanks!"));
});

// ── Parts ───────────────────────────────────────────────────────────────────

const multipart = {
  type: "multipart/mixed",
  childNodes: [
    {
      type: "multipart/alternative",
      childNodes: [
        { part: "1.1", type: "text/plain" },
        { part: "1.2", type: "text/html" },
      ],
    },
    { part: "2", type: "image/png", disposition: "inline", id: "<logo>" },
    { part: "3", type: "application/pdf", disposition: "attachment", dispositionParameters: { filename: "passport.pdf" } },
    { part: "4", type: "image/jpeg", parameters: { name: "photo.jpg" } },
  ],
};

Deno.test("parts: the plain text is read; files are counted, signature images are not", () => {
  assertEquals(textPart(multipart), { part: "1.1", html: false });
  assertEquals(countFiles(multipart), 2);
});

Deno.test("parts: HTML only when there is no plain text; a single part is part 1", () => {
  assertEquals(textPart({ type: "multipart/alternative", childNodes: [{ part: "1", type: "text/html" }] }), { part: "1", html: true });
  assertEquals(textPart({ type: "text/plain" }), { part: "1", html: false });
  assertEquals(textPart({ type: "image/png", disposition: "attachment" }), null);
  assertEquals(countFiles(undefined), 0);
});

// ── The new words only ───────────────────────────────────────────────────────

Deno.test("words: Gmail and Apple Mail history is cut", () => {
  const text =
    "Perfect, see you then!\n\nOn Fri, Oct 16, 2026 at 9:05 AM Gyasi at Story-Tail Adventures <info@adventures.story-tail.com> wrote:\n> Your ferry is booked.";
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
