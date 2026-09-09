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

## Cruise sync secrets (P2)

The cruise catalog sync (`functions/cruise-sync`, migrations `20260909001124` and
`20260909001125`) needs one secret to work and two more for the schedule to fire. All three
are set out of band, the same way `ALLOWED_ORIGIN` and the Stripe key are — none of them
belongs in git.

**The API key.** track.cruises relays through RapidAPI; the free BASIC plan is 100
requests/month, and there is no direct subscription (see `../docs/Free-Travel-APIs.md` §4.8).

```bash
supabase secrets set TRACK_CRUISES_API_KEY=<the RapidAPI key> --project-ref <prod-ref>
```

Locally the same value goes in `supabase/.env.local` (gitignored by `.gitignore` here), and
is loaded explicitly:

```bash
supabase functions serve cruise-sync --env-file supabase/.env.local
```

Note the variable name: the raw RapidAPI header is `X-RapidAPI-Key`, which is **not** a valid
environment-variable name — no shell can export it and most dotenv parsers drop it. The
client adds the header itself.

**The schedule.** `public.cruise_sync_tick()` reads its two values from Vault, and returns
NULL with a notice when either is missing — so a fresh local stack schedules a job that
deliberately does nothing rather than spending a metered budget in the background. To arm it
on a real project:

```sql
select vault.create_secret(
  'https://<project-ref>.supabase.co/functions/v1/cruise-sync',
  'cruise_sync_function_url');
select vault.create_secret('<service-role key>', 'cruise_sync_service_role_key');
```

**Order matters, and the first step is not the secrets.** `cruise_sync_tick()`, `pg_cron`,
`pg_net` and `cruise_sync_scope` all arrive with migrations `20260909001124`/`…25`, which
Supabase's GitHub integration applies when **`production` moves** — not when `dev` does. So
until the release reaches `production`, the two statements above have nothing to call and
there is no cron job to arm. In order:

1. `dev` → `production`, and let the integration apply the migrations.
2. `supabase secrets set TRACK_CRUISES_API_KEY=…` (the function 500s without it, by design —
   it distinguishes "nobody configured this" from "the month is spent").
3. The two `vault.create_secret` calls above.
4. Verify, below. Do not wait a week to find out.

**Locally the URL is different, and this is the wrinkle worth knowing.** `pg_net` runs
*inside* the database container, where `127.0.0.1` is the database itself — not the API
gateway. The functions gateway is reachable on the Docker network as `kong:8000`:

```sql
-- LOCAL ONLY. Verified working; hosted projects use the https URL above.
select vault.create_secret(
  'http://kong:8000/functions/v1/cruise-sync', 'cruise_sync_function_url');
select vault.create_secret('<local service-role key from `supabase status`>',
  'cruise_sync_service_role_key');
```

**Verifying the chain without waiting for Monday, and without spending quota.** Fire the
tick by hand exactly as `pg_cron` will. Disable every scope first and the run costs zero
provider requests while still exercising the whole path — tick → `pg_net` → gateway →
function → `cruise_sync_run`:

```sql
update cruise_sync_scope set enabled = false;          -- 0 provider requests
select public.cruise_sync_tick();                      -- returns a pg_net request id
-- ...then, a few seconds later:
select status_code, content from net._http_response order by id desc limit 1;
select trigger, status, scopes_run, requests_spent from cruise_sync_run
 order by started_at desc limit 1;
```

Expect `200`, and a `cruise_sync_run` row whose `trigger` is `cron` — that last detail is
what proves the tick's request body arrived rather than the handler defaulting. A `NULL`
from the tick means Vault is missing a secret; nothing was sent and nothing was spent.
Re-enable the scopes afterwards.

**Do not leave the Vault secrets in a local stack.** With them present, this laptop's cron
spends 4–5 real requests every Monday it happens to be awake, out of 100 for the month.
That is precisely what the no-op-without-secrets behaviour exists to prevent, so removing
them restores it:

```sql
delete from vault.secrets
 where name in ('cruise_sync_function_url', 'cruise_sync_service_role_key');
```

**Optional.** `CRUISE_SYNC_MONTHLY_CEILING` (default 90) caps requests per calendar month,
holding back ~10 of the free tier's 100 for quote-time detail fetches. Raise it with the plan
— PRO is 10,000 — and nothing else in the code needs to change.

Sanity checks, all readable from SQL: `cruise_api_request` is the request ledger (one row per
HTTP attempt, month-to-date is the budget), `cruise_sync_run` is one row per invocation, and
`cruise_sync_scope` is what the sync is allowed to fetch. Widening the sync is an `UPDATE` on
that last table, not a deploy.

## Critical PCI rules for this directory

1. **Never store PANs in migrations or Edge Function code.** Only Stripe tokens (`PaymentMethod` IDs) and Stripe-returned metadata (brand, last 4, expiration). See `../docs/Data-Model.md` §18.
2. **Every mutating Edge Function calls `_shared/audit.ts`** to write an `audit_event` row. See `../docs/Data-Model.md` §20.3.
3. **MFA step-up is enforced via `_shared/auth.ts`** for PAN reveals, card merges, and Inteletravel CSV imports that touch already-received commissions. See `../docs/Data-Model.md` §18.4.
4. **Stripe secret key never leaves the backend.** Store it in Supabase environment variables (`stripe-secret`), not in client code or git. The web app uses only the publishable key.

## First migration

The initial migration should be generated from `../docs/Data-Model.md`. Claude can transcribe the inline DDL into `migrations/20260514120000_initial.sql`. See `../docs/Tech-Recommendations.md` §5.3 Step 5.

## Hotel search secrets (P2)

`hotel-search` needs three values, and it fails closed without the first two — a missing
credential returns 403 rather than silently searching nothing.

```bash
supabase secrets set SERPAPI_API_KEY=<the SerpApi key>            --project-ref <prod-ref>
supabase secrets set HOTEL_SEARCH_CALLER_TOKEN=<a long random string> --project-ref <prod-ref>
supabase secrets set HOTEL_SEARCH_IP_PEPPER=<a long random string>    --project-ref <prod-ref>
```

**`HOTEL_SEARCH_CALLER_TOKEN` is half of a pair.** The same value goes into Vercel as
`STA_HOTEL_SEARCH_TOKEN` — deliberately *without* a `NEXT_PUBLIC_` prefix, because that
prefix is what would inline it into the browser bundle. It exists because the Supabase anon
key authenticates nobody: it is already public. Rotate both together or the hotels mode
goes quiet (and falls back to the curated catalog, which is the intended failure).

**`HOTEL_SEARCH_IP_PEPPER`** salts the rate limiter's visitor-IP hashes. Rotating it resets
every live counter, which is harmless. Losing it is also harmless — nothing is recovered
from those hashes by design, and a CHECK constraint refuses a bucket key that is not one.

Locally, put all three in `supabase/.env.local` (gitignored) and pass it explicitly:

```bash
supabase functions serve hotel-search --env-file supabase/.env.local
```

### The budget is a table, not a constant

Ceilings, the cache TTL and the rate limits live in `hotel_search_config`, one row. The
defaults are the free tier's, held below the plan limits (200 of 250 a month, 40 of 50 an
hour) so the inquiry step that follows this one — which needs a property-details fetch of
its own — does not find the tank empty. Widening after a plan upgrade is an `UPDATE`:

```sql
UPDATE public.hotel_search_config
   SET monthly_ceiling = 800, hourly_ceiling = 160
 WHERE id;
```

Turning it off entirely is `SET enabled = false`, or unsetting `STA_HOTEL_SEARCH_TOKEN` in
Vercel. Either way the page falls back to Gyasi's curated catalog.

### Watching the spend

```sql
-- This month, and what the provider last told us. Ours over-counts (their cache is free
-- and we cannot see it), which is the safe direction.
SELECT count(*) FILTER (WHERE endpoint = 'search') AS spent_this_month,
       max(quota_remaining)                        AS provider_says_left
  FROM public.hotel_api_request
 WHERE created_at >= date_trunc('month', now());

-- Cache hit rate is the number that decides whether the free tier survives.
SELECT count(*) AS cached_searches FROM public.hotel_search_cache WHERE expires_at > now();
```
