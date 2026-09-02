# `contracts/` — API contract (single source of truth)

The API contract that the web app, mobile shared module, and Edge Functions all consume. One source of truth, generated into TypeScript and Kotlin so each side gets type-safe access without hand-writing the contract twice.

## Status

**Initialized, with an empty contract.** `package.json` and `openapi.yaml` exist and
`npm run generate -w contracts` works, but `paths` is still empty — the 2.1.x auth screens call Supabase
Auth (GoTrue) directly via the official SDKs, so they are not our API surface. The first real paths will
arrive with the Stripe and commission-import Edge Functions.

**The Kotlin generator is deferred.** `openapi-generator-cli` pulls a ~25 MB JAR and needs a Java toolchain
on every CI runner, and there is nothing to generate from yet. Add `generate:kotlin` when the first
endpoint lands. Until then `generate` runs the TypeScript side only.

## Layout

```
contracts/
├── README.md                  ← this file
├── package.json
├── openapi.yaml               # ← the source of truth — hand-edited
├── ts/                        # ← generated TypeScript (do not edit)
│   ├── types.ts
│   └── client.ts
└── kotlin/                    # ← generated Kotlin (do not edit)
    └── com/storytail/contracts/
        ├── Types.kt
        └── Client.kt
```

## Initialize

```bash
cd contracts
npm init -y
npm install --save-dev openapi-typescript        # for TypeScript codegen
npm install --save-dev openapi-generator-cli     # for Kotlin codegen
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
