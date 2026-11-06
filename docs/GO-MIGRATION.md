# Moving Story-Tail Adventures to Go (web and backend)

Status: **adopted by Gyasi 2026-11-06. Phase 0 in progress.**

History: first written 2026-11-03 for `web/` only, with htmx (PR #174). Revised the same day to
use [mdigger/htmlx](https://github.com/mdigger/htmlx) instead (PR #175). On 2026-11-06 Gyasi
widened the scope to the backend, chose to skip putting Next.js back online, and accepted every
recommendation. The old file was `docs/GO-HTMLX-MIGRATION.md`.

This doc is the plan of record. Where it disagrees with an older line in another doc that has not
been updated yet, this doc and the rulings in section 3 win. Section 10 lists what changes where.

---

## 0. The short version

- **One Go service replaces both `web/` (Next.js) and the 34 Supabase Edge Functions.** It
  serves the web pages and the JSON API the phone app calls, from one binary on Render.
- **Supabase stays.** Postgres, RLS, GoTrue auth, Storage, pg_cron, migrations and the SQL tests
  do not move. The CLAUDE.md rules enforced in the database stay exactly where they are.
- **`mobile/` stays Kotlin.** It changes one thing: the address it sends function calls to.
- **Pages are plain HTML files**, filled in on the server with htmlx (a small Go library, not
  htmx; it puts no JavaScript in the browser). Forms post, the server redirects. A few widgets
  get small JavaScript files.
- **Skip Next.js on Render.** Production has been dark since Vercel paused it on 2026-10-26, and
  the Render service was never created. Rather than bring Next.js back and then replace it, the
  site comes back on Go: public pages first, then sign-in, the traveler side and the agent side.
- **The backend moves by function, behind one door.** Go answers `/functions/v1/{name}` exactly
  the way Supabase does. A function not yet ported is passed through to Supabase, so mobile
  switches its address once and never notices each port after that.
- **Each ported function is proven against the old one** on the local stack: same request, same
  reply, same rows, same audit rows.
- **It is a rewrite, sized in weeks.** `web/` is 97 pages and about 82,000 lines of TypeScript.
  The functions are about 27,000 lines (8,111 in the 34 handlers, 19,229 in `_shared`).

---

## 1. Why do it, and what it costs

### What you gain

- **Memory and cost.** Next 16 + MUI idles near 150 to 250 MB on a 512 MB Render Starter
  instance. A Go binary idles in the tens of MB.
- **Far fewer moving parts.** No React, Next, MUI, Emotion, Turbopack, Vitest, Deno or
  supabase-js. That ends the `web/` Dependabot queue, the MUI lockstep check, the Turbopack CSS
  layer-order bug (PR #120), hydration and the server-to-client function trap.
- **One language for the whole server.** Business rules that today live in Deno (`_shared`) and
  the pages that use them sit in one codebase, called in process instead of over HTTP.
- **Fewer secrets in flight.** The hotel-search caller token and `STA_LEAD_FORM_KEY` exist only
  because web and functions were separate processes. They go away.
- **Cheap requests.** The Vercel pause came from per-request cost under bot traffic. Filling a
  parsed page is cheap enough that a crawler wave is not an event.
- **Runtime config.** No `NEXT_PUBLIC_*` values baked in at build time, so changing the site
  address no longer needs a rebuild.
- **Session cookies can be `HttpOnly` from day one**, since no browser code reads the session.

### What it costs

- **MUI goes away.** Every Box, Card, Button, Chip, Dialog, Menu, Tabs, Select and Snackbar is
  rebuilt as HTML and CSS. The design prototype is MUI JSX, so matching it is manual.
- **Every change is a full page load.** Filters, tabs and bulk actions reload the page.
- **The tests do not carry over as they are.** Logic tests port to Go table tests. React
  component tests become handler tests. No Edge Function handler has a test today, so the
  differential tests (section 5.9) are new work.
- **A long dark period.** Production stays offline until Phase 2 ships and Gyasi's Render setup
  is done.
- **It reverses a standing rule.** CLAUDE.md, BRD §15.1 and Tech-Rec §2.3 said "no separate
  backend service". Section 10 updates them first.
- **New Go libraries need reviews**: htmlx (done, `docs/HTMLX-Library-Security-Review.md`), an
  IMAP client and a web-push library (before those ports).
- **No type checking between Go and the page.** A startup slot check stands in for it (4.4).
- **Escaping is partly on us.** htmlx is used only to read pages; every write is our own code
  with hard rules (4.4).

---

## 2. What stays exactly the same

- **Supabase**: schema, migrations, RLS, GoTrue, Storage, pg_cron, Vault, and the 44 SQL test
  scripts in `supabase/tests/`. The Supabase GitHub integration keeps deploying migrations.
- **The CLAUDE.md critical rules.** No card data, no client billing, audit rows on sensitive
  writes, guarded pay links, bigint cents, UUID v7. They move from Deno code into Go code with
  the same checks, and the database constraints behind them do not change.
- **`mobile/`**, except the Functions base URL (5.8). Its PostgREST reads, its 31 RPCs and its
  GoTrue calls go to Supabase as today.
- **Copy and brand voice**: every user-facing string and every `detail` sentence moves byte for
  byte. `check_copy_parity.py` keeps pinning web strings against Kotlin.
- **Design tokens and the dark scheme**: `web/styles/tokens.css` values, and dark mode as the
  `.scheme-dark` class set before paint.
- **Render as the host**, and `deploy.yml`'s "deploy the exact commit CI tested" model.

---

## 3. Rulings

All settled by Gyasi on 2026-11-06.

| # | Decision | Ruling |
|---|---|---|
| 1 | Do it, and when | Yes, now. Skip Next.js on Render |
| 2 | htmlx | Pinned dependency behind `internal/page`, after a security review. The review approves it as a reader only (4.4) |
| 3 | Partial page updates | Full page loads everywhere first; add fragments only where a page measurably needs it |
| 4 | Slot markers | `data-slot` and `data-repeat` attributes, so CSS changes cannot break filling |
| 5 | Folder | Build in `webgo/`; `git mv webgo web` at the end so the stack rules read as today |
| 6 | Transition hosting | One Go service on Render Starter; no Next.js process runs beside it |
| 7 | New screens meanwhile | Only in Go once Phase 1 ships; Next.js gets fixes only |
| 8 | Edge Functions to Go | Yes |
| 9 | Browser tests | Playwright, dev-only, for a small smoke suite |
| 10 | API surface | Go serves `/functions/v1/{name}` with byte-compatible requests, replies and errors. Unported names pass through to Supabase. Mobile changes its Functions base URL once |
| 11 | Data path | PostgREST and RPC over HTTP, the same calls supabase-js makes today. No direct Postgres connection, no pooler, no new database role. Revisit only if a function needs a real transaction (none does; atomic work is already in RPCs) |
| 12 | Who is calling | Ask GoTrue `/auth/v1/user` on each request, as `requireUser` does. No local JWT library |
| 13 | Cron | pg_cron stays the clock. The 4 jobs that call functions point at Go and send a dedicated `STA_CRON_SECRET`, checked in constant time, instead of the service-role key |
| 14 | One binary | Pages and API in one service. Web handlers call ported functions in process through the same registry mobile reaches over HTTP. Only `internal/api/...` can reach the service key |
| 15 | New Go libraries | Each gets a review doc before use. SMTP, the FCM token and CSV use the standard library |

---

## 4. The web app

### 4.1 Layout

```
webgo/
  cmd/server/          main.go: config, pages, mux, http.Server
  cmd/gen-kotlin/      writes GeneratedPublicContent.kt (replaces export-public-content.mts)
  assets/              css, js modules, fonts, icons, brand art (go:embed, hashed names, 4.8)
    css/area/          one stylesheet per page area, owned by that area
  pages/               plain HTML, one file per screen (go:embed)
    layout/            the five shells: public (hero, plain), auth, onboarding, client, agent
    public/ auth/ client/ onboarding/ agent/
  internal/
    page/              the ONLY package that imports htmlx (4.4)
    config/            runtime env, fail closed (port of web/lib/env.ts plus the function secrets)
    session/           Go's own session cookie over GoTrue tokens (4.5)
    supa/              GoTrue, PostgREST, RPC and Storage clients: anon and user (4.3)
    gate/              route gating, mounted per route group (4.6)
    clientaddr/        port of web/lib/client-address.ts
    uuid/              port of web/lib/uuid.ts and _shared/uuid.ts
    validate/          port of web/lib/validation/*
    content/           public catalog, legal docs, FAQs (embedded JSON, 4.11)
    api/               the function registry, ported handlers, the service client (section 5)
    audit/             port of _shared/audit.ts
    domain/            ports of the _shared pure logic (agent, trip, commission, report, ...)
    handlers/          one package per page area (public, auth, client, onboarding, agent),
                       each with Specs and Mount, sharing handlers.Deps
    shell/             the layouts and their fill helpers; the role and onboarding decisions
    static/            serves webgo/assets under content-hashed names
    web/               render with cache headers, flash, forms, function results to copy
  go.mod
```

### 4.2 Libraries

| Need | Choice | Why |
|---|---|---|
| Routing | `net/http` (Go 1.22+ patterns) | Method and wildcard routes are in the standard library |
| CSRF | `net/http.CrossOriginProtection` (Go 1.25+) | Next server actions checked the origin for us; now the standard library does |
| Building pages | htmlx at commit `64ce5b8`, **read-only**, behind `internal/page` | Gyasi's pick; see the review for why only its reader half is used |
| Parsing and rendering | `golang.org/x/net/html` v0.62.0 or newer | Go team. v0.62.0 fixes advisories that hit older versions |
| Browser JS | Plain ES modules served as files | A handful of files needs no bundler |
| Supabase | Thin internal clients over `net/http` | About 15 GoTrue endpoints, PostgREST, RPC and Storage. Security-relevant transport, so ours |
| SMTP | `net/smtp` over `crypto/tls` (implicit TLS on 465) | IONOS takes 465 only; no library needed |
| IMAP | To pick, with a review doc, before the email port | imapflow today |
| Web push | To pick, with a review doc, before the push port | web-push today |
| FCM | Standard library (`crypto/rsa` RS256 token) | Today's `fcm.ts` already builds the token by hand |

The local toolchain must be Go 1.27.3 or newer (GO-2026-6809 in `crypto/x509` hits 1.27.2).
`webgo/go.mod` pins `toolchain go1.27.3`.

### 4.3 Request flow

```
Browser ──┐                        ┌─ /                      pages: gate -> session -> supa -> page
Mobile  ──┼─ Cloudflare -> Go on ──┼─ /functions/v1/{name}   registry: Go handler, or pass through
pg_cron ──┘    Render Starter      ├─ /healthz               touches nothing
                                   └─ anything else          404, no outbound call
              Go -> Supabase: GoTrue, PostgREST/RPC, Storage (the same project)
```

- **Reads**: the page handler loads the session and calls PostgREST with the visitor's own
  token, as the web does today: 68 `.from()` calls over 19 tables, plus the agent read model,
  67 named RPCs behind one door (`callAgentRead`, `web/lib/agent/api.ts`). Port that door as one
  typed function with a fixed list of names, never a name built from request input.
- **Writes**: a plain form posts to a page handler, which validates and calls the function
  through the registry with the visitor's token. Success: 303 redirect. Rejection: the same page
  re-rendered with the visitor's values and the function's `detail` sentence (422).
- **Keep `EdgeCallResult` exactly** (`web/lib/supabase/edge.ts`): `unauthenticated` on 401/403,
  `rejected` with `detail` on other 4xx, `conflict: true` only on 409 (the lock `changeTripStage`
  reads), `unavailable` on network errors and 5xx. It is the same whether the function ran in Go
  or was passed through. Never log a request body.
- **Forward the visitor's user agent and address to GoTrue** on sign-in, as `callerHeaders()` in
  `web/lib/supabase/server.ts` does (§3.9.6).

### 4.4 Building pages with htmlx

This replaces React components, so it is built and tested before any screen.

**How a page is made**

1. **Parse once, at startup.** Every file in `pages/` loads when the server starts. A missing or
   broken file stops the server from starting.
2. **Copy per request.** Parsed pages are never changed. Each request fills a deep copy whose
   nodes **and attribute slices** are new. (The review showed htmlx's `RemoveAttr` writing into a
   shared slice, which in a server is one visitor's page changing another's.) `go test -race`
   proves it.
3. **Mark slots in the HTML**: `<h1 data-slot="trip-title">Trip name</h1>`. The placeholder still
   shows when the file is opened on its own.
4. **Repeat rows**: one sample row marked `data-repeat="trips"`, copied per item, then removed.
5. **Remove what does not apply.** Empty states and role-only blocks leave the tree, so data that
   should not show never reaches the browser.
6. **Layouts**: the page's main content moves into the layout's `<main>` as nodes, never as a
   string.
7. **Fragments**: finding one element in a finished page and writing it out gives a fragment, so
   partial updates stay possible later (ruling 3).

**Safety rules**

- **htmlx is a reader only.** Allowed: `Parse`, `String` (tests), `Find`, `FindAll`, `FindNext`,
  `FindPrev`, `Tag`, `TagName`, `HasAttrVal`, `ID`, `Class`, `Remove`, `RemoveChilds`,
  `OuterHTML`, `Attr`. Banned: `SetHTML`, `SetText`, `SetAttr`, `RemoveAttr`, `AddClass`,
  `Rename`, `Get`, `Load`, `Text`, `Stats`. Its setters have real bugs (`SetAttr` silently keeps
  an existing value; `AddClass` never works when a class is already set). A test fails the build
  on any banned name.
- **Only `internal/page` imports htmlx.** A test fails the build if another package does.
- **Text goes in as a fresh text node**, never parsed as markup. The setter refuses an element
  inside `script`, `style`, `noscript`, `iframe`, `xmp`, `noembed`, `noframes` or `plaintext`,
  because `x/net/html` writes text there without escaping. (`textarea` and `title` are escaped
  on render, checked 2026-11-06, so a form can be re-filled with what the visitor typed.)
- **Links are checked.** One setter for `href`, `src`, `action` and `formaction` allows only
  relative paths, `https:`, `mailto:` and `tel:`, after trimming and lower-casing. **Pay links**
  get a stricter setter: absolute `https://` only (CLAUDE.md rule 4), and on client pages they are
  shown, never editable.
- **Every slot a handler uses must exist.** Each page declares its slots in Go, and a startup
  check confirms each is in the HTML (exactly once for single slots). A renamed slot fails at boot
  and in CI.
- **Never write raw HTML from the database.** Message text, notes and template bodies go in as
  text.
- **Tests check rendered output**, never htmlx's `Text()`, which un-escapes a second time.

### 4.5 The session

There is no Next.js to share cookies with, so the `@supabase/ssr` cookie format does not matter.

- Go keeps the GoTrue access and refresh tokens in its own cookie: `HttpOnly`, `Secure`,
  `SameSite=Lax`, path `/`. It refreshes through GoTrue when the access token is close to expiry
  and rewrites the cookie.
- **No session cookie means no Supabase call at all** (the cost fix from PR #168).
- Keep the signed-in chrome flag cookie (`sta-authed`) and `/api/account/chrome`, because cached
  public pages cannot vary by visitor.
- The MFA challenge at `/login/mfa` needs a session but only a half-assured one. Keep that rule.

### 4.6 Gating

Port `PROTECTED_PREFIXES` and `AUTH_ONLY_PREFIXES` (`web/lib/supabase/middleware.ts`), but
enforce them by **mounting** each route group under its gate rather than matching strings, so a
route cannot exist without a gate.

- Keep the `/message` (public lead form) vs `/messages` (protected) test.
- Unknown paths get a plain 404 with no Supabase call (the `/wp-login.php` and `/.env` probes).
- `/healthz` touches nothing.

### 4.7 Public pages and caching

- Public handlers read no cookie and call no Supabase, except explore results and hotel search.
- `Cache-Control: public, s-maxage=3600, stale-while-revalidate=...` so Cloudflare serves them.
- A Go test replaces `check_public_prerender.py`: every public route renders with no cookie,
  makes no outbound call, and carries the cache header.
- Port `web/app/seo.ts` (sitemap, robots, canonical URLs) and the Unsplash image loader.

### 4.8 Styling without MUI

- `web/styles/tokens.css` and `web/lib/mui/theme.ts` are the source for colors, type and spacing
  in both schemes. Design-System §12.4 says the tokens are the contract; keep them as CSS custom
  properties.
- One component stylesheet for what MUI provided: button, card, chip, field, select, table, tabs,
  dialog, menu, snackbar, avatar, app bar, nav drawer. Match by reading computed styles off the
  running Next app, not by guessing.
- Self-host Poppins, Caveat and JetBrains Mono (CLAUDE.md forbids runtime Google Fonts).
- A Go test fails on any class a page uses that no CSS file defines (the idea behind
  `web/test/class-allowlist.test.ts`).
- **Visual parity gate**: before a Next route is deleted, screenshot it and its Go replacement at
  phone, tablet and desktop, light and dark. The dark scheme is a full rebrand, not an inversion.

**What exists** (the UI foundation PR, stacked on #178):

| File | What it is |
|---|---|
| `assets/css/tokens.css` | Byte for byte `web/styles/tokens.css`; `internal/static` tests it against `design/web-tokens/tokens.css` |
| `assets/css/theme.css` | The `--mui-*` variables MUI emits for `theme.ts`, captured from the running app: palette (both schemes), shadows, overlays, type. Every component rule reads these |
| `assets/css/ui.css` | The MUI replacements: `.btn` (+ `.st-btn` for `components/ui/Button`), `.icon-btn`, `.card`, `.chip`, `.status-chip.status-<kind>`, `.field`/`.input`/`.select`/`.check`, `.table`, `.tabs`/`.tab`, `dialog.dialog`, `.menu`, `.alert`, `.snackbar`, `.avatar`, `.divider`, `.spinner`, `.skeleton`, `.type-*`, a few layout helpers. The header maps every Next button variant to classes |
| `assets/css/shell.css` | The layout chrome: public bar, drawer and footer; auth split pane; rails, top bars and bottom bars |
| `assets/css/{reset,components,public,client}.css` | Copied from `web/styles/` unchanged, in the same layers (`base`, `mui`, `components`) |
| `assets/css/area/<area>.css` | Each area's own rules. The area's layout links it; nobody else edits it |
| `assets/js/prepaint-theme.js`, `prepaint-auth.js` | ThemeScript and AuthChromeScript as files, loaded blocking in `<head>` |
| `assets/js/theme.js`, `ui.js` | The theme toggle; dialogs, submit-once forms, the snackbar |
| `assets/icons.svg` | The icon set as a sprite: `<svg class="icon icon-20"><use href="/assets/icons.svg#search"></use></svg>` |

Pages reference assets by their plain path (`/assets/css/site.css`); the loader rewrites each one
to its hashed name at startup and refuses an unknown one, an inline script or style, a `style=""`
attribute or an `on*` handler, so a page that would break the CSP never boots. `/_styleguide`
(development only) shows every `ui.css` class in both schemes, and `/_styleguide/layout/<name>`
shows each layout filled.

**The parity procedure.** For one Go route and the Next route it replaces:

1. Start both from `.claude/launch.json` with the browser pane's `preview_start`: `web` (Next,
   port 3000 or the next free one) and `webgo` (Go, 8080 or the next free one). The Go server
   embeds its assets, so restart `webgo` after any CSS, JS or HTML change.
2. Open each route in its own tab. Without a local Supabase stack the Next client and agent pages
   crash on hydration; read their server HTML instead, with the scripts stripped, in the Next tab:
   `const h = await (await fetch(path)).text(); document.open(); document.write(h.replace(/<script[\s\S]*?<\/script>/g, "")); document.close();`
3. For each width, 375 (phone), 768 (tablet) and 1280 (desktop), set both tabs with
   `resize_window`, then in each scheme (light: remove `scheme-dark` from `<html>`; dark: add it)
   measure the same elements in both tabs with one script: `getBoundingClientRect()` and the
   computed `padding`, `gap`, `font`, `color`, `background-color`, `border` and `box-shadow`.
   Compare numbers, not screenshots: a pixel shift or a wrong token shows up as a different value.
   Wait 300ms after flipping the scheme, or the 250ms MUI transitions report midway colours.
4. Then compare a screenshot of each at each width and scheme for anything the numbers missed
   (an icon, an image, wrapping text). A page's scrollbar makes Next 15px narrower when the Go
   page is shorter; that is not a difference.
5. Check the Go tab's console: no CSP violation and no 404 for an asset.

The shells were checked this way at 375, 768 and 1280 against `/how-it-works`, `/caribbean`,
`/login`, `/account` and `/agent/settings`; their bars, rails, drawers and footers match to the
pixel, with the differences that remain listed in the foundation PR.

### 4.9 Interactivity: links and forms first, small JavaScript second

| React pattern today | Go version |
|---|---|
| Server action form + pending state | `<form method="post">`. Success: 303 and a one-time flash cookie. Failure: same page with values and field errors. One shared script disables submit after the first click; the client-minted UUID v7 makes a retry safe |
| Trip Detail's 8 tabs | One URL per tab, each its own page load |
| Filters and search | `<form method="get">`, so the filter lives in the URL |
| Bulk tag / bulk status | Checkbox form posting ids, then a redirect back to the same list |
| Pipeline stage change (409 lock) | A small form per card. On a 409, re-render with the "moved since" message on that card |
| Agent messages | Two columns from one handler. Reply posts and redirects. A JS module polls a count endpoint every 30 seconds |
| Dialogs | Native `<dialog>`; a plain confirm page when JS is off |
| Menus and popovers | `<details>` or the `popover` attribute |
| Report charts | Already "boxes, not a chart library" (§3.11), so HTML and CSS |
| CSV exports | Plain Go handlers |
| Date range picker, date field | `<input type="date">` first; one JS module if the design needs more |
| Statement upload drag-and-drop | Multipart form; drag-and-drop as a JS module |
| Web push | `push-sw.js` stays a static file; `pushClient` becomes a JS module |
| Analytics consent + GA | Same consent gate; GA loads only after consent |

Strict Content Security Policy from day one: `script-src 'self'`, `style-src 'self'`, no inline
script, style or handler at all (the theme and auth-flag pre-paint scripts are files loaded
blocking in `<head>`, so no hash is needed), `frame-ancestors 'none'`.

### 4.10 Validation, money, ids and time

- Port `web/lib/validation/*` to Go functions that return field errors. **Error strings stay
  byte-identical**; re-point `check_copy_parity.py` at the Go files.
- **Money**: decode every `*_cents` field into `int64`. Never decode a row into `map[string]any`
  or `any`, because Go turns JSON numbers into `float64` there (CLAUDE.md rule 5).
- **UUID v7**: port with `crypto/rand`. `assertRecentUuidV7` (one-hour window) ports with it.
- **Time zones**: import `time/tzdata`, or `time.LoadLocation` fails at runtime in a slim image.

### 4.11 Public content and the Kotlin generator

`web/content/public/*.ts` (trips, islands, cruise lines, four legal documents, claims, FAQs)
feeds `GeneratedPublicContent.kt` today.

1. Move the content to JSON under `webgo/internal/content/`.
2. Go embeds it into typed structs.
3. `go run ./cmd/gen-kotlin` writes the Kotlin file.
4. **Before switching CI, prove the Go generator writes a byte-identical
   `GeneratedPublicContent.kt`.**

---

## 5. The backend in Go

### 5.1 What the Edge Functions are today

- **34 functions**, each one `index.ts`. All POST except `trip-document-url` (GET) and
  `email-unsubscribe` (GET and POST). Most pick an action from an `op` field in the body.
- **Every data call runs as the service role.** `requireUser` (`_shared/auth.ts`) asks GoTrue
  who the caller is (`auth.getUser(jwt)`), then reads `aal` and `amr` from the token. All reads
  and writes go through `serviceClient()` (`_shared/db.ts`). Ownership is checked in TypeScript
  or inside service-role-only RPCs that take `p_agent_id`.
- **Gates**: `requireAgentId` (agent role, aal2, agent not archived), `requireClientId`,
  `requireRecentMfa` (account-admin), `requireServiceRole` (cron), a form key (lead-message), a
  search token (hotel-search, cruise-search), a signed link (email-unsubscribe).
- **Errors** (`_shared/problem.ts`): `application/problem+json`, `{type, title, status, detail}`.
  409 is the optimistic lock. 429 carries `Retry-After`. A 500 never carries `detail`.
- **`config.toml`**: `verify_jwt = true` for 32 functions, `false` for `email-unsubscribe` and
  `lead-message`.

| Area | Functions |
|---|---|
| Account | account-admin |
| Onboarding | onboarding-step, -profile, -preferences, -companions, -connect |
| Clients | agent-client, agent-client-notes |
| Trips and pay links | agent-trip, agent-trip-status, agent-trip-notes, agent-itinerary, agent-template |
| Traveler trip | trip-message, trip-document, trip-document-url, testimonial, quote-request |
| Messages and email | agent-message, agent-message-template, email-dispatch, email-inbox, email-unsubscribe |
| Leads | lead-message, agent-lead |
| Commission | agent-commission, commission-import |
| Reports and settings | agent-report, agent-settings |
| Search and cruise | hotel-search, cruise-search, cruise-sync |
| Push | push-device, push-dispatch |

### 5.2 The API surface and the registry

- `internal/api` holds one table: function name to Go handler. `POST /functions/v1/{name}` (and
  the two GET routes) looks the name up.
- **Ported**: the Go handler runs. Same `op` values, same request and reply JSON, same status
  codes, same `detail` sentences, same problem+json shape.
- **Not ported yet**: Go passes the request through to
  `https://<project>.supabase.co/functions/v1/{name}` with its `Authorization` header and body
  unchanged, and returns the reply unchanged. Go adds nothing and logs no body.
- **Web pages use the same registry in process**, so a page never changes when its function is
  ported.
- **Mobile builds links from replies.** `trip-document-url` returns a Storage path that mobile
  prefixes with the Supabase URL. Storage stays on Supabase, so the path keeps that shape.
- `OPTIONS` keeps answering 204 as `_shared/cors.ts` does while any browser caller exists.

### 5.3 Who is calling

- Port `requireUser`, `requireRole`, `requireRecentMfa`, `requireAgentId` and `requireClientId`
  exactly: a GoTrue `/auth/v1/user` call with the bearer token, then the same claim reads and the
  same database checks. No local signature check, no JWT library (ruling 12).
- **The Supabase gateway checked signatures before the function ran (`verify_jwt`). Go has no
  gateway**, so the GoTrue call is the check for user routes, and a missing or bad token is 401
  before any handler code runs.
- **Cron routes** check `STA_CRON_SECRET` with `crypto/subtle.ConstantTimeCompare` (ruling 13).
  They never accept a user token.
- `lead-message` and `email-unsubscribe` stay open routes with their own checks.

### 5.4 The data path

- Go makes the same PostgREST and RPC calls supabase-js makes today (ruling 11). The service
  client lives only in `internal/api/...`, and a test fails the build if any page handler package
  imports it. Page reads keep using the visitor's token, so RLS still guards them.
- **Money** is `int64` end to end; RPC replies decode into typed structs, never `any`.
- The service-role key moves from Supabase function secrets to Render env. It is the one secret
  that must never reach a page, a log or a reply.

### 5.5 Audit

- Port `_shared/audit.ts` (`writeAuditEvent`, `writeAuditEvents`, `writeSystemAuditEvent`,
  `withAudit`) to `internal/audit`, with the same columns and metadata.
- RPCs that take `p_audit_id` keep writing their audit rows in SQL. Nothing changes there.
- The 18 SQL tests that check `audit_event` rows keep running; the differential test (5.9) also
  compares audit rows per request.

### 5.6 Cron

Four pg_cron jobs call functions with `net.http_post`: push-dispatch and email-dispatch every
minute, email-inbox every 2 minutes, cruise-sync weekly. Today they all send the vault secret
`cruise_sync_service_role_key` as a bearer token.

- When each is ported: a migration changes its tick to send `STA_CRON_SECRET` (a new vault
  entry), and Gyasi points its vault URL secret at the Go service.
- **The cruise-sync trap**: production's catalog stayed empty for weeks because a placeholder
  vault secret made every run 401, while cron, the tick and the page all reported success. After
  each switch, read `net._http_response` and confirm a 2xx, and have the Go handler record each
  run so a silent failure shows up somewhere a person looks.
- The SQL-only jobs (watchdog, dated-promises, lead-retention) are untouched.

### 5.7 Integrations

| Integration | Today | Go | Secrets (same names) |
|---|---|---|---|
| IONOS SMTP (465) | nodemailer 10.0.14 | `net/smtp` over TLS; we build every header, refuse CR/LF, bare-address To | `EMAIL_SMTP_*`, `EMAIL_FROM_ADDRESS`, `EMAIL_SITE_URL`, `EMAIL_UNSUBSCRIBE_URL` |
| IMAP replies | imapflow 2.2.1 | Library to pick, review doc first | `EMAIL_IMAP_*`, `EMAIL_AUTHSERV_ID` |
| Web push | web-push 3.6.7 | Library to pick, review doc first | `VAPID_*` |
| FCM HTTP v1 | hand-built RS256 token | Standard library | `FCM_SERVICE_ACCOUNT_JSON` |
| SerpApi | fetch | `net/http` | `SERPAPI_API_KEY`, `HOTEL_SEARCH_IP_PEPPER` |
| track.cruises | fetch | `net/http` | `TRACK_CRUISES_API_KEY`, `CRUISE_SYNC_MONTHLY_CEILING` |
| Storage | supabase-js | `net/http` (signed URLs) | service key |

Production SMTP was refusing the stored password on 2026-10-22 (535). That is still Gyasi's to
fix, and it must be fixed before the email port can be proven in production.

### 5.8 Moving mobile

- Mobile calls 12 functions through one supabase-kt 3.8.0 client (`AuthRepository.kt`,
  `install(Functions)`): the 5 onboarding ones, trip-message, trip-document-url, testimonial,
  agent-message, agent-settings, push-device and lead-message. It reads `detail` from
  `RestException.error`.
- **One mobile PR**: point the Functions plugin at the Go service. supabase-kt plugin configs
  take a `customUrl`; confirm it on 3.8.0. If it is missing, add a second base URL to the
  `generateSupabaseConfig` task (a plain `val`, never `const val`).
- Ship it only after Go is live in production with the pass-through working. After that, every
  port is invisible to mobile.
- An old phone build keeps calling Supabase directly. That is why a function is deleted from
  Supabase only after it has had no traffic for a week (5.10).

### 5.9 Port order and the differential test

**Order**, lowest risk first:

1. `_shared` pure logic first, with all 358 Deno test cases ported before the code: agent, trip,
   onboarding, component, commission, statement (CSV), report, payLink, cardDigits, lead,
   message, messageTemplate, quote, agentSettings, uuid.
2. Search: cruise-search, hotel-search.
3. Leads: lead-message, agent-lead.
4. Onboarding: the five onboarding functions.
5. Traveler trip: trip-message, trip-document, trip-document-url, testimonial, quote-request.
6. Agent: agent-client, agent-client-notes, agent-template, agent-message-template,
   agent-settings, agent-message.
7. Trips and pay links: agent-trip, agent-trip-status, agent-trip-notes, agent-itinerary. Pay
   links get the most tests: `https://` only, advisor only, audited.
8. Commission: agent-commission, commission-import.
9. Reports: agent-report.
10. account-admin (GoTrue admin calls, recent MFA).
11. Background: push-device, push-dispatch, email-dispatch, email-inbox, email-unsubscribe,
    cruise-sync, with the cron switch (5.6).

**The differential test.** For each ported function, on the local Supabase stack: send the same
request to the Deno function and to the Go handler, then compare the status, the reply body, the
rows written and the `audit_event` rows. Cases come from the function's ops, its validation
errors, its ownership checks and its 409 paths. A port is done when both agree on every case.

Each port also adds its entry to `contracts/openapi.yaml` (19 functions are missing today) and
regenerates the TypeScript and Kotlin types.

### 5.10 Retiring a function

1. The Go handler is live in production and the registry sends that name to it.
2. A week passes with no traffic to Supabase for that name (Supabase function logs).
3. Remove its `[functions.x]` block from `config.toml` and its folder, in a PR.
4. Gyasi deletes it from production (`supabase functions delete`; the settings deny Claude this).

The Supabase GitHub integration stops deploying a function once its block is gone, but it does
not delete what is already deployed, so step 4 is needed.

---

## 6. Hosting on Render

- `render.yaml`: `runtime: go`, `rootDir: webgo`, `buildCommand: go build -o app ./cmd/server`,
  `startCommand: ./app`, `healthCheckPath: /healthz`, `region: virginia`, `plan: starter`,
  `autoDeploy: false`.
- `deploy.yml` keeps deploying by `commitId` and keeps its guards. Its env-var guard checks the
  Go names instead of `NEXT_PUBLIC_*`, and its dry run builds Go.
- **Env**: `SITE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `INQUIRY_EMAIL`,
  `AUTH_GOOGLE_ENABLED`, `AUTH_APPLE_ENABLED`, `HOTEL_SEARCH_ENABLED`, `SERPAPI_API_KEY`, plus
  each function's secrets as its area is ported (5.7), `SUPABASE_SERVICE_ROLE_KEY` and
  `STA_CRON_SECRET`.
- **Client address**: port `web/lib/client-address.ts` exactly (prefer `cf-connecting-ip`, then
  the left-most `x-forwarded-for`). Run the forged-header test from `docs/RENDER-MIGRATION.md`
  §5.1 before any traffic. Once lead-message runs in Go, the address is read directly, and the
  forwarded-address trust between web and function goes away.
- **Gyasi's setup before the first launch (Phase 2)**: create the Render service from
  `render.yaml`, set the env vars, fill in `RENDER_SERVICE_ID`, add the `RENDER_API_KEY` repo
  secret, put Cloudflare in front, add the Render origin to Supabase's auth redirect allowlist,
  run the forged-header test.

---

## 7. Testing

| Today | After |
|---|---|
| Web logic tests (`web/lib/**/*.test.ts`) | Go table tests. Port the cases first, then the code |
| `_shared` Deno tests (358 cases) | Go table tests, cases first |
| React component tests | Handler tests with `httptest`, checking rendered output |
| `proxy.test.ts` | Gate tests derived from the prefix lists |
| Prerender, CSS layer, class allowlist scripts | Go tests (4.7, 4.8) |
| No handler tests for functions | Differential tests against the Deno version (5.9) |
| SQL tests in `supabase/tests/` | Unchanged |
| Nothing | Slot check, race test on concurrent fills, escaping tests, import-boundary tests (htmlx, service client) |
| Nothing | Playwright smoke suite for the JS modules and sign-in + MFA |
| Nothing | Screenshot parity per route (4.8) |

CI gets a `webgo` job: `gofmt -l`, `go vet`, staticcheck, `go test -race ./...`, govulncheck and
`go build`. Every job in `ci.yml` gates deploys, so this one does too.

---

## 8. Phases

Each phase is its own PR or PR series to `dev`. Sizes: S, M, L, XL.

### Phase 0: Decide and write it down (S)

- This doc, the rulings, the htmlx review.
- The governing docs say Go (section 10).
- Tooling: `stack-boundary-guard.py` allows `.go` only under `webgo/`, a `go-reviewer` agent,
  `settings.json` allow rules, a `launch.json` entry, the `new-screen` skill.

### Phase 1: Skeleton (M, nothing visible)

1. `webgo/` module: config, `internal/page` with every rule in 4.4 and its tests, clientaddr,
   uuid, security headers, `/healthz`, 404 for everything else, the `webgo` CI job.
2. Session, `supa` clients (anon and user), gate (mounted), the `/functions/v1` registry passing
   every name through, the cron secret check.
3. `render.yaml` and `deploy.yml` re-aimed at Go.

### Phase 2: Public pages and the first launch (M)

13 public pages, `/quote`, email unsubscribe, explore results, the lead form, the join form,
consent + GA. Content moves to JSON with the byte-identical Kotlin check. **Production comes back
when this ships and Gyasi's Render setup (section 6) is done.**

### Phase 3: Auth (M, highest risk per line)

Login, register, forgot and reset password, verify email, MFA challenge and setup, link account,
`/auth/callback` (OAuth with PKCE), `/auth/confirm` (OTP links). Re-read the §3.9 notes first:
email scanners burning one-time links, invite pre-hijack, the MFA lockout. Test every flow on
the local stack with test accounts; a mistake here locks out the advisor.

### Phase 4: Onboarding and the traveler side (L)

6 onboarding pages and 23 client pages. The traveler's "I've paid" only posts a trip message; it
never marks anything paid. Pay links render read-only through the `https://`-only setter.

### Phase 5: Agent workspace (XL, about half the web app)

46 pages and the CSV routes, in area PRs: worklist and calendar; clients; trips (detail tabs,
builder, itinerary, payments and pay links); pipeline (the 409 lock); leads; messages and
templates; commission; reports; settings.

### Track B: the backend (XL, alongside Phases 3 to 5)

Starts when the Phase 1 registry is live. Order and proof in 5.9. The mobile switch (5.8) ships
once Go is live in production.

### Phase 6: Clean up (S to M)

- **When**: no web route is left in Next.js and no function name passes through to Supabase.
- Delete the Next app and `supabase/functions/`, `git mv webgo web`, drop the Node web build.
- Retire `check_mui_lockstep.py`, `check_css_layer_order.py`, `check_public_prerender.py`, the
  Deno CI steps and the `config.toml` function check; `gen-types.sh` loses both consumers.
- Remove `web` from the npm workspaces and Dependabot's npm config (`contracts` stays npm).
- `supabase-reviewer` narrows to migrations and RLS; `new-edge-function` becomes a Go endpoint
  skill.
- Update every doc to the final state.

---

## 9. Risks and traps worth naming up front

1. **Cross-site scripting through the page builder.** Banned htmlx setters, text in raw-text
   elements, unchecked link schemes (4.4).
2. **One visitor seeing another's data** if a page is filled without a full copy (4.4).
3. **A renamed slot failing quietly** without the startup check (4.4).
4. **htmlx going stale.** One maintainer. The reader half is small enough to replace inside
   `internal/page` in an afternoon.
5. **The service key reaching web code**, a log or a reply. Import-boundary test (5.4).
6. **Contract drift breaking mobile.** A changed field, status or `detail` sentence breaks the
   phone app quietly. The differential test compares bodies byte for byte (5.9).
7. **Cron failing silently**, as cruise-sync did for weeks (5.6).
8. **A route with no gate.** Mount, do not match (4.6).
9. **Errors flattened** into a generic "try again", which mobile already shipped once. Keep
   `detail` and `conflict` (4.3).
10. **Money as `float64`** if any row is decoded into `any` (4.10).
11. **Forged client address** defeats the lead form's rate limit (section 6).
12. **Secrets moving hosts.** Each area's secrets move from Supabase to Render in the PR that
    ports it; a missing one must fail that function closed, not open.
13. **Logging bodies.** Message text, addresses and file names never reach a log.
14. **Missing zone data** in a slim build (4.10).
15. **Copy drift** between web and mobile, or away from the brand voice. Strings move byte for
    byte; new copy goes through Design-System §2.
16. **A long dark period** if Phase 2 stalls. It is the one phase that brings production back.
17. **MFA lockout** during Phase 3.
18. **SMTP still broken in production** (535 since 2026-10-22), which blocks proving the email
    port there.

---

## 10. Documents and tooling

**Updated in Phase 0** (the governing statements):

- `docs/BRD.md` §15.1 (stack and repo layout)
- `docs/Tech-Recommendations.md` §2.3, §2.3.1, the §5 bootstrap CLAUDE.md template, §6
- `docs/Design-System.md` §12.2
- `docs/Data-Model.md` §20.3 (audit pattern), §21 heading, §21.1 (repo layout), §21.2 (who
  holds the service-role key), §22.1 (who uses the generated types)
- `CLAUDE.md`: Stack, critical rule 3, commands, gotchas, "What NOT to do"
- `docs/RENDER-MIGRATION.md`: pointer to this doc
- The four .docx copies, regenerated with pandoc 3.11 and their existing title metadata
- `.claude/hooks/stack-boundary-guard.py`, `.claude/agents/go-reviewer.md`,
  `.claude/skills/new-screen`, `.claude/settings.json`, `.claude/launch.json`

**Updated as the work lands**:

- Lines that say "Edge Function X does Y" stay true until X is ported, and change in the PR that
  ports X.
- `.github/workflows/ci.yml` (Phase 1), `render.yaml` and `deploy.yml` (Phase 1),
  `.github/dependabot.yml` (`gomod`, Phase 1).
- `web/AGENTS.md`, `web/CLAUDE.md`, `.claude/agents/web-reviewer.md` until Next.js is deleted.

---

## 11. Next steps

1. Merge Phase 0 (this doc, the docs and the tooling).
2. Gyasi: approve or reject the htmlx review.
3. Phase 1 in order: skeleton and page builder, then session/supa/gate/registry, then Render.
4. Gyasi: the Render setup in section 6, in time for Phase 2.
