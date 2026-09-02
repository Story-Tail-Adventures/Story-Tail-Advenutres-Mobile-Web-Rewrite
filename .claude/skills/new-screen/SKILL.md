---
name: new-screen
description: Implement a screen from the Screen Inventory in Compose Multiplatform (mobile) and/or Next.js + React (web), following the Design System tokens. Triggers on "build screen X.Y.Z", "implement [screen name]", "add the [screen name] screen", or any request to start work on a specific Screen Inventory entry.
---

# new-screen

## Purpose

Implement a screen end-to-end starting from the Screen Inventory entry, the matching prototype JSX, and the Design System tokens. Ensures every screen lands consistent with the documented design and the responsive variant rules.

## When to use

Trigger phrases:
- "Build screen 2.1.1" / "Implement Login"
- "Add the Trip Detail screen"
- "Start on the dashboard"
- "Let's do screen 3.4.4"

Use this skill any time the user names a screen from the Screen Inventory (sections 2.x for client, 3.x for agent) and asks to build or start it.

## Procedure

1. **Read the Screen Inventory entry.** Open `docs/Screen-Inventory.md` and find the screen by ID. Capture the Purpose, Primary elements, Key actions, Entry points, and Related screens.

2. **Identify the responsive pattern.** Look up the screen in Screen Inventory §4.4 (Per-Screen Variant Mapping). Note which Pattern (A through J) applies and any deviations. This tells you the mobile/tablet/web layout shape.

3. **Open the reference prototype.** Find the matching JSX in `design/source-prototype/screens/`.
   There are **18 files covering ~168 screens**, so the mapping is many-screens-to-one-file:
   `client-auth.jsx` holds all of 2.1.x, `client-trip.jsx` all of 2.2.x, `agent-payment.jsx`
   all of 3.6.x, and so on. Don't hunt for a per-screen file — open the section file and find
   the `C211_Login`-style component inside it. `client-mobile.jsx` carries the mobile variants
   for the screens that have one; many do not, in which case the desktop artboard supplies the
   content and copy while §4.4's Pattern rules govern the layout. The prototype is the visual
   ground truth.

4. **Check the phase marker.** Confirm whether this screen is P1 (MVP) or later. If P2/P3, ask the user whether they want to build it now or hold for the right phase.

5. **Build the mobile version (if applicable).** In
   `mobile/shared/src/commonMain/kotlin/com/storytail/adventures/ui/screens/<area>/`, create the
   Compose screen plus its `ViewModel` and `UiState`. Tokens come from
   `com.storytail.adventures.ui.theme` — `MaterialTheme.colorScheme.*`, `StoryTailBrand.*`,
   `LocalStoryTailExtended.current`, `LocalStoryTailStatusColors.current`, `StoryTailShapes`,
   `PillShape`. Reusable pieces go in `ui/components/`. Match the prototype in light *and* dark;
   the dark scheme is a full tropical rebrand, not an inversion.

6. **Build the web version (if applicable).** In the matching route group —
   `web/app/(public|auth|client|agent)/` — create the page. Prefer a Server Component with a
   `"use client"` form/interaction child. Reuse the primitives in `web/components/ui/` and the
   ported prototype classes in `web/styles/components.css` (`.btn`, `.input`, `.card`, `.chip`,
   `.t-headline`, …) — the prototype JSX uses these by name, so a port stays close to a literal
   transcription. Tailwind utilities for layout; brand tokens resolve through the `@theme inline`
   map in `web/app/globals.css`. Dark mode is the `.scheme-dark` class, so use the `dark:`
   variant, not `prefers-color-scheme`.

7. **Wire up the API call.** A plain RLS-protected table read goes straight through the Supabase
   client (`web/lib/supabase/server.ts`, or the repository layer in
   `com.storytail.adventures.api`) — no Edge Function needed, but the table needs policies, so
   check `rls-policy`. Anything with server-side logic, a secret, or a sensitive mutation gets an
   Edge Function: use the `new-edge-function` skill, which also handles the
   `contracts/openapi.yaml` entry and `npm run generate -w contracts`.

8. **Apply the brand voice.** For copy-heavy screens (especially 2.0.2 About, 2.1.9 Welcome, dashboards, emails), check `docs/Design-System.md` §2 (Brand Voice & Worldview) and the §2.6 tone calibration checks. The rest-and-creation theme should be present in the right places, never preachy.

9. **Verify against the prototype.** Open the prototype's JSX side-by-side. If the Compose or React output looks different from the prototype's light or dark artboards, fix the implementation unless the prototype is genuinely wrong (rare).

10. **Cite the source.** In a comment at the top of the screen file:
    ```kotlin
    // Screen 2.2.3 Trip Detail — see docs/Screen-Inventory.md §2.2.3 (and §4.4 for the
    // responsive Pattern) and design/source-prototype/screens/client-trip.jsx
    ```

## What this skill never does

- Skips the responsive variant mapping. Mobile gets Pattern X, tablet gets Pattern Y, web gets Pattern Z — they are not always the same layout.
- Hardcodes brand colors. All colors come through `MaterialTheme.colorScheme.*` on mobile and CSS variables on web.
- Loads fonts from the Google Fonts CDN at runtime. They are already bundled: `next/font/google`
  in `web/app/fonts.ts` (build-time, self-hosted) and `composeResources/font/` on mobile.
- Touches PCI scope without invoking the `audit-pci` skill afterward.
