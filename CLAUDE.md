# Story-Tail Adventures — Claude Code Project Instructions

A custom CRM platform replacing Travefy for Story-Tail Adventures (a travel advisory business hosted by Inteletravel). This is a monorepo with mobile (Kotlin Multiplatform) and one Go service in `web/` that serves both the web pages and the API.

## Read these documents before answering anything substantive

The five documents in `docs/` are the canonical source of truth for this project:

- `@docs/BRD.md` — business requirements, scope, phases
- `@docs/Screen-Inventory.md` — every screen (~162 of them) with mobile/tablet/web variants
- `@docs/Data-Model.md` — every entity, every field, with Postgres DDL and Kotlin data classes
- `@docs/Design-System.md` — colors, typography, components, **brand voice and worldview** (§2)
- `@docs/Tech-Recommendations.md` — stack choices and Claude Code bootstrap walkthrough

When the user asks about features, screens, entities, payment workflows, design choices, or anything else load-bearing, **read the relevant doc first**. Don't reason from training data when the project has its own answers.

## Stack

- **Mobile** — Kotlin Multiplatform + Compose Multiplatform (Android + iOS)
- **Web** — the Go service in `web/`: server-rendered HTML pages built with htmlx behind `internal/page`, styled by hand-written CSS in `web/assets/css/` whose tokens are pinned to `design/web-tokens/`. The Next.js app, React, MUI and the npm `web` workspace are all GONE (Phase 6, 2026-11-26); the Go service was built in `web/` while that app still held the name, and was renamed over it.
- **Backend** — the Go service in `web/`. The Supabase Edge Functions are GONE: all 34 folders were deleted in Phase 6 (2026-11-26). **33** of them run in Go under `web/internal/api/fn/`, served at the same `/functions/v1/{name}` addresses; the 34th, `hotel-search`, was retired rather than ported, because web hotel search moved into the app in PR #48 and nothing calls the function. There is no Deno in this repo. NO Ktor service.
- **The Go move is COMPLETE (adopted 2026-11-06, finished 2026-11-26).** One Go service serves the web pages (htmlx, read-only, behind `internal/page`) and the API mobile calls at `/functions/v1/{name}`, as one binary. The Next.js app and the 34 Edge Functions are both deleted and `web/` has been renamed to `web/`. Supabase keeps Postgres, RLS, Auth, Storage, pg_cron and migrations; `mobile/` stays Kotlin. **Read `docs/GO-MIGRATION.md` before touching `web/`.**
- **Database / Auth / Storage / Realtime** — Supabase
- **Payments**: none. The app holds no cardholder data and has no payment vendor; Stripe left the stack 2026-10-16 (it cannot reveal a stored card number anyway). Clients pay suppliers through a pay link on each payment milestone, and only the advisor marks a milestone paid. See `docs/BRD.md` §10.
- **API contract** — OpenAPI spec in `contracts/openapi.yaml` → generated TypeScript types → generated Kotlin types
- **Design source of truth** — the Claude Design project `https://claude.ai/design/p/019e27d4-5f9f-7c8d-b082-db804374dab3` (the older handoff tarball URL under `api.anthropic.com/v1/design/h/…` now returns 404). The local mirror lives at `design/source-prototype/` (read by `new-screen`, `go-reviewer`, `mobile-reviewer`); the design is organised as `pages/` (one section page per Screen Inventory section plus `pages/_sections.json`) and `screens/*.jsx`. To sync: run `/design-login` once in an interactive Claude Code session, then the `sync-design-handoff` skill (it reads the project through the `DesignSync` tool's `list_files` / `get_file`). **Every screen built must be visually faithful to the matching prototype JSX in `design/source-prototype/screens/`.**

**Stack directories are hard boundaries.** All mobile code (Kotlin / KMP / Compose Multiplatform) lives under `mobile/`. All web and API code is Go under `web/` (`.go`, `go.mod`, `go.sum`, page templates, CSS and JS assets). `supabase/` holds migrations, RLS and seeds only. Shared API types live under `contracts/`. Cross-contamination, such as Kotlin UI code under `web/`, is a defect. The `go-reviewer` and `mobile-reviewer` subagents will flag any code in the wrong tree. There is no React in this repo: the only `.tsx` left is `design/source-prototype/`, which is reference, not shipped code.

## Critical rules — these are non-negotiable

1. **No cardholder data, anywhere.** Never accept, store, log or display a card number: no card form, no vault, no tokenization, no PAN reveal. Code that takes or keeps a card number is a defect. Bringing back any card handling needs a new decision from Gyasi. See `docs/BRD.md` §10 and `docs/Tech-Recommendations.md` §4.

2. **No client-facing billing.** Story-Tail Adventures is contractually prohibited from charging clients planning, consultation, or service fees (per Inteletravel host agency policy). The platform has no Invoice entity, no "charge client" actions, no merchant-of-record flows. A Travefy invoice used as a pay link may carry supplier cost only, never an advisor fee. See `docs/BRD.md` §10.5.

3. **Every mutation goes through audit middleware.** The Go API handlers (`web/internal/audit`) writing to sensitive tables (payment_milestone, commission, client) must write an `audit_event` row capturing actor, target, metadata. See `docs/Data-Model.md` §15 and §20.

4. **Pay links are guarded.** A milestone's pay link must be `https://`. Only the advisor can add, change or remove it (clients read it, never write it), and every add, change or removal writes an `audit_event` row, since a swapped link could send a client's money to the wrong place. The client's "I've paid" only posts a trip message; it never marks anything paid. See `docs/BRD.md` §10.

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
- **P2** — Self-guided search and inquiry capture. Travel API integrations (Amadeus, Hotelbeds, Viator, Widgety, SerpApi Google Hotels). Phase 2 also brings the public marketing-adjacent search surface live. **A quote request creates a Trip in `inquiry` status, not a Lead** (BRD §6.5, decided 2026-09-09). **A message from somebody without an account IS a Lead** (decided 2026-10-21): the reshaped `lead` domain in Data-Model §11, worked in Screen Inventory §3.8 on the web.
- **P3** — Multi-agent, group trip coordination, mobile offline UI, API-driven booking workflows.
- **P4+** — Future features (AI-assisted planning, loyalty, etc.).

## Common commands

```bash
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
supabase gen types typescript --local > web/types/supabase.ts   # regen DB types

# Contracts (codegen TS + Kotlin types from openapi.yaml)
npm run generate -w contracts

# Go web app + API (from web/; needs Go 1.27.3+, go.mod pins the toolchain)
go run ./cmd/server                 # serves on :8080 (PORT overrides)
go test -race ./...
go vet ./...
gofmt -l .                          # must print nothing
go build ./cmd/server
```

## Local development gotchas

- **Go: a parsed page is shared by every request.** Fill a deep copy (`internal/page` does it),
  never the parsed tree, or one visitor sees another's data. htmlx is a reader only; its setters
  have real bugs (`SetAttr` keeps an existing value). See `docs/HTMLX-Library-Security-Review.md`.
- **Go: never decode a row into `any` or `map[string]any`.** JSON numbers become `float64`
  there and break the cents rule. Use typed structs with `int64` for every `*_cents` field.
- **Go: import `time/tzdata`.** A slim build has no zone files, and `time.LoadLocation` fails at
  runtime, not at build.
- **Go: every slot a handler fills must exist in its HTML.** The startup slot check fails the
  boot (and CI) on a renamed slot; don't work around it.

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
- **`client.functions.invoke` THROWS on a non-2xx; it does not return the response.**
  supabase-kt validates every response, so `if (response.status.value in 400..499)` written
  *after* the call is unreachable code — the rejection already left through the `catch`. Three
  repositories shipped that shape, and every rejection from the API reached the traveler as
  the generic "try again in a moment" instead of the sentence the function wrote. Catch
  `io.github.jan.supabase.exceptions.RestException` and read the body off **`rest.error`** —
  `Functions.parseErrorResponse` puts the raw body there, leaves `description` null, and
  appends `URL:` / `Headers:` lines to `message`, so parsing `message` fails on the trailing
  text and silently yields null. `rest.statusCode` is the status.
- **The Android emulator reaches local Supabase at `http://10.0.2.2:54321`,** not
  `127.0.0.1` — that is the emulator's own loopback. Set it in `mobile/local.properties`.
- **`supabase db reset` is the local loop; `supabase db push` targets a linked remote.**
  Don't reach for `push` locally.
- **Dark mode on web is the `.scheme-dark` class**, not `prefers-color-scheme`. The Go pages
  set it on `<html>` and the CSS in `web/assets/css/` keys off it. (This rule used to be
  about keeping MUI from owning the switch; MUI went with the Next app in Phase 6.)
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
- **iCloud evicts file CONTENT, and `git status` stays clean.** This repo lives under
  iCloud-synced `~/Documents`. Evicted files keep their size in `ls` and in git's index but
  read back as **zero bytes**, so git sees no change while the compiler sees an empty file.
  On 2026-11-25 this had **134 tracked files** dataless at once, which produced three
  separate, misleading failures: `:shared:assembleAndroidMain` failing with ~40 "Unresolved
  reference" errors (the 73 KB `api/TripRepository.kt` was empty); a Gradle `EOFException`
  on `.gradle/**/executionHistory.bin`; and an APK that built fine but **crashed at launch**
  with `NullPointerException: decodeByteArray(...) must not be null` because
  `composeResources/drawable/*.jpg` were empty when packaged. Detect and fix with:
  ```bash
  git ls-files -z | while IFS= read -r -d '' f; do [ -f "$f" ] || continue; s=$(wc -c <"$f"); [ "$s" -gt 0 ] && [ "$(dd if="$f" bs=1 count=1 2>/dev/null | wc -c)" -eq 0 ] && echo "$f"; done
  ```
  then `brctl download <file>` each one (it is fast and non-destructive). **Suspect this
  first** whenever a symbol that plainly exists is "unresolved", or an image crashes at
  runtime. After fixing, `./gradlew :androidApp:clean :shared:clean` — a previously built
  APK keeps the empty assets baked in.

### Android CLI (`android`) — installed 2026-11-25

Google's agent-facing CLI, installed from Google's own tap
(`brew install --cask android/tap/android-cli`; note a *different*, pinned `android-cli`
cask also exists in homebrew-cask core — use the fully-qualified name). The matching Claude
Code plugin is `android-cli@android-cli-plugin`; it ships one skill and no MCP server, so it
costs nothing at startup. `android init` writes only to `~/` (it does not touch this repo).

What it is actually good for here, verified on this project:

- **`android layout` beats a raw `uiautomator dump`.** Measured side by side on the Sign-in
  screen with the keyboard up: `android layout` returned the live screen with correct bounds
  (`EditText [162,1589][1182,1757]`, matching the screenshot) and a **precomputed `center`**
  per element, and it tags semantics (`EDITABLE`, `PASSWORD`, `SCROLLABLE`). The raw
  `uiautomator dump` at the same moment returned the **previous screen**, with the fields
  typed as `android.widget.Button` and **no `EditText` at all**. This is the real cause of
  the old "uiautomator bounds lie when the keyboard is up" note — prefer `android layout`.
- **Tap/type by selector, not coordinates:** `android input tap "text=Sign in" --match first`.
- **`android run` does a delta install** (observed 1.12 MB instead of 22.90 MB, ~95% saved).
- **`android preview render` works without a device or emulator** and *does* render Compose
  Multiplatform composables out of `shared/commonMain` — the component tree walked
  `App` → `StoryTailTheme` (App.kt) correctly. **But** the repo's only `@Preview`
  (`AppAndroidPreview`) renders a **blank cream screen**, because `App()` sits on
  `SplashScreen` until the background Supabase init completes, which never happens in a
  static render. To get value from previews, add them on individual screen composables with
  fake data — not on `App()`.

Permissions for these commands are in `.claude/settings.json`; `android auth`, `create`,
`update`, `sdk install` and `skills` are on `ask`, and `emulator remove` / `sdk remove` are
denied.

**Kotlin LSP is installed but NOT usable yet.** `brew install JetBrains/utils/kotlin-lsp`
plus `kotlin-lsp@claude-plugins-official` are both in place and the binary runs
(271.2085.0-EAP), but it refuses to start without an accepted JetBrains EULA
(`--eula=<hash>`); run `kotlin-lsp --show-eula` and accept it yourself if you want it.
Temper expectations: JetBrains states kotlin-lsp supports **JVM-only** Kotlin Gradle
projects and lists KMP as planned, so `shared/` may index badly. If it emits bogus
diagnostics, uninstall rather than live with the noise.

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
   gone rather than managed. `.claude/worktrees/` is gitignored. The Supabase CLI, `go`,
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
- Don't introduce a separate Kotlin backend service, or any second backend service. The backend is the one Go service in `web/` (`docs/GO-MIGRATION.md`). If you find yourself wanting a Ktor service, a new Edge Function or another host, push back and discuss before adding it.
- Don't let the service-role key reach a page handler in Go. Only `web/internal/api/...` may import the service client; pages read with the visitor's own token.
- Don't paste files into chat — use `@-mentions` (e.g., `@docs/BRD.md`) for cleaner tokenization and a better audit trail.
- Don't load Google Fonts at runtime in production — bundle Poppins / Caveat / JetBrains Mono in `mobile/shared/src/commonMain/composeResources/font/` for mobile and via `next/font` for web.
- Don't make a copy decision without checking `docs/Design-System.md` §2 first. The brand voice is load-bearing.
- Don't bring a CSS framework into `web/`. Styling is hand-written CSS in `web/assets/css/`, with the design tokens pinned to `design/web-tokens/` by a test in `internal/static`.

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

After a grilling session (`/grill-me`), write each settled ruling into the doc that governs it before building. The skill keeps no record, so a ruling left only in the chat is lost when the session ends.
