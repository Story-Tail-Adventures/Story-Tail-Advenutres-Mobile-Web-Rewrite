# `mobile/` — Kotlin Multiplatform mobile project

Android + iOS apps built with **Kotlin Multiplatform** and **Compose Multiplatform**. This sub-project does **not** target web — the web app is a separate TypeScript Next.js project in `../web/`. The KMP shared module is mobile-only.

## Status

**Scaffolded, not yet wired up.** The Compose Multiplatform Wizard has been run — `settings.gradle.kts`,
`shared/`, `androidApp/` and `iosApp/` all exist and the Android app builds. What is still missing:
the Story-Tail theme (see `../design/compose-theme/`), bundled fonts, networking dependencies, and any
real screen. The target layout below is the goal, not the current state.

**iOS is gated on Xcode.** Only the Command Line Tools are installed on the current dev machine, so
Kotlin/Native cannot link the `iosArm64` / `iosSimulatorArm64` targets. That means `./gradlew :shared:build`
and `:shared:check` **fail** — use the Android-scoped tasks (`:shared:assembleAndroidMain`,
`:shared:testAndroidHostTest`, `:androidApp:assembleDebug`) until Xcode is installed. The iOS targets stay
declared in `shared/build.gradle.kts` so shared code cannot drift iOS-incompatible.

## Initialize

When ready to start, use the [Compose Multiplatform Wizard](https://kmp.jetbrains.com/) to generate the initial structure:

1. Visit `https://kmp.jetbrains.com/`
2. Set the project name to `mobile` (or `storytail-mobile`)
3. Targets: Android, iOS (skip web and desktop)
4. UI: Compose Multiplatform
5. Download the zip, extract its contents into this directory

After initialization the layout should be:

```
mobile/
├── shared/                       # KMP shared module
│   ├── src/
│   │   ├── commonMain/kotlin/com/storytail/
│   │   │   ├── domain/           # Trip, Client, Card, Commission, etc.
│   │   │   ├── enums/            # TripStatus, ClientStatus, etc.
│   │   │   ├── api/              # API clients calling Supabase + Edge Functions
│   │   │   ├── ui/theme/         # ← copy the four files from ../design/compose-theme/ here
│   │   │   └── util/             # Money, Uuid, Phone (value classes)
│   │   ├── commonMain/composeResources/
│   │   │   └── font/             # ← bundle Poppins, Caveat, JetBrains Mono here
│   │   ├── androidMain/
│   │   └── iosMain/
│   └── build.gradle.kts
├── androidApp/
├── iosApp/
├── build.gradle.kts
├── settings.gradle.kts
└── gradle.properties
```

## Next steps after init

1. **Copy the design system theme files** from `../design/compose-theme/` into `shared/src/commonMain/kotlin/com/storytail/ui/theme/`:
   - `StoryTailColors.kt`
   - `StoryTailTypography.kt`
   - `StoryTailShape.kt`
   - `StoryTailTheme.kt`

2. **Add the font resources** (Poppins, Caveat, JetBrains Mono) to `shared/src/commonMain/composeResources/font/`. Update `StoryTailTypography.kt` to point `PoppinsFamily`, `CaveatFamily`, `MonoFamily` at the bundled resources.

3. **Add SqlDelight** to the shared module for the local cache. See `../docs/Data-Model.md` §21.5 for the rationale (Phase 1 architecture; Phase 3 UI).

4. **Wire `StoryTailTheme`** into the app root of `androidApp` and `iosApp`. Apply system-theme detection by default.

5. **Build the first screen**: Login (Screen Inventory 2.1.1) end-to-end as the proving exercise. See `../docs/Tech-Recommendations.md` §5.3 Step 6.

## What the shared module does NOT do

- It does not run on the backend (backend is Supabase Edge Functions in TypeScript).
- It does not run on the web (web is Next.js + TypeScript).
- API contract types are mirrored to Kotlin via codegen from `../contracts/openapi.yaml` — do **not** hand-write the Kotlin domain types when they overlap with the API contract. See `../contracts/README.md`.
