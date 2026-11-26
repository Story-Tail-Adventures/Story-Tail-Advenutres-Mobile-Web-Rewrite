# Differential tests (Track B)

docs/GO-MIGRATION.md §5.9: for each ported function, the same request goes to the Deno Edge
Function and to the Go handler on the same local Supabase stack, and the two must agree on the
status, the reply body, the rows written and the `audit_event` rows.

Build tag `difftest`, so `go test ./...` and CI never run these: they need a local stack and
the Deno functions served.

## Running

1. A local stack whose migrations are exactly this branch's. The shared `storytail-adventures`
   stack is often behind another session's branch; Track B used its own copy: `supabase/`
   copied to a scratch folder, `config.toml` given a unique `project_id` and every `543xx` port
   moved to `574xx`, then `supabase start` there. Check it with:

   ```bash
   diff <(ls -1 supabase/migrations/*.sql | sed 's|.*/||; s|_.*||' | sort) \
        <(docker exec supabase_db_<project_id> psql -U postgres -X -A -t \
            -c 'SELECT version FROM supabase_migrations.schema_migrations ORDER BY version')
   ```

2. The Deno functions served from that stack's folder, with the test values in `harness.go`
   (`SearchToken`, `LeadFormKey`, ...) in the env file:

   ```bash
   supabase functions serve --env-file functions.env   # in the background
   ```

   Stop it when done: the edge runtime container goes with it.

3. The stack's URL and keys in the environment, without printing them:

   ```bash
   envs=$(supabase status -o env)   # from the stack's folder
   export STA_DIFF_URL=$(printf '%s\n' "$envs" | sed -n 's/^API_URL="\(.*\)"$/\1/p')
   export STA_DIFF_ANON_KEY=$(printf '%s\n' "$envs" | sed -n 's/^ANON_KEY="\(.*\)"$/\1/p')
   export STA_DIFF_SERVICE_KEY=$(printf '%s\n' "$envs" | sed -n 's/^SERVICE_ROLE_KEY="\(.*\)"$/\1/p')
   go -C webgo test -tags difftest -count=1 ./internal/api/difftest/ -run CruiseSearch -v
   ```

## Writing one

- `NewWorlds(t)` makes two worlds, each with an aal2 advisor (a real TOTP factor) and a
  traveler of theirs. World "deno" is sent to Deno, world "go" to Go.
- A `Case` builds its request per world (`Body`, `Query`, `Token`, `Header`) and its fixtures
  (`Setup`, fresh ids every time). Label every id the reply or the rows may carry with
  `w.ID("trip", id)`; anything unlabelled that looks like a uuid becomes `<uuid>`, and
  timestamps become `<ts>`.
- `Snap` returns rows to compare after the request (`S.Rows(t, S.DB.From(...)...)`). The
  `audit_event` rows the world's two actors wrote during the request are compared for every
  case unless `SkipAudit`.
- `Expect` pins the status, so a case written to reach a branch proves it reached it.
- `Via: "call"` runs the Go side in process, as a web page does (for web-only functions).
- Fixtures are created with fresh unique ids and removed in `t.Cleanup`; seed rows are read,
  never changed.
