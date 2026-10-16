# IMAP Library Security Review (§3.10 Stage 4, replies by email)

Written 2026-10-16. Gyasi ruled the same day that client replies by email are read from the
app's own IONOS mailbox, `info@adventures.story-tail.com`, over IMAP, **instead of Resend**
(`docs/Email-Provider-Review.md` §6). Deno has no IMAP client, so this picks one, as
`docs/SMTP-Library-Security-Review.md` did for sending. CLAUDE.md requires the review before the
dependency is added.

Status: **approved by Gyasi 2026-10-16: imapflow 2.2.1.** §3 and §3a bind the build.

## 1. What changes, and what the library is trusted with

- **The same `info@` login the app already holds for sending.** It can already read that mailbox,
  so reading with it adds no new exposure. Nobody else uses `info@` (Gyasi, 2026-10-16); if it
  ever becomes a public address, the app moves to its own mailbox first, for both directions.
- **Every reply a client sends**, and anything else that lands in `info@`, including spam. That is
  untrusted input in full: headers, MIME structure, charsets, attachments.
- Out of scope, unchanged: the queue, the tokens, `email_inbound_record`'s checks, the opt-out.

## 2. The library: imapflow

| | **imapflow** |
|---|---|
| Version recommended | **2.2.1** (2026-10-01), the newest release at least two weeks old |
| Use | about 2.6 million downloads a week |
| Maintainer | Andris Reinman, who also maintains nodemailer (one person) |
| Licence | MIT |
| Known advisories | **none filed** (GitHub advisory database, 2026-10-16) |
| Dependencies | 8 direct, **25 packages in all**; `npm audit` clean |
| Release pace | about 40 releases in the last two months (2.5.2 on 2026-10-16) |
| Integrity | `sha512-d7/sRGEtexA8e0Y71sN0rKfB2yWgZMHY8JqCbk17arRLGicjX1LpBuxPH+wowOIA5sVWs7U//B6S+mKfrBtT6w==` |

The tree is larger than nodemailer's (zero). It includes `pino` (logging), `socks` (proxy support
we never use), `iconv-lite` and `encoding-japanese` (charsets), and `libmime` / `libqp` /
`@zone-eu/mailsplit` (MIME). The parsing packages are the ones that matter: they read
attacker-written mail. They are the same author's widely used mail stack.

**Proven on our runtime.** On 2026-10-16, imapflow 2.2.1 loaded inside
`supabase/edge-runtime:v1.76.2` (no worker-thread trouble from `pino` with `logger: false`),
connected to `imap.ionos.com:993` over TLS and read the capabilities, stopping at login as expected
with no credentials sent: `IMAP4rev1 IDLE MOVE UIDPLUS SPECIAL-USE AUTH=PLAIN …`. Port 993 is not
one Supabase blocks.

**Why not the alternatives.** Writing our own IMAP client means parsing literals and untagged
responses, then MIME, from attacker-written mail: exactly where bugs become security bugs. POP3 is
simpler to speak but still needs the same MIME parsing and can only download-and-delete. Resend was
the alternative to all of this and was ruled out for an extra vendor, a DNS record and a webhook.

## 3. How it must be used (binds the build)

- **Exact version** `npm:imapflow@2.2.1` in `deno.lock`, imported only by the polling function.
- **TLS only:** port 993, `secure: true`, certificates checked (`tls.rejectUnauthorized` never
  false), no STARTTLS downgrade, no proxy options.
- **`logger: false`:** its logger can print message contents.
- **Read by UID, move when done.** Fetch new messages in `INBOX` by UID, hand each to the same checks
  `email_inbound_record` runs today, then `MOVE` it to a `Processed` (or `Rejected`) folder, so a
  reply is never handled twice and the inbox stays readable. `inbound_email.provider_email_id`
  becomes the message's `Message-ID` (or mailbox UID validity plus UID), keeping the dedupe.
- **Size and count limits:** skip and move aside any message over a size cap (e.g. 1 MB) without
  downloading it, and handle at most a few dozen per run, inside the function's time limit.
- **Text only:** take the `text/plain` part (or HTML turned into text, as now); never download
  attachments, only count them.
- **No new trust in headers.** The reply token stays the first lock. The sender check needs a
  verdict that the From domain authenticated; Resend gave one, IONOS may add an
  `Authentication-Results` header. Until a real reply shows what IONOS adds, a reply whose sender
  cannot be verified is rejected (fail closed).

## 3a. Build decisions (2026-10-16)

- **The reply address is the mailbox's own plus address:** `info+<token>@adventures.story-tail.com`,
  built from `EMAIL_FROM_ADDRESS`. `EMAIL_REPLY_DOMAIN` is retired.
- **Fallback when plus addressing is lost** (IONOS rewrites it, or a mail app replies to From): our
  `Message-ID` is `<outbox-id@adventures.story-tail.com>`, so the reply's `In-Reply-To` /
  `References` names the email it answers, and the SQL finds that email's reply token by
  `email_token.outbox_id`. This works while the outbox row exists (30 days); plus addressing works for
  the token's full year. Both paths still need the verified sender.
- **Which `Authentication-Results` counts:** only the TOPMOST one, the header IONOS adds on receipt.
  Any lower one was written by whoever sent the mail and is ignored (RFC 8601 §5). Pass is
  `dmarc=pass`, or `spf=pass` and `dkim=pass`; anything else fails closed.
- **Dedupe key:** the message's own `Message-ID` (`mid:<…>`), else `imap:<UIDVALIDITY>:<UID>`.
  First written as the UID only, because the sender chooses the Message-ID; local testing showed one
  reply delivered twice then posted twice, since a re-delivery gets a new UID. Abusing a chosen
  Message-ID would mean guessing a real reply's ID before it is sent, and nothing is accepted
  without a live reply token anyway.
- **Folders:** handled mail moves to `Processed` (accepted) or `Rejected` (everything else: spam,
  auto-replies, unknown tokens, oversize). The function creates both if missing. Nothing is deleted.
- **Pace:** every two minutes from pg_cron (`email_inbox_tick`), one IMAP login per run.
- **The Resend webhook function (`email-inbound`) and its Svix code are removed**, with their
  `config.toml` block and `RESEND_*` secrets. Its parsing helpers stay and are reused.

## 4. Open questions for the build

- **Plus addressing at IONOS.** The plan is `Reply-To: info+<token>@adventures.story-tail.com`. If
  IONOS does not deliver `info+…` to `info@`, the token rides in our `Message-ID` instead and is
  read back from the reply's `In-Reply-To` / `References`. The build does both; a test email
  settles which one IONOS honours.
- **What IONOS writes in `Authentication-Results`** for an incoming message (see §3).
- **Polling cost.** Once a minute is one TLS login per minute. If IONOS rate-limits logins, every
  two minutes is fine for travel planning.

## 5. Keeping it safe after it ships

The same rules as nodemailer: bumps only to versions at least two weeks old, read before merging; a
new advisory in parsing or connection code is a same-week bump. Watch the transitive packages too,
since that is where most of the tree is.

## Sources

- imapflow on npm (versions, licence, dependencies): https://www.npmjs.com/package/imapflow
- GitHub advisory database, searched for imapflow: https://github.com/advisories?query=imapflow
- IONOS mail server details (IMAP 993, POP3 995, SMTP 465): https://www.ionos.com/help/email/general-topics/ionos-mail-server-details-for-imap-pop3-and-smtp/
- Supabase Edge Functions limits (ports 25 and 587 blocked): https://supabase.com/docs/guides/functions/limits
