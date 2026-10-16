# Email Provider Review: Postmark vs Resend (§3.10 Stage 4)

Written 2026-10-16 for Gyasi's ruling (2026-10-13): "email is Stage 4; bring a Postmark vs
Resend comparison; it needs DNS records on the domain and a security review." BRD §7 and
Tech-Recommendations §4 already name these two and no others. Prices were read from each
provider's pricing page on 2026-10-16; check again before paying.

Status: **route chosen 2026-10-16 (§6), nothing built.** No key exists and no DNS has changed.

## 1. What we would send

Story-Tail is one advisor today, US only. A busy month is a few hundred emails:

| Kind | Rough volume | Notes |
|---|---|---|
| Advisor reply reaches a client by email | 100 to 400 / month | The main Stage 4 job |
| Client wrote, tell the advisor | 50 to 200 / month | Push already does this (§3.10.7) |
| Supabase Auth mail (sign-up, reset, magic link, email change) | 20 to 100 / month | Today on Supabase's built-in sender, which is rate limited and not meant for production |
| Later: pre-trip reminders, payment-authorization asks (BRD §6.6) | grows with trips | Out of scope for Stage 4 |

So either provider's smallest tier covers us for a long time. Price is not the deciding factor.

## 2. Side by side

| | **Postmark** | **Resend** |
|---|---|---|
| Free tier | 100 emails / month, never expires | 3,000 / month, **100 / day cap** |
| First paid tier | Basic $15 / mo, 10,000 emails | Pro $20 / mo, 50,000 emails, no daily cap |
| Reply by email (inbound) | **Pro ($16.50) and up only** | Every plan, free included |
| Inbound delivery | Webhook carries the parsed message | Webhook says "mail arrived"; we fetch the body and attachments over the API with temporary links |
| Message history kept | 45 days (paid) | 30 days |
| Audits stated on its own site | GDPR; data center is SOC 1 Type 2; **no SOC 2 claim found** | **SOC 2 Type II** and GDPR on all plans |
| Track record | Since 2010, known for strict transactional-only sending and inbox placement | Since 2023, developer focused, fast growing |
| Separate streams | Transactional and broadcast streams kept apart on different IPs | One stream; marketing goes through a separate "Broadcasts" product |
| How we would call it | Plain `fetch` to a REST API from an Edge Function. No SDK | Plain `fetch` to a REST API from an Edge Function. No SDK |
| Can also be Supabase Auth's SMTP | Yes | Yes |

**Cost for us in year one:** Postmark is $16.50 / mo once reply-by-email is on (Basic has no
inbound). Resend is $0 until we pass 100 emails in one day or 3,000 in a month, then $20 / mo.

## 3. Recommendation: Resend

1. **Reply by email is included at no cost.** If clients can answer an email and have it land in
   the thread, that is the feature that makes email worth having. Postmark charges a higher
   tier for it.
2. **A SOC 2 Type II report is stated.** Postmark's site claims its data center's audit, not its
   own. For a vendor that will read every client email, that matters. (Ask Postmark if we lean
   their way; they may have one they don't advertise.)
3. **Fetch-on-receipt for inbound** matches how we built Android push: the webhook is a doorbell,
   and we read the words over an authenticated call.

What we give up: Postmark's longer track record and its reputation for getting into inboxes.
For a few hundred personal, one-to-one emails a month from a properly set up domain, that gap is
small. The 100-a-day free cap is the one real limit: a day of group-trip reminders could hit it,
and the fix is the $20 plan.

## 4. Security review

### 4.1 The provider reads everything we send

Email is not end to end. Whoever we pick sees each email's words, as Google sees FCM payloads.
That drives three rules:

- **Never put a card number in an email.** A client can already type a card number into a
  message (flagged in §3.10.7: `message.body` can hold one, and the notification masks it as
  "•••• 4242"). Any email built from a message body runs the same masking first, or Rule 1 and
  PCI SAQ A scope are both broken by an email.
- **No Stripe ids, no links that sign someone in.** Links in an email open the app, which asks
  for a session the normal way. A link that carries a token is a password in someone's inbox.
- **A decision for Gyasi (Q1 below):** does the email carry the advisor's words, or only "Gyasi
  wrote you, open it in the app"? Words are friendlier; a notice keeps the trip's details out of
  the provider and out of every inbox it is forwarded to.

### 4.2 Keys and secrets

- One **sending-only** API key per environment, stored as an Edge Function secret
  (`EMAIL_API_KEY`), never in the web app, never in the phone. Resend keys can be limited to
  sending from one domain; use that.
- The inbound webhook is checked with the provider's **signing secret** (Resend signs with
  Svix headers; Postmark uses basic auth on the URL). An unsigned or stale request is refused
  before anything is read.
- Supabase Auth SMTP gets its own key, so revoking one never silently breaks the other.

### 4.3 Inbound mail is untrusted

A reply by email is a stranger's input until proven otherwise:

- **Match on a per-thread reply address** (`reply+<random token>@reply.<domain>`), never on the
  From header, which anyone can fake. The token maps to one conversation and one client; mail to
  a wrong or old token is dropped.
- Also require the From address to match that client's email. Both must agree.
- Keep only the new text: strip the quoted history and signatures, cap at the message limit
  (8,000), store as plain text. Never render inbound HTML.
- Attachments go through the same type and size checks as in-app attachments (§2.6), or are
  refused in Stage 4 to keep it small (Q4).
- Every inbound message is written through the same path as an in-app client message, so audit,
  unread counts and push all behave the same.

### 4.4 Domain and DNS (Gyasi does these, in the registrar)

- Send from a **subdomain** (for example `mail.story-tail.com`), so a mistake can never hurt the
  main domain's mail reputation.
- **SPF and DKIM** records from the provider; **DMARC** at `p=none` with reports for a few weeks,
  then `quarantine`.
- Inbound needs an **MX record** on its own subdomain (for example `reply.story-tail.com`) so the
  main domain's mail is untouched.

### 4.5 What stays out

- No marketing email through this account (BRD §7 keeps marketing in Mailchimp or ConvertKit).
- No open or click tracking. It adds tracking pixels and rewritten links to personal letters,
  and it is the wrong tone for the brand (Design-System §2).
- No client billing of any kind (BRD §10.5); nothing in email asks a client to pay Story-Tail.

## 5. Questions to settle before building

- **Q1.** Advisor reply email: the full message, or a short "you have a new message" notice?
- **Q2.** Reply by email: in Stage 4, or later?
- **Q3.** Move Supabase Auth mail onto the same provider now?
- **Q4.** Attachments: in emails out, and accepted on replies in?
- **Q5.** Which emails a client can turn off, now that 2.5.6 would have something to switch.
- **Q6.** When the email goes: right away, or after a short wait so a client who is already in
  the app does not get both?
- **Q7.** Plain text, or simple branded HTML (logo, colors, a button)?
- **Q8.** Domain and sending names: which domain, and "Gyasi at Story-Tail Adventures
  <gyasi@mail…>" or a shared address?
- **Q9.** Rest hours (9pm to 7am, Sundays) for email too, or only for push?

## 6. Rulings (Gyasi, 2026-10-16)

Gyasi asked whether his own SMTP mailbox (IONOS) could send. That added a third option, and
it won as a **hybrid**:

- **Outbound: IONOS SMTP**, `smtp.ionos.com` on **port 465**. Supabase Edge Functions block
  outbound ports 25 and 587 (Supabase "Edge Functions limits"), so 465 with implicit TLS is the
  only way out. IONOS caps sending at 500 an hour once a mailbox is 30 days old (50 an hour in its
  first week); enough for us.
- **From a new IONOS mailbox used only by the app**, never Gyasi's main one. IONOS likely
  offers no send-only password, so the secret is a full mailbox login; a dedicated mailbox means
  a leak cannot read his personal mail.
- **Inbound: Resend, receiving only, free tier.** Every email carries a per-thread
  `Reply-To: reply+<token>@reply.<domain>`; that subdomain's MX points at Resend; the webhook is
  a doorbell and the function fetches the reply (§4.3's checks all apply). The main domain's MX
  stays at IONOS, untouched.
- **Q1: the full message**, card numbers masked, with a link to the thread.
- **Q2: reply by email is in Stage 4.**
- **Q3: Supabase Auth mail moves now**, onto the same IONOS SMTP (Auth's own server is not bound
  by the Edge Function port block), with its own credentials.
- **No copy to Gyasi.** The thread is the record. SMTP sends are not saved to IONOS's Sent folder,
  and no BCC is added.

Second round, same day:

- **Q5: one opt-out link in every email**, "Stop emailing me about messages". It turns off this
  email for that client only; push and in-app are untouched. §2.5.6's full matrix comes later.
- **Q6: a short wait** of about five minutes. If the client has read the message in the app by
  then, no email goes.
- **Q7: simple branded HTML** (the words first, a small logo, an "Open the conversation" button,
  Design-System colors) with a plain-text part beside it.
- **Q4: attachment names only.** The email lists file names and links to the thread. A reply
  with files is saved without them, and the client is told to add files in the app.
- **Q9: rest hours apply, in the client's zone** (`platform_user.time_zone`, Data-Model §5.2):
  a reply written 9pm to 7am is held until 7am, and Sunday's wait for Monday 7am.
- **Q8: sender "Gyasi at Story-Tail Adventures"**, from the app-only mailbox on
  **`adventures.story-tail.com`** (the IONOS mail domain). The reply subdomain is
  **`reply.story-tail.com`** (my call, not his): it is a separate name, so pointing its MX at
  Resend cannot touch the IONOS domain's mail.

Owed before building: ~~a Data-Model spec for the email queue and the per-client opt-out~~
(written 2026-10-16: Data-Model §12.8 EmailOutbox, §12.9 EmailToken, §12.10 InboundEmail,
`message.channel`, and §12.5's first writer; two open questions in §23), ~~the SMTP library's
security review~~ (written 2026-10-16: `docs/SMTP-Library-Security-Review.md`, nodemailer
10.0.14, approved by Gyasi 2026-10-16; §23's two questions ruled the same day), and DNS from Gyasi (SPF and DKIM for
IONOS on `adventures.story-tail.com` if not already there, DMARC, and the `reply.story-tail.com`
MX).

What this changes in §2 to §4: Resend's 100 a day and 3,000 a month now count only inbound
replies. Sending over SMTP from Deno needs an **SMTP library**, a new third-party dependency, so
it gets its own security review before it is added (CLAUDE.md: no new SDK without one). Two
vendors now hold mail: IONOS sees everything sent, Resend sees every reply.

## Sources

- Postmark pricing: https://postmarkapp.com/pricing
- Postmark security: https://postmarkapp.com/security
- Resend pricing: https://resend.com/pricing
- Resend receiving: https://resend.com/docs/dashboard/receiving/introduction
- Supabase Edge Functions limits (ports 25 and 587 blocked): https://supabase.com/docs/guides/functions/limits
- IONOS sending limits: https://www.ionos.com/help/email/general-topics/what-are-the-mass-mailing-limits/
