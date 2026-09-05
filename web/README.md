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

`SUPABASE_SERVICE_ROLE_KEY` must never appear anywhere under `web/`. It bypasses RLS and
belongs only to Edge Functions, which receive it automatically.

## Public content gate

`content/public/proof.ts` tracks which marketing claims, testimonials, photos, prices and
legal pages are verified. While any are placeholders, `<PlaceholderBanner/>` renders on every
public page. Setting `PUBLIC_CLAIMS_MODE=strict` turns that into a build failure — it is the
gate for the day the site goes to a real domain, and it is deliberately unset until then.

## Deployment

Not from here, and not from the Vercel dashboard. `.github/workflows/deploy.yml` builds and
deploys this app on merge to `production`, gated on CI. See **Deployment** in the root
`README.md` for the full picture, including which half of a deploy Supabase owns.
