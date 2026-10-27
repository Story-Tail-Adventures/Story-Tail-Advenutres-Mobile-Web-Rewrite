# Moving web hosting from Vercel to Render

Status: **planned, not started.** Decided 2026-10-27 after the Vercel account was paused.

This covers `web/` only. Supabase (database, auth, storage, Edge Functions) does not move, and
neither does anything under `mobile/`. Where this contradicts `docs/Tech-Recommendations.md`,
that document wins until this one is executed and it is updated (see "Docs to update").

---

## 1. Why

Two separate reasons, and only the first is about money.

**The account was paused on 2026-10-26** for exceeding three Hobby limits at once: Fast Origin
Transfer 30.1 GB against 10, Fluid Active CPU 9h44m against 4, Function Invocations 1.4M
against 1M. The cause was diagnosed and fixed in PR #168 (the proxy ran on every path, billing
a second invocation per request and keeping prerendered pages off the CDN, and it called
Supabase on every anonymous request). That fix is necessary regardless of host.

**Vercel's Hobby plan is restricted to personal, non-commercial use.** This is the CRM for a
travel advisory business. Fixing the usage leaves the app on a plan whose terms it does not
meet, and the next enforcement would not roll off after 30 days the way a usage pause does.
Vercel Pro is $20/month plus usage billing, which is above the agreed ceiling and keeps the
property that a traffic spike becomes a bill.

Render is a flat instance fee with metered bandwidth on top. A crawler there is a performance
question and a small bandwidth line, not a pause.

---

## 2. What it costs

| Item | Cost |
|---|---|
| Hobby workspace | $0 |
| One Starter web service (512 MB, 0.5 CPU, always on) | $7/month |
| Bandwidth included on a Hobby workspace | 5 GB/month |
| Bandwidth over that | $0.15/GB |

At the traffic seen in the 30 days to 2026-10-26 (about 20 GB of data transfer), that is
roughly **$7 + $2.25 = $9.25/month**. Not the "flat $7" first estimated: Render meters
bandwidth, it just charges a modest overage instead of stopping the site.

Putting Cloudflare's free tier in front changes this materially, because Cloudflare serves
cached bytes and Render never bills them. It is recommended below for that reason as much as
for bot filtering.

**Verify these numbers on render.com/pricing before committing.** They come from secondary
sources; Render's own pricing page is JavaScript-rendered and could not be read directly.

---

## 3. What ports with no work

Worth stating, because it is most of the app:

- `web/package.json` already has `build` (`next build`) and `start` (`next start`). A Render
  Node web service runs those directly.
- **Images need nothing.** `next.config.ts` uses a custom loader (`lib/image-loader.ts`) so
  Unsplash's CDN does the resizing and `/_next/image` is never used. No `sharp`, no image
  optimization service, no `remotePatterns`.
- The proxy (`web/proxy.ts`) runs in the Node runtime under `next start`. It works unchanged,
  and the per-invocation billing that caused the pause simply stops existing.
- ISR on the four pages with `revalidate = 3600` works on a single instance. The cache is
  per-instance and resets on deploy, which for four hourly pages is not worth engineering
  around.
- All 184 test files and the CI jobs are host-independent.

---

## 4. What has to change

### 4.1 Drop Vercel Analytics

`@vercel/analytics` is the only Vercel package in `web/package.json`. It appears in:

- `web/components/VercelAnalytics.tsx`
- `web/lib/analytics.ts` (imports the `BeforeSendEvent` type)
- `web/app/layout.tsx` (imports and renders `<VercelAnalytics />`)
- `web/lib/analytics.test.ts`

The `/_vercel/insights/*` endpoints exist only on Vercel, so off-platform it is dead weight
that 404s. Remove it. GA through Firebase (`web/components/FirebaseAnalytics.tsx`, PR #131)
already covers the need.

**This is not only a code change.** Three privacy statements are bound to `lib/analytics.ts`,
and the policies name Vercel as a processor:

- `web/content/public/legal/privacy.ts`
- `web/content/public/legal/cookies.ts`
- `web/app/(client)/account/privacy/content.ts`

Those strings feed `mobile/shared/.../GeneratedPublicContent.kt` through
`npm run generate:public-content -w web`, so the mobile copy has to be regenerated in the same
change or the two stacks disagree.

### 4.2 Replace the deploy workflow

`.github/workflows/deploy.yml` has a `vercel` job that uses the pinned Vercel CLI
(`VERCEL_CLI_VERSION: "59.11.7"`) and the single `VERCEL_TOKEN` secret, builds the monorepo,
deploys, aliases, and then cuts a release and tag.

Render deploys from GitHub on push, so the deploy half goes away. **The release-cutting half
stays** and still needs a trigger. Keep the workflow, delete the `vercel` job, and have the
release step run after Render reports a successful deploy (Render exposes a deploy hook and a
status API; simplest is to key the release off the push to `production` and accept that it
records intent rather than confirmation).

`SITE_ORIGIN` in that workflow is described in it as "the one origin the whole deploy is
measured against". It changes with the address (4.4).

### 4.3 Move the environment variables

Eleven are read at runtime (`web/lib/env.ts`):

```
NEXT_PUBLIC_SITE_URL           NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY  NEXT_PUBLIC_INQUIRY_EMAIL
NEXT_PUBLIC_AUTH_GOOGLE_ENABLED NEXT_PUBLIC_AUTH_APPLE_ENABLED
HOTEL_SEARCH_ENABLED           SERPAPI_API_KEY
STA_HOTEL_SEARCH_TOKEN         STA_LEAD_FORM_KEY
NODE_ENV
```

`NEXT_PUBLIC_*` are inlined at build time, so they must be set on Render **before the first
build**, not after. Set Node to 22 to match `deploy.yml`.

### 4.4 Change the app's address

`NEXT_PUBLIC_SITE_URL` moves off `storytailadventures.vercel.app`. Everything downstream of it:

- Canonical URLs and the sitemap (`web/app/seo.ts` derives both from `env.siteUrl`)
- **Supabase auth redirect allowlist.** Miss this and sign-in breaks on cutover. It is the
  single most likely thing to go wrong.
- `EMAIL_SITE_URL` for the Edge Functions (`supabase/functions/_shared/email.ts` validates it)
- `SITE_ORIGIN` in `deploy.yml`
- The error-message examples in `web/lib/env.ts` and `supabase/functions/_shared/email.ts`
  (cosmetic, but they tell the next person the wrong thing)

Decide between `<name>.onrender.com` and a real domain before starting. A real domain is
better anyway: it makes the host swappable next time, and it stops the app's address being
tied to a vendor.

---

## 5. Three traps

### 5.1 `x-forwarded-for` is spoofable on a different proxy

**The important one.** Two places take the left-most `x-forwarded-for` entry and trust it
because, as both comments say, Vercel sets that from the real connection and replaces anything
the browser sent:

- `web/lib/supabase/server.ts` (`callerHeaders`) sends it to GoTrue so sign-in activity shows
  the traveler's address and not the server's. Informational.
- `web/lib/public/leadMessage.ts` (`visitorAddressFrom`) forwards it to the lead Edge Function
  as `x-sta-client-ip`. **This one decides access.**

`supabase/functions/_shared/lead.ts` (`clientAddress`) only trusts that forwarded address when
the caller also presents the shared `STA_LEAD_FORM_KEY`, which is good design: an outsider
cannot forge it. But the web server holds that key, so if Render's left-most entry is
attacker-controlled, the web server forwards a spoofed address *with a valid key* and the
per-address rate limit on the public lead form can be bypassed by rotating fake IPs.

Most reverse proxies **append** to `x-forwarded-for` rather than replacing it. If Render
appends, `X-Forwarded-For: 1.2.3.4` sent by a client yields `1.2.3.4, <real ip>` and the
left-most entry is the attacker's.

**Before cutover, test this directly**: send a request to the deployed app with a forged
`X-Forwarded-For` header and see what the app reads. If it is spoofable, take the right-most
entry rather than the left-most, or switch to `cf-connecting-ip`. `clientAddress` already
prefers `cf-connecting-ip`, so putting Cloudflare in front and forwarding that header is the
tidiest fix and needs no new trust rules.

### 5.2 No WAF on Render

Render has no firewall or bot management. The crawler traffic that caused the pause will
follow the domain, not the host. PR #168 makes each bot request far cheaper, but it does not
stop them, and on Render they still consume metered bandwidth.

**Put Cloudflare's free tier in front.** It gives bot filtering, caching that cuts Render's
billed bandwidth, and `cf-connecting-ip` for 5.1. This is the single highest-value addition in
this plan and it costs nothing.

### 5.3 512 MB is not much

Starter is 512 MB and 0.5 CPU. A Next 16 + MUI SSR process idles somewhere around 150 to 250
MB, so it should fit at this traffic, but it is not generous. Watch memory for the first week.
The next instance up is a real cost jump, which is another argument for Cloudflare absorbing
as much traffic as possible.

---

## 6. Cutover sequence

Nothing here is irreversible until step 8.

1. Merge PR #168 first. It is host-independent and it reduces load wherever the app runs.
2. Decide the address (4.4). Register or point the domain.
3. Create the Render service against a branch, not `production`. Set all eleven env vars and
   Node 22. Do not point any domain at it yet.
4. Verify on the `.onrender.com` URL: public pages render, sign-in works end to end, the lead
   form works, hotel and cruise search work, and the memory graph is flat.
5. **Run the 5.1 forged-header test.** Fix it before any real traffic arrives.
6. Add Cloudflare in front, still pointing at the Render test URL. Confirm `cf-connecting-ip`
   arrives and caching is working.
7. Add the new origin to Supabase's auth redirect allowlist, **alongside** the Vercel one so
   both work during the overlap.
8. Cut DNS over. Keep the Vercel project alive but unaliased for a week.
9. Remove `@vercel/analytics` (4.1), update the policies, regenerate the mobile content, and
   delete the `vercel` job from `deploy.yml`.
10. After a week of clean operation, delete the Vercel project and remove `VERCEL_TOKEN` from
    GitHub secrets.

**Rollback at any point before step 10** is pointing DNS back at Vercel, provided the Vercel
project is still aliased and the account is unpaused. Which it is not today: see section 8.

---

## 7. What we give up

- **Per-PR preview deployments.** Render's preview environments require their Pro workspace at
  $25/month, which is the figure this move exists to avoid. Accepted by Gyasi 2026-10-27.
  Mitigation: a second free Render service tracking `dev` as a staging box. It spins down after
  15 minutes idle, which is fine for review, and costs nothing. Local `next start` covers the
  rest, and it is what was used to verify PR #168.
- **Vercel Web Analytics** (PR #108). GA through Firebase remains.
- **Vercel's edge network.** Render serves from one region. Pick the region closest to the
  Supabase project, and let Cloudflare do the edge caching.

---

## 8. Still open

- **Unpausing Vercel.** Hobby does not auto-resume. The rolling 30-day usage has to fall under
  the limits (the 2026-10-17 spike leaves the window around 2026-11-16) and then it takes a
  manual request at vercel.com/help. **Until that happens there is no rollback target**, which
  is an argument for not rushing the cutover.
- **The address.** `.onrender.com` or a real domain. Not decided.
- **Blocking AI crawlers** (GPTBot, ClaudeBot and the rest) in `robots.txt`. Cuts real load,
  costs presence in AI search. Gyasi's call, and it applies on any host.
- **Confirming Render's prices** against render.com/pricing (section 2).

---

## 9. Docs to update when this is executed

`docs/Tech-Recommendations.md` governs stack choices and currently says Vercel in four places:

- line ~591: `deploy.yml` deploys to Vercel via the Vercel CLI
- line ~630: the "Web hosting | Vercel | Native Next.js home" row
- line ~640: the MVP run-rate estimate, which assumes the Vercel free tier
- line ~659: "App address", which names the `vercel.app` alias

Per `CLAUDE.md`'s document hierarchy, update that document as part of the change rather than
after it.
