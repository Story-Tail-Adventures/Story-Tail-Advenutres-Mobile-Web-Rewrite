# Story-Tail Adventures — Claude Code Project Instructions

A custom CRM platform replacing Travefy for Story-Tail Adventures (a travel advisory business hosted by Inteletravel). This is a monorepo with mobile (Kotlin Multiplatform), web (Next.js + React + TypeScript), and backend (Supabase Edge Functions in TypeScript).

## Read these documents before answering anything substantive

The five documents in `docs/` are the canonical source of truth for this project:

- `@docs/BRD.md` — business requirements, scope, phases
- `@docs/Screen-Inventory.md` — every screen (172 of them) with mobile/tablet/web variants
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
- **Design source of truth** — the Claude Design project `https://claude.ai/design/p/019e27d4-5f9f-7c8d-b082-db804374dab3` (the older handoff tarball URL under `api.anthropic.com/v1/design/h/…` now returns 404). The local mirror lives at `design/source-prototype/` (read by `new-screen`, `web-reviewer`, `mobile-reviewer`); the design is organised as `pages/` (one section page per Screen Inventory section plus `pages/_sections.json`) and `screens/*.jsx`. To sync: run `/design-login` once in an interactive Claude Code session, then the `sync-design-handoff` skill (it reads the project through the `DesignSync` tool's `list_files` / `get_file`). **Every screen built must be visually faithful to the matching prototype JSX in `design/source-prototype/screens/`.**

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
- **P2** — Self-guided search and inquiry capture. Travel API integrations (Amadeus, Hotelbeds, Viator, Widgety, SerpApi Google Hotels). Phase 2 also brings the public marketing-adjacent search surface live. **A quote request creates a Trip in `inquiry` status, not a Lead** (BRD §6.5, decided 2026-09-09) — the `lead` domain is specified in Data-Model §11 but deferred and unbuilt, and the agent works one queue rather than two.
- **P3** — Multi-agent, group trip coordination, mobile offline UI, API-driven booking workflows.
- **P4+** — Future features (AI-assisted planning, loyalty, etc.).

## Common commands

```bash
# Web (Next.js)
npm run dev -w web
npm run build -w web
npm run typecheck -w web
npm run lint -w web

# Web tests
npm run test -w web

# Mobile (from mobile/)
# NOTE: :shared:build and :shared:check include the iOS targets and need Xcode.
# Until Xcode is installed, use the Android-scoped tasks below.
./gradlew :shared:assembleAndroidMain
./gradlew :shared:testAndroidHostTest
./gradlew :androidApp:assembleDebug
./gradlew :androidApp:installDebug
# iOS: open mobile/iosApp/iosApp.xcodeproj in Xcode (requires Xcode, not just CLT)

# Supabase (local)
supabase start                                                  # start local Supabase
supabase db reset                                               # apply migrations + seed from scratch
supabase db push                                                # apply to a LINKED REMOTE — not the local loop
supabase migration new <name>                                   # create new migration
supabase functions new <name>                                   # scaffold an Edge Function
supabase functions deploy <name>                                # deploy a function
supabase gen types typescript --local > web/types/supabase.ts   # regen DB types

# Contracts (codegen TS + Kotlin types from openapi.yaml)
npm run generate -w contracts
```

## Local development gotchas

Things that cost real time to rediscover:

- **`./gradlew :shared:build` and `:shared:check` fail without a full Xcode install.** They
  pull in the iOS *link* step; only the Command Line Tools are present. Use the AGP KMP
  library plugin's real task names instead: `:shared:assembleAndroidMain`,
  `:shared:testAndroidHostTest`, `:androidApp:assembleDebug`, and
  `:shared:compileKotlinIosSimulatorArm64` as the iOS-compatibility gate (it compiles the
  klib without linking, so it needs no Xcode).
- **supabase-kt is pinned to the Kotlin version, not to "latest".** Releases newer than the
  project's Kotlin compiler ship klibs with a higher ABI version, which Kotlin/Native
  refuses — while the JVM/Android target silently tolerates the mismatch. So a bad bump
  breaks *only* iOS. Bump `supabase` and `kotlin` in `libs.versions.toml` together.
- **The Android emulator reaches local Supabase at `http://10.0.2.2:54321`,** not
  `127.0.0.1` — that is the emulator's own loopback. Set it in `mobile/local.properties`.
- **`supabase db reset` is the local loop; `supabase db push` targets a linked remote.**
  Don't reach for `push` locally.
- **Dark mode on web is the `.scheme-dark` class**, not `prefers-color-scheme`, and the
  Tailwind colour mapping in `web/app/globals.css` must use `@theme inline`. Plain `@theme`
  freezes the light value into `:root` and dark mode silently stops working.
- **`~/.orbstack/bin` is not on the default non-interactive PATH.** Export it before
  `docker` or `supabase` commands, or they fail with "command not found".
- **Hand-seeding `auth.users` breaks GoTrue** unless `confirmation_token`,
  `recovery_token`, `email_change_token_new` and `email_change` are set to `''`. They are
  nullable with no default and GoTrue scans them into non-nullable Go strings, so every
  login 500s with "converting NULL to string is unsupported".
- **Never use `const val` for generated config.** Kotlin inlines const values into every
  call site, so a build that ran while the value was empty keeps the empty string baked in
  after regeneration — the app reports "not configured" with the correct value in the APK.
- **Don't build the Supabase client during composition.** `createSupabaseClient` reads
  persisted session state; doing it inline cost a 26s cold start and an ANR. Build it on a
  background dispatcher behind a splash route (648ms after).
- **The dark scheme is a full tropical rebrand, not an inversion** — primary goes burgundy
  to ocean blue, secondary to sunset gold, surfaces to deep navy. Check both schemes on
  every screen.

## Working alongside another session — use a worktree

More than one Claude session runs against this repo. Two sessions in the same working tree
share one INDEX, and that is a real hazard rather than a theoretical one:

**`git commit` commits the whole index, not the paths you just staged.** So a correctly
scoped `git add -A supabase/` followed by a bare `git commit` will also commit whatever the
other session happens to have staged, silently, with no sign of it in any diff you were
reading. This happened on 2026-09-08: three cruise-sync commits swallowed a concurrent
brand/icon rework — five file deletions, a logo rename, and 58 lines of two docs — and broke
the Web and both Mobile CI jobs, because six files import a component that went with it.

Three rules, in order of how much they save you:

1. **Take a worktree.** `EnterWorktree`, or by hand:
   ```bash
   git worktree add .claude/worktrees/<name> -b <branch> <base>
   ```
   Each worktree has its own index and HEAD over the same object store, so the hazard is
   gone rather than managed. `.claude/worktrees/` is gitignored. The Supabase CLI, `deno`,
   and the local Docker stack all work from a worktree unchanged; only `npm -w` scripts need
   an `npm install` there, and `npm run supabase:types` does not (it shells out to the
   Supabase CLI).

   A branch can only be checked out in one worktree, so if the branch you want is held by
   the shared tree, create a differently-named local branch off it and push with an explicit
   refspec: `git push origin HEAD:<remote-branch>`.

2. **Commit by path, always:** `git commit -F <msgfile> -- <paths>`. Commits only the named
   paths whatever else is staged. Note `-F` goes BEFORE the `--`; after it, git reads it as
   a pathspec and the commit fails.

3. **Never bare `git stash` / `git stash pop`.** The stash stack is shared across every
   worktree and the main checkout, so a pop can take another session's work. Prefer a
   throwaway WIP commit. If you must stash: `git stash push -u -m "<unique-tag>"`, capture
   the SHA from `git stash list --format='%H %gs'`, restore with `git stash apply <sha>`,
   then drop that entry by re-finding it by tag.

**Before any commit, read `git status` and confirm every path in it is yours.** If something
unfamiliar is staged, another session put it there — leave it alone and commit by path.

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
