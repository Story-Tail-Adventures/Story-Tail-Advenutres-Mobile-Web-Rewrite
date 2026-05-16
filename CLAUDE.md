# Story-Tail Adventures — Claude Code Project Instructions

A custom CRM platform replacing Travefy for Story-Tail Adventures (a travel advisory business hosted by Inteletravel). This is a monorepo with mobile (Kotlin Multiplatform), web (Next.js + React + TypeScript), and backend (Supabase Edge Functions in TypeScript).

## Read these documents before answering anything substantive

The five documents in `docs/` are the canonical source of truth for this project:

- `@docs/BRD.md` — business requirements, scope, phases
- `@docs/Screen-Inventory.md` — every screen (168 of them) with mobile/tablet/web variants
- `@docs/Data-Model.md` — every entity, every field, with Postgres DDL and Kotlin data classes
- `@docs/Design-System.md` — colors, typography, components, **brand voice and worldview** (§2)
- `@docs/Tech-Recommendations.md` — stack choices and Claude Code bootstrap walkthrough

When the user asks about features, screens, entities, payment workflows, design choices, or anything else load-bearing, **read the relevant doc first**. Don't reason from training data when the project has its own answers.

## Stack

- **Mobile** — Kotlin Multiplatform + Compose Multiplatform (Android + iOS)
- **Web** — Next.js + React + TypeScript (consumes the Ktor-equivalent Edge Functions over REST)
- **Backend** — Supabase Edge Functions (Deno + TypeScript). NO separate Ktor service.
- **Database / Auth / Storage / Realtime** — Supabase
- **Payments** — Stripe (SetupIntent for collection, Vault and Forward for API suppliers, audited PAN reveal for portal suppliers)
- **API contract** — OpenAPI spec in `contracts/openapi.yaml` → generated TypeScript types → generated Kotlin types
- **Design source of truth** — Claude Design handoff bundle at `https://api.anthropic.com/v1/design/h/IhaI2N5FMxGoxB4kP0mtnA`. The local mirror lives at `design/source-prototype/` (read by `new-screen`, `web-reviewer`, `mobile-reviewer`). When the designer iterates, the URL refreshes — run the `sync-design-handoff` skill to pull the latest. **Every screen built must be visually faithful to the matching prototype JSX in `design/source-prototype/screens/`.**

**Stack directories are hard boundaries.** All mobile code (Kotlin / KMP / Compose Multiplatform) lives under `mobile/`. All web/React code (Next.js / TSX / Tailwind) lives under `web/`. Backend code lives under `supabase/`. Shared API types live under `contracts/`. Cross-contamination — React in `mobile/`, Kotlin UI code in `web/`, etc. — is a defect. The `web-reviewer` and `mobile-reviewer` subagents will flag any code in the wrong tree.

## Critical rules — these are non-negotiable

1. **Never store cardholder PANs anywhere except Stripe.** Our DB stores only Stripe `PaymentMethod` IDs (tokens) plus non-sensitive metadata (brand, last 4, expiration). If you find yourself writing code that would persist a PAN to Postgres, that's a defect. See `docs/Tech-Recommendations.md` §4.6 and §4.9.

2. **No client-facing billing.** Story-Tail Adventures is contractually prohibited from charging clients planning, consultation, or service fees (per Inteletravel host agency policy). The platform has no Invoice entity, no "charge client" actions, no merchant-of-record flows. Stripe is used for tokenization only. See `docs/BRD.md` §10.5.

3. **Every mutation goes through audit middleware.** Edge Functions writing to sensitive tables (payment_card, card_authorization, commission, client) must write an `audit_event` row capturing actor, target, metadata. See `docs/Data-Model.md` §15 and §20.

4. **Stripe `PaymentMethod` IDs are server-only.** Never return them in API responses to client roles. The PAN reveal flow (Screen Inventory 3.6.4) is the one place the PAN is exposed, and only via an audited, MFA-gated Edge Function. See `docs/Data-Model.md` §21.2.

5. **All money is `bigint` cents + `char(3)` currency.** Never `numeric` or `float`. See `docs/Data-Model.md` §2.

6. **UUIDs are v7 (time-ordered).** Generated client-side for offline support; backend validates the embedded timestamp is recent. See `docs/Data-Model.md` §21.6.

## Brand voice — the rest-and-creation foundation

Story-Tail Adventures has a faith-informed worldview at its core: **rest is sacred** (a divine command, per Exodus 20:8 and Mark 6:31) and **creation is given to be enjoyed** (per 1 Timothy 6:17 and Psalm 23). This shows up in copy and screen-specific voice without being preachy. **Read `docs/Design-System.md` §2 in full before writing any user-facing copy.**

Quick tone checks for any copy:
- Sounds like a friend who's done this 100 times (warm, expert, no jargon)
- Treats the trip as a gift, not a commodity (wonder language)
- Leaves room for rest (gentle pace, no pushy CTAs)
- Welcomes clients of every background (inclusive, never gating service by faith)
- Sounds like Gyasi would say it out loud

## Phase markers

Use these consistently in code comments, commit messages, and PR descriptions:

- **P1** — MVP (Travefy replacement). Authentication, client management, trip builder with manual entry, itinerary viewer, payment authorization, agent worklist, commission tracking, templated emails.
- **P2** — Self-guided search and lead generation. Travel API integrations (Amadeus, Hotelbeds, Viator, Widgety). Lead workflow. Phase 2 also brings the public marketing-adjacent search surface live.
- **P3** — Multi-agent, group trip coordination, mobile offline UI, API-driven booking workflows.
- **P4+** — Future features (AI-assisted planning, loyalty, etc.).

## Common commands

```bash
# Web (Next.js)
pnpm --filter web dev
pnpm --filter web build
pnpm --filter web typecheck
pnpm --filter web lint

# Mobile (from mobile/)
./gradlew :shared:build
./gradlew :shared:test
./gradlew :androidApp:installDebug
# iOS: open mobile/iosApp/iosApp.xcodeproj in Xcode

# Supabase
supabase start                                                  # start local Supabase
supabase db push                                                # apply migrations
supabase migration new <name>                                   # create new migration
supabase functions new <name>                                   # scaffold an Edge Function
supabase functions deploy <name>                                # deploy a function
supabase gen types typescript --local > web/types/supabase.ts   # regen DB types

# Contracts (codegen TS + Kotlin types from openapi.yaml)
pnpm --filter contracts generate
```

## What NOT to do

- Don't add fields to the Data Model without first updating `docs/Data-Model.md` and regenerating the docx.
- Don't introduce new third-party SDKs without a security review (especially anything payment-adjacent).
- Don't refactor screen-level structure that deviates from the Design System without checking the Screen Inventory's Pattern Mapping (§4.4) first.
- Don't introduce a separate Kotlin backend service. Backend is Supabase Edge Functions (TypeScript). If you find yourself wanting a Ktor service, push back and discuss before adding it.
- Don't paste files into chat — use `@-mentions` (e.g., `@docs/BRD.md`) for cleaner tokenization and a better audit trail.
- Don't load Google Fonts at runtime in production — bundle Poppins / Caveat / JetBrains Mono in `mobile/shared/src/commonMain/composeResources/font/` for mobile and via `next/font` for web.
- Don't make a copy decision without checking `docs/Design-System.md` §2 first. The brand voice is load-bearing.

## How to bootstrap from here

`docs/Tech-Recommendations.md` Section 5 walks through the eight-step bootstrap (create monorepo → drop in design system → write CLAUDE.md → set up Skills → build database first → build one screen end-to-end → set up verification loop → CI from day one). Start there.

## Document hierarchy

When something contradicts, the documents are the source of truth in this order:

1. BRD — business intent (highest authority)
2. Data Model — schema and types
3. Screen Inventory — UI behavior
4. Design System — visual + voice
5. Tech Recommendations — implementation guidance

If code conflicts with a doc, update the doc first if the change is intentional, otherwise fix the code.
