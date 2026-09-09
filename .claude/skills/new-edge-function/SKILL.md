---
name: new-edge-function
description: Scaffold a Supabase Edge Function with CORS, JWT verification, role gating, and audit middleware pre-wired. Triggers on "add an edge function", "create the X endpoint", "we need a server-side handler for Y", "scaffold a function", or whenever backend logic needs a new HTTP entry point.
---

# new-edge-function

## Purpose

Create a new Edge Function with the security plumbing already in place.

CLAUDE.md rule 3 — every mutation to a sensitive table writes an `audit_event` — is a
never-forget rule, and the only durable way to never forget is to make the audit wiring the
*default* in the scaffold rather than something review has to catch. Same for JWT
verification and CORS. This skill turns three compliance rules into a template.

## When to use

- "Add an Edge Function for X"
- "We need a server-side endpoint that does Y"
- Whenever `new-screen` step 7 says the screen needs an API call that isn't plain Supabase
  Auth or a plain RLS-protected table read

## Before you scaffold — three questions

The answers change the template, so ask them explicitly and record them in the header
comment:

1. **Which role(s) may call this?** `client`, `agent`, `admin`, or a combination. There is
   no "anyone" — if it is genuinely public, say so out loud and justify it.
2. **Does it mutate `payment_card`, `card_authorization`, `commission`, or `client`?** If
   yes, the mutation goes inside `withAudit`. Not beside it, inside it.
3. **Does it reach cardholder data?** If yes it needs `requireRecentMfa()`, and the audit
   row is written *before* the sensitive action, not after — so a crash mid-operation still
   leaves a trail.

## Procedure

1. **Scaffold.**
   ```bash
   supabase functions new <kebab-case-name>
   ```

2. **Replace the stub** with the project template:

   ```ts
   // <Name> — <one line on what it does and which screen calls it>
   //
   // Roles: <client|agent|admin>
   // Sensitive mutation: <yes: table | no>
   // MFA step-up: <required | not required>
   import { handlePreflight, corsHeaders } from "../_shared/cors.ts";
   import { requireUser, requireRole } from "../_shared/auth.ts";
   import { withAudit } from "../_shared/audit.ts";
   import { userClient } from "../_shared/db.ts";
   import { problem } from "../_shared/problem.ts";

   Deno.serve(async (req) => {
     const preflight = handlePreflight(req);
     if (preflight) return preflight;

     try {
       const ctx = await requireUser(req);
       requireRole(ctx, "agent");

       const body = await req.json();
       // Validate the body. Never trust a client-supplied id, role, or amount.

       const db = userClient(req);

       const result = await withAudit(
         ctx,
         { eventType: "<entity>.<verb>", targetEntity: "<entity>", targetId: body.id },
         async () => {
           // the mutation
         },
       );

       return Response.json(result, { headers: corsHeaders });
     } catch (err) {
       return problem(err);
     }
   });
   ```

3. **Default to `userClient`.** It forwards the caller's Authorization header, so RLS
   applies. `serviceClient()` bypasses RLS entirely — use it only where the function
   legitimately must (writing `audit_event`, handling a Stripe token), and leave a comment
   saying why. `supabase-reviewer` flags every unexplained use.

4. **Money is a string.** Transport `bigint` cents as a JSON string and parse to `bigint`.
   A JS `number` silently loses precision above 2^53, and the bug shows up months later as a
   reconciliation mismatch nobody can trace.

5. **Rule 4.** Do not return `stripe_payment_method_id` in any response body reachable by a
   client role. Check the shape you actually return, not just the row you queried.

6. **Describe it in the contract.** Add the path to `contracts/openapi.yaml` — request body,
   response, and the error responses — then `npm run generate -w contracts`. The contract is
   the source of truth; do not hand-write the response type in `web/` or `mobile/`.

7. **Verify.**
   ```bash
   deno check supabase/functions/<name>/index.ts
   deno lint supabase/functions/<name>/
   supabase functions serve <name>    # then curl it with a real JWT
   ```

8. **Review.** Run `supabase-reviewer`. If the name matches `stripe-*` or the function
   touches `payment_card` / `card_authorization`, run `audit-pci` as well.

## What this skill never does

- Ships a mutating handler with no audit call.
- Uses `serviceClient()` without a comment justifying the RLS bypass.
- Returns a raw error to the caller. Errors are RFC 7807 `application/problem+json` and must
  not leak SQL text, stack traces, or row counts.
- Sets `Access-Control-Allow-Origin: *` in anything that will be deployed.
- Generates a UUID with `crypto.randomUUID()`. That is v4; the project uses v7 from
  `_shared/uuid.ts`.
- Adds an endpoint without adding it to `contracts/openapi.yaml`.
