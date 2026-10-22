import { assert, assertEquals, assertMatch, assertStringIncludes, assertThrows } from "jsr:@std/assert@^1";
import { type EmailConfig, emailConfigFromEnv } from "./email.ts";
import { buildSignInEmail, NEXT_PATH, signInUrl, type SignInEmailKind, VERIFY_TYPE } from "./signInEmail.ts";

const prodEnv: Record<string, string> = {
  EMAIL_SMTP_HOST: "smtp.ionos.com",
  EMAIL_SMTP_USER: "gyasi.messages@adventures.story-tail.com",
  EMAIL_SMTP_PASSWORD: "secret",
  EMAIL_FROM_ADDRESS: "gyasi.messages@adventures.story-tail.com",
  EMAIL_SITE_URL: "https://storytailadventures.vercel.app/",
  EMAIL_UNSUBSCRIBE_URL: "https://x.supabase.co/functions/v1/email-unsubscribe",
};
const cfg: EmailConfig = emailConfigFromEnv((n) => prodEnv[n])!;

// GoTrue's hashed_token: hex SHA-224 of email + OTP.
const HASH = "a3f1c2d4e5b6a7980112233445566778899aabbccddeeff00112233";

function build(kind: SignInEmailKind, over: Partial<Parameters<typeof buildSignInEmail>[0]> = {}) {
  return buildSignInEmail({
    kind,
    to: "jordan.hayes@example.com",
    clientFirstName: "Jordan",
    agentFirstName: "Gyasi",
    tokenHash: HASH,
    messageKey: "0195a2c0-0000-7000-8000-0000000000f1",
    ...over,
  }, cfg);
}

Deno.test("the link goes to /auth/confirm on the site, with the hash, type and a fixed next", () => {
  for (const kind of ["reset", "magic_link", "invite"] as const) {
    const url = new URL(signInUrl(cfg, kind, HASH));
    assertEquals(url.origin, "https://storytailadventures.vercel.app");
    assertEquals(url.pathname, "/auth/confirm");
    assertEquals(url.searchParams.get("token_hash"), HASH);
    assertEquals(url.searchParams.get("type"), VERIFY_TYPE[kind]);
    assertEquals(url.searchParams.get("next"), NEXT_PATH[kind]);
  }
  assertEquals(VERIFY_TYPE.reset, "recovery");
  assertEquals(NEXT_PATH.reset, "/reset-password");
});

Deno.test("a token hash that is not GoTrue's shape is refused, not sent", () => {
  assertThrows(() => signInUrl(cfg, "reset", "not-a-hash&next=https://evil.example"));
  assertThrows(() => signInUrl(cfg, "reset", ""));
  assertThrows(() => signInUrl(cfg, "reset", HASH.toUpperCase()));
});

Deno.test("each email carries the link in both parts and names the advisor", () => {
  for (const kind of ["reset", "magic_link", "invite"] as const) {
    const e = build(kind);
    const link = signInUrl(cfg, kind, HASH);
    assertStringIncludes(e.text, link);
    assertStringIncludes(e.html, link.replace(/&/g, "&amp;"));
    assertStringIncludes(e.text, "Gyasi");
    assertStringIncludes(e.text, "Hi Jordan,");
    assertEquals(e.from.name, "Gyasi at Story-Tail Adventures");
    assertEquals(e.from.address, cfg.fromAddress);
    assertEquals(e.to, "jordan.hayes@example.com");
    assertMatch(e.messageId, /^<0195a2c0-0000-7000-8000-0000000000f1@adventures\.story-tail\.com>$/);
  }
});

Deno.test("reset and magic link say it was asked for and is safe to ignore", () => {
  for (const kind of ["reset", "magic_link"] as const) {
    const e = build(kind);
    assertStringIncludes(e.text, "because you asked for help signing in");
    assertStringIncludes(e.text, "you can ignore this email");
    assertStringIncludes(e.text, "for the next hour");
  }
  assertStringIncludes(build("invite").text, "you can ignore it");
});

Deno.test("the subject holds no link and no token", () => {
  for (const kind of ["reset", "magic_link", "invite"] as const) {
    const e = build(kind);
    assert(!e.subject.includes(HASH));
    assert(!e.subject.includes("http"));
  }
});

Deno.test("names cannot inject a header or markup", () => {
  const e = build("reset", { agentFirstName: "Gyasi\r\nBcc: x@evil.example", clientFirstName: "<b>Jo</b>" });
  assertEquals(e.from.name, "Gyasi at Story-Tail Adventures");
  assert(!e.subject.includes("\n"));
  assert(!e.html.includes("<b>Jo</b>"));
  assertStringIncludes(e.html, "Hi &lt;b&gt;Jo&lt;/b&gt;,");
});

Deno.test("missing names fall back gently", () => {
  const e = build("magic_link", { agentFirstName: null, clientFirstName: "  " });
  assertStringIncludes(e.text, "Hi,\n");
  assertEquals(e.subject, "Your sign-in link from Your advisor");
  assertEquals(e.from.name, "Your advisor at Story-Tail Adventures");
});

Deno.test("a recipient that is not one address is refused", () => {
  assertThrows(() => build("reset", { to: "a@example.com, b@example.com" }));
  assertThrows(() => build("reset", { to: "" }));
});
