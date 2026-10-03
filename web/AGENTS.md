<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# MUI rules

`web/` is styled with MUI 9.4.0 (`docs/Tech-Recommendations.md` §2.3.1). There is no Tailwind:
a utility class matches no rule and styles nothing, and `test/class-allowlist.test.ts` fails on
any className that no CSS file defines.

**The scheme belongs to `components/ThemeScript.tsx`, not to MUI.** ThemeScript sets
`.scheme-dark` on `<html>` before first paint; `lib/theme.ts` flips it at runtime. The theme
(`lib/mui/theme.ts`) uses CSS variables with `colorSchemeSelector: ".scheme-%s"`, so its light
values sit on `:root` and its dark values under `.scheme-dark`, and they follow that class.
`components/mui/MuiRegistry.tsx` passes `storageManager`, `storageWindow` and `colorSchemeNode`
as `null` so MUI never writes its own storage or class. The result is that server HTML is the
same in light and dark. Never:
- use `InitColorSchemeScript`, `useColorScheme`, or `theme.palette.mode` branches (eslint bans
  the first two);
- read `theme.palette.*` in a style callback: that is the light palette, frozen. Use a palette
  path in `sx` (`"surface.2"`) or `theme.vars.palette.*`;
- pick a layout with `useMediaQuery`: it renders differently on the server. Use `sx`
  breakpoint objects (`{ xs: …, md: …, web: … }`) or the media strings in `lib/mui/sx.ts`.

**Server Components may render MUI directly** (every MUI component is a client module), but
only with props that can cross the boundary: plain `sx` objects, strings, numbers, children,
server actions, and client references such as `component={NextLink}` from
`components/mui/NextLink.tsx`. A Server Component may NOT pass `sx={(theme) => …}`, event
handlers, render props, or function-valued `slotProps`. `styled()` lives only in `"use client"`
files. A mistake here on a page behind auth fails at request time, not at build time.

Some MUI components READ the props of an element you hand them (`NativeSelect input`,
`FormControlLabel control`, Chip/Avatar slots that clone): written in a Server Component that
element has no readable props, and server rendering throws. The page then **500s quietly**:
the browser re-renders it client-side and it looks fine, so check the HTTP status, not just
the screen. Use `components/mui/OutlinedNativeSelect` / `components/ui/Select` (both client
modules), and keep FormControlLabel in "use client" files.

**Colors** come from palette paths, never hexes: the M3 roles (`primary.container`,
`primary.onContainer`, `tertiary.main`), `surface.main` / `surface.1`–`surface.5`,
`outline.main` / `outline.variant`, `status.<kind>.bg` / `.fg`, `brand.main` (the orange),
`text.primary` / `text.secondary`, `divider`. The full map is in `docs/Design-System.md`
§12.2. Token values live in `lib/mui/tokens.ts` (pure data); `lib/mui/tokens.test.ts` fails if
they drift from the CSS tokens.

**sx traps** (each one shipped once, each now has a test in `test/`): a bare number from 0
to 1 for width/height is a FRACTION (`width: 1` is 100%), so use `VISUALLY_HIDDEN` from
`lib/mui/sx.ts` rather than a hand-written copy; grid tracks are `minmax(0, 1fr)`, never a bare
`1fr` (which cannot shrink below its content); put `m: 0` / `p: 0` BEFORE `mt` / `pt` in the
same object; `TAP_TARGET` goes on the element that is clicked, never on a wrapper or on an
absolutely positioned element.

**Type** uses MUI's variants on Poppins; `variant="script"` is the Caveat wordmark;
`sx={{ fontFamily: "mono" }}` is JetBrains Mono. **Spacing** is MUI's 8px scale (`p: 2` is
16px; the old Tailwind `p-4` is `p: 2`). **Breakpoints** match the old Tailwind ones: sm 640, md 768,
lg 1024, web 1200, xl 1280.

**CSS layers.** `app/globals.css` opens with `@layer base, mui, components;` and emotion writes
into `@layer mui`. `base` is the element reset, `styles/reset.css`: Tailwind's preflight kept as
plain CSS, because the converted screens rely on its margin, list and heading resets (MUI's
`CssBaseline` does not do them). `components` is what is left in `web/styles/*.css`: the scheme
gates, the pre-paint auth gates and the print hooks. Those beat MUI's own styles on layer
order, so a `display` in `sx` on a gated element is silently overridden. Keep the layer
statement the first rule in the file (`lib/mui/layers.test.ts`).

**Pure-data modules stay pure.** `components/ui/icon-paths.ts`, `content/**`,
`lib/mui/tokens.ts`, `lib/mui/sx.ts` and `lib/theme.ts` are imported from Node scripts (the
Kotlin content generator) or from Server Components without a client boundary. No React, MUI,
emotion, Next or CSS imports there (eslint enforces it).

**Tests.** Render MUI with `renderWithTheme` from `test/render.tsx` (motion off, so Dialog /
Menu / Accordion open instantly). Dialog, Menu and Popover content mounts in a portal on
`document.body`, so query it with `screen`, not `container`. Query by role and name, not by
class.

**Versions.** `@mui/*` and `@emotion/*` are pinned exactly and must match
`design/mui-vendor/` (the design prototype's bundle). `.github/scripts/check_mui_lockstep.py`
fails CI when they differ and prints the rebuild command.
