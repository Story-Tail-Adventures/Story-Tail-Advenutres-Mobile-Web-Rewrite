# SMTP Library Security Review (§3.10 Stage 4)

Written 2026-10-16. CLAUDE.md requires a security review before any new third-party SDK. Stage 4
sends client email through IONOS SMTP from an Edge Function (`docs/Email-Provider-Review.md` §6),
and Deno has no SMTP client built in, so something has to speak SMTP. This picks it.

Status: **approved by Gyasi 2026-10-16: nodemailer 10.0.14.** Nothing is added to the repo yet;
§5 binds the build.

## 1. What the library will be trusted with

- **The app mailbox's IONOS password.** IONOS likely has no send-only password, so this login
  can also read that mailbox. That is why the mailbox is app-only (§6 of the provider review).
- **Every email's words:** the advisor's replies, a client's first name, trip names.
- **One recipient per email**, a client's verified account email.

What it will **not** touch: card data (masked before the library sees a body, Data-Model §12.8),
Stripe ids, files (attachment names only in Stage 4), inbound mail (Resend's API, over `fetch`).

## 2. The options

| | **nodemailer** | **Upyo** (`@upyo/smtp`) | **Write our own** |
|---|---|---|---|
| Version looked at | 10.0.14 (2026-10-03) | 0.6.0 (2026-09-09) | n/a |
| Use | ~25.7 million downloads a week | ~3,200 a week | us only |
| Dependencies | **none** | `@upyo/mime`, `@upyo/core` | none |
| Maintainers | one (Andris Reinman, since 2010) | one (Hong Minhee) | us |
| Licence | MIT-0 | MIT | n/a |
| Runtimes | Node first; Deno through its Node layer | Node, Deno, Bun by design | Deno |
| How it connects | `node:net` / `node:tls` | `node:net` / `node:tls` too | `Deno.connectTls` |
| Known advisories | many, all fixed by 10.0.9 (§3) | none filed | none yet, because nobody has looked |

## 3. nodemailer's advisory history, read honestly

GitHub lists about twenty advisories, most of them filed in August and September 2026, all
patched by **10.0.9**. They fall into four groups:

- **Address parser slowdowns (denial of service)** from crafted address lists. We pass one
  address we already validated, never a list from outside.
- **File and URL reads** through message options (`raw`, `resolveContent`, `jsonTransport`).
  We turn both off (§5) and never pass paths or URLs as content.
- **Header and command injection** through CRLF in the `name` option, `envelope.size` or List-*
  header comments. We set those values ourselves, from constants or checked data.
- **TLS and DNS handling**: OAuth2 token fetches without certificate checks (we don't use
  OAuth2), and a shared DNS cache reusing a TLS server name across transports (we have one
  transport, one host).

The burst reads as a lot of people looking hard at a very widely used library, with fixes
landing in days. That is a better sign than a small library nobody has audited. The cost is
churn: about 25 releases in the last two months, so Dependabot will be busy (§6).

## 4. Recommendation: nodemailer, pinned to 10.0.14

1. **Most reviewed code for the job by far, with no dependencies.** The supply chain is one
   package, MIT-0.
2. **Proven on our runtime, not assumed.** On 2026-10-16 a probe connected to `smtp.ionos.com:465`
   over TLS and ran `verify()` (greeting and EHLO, no login) successfully, **both under Deno 2.9.6
   and inside `supabase/edge-runtime:v1.76.2`**, the image `supabase start` runs. Hosted
   Supabase uses the same runtime, and only ports 25 and 587 are blocked there.
3. **10.0.14 is the newest release at least two weeks old**, and it is past every fix above.

Why not the others:

- **Upyo** is well made and built for Deno, but it is pre-1.0, about 8,000 times less used,
  and has never had an advisory because almost nobody has looked. It also goes through
  `node:tls`, so it is not more native than nodemailer. Revisit at 1.0.
- **Our own client** is about 200 lines for the SMTP talk, but MIME is the hard part (header
  encoding, line lengths, dot-stuffing, CRLF handling). That is exactly where nodemailer's
  advisories cluster, and we would be finding those bugs ourselves, in production.

## 5. How it must be used (the build follows these)

- **Import by exact version:** `npm:nodemailer@10.0.14`, recorded in the function's `deno.lock`
  (integrity `sha512-eJoLFKg55fesSlzUekmfOv/SBXh4KUYT8oiQc2RLP0tfG0rbNMJBK7wgHJwXTJwqyKlSJMz9UzDZ4v+aHEvo8g==`).
  Only `email-dispatch` imports it; nothing in `web/` or `mobile/`.
- **Transport:** `host: "smtp.ionos.com"`, `port: 465`, `secure: true`, `requireTLS: true`.
  **Never set `tls.rejectUnauthorized: false`**, and no `ignoreTLS`. One transport, no pool:
  the dispatcher sends a small batch and closes.
- **Turn off what we don't use:** `disableFileAccess: true` and `disableUrlAccess: true` on
  the transport, no `raw`, no `attachments` (names only in Stage 4), no OAuth2, no DKIM in the
  library (IONOS signs for its own domain).
- **We build every header value.** From, Reply-To, List-Unsubscribe, Message-ID, In-Reply-To and
  Subject come from constants and ids. To is the **bare address** with no display name, so a
  client's chosen name never reaches a header. Any value with CR or LF is refused before the
  library sees it. The recipient must match a simple address check and be the account's
  verified email (Data-Model §12.8).
- **Logging off:** `logger: false`, `debug: false`. nodemailer's logger prints whole messages.
  An error is stored as the SMTP code plus at most 200 characters of server text, with no
  address or body (Data-Model §12.8 `last_error`).
- **Timeouts inside Supabase's limits:** connection and greeting 10 seconds, socket 20 seconds;
  a run stops claiming rows well before the function's wall-clock limit.
- **Secrets:** `IONOS_SMTP_USER` and `IONOS_SMTP_PASSWORD` as Edge Function secrets, read only
  by `email-dispatch`. Supabase Auth's SMTP setting gets its own entry in the dashboard; if IONOS
  allows a second mailbox, Auth gets that one, so revoking one never breaks the other.

## 6. Keeping it safe after it ships

- **Bumps are read, not auto-merged.** A nodemailer bump moves only to a version at least two
  weeks old, after reading its changelog and any new advisory. This matches the Saturday
  Dependabot routine.
- **Advisories:** a new advisory in a part we use (address parsing on one address, SMTP
  connection, header building) is a same-week bump. One in a part we turned off is noted and
  waits for the next routine pass.
- **If IONOS changes how it authenticates** (for example to OAuth only), stop and review again
  before turning on nodemailer's OAuth2 path.

## 7. Not yet verified

- **A real login and send.** The probe stopped before AUTH; it needs the app mailbox, which
  doesn't exist yet. First check on the build: `verify()` with credentials, then one email to
  Gyasi.
- **Hosted egress on 465.** Proven locally on the same runtime image; check from the deployed
  function on first deploy.
- **IONOS's DKIM signing for `adventures.story-tail.com`**, and SPF and DMARC records. Check
  with a test email's headers once the DNS is set.

## Sources

- nodemailer on npm (versions, licence, dependencies): https://www.npmjs.com/package/nodemailer
- nodemailer advisories: https://github.com/advisories?query=nodemailer
- Upyo: https://jsr.io/@upyo/smtp and https://hackers.pub/@hongminhee/2026/sending-emails-nodejs-deno-bun
- Supabase Edge Functions limits: https://supabase.com/docs/guides/functions/limits
