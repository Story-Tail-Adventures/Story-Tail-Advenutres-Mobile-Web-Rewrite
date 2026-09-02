# Story-Tail Adventures — Web & Mobile CRM

A custom CRM platform replacing Travefy for Story-Tail Adventures (hosted by Inteletravel). Mobile (Android + iOS) via Kotlin Multiplatform + Compose. Web via Next.js + React + TypeScript. Backend via Supabase Edge Functions. Database, auth, storage, and real-time via Supabase. Card tokenization via Stripe.

## Repo layout

```
.
├── README.md                  ← this file
├── CLAUDE.md                  ← Claude Code project instructions
├── .gitignore
├── .editorconfig
├── package.json               ← monorepo workspace root
├── package-lock.json
├── turbo.json
│
├── docs/                      ← project documentation (canonical source of truth)
│   ├── BRD.md / .docx
│   ├── Screen-Inventory.md / .docx
│   ├── Data-Model.md / .docx
│   ├── Design-System.md / .docx
│   ├── Tech-Recommendations.md / .docx
│   └── Doc-Review.md / .docx
│
├── design/                    ← design system + reference prototype + brand assets
│   ├── source-prototype/      ← 336-artboard HTML/CSS/JS prototype (read-only reference)
│   ├── compose-theme/         ← Kotlin theme files for mobile
│   ├── web-tokens/            ← CSS variables + TypeScript design tokens for web
│   └── brand-assets/          ← Logos, fonts, source brand files
│
├── mobile/                    ← Kotlin Multiplatform mobile project (Android + iOS)
│   ├── shared/                ← KMP shared module (domain, validation, API clients)
│   ├── androidApp/
│   ├── iosApp/
│   └── build.gradle.kts       (set up via Compose Multiplatform Wizard — see mobile/README.md)
│
├── web/                       ← Next.js + React + TypeScript
│   ├── app/
│   ├── components/
│   ├── lib/
│   ├── styles/
│   └── package.json           (set up via `npx create-next-app` — see web/README.md)
│
├── supabase/                  ← Supabase project
│   ├── migrations/            ← SQL migrations (managed via `supabase db push`)
│   ├── functions/             ← Edge Functions (Deno + TypeScript)
│   │   └── _shared/           ← Shared utilities (audit, auth, stripe wrapper)
│   ├── seed.sql
│   └── config.toml            (set up via `supabase init`)
│
├── contracts/                 ← API contract — single source of truth for the API surface
│   ├── openapi.yaml           ← OpenAPI spec
│   ├── ts/                    ← Generated TypeScript types (for web + Edge Functions)
│   └── kotlin/                ← Generated Kotlin types (for mobile shared module)
│
└── .claude/                   ← Claude Code project skills and commands
    └── skills/                ← Project-specific skills (new-screen, new-entity, audit-pci, ...)
```

## Getting started

Before writing any code, read these three documents in `docs/`:

1. **BRD.md** — what we're building and why
2. **Screen-Inventory.md** — the 168 screens that make up the platform
3. **Tech-Recommendations.md** — the stack choices and the Claude-Code bootstrap walkthrough

Then read the Design System and Data Model when you need them. The bootstrap steps for kicking off the codebase are in `docs/Tech-Recommendations.md` Section 5.

## Common commands (once each sub-project is initialized)

```bash
# Web
npm run dev -w web                  # start Next.js dev server
npm run build -w web                # production build

# Mobile (run from mobile/)
./gradlew :shared:build                # build shared module
./gradlew :androidApp:installDebug     # install Android debug
# iOS: open mobile/iosApp/iosApp.xcodeproj in Xcode

# Supabase
supabase start                         # start local Supabase
supabase db push                       # apply migrations
supabase functions deploy <name>       # deploy an Edge Function
supabase gen types typescript --local > web/types/supabase.ts

# API contract codegen
npm run generate -w contracts       # regenerate TS + Kotlin types from openapi.yaml
```

## Document hierarchy

When something seems contradictory between code and docs, the documents are the source of truth in this order:

1. BRD — business intent (highest authority)
2. Data Model — schema and types
3. Screen Inventory — UI surfaces and behaviors
4. Design System — visual + brand voice
5. Tech Recommendations — implementation guidance

If a code change contradicts a higher-tier doc, either the doc needs updating first or the change is wrong.

## What's where (cheat sheet)

| Question | File |
|---|---|
| What feature is in MVP vs Phase 2? | `docs/BRD.md` §13 |
| What screens exist and how do they behave on mobile vs web? | `docs/Screen-Inventory.md` |
| What are the database tables and their fields? | `docs/Data-Model.md` |
| What colors / fonts / shapes does the brand use? | `docs/Design-System.md` §3–§7 |
| What's the brand voice on rest and creation? | `docs/Design-System.md` §2 |
| How is PCI compliance handled? | `docs/BRD.md` §10 + `docs/Tech-Recommendations.md` §4 |
| How does the supplier-pay workflow actually work? | `docs/BRD.md` §10.4 + `docs/Tech-Recommendations.md` §4.7 |
| Should I build my own card vault? | No. `docs/Tech-Recommendations.md` §4.9 explains why. |
| How do I start a new screen with Claude Code? | `.claude/skills/new-screen/SKILL.md` (once written) |
