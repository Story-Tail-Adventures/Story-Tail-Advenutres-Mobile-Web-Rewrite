# Data Model
## Story-Tail Adventures — Web & Mobile CRM Platform

**Document Owner:** Gyasi Story — Owner / Travel Advisor
**Audience:** Internal — engineering, data, security
**Version:** 1.0 — Draft
**Date:** May 14, 2026
**Companion Documents:** BRD.md, Screen-Inventory.md

---

## 1. Executive Summary

This document defines the data structure that backs the Story-Tail Adventures platform across the web app, the mobile app, and the Ktor backend. It catalogues every domain entity the system needs, specifies the fields and relationships, and provides both Postgres physical-schema definitions and Kotlin data class shapes for the shared Kotlin Multiplatform module.

The model is designed around three north-star priorities established in the BRD:

**Operational replacement of Travefy** without losing any of the fidelity Travefy offers around client management, proposals, itineraries, payment authorization, and trip history. Every Travefy concept has a home here.

**Strict PCI posture.** Cardholder data never sits raw in our database. We store Stripe-issued tokens, never the PAN, and every interaction with a stored card is audit-logged. Section 9 spells this out in detail.

**Future-readiness for multi-agent and group-trip use cases.** Every entity that needs to know "which agent" or "which travel group" carries the right foreign keys today, even though MVP runs with a single agent.

The model spans roughly 40 entities organized into 12 domains. Most of them are needed in Phase 1 (MVP). Phase 2 adds search, leads, and API integration entities. Phase 3 adds multi-agent and group-trip entities. Every entity in this document is tagged with its phase so the implementation team can build incrementally without retrofitting.

---

## 2. Design Principles

These principles guide the choices in this model. Where the model deviates from a principle, the deviation is called out inline.

**UUIDs everywhere for primary keys.** Every entity uses a UUID v7 (time-ordered) as its primary key. This avoids the operational pain of integer sequences, makes records safe to expose in URLs and APIs, and is friendly to client-generated IDs for offline mobile work.

**Soft delete by default.** Most entities use `archived_at` rather than `DELETE`. Trip records, commission records, audit events, and financial documents are retained indefinitely for tax and compliance reasons. True deletion happens only for personal data on explicit client request (see Section 11).

**Timestamps on everything.** Every entity carries `created_at` and `updated_at`. Append-only entities (audit logs, message history, card use events) carry only `created_at` because they don't mutate.

**Strong typing through enums.** Status values, document types, supplier categories, and similar lookups are modeled as Postgres enums (or check-constrained text) rather than free-text strings. Section 7 catalogues every enum.

**Sensitivity classification on every field.** Each field is labeled with one of: Public, Internal, PII, Sensitive PII, or Tokenized. The classification drives encryption-at-rest decisions, access logging requirements, and export/erasure handling.

**Optimistic concurrency on mutable entities.** Trips, Itineraries, Clients, and Proposals carry a `version` integer that increments on every save. This lets the mobile/web client and the backend detect conflicting edits — important when an agent and a client are both interacting with the same trip.

**One source of truth in the KMP shared module.** Domain types are defined once in the KMP shared module and compiled into the backend, the Android app, the iOS app, and the web app. The backend exposes JSON over HTTP that maps 1:1 to those shared types using `kotlinx.serialization`. Section 11 describes the layout.

**Schema migrations are versioned and forward-only.** We use Flyway-style numbered migration files; no down-migrations in production. Rolling forward is always preferred to rolling back.

**No premature multi-tenancy.** We model `agent_id` as a foreign key on entities the agent owns, but we do not partition the database by agency. If Story-Tail Adventures ever sells the platform to other agencies (Phase 4+), that's a database refactor with a forklift migration — and that's fine because we'll have learned a lot about what tenants actually need by then.

---

## 3. How To Read This Document

This document follows a consistent shape:

Section 4 is an **entity inventory** — a table listing every entity with its domain, phase, and one-line purpose. Use it as the map.

Sections 5 through 16 are **per-entity detail sections**, organized by domain. Each entity is presented with: purpose, phase marker, field list (with type, nullability, and sensitivity), relationships, indexes, constraints, notes, a Postgres DDL snippet, and a Kotlin data class snippet.

Sections 17 through 22 are **cross-cutting topics**: enums, PCI handling, multi-tenancy and sharing, audit/soft-delete patterns, KMP implementation notes, and migration strategy.

The final section is **Open Questions** — areas where the model is intentionally underspecified pending business or technical decisions.

### Sensitivity Markers

| Marker | Meaning | Treatment |
|---|---|---|
| **Public** | No protection beyond auth | Standard storage; standard logging |
| **Internal** | Internal business data, not customer-facing | Agent-scoped access; no special encryption |
| **PII** | Personally identifiable information | Encrypted at rest (column-level or table-space); access audit-logged |
| **Sensitive PII** | Government IDs, DOB, passport numbers | Encrypted at rest; MFA-gated access; full audit trail on every read |
| **Tokenized** | Never stored raw — only an opaque reference (Stripe token) | The raw value lives at Stripe; we hold only the token |

### Phase Markers

| Marker | Meaning |
|---|---|
| **P1** | Phase 1 MVP — must exist at launch |
| **P2** | Phase 2 — self-guided search, leads, API integrations |
| **P3** | Phase 3 — multi-agent, group trips, deeper booking workflows |
| **P4** | Phase 4+ — future / aspirational |

---

## 4. Entity Inventory

| Entity | Domain | Phase | Purpose |
|---|---|---|---|
| Account | Identity | P1 | Authentication-level identity (one per login email) |
| User | Identity | P1 | Platform user record with role (Client / Agent / Admin) |
| Session | Identity | P1 | Active session tracking for security/audit |
| MfaDevice | Identity | P1 | Registered MFA method (TOTP, SMS, backup codes) |
| AuthEvent | Identity | P1 | Audit of login attempts and security events |
| Client | Client | P1 | Traveler profile (the end customer) |
| TravelPreference | Client | P1 | Preferences captured during onboarding |
| Companion | Client | P1 | Recurring travel companion linked to a client |
| TravelDocument | Client | P1 | Passport, visa, insurance certificate, etc. |
| Address | Client | P1 | Reusable address record (linked to client) |
| ClientNote | Client | P1 | Internal agent note on a client |
| ClientInvite | Client | P1 | Single-use code linking a pre-created Client to a new Account |
| Agent | Agent | P1 | Advisor profile |
| AgentInvitation | Agent | P3 | Pending agent activation (multi-agent) |
| AgentAvailability | Agent | P1 | Working hours and time zone |
| Supplier | Trip | P1 | Resort, cruise line, tour operator, etc. |
| Trip | Trip | P1 | Core unit of work — one trip end-to-end |
| TripComponent | Trip | P1 | Flight, hotel, cruise, transfer, excursion, etc. |
| Itinerary | Trip | P1 | Day-by-day presentation derived from the trip |
| ItineraryDay | Trip | P1 | One day within an itinerary |
| ItineraryActivity | Trip | P1 | One activity block within a day |
| Proposal | Trip | P1 | Snapshot of a trip presented to the client |
| TripTemplate | Trip | P1 | Reusable trip skeleton |
| Testimonial | Trip | P1 | A client's reflection on a completed trip, gated by approval |
| PaymentCard | Payment | P1 | **Tokenized** card vaulted at Stripe |
| CardAuthorization | Payment | P1 | Client's consent to use a card for a specific trip |
| AuthorizationRequest | Payment | P1 | Pending request for the client to authorize a card |
| CardUseEvent | Payment | P1 | Append-only log of every supplier-payment use |
| PaymentMilestone | Payment | P1 | Supplier payment schedule for a trip (deposit / interim / final) |
| Commission | Commission | P1 | Expected/received commission per trip per supplier |
| CommissionImport | Commission | P1 | Batch record for an Inteletravel CSV import |
| Lead | Lead | P2 | Quote request originating from public search |
| LeadSource | Lead | P2 | Origin of a lead (search inspiration tile, ad, referral) |
| Conversation | Communication | P1 | Threaded conversation between client and agent |
| Message | Communication | P1 | Individual message within a conversation |
| MessageAttachment | Communication | P1 | File attached to a message |
| MessageTemplate | Communication | P1 | Reusable email/message template |
| NotificationPreference | Communication | P1 | Per-user notification channel matrix |
| Document | Document | P1 | Generic file/asset (uploaded or generated) |
| SavedSearch | Search | P2 | Persisted search criteria for a client |
| Favorite | Search | P2 | Bookmarked search result |
| CruiseLine | Cruise Catalog | P2 | A cruise line, as synced provider content plus an editorial layer |
| CruiseShip | Cruise Catalog | P2 | A ship in a line's fleet, with its coverage window |
| CruisePort | Cruise Catalog | P2 | An embarkation port or port of call |
| CruiseSailing | Cruise Catalog | P2 | One dated departure — what a quote request points at |
| CruisePortCall | Cruise Catalog | P2 | One itinerary stop on a sailing, in order |
| CruiseSailingCabinPrice | Cruise Catalog | P2 | Per-cabin per-person fare for a sailing |
| CruiseSyncScope | Cruise Catalog | P2 | What the cruise sync may fetch — configuration, not code |
| CruiseSyncRun | Cruise Catalog | P2 | One invocation of the cruise sync and what it spent |
| CruiseApiRequest | Cruise Catalog | P2 | Append-only ledger of every provider HTTP call (quota) |
| AuditEvent | System | P1 | Append-only log of significant actions |
| Integration | System | P2 | Configuration record for an external API (Amadeus, Hotelbeds, etc.) |
| FeatureFlag | System | P1 | Optional — toggles for partial rollouts |
| TripGroup | Group Trip | P3 | A group trip linking multiple clients |
| GroupMember | Group Trip | P3 | Co-traveler participating in a group trip |

---

## 5. Identity Domain

### 5.1 Account

**Purpose:** The lowest level of identity. One account per login email. An account may belong to a Client or an Agent (one User of one type — the role determines which entry surfaces and screens are available).

**Phase:** P1

| Field | Type | Nullable | Sensitivity | Notes |
|---|---|---|---|---|
| `id` | `uuid` | No | Public | UUID v7 primary key |
| `email` | `citext` | No | PII | Unique. Citext = case-insensitive |
| `email_verified_at` | `timestamptz` | Yes | Internal | Null until verified |
| `password_hash` | `text` | Yes | Tokenized | Null when social-only login |
| `auth_provider` | `text` | No | Internal | `email`, `google`, `apple` |
| `auth_provider_id` | `text` | Yes | Internal | OAuth subject ID where applicable |
| `mfa_required` | `boolean` | No | Internal | `true` for all Agent accounts |
| `mfa_enrolled_at` | `timestamptz` | Yes | Internal | Null until MFA setup completes |
| `locked_at` | `timestamptz` | Yes | Internal | Non-null when account is locked |
| `locked_reason` | `text` | Yes | Internal | Free text from agent or system |
| `last_login_at` | `timestamptz` | Yes | Internal | — |
| `created_at` | `timestamptz` | No | Public | — |
| `updated_at` | `timestamptz` | No | Public | — |
| `archived_at` | `timestamptz` | Yes | Public | Soft delete |

**Relationships:**
- One Account → One User (1:1; the User record holds the role)
- One Account → Many Sessions
- One Account → Many MfaDevices
- One Account → Many AuthEvents

**Indexes:** unique on `(email)` where `archived_at is null`; index on `(last_login_at)` for activity reports.

#### 5.1.1 Relationship to Supabase Auth

`account.id` **is** `auth.users.id` — the same UUID, enforced by a foreign key with
`ON DELETE CASCADE`. Supabase Auth (GoTrue) creates the `auth.users` row; a
`SECURITY DEFINER` trigger, `public.handle_new_user()`, then creates the matching
`account`, `client`, and `platform_user` rows in one transaction.

Sharing the key matters for more than tidiness: it makes the JWT `sub` claim resolve
straight to `account.id`, so `_shared/auth.ts` does one hop to reach `platform_user`
instead of two, on every authenticated request.

**GoTrue owns credential state; `account` is the product-facing projection.** The schema
defines `account.password_hash`, `session`, `mfa_device`, and `auth_event`, all of which
shadow something GoTrue already maintains (`auth.users.encrypted_password`,
`auth.sessions`, `auth.mfa_factors`, `auth.audit_log_entries`). Do not double-implement:

| Concern | System of record | Our table's role |
|---|---|---|
| Password | `auth.users.encrypted_password` | `account.password_hash` stays **null**. Never write to it. |
| Name at sign-up | `auth.users.raw_user_meta_data` | `handle_new_user()` reads it in claim order — see below |
| Active sessions | `auth.sessions` | `session` backs the "Active Sessions" screen (device labels, revoke UI) |
| MFA factors | `auth.mfa_factors` | `mfa_device` backs the security-settings UI; the secret stays in GoTrue |
| Auth history | `auth.audit_log_entries` | `auth_event` is the user-visible security log |

**Where a new Client's name comes from.** `handle_new_user()` takes it from
`raw_user_meta_data` in order of how much the source actually knew:

1. `first_name` / `last_name` — our own forms (`registerAction`, the 2.0.6 gate) send
   exactly these two keys and nothing else
2. `given_name` / `family_name` — the OIDC standard claims, which is what a social sign-in
   provides; `signInWithOAuth` has no `options.data`, so it cannot send our keys
3. `name` / `full_name`, split on the first space
4. the placeholders `New` / `Traveler`

Branch 2 exists because without it every Google and Apple sign-up created
`client.first_name = 'New'` — not just in the greeting but in the CRM row, on the trip, and
as the "agent's spelling" that adoption preserves. Branch 4 stays reachable regardless:
Apple sends name claims on the first authorization only and nothing on later ones.

**A CONFIRMED sign-up adopts an existing Client; sign-up itself never does.** The agent
routinely creates a Client record — and starts planning a trip against it — before the
traveler has an account (§6.1). Connecting the two is the "auto-match notice if the
platform detects existing records by email" in Screen Inventory 2.1.13.

*When* that connection is made is a security decision, and it is not at sign-up. Two
triggers, not one:

| Trigger | Fires on | Does |
|---|---|---|
| `handle_new_user()` | `AFTER INSERT ON auth.users` | Creates `account`, a **fresh** `client`, and `platform_user` |
| `handle_user_email_confirmed()` | `AFTER UPDATE OF email_confirmed_at`, `NULL` → non-null | Repoints `platform_user.client_id` at the pre-created Client and disposes of the fresh one |

An INSERT into `auth.users` happens the instant somebody types an address into a form.
Nobody has demonstrated they can read mail sent there. Adopting the pre-created record at
that moment would hand whoever knows a traveler's email address their name, phone, tags and
trips — and because `platform_user_client` is unique, it would also *consume* the record, so
the real traveler's later sign-up finds nothing to adopt and lands in a blank account while
the stranger keeps theirs. That is true even with confirmations on, where the stranger never
receives a session: the binding is already made and the rightful owner is locked out of
their own history. The `email_confirmed_at` transition is the first moment anything about
mailbox ownership has been shown, and only GoTrue performs it.

**This depends on `enable_confirmations` being on** (`supabase/config.toml`). With
confirmations off, GoTrue confirms the address itself milliseconds after the insert, and the
transition stops meaning anything. `.github/scripts/check_auth_config.py` fails the build if
that setting is ever flipped.

Two further rules keep the match itself safe. It requires exact `citext` email equality,
never a fuzzy name match, because attaching a stranger's trips to an account is far worse
than making someone type an invite code. And it requires the Client to be unclaimed — no
`platform_user` pointing at it — so a second sign-up on a shared address cannot take over a
Client already bound to somebody's account. Where two or more unclaimed rows match, nothing
is adopted: duplicates are a real state (Screen 3.9.7 exists to merge them) and guessing
between them would show one traveler another's trips. The invite-code path against
ClientInvite (§6.7) resolves that case, and the case where the traveler signs up with a
different address than the agent has on file, deliberately rather than by inference.

**Which agent owns a self-registered client?** `client.agent_id` is `NOT NULL`, so the
trigger has to choose one. It reads `agent_id` from the signup's `raw_user_meta_data`
when present (the Screen Inventory 2.1.13 invite-code path), and otherwise falls back to
the sole active agent. With more than one active agent and no invite code the trigger
raises, rather than silently assigning a client to the wrong book of business — that is a
P3 multi-agent decision, and it should surface as an error rather than a data problem.

**Postgres DDL:**

```sql
CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE account (
    id              uuid PRIMARY KEY,
    email           citext NOT NULL,
    email_verified_at timestamptz,
    password_hash   text,
    auth_provider   text NOT NULL CHECK (auth_provider IN ('email','google','apple')),
    auth_provider_id text,
    mfa_required    boolean NOT NULL DEFAULT false,
    mfa_enrolled_at timestamptz,
    locked_at       timestamptz,
    locked_reason   text,
    last_login_at   timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    archived_at     timestamptz
);

CREATE UNIQUE INDEX account_email_active
    ON account (email) WHERE archived_at IS NULL;
CREATE INDEX account_last_login ON account (last_login_at);
```

**Kotlin (shared module):**

```kotlin
@Serializable
data class Account(
    val id: Uuid,
    val email: String,
    val emailVerifiedAt: Instant? = null,
    val authProvider: AuthProvider,
    val authProviderId: String? = null,
    val mfaRequired: Boolean,
    val mfaEnrolledAt: Instant? = null,
    val lockedAt: Instant? = null,
    val lockedReason: String? = null,
    val lastLoginAt: Instant? = null,
    val createdAt: Instant,
    val updatedAt: Instant,
    val archivedAt: Instant? = null
)
// passwordHash is intentionally not exposed in the shared model — backend-only.

@Serializable
enum class AuthProvider { EMAIL, GOOGLE, APPLE }
```

### 5.2 User

**Purpose:** Platform-level identity carrying the role and linking to either a Client or Agent profile. Sits between Account (auth) and Client/Agent (domain).

**Phase:** P1

| Field | Type | Nullable | Sensitivity | Notes |
|---|---|---|---|---|
| `id` | `uuid` | No | Public | UUID v7 |
| `account_id` | `uuid` | No | Public | FK → Account |
| `role` | `user_role` (enum) | No | Internal | `client`, `agent`, `admin` |
| `client_id` | `uuid` | Yes | Public | FK → Client when role = client |
| `agent_id` | `uuid` | Yes | Public | FK → Agent when role = agent |
| `display_name` | `text` | No | PII | Shown across the app |
| `avatar_url` | `text` | Yes | Public | Stored at S3/R2 |
| `time_zone` | `text` | No | Internal | IANA time zone (e.g., `America/Chicago`) |
| `locale` | `text` | No | Internal | BCP-47 (e.g., `en-US`) |
| `onboarding_step` | `text` | Yes | Internal | Which 2.1.x step the wizard is waiting on, e.g. `profile`. Null before it starts and after it finishes |
| `onboarding_completed_at` | `timestamptz` | Yes | Internal | Null until the client finishes (or skips through) the 2.1.9–2.1.14 wizard |
| `created_at` | `timestamptz` | No | Public | — |
| `updated_at` | `timestamptz` | No | Public | — |

**Relationships:**
- One Account → One User (1:1)
- One User → 0..1 Client or 0..1 Agent (depending on role)

**Indexes:** unique on `(account_id)`; unique on `(client_id) where client_id is not null`; unique on `(agent_id) where agent_id is not null`.

**Constraints:** A check constraint enforces that exactly one of `client_id` or `agent_id` is set when `role` is `client` or `agent` respectively. Admin role may have neither.

**Postgres DDL:**

```sql
CREATE TYPE user_role AS ENUM ('client','agent','admin');

CREATE TABLE platform_user (
    id           uuid PRIMARY KEY,
    account_id   uuid NOT NULL REFERENCES account(id),
    role         user_role NOT NULL,
    client_id    uuid REFERENCES client(id),
    agent_id     uuid REFERENCES agent(id),
    display_name text NOT NULL,
    avatar_url   text,
    time_zone    text NOT NULL DEFAULT 'America/Chicago',
    locale       text NOT NULL DEFAULT 'en-US',
    onboarding_step         text,
    onboarding_completed_at timestamptz,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now(),
    CHECK (
        (role = 'client'  AND client_id IS NOT NULL AND agent_id IS NULL) OR
        (role = 'agent'   AND agent_id  IS NOT NULL AND client_id IS NULL) OR
        (role = 'admin')
    )
);

CREATE UNIQUE INDEX platform_user_account ON platform_user(account_id);
CREATE UNIQUE INDEX platform_user_client  ON platform_user(client_id) WHERE client_id IS NOT NULL;
CREATE UNIQUE INDEX platform_user_agent   ON platform_user(agent_id)  WHERE agent_id  IS NOT NULL;
```

Table name is `platform_user` to avoid colliding with the Postgres reserved word `user`.

`onboarding_step` is where the wizard resumes. Pattern G (Screen-Inventory §4.3) promises
"the ability to save progress and resume later", and `onboarding_completed_at` alone cannot
keep that promise — it says whether the wizard is done, not where it got to, so an
abandoned wizard restarts from the welcome screen. It holds the slug of the step waiting to
be filled in, is advanced as each step is saved, and is cleared when the wizard completes.

It is stored rather than derived from the data because the two disagree in exactly the case
that matters: somebody who deliberately skipped a step has no row to infer from, and a
derived cursor would send them back to a screen they already declined.

`onboarding_completed_at` is what routes a first sign-in to Screen 2.1.9 Welcome instead
of the dashboard. It lives here rather than on Client because it describes the *account
holder's* progress through a wizard, not a fact about the traveler: an agent-created
Client that nobody has signed into has no onboarding state to record. Skipping every
optional step still sets it — the wizard being "done" is not the same as the profile being
complete, and conflating the two would trap someone in the wizard forever.

**Kotlin:**

```kotlin
@Serializable
data class User(
    val id: Uuid,
    val accountId: Uuid,
    val role: UserRole,
    val clientId: Uuid? = null,
    val agentId: Uuid? = null,
    val displayName: String,
    val avatarUrl: String? = null,
    val timeZone: String,
    val locale: String,
    val onboardingStep: String? = null,
    val onboardingCompletedAt: Instant? = null,
    val createdAt: Instant,
    val updatedAt: Instant
)

@Serializable
enum class UserRole { CLIENT, AGENT, ADMIN }
```

### 5.3 Session

**Purpose:** Active authenticated sessions. Each device/browser gets a session; the agent's Security Settings shows them. Used for "sign out all devices" and suspicious-activity reviews.

**Phase:** P1

| Field | Type | Nullable | Sensitivity | Notes |
|---|---|---|---|---|
| `id` | `uuid` | No | Public | — |
| `account_id` | `uuid` | No | Public | FK → Account |
| `device_label` | `text` | No | Internal | Parsed from user agent (e.g., "iPhone 15") |
| `ip_address` | `inet` | No | PII | — |
| `ip_country` | `char(2)` | Yes | Internal | Geo-resolved at start |
| `user_agent` | `text` | No | Internal | Raw UA |
| `started_at` | `timestamptz` | No | Public | — |
| `last_active_at` | `timestamptz` | No | Public | — |
| `revoked_at` | `timestamptz` | Yes | Public | Set on explicit sign-out |
| `expires_at` | `timestamptz` | No | Public | Hard expiration |

**Indexes:** index on `(account_id, last_active_at desc)`.

**Notes:** Session tokens are not stored here — they're JWT or opaque tokens validated server-side. This table is the audit/management surface.

### 5.4 MfaDevice

**Phase:** P1

| Field | Type | Nullable | Sensitivity | Notes |
|---|---|---|---|---|
| `id` | `uuid` | No | Public | — |
| `account_id` | `uuid` | No | Public | FK → Account |
| `kind` | `mfa_kind` enum | No | Internal | `totp`, `sms`, `backup_codes` |
| `label` | `text` | No | Internal | User-friendly ("Authy on iPhone") |
| `secret_encrypted` | `bytea` | Yes | Sensitive PII | TOTP secret, encrypted column-level. For SMS this stores the verified phone number encrypted. |
| `is_primary` | `boolean` | No | Internal | One primary per account |
| `enrolled_at` | `timestamptz` | No | Internal | — |
| `last_used_at` | `timestamptz` | Yes | Internal | — |
| `revoked_at` | `timestamptz` | Yes | Internal | — |

**Indexes:** index on `(account_id)`; partial unique index on `(account_id, is_primary) where is_primary and revoked_at is null`.

### 5.5 AuthEvent

**Purpose:** Append-only log of authentication-related events: login attempt, login success/failure, password reset request, MFA challenge, account lockout. Powers the Client Login Activity screen (3.9.6) and feeds fraud detection.

**Phase:** P1

| Field | Type | Nullable | Sensitivity | Notes |
|---|---|---|---|---|
| `id` | `uuid` | No | Public | — |
| `account_id` | `uuid` | Yes | Public | Null on failed login when email is unknown |
| `email_attempted` | `citext` | Yes | PII | Captured for failed-login forensics |
| `event_type` | `auth_event_type` enum | No | Internal | See Section 17 |
| `result` | `text` | No | Internal | `success`, `failure`, `pending` |
| `ip_address` | `inet` | No | PII | — |
| `user_agent` | `text` | No | Internal | — |
| `failure_reason` | `text` | Yes | Internal | When result = failure |
| `created_at` | `timestamptz` | No | Public | — |

**Indexes:** index on `(account_id, created_at desc)`; index on `(ip_address, created_at)` for rate limiting/fraud.

**Append-only:** no UPDATE, no DELETE except by retention policy (Section 21).

---

## 6. Client Domain

### 6.1 Client

**Purpose:** The end traveler — Story-Tail Adventures' customer. One Client per real-world person. A Client record can exist before an Account is created (the agent often sets up a record in advance and then sends an invitation); when the client registers, their Account is linked via `User.client_id`.

**Phase:** P1

| Field | Type | Nullable | Sensitivity | Notes |
|---|---|---|---|---|
| `id` | `uuid` | No | Public | — |
| `agent_id` | `uuid` | No | Public | FK → Agent (primary owner) |
| `first_name` | `text` | No | PII | — |
| `last_name` | `text` | No | PII | — |
| `preferred_name` | `text` | Yes | PII | — |
| `email` | `citext` | Yes | PII | Used for invite/link to Account |
| `phone` | `text` | Yes | PII | E.164 format |
| `date_of_birth` | `date` | Yes | Sensitive PII | For passport, supplier verification |
| `mailing_address_id` | `uuid` | Yes | Public | FK → Address |
| `important_dates` | `jsonb` | Yes | PII | Array of `{label, date, recurring}` for birthday, anniversary, etc. |
| `emergency_contact` | `jsonb` | Yes | PII | `{name, phone, relationship}`. Captured at Screen 2.1.10, edited at 2.5.2, surfaced on the itinerary and at 2.7.3 |
| `lifetime_value_cents` | `bigint` | No | Internal | Computed; cached for sort/filter. **Not granted to the client role** |
| `tags` | `text[]` | No | Internal | Free-form agent tags. **Not granted to the client role** |
| `status` | `client_status` enum | No | Internal | `active`, `archived`, `merged_into`. Agent-side lifecycle. **Not granted to the client role** |
| `merged_into_client_id` | `uuid` | Yes | Internal | When status = merged_into. **Not granted to the client role** |
| `notes` | `text` | Yes | Internal | Free-form agent notes (also see client_note table for structured history). **Not granted to the client role** |
| `created_at` | `timestamptz` | No | Public | — |
| `updated_at` | `timestamptz` | No | Public | — |
| `archived_at` | `timestamptz` | Yes | Public | — |
| `version` | `integer` | No | Client-visible | Optimistic concurrency |

> **The client is the data subject, and reads their own row — September 2026.** Sensitivity
> here describes how a field must be HANDLED, not who may see it: `date_of_birth` is Sensitive
> PII and the traveler still reads it back, because it is their own birthday and Screen 2.1.10
> prefills the form with it. What a client must not see is what the AGENT wrote about them and
> the CRM's own bookkeeping. Five fields are therefore excluded from the column grant to
> `authenticated` — `notes`, `tags`, `lifetime_value_cents`, `status` and
> `merged_into_client_id`. The other fifteen are granted.
>
> `client_self_select` alone did not achieve this. **RLS decides which ROWS; only a GRANT
> decides which COLUMNS**, and Supabase grants `SELECT` on the whole table to `authenticated`
> by default — so from the day that policy shipped, every traveler could read the agent's
> private notes on them. The `client_column_grant` migration revokes the table privilege and
> re-grants the fifteen. Note the trap: `REVOKE SELECT (col)` is a no-op against a table-level
> grant, so the table grant has to go first.
>
> A consequence worth knowing: `SELECT *` on `client` now fails outright for a client session
> rather than returning fewer columns. Every read must name its columns.

**Relationships:**
- Belongs to one Agent (primary owner). Phase 3 may add a `co_agent_id` for shared ownership.
- May have one linked Account via `User.client_id`. A Client without an Account is "agent-created and not yet activated."
- Has many Trips, Companions, TravelDocuments, PaymentCards, Conversations, Documents, ClientNotes.

**Indexes:** index on `(agent_id, status, last_name)`; index on `(email)`; full-text index on `(first_name || ' ' || last_name)` for search.

**Postgres DDL:**

```sql
CREATE TYPE client_status AS ENUM ('active','archived','merged_into');

CREATE TABLE client (
    id                      uuid PRIMARY KEY,
    agent_id                uuid NOT NULL REFERENCES agent(id),
    first_name              text NOT NULL,
    last_name               text NOT NULL,
    preferred_name          text,
    email                   citext,
    phone                   text,
    date_of_birth           date,
    mailing_address_id      uuid REFERENCES address(id),
    important_dates         jsonb DEFAULT '[]'::jsonb,
    emergency_contact       jsonb,
    lifetime_value_cents    bigint NOT NULL DEFAULT 0,
    tags                    text[] NOT NULL DEFAULT '{}',
    status                  client_status NOT NULL DEFAULT 'active',
    merged_into_client_id   uuid REFERENCES client(id),
    notes                   text,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),
    archived_at             timestamptz,
    version                 integer NOT NULL DEFAULT 1
);

CREATE INDEX client_agent_status ON client (agent_id, status, last_name);
CREATE INDEX client_email        ON client (email) WHERE email IS NOT NULL;
CREATE INDEX client_name_trgm    ON client USING gin ((first_name || ' ' || last_name) gin_trgm_ops);
```

**Kotlin:**

```kotlin
@Serializable
data class Client(
    val id: Uuid,
    val agentId: Uuid,
    val firstName: String,
    val lastName: String,
    val preferredName: String? = null,
    val email: String? = null,
    val phone: String? = null,
    val dateOfBirth: LocalDate? = null,
    val mailingAddressId: Uuid? = null,
    val importantDates: List<ImportantDate> = emptyList(),
    val emergencyContact: EmergencyContact? = null,
    val lifetimeValueCents: Long = 0,
    val tags: List<String> = emptyList(),
    val status: ClientStatus = ClientStatus.ACTIVE,
    val mergedIntoClientId: Uuid? = null,
    val notes: String? = null,
    val createdAt: Instant,
    val updatedAt: Instant,
    val archivedAt: Instant? = null,
    val version: Int = 1
)

@Serializable
data class ImportantDate(
    val label: String,          // "Birthday", "Anniversary", "Passport Expiry"
    val date: LocalDate,
    val recurring: Boolean = false
)

@Serializable
data class EmergencyContact(
    val name: String,
    val phone: String,          // E.164
    val relationship: String? = null
)

@Serializable
enum class ClientStatus { ACTIVE, ARCHIVED, MERGED_INTO }
```

### 6.2 TravelPreference

**Purpose:** Capture the client's travel style for personalization and agent reference.

**Phase:** P1

| Field | Type | Nullable | Sensitivity | Notes |
|---|---|---|---|---|
| `id` | `uuid` | No | Public | — |
| `client_id` | `uuid` | No | Public | FK → Client (1:1 in practice) |
| `preferred_destinations` | `text[]` | No | PII | — |
| `travel_styles` | `text[]` | No | PII | Closed vocabulary, CHECK-enforced: `resort`, `cruise`, `adventure`, `family`, `romantic`, `group` |
| `dietary_restrictions` | `text[]` | No | Sensitive PII | Closed vocabulary, CHECK-enforced: `none`, `vegetarian`, `pescatarian`, `gluten_free`, `halal`. Allergies fall under health-adjacent PII |
| `dietary_notes` | `text` | Yes | Sensitive PII | Free text — the allergy or condition the chips cannot say |
| `accessibility_needs` | `text[]` | No | Sensitive PII | Closed vocabulary, CHECK-enforced: `none`, `mobility`, `quiet_room`, `service_animal`. Same reasoning |
| `accessibility_notes` | `text` | Yes | Sensitive PII | Free text — the arrangement the chips cannot say |
| `loyalty_programs` | `jsonb` | No | PII | Array of `{program, number, tier}` |
| `budget_band` | `text` | Yes | PII | CHECK-enforced: `budget`, `mid`, `premium`, `luxury` |
| `favorite_past_trips` | `text` | Yes | PII | Free text — what the client loved |
| `updated_at` | `timestamptz` | No | Public | — |

**Indexes:** unique on `(client_id)`.

**Why the three slug arrays are closed and the notes are separate.** Added September 2026
with Screen 2.1.11. `travel_styles`, `dietary_restrictions` and `accessibility_needs` are
what agent-side filtering (Screen Inventory §3.9.x) will eventually group on, so a
CHECK keeps them groupable — the alternative is every future consumer defending against
prose that arrived through a free-text box. But five chips cannot say "severe tree nut
allergy" or "CPAP, needs an outlet by the bed", and those sentences are the ones an advisor
relays to a resort. So they get their own columns rather than being appended into the
arrays, where they would be indistinguishable from a slug.

**Why `none` is stored rather than an empty array.** All three arrays are `NOT NULL DEFAULT
'{}'`, so an empty array already means "the row exists and this question was left blank".
An agent needs to tell that apart from "confirmed: nothing to worry about" — one of those
means call the resort and the other means do not. `none` is mutually exclusive with every
other member of its array, enforced in the Edge Function.

### 6.3 Companion

**Phase:** P1

| Field | Type | Nullable | Sensitivity | Notes |
|---|---|---|---|---|
| `id` | `uuid` | No | Public | — |
| `client_id` | `uuid` | No | Public | FK → Client (the owning client) |
| `first_name` | `text` | No | PII | — |
| `last_name` | `text` | No | PII | — |
| `relationship` | `text` | Yes | PII | "Spouse", "Child", "Friend" |
| `date_of_birth` | `date` | Yes | Sensitive PII | For passport, supplier verification |
| `passport_number_encrypted` | `bytea` | Yes | Sensitive PII | Column-encrypted |
| `passport_expiry` | `date` | Yes | Sensitive PII | — |
| `passport_country` | `char(2)` | Yes | PII | ISO 3166-1 alpha-2 |
| `frequent_flyer_numbers` | `jsonb` | No | PII | — |
| `is_invited_to_platform` | `boolean` | No | Internal | True if invited as their own client |
| `linked_client_id` | `uuid` | Yes | Public | If they have their own Client record |
| `created_at` | `timestamptz` | No | Public | — |
| `updated_at` | `timestamptz` | No | Public | — |
| `archived_at` | `timestamptz` | Yes | Public | Soft delete, per §20.1 |

**Indexes:** index on `(client_id)`.

**Constraint:** at most 12 unarchived companions per client, enforced by a trigger. The cap
is a guard rail on a self-service form, not a business rule — a household larger than that
is added by the agent.

**Why `archived_at` arrived late.** §20.1 has always listed `companion` in the soft-delete
set and the initial migration did not give it the column, so Screen 2.1.12's "Remove" had
nothing to write and would have had to delete the row outright. Two reasons that is wrong
beyond the doc saying so: `travel_document.companion_id` references this table with no
`ON DELETE` clause, so a hard delete starts throwing a foreign-key violation the moment the
passport-scan flow links a document to a companion; and a traveler tidying their household
list has not asked for the trip records that mention those people to lose their subject.

### 6.4 TravelDocument

**Purpose:** Passport, visa, insurance certificate, or other documents the client uploads. Stored as references to `Document` for the actual file blob plus the structured metadata for expiration tracking.

**Phase:** P1

| Field | Type | Nullable | Sensitivity | Notes |
|---|---|---|---|---|
| `id` | `uuid` | No | Public | — |
| `client_id` | `uuid` | No | Public | FK → Client |
| `companion_id` | `uuid` | Yes | Public | If document belongs to a companion |
| `document_id` | `uuid` | Yes | Public | FK → Document (the file blob). Null when the client has given the details but not yet uploaded a scan |
| `kind` | `travel_doc_kind` enum | No | Internal | `passport`, `visa`, `drivers_license`, `nexus`, `globalentry`, `insurance`, `vaccination`, `other` |
| `document_number_encrypted` | `bytea` | Yes | Sensitive PII | E.g., passport number |
| `issuing_country` | `char(2)` | Yes | PII | — |
| `issued_on` | `date` | Yes | PII | — |
| `expires_on` | `date` | Yes | PII | — |
| `notes` | `text` | Yes | PII | — |
| `created_at` | `timestamptz` | No | Public | — |
| `updated_at` | `timestamptz` | No | Public | — |
| `archived_at` | `timestamptz` | Yes | Public | — |

**Indexes:** index on `(client_id)`, index on `(expires_on)` for expiration reminders.

**Why `document_id` is nullable.** Screen 2.1.10 asks for a passport number, expiry and
issuing country during onboarding, with no file upload — the scan comes later, from the
mobile camera flow. The structured metadata is the part that drives expiration reminders
and supplier verification, so it has to be storable on its own. A row with a null
`document_id` means "we know the passport details, we have no scan"; the reverse (a scan
with no parsed details) is also valid, which is why neither side is required.

### 6.5 Address

**Purpose:** Reusable address record. Clients have at most one mailing address today; the entity is separate so future use cases (multiple addresses, billing address) don't require a schema change.

**Phase:** P1

| Field | Type | Nullable | Sensitivity | Notes |
|---|---|---|---|---|
| `id` | `uuid` | No | Public | — |
| `line1` | `text` | No | PII | — |
| `line2` | `text` | Yes | PII | — |
| `city` | `text` | No | PII | — |
| `region` | `text` | Yes | PII | State / province |
| `postal_code` | `text` | Yes | PII | — |
| `country` | `char(2)` | No | PII | ISO 3166-1 alpha-2 |
| `created_at` | `timestamptz` | No | Public | — |
| `updated_at` | `timestamptz` | No | Public | — |

### 6.6 ClientNote

**Phase:** P1

| Field | Type | Nullable | Sensitivity | Notes |
|---|---|---|---|---|
| `id` | `uuid` | No | Public | — |
| `client_id` | `uuid` | No | Public | FK → Client |
| `author_user_id` | `uuid` | No | Public | FK → User (the agent who wrote it) |
| `body` | `text` | No | Internal | Rich text / markdown |
| `created_at` | `timestamptz` | No | Public | — |
| `updated_at` | `timestamptz` | No | Public | — |
| `archived_at` | `timestamptz` | Yes | Public | — |

**Notes:** Internal-only — never visible to the client.

### 6.7 ClientInvite

**Purpose:** A single-use code that binds a pre-created Client record to whichever Account
redeems it. Backs Screen 2.1.13 Connect with Agent / Invite Code.

**Phase:** P1

| Field | Type | Nullable | Sensitivity | Notes |
|---|---|---|---|---|
| `id` | `uuid` | No | Public | — |
| `client_id` | `uuid` | No | Public | FK → Client — the record this code claims |
| `code_hash` | `text` | No | Tokenized | Hash of the single-use code. The plaintext exists only in the invitation email |
| `issued_by_user_id` | `uuid` | No | Public | FK → User (the agent who generated it) |
| `expires_at` | `timestamptz` | No | Internal | — |
| `accepted_at` | `timestamptz` | Yes | Internal | — |
| `accepted_account_id` | `uuid` | Yes | Public | FK → Account that redeemed it |
| `revoked_at` | `timestamptz` | Yes | Internal | Set when the agent cancels an outstanding invite |
| `created_at` | `timestamptz` | No | Public | — |

**Indexes:** unique on `(code_hash)`; index on `(client_id)`; partial index on
`(expires_at) where accepted_at is null and revoked_at is null` for expiry sweeps.

**Relationships:** Many ClientInvites may point at one Client over time (a reissued code),
but at most one may be unredeemed and unexpired at any moment.

**Notes:**

Distinct from AgentInvitation (§7.2), which provisions an *advisor* and is P3. This one
provisions nothing — the Client and its trips already exist; redeeming the code only
repoints `User.client_id` at that Client and discards the throwaway Client the sign-up
created.

Only the hash is stored, for the same reason a password is not stored in plaintext: a
leaked `client_invite` table would otherwise hand an attacker a working key to a named
traveler's itinerary, passport details and payment authorizations. The code is short
enough to read over the phone (`STA-7HX2J9`), which makes it low-entropy, so redemption
must be rate limited per account and per IP, and a redemption attempt — successful or not
— writes an `audit_event`.

Redemption is only ever performed by an Edge Function running as the service role. It
rewrites `platform_user.client_id`, which changes what an account can see, so it is a
mutation on the `client` blast radius and rule 3 applies in full.

---

## 7. Agent Domain

### 7.1 Agent

**Phase:** P1

| Field | Type | Nullable | Sensitivity | Notes |
|---|---|---|---|---|
| `id` | `uuid` | No | Public | — |
| `display_name` | `text` | No | Public | E.g., "Gyasi Story" |
| `pronouns` | `text` | Yes | Public | Optional — shown in client-facing communication where appropriate (referenced by Screen 3.1.7 Agent Profile Setup) |
| `email` | `citext` | No | PII | — |
| `phone` | `text` | Yes | PII | — |
| `avatar_url` | `text` | Yes | Public | — |
| `bio` | `text` | Yes | Public | Client-visible |
| `social_links` | `jsonb` | No | Public | `{instagram, facebook, linkedin}` |
| `time_zone` | `text` | No | Internal | — |
| `status` | `agent_status` enum | No | Internal | `active`, `inactive`, `archived` |
| `commission_split_pct` | `numeric(5,2)` | Yes | Internal | If a sub-agent under a master |
| `created_at` | `timestamptz` | No | Public | — |
| `updated_at` | `timestamptz` | No | Public | — |

**Indexes:** unique on `(email) where status != 'archived'`.

### 7.2 AgentInvitation

**Phase:** P3 (multi-agent)

| Field | Type | Nullable | Sensitivity | Notes |
|---|---|---|---|---|
| `id` | `uuid` | No | Public | — |
| `email` | `citext` | No | PII | Invitee email |
| `invited_by_user_id` | `uuid` | No | Public | FK → User (an admin) |
| `token_hash` | `text` | No | Tokenized | Hash of single-use invitation token |
| `expires_at` | `timestamptz` | No | Internal | — |
| `accepted_at` | `timestamptz` | Yes | Internal | — |
| `accepted_agent_id` | `uuid` | Yes | Public | FK → Agent created on acceptance |
| `created_at` | `timestamptz` | No | Public | — |

### 7.3 AgentAvailability

**Phase:** P1

| Field | Type | Nullable | Sensitivity | Notes |
|---|---|---|---|---|
| `agent_id` | `uuid` | No | Public | PK; FK → Agent |
| `weekly_schedule` | `jsonb` | No | Internal | Per-weekday array of `{start, end}` |
| `response_time_hours` | `integer` | No | Public | "Reply within X hours" — shown to clients |
| `time_off_blocks` | `jsonb` | No | Internal | Array of `{start, end, label}` |
| `calendar_sync_provider` | `text` | Yes | Internal | `google` / `apple` / null |
| `calendar_sync_refresh_token_encrypted` | `bytea` | Yes | Tokenized | OAuth refresh token, encrypted |
| `updated_at` | `timestamptz` | No | Public | — |

---

## 8. Trip Domain

This is the largest and most central domain. Trip is the unit of work the entire business orbits around.

### 8.1 Supplier

**Purpose:** A travel service provider — cruise line, resort, tour operator, airline. Lookup-style entity; rows are added as needed.

**Phase:** P1

| Field | Type | Nullable | Sensitivity | Notes |
|---|---|---|---|---|
| `id` | `uuid` | No | Public | — |
| `name` | `text` | No | Public | "Royal Caribbean", "Sandals Resorts" |
| `kind` | `supplier_kind` enum | No | Public | `airline`, `hotel_brand`, `resort`, `cruise_line`, `tour_operator`, `insurance`, `transfer`, `other` |
| `payment_method_kind` | `supplier_payment_kind` enum | No | Internal | How this supplier accepts card payments — drives which Stripe pattern the agent UI uses (see BRD §10.4) |
| `payment_api_endpoint` | `text` | Yes | Internal | When `payment_method_kind = 'api'`, the URL Stripe Vault and Forward posts to (e.g., Expedia's `api.ean.com/v3/itineraries`) |
| `payment_portal_url` | `text` | Yes | Internal | When `payment_method_kind = 'portal'`, the supplier's TA portal URL (e.g., Sandals' `taportal.sandals.com`) — informational only |
| `default_commission_pct` | `numeric(5,2)` | Yes | Internal | Default for new bookings; can be overridden per trip |
| `commission_payment_terms` | `text` | Yes | Internal | `at_booking`, `after_travel`, `mixed` |
| `contact_email` | `text` | Yes | Internal | — |
| `contact_phone` | `text` | Yes | Internal | — |
| `notes` | `text` | Yes | Internal | — |
| `archived_at` | `timestamptz` | Yes | Public | — |
| `created_at` | `timestamptz` | No | Public | — |
| `updated_at` | `timestamptz` | No | Public | — |

**The `supplier_payment_kind` enum**: `api` (supplier accepts payments via Stripe Vault and Forward), `portal` (supplier requires manual card entry into a web portal — triggers the PAN reveal workflow), `unknown` (not yet classified — default for new suppliers). See Section 17 for the full enum definition.

### 8.2 Trip

**Purpose:** The core entity. One Trip per actual travel experience for a client.

**Phase:** P1

**Note on `trip_type = 'group'` vs. Group Trip Coordination (Section 16):** A Trip with `trip_type = 'group'` is a single-trip designation (one client, the agent records this trip as a group event such as a family reunion) and is available from MVP. This is **not** the Group Trip Coordination feature in Section 16, which lets multiple clients with their own accounts share an itinerary, exchange messages in a group chat, and invite co-travelers — that's Phase 3.

| Field | Type | Nullable | Sensitivity | Notes |
|---|---|---|---|---|
| `id` | `uuid` | No | Public | — |
| `client_id` | `uuid` | No | Public | FK → Client (primary traveler) |
| `agent_id` | `uuid` | No | Public | FK → Agent (denormalized from client for query speed) |
| `title` | `text` | No | PII | "Johnson Family Caribbean Escape" |
| `trip_type` | `trip_type` enum | No | Public | `cruise`, `all_inclusive`, `multi_destination`, `group`, `custom` |
| `status` | `trip_status` enum | No | Client-visible | `inquiry`, `proposal`, `booked`, `in_progress`, `completed`, `cancelled` |
| `status_changed_at` | `timestamptz` | No | Client-visible | — |
| `start_date` | `date` | Yes | PII | — |
| `end_date` | `date` | Yes | PII | — |
| `destinations` | `text[]` | No | Public | E.g., `['Bahamas', 'St. Maarten']` |
| `traveler_count` | `integer` | No | Public | — |
| `traveler_breakdown` | `jsonb` | Yes | PII | `{adults, children, infants}` |
| `total_value_cents` | `bigint` | No | Client-visible | Sum of components — what the trip costs them |
| `total_paid_cents` | `bigint` | No | Client-visible | Track of supplier payments via stored cards |
| `total_commission_cents` | `bigint` | No | Internal | Sum of component commissions. **Never granted to the client role** |
| `currency` | `char(3)` | No | Public | ISO 4217 (`USD`, `EUR`, ...) |
| `template_id` | `uuid` | Yes | Public | FK → TripTemplate if created from one |
| `group_id` | `uuid` | Yes | Public | FK → TripGroup (P3) |
| `cancellation_reason` | `text` | Yes | Client-visible | Free text on cancel |
| `refund_status` | `text` | Yes | Client-visible | When cancelled |
| `notes` | `text` | Yes | Internal | Agent notes. **Never granted to the client role** |
| `created_at` | `timestamptz` | No | Public | — |
| `updated_at` | `timestamptz` | No | Public | — |
| `archived_at` | `timestamptz` | Yes | Public | — |
| `version` | `integer` | No | Client-visible | Optimistic concurrency |

> **Reclassified September 2026, when `trip_self_select` shipped.** `status`,
> `status_changed_at`, `total_value_cents`, `total_paid_cents`, `cancellation_reason`,
> `refund_status` and `version` were all marked Internal, which §18's legend defines as "not
> customer-facing, Agent-scoped access" — and then Screen 2.1.13 needed to show a traveler
> their own trip, 2.2.1 needs the status and what they have paid, and a cancellation the
> client cannot see the reason for is not a cancellation anybody can act on. The
> classification was describing an agent-only product that this is not. Exactly two fields
> stay Internal and are excluded from the column grant to `authenticated`: `notes`, which is
> where the agent writes what he thinks, and `total_commission_cents`, which is what the
> agency earns and is not the client's number (BRD §10.5). RLS decides which rows; the grant
> is what decides these two columns.

**Relationships:**
- Belongs to Client; denormalizes Agent for query efficiency.
- Has many TripComponents.
- Has 0..1 Itinerary.
- Has many Proposals (versioned over time).
- Has many CardAuthorizations and CardUseEvents (via trip_id).
- Has many Commissions.
- Has many Conversations and Messages (scoped by trip_id).
- Has many Documents (scoped by trip_id).
- Belongs to 0..1 TripGroup (P3).

**Indexes:** index on `(agent_id, status, start_date)`; index on `(client_id, start_date desc)`; index on `(status, end_date)` for "departing in 30 days" worklist.

**Postgres DDL:**

```sql
CREATE TYPE trip_type AS ENUM ('cruise','all_inclusive','multi_destination','group','custom');
CREATE TYPE trip_status AS ENUM ('inquiry','proposal','booked','in_progress','completed','cancelled');

CREATE TABLE trip (
    id                      uuid PRIMARY KEY,
    client_id               uuid NOT NULL REFERENCES client(id),
    agent_id                uuid NOT NULL REFERENCES agent(id),
    title                   text NOT NULL,
    trip_type               trip_type NOT NULL,
    status                  trip_status NOT NULL DEFAULT 'inquiry',
    status_changed_at       timestamptz NOT NULL DEFAULT now(),
    start_date              date,
    end_date                date,
    destinations            text[] NOT NULL DEFAULT '{}',
    traveler_count          integer NOT NULL DEFAULT 1,
    traveler_breakdown      jsonb,
    total_value_cents       bigint NOT NULL DEFAULT 0,
    total_paid_cents        bigint NOT NULL DEFAULT 0,
    total_commission_cents  bigint NOT NULL DEFAULT 0,
    currency                char(3) NOT NULL DEFAULT 'USD',
    template_id             uuid REFERENCES trip_template(id),
    group_id                uuid REFERENCES trip_group(id),
    cancellation_reason     text,
    refund_status           text,
    notes                   text,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),
    archived_at             timestamptz,
    version                 integer NOT NULL DEFAULT 1,
    CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date)
);

CREATE INDEX trip_agent_status_start ON trip (agent_id, status, start_date);
CREATE INDEX trip_client_start       ON trip (client_id, start_date DESC);
CREATE INDEX trip_status_end         ON trip (status, end_date);
```

**Kotlin:**

```kotlin
@Serializable
data class Trip(
    val id: Uuid,
    val clientId: Uuid,
    val agentId: Uuid,
    val title: String,
    val tripType: TripType,
    val status: TripStatus,
    val statusChangedAt: Instant,
    val startDate: LocalDate? = null,
    val endDate: LocalDate? = null,
    val destinations: List<String> = emptyList(),
    val travelerCount: Int = 1,
    val travelerBreakdown: TravelerBreakdown? = null,
    val totalValueCents: Long = 0,
    val totalPaidCents: Long = 0,
    val totalCommissionCents: Long = 0,
    val currency: String = "USD",
    val templateId: Uuid? = null,
    val groupId: Uuid? = null,
    val cancellationReason: String? = null,
    val refundStatus: String? = null,
    val notes: String? = null,
    val createdAt: Instant,
    val updatedAt: Instant,
    val archivedAt: Instant? = null,
    val version: Int = 1
)

@Serializable data class TravelerBreakdown(val adults: Int, val children: Int = 0, val infants: Int = 0)
@Serializable enum class TripType { CRUISE, ALL_INCLUSIVE, MULTI_DESTINATION, GROUP, CUSTOM }
@Serializable enum class TripStatus { INQUIRY, PROPOSAL, BOOKED, IN_PROGRESS, COMPLETED, CANCELLED }
```

### 8.3 TripComponent

**Purpose:** A single bookable element of a trip — flight, hotel night block, cruise sailing, transfer, excursion, insurance policy. All component types share a base table; type-specific data lives in `payload` (jsonb) to avoid an explosion of subtype tables.

**Phase:** P1

| Field | Type | Nullable | Sensitivity | Notes |
|---|---|---|---|---|
| `id` | `uuid` | No | Public | — |
| `trip_id` | `uuid` | No | Public | FK → Trip |
| `kind` | `component_kind` enum | No | Internal | `flight`, `hotel`, `cruise`, `transfer`, `excursion`, `insurance`, `custom` |
| `supplier_id` | `uuid` | Yes | Public | FK → Supplier (null for `custom`) |
| `display_name` | `text` | No | PII | "Sandals Royal Bahamian, Junior Suite" |
| `start_date` | `date` | Yes | PII | — |
| `end_date` | `date` | Yes | PII | — |
| `start_time` | `time` | Yes | PII | — |
| `end_time` | `time` | Yes | PII | — |
| `location` | `text` | Yes | PII | Free text |
| `confirmation_number` | `text` | Yes | PII | Supplier confirmation |
| `cost_cents` | `bigint` | No | Internal | — |
| `commission_pct` | `numeric(5,2)` | Yes | Internal | Override supplier default |
| `commission_cents` | `bigint` | No | Internal | Computed |
| `currency` | `char(3)` | No | Public | — |
| `payload` | `jsonb` | No | PII | Type-specific (see below) |
| `api_source` | `text` | Yes | Internal | `manual`, `amadeus`, `hotelbeds`, `viator`, etc. |
| `api_reference` | `text` | Yes | Internal | External offer ID for re-pricing |
| `order_index` | `integer` | No | Internal | Display order within trip |
| `created_at` | `timestamptz` | No | Public | — |
| `updated_at` | `timestamptz` | No | Public | — |
| `archived_at` | `timestamptz` | Yes | Public | — |

> **Reclassified September 2026, when `trip_read_policies` shipped.** `kind` and
> `order_index` were marked Internal and are now granted to `authenticated`. A client-facing
> itinerary has to know whether a row is a flight or a hotel to pick an icon and the right
> empty state, and it has to render components in the order the agent arranged them —
> neither discloses anything the itinerary does not already say out loud. Same reasoning as
> the §8.2 note above: the classification was describing an agent-only product.
>
> `payload` stays Internal and is **excluded from the column grant**, which is the decision
> worth recording: the hotel shape below carries `rate_cents_per_night`, so granting the
> blob would hand back the per-night cost immediately after `cost_cents` was withheld for
> revealing margin. A screen that needs one key from it (seat number, room type) gets a
> server-side key allowlist, not a grant.

**Payload shapes:**

```json
// kind = flight
{ "airline": "AA", "flight_number": "1234", "origin": "ORD", "destination": "NAS",
  "cabin": "economy", "seat": "12B", "depart_time": "2026-06-14T10:30:00-05:00",
  "arrive_time": "2026-06-14T14:45:00-04:00" }

// kind = hotel
{ "address": "...", "room_type": "Junior Suite", "board_basis": "all_inclusive",
  "nights": 7, "rate_cents_per_night": 45000 }

// kind = cruise
{ "ship": "Symphony of the Seas", "cabin": "Balcony 9234", "dining_seating": "early",
  "embark_port": "MIA", "ports_of_call": ["NAS","STT","SXM"] }

// kind = excursion
{ "duration_hours": 4, "meeting_point": "...", "guide_language": "en" }

// kind = insurance
{ "provider": "Allianz", "policy_number": "...", "coverage": { "trip_cancellation": 5000, "medical": 100000 } }
```

**Indexes:** index on `(trip_id, order_index)`; index on `(api_reference)` where not null.

### 8.4 Itinerary, ItineraryDay, ItineraryActivity

**Purpose:** Itineraries are the client-facing presentation derived from trip components. They are separately stored (not just derived on the fly) because the agent edits them — adding narrative, "Gyasi's tips", time changes, etc. The trip components are the source of structured data; the itinerary is the polished story.

**Phase:** P1

#### Itinerary

| Field | Type | Nullable | Sensitivity | Notes |
|---|---|---|---|---|
| `id` | `uuid` | No | Public | — |
| `trip_id` | `uuid` | No | Public | FK → Trip (1:1) |
| `cover_image_url` | `text` | Yes | Public | — |
| `intro_note` | `text` | Yes | PII | Personal opening from agent |
| `closing_note` | `text` | Yes | PII | — |
| `published_at` | `timestamptz` | Yes | Public | When first published to client |
| `last_published_at` | `timestamptz` | Yes | Public | Most recent publish |
| `version` | `integer` | No | Internal | Increments on save |
| `created_at` | `timestamptz` | No | Public | — |
| `updated_at` | `timestamptz` | No | Public | — |

#### ItineraryDay

| Field | Type | Nullable | Sensitivity | Notes |
|---|---|---|---|---|
| `id` | `uuid` | No | Public | — |
| `itinerary_id` | `uuid` | No | Public | FK → Itinerary |
| `day_number` | `integer` | No | Public | 1, 2, 3, ... |
| `date` | `date` | No | PII | — |
| `label` | `text` | Yes | PII | "Travel Day", "Sea Day", "Port of Nassau" |
| `summary` | `text` | Yes | PII | One-paragraph overview |
| `weather_forecast` | `jsonb` | Yes | Public | Cached weather (with TTL) |

**Indexes:** unique on `(itinerary_id, day_number)`.

#### ItineraryActivity

| Field | Type | Nullable | Sensitivity | Notes |
|---|---|---|---|---|
| `id` | `uuid` | No | Public | — |
| `itinerary_day_id` | `uuid` | No | Public | FK → ItineraryDay |
| `block` | `block_kind` enum | No | Public | `morning`, `afternoon`, `evening`, `all_day` |
| `start_time` | `time` | Yes | PII | — |
| `end_time` | `time` | Yes | PII | — |
| `title` | `text` | No | PII | "Catamaran Snorkel Excursion" |
| `body` | `text` | Yes | PII | Rich description |
| `location` | `text` | Yes | PII | — |
| `address` | `text` | Yes | PII | — |
| `phone` | `text` | Yes | PII | — |
| `confirmation_number` | `text` | Yes | PII | — |
| `gyasis_tip` | `text` | Yes | PII | Special callout |
| `component_id` | `uuid` | Yes | Public | FK → TripComponent if derived from one |
| `order_index` | `integer` | No | Internal | — |
| `created_at` | `timestamptz` | No | Public | — |
| `updated_at` | `timestamptz` | No | Public | — |

> **Reclassified September 2026, when `trip_read_policies` shipped.**
> `itinerary_activity.order_index` is granted to `authenticated` — a day whose activities
> render in arbitrary order is not an itinerary.
>
> **`itinerary.published_at` is a load-bearing access boundary, not just a timestamp.** The
> client read policy gates on `published_at IS NOT NULL`, and `itinerary_day` and
> `itinerary_activity` repeat that test rather than merely joining to the parent. The reason
> is the purpose statement above: the itinerary is stored separately *because the agent edits
> it*, so rows exist and are being rewritten for days before anyone means them to be read.
> Without the gate a traveler sees a half-written `intro_note` in Gyasi's voice and
> placeholder confirmation numbers — a copy-exposure defect as much as an access one.
>
> `itinerary.version` stays Internal and is excluded from the grant.

### 8.5 Proposal

**Purpose:** A versioned, client-presentable snapshot of a trip. When the agent sends a proposal, the platform captures a snapshot (components, prices, framing copy) so the client and agent share a single referent — even if the agent later edits the underlying trip.

**Phase:** P1

| Field | Type | Nullable | Sensitivity | Notes |
|---|---|---|---|---|
| `id` | `uuid` | No | Public | — |
| `trip_id` | `uuid` | No | Public | FK → Trip |
| `version_number` | `integer` | No | Public | Increments per proposal sent for a trip |
| `snapshot` | `jsonb` | No | PII | Full snapshot of trip + components + itinerary |
| `cover_title` | `text` | No | PII | — |
| `cover_image_url` | `text` | Yes | Public | — |
| `opening_note` | `text` | Yes | PII | — |
| `closing_note` | `text` | Yes | PII | — |
| `pricing_valid_until` | `date` | Yes | Internal | — |
| `sent_at` | `timestamptz` | Yes | Public | — |
| `viewed_at` | `timestamptz` | Yes | Internal | First open by client |
| `accepted_at` | `timestamptz` | Yes | Public | — |
| `created_at` | `timestamptz` | No | Public | — |
| `updated_at` | `timestamptz` | No | Public | — |

**Indexes:** unique on `(trip_id, version_number)`.

### 8.6 TripTemplate

**Phase:** P1

| Field | Type | Nullable | Sensitivity | Notes |
|---|---|---|---|---|
| `id` | `uuid` | No | Public | — |
| `agent_id` | `uuid` | No | Public | Owner |
| `name` | `text` | No | Internal | "Sandals Honeymoon 7-Night" |
| `description` | `text` | Yes | Internal | — |
| `trip_type` | `trip_type` enum | No | Internal | — |
| `payload` | `jsonb` | No | Internal | Template skeleton |
| `created_at` | `timestamptz` | No | Public | — |
| `updated_at` | `timestamptz` | No | Public | — |
| `archived_at` | `timestamptz` | Yes | Public | — |

---

### 8.7 Testimonial

**Purpose:** A client's written reflection on a completed trip, captured on Screen 2.2.11 (Past Trip / Memory View). It is the client's own words, so it is theirs until they say otherwise — the status column exists so that nothing reaches a public surface by default.

**Phase:** P1

| Field | Type | Nullable | Sensitivity | Notes |
|---|---|---|---|---|
| `id` | `uuid` | No | Public | — |
| `client_id` | `uuid` | No | Public | FK → Client |
| `trip_id` | `uuid` | Yes | Public | FK → Trip. Null for a general reflection not tied to one trip |
| `agent_id` | `uuid` | No | Public | FK → Agent (denormalized, for the approval queue) |
| `body` | `text` | No | PII | The client's own words |
| `attribution` | `text` | Yes | PII | How the client wants to be credited ("Jordan H.", "the Hayes family") |
| `rating` | `smallint` | Yes | Public | 1–5, optional. The prompt is a question, not a star widget |
| `status` | `testimonial_status` enum | No | Public | Default `draft` |
| `submitted_at` | `timestamptz` | Yes | Public | When the client sent it to the agent |
| `approved_at` | `timestamptz` | Yes | Public | **Nothing may be published without this** |
| `approved_by_user_id` | `uuid` | Yes | Internal | FK → User (which agent approved) |
| `published_at` | `timestamptz` | Yes | Public | When it went live on a public surface |
| `created_at` | `timestamptz` | No | Public | — |
| `updated_at` | `timestamptz` | No | Public | — |

**The approval gate is the point.** `draft` → `submitted` → `approved` → `published`, with `declined` as a terminal branch. A row may only be read by an anonymous/public surface when `status = 'published'`, and `published_at` may only be set on a row that already has `approved_at`. This is the same discipline `PUBLIC_CLAIMS_MODE=strict` enforces on the hand-authored testimonials in `web/content/public/proof.ts`: a client's words are a marketing claim, and marketing claims do not ship unreviewed.

**Client write access** is limited to their own rows in `draft` or `submitted`. Once approved, the row is the agency's to publish and the client's to withdraw — withdrawal moves it to `declined` rather than deleting it, so the audit trail survives.

**Voice note:** the prompt is *"What did you carry home from this trip?"* (Design-System §2.4), not "rate your experience". The field is a reflection first and a testimonial second, which is also why `rating` is nullable.

**Indexes:** unique on `(client_id, trip_id)` where `trip_id IS NOT NULL`; index on `(agent_id, status, created_at desc)` for the approval queue; index on `(status, published_at desc)` where `status = 'published'` for the public surface.

---

## 9. Payment Domain

This domain is governed by PCI DSS SAQ A constraints (see Section 18). No card primary account number (PAN) is ever stored. All "card" entities here reference a Stripe-issued token; the only locally-stored card data is metadata Stripe explicitly returns (brand, last 4, expiration).

### 9.1 PaymentCard

**Purpose:** A tokenized payment method on file. The platform holds a Stripe `PaymentMethod` ID; Stripe holds the actual PAN. Every PaymentCard belongs to a Client (the cardholder) and may be authorized for one or more Trips via CardAuthorization.

**Phase:** P1

| Field | Type | Nullable | Sensitivity | Notes |
|---|---|---|---|---|
| `id` | `uuid` | No | Public | — |
| `client_id` | `uuid` | No | Public | FK → Client |
| `stripe_payment_method_id` | `text` | No | Tokenized | The opaque token (e.g., `pm_1Nx...`) |
| `stripe_customer_id` | `text` | No | Tokenized | Stripe Customer object for this client |
| `brand` | `text` | No | Public | `visa`, `mastercard`, `amex`, ... |
| `last4` | `char(4)` | No | Public | Last 4 digits (Stripe returns this) |
| `exp_month` | `smallint` | No | Public | 1–12 |
| `exp_year` | `smallint` | No | Public | YYYY |
| `nickname` | `text` | Yes | PII | Client-supplied label |
| `consent_recorded_at` | `timestamptz` | No | Internal | When client consented to storage |
| `status` | `card_status` enum | No | Internal | `active`, `revoked`, `expired`, `failed` |
| `revoked_at` | `timestamptz` | Yes | Internal | — |
| `revoked_reason` | `text` | Yes | Internal | — |
| `created_at` | `timestamptz` | No | Public | — |
| `updated_at` | `timestamptz` | No | Public | — |

**Indexes:** index on `(client_id, status)`; unique on `(stripe_payment_method_id)`.

**Postgres DDL:**

```sql
CREATE TYPE card_status AS ENUM ('active','revoked','expired','failed');

CREATE TABLE payment_card (
    id                          uuid PRIMARY KEY,
    client_id                   uuid NOT NULL REFERENCES client(id),
    stripe_payment_method_id    text NOT NULL UNIQUE,
    stripe_customer_id          text NOT NULL,
    brand                       text NOT NULL,
    last4                       char(4) NOT NULL,
    exp_month                   smallint NOT NULL CHECK (exp_month BETWEEN 1 AND 12),
    exp_year                    smallint NOT NULL,
    nickname                    text,
    consent_recorded_at         timestamptz NOT NULL,
    status                      card_status NOT NULL DEFAULT 'active',
    revoked_at                  timestamptz,
    revoked_reason              text,
    created_at                  timestamptz NOT NULL DEFAULT now(),
    updated_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX payment_card_client_status ON payment_card (client_id, status);
```

**Kotlin:**

```kotlin
@Serializable
data class PaymentCard(
    val id: Uuid,
    val clientId: Uuid,
    val stripePaymentMethodId: String,   // never displayed in UI
    val stripeCustomerId: String,
    val brand: String,
    val last4: String,
    val expMonth: Int,
    val expYear: Int,
    val nickname: String? = null,
    val consentRecordedAt: Instant,
    val status: CardStatus,
    val revokedAt: Instant? = null,
    val revokedReason: String? = null,
    val createdAt: Instant,
    val updatedAt: Instant
)

@Serializable
enum class CardStatus { ACTIVE, REVOKED, EXPIRED, FAILED }
```

### 9.2 CardAuthorization

**Purpose:** A client's consent to use a stored card for a specific trip up to a spending limit. The agent cannot use a card for a trip without an active authorization. Authorizations expire automatically.

**Phase:** P1

| Field | Type | Nullable | Sensitivity | Notes |
|---|---|---|---|---|
| `id` | `uuid` | No | Public | — |
| `payment_card_id` | `uuid` | No | Public | FK → PaymentCard |
| `trip_id` | `uuid` | No | Public | FK → Trip |
| `spending_limit_cents` | `bigint` | No | Internal | Max total chargeable |
| `amount_used_cents` | `bigint` | No | Internal | Running total |
| `expires_at` | `timestamptz` | No | Internal | Auto-expire date |
| `status` | `card_auth_status` enum | No | Internal | `active`, `revoked`, `expired`, `exhausted` |
| `revoked_at` | `timestamptz` | Yes | Internal | — |
| `revoked_by_user_id` | `uuid` | Yes | Public | Who revoked (client or system) |
| `consent_payload` | `jsonb` | No | Internal | Snapshot of the consent text shown |
| `created_at` | `timestamptz` | No | Public | — |
| `updated_at` | `timestamptz` | No | Public | — |

**Indexes:** unique on `(payment_card_id, trip_id) where status = 'active'`; index on `(trip_id, status)`.

### 9.3 AuthorizationRequest

**Phase:** P1

| Field | Type | Nullable | Sensitivity | Notes |
|---|---|---|---|---|
| `id` | `uuid` | No | Public | — |
| `trip_id` | `uuid` | No | Public | FK → Trip |
| `client_id` | `uuid` | No | Public | FK → Client |
| `requesting_agent_id` | `uuid` | No | Public | FK → Agent |
| `proposed_limit_cents` | `bigint` | No | Internal | — |
| `proposed_expiry` | `date` | No | Internal | — |
| `personal_note` | `text` | Yes | PII | Agent's message to the client |
| `token_hash` | `text` | No | Tokenized | Single-use link hash |
| `status` | `auth_request_status` enum | No | Internal | `pending`, `completed`, `expired`, `cancelled` |
| `completed_card_authorization_id` | `uuid` | Yes | Public | FK → CardAuthorization on success |
| `sent_at` | `timestamptz` | No | Public | — |
| `completed_at` | `timestamptz` | Yes | Public | — |
| `expires_at` | `timestamptz` | No | Internal | Link expiration |

### 9.4 CardUseEvent

**Purpose:** Append-only log of every use of a stored card to pay a supplier. This is the audit surface for the supplier-pay workflow.

**Phase:** P1

| Field | Type | Nullable | Sensitivity | Notes |
|---|---|---|---|---|
| `id` | `uuid` | No | Public | — |
| `card_authorization_id` | `uuid` | No | Public | FK → CardAuthorization |
| `payment_card_id` | `uuid` | No | Public | FK → PaymentCard (denormalized) |
| `trip_id` | `uuid` | No | Public | FK → Trip (denormalized) |
| `agent_user_id` | `uuid` | No | Public | FK → User (the agent who used it) |
| `supplier_id` | `uuid` | Yes | Public | FK → Supplier |
| `supplier_name_snapshot` | `text` | No | PII | In case Supplier record changes |
| `amount_cents` | `bigint` | No | Internal | — |
| `currency` | `char(3)` | No | Public | — |
| `reference_number` | `text` | Yes | PII | Supplier confirmation/auth code |
| `justification` | `text` | No | Internal | Agent-entered reason at time of reveal |
| `receipt_document_id` | `uuid` | Yes | Public | FK → Document (uploaded receipt) |
| `client_flag_status` | `text` | No | Internal | `not_flagged`, `flagged`, `resolved` |
| `client_flagged_at` | `timestamptz` | Yes | Internal | — |
| `created_at` | `timestamptz` | No | Public | — |

**Append-only:** no UPDATE, no DELETE.

**Indexes:** index on `(card_authorization_id, created_at desc)`; index on `(payment_card_id, created_at desc)`; index on `(trip_id, created_at desc)`.

---

### 9.5 PaymentMilestone

**Purpose:** The supplier payment schedule for a trip — deposit, any interim payments, and the final balance — so the client can see what is due and when. This is what Screen 2.2.3 renders as its payment timeline, and it is what finally gives `trip.total_paid_cents` a producer.

**Phase:** P1

**This is not an invoice, and it is not in PCI scope.** Two things it deliberately is not:

- **Not a bill from Story-Tail Adventures.** BRD §10.5 prohibits client-facing billing — the agency is not the merchant of record and charges the client nothing. These rows describe what the *supplier* expects and when, so the client is not surprised by a balance date. There is no "pay now" action, no amount owing *to us*, and no merchant fields.
- **Not cardholder data.** No PAN, no token, no Stripe reference, no FK to PaymentCard. It lives in this domain because a reader looking for "payments" looks here, but it is outside SAQ A scope entirely. The client's only card-adjacent action remains the authorization flow in §9.2.

| Field | Type | Nullable | Sensitivity | Notes |
|---|---|---|---|---|
| `id` | `uuid` | No | Public | — |
| `trip_id` | `uuid` | No | Public | FK → Trip |
| `kind` | `payment_milestone_kind` enum | No | Public | `deposit`, `interim`, `final` |
| `label` | `text` | No | Public | Client-facing ("Deposit", "Second payment") |
| `amount_cents` | `bigint` | No | Public | Client-visible by design — it is what the supplier expects |
| `currency` | `char(3)` | No | Public | — |
| `due_date` | `date` | Yes | Public | Null while the supplier has not set one |
| `paid_at` | `timestamptz` | Yes | Public | — |
| `paid_cents` | `bigint` | No | Public | Default 0. Partial payments happen |
| `status` | `payment_milestone_status` enum | No | Public | Default `scheduled` |
| `order_index` | `integer` | No | Public | Display order; ties are broken by `due_date` |
| `created_at` | `timestamptz` | No | Public | — |
| `updated_at` | `timestamptz` | No | Public | — |

**Why `status` is stored rather than derived.** `overdue` could be computed from `due_date < today`, but the agent needs to be able to suppress it — a supplier who has verbally extended a deadline should not produce a red row on the client's dashboard. `waived` exists for the same reason: suppliers do forgive milestones, and a waived one is not the same as a paid one.

**`amount_cents` is Public, unlike `trip_component.cost_cents`.** The distinction is real: `cost_cents` is what the agency paid, which reveals margin; this is what the client's trip costs them on a given date, which they are entitled to know and which the itinerary already implies.

**Indexes:** index on `(trip_id, order_index)`; index on `(status, due_date)` for the agent-side overdue sweep.

---

## 10. Commission Domain

### 10.1 Commission

**Phase:** P1

| Field | Type | Nullable | Sensitivity | Notes |
|---|---|---|---|---|
| `id` | `uuid` | No | Public | — |
| `trip_id` | `uuid` | No | Public | FK → Trip |
| `component_id` | `uuid` | Yes | Public | FK → TripComponent (if commission is per-component) |
| `agent_id` | `uuid` | No | Public | FK → Agent |
| `supplier_id` | `uuid` | No | Public | FK → Supplier |
| `gross_booking_cents` | `bigint` | No | Internal | What the client/supplier transaction totalled |
| `commission_pct` | `numeric(5,2)` | No | Internal | — |
| `expected_commission_cents` | `bigint` | No | Internal | Computed |
| `received_commission_cents` | `bigint` | No | Internal | What we actually got |
| `payment_terms` | `text` | No | Internal | `at_booking`, `after_travel` |
| `status` | `commission_status` enum | No | Internal | `expected`, `invoiced`, `received`, `disputed`, `lost` |
| `received_at` | `date` | Yes | Internal | When the deposit hit |
| `inteletravel_reference` | `text` | Yes | Internal | Matching ID from Inteletravel report |
| `import_id` | `uuid` | Yes | Public | FK → CommissionImport |
| `notes` | `text` | Yes | Internal | — |
| `created_at` | `timestamptz` | No | Public | — |
| `updated_at` | `timestamptz` | No | Public | — |

**Indexes:** index on `(agent_id, status, received_at)`; index on `(trip_id)`; index on `(supplier_id, status)`.

### 10.2 CommissionImport

**Phase:** P1

| Field | Type | Nullable | Sensitivity | Notes |
|---|---|---|---|---|
| `id` | `uuid` | No | Public | — |
| `imported_by_user_id` | `uuid` | No | Public | FK → User (agent) |
| `source` | `text` | No | Internal | `inteletravel_csv` (extensible) |
| `original_filename` | `text` | No | Internal | — |
| `document_id` | `uuid` | No | Public | FK → Document (the stored CSV) |
| `total_rows` | `integer` | No | Internal | — |
| `matched_rows` | `integer` | No | Internal | — |
| `unmatched_rows` | `integer` | No | Internal | — |
| `period_start` | `date` | Yes | Internal | The statement period |
| `period_end` | `date` | Yes | Internal | — |
| `created_at` | `timestamptz` | No | Public | — |

---

## 11. Lead Domain

### 11.1 Lead

**Phase:** P2

| Field | Type | Nullable | Sensitivity | Notes |
|---|---|---|---|---|
| `id` | `uuid` | No | Public | — |
| `agent_id` | `uuid` | No | Public | FK → Agent |
| `client_id` | `uuid` | Yes | Public | FK → Client if existing; null for new leads |
| `email` | `citext` | No | PII | — |
| `first_name` | `text` | Yes | PII | — |
| `last_name` | `text` | Yes | PII | — |
| `phone` | `text` | Yes | PII | — |
| `destinations` | `text[]` | No | PII | From search criteria |
| `start_date` | `date` | Yes | PII | — |
| `end_date` | `date` | Yes | PII | — |
| `traveler_count` | `integer` | Yes | PII | — |
| `budget_band` | `text` | Yes | PII | — |
| `trip_type_interest` | `text[]` | No | PII | — |
| `notes` | `text` | Yes | PII | What the client wrote |
| `source_id` | `uuid` | Yes | Public | FK → LeadSource |
| `referenced_search_payload` | `jsonb` | Yes | Internal | Search/favorites snapshot |
| `status` | `lead_status` enum | No | Internal | `new`, `contacted`, `qualified`, `converted`, `lost` |
| `converted_to_trip_id` | `uuid` | Yes | Public | FK → Trip on conversion |
| `first_contacted_at` | `timestamptz` | Yes | Internal | SLA marker |
| `lost_reason` | `text` | Yes | Internal | — |
| `created_at` | `timestamptz` | No | Public | — |
| `updated_at` | `timestamptz` | No | Public | — |

### 11.2 LeadSource

**Phase:** P2

| Field | Type | Nullable | Sensitivity | Notes |
|---|---|---|---|---|
| `id` | `uuid` | No | Public | — |
| `kind` | `lead_source_kind` enum | No | Internal | `inspiration_tile`, `direct_search`, `referral_link`, `ad_campaign`, `social_post` |
| `label` | `text` | No | Internal | — |
| `tracking_payload` | `jsonb` | No | Internal | Campaign IDs, referrer URL, etc. |

---

## 12. Communication Domain

### 12.1 Conversation

**Phase:** P1

| Field | Type | Nullable | Sensitivity | Notes |
|---|---|---|---|---|
| `id` | `uuid` | No | Public | — |
| `client_id` | `uuid` | No | Public | FK → Client |
| `agent_id` | `uuid` | No | Public | FK → Agent |
| `trip_id` | `uuid` | Yes | Public | FK → Trip (null for general/pre-trip threads) |
| `lead_id` | `uuid` | Yes | Public | FK → Lead (when conversation originated from a lead) |
| `subject` | `text` | Yes | PII | Optional |
| `last_message_at` | `timestamptz` | No | Public | For inbox sorting |
| `last_message_preview` | `text` | Yes | PII | Denormalized |
| `client_unread_count` | `integer` | No | Internal | — |
| `agent_unread_count` | `integer` | No | Internal | — |
| `archived_at` | `timestamptz` | Yes | Public | — |
| `created_at` | `timestamptz` | No | Public | — |
| `updated_at` | `timestamptz` | No | Public | — |

**Indexes:** index on `(agent_id, last_message_at desc)`; index on `(client_id, last_message_at desc)`; index on `(trip_id)`.

> **Reclassified September 2026, when `trip_read_policies` shipped.**
> `client_unread_count` is granted to `authenticated`. It is the *client's own* unread count
> and Screen 2.2.3 renders it ("Messages · 2 unread"); marking it Internal alongside
> `agent_unread_count` reads like an artefact of the two being added as a pair.
> `agent_unread_count` stays Internal and excluded — how far behind the agent is on their
> inbox is not something a client should be able to poll.

### 12.2 Message

**Phase:** P1

| Field | Type | Nullable | Sensitivity | Notes |
|---|---|---|---|---|
| `id` | `uuid` | No | Public | — |
| `conversation_id` | `uuid` | No | Public | FK → Conversation |
| `sender_user_id` | `uuid` | No | Public | FK → User |
| `sender_role` | `user_role` enum | No | Public | Denormalized for fast filtering |
| `body` | `text` | No | PII | Plain or markdown |
| `is_internal_note` | `boolean` | No | Internal | If true, only agent sees |
| `read_by_other_at` | `timestamptz` | Yes | Internal | Read receipts |
| `created_at` | `timestamptz` | No | Public | — |
| `archived_at` | `timestamptz` | Yes | Public | — |

**Indexes:** index on `(conversation_id, created_at)`.

> **`is_internal_note` is enforced as a ROW filter, September 2026.** The client read
> policy tests `is_internal_note = false` in its `USING` clause, and the column is *also*
> excluded from the grant. Both are needed, and the order of reasoning matters: withholding
> the column does **not** hide the rows — a grant decides which columns come back, never
> which rows. Column-only protection would have delivered the agent's private notes to the
> client as ordinary messages, with the one field that identified them stripped off.
>
> `read_by_other_at` is excluded too: read receipts are named in Screen-Inventory §2.2.7 but
> nothing has decided their semantics, and shipping one silently makes a promise about the
> agent's attention that nobody agreed to.

### 12.3 MessageAttachment

**Phase:** P1

| Field | Type | Nullable | Sensitivity | Notes |
|---|---|---|---|---|
| `id` | `uuid` | No | Public | — |
| `message_id` | `uuid` | No | Public | FK → Message |
| `document_id` | `uuid` | No | Public | FK → Document |
| `created_at` | `timestamptz` | No | Public | Default `now()` |

**No `updated_at`, deliberately.** An attachment is a join row: it is created when a message
is sent and deleted if the message is, and there is no field on it a later write could change.
Every other table in this document carries both timestamps, so the absence is worth stating
rather than looking like an omission.

### 12.4 MessageTemplate

**Phase:** P1

| Field | Type | Nullable | Sensitivity | Notes |
|---|---|---|---|---|
| `id` | `uuid` | No | Public | — |
| `agent_id` | `uuid` | No | Public | FK → Agent (owner) |
| `category` | `text` | No | Internal | `lead_response`, `proposal`, `booking_confirmation`, `pre_trip`, `post_trip`, `payment_reminder`, `other` |
| `name` | `text` | No | Internal | — |
| `subject` | `text` | Yes | Internal | — |
| `body_markdown` | `text` | No | Internal | With `{{merge_fields}}` |
| `tags` | `text[]` | No | Internal | — |
| `archived_at` | `timestamptz` | Yes | Public | — |
| `created_at` | `timestamptz` | No | Public | — |
| `updated_at` | `timestamptz` | No | Public | — |

### 12.5 NotificationPreference

**Phase:** P1

| Field | Type | Nullable | Sensitivity | Notes |
|---|---|---|---|---|
| `user_id` | `uuid` | No | Public | PK; FK → User |
| `channels` | `jsonb` | No | Internal | Matrix: `{category: {email, push, sms}}` |
| `quiet_hours_start` | `time` | Yes | Internal | — |
| `quiet_hours_end` | `time` | Yes | Internal | — |
| `updated_at` | `timestamptz` | No | Public | — |

---

## 13. Document Domain

### 13.1 Document

**Purpose:** Generic file blob — uploads, generated PDFs, receipts, photos. Stored in S3/R2 with a metadata row here. Used across the model: trip documents, travel documents, message attachments, commission CSV imports, receipts.

**Phase:** P1

| Field | Type | Nullable | Sensitivity | Notes |
|---|---|---|---|---|
| `id` | `uuid` | No | Public | — |
| `owner_user_id` | `uuid` | No | Public | FK → User (uploader) |
| `client_id` | `uuid` | Yes | Public | FK → Client when scoped |
| `trip_id` | `uuid` | Yes | Public | FK → Trip when scoped |
| `kind` | `document_kind` enum | No | Internal | `passport`, `visa`, `insurance_cert`, `supplier_confirmation`, `receipt`, `photo`, `csv_import`, `pdf_proposal`, `pdf_itinerary`, `other` |
| `filename` | `text` | No | PII | — |
| `mime_type` | `text` | No | Internal | — |
| `size_bytes` | `bigint` | No | Internal | — |
| `storage_bucket` | `text` | No | Internal | — |
| `storage_key` | `text` | No | Internal | — |
| `checksum_sha256` | `bytea` | No | Internal | For dedup and integrity |
| `is_sensitive` | `boolean` | No | Internal | Triggers tighter access logging |
| `created_at` | `timestamptz` | No | Public | — |
| `archived_at` | `timestamptz` | Yes | Public | — |

**Indexes:** index on `(client_id)`; index on `(trip_id)`; index on `(checksum_sha256)` for dedup.

---

> **The client read policy uses a `kind` ALLOWLIST, September 2026.** This is the generic
> file table for the whole model — the purpose line above says so — and two of its tenants
> are agency-internal: `card_use_event.receipt_document_id` points here and
> `card_use_event.trip_id` is `NOT NULL`, so supplier-charge receipts are trip-scoped *by
> construction*, and `commission_import.document_id` points here too. A policy of "my
> client_id, or any of my trips" therefore hands the traveler the agency's economics through
> the side door, immediately after `cost_cents`, `total_commission_cents` and
> `proposal.snapshot` were all withheld to prevent exactly that.
>
> Client-readable kinds are `passport`, `visa`, `insurance_cert`, `supplier_confirmation`,
> `photo` and `pdf_itinerary`. It is an allowlist rather than a denylist so that a
> `document_kind` added later must be considered before it becomes client-readable.
>
> **`is_sensitive` is deliberately NOT part of the predicate.** It governs how a read is
> logged, not whether it is allowed; filtering on it would hide the client's own passport
> scan, which is the most obviously-theirs file in the table.
>
> `kind`, `mime_type` and `size_bytes` are granted despite their Internal markers — Screen
> 2.2.6 groups by kind, picks its PDF/IMG badge from mime_type and prints the size, and all
> three describe the client's own file. `storage_bucket`, `storage_key`, `checksum_sha256`
> and `is_sensitive` remain server-only.

---

## 14. Search & Favorites Domain

### 14.1 SavedSearch

**Phase:** P2

| Field | Type | Nullable | Sensitivity | Notes |
|---|---|---|---|---|
| `id` | `uuid` | No | Public | — |
| `user_id` | `uuid` | No | Public | FK → User |
| `name` | `text` | Yes | PII | Client-supplied label |
| `criteria` | `jsonb` | No | PII | Full search payload |
| `notify_on_match` | `boolean` | No | Internal | If true, agent gets alert on new matches |
| `created_at` | `timestamptz` | No | Public | — |
| `last_run_at` | `timestamptz` | Yes | Public | — |

### 14.2 Favorite

**Phase:** P2

| Field | Type | Nullable | Sensitivity | Notes |
|---|---|---|---|---|
| `id` | `uuid` | No | Public | — |
| `user_id` | `uuid` | No | Public | FK → User |
| `entity_type` | `text` | No | Internal | `hotel`, `cruise`, `tour`, `destination` |
| `entity_key` | `text` | No | Internal | API-source-specific stable ID |
| `snapshot` | `jsonb` | No | Public | Cached display payload |
| `note` | `text` | Yes | PII | Client-supplied note |
| `created_at` | `timestamptz` | No | Public | — |

**Indexes:** unique on `(user_id, entity_type, entity_key)`.

---

## 15. System / Audit Domain

### 15.1 AuditEvent

**Purpose:** Append-only log of significant actions taken by users — especially agents acting on client data. The single most important table for security forensics, compliance reporting, and trust.

**Phase:** P1

| Field | Type | Nullable | Sensitivity | Notes |
|---|---|---|---|---|
| `id` | `uuid` | No | Public | — |
| `actor_user_id` | `uuid` | Yes | Public | FK → User. Null for system events. |
| `actor_role` | `user_role` enum | Yes | Public | Denormalized |
| `event_type` | `text` | No | Internal | E.g., `client.updated`, `card.revealed`, `commission.received` |
| `target_entity` | `text` | Yes | Internal | E.g., `client`, `trip`, `payment_card` |
| `target_id` | `uuid` | Yes | Internal | The entity acted on |
| `metadata` | `jsonb` | No | Internal | Free-form structured detail |
| `ip_address` | `inet` | Yes | PII | — |
| `user_agent` | `text` | Yes | Internal | — |
| `created_at` | `timestamptz` | No | Public | — |

**Append-only.** Retained 7 years for tax/compliance; longer for card-related events.

**Indexes:** index on `(actor_user_id, created_at desc)`; index on `(target_entity, target_id, created_at desc)`; index on `(event_type, created_at desc)`.

### 15.2 Integration

**Phase:** P2

| Field | Type | Nullable | Sensitivity | Notes |
|---|---|---|---|---|
| `id` | `uuid` | No | Public | — |
| `provider` | `text` | No | Internal | `amadeus`, `hotelbeds`, `viator`, `widgety`, `stripe`, ... |
| `environment` | `text` | No | Internal | `test`, `production` |
| `credentials_encrypted` | `bytea` | No | Tokenized | API key bundle, encrypted at rest |
| `config_payload` | `jsonb` | No | Internal | Provider-specific config |
| `enabled` | `boolean` | No | Internal | — |
| `last_health_check_at` | `timestamptz` | Yes | Internal | — |
| `last_health_status` | `text` | Yes | Internal | `ok`, `degraded`, `down` |
| `created_at` | `timestamptz` | No | Public | — |
| `updated_at` | `timestamptz` | No | Public | — |

### 15.3 FeatureFlag

**Phase:** P1 (optional, but cheap to include)

| Field | Type | Nullable | Sensitivity | Notes |
|---|---|---|---|---|
| `key` | `text` | No | Public | PK; e.g., `enable_self_guided_search` |
| `enabled` | `boolean` | No | Internal | — |
| `targeting` | `jsonb` | No | Internal | Per-role / per-user overrides |
| `description` | `text` | Yes | Internal | — |
| `updated_at` | `timestamptz` | No | Public | — |

---

## 16. Group Trip Domain (Phase 3)

### 16.1 TripGroup

**Phase:** P3

| Field | Type | Nullable | Sensitivity | Notes |
|---|---|---|---|---|
| `id` | `uuid` | No | Public | — |
| `agent_id` | `uuid` | No | Public | FK → Agent |
| `name` | `text` | No | PII | "Smith Family Reunion 2027" |
| `start_date` | `date` | Yes | PII | — |
| `end_date` | `date` | Yes | PII | — |
| `coordinator_user_id` | `uuid` | Yes | Public | The lead participant |
| `total_pax` | `integer` | No | Internal | Sum across members |
| `created_at` | `timestamptz` | No | Public | — |
| `updated_at` | `timestamptz` | No | Public | — |
| `archived_at` | `timestamptz` | Yes | Public | — |

### 16.2 GroupMember

**Phase:** P3

| Field | Type | Nullable | Sensitivity | Notes |
|---|---|---|---|---|
| `id` | `uuid` | No | Public | — |
| `group_id` | `uuid` | No | Public | FK → TripGroup |
| `trip_id` | `uuid` | No | Public | FK → Trip (each group member has their own trip) |
| `role` | `text` | No | Internal | `coordinator`, `traveler`, `co_traveler_no_account` |
| `magic_link_token_hash` | `text` | Yes | Tokenized | For account-less co-traveler access |
| `magic_link_expires_at` | `timestamptz` | Yes | Internal | — |

---

## 17. Enums & Lookup Values

Consolidated enum reference. Each enum is defined as a Postgres `CREATE TYPE` and mirrored as a Kotlin `enum class` in the shared module.

| Enum | Values | Used By |
|---|---|---|
| `user_role` | `client`, `agent`, `admin` | User, AuditEvent, Message |
| `auth_provider` | `email`, `google`, `apple` | Account |
| `mfa_kind` | `totp`, `sms`, `backup_codes` | MfaDevice |
| `auth_event_type` | `login_attempt`, `login_success`, `login_failure`, `password_reset_request`, `password_reset_complete`, `mfa_challenge_issued`, `mfa_challenge_success`, `mfa_challenge_failure`, `account_locked`, `account_unlocked`, `session_revoked` | AuthEvent |
| `client_status` | `active`, `archived`, `merged_into` | Client |
| `agent_status` | `active`, `inactive`, `archived` | Agent |
| `travel_doc_kind` | `passport`, `visa`, `drivers_license`, `nexus`, `globalentry`, `insurance`, `vaccination`, `other` | TravelDocument |
| `supplier_kind` | `airline`, `hotel_brand`, `resort`, `cruise_line`, `tour_operator`, `insurance`, `transfer`, `other` | Supplier |
| `supplier_payment_kind` | `api`, `portal`, `unknown` | Supplier — drives which Stripe pattern the agent UI uses |
| `trip_type` | `cruise`, `all_inclusive`, `multi_destination`, `group`, `custom` | Trip, TripTemplate |
| `trip_status` | `inquiry`, `proposal`, `booked`, `in_progress`, `completed`, `cancelled` | Trip |
| `component_kind` | `flight`, `hotel`, `cruise`, `transfer`, `excursion`, `insurance`, `custom` | TripComponent |
| `block_kind` | `morning`, `afternoon`, `evening`, `all_day` | ItineraryActivity |
| `card_status` | `active`, `revoked`, `expired`, `failed` | PaymentCard |
| `card_auth_status` | `active`, `revoked`, `expired`, `exhausted` | CardAuthorization |
| `auth_request_status` | `pending`, `completed`, `expired`, `cancelled` | AuthorizationRequest |
| `commission_status` | `expected`, `invoiced`, `received`, `disputed`, `lost` | Commission |
| `lead_status` | `new`, `contacted`, `qualified`, `converted`, `lost` | Lead |
| `lead_source_kind` | `inspiration_tile`, `direct_search`, `referral_link`, `ad_campaign`, `social_post` | LeadSource |
| `document_kind` | `passport`, `visa`, `insurance_cert`, `supplier_confirmation`, `receipt`, `photo`, `csv_import`, `pdf_proposal`, `pdf_itinerary`, `other` | Document |
| `payment_milestone_kind` | `deposit`, `interim`, `final` | PaymentMilestone |
| `payment_milestone_status` | `scheduled`, `paid`, `waived`, `overdue` | PaymentMilestone |
| `testimonial_status` | `draft`, `submitted`, `approved`, `published`, `declined` | Testimonial |
| `cruise_sync_endpoint` | `cruise_lines`, `filter_options`, `coverage`, `ships`, `ports`, `cruises`, `cruise_detail` | CruiseSyncScope, CruiseApiRequest |
| `cruise_sync_status` | `running`, `ok`, `partial`, `skipped`, `failed` | CruiseSyncRun, CruiseSyncScope |
| `cruise_sync_trigger` | `cron`, `manual` | CruiseSyncRun |

---

## 18. PCI & Sensitive Data Handling

This section is the load-bearing security guidance for the model. It applies in addition to general SDLC security practices and supplements the BRD's Section 10.

### 18.1 What Lives Where

| Data | Location | Notes |
|---|---|---|
| Card PAN (full card number) | **Stripe vault only** | Never stored in our database. Never logged. Never passed through our servers except via Stripe Elements / Stripe Mobile SDK tokenization. |
| Card brand, last 4, expiration | Our database (`payment_card` table) | Stripe explicitly returns these as non-sensitive card metadata. |
| Stripe `PaymentMethod` ID | Our database | Opaque token. Useless without our Stripe API keys. |
| CVV / CVC | **Never anywhere** | Stripe doesn't return it and we never request it post-tokenization. |
| Stripe Customer ID | Our database | Used to look up the card at Stripe at use-time. |
| Stripe API keys | Vault (e.g., Doppler / AWS Secrets Manager / 1Password Vault) | Never in source control; never in the database; injected as env vars only. |

The "never in our database" rule for the PAN is the single most important architectural decision in the data model.

### 18.2 Encryption at Rest

The Postgres tablespace is encrypted at rest by the managed Postgres provider (RDS, Supabase, etc.). On top of that, specific fields marked Sensitive PII or Tokenized use **column-level encryption** via `pgcrypto` and a backend-managed data encryption key (DEK) wrapped by a key management service (KMS) key. The fields requiring column-level encryption:

- `mfa_device.secret_encrypted`
- `companion.passport_number_encrypted`
- `travel_document.document_number_encrypted`
- `integration.credentials_encrypted`
- `agent_availability.calendar_sync_refresh_token_encrypted`
- Token hashes for invitations and magic links

Column-level encryption is bytea storage with `pgcrypto.pgp_sym_encrypt/decrypt` using a backend-only DEK. The KMS-wrapped DEK is loaded once at backend startup.

### 18.3 Audit-Logged Access

Reading any of these tables/fields generates an `audit_event`:

- Any `payment_card` row read by an agent (the read itself is audited; not just modifications)
- Any reveal of a card via Stripe `PaymentMethod` retrieval (always audit + MFA step-up)
- Any `companion.passport_number_encrypted` decryption
- Any `travel_document.document_number_encrypted` decryption
- Any bulk client list export
- Any commission record edit (financial integrity)

### 18.4 MFA Step-Up

A second MFA challenge is required (regardless of session state) for:

- Card reveal (Section 9.4 Reveal Card Number screen)
- Inteletravel CSV import that affects already-marked-received commissions
- Client account merge
- Deletion of any audit log retention exception

### 18.5 Erasure & Export

GDPR/CCPA-style data rights are implemented as follows:

**Export.** Any client can request a full data export via Account → Privacy & Data Export. The export contains every Client, TravelPreference, Companion, TravelDocument, Trip, Itinerary, PaymentCard (token references only — no PANs), CardAuthorization, CardUseEvent, Conversation, Message, Document, SavedSearch, and Favorite row associated with their account. Delivered as a downloadable ZIP within 30 days.

**Erasure.** A client may request deletion. On approval:
- PII fields on Client, Companion, TravelDocument, Message, etc., are replaced with `deleted_user_<id>` placeholders.
- Trip, Commission, and CardUseEvent records are retained (financial/tax requirement) but PII is scrubbed.
- AuditEvent rows are retained in full — audit logs are explicitly excluded from erasure (PCI/SOX-aligned posture).
- Stripe Customer is deleted via Stripe API; PaymentCard rows are marked `revoked` with `revoked_reason = 'client_erasure_request'`.

### 18.6 Retention

| Data Class | Retention |
|---|---|
| AuditEvent | 7 years for general events; 10 years for card-related events |
| CardUseEvent | 10 years (matches card-related audit) |
| AuthEvent (failed logins) | 1 year |
| Session | 90 days post-revocation |
| Soft-deleted Client/Trip/etc. PII | Until erasure requested, otherwise indefinite |
| Document blobs (S3/R2) | Indefinite while not erasure-requested; tiered to cold storage after 2 years of inactivity |

---

## 19. Multi-Tenancy & Sharing Model

At MVP, there's one agent (Gyasi). The model is built so adding more agents is straightforward.

### 19.1 Ownership

Every entity that "belongs to" the business carries an `agent_id` either directly or via its parent. The query layer always filters by `agent_id` based on the authenticated user's owned agency.

Tables with direct `agent_id`:
- `client`
- `trip` (denormalized from `client` for query speed)
- `commission`
- `lead`
- `conversation`
- `message_template`
- `agent_availability`
- `trip_template`

Tables that scope via parent FK:
- `travel_preference`, `companion`, `travel_document`, `client_invite` → `client.agent_id`
- `trip_component` → `trip.agent_id`
- `itinerary*` → `trip.agent_id`
- `payment_card` → `client.agent_id`
- `card_authorization`, `card_use_event` → `trip.agent_id`
- `document` → `client.agent_id` or `trip.agent_id`
- `payment_milestone` → `trip.agent_id`
- `testimonial` → `agent_id` directly (denormalized, for the approval queue)
- `message_attachment` → `message` → `conversation.agent_id`

### 19.2 Sharing (Future)

Phase 3 may introduce shared clients (two agents on the same household, agent-handoff for vacation coverage). The shape will likely be:

```sql
CREATE TABLE client_share (
    client_id      uuid REFERENCES client(id),
    shared_with_agent_id uuid REFERENCES agent(id),
    permission     text NOT NULL CHECK (permission IN ('read', 'write')),
    expires_at     timestamptz,
    PRIMARY KEY (client_id, shared_with_agent_id)
);
```

Implementing this in MVP is unnecessary but the data model leaves room.

### 19.3 Whitelabel / Multi-Agency (Phase 4)

If Story-Tail Adventures ever offers the platform to other agencies, the right move is to introduce a top-level `agency` table that every `agent`, `client`, and `trip` references. That's a non-trivial migration but it's a self-contained one; we explicitly do not pre-build it.

---

## 20. Audit & Soft-Delete Patterns

### 20.1 Soft Delete

Use `archived_at` (not `deleted_at`) on:

- `client`
- `agent` (P3)
- `trip`
- `trip_component`
- `trip_template`
- `lead`
- `conversation`
- `message`
- `message_template`
- `document`
- `companion`
- `travel_document`
- `feature_flag`
- `cruise_line` (P2)
- `cruise_ship` (P2)
- `cruise_port` (P2)
- `cruise_sailing` (P2)

Queries default to filtering `archived_at IS NULL`. Restoration is straightforward (clear the timestamp).

### 20.2 Hard Delete (Rare)

Hard delete is reserved for:

- `session` (after retention window)
- `auth_event` (after retention window)
- `audit_event` (after retention window — administrative purge only, never user-initiated)
- True erasure requests that anonymize but retain financial rows

### 20.3 Audit Trigger Pattern

Every write to a tracked table emits an `audit_event` row. The backend handles this in a
"with-audit" wrapper around domain mutations rather than via Postgres triggers — easier to
test, easier to evolve, easier to attach domain context. That wrapper is
`withAudit()` in `supabase/functions/_shared/audit.ts`; there is no separate Ktor service
(see `docs/Tech-Recommendations.md` — the backend is Supabase Edge Functions). Postgres
triggers remain available as a defense-in-depth backstop on the most sensitive tables
(`payment_card`, `card_authorization`, `commission`).

### 20.4 Versioning for Optimistic Concurrency

Tables with a `version` integer:

- `client`
- `trip`
- `itinerary`

Reads return the current `version`. Writes include the `version` and increment it; the backend rejects writes whose incoming `version` doesn't match the stored value. The client surfaces a "this was updated elsewhere" conflict and offers to refresh.

---

## 21. Implementation Notes — KMP (Mobile) + TypeScript (Backend + Web)

### 21.1 Repo Layout

The project lives in a monorepo with four sub-projects. KMP covers mobile only; backend is TypeScript (Supabase Edge Functions); web is TypeScript (Next.js).

```
storytail/
├── mobile/                            # KMP + Compose Multiplatform (Android + iOS only)
│   ├── shared/
│   │   └── src/commonMain/kotlin/com/storytail/
│   │       ├── domain/                # Trip, Client, Card, Commission, ...
│   │       ├── enums/                 # TripStatus, ClientStatus, ...
│   │       ├── api/                   # API clients calling Supabase + Edge Functions
│   │       └── util/                  # Money (value class), Uuid, Phone
│   ├── androidApp/
│   └── iosApp/
│
├── web/                               # Next.js + React + TypeScript
│   ├── app/                           # App Router pages
│   ├── components/
│   ├── lib/
│   │   └── supabase.ts               # Supabase JS SDK initialization
│   └── types/                         # Auto-generated from contracts/
│
├── supabase/                          # Supabase project
│   ├── migrations/                    # SQL migrations (supabase db push)
│   ├── functions/                     # Edge Functions (Deno + TypeScript)
│   │   ├── _shared/                   # Shared utilities (audit, auth, stripe wrapper)
│   │   ├── stripe-setup-intent/
│   │   ├── stripe-vault-forward/
│   │   ├── stripe-reveal-pan/         # Audited PAN reveal
│   │   ├── commission-import/
│   │   └── travel-api-proxy/
│   ├── seed.sql
│   └── config.toml
│
└── contracts/                         # Shared API contract
    ├── openapi.yaml                   # Source of truth for the API surface
    ├── ts/                            # Auto-generated TypeScript types
    └── kotlin/                        # Auto-generated Kotlin types for mobile
```

Top-level tooling: Turborepo or Nx for the monorepo; `npm` workspaces for JS package management; Gradle for the mobile sub-project; `supabase` CLI for the database and Edge Functions.

### 21.2 Server-Only vs Client-Visible Types

Not every database column appears in API responses. The discriminator is "does the client ever need to see this?"

Stays server-side only (lives in the Postgres schema; not exposed in any API response):

- `account.password_hash` (Supabase Auth manages this; not in our schema)
- `account.auth_provider_id`
- `mfa_device.secret_encrypted` (raw bytes never leave server)
- `agent_invitation.token_hash`
- `authorization_request.token_hash`
- `payment_card.stripe_payment_method_id` (Edge Functions use, client never sees)
- `payment_card.stripe_customer_id`
- `integration.credentials_encrypted`
- `audit_event` (mostly — agents may see some via Client Activity Log via a sanitized endpoint)

Enforcement: Row-Level Security (RLS) policies on Supabase Postgres prevent these columns from being readable by anonymous or authenticated client roles. Edge Functions run with the `service_role` key (server-side only, never exposed) and have access to these columns when needed.

### 21.3 Value Classes for Domain Primitives

Kotlin value classes (`@JvmInline value class`) wrap primitive types where the type system can add safety at zero runtime cost:

```kotlin
@JvmInline @Serializable value class Cents(val value: Long) {
    operator fun plus(other: Cents) = Cents(value + other.value)
    fun toDollars(): Double = value / 100.0
}

@JvmInline @Serializable value class Uuid(val value: String)

@JvmInline @Serializable value class Iso4217(val code: String) {
    init { require(code.length == 3) }
}
```

This prevents bugs like passing a phone number where an email belongs, or accidentally treating cents as dollars.

### 21.4 Serialization

All shared types are `@Serializable` (kotlinx.serialization). The backend's Ktor endpoints serialize directly to/from these types. The mobile and web apps deserialize the same types — guaranteed schema parity by construction.

### 21.5 Offline Cache (Mobile)

**Phase note:** The cache architecture described here is **Phase 1 (MVP)** — it makes mobile feel responsive and resilient to brief drops in connectivity. The dedicated offline *user experience* (the Offline Itinerary View screen, the visible "Last synced" indicators, the queued-action handling) ships in **Phase 3** per BRD Section 13.3 and Screen Inventory Section 2.7.1.

SqlDelight is used in the shared module's mobile target to cache the client-facing data (Trip, Itinerary, Conversation, PaymentCard metadata) for offline use. The schema is **not** the same as the server Postgres schema — it's a denormalized read-optimized cache. Sync logic compares server `updated_at` with cached values to decide what to fetch.

### 21.6 ID Generation

UUID v7 is generated client-side where possible (avoids round-trip when creating an offline draft). Backend validates that the UUID's embedded timestamp is sane (within the last hour) on insert.

---

## 22. Migration & Versioning Strategy

### 22.1 Migrations

Schema migrations live in `supabase/migrations/` and follow Supabase CLI conventions (`<timestamp>_<name>.sql`, e.g., `20260514120000_initial.sql`). Migrations are applied via `supabase db push` in development, and in production by Supabase's GitHub integration on merge to the `production` branch — not by GitHub Actions, which owns only the frontend deploy. Migrations are forward-only in production; a down migration is allowed only in development branches.

The Supabase CLI also generates TypeScript types from the database schema (`supabase gen types typescript`) — those generated types feed into the Next.js web app and the Edge Functions for type-safe database access.

### 22.2 Phasing the Schema

Phase 1 migrations create:
- All Identity, Client, Agent, Trip, Payment, Commission, Communication, Document, System tables.

Phase 2 migrations add:
- Lead, LeadSource, SavedSearch, Favorite, Integration.

Phase 3 migrations add:
- TripGroup, GroupMember, AgentInvitation, ClientShare (if pursued).

Each entity in this document is tagged with its phase; the implementation team can sequence migrations accordingly.

### 22.3 Backward-Compatible Changes

Three rules for changes once data exists:

1. **Adding a column is safe** if it's nullable or has a default.
2. **Renaming a column is two migrations** — add the new column, backfill, deploy code that writes to both, drop the old column in a later release.
3. **Changing a column type or adding a NOT NULL** requires a backfill migration first, then the constraint change.

### 22.4 Enum Evolution

Postgres enums can be extended with `ALTER TYPE ... ADD VALUE`, but only one value at a time and it can't be done inside a transaction in older Postgres versions. For frequently-evolving lookup-style values (`document_kind`, `event_type`), the model uses CHECK-constrained text instead of true enums; for stable values (`trip_status`, `user_role`), it uses real enums.

---

## 23. Open Questions

Decisions that should be settled with the implementation team before initial migrations are written.

**Address normalization.** Should we use a single Address table referenced by Client (and later by Companion if needed), or embed an address jsonb on each entity that needs one? The current model uses a separate table for clarity but the trade-off is one extra join in common queries.

**Trip Component subtypes.** The `trip_component.payload` jsonb keeps subtype detail in one table; an alternative is dedicated tables (`flight_component`, `hotel_component`, ...) for stronger typing. The jsonb approach matches typical agent CRM patterns and is much simpler operationally, but loses some database-level validation. Decision deferred until a real component-add UI is designed.

**Money representation.** The model uses `bigint` cents with an explicit `currency char(3)`. An alternative is `numeric(15,4)` for higher precision. For a USD-dominated travel business, cents are sufficient and arithmetic-safer; revisit if EUR/multi-currency volume grows.

**Itinerary as derived vs stored.** The current model stores Itinerary explicitly because agents heavily edit it. An alternative is to derive it on the fly from TripComponents + a small "narrative overlay" table. Storing makes editing simpler but creates a sync responsibility when components change. The current approach is correct for Travefy-equivalence; revisit if it becomes a source of bugs.

**Conversation scoping.** A conversation belongs to one client and optionally one trip. Should a conversation be able to span multiple trips for the same client? Current model says no — that case is handled by separate conversations. Decision: stick with one-trip-per-conversation; revisit only if clients ask.

**Inteletravel API access.** If Inteletravel exposes a commission API (currently they do not), the `commission_import` model becomes a simple poller rather than a CSV import. Don't pre-build for an API that doesn't exist; revisit when Inteletravel signals plans.

**Search result caching.** The model includes `Favorite.snapshot` (cached display payload) but not a fuller search-result cache. A separate `search_cache` table keyed by `(provider, query_hash)` with TTL might reduce API costs. Defer to Phase 2 when actual API costs become measurable.

**Soft-delete cascade behavior.** If a Client is archived, should their Trips be auto-archived too? The current model says no — trips remain queryable for reports — but the agent UI should clearly indicate "client archived" on those trips. Confirm with the agent UX.

**Multi-currency on Trip.** The model has one `currency` per Trip. In practice a single trip can have suppliers quoting in different currencies (a Caribbean resort in USD plus a European insurer in EUR). The Trip's currency is the "presented to client" currency; individual TripComponents may have their own currency in the payload. Confirm this is the right modeling.

---

## 24. Cruise Catalog Domain (Phase 2)

Provider-sourced cruise content, populated by a scheduled sync rather than by a human or a
request-time proxy. The architecture, and these entity names, come from
`Free-Travel-APIs.md` §10.1 ("Sync, don't proxy") and §4.7; §1.0 fixes the scope: *cruise
line, ship, itinerary (ports and sailing dates), price optional, no cabin availability, no
booking.*

**Numbered 24 rather than inserted near the Search domain on purpose.** Sections 15, 19, 20
and 21 are referenced by number from `CLAUDE.md`, from Edge Function comments, and from the
`supabase-reviewer` and `audit-pci` skills. Renumbering to put this in domain order would
invalidate every one of those references to buy nothing.

### 24.0 Four rules this domain exists to obey

1. **The raw payload is stored beside the normalised row.** A mapping bug becomes a
   re-derivation instead of a re-fetch against a quota (§10.1).
2. **Provider ids are external references, never primary keys.** Every table has its own
   UUID v7 `id` plus a `(provider, provider_key)` pair — the same shape
   `favorite.entity_key` ("API-source-specific stable ID") and
   `trip_component.api_source` / `api_reference` already use.
3. **Curated content wins over synced content, as a layer rather than an edit.** Nothing the
   sync writes may clobber an editorial decision. `cruise_line.slug`, `display_order` and
   `is_booked` are ours; the provider never sets them.
4. **Provider vocabularies are `text`, not enums.** Company slugs, locales, cabin codes,
   destinations and port names all belong to the provider and grow without notice. Per §22.4
   these are the "frequently-evolving lookups" case — and the failure mode of an enum here is
   a sync that dies on a cabin tier a cruise line invented last week. Only the three
   vocabularies this platform owns (`cruise_sync_endpoint`, `cruise_sync_status`,
   `cruise_sync_trigger`) are real enums.

### 24.1 CruiseLine

**Purpose:** A cruise line as both editorial and synced content. This is the table behind the
"lines we book" chip row on Screen 2.0.9, and the answer to "which lines, and what date range
do we have for each" — the departure window in `earliest_departure` / `latest_departure` is
the "dates" half of the catalog.

**Phase:** P2

**Why this is not `supplier`.** `supplier.kind` already has a `cruise_line` value, but
`supplier` is Internal commission-and-payment plumbing (`default_commission_pct`,
`payment_portal_url`, `payment_api_endpoint`) with a lookup-table access posture. This table
is public-facing catalog content on a refresh cadence. They are different things with
different sensitivity, so this is a separate table with an optional FK to it, not a
projection over it.

**Why `slug` is ours and `provider_key` is theirs.** `web/content/public/cruise-lines.ts`
already ships eight URL-stable slugs. The provider's `company` values agree on four
(`royal-caribbean`, `princess`, `carnival`, `holland-america`) and disagree on three
(`celebrity-cruises`, `disney-cruise-line`, `ncl` against `celebrity`, `disney`,
`norwegian`). It also has three lines Story-Tail does not book (`costa`, `msc`, `aida`) and
is missing one it does: **Virgin Voyages has no provider coverage at all.** A synced row can
therefore never be the whole story, which is rule 3 in concrete form.

| Field | Type | Nullable | Sensitivity | Notes |
|---|---|---|---|---|
| `id` | `uuid` | No | Public | UUID v7, ours |
| `slug` | `text` | No | Public | **Ours.** URL-stable, unique. Matches `CRUISE_LINES` where they overlap |
| `name` | `text` | No | Public | Display name |
| `supplier_id` | `uuid` | Yes | Internal | FK → Supplier, when a commission relationship exists |
| `display_order` | `integer` | No | Public | Editorial ordering; the provider never sets it |
| `is_booked` | `boolean` | No | Public | True for a line Story-Tail actually books. Editorial |
| `ship_count` | `integer` | Yes | Public | Provider-reported |
| `sailing_count` | `integer` | Yes | Public | Provider-reported |
| `destination_count` | `integer` | Yes | Public | Provider-reported |
| `earliest_departure` | `date` | Yes | Public | Start of the provider's coverage window |
| `latest_departure` | `date` | Yes | Public | End of the provider's coverage window |
| `destinations` | `text[]` | No | Public | Default `{}` |
| `locales` | `text[]` | No | Public | Markets the provider covers for this line |
| `provider` | `text` | Yes | Internal | `track_cruises`. Null on a purely curated row |
| `provider_key` | `text` | Yes | Internal | The provider's `company` slug |
| `provider_payload` | `jsonb` | Yes | Internal | Raw response, per rule 1 |
| `provider_updated_at` | `timestamptz` | Yes | Internal | Provider's own freshness stamp |
| `synced_at` | `timestamptz` | Yes | Internal | When we last wrote from the feed |
| `first_seen_at` | `timestamptz` | Yes | Internal | — |
| `last_seen_at` | `timestamptz` | Yes | Internal | Drives archival when a row leaves the feed |
| `archived_at` | `timestamptz` | Yes | Public | Soft delete (§20.1) |
| `created_at` | `timestamptz` | No | Public | — |
| `updated_at` | `timestamptz` | No | Public | — |

**Indexes:** unique on `slug`; unique on `(provider, provider_key)` where `provider` is not
null; index on `(is_booked, display_order)` for the chip row.

### 24.2 CruiseShip

**Purpose:** A ship in a line's fleet, with its own coverage window. Filter input for Screen
2.3.4's rail (line, ship, ports, length, departure port).

**Phase:** P2

| Field | Type | Nullable | Sensitivity | Notes |
|---|---|---|---|---|
| `id` | `uuid` | No | Public | UUID v7 |
| `cruise_line_id` | `uuid` | No | Public | FK → CruiseLine |
| `name` | `text` | No | Public | "Costa Toscana" |
| `slug` | `text` | Yes | Public | Ours, for a future ship route |
| `sailing_count` | `integer` | Yes | Public | Provider-reported |
| `earliest_departure` | `date` | Yes | Public | — |
| `latest_departure` | `date` | Yes | Public | — |
| provenance columns | — | — | Internal | As §24.1 |
| `archived_at` / `created_at` / `updated_at` | — | — | Public | — |

**Indexes:** unique on `(cruise_line_id, name)`; unique on `(provider, provider_key)` where
`provider` is not null.

### 24.3 CruisePort

**Purpose:** A port the provider knows about, as an embarkation or call. Filter input for
2.3.4, and the eventual pin source for Pattern F's synchronised map (§4.4 of the Screen
Inventory).

**Phase:** P2

| Field | Type | Nullable | Sensitivity | Notes |
|---|---|---|---|---|
| `id` | `uuid` | No | Public | UUID v7 |
| `name` | `text` | No | Public | Unique. Provider format is "Barcelona, Spain" |
| `sailing_count` | `integer` | Yes | Public | Provider-reported, across all lines |
| `latitude` | `numeric(9,6)` | Yes | Public | **Provider supplies none.** Manual or geocoded |
| `longitude` | `numeric(9,6)` | Yes | Public | Same |
| provenance columns | — | — | Internal | As §24.1 |
| `archived_at` / `created_at` / `updated_at` | — | — | Public | — |

Coordinates are nullable and unpopulated on purpose: the map is not built, and inventing
coordinates the provider did not supply would be worse than leaving the pin absent.

### 24.4 CruiseSailing

**Purpose:** One dated departure — the row a client eventually points at when they ask for a
quote.

**Phase:** P2

**The natural key is a triple, not the provider's id.** The provider's spec is explicit that
cruise ids are unique only *per line* — Princess and Holland America both use the `Y731`
voyage-code format — and the same id recurs *per locale* with different pricing and currency.
So uniqueness is `(provider, provider_key, provider_locale)`. Getting this wrong silently
merges two different sailings.

| Field | Type | Nullable | Sensitivity | Notes |
|---|---|---|---|---|
| `id` | `uuid` | No | Public | UUID v7, ours. This is what a Trip would reference |
| `cruise_line_id` | `uuid` | No | Public | FK → CruiseLine |
| `ship_id` | `uuid` | Yes | Public | FK → CruiseShip. Provider's `ship_name` can be null |
| `provider` | `text` | No | Internal | Part of the natural key, so not nullable here |
| `provider_key` | `text` | No | Internal | The provider's `cruise_id` |
| `provider_locale` | `text` | No | Internal | Market; determines `currency` |
| `title` | `text` | Yes | Public | Provider's voyage title |
| `departure_date` | `date` | No | Public | — |
| `duration_nights` | `integer` | Yes | Public | Provider's `duration` |
| `lead_price_cents` | `bigint` | Yes | **Internal** | Lowest per-person fare seen. See below |
| `currency` | `char(3)` | Yes | Internal | ISO 4217, from the locale |
| `lead_price_eur_cents` | `bigint` | Yes | Internal | The provider's cross-market comparable |
| `destinations` | `text[]` | No | Public | Default `{}` |
| `itinerary_url` | `text` | Yes | Public | Deep link to the line's own page |
| `provider_payload` | `jsonb` | Yes | Internal | Raw response |
| `provider_updated_at` | `timestamptz` | Yes | Internal | Feeds incremental sync |
| `synced_at` / `first_seen_at` / `last_seen_at` | `timestamptz` | Yes | Internal | — |
| `archived_at` | `timestamptz` | Yes | Public | Soft delete |
| `created_at` / `updated_at` | `timestamptz` | No | Public | — |

**Why the price is Internal.** `Free-Travel-APIs.md` §10.2 says to give the *public content
types* no price field, and §1.0 makes price optional for cruises; BRD §10.5 forbids charging
a client anything. None of that argues against storing the number — Gyasi quotes from it, and
it is the only figure the provider's own `min_price_eur` / `max_price_eur` filters operate
on. So it is stored, classified Internal, and granted to no client role. If it ever reaches a
public surface it must carry the hedging apparatus `web/content/public/types.ts` already
defines (`pricePlaceholder`, `priceSource`, `priceNote`, `priceAsOf`), because
`Free-Travel-APIs.md:318` is explicit that a displayed price goes stale and re-opens
compliance §9.2.

**Indexes:** unique on `(provider, provider_key, provider_locale)`; `(departure_date)`;
`(cruise_line_id, departure_date)`; `(provider, provider_updated_at DESC)` for the
`sort=updated_at:desc` incremental pass.

### 24.5 CruisePortCall

**Purpose:** One itinerary stop on a sailing, in order. The `port_call` entity named in
`Free-Travel-APIs.md` §10.1.

**Phase:** P2

**`sequence` exists because `day` is not reliable.** The provider documents that `day` is
null whenever the source feed omitted it — *every* Holland America sailing, per its own spec
note — and instructs buyers to treat null as "unknown day" rather than 0 or 1. Ordering an
itinerary by a column that is null for a whole cruise line produces a scrambled itinerary, so
ordering is by `sequence`, which we assign densely from the array position the provider
returned. `day` is preserved as provider data, and is display-only.

| Field | Type | Nullable | Sensitivity | Notes |
|---|---|---|---|---|
| `id` | `uuid` | No | Public | UUID v7 |
| `sailing_id` | `uuid` | No | Public | FK → CruiseSailing, `ON DELETE CASCADE` |
| `port_id` | `uuid` | Yes | Public | FK → CruisePort, when the name resolves |
| `port_name` | `text` | No | Public | Denormalised; the provider sends free text |
| `sequence` | `integer` | No | Public | **Ours.** 1-based array position. Ordering key |
| `day` | `integer` | Yes | Public | Provider's 1-indexed day. Null for all HAL sailings |
| `arrival_at` | `timestamptz` | Yes | Public | Not populated for all lines |
| `departure_at` | `timestamptz` | Yes | Public | Not populated for all lines |
| `created_at` / `updated_at` | `timestamptz` | No | Public | — |

Port calls carry no `archived_at`: they are wholly owned by their sailing and replaced as a
set on each sync, which is why the FK cascades.

**Indexes:** unique on `(sailing_id, sequence)`; index on `(port_id)`.

### 24.6 CruiseSailingCabinPrice

**Purpose:** Per-cabin, per-person pricing for one sailing.

**Phase:** P2

Only `GET /cruises/{id}` returns `cabin_prices_per_person`; the list endpoint omits it to keep
responses lean. So these rows exist only for sailings someone has spent a detail request on —
which on the free tier means the handful a client has asked to be quoted. Absence of rows is
normal and is not an error. The provider also notes Costa's cabin source has been unavailable
since 2026-04-21, so Costa sailings legitimately have none.

`cabin_code` is `text`, not an enum, per §24.0 rule 4: the documented set (`INTERIOR`,
`OCEANVIEW`, `BALCONY`, `MINISUITE`, `SUITE`) is open-ended by the provider's own admission
("plus line-specific tiers like `CONCIERGE`, `AQUA`, `VISTA_SUITE`, `NEPTUNE_SUITE`,
`HAVEN`"), and a new tier must not fail a sync.

| Field | Type | Nullable | Sensitivity | Notes |
|---|---|---|---|---|
| `id` | `uuid` | No | Public | UUID v7 |
| `sailing_id` | `uuid` | No | Public | FK → CruiseSailing, `ON DELETE CASCADE` |
| `cabin_code` | `text` | No | Public | Normalised by the provider, open vocabulary |
| `price_cents` | `bigint` | No | **Internal** | Per person, sailing's local currency |
| `currency` | `char(3)` | No | Internal | — |
| `created_at` / `updated_at` | `timestamptz` | No | Public | — |

**Indexes:** unique on `(sailing_id, cabin_code)`.

### 24.7 CruiseSyncScope

**Purpose:** What the sync is allowed to fetch, as configuration rather than code. One row is
one unit of work.

**Phase:** P2

This table is the reason the free tier is a parameter rather than a constraint baked into the
handler. The provider's BASIC tier allows **100 requests/month at 10 rows/request** — 1,000
rows/month — against a live inventory of **245,020 sailings**, so mirroring it is
arithmetically out of reach (about 20 years) and no batching strategy changes that. What
*is* affordable is the reference catalog: `/cruise-lines`, `/filter-options` and `/coverage`
are unpaginated, so three requests refresh every line, ship, port, destination, locale and
departure window. Measured, not estimated: one `/filter-options` call returns 4,566 ports —
the same set `/ports` would charge 457 requests for, four months of quota. The reference scopes therefore ship enabled and the sailing scopes ship
present-but-disabled; a tier upgrade is an `UPDATE ... SET enabled = true` and a wider
`max_rows_per_request`, not a rewrite.

| Field | Type | Nullable | Sensitivity | Notes |
|---|---|---|---|---|
| `id` | `uuid` | No | Public | UUID v7 |
| `label` | `text` | No | Internal | Human name, for the run log |
| `endpoint` | `cruise_sync_endpoint` enum | No | Internal | Which call this scope makes |
| `enabled` | `boolean` | No | Internal | **Default false.** Nothing runs unless asked |
| `priority` | `integer` | No | Internal | Lower runs first. Reference before sailings |
| `company` | `text` | Yes | Internal | Provider slug; null means all |
| `locale` | `text` | Yes | Internal | Null means the provider default |
| `destination` | `text` | Yes | Internal | Provider destination filter |
| `departure_within_days` | `integer` | Yes | Internal | Rolling window from today. See below |
| `max_rows_per_request` | `integer` | No | Internal | Default 10 — the BASIC row cap |
| `max_requests_per_run` | `integer` | No | Internal | Default 1 |
| `cursor` | `text` | Yes | Internal | Persisted `next_cursor`, for resume |
| `cursor_set_at` | `timestamptz` | Yes | Internal | — |
| `high_water_updated_at` | `timestamptz` | Yes | Internal | Newest `updated_at` already ingested |
| `last_run_at` | `timestamptz` | Yes | Internal | — |
| `last_status` | `cruise_sync_status` enum | Yes | Internal | — |
| `last_error` | `text` | Yes | Internal | — |
| `created_at` / `updated_at` | `timestamptz` | No | Public | — |

**The window is rolling, not absolute.** `departure_within_days` rather than a
`departure_after` / `departure_before` pair, because a scheduled job configured with absolute
dates keeps running successfully and silently syncing nothing the moment the window falls
into the past. A rolling window cannot expire.

**`cursor` and `high_water_updated_at` are what make a budget of three requests a day
workable.** The provider's pagination is cursor-only (`starting_after` ← `next_cursor`; there
is no page or offset parameter), so a catalog pass that takes weeks of daily budget has to
resume where it stopped or it re-pays for pages it already has. `high_water_updated_at`
supports the incremental pass: the provider offers no "updated since" filter, but it does
offer `sort=updated_at:desc`, so a refresh reads newest-first and stops at the high-water
mark. As a side effect no single invocation comes near the 150-second Edge Function ceiling
that `Tech-Recommendations.md` §7 flags.

### 24.8 CruiseSyncRun

**Purpose:** One row per invocation of the sync — what it did, what it spent, how it ended.

**Phase:** P2

| Field | Type | Nullable | Sensitivity | Notes |
|---|---|---|---|---|
| `id` | `uuid` | No | Public | UUID v7 |
| `trigger` | `cruise_sync_trigger` enum | No | Internal | `cron` or `manual` |
| `status` | `cruise_sync_status` enum | No | Internal | Default `running` |
| `started_at` | `timestamptz` | No | Internal | — |
| `finished_at` | `timestamptz` | Yes | Internal | Null while running, or after a hard crash |
| `scopes_run` | `integer` | No | Internal | Default 0 |
| `requests_spent` | `integer` | No | Internal | Default 0 |
| `rows_upserted` | `integer` | No | Internal | Default 0 |
| `rows_archived` | `integer` | No | Internal | Default 0 |
| `quota_limit` | `integer` | Yes | Internal | As last reported by the relay |
| `quota_remaining` | `integer` | Yes | Internal | — |
| `quota_reset_seconds` | `integer` | Yes | Internal | — |
| `error_code` | `text` | Yes | Internal | — |
| `error_detail` | `text` | Yes | Internal | Never contains the API key |
| `created_at` / `updated_at` | `timestamptz` | No | Public | — |

This is the operational record. It is deliberately *not* the audit trail: see §24.10.

### 24.9 CruiseApiRequest

**Purpose:** One row per HTTP call to the provider. The quota ledger.

**Phase:** P2

**Separate from CruiseSyncRun because not every request belongs to a run.** A quote-time
detail refetch spends quota outside any sync, so `run_id` is nullable and the month-to-date
count has to come from this table, not from summing runs.

**Append-only**, so it carries `created_at` and no `updated_at` — the same posture as
`card_use_event` and `audit_event`.

| Field | Type | Nullable | Sensitivity | Notes |
|---|---|---|---|---|
| `id` | `uuid` | No | Public | UUID v7 |
| `run_id` | `uuid` | Yes | Internal | FK → CruiseSyncRun. Null for out-of-band calls |
| `provider` | `text` | No | Internal | Default `track_cruises` |
| `endpoint` | `cruise_sync_endpoint` enum | No | Internal | — |
| `path` | `text` | No | Internal | Request path only |
| `query` | `jsonb` | No | Internal | Default `{}`. **Sanitised — never the key** |
| `status_code` | `integer` | Yes | Internal | Null if the request never completed |
| `rows_returned` | `integer` | Yes | Internal | Detects a silent tier row-cap clamp |
| `duration_ms` | `integer` | Yes | Internal | — |
| `provider_request_id` | `text` | Yes | Internal | The provider's ULID, for support tickets |
| `quota_limit` | `integer` | Yes | Internal | `x-ratelimit-requests-limit` |
| `quota_remaining` | `integer` | Yes | Internal | `x-ratelimit-requests-remaining` |
| `quota_reset_seconds` | `integer` | Yes | Internal | `x-ratelimit-requests-reset` |
| `error_code` | `text` | Yes | Internal | — |
| `error_detail` | `text` | Yes | Internal | Never contains the API key |
| `created_at` | `timestamptz` | No | Public | — |

**Every request is logged before it is judged**, including failures and 429s, because a
rejected request has usually still been counted by the relay. A ledger that only recorded
successes would drift optimistic in exactly the situation where accuracy matters.

**The relay reports the truth, and it wins.** RapidAPI returns
`x-ratelimit-requests-limit` / `-remaining` / `-reset` on every response. When the header
says fewer requests remain than this ledger implies — quota spent from a second environment,
a manual `curl`, a colleague's test — the header is authoritative, the drift is recorded, and
the run stops. The local count is a pre-flight guard, not the source of truth.

**Indexes:** index on `(created_at DESC)` (the month-to-date ledger read); index on
`(run_id)`.

### 24.10 Access and audit posture for this domain

**RLS: enabled, and no policies.** Every table here follows the pattern all fifteen existing
migrations use — `ENABLE ROW LEVEL SECURITY` plus an explicit
`REVOKE ALL ... FROM anon, authenticated`, which is load-bearing rather than decorative
because `config.toml` sets `auto_expose_new_tables = true`. Writes are service-role only,
through the sync function.

**The public read path is deliberately not decided here.** The catalog exists to be read
anonymously eventually, and this schema would be the first table in the codebase to need
that: there are currently zero `TO anon` policies, and `20260907113546_revoke_write_grants.sql`
enforces the opposite. The two candidates are an `anon` SELECT policy gated on a published
flag — the `testimonial` / `itinerary.published_at` pattern, where the gate doubles as the
compliance review `Free-Travel-APIs.md` §10.1 wants before a synced page goes live — or a
service-role read from a Next.js server component, which is how `web/lib/onboarding/api.ts`
already talks to the backend. That choice belongs with the search work, not with the sync, and
until it is made nothing can read these tables unauthenticated.

**Audit: one row per run, not one per sailing.** CLAUDE.md rule 3 names the sensitive tables
it governs — `payment_card`, `card_authorization`, `commission`, `client` — and none of these
are among them; `onboarding-step` already sets the precedent of deliberately writing no audit
row, with a comment saying why. A per-row trail here would also be actively harmful: it would
write thousands of `audit_event` rows per run through the non-atomic path
`_shared/audit.ts` documents at length. So the sync writes a single `cruise.synced` event per
run with counts in its metadata, and `cruise_sync_run` carries the detail.

**The actor is a machine.** §15.1 makes `audit_event.actor_user_id` nullable explicitly "for
system events", and `actor_role` alongside it. A sync job has no `platform_user` row, so both
are null — which is why `_shared/audit.ts` needs a system-actor entry point rather than
`writeAuditEvent(ctx, ...)`, whose `AuthContext` presumes a human.

**Nothing in this domain is in PCI scope.** No PAN, no Stripe token, no card FK. The prices
here are supplier fares for display and quoting, not amounts anyone is charged — BRD §10.5
forbids charging a client at all. The `audit-pci` skill should read this section and move on.

---

*Story-Tail Adventures — Making Travel an Adventure*
