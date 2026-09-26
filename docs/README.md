# Project Documentation

The canonical source-of-truth documents for the Story-Tail Adventures rewrite. Read these *before* writing code that touches the corresponding area.

## Documents (in recommended reading order)

1. **`BRD.md`** — Business Requirements Document. The "what and why." Scope, phases, business rules, payment posture, non-functional requirements. Read this first.
2. **`Screen-Inventory.md`** — Every screen in the platform (168 screens) with mobile/tablet/web variants. Section 4 maps each screen to a reusable layout pattern.
3. **`Data-Model.md`** — All entities, fields, Postgres DDL, Kotlin data classes, sensitivity classifications, PCI handling rules.
4. **`Design-System.md`** — Visual design (colors, typography, components) and **brand voice** (Section 2). The brand voice section is load-bearing for any user-facing copy.
5. **`Tech-Recommendations.md`** — Stack choices (KMP mobile, React web, Supabase Edge Functions backend), PCI compliance posture, Claude Code bootstrap walkthrough.
6. **`Doc-Review.md`** — Historical record of two consistency-review passes over the other five docs. Useful for understanding *why* certain decisions were made.

## Supporting research

Not canonical — these inform decisions but do not override the six documents above.

- **`Scraping-Reference.md`** — the Playwright scraper template Gyasi saved, reviewed, plus what the source sites permit. Section 1 is the important one: cruise search was diagnosed on 2026-09-26 and the backend is healthy (HTTP 200, all 4 sailings). `STA_HOTEL_SEARCH_TOKEN` is absent from every `web/.env.local`, so `searchCruises` returns "unavailable" without making a request, and it is written to never throw. Same token gates hotel search. Section 7 reviews the Apify CruiseMapper actor: its free tier is real (2,500 results/month, beating track.cruises BASIC) and it removes every infrastructure objection, but CruiseMapper's robots.txt is permissive while its Terms of Use explicitly forbid "scraping, data mining, data extraction" without "express written consent" — and Apify's §11.1 puts liability for unauthorized extraction on us. Also records that `Free-Travel-APIs.md` §4.6 is titled "Scraping — don't", that CruiseCritic's robots.txt disallows `/search` and `/smart-deals` for every agent while leaving canonical itinerary pages open, and that scraping the InteleTravel site risks the §1.3.4 net-rate prohibition, which names termination. Read before building any scraper.
- **`Stripe-Projects-Reference.md`** — captured notes on two links Gyasi saved for the Credit Card Authorization work: the Supabase app on the Stripe App Marketplace, and the Stripe Projects CLI docs. Both turn out to be infrastructure *provisioning* tools, not card handling. Section 3 spells out the gap against what BRD §10.4 actually needs (SetupIntent, Vault and Forward, audited PAN reveal), flags that the Marketplace app has no sandbox support, and notes that paid provider tiers bill through our Stripe account. Read before anyone installs either one.
- **`Free-Travel-APIs.md`** — the free/no-contract slice of the travel API landscape (cruise, hotels, deals, plus open datasets), with signup paths and quotas. Section 1.0 fixes the scope: the public search surface is for discovery, not transaction, so the APIs supply content (location, images, descriptions, ratings; cruise line, ship, itinerary) and never availability or rates. Section 1.3 records what the InteleTravel Training Manual settles — an independent site is permitted but needs compliance approval before launch, bookings hand off to the advisor's personalized InteleTravel site, affiliate monetisation is out, and net rates are prohibited. Section 10.1 draws the architectural consequence: sync content into Postgres on a schedule rather than proxying per request. Expands on `BRD.md` §9 and §10.5. Phase 2.

## Format

Each document ships as both Markdown (the editable source) and Word (for sharing). The Markdown is canonical — if the two diverge, the `.md` wins.

## When to update these docs

Update a doc *before* writing code that contradicts it. The flow is: someone proposes a change → BRD/Data Model/Design System gets updated → code follows. Not the other way around. This keeps the docs trustworthy.

Run a consistency review (like the one captured in `Doc-Review.md`) after any substantial cross-cutting change. The pattern is documented in that file.

## Regenerating the .docx files

The .docx files are generated from the markdown via pandoc:

```bash
pandoc docs/BRD.md -o docs/BRD.docx --toc --toc-depth=3 \
  --highlight-style=tango \
  --metadata title="Story-Tail Adventures — BRD" \
  --metadata author="Gyasi Story"
```

The BRD's docx was originally built via a custom `docx-js` script for branded styling; subsequent updates use pandoc. Either is fine — the markdown is the source.
