---
name: sync-design-handoff
description: Refresh `design/source-prototype/` from the canonical Claude Design handoff URL. Fetches the tarball, diffs against the local copy, and applies updates the user approves. Use when the user says "refresh designs", "pull latest handoff", "sync the prototype", "update design source", or whenever a screen-build task starts and the local prototype is suspected stale.
---

# sync-design-handoff

## Purpose

The Story-Tail Adventures designs live in **two synchronized places**:

- **Canonical source:** the Claude Design handoff URL (recorded in `CLAUDE.md`). Anthropic-hosted tarball, regenerated when the designer iterates.
- **Local mirror:** `design/source-prototype/` in this repo. Read by the `new-screen` skill, `web-reviewer`, and `mobile-reviewer` as the visual ground truth.

When the designer iterates in Claude Design, the URL refreshes and the local mirror goes stale. This skill pulls the latest, shows what changed, and applies updates the user approves. No silent overwrites.

## When to use

Trigger phrases:
- "Refresh the design handoff" / "Sync the prototype" / "Pull latest designs"
- "Did the designs change?" / "Is our prototype up to date?"
- "Update `design/source-prototype/` from the handoff URL"

Use proactively at the start of any screen-build task (`new-screen` skill, `web-reviewer` parity check, `mobile-reviewer` parity check) **if** the local mirror hasn't been refreshed recently or the user mentions design changes. If unsure, ask once: "Want me to pull the latest handoff before we start?"

## The canonical source

The Claude Design **project** recorded in `CLAUDE.md` (Stack section):
`https://claude.ai/design/p/019e27d4-5f9f-7c8d-b082-db804374dab3`. The original handoff
tarball URL (`api.anthropic.com/v1/design/h/…`) expired in September 2026 and returns 404 —
do not fetch from it. If `CLAUDE.md` and this file disagree, ask the user before fetching.

## Procedure

### 1. Authorise once

The `DesignSync` tool needs design-system authorisation. In an **interactive** Claude Code
session on this machine run `/design-login` once; headless and SDK sessions reuse it. In a
non-interactive session where that is impossible, the fallback that worked in September 2026
is the design editor's own API from the user's logged-in Chrome (Claude in Chrome): POST
`https://claude.ai/design/anthropic.omelette.api.v1alpha.OmeletteService/ListFiles` and
`…/GetFile` with `{"projectId": "<id>", "path": "<file>"}` (`GetFile` returns base64
`content`). Read-only calls only. Beware the browser tool's 50,000-character page-text cap:
dump one file per read, mark leading whitespace with a sentinel, and reconstruct with a
script — the transfer collapses interior runs of spaces, so patch alignment-heavy files in
place rather than overwriting them. `pages/*.html` come back with the design tool's
`data-omelette-injected` `<style>`/`<script>` blocks; strip them before mirroring.

### 2. List and fetch

```
DesignSync list_files  projectId=<id> path=screens   (and shared, styles, pages, tweaks, brand)
DesignSync get_file    projectId=<id> path=screens/client-public.jsx
```

Write each fetched file into a scratch directory (`$WORK/project/...`) mirroring the remote
paths, then diff as below. The design's `_bundle-src/` and `_archive/` folders are the
designer's own history — do not mirror them.

### 3. Diff against local

Map remote → local:

| Remote path | Local path |
|---|---|
| `project/styles/tokens.css` | `design/web-tokens/tokens.css` |
| `project/styles/app.css` | `design/source-prototype/styles/app.css` |
| `project/styles/tweaks.css` | `design/source-prototype/styles/tweaks.css` |
| `project/screens/*.jsx` | `design/source-prototype/screens/*.jsx` |
| `project/shared/*` | `design/source-prototype/shared/*` |
| `project/brand/*` | `design/source-prototype/brand/*` |
| `project/artboards/*` | `design/source-prototype/artboards/*` |
| `project/tweaks/*` | `design/source-prototype/tweaks/*` |
| `project/Story-Tail Designs.html` | `design/source-prototype/Story-Tail Designs.html` |
| `project/pages/*` (section pages + `_sections.json`, injected blocks stripped) | `design/source-prototype/pages/*` |

Run `diff -rq "$REMOTE" "$LOCAL"` for each pair (or one rooted diff if the trees align). Categorize the output into:

- **New on remote** (`Only in remote`) — screens or assets the designer added.
- **Modified** (`Files X and Y differ`) — same file, content changed.
- **Removed on remote** (`Only in local`) — local has files the canonical doesn't. **Important:** these may be intentional local additions (e.g., notes, work-in-progress); don't delete them without asking.

Also flag the special case of `tokens.css` separately — it lives at `design/web-tokens/tokens.css` (the production-consumed location), not under `source-prototype/`. If it changed, the mobile theme files (`design/compose-theme/StoryTail*.kt`) likely need a hand-update too — call that out.

### 4. Present the change set to the user

Output format:

```
## Handoff sync — proposed changes

### New files (N)
- `design/source-prototype/screens/client-auth-mobile.jsx` (new screen)
- ...

### Modified files (M)
- `design/source-prototype/screens/client-trip.jsx` (X+ Y- lines) — preview top change: ...
- ...

### Local-only files (K) — keep or delete?
- `design/source-prototype/screens/_my-notes.jsx`
- ...

### Token changes (special)
- `design/web-tokens/tokens.css` changed. Mobile theme files in `design/compose-theme/` may need a hand-update — see §5 below.

Apply all changes? [y/N/select]
```

Ask the user before writing anything. Default to "no" if ambiguous.

### 5. Apply approved changes

For each approved change, copy from `$REMOTE` to the corresponding local path. Use `cp -p` to preserve timestamps. Don't delete local-only files unless explicitly approved.

If `tokens.css` changed, do **not** auto-regenerate `design/compose-theme/StoryTail*.kt`. Instead, after the copy, print:

> Token changes detected. The mobile theme files at `design/compose-theme/StoryTail*.kt` use these same values and need a hand-update to stay in sync. Specifically check: `StoryTailColors.kt` against the `--md-*` vars, `StoryTailTypography.kt` against `--font-*`, `StoryTailShape.kt` against `--r-*`. Run me with "sync compose theme" to do that pass.

(If/when "sync compose theme" becomes its own skill, link to it here.)

### 6. Clean up

```bash
rm -rf "$WORK"
```

### 7. Report

Final message to the user:

```
## Sync complete

- Applied N changes
- Skipped K local-only files (still present)
- Mobile theme files: <unchanged | needs hand-update — see above>

Re-run `web-reviewer` / `mobile-reviewer` on any in-progress screens; the prototype is their parity reference.
```

## Edge cases

- **URL returns HTML or 404:** The handoff link expired or rotated. Ask the user for the new URL. Do not guess.
- **`tokens.css` changed by a *lot*:** This means a major design refactor. Recommend the user review token-by-token before applying. The `new-screen` skill and both reviewers will start enforcing the new tokens immediately after sync — that's intentional, but the user should know.
- **Local file has unsaved edits the user wants to keep:** If `git status` shows local prototype files as modified, **flag them before overwriting**. Don't blow away in-progress work.
- **Bundle structure changed:** If the remote tarball's directory layout no longer matches the table in §3, the bundle README at the tarball root will say what's new. Read it, adapt the mapping, and ask the user before applying.

## What this skill does NOT do

- Doesn't render or screenshot the prototype HTML. The READMEs at the bundle root and in this repo are explicit: read source files directly; screenshots add nothing.
- Doesn't implement screens. That's the `new-screen` skill's job.
- Doesn't regenerate mobile theme Kotlin files. That's a separate pass (potentially a future skill).
- Doesn't push commits. The user reviews the diff in their git client and commits when ready.

## Known upstream deltas — re-apply after every sync

The prototype is read-only and is the canonical token source, so these local corrections
get clobbered by a sync unless you re-apply them. Check each one after pulling.

### 1. Missing dark-scheme error tokens — ✅ **RESOLVED 2026-09-10. Not a delta any more.**

> Found 2026-09-01, fixed locally 2026-09-09 and **pushed upstream 2026-09-10**, so a sync no
> longer clobbers it and nothing needs re-applying. Kept here as the record.
>
> It surfaced during the §2.5/§2.6 artboard work: §2.5.9's "Close your account" card and
> §2.5.10's confirm are the first large `errorContainer` surfaces in the client app, which is
> why it survived §2.0–§2.2 unnoticed. Measured **1.83:1 → 7.24:1** on the container and
> **1.70:1 → 7.72:1** on the error button; both now clear AA and AAA.
>
> All five token sources were verified in agreement afterwards — the design project,
> `design/source-prototype/styles/tokens.css`, `design/web-tokens/tokens.css`,
> `design/web-tokens/design-tokens.ts`, `web/styles/tokens.css` and `web/app/globals.css` —
> and they match `StoryTailColors.kt`, which is the authority:
> `onError #690005`, `errorContainer #93000A`, `onErrorContainer #FFDAD6`.
>
> A sweep for the same class of bug found no other instance. The only tokens still absent
> from `.scheme-dark` are the `--brand-*` palette, which is **deliberately** scheme-invariant
> in both the prototype and `web/styles/tokens.css`.

`design/source-prototype/styles/tokens.css` defines `--md-error` and `--md-error-container`
inside `.scheme-dark` but **not** `--md-on-error` or `--md-on-error-container`. Both then
silently inherit their light values, so dark-mode error text renders `#410002` on `#93000A`
— near-black on dark red, effectively unreadable. It only shows up on a surface that
actually uses `errorContainer`, which is why it survived into the handoff.

`StoryTailColors.kt` has the correct values, and is the authority here:

```css
.scheme-dark {
  --md-error: #FFB4AB;
  --md-on-error: #690005;            /* ← add */
  --md-error-container: #93000A;
  --md-on-error-container: #FFDAD6;  /* ← add */
}
```

Apply to `design/web-tokens/tokens.css`, `web/styles/tokens.css`, and the `darkColors`
object in `design/web-tokens/design-tokens.ts`.

**Raise it with the designer** so the fix lands upstream and this note can be deleted.

### 3. `--brand-gold` token (added 2026-09-02)

The public landing pages needed the prototype's `#FFC83F` "sunset gold on photography" as a
named token. `design/web-tokens/tokens.css`, `web/styles/tokens.css`,
`design/web-tokens/design-tokens.ts` (`brand.gold`) and `design/compose-theme/StoryTailColors.kt`
(`StoryTailBrand.Gold`) carry `--brand-gold: #FFC83F`; the prototype's own `styles/tokens.css`
does not. Re-add it after any token sync, and ask the designer to adopt it upstream.

### 4. `screens/client-auth.jsx` and `shared/images.js` were patched in place (2026-09-02)

Both were updated from the design with targeted patches (not overwrites) because the browser
transfer collapses interior space runs. If a future sync overwrites them wholesale from a
faithful source, that is fine; just diff first.

### How to check for new instances of this class of bug

Any `--md-*` token defined in `:root` but not in `.scheme-dark` keeps its light value in
dark mode. Most are intentional (shape, type). Colour roles usually are not:

```bash
python3 - <<'EOF'
import re, pathlib
css = pathlib.Path("design/web-tokens/tokens.css").read_text()
def block(sel):
    m = re.search(sel + r"\s*\{(.*?)\n\}", css, re.S)
    return dict(re.findall(r"(--[\w-]+):\s*([^;]+);", m.group(1))) if m else {}
light, dark = block(r":root"), block(r"\.scheme-dark")
for k in light:
    if k.startswith("--md-") and k not in dark:
        print(f"{k:32} keeps light value {light[k].strip()}")
EOF
```

### 2. Script wordmark clipped by the gradient text-clip (found 2026-09-01)

`.brand-mark .mark-script` in `design/source-prototype/styles/app.css` has no horizontal
padding. In dark mode the rule uses `background-clip: text` with
`-webkit-text-fill-color: transparent`, and Caveat — a script face — overhangs its advance
width by about 4px at 22-23px. `background-clip: text` paints only inside the element box,
so the tail of the final "l" falls outside the gradient and renders transparent: the
wordmark reads "Story-Tai".

Measure it rather than eyeballing:

```js
const cs = getComputedStyle(document.querySelector('.mark-script'));
await document.fonts.ready;
const ctx = document.createElement('canvas').getContext('2d');
ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
const t = ctx.measureText('Story-Tail');
console.log('overhang px:', t.actualBoundingBoxRight - t.width);   // > 0.5 means clipped
```

Fix in `web/styles/components.css` — the gradient is vertical, so widening the paint box
changes nothing visually:

```css
.brand-mark .mark-script { padding-right: 0.4em; }
```

Mobile is unaffected: `BrandWordmark.kt` uses a solid colour, not a gradient clip.

### 5. Section 2.2 artboard deltas (2026-09-06)

Section 2.2's mobile artboards were authored **locally first and pushed upstream**, which
reverses this skill's usual direction. `screens/client-trip-mobile.jsx`,
`pages/c22-dashboard.html` and the `c22-dashboard` entry in `pages/_sections.json` all
originated here and were written to the design project on 2026-09-06. A sync will not report
them as new; they are already upstream.

Two things about that page are deliberate and must survive a re-sync:

- **It keeps the `#view-seg` Web/Mobile toggle.** Upstream's generated `c22-dashboard.html`
  omitted it, because at generation time §2.2 had no mobile screens. It has eleven now, and
  without the toggle none of them can be reached.
- **`mobileScreens` is a real array, not `null`.**

Seven decisions are encoded in `client-trip-mobile.jsx` and **not** in the desktop
`client-trip.jsx`, so the two files disagree on purpose. The header comment of the mobile file
carries the same list; keep them in step.

1. The bottom bar has **four** tabs (Trips · Discover · Messages · Account), per the
   prototype's own `StaMobileTabs` — not Screen-Inventory §6.3's five, and no Help FAB.
   Gyasi chose the prototype over the doc on 2026-09-06; §6.1, §6.3 and Design-System
   §9.2–§9.3 are being amended to match, not the artboards.
2. Gyasi's portrait is an **initials avatar** (`MAdvisorAvatar`, "GS"). `staImg('avatarA')`
   has no entry in `web/lib/images.ts` and no licensed photograph of him exists.
3. **Gyasi is he/him.** `C228_EmptyState` in the desktop file still reads "once **she** hears
   back from concierge" — that is an upstream bug, not a variant. **Still unfixed in
   `client-trip.jsx`**; scheduled for the §2.2 doc-and-voice pass.
4. No **"Saved searches"** dashboard tab — `SavedSearch` is a Phase 2 entity.
5. No **"OFFLINE-READY / Synced 2h ago"** card — offline UI is Phase 3 (BRD §13.3), even
   though the SqlDelight cache lands in Phase 1.
6. **"Share with co-traveler" collapses into "Download PDF."** The secure link is deferred to
   §2.8, where Screen-Inventory §7's open question about account-less co-traveler access
   belongs.
7. **"Book a similar trip" repoints at the trip thread** — §2.3 self-guided search is Phase 2,
   so the desktop CTA has no destination at MVP.

Kept deliberately, against the instinct to strip anything unbacked: the payment timeline and
the testimonial card, because `payment_milestone` and `testimonial` are modelled in the same
PR; the weather card, because `itinerary_day.weather_forecast` already exists and is
agent-authored; "Mark as done", which ships as per-device local state with no column; and
"Authorize a card", because §2.4 is Phase 1 and lands next.

Also still true of the desktop file and worth fixing when it is next touched: the cancelled
chip is hardcoded `#D7DFE6`/`#3D352E` inline (`client-trip.jsx:524`) because `.chip-status`
has no `cancelled` variant, and the documents subtitle claims "Auto-encrypted, share via
secure link" — jargon, an unverified security claim, and a de-scoped feature in nine words.

### 6. `screens/client-trip.jsx` copy corrections (2026-09-07)

Two strings edited **in place** in the desktop file during the §2.2 stage-10 pass. Both are
in `C228_EmptyState`, and both will come back on the next sync unless re-applied.

```
line 455  Gyasi is comparing American and JetBlue for the best Saturday departure window.
          We'll add flights here once confirmed.
       →  Gyasi is still working on the flights. They will appear here once they are
          confirmed.

line 461  Gyasi will book Bayside Friday once she hears back from concierge.
       →  Gyasi will book Bayside Friday once he hears back from concierge.
```

**The pronoun is the one to raise upstream.** Gyasi Story is he/him — `supabase/seed.sql` is
the authority and `web/content/public/proof.ts` carries the same correction for the "mom of
three" line the prototype had. Getting a real person's pronouns wrong in the design source is
the kind of thing that leaks into shipped copy every time somebody works from the artboard.

**The carrier narration asserts something no column holds.** Nothing in the schema records
which airlines an advisor is comparing, so an empty state cannot say it. Screen-Inventory's
own worked example for these states says what is true and stops. The built 2.2.8 uses the
replacement above on both stacks.

Still outstanding in the same file, unedited, and worth doing when it is next touched:

- **`client-trip.jsx:524` hardcodes the cancelled chip** as `#D7DFE6`/`#3D352E` inline
  because `.chip-status` had no `cancelled` variant. The token now exists (added in the
  shared-spine commit), so the inline style can go.
- **The reply-time strings.** The desktop and mobile artboards carry five different
  promises between them — `client-trip.jsx:206`, `client-messaging.jsx:9`/`:59`/`:155`,
  `client-search.jsx:281`, `client-auth.jsx:412`, `client-public-mobile.jsx:114`/`:752`,
  `client-public-topics.jsx:375`/`:390`, `agent-reports-settings.jsx:269` — ranging from
  "reply in < 2h" to "within 48 hours". §2.2 settled the authenticated surface on "Usually
  replies the same day" and `client-trip-mobile.jsx` already says it. The public figures
  live in `web/content/public/proof.ts` as **unverified** claims, fenced by
  `PUBLIC_CLAIMS_MODE=strict` (which fails `next build`), so nothing false can ship — but
  the artboards should be brought to one number once Gyasi measures it. See the note on
  `avgReplyTime` in that file.

### 7. Sections 2.5 and 2.6 mobile artboards (2026-09-09) — **pushed upstream 2026-09-10**

Like §2.2 before it, this reversed the skill's usual direction: these files were authored
here and pushed to the design project with `DesignSync finalize_plan` → `write_files`.

> **Status: all five are now upstream and verified by reading them back.** They are no longer
> local-only, so a sync will match rather than flag them. What follows is the record of what
> was pushed and why, not a list of files to protect.
>
> **The push worked even though the project is `PROJECT_TYPE_PROJECT`, not
> `PROJECT_TYPE_DESIGN_SYSTEM`** — it reports `canEdit: true` and accepts writes, but it does
> **not** appear in `DesignSync list_projects`, which filters to design-system projects. Do
> not conclude from an empty `list_projects` that the project is unwritable; address it by id.

**Pushed 2026-09-10:**

- `screens/client-account-mobile.jsx` — 11 artboards, `M251_*` … `M2511_*`
- `screens/client-messaging-mobile.jsx` — 3 artboards, `M261_*` … `M263_*`
- `pages/c25-account.html`, `pages/c26-messaging.html` — generated from `c22-dashboard.html`,
  a local page carrying the `#view-seg` Web/Mobile toggle. **Without that toggle no mobile
  artboard in the section is reachable**, and the upstream copies of both pages did not have
  it before this push. Regenerate rather than pull.

  `c22-dashboard.html` is not the *only* local page with the toggle — `c20-public.html` has
  it too, and this file and the commit that added these pages both said otherwise. Either
  template works; c22 was chosen because its section shape is closest.

  **Two traps when regenerating a section page from the `c22` template.** Both produce a page
  that renders and looks right, so neither surfaces without a diff against upstream:
  1. The template uses a **literal `&`**, not `&amp;`. A substitution written with the entity
     fails *silently* and leaves §2.2's breadcrumb and prev-link in place. Make every
     substitution assert, and refuse to write a file with any `2.2` residue left in it.
  2. There are **two** titles, not one — the `<Section title=…>` and the `<DesignCanvas
     title=… subtitle=…>` wrapper above it. Substituting only the Section leaves the canvas
     announcing "2.2 · Dashboard & Trip Experience" while the visible section heading reads
     correctly — invisible in a screenshot of the artboards themselves.
- `pages/_sections.json` — `c25-account` and `c26-messaging` gain a `mobileScreens` array and
  a second entry in `files`. Mobile entries carry no `w`/`h`; the `Section` component
  hardcodes the mobile frame size.

**Desktop frames that still need correcting upstream**, because the mobile files depart from
them deliberately and the two should not disagree forever. Each is a thing the desktop frame
draws that the platform cannot honour — the full reasoning is in the header comment of
`client-account-mobile.jsx` (departures 1–16) and `client-messaging-mobile.jsx` (1–10) —
**26 in total**, not the 16 the authoring commit's message claims nor the 21 this sentence
used to imply. The list below is the load-bearing subset, not the whole set; read the file
headers for the rest. All verified against the schema rather than assumed:

1. **No OCR** (`C255_DocUpload`) — no OCR service exists anywhere in the stack, and adding
   one is a new third-party SDK on a surface handling passport scans, which CLAUDE.md
   requires a security review for.
2. **No backup codes, no "Authy"** (`C257_Security`) — `web/app/(auth)/mfa/setup/actions.ts`
   states it: "Supabase has no backup-code factor, and a home-grown one could not" be
   trusted. The factor is TOTP; naming a vendor we do not integrate is worse than no name.
3. **No Facebook** (`C258_Connected`) — `auth_provider` is `ENUM ('email','google','apple')`.
4. **No "Member ID · STA-5839"** (`C251_AccountOverview`) — no such column exists anywhere.
5. **No pronouns field** (`C252_PersonalInfo`) — `pronouns` is on `agent`
   (Data-Model §813), not `client`. Adding it is a Data-Model change, doc first.
6. **No session locations, no "Trusted" chip** (`C257_Security`) — `auth.sessions` holds an
   `ip` and nothing resolves it to a place; `session.ip_country` has no writer. And the
   desktop frame's "Atlanta, GA · **suspicious?**" has a question mark in it, which is the
   design telling on itself — the platform cannot know. Same lesson as §2.2.8's carrier
   narration (delta 6 above).
7. **No tracking toggles** (`C259_Privacy`) — there is no analytics script, tag manager or
   advertising pixel anywhere in `web/`, and `web/content/public/legal/cookies.ts` already
   says so in writing. Three switches over nothing is a control that lies.
8. **Closure confirms by typing the email, not a password** (`C2510_Closure`) — a Google or
   Apple account has no password, so the desktop frame's password field is a wall those
   accounts cannot pass. It is also drawn full-screen rather than as a sheet: a sheet's
   grabber means "swipe this away", which is wrong for an irreversible action.
9. **No presence dot, no read receipts, no reactions, no System threads** (`C261`/`C262`) —
   there is no Realtime presence; `message.read_by_other_at` is withheld from
   `authenticated` on purpose; no reaction entity exists; and `conversation.agent_id` is
   `NOT NULL` with `user_role` offering no system sender. The "System" rows are
   notifications, and the notification centre §2.2.2 deferred to "§2.6" is **still
   homeless** — §2.6 has three screens and none of them is one.
10. **One reply-time string.** `client-messaging.jsx` alone carries three different promises
    (lines 9, 59, 155). Both new mobile files use the settled "Usually replies the same
    day". See the standing note at the end of delta 6.

**Glyph gap, blocking, and worth doing before any §2.5 screen on either stack:**

| Set | Missing |
|---|---|
| `shared/icons.jsx` | `camera` — both the desktop and mobile 2.5.5 frames fall back to a 📷 emoji |
| `web/components/ui/icon-paths.ts` | `lock`, `link`, `briefcase`, `camera` — the first three copy verbatim from `shared/icons.jsx` |
| `StoryTailGlyph.kt` | **eight** — `heart`, `bell`, `shield`, `link`, `lock`, `question` (2.5.1's rows), `chevron_right` (every settings row), `camera` (2.5.5). Mobile has no Material icons; every mark is a hand-drawn Compose `Path` and there are currently ten. 2.5.7's device rows can reuse `USER`/`CARD` rather than adding `phone`/`briefcase`. |

**Corrections made during the pre-push audit (2026-09-10), all verified against source.**
A 47-agent adversarial pass over the push set found fifteen defects. Recording the classes,
because every one of them renders fine and would have shipped:

- **A CSS custom property that does not exist fails silently.** `MInitialsAvatar` built
  `var(--md-${tone}-container)` from a `tone` prop; `tone="surface"` produced
  `--md-surface-container`, which is not in the palette (there is `--md-surface` and
  `--md-surface-1..5`). CSS drops the declaration, so the avatar circle on the §2.5 tab root
  rendered with **no fill at all**, in both schemes, and looked plausible against a gradient.
  Only the M3 accent roles have a `-container` pair — never template over tone names.
- **`overflow: hidden` plus an inert `flex: 1` clips instead of scrolling.** 2.6m.2 passed
  `scrollable={false}` and put `flex: 1; overflow: auto` on a child of a plain block box, so
  the flex grow did nothing and the only real scroll container was switched off. `M227_
  TripThread` has the right shape: let MFrame scroll, put the composer in `footer`.
- **A departure that misattributes what it removes hides a real removal.** Messaging
  departure 9 claimed to drop "the desktop frame's archive affordance" — the desktop frame has
  no archive control anywhere. What actually vanished was the spec'd **"By trip"** filter
  chip, under a rationale written about something else. Restored.
- **Copy asserting limits the backend contradicts.** 2.5.5 said "JPG, PNG or PDF · up to
  10 MB"; `_shared/trip.ts` allows pdf/jpeg/png/**heic**/webp at **50 MiB**. Omitting HEIC
  tells iPhone users their camera photos are rejected, on the camera-first screen.
- **Retention promises with nothing behind them.** 2.5.10 said personal details are
  anonymized "within 30 days". Data-Model §18.5 describes that window but **no scrubber
  exists** — no migration, no pg_cron entry, no Edge Function. The number is gone until one
  ships. Same class: the data export claimed to include the document-access trail, which
  lives in `audit_event` — the agency's table, which §2.2 deliberately gave clients no policy on.
- **Precedent cited backwards.** A departure claimed §2.2 renders card actions "disabled with
  a reason". The §2.2 *artboard* renders a live "Authorize a card · $4,180 due" CTA under
  "Kept deliberately"; it is the *built web app* that disables it. **The §2.2 artboard is out
  of step with the shipped app** — worth raising with the designer.
- **Miscited §4.4 pattern letters.** Six of eleven §2.5 assignments and one of three §2.6 were
  wrong (most of §2.5 is Pattern A, not B). That line is load-bearing guidance, so check it
  against §4.4 lines 1791-1806 rather than inferring it from the layout.
- **A pre-work list that undercounts.** The glyph note claimed eight Compose marks were
  needed; mechanically diffing every `Icon name=` and `icon:` against `StoryTailGlyph.kt`'s
  ten gives **17**. Count these with a script, never by eye.

**Still owed after this push** — `docs/Screen-Inventory.md` §2.5.5, §2.5.6 and §2.6.1 have not
been amended, and several departures deviate from the spec rather than from the artboard.
CLAUDE.md's hierarchy says the doc moves first. Do that before the built screens land.
