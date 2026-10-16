---
name: audit-pci
description: Verify a code change keeps the platform OUT of PCI DSS scope. Since 2026-10-16 the app holds no cardholder data at all (no vault, no Stripe); clients pay suppliers through advisor-entered https pay links. Checks for card numbers being accepted, stored, logged or displayed anywhere, payment-link guards (https only, advisor-only writes, audited), and Travefy-invoice/billing creep. Triggers on "audit PCI", "is this PCI safe?", or after any change touching payment_milestone, pay links, messages that may carry card numbers, or anything card-adjacent.
---

# audit-pci

## Purpose

Keep Story-Tail **out of PCI scope**. Since 2026-10-16 (BRD §10, Data-Model §9 and §18,
Tech-Recommendations §4) the platform never accepts, stores, logs or displays a card number.
There is no card vault and no Stripe: Stripe cannot show a stored card's full number, and vaults
that can cost $127 to $1,000 a month. Clients pay each supplier through a pay link on the payment
milestone (the supplier's own link, or a Travefy invoice that carries supplier cost only).

Anything that brings a card number into our systems would put the business in PCI scope (SAQ D:
$60K-$180K a year). This skill keeps that from happening by accident.

## When to use

- Before any merge that touches `payment_milestone`, `agent-trip`'s payment ops, pay-link UI on
  web or mobile, or the message/email paths (clients type card numbers into messages).
- After any migration that adds a column a person can type into on a payment surface.
- If anyone proposes bringing back a card table, a card SDK, Stripe, or a "view card" feature.
  That needs a new BRD decision, not a code review.
- On request: "audit PCI", "is this PCI safe?", "PCI check".

## Procedure

1. **No card tables or SDKs came back.**
   ```bash
   grep -rniE "payment_card|card_authorization|authorization_request|card_use_event|stripe" \
     supabase/migrations/*.sql supabase/functions web/lib web/app mobile/shared/src package.json web/package.json mobile/gradle/libs.versions.toml \
     | grep -v "^supabase/migrations/2026051\|^supabase/migrations/202609\|^supabase/migrations/2026100"
   ```
   Old migrations may still name the retired tables (they are history). Any NEW reference is a defect.

2. **No card-number fields.**
   ```bash
   grep -rEn "raw_pan|card_number|full_card|cvv|cvc|card_security_code" --include="*.ts" --include="*.tsx" --include="*.kt" --include="*.sql" .
   ```
   Any non-test, non-comment match is a defect.

3. **Free-text payment fields refuse card numbers.** `payment_milestone.pay_url`,
   `paid_reference` and `paid_note` must keep their Luhn card-number CHECK (Data-Model §9.5), and
   the Edge Function and web server action must refuse card-like digit runs before the database
   does. Confirm the SQL test still bites (builds a Luhn-valid number at runtime).

4. **Card numbers typed into messages are masked.** Clients can type a card number into a message
   or an email reply. Confirm the masking paths still run: `_shared/push.ts` (notifications), the
   email outbox/inbox masking (§3.10 Stage 4), and the phone notification text.

5. **Pay links stay safe.**
   - `https://` only, enforced by a CHECK and by `new URL()` normalisation in `agent-trip`.
   - Only the advisor writes them (`agent_set_milestone_pay_url`, service role only). Clients can
     read `pay_url` and `paid_reference`; they never write, and never read `paid_note`.
   - Every add, change and removal writes an `audit_event` row in the same transaction; a no-op
     writes nothing.
   - Clients see the link's host (lower-case, `www.` removed, punycode form) so a look-alike
     domain cannot pass as the real one.

6. **No client billing (BRD §10.5).** No "charge client", invoice entity, fee, or merchant flow.
   Travefy invoice links must carry supplier cost only; the app stores only the link.

7. **Logging.** No handler logs request bodies on payment or message paths:
   ```bash
   grep -rn "console.log\|console.error" supabase/functions/agent-trip supabase/functions/trip-message supabase/functions/email-*
   ```

8. **Report.**
   ```
   PCI scope audit, <date>
   ✓ No card tables, SDKs or Stripe reintroduced
   ✓ No card-number fields
   ✓ Payment free-text refuses card numbers (SQL + server)
   ✓ Message/notification/email masking intact
   ✓ Pay links: https only, advisor-only, audited, host shown
   ✓ No client billing
   ✓ No body logging on payment/message paths
   Overall: PASS / FAIL
   ```

## What this skill never does

- Approves code that accepts, stores, logs or displays a card number, in whole or in part,
  anywhere in our systems. (Last 4 digits included: there is no card to describe.)
- Approves a pay link a client can write, or a pay-link change with no audit row.
- Lets a merge proceed if any check fails.
