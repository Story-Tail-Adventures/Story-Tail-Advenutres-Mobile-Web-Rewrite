# `supabase/` — Database + Edge Functions

The Supabase project that hosts the application's database, auth, storage, real-time, and backend logic (via Edge Functions). This is the entire backend — there is no separate Ktor service. See `../docs/Tech-Recommendations.md` §3.3.

## Status

**Running locally.** `supabase init` has been run, both migrations apply cleanly, and
`seed.sql` provisions dev data on every reset. 34 tables, 18 enums.

```bash
supabase start          # boot the stack
supabase db reset       # replay migrations + seed from an empty database
supabase status         # URLs and keys
```

Seeded logins, all with password `DevPassword!234`:
`gyasi@example.com` (agent), `jordan.hayes@example.com` (client with a trip),
`sam.rivera@example.com` (archived client).

**RLS is enabled on all 34 tables and only three policies exist** — the self-read
policies on `account`, `platform_user` and `client` that Login needs. Everything else is
service-role-only until the full RLS pass lands. That is safe by default, but it also
means CLAUDE.md rule 4 (Stripe `PaymentMethod` IDs are server-only) is currently enforced
by convention rather than by the database. Use the `rls-policy` skill for the rest; it
tests each policy under a forged JWT rather than just writing it.

## Initialize

```bash
# Install Supabase CLI (Mac/Linux)
brew install supabase/tap/supabase

# Initialize the local project
cd supabase
supabase init

# Link to a remote Supabase project (after creating one at supabase.com)
supabase link --project-ref <your-project-ref>

# Start local development environment
supabase start
```

After `supabase init` the layout will be:

```
supabase/
├── config.toml              # Supabase project config
├── migrations/              # SQL migrations, applied via `supabase db reset`
├── functions/               # Edge Functions (Deno + TypeScript)
│   ├── _shared/             # Shared utilities across functions
│   │   ├── audit.ts         # Audit event helper
│   │   ├── auth.ts          # JWT verification, MFA step-up
│   │   └── stripe.ts        # Stripe SDK wrapper
│   ├── stripe-setup-intent/
│   ├── stripe-vault-forward/
│   ├── stripe-reveal-pan/
│   ├── commission-import/
│   ├── travel-api-proxy-amadeus/
│   ├── travel-api-proxy-hotelbeds/
│   ├── travel-api-proxy-viator/
│   ├── travel-api-proxy-widgety/
│   └── webhooks-stripe/
├── seed.sql                 # Optional seed data for local dev
└── tests/                   # Optional pgTAP database tests
```

## Migrations

Migrations live in `supabase/migrations/` and follow Supabase CLI conventions:

```
migrations/
├── 20260514120000_initial.sql
├── 20260520093000_add_trip_template.sql
└── ...
```

Workflow:

```bash
# Create a new migration
supabase migration new <descriptive_name>

# Apply local migrations
supabase db reset

# Production is NOT applied from here and NOT from GitHub Actions. Supabase's GitHub
# integration applies new migrations itself on merge to the `production` branch
# (Project Settings > Integrations > GitHub, "Deploy to production"). Same for the Edge
# Functions declared in config.toml. Nothing in .github/workflows/ runs `db push`.

# Generate TypeScript types from the local schema (for web/)
supabase gen types typescript --local > ../web/types/supabase.ts
```

## Edge Functions

Edge Functions are Deno + TypeScript. They run inside Supabase's edge network. See `../docs/Tech-Recommendations.md` §3.3 for the function list and what each one does.

Workflow:

```bash
# Scaffold a new function
supabase functions new <name>

# Serve a function locally
supabase functions serve <name>

# Deploy to production
supabase functions deploy <name>
```

## Production auth settings — set by hand, guarded by nothing

`config.toml` configures the **local** stack. Nothing runs `supabase config push`, and the
GitHub integration's production deploy covers migrations, Edge Functions and storage buckets
only — auth config is explicitly not included. So `.github/scripts/check_auth_config.py`
guards a file the hosted project never reads.

That is deliberate (pushing `config.toml` as it stands would set production's Site URL to
`http://localhost:3000`), but it means these must be set in the dashboard and re-checked by
hand. **Three of the five default WRONG on a new hosted project:**

| Setting | Hosted default | Must be | Breaks if wrong |
|---|---|---|---|
| Minimum password length | 6 | **12** | `web/lib/validation/auth.ts` and `AuthValidation.kt` both promise 12; the server would accept what the UI rejects |
| Required characters | none | **lower + upper + digits** | The 2.1.2 strength meter becomes a liar |
| Manual linking | off | **on** | Screen 2.1.8's `linkIdentity()` is refused outright |
| Confirm email | on | **on** | With it off, `handle_user_email_confirmed()` adopts a pre-created client record for anyone who knows the address |
| Secure email change | on | **on** | 2.1.3 promises both addresses are mailed |

Also set, once, or every deployed function answers browsers with a localhost CORS header
(`functions/_shared/cors.ts` caches it at module load):

```bash
supabase secrets set ALLOWED_ORIGIN=<the production origin> --project-ref <prod-ref>
```

## Critical PCI rules for this directory

1. **Never store PANs in migrations or Edge Function code.** Only Stripe tokens (`PaymentMethod` IDs) and Stripe-returned metadata (brand, last 4, expiration). See `../docs/Data-Model.md` §18.
2. **Every mutating Edge Function calls `_shared/audit.ts`** to write an `audit_event` row. See `../docs/Data-Model.md` §20.3.
3. **MFA step-up is enforced via `_shared/auth.ts`** for PAN reveals, card merges, and Inteletravel CSV imports that touch already-received commissions. See `../docs/Data-Model.md` §18.4.
4. **Stripe secret key never leaves the backend.** Store it in Supabase environment variables (`stripe-secret`), not in client code or git. The web app uses only the publishable key.

## First migration

The initial migration should be generated from `../docs/Data-Model.md`. Claude can transcribe the inline DDL into `migrations/20260514120000_initial.sql`. See `../docs/Tech-Recommendations.md` §5.3 Step 5.
