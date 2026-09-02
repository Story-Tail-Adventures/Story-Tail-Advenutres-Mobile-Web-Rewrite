---
name: db-migrate
description: Create, apply, and verify a Supabase migration, then regenerate the TypeScript types. Triggers on "add a migration", "change the schema", "add a column", "add an index", "write a migration for X", or whenever schema SQL needs to land. Use this for any schema change; `new-entity` delegates its migration steps here.
---

# db-migrate

## Purpose

The mechanical loop for landing a schema change safely. Extracted once so `new-entity`,
`rls-policy`, and one-off changes all do it the same way.

Most migrations are not new entities. The next ones this repo needs are the RLS policy
pass, the extension-schema fix, index additions, and enum extensions — none of which
`new-entity` covers.

## When to use

- "Add a column to X" / "add an index on Y" / "we need a new enum value"
- "Write the RLS migration" (author the policies with `rls-policy` first, then land them here)
- Any time you are about to hand-write a file into `supabase/migrations/`
- As the final step of `new-entity`

## Procedure

1. **Check the doc first.** If the change adds or alters a field, `docs/Data-Model.md` is
   updated *before* the SQL is written. CLAUDE.md is explicit about this: the doc is the
   source of truth, and code that drifts from it gets fixed toward the doc. Note the doc
   change in the migration header comment.

2. **Create the file.**
   ```bash
   supabase migration new <snake_case_name>
   ```
   This timestamps it correctly. Do not hand-name migration files — a stale timestamp
   reorders the replay.

3. **Write the SQL** against the project conventions:
   - Money is `bigint` cents plus a `char(3)` currency column. Never `numeric`, never `float`.
   - Primary keys are `uuid` with **no** server-side default — IDs are generated client-side
     as v7 for offline support.
   - Timestamps are `timestamptz`.
   - Soft delete is `archived_at`, matching the existing schema.
   - New tables get `ENABLE ROW LEVEL SECURITY` **and** a policy (use `rls-policy`), or an
     explicit `TODO` naming who adds it.
   - No `card_number` / `pan` / `cvv` / `cvc` column under any name. Ever.
   - Wrap in `BEGIN; ... COMMIT;` to match the initial migration's style.
   - A header comment: what changed, why, and which doc section it implements.

4. **Apply by full replay.**
   ```bash
   supabase db reset
   ```
   Not `supabase db push` — that targets a *linked remote*. `db reset` rebuilds from an
   empty database and re-runs `seed.sql`, which is the only way to catch ordering bugs that
   an incremental apply hides.

5. **Verify it landed.**
   ```bash
   psql "$(supabase status -o json | jq -r .DB_URL)" -c '\dt public.*'
   psql "$(supabase status -o json | jq -r .DB_URL)" -c \
     "select relname, relrowsecurity from pg_class
      where relnamespace='public'::regnamespace and relkind='r' order by 1;"
   ```
   Confirm the object exists and RLS is on where it should be.

6. **Regenerate types — same commit, always.**
   ```bash
   npm run supabase:types
   ```
   CI diff-checks `web/types/supabase.ts` against the migrations, so a migration without
   regenerated types fails the build. If the change touches the API surface, also regenerate
   contracts: `npm run generate -w contracts`.

7. **Hand off to review.** Run `supabase-reviewer` on the diff. If the change is
   payment-adjacent, run `audit-pci` too.

## What this skill never does

- Edits an already-applied migration file. Migrations are forward-only and additive on the
  main branch (Data-Model §22.1) — a change to a landed file means everyone else's database
  and yours have silently diverged. Write a new migration.
- Runs `supabase db push` as part of the local loop. That is the remote path.
- Commits a migration without its regenerated types.
- Adds a field that `docs/Data-Model.md` does not describe.

## Down migrations

Dev branches only. There is no down-migration path on main — rolling back a production
schema change means writing a new forward migration that reverses it.
