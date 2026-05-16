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

## The canonical URL

Read it from `CLAUDE.md` — the "Stack" section records the project's design handoff URL. If you can't find it there, ask the user before fetching from any URL.

## Procedure

### 1. Fetch the handoff tarball

```bash
HANDOFF_URL="<URL from CLAUDE.md>"
WORK="/tmp/storytail-handoff-$(date +%s)"
mkdir -p "$WORK"
curl -sS --compressed -o "$WORK/handoff.tar.gz" -D "$WORK/headers.txt" "$HANDOFF_URL"
```

Verify the response:
- HTTP 200 in headers
- `Content-Type: application/gzip`
- `Content-Disposition: attachment; filename="...-handoff.tar.gz"`

If the response is HTML or JSON, the URL is wrong or expired — stop and ask the user.

### 2. Extract

```bash
tar -xzf "$WORK/handoff.tar.gz" -C "$WORK"
REMOTE="$WORK/story-tail-adventures-rewrite/project"
```

The bundle's `README.md` at `$WORK/story-tail-adventures-rewrite/README.md` is the human-facing instructions from Claude Design. Read it once to confirm the bundle's structure hasn't changed.

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
