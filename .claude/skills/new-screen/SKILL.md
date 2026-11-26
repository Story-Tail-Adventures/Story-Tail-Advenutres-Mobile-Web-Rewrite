---
name: new-screen
description: Implement a screen from the Screen Inventory in Compose Multiplatform (mobile) and/or Go server-rendered pages (web), following the Design System tokens. Triggers on "build screen X.Y.Z", "implement [screen name]", "add the [screen name] screen", or any request to start work on a specific Screen Inventory entry.
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
   ground truth, on web as much as on mobile, and it is the only React left in the repo:
   reference, never shipped code.

4. **Check the phase marker.** Confirm whether this screen is P1 (MVP) or later. If P2/P3, ask the user whether they want to build it now or hold for the right phase.

5. **Build the mobile version (if applicable).** In
   `mobile/shared/src/commonMain/kotlin/com/storytail/adventures/ui/screens/<area>/`, create the
   Compose screen plus its `ViewModel` and `UiState`. Tokens come from
   `com.storytail.adventures.ui.theme` — `MaterialTheme.colorScheme.*`, `StoryTailBrand.*`,
   `LocalStoryTailExtended.current`, `LocalStoryTailStatusColors.current`, `StoryTailShapes`,
   `PillShape`. Reusable pieces go in `ui/components/`. Match the prototype in light *and* dark;
   the dark scheme is a full tropical rebrand, not an inversion.

6. **Build the web version (if applicable).** Web is Go: one plain HTML page file, one handler
   that fills it. Read `docs/GO-MIGRATION.md` §4.4 (page building) and §4.8 (styling) before the
   first screen you build; the rules below are the short form.

   - **Write the page file** at `web/pages/<area>/<screen>.html`, where `<area>` is `public`,
     `auth`, `onboarding`, `client` or `agent` (see `web/pages/client/trips.html` and
     `account.html`). It is a full HTML document that opens on its own in a browser showing its
     placeholder copy. The loader refuses head content beyond `<title>` and `<meta>`, attributes
     on `<main>`, and anything in `<body>` outside `<main>`. Shared CSS and scripts belong to
     the layout, not the page. Mark what the handler fills with `data-slot="name"`, and the one
     sample row of a list with `data-repeat="name"`; names are lower-case `[a-z][a-z0-9-]*`.
     Text the HTML gives a slot counts as fixed copy unless the handler calls `Text`, so
     anything that varies needs its own slot (a `<span>` inside the link, not the link itself).
     Open the file with a comment citing the Screen Inventory entry, the §4.4 Pattern, the
     prototype file, and every deliberate departure from the artboard.

   - **Style with the classes that exist** in `web/assets/css/`: `tokens.css` (the design
     tokens, pinned to `design/web-tokens/tokens.css`), `theme.css` (the palette variables both
     schemes read), `ui.css` (`.btn`, `.card`, `.chip`, `.field`, `.table`, `.tabs`,
     `.status-chip`, `.type-*`, …), `shell.css` for chrome, and `area/<area>.css` for rules only
     this area uses. `/_styleguide` (development only) shows every `ui.css` class in both
     schemes. Don't invent a class: `web/internal/static/classes_test.go` fails on any class a
     page uses, or a handler adds with `Class(...)`, that no stylesheet defines. A misspelled
     class matches no rule and nothing else would notice. There is no CSS framework.

   - **Write the handler** at `web/internal/handlers/<area>/<screen>.go`. Declare a
     `page.Spec` naming the file, the layout (`shell.Client`, `shell.Agent`, …) and every slot
     and repeat, add that spec to the area's `Specs` slice, and add your `mount<Screen>`
     function to the area's `Mount` list (`web/internal/handlers/client/client.go` shows
     both). Take the parsed template once, inside mount: `tmpl, err := a.Pages.Template(spec.File)`.

   - **Mount under a gate, never by matching the path yourself.** `rt.Protected` for a
     signed-in page: it panics at boot if the path is not under `gate.ProtectedPrefixes`, so
     the route list and the gate cannot drift apart. `rt.Public` panics the other way, if the
     path *is* gated. `AuthOnly`, `FrontDoor`, `SignOutRoute`, `MFAChallengeRoute` and `SelfGated`
     (JSON, answers 401 itself) cover the rest. In a gated area the handler then calls the
     area's own entry check (`a.enter(w, r)` in the client area) before reading anything.

   - **Fill a fresh deep copy per request:** `d := tmpl.New()` inside the handler, every time.
     The parsed page is shared by every request and is never changed; filling it instead of a
     copy means one visitor sees another visitor's data. Setters: `Text`, `Attr` (data-*,
     aria-*, and a fixed plain list), `Class`, `Bool`, `URL` for `href`/`src`/`action`/
     `formaction` (relative, `https:`, `mailto:`, `tel:` only), `PayURL` for a pay link
     (absolute `https://`, on `<a>` only, per CLAUDE.md rule 4), `Repeat` for rows, `Remove` for a
     block that does not apply, `Keep` for one left exactly as written. Values go in as text
     nodes or attribute values and are escaped on render; nothing from a request or a row is
     ever parsed as markup.

   - **Every slot must line up, both ways.** Each slot and repeat in the HTML must be declared
     in the Spec and each declared one must appear in the HTML exactly once; the startup check
     fails the boot, and CI, on a renamed or undeclared slot. Don't work around it. Per request,
     every declared slot must be filled, removed or kept, and every placeholder link a slot
     carries must go through `URL` or `PayURL`. Otherwise `Bytes` renders nothing and reports
     the problem, so a half-filled page never reaches a visitor.

   - **Interactivity is links and forms first** (§4.9): one URL per tab, `<form method="get">`
     for filters so the filter lives in the URL, `<form method="post">` then 303 and a one-time
     flash for a mutation, native `<dialog>` and `<details>`. A JS module in `web/assets/js/`
     only when none of that does the job; the CSP is `script-src 'self'` with no inline script,
     style attribute or `on*` handler, and a page that would break it refuses to boot.

   - **A failed read is not an empty result.** "No trips yet" shown to somebody who has six
     trips is a lie. Each loader says which happened, and the page has an error state separate
     from its empty state.

7. **Wire up the API call.** A plain RLS-protected table read goes straight through the
   `web/internal/supa` helpers with the **visitor's own access token** (`supa.MaybeOne`,
   `supa.Many`), or the repository layer in `com.storytail.adventures.api` on mobile. No API
   endpoint is needed, but the table needs policies, so check `rls-policy`. The service-role client
   must never reach a page handler; only `web/internal/api/...` may import it. Anything with
   server-side logic, a secret, or a sensitive mutation gets an endpoint: use the
   `new-go-endpoint` skill, which also handles the `contracts/openapi.yaml` entry and
   `npm run generate -w contracts`.

8. **Apply the brand voice.** For copy-heavy screens (especially 2.0.2 About, 2.1.9 Welcome, dashboards, emails), check `docs/Design-System.md` §2 (Brand Voice & Worldview) and the §2.6 tone calibration checks. The rest-and-creation theme should be present in the right places, never preachy.

9. **Verify.** Open the prototype's JSX side-by-side. If the Compose or Go output looks different
   from the prototype's light or dark artboards, fix the implementation unless the prototype is
   genuinely wrong (rare). Check both schemes: on web, dark mode is the `.scheme-dark` class on
   `<html>`, not `prefers-color-scheme`. Then from `web/`:
   ```bash
   gofmt -l .          # must print nothing
   go vet ./...
   go test -race ./...  # the slot check and the class allowlist run here
   go run ./cmd/server  # the page must boot before it can be reviewed
   ```
   Then hand the diff to the `go-reviewer` subagent (`mobile-reviewer` for the Compose side).

10. **Cite the source.** In a comment at the top of the screen file:
    ```kotlin
    // Screen 2.2.3 Trip Detail — see docs/Screen-Inventory.md §2.2.3 (and §4.4 for the
    // responsive Pattern) and design/source-prototype/screens/client-trip.jsx
    ```
    On web the same citation goes in the HTML comment at the top of the page file, and a one-line
    `// Screen 2.2.3 Trip Detail` above the `page.Spec` in the handler.

## What this skill never does

- Skips the responsive variant mapping. Mobile gets Pattern X, tablet gets Pattern Y, web gets Pattern Z — they are not always the same layout.
- Hardcodes brand colors. All colors come through `MaterialTheme.colorScheme.*` on mobile and the
  CSS custom properties in `web/assets/css/tokens.css` and `theme.css` on web.
- Loads fonts from the Google Fonts CDN at runtime. They are already bundled and self-hosted:
  the TTFs in `web/assets/fonts/` with `@font-face` in `web/assets/css/fonts.css` on web, and
  `composeResources/font/` on mobile.
- Writes raw HTML, or anything read from the database, into a page as markup. Text goes in as
  text.
- Touches PCI scope without invoking the `audit-pci` skill afterward.
