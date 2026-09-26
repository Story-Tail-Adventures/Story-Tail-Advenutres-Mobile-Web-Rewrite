# Stripe Projects and the Supabase Stripe App — Reference

**Status:** reference notes only. Nothing here is built, decided, or committed to.
**Captured:** 2026-09-26, from the two URLs below.
**Why it exists:** Gyasi saved these links to have on hand when Credit Card Authorization work starts (BRD §10.4, Screen Inventory 2.4.2 / 2.4.3 / 3.6.4).

> **Read §3 first if you are here for card authorization.** Neither link is about
> card handling. Both are about provisioning infrastructure. §3 explains the gap.

---

## 1. Supabase app on the Stripe App Marketplace

**URL:** https://marketplace.stripe.com/apps/supabase

### Listing data

| Field | Value |
|---|---|
| App name | Supabase |
| Tagline | "Spin up a Postgres database with auth, storage & more, right from the Stripe CLI" |
| Category | Developer tools |
| Built by | Supabase |
| Pricing | Free |
| Visible on | API only (no Stripe Dashboard UI surface) |
| Works with | Payments |
| Sandbox compatible | **No.** The listing states "Sandbox testing not available" |
| Install path | "Go to docs to install" (there is no in-Dashboard install button) |
| Supported languages | English (United States) |
| Based in | United States |

### Features, as the listing words them

1. **Instant Postgres from the Stripe CLI** — "Provision and connect a complete
   Supabase project with a dedicated Postgres database in seconds using the Stripe
   CLI. A seamless flow for new and existing Supabase users."
2. **Edge Functions, Auth, Realtime all included** — "Run Edge Functions, enforce
   Auth policies, and broadcast Realtime events directly alongside your Stripe
   data."

### About text

> "Supabase is the open-source Firebase alternative built on Postgres. Provision a
> full Supabase project, including a dedicated Postgres database, Auth, Storage,
> Edge Functions, and Realtime — directly from the Stripe CLI and AI coding
> environments."

### Permissions the app requests

One scope only:

| Scope | Access | What the listing says it covers |
|---|---|---|
| Provisioning Account Requests | Read and write | "Provisioning Account Requests track requests for new Stripe accounts within a provisioning workflow. Read access lets you view request status. Write access lets you create and manage requests." |

**Note the shape of that permission.** The app can read and write *provisioning
account requests*. It does not request access to Customers, PaymentMethods,
SetupIntents, Charges, or any other payment object. This is an
infrastructure-signup integration, not a data integration.

---

## 2. Stripe Projects (`docs.stripe.com/projects`)

**URL:** https://docs.stripe.com/projects#add-a-service

Despite the name, "Stripe Projects" has nothing to do with organizing a Stripe
account. It is a CLI plugin that provisions and manages **third-party services**
(hosting, databases, auth, AI, observability) and bills them through your Stripe
account.

The pitch, in Stripe's words: "Run one command to create your accounts, sync
credentials to your `.env`, and handle billing through Stripe."

### The three-level model

| Term | Meaning |
|---|---|
| **Provider account** | Your account with a provider (Vercel, Supabase, Clerk, PostHog) |
| **Service** | A provider's product offering (a database, auth, analytics) |
| **Resource** | One instance of a service, plus its credentials and env vars (`test-db-1`, `auth`, `test-analytics-1`) |

A Stripe project represents a single app or codebase and groups a provider
account's services and resources.

Once a provider account is associated with your Stripe account, it stays
authorized until you explicitly remove it. You can reuse that provider account for
new projects under the same Stripe account. A **different** Stripe account
requires associating the provider account again.

### Quickstart

```bash
stripe plugin install projects
stripe projects init
stripe projects add supabase/project
stripe projects add vercel/project
stripe projects env --pull
```

Agent-driven setup (the docs name Claude Code explicitly):

```bash
npx skills add https://docs.stripe.com --skill stripe-projects -g -y
```

### §"Add a service" — the section Gyasi's anchor points at

```bash
stripe projects add <provider>/<service>
```

Behavior, verbatim from the docs:

- "When you add a service, this action associates an existing provider account
  with your Stripe account or creates one, before adding the service."
- "Adding a service provisions a resource in your provider account. Use the `add`
  command to provision a database, auth instance, analytics project, feature
  flags, or other managed infrastructure for your app."

Related commands in the same section:

| Command | What it does |
|---|---|
| `stripe projects link <provider>` | Associates (or creates) a provider account **without** provisioning a resource. Meant for agent workflows that want the connection established first. |
| `stripe projects remove <provider>/<service>` or `remove <resource_name>` | Deprovisions the resource and drops it from project state. Does **not** delete credentials already written to `.env` or `.projects/vault/`. |
| `stripe projects rotate <provider>/<service>` | Rotates that service's credentials. |
| `stripe projects upgrade <provider> \| <provider>/<service> \| <resource_name>` | Moves a service to a higher tier. |
| `stripe projects open <provider>` | Opens the provider's dashboard in a browser. |

### How credentials are handled

Stripe Projects fetches credentials from each provider, encrypts them in
`.projects/vault/vault.json`, and stores them in the **Stripe Secret Store**.

- `.env` is the default output for local development. Named environments write to
  their own configured file (`.env.dev`, `.env.production`).
- Output files are created with `600` permissions.
- `stripe projects init` adds credential files to `.gitignore` automatically.
- The vault is "a local credential cache, not a shared secrets distribution
  system." Each teammate runs `env --pull` on their own machine.

### File reference

| File or folder | Purpose | Commit? |
|---|---|---|
| `.projects/state.json` | Shared project state: services, resources, environment definitions, output paths, config | Yes |
| `.projects/state.local.json` | Associations between project resources and personal provider accounts, backend resource IDs, active environment | **Yes**, despite the `.local` name. Teammates get an error on `stripe projects link` without it. |
| `.projects/vault/` | Encrypted credential cache | No (auto-gitignored) |
| `.projects/cache/` | CLI metadata cache | No (auto-gitignored) |
| `.env`, `.env.*` | Plaintext credentials for local dev | No (auto-gitignored) |

### Environments

Each environment has a name, an output file, and a set of resources whose
credentials get written to that file.

```bash
stripe projects env list           # list environments
stripe projects env show           # show the active one
stripe projects env create development --output .env.dev
stripe projects env use development
stripe projects env update --name staging
stripe projects env update --output .env.staging
stripe projects env delete staging
stripe projects env --pull         # sync active environment's output file
```

You cannot delete the last environment or the virtual `default` environment.

`env --pull` runs automatically after provisioning, rotating, upgrading, or
changing environment membership. Run it by hand when: setting up on a new machine
or after a clone, picking up a teammate's change, restoring a deleted `.env`,
verifying local state, switching environments, or after a remote project-variable
change.

**Production is not automated.** "`stripe projects env --pull` writes credentials
to the active environment's local output file. It doesn't write environment
variables to your production host." You add them to the host yourself.

### Other commands worth knowing

| Command | Purpose |
|---|---|
| `stripe projects status` | Project name, Stripe account, provider accounts, resources, tiers, health |
| `stripe projects list` | All projects on the Stripe account (name, ID, creation date) |
| `stripe projects pull <projectID>` | Set up an existing project in an empty directory. Connects to existing instances; does not provision new ones. |
| `stripe projects catalog [provider\|category]` | Providers, categories, tiers, pricing |
| `stripe projects search <keyword>` | Find services by keyword |
| `stripe projects build my-app [--template ...]` | Scaffold a starter app plus its whole stack |
| `stripe projects share` | URL encoding your service stack (no credentials or config values). Consumed via `init --from <URL>` or `import <URL>`. |
| `stripe projects llm-context` | Writes a file combining project context with provider-supplied LLM context |
| `stripe projects variables set/list/delete` | Project variables not tied to a provisioned resource (app URLs, your own API keys) |

### Billing

Payment methods attach to your Stripe account, not to a project.

```bash
stripe projects billing show      # payment method on file
stripe projects billing add       # add or replace
stripe projects billing update    # set spend limits
stripe projects spend [provider]  # spend by month and provider
```

When you pick a paid plan, Stripe tokenizes your payment credentials into a
**Shared Payment Token** and grants the provider a payment credential for that
upgrade. The provider charges against that token. Your underlying payment
credentials are not shared.

Spend limits can be global or per provider; a per-provider limit wins over a
global one. Paid tiers are only available in certain countries (see
`docs.stripe.com/projects/paid-tier-countries`).

### Non-interactive flags (CI, scripts, agents)

`-v/--version`, `--json`, `--no-interactive`, `--auto-confirm`, `--quiet`,
`--accept-tos`, `--stream`, `--debug`.

Stripe's own agent rules from the same page:

- Never display environment variable values, only names.
- Never fabricate provider names or commands not in the catalog output.
- Do not hand-edit `.projects/` or `.env`. The CLI is authoritative.
- Use `--json` on all commands except `init`.

Error recovery: `PROVIDER_NOT_LINKED` → run `stripe projects link <provider>`.
`UNKNOWN_ERROR` → show the full error, retry with `--debug`.

### Supabase's entry in the provider catalog

| Provider | Primary categories |
|---|---|
| Supabase | Database, authentication, storage |

Sixty-plus providers are listed. Ones already in or adjacent to our stack:
**Supabase** (database, auth, storage), **Vercel** (hosting), **Sentry**
(observability), **Datadog** (observability, analytics), **Cloudflare**,
**Upstash**, **Neon**, **PlanetScale**.

Run `stripe projects catalog` for the live list, or see
[projects.dev/providers](https://projects.dev/providers).

---

## 3. What these two links do NOT cover

This matters, because the folder and branch are both named for credit card
authorization.

**Neither link touches card data, tokenization, or PCI scope.** Read together,
they describe one thing: using the Stripe CLI to sign up for and provision a
Supabase project, with Stripe handling the billing for any paid tier. The
Marketplace app's only permission is on *provisioning account requests*. The
Projects docs are a package-manager-style tool for infrastructure.

Our Credit Card Authorization work is a different problem entirely. Per BRD §10.4
and Tech-Recommendations §4.6, §4.7 and §4.9, it needs:

- **`SetupIntent`** with `usage: 'off_session'` to collect and vault a card
  (Screen Inventory 2.4.2 / 2.4.3), plus the mandate consent text
- **Vault and Forward** (`ForwardingRequest`) for API suppliers
- **Audited, MFA-gated PAN reveal** for portal suppliers (Screen Inventory 3.6.4)
- Audit events on every mutation touching `payment_card` and `card_authorization`
- No PAN ever persisted outside Stripe, and no client-facing charge of any kind
  (BRD §10.5)

None of that is addressed by either page.

### Where these links could still be useful

Two honest possibilities, both minor and neither decided:

1. **Provisioning convenience.** If a fresh Supabase project is ever needed (a
   staging environment, a second region), `stripe projects add supabase/project`
   plus `env --pull` is a fast path that also keeps credentials out of
   copy-and-paste. Weigh against our existing setup, which is already provisioned
   and already has a deploy pipeline split between Supabase's own integration and
   GitHub Actions.
2. **Environment-variable hygiene.** The named-environment model
   (`.env.dev` / `.env.production`, per-environment resource membership) maps onto
   a real pain point already recorded in memory: `.env.local` drifting per
   worktree, and the local stack serving only whichever worktree started it.

### Two cautions before anyone acts on this

- **The Marketplace app is not sandbox compatible.** The listing says outright:
  "Sandbox testing not available." Anything installed runs against a live Stripe
  account. For a project whose entire payment posture is built on staying in
  SAQ A, installing an app with write access to a live account deserves the
  security review that CLAUDE.md already requires for payment-adjacent SDKs.
- **Billing routes through our Stripe account.** Paid provider tiers get charged
  via a Shared Payment Token issued from our Stripe account. That mixes
  infrastructure spend into the same account we use for card tokenization. Worth
  a deliberate decision, not a side effect of running one CLI command.

### Still open

If the goal behind saving these was a **Stripe-to-Supabase data sync** (Stripe
objects mirrored into Postgres tables), that is a separate product from either
link, and neither page describes it. Worth confirming before the card
authorization build starts.
