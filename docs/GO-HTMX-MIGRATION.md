# Moving the web app from Next.js to Go + HTMX

Status: **planned, not started, not decided.** Written 2026-11-03 at Gyasi's request, to pick
up in a few days.

This covers `web/` only. Supabase (database, RLS, auth, storage and all 34 Edge Functions) does
not move, and neither does anything under `mobile/`. Until Gyasi adopts this plan and the docs
in section 7 are updated, `docs/BRD.md` §15.1, `docs/Tech-Recommendations.md` §2.3 and
`docs/Design-System.md` §12.2 still say the web app is Next.js, and they win.

---

## 0. The short version

- **It is a rewrite, not a port.** `web/` today is 97 pages, 6 route handlers, about 60 server
  action files, 109 client components, roughly 82,000 lines of TypeScript, plus 21,700 lines of
  tests in 185 files.
- **It is more doable than that sounds**, because `web/` holds almost no business rules. Reads
  go through PostgREST with the visitor's own token: 68 `.from()` calls over 19 tables, plus the
  agent read model, which is 67 named RPCs behind one door (`callAgentRead` in
  `web/lib/agent/api.ts`). Writes go through Edge Functions (`web/lib/supabase/edge.ts`). There
  is no service-role key in `web/` at all. So a Go server needs only four things: the session
  cookie, a PostgREST reader, an Edge Function caller, and HTML templates. Audit rows, pay-link
  guards, the PCI rules and RLS all stay exactly where they are.
- **Do not start until production is back online on Render with Next.js**
  (`docs/RENDER-MIGRATION.md`). Stacking a rewrite on top of an outage means two unfinished
  things at once.
- **Use a strangler pattern, not a big bang.** One Go binary takes the front door and
  reverse-proxies every path it does not own yet to Next.js running beside it. Move one area at
  a time, public pages first. Delete Next.js last.
- **The agent workspace is about half the work** (46 of 97 pages). Plan in weeks, not days.

---

## 1. Why do it, and what it costs

### What you gain

- **Memory and cost.** `render.yaml` notes that Next 16 + MUI idles near 150 to 250 MB on a
  512 MB Starter instance. A Go binary serving templates idles in the tens of MB. Starter stops
  being tight.
- **Far fewer moving parts.** No React, Next, MUI, Emotion, Turbopack, Vite or Vitest. That ends
  a whole class of work this repo has paid for: the Dependabot queue for `web/`, the MUI
  lockstep check, the Turbopack CSS layer-order bug (PR #120), hydration and the
  server-to-client function trap that tests could not catch.
- **Cheap requests.** The Vercel pause came from per-request cost under bot traffic. A Go
  template render is cheap enough that a crawler wave is not an event.
- **One binary, fast start.** No `node_modules` on the server, no build cache to warm.

### What it costs

- **MUI goes away.** Every Box, Card, Button, Chip, Dialog, Menu, Tabs, Select and Snackbar has
  to be rebuilt as HTML and CSS. The design prototype in `design/source-prototype/` is MUI JSX,
  so "visually faithful to the prototype" becomes a manual match, and the MUI MCP server stops
  helping.
- **The test suite does not carry over.** Logic tests port to Go table tests fairly directly.
  Component tests (React Testing Library) have to be rewritten as handler tests.
- **Some screens need real client-side JavaScript** even with HTMX: `DateRangePicker` (520
  lines), `DateField` (435), `TripComponentSheet`, `MessageTemplateEditor`, the onboarding
  companions list, the statement upload drag-and-drop.
- **Two web stacks for the whole migration.** Every new screen during that time is a choice of
  where to build it (section 6, decision 6).
- **Documents and tooling that say "Next.js" must be rewritten first** (section 7).

---

## 2. What stays exactly the same

- **Supabase**: schema, migrations, RLS, GoTrue auth, storage, and the 34 Edge Functions. The
  CLAUDE.md critical rules (no card data, no client billing, audit middleware, guarded pay
  links, bigint cents, UUID v7) are enforced there and in the database, so they do not move.
- **`mobile/`**: the KMP app talks to Edge Functions directly and never touches `web/`. The one
  shared piece is the public content generator (section 3.10).
- **Copy and brand voice**: every user-facing string moves byte for byte.
  `check_copy_parity.py` keeps pinning web strings against the Kotlin ones.
- **Design tokens and the dark scheme**: `web/styles/tokens.css` values, and dark mode as the
  `.scheme-dark` class set before paint (`web/components/ThemeScript.tsx`).
- **Render as the host**, and `deploy.yml`'s "deploy the exact commit CI tested" model.
- **CI jobs outside `web/`**: PCI guard, Supabase, Android, contracts.

---

## 3. Target architecture

### 3.1 Layout

Build in a new top-level `webgo/` folder (a Go module) so it is a clean stack boundary while
both apps exist. At the end, delete the Next.js app and rename `webgo/` to `web/` in one commit
(section 6, decision 4).

```
webgo/
  cmd/server/          main.go: read config, build the mux, start http.Server
  cmd/gen-kotlin/      writes GeneratedPublicContent.kt (replaces export-public-content.mts)
  internal/
    config/            port of web/lib/env.ts: same 11 vars, same fail-closed rules
    session/           Supabase session cookie: read, refresh, write (port of @supabase/ssr)
    supa/              PostgREST reader + Edge Function caller (port of lib/supabase/edge.ts)
    gate/              route gating (port of lib/supabase/middleware.ts + proxy.ts)
    clientaddr/        port of web/lib/client-address.ts
    uuid/              port of web/lib/uuid.ts (v7, crypto/rand)
    validate/          port of web/lib/validation/*
    content/           public catalog, legal docs, FAQs (embedded JSON, see 3.8)
    hotels/ cruises/   ports of web/lib/hotels and web/lib/public/cruises.ts
    views/             templ components: layout, public, auth, client, agent, onboarding
    handlers/          one package per route group
    assets/            css, js, fonts, icons, push-sw.js (go:embed, hashed file names)
  go.mod
```

### 3.2 Libraries

Keep the list short. CLAUDE.md requires a security review for every new third-party SDK, so
each one below gets a short review doc like the existing SMTP, IMAP and Push reviews.

| Need | Choice | Why |
|---|---|---|
| Routing | `net/http` (Go 1.22+ patterns) | Method + wildcard routes are in the standard library now. No router dependency. |
| CSRF | `net/http.CrossOriginProtection` (Go 1.25+) | Next server actions check the origin for you. Go has to do it, and the standard library now ships this. |
| Templates | [templ](https://github.com/a-h/templ) | Typed components with typed props, close to how the React components are built today, with contextual escaping. Alternative: `html/template` (no dependency, but no types). |
| Partial updates | htmx 2.x, vendored and pinned | Served from our own origin. No CDN. |
| Small client JS | Plain ES modules | Only for the handful of widgets HTMX does not cover (3.8). |
| Bundling | esbuild's Go API | esbuild is written in Go, so the build stays one toolchain. |
| Supabase | Thin internal client over `net/http` | About 15 GoTrue endpoints, plain PostgREST GETs and Edge Function POSTs. The Go Supabase SDKs are community-maintained, and this is security-relevant transport. |
| HTML test assertions | goquery (test only) | Assert on rendered text and roles. |

Local Go is already installed (`go1.27.2`). `supabase gen types --lang go` exists if typed table
rows are wanted (3.9).

### 3.3 Request flow

```
Browser -> Cloudflare -> Go on Render
                           |-- route Go owns:   gate -> session -> PostgREST/Edge Function -> templ
                           '-- not yet ported:  httputil.ReverseProxy -> Next.js on 127.0.0.1:3000
```

- **Reads**: handler loads the session, calls PostgREST with the visitor's access token, renders.
  Port `callAgentRead` as one typed function the same way: one door, a fixed list of 67 RPC
  names, never a name built from request input.
- **Writes**: an `hx-post` form hits a handler, which validates, calls the Edge Function with the
  visitor's token, and then either returns a fragment, sends `HX-Redirect`, or re-renders the form
  with the Edge Function's `detail` sentence.
- **Port `EdgeCallResult` exactly** (`web/lib/supabase/edge.ts`): `unauthenticated` on 401/403,
  `rejected` with `detail` on other 4xx, `conflict: true` only on 409 (the optimistic lock that
  `changeTripStage` reads), `unavailable` on network errors and 5xx. Never log a request body.
- **Forward the visitor's user agent and address to GoTrue** on sign-in, as
  `web/lib/supabase/server.ts` `callerHeaders()` does (§3.9.6), or every web session shows the
  server's address in the advisor's Login activity.

### 3.4 The session cookie is the hinge

`@supabase/ssr` (0.7.0 in the lockfile) keeps the session in cookies named
`sb-<project-ref>-auth-token`, split into `.0`, `.1`, ... chunks when long, each value prefixed
`base64-` and holding base64url JSON. **During the strangler period Go and Next.js must read and
write the same cookie**, or a traveler signed in on a Go page looks signed out on a Next page.

- Match the format exactly: chunk size, prefix, path, `SameSite=Lax`, max age.
- Prove it with fixtures in both directions: a small Node script writes cookies with the real
  library, Go reads them; Go writes cookies, the script reads them. Check this into the repo as a
  test, not a one-off.
- **Do not bump `@supabase/ssr` during the migration.** Dependabot #101 (0.12) is already
  deferred; keep it that way, because a format change would split sessions between the two apps.
- Keep the existing short-circuit: no `sb-*-auth-token` cookie means no Supabase call at all
  (the cost fix from PR #168).
- Keep the signed-in chrome flag cookie (`sta-authed`, `web/lib/auth/chrome-flag.ts`) and
  `/api/account/chrome` as the after-paint correction. Cached public pages cannot vary by user,
  and the memory notes list four ways that sniffing Supabase's own cookie fails.
- **After cutover**, no browser code reads the session (`web/lib/supabase/client.ts` defines a
  browser client, but nothing imports it today), so the cookies can finally be `HttpOnly`. That is a real
  security gain over today, where `server.ts` says to treat the token as XSS-reachable.

### 3.5 Gating

Port `PROTECTED_PREFIXES` and `AUTH_ONLY_PREFIXES` from `web/lib/supabase/middleware.ts`, but
enforce them by **mounting** each route group under its gate middleware rather than matching
strings. That way a route cannot exist without a gate, which is the silent failure
`web/proxy.ts` and `web/proxy.test.ts` work hard to prevent.

- Keep the `/message` (public lead form) vs `/messages` (protected) test.
- The MFA challenge at `/login/mfa` needs a session but only a half-assured one. Keep that rule.
- Unknown paths get a plain 404 with no Supabase call (the `/wp-login.php` and `/.env` probes).
- Add `/healthz` for Render that touches nothing.

### 3.6 Public pages and caching

Today the marketing pages are prerendered, 4 use `revalidate = 3600`, and
`.github/scripts/check_public_prerender.py` guards that they stay static files.

- Public handlers read no cookie and call no Supabase, except explore results (cruise-search
  Edge Function) and hotel search.
- Send `Cache-Control: public, s-maxage=3600, stale-while-revalidate=...` so Cloudflare serves
  them and Render never bills the bytes.
- Replace `check_public_prerender.py` with a Go test: every public route renders with no cookie,
  makes no outbound HTTP call, and carries the cache header.
- Port `web/app/seo.ts` (sitemap, robots, canonical URLs) and the custom Unsplash image loader
  (`web/lib/image-loader.ts`) as a template function.

### 3.7 Styling without MUI

- `web/styles/tokens.css` (154 lines) and `web/lib/mui/theme.ts` (156 lines) are the source for
  colors, type and spacing in both schemes. Design-System §12.4 says the tokens are the contract;
  keep them as CSS custom properties.
- Write one component stylesheet for the pieces MUI provided: button, card, chip, field, select,
  table, tabs, dialog, menu, snackbar, avatar, app bar, nav drawer. Match them by reading the
  computed styles off the running Next app, not by guessing.
- Fonts: self-host Poppins, Caveat and JetBrains Mono woff2 from embedded assets (CLAUDE.md
  forbids runtime Google Fonts).
- Carry over the idea behind `web/test/class-allowlist.test.ts`: a Go test that fails on any
  class used in a template that no CSS file defines.
- **Visual parity gate**: before a Next route is deleted, screenshot it and its Go replacement at
  phone, tablet and desktop widths, in light and dark. Remember the dark scheme is a full
  rebrand (burgundy to ocean blue, deep navy surfaces), not an inversion.

### 3.8 Interactivity: HTMX first, a little JS second, native HTML before both

| React pattern today | Go + HTMX version |
|---|---|
| Server action form + pending state | `hx-post`, `hx-indicator`, `hx-disabled-elt`; errors come back as the re-rendered form |
| Trip Detail's 8 tabs | `hx-get` + `hx-push-url`, swapping the tab panel |
| Filters and search (clients, commission, explore) | `hx-get` with `hx-trigger="input changed delay:300ms"` and `hx-push-url` |
| Bulk tag / bulk status | Checkbox form + `hx-post`, counts updated with `hx-swap-oob` |
| Pipeline stage change (409 lock) | `hx-post`; on conflict return the fresh card plus the "moved since" message |
| Agent messages (`@list` parallel route) | Two-pane page, thread pane as the `hx-target`; read receipts stay a POST |
| Dialogs (Cancel trip, Save as template) | Native `<dialog>`, body loaded by `hx-get` |
| Menus and popovers | Native popover API or `<details>` |
| Report charts | Already "boxes, not a chart library" (§3.11 ruling), so plain HTML and CSS |
| CSV exports (ledger, reports) | Plain Go handlers writing CSV |
| Date range picker, date field | Try `<input type="date">` first; if the design needs the custom picker, one JS module |
| Statement upload drag-and-drop | Multipart form + a small drag-and-drop module |
| Web push | `push-sw.js` stays a static file; `pushClient` becomes a small module |
| Analytics consent + GA | Same consent gate; load GA only after consent, bundled with esbuild |

Set a strict Content Security Policy from day one, with `htmx.config.allowEval = false` and no
inline handlers. Retrofitting CSP later is much harder.

### 3.9 Validation, types and contracts

- Port `web/lib/validation/*` (auth, client, companion, mfa, password strength, preferences,
  profile, registration) to Go functions that return a map of field errors. **Error strings stay
  byte-identical**; re-point `check_copy_parity.py` at the Go files.
- **Money**: decode every `*_cents` field into `int64`. Never decode a row into `map[string]any`
  or `any`, because Go turns JSON numbers into `float64` there, which breaks CLAUDE.md rule 5
  and repeats the bigint-as-JSON-number trap already hit once on this project.
- **UUID v7**: port `web/lib/uuid.ts` with `crypto/rand`. Edge Functions reject ids with an old
  or malformed timestamp (`assertRecentUuidV7`), and the client-minted id is what makes retries
  safe.
- **Time zones**: import `time/tzdata` so a slim container still has zone data. Without it
  `time.LoadLocation` fails at runtime, not at build.
- **Edge Function payloads**: start with hand-written request and response structs next to each
  caller, the same way `web/lib/agent/api.ts` does it today. `contracts/openapi.yaml` still lacks
  the agent functions (a known follow-up), so generating Go from it waits until that is fixed.

### 3.10 Public content and the Kotlin generator

`web/content/public/*.ts` (about 1,800 lines: 22 trips, islands, cruise lines, four legal
documents, the claims registry, FAQs) is the single source today.
`web/scripts/export-public-content.mts` turns it into `GeneratedPublicContent.kt`, and CI diffs
the result.

1. Move the content to language-neutral JSON under `webgo/internal/content/`.
2. Go embeds it into typed structs.
3. `go run ./cmd/gen-kotlin` writes the Kotlin file.
4. **Before switching CI, prove the Go generator writes a byte-identical
   `GeneratedPublicContent.kt`.** If it does, the move is safe; if it does not, the diff shows
   exactly what changed.

The privacy and cookie copy lives here too, and it already had to change once when Vercel
Analytics left. Any wording change goes through the same parity check.

### 3.11 Hosting on Render

- **During the strangler period**, `render.yaml` moves from `runtime: node` to `runtime: docker`.
  One container runs Go on `$PORT` and `next start` on `127.0.0.1:3000`. Both fit in 512 MB at
  today's traffic; watch memory for the first week. If it is tight, run Next as a second
  Starter service for the transition instead (+$7/month).
- **After cutover**, `runtime: go`, `buildCommand: go build -o app ./cmd/server`,
  `startCommand: ./app`. `autoDeploy` stays `false`; `deploy.yml` keeps deploying by `commitId`.
- **Client address**: port `web/lib/client-address.ts` exactly (prefer `cf-connecting-ip`, then
  the left-most `x-forwarded-for`). The lead form's rate limit in
  `supabase/functions/_shared/lead.ts` trusts the address the web server forwards with
  `STA_LEAD_FORM_KEY`, so a wrong rule lets a forger rotate fake IPs. Run the forged-header test
  before any traffic, same as the Render plan says.
- **Hotel search**: `SERPAPI_API_KEY` stays server-only. Re-read the four api_key leak paths
  found when hotel search moved into Next.js (PR #48) before porting `web/lib/hotels`.

### 3.12 Testing

| Today | After |
|---|---|
| Logic tests (`web/lib/**/*.test.ts`: forecast, commission, calendar, reports, payments, leads, validation) | Go table tests. Port the test cases first, then the code, so the cases prove the port. |
| Component tests (React Testing Library) | Handler tests with `httptest` + goquery, asserting text, roles and form errors |
| `proxy.test.ts` | Gate tests derived from the prefix lists, as today |
| Prerender, CSS layer, class allowlist scripts | Go tests (3.6, 3.7) |
| Nothing | A small Playwright smoke suite for the JS-dependent flows: sign in + MFA, trip builder add component, send a message, date picker, upload |
| Nothing | Screenshot parity per route (3.7) |

CI gets a `webgo` job: `go vet`, `staticcheck`, `go test ./...`, `govulncheck`, `templ generate`
with a drift check, and `go build`. The RLS isolation tests in the Supabase job are untouched
and still guard the data.

---

## 4. Phases

Each phase ends with production running through Go. Sizes are relative: S, M, L, XL.

### Phase 0: Decide and write it down (S)

No code.

- Gyasi rules on section 6.
- Update the documents first, per the document hierarchy (section 7).
- Update the tooling: `stack-boundary-guard.py` (add `.go` and `.templ` to `webgo/`), a Go
  reviewer agent next to `web-reviewer`, the `new-screen` skill, `.claude/settings.json` allow
  rules for `go test`, `go build`, `go vet`, and a `launch.json` entry for the Go server.
- Security reviews for templ, htmx, esbuild and goquery.

### Phase 1: Skeleton and the hinge (M, no visible change)

- `webgo/` module with `config`, `clientaddr`, `session` (with the two-way cookie fixtures),
  `supa`, `gate`, `CrossOriginProtection`, `/healthz`, and the reverse proxy to Next for every
  path.
- Log every path the proxy forwards. That log is the to-do list for the rest of the migration,
  and the proof at the end that nothing is left.
- Dockerfile and `render.yaml` for the two-process container.
- New `webgo` CI job.
- **Exit check**: sign in, browse, sign out all work through Go; the forged-header test passes;
  memory stays well under 512 MB.

### Phase 2: Public pages (M)

13 pages, `/quote`, email unsubscribe, explore results, the lead form, the join form.

- First because it carries most of the traffic (bots included), needs no session, and has the
  fewest interactive parts.
- Content moves to JSON with the byte-identical Kotlin check (3.10).
- Cache headers and the prerender replacement test (3.6).
- Hotel and cruise search, lead form forwarding, consent banner and GA.

### Phase 3: Auth (M, highest risk per line)

9 pages plus `/auth/callback` (OAuth with PKCE) and `/auth/confirm` (OTP links).

- Login, register, forgot and reset password, verify email, MFA challenge and setup, link
  account.
- This is where the Go session package starts writing cookies for real.
- Re-read the §3.9 notes before starting: email scanners burning one-time links, invite
  pre-hijack, and the MFA lockout a self-review caught.
- Test every flow on the local stack with test accounts before production. A mistake here locks
  people out, including the advisor.

### Phase 4: Onboarding and the traveler surface (L)

6 onboarding pages and 23 client pages: dashboard, trips, Trip Detail (the largest page at 591
lines), itinerary by day, documents (signed URLs), memories, messages, and the 9 account pages.

- The traveler's "I've paid" only posts a trip message. It never marks anything paid
  (CLAUDE.md rule 4).
- Pay links render read-only for clients.

### Phase 5: Agent workspace (XL, about half the app)

46 pages, the two CSV export routes and the message read-receipt route. Split into PRs per area,
the way the §3.x builds were:

1. Worklist (agent home) and calendar
2. Clients: list, detail, new, edit, merge, bulk tag
3. Trips: detail tabs, builder, itinerary, payments and pay links (advisor-only writes, audited
   in the Edge Function), payment history
4. Pipeline (the 409 lock)
5. Leads
6. Messages and message templates
7. Commission: ledger, forecast, statement import and row resolution
8. Reports (9 pages, export, download)
9. Settings and templates

### Phase 6: Delete Next.js (S to M)

- **When**: the proxy log shows no forwarded request except 404s for a full week.
- Delete the Next app, `git mv webgo web`, `render.yaml` to `runtime: go`, drop Node from the
  web deploy, retire `check_mui_lockstep.py` and `check_css_layer_order.py`, remove `web` from
  the npm workspaces and from Dependabot's npm config.
- Make the session cookies `HttpOnly` (3.4).
- Update the documents to the final state.

---

## 5. Risks and traps worth naming up front

1. **Session format drift** between `@supabase/ssr` versions splits sessions across the two apps.
   Pin it, test both directions (3.4).
2. **Forged client address** defeats the lead form's rate limit (3.11).
3. **Money as `float64`** if any row is decoded into `any` (3.9).
4. **A route with no gate.** Mount, do not match (3.5).
5. **Edge Function errors flattened** into a generic "try again", which the mobile app already
   shipped once. Port `EdgeCallResult` with its `detail` and `conflict` fields (3.3).
6. **Logging bodies.** Message text and document filenames must never reach a log.
7. **Missing zone data** in a slim container (3.9).
8. **Copy drift** between web and mobile, or away from the brand voice. Strings move byte for
   byte; new copy goes through `docs/Design-System.md` §2.
9. **A long two-stack period.** Without a rule about where new screens go, the migration never
   finishes (decision 6).
10. **Memory** with Go and Next in one 512 MB container (3.11).
11. **MFA lockout** during the auth phase (Phase 3).

---

## 6. Open decisions for Gyasi

Each has a recommendation; none is settled.

| # | Decision | Recommendation |
|---|---|---|
| 1 | Do it at all, and when | Yes if the gains in section 1 matter to you, but only after Render is live and stable with Next.js |
| 2 | Templates: templ or `html/template` | templ, for typed components |
| 3 | Client JS: plain modules or Alpine.js | Plain modules; reconsider only if the count grows past a handful |
| 4 | Folder: `webgo/` renamed to `web/` at the end, or keep `webgo/` | Rename at the end, so the stack rules read the same as today |
| 5 | Transition hosting: one container or two Render services | One container; fall back to two if memory is tight |
| 6 | New screens during the migration | Build new screens only in Go once Phase 1 ships; Next.js gets fixes only |
| 7 | Move Edge Functions to Go too | No. It would touch mobile and the audit middleware for no user-facing gain. Out of scope here |
| 8 | Browser tests: Playwright or chromedp | Playwright, dev-only, for a small smoke suite |

---

## 7. Documents and tooling to update (before Phase 1)

Per the CLAUDE.md document hierarchy, the docs change before the code.

- `docs/BRD.md` §15.1 (the "Web UI: Next.js + React + TypeScript" paragraph and the repo layout
  line for `web/`)
- `docs/Tech-Recommendations.md` §2.3 table, §2.3.1, §6 one-page summary, and the bootstrap
  CLAUDE.md template in §5
- `docs/Design-System.md` §12.2 (web implementation)
- `CLAUDE.md`: Stack, Common commands, the web gotchas (dark mode and MUI), "What NOT to do"
- `web/AGENTS.md` and `web/CLAUDE.md`, replaced by Go equivalents
- `.claude/hooks/stack-boundary-guard.py`, `.claude/agents/web-reviewer.md`,
  `.claude/skills/new-screen`, `.claude/settings.json`, `.claude/launch.json`
- `.github/workflows/ci.yml` and `deploy.yml`, `render.yaml`
- `docs/RENDER-MIGRATION.md`: add a pointer here once this is adopted

---

## 8. When you pick this up

1. Check that production is live on Render with Next.js. If not, finish
   `docs/RENDER-MIGRATION.md` first.
2. Answer the eight decisions in section 6.
3. Do Phase 0 as one docs-and-tooling PR.
4. Start Phase 1 in its own worktree.
