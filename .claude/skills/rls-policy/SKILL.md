---
name: rls-policy
description: Author and test Row-Level Security policies for a table, following the ownership model in Data-Model §19. Triggers on "add RLS", "write the policies for X", "why can't the client read Y", "lock down table Z", or whenever a table has RLS enabled with no policy.
---

# rls-policy

## Purpose

Write and *verify* RLS policies for a table.

This matters more than it sounds. `supabase/migrations/20260514120000_initial.sql` enables
RLS on all 34 tables and adds **zero policies**, with a `TODO`. So today every table is
service-role-only, and — more importantly — RLS is the only enforcement mechanism
`docs/Data-Model.md` §21.2 names for keeping `stripe_payment_method_id`,
`mfa_device.secret_encrypted`, and `authorization_request.token_hash` away from client
roles. Until the policies exist, **CLAUDE.md rule 4 is enforced by convention alone**.

Getting a policy wrong is a silent data-exposure bug. No typecheck, lint, or reviewer
catches it. Only executing the query as the wrong user catches it. Hence step 5.

## When to use

- "Add RLS policies for the trip table"
- "Should a client be able to see this?"
- "Why is this query returning zero rows?" (nearly always a missing policy)
- Any new table, as part of `db-migrate` step 3

## Procedure

1. **Classify the table.** Read `docs/Data-Model.md` §19 (multi-tenancy) and §21.2
   (server-only fields), then pick one:
   - **agent-owned** — reachable via `agent_id`. Agents see their own rows; admins see all.
   - **client-owned** — reachable via `client_id`. A client sees only their own; the owning
     agent sees them too.
   - **child** — no direct owner column; ownership is inherited through a parent FK
     (`itinerary_day` through `itinerary` through `trip`).
   - **append-only** — `audit_event`, `auth_event`, `card_use_event`. SELECT for admins,
     INSERT by service role, and **no UPDATE or DELETE policy at all**.
   - **service-role-only** — `payment_card`, `card_authorization`, `authorization_request`.
     No `authenticated` policy whatsoever; these are reachable only through audited Edge
     Functions.

2. **Use the helper, not an inline join.** Policies resolve the caller through
   `current_platform_user()`, a `security definer` function returning the caller's
   `platform_user` row:

   ```sql
   create or replace function public.current_platform_user()
   returns public.platform_user
   language sql stable security definer set search_path = public
   as $$ select * from public.platform_user where account_id = auth.uid() limit 1 $$;
   ```

   Two reasons this is not optional. First, repeating the join in 100+ policy bodies is
   unreadable and drifts. Second — and this is the trap — a policy on `client` that joins
   `platform_user` requires a policy on `platform_user` to evaluate, which can require a
   policy on `client`. `security definer` breaks the recursion by running the lookup as the
   function owner.

3. **Write one policy per operation.** Never a single `FOR ALL` — read and write rules
   differ almost everywhere, and `FOR ALL` hides that.

   ```sql
   create policy trip_agent_select on public.trip
     for select to authenticated
     using (agent_id = (select agent_id from public.current_platform_user()));

   create policy trip_client_select on public.trip
     for select to authenticated
     using (client_id = (select client_id from public.current_platform_user()));
   ```

   `WITH CHECK` on INSERT and UPDATE, not just `USING` — `USING` governs which rows you may
   *see*; `WITH CHECK` governs what you may *write*. An UPDATE policy with only `USING` lets
   a caller move a row to another owner.

4. **Exclude server-only columns explicitly.** RLS is row-level, not column-level. If a
   table has a column no client role may ever read (`stripe_payment_method_id`,
   `secret_encrypted`, `token_hash`), the row-level policy is not enough — either withhold
   the table from client roles entirely and serve it through an Edge Function, or expose a
   view with the column omitted and grant on the view. Say which you chose and why.

5. **Test it by executing as each role.** This is the step that actually finds bugs.

   ```sql
   -- As a client who owns the row
   set local role authenticated;
   set local request.jwt.claims = '{"sub":"<owning client account uuid>","role":"authenticated"}';
   select count(*) from trip;              -- expect: only their trips

   -- As a different agent's client
   set local request.jwt.claims = '{"sub":"<other account uuid>","role":"authenticated"}';
   select count(*) from trip;              -- expect: 0

   -- As the owning agent
   set local request.jwt.claims = '{"sub":"<agent account uuid>","role":"authenticated"}';
   select count(*) from trip;              -- expect: their whole book of business
   reset role;
   ```

   Run all three. A policy that passes the happy path and leaks to the second one is the
   normal failure mode, and it looks identical to a working policy until you check.

6. **Land it** via `db-migrate`.

## What this skill never does

- Writes `USING (true)` on a table reachable by `authenticated`. If that seems right, the
  table is service-role-only and wants no `authenticated` policy at all.
- Adds UPDATE or DELETE policies to an append-only table.
- Claims a policy works without having executed step 5.
- Grants a client role any access to `payment_card`, `card_authorization`, or
  `authorization_request`.
