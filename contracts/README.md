# `contracts/` — API contract (single source of truth)

The API contract that the web app, mobile shared module, and Edge Functions all consume. One source of truth, generated into TypeScript and Kotlin so each side gets type-safe access without hand-writing the contract twice.

## Status

**Not yet initialized.** The `ts/` and `kotlin/` output directories exist as placeholders for generated code.

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
pnpm init
pnpm add -D openapi-typescript        # for TypeScript codegen
pnpm add -D openapi-generator-cli     # for Kotlin codegen
```

In `package.json` add scripts:

```json
{
  "scripts": {
    "generate:ts": "openapi-typescript openapi.yaml -o ts/types.ts",
    "generate:kotlin": "openapi-generator-cli generate -i openapi.yaml -g kotlin -o kotlin --additional-properties=packageName=com.storytail.contracts",
    "generate": "pnpm generate:ts && pnpm generate:kotlin"
  }
}
```

Run `pnpm generate` whenever `openapi.yaml` changes.

## Workflow

1. **Hand-edit `openapi.yaml`** when the API contract changes.
2. **Run `pnpm generate`** to regenerate both TypeScript and Kotlin types.
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
