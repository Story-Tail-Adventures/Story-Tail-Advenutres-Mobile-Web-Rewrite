# `contracts/` — API contract (single source of truth)

The API contract that the web app, mobile shared module, and Edge Functions all consume. One source of truth, generated into TypeScript and Kotlin so each side gets type-safe access without hand-writing the contract twice.

## Status

**Four paths, both generators live.** The §2.2 write endpoints are described here and both sides
are generated: `npm run generate -w contracts` runs the TypeScript and Kotlin generators in turn, and
the "Contracts codegen is current" CI job regenerates and diffs both.

**Reads are deliberately absent.** The §2.2 screens read the trip graph through PostgREST under the
RLS policies in `20260907031255_trip_read_policies.sql`, naming their columns. Those column grants
*are* the read contract — describing them again as endpoints would give two sources of truth for the
same question. Only writes, and the one capability a client cannot be granted (naming a storage
object), are functions.

**The Kotlin generator does not use `openapi-generator-cli`.** That objection still stands: it pulls a
~25 MB JAR and needs a Java toolchain on every CI runner. `scripts/generate-kotlin.mjs` emits Kotlin
source literals from the parsed spec instead — the same approach `web/scripts/export-public-content.mts`
uses for `GeneratedPublicContent.kt`. It is reviewable in a diff, checked by the Kotlin compiler rather
than at runtime, and adds one small dependency (`js-yaml`) instead of a toolchain.

Its scope is narrow on purpose: request/response data classes and the enums they reference, and
nothing else. No HTTP client and no operation wrappers — the mobile side already has a repository
layer with its own error handling, and what it lacked was payloads that cannot drift from the contract.

**Known gap.** The five shipped `onboarding-*` functions predate this file and are still not described
in it; `web/lib/onboarding/api.ts` hand-rolls their calls. Backfilling them is tracked work.

## Layout

```
contracts/
├── README.md                  ← this file
├── package.json
├── openapi.yaml               # ← the source of truth — hand-edited
├── scripts/
│   └── generate-kotlin.mjs    # openapi.yaml → Kotlin data classes
├── ts/                        # ← generated TypeScript (do not edit)
│   └── types.ts
└── kotlin/                    # ← generated Kotlin (do not edit)
    └── com/storytail/contracts/
        └── Types.kt
```

`contracts/kotlin/` is on the mobile shared module's `commonMain` source path — see the
`contractsKotlinDir` srcDir in `mobile/shared/build.gradle.kts`. The output is committed, so a mobile
build never needs Node installed. It is also the one place Kotlin may live outside `mobile/`, which
`.claude/hooks/stack-boundary-guard.py` sanctions explicitly.

## Initialize

```bash
npm install                       # js-yaml + openapi-typescript, from the root workspace
npm run generate -w contracts     # regenerates ts/ and kotlin/
```

In `package.json` add scripts:

```json
{
  "scripts": {
    "generate:ts": "openapi-typescript openapi.yaml -o ts/types.ts",
    "generate": "npm run generate:ts"
  }
}
```

When the Kotlin side is switched on, add back:

```json
"generate:kotlin": "openapi-generator-cli generate -i openapi.yaml -g kotlin -o kotlin --additional-properties=packageName=com.storytail.contracts",
"generate": "npm run generate:ts && npm run generate:kotlin"
```

Run `npm run generate` whenever `openapi.yaml` changes.

## Workflow

1. **Hand-edit `openapi.yaml`** when the API contract changes.
2. **Run `npm run generate`** to regenerate the TypeScript types. (Kotlin generation is
   deferred — see Status above.)
3. **Commit the generated outputs** — they live in source control so the web and mobile builds don't need to run codegen.
4. **CI verifies the generated outputs are in sync** — if anyone edits `openapi.yaml` without regenerating, CI fails. See `.github/workflows/` once set up.

## Consumers

- **Web (`../web/`)** — imports from `contracts/ts/types.ts` for typed API responses.
- **Mobile (`../mobile/shared/`)** — imports from `contracts/kotlin/.../Types.kt` for typed API responses on Android and iOS.
- **Backend (`../supabase/functions/`)** — imports from `contracts/ts/types.ts` for typed request and response shapes.

## What `openapi.yaml` covers

- Every Edge Function endpoint (`/auth/*`, `/stripe/*`, `/commission/*`, `/travel/*`, `/webhooks/*`).
- Request and response schemas.
- Error response shapes (per `RFC 7807` / problem-json convention).
- Auth requirements per endpoint (anonymous / authenticated / agent-only / admin-only).

What it does NOT cover:

- Direct Supabase Postgres queries via `@supabase/supabase-js`. Those types come from `supabase gen types typescript` and live in `../web/types/supabase.ts`.
