# Technology Recommendations
## Story-Tail Adventures — Web & Mobile CRM Platform

**Document Owner:** Gyasi Story
**Audience:** Internal — anyone selecting infrastructure or kicking off the build
**Version:** 1.0 — Draft
**Date:** May 14, 2026
**Companion Documents:** BRD, Screen Inventory, Data Model, Design System

---

## 1. Executive Summary

Four big infrastructure decisions remain after the BRD, Screen Inventory, Data Model, and Design System are written. This document makes a concrete recommendation on each, with sources for the research and an honest accounting of the tradeoffs.

**Top-line recommendations:**

1. **Frontend: Hybrid (Compose Multiplatform for mobile, Next.js/React for web).** Don't try to use Compose Multiplatform for Web yet — it's in Beta as of 2026 and still maturing. Get the shared business logic via the KMP module on both mobile and the Ktor backend; use React + Next.js for the web app where SEO, ecosystem maturity, and the hiring market all favor it. Revisit Compose-for-Web for Phase 2 or 3 once it stabilizes.

2. **Storage: Supabase as the BaaS, with Stripe handling all cardholder data.** Supabase is built on Postgres, which matches the data model exactly. It bundles auth, file storage, row-level security, and real-time subscriptions on top of standard SQL. It earned SOC 2 Type II and HIPAA in 2026. Firebase is the wrong fit — its core database (Firestore) is NoSQL, which would require rewriting the data model.

3. **PCI Compliance: Stripe Elements + tokenization keeps you in SAQ A.** Cardholder data never touches Supabase or the Ktor backend. You store only Stripe-issued tokens plus the non-sensitive metadata Stripe returns (brand, last 4, expiration). This is the simplest PCI self-assessment available, supported by Stripe's mature SDKs across Android (Kotlin), iOS (Swift), and JavaScript. PCI DSS 4.0.1 is the current standard.

4. **Claude Code workflow: Bootstrap with `/init`, lean on `CLAUDE.md` + Skills, ship one Phase 1 screen end-to-end before broadening.** Commit the `.claude/` directory to source control so the team and contractors share the same vocabulary.

The rest of this document walks through each decision in detail.

---

## 2. Frontend Architecture — KMP Everywhere vs. Hybrid

### 2.1 The Question

The BRD's Section 15 recommended Kotlin Multiplatform as the architectural backbone. The remaining question: **how far do you take it for the web app?**

Three credible options:

- **Option A — KMP everywhere.** Compose Multiplatform compiles to Android, iOS, and web (via Kotlin/Wasm). One UI codebase, one team, one source of truth for screens. Maximum code sharing.
- **Option B — KMP for mobile, React for web (Hybrid).** Compose Multiplatform on Android and iOS. Next.js + React + TypeScript for the web. Both consume the same Ktor backend and the same KMP shared domain models, but the web has its own UI layer.
- **Option C — KMP for shared logic only, native UI everywhere.** KMP shared module for domain types and business rules. Jetpack Compose for Android, SwiftUI for iOS, React for web. Three UI codebases, maximum native feel.

### 2.2 What Changed in 2026 (Research)

The Compose-for-Web story is meaningfully better than it was at the BRD's writing in early 2026, but it is not yet at parity with Compose for Android and iOS.

Per JetBrains, [Compose Multiplatform for Web](https://lp.jetbrains.com/cmp-for-web/) is currently classified as **Beta** rather than stable. The blog post [Present and Future of Kotlin for Web](https://blog.jetbrains.com/kotlin/2025/05/present-and-future-kotlin-for-web/) (May 2025) and the [Kotlin/Wasm Get Started guide](https://kotlinlang.org/docs/wasm-get-started.html) frame it as "production-ready for early adopters" with real apps shipping (Kotlin Playground, KotlinConf, Rijksmuseum). All major browsers — including Safari — now support WebAssembly Garbage Collection (WasmGC) as of December 2024, removing the largest deployment blocker. JetBrains benchmarks show Kotlin/Wasm Compose runs roughly **3× faster than Kotlin/JS** in UI-sharing scenarios.

The Wasm story is real but still has practical caveats:

- **SEO is hard.** Wasm-rendered pages don't server-side-render trivially. The public marketing surface and self-guided search results need to be indexable by search engines — Phase 2 of the BRD depends on this for lead generation. Next.js does SSR/SSG out of the box.
- **The hiring market is thinner.** Kotlin developers are common; Compose-Multiplatform-for-Web specialists are not.
- **Tooling maturity.** Devtools, debugging, build performance, and the React ecosystem (component libraries, state management, design tools) are years ahead of Compose for Web.
- **Beta means changes.** Beta software changes. A breaking API change in mid-project is a risk that's easier to avoid by sticking with mature tools for the web layer.

### 2.3 Recommendation — Option B (Hybrid, committed)

For Story-Tail Adventures specifically:

| Surface | Technology | Why |
|---|---|---|
| Android app | Compose Multiplatform | Stable, fast, native feel. KMP-native. |
| iOS app | Compose Multiplatform + SwiftUI interop where helpful | Stable, native-feeling. |
| Authenticated web portal (client + agent) | Next.js + React + TypeScript | Mature, ecosystem-rich, deeply tooled, hiring-friendly. |
| Public marketing-adjacent pages (Section 2.0 + 2.3 of the Screen Inventory) | Next.js with SSR/SSG | SEO-essential. Same Next.js codebase as the authenticated portal. |
| Shared business logic, domain models, API clients | KMP `shared/` module compiled to JVM (backend + Android) and Kotlin/Native (iOS). **Not** compiled to web. | Mobile + backend share Kotlin; web is its own TypeScript codebase. |
| Web ↔ Backend integration | REST/JSON over HTTPS. TypeScript types codegen'd from Kotlin domain types via OpenAPI export. | One source of truth for the API contract without forcing the web app to consume Kotlin. |
| Backend | Ktor on JVM | Same Kotlin code that compiles into the shared module. |

This is the architecture the BRD now commits to in Section 15.1.

**The cost of this choice:** two UI implementations rather than one. The shared module mitigates most of the duplication risk by holding all the domain rules, validation, status transitions, and API clients on the mobile + backend side. Web duplicates those rules in TypeScript — but the type codegen pipeline keeps them in lockstep with the Kotlin source of truth (a CI step regenerates TS types whenever the API surface changes, and breaks the build if the React app drifts).

**Compose-for-Web — explicitly out of scope.** As of 2026, Compose Multiplatform for Web is in Beta and not at parity with Compose for Android/iOS. Even if it reaches Stable in a future release, migrating away from Next.js + React would not be a meaningful win for this project — the public SEO surface alone justifies Next.js, the React ecosystem covers everything needed, and the hiring market is far larger. We are not waiting for or planning toward a future Compose-for-Web migration.

### 2.4 What Option A Would Need to Become Compelling

Three things would tip the recommendation toward all-KMP:

1. Compose Multiplatform for Web reaching **General Availability** with a stable API and a 1-year deprecation policy.
2. Server-side rendering / pre-rendering for the public pages, either via the framework itself or a clean integration with a Wasm-rendering edge worker.
3. A `compose-html` style component library at parity with shadcn/ui or Material-UI for React, including a11y, theming, animations, and form patterns.

None of these are met in 2026. The first is closest.

---

## 3. Storage — Supabase vs. Firebase (and Alternatives)

### 3.1 The Question

The BRD's Section 12 specified Postgres as the primary store and recommended Auth0 or Clerk for authentication, plus S3/R2 for file storage. The question is whether to:

- **Use a BaaS (Backend-as-a-Service)** like Supabase or Firebase that bundles database + auth + storage + real-time into one platform, or
- **Self-assemble** the pieces: managed Postgres + separate auth provider + separate object storage + everything wired together via the Ktor backend.

### 3.2 What Changed in 2026 (Research)

The most consequential research finding: **[Supabase achieved SOC 2 Type II and HIPAA compliance in February 2026](https://tech-insider.org/supabase-vs-firebase-2026/)**. That closes the enterprise compliance gap that previously made Firebase a safer choice for security-sensitive applications.

Comparing the two on the dimensions that matter for Story-Tail Adventures:

| Dimension | Supabase | Firebase | Winner for Story-Tail |
|---|---|---|---|
| Primary database | PostgreSQL | Firestore (NoSQL) | **Supabase** — matches Data Model exactly |
| Auth | Built-in (email, social, MFA, magic link) | Built-in (Firebase Auth) | Tie |
| File storage | Supabase Storage (S3-compatible) | Cloud Storage | Tie |
| Real-time | Postgres logical replication → WebSocket | Firestore listeners | Tie functionally; Supabase has more control |
| Row-level security | Postgres RLS — battle-tested | Firestore Rules — proprietary DSL | **Supabase** — RLS is well-understood |
| Compliance | SOC 2 Type II, HIPAA (Feb 2026) | SOC 2, ISO 27001 | Tie — both adequate |
| Self-host option | Yes (open source) | No | **Supabase** — option for data residency |
| Pricing predictability | Flat tiered | Pay-per-operation can spike | **Supabase** |
| Ecosystem for Kotlin/JVM | First-class JDBC + REST + Kotlin SDK | JS-heavy; Kotlin SDK exists but less polished | **Supabase** |

Per [the Bytebase comparison](https://www.bytebase.com/blog/supabase-vs-firebase/) and [Tech-Insider's 8-test comparison](https://tech-insider.org/supabase-vs-firebase-2026/), **Supabase is the better fit for new relational projects in 2026**.

### 3.3 Recommendation — Supabase as the Entire Backend Platform

Use Supabase as the BaaS *and* the backend platform — including Supabase Edge Functions (Deno + TypeScript serverless) instead of a separate Ktor server. This consolidates the backend onto a single platform and removes the need to run and maintain a separate Kotlin service.

**The full Supabase footprint used:**

| Story-Tail concern | Supabase service |
|---|---|
| Primary database | Supabase Postgres (HA, encrypted at rest, daily backups) |
| Authentication | Supabase Auth — signin/signup, MFA (TOTP and SMS), magic links, social (Google, Apple), password reset |
| File storage | Supabase Storage (replaces S3/R2 recommendation for documents) |
| Real-time (Section 2.6 Messaging) | Supabase Realtime (Postgres logical replication → WebSocket) |
| Application backend | Supabase Edge Functions (Deno + TypeScript) for Stripe API calls, travel API integrations, audit middleware, webhook handlers, complex business logic |
| Database auto-API | PostgREST (Supabase generates a REST API from the schema) — used for simple reads where RLS makes direct client access safe |
| Audit events (Data Model §15) | Standard Postgres table; writes happen from Edge Functions on every sensitive action |
| Migrations + type generation | Supabase CLI (`supabase db push`, `supabase gen types typescript`) |

**Why Edge Functions instead of Ktor:** Edge Functions are the right tool for Story-Tail's server-side surface area (Stripe, travel APIs, webhooks, audit middleware). They remove an entire hosting tier (no Fly.io / Cloud Run for a Kotlin service), keep the backend in the same TypeScript ecosystem as the Next.js web app (shared types end-to-end without codegen between Kotlin and TS for the web side), and run free up to 500K invocations/month — comfortably MVP-sized for years. The KMP code-sharing benefit is preserved where it matters: between Android and iOS in the mobile module.

**Don't expose the database directly to mobile/web clients for sensitive operations.** Reads of own data (a client viewing their own trips) can go directly through Supabase JS SDK with RLS for enforcement. Anything touching Stripe tokens, audit events, commission edits, or travel-API keys goes through Edge Functions — they hold the `service_role` key, do the privileged work, and return only what the client should see.

**What Edge Functions do that Ktor would have done:**

- `stripe-setup-intent` — creates a SetupIntent for collecting a new card.
- `stripe-vault-forward` — for API suppliers; calls Stripe's Vault and Forward API.
- `stripe-reveal-pan` — audited, MFA-gated PAN reveal for portal suppliers.
- `commission-import` — parses Inteletravel CSV imports, runs reconciliation.
- `travel-api-proxy/{amadeus,hotelbeds,viator,widgety}` — proxies travel API calls so the keys stay server-side.
- `webhooks/stripe` — handles Stripe webhooks (card validation events, etc.).
- `audit-middleware` (shared helper) — every mutating Edge Function calls into this to write an AuditEvent.

### 3.4 What About Self-Assembled?

Self-assembled (managed Postgres on Neon or RDS + Clerk + S3 + custom Ktor) is also a valid path. It's marginally more expensive in operational time and slightly cheaper at the very high end. For a single-advisor business growing to a small team, Supabase wins on simplicity. Revisit if scale ever reaches 100+ advisors.

### 3.5 What About Firebase?

Firebase is the wrong tool for this project. Firestore is NoSQL, the Data Model is relational, and the rewrite cost is high. Firebase Auth and Cloud Storage are fine in isolation but you'd lose the cohesion of a single BaaS. Skip it.

---

## 4. PCI Compliance for Card Storage

### 4.1 The Question

The BRD's Section 10 already established the operating model: Story-Tail Adventures is **not the merchant of record**, never charges clients directly, uses Stripe for tokenization, and stores only opaque tokens. The remaining questions:

- What PCI level / self-assessment applies?
- What does the Ktor backend need to do to stay compliant?
- Which hosting providers / managed services support this best?

### 4.2 PCI DSS 4.0.1 — The Current Standard (Research)

Per [Strictly Zero's PCI 2026 checklist](https://strictlyzero.com/announcements/payments-announcements/pci-compliance-checklist-2026-the-merchants-guide-to-dss-4-0-1/) and the [PCI Security Standards Council documents](https://www.pcisecuritystandards.org/document_library/), the current standard as of 2026 is **PCI DSS 4.0.1**. It is "the definitive global benchmark for securing cardholder data" and is enforced contractually by Visa, Mastercard, Amex, and Discover.

The standard defines **four merchant levels** by annual transaction volume:

| Level | Volume | Scope |
|---|---|---|
| 1 | 6M+ Visa transactions/year | Full annual on-site audit by a QSA |
| 2 | 1M–6M | SAQ + on-site review |
| 3 | 20K–1M (e-commerce) | SAQ A or SAQ A-EP |
| 4 | <20K | SAQ A annually |

Story-Tail Adventures is clearly **Level 4** by volume — and because tokenization is fully outsourced to Stripe, the applicable SAQ is **SAQ A** (the lightest).

### 4.3 What Qualifies for SAQ A With Stripe

Per [Stripe's PCI guide](https://stripe.com/guides/pci-compliance), the merchant qualifies for SAQ A when **all cardholder data handling is outsourced to a validated third party**. Three accepted Stripe integration patterns:

- **Stripe Checkout** (Stripe-hosted payment page) — easiest, SAQ A eligible
- **Stripe Elements** (embedded fields that talk directly to Stripe — never to your server) — SAQ A eligible
- **Stripe Mobile SDKs** (Android/iOS native) — SAQ A eligible

All three keep cardholder data off your servers entirely. Stripe returns a token (the `PaymentMethod` ID) plus non-sensitive metadata (brand, last 4, expiration).

The Design System and Data Model already specify Stripe Elements for the web (Section 2.4.2 Add Card Screen) and the Stripe mobile SDKs for native (per BRD §15.1, via `expect/actual` in the KMP shared module). This puts the platform squarely in **SAQ A territory**.

### 4.4 SAQ A Requirements — What You Actually Have to Do

Per [PCI Policy Portal](https://pcipolicyportal.com/white-papers/need-pci-compliance-stripe-question-answer/) and the [Stripe PCI Guide](https://stripe.com/guides/pci-compliance):

SAQ A is roughly 22 questions across 9 control areas. The substantive controls applicable when Stripe handles all cardholder data:

| Control area | What it means for Story-Tail |
|---|---|
| Network security | TLS 1.2+ on every endpoint, including admin |
| Access control | Strong passwords; MFA required for agents; role-based access on the backend |
| Vulnerability management | Quarterly external vulnerability scan by an Approved Scanning Vendor (ASV); patch software regularly |
| Logging & monitoring | Audit log of access to systems handling tokens (covered by Data Model §15 AuditEvent) |
| Security policy | A written information security policy reviewed annually |
| Vendor management | Track that Stripe (and any other PCI-relevant vendor) maintains its own compliance |
| Incident response | Documented plan for what to do if a card-data leak is suspected |

Notably **not required** at SAQ A level (because Stripe is doing them):

- Encrypting cardholder data at rest (you don't have any)
- Network segmentation (your environment doesn't process card data)
- Annual penetration testing (Level 4 SAQ A is exempt)
- Hardware security module (HSM) deployment

**Self-attestation cadence:** Annually, sign a SAQ A and an Attestation of Compliance (AOC). Stripe provides templates and walks merchants through the process.

### 4.5 Backend Hosting — Which Providers Support PCI Best?

Story-Tail's Ktor backend never sees a card number, but it's still good practice to host on infrastructure that meets enterprise security standards. All major cloud providers maintain PCI Level 1 service provider status:

| Provider | PCI level | Suitable for Ktor? | Notes |
|---|---|---|---|
| **Supabase** (recommended) | SOC 2 Type II, HIPAA, hosted on AWS | Yes via REST/RPC; can run Ktor in front | Already chosen for DB/auth/storage |
| **AWS** (ECS, App Runner, Fargate) | PCI Level 1 Service Provider | Yes | Most enterprise. Most complex setup. |
| **Google Cloud Run** | PCI Level 1 | Yes | Clean container deploy story |
| **Fly.io** | SOC 2 Type II | Yes | Excellent developer experience; multi-region edge |
| **Render** | SOC 2 | Yes | Heroku-like simplicity |
| **Cloudflare Workers** | PCI Level 1 | Limited — Workers don't support JVM | Not suitable for Ktor on JVM |
| **DigitalOcean App Platform** | PCI DSS not service-provider certified | Caution | Not recommended for the production backend |

**Recommendation:** Run the Ktor backend on **Fly.io** or **Google Cloud Run** for MVP. Both have SOC 2 attestations, support JVM containers cleanly, and have predictable pricing at this scale. Fly.io has the edge in developer experience and Postgres-adjacency (their managed Postgres lives next to the Workers); Cloud Run wins if you're already in the Google ecosystem.

Move to **AWS App Runner or ECS** later if scale or enterprise requirements demand it. The Ktor app is portable — it's a Docker container — so this swap is straightforward.

### 4.6 The Hard Rules — Things That Would Break PCI Compliance

Three implementation decisions would push the platform out of SAQ A and into a much heavier compliance burden. **None of these are allowed:**

1. **Storing the card PAN anywhere on your infrastructure**, including encrypted columns or "we'll encrypt it ourselves." If the raw PAN ever touches your server, you're a Level 3 or 4 SAQ D merchant — a 300+ question questionnaire, full pen-testing, network segmentation, the works.

2. **Receiving the PAN in any API call to your backend.** The mobile and web apps must send card data directly to Stripe (via Elements or the Mobile SDK). Your backend receives only the token.

3. **Logging or caching the PAN even briefly** — including in stack traces, monitoring breadcrumbs, debug logs. Sentry and similar observability tools should be configured with scrubbing rules to redact anything that looks like a 16-digit card number from payloads.

The Reveal Card Number screen (Screen Inventory 3.6.4) is the one place the platform retrieves a PAN — and it does so via Stripe's API, displays it briefly to the agent, never persists it server-side, and audits every reveal. That flow stays SAQ-A-compliant because the retrieval is just-in-time and the value never lands in your database or logs.

### 4.7 The Two Supplier Realities — Vault and Forward vs. Reveal

Story-Tail Adventures' suppliers fall into two categories that drive different Stripe patterns. The platform must accommodate both.

**API suppliers** (Expedia via Stripe's supported `api.ean.com` endpoint, hotels via Hotelbeds, some cruise lines via Odysseus/Revelex) accept charges through API endpoints. For these, the platform uses **Stripe's Vault and Forward API** — a `ForwardingRequest` tells Stripe which stored PaymentMethod to use, which URL to POST to, and which body fields to replace with card data. Stripe substitutes the card details on the way out; the card never touches Story-Tail's servers. This is the clean, SAQ-A-preserving path.

**Portal suppliers** (Sandals' TA Portal, Royal Caribbean's CruisingPower, most all-inclusive resort booking systems) require the agent to enter card details into a web form by hand. Stripe Vault and Forward cannot help here because there is no API endpoint to forward to. The agent must either (a) trigger a brief, audited reveal of the PAN from Stripe to copy into the supplier portal, or (b) use a third-party vault designed for the reveal flow (Spreedly is the travel-industry specialist).

The Supplier entity (Data Model §8.1) tracks `payment_method_kind` per supplier so the agent UI picks the right flow automatically.

### 4.8 Spreedly — When to Add a Second Vault

Spreedly's Payment Method Distribution is purpose-built for the portal-supplier reveal flow. They explicitly target the travel industry — [their "Travel Platform's Dilemma" blog](https://www.spreedly.com/blog/a-travel-platform-s-dilemma) is essentially this exact scenario. Spreedly's reveal API is designed to let an agent temporarily view stored card data to enter on a supplier portal, with full audit trail and compliance posture optimized for it.

**The tradeoff:** Spreedly adds a vendor and a per-transaction cost (~$50–$500/month at small volume). For a single-advisor business at MVP, the cost is more than zero but not huge.

**Recommendation:** Start with Stripe-only at MVP. Use Stripe's reveal mechanism (via the audited Reveal Card Number flow on Screen Inventory 3.6.4) for portal suppliers. Migrate to Spreedly in Phase 2 if (a) portal supplier volume becomes high, (b) PCI scope creep becomes a real concern at audit time, or (c) the operational complexity of managing reveals via Stripe outweighs the cost of a specialist vault.

The Data Model and BRD are written to support both — switching from Stripe-only reveal to Spreedly is a backend change without schema changes.

### 4.9 Why Not Build Our Own Vault

Some teams reach this point and ask whether it's cheaper to build the vault themselves rather than depend on Stripe. The answer is no, and the cost differential is much larger than it appears.

**Stripe tokenization is $0/month for our model.** Stripe charges only on transactions processed *through* Stripe. For pure vault use (collect a card, store the token, reveal or forward for supplier use), Stripe does not charge. No monthly minimum, no setup fee, no card-on-file fee. The "paid solution" framing doesn't apply here — Stripe is already the free option.

**Self-hosting moves the platform from SAQ A to SAQ D.** This is the most consequential consequence and the one most easily missed. The moment Story-Tail stores cardholder data on its own infrastructure (even with strong encryption), PCI DSS requires a full Report on Compliance via a Qualified Security Assessor — not a self-assessment.

Realistic SAQ D operational cost for a small business in 2026:

| Item | Annual cost |
|---|---|
| QSA (Qualified Security Assessor) audit | $30,000–$100,000 |
| Annual penetration test by credentialed firm | $10,000–$30,000 |
| Quarterly external vulnerability scans (ASV) | $1,000–$5,000 |
| Hardware Security Module (CloudHSM or equivalent) — 2 for HA | $13,000–$26,000 |
| Cyber liability insurance (rates spike for card data) | $5,000–$20,000 |
| Engineering time to build (1–2 person-years one-time) | $100,000–$300,000 |
| Ongoing security maintenance, monitoring, incident response | 0.25–0.5 FTE |
| **Total ongoing annual** | **$60,000–$180,000** |

Compare this to Story-Tail's recommended stack (Section 4.7) running at roughly $50–$150/month all-in. Self-hosting the vault would multiply the operating cost by 400–1,200×.

**Open-source vaults don't escape this.** Self-hosting Hyperswitch, PCI Vault, or a custom Postgres-with-pgcrypto solution doesn't reduce the PCI burden. The burden is about what cardholder data does in your environment, not whose code processes it. You still need the QSA audit, the HSM, the pen test, the segmentation, all of it.

**The risk asymmetry is severe.** A breach scenario for a self-hosted vault: $5K–$100K in card network fines per occurrence, $5K–$500K in card brand assessment fees, $25K–$200K in mandatory forensic investigation, $10–$30 per affected client in credit monitoring, plus open-ended class-action lawsuit exposure. A single PAN leak is potentially business-ending for an independent advisor.

**Recommendation:** Use Stripe for the card vault. It is the free option for this use case, not a paid one. The single largest cost lever for keeping vendor spend low is in the auth and storage layers (using Supabase rather than Auth0 + Clerk + S3 + RDS) — not in the vault. See Section 6 for the minimum-vendor stack.

### 4.10 Recommended Vendor Stack — PCI View

| Concern | Vendor | Role |
|---|---|---|
| Card tokenization | Stripe | Holds the actual card data (SetupIntent + Vault and Forward) |
| Card reveal for portal suppliers | Stripe (MVP) → consider Spreedly in Phase 2 | Audited PAN reveal for manual entry on supplier portals |
| Backend hosting | Fly.io or Google Cloud Run | SOC 2 Type II attested |
| Database | Supabase Postgres | SOC 2 Type II + HIPAA |
| File storage | Supabase Storage | Same compliance posture |
| Email | Postmark or Resend | Transactional; never carries card data |
| Observability | Sentry with PAN-scrubbing rules | Errors and traces; payload redaction |
| Vulnerability scanning | Approved Scanning Vendor (ASV) — Trustwave, SecurityMetrics, Qualys | Quarterly external scans |
| Compliance attestation | Stripe's PCI portal | Annual SAQ A self-assessment |

---

## 5. Getting Started with Claude Code

### 5.1 The Question

Once the stack is chosen, how do you actually start building it efficiently with Claude Code, especially given the documentation already produced (BRD, Screen Inventory, Data Model, Design System)?

### 5.2 Claude Code Conventions in 2026 (Research)

Per [Claude Code Cheat Sheet 2026](https://www.claudedirectory.org/blog/claude-code-cheat-sheet), the [Slash Commands reference](https://learn-prompting.fr/blog/claude-code-slash-commands-reference), and [Toolradar's skill roundup](https://toolradar.com/blog/best-claude-code-skills-2026), the current best-practice shape of a Claude-Code-friendly repo:

- **`CLAUDE.md` at repo root** — read by Claude at the start of every session. Should be **short** (a 30-line CLAUDE.md beats a 300-line one). Contains: project overview, key commands, important files, conventions.
- **`.claude/skills/<name>/SKILL.md`** — the modern, recommended format for project-specific workflows. Skills can be invoked as slash commands AND autonomously by Claude when context matches. The older `.claude/commands/` format still works but skills are preferred.
- **Commit the `.claude/` directory** — share the team's lexicon across contractors and future-you.

Essential commands per the [Cheat Sheet](https://blakecrosley.com/guides/claude-code-cheatsheet):

- `/init` — initialize a CLAUDE.md from scanning the repo
- `/review` — code-review the working changes
- `/compact` — compress context when the conversation gets long
- `/cost` — check token usage
- `/help` — list available commands

### 5.3 Step-by-Step Bootstrap

Here is the recommended sequence to start the Story-Tail Adventures codebase with Claude Code. Each step is a single conversation with Claude or a short series of them.

#### Step 1 — Create the monorepo and scaffolding

Set up the monorepo with the four sub-projects per Data Model §21.1. The recommended top-level tooling is Turborepo or Nx (either works; Turborepo has a slightly simpler learning curve). Use `pnpm` for the JavaScript/TypeScript side and the Compose Multiplatform Wizard for the mobile side.

```
storytail/
├── mobile/                    # Gradle + KMP — Android + iOS only
│   ├── shared/
│   ├── androidApp/
│   └── iosApp/
├── web/                       # Next.js + React + TypeScript
├── supabase/                  # Database migrations + Edge Functions
│   ├── migrations/
│   └── functions/
├── contracts/                 # OpenAPI + generated TS + generated Kotlin
└── package.json               # Workspace root (Turborepo)
```

#### Step 2 — Drop in the design system

For the mobile app, copy the four Kotlin files from `Web Rewrite/design/compose-theme/` into `mobile/shared/src/commonMain/kotlin/com/storytail/ui/theme/`:

- `StoryTailColors.kt`
- `StoryTailTypography.kt`
- `StoryTailShape.kt`
- `StoryTailTheme.kt`

Add Poppins, Caveat, and JetBrains Mono to `mobile/shared/src/commonMain/composeResources/font/`. Update `StoryTailTypography.kt` to point `PoppinsFamily`, `CaveatFamily`, `MonoFamily` at the bundled resources.

For the web app, copy the three CSS files from `Web Rewrite/design/source-prototype/styles/` into `web/styles/` and import `tokens.css` from the Next.js root layout. The CSS variables become available to every component. Use Tailwind CSS or CSS Modules on top — the tokens are CSS custom properties, so any styling approach can consume them. For type-safe access, also import the parallel `design-tokens.ts` file (described in Section 6 of the Design System spec).

#### Step 3 — Create CLAUDE.md

In the repo root, create a short CLAUDE.md. Example:

```markdown
# Story-Tail Adventures — Web & Mobile CRM Rewrite

A custom CRM replacing Travefy for Story-Tail Adventures (hosted by Inteletravel).
This is a Kotlin Multiplatform project with a Next.js web app.

## Authoritative project documents
- BRD: `docs/BRD.md`
- Screen Inventory: `docs/Screen-Inventory.md`
- Data Model: `docs/Data-Model.md`
- Design System: `docs/Design-System.md`
- Tech Recommendations: `docs/Tech-Recommendations.md`

Read these before answering anything substantive about features, screens,
entities, or the design system.

## Stack
- KMP shared module (Kotlin) — mobile only: domain types, validation, API clients
- Compose Multiplatform — Android + iOS UI
- Next.js + React + TypeScript — web (authenticated portal + public pages)
- Supabase Edge Functions (Deno + TypeScript) — server-side logic, Stripe, travel APIs, webhooks
- Supabase — Postgres + Auth + Storage + Realtime
- Stripe — payment tokenization (NEVER store PAN in our DB)

## Key conventions
- All money is stored as `bigint` cents with explicit `char(3)` currency code.
- Every UUID is v7 (time-ordered).
- Every mutating Edge Function writes an AuditEvent via the shared audit-middleware helper.
- Stripe `PaymentMethod` IDs are server-only — never returned to clients except via the audited PAN reveal flow.
- Mobile and web share the API contract via OpenAPI + codegen; do not hand-write the contract twice.

## Common commands
- Run web: `pnpm --filter web dev`
- Run Android: open `mobile/` in Android Studio, Run
- Run iOS: open `mobile/iosApp/iosApp.xcodeproj` in Xcode, Run
- Build mobile shared: `cd mobile && ./gradlew :shared:build`
- Apply DB migrations: `supabase db push`
- Deploy Edge Functions: `supabase functions deploy <name>`
- Generate TS types from DB: `supabase gen types typescript --local > web/types/supabase.ts`
- Generate API types from OpenAPI: `pnpm --filter contracts generate`

## What NOT to do
- Don't add cardholder data fields to the data model.
- Don't introduce SDKs that haven't passed a security review.
- Don't refactor screen-level structure that deviates from the Design System
  without first checking the Screen Inventory's Pattern Mapping.
```

Better: run `/init` in Claude Code first, let it scan the repo, then edit its output down to something tight like the above.

#### Step 4 — Set up project Skills

Create skills in `.claude/skills/`:

- **`new-screen/SKILL.md`** — "Implement a screen from the Screen Inventory. Args: screen ID (e.g., `2.2.3 Trip Detail`). Reads the inventory, the matching prototype JSX in `docs/design/source-prototype/screens/`, and builds the Compose (or React) implementation following the design tokens."
- **`new-entity/SKILL.md`** — "Add an entity from the Data Model. Generates the Flyway migration, the Exposed DSL table, the Kotlin data class in the shared module, and the Ktor route stubs."
- **`audit-pci/SKILL.md`** — "Check whether a code change touches PCI scope. Greps for card-data adjacent code, checks logging configs for PAN-scrubbing, verifies no Stripe `PaymentMethod` IDs are returned in API responses to client roles."
- **`run-vulnerability-scan/SKILL.md`** — "Trigger a quarterly ASV scan and capture the report."

Commit `.claude/` to source control.

#### Step 5 — Build the database first

Have Claude generate the initial Supabase migrations from the Data Model. The Data Model already has Postgres DDL inline; Claude can transcribe it directly into `supabase/migrations/<timestamp>_initial.sql`. Apply with `supabase db push` against a local Supabase project (started via `supabase start`). Verify the schema in the Supabase Studio UI.

#### Step 6 — Build one Phase 1 screen end-to-end

Don't try to build all 168 screens in parallel. Pick one MVP-critical screen — **2.1.1 Login** is a good choice because it touches auth, the design system, and both mobile + web — and build it end-to-end:

1. Compose Multiplatform login screen (`mobile/shared/.../ui/auth/LoginScreen.kt`)
2. Next.js login page (`web/app/login/page.tsx`)
3. Both clients call Supabase Auth directly via the official SDKs (no Edge Function needed for login itself — Supabase Auth provides REST/SDK endpoints)
4. Once logged in, both clients hold a Supabase JWT and use it to call Edge Functions for sensitive operations

This proves the architecture works before broadening. From there, you can parallelize: one feature area per developer / per week.

#### Step 7 — Establish the verification loop

Set up Claude Code to use **plan mode** for non-trivial work and **sub-agents** for verification:

- Plan mode (Shift+Tab to toggle) — Claude proposes a plan before editing files. Use it for any change touching multiple files.
- Code review sub-agent — after Claude finishes a feature, dispatch a code-reviewer sub-agent to check the diff. Anthropic ships one in Claude Code by default.
- PCI-audit Skill — run before each release.

#### Step 8 — CI + deploy from day one

Don't wait until Phase 1 is done to set up CI. Add a GitHub Actions workflow that, on every PR:

- Runs `pnpm test` for the web and contracts packages
- Runs `cd mobile && ./gradlew check` for mobile
- Verifies Edge Functions compile via `supabase functions verify`
- Verifies migrations apply cleanly via `supabase db push --dry-run`

On merges to main:

- Web auto-deploys to Vercel (their GitHub integration)
- Edge Functions deploy via `supabase functions deploy --project-ref <prod>`
- Migrations apply via `supabase db push --linked`
- Mobile artifacts (AAB for Android, IPA for iOS) build for staging via Fastlane or EAS

### 5.4 Working Style with Claude Code

A few patterns that tend to compound nicely:

- **Use `@-mentions` for file references.** Don't paste files into the chat — `@docs/BRD.md` is cleaner, gets tokenized better by Claude, and shows up in the audit log.
- **Keep CLAUDE.md short.** Add things, but prune them too. If a section hasn't been useful in three weeks, delete it.
- **Use Skills for repeated workflows.** The first time you write "implement screen X", you might prompt manually. After the second or third time, codify it as a Skill.
- **Use sub-agents for verification.** Don't have the same Claude that wrote the code also review it. Spawn a separate code-reviewer sub-agent with no prior context.
- **Don't trust the build script — run the tests.** Claude will tell you "I built and tested this" — always verify by running the actual commands. Trust but verify.
- **Commit `.claude/`.** Your skills are project artifacts. Treat them like code.

---

## 6. Recommended Stack — One-Page Summary

| Layer | Choice | Why |
|---|---|---|
| Mobile UI (Android + iOS) | Compose Multiplatform | Stable, shares code via KMP module |
| Web UI | Next.js + React + TypeScript | SEO, mature ecosystem, hiring market |
| KMP shared module | Mobile only (Android + iOS) | Domain types, validation, API clients for mobile |
| Backend / server-side logic | Supabase Edge Functions (Deno + TypeScript) | Stripe, travel APIs, audit, webhooks — no separate host needed |
| Database | Supabase Postgres | Matches Data Model, SOC 2 + HIPAA |
| Auth | Supabase Auth | Replaces Auth0/Clerk recommendation |
| File storage | Supabase Storage | Same platform |
| Real-time | Supabase Realtime | Postgres logical replication → WebSocket |
| Payments / card vault | Stripe Elements + Stripe Mobile SDKs | SAQ A eligible, mature SDKs |
| Web hosting | Vercel | Native Next.js home |
| Backend hosting | (none separate — Supabase hosts Edge Functions) | One fewer vendor |
| Email | Postmark or Resend | Transactional only |
| Observability | Sentry | Free tier covers MVP |
| ASV scans | Trustwave / SecurityMetrics / Qualys | Quarterly PCI requirement |
| API contract | OpenAPI spec + generated TS types + generated Kotlin types | One source of truth across mobile + web + backend |
| Build tool | Turborepo or Nx monorepo · Gradle (mobile) · pnpm (web/contracts) · Supabase CLI | Standard for each toolchain |
| CI/CD | GitHub Actions | Standard, free for small repos |
| Workflow | Claude Code with `CLAUDE.md` + Skills | Documented in Section 5 |

Estimated **MVP run-rate cost**: $50–$250/month across all services at launch volume — Supabase free tier + Vercel free tier cover early traffic.

---

## 7. Open Questions

A few decisions still need confirmation with stakeholders before final commit.

**Supabase Auth — MFA validation.** Supabase Auth is committed in the recommended stack but the agent's required-MFA flow needs validation against Supabase Auth's MFA capabilities (TOTP, SMS, backup codes). Confirm this with a small spike before the activation screens are built. If Supabase Auth's MFA proves insufficient, fall back to Auth0 — but this is a near-certainty rather than a likely fork given Supabase's MFA capabilities as of 2026.

**Edge Functions execution limits.** Supabase Edge Functions have a 150-second execution limit on the free tier (2× that on Pro). Verify that the longest-running Edge Function (likely Inteletravel CSV import for large statements, or a Stripe Vault and Forward call with a slow supplier endpoint) fits comfortably within that budget. If not, the workaround is to break the work into smaller Edge Functions or use a queue pattern with Supabase Realtime triggers.

**Domain registration.** The app subdomain (`app.story-tail.com`) needs to be reserved before the public landing page can go live. Coordinate with DNS owner.

**Apple Developer + Google Play accounts.** Required to publish the mobile apps. Apple Developer Program is $99/year; Google Play is a one-time $25. Register these as soon as the build starts so app review timing doesn't gate launch.

**Stripe account setup.** A Stripe business account in Story-Tail Adventures' name is required. Stripe will request business documentation. Note: even though Story-Tail is not the merchant of record on client purchases, you'll still want a Stripe account for tokenization and for any future planning-fee or B2B billing (the latter is currently prohibited by Inteletravel policy per BRD 10.5).

**Inteletravel API discovery.** The BRD's open question on whether Inteletravel offers any API access remains open. Worth checking with Inteletravel directly before Phase 2 commission reconciliation work begins.

**Supplier payment-method survey.** Before Phase 1 ends, classify the top 10–20 suppliers Story-Tail books most by `payment_method_kind` (api vs portal — see Data Model §8.1). The ratio determines whether Stripe-only remains viable through Phase 2 or whether Spreedly should be added earlier. Start with the most-booked suppliers: Sandals (portal), Royal Caribbean (portal), Norwegian (portal), Carnival (portal), Inteletravel cruise tools (portal), Expedia (API). If the supplier mix is overwhelmingly portal-only — as is expected for Caribbean/all-inclusive specialists — the eventual Spreedly migration becomes a stronger case.


---

## 8. Sources

### KMP / Compose Multiplatform for Web

- [Get started with Kotlin/Wasm and Compose Multiplatform — JetBrains](https://kotlinlang.org/docs/wasm-get-started.html)
- [Present and Future of Kotlin for Web — JetBrains Blog](https://blog.jetbrains.com/kotlin/2025/05/present-and-future-kotlin-for-web/)
- [Compose Multiplatform for Web — JetBrains landing page](https://lp.jetbrains.com/cmp-for-web/)
- [Is Kotlin Multiplatform production ready in 2026? — kmpship.app](https://www.kmpship.app/blog/is-kotlin-multiplatform-production-ready-2026)
- [Kotlin/Wasm overview — Kotlin Documentation](https://kotlinlang.org/docs/wasm-overview.html)

### Supabase vs Firebase

- [Supabase vs Firebase: 8 Tests, 1 Winner [2026] — Tech Insider](https://tech-insider.org/supabase-vs-firebase-2026/)
- [Supabase vs. Firebase: a Complete Comparison in 2026 — Bytebase](https://www.bytebase.com/blog/supabase-vs-firebase/)
- [Supabase vs Firebase Database 2026: Complete Comparison — Structa](https://trystructa.com/blog/supabase-vs-firebase-database)
- [Supabase Review 2026 — Hackceleration](https://hackceleration.com/supabase-review/)

### PCI Compliance

- [What is PCI DSS compliance? — Stripe](https://stripe.com/guides/pci-compliance)
- [Can you use Stripe for PCI DSS? — cside Blog](https://cside.com/blog/can-you-use-stripe-for-pci-dss)
- [Do I Need PCI Compliance with Stripe? — PCI Policy Portal](https://pcipolicyportal.com/white-papers/need-pci-compliance-stripe-question-answer/)
- [PCI Compliance Checklist 2026: The Merchant's Guide to DSS 4.0.1 — Strictly Zero](https://strictlyzero.com/announcements/payments-announcements/pci-compliance-checklist-2026-the-merchants-guide-to-dss-4-0-1/)
- [PCI DSS Tokenization Guidelines — PCI Security Standards Council](https://www.pcisecuritystandards.org/documents/Tokenization_Guidelines_Info_Supplement.pdf)
- [PCI Security Standards Council Document Library](https://www.pcisecuritystandards.org/document_library/)
- [PCI DSS Compliance for SaaS (2026 Guide) — xflowpay](https://www.xflowpay.com/blog/pci-dss-compliance-for-saas)

### Claude Code

- [Claude Code Cheat Sheet: Every Command, Shortcut, and Slash Command (2026) — Claude Directory](https://www.claudedirectory.org/blog/claude-code-cheat-sheet)
- [Claude Code Slash Commands: Complete Reference Guide 2026 — Learnia](https://learn-prompting.fr/blog/claude-code-slash-commands-reference)
- [Best Claude Code Skills in 2026: 20 Slash Commands to Install — Toolradar](https://toolradar.com/blog/best-claude-code-skills-2026)
- [How I use Claude Code (+ my best tips) — Builder.io](https://www.builder.io/blog/claude-code)
- [How to Use Claude Code: A Guide to Slash Commands, Agents, Skills, and Plug-ins — Product Talk](https://www.producttalk.org/how-to-use-claude-code-features/)
- [Slash Commands in the SDK — Claude Code Docs](https://code.claude.com/docs/en/agent-sdk/slash-commands)

---

*Story-Tail Adventures — Making Travel an Adventure*
