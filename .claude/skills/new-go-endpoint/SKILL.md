---
name: new-go-endpoint
description: Scaffold a new Go function handler under `web/internal/api/fn/`, registered in both the served-name list and the port table, with the caller check, audit write and problem+json errors already in place. Triggers on "new endpoint", "add a function", "new API handler", "we need a server-side handler for X", or whenever backend logic needs a new HTTP entry point at /functions/v1/{name}.
---

# new-go-endpoint

## Purpose

Create a new function handler in the Go service with the security plumbing already in place.

CLAUDE.md rule 3 (every mutation to a sensitive table writes an `audit_event`) is a
never-forget rule, and the only durable way to never forget is to make the audit write part
of the template rather than something review has to catch. The same goes for the caller
check. In Go there is no Supabase gateway in front of the handler and no RLS on the database
client it uses, so a handler that forgets either one is open to anybody with a URL.

This replaces the old `new-edge-function` skill. `supabase/functions/` was deleted in Phase 6
of `docs/GO-MIGRATION.md`; there is no Deno in the repo and nothing to deploy to. Every
endpoint at `/functions/v1/{name}` is now a Go package.

## When to use

- "Add an endpoint for X"
- "We need a server-side handler that does Y"
- Whenever `new-screen` says the screen needs an API call that is not plain Supabase Auth or
  a plain RLS-protected table read

## Before you scaffold, four questions

The answers change the template, so ask them explicitly and record them in the package doc
comment:

1. **Why a function at all?** If the table's RLS already lets the caller do it, do not add an
   endpoint. Every handler here exists because something cannot be done from the client:
   no write policy, an audit row that has to be written, a transition the client must not be
   able to choose. Write that reason in the doc comment, as the existing packages do.
2. **Which gate?** `GateUser`, `GateOpen`, `GateCron` or `GateInProcess`. See step 4. There
   is no "anyone"; `GateOpen` means the handler does its own check instead, and you have to
   say what that check is.
3. **Does it mutate `payment_milestone`, `commission`, or `client`?** If yes, the write
   carries an `audit_event`. Through `internal/audit` for a plain write, or inside the SQL
   transaction through an RPC that takes `p_audit_id` for a financial one. Not beside it.
4. **Does it accept or return a card number?** It must not. The app holds no cardholder data
   (BRD §10, since 2026-10-16). If a design seems to need one, stop and raise it.

## Procedure

1. **Pick the two names.** The served name is kebab-case and is what the URL says
   (`agent-trip`). The Go package name is the same word with the separators removed
   (`agenttrip`), because Go package names take no hyphens or underscores. The file is
   `web/internal/api/fn/<package>/<package>.go`.

2. **Write the package doc comment first.** Every package in `fn/` opens with one: what the
   endpoint does, which screen calls it, whether mobile calls it, and the WHY A FUNCTION
   answer from question 1. Anything surprising about the behaviour goes here too, in capitals
   where it would otherwise be rediscovered the hard way. Read
   `web/internal/api/fn/testimonial/testimonial.go` for the house shape.

3. **Implement the handler.** The whole contract is one function:

   ```go
   // Func is the function.
   func Func(d *edge.Deps, r *http.Request) (*edge.Reply, error) {
       if r.Method != http.MethodPost {
           return nil, problem.BadRequest("Use POST.")
       }
       c, err := edge.RequireUser(d, r)   // the caller, from GoTrue
       if err != nil {
           return nil, err
       }
       agentID, err := guard.RequireAgentID(r.Context(), d.DB, c)
       if err != nil {
           return nil, err
       }
       payload, err := edge.ReadObject(r, edge.SendJSONObject)
       if err != nil {
           return nil, err
       }
       req, err := parse(payload)        // validate here; never trust an id, role or amount
       if err != nil {
           return nil, err
       }

       // ... the mutation, then its audit row ...
       if err := audit.Write(r.Context(), d.DB, c, audit.Spec{
           EventType:    "<entity>.<past_tense_verb>",
           TargetEntity: "<entity>",
           TargetID:     req.ID,
           Metadata:     js.O("<key>", "<value>"),
       }); err != nil {
           return nil, err
       }
       return edge.OK(reply)
   }
   ```

   `edge.Serve` wraps it: OPTIONS never reaches `Func`, the CORS headers and
   `application/problem+json` shape come from `internal/api/edge`, and a returned
   `*problem.Error` becomes its status, title and detail. Do not hand-roll any of that.

4. **Register the name in BOTH files, or it does not exist.**

   - `web/internal/api/registry.go`, the `Functions` slice: the allowlist of names the
     door answers at all. A name outside it is a 404.
   - `web/internal/api/ported.go`, `portTable()`: the name mapped to its gate and its
     `Func`, grouped by area with a comment, as the existing rows are.

   The four gates, exactly as `registry.go` defines them:

   | Gate | What must be true before the handler runs | Used by |
   |---|---|---|
   | `GateUser` | GoTrue accepts the bearer token first (`edge.Verify`). Go has no gateway doing `verify_jwt`, so this is the check. | almost everything |
   | `GateOpen` | Nothing at the gate. The handler does its own check: a form key, a signed link. | `lead-message`, `email-unsubscribe` |
   | `GateCron` | `STA_CRON_SECRET` matched in constant time, and nothing else accepted. | the four pg_cron ticks |
   | `GateInProcess` | 404 on the public door. Reachable only through `Registry.Call` from a web page. | `cruise-search` |

   A port-table row whose name is missing from `Functions` panics the server at startup, on
   purpose.

5. **Keep the two lists equal.** `web/internal/api/registry_test.go`'s
   `TestEveryServedNameRunsInGo` asserts that `Functions` and `portTable()` hold exactly the
   same names. This is not tidiness. Before Phase 6 a name in `Functions` with no Go handler
   fell through to the Deno deployment of the same name; that deployment is gone, so the same
   name now proxies a request to a host that answers 404, and the caller sees a silent hole
   rather than an error anybody traces. Add both rows in the same commit.

6. **Describe it in the contract.** Add the path to `contracts/openapi.yaml` (request body,
   response, and the error responses), then `npm run generate -w contracts`. The contract is
   the source of truth for both clients. Do not hand-write the response type in `web/` or
   `mobile/`.

7. **Test it beside the handler.** `web/internal/api/fn/<package>/<package>_test.go`, table
   driven, covering the method check, every parse refusal with its exact `detail` sentence,
   and the gate. The older differential tests compared a port against its Deno original and
   went with `supabase/functions/`; a new endpoint has no original to differ from, so its
   package test is the only thing holding its contract.

8. **Verify.** From `web/`:

   ```bash
   gofmt -l .          # must print nothing
   go vet ./...
   go test -race ./...
   ```

9. **Review.** Run `go-reviewer`. If the endpoint touches pay links or `payment_milestone`,
   run `audit-pci` as well.

## Rules that still apply, in their Go form

- **The database client bypasses RLS.** `d.DB` is the service-role client and nothing else
  exists in a function package. RLS checks nothing on it, so every ownership test is explicit:
  `guard.RequireAgentID`, `guard.RequireOwnedTrip`, `guard.RequireOwnedConversation`,
  `trip.RequireClientID`. A query filtered only by an id the caller sent is a leak.
- **Money is `int64` cents.** Decode rows and bodies into typed structs with `int64` for every
  `*_cents` field. A row decoded into `any` or `map[string]any` turns the number into a
  `float64` and breaks the cents rule silently. Over the wire, cents travel as a JSON string
  with an ISO-4217 `currency` beside them, because a JSON number above 2^53 loses precision
  and the bug surfaces months later as a reconciliation mismatch.
- **UUIDs are v7** from `internal/uuid` (`uuid.New()`, `uuid.CheckRecent` for an id the client
  supplied). No `math/rand`, no v4 generator.
- **Errors are `*problem.Error`.** `problem.BadRequest`, `Unauthorized`, `Forbidden`,
  `NotFound`, `Conflict`. Anything else returned becomes a bare 500 with no `detail`, which is
  right: an error body must never carry SQL text, a stack trace or a row count to a caller.
  409 is the optimistic lock and nothing else.
- **Pay links are `https://` only**, written only by the advisor, and audited on every add,
  change or removal. Never return `payment_milestone.paid_note` to a client role. Check the
  shape you actually return, not just the row you queried.
- **Never log a request body**, message text, an address, a file name, a token or a secret.

## What this skill never does

- Ships a mutating handler on a sensitive table with no audit write.
- Swallows an audit error. A swallowed one is exactly the gap rule 3 exists to prevent: the
  mutation lands, the record of it does not, and nobody finds out until an auditor asks.
- Queries by a caller-supplied id without an ownership check, on the assumption RLS will
  catch it. It will not; the client is service-role.
- Adds a name to `Functions` without adding it to `portTable()`, or the other way round.
- Returns a raw error to the caller.
- Generates an id with anything other than `internal/uuid`.
- Adds an endpoint without adding it to `contracts/openapi.yaml`.
- Puts Go code anywhere but `web/`, or adds a second backend service.
