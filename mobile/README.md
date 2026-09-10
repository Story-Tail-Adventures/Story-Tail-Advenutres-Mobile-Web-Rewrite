# `mobile/` — Kotlin Multiplatform mobile project

Android + iOS apps built with **Kotlin Multiplatform** and **Compose Multiplatform**. This sub-project does **not** target web — the web app is a separate TypeScript Next.js project in `../web/`. The KMP shared module is mobile-only.

## Status

**Building and running on Android**, with four Screen Inventory sections shipped:

| Section | Screens | Where |
|---|---|---|
| §2.0 public | 11 | `ui/screens/public/` |
| §2.1 auth + onboarding | 13 (2.1.8 is web-only) | `ui/screens/auth/`, `ui/screens/onboarding/` |
| §2.2 trips | 11 | `ui/screens/trip/`, `ui/screens/dashboard/` |
| §2.5 account | 10 | `ui/screens/account/` |

The bottom bar (`domain/trip/ClientDestinations.kt`) shows two live tabs of four — Trips and
Account. Discover is §2.3 and Phase 2; Messages is §2.6 and unbuilt. Both stay VISIBLE and
dimmed rather than hidden, so the bar does not move under the reader's thumb as sections land.

Still missing: the bundled brand fonts (the TTFs are not in the repo, so
`StoryTailTypography.kt` falls back to `FontFamily.Default`).

```bash
./gradlew :androidApp:assembleDebug
./gradlew :shared:testAndroidHostTest
./gradlew :shared:compileKotlinIosSimulatorArm64   # the iOS-compatibility gate
```

Copy `local.properties.example` and fill in the Supabase values from `supabase status`.
The emulator reaches the host at `10.0.2.2`, not `127.0.0.1`.

**iOS is gated on Xcode.** Only the Command Line Tools are installed on the current dev
machine, so Kotlin/Native cannot link the framework — `./gradlew :shared:build` and
`:shared:check` **fail** for that reason alone. The klib compile above still catches
iOS-incompatible shared code, and the iOS targets stay declared in
`shared/build.gradle.kts` so nothing drifts.

## How this was scaffolded

Historical, for reference — the wizard has already been run and its output reworked:

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

1. **Copy the design system theme files** from `../design/compose-theme/` into `shared/src/commonMain/kotlin/com/storytail/adventures/ui/theme/`:
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
