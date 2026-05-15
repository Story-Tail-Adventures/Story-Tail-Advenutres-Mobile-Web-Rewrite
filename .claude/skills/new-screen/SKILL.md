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

3. **Open the reference prototype.** Find the matching JSX in `design/source-prototype/screens/` (e.g., `client-trip.jsx` for any 2.2.x screen, `agent-payment.jsx` for any 3.6.x screen). Read it. The prototype is the visual ground truth.

4. **Check the phase marker.** Confirm whether this screen is P1 (MVP) or later. If P2/P3, ask the user whether they want to build it now or hold for the right phase.

5. **Build the mobile version (if applicable).** In `mobile/shared/src/commonMain/kotlin/com/storytail/ui/screens/`, create the Compose screen. Use tokens from `mobile/shared/.../ui/theme/StoryTail*.kt`. Match the prototype's light and dark output.

6. **Build the web version (if applicable).** In `web/app/.../`, create the Next.js page or component. Use Tailwind classes that consume CSS variables from `web/styles/tokens.css`. Match the prototype's light and dark output.

7. **Wire up the API call.** If the screen reads/writes data, define or extend the endpoint in `contracts/openapi.yaml`, regenerate types via `pnpm --filter contracts generate`, then write the Edge Function in `supabase/functions/` if it doesn't exist.

8. **Apply the brand voice.** For copy-heavy screens (especially 2.0.2 About, 2.1.9 Welcome, dashboards, emails), check `docs/Design-System.md` §2 (Brand Voice & Worldview) and the §2.6 tone calibration checks. The rest-and-creation theme should be present in the right places, never preachy.

9. **Verify against the prototype.** Open the prototype's JSX side-by-side. If the Compose or React output looks different from the prototype's light or dark artboards, fix the implementation unless the prototype is genuinely wrong (rare).

10. **Cite the source.** In a comment at the top of the screen file:
    ```kotlin
    // Screen 2.2.3 Trip Detail — see docs/Screen-Inventory.md §2.2.3 and design/source-prototype/screens/client-trip.jsx
    ```

## What this skill never does

- Skips the responsive variant mapping. Mobile gets Pattern X, tablet gets Pattern Y, web gets Pattern Z — they are not always the same layout.
- Hardcodes brand colors. All colors come through `MaterialTheme.colorScheme.*` on mobile and CSS variables on web.
- Loads fonts from Google Fonts CDN at runtime in production. Poppins/Caveat/JetBrains Mono must be bundled.
- Touches PCI scope without invoking the `audit-pci` skill afterward.
