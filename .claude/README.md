# `.claude/` — project agents, skills, hooks, and settings

Everything in here is committed. These are project artifacts, not personal preferences:
they are how the team teaches Claude what "good" looks like in this codebase. Review them
in PRs and prune them when they stop earning their place.

The one exception is `settings.local.json`, which is gitignored for machine-specific
overrides.

## Layout

```
.claude/
├── README.md                   ← this file
├── settings.json               ← permissions allowlist + hook wiring
├── launch.json                 ← dev-server config for the browser preview
├── agents/
│   ├── web-reviewer.md         ← reviews web/       (Next.js, React, Tailwind v4)
│   ├── mobile-reviewer.md      ← reviews mobile/    (KMP, Compose Multiplatform)
│   ├── supabase-reviewer.md    ← reviews supabase/  (Edge Functions, migrations, RLS)
│   └── brand-voice-reviewer.md ← reviews user-facing copy against Design-System §2
├── hooks/
│   ├── stack-boundary-guard.py ← blocks Kotlin in web/, React in mobile/, etc.
│   └── pan-secret-guard.py     ← blocks card numbers and Stripe secret keys
└── skills/
    ├── new-screen/             ← implement a Screen Inventory screen
    ├── new-entity/             ← add a Data Model entity end-to-end
    ├── new-edge-function/      ← scaffold an Edge Function with audit + auth pre-wired
    ├── db-migrate/             ← create, apply, verify a migration; regenerate types
    ├── rls-policy/             ← author and TEST Row-Level Security policies
    ├── audit-pci/              ← check whether a change touches PCI scope
    ├── run-vulnerability-scan/ ← quarterly ASV scan
    └── sync-design-handoff/    ← refresh design/source-prototype/ from the handoff URL
```

## The three reviewers are stack-scoped on purpose

`web/`, `mobile/`, and `supabase/` are hard directory boundaries (CLAUDE.md rule 7), and
each has its own idioms and its own failure modes. A generic reviewer knows none of them.
Each agent declines work outside its tree and points at the right sibling.

Run them on a diff *after* finishing a unit of work — not mid-edit, when files are expected
to be broken. Don't have the same session that wrote the code review it; spawn the agent so
it starts with a clean context.

## Hooks

Both are `PreToolUse` on `Write|Edit`, which matters: `PostToolUse` runs after the write has
already landed, so it can only complain. Exit code 2 denies the call.

They enforce the two CLAUDE.md rules that are fully mechanical:

- **rule 7** (stack boundaries) — the most checkable rule in the file, otherwise caught only
  by post-hoc review.
- **rule 1** (no PANs) — the one rule where a mistake is a compliance incident rather than a
  bug. It Luhn-checks candidate digit runs rather than matching "16 digits", which is what
  keeps it from firing on timestamps and IDs. `.claude/`, `docs/` and `design/` are exempt,
  since the PCI skill and the reviewer checklists necessarily contain the very strings it
  looks for.

Test a hook directly by piping it the payload shape Claude Code sends:

```bash
echo '{"cwd":"'"$PWD"'","tool_input":{"file_path":"'"$PWD"'/web/Foo.kt","content":"x"}}' \
  | python3 .claude/hooks/stack-boundary-guard.py; echo "exit=$?"
```

Deliberately *not* hooked: format-on-write (no formatter config is agreed yet, so it would
churn every diff), typecheck-on-write and Gradle-on-write (mid-edit files are supposed to be
broken, and the reviewers run these at the right granularity).

## Permissions

`settings.json` allowlists the read-only and routine commands this project runs constantly,
so they don't prompt. Three choices worth knowing:

- `supabase db reset` is in **ask**, not deny. It is the primary local dev loop, so denying
  it outright would be constant friction — but it wipes and reseeds the database, so it
  should never happen silently.
- `supabase db push`, `link`, and `functions deploy` are hard **deny**. They touch a remote.
- Gradle entries are per-task, never `Bash(./gradlew:*)` — a blanket allow would cover
  `publish` and any task added later.

## Adding a skill

```markdown
---
name: skill-name
description: One line. This is what Claude matches on for autonomous invocation, so name the
  trigger phrases a person would actually type.
---

# Skill Name

## Purpose
## When to use
## Procedure
## What this skill never does
```

That last section does more work than it looks like — it's where the project's hard-won
"don't do the obvious thing here, because X" lives.
