---
name: audit-pci
description: Verify whether a code change keeps the platform inside PCI DSS SAQ A scope. Checks for raw PAN storage, missing audit middleware, exposed Stripe PaymentMethod IDs in API responses, missing PAN scrubbing in logging, and other PCI scope creep. Triggers on "audit PCI", "is this PCI safe?", or after any change touching Stripe, supabase/functions/stripe-*, or payment_card-adjacent code.
---

# audit-pci

## Purpose

Maintain PCI DSS SAQ A eligibility by running a checklist of automated and manual checks against the working tree (or a PR diff). The platform never stores raw card data — every code change that touches payments must preserve that invariant.

Per `docs/BRD.md` §10 and `docs/Tech-Recommendations.md` §4: Story-Tail is **not** the merchant of record, uses Stripe for tokenization only, and qualifies for SAQ A. Self-hosting a card vault would push the platform to SAQ D ($60K-$180K/year compliance overhead). Don't let scope drift make us SAQ D-eligible by accident.

## When to use

Run this skill:
- Before any merge that touches `supabase/functions/stripe-*/`
- Before any merge that touches `web/components/payment/*` or `mobile/.../ui/payment/*`
- After any migration that adds a column to `payment_card`, `card_authorization`, or `card_use_event`
- On user request: "audit PCI", "is this PCI safe?", "PCI check"
- Quarterly, as part of the standing ASV scan workflow (also see `run-vulnerability-scan`)

## Procedure

1. **Search for raw card data in source.**
   ```bash
   # Hunt for plausible PAN patterns and field names that shouldn't exist
   grep -rEn "[0-9]{16}|[0-9]{4}-[0-9]{4}-[0-9]{4}-[0-9]{4}" --include="*.ts" --include="*.tsx" --include="*.kt" --include="*.sql"
   grep -rEn "raw_pan|card_number|full_card|cvv|cvc|card_security_code" --include="*.ts" --include="*.tsx" --include="*.kt" --include="*.sql"
   ```
   Any non-test match is a defect.

2. **Verify no PAN columns in migrations.**
   ```bash
   grep -rn "card_number\|raw_pan\|full_card\|cvv\|cvc" supabase/migrations/
   ```
   The only allowed card-related columns are: `stripe_payment_method_id`, `stripe_customer_id`, `brand`, `last4`, `exp_month`, `exp_year`. Anything else is a defect.

3. **Verify Stripe `PaymentMethod` IDs are not returned to clients.**
   ```bash
   # Look for handlers that select stripe_payment_method_id and return it in a response
   grep -rn "stripe_payment_method_id" supabase/functions/ web/ contracts/openapi.yaml
   ```
   The `stripe_payment_method_id` should only appear in `_shared/stripe.ts` helpers and in functions that explicitly use it server-side (e.g., `stripe-vault-forward`). It should **never** appear in an Edge Function's return value or in the OpenAPI response schemas.

4. **Verify PAN-scrubbing in logging.**
   ```bash
   grep -rn "Sentry\|console.log\|console.error" supabase/functions/ web/ mobile/
   ```
   Sentry's `beforeSend` hook must scrub anything that looks like a 16-digit PAN. Verify this is configured in:
   - `web/lib/sentry.ts`
   - `supabase/functions/_shared/observability.ts`
   - `mobile/shared/src/.../Sentry.kt`

5. **Verify audit middleware is invoked on every payment mutation.**
   For every Edge Function in `supabase/functions/stripe-*`, `commission-*`, or `card-use-*`, confirm there's a call to `_shared/audit.ts` writing an `AuditEvent`. Per `docs/Data-Model.md` §20.3.

6. **Verify MFA step-up on the PAN reveal flow.**
   In `supabase/functions/stripe-reveal-pan/index.ts`, confirm:
   - JWT verification at start
   - MFA step-up enforcement (recent MFA challenge required)
   - Justification required (supplier, amount, reason)
   - Audit event written before the reveal happens
   - Time-limited response (token to retrieve PAN expires fast)

7. **Verify Stripe secret key is never exposed.**
   ```bash
   grep -rn "STRIPE_SECRET_KEY\|sk_live_\|sk_test_" web/ mobile/
   ```
   Must return zero matches in client code. The secret key lives only in Supabase environment variables.

8. **Run a quarterly retention check.**
   - `auth_event` rows older than 1 year — should be purged
   - `audit_event` rows older than 7 years (10 years for card-related events) — review retention policy
   - Sessions older than 90 days post-revocation — should be purged

9. **Generate a SAQ A status summary.** Output a short report:
   ```
   PCI SAQ A audit — <date>
   ✓ No raw PAN in source
   ✓ No PAN columns in migrations
   ✓ Stripe PaymentMethod IDs server-only
   ✓ PAN scrubbing in observability
   ✓ Audit middleware on payment paths
   ✓ MFA step-up on reveal flow
   ✓ Stripe secret key not exposed
   ⚠ Retention: <issue or OK>
   Overall: PASS / FAIL
   ```

## What this skill never does

- Approves code that stores any portion of a PAN beyond brand/last4/expiration.
- Approves code where Stripe `PaymentMethod` IDs leak to client roles.
- Lets a merge proceed if any check fails — the audit blocks the merge until the issue is fixed.
- Touches the actual Stripe vault. We never decrypt PANs in our code; Stripe does that on our behalf via Vault and Forward.
