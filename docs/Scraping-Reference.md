# Scraping Cruise and Deal Data — Reference

**Status:** reference notes only. Nothing built, nothing decided.
**Captured:** 2026-09-26.
**Why it exists:** Gyasi proposed scraping CruiseCritic because cruise search isn't
working, and later scraping deals off his personalized InteleTravel site. Three routes were
considered in turn: a hand-written Playwright scraper (§5), Apify's CruiseMapper actor (§7),
and importing the Travel Leaders Network departures file he already receives (§8). This
records all three, what is wrong with each, what the source sites actually permit, and what
the project's own documents already say about it.

**Where it landed: §8.** The TLN file is supplied rather than crawled, carries no price
column at all, and covers the one line track.cruises misses. It clears every objection the
other two routes raised.

> **Read §1 before anything else.** The stated reason for scraping was that cruise
> search is broken. It was diagnosed on 2026-09-26 and the backend is fine: the Edge
> Function returns HTTP 200 with all 4 sailings. One environment variable is missing
> from one `web/.env.local`, and the read path is written to fail silently. That does
> not settle whether to scrape, but the reason for scraping has gone away.

---

## 1. Cruise search is broken by one missing env var (diagnosed 2026-09-26)

**Not a data-source problem. The backend is healthy.** Proven end to end below.

### What was measured

| Check | Result |
|---|---|
| `cruise-search` with a valid token | **HTTP 200, 4 sailings returned** |
| `cruise_sailing` rows, unarchived, departing >= today | **4** (Bahamas 10-27, E. Caribbean 11-13, W. Caribbean 11-27, S. Caribbean 12-30) |
| `HOTEL_SEARCH_CALLER_TOKEN` in the running edge runtime | **Set.** A tokenless call answers 401 "This endpoint is not called directly", not 403 "…is not set" |
| `STA_HOTEL_SEARCH_TOKEN` in the `web/.env.local` serving :3000 | **Key absent entirely** |
| Same key in any other `web/.env.local`, including the main checkout | **Absent everywhere** |

### The cause

`HOTEL_SEARCH_CALLER_TOKEN` is half of a pair. The web side presents the same value as
`STA_HOTEL_SEARCH_TOKEN`. The server half exists; **the client half was never written into
any `web/.env.local`.**

So `web/lib/public/cruises.ts` short-circuits before it ever makes a request:

```ts
const token = env.hotelSearchToken;            // undefined
if (!token || !env.supabaseConfigured) {
  console.warn("[cruises] search skipped — not configured", {
    callerToken: token ? "set" : "MISSING (STA_HOTEL_SEARCH_TOKEN)", ...
  });
  return { status: "unavailable" };            // no network call at all
}
```

That function is documented to **never throw**: "a read failure on a public marketing page
is a quiet fallback to the curated catalog, not an error boundary." So there is no error in
the UI, no failed request in the network tab, and no server log unless you are watching
stdout for `[cruises] search skipped`. It presents as a dead data source. It is a missing
line in a dotfile.

**One token gates both modes**, so hotel search is failing the same way for the same reason.

### Which tree is which

The dev server on :3000 runs from the `section-3-3-4262f9` worktree, whose `web/.env.local`
is 754 bytes against the main checkout's 2457 and is missing several keys. The Supabase
stack was started from one of three older worktrees (`hotel-serpapi-client`,
`next-design-step-5a695a`, `user-initials-logged-in-833a8b`) whose `supabase/.env.local`
files all carry the **same** token value, verified identical by hash and all three returning
HTTP 200.

This is the per-worktree env drift already recorded in memory as
*local-stack-serves-one-worktree*: the edge runtime mounts whichever tree started it, and
`.env.local` does not travel between trees.

### The fix — applied and verified 2026-09-26

Append the server-side value to the serving worktree's web env under its client-side name:

```bash
cd "$HOME/Documents/Claude/Projects/Story-Tail Adventures Mobile/Web Rewrite/.claude/worktrees"
grep '^HOTEL_SEARCH_CALLER_TOKEN=' hotel-serpapi-client/supabase/.env.local \
  | sed 's/^HOTEL_SEARCH_CALLER_TOKEN=/STA_HOTEL_SEARCH_TOKEN=/' \
  >> section-3-3-4262f9/web/.env.local
```

**Result: `/explore/results?mode=cruises` now renders all four sailings** with line, ship,
sail date and ports of call. No dev-server restart was needed: the Next process kept the
same PID across the change (started 07:28, env written 08:06) because `env.hotelSearchToken`
is a getter reading `process.env` per call and Next reloads `.env.local` in place.

**One trap on the way: the first reload still showed the fallback.** The bare
`?mode=cruises` URL served a cached render of the failed state, so the fix looked like it
had not worked. Adding any novel query param (`&destination=bahamas`) forced a fresh render
and the sailings appeared immediately; the bare URL then recovered on its own. **When
verifying an env fix on this route, bust the cache before concluding anything.**

### Two things worth fixing properly afterwards

1. **`web/.env.example` lists `STA_HOTEL_SEARCH_TOKEN=` with no value and no note** that it
   must equal `HOTEL_SEARCH_CALLER_TOKEN`. Anyone setting up a worktree from the example
   gets a silently broken search. The example should say what the value pairs with.
2. **The quiet fallback hides a config error indistinguishably from a provider outage.** It
   is the right behaviour for a visitor and the wrong behaviour for a developer. A
   dev-only banner, or a startup assertion when `NODE_ENV !== "production"`, would have
   turned this into a five-second diagnosis instead of a scraper proposal.

### Note on `cruise_port`

`cruise_port` has 0 rows while `cruise_port_call` has 17. That did not affect this failure,
since `searchSailings` reads `destinations` off the sailing and does not join ports. But an
itinerary line built from port names would come back empty, and `cruise_sync_run` has 0 rows
so the sync has genuinely never run. Worth a look separately from this bug.

---

## 2. The project already ruled on scraping, in writing

`docs/Free-Travel-APIs.md` §4.6 is titled **"Scraping — don't"**. Quoted in full because
it names this exact case:

> "Several marketplaces sell scrapers for CruiseMapper, Royal Caribbean, and similar
> sites. `BRD.md` §9.3 mentions 'scraped cruise data' as an MVP display option.
>
> **Recommendation: do not build on scraped cruise data.** It breaks the source sites'
> terms of service, it exposes a commission-based business to a takedown or a
> relationship problem with the exact cruise lines it depends on, it has no availability
> or freshness guarantee, and it puts the platform's public SEO surface on top of content
> it has no right to publish. The reputational downside for a small advisory business
> dwarfs the data-acquisition saving.
>
> If `BRD.md` §9.3's mention of scraping is meant to stay as a live option, it should be
> revisited and struck."

Per `CLAUDE.md`'s document hierarchy, the BRD outranks this research doc, and BRD §9.3
does still list scraped cruise data. So the two are in tension and §4.6 itself flags
that. **This is Gyasi's call to make, not a rule blocking him.** But reversing §4.6
should be a deliberate edit to the doc, not something that happens by a scraper quietly
appearing in the tree.

### The §1.0 problem is separate and bigger

The saved template's whole purpose is extracting **prices**. `Free-Travel-APIs.md` §1.0
fixes the public surface scope, confirmed by Gyasi:

| | What the source must supply | What it must *not* supply |
|---|---|---|
| **Cruises** | Cruise line, ship, itinerary (ports and sailing dates). Price **optional**. | No cabin availability. No booking. |

And §4.7 item 6, on cruise price specifically:

> "**Recommendation: launch without it.** Revisit once compliance has ruled on §9.2 and
> there is a refresh cadence that keeps a displayed fare honest."

So a scraper built to harvest cruise **fares** is aimed at the one field the product
decided it does not need, and the one that carries the §9.2 compliance question. A
scraper aimed at **itineraries and port calls** would at least be pointed at something
§1.0 actually wants.

---

## 3. What CruiseCritic's robots.txt actually says

Fetched 2026-09-26 from `https://www.cruisecritic.com/robots.txt` (HTTP 200). This is
what the file says, not a judgment about it.

### AI crawlers are blocked sitewide

A named block lists `GPTBot`, **`ClaudeBot`**, `Google-Extended`,
`Google-CloudVertexBot`, `meta-externalagent`, `Amazonbot`, `Cohere-ai`, `CCBot`,
`Bytespider`, `PetalBot`, `PanguBot`, `Img2dataset`, `magpie-crawler` and
`Applebot-Extended`, each with `Disallow: /`.

A Playwright script is not any of those user agents. But the section states the site's
position on automated collection plainly.

### The paths a cruise-search scraper would want are disallowed for everyone

Under `User-agent: *`:

| Path | Relevance |
|---|---|
| `Disallow: /search` | **The search endpoint.** This is the path a search-driven scraper hits first. |
| `Disallow: /smart-deals` | **Deals.** Directly relevant to the "scrape deals" goal. |
| `Disallow: /sail-away` | Another deals-shaped surface. |
| `Disallow: /find-a-cruise/itinerary/*?*recId=*` | Parameterized itinerary URLs. The comment explains: `recId` is a per-impression hash and these are duplicates of the canonical slug URL. |
| `Disallow: /feeds`, `/apps`, `/helpers/`, `/redirect/*`, `/v-*/*` | Infrastructure paths. |

### What is not disallowed

Canonical itinerary pages at `/find-a-cruise/itinerary/<slug>` (without `recId`) are not
excluded, and the file publishes a sitemap at
`https://www.cruisecritic.com/sitemaps/index.xml`.

**So robots.txt draws a line that happens to track §1.0 exactly.** Search results and
deals pages: disallowed. Canonical itinerary content, reachable from a published
sitemap: not disallowed. The half of the data the product actually needs is the half the
file leaves open.

Two things that does *not* mean:

- robots.txt is not the Terms of Service. A path being crawlable in robots.txt says
  nothing about whether the ToS permits republishing what is on it. §4.6's objection was
  about ToS and about publishing content "it has no right to publish," and a sitemap
  does not answer that.
- CruiseCritic is owned by the same group as a set of OTAs. §4.5 already ruled out
  sending cruise clients to competing OTAs under InteleTravel §1.3.5. Building the public
  cruise surface on a competitor's content is a related question worth thinking through.

---

## 4. Scraping the personalized InteleTravel site is a different risk

This is the part to be most careful about, and it is not a robots.txt question.

`Free-Travel-APIs.md` §1.3.4 quotes the InteleTravel Training Manual, eighth edition:

> "Advisors must always pay the gross rate, or the rate including InteleTravel's full
> commission… **Net Rates are strictly prohibited in your written InteleTravel
> Independent Contractor Agreement.** If you accept one, even by accident, InteleTravel
> will hold you responsible for the missing commission… it could result in **termination
> as an Advisor**." — §5, Beware "Net" Rates

The advisor-facing side of an InteleTravel property is exactly where advisor-only pricing
lives. A scraper pointed at it cannot tell a gross consumer rate from a net advisor rate,
because the distinction is contractual, not structural in the HTML. Publishing the wrong
one on a public page is the failure mode with **termination** named as a consequence.

Two further constraints from the same section:

- **§1.3.1** — `adventures.story-tail.com` is marketing material requiring InteleTravel
  compliance approval **before launch**. Republished deal content is marketing material.
- **§1.3.5** — "Website content must ONLY be InteleTravel content and no other content
  mentioned." Cuts both ways: it argues *for* InteleTravel-sourced deals over
  CruiseCritic, and *against* publishing anything scraped from a third party.

**There may be a legitimate version of this.** Scraping your own advisor portal for your
own internal use (a worklist of current promotions the advisor reads, never published) is
a materially different act from republishing it on a public page. The first is automating
your own access to your own account. The second engages §1.3.4 and §1.3.1 directly.
Worth separating those two before building either.

Whatever the intent, the honest step is to ask InteleTravel compliance in writing.
`Free-Travel-APIs.md` §9 already tracks open compliance questions, and this belongs there
rather than in a code comment.

---

## 5. The saved template, reviewed

The pasted template is a reasonable generic Playwright sketch. As written it will not
run, and the architecture does not fit this project. Kept here so the useful parts are
not lost.

### Defects that stop it running

| # | Issue | Detail |
|---|---|---|
| 1 | **Template literals lost their backticks** | `const targetUrl = https://…/search?dest=${destination}…` and `alert(Error fetching data: ${response.error})` are syntax errors. Likely a paste artifact, but it means nothing in the snippet has been executed. |
| 2 | **`npm install playwright` does not install browsers** | Needs `npx playwright install chromium`, and `--with-deps` on Linux. |
| 3 | **The client component renders nothing** | The `return ( );` is empty. `loading` is set and never read. |
| 4 | **Selectors are invented** | `.cruise-card`, `.price-value`, `.itinerary-stops li` are placeholders, as the template admits. The target URL is a dummy domain. |

### Defects that matter more than the syntax

| # | Issue | Why it matters here |
|---|---|---|
| 5 | **Playwright does not run on Vercel serverless** | The template blames a "10 second" timeout. That is not the blocker and the number is stale. The real blocker is that the `playwright` package bundles a Chromium of roughly 300MB, far past the function size limit. Real options are `playwright-core` + `@sparticuz/chromium`, or an external browser service. **Web deploys to Vercel**, so this is decisive, not academic. |
| 6 | **A Server Action is a public unauthenticated endpoint** | Anything on the internet can POST to it with arbitrary arguments. Here that means anyone can make our server launch a headless browser on demand. Seconds of CPU and hundreds of MB of RAM per call, with no auth, no rate limit, and no cache. That is a self-inflicted DoS vector and the fastest possible route to an IP ban from the target. |
| 7 | **`destination` and `duration` go into a URL unvalidated** | Interpolating unvalidated caller input into a URL a headless browser then visits is SSRF-shaped. Needs an allowlist of destinations, not free text. |
| 8 | **Per-request proxy, when the project decided on scheduled sync** | `Free-Travel-APIs.md` §10.1 is explicit that content is static and gets synced into Postgres on a schedule, "not proxied," and calls it "the single most important architectural consequence." This template is the rejected pattern. It also means every visitor search costs a fresh scrape. |
| 9 | **Price parsing is wrong** | `parseInt(priceText.replace(/[^0-9]/g, ''), 10)` turns `"$1,299.50"` into `129950`. It also strips the currency symbol and keeps no currency code. `CLAUDE.md` rule 5: all money is `bigint` cents plus `char(3)` currency. No `captured_at`, no provenance either, so a stale fare is indistinguishable from a fresh one. |
| 10 | **`waitUntil: 'networkidle'`** | Playwright's own docs discourage it as flaky. Prefer waiting on a locator. |
| 11 | **The auto-scroll loop has no guard** | `totalHeight >= scrollHeight` re-reads a `scrollHeight` that grows as content lazy-loads, and there is no iteration cap or timeout on the `evaluate`. On an infinite-scroll page it can spin. |
| 12 | **Spoofed Chrome user agent** | Presenting as a desktop Chrome user is the "look like a human" posture. It weakens any good-faith argument later and is the opposite of an identifying UA with contact details. |
| 13 | **No robots.txt handling, no backoff, no politeness delay** | Per §3, `/search` is disallowed for all agents. A scraper aimed there is ignoring the file by construction. |
| 14 | **Stack boundary** | Playwright cannot run in a Supabase Edge Function (Deno, no Chromium). So this lands in `web/` on a non-Vercel runtime, or in a new worker service. `CLAUDE.md` says not to introduce a separate backend service without discussing it first. That discussion has not happened. |

### What the template gets right

Worth keeping if this is ever built: `try/finally` with `browser.close()` so the process
is always reaped; a single `page.evaluate` that returns plain data rather than passing
handles across the boundary; optional-chaining defaults so one missing node does not
throw the whole extraction; and returning a `{ success, data | error }` shape rather than
throwing across the server boundary.

---

## 6. If scraping happens anyway, what a defensible version looks like

Gyasi owns this call. If the answer is yes, these are the changes that would make it
survive review rather than become a liability.

1. **Strike or amend §4.6 first.** Make the reversal explicit in the doc, with the
   reasoning. `CLAUDE.md`: update the doc before writing code that contradicts it.
2. **Target itineraries, not fares and not `/search`.** Crawl canonical
   `/find-a-cruise/itinerary/<slug>` pages discovered through the published sitemap.
   That stays inside robots.txt and inside §1.0. Dropping price also drops §9.2.
3. **Scheduled sync into Postgres, never per request.** A cron writing to the existing
   `cruise_catalog` tables, with the same swappable-source schema §4.7 item 2 already
   calls for. The public read path stays `cruise-search` against our own database.
4. **Run it where a browser can run.** Not a Vercel serverless function. Either
   `playwright-core` + `@sparticuz/chromium`, or a hosted browser (Browserbase appears in
   the Stripe Projects catalog noted in `Stripe-Projects-Reference.md`), or a small
   worker. Whichever it is, it is a new service and needs the `CLAUDE.md` conversation.
5. **Be identifiable and slow.** A real user agent naming the business with a contact
   URL, one request every few seconds, conditional requests, and hard stop on 403 or 429.
   No stealth plugins.
6. **Respect robots.txt in code, not by intention.** Parse it and honor it per fetch, so
   a future path addition is picked up automatically.
7. **Record provenance on every row.** Source URL, fetch timestamp, and the parser
   version. Without it there is no way to answer "where did this claim come from," which
   is the same discipline `web/content/public/proof.ts` already applies to unverified
   claims.
8. **Keep it off the public SEO surface until compliance rules.** §1.3.1 gates the whole
   site anyway, and §4.6's sharpest objection was publishing third-party content on our
   own indexable pages.

### The cheaper alternatives, for comparison

§4.7 already lays out a plan that needs no scraper: request a **Widgety** test key (free,
by email, and their product *is* the §1.0 requirement), keep the **track.cruises** BASIC
feed already wired up here, hand-curate the 30 to 50 ships Story-Tail actually sells
(§4.1 calls this "a realistic afternoon's data entry per line"), and fill ports and ship
reference data from **Wikidata** open data (§8). §4.7 item 3 argues the curated set
converts better than a feed dump regardless.

The track.cruises terms are also already checked and permissive for our use: §4.4 of
their terms permits caching and derivative use to "power end-user products (travel agency
tools, comparison sites, internal analytics)," forbidding only bulk redistribution of raw
responses. **That is a licensed version of what the scraper would be doing unlicensed.**
Its real limit is coverage, not permission: nine lines, and Virgin Voyages absent.

---

## 7. The Apify route — CruiseMapper actor (reviewed 2026-09-26)

Gyasi proposed using "the free version of Apify" with
`louisdeconinck/cruisemapper-cruise-scraper` as an alternative to hand-writing a scraper.

**Verdict in one line: Apify solves every engineering problem in §5 and none of the legal
ones in §2–§4, and it makes one of them harder to see.**

### The actor

| Field | Value |
|---|---|
| ID | `louisdeconinck/cruisemapper-cruise-scraper` |
| Developer | Louis Deconinck, **Maintained by Community** (not by Apify) |
| Pricing | **$2.00 per 1,000 results**, pay-per-event. "You only pay for the data collected, not platform usage." |
| Total users | 153 |
| **Monthly active users** | **0** |
| **Last modified** | **7 months ago** |
| Rating | 5.0, from **2** reviews. 4 bookmarks. |
| Input | `startUrls` — optional array of `https://www.cruisemapper.com/cruise-search` URLs. Omit it and the actor scrapes all listings. |
| Output fields | `date`, `cruiseLine`, `shipName`, `itinerary`, `price`, `cruiseType`, `isFlyCruise` |
| Access | REST API, JS client (`apify-client`), Python client, CLI, MCP server |

### What "free" actually means

Apify's Free plan: **$5/month of platform credit, no credit card required.** Credits do not
roll over and expire at the end of the cycle. When they run out, "your access to Apify's
services will be blocked until the beginning of the next monthly cycle." Five concurrent
runs. Paid tiers are Starter $19/mo, Scale $199/mo, Business $999/mo.

**So the free tier is $5 ÷ $2 per 1,000 = 2,500 results per month.**

That is a genuinely good number, and better than the alternative already wired up here:
track.cruises BASIC allows 100 requests a month at 10 rows each, so **1,000 rows a month**.
Apify free is **2.5× the row ceiling** for $0. On quota alone, Gyasi's instinct is right.

### robots.txt looks permissive, and that is the trap

CruiseMapper's `robots.txt` is nearly wide open, the opposite of CruiseCritic's:

```
User-agent: *
Disallow: /admin/
Sitemap: http://www.cruisemapper.com/sitemap.xml
```

No AI-crawler block, no `/search` exclusion, nothing about deals. Read on its own, it looks
like an invitation.

**Their Terms of Use say the opposite, in as many words:**

> "You must not conduct any systematic or automated data collection activities (including,
> without limitation, scraping, data mining, data extraction and data harvesting) on or in
> relation to our website **without our express written consent**."

The same terms prohibit reproducing content "for a commercial purpose," and permit
republishing only "with appropriate accreditation to CruiseMapper.com or a backlink."

So this is the inverse of CruiseCritic. CruiseCritic's restrictive robots.txt at least tells
you where it stands. CruiseMapper's permissive one reads as consent while the binding
document withholds it. **Checking robots.txt and stopping there would produce exactly the
wrong conclusion here.**

Note also that §4.6 of `Free-Travel-APIs.md` names **CruiseMapper specifically** as the
example when it says "Several marketplaces sell scrapers for CruiseMapper … do not build on
scraped cruise data … It breaks the source sites' terms of service." That prediction is now
confirmed by the terms themselves.

### Apify assigns the liability to us

From Apify's General Terms and Conditions:

> §5.8 — "You are solely responsible for the legality, accuracy, quality, appropriateness,
> and use of all Customer Data."
>
> §11.1 — "Should you use the Services or Actors to extract Customer Data from unauthorized
> sources, **you shall be responsible for compensating any damages incurred by and/or any
> claims of the affected third parties**."

Apify is a tool vendor, not a licensor of the data. Running the scrape through them changes
who executes it, not who is answerable for it. There is no "express written consent" in this
arrangement, which is the thing CruiseMapper's terms require.

### Three practical problems, separate from the legal one

1. **The actor looks abandoned.** 0 monthly active users and last modified 7 months ago.
   Scrapers rot when the target's DOM changes, and 7 months is a long time for a live site.
   The 100% success rate and 5.0 rating are computed over almost no activity: 2 reviews and
   no current users. Treat both numbers as noise.
2. **The output does not fit our schema.** It returns a flat `itinerary` field. Our
   `cruise_port_call` table needs one row per call with an ordered `sequence` and a
   `port_name`, which is what makes the "Ports of call" list on the card work. A text blob
   would need parsing, and parsing a scraped blob is where freshness bugs live. Sibling
   actors on the same page fit better if this route is taken anyway:
   `automation-lab/cruisemapper-cruise-itineraries-scraper` advertises "ordered itinerary
   calls, call times," and `parsebird/cruisemapper-scraper` advertises "port-by-port
   schedules."
3. **It returns `price`, which §1.0 does not want.** Cruise price is optional per §1.0 and
   §4.7 recommends launching without it. Ingesting a scraped fare re-opens §9.2 and puts a
   staling number on a public page. If this route is taken, drop the field at the mapper the
   way `public.ts` already drops `lead_price_cents`.

### What Apify genuinely does fix

Worth saying plainly, because it is most of §5:

- No Playwright to install, no Chromium binary, **no Vercel serverless size problem** (§5 #5).
- No public unauthenticated Server Action launching browsers on our box (§5 #6, #7).
- No new long-running service, so the `CLAUDE.md` "don't add a backend service" tension
  mostly goes away. An Edge Function can call the Apify REST API on a schedule, which fits
  the §10.1 sync-into-Postgres architecture cleanly.
- Retries, proxies, pagination and scheduling are the vendor's problem.

**If the decision were purely technical, this is a better plan than §5's template.** The
decision is not purely technical.

### The recommendation

1. **Cruise search is fixed** (§1). The reason this came up has gone away. Decide on
   scraping as a data-coverage question, not as an outage workaround.
2. **A better source already exists and needs no permission — see §8.** The Travel Leaders
   Network departures file Gyasi already receives covers six of the eight lines he books,
   4,769 sailings, and carries no price column to worry about. It makes this whole section
   moot.
3. **If still more cruise coverage is wanted, ask Widgety for the free test key.** §4.2:
   their product *is* the §1.0 requirement, 60+ lines and ~1,000 ships, and a test key is
   free on request. It moves at email speed, so starting that thread costs nothing while
   other options are considered.
4. **If CruiseMapper's data specifically is wanted, ask them for consent.** Their terms name
   "express written consent" as the mechanism. A single-advisor travel business asking to
   sync itinerary content, with accreditation and a backlink, is a reasonable ask and they
   have a stated path for it. That converts the whole question from a risk into a licence.
5. **Do not rely on robots.txt as the permission signal here.** §3 and this section together
   are the reason: the two sites point opposite ways, and neither file is the binding
   document.
6. **If Gyasi proceeds anyway**, §6's checklist still applies, plus: use a maintained actor
   rather than this one, drop `price` at the mapper, and amend §4.6 first.

---

## 8. The manual route — a supplier file, not hand typing (reviewed 2026-09-26)

Gyasi raised doing "a manual update to cruises" and supplied the source he has in mind:
**`ADD and DV Departures as of September 25 2026.xlsx`**, the Travel Leaders Network list of
departures carrying group rates. Reviewed 2026-09-26 against the actual file.

**This is the best of the three routes, and it is not really "manual."** It is a
file-based import from a supplier who hands Gyasi the data. That makes it a third category,
distinct from both scraping and hand typing, and it clears every objection §2 through §7
raised.

### What the file is

| | |
|---|---|
| Size | 2.7 MB, 68 columns |
| Sheets | `All Sailings` (9,075 rows), `US Sailings` (8,723), `CA Sailings` (8,674), `River Sailings` (810) |
| Date range | **2026-10-10 → 2029-05-13** |
| Cruise lines | 25 distinct |
| Record types | `Amenity Departure` (7,966) and `Distinctive Voyage` (1,109) — the ADD and DV of the filename |
| Trip types | Ocean (8,266), River (809) |
| Top destinations | Caribbean 2,802 · Mediterranean 1,299 · European Rivers 688 · Alaska 645 · Galapagos 410 · Bahamas 330 |

Columns 1–20 are the sailing and its offer. Columns 21–68 are six repeating blocks of shore
event detail, mostly empty on Amenity Departures and populated on Distinctive Voyages.

### Why this beats both scraping routes outright

1. **No terms-of-service question exists.** The file is supplied to Gyasi as an advisor.
   Nothing is crawled, no robots.txt applies, and §4.6 is not engaged at all. The entire
   §2/§3/§7 problem disappears rather than being managed.
2. **There is no price column anywhere in the file.** Not one. It carries *amenities* and
   group numbers, never fares. So §1.3.4's net-rate prohibition cannot be triggered by
   construction, and §1.0's "price optional" is satisfied by absence. Every scraping route
   led with price, which was their worst property; this one structurally cannot.
3. **It covers Virgin Voyages — 315 sailings, 229 of them Caribbean or Bahamas.** §4.8
   records that track.cruises does not cover Virgin at all. This file closes the single
   named coverage gap in the provider already wired up.
4. **The amenities are genuine merchandising nobody else has.** "Shipboard Credit Per
   Stateroom ($50)", "Distinctive Voyage including Host, Private Welcome Reception &
   Exclusive Shore Event", named shore excursions with locations and durations. No public
   scrape would ever surface these, and they are exactly the "sounds like Gyasi rather than
   like a database" material §4.7 item 3 asks for.

### Coverage against the eight lines Story-Tail books

From `web/content/public/cruise-lines.ts`. **Six of eight present, 4,769 sailings, 2,824 of
them Caribbean or Bahamas.**

| File's `Cruise Line` | Our slug | Sailings | Caribbean + Bahamas |
|---|---|---|---|
| Royal Caribbean International | `royal-caribbean` | 2,549 | 1,916 |
| Celebrity Cruises | `celebrity` | 1,064 | 448 |
| Norwegian Cruise Line | `norwegian` | 492 | 178 |
| Virgin Voyages | `virgin-voyages` | 315 | 229 |
| Princess Cruises | `princess` | 221 | 31 |
| Holland America Line | `holland-america` | 128 | 22 |
| — | `disney` | **absent** | — |
| — | `carnival` | **absent** | — |

Note the names need mapping, exactly as track.cruises did: "Royal Caribbean International"
against our `royal-caribbean`, "Norwegian Cruise Line" against `norwegian`, and so on. Reuse
the mapping layer rather than writing a second one.

### What the file does NOT contain

This is the part that decides how far it gets on its own.

- **No port-by-port itinerary.** Only `Embarkation City`, `Disembarkation City`, and an
  itinerary *title* string such as "7-Night Southern Caribbean Cruise". So `cruise_port_call`
  can be filled with **two** rows per sailing, not the ordered list the card renders under
  "Ports of call". The middle of every itinerary is missing.
- **No images, descriptions, deck plans or ship specifications.**
- **No price**, which is a feature here rather than a gap, but means nothing can ever be
  merchandised on fare.

**So the file is a strong spine and a thin skin.** Pair it with Wikidata port and ship
reference data (§8 of `Free-Travel-APIs.md`) for the middle of the itinerary, and with
curated copy in `trips.ts` for the voice.

### Mapping to our schema

| File column | Target | Note |
|---|---|---|
| `Cruise Line` | `cruise_line.name` | needs slug mapping |
| `Ship` | `cruise_ship.name` | title-cased oddly: "Radiance Of The Seas" |
| `Itinerary` | `cruise_sailing.title` | |
| `Sail Date` | `cruise_sailing.departure_date` | datetime in the cell, date in our column |
| `# Days` | `cruise_sailing.duration_nights` | **the column name lies.** A "5-Night Western Caribbean Cruise" has `# Days` = 5, sailing 10-10 and disembarking 10-15, so the value is *nights*. Verify before trusting it wholesale. |
| `Destination` | `cruise_sailing.destinations[]` | single value; our column is an array |
| `Embarkation City` | `cruise_port_call` sequence 1 | |
| `Disembarkation City` | `cruise_port_call` final sequence | |
| `Sailing Record Type` | new enum, `amenity_departure` / `distinctive_voyage` | needs a Data-Model change first |
| `All Amenities` | merchandising copy | see the caution below |
| `US Group #` / `CA Group #` | **Internal. Never serve it.** | a group booking reference; drop it at the mapper the way `public.ts` already drops `lead_price_cents` |

Adding any of these fields means updating `docs/Data-Model.md` first and regenerating the
docx, per `CLAUDE.md`.

### Three cautions

1. **9,075 rows is not hand entry, and should not become a feed dump either.** §4.7 item 3
   is still right: "A curated set of six well-photographed sailings converts better than an
   unfiltered feed dump." The realistic shape is *import the file into Postgres as the
   breadth layer, curate a handful into `trips.ts` as the editorial layer* — which is
   exactly the two-layer split already running on `/explore/results`.
2. **The amenity text is a promotional offer, so publishing it is marketing material.**
   §1.3.1 requires InteleTravel compliance approval before launch for the whole public site,
   and offer language is the most scrutinised kind. Separately, this is a **Travel Leaders
   Network** file while the host relationship is **InteleTravel**, and §1.3.5 says "Website
   content must ONLY be InteleTravel content and no other content mentioned." Whether TLN
   group amenities count as InteleTravel content is a question for compliance, not for this
   document. **Get it in writing before any amenity string reaches a public page.** Using the
   file internally, to decide what Gyasi curates and pitches, raises none of this.
3. **It is a dated snapshot, not a feed.** The filename says "as of September 25 2026", and
   `US Group Status` is already `Active` on 8,722 rows, `None` on 351, `Closed` on 1. A
   sailing whose group closes is stale the moment it does. Re-import on each new file TLN
   issues, and stamp every row with the source filename and import date so a stale sailing
   is traceable rather than mysterious.

### Reading the file

System Python is externally managed on this Mac, so `pip install openpyxl` fails with
PEP 668. Use a throwaway venv:

```bash
python3 -m venv /tmp/xlsx && /tmp/xlsx/bin/pip install openpyxl
/tmp/xlsx/bin/python -c "
import openpyxl
wb = openpyxl.load_workbook('ADD and DV Departures.xlsx', read_only=True, data_only=True)
ws = wb['All Sailings']
rows = ws.iter_rows(values_only=True)
hdr = next(rows)
print(hdr)
"
```

`read_only=True` matters at this size. `data_only=True` returns computed values rather than
formulas.

### Recommended shape, if this is built

1. **Update `docs/Data-Model.md` first** for `sailing_record_type`, the amenity text, and the
   group number's Internal classification.
2. **A one-off import script, not an Edge Function.** Parsing a 2.7 MB workbook is a
   developer action run against a file on disk, not something a Deno function should do. It
   writes to the same `cruise_sailing` / `cruise_port_call` tables `cruise-sync` already owns,
   so the public read path does not change at all.
3. **Filter on import.** The six matching lines, Caribbean and Bahamas, departures inside the
   next twelve months. That is a few hundred rows rather than 9,075, and it is the set Gyasi
   actually sells.
4. **Stamp provenance on every row:** source filename, the "as of" date, and the import
   timestamp. Same discipline `proof.ts` already applies to unverified claims.
5. **Keep the group number server-side** and keep the amenity text behind the compliance
   answer in caution 2. Neither needs to block the import; both can be withheld at the mapper
   until they are cleared.
6. **Curate six to ten into `trips.ts` by hand** with real copy and images. That is the part
   that converts, and the part no import produces.

---

## 9. Appendix — the saved template

Kept verbatim in shape, with the two broken template literals repaired so it parses.
Still contains placeholder selectors and a dummy domain. **Not runnable against a real
site and not an endorsement of the pattern.** See §5 before using any of it.

```js
'use server';

import { chromium } from 'playwright';

/**
 * Server Action to scrape cruise itineraries based on user criteria.
 * @param {Object} criteria - Search filters passed from the frontend.
 * @param {string} criteria.destination - E.g., 'caribbean', 'alaska', 'europe'
 * @param {string} criteria.duration - E.g., '6-9' (nights)
 */
export async function scrapeCruiseItineraries(criteria) {
  const { destination, duration } = criteria;

  const targetUrl =
    `https://example-cruise-booking-portal.com/search?dest=${destination}&duration=${duration}`;

  let browser;
  try {
    // 1. Launch a headless browser instance on the server
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
        '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });
    const page = await context.newPage();

    // 2. Navigate with a realistic timeout
    await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 30000 });

    // 3. Scroll to trigger lazy loading
    await page.evaluate(async () => {
      await new Promise((resolve) => {
        let totalHeight = 0;
        const distance = 100;
        const timer = setInterval(() => {
          const scrollHeight = document.body.scrollHeight;
          window.scrollBy(0, distance);
          totalHeight += distance;
          if (totalHeight >= scrollHeight) {
            clearInterval(timer);
            resolve();
          }
        }, 100);
      });
    });

    // 4. Wait for the results card component
    await page.waitForSelector('.cruise-card', { timeout: 10000 });

    // 5. Extract
    const cruiseResults = await page.evaluate(() => {
      const cards = document.querySelectorAll('.cruise-card');
      const data = [];

      cards.forEach((card) => {
        const title = card.querySelector('.cruise-title')?.textContent?.trim() || 'N/A';
        const shipName = card.querySelector('.ship-name')?.textContent?.trim() || 'N/A';
        const line = card.querySelector('.cruise-line')?.textContent?.trim() || 'N/A';
        const priceText = card.querySelector('.price-value')?.textContent?.trim() || '0';
        const durationText =
          card.querySelector('.duration-nights')?.textContent?.trim() || 'N/A';

        const ports = [];
        card.querySelectorAll('.itinerary-stops li').forEach((stop) => {
          ports.push(stop.textContent.trim());
        });

        // NOTE: this is defect #9 in §5. "$1,299.50" becomes 129950.
        const numericPrice = parseInt(priceText.replace(/[^0-9]/g, ''), 10) || 0;

        data.push({ title, shipName, line, price: numericPrice, duration: durationText, itinerary: ports });
      });

      return data;
    });

    return { success: true, data: cruiseResults };
  } catch (error) {
    console.error('Scraping execution failed:', error.message);
    return { success: false, error: error.message };
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}
```

The accompanying client component is omitted. Its JSX body was empty, `loading` was never
read, and it surfaced errors through `alert()`. None of the three is worth preserving.

### Provenance note

The template ends by asking "Do you have a specific cruise portal in mind so we can write
out the exact CSS selectors?" It was written without knowledge of this codebase: it does
not know cruise data is already synced into Postgres, that a `cruise-search` function
already exists, that web deploys to Vercel, or that §1.0 excludes price. Treat it as a
generic Playwright sketch, which is what it is.
