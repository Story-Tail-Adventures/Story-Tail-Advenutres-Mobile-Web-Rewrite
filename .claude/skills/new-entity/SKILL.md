---
name: new-entity
description: Add a new entity from the Data Model to the codebase. Generates the Supabase migration, the Postgres DDL, the TypeScript type (via codegen), and the Kotlin data class (via codegen). Triggers on "add entity X", "I need a [table] table", "let's add the [entity name] from the data model".
---

# new-entity

## Purpose

Add a database entity end-to-end: migration, RLS policy placeholder, TypeScript types for web + Edge Functions, Kotlin data class for mobile. Ensures every entity lands consistent with the documented data model and the project's conventions (UUID v7, bigint cents, audit middleware, etc.).

## When to use

Trigger phrases:
- "Add the Booking entity"
- "I need a Refund table"
- "Let's add Lead from the Data Model"
- "Create the entity for X"

Use this skill when the user names an entity from `docs/Data-Model.md` (or proposes a new one).

## Procedure

1. **Find the entity in the Data Model.** Open `docs/Data-Model.md` and locate the entity. Capture: phase marker (P1/P2/P3), purpose, all fields with types and sensitivity, indexes, constraints, relationships.

2. **Check it's actually new.** Grep `supabase/migrations/` for `CREATE TABLE <entity>` — if it exists, this is an *edit*, not an add; use a different migration approach.

3. **Generate the migration filename.** Use the current UTC timestamp:
   ```bash
   supabase migration new add_<entity_name>
   ```
   This creates `supabase/migrations/<timestamp>_add_<entity_name>.sql`.

4. **Write the migration.** Include:
   - Any enum types the entity uses (`CREATE TYPE ... AS ENUM (...)`) — check `docs/Data-Model.md` §17.
   - The `CREATE TABLE` with all columns, types, constraints, defaults.
   - All indexes from the Data Model entry.
   - Foreign keys to existing tables.
   - A placeholder Row-Level Security policy:
     ```sql
     ALTER TABLE <entity> ENABLE ROW LEVEL SECURITY;
     -- TODO: add RLS policies based on agent ownership / client ownership.
     ```

5. **Apply project-wide conventions:**
   - Primary keys are `uuid` (no integer auto-increment), generated client-side as UUID v7.
   - All money is `bigint` cents + `char(3)` currency code.
   - Timestamps are `timestamptz`.
   - Append-only tables (audit_event, card_use_event, auth_event) get a comment explaining they have no UPDATE/DELETE.
   - Sensitive fields per `docs/Data-Model.md` §18 use `bytea` and `pgcrypto` for column-level encryption — never store plaintext.
   - `archived_at` (not `deleted_at`) for soft delete.

6. **Update the API contract if needed.** If the entity is exposed via API (most are), add the schema definition to `contracts/openapi.yaml` under `components.schemas`. Add the endpoints that read/write it under `paths`. Regenerate types:
   ```bash
   npm run generate -w contracts
   ```

7. **Wire the mobile shared module.** If the entity is exposed to mobile, the Kotlin type is auto-generated in `contracts/kotlin/`. Import it from `mobile/shared/src/commonMain/kotlin/com/storytail/adventures/domain/` if you need to extend it with mobile-specific helpers.

8. **Add audit-middleware hook.** If the entity is in the sensitive set (PaymentCard, CardAuthorization, Commission, Client — see `docs/Data-Model.md` §20.3), every Edge Function that mutates it must call `_shared/audit.ts` to write an `AuditEvent`. Verify this in the function before merging.

9. **Update the Data Model summary if it changes.** If you discovered the Data Model itself is wrong or incomplete (the entity should have a field it doesn't, or vice versa), update `docs/Data-Model.md` first — then write the migration. The doc is the source of truth.

10. **Run migrations locally.** Verify with `supabase db reset` against the local Supabase instance. Inspect the resulting tables in Supabase Studio.

## What this skill never does

- Adds an entity without updating `docs/Data-Model.md` if the entity differs from what's documented.
- Stores card PANs, CVVs, or any raw cardholder data. Only Stripe tokens. (See `audit-pci` skill.)
- Creates a hand-written Kotlin or TypeScript domain type that overlaps with the API contract — codegen handles those.
- Skips the RLS placeholder. Tables without RLS expose data to all authenticated clients.
