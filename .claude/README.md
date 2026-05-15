# `.claude/` — Claude Code project skills and commands

Project-specific skills and slash commands that Claude Code picks up when running in this repo. The `skills/` directory is the modern format; legacy `commands/` is also supported but skills are preferred (they can be invoked autonomously by Claude in addition to as slash commands).

## Layout

```
.claude/
├── README.md                  ← this file
└── skills/
    ├── new-screen/
    │   └── SKILL.md
    ├── new-entity/
    │   └── SKILL.md
    ├── audit-pci/
    │   └── SKILL.md
    └── run-vulnerability-scan/
        └── SKILL.md
```

## Suggested skills to build out

These are the skills the Tech Recommendations doc (§5.3 Step 4) suggests for this project. Each needs a SKILL.md file describing its purpose, triggers, and procedure.

### `new-screen`

Implement a screen from the Screen Inventory. Reads the inventory, the matching prototype JSX in `../design/source-prototype/screens/`, and builds the Compose (mobile) or React (web) implementation following the design tokens.

Triggers: "build screen 2.2.3", "implement Trip Detail", "add the Login screen", "I want to start on the dashboard"

### `new-entity`

Add an entity from the Data Model. Generates the Supabase migration, the Postgres DDL, the TypeScript type (via codegen), and the Kotlin data class (via codegen). Updates the OpenAPI spec if the entity is part of the API surface.

Triggers: "add a new entity", "I need a Booking table", "let's add the Refund entity from the data model"

### `audit-pci`

Check whether a code change touches PCI scope. Greps for card-data-adjacent code, checks logging configs for PAN-scrubbing, verifies no Stripe `PaymentMethod` IDs are returned in API responses to client roles. Runs before any merge that touches `supabase/functions/stripe-*` or `web/components/payment/*`.

Triggers: "audit PCI", "is this PCI safe?", "I just changed a payment thing"

### `run-vulnerability-scan`

Trigger a quarterly ASV scan and capture the report. Reminds the team to run it on the schedule (every 90 days per PCI DSS).

Triggers: "run vulnerability scan", "quarterly PCI scan", "ASV scan"

## How to create a skill

Create a new directory under `skills/` and add a `SKILL.md` file with this frontmatter:

```markdown
---
name: skill-name
description: One-line description of what this skill does. Used for autonomous invocation matching.
---

# Skill Name

## Purpose

Explain what this skill is for.

## When to use

List triggers — user phrases that should invoke this skill.

## Procedure

Step-by-step instructions for Claude to follow when this skill is invoked.

## Examples

Show example invocations and expected output.
```

## Commit this directory

The `.claude/` directory should be committed to git. The skills are project artifacts — they're how the team teaches Claude what "good" looks like for this codebase. Treat them like code: review them in PRs, prune them when they're not useful.
