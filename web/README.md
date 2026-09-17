# `web/` — Next.js app

The browser face of Story-Tail Adventures. Next.js App Router + React + TypeScript +
Tailwind, talking to Supabase directly for reads and to Edge Functions for privileged writes.

Run it from the repo root, not from here — `web` is an npm workspace and the only lockfile is
the root `package-lock.json`:

```bash
npm run dev -w web         # dev server on http://localhost:3000
npm run typecheck -w web
npm run lint -w web
npm run test -w web
npm run build -w web       # production build
```

## Environment

Copy `.env.example` to `.env.local` and fill it in; `supabase status` prints the local values
after `supabase start`. `lib/env.ts` is the only place these are read, and it **fails closed
in production** — a missing `NEXT_PUBLIC_SITE_URL` throws at build time rather than shipping
wrong canonical URLs and email redirects.

Two of them are a trap worth knowing about: no prerendered route reads
`NEXT_PUBLIC_SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_ANON_KEY`, so a build missing them
**succeeds** — and then every request 500s in the proxy. `deploy.yml` asserts their presence
before building for exactly this reason.

Keep it that way. The signed-in chrome on the public pages is the one feature that would have
been natural to build by reading `NEXT_PUBLIC_SUPABASE_URL` in the browser (to derive the
name of Supabase's auth cookie). It deliberately does not — the proxy publishes a flag cookie
of our own instead, and `lib/auth/chrome-flag.ts` records why. A CI build with no Supabase
env still produces byte-identical public HTML to production's.

### `SUPABASE_SERVICE_ROLE_KEY` — a reversal, 2026-09-16

This README used to say the service-role key must never appear anywhere under `web/`, because
it bypasses RLS and Edge Functions receive it automatically. **That rule was deliberately
reversed; the old wording is restated here so nobody reads the change as an oversight.** It was
not a rule we discovered to be wrong — it was one we chose to give up.

Live hotel search (Screen 2.0.4, Hotels mode, P2) moved out of
`supabase/functions/hotel-search` and now runs in-process here. Its four tables —
`hotel_search_cache`, `hotel_api_request`, `hotel_search_rate_bucket`,
`hotel_search_config` — have RLS enabled with **zero policies**, because the caller is an
anonymous visitor and there is no predicate that could express "this stranger may read this
cached search". The Edge Function reached them with the service role the platform injected;
running here, this app must hold that key itself or the feature does not exist.

What it costs, said out loud: **the service role bypasses RLS for the entire schema, not just
those four tables.** Supabase has no key scoped to a subset of tables, so there was nothing
narrower to ask for. An accidental import into a client component, a leaked build log, or a
handler that echoes its own config therefore exposes every row we hold — `client`, `trip`,
`commission`, `payment_card` metadata, `audit_event` — and not merely a cache of hotel
prices. The safeguards that replace the old prohibition are procedural, and all three are
non-negotiable:

- **No `NEXT_PUBLIC_` prefix**, on this or on `SERPAPI_API_KEY` or `HOTEL_SEARCH_IP_PEPPER`.
- **Server-only reads.** Exactly two files read it from the environment: `lib/env.ts`, which
  exposes it as a getter for presence checks, and `lib/hotels/db.ts`, which builds the client
  and is the only consumer of the value itself. `db.ts` opens with `import "server-only"`, so
  importing it from a component that ships to the browser is a build error rather than a
  review question — that guard is the reason the read lives there and not only in `env.ts`.
  Any third reader is a defect.
- **Never in a response body or a log line.** Treat a diff that moves it toward the client as
  a defect rather than a style question.

The reasoning in full is in the header of `lib/env.ts`, alongside `docs/Data-Model.md` §21.2
and `docs/Free-Travel-APIs.md` §10.1.

## Public content gate

`content/public/proof.ts` tracks which marketing claims, testimonials, photos, prices and
legal pages are verified. While any are placeholders, `<PlaceholderBanner/>` renders on every
public page. Setting `PUBLIC_CLAIMS_MODE=strict` turns that into a build failure — it is the
gate for the day the site goes to a real domain, and it is deliberately unset until then.

## Deployment

Not from here, and not from the Vercel dashboard. `.github/workflows/deploy.yml` builds and
deploys this app on merge to `production`, gated on CI. See **Deployment** in the root
`README.md` for the full picture, including which half of a deploy Supabase owns.
