# `supabase/` — Database + Edge Functions

The Supabase project that hosts the application's database, auth, storage, real-time, and backend logic (via Edge Functions). This is the entire backend — there is no separate Ktor service. See `../docs/Tech-Recommendations.md` §3.3.

## Status

**Migration written, CLI not yet run.** `migrations/20260514120000_initial.sql` creates all 34 Phase 1
tables and 21 enums, but `supabase init` has not been run — there is no `config.toml` and the migration
has never been applied. `functions/_shared/` is empty.

Two things to know before the first apply:

- **RLS is enabled on all 34 tables with zero policies.** Everything is service-role-only until the RLS
  migration lands. That is safe by default, but it also means CLAUDE.md rule 4 (Stripe `PaymentMethod` IDs
  are server-only) is currently enforced by convention rather than by the database.
- **`account` has no link to `auth.users`.** A user can authenticate and the app can then read nothing
  about them. The `auth_bridge` migration adds the FK, the `handle_new_user` trigger, and three self-read
  policies.

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
├── migrations/              # SQL migrations applied via `supabase db push`
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
supabase db push

# Apply to linked production project
supabase db push --linked

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

## Critical PCI rules for this directory

1. **Never store PANs in migrations or Edge Function code.** Only Stripe tokens (`PaymentMethod` IDs) and Stripe-returned metadata (brand, last 4, expiration). See `../docs/Data-Model.md` §18.
2. **Every mutating Edge Function calls `_shared/audit.ts`** to write an `audit_event` row. See `../docs/Data-Model.md` §20.3.
3. **MFA step-up is enforced via `_shared/auth.ts`** for PAN reveals, card merges, and Inteletravel CSV imports that touch already-received commissions. See `../docs/Data-Model.md` §18.4.
4. **Stripe secret key never leaves the backend.** Store it in Supabase environment variables (`stripe-secret`), not in client code or git. The web app uses only the publishable key.

## First migration

The initial migration should be generated from `../docs/Data-Model.md`. Claude can transcribe the inline DDL into `migrations/20260514120000_initial.sql`. See `../docs/Tech-Recommendations.md` §5.3 Step 5.
