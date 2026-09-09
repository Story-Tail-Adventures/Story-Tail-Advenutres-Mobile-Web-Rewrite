# Day 1 — Handoff to Claude Code

You've just opened this repo in Claude Code for the first time. This document tells you what to do, in what order, for your first five sessions.

The package you're inheriting:

- Complete BRD, Screen Inventory (168 screens), Data Model (~40 entities), Design System, Tech Recommendations — all in `docs/`
- A 336-artboard HTML/CSS/JS reference prototype in `design/source-prototype/`
- Compose Multiplatform theme starter files for mobile in `design/compose-theme/`
- TypeScript design tokens for web in `design/web-tokens/`
- A monorepo skeleton (`mobile/`, `web/`, `supabase/`, `contracts/`) with stub READMEs in each
- The first Supabase migration covering all P1 entities, in `supabase/migrations/20260514120000_initial.sql`
- Four project Skills in `.claude/skills/`: `new-screen`, `new-entity`, `audit-pci`, `run-vulnerability-scan`
- Root `CLAUDE.md` that Claude Code reads on every session

You do **not** have to write any of those. They exist. Your job is to bootstrap the codebase.

## Before you start your first Claude Code session

Three prerequisites. Each takes 10 minutes or less.

1. **Create a Supabase project.** Sign up at supabase.com if you haven't. Create a new project — pick a region close to you, set a strong database password, and save the project URL and anon key. You'll need the service role key too (in Project Settings → API). Keep these out of git.

2. **Create a Stripe account in Story-Tail's name.** Sign up at stripe.com. Stripe will ask for business documentation — this is fine because we're using Stripe for tokenization only, not as a merchant processor. Get the publishable key and the secret key (test mode is fine for development).

3. **Install local tooling.** You'll need: Node 22 LTS (or 24), npm 10+, the Supabase CLI (`brew install supabase/tap/supabase` on Mac), Docker Desktop (for local Supabase), Android Studio with the Kotlin Multiplatform plugin, Xcode (Mac), and either VS Code or IntelliJ. Optional but recommended: GitHub Desktop for the early commits.

## Your first prompt to Claude Code

Open Claude Code in this directory and type something like this:

> Read `@README.md` and `@CLAUDE.md` to orient yourself. Then walk through Step 1 of `docs/Tech-Recommendations.md` Section 5.3 with me — initialize the monorepo, install dependencies, and confirm the workspace is set up correctly. Don't initialize the individual sub-projects yet; that's later sessions. Stop after `npm install` succeeds and the workspace is bootable.

Claude Code should:
1. Read CLAUDE.md and absorb the project conventions
2. Run `git init` and create the initial commit
3. Run `npm install` (which installs Turbo as the only root dependency)
4. Verify the structure
5. Stop and confirm with you before moving to Step 2

If Claude Code wants to install other things or skip ahead, push back. The point of Step 1 is just to prove the workspace boots.

## Sessions 2 through 5

These are rough scopes. Each is one Claude Code session.

### Session 2 — Initialize Supabase locally and run the first migration

> Walk through Step 5 of `docs/Tech-Recommendations.md` Section 5.3. Initialize Supabase locally, link it to my remote project (project ref: <YOUR_REF>), and apply the existing migration at `supabase/migrations/20260514120000_initial.sql`. After it applies cleanly, run `supabase gen types typescript --local > web/types/supabase.ts` (creating the `web/types/` directory if needed). Stop after the local database is up and types are generated.

This proves the database schema works and that the type-generation pipeline is set up.

### Session 3 — Initialize the Next.js web app

> Initialize the Next.js web app per `web/README.md`. Use TypeScript, Tailwind CSS, the App Router, and npm. After `npx create-next-app` finishes, copy `design/web-tokens/tokens.css` into `web/styles/tokens.css` and wire it into the root layout. Set up Tailwind to consume the design tokens from `design/web-tokens/design-tokens.ts`. Add the Supabase client setup in `web/lib/supabase.ts`. Stop after the dev server runs successfully (`npm run dev -w web`) and the landing page shows the brand colors.

This proves the design system flows through to web.

### Session 4 — Initialize the mobile shared module

> Generate the KMP project per `mobile/README.md` using the Compose Multiplatform Wizard. Targets: Android and iOS only — skip web and desktop. Drop the four theme files from `design/compose-theme/` into the shared module's `commonMain/kotlin/com/storytail/ui/theme/`. Bundle Poppins, Caveat, and JetBrains Mono fonts in `commonMain/composeResources/font/`. Update `StoryTailTypography.kt` to point at the bundled resources. Stop after the Android app builds and runs in the emulator showing a placeholder screen with the StoryTail theme applied.

This proves the design system flows through to mobile.

### Session 5 — Build the Login screen end-to-end

> Use the `new-screen` skill to implement Screen 2.1.1 Login end-to-end. Mobile version in Compose, web version in Next.js. Both call Supabase Auth directly via the SDK (no Edge Function needed for login itself). After both versions are working against the local Supabase, run the `audit-pci` skill as a sanity check. Stop after I can sign in on both web and Android.

This is the proving exercise. Login is in the middle of complexity — it touches auth, the design system, mobile + web, error states. If this works end-to-end, the architecture is sound.

## After Session 5

You have a working scaffold. From here, sessions are screen-by-screen or feature-by-feature work. The general pattern:

- "Build screen X.Y.Z" → invokes the `new-screen` skill
- "Add the X entity" → invokes the `new-entity` skill
- "Audit PCI on this change" → invokes the `audit-pci` skill
- "Set up the [Stripe / travel API / email / whatever] integration" → Claude Code builds it as an Edge Function

Read CLAUDE.md once a week. Things drift; CLAUDE.md is your re-grounding.

## When to stop, not move forward

Pause and ask the user for direction whenever:

- The Data Model or Screen Inventory doesn't have the answer you need (might be a doc gap; update the doc *first*, then code)
- You'd touch PCI scope in a way that's not already documented (always run the `audit-pci` skill first)
- A new third-party SDK seems necessary (security review needed)
- You're tempted to deviate from CLAUDE.md's "What NOT to do" list

## Things that will trip you up

A few practical notes from the planning phase:

- **The `.claude/` directory is committed.** Skills are project artifacts, not personal preferences. If you find yourself improving the skills, commit those improvements.
- **The OpenAPI contract is the API source of truth.** Don't hand-write TypeScript types for API responses; generate them via `npm run generate -w contracts`.
- **Supabase RLS policies are intentionally minimal in the first migration.** A follow-up migration adds them. Until then, anonymous and authenticated client roles can't read most tables — only Edge Functions running as the service role can. This is fine for early development.
- **The reference prototype in `design/source-prototype/` is read-only.** Don't edit it. If a screen's visual treatment needs to change, update the Compose or React implementation directly; the prototype is the visual ground truth at v1.0.
- **Memory carries between Claude Code sessions if you let it.** The `.claude/skills/` files and `CLAUDE.md` are the project's brain. Add to them as you learn.
- **`reference.docx` in the project root is junk** (a pandoc artifact). It's already in `.gitignore`. Delete it whenever the file lock releases.

## When things go wrong

- **The first migration fails to apply.** Read the error carefully. The migration is 350+ lines and lands in dependency order, but a missing extension or a typo could fail. Fix the migration, drop the local database (`supabase db reset`), reapply.
- **The TypeScript types are out of sync with the database.** Re-run `supabase gen types typescript --local > web/types/supabase.ts`.
- **Compose Multiplatform refuses to build.** First step: check the Gradle JVM. Compose Multiplatform requires JDK 17. `./gradlew --version` should show it.
- **A Stripe call fails locally.** Are you using the test mode keys? Production keys won't work against `localhost`.

## Welcome — the project is ready

The brand voice in `docs/Design-System.md` §2 is the soul of the work. Read it before you write any user-facing copy. Build for rest. Build for wonder. Build like Gyasi would.

— Handoff complete.
