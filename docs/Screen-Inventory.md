# Screen Inventory
## Story-Tail Adventures — Web & Mobile CRM Platform

**Document Owner:** Gyasi Story
**Audience:** Internal (Story-Tail Adventures team, design, engineering)
**Version:** 1.0 — Draft
**Date:** May 14, 2026
**Companion Document:** BRD.md

---

## How To Read This Document

This is a screen-level inventory of the Story-Tail Adventures platform. Every screen the client or agent encounters is described here, organized first by role (Client, Agent) and then by functional area. Each screen entry follows the same shape:

- **Purpose** — what the screen exists to do
- **Primary elements** — the major UI components on the screen
- **Key actions** — what the user can do here
- **Entry points** — how a user arrives at this screen
- **Related screens** — where the user typically goes next

This document is not a wireframe or visual design. It is a checklist for designers, engineers, and product reviewers to make sure no surface is forgotten. Where a screen is logically the same across web and mobile, it is described once and any platform-specific behavior is noted inline. Mobile-only or web-only screens are flagged explicitly.

Responsive design (mobile, tablet, web variants) is covered in Section 4. Cross-cutting concerns — error states, empty states, loading states — appear in Section 5 and apply to every screen in the inventory.

Administrator-role screens are out of scope for this document and will be inventoried in a separate companion document.

---

## 1. Screen Count Summary

| Area | Screens |
|---|---|
| Client — Public / Pre-Auth Surface | 11 |
| Client — Authentication & Onboarding | 14 |
| Client — Dashboard & Trip Experience | 11 |
| Client — Self-Guided Search | 10 |
| Client — Payment & Card Authorization | 7 |
| Client — Account & Profile | 11 |
| Client — Messaging | 3 |
| Client — Mobile-Specific | 8 |
| Client — Group Trip Coordination (Future-Ready) | 4 |
| **Client total** | **79** |
| Agent — Authentication & Activation | 10 |
| Agent — Dashboard & Pipeline | 3 |
| Agent — Client Management (CRM) | 12 |
| Agent — Trip Builder & Management | 16 |
| Agent — Proposal & Itinerary | 7 |
| Agent — Payment & Card Management | 7 |
| Agent — Commission Tracking | 7 |
| Agent — Leads | 5 |
| Agent — Login Support / Account Admin | 7 |
| Agent — Messaging & Templates | 6 |
| Agent — Reporting | 8 |
| Agent — Agent Profile & Settings | 5 |
| **Agent total** | **93** |
| **Platform total** | **~172 screens** |

These counts include states, modals, and confirmation screens that meaningfully change what the user sees. They do not count every individual tab within a single screen.

---

## 2. Client Screens

### 2.0 Public / Pre-Auth Surface

**Phase:** Most of this section is **Phase 2** per BRD Section 13.2 (self-guided search and lead generation). The two MVP-bound screens are 2.0.1 (App Subdomain Public Landing) and 2.0.7 (Footer Pages) — those exist from MVP because the app subdomain needs *some* unauthenticated front door and legal pages. Screens 2.0.2 through 2.0.6 (About / How It Works, Public Search Landing, Public Search Results, Public Property/Cruise/Tour Detail, Sign-up Gate) ship with the Phase 2 self-guided search release.

The screens an unauthenticated visitor encounters before signing in or creating an account. These live at the app subdomain (app.story-tail.com) and complement — but do not replace — the marketing site at adventures.story-tail.com.

**Note on scope:** The BRD explicitly puts replacing the marketing site at adventures.story-tail.com *out* of Phase 1. The public screens described here are the pre-auth entry surface for the app subdomain only. They should drive registration or visit-back to the marketing site, not duplicate it.

**September 2026 design iteration.** The Claude Design project reorganised this section as "Public landing pages" and added four topic/advisor pages — 2.0.8 Caribbean, 2.0.9 Cruises, 2.0.10 Honeymoons, 2.0.11 About Gyasi. They are curated editorial pages (no travel-API dependency) that complement, not replace, adventures.story-tail.com, and carry the **P2** marker like the rest of the lead-generation surface. All eleven were built ahead of phase in September 2026 (user decision); the public search/results/detail pages run on Gyasi's curated catalog until the Phase 2 API search replaces the data source.

**Public top bar navigation** (all 2.0.x screens): Explore (2.0.3) · Caribbean (2.0.8) · Cruises (2.0.9) · Honeymoons (2.0.10) · About Gyasi (2.0.11), plus "Sign in" and "Create account". The footer on every public screen links the 2.0.7 legal pages, How it works (2.0.2) and the marketing site.

#### 2.0.1 App Subdomain Public Landing
**Purpose:** Greet anonymous visitors at app.story-tail.com and direct them into the right next action.
**Primary elements:** Brand hero (rotating destination imagery); single-sentence value prop ("Your Story-Tail Adventures portal — view trips, authorize payments, and explore your next adventure"); "Sign in" CTA; "Create an account" CTA; "Take a quick tour" link; "Browse trip ideas" link (to Public Search Landing); footer with link to the marketing site and legal pages.
**Key actions:** Sign in; register; browse anonymously; navigate to marketing site; tour.
**Entry points:** Direct URL; marketing-site CTAs; email-footer links from Gyasi's outbound emails.
**Related screens:** Login, Registration, Public Search Landing, About / How It Works.

#### 2.0.2 About / How It Works
**Purpose:** Explain what the portal does and how working with Gyasi works — short enough to read in under 90 seconds.
**Primary elements:** Three-step explainer (Ask → Plan Together → Travel); short Gyasi bio with photo; testimonial carousel; FAQ section (Do I pay a planning fee? — answered no; What does Inteletravel mean? — short answer; etc.); "Create an account" CTA at the bottom.
**Key actions:** Read; tap FAQ; register; contact agent.
**Entry points:** App Subdomain Public Landing "Take a tour"; nav footer.
**Related screens:** Registration, Public Search Landing.

#### 2.0.3 Public Search Landing (No Account)
**Purpose:** Let prospective clients browse trip inspiration without creating an account, then nudge them toward registering when they're ready to take an action.
**Primary elements:** Same Inspiration Hub layout as 2.4.1 but with a persistent "Sign in or create an account to save searches" banner; primary search bar; curated inspiration tiles; featured destinations; trust badges (Inteletravel hosted, certified destinations); no "saved searches" or "favorites" sections (those require account).
**Key actions:** Run a search anonymously; tap an inspiration tile; sign in or register at any time.
**Entry points:** App Subdomain Public Landing "Browse trip ideas"; marketing-site search CTA; direct deep link.
**Related screens:** Public Search Results, Registration, Login.

#### 2.0.4 Public Search Results (Browse Anonymously)
**Purpose:** Display search results to anonymous visitors with the same content as the authenticated experience but with action-gated CTAs.
**Primary elements:** Filter rail; result cards (property/cruise/tour); price; "Save for later" buttons that prompt registration; "Request a quote" buttons that prompt registration; soft persistent banner.
**Key actions:** Browse; filter; sort; attempt to save or request quote (triggers Sign-up Gate).
**Entry points:** Public Search Landing.
**Related screens:** Public Property/Cruise/Tour Detail, Sign-up Gate, Property/Cruise/Tour Detail (authenticated).

#### 2.0.5 Public Property / Cruise / Tour Detail
**Purpose:** Full detail page for a search result, anonymously viewable.
**Primary elements:** Same content as authenticated Detail screen (gallery, description, amenities, itinerary); "Favorite" and "Request a Quote" CTAs that prompt registration; "Message Gyasi without an account" link (creates a lead with just an email).
**Key actions:** View; attempt to favorite/quote (gate); message agent via low-friction lead form.
**Entry points:** Public Search Results.
**Related screens:** Sign-up Gate, Quote Request Form (post-auth).
**Phase 1 note:** "Message Gyasi without an account" is a prefilled email link in Phase 1 (the Lead entity is P2, Data Model §11); Phase 2 replaces the link target with lead capture without changing the page.

#### 2.0.6 Sign-up Gate / Quote Request Prompt
**Purpose:** Convert browsing into account creation at the moment of high intent.
**Primary elements:** Contextual headline ("Almost there — create an account to send Gyasi your trip details"); short value prop (3 bullets); inline registration form (name, email, password) with social-login options; "Already have an account? Sign in" link; "Continue as guest with just email" fallback (creates a lightweight lead, no account).
**Key actions:** Register; sign in; submit as guest.
**Entry points:** Public Search Results CTAs; Public Property/Cruise/Tour Detail CTAs.
**Related screens:** Registration, Login, Welcome / First Login, Quote Request Confirmation.
**Implementation note (web):** ships as its own route (`/join?intent=…&trip=…`) with the Pattern J centered-card look, so it deep-links and works without JavaScript; the inline form carries first name, last name, email, password and the terms checkbox required by 2.1.2. "Continue as guest" follows the 2.0.5 Phase 1 note (email link).

#### 2.0.7 Footer Pages (Privacy, Terms, Cookies, Accessibility)
**Purpose:** Legal and compliance pages reachable from any public or authenticated screen.
**Primary elements:** Standard legal copy; last-updated date; printable view; back-to-portal link.
**Key actions:** Read; print.
**Entry points:** Footer of every screen; explicit consent flows.
**Related screens:** Any screen with the global footer.

#### 2.0.8 Caribbean Landing Page
**Phase:** P2 (built ahead of phase, September 2026).
**Purpose:** Topic landing page for the business's core region — a curated Caribbean front door that turns browsing into quote requests and account creation.
**Primary elements:** Full-bleed hero ("A region built for rest."); sticky inquire bar (destination · when · travelers · vibe → "Request a quote"); three-point intro band (handled details, honest prices, rest you bring home); island tile strip (Turks & Caicos, Bahamas, St. Lucia, Jamaica, Aruba, BVI); hand-picked trip grid with $/$$/$$$ range chips, "Request quote" and save CTAs; "See all" link into Public Search Results; closing CTA band; footer.
**Key actions:** Request a quote (→ Sign-up Gate); save a trip (→ Sign-up Gate); open a trip's Public Detail; tap an island (→ Public Search Results); message Gyasi without an account.
**Entry points:** Public nav "Caribbean"; App Subdomain Public Landing; marketing-site links.
**Related screens:** Public Search Results, Public Property / Cruise / Tour Detail, Sign-up Gate.

#### 2.0.9 Cruises Landing Page
**Phase:** P2 (built ahead of phase, September 2026).
**Purpose:** Topic landing page for cruising — family, adults-only and group sailings, with the lines Gyasi books.
**Primary elements:** Full-bleed hero ("A floating Sabbath, every morning new."); sticky inquire bar; "Who it's for" cards (family / adults-only / group); cruise-line chip row; hand-picked sailings grid; "See all" link; closing CTA band.
**Key actions:** Request a quote; save; open a sailing's Public Detail; message Gyasi.
**Entry points:** Public nav "Cruises"; inspiration tile "Family cruises".
**Related screens:** Public Search Results, Public Property / Cruise / Tour Detail, Sign-up Gate.

#### 2.0.10 Honeymoons Landing Page
**Phase:** P2 (built ahead of phase, September 2026).
**Purpose:** Topic landing page for honeymoons — the most personal trip Gyasi plans.
**Primary elements:** Tall full-bleed hero ("The first rest, after the I-do's."); sticky inquire bar; a note from Gyasi; "Three ways to honeymoon" cards (adults-only resorts / overwater bungalows / multi-stop); featured packages grid; an opt-in card for couples who want a faith-shaped rhythm to the week (voice: Design System §2.2, §2.5 — offered, never assumed); closing CTA band.
**Key actions:** Request a quote; save; open a Public Detail; see the curated list (→ Public Search Results filtered to honeymoons); message Gyasi.
**Entry points:** Public nav "Honeymoons"; inspiration tile "Honeymoons".
**Related screens:** Public Search Results, Public Property / Cruise / Tour Detail, Sign-up Gate.

#### 2.0.11 About Gyasi
**Phase:** P2 (built ahead of phase, September 2026).
**Purpose:** The advisor page — who Gyasi is, why Story-Tail exists, and the proof behind it. Complements 2.0.2 (how the portal works) rather than repeating it.
**Primary elements:** Gradient hero with portrait ("Hi, I'm Gyasi."), "Request a quote" and "Message me first" CTAs; stats strip (travelers served, rating, reply time, years); the story (bio paragraphs, signed in the script face); credentials list; testimonials; FAQ; closing CTA band. Every figure, credential, testimonial and biographical claim comes from the marketing-claims registry (`web/content/public/proof.ts`) and is flagged until verified; a strict production build refuses to ship unverified claims.
**Key actions:** Request a quote; message Gyasi; read; expand FAQ.
**Entry points:** Public nav "About Gyasi"; the Gyasi card on 2.0.2 and 2.0.5; footer.
**Related screens:** About / How It Works, Sign-up Gate.

---

### 2.1 Authentication & Onboarding

#### 2.1.1 Login Screen
**Purpose:** Authenticate a returning client.
**Primary elements:** Story-Tail branded header; email field; password field; "Sign in" CTA; "Sign in with Google" and "Sign in with Apple" buttons; "Forgot password?" link; "Create an account" link; legal footer.
**Key actions:** Sign in with credentials; sign in with social; navigate to registration or password reset.
**Entry points:** App launch; logged-out web visit; deep link to an authenticated screen.
**Related screens:** MFA Challenge, Dashboard, Forgot Password, Registration.

#### 2.1.2 Registration / Sign Up Screen
**Purpose:** Create a new client account.
**Primary elements:** Story-Tail branded header; first name; last name; email; password (with strength meter); password confirmation; checkbox for terms of service and privacy policy; "Create account" CTA; "Sign up with Google" / "Sign up with Apple"; link to existing-account sign-in.
**Key actions:** Submit registration; sign up via social provider; review terms.
**Entry points:** Login screen "Create an account" link; marketing site CTAs; referral links from agent.
**Related screens:** Email Verification, Welcome / First Login.

#### 2.1.3 Email Verification Screen
**Purpose:** Confirm the client owns the email address they registered with.
**Primary elements:** Confirmation message ("We sent a link to your email"); resend link CTA; help text; option to update email address.
**Key actions:** Resend verification email; update email; sign out.
**Entry points:** Post-registration; after an unverified user tries to access a sensitive feature.
**Related screens:** Login, Welcome.

#### 2.1.4 Forgot Password Screen
**Purpose:** Initiate password reset.
**Primary elements:** Email field; "Send reset link" CTA; helper text; link back to login.
**Key actions:** Request reset link.
**Entry points:** Login screen "Forgot password?" link.
**Related screens:** Login, Reset Password.

#### 2.1.5 Reset Password Screen
**Purpose:** Set a new password from a reset link.
**Primary elements:** New password field; confirm password; strength meter; "Update password" CTA.
**Key actions:** Set new password.
**Entry points:** Tapping the reset link from email.
**Related screens:** Login.

#### 2.1.6 MFA Setup Screen
**Purpose:** Enable multi-factor authentication. MFA is optional for clients but strongly encouraged once they store a payment card; it is required for agents (see 3.1.6).
**Primary elements:** Explanation of MFA benefits; choice of MFA method (authenticator app, SMS, email); QR code or phone number entry; backup codes display; confirmation field.
**Key actions:** Choose method; verify enrollment; download backup codes.
**Entry points:** Security Settings (self-initiated); soft prompt after the client adds their first payment card.
**Related screens:** Security Settings, MFA Challenge.

#### 2.1.7 MFA Challenge Screen
**Purpose:** Validate a second factor during login.
**Primary elements:** Method indicator; code entry field; "Verify" CTA; "Use a backup code" link; "Resend code" link.
**Key actions:** Enter verification code; switch methods; resend.
**Entry points:** Post-credential authentication for MFA-enabled accounts.
**Related screens:** Dashboard.

#### 2.1.8 Social Login / Account Linking Screen
**Purpose:** Handle the case where a social login email matches an existing email account, prompting the user to link.
**Primary elements:** Notice that an account already exists; option to sign into the existing account to link; option to use a different email.
**Key actions:** Sign into existing account; cancel link.
**Entry points:** OAuth callback when an email collision is detected.
**Related screens:** Login.

#### 2.1.9 Welcome / First Login Screen
**Purpose:** Greet the first-time client warmly and orient them.
**Primary elements:** Branded hero with a personal welcome from Gyasi; brief tour of key features (3–5 cards); "Get started" CTA; option to skip.
**Key actions:** Start onboarding; skip to dashboard.
**Entry points:** First successful login after registration.
**Related screens:** Profile Completion, Travel Preferences, Dashboard.

#### 2.1.10 Profile Completion Screen
**Purpose:** Capture core profile data needed for trip planning.
**Primary elements:** Phone number; mailing address; date of birth; emergency contact (name, phone, relationship); passport info (number, expiry, country of issue — optional but encouraged); "Save & continue" CTA; "Skip for now" link.

> Built September 2026, with two departures from the prototype worth recording.
>
> **The passport NUMBER is deferred; expiry and country of issue ship.** `travel_document.document_number_encrypted` is Sensitive PII that Data-Model §18.2 requires be encrypted under a backend-held DEK wrapped by a KMS key, with §18.3 auditing on every decryption. None of that is built — there is no crypto helper in `supabase/functions/_shared/` and no key management — and collecting a passport number in order to store it unprotected is worse than not collecting it. The expiry is what drives the renewal reminder, so it is the part travelers actually feel. The Edge Function refuses a `passport.number` key loudly rather than ignoring it. The field returns with the encryption pass.
>
> **The mailing address is six structured fields, not one line.** There is no free-text address column anywhere in the schema: `client.mailing_address_id` is a FK to `address`, whose `line1`, `city` and `country` are NOT NULL and whose country is `char(2)`. The prototype's single input would have to be parsed, and an address parser fails the first time somebody types an apartment number. Street, apt, city, region, postal code and country are collected and validated as a group — all three NOT NULL parts together, or none of them.
>
> **Today this screen is reachable only from the wizard.** The `(onboarding)` route group redirects anybody whose onboarding is finished to the dashboard, so the "account settings" entry point above belongs to **2.5.2 Personal Info Edit** — which is Pattern A where this is Pattern G, and is the right shape for editing. 2.5.2 should reuse `web/lib/validation/profile.ts` and the same Edge Function rather than growing a second set of rules.
>
> **Phone numbers are stored E.164** (Data-Model §6.1), normalised in both the form and the Edge Function. A number carrying a `+` is taken as given; a bare ten digits is assumed North American, and the field hint says so rather than assuming silently. A full libphonenumber dependency would need the third-party review CLAUDE.md requires.

**Key actions:** Save profile data; skip step.
**Entry points:** First-time onboarding; account settings.
**Related screens:** Travel Preferences, Dashboard, Personal Info Edit.

#### 2.1.11 Travel Preferences Capture Screen
**Purpose:** Learn how the client likes to travel so the agent can serve them better.
**Primary elements:** Preferred destinations (tag picker); travel styles (resort, cruise, adventure, romantic, family, group); dietary restrictions; accessibility needs; frequent flyer / loyalty program memberships; budget comfort range; favorite past trips (free text); "Save" CTA.

> Built September 2026. Four things the prototype could not express, all now in
> `docs/Data-Model.md` §6.2 and the migration `20260904124903_travel_preference_vocabulary`.
>
> **The budget slider is four bands.** The artboards show a dual-thumb range from $1k to
> $10k+; `travel_preference.budget_band` is one nullable `text` whose domain is
> {budget, mid, premium, luxury}. Two thumbs is two numbers, and storing them would mean
> three new columns (min cents, max cents, currency — CLAUDE.md rule 5) to capture a figure
> the client is guessing at. The four bands also match `lead.budget_band`, so a Phase 2 lead
> converts without translation. **The dollar figures behind the four labels are display copy,
> not data** — only the slug is stored, so they can be re-cut when Gyasi says where his trips
> actually sit. They were read off the prototype's demo slider and nobody has ratified them.
>
> **"Honeymoon" the label stores `romantic` the value.** Both this section and the Data
> Model name the value `romantic`; only the prototype says Honeymoon, and Honeymoon is the
> better label because it is what a person calls their trip. Flagged because the mapping is
> invisible in both artboards and a straight transcription produces a value nothing else in
> the system recognises — one the CHECK constraint now refuses outright.
>
> **The three slug arrays are closed and the free text has its own columns.** The prototype
> offers five diet chips and four accessibility chips, and neither set can say "severe tree
> nut allergy" or "CPAP, needs an outlet by the bed" — which are the sentences an advisor
> forwards to a resort. Rather than appending prose into arrays that agent-side filtering
> (§3.9.x) will group on, `dietary_notes` and `accessibility_notes` were added. `none` is
> stored explicitly and is mutually exclusive with a real answer: an empty array already
> means "never asked", and telling a kitchen "nothing to worry about" is a different fact.
>
> **The single loyalty text input is a two-column repeater.** The column holds
> `{program, number, tier}` objects; splitting `"Marriott Bonvoy 123"` on the last space
> credits somebody's miles to a program called Marriott.
>
> Two smaller notes. The chip groups **wrap rather than scroll** — §4.4 used to call them
> "scrollable chip groups" on mobile, and a horizontal scroller hides options on a screen
> whose instruction is "tag what's true"; that line is corrected. And every step now carries
> a **Back** affordance with completed rail steps as real links, which §4.3 requires of
> Pattern G and neither artboard drew.

**Key actions:** Tag preferences; save.
**Entry points:** Onboarding; account settings.
**Related screens:** Dashboard, Travel Preferences Edit.

#### 2.1.12 Travel Companions / Household Setup Screen
**Purpose:** Identify recurring travel companions so future trips can pre-populate travelers.
**Primary elements:** "Add traveler" form (name, relationship, date of birth, passport info if applicable); list of added companions; option to invite them to the platform (optional).

> Built September 2026, with the invite deferred and the passport number dropped.
>
> **"Invite them to the platform" cannot be honoured yet, and is deferred to P3.** Sending
> one needs four things the schema does not have or does not permit: an email address for
> the companion (`companion` has no email or phone column at all), a `client` row for them
> (`client_invite.client_id` is NOT NULL and FKs to `client`), an `agent_id` on that row
> (also NOT NULL — so a client-initiated invite would silently write a new record into an
> agent's book of business), and an issuing user (`client_invite.issued_by_user_id`, which
> is meant to be the agent). A traveler can legitimately supply none of them. Setting
> `is_invited_to_platform` without the workflow behind it only puts a lie in the database,
> so the control is not built; it returns with agent-side invite issuance.
>
> **No passport number, for two reasons rather than one.** The first is 2.1.10's: no column
> encryption yet. The second is specific to this screen and would survive the first being
> fixed — the onboarding migration re-granted `authenticated` every column of `companion`
> EXCEPT `passport_number_encrypted`, and Postgres checks column privilege on ANY reference,
> so the client surface cannot even ask whether a number is on file. A field that can be
> written and never read back, on a record kept for somebody else, is worse than no field.
> Expiry and issuing country are collected and are what drive the renewal warning.
>
> **The card subtitle shows an expiry, never a number.** The prototype prints
> "Passport B987654321 · 02/2031". Beyond the grant above, Data-Model §18.3 requires an
> `audit_event` for every decryption of that column — which makes rendering one per
> companion on every page load plainly wrong even once the crypto exists.
>
> **Editing a companion is a full replace, not a patch**, unlike 2.1.10's profile write: the
> form shows every field at once, so a field left empty means the traveler cleared it.

**Key actions:** Add companion; edit companion; remove companion.
**Entry points:** Onboarding (optional); account settings; trip creation flow.
**Related screens:** Dashboard, Personal Info Edit.

#### 2.1.13 Connect with Agent / Invite Code Screen
**Purpose:** Link the new account to trips the agent has already created in the system before the client registered. This is the bridge between "the agent set up a trip for me" and "I'm now in the portal".
**Primary elements:** Brief explanation ("If Gyasi has already started planning a trip for you, enter the code from your invitation email to link it to your account"); invite code input; "I don't have a code" link (skips to dashboard); auto-match notice if the platform detects existing records by email; option to message the agent for help.

> Built September 2026.
>
> **The screen reports the automatic match; it does not promise it.** The prototype's
> subtitle says "skip — we'll find them automatically by email", and by the time this
> screen renders that has already either happened or not: `handle_user_email_confirmed()`
> adopts a matching unclaimed client at email confirmation. This screen exists precisely for
> the cases where it could not — a different address, or two candidates and the trigger
> deliberately claiming neither. Telling somebody the automatic match is coming, on the
> screen that exists because it did not, is the one thing the copy must not do.
>
> **Redemption moves account ownership**, so it also moves everything the traveler entered
> on steps 2 through 4 — profile fields where the target has none, address, preferences,
> companions and travel documents — onto the target client, then disposes of the throwaway
> the sign-up created. Never overwriting what Gyasi already has: the agent has had the
> record for weeks and may know better than a sign-up form. The agent's spelling of the name
> wins, matching the precedent the confirmation trigger already sets.
>
> **Refusals are specific, and that is a considered departure from how sign-in behaves.**
> There, "no such account" and "wrong password" must be indistinguishable, because an email
> address is guessable from outside knowledge. A code is six characters of a 36-symbol
> alphabet and attempts are capped at ten per quarter-hour, so enumeration is not the live
> risk — a traveler whose invitation has sat in an inbox for five weeks is. They are told the
> code expired rather than left retyping it. Every attempt writes an `audit_event` carrying
> the outcome and never the code or its hash; refusals are recorded but do not feed the
> rate-limit counter, or each retry would extend its own lockout.
>
> **`trip` had row-level security enabled and no policy at all**, which for a client meant
> every SELECT returned zero rows — silently, because RLS filters rather than errors. The
> "trips already in your name" panel would have rendered empty for everybody. Fixed by
> `trip_self_select`, paired with a column grant that keeps `notes` (the agent's own) and
> `total_commission_cents` (not the client's number) out of reach. 2.2.1 and 2.2.2 needed the
> same policy.

**Key actions:** Enter code; skip; message agent.
**Entry points:** Post-registration onboarding; manual access from account settings.
**Related screens:** Onboarding Complete, Dashboard, Messages.

#### 2.1.14 Onboarding Complete / "You're All Set" Screen
**Purpose:** Confirm onboarding is done and celebrate the moment, with a clear next-action map.
**Primary elements:** Branded success illustration; checklist of what was set up (profile, preferences, companions, agent connection); recommended next actions ("View your upcoming trip", "Explore the search", "Message Gyasi").

> Deferred, September 2026: "option to fine-tune notification preferences before going to dashboard". `notification_preference` has RLS enabled with no policy, no row is created for a user by any path, and Screen 2.5.6 that would manage it is unbuilt — so the control had nowhere to link. It returns to this screen when 2.5.6 ships, which also needs to give the table a row-creation path (its `user_id` is the primary key, so a screen with no row has nothing to read).

> Built September 2026.
>
> **What the screen says is assembled from what is actually on file.** The prototype's
> subtitle is a fixed sentence — "Your profile, preferences, household, and existing trip
> with Sandals are all linked up" — which is true of the artboard and of nobody else. Every
> step of this wizard is skippable, so the traveler most likely to reach this screen having
> skipped things is exactly the one that sentence would mislead. The checklist names what
> was skipped rather than omitting it, in words and not only in an icon: a list showing only
> successes reads as a complete list, and somebody who skipped preferences would never learn
> the option is still open.
>
> **The third recommended action appears only when there is somewhere for it to go.** In-app
> messaging is Screen 2.6 and is unbuilt, so "Message Gyasi" is a mail client or it is
> absent — a card that looks like a way to reach him and is not one is worse than a row of
> two.

**Key actions:** Continue to dashboard; jump to a featured action.
**Entry points:** Completion of Connect with Agent (or skipping it).
**Related screens:** Dashboard, Notification Preferences, Search Landing, Trip Detail.

---

### 2.2 Dashboard & Trip Experience

> **All eleven screens built September 2026**, on web and on Android/iOS, against live Supabase data. This is the first section that reads real trip data, the first with an authenticated app shell, and the first where writes go through audited Edge Functions. Six decisions apply across the whole section; the per-screen notes below record only what a specific screen did differently.
>
> **The reads are column-grant-scoped, not just row-scoped.** RLS decides which *rows*; GRANTs decide which *columns*. Eight tables got a policy and an explicit column list, and eleven columns are deliberately withheld from `authenticated`: `trip.notes` and `trip.total_commission_cents`, `trip_component.cost_cents` and its commission and API fields, `document.storage_bucket`/`storage_key`/`checksum_sha256`, `conversation.agent_unread_count`, `message.is_internal_note` and `read_by_other_at`, `proposal.viewed_at`, `itinerary.version`. Selecting one of those raises 42501 rather than returning fewer columns — an accidental `select *` fails loudly instead of shipping the agency's economics to the traveler. `supabase/tests/rls_trip_graph.sql` asserts every one of them, as the client, as the co-traveler, as the agent and as anon.
>
> **Client writes go through Edge Functions, never PostgREST.** There is no write policy on any table in this section, so a browser `.insert()` would match nothing and return 204 — it would look like it worked. Four functions carry the writes: `trip-message`, `trip-document`, `trip-document-url` and `testimonial`. Each resolves the caller from the JWT, checks ownership explicitly (it runs on the service role, so RLS is checking nothing for it), and writes an `audit_event` per CLAUDE.md rule 3. "No such row" and "not yours" return the same 404 throughout, so ids cannot be enumerated.
>
> **Storage has exactly one door.** `document.storage_key` is outside the column grant and Storage is addressed *by key*, so a client who cannot read the key cannot form a request — which makes every `authenticated` policy on `storage.objects` unreachable. The bucket therefore has none, and `trip-document-url` is the only way in. That is not a web convenience: Compose Multiplatform has no server, so without it 2.2.6 and 2.2.11 could not open a file on a phone at all. Signing is on demand rather than per page load, because every signature writes an access record and a five-minute URL for a file nobody opened is a false entry on that trail.
>
> **Two new entities.** `payment_milestone` (Data-Model §9.5) and `testimonial` (§8.7), both documented before the migrations. The milestone is **a supplier payment schedule the client is kept informed about, not an invoice** — BRD §10.5 prohibits client-facing billing, so there is no merchant-of-record field, no "pay now", and no Stripe reference; the only client action near money stays §2.4's card *authorization*. `message_attachment` (§12.3) was also created, being the one P1 entity that had no migration.
>
> **Every derived label lives in one table per stack, compared by CI.** Two of the seven trip-status labels are *derived* — the enum has no "Final payment due" and no "Traveling now" — so the mapping exists in `web/lib/trips/status.ts` and `domain/trip/TripStatus.kt` and nowhere else. Six such tables now cover status, documents, threads, memories, status changes and destinations; `.github/scripts/check_copy_parity.py` compares 293 messages across 26 modules on every CI run. Copy that a traveler reads must not differ between the browser and the phone, and nothing else would catch it.
>
> **§5's four states are shell infrastructure, not per-screen work.** Four states × eleven screens × two stacks is 88 hand-written states and exactly how they drift. Web uses route-level `loading`/`error` boundaries plus one primitive set in `web/components/client/states.tsx`; native uses a single `Loadable<T>` sealed interface. `Unauthorized` is not decoration — an agent's `platform_user.client_id` is NULL, so every policy predicate here evaluates NULL for them and returns zero rows, which without that state renders as the friendly "no trips yet" empty state. That reads as data loss.

#### 2.2.1 Client Dashboard / Home
**Purpose:** The client's landing page after login — surfaces what matters most right now.
**Primary elements:** Personalized greeting; upcoming-trip hero card (countdown, key dates, weather, "View Itinerary" CTA); trips-in-planning section; recent activity (proposal received, payment authorization requested, etc.); message preview; "Explore trips" CTA leading to self-guided search; brand-aligned visual treatment with hero image.
**Key actions:** Tap into upcoming trip; review pending actions; jump to messages; start a search.
**Entry points:** Post-login; bottom nav "Home" on mobile.
**Related screens:** Trip Detail, Itinerary Viewer, Messages Inbox, Search Landing.

#### 2.2.2 All Trips List
**Purpose:** Single place to find any trip — current, future, or past.
**Primary elements:** Tabs or filters for "Upcoming", "In Planning", "Past", "Cancelled"; trip cards (hero image, destination, dates, traveler count, status badge); sort options (date, alpha); search field.
**Key actions:** Filter; sort; open trip detail.
**Entry points:** Dashboard "See all trips"; nav menu "My Trips".
**Related screens:** Trip Detail.


> Built September 2026. **The traveler count is on the card and the recent-activity feed is not.**
>
> §2.2.1 above names "recent activity (proposal received, payment authorization requested, etc.)" and a "message preview" among the dashboard's primary elements. The message preview is built. The activity feed is **not**, and nothing backs it: there is no activity or event table a client may read — `audit_event` is the agency's record and has no client policy, by design — so a feed would have to be assembled from heuristics over four other tables and would be wrong the first time two things happened in one minute. §2.6's notification centre is the right home for it.
>
> **The advisor card quotes Gyasi only.** `conversation.last_message_preview` is the last thing *anybody* said, so the card carries the sender and drops the quote when the traveler spoke last, keeping the reply-window line instead. Rendering it unconditionally attributed a traveler's own question to their advisor, in quote marks, under his name.

#### 2.2.3 Trip Detail / Overview
**Purpose:** Single-pane view of one trip, with quick access to itinerary, payments, documents, and messages.
**Primary elements:** Hero image; trip title; dates; travelers; current status; countdown (if upcoming); summary stats (nights, destinations, components); CTAs for Itinerary, Payments, Documents, Messages; agent contact card; trip notes from agent.
**Key actions:** Open itinerary; manage payments; view documents; message agent.
**Entry points:** Dashboard hero card; All Trips List; deep link from email.
**Related screens:** Itinerary Viewer, Card Authorization for Trip, Trip Document Library, Conversation Thread.

#### 2.2.4 Itinerary Viewer (Day-by-Day)
**Purpose:** Present the trip itinerary in the brand-aligned, day-by-day format.
**Primary elements:** Trip header (title, dates, travelers); day navigator (Day 1, Day 2, ...); for each day: date and label, morning/afternoon/evening blocks with activities, times, addresses, confirmation numbers, "Gyasi's Tip" callouts; important info section (insurance, emergency contacts, packing); "Download PDF" and "Share with co-traveler" CTAs.
**Key actions:** Navigate days; expand activity details; download PDF; share secure link.
**Entry points:** Trip Detail; dashboard hero CTA; mobile deep link.
**Related screens:** Itinerary Day Detail, Trip Document Library.

#### 2.2.5 Itinerary Day Detail
**Purpose:** Drill into a single day with extra detail (used heavily on mobile during travel).
**Primary elements:** Date and day label; full activity list with maps where applicable; weather forecast for the day; reservation confirmations; supplier contact buttons (call, message); offline indicator if cached.
**Key actions:** Tap address to open in maps; tap phone to call; mark activity as done (optional check-in feature).
**Entry points:** Itinerary Viewer day tap.
**Related screens:** Itinerary Viewer.

#### 2.2.6 Trip Document Library
**Purpose:** All documents associated with a trip in one place.
**Primary elements:** Document list grouped by type (Supplier confirmations, Passport copies, Visa, Insurance, Boarding passes, Photos); thumbnail or icon per doc; uploaded-by indicator (agent vs. client); upload CTA; download/share actions per doc.
**Key actions:** View document; download; upload new document; share document.
**Entry points:** Trip Detail.
**Related screens:** Document Upload, Trip Detail.


> Built September 2026, with three departures.
>
> **Uploading is not built; the CTA renders disabled with a reason.** `trip-document` signs the PUT, but the file picker (an `expect`/`actual` per platform), the progress state and the confirm step that replaces the placeholder `checksum_sha256` are the separate **Document Upload** screen this section already lists among its related screens. The checksum is stored as zeroes until that step exists — a checksum of the filename would look like a verified digest of content nobody has seen.
>
> **Per-document share is gone rather than disabled.** The share question was settled as PDF-only with the secure link deferred to §2.8, so there is no share of a single document to offer, and a dimmed control implies one is coming.
>
> **"Boarding passes" is not a group.** This section names six groups; there are ten `document_kind` values and the mapping is not one-to-one. Passports and visas share one drawer, because a traveler thinks of them as one. Boarding passes arrive as `supplier_confirmation` and are filed there — its own heading would always be empty. Four kinds never reach a client at all: `receipt`, `csv_import`, `pdf_proposal` and `other` are outside the read allowlist, and the `receipt` case is the reason that allowlist exists rather than a plain ownership test. `card_use_event.trip_id` is NOT NULL, so supplier-charge receipts are trip-scoped by construction, and an ownership-only policy would have handed the traveler exactly the agency economics withheld everywhere else in this section.

#### 2.2.7 Trip Messages / Conversation Thread (Per Trip)
**Purpose:** Trip-scoped conversation with the agent.
**Primary elements:** Thread header (trip name, agent); message bubbles (client + agent); attachment thumbnails; compose bar; typing indicator; read receipts.
**Key actions:** Send message; attach file/photo; tap suggested-reply chips.
**Entry points:** Trip Detail; Messages Inbox.
**Related screens:** Trip Detail, Messages Inbox.


> Built September 2026. **Two of the named primary elements are absent, both for want of something to build them on.**
>
> **The typing indicator needs Realtime presence.** There is no presence channel in this codebase and no column that could stand in. Faking it — showing a dot on a timer — would be inventing the other person's behaviour.
>
> **Read receipts would need `message.read_by_other_at`**, which is withheld from the client column grant on purpose: it tells a traveler exactly when Gyasi opened their message, and an advisor who reads at 11pm should not have that on the record for every client he has. `conversation.client_unread_count` *is* granted, and gives the traveler the half of the signal that is theirs — what they have not read.
>
> This screen and **2.6.2** are one component at two mounts, which is why nothing here reads from the trip beyond its title.

#### 2.2.8 Empty Trip Component States
**Purpose:** When parts of an itinerary are not yet populated.
**Primary elements:** Friendly empty-state messaging ("Your flights aren't booked yet — we'll add them here once confirmed"); CTA to ask the agent.
**Key actions:** Message agent.
**Entry points:** Itinerary Viewer where components are missing.
**Related screens:** Conversation Thread.

#### 2.2.9 Trip Status Change Notification View
**Purpose:** When the agent has updated a trip's status (proposal sent, booked, etc.), the client lands here from a notification.
**Primary elements:** Status banner; brief description of what changed; CTA to view the relevant section.
**Key actions:** View proposal / view updated itinerary / authorize payment.
**Entry points:** Push or email notification.
**Related screens:** Trip Detail, Itinerary Viewer, Card Authorization.


> Built September 2026, as a **route rather than a sheet**, and saying rather less than the artboards do.
>
> **A route, not a sheet.** Both artboards draw this over a dimmed dashboard, which is right when a status changes while somebody is already in the app. But this section's own entry points are "push or email notification" — so the case that has to work is arriving *cold*, from a tap, on a device where the app was not running, and a sheet has nothing to arrive at. Web serves it at `/trips/[tripId]/update`; native pushes `AppRoute.TripUpdate`. The sheet presentation belongs to §2.6's notification centre.
>
> **Nothing in the schema records a status *diff*.** There is `trip.status` and `trip.status_changed_at`, and no history table. So the headline and the description are derived from the status the trip landed *on*, and every supporting fact is a real row rendered only when it exists — a *sent* proposal, a published itinerary, the next unpaid milestone. The artboard's "two room types to choose between" is said by nothing, because no column counts room options. Narrating a change we cannot see would put words in Gyasi's mouth on the one screen a traveler reaches without asking for it.
>
> **The timestamp is absolute, not relative.** The artboard says "STATUS UPDATED · 2 MIN AGO", which is true when the notification fires and a confident lie by the time somebody opens the email next morning.

#### 2.2.10 Trip Cancellation View
**Purpose:** When a trip has been cancelled, the client sees a cancellation summary with relevant next steps.
**Primary elements:** Cancellation banner; cancellation reason (if shared); refund/credit status; agent contact CTA; archived itinerary access.
**Key actions:** Message agent; view archived itinerary.
**Entry points:** Trip Detail for cancelled trips; notification.
**Related screens:** Conversation Thread.


> Built September 2026 as an **in-place variant of 2.2.3**, not as its own route — §4.4 calls it a "Pattern C variant" and that is what it is: the same hero and the same identity, with a cancellation summary where the tiles were, and the photograph desaturated. `/trips/[tripId]` for a cancelled trip *is* this screen, so a notification can still link straight to it.
>
> **It renders two client-visible columns and derives nothing.** Data-Model §21 reclassified `cancellation_reason` and `refund_status` as client-visible precisely so this screen could exist, and those two plus the status-change date are all it shows.
>
> The artboard also breaks out a cancellation *fee*, a refund *amount* and a future-trip *credit* with an expiry as separate labelled rows. **There are no columns for those.** `refund_status` is unconstrained `text`, so whatever the agent writes there is what a traveler reads — the seed's row is "Refunded $1,640 on Feb 12; $240 future-trip credit through Dec 2027", and the screen prints it verbatim. So the *numbers* do reach the screen; what does not exist is any structure behind them.
>
> That is a real weakness and worth naming rather than leaving to be discovered: money in a free-text status field cannot be formatted, cannot be localised, cannot be reconciled against `trip.total_paid_cents`, and cannot be reported on. It is also the one place in §2.2 where a figure a traveler sees is not `bigint` cents — CLAUDE.md rule 5 governs money *columns*, and this is prose that happens to contain money, which is exactly how that rule gets eroded. Structuring it means new columns and a Data-Model change, so it is deliberately **not** done here; the alternative considered and rejected was parsing the prose to reformat it, which would be worse than printing it.
>
> **The "Ready to plan again?" card was rewritten, not repointed.** The desktop artboard pushes — "Gyasi has 3 options for fall", a claim nothing backs — at somebody whose trip has just collapsed. §2.6's third tone check asks whether copy leaves room for rest.

#### 2.2.11 Past Trip Detail / Memory View
**Purpose:** A nostalgic, scaled-back trip detail for past trips that emphasizes memory and re-booking.
**Primary elements:** Trip recap card; uploaded photos; testimonial submission CTA; "Book a similar trip" CTA; archived itinerary access.
**Key actions:** Upload photos; submit testimonial; start a new search seeded with the past trip details.
**Entry points:** All Trips List → Past tab; dashboard "Past trips" section.
**Related screens:** Search Landing, Conversation Thread.


> Built September 2026, with its own route and three departures.
>
> **A route of its own**, unlike 2.2.10 above, and the asymmetry is deliberate. A cancelled trip is the overview with a different card; a past trip is a gallery and a note where the other has tiles and a payment timeline, which is what "nostalgic, scaled-back" in the purpose line describes. `/trips/[tripId]` redirects a completed trip here, and this screen redirects back if the trip is not actually past — a bookmarked URL should not show a memory view of a trip somebody is about to take.
>
> **The note from Gyasi leads, above the photos, on web as well as mobile.** The desktop artboard puts it in the right rail; the mobile one moves it first. Web follows the mobile artboard here because this screen exists for the feeling, and the emotional beat should not be the last thing a traveler scrolls past. It reads `itinerary.closing_note` in preference to `intro_note` — an intro note reads oddly in the past tense.
>
> **The photographs are not rendered from storage.** Each tile is the filename over the trip's own hero image and taps through to 2.2.6. Rendering the real objects would mean signing a URL per photograph on every page load — a five-minute URL and an access record each, for images nobody may look at. 2.2.6 is where a photograph gets opened, and it signs on demand.
>
> **"Book a similar trip" repoints at the thread.** §2.3 is Phase 2, so there is no search to seed with the past trip's details. "Gyasi still has your notes from this one" is both true and closer to what a traveler wants.
>
> **The testimonial is a reflection first.** The prompt is *"What did you carry home from this trip?"* — Design-System §2.4's framing — not a star widget, which is also why `rating` is nullable. A client can reach `draft` and `submitted` and no further state; approval and publication are agent actions arriving with §3.x, and the table's CHECK constraints refuse a `published_at` without an `approved_at` so a bug there fails loudly rather than quietly publishing somebody's words. Submitting is one-way: once it leaves `draft` the body is frozen, because Gyasi may already have read it.

---

### 2.3 Self-Guided Search

**Phase:** All screens in Section 2.3 are **Phase 2** per BRD Section 13.2. They depend on the travel API integrations (Amadeus, Hotelbeds, Viator) that ship in Phase 2 and on the Lead / SavedSearch / Favorite entities marked P2 in Data Model Section 4. They do not exist at MVP.

#### 2.3.1 Search Landing / Inspiration Hub
**Purpose:** Entry point for self-guided trip exploration.
**Primary elements:** Brand-aligned hero; primary search bar (destination, dates, travelers); curated inspiration tiles (Caribbean, Cruises, All-Inclusive, Family, Honeymoon, Hot Deals); recent searches; featured destinations.
**Key actions:** Start a search; tap an inspiration tile.
**Entry points:** Marketing site link; dashboard "Explore trips"; bottom nav "Search" on mobile.
**Related screens:** Search Form, Search Results.

#### 2.3.2 Search Form
**Purpose:** Capture the criteria for a self-guided search.
**Primary elements:** Destination (autocomplete, multi-select); trip type chips (Resort, Cruise, Tour, Custom); departure and return dates; flexible-date toggle; travelers (adults, children with ages); budget range slider; preferred trip style; "Search" CTA.
**Key actions:** Enter criteria; save search; submit.
**Entry points:** Search Landing; refining a search.
**Related screens:** Search Results.

#### 2.3.3 Search Results — Hotels & Resorts
**Purpose:** Display matching properties.
**Primary elements:** Filter rail (price, star rating, amenities, board basis, location); map/list toggle; property cards (hero image, name, price per night, amenities, "Gyasi's pick" badge where applicable); sort options.
**Key actions:** Filter; sort; favorite a property; open property detail; request quote.
**Entry points:** Search Form; refining filters.
**Related screens:** Property Detail, Quote Request, Favorites.

#### 2.3.4 Search Results — Cruises
**Purpose:** Display matching cruise itineraries.
**Primary elements:** Filter rail (cruise line, ship, ports, length, departure port); cruise cards (ship image, itinerary stops, dates, price from); sort.
**Key actions:** Filter; sort; favorite cruise; open cruise detail; request quote.
**Entry points:** Search Form.
**Related screens:** Cruise Detail, Quote Request, Favorites.

#### 2.3.5 Search Results — Flights
**Purpose:** Display matching flight options (display-only at MVP per BRD).
**Primary elements:** Filter rail (airline, stops, departure time, duration); flight cards (carrier, times, stops, price); sort.
**Key actions:** Favorite; request quote that includes a flight reference.
**Entry points:** Search Form when flights are part of the request.
**Related screens:** Quote Request.

#### 2.3.6 Search Results — Tours & Activities
**Purpose:** Browse tours/excursions for a destination.
**Primary elements:** Filter rail (price, duration, category); activity cards (image, title, duration, price, rating); sort.
**Key actions:** Favorite; open detail; add to a quote request.
**Entry points:** Search Landing → Tours; from a destination page.
**Related screens:** Tour Detail, Quote Request.

#### 2.3.7 Property / Cruise / Tour Detail
**Purpose:** Deep dive into a single search result.
**Primary elements:** Image gallery; description; amenities/features; itinerary (for cruise/tour) or room types (for property); guest reviews where available; pricing; "Favorite" toggle; "Request a Quote" CTA; "Message Gyasi" CTA.
**Key actions:** Favorite; request quote; message agent.
**Entry points:** Any search results screen.
**Related screens:** Quote Request, Conversation Thread, Favorites.

#### 2.3.8 Quote Request Form
**Purpose:** Convert a search/favorite into a lead for the agent.
**Primary elements:** Trip name (auto-suggested); destinations summary; dates; travelers; preferences notes; preferred contact method; budget confirmation; items to include from favorites; "Submit" CTA.
**Key actions:** Review pre-filled context; add notes; submit.
**Entry points:** Property Detail CTA; Favorites; Search Results "Request quote".
**Related screens:** Quote Request Confirmation.

#### 2.3.9 Quote Request Confirmation
**Purpose:** Confirm the quote request is in and set expectations.
**Primary elements:** Confirmation message; expected response time; agent contact card; CTA to message agent now or return to dashboard.
**Key actions:** Message agent; return to dashboard; start another search.
**Entry points:** Submission of Quote Request Form.
**Related screens:** Dashboard, Messages.

#### 2.3.10 Saved Searches & Favorites
**Purpose:** A single place for everything the client has bookmarked.
**Primary elements:** Tabs for "Saved Searches" and "Favorites"; cards for each; quick-action chips (re-run search, request quote, remove); empty state with prompts.
**Key actions:** Re-run search; request quote; remove favorite; group favorites by destination.
**Entry points:** Search Landing "Saved" link; account menu.
**Related screens:** Search Form, Quote Request, Property Detail.

---

### 2.4 Payment & Card Authorization

#### 2.4.1 My Cards / Payment Methods List
**Purpose:** Show the client every card they have authorized and its status.
**Primary elements:** Card list (brand + last 4, nickname, expiration, authorized trips, status); "Add a card" CTA; help text explaining what card storage is used for and what it is *not* used for (PCI-aware, trust-building); link to security policy.
**Key actions:** Add a card; view card detail; revoke card.
**Entry points:** Account menu "Payment Methods"; from a trip when an authorization is requested.
**Related screens:** Add Card, Card Authorization for Trip, Card Use History.

#### 2.4.2 Add Card Screen
**Purpose:** Tokenize a new card via Stripe Elements / native Stripe SDK.
**Primary elements:** Stripe-hosted card input (PAN, expiry, CVC, ZIP); cardholder name; optional nickname (e.g., "Personal Visa"); explicit consent checkbox stating the card is being stored for supplier payments only; PCI/trust messaging; "Save card" CTA.
**Key actions:** Submit card; cancel.
**Entry points:** My Cards "Add"; Card Authorization for Trip flow.
**Related screens:** My Cards, Card Authorization for Trip.

#### 2.4.3 Card Authorization for Trip
**Purpose:** Bind a stored card to a specific trip with a spending limit.
**Primary elements:** Trip summary header; card picker (existing cards or "Add new"); spending limit input with suggested amounts; authorization expiry date (defaults to trip end + 7 days); explicit consent statement; "Authorize" CTA.
**Key actions:** Select card; set limit; consent and authorize.
**Entry points:** Trip Detail "Authorize a card"; notification from agent requesting authorization; link in agent-sent email.
**Related screens:** My Cards, Add Card, Trip Detail.

#### 2.4.4 Card Authorization Confirmation
**Purpose:** Confirm a card has been authorized for a trip.
**Primary elements:** Success indicator; summary of authorization (card last 4, trip, limit, expiry); "View authorization activity" link; "Done" CTA.
**Key actions:** View activity; return to trip.
**Entry points:** Submission of Card Authorization for Trip.
**Related screens:** Trip Detail, Card Use History.

#### 2.4.5 Card Use History / Activity
**Purpose:** Transparent record of every time a stored card was used by the advisor.
**Primary elements:** Timeline of events (date, agent, supplier, amount, note); filter by card or by trip; export CSV.
**Key actions:** Filter; tap event for detail.
**Entry points:** My Cards card detail; Trip Detail "Payment activity".
**Related screens:** Card Use Detail.

#### 2.4.6 Card Use Detail / Event Detail
**Purpose:** Drill into a single card-use event.
**Primary elements:** Full event metadata; agent who used the card; supplier; amount; trip context; note from agent; option to flag as unfamiliar.
**Key actions:** Flag as unfamiliar; message agent.
**Entry points:** Card Use History timeline tap.
**Related screens:** Conversation Thread.

#### 2.4.7 Revoke Card Authorization Confirmation
**Purpose:** Final confirmation before revoking a stored card or its trip authorization.
**Primary elements:** Plain-language explanation of what revoking will do (and not do — does not affect already-completed supplier charges); list of trips currently using the card; agent-notification preview; "Revoke" CTA; cancel link.
**Key actions:** Revoke; cancel.
**Entry points:** My Cards; Card Authorization for Trip edit.
**Related screens:** My Cards, Trip Detail.

---

### 2.5 Account & Profile

#### 2.5.1 Account Overview / My Account
**Purpose:** Hub for everything related to the client's account.
**Primary elements:** Profile summary card; navigation tiles for Personal Info, Travel Preferences, Travel Documents, Notifications, Security, Connected Accounts, Privacy.
**Key actions:** Navigate to any sub-screen.
**Entry points:** Profile icon in main nav.
**Related screens:** All account sub-screens.

#### 2.5.2 Personal Info Edit
**Purpose:** Edit name, email, phone, mailing address, date of birth, emergency contact.
**Primary elements:** Form fields; "Save" CTA; "Cancel" link; sensitive field warnings (email change requires verification).
**Key actions:** Update fields; save.
**Entry points:** Account Overview.
**Related screens:** Email Verification (if email changed).

#### 2.5.3 Travel Preferences Edit
**Purpose:** Edit the preferences captured during onboarding.
**Primary elements:** Same fields as Travel Preferences Capture; "Save" CTA.
**Key actions:** Update; save.
**Entry points:** Account Overview.
**Related screens:** Dashboard.

#### 2.5.4 Travel Documents
**Purpose:** Manage uploaded travel documents (passport, visa, insurance certificate).
**Primary elements:** Document list with thumbnails; expiration warnings; "Upload" CTA; per-document actions (view, share, delete).
**Key actions:** Upload; view; share securely; delete.
**Entry points:** Account Overview; Trip Document Library.
**Related screens:** Document Upload.

#### 2.5.5 Document Upload / Camera Capture
**Purpose:** Upload a new document, from device file picker or (mobile) camera.
**Primary elements:** Document type picker; file picker / camera shutter; preview; OCR-extracted fields (expiry, document number — editable); "Save" CTA.
**Key actions:** Capture or pick; review extracted fields; save.
**Entry points:** Travel Documents; Trip Document Library "Upload".
**Related screens:** Travel Documents, Trip Document Library.

#### 2.5.6 Notification Preferences
**Purpose:** Control which notifications are sent and through which channels.
**Primary elements:** Channel-by-category matrix (email, push, SMS) for: Trip Updates, Payment Activity, Messages, Pre-Trip Reminders, Marketing/Deals; master toggle; "Save" CTA.
**Key actions:** Toggle per channel/category; save.
**Entry points:** Account Overview.
**Related screens:** Dashboard.

#### 2.5.7 Security Settings
**Purpose:** Manage password, MFA, and active sessions.
**Primary elements:** Change password section; MFA status with enable/disable; active sessions list with device, location, last-active, and "Sign out" per session; suspicious-activity log; sign-out-of-all-devices button.
**Key actions:** Change password; enroll/disable MFA; sign out a session.
**Entry points:** Account Overview.
**Related screens:** MFA Setup, Login.

#### 2.5.8 Connected Accounts
**Purpose:** Manage social login linkages.
**Primary elements:** Google account link state; Apple account link state; connect/disconnect actions.
**Key actions:** Connect; disconnect.
**Entry points:** Account Overview.
**Related screens:** Login.

#### 2.5.9 Privacy & Data Export
**Purpose:** Honor data-rights requirements (CCPA where applicable).
**Primary elements:** "Download my data" CTA; explanation of what is included; data export status indicator; cookie/tracking preferences.
**Key actions:** Request data export; manage tracking preferences.
**Entry points:** Account Overview.
**Related screens:** Account Overview.

#### 2.5.10 Account Closure
**Purpose:** Delete or deactivate the account.
**Primary elements:** Warning about what closure will do (trips archived, cards revoked, data retained for tax/business compliance with PII anonymized); reason field (optional); password re-entry; "Close my account" CTA; final confirmation.
**Key actions:** Close account.
**Entry points:** Privacy & Data Export.
**Related screens:** Login (after closure).

#### 2.5.11 Help & Support
**Purpose:** Access help articles, FAQs, and contact the agent or platform support.
**Primary elements:** Search; FAQ categories; "Message Gyasi" CTA; "Email platform support" CTA; legal links.
**Key actions:** Search; open article; message agent; email support.
**Entry points:** Account Overview; nav footer.
**Related screens:** Conversation Thread.

---

### 2.6 Messaging

#### 2.6.1 Messages Inbox
**Purpose:** All conversations the client has with the agent, grouped by trip and including pre-trip lead-stage threads.
**Primary elements:** Conversation list (agent name/photo, last message preview, timestamp, unread indicator); search; filter by trip; archive action.
**Key actions:** Open conversation; archive; search.
**Entry points:** Bottom nav "Messages" on mobile; nav menu on web.
**Related screens:** Conversation Thread.

#### 2.6.2 Conversation Thread (Client View)
**Purpose:** Threaded conversation with the agent for a given trip or lead.
**Primary elements:** Thread header; message bubbles; attachment thumbnails; compose bar with attachment button; typing indicator; quick-reply chips ("Yes, book it", "I have questions", etc.); link to the related trip.
**Key actions:** Send message; attach; tap quick reply; open trip.
**Entry points:** Messages Inbox; Trip Detail; notification.
**Related screens:** Trip Detail.

#### 2.6.3 New Conversation / Start a Message
**Purpose:** Initiate a new message (especially before any trip exists).
**Primary elements:** Subject (optional); message body; "Send" CTA; helper text suggesting the agent will reply within X hours.
**Key actions:** Send.
**Entry points:** Help & Support "Message Gyasi"; Account "Contact agent".
**Related screens:** Conversation Thread.

---

### 2.7 Mobile-Specific Screens

These are screens that exist only on the mobile app or that are meaningfully different on mobile.

**Phase note on offline:** The SqlDelight-based offline cache architecture is built in Phase 1 (see Data Model Section 21.5) so that mobile work is responsive and resilient to brief network drops. The dedicated **offline UI** — the explicit Offline Itinerary View (2.7.1), the "Last synced" timestamps, and the offline indicators — ships in Phase 3 per BRD Section 13.3.

#### 2.7.1 Offline Itinerary View
**Phase:** Phase 3 (the cache architecture is MVP; the dedicated offline screen and indicators are Phase 3).
**Purpose:** Show the cached itinerary when no connectivity.
**Primary elements:** Itinerary content as in section 2.2.4 with an offline indicator; "Last synced" timestamp; instructions for content that may be unavailable offline (maps, fresh weather).
**Key actions:** View itinerary; tap to call from cached numbers.
**Entry points:** Itinerary Viewer when offline.
**Related screens:** Itinerary Viewer.

#### 2.7.2 Quick Call Advisor
**Purpose:** One-tap call to the advisor from anywhere in the app.
**Primary elements:** Big call button; advisor name and photo; hours of availability; alternate "Send a message" CTA; emergency-contact alternate for after-hours.
**Key actions:** Call; message; view emergency contacts.
**Entry points:** Floating "Help" button; Trip Detail on mobile.
**Related screens:** Conversation Thread, Emergency Contacts.

#### 2.7.3 Emergency Contacts (Mobile)
**Purpose:** Travel-safety contacts visible offline.
**Primary elements:** Advisor; hotel front desk (per trip); supplier emergency line; local police / consulate numbers; insurance hotline.
**Key actions:** Tap to call.
**Entry points:** Trip Detail "Emergency contacts"; Quick Call.
**Related screens:** Quick Call.

#### 2.7.4 Push Notification Permission Prompt
**Purpose:** Native OS prompt with a precursor "soft ask" explaining value.
**Primary elements:** Soft-ask screen (value prop and benefits); "Yes, enable" CTA leading to native OS prompt; "Maybe later".
**Key actions:** Trigger native prompt; defer.
**Entry points:** Post-onboarding; after first trip booked.
**Related screens:** Notification Preferences.

#### 2.7.5 Biometric Login Setup
**Purpose:** Enable Face ID / Touch ID / fingerprint login.
**Primary elements:** Explanation of benefit; "Enable" CTA; success state.
**Key actions:** Enable biometric.
**Entry points:** Post-onboarding; Security Settings on mobile.
**Related screens:** Security Settings.

#### 2.7.6 Calendar Sync
**Purpose:** Sync trip events to the native calendar.
**Primary elements:** Toggle; explanation; per-trip override.
**Key actions:** Enable/disable sync.
**Entry points:** Notification Preferences; Trip Detail "Add to calendar".
**Related screens:** Notification Preferences.

#### 2.7.7 In-App Settings (Mobile)
**Purpose:** Mobile-specific app preferences.
**Primary elements:** Biometric toggle; push toggle; data-saver mode; "Clear cache" action; about/version.
**Key actions:** Toggle preferences; clear cache.
**Entry points:** Profile menu on mobile.
**Related screens:** Notification Preferences, Security Settings.

#### 2.7.8 App Update Required
**Purpose:** Block usage when the app falls below the minimum supported version.
**Primary elements:** Branded message; "Update now" CTA linking to store; minimal copy.
**Key actions:** Tap to update.
**Entry points:** App launch on outdated version.
**Related screens:** None (blocking).

---

### 2.8 Group Trip Coordination (Phase 3)

**Phase:** Phase 3 per BRD Section 13.3. Scoped now so initial information architecture can accommodate them, but the screens below do not ship at MVP.

**Important disambiguation:** A trip with `trip_type = 'group'` (e.g., "Smith Family Reunion") is a single-trip designation managed entirely by the agent and is available at MVP. The screens in this section describe something different — the **multi-client coordination feature** where multiple traveler accounts share an itinerary, exchange messages in a group chat, and invite co-travelers without accounts. The trip-type and the coordination feature are independent concepts.

#### 2.8.1 Group Trip Overview
**Purpose:** Show a group trip's shared context to all participants.
**Primary elements:** Shared itinerary; participant roster; group messages tab; payment-share status (if applicable).
**Key actions:** Open shared itinerary; open group chat.
**Related screens:** Group Chat, Itinerary Viewer.

#### 2.8.2 Co-Traveler Invitation
**Purpose:** Invite co-travelers to view a trip.
**Primary elements:** Invite form; permission level (view itinerary only vs. full); send via email; copy link.
**Key actions:** Send invite.
**Related screens:** Group Trip Overview.

#### 2.8.3 Group Chat
**Purpose:** Group conversation for trip coordination.
**Primary elements:** Threaded group conversation; participant indicators; agent may or may not be in-thread.
**Key actions:** Send; tag; share location.
**Related screens:** Group Trip Overview.

#### 2.8.4 Co-Traveler View (Limited)
**Purpose:** Read-only view for invited co-travelers without full client accounts.
**Primary elements:** Itinerary (read-only); emergency contacts; agent contact CTA.
**Key actions:** View; contact agent.
**Related screens:** Itinerary Viewer.

---

## 3. Agent Screens

### 3.1 Authentication & Activation

Covers both day-to-day authentication and the first-run experience when a new advisor is provisioned into the platform. At MVP this matters only for Gyasi, but designing the flow now means adding additional advisors in Phase 3+ is a configuration change rather than a redesign.

#### 3.1.1 Agent Login Screen
**Purpose:** Authenticate an advisor.
**Primary elements:** Email; password; "Sign in" CTA; "Forgot password?"; MFA-required messaging.
**Key actions:** Sign in.
**Entry points:** Logged-out web visit; mobile app launch (agent mode).
**Related screens:** Agent MFA Challenge.

#### 3.1.2 Agent MFA Challenge
**Purpose:** Validate MFA — required for agents.
**Primary elements:** Code entry; "Use backup code" link.
**Key actions:** Verify.
**Entry points:** Post-credential authentication.
**Related screens:** Agent Dashboard.

#### 3.1.3 Agent Password Reset
**Purpose:** Reset password flow for agents — same as client flow but routed to agent space.
**Primary elements:** Email; reset link; new password.
**Key actions:** Reset.
**Entry points:** Agent Login "Forgot password?".
**Related screens:** Agent Login.

#### 3.1.4 Agent Invitation / Activation Link
**Purpose:** The landing screen when a newly invited agent clicks the activation link in their invitation email.
**Primary elements:** Branded welcome; agent name (from invite); explanation of what activating their account will do; "Begin activation" CTA; "This isn't me" link to flag misdirected invites.
**Key actions:** Begin activation; flag.
**Entry points:** Invitation email link (token-bound, single-use, expiring).
**Related screens:** Account Activation - Set Password.

#### 3.1.5 Account Activation — Set Password
**Purpose:** Initial password setup for a newly activating agent.
**Primary elements:** Email (read-only, from invite); new password; confirm password; strength meter; terms-of-service / agent-policy acceptance; "Activate account" CTA.
**Key actions:** Set password; accept terms.
**Entry points:** Agent Invitation / Activation Link.
**Related screens:** Mandatory MFA Setup.

#### 3.1.6 Mandatory MFA Setup (Agents)
**Purpose:** Force MFA enrollment before the agent can access any client data — non-skippable for agent role.
**Primary elements:** Explanation that MFA is required for agents (not optional); method choice (authenticator app strongly recommended; SMS allowed but flagged); QR code or phone number; verification code field; backup codes display with explicit "I have saved these" confirmation.
**Key actions:** Choose method; enroll; verify; save backup codes.
**Entry points:** Account Activation flow; Agent Profile if MFA is later disabled (it should not be).
**Related screens:** Agent Profile Setup.

#### 3.1.7 Agent Profile Setup
**Purpose:** Capture the agent's profile data that will appear in client communications.
**Primary elements:** Profile photo upload (with crop); display name; preferred pronouns (optional); phone number (with verification step); short bio for client-facing use; social links (Instagram, Facebook, LinkedIn — optional); "Save & continue" CTA; "Skip for now" link (some fields can be deferred).
**Key actions:** Upload photo; fill profile; save.
**Entry points:** Mandatory MFA Setup completion.
**Related screens:** Availability & Calendar Setup.

#### 3.1.8 Availability & Calendar Setup
**Purpose:** Set working hours, time zone, and optional calendar sync so clients see realistic response expectations.
**Primary elements:** Time zone picker (auto-detected, editable); weekly availability grid (per day, with quick-set buttons for "Standard business hours" and "Evenings & weekends"); response-time expectation toggle ("Within X hours during availability"); calendar sync toggles (Google, Apple) with OAuth handoff; "Save & continue" CTA.
**Key actions:** Set hours; sync calendar; save.
**Entry points:** Agent Profile Setup completion.
**Related screens:** Email Signature Setup.

#### 3.1.9 Email Signature Setup
**Purpose:** Configure the signature appended to every outbound email so client comms launch with the right branding from day one.
**Primary elements:** Rich text editor pre-loaded with the default Story-Tail Adventures signature template (Gyasi, Travel Advisor | Story-Tail Adventures | Hosted by Inteletravel | adventures.story-tail.com); editable fields with merge tags; live preview showing how it renders on desktop and mobile email clients; "Save" CTA.
**Key actions:** Customize signature; preview; save.
**Entry points:** Availability & Calendar Setup completion.
**Related screens:** Welcome Tour / First-Run.

#### 3.1.10 Welcome Tour / First-Run Walkthrough
**Purpose:** Orient the agent to the workspace so they know where to look on day one.
**Primary elements:** Step-by-step coachmark tour over the live dashboard (5–7 steps: Worklist, Clients, Trips, Pipeline, Commissions, Messages, Templates); "Skip tour" option; "Restart tour anytime from Help" message; final "You're all set" confirmation with a list of common first-day tasks (e.g., "Import your existing Travefy clients", "Set up your first trip template").
**Key actions:** Step through tour; skip; jump to a first-day task.
**Entry points:** Email Signature Setup completion.
**Related screens:** Agent Dashboard, Client List (Import), Trip Template Library.

---

### 3.2 Dashboard & Pipeline

#### 3.2.1 Agent Dashboard / Worklist
**Purpose:** Action-oriented home for the advisor.
**Primary elements:** Greeting; KPI strip (commission this month, active trips, new leads, unread messages); section: Trips awaiting client response (proposals out); section: Payments due soon; section: New leads to contact; section: Travelers departing in 30 days; section: Recent messages.
**Key actions:** Tap into any item; quick-add (new trip, new client, new lead).
**Entry points:** Post-login; nav "Home".
**Related screens:** Every other agent screen as a destination.

#### 3.2.2 Pipeline / Funnel View
**Purpose:** Visual representation of all trips by stage.
**Primary elements:** Columns for Inquiry, Proposal Sent, Booked, In Progress, Completed; drag-and-drop or status-change menu; cards per trip with quick info.
**Key actions:** Move stage; open trip.
**Entry points:** Nav "Pipeline".
**Related screens:** Trip Detail.

#### 3.2.3 Calendar View
**Purpose:** Calendar of trips and key dates.
**Primary elements:** Month/week/agenda toggle; trip departures and returns; payment due dates; agent availability blocks.
**Key actions:** Tap event; create event.
**Entry points:** Nav "Calendar".
**Related screens:** Trip Detail.

---

### 3.3 Client Management (CRM)

#### 3.3.1 Client List / Roster
**Purpose:** Searchable list of all clients owned by the agent.
**Primary elements:** Search; filters (status, tags, last contacted, lifetime value); list rows (name, email, last trip, next trip, lifetime value); bulk-select; "Add client" CTA.
**Key actions:** Search; filter; open client; bulk-tag; bulk-message.
**Entry points:** Nav "Clients".
**Related screens:** Client Detail, Create Client.

#### 3.3.2 Client Detail / Profile
**Purpose:** Single-pane view of a client.
**Primary elements:** Header card (photo, name, contact, lifetime value, tags); tabs: Overview, Trips, Messages, Documents, Notes, Activity Log; quick actions (new trip, send message, log call).
**Key actions:** Navigate tabs; quick actions.
**Entry points:** Client List; Lead conversion.
**Related screens:** All client sub-screens, Trip Detail, Conversation Thread.

#### 3.3.3 Client Overview Tab
**Purpose:** Snapshot of the client's profile and preferences.
**Primary elements:** Contact info; addresses; important dates (birthday, anniversary); travel preferences; household / companions; loyalty programs.
**Key actions:** Edit any section.
**Entry points:** Client Detail.
**Related screens:** Edit Client.

#### 3.3.4 Client Trips Tab
**Purpose:** All trips for this client, current and past.
**Primary elements:** Tabs (active, past); trip cards.
**Key actions:** Open trip; create new trip for this client.
**Entry points:** Client Detail.
**Related screens:** Trip Detail, Create New Trip.

#### 3.3.5 Client Messages Tab
**Purpose:** All conversations with this client.
**Primary elements:** Thread list with previews.
**Key actions:** Open thread; start new thread.
**Entry points:** Client Detail.
**Related screens:** Agent Conversation Thread.

#### 3.3.6 Client Documents Tab
**Purpose:** All documents associated with the client (across trips).
**Primary elements:** Document list; filters by type and trip.
**Key actions:** View, download, share.
**Entry points:** Client Detail.
**Related screens:** Document Upload.

#### 3.3.7 Client Notes Tab
**Purpose:** Internal notes only the agent sees.
**Primary elements:** Note list with timestamps; rich text editor for new note.
**Key actions:** Add, edit, delete.
**Entry points:** Client Detail.
**Related screens:** None.

#### 3.3.8 Client Activity Log
**Purpose:** Audit-style timeline of significant events for this client.
**Primary elements:** Timeline (logins, payment authorizations, status changes, agent actions); filter.
**Key actions:** Filter; tap event for detail.
**Entry points:** Client Detail.
**Related screens:** Audit Event Detail.

#### 3.3.9 Create Client
**Purpose:** Add a new client record.
**Primary elements:** Required (name, email); optional (phone, address, DOB, important dates, preferences, tags); "Invite to portal" toggle.
**Key actions:** Save; save and create trip.
**Entry points:** Client List "Add"; Lead conversion.
**Related screens:** Client Detail.

#### 3.3.10 Edit Client
**Purpose:** Modify an existing client.
**Primary elements:** Same as Create Client.
**Key actions:** Save; cancel.
**Entry points:** Client Detail edit actions.
**Related screens:** Client Detail.

#### 3.3.11 Merge Clients
**Purpose:** Combine two client records.
**Primary elements:** Source and target picker; field-by-field merge picker (which value wins); preview of merged record; "Merge" CTA with confirmation.
**Key actions:** Pick winning values; merge.
**Entry points:** Client List; Client Detail "More actions"; Login Support tools.
**Related screens:** Client Detail.

#### 3.3.12 Archive / Restore Client
**Purpose:** Hide a client without deleting.
**Primary elements:** Archive confirmation with reason field; restore from "Archived" filter.
**Key actions:** Archive; restore.
**Entry points:** Client Detail "More actions".
**Related screens:** Client List.

---

### 3.4 Trip Builder & Management

**Phase note on API search tabs:** Screens 3.4.5 through 3.4.8 each describe a "Search" tab (Amadeus, Hotelbeds, Widgety, Viator) and a "Manual" tab. Per BRD Section 13.1, the **Manual** tab is the Phase 1 (MVP) path — agents enter components by hand. The **Search** tab integrations are Phase 2 per BRD Section 13.2. At MVP, the screens still exist with the Search tab visible but disabled or labeled "Coming in Phase 2"; this avoids reshaping the trip-builder UI when search is added.

#### 3.4.1 Trip List
**Purpose:** All trips owned by the agent.
**Primary elements:** Search; filters (status, client, supplier, destination, dates); columns (client, destination, dates, status, total, commission, last activity); bulk actions.
**Key actions:** Search; filter; open trip; create new trip.
**Entry points:** Nav "Trips".
**Related screens:** Trip Detail.

#### 3.4.2 Trip Detail (Agent View)
**Purpose:** All the operational detail an agent needs for a trip.
**Primary elements:** Header (client, dates, status, total, commission); tabs: Overview, Components, Itinerary, Payments, Documents, Messages, Notes, Activity; status-change menu; quick actions (message client, request card, send proposal).
**Key actions:** Edit; change status; navigate tabs.
**Entry points:** Trip List, Client Trips Tab, Pipeline, Calendar, Lead Conversion.
**Related screens:** All trip sub-screens.

#### 3.4.3 Create New Trip — Type Selector
**Purpose:** Choose what kind of trip to build.
**Primary elements:** Trip-type tiles (Cruise, All-Inclusive Resort, Multi-Destination, Group, Custom); template option ("Start from a template"); client picker; "Next" CTA.
**Key actions:** Pick type; pick template; pick client; continue.
**Entry points:** Dashboard "Create trip"; Client Detail "New trip"; Lead conversion.
**Related screens:** Trip Builder Workspace.

#### 3.4.4 Trip Builder Workspace
**Purpose:** Main canvas for assembling a trip.
**Primary elements:** Trip header (title, dates, travelers — editable inline); component list; "Add component" CTA; price total; commission projection; save state indicator.
**Key actions:** Add component; reorder; edit; save draft; preview proposal.
**Entry points:** Create New Trip flow; Trip Detail "Edit components".
**Related screens:** Add Trip Component, Edit Trip Component, Itinerary Editor, Proposal Builder.

#### 3.4.5 Add Trip Component — Flight
**Purpose:** Add a flight via Amadeus search or manual entry.
**Primary elements:** Tab: Search (Amadeus integration) | Manual; search form (origin, destination, dates, pax, cabin); result list; manual form (airline, flight number, dates, times, confirmation, cost, commission rate); "Add to trip" CTA.
**Key actions:** Search or enter manually; pick result; save.
**Entry points:** Trip Builder "Add component".
**Related screens:** Trip Builder.

#### 3.4.6 Add Trip Component — Hotel/Resort
**Purpose:** Add a hotel/resort via Hotelbeds search or manual entry.
**Primary elements:** Tab: Search | Manual; search form; result list with property cards; rate/room picker; manual form (supplier, hotel name, address, dates, board, room type, confirmation, cost, commission rate).
**Key actions:** Search or enter manually; pick; save.
**Entry points:** Trip Builder.
**Related screens:** Trip Builder.

#### 3.4.7 Add Trip Component — Cruise
**Purpose:** Add a cruise (Widgety display + manual booking detail at MVP).
**Primary elements:** Cruise picker (line, ship, date); Widgety-sourced itinerary preview; manual fields (booking reference, cabin, dining time, gratuities included Y/N, cost, commission).
**Key actions:** Pick cruise; enter booking; save.
**Entry points:** Trip Builder.
**Related screens:** Trip Builder.

#### 3.4.8 Add Trip Component — Excursion / Tour
**Purpose:** Add an activity from Viator or manual entry.
**Primary elements:** Tab: Search | Manual; search form; activity cards; manual fields.
**Key actions:** Pick or enter; save.
**Entry points:** Trip Builder.
**Related screens:** Trip Builder.

#### 3.4.9 Add Trip Component — Transfer
**Purpose:** Add an airport transfer or ground transport (manual at MVP).
**Primary elements:** Manual form (supplier, type, pickup, drop-off, date/time, cost).
**Key actions:** Save.
**Entry points:** Trip Builder.
**Related screens:** Trip Builder.

#### 3.4.10 Add Trip Component — Insurance
**Purpose:** Add a travel insurance referral or policy reference.
**Primary elements:** Provider picker; policy reference; coverage summary; "Add" CTA.
**Key actions:** Save.
**Entry points:** Trip Builder.
**Related screens:** Trip Builder.

#### 3.4.11 Add Trip Component — Other / Custom
**Purpose:** Catch-all for anything the structured types don't cover.
**Primary elements:** Free-form name; date; time; cost; notes.
**Key actions:** Save.
**Entry points:** Trip Builder.
**Related screens:** Trip Builder.

#### 3.4.12 Edit Trip Component
**Purpose:** Modify an existing component.
**Primary elements:** Same form as the corresponding "Add" screen, pre-filled.
**Key actions:** Save; remove from trip.
**Entry points:** Trip Builder component tap.
**Related screens:** Trip Builder.

#### 3.4.13 Trip Template Library
**Purpose:** Manage reusable trip templates (e.g., "Sandals 7-Night Honeymoon", "Disney Cruise — Family of 4").
**Primary elements:** Template list with previews; create from existing trip; edit; delete.
**Key actions:** Create, edit, apply, delete.
**Entry points:** Trip Builder "Save as template"; Create New Trip "From template"; nav "Templates".
**Related screens:** Trip Builder.

#### 3.4.14 Itinerary Editor (Agent)
**Purpose:** Translate trip components into a presentable day-by-day itinerary.
**Primary elements:** Day-by-day timeline; drag-to-reorder activities; per-block editor (morning/afternoon/evening) with rich text for descriptions; "Gyasi's Tip" callout editor; auto-generate from components CTA.
**Key actions:** Auto-generate; manually edit; reorder; add tip; save.
**Entry points:** Trip Detail "Itinerary"; Trip Builder.
**Related screens:** Itinerary Preview, Trip Builder.

#### 3.4.15 Trip Payment Schedule
**Purpose:** Manage deposit and final-payment dates and remind the client.
**Primary elements:** Schedule rows (date, amount, paid Y/N, paid date); reminder cadence toggle.
**Key actions:** Add row; edit; trigger reminder.
**Entry points:** Trip Detail "Payments".
**Related screens:** Card Use Log, Conversation Thread.

#### 3.4.16 Cancel / Archive Trip
**Purpose:** Mark a trip as cancelled, with reason and refund tracking.
**Primary elements:** Cancellation reason; refund status; supplier-side action checklist; "Confirm cancellation" CTA.
**Key actions:** Cancel; archive.
**Entry points:** Trip Detail "More actions".
**Related screens:** Trip Detail.

---

### 3.5 Proposal & Itinerary

#### 3.5.1 Proposal Builder
**Purpose:** Compose the proposal the client will receive.
**Primary elements:** Cover header editor (hero image, title, opening note); component selector (which components to include in the proposal); pricing summary; "Time-sensitive" toggle; closing note editor.
**Key actions:** Edit; preview; send.
**Entry points:** Trip Builder "Preview proposal"; Trip Detail "Send proposal".
**Related screens:** Proposal Preview, Send Proposal.

#### 3.5.2 Proposal Preview
**Purpose:** Show the proposal exactly as the client will see it.
**Primary elements:** Read-only render of the proposal in client styling.
**Key actions:** Return to builder; proceed to send.
**Entry points:** Proposal Builder.
**Related screens:** Send Proposal.

#### 3.5.3 Send Proposal
**Purpose:** Email the proposal to the client.
**Primary elements:** Recipient (client email); CC/BCC; subject (templated, editable); body (templated, editable); "Send" CTA; option to schedule.
**Key actions:** Send; schedule.
**Entry points:** Proposal Preview.
**Related screens:** Proposal Sent Confirmation.

#### 3.5.4 Proposal Sent Confirmation
**Purpose:** Confirm the email left successfully and surface next steps.
**Primary elements:** Success message; "Track engagement" CTA (open/click tracking); "Back to trip" CTA.
**Key actions:** Track; back to trip.
**Entry points:** Send Proposal completion.
**Related screens:** Trip Detail.

#### 3.5.5 Itinerary Auto-Generator
**Purpose:** Translate components into a draft day-by-day itinerary.
**Primary elements:** Day-by-day preview; toggles for what to include (transit times, free-time blocks, Gyasi's tips placeholders); "Generate" CTA.
**Key actions:** Generate; refine; save.
**Entry points:** Itinerary Editor "Auto-generate".
**Related screens:** Itinerary Editor.

#### 3.5.6 Itinerary Preview (Agent)
**Purpose:** Read-only render of the itinerary in client styling for the agent to QA.
**Primary elements:** Mirror of Client Itinerary Viewer.
**Key actions:** Back to editor; publish update.
**Entry points:** Itinerary Editor "Preview".
**Related screens:** Itinerary Editor, Publish Update.

#### 3.5.7 Publish Itinerary Update
**Purpose:** Push an updated itinerary live with optional client notification.
**Primary elements:** Diff summary (what changed); notify client checkbox; custom note to client; "Publish" CTA.
**Key actions:** Publish; cancel.
**Entry points:** Itinerary Editor "Save and publish".
**Related screens:** Trip Detail.

---

### 3.6 Payment & Card Management (Agent)

#### 3.6.1 Card Vault (Per Trip)
**Purpose:** Show authorized cards for the trip.
**Primary elements:** Card list (brand + last 4, nickname, authorized spend remaining, expires); "Request authorization" CTA.
**Key actions:** Request authorization; view card detail; reveal PAN (audited); log a use.
**Entry points:** Trip Detail "Payments".
**Related screens:** Request Card Authorization, Reveal Card Number, Log Card Use.

#### 3.6.2 Request Card Authorization
**Purpose:** Send the client a secure link to authorize a card for this trip.
**Primary elements:** Spending limit input; expiration date; personal note to client; preview of message; "Send request" CTA.
**Key actions:** Send.
**Entry points:** Card Vault "Request authorization".
**Related screens:** Authorization Request Sent.

#### 3.6.3 Authorization Request Sent
**Purpose:** Confirm the request and track state.
**Primary elements:** Confirmation; pending status; option to resend.
**Key actions:** Resend; back.
**Entry points:** Request Card Authorization.
**Related screens:** Card Vault.

#### 3.6.4 Reveal Card Number (Audited)
**Purpose:** One-time-reveal of the card PAN for use on a supplier portal — every reveal is audited.
**Primary elements:** Justification field (required: supplier name, amount, reason); MFA step-up confirmation; revealed PAN displayed for limited time with copy button; auto-hide countdown.
**Key actions:** Reveal; copy; close.
**Entry points:** Card Vault "Use card".
**Related screens:** Log Card Use.

#### 3.6.5 Log Card Use
**Purpose:** Record that a card was used to pay a supplier.
**Primary elements:** Supplier; amount; date; reference number; note; receipt upload (optional); "Log" CTA.
**Key actions:** Log.
**Entry points:** Reveal Card Number flow; Card Vault.
**Related screens:** Card Use Log.

#### 3.6.6 Card Use Log (Per Trip / Per Card)
**Purpose:** Read-only audit log of every card use.
**Primary elements:** Event list; filter by card or trip; export.
**Key actions:** Filter; export.
**Entry points:** Card Vault; Trip Detail.
**Related screens:** Audit Event Detail.

#### 3.6.7 Set or Update Spending Limit
**Purpose:** Modify the spending limit on an existing card authorization (subject to client re-consent).
**Primary elements:** Current limit; new limit; note; re-consent required indicator; "Request update" CTA.
**Key actions:** Send re-consent request.
**Entry points:** Card Vault "Adjust limit".
**Related screens:** Authorization Request Sent.

---

### 3.7 Commission Tracking

#### 3.7.1 Commission Dashboard
**Purpose:** At-a-glance commission performance.
**Primary elements:** KPI cards (this month earned, this month received, YTD, pipeline forecast); trend chart; status breakdown (expected / invoiced / received).
**Key actions:** Drill into any metric.
**Entry points:** Nav "Commissions"; Agent Dashboard.
**Related screens:** Commission List.

#### 3.7.2 Commission List
**Purpose:** All commission entries.
**Primary elements:** Filters (supplier, status, trip, date range); columns (trip, client, supplier, gross, rate, expected, status); export.
**Key actions:** Filter; export; tap entry.
**Entry points:** Commission Dashboard; Trip Detail.
**Related screens:** Commission Detail.

#### 3.7.3 Commission Detail / Edit
**Purpose:** View and edit a single commission record.
**Primary elements:** Trip link; supplier; gross booking value; commission rate; expected amount; payment terms (paid-at-booking / paid-after-travel); status; received amount; received date; notes.
**Key actions:** Edit; mark received; link to Inteletravel report.
**Entry points:** Commission List.
**Related screens:** Trip Detail.

#### 3.7.4 Add Commission Entry
**Purpose:** Manually add a commission expectation (e.g., for trips entered without API source).
**Primary elements:** Same fields as Commission Detail.
**Key actions:** Save.
**Entry points:** Commission List "Add"; Trip Detail.
**Related screens:** Commission Detail.

#### 3.7.5 Inteletravel CSV Import
**Purpose:** Bulk-import the periodic commission statement from Inteletravel.
**Primary elements:** File picker; field-mapping screen (CSV columns → platform fields); preview of matched and unmatched rows; "Import" CTA.
**Key actions:** Upload; map fields; import.
**Entry points:** Commission Dashboard; Reconciliation View.
**Related screens:** Reconciliation View.

#### 3.7.6 Reconciliation View
**Purpose:** Match imported Inteletravel rows against expected commissions in the platform.
**Primary elements:** Side-by-side list (Inteletravel row | platform match | confidence); auto-match indicator; manual-match action; unmatched rows section.
**Key actions:** Confirm match; manually match; flag discrepancy.
**Entry points:** Post-import; Commission Dashboard.
**Related screens:** Commission Detail.

#### 3.7.7 Commission Forecast / Pipeline View
**Purpose:** Project commission revenue from pipeline.
**Primary elements:** Forecast chart; pipeline breakdown by stage; confidence weighting per stage.
**Key actions:** Adjust weighting.
**Entry points:** Commission Dashboard.
**Related screens:** Pipeline.

---

### 3.8 Leads

**Phase:** All screens in Section 3.8 are **Phase 2** per BRD Section 13.2. They depend on the Lead and LeadSource entities (P2 in the Data Model) and on the self-guided search flow that generates leads. They do not exist at MVP — leads at MVP are tracked as informal trip-inquiry messages rather than structured Lead records.

#### 3.8.1 Leads Inbox
**Purpose:** All new quote-request leads from self-guided search.
**Primary elements:** Filters (status, source, date); list rows (name, destination, dates, source, age of lead); SLA indicator (red if past target response time).
**Key actions:** Open lead; bulk-archive.
**Entry points:** Nav "Leads"; Agent Dashboard.
**Related screens:** Lead Detail.

#### 3.8.2 Lead Detail
**Purpose:** Everything about a single lead.
**Primary elements:** Contact info; trip request summary; favorites/search context; client account state (existing vs. new); message thread; conversion actions.
**Key actions:** Convert to trip; convert to client only; reject; assign.
**Entry points:** Leads Inbox.
**Related screens:** Convert Lead to Trip, Create Client.

#### 3.8.3 Convert Lead to Trip
**Purpose:** Promote a lead into the trip pipeline.
**Primary elements:** Client picker (existing or create new); trip-type pre-fill from lead; "Continue to builder" CTA.
**Key actions:** Convert.
**Entry points:** Lead Detail.
**Related screens:** Trip Builder, Create Client.

#### 3.8.4 Reject / Archive Lead
**Purpose:** Dispose of leads that won't convert.
**Primary elements:** Reason field (with common reasons); optional client notification template.
**Key actions:** Reject; archive.
**Entry points:** Lead Detail.
**Related screens:** Leads Inbox.

#### 3.8.5 Lead Source Analytics
**Purpose:** Where leads come from.
**Primary elements:** Source breakdown chart; conversion rate per source; time-to-first-contact.
**Key actions:** Filter by date.
**Entry points:** Reports Hub.
**Related screens:** Reports Hub.

---

### 3.9 Login Support / Account Administration

These tools let the agent help less-technical clients with login issues.

#### 3.9.1 Client Account Management Screen
**Purpose:** Per-client admin actions.
**Primary elements:** Account status; last login; MFA status; active sessions; quick-action buttons (Send Reset Link, Send Magic Link, Verify Email, Lock Account, Merge Accounts).
**Key actions:** Trigger any admin action.
**Entry points:** Client Detail "Account admin".
**Related screens:** All sub-screens below.

#### 3.9.2 Initiate Password Reset (Agent → Client)
**Purpose:** Trigger a password reset email on the client's behalf.
**Primary elements:** Confirmation prompt; explanation (password not visible to agent); "Send reset link" CTA.
**Key actions:** Send.
**Entry points:** Client Account Management.
**Related screens:** Client Account Management.

#### 3.9.3 Send Magic Link Login
**Purpose:** Email a one-time login link to the client.
**Primary elements:** Expiration; one-time-use indicator; "Send" CTA.
**Key actions:** Send.
**Entry points:** Client Account Management.
**Related screens:** Client Account Management.

#### 3.9.4 Verify Email Manually
**Purpose:** Mark an unverified email as verified after out-of-band confirmation.
**Primary elements:** Confirmation prompt; audit-log notice.
**Key actions:** Verify.
**Entry points:** Client Account Management.
**Related screens:** Client Account Management.

#### 3.9.5 Lock / Unlock Client Account
**Purpose:** Temporarily prevent login (e.g., suspected fraud).
**Primary elements:** Reason field; "Lock" / "Unlock" CTA; audit-log notice.
**Key actions:** Toggle lock.
**Entry points:** Client Account Management.
**Related screens:** Client Account Management.

#### 3.9.6 Client Login Activity
**Purpose:** Review recent logins for fraud investigation.
**Primary elements:** Login timeline (date, IP, device, location); suspicious-event highlights.
**Key actions:** Filter; flag event.
**Entry points:** Client Account Management.
**Related screens:** Audit Event Detail.

#### 3.9.7 Merge Duplicate Accounts (Agent View)
**Purpose:** Same flow as 3.3.11 but accessed from the Login Support area.
**Primary elements:** As in 3.3.11.
**Key actions:** Merge.
**Entry points:** Client Account Management.
**Related screens:** Client Detail.

---

### 3.10 Messaging & Templates

#### 3.10.1 Agent Inbox
**Purpose:** All client messages.
**Primary elements:** Filters (unread, by client, by trip); list rows (client, last message, trip, timestamp, SLA indicator); search.
**Key actions:** Open thread; bulk-archive.
**Entry points:** Nav "Messages".
**Related screens:** Conversation Thread (Agent View).

#### 3.10.2 Conversation Thread (Agent View)
**Purpose:** Threaded message view from the agent side.
**Primary elements:** Thread header (client, trip link); message bubbles; templated-reply picker; attachment; internal-note toggle (only agent sees); send.
**Key actions:** Send; attach; insert template; add internal note.
**Entry points:** Agent Inbox; Client Detail; Trip Detail.
**Related screens:** Template Picker.

#### 3.10.3 Template Picker
**Purpose:** Insert a templated message into a conversation or as a new email.
**Primary elements:** Searchable template list; preview with merge-field substitution.
**Key actions:** Insert; edit before send.
**Entry points:** Conversation Thread "Insert template"; Send Proposal.
**Related screens:** Template Library.

#### 3.10.4 Template Library
**Purpose:** Manage reusable email/message templates.
**Primary elements:** Template list grouped by stage (Lead Response, Proposal, Booking, Pre-Trip, Post-Trip, Payment Reminder); "Create new template" CTA.
**Key actions:** Create; edit; archive.
**Entry points:** Nav "Templates" (under Settings).
**Related screens:** Template Editor.

#### 3.10.5 Template Editor
**Purpose:** Compose or edit a template.
**Primary elements:** Subject; body (rich text with merge fields); preview with sample data; tags.
**Key actions:** Save; preview; archive.
**Entry points:** Template Library.
**Related screens:** Template Library.

#### 3.10.6 Bulk Send (Future)
**Purpose:** Mass-message a segment of clients (e.g., "Hot deals this month").
**Primary elements:** Recipient segment builder; template picker; preview; send.
**Key actions:** Send.
**Entry points:** Reports Hub; Client List bulk action.
**Related screens:** Template Library.

---

### 3.11 Reporting

#### 3.11.1 Reports Hub
**Purpose:** Entry point to every report.
**Primary elements:** Tiles for each report; favorites; recent.
**Key actions:** Open report.
**Entry points:** Nav "Reports".
**Related screens:** All report screens below.

#### 3.11.2 Revenue by Month
**Primary elements:** Line/bar chart; year-over-year toggle; export.
**Key actions:** Filter; export.
**Related screens:** Reports Hub.

#### 3.11.3 Commission by Supplier
**Primary elements:** Bar chart; table; export.
**Key actions:** Filter; export.
**Related screens:** Commission List.

#### 3.11.4 Top Destinations
**Primary elements:** Ranked list with trip count and revenue; map visualization.
**Key actions:** Filter; export.
**Related screens:** Trip List.

#### 3.11.5 Client Lifetime Value
**Primary elements:** Client ranking; cohort analysis; export.
**Key actions:** Filter; drill into client.
**Related screens:** Client Detail.

#### 3.11.6 Conversion Funnel
**Primary elements:** Funnel chart (Lead → Proposal → Booked → Travelled); per-stage drop-off; export.
**Key actions:** Drill into stage.
**Related screens:** Pipeline.

#### 3.11.7 Pipeline Value
**Primary elements:** Forecast chart; per-stage weighting; export.
**Key actions:** Adjust weighting; export.
**Related screens:** Pipeline.

#### 3.11.8 Export Center
**Purpose:** Generate and download CSV/Excel exports for tax/accounting use.
**Primary elements:** Export type picker; date range; "Generate" CTA; export history list.
**Key actions:** Generate; download.
**Entry points:** Reports Hub; any report "Export".
**Related screens:** Reports Hub.

---

### 3.12 Agent Profile & Settings

#### 3.12.1 Agent Profile / My Account
**Purpose:** Manage personal information, photo, contact channels.
**Primary elements:** Profile photo upload; name; email; phone; bio (used in client communications); social links.
**Key actions:** Edit; save.
**Entry points:** Profile menu.
**Related screens:** Email Signature, Notification Preferences (Agent), Security.

#### 3.12.2 Agent Calendar / Availability
**Purpose:** Set working hours and out-of-office.
**Primary elements:** Weekly availability grid; out-of-office block scheduler; calendar sync (Google/Apple).
**Key actions:** Edit availability; schedule OOO.
**Entry points:** Profile menu; Calendar.
**Related screens:** Calendar View.

#### 3.12.3 Agent Notification Preferences
**Purpose:** Control alerts the agent receives.
**Primary elements:** Channel matrix (email, push, SMS) by category (Lead, Message, Status Change, Payment Activity, Commission Received).
**Key actions:** Toggle; save.
**Entry points:** Profile menu.
**Related screens:** Profile.

#### 3.12.4 Email Signature Configuration
**Purpose:** Standard signature for all outbound email.
**Primary elements:** Rich-text editor with merge fields; live preview.
**Key actions:** Save.
**Entry points:** Profile menu.
**Related screens:** Template Editor.

#### 3.12.5 Branding Settings (Multi-Agent Future)
**Purpose:** When multiple agents work under Story-Tail Adventures, allow per-agent overrides while preserving the master brand.
**Primary elements:** Logo override; signature overrides; restricted to elements that don't conflict with the master brand guide.
**Key actions:** Save.
**Entry points:** Profile menu (when applicable).
**Related screens:** Profile.

---

## 4. Responsive Design — Mobile, Tablet, Web

Every screen in this inventory ships in three responsive variants: **mobile**, **tablet**, and **web (desktop)**. This section defines the breakpoints, universal principles, and named reusable patterns that the variants follow, plus a per-screen mapping showing which pattern each screen uses and any meaningful deviations.

This approach (define reusable patterns once, map screens to patterns) is intentional. Triplicating every screen description for three viewports would balloon the document and obscure what actually differs between variants. Designers and engineers should read Section 4.3 to internalize the patterns, then use Section 4.4 to look up the specific behavior for any screen.

### 4.1 Breakpoints

| Variant | Width | Target Devices | Primary Interaction |
|---|---|---|---|
| Mobile | < 768px | iPhone, Android phones | Touch, portrait dominant, thumb reach |
| Tablet | 768px – 1199px | iPad, Android tablets, small laptops | Touch + occasional mouse, both orientations |
| Web (Desktop) | ≥ 1200px | Desktop browsers, large laptops | Mouse + keyboard, hover states, multi-pane |

In Compose Multiplatform terms these map to `WindowWidthSizeClass.Compact`, `Medium`, and `Expanded` respectively, which makes the implementation contract straightforward across the KMP shared module.

### 4.2 Universal Principles

These apply to every screen regardless of viewport:

**Brand fidelity is constant.** Colors, typography, logo placement, and tone do not change between viewports. Visual hierarchy may shift but the brand should feel like one product across all three.

**Touch-first targets on mobile and tablet.** All interactive elements meet a minimum 44×44pt target on touch viewports. Web can use smaller targets where mouse precision is assumed but should match touch sizing for primary CTAs.

**Content parity, not feature parity.** Mobile and web should show the same *information* about any given object, but mobile may surface less *at once* through progressive disclosure (sheets, sections, drawers). The user must never be told "this feature requires a desktop" unless the activity is genuinely desk-bound (e.g., bulk template editing, advanced reporting — explicitly web-only at MVP per Section 4.5).

**Navigation morphs, doesn't disappear.** Bottom tab bar on mobile, hybrid (bottom tabs OR collapsible side nav depending on orientation) on tablet, persistent left rail on web. Top utility bar (search, quick-add, notifications, profile) is present on all viewports.

**Forms wrap, never overflow.** All form layouts collapse to single column on mobile, two-column where it helps on tablet, and use multi-column or side-by-side labels on web. No horizontal scrolling on data tables — they reformat into stacked cards on mobile and tablet, and only show as true tables on web.

**Tablets get the most design attention.** Tablet is the variant most likely to be under-designed because it falls between two more obvious targets. Treat tablet as a first-class design problem: do not let it be "the mobile layout stretched out" or "the web layout shrunk down."

**Keyboard and hover on web.** Web variants get hover states, keyboard shortcuts (where helpful: `/` for search, `n` for new, `?` for help map), right-click context menus on data rows, and drag-and-drop affordances. None of those exist on mobile or tablet.

**Offline-aware on mobile.** Only the mobile variant aggressively caches content for offline use. Tablet variants of the native iOS and Android apps inherit the same offline cache; the web app (any viewport) is always online by assumption — there is no PWA installation flow at MVP.

### 4.3 Reusable Responsive Patterns

The following named patterns cover the responsive behavior of the vast majority of screens. Section 4.4 maps each screen to a pattern and notes any deviations.

#### Pattern A — Auth / Simple Form
Used for login, registration, MFA, password reset, single-purpose forms.

- **Mobile.** Single full-width column, full-screen layout, branded header at top, primary CTA fixed near the keyboard, social-login buttons stacked vertically, large 56pt tap targets, keyboard-aware scroll, password manager autofill optimized.
- **Tablet.** Centered card (~480pt wide) on a branded background, social-login buttons side-by-side, more vertical breathing room, both portrait and landscape supported.
- **Web.** Two-column split (~50/50): brand illustration or rotating hero on the left, form panel (~400pt wide) on the right. Persistent links to legal pages in footer. Enter key submits.

#### Pattern B — List / Index
Used for trip lists, client rosters, message inboxes, lead inboxes, commission lists.

- **Mobile.** Vertical list of cards (one item per row); each card is touch-optimized with primary info, secondary info, and one quick action; pull-to-refresh; filter and search collapsed behind icon buttons; "Sort" opens a bottom sheet.
- **Tablet.** Either a two-column card grid (portrait) or a master-detail split (landscape) where tapping a row opens a detail pane on the right without leaving the list. Filters expanded into a top bar.
- **Web.** True data table with sortable column headers, sticky header row, row-hover highlights, right-click context menu, keyboard navigation (arrow keys, Enter to open), bulk-select checkboxes, persistent filter sidebar where the list has many filter dimensions.

#### Pattern C — Detail / Master-Detail
Used for Trip Detail, Client Detail, Lead Detail, Commission Detail.

- **Mobile.** Full-screen detail; back button to list; tabs as a horizontal scrollable strip near the top; sub-sections collapsible accordions.
- **Tablet.** In landscape, master-detail with list on left (1/3) and detail on right (2/3). In portrait, full-screen detail with breadcrumb back. Tabs as visible horizontal strip, all visible at once.
- **Web.** Detail page with persistent left navigation; tabs as horizontal buttons; secondary information in a right rail (e.g., agent contact card, recent activity); keyboard shortcuts to switch tabs.

#### Pattern D — Dashboard
Used for Client Dashboard, Agent Worklist, Commission Dashboard, Reports Hub.

- **Mobile.** Vertically stacked sections; KPI cards in a horizontal carousel near the top; each section has a "See all" link rather than showing exhaustive data; charts simplified to sparklines.
- **Tablet.** Two-column grid where KPI strip spans full width at top and sections fill below; charts richer than mobile but compact.
- **Web.** Three- or four-column grid; KPI strip with full charts inline; configurable widget layout for the agent dashboard; charts use full visualization capabilities.

#### Pattern E — Editor / Builder
Used for Trip Builder Workspace, Itinerary Editor, Proposal Builder, Template Editor, Email Signature Editor.

- **Mobile.** Single-pane editing; the workspace fills the screen; "Add component", side panels, and pickers all open as full-height bottom sheets; auto-save aggressive; preview is a separate full-screen mode the user toggles into.
- **Tablet.** Split view in landscape: workspace on the left (~60%) and a contextual panel on the right (~40%) for component types, properties, or live preview. Portrait collapses to mobile-style with a side panel toggle button.
- **Web.** Three-pane layout: left rail for asset library (templates, saved components), center workspace, right rail for properties of the selected element or live preview. Drag-and-drop between panes. Multi-select and keyboard nudging supported.

#### Pattern F — Search & Results
Used for Search Form, all Search Results screens, Public Search variants.

- **Mobile.** Search form is a full-screen sheet; results are a vertical list of large cards (one per row); filters open as a bottom sheet; map view is full-screen toggle, not side-by-side.
- **Tablet.** Search form is persistent at top (collapsible); results in a two-column grid; map/list toggle reveals a map on right (1/2) in landscape; filters in a collapsible side drawer.
- **Web.** Persistent left filter rail; results in a three- or four-column grid; map view occupies right half with synchronized hover (hover a card → highlight on map); pagination or infinite scroll with sticky filter context.

#### Pattern G — Wizard / Multi-Step
Used for Onboarding (client and agent), Create New Trip flow, Convert Lead to Trip, Quote Request Form.

- **Mobile.** One step per screen, full-screen; progress indicator at top; "Back" and "Next" CTAs persistent at bottom; ability to save progress and resume later.
- **Tablet.** Same one-step-per-screen approach but with more breathing room; progress indicator shows all steps with current highlighted; preview/summary panel visible on the right where applicable.
- **Web.** All steps visible as a left-rail stepper; current step occupies the main area; summary panel on the right; user can jump back to completed steps; keyboard navigation between steps.

#### Pattern H — Marketing / Public Page
Used for App Subdomain Public Landing, About / How It Works, Footer Pages.

- **Mobile.** Single column, hero image scales full-width, content sections stacked, CTAs full-width, testimonial carousel swipeable, sticky bottom CTA for primary action.
- **Tablet.** Hero with two-column layout where appropriate (image + text); content sections may use two-column grids; CTAs centered.
- **Web.** Full marketing layouts with multi-column sections, parallax-light hero, side-by-side image/text blocks, testimonial grids; SEO-optimized server-rendered (Kotlin/JS + React per BRD recommendation).

#### Pattern I — Reading / Content
Used for Itinerary Viewer, Itinerary Day Detail, Past Trip Memory View, About / How It Works.

- **Mobile.** Single column reading width, generous line height, large readable type (17pt body); day navigator as a horizontal scrollable chip strip; activities as full-width cards with images.
- **Tablet.** Reading width capped (~640pt) with margins; day navigator visible as a sidebar in landscape, chip strip in portrait; activities as cards with images aligned left.
- **Web.** Two-column layout: day navigator and trip overview on left (sticky), content on right with reading width capped (~720pt) for legibility; "Download PDF" and "Share" CTAs in a sticky header.

#### Pattern J — Modal / Sheet / Confirmation
Used for confirmations (revoke card, cancel trip, merge clients), reveals (card PAN), gates (sign-up prompt), pickers (template picker), and other interrupts.

- **Mobile.** Full-screen modal or full-height bottom sheet; "Cancel" in top-left, primary action in top-right or as a persistent bottom button; swipe-down to dismiss for non-destructive sheets.
- **Tablet.** Centered modal (~600pt wide) over a dimmed background; for picker-style modals, may use a wider layout with preview.
- **Web.** Centered modal (~480–720pt depending on content) with explicit close button and "Cancel" / primary action buttons in the lower-right; Escape key dismisses; focus trapped while modal is open.

### 4.4 Per-Screen Variant Mapping

Each screen's pattern assignment and any meaningful deviations from the pattern. Where a deviation is not noted, the screen follows the named pattern's defaults exactly.

#### Client — Public / Pre-Auth (2.0.x)
- **2.0.1 App Subdomain Public Landing** — Pattern H, with one deliberate deviation: **no mobile sticky bottom bar.** The September 2026 mobile artboard (`M201_PublicLanding`, the one Pattern H artboard that passes no `footer` to `MFrame`) anchors "Create an account" / "Sign in" / "Take a quick tour" full-width at the foot of the hero, above the fold and above the scripture strip. The page only scrolls ~210px on a 812px viewport, so a fixed bar would spend 77px permanently duplicating a button that never scrolls out of view. Tablet adds "Take a tour" as secondary; web shows full hero with rotating destination imagery. *(Recorded 2026-09-06 — this bullet previously read "Mobile sticky CTA is 'Sign in'", which the build has never matched. Every other Pattern H screen in §2.0 does render the bar.)*
- **2.0.2 About / How It Works** — Pattern I. FAQ section uses accordion on mobile/tablet, two-column on web.
- **2.0.3 Public Search Landing** — Pattern F (entry variant). Mobile shows the "sign in to save" banner as a sticky bottom strip; tablet/web shows it as a top banner with dismiss.
- **2.0.4 Public Search Results** — Pattern F. Save/quote CTAs trigger Sign-up Gate (Pattern J) on all viewports.
- **2.0.5 Public Property/Cruise/Tour Detail** — Pattern C. "Message Gyasi without an account" is a sticky bottom button on mobile, a side rail CTA on tablet/web.
- **2.0.6 Sign-up Gate** — Pattern J. Mobile uses full-height bottom sheet; tablet/web a centered modal.
- **2.0.7 Footer Pages** — Pattern I, simplified. Identical content across viewports; mobile uses larger type. Web implementation note: 2.0.2's FAQ ships as a single-column accordion on web too (matches the design prototype), and 2.0.6 ships as a route rather than a modal.
- **2.0.8 Caribbean / 2.0.9 Cruises / 2.0.10 Honeymoons** — Pattern H. Web: inquire bar sticks under the top bar, 3-column trip grid, island tiles in one row. Tablet: 2-column grid, inquire bar wraps to two rows. Mobile: single column, island tiles as a horizontal snap strip, trips as image-left rows, inquire bar replaced by the sticky bottom CTA ("Request a quote").
- **2.0.11 About Gyasi** — Pattern H with Pattern I reading widths. Web: two-column hero (copy + portrait), 4-up stats strip, two-column story/credentials, 3-column testimonials. Tablet: hero keeps two columns, story stacks above credentials. Mobile: stacked; portrait becomes a round badge on the hero; testimonials as a horizontal snap strip; sticky bottom CTA.

#### Client — Authentication & Onboarding (2.1.x)
- **2.1.1 Login** — Pattern A.
- **2.1.2 Registration** — Pattern A. Web shows password strength meter inline; mobile shows it below field.
- **2.1.3 Email Verification** — Pattern A, simplified — single message + CTA.
- **2.1.4 Forgot Password** — Pattern A.
- **2.1.5 Reset Password** — Pattern A.
- **2.1.6 MFA Setup** — Pattern A. QR code is large and centered on tablet/web; mobile shows it sized for the device screen.
- **2.1.7 MFA Challenge** — Pattern A. Code input uses native numeric keyboard on mobile.
- **2.1.8 Social Login / Linking** — Pattern J (modal-like).
- **2.1.9 Welcome / First Login** — Pattern G. Mobile is full-screen carousel; tablet/web shows multiple cards at once.
- **2.1.10 Profile Completion** — Pattern G.
- **2.1.11 Travel Preferences Capture** — Pattern G. Tag pickers WRAP on every width rather than scrolling horizontally on mobile (resolved September 2026): the screen's instruction is "tag what's true", and a scroller hides the options that instruction depends on people seeing. Each chip is a real `<input type="checkbox">` — a `<span>` is not focusable, not announced and not operable by keyboard.
- **2.1.12 Travel Companions / Household** — Pattern G.
- **2.1.13 Connect with Agent / Invite Code** — Pattern A.
- **2.1.14 Onboarding Complete** — Pattern G (final step). Recommended-actions cards stack on mobile, 2x2 grid on tablet, horizontal row on web.

#### Client — Dashboard & Trip Experience (2.2.x)
- **2.2.1 Client Dashboard / Home** — Pattern D. Mobile hero countdown is full-width; tablet/web shows it alongside a "today's weather" widget. **The weather widget was NOT built** (September 2026): `itinerary_day.weather_forecast` is agent-authored and cached per ITINERARY DAY, so there is no reading for "today" on a dashboard whose trip may be months away, and no weather integration exists to supply one (BRD §9 names none). The hero is full-width at every size instead; the forecast appears where it has data, on 2.2.4 and 2.2.5.
- **2.2.2 All Trips List** — Pattern B, with one recorded deviation: **a card list at every width, not a data table on web.** Pattern B's web column ("true data table with sortable headers, right-click menu, bulk-select") is written for the agent surface, where a hundred rows need scanning; §4.3 sizes a traveler's account at a handful of trips, and each one is a photograph they recognise before they read the title — the artboard draws image-led cards at 1280px for that reason. Search and sort are absent rather than inert for the same reason: a search field over four rows is furniture. **Built September 2026 as described here.**
- **2.2.3 Trip Detail / Overview** — Pattern C.
- **2.2.4 Itinerary Viewer** — Pattern I.
- **2.2.5 Itinerary Day Detail** — Pattern I. Maps are full-screen on mobile, inline on tablet/web.
- **2.2.6 Trip Document Library** — Pattern B. Documents shown as thumbnails (grid) on tablet/web, list on mobile.
- **2.2.7 Trip Messages / Thread** — Pattern J-adjacent (chat-style). Mobile is full-screen; tablet/web shows inline within Trip Detail's side rail.
- **2.2.8 Empty Trip Component States** — Inline within Itinerary Viewer; identical content across viewports.
- **2.2.9 Trip Status Change Notification View** — Pattern J. Mobile sheet; tablet/web modal.
- **2.2.10 Trip Cancellation View** — Pattern C variant.
- **2.2.11 Past Trip Memory View** — Pattern I + photo gallery. Photo grid is 1-col on mobile, 3-col on tablet, 4-col on web.

#### Client — Self-Guided Search (2.3.x)
- **2.3.1 Search Landing / Inspiration Hub** — Pattern F (entry variant). Mobile: single column with hero search. Tablet: hero + 2-col inspiration grid. Web: hero + 3-4 col grid with filter sidebar collapsed.
- **2.3.2 Search Form** — Pattern F.
- **2.3.3 Search Results — Hotels** — Pattern F.
- **2.3.4 Search Results — Cruises** — Pattern F.
- **2.3.5 Search Results — Flights** — Pattern F.
- **2.3.6 Search Results — Tours** — Pattern F.
- **2.3.7 Property / Cruise / Tour Detail** — Pattern C. Image gallery is swipeable on mobile, lightbox on tablet/web.
- **2.3.8 Quote Request Form** — Pattern G.
- **2.3.9 Quote Request Confirmation** — Pattern J.
- **2.3.10 Saved Searches & Favorites** — Pattern B.

#### Client — Payment & Card Authorization (2.4.x)
- **2.4.1 My Cards / Payment Methods List** — Pattern B. Cards displayed as visual card-shaped tiles on all viewports (this is one of the rare places where mobile actually shows richer visual treatment because of the credit-card metaphor).
- **2.4.2 Add Card** — Pattern A. Stripe Elements responsive natively; on mobile uses native payment-keyboard.
- **2.4.3 Card Authorization for Trip** — Pattern A + Pattern J (consent step).
- **2.4.4 Card Authorization Confirmation** — Pattern J.
- **2.4.5 Card Use History / Activity** — Pattern B.
- **2.4.6 Card Use Detail / Event Detail** — Pattern C variant (single-page detail).
- **2.4.7 Revoke Card Authorization Confirmation** — Pattern J. Always a modal/sheet because this is consequential.

#### Client — Account & Profile (2.5.x)
- **2.5.1 Account Overview** — Pattern D variant. Mobile: list of tiles. Tablet/web: grid of tiles.
- **2.5.2 Personal Info Edit** — Pattern A.
- **2.5.3 Travel Preferences Edit** — Pattern A. Same chip behavior as 2.1.11.
- **2.5.4 Travel Documents** — Pattern B. Thumbnail grid on tablet/web.
- **2.5.5 Document Upload / Camera Capture** — Pattern J. Mobile uses native camera; tablet uses either camera or file picker; web is file picker only.
- **2.5.6 Notification Preferences** — Pattern A (matrix form). Mobile: stacked toggles per category. Tablet/web: actual matrix table.
- **2.5.7 Security Settings** — Pattern A.
- **2.5.8 Connected Accounts** — Pattern A.
- **2.5.9 Privacy & Data Export** — Pattern A.
- **2.5.10 Account Closure** — Pattern J (destructive confirmation).
- **2.5.11 Help & Support** — Pattern I + Pattern B (FAQ list).

#### Client — Messaging (2.6.x)
- **2.6.1 Messages Inbox** — Pattern B. Master-detail on tablet landscape and web (inbox left, conversation right).
- **2.6.2 Conversation Thread** — Pattern C (chat-style). Mobile is full-screen; tablet/web inline with inbox.
- **2.6.3 New Conversation** — Pattern A.

#### Client — Mobile-Specific (2.7.x)
- **2.7.1 Offline Itinerary View** — Mobile-only. Adapts Pattern I with offline indicators.
- **2.7.2 Quick Call Advisor** — Mobile-only. Pattern J (full-screen action sheet).
- **2.7.3 Emergency Contacts** — Mobile-only. Pattern J.
- **2.7.4 Push Notification Permission Prompt** — Mobile-only. Pattern J.
- **2.7.5 Biometric Login Setup** — Mobile-only. Pattern A.
- **2.7.6 Calendar Sync** — Mobile-only at MVP (tablet may follow in Phase 2). Pattern A.
- **2.7.7 In-App Settings (Mobile)** — Mobile-only. Pattern A.
- **2.7.8 App Update Required** — Mobile-only. Full-screen blocking modal.

These screens exist only on mobile and tablet PWA installs. The web variant either does not need the feature (e.g., biometric login uses the browser's password manager instead) or provides the capability via a different mechanism documented inline.

#### Client — Group Trip Coordination (2.8.x)
- **2.8.1 Group Trip Overview** — Pattern C.
- **2.8.2 Co-Traveler Invitation** — Pattern A.
- **2.8.3 Group Chat** — Pattern C variant. Same as 2.6.2 but with multiple participants.
- **2.8.4 Co-Traveler View (Limited)** — Pattern I.

#### Agent — Authentication & Activation (3.1.x)
- **3.1.1 Agent Login** — Pattern A.
- **3.1.2 Agent MFA Challenge** — Pattern A.
- **3.1.3 Agent Password Reset** — Pattern A.
- **3.1.4 Agent Invitation / Activation Link** — Pattern A.
- **3.1.5 Account Activation — Set Password** — Pattern A.
- **3.1.6 Mandatory MFA Setup** — Pattern A. QR code centered and large; backup codes printable on web.
- **3.1.7 Agent Profile Setup** — Pattern G.
- **3.1.8 Availability & Calendar Setup** — Pattern G. Web shows true week grid; mobile uses day-by-day stack; tablet hybrid.
- **3.1.9 Email Signature Setup** — Pattern E (editor). Web is primary surface; mobile/tablet support viewing and minor edits.
- **3.1.10 Welcome Tour / First-Run** — Pattern G + coachmarks. Coachmarks adjust to viewport-specific UI positions.

#### Agent — Dashboard & Pipeline (3.2.x)
- **3.2.1 Agent Dashboard / Worklist** — Pattern D.
- **3.2.2 Pipeline / Funnel** — Pattern B variant. **Important deviation:** mobile collapses the kanban into a stage-picker (one stage at a time, swipe between stages). Tablet shows 2-3 stages at once with horizontal scroll. Web shows the full kanban (5 stages side-by-side) with drag-and-drop.
- **3.2.3 Calendar** — Pattern D variant. Mobile: agenda view default; tablet: week view; web: month view default.

#### Agent — Client Management (3.3.x)
- **3.3.1 Client List / Roster** — Pattern B.
- **3.3.2 Client Detail / Profile** — Pattern C.
- **3.3.3 – 3.3.8 Client tabs (Overview, Trips, Messages, Documents, Notes, Activity)** — Pattern C variants. On mobile each tab is a full screen reached via the tab strip; tablet/web shows all tabs as visible and may show two tabs side-by-side (e.g., Overview + Notes) on web.
- **3.3.9 Create Client** — Pattern A.
- **3.3.10 Edit Client** — Pattern A.
- **3.3.11 Merge Clients** — Pattern J. Web-strongly-preferred — mobile can initiate but the field-by-field picker is desktop-grade and gets a "Best done on desktop" warning on mobile.
- **3.3.12 Archive / Restore Client** — Pattern J.

#### Agent — Trip Builder & Management (3.4.x)
- **3.4.1 Trip List** — Pattern B.
- **3.4.2 Trip Detail (Agent View)** — Pattern C.
- **3.4.3 Create New Trip — Type Selector** — Pattern G.
- **3.4.4 Trip Builder Workspace** — Pattern E. **Web-primary.** Mobile shows the trip builder as a vertical component list with bottom-sheet add flow — usable for additions and edits, but full trip-building from scratch is awkward. Tablet works comfortably in landscape. Web is the intended deep-work surface.
- **3.4.5 – 3.4.12 Component Add/Edit screens** — Pattern A within Pattern E. Search-based component adds (flight, hotel, cruise, tour) use Pattern F inside the builder.
- **3.4.13 Trip Template Library** — Pattern B + Pattern E. **Web-only at MVP** for editing templates; mobile/tablet can browse and apply.
- **3.4.14 Itinerary Editor** — Pattern E. Web-primary like 3.4.4.
- **3.4.15 Trip Payment Schedule** — Pattern A.
- **3.4.16 Cancel / Archive Trip** — Pattern J.

#### Agent — Proposal & Itinerary (3.5.x)
- **3.5.1 Proposal Builder** — Pattern E. Web-primary.
- **3.5.2 Proposal Preview** — Pattern I.
- **3.5.3 Send Proposal** — Pattern A.
- **3.5.4 Proposal Sent Confirmation** — Pattern J.
- **3.5.5 Itinerary Auto-Generator** — Pattern E. Web-primary; mobile/tablet support previewing the generated output.
- **3.5.6 Itinerary Preview (Agent)** — Pattern I.
- **3.5.7 Publish Itinerary Update** — Pattern J.

#### Agent — Payment & Card Management (3.6.x)
- **3.6.1 Card Vault (Per Trip)** — Pattern B. Visual card tiles like 2.4.1.
- **3.6.2 Request Card Authorization** — Pattern A.
- **3.6.3 Authorization Request Sent** — Pattern J.
- **3.6.4 Reveal Card Number (Audited)** — Pattern J. Critical security screen — uses the same heavy treatment on all viewports (MFA step-up modal, dimmed background, auto-hide). Web copy-button uses clipboard API with auto-clear after 60 seconds; mobile does the same.
- **3.6.5 Log Card Use** — Pattern A. Mobile prioritizes quick entry with optional receipt photo capture from camera.
- **3.6.6 Card Use Log** — Pattern B.
- **3.6.7 Set or Update Spending Limit** — Pattern A.

#### Agent — Commission Tracking (3.7.x)
- **3.7.1 Commission Dashboard** — Pattern D.
- **3.7.2 Commission List** — Pattern B.
- **3.7.3 Commission Detail / Edit** — Pattern C.
- **3.7.4 Add Commission Entry** — Pattern A.
- **3.7.5 Inteletravel CSV Import** — Pattern G. **Web-only at MVP** — CSV mapping is desk work; mobile shows a "Best done on desktop" message with link to email-yourself-the-CSV.
- **3.7.6 Reconciliation View** — Pattern B variant (side-by-side match). **Web-primary**; tablet supports landscape; mobile is read-only.
- **3.7.7 Commission Forecast / Pipeline** — Pattern D.

#### Agent — Leads (3.8.x)
- **3.8.1 Leads Inbox** — Pattern B.
- **3.8.2 Lead Detail** — Pattern C.
- **3.8.3 Convert Lead to Trip** — Pattern G.
- **3.8.4 Reject / Archive Lead** — Pattern J.
- **3.8.5 Lead Source Analytics** — Pattern D.

#### Agent — Login Support (3.9.x)
- **3.9.1 Client Account Management Screen** — Pattern C variant (per-client admin).
- **3.9.2 – 3.9.5 Reset / Magic Link / Verify Email / Lock-Unlock** — Pattern J (confirmation modals).
- **3.9.6 Client Login Activity** — Pattern B.
- **3.9.7 Merge Duplicate Accounts** — Same as 3.3.11.

#### Agent — Messaging & Templates (3.10.x)
- **3.10.1 Agent Inbox** — Pattern B. Master-detail on tablet/web.
- **3.10.2 Conversation Thread (Agent)** — Pattern C (chat-style).
- **3.10.3 Template Picker** — Pattern J.
- **3.10.4 Template Library** — Pattern B. **Web-primary** for editing.
- **3.10.5 Template Editor** — Pattern E. **Web-only at MVP.**
- **3.10.6 Bulk Send (Future)** — Pattern G. **Web-only.**

#### Agent — Reporting (3.11.x)
- **3.11.1 Reports Hub** — Pattern D variant (tile grid).
- **3.11.2 – 3.11.7 Individual Reports** — Pattern D variants. **Web-primary** for all reports; mobile shows summary KPIs; tablet supports basic interaction.
- **3.11.8 Export Center** — Pattern A. **Web-only** for downloads.

#### Agent — Agent Profile & Settings (3.12.x)
- **3.12.1 Agent Profile / My Account** — Pattern A.
- **3.12.2 Agent Calendar / Availability** — Pattern G variant. Week grid is web-primary.
- **3.12.3 Agent Notification Preferences** — Pattern A.
- **3.12.4 Email Signature Configuration** — Pattern E. **Web-primary.**
- **3.12.5 Branding Settings** — Pattern A. Web-only at MVP.

### 4.5 Web-Only and Mobile-Only Screens (Summary)

This table consolidates screens that are intentionally not built for all three viewports at MVP. Phase 2+ may expand coverage; the BRD's "agent on mobile is for triage only" stance drives most of these decisions.

| Screen | Available on Mobile | Available on Tablet | Available on Web |
|---|---|---|---|
| Trip Template Library (3.4.13 — edit) | View only | View only | Full |
| Itinerary Auto-Generator (3.5.5) | Preview only | Full | Full |
| Inteletravel CSV Import (3.7.5) | Redirect | Full | Full |
| Reconciliation View (3.7.6) | Read-only | Full | Full |
| Template Editor (3.10.5) | View only | View only | Full |
| Bulk Send (3.10.6) | Not available | Not available | Full |
| Reports — detail views (3.11.x) | Summary only | Basic | Full |
| Export Center (3.11.8) | Initiate only | Initiate only | Full |
| Branding Settings (3.12.5) | Not available | Not available | Full |
| Offline Itinerary (2.7.1) — Phase 3 | Full (Android tablet app) | Full (Android tablet app) | Not applicable |
| Quick Call Advisor (2.7.2) | Full | Tap-to-call where supported | Not applicable |
| Emergency Contacts (2.7.3) | Full | Full | Not applicable |
| Biometric Login (2.7.5) | Full | Full (where supported) | Not applicable (password manager) |
| App Update Required (2.7.8) | Full | Full | Not applicable |

### 4.6 Implementation Notes for Kotlin Multiplatform

Three notes specific to the KMP stack chosen in the BRD:

**One shared layout token system, three render targets.** Define spacing, type, and breakpoint tokens in the shared module so Compose Multiplatform (mobile), Compose Multiplatform for Web or Kotlin/JS + React (web), and tablet variants all reference the same source of truth.

**Window size class drives variant selection.** Use Compose Material's `WindowSizeClass` (Compact / Medium / Expanded) as the single switch that drives Pattern selection, rather than hard-coded pixel checks scattered through component code. This makes the breakpoints in Section 4.1 a single configuration point.

**Web SEO needs server rendering for public screens.** All Pattern H screens (public landing, about, footer pages, public search) must render server-side for SEO. The BRD's recommendation is to use Kotlin/JS + React (or even Next.js with calls to the Ktor backend) for these surfaces while using Compose Multiplatform for Web for the authenticated portal. The patterns in this section apply equally to both — only the rendering technology differs.

---

## 5. Cross-Cutting Screen States

Every screen in this inventory must consider four states beyond the "happy path":

**Loading state.** Skeleton placeholders that match the screen's layout; brand-aligned progress indicators; avoid spinner-on-blank wherever possible because it hides what is coming.

**Empty state.** A friendly, branded illustration with a one-line explanation of why the screen is empty and a clear CTA to populate it ("You haven't authorized any cards yet — add one when an agent requests it" / "No trips yet — explore the search to find your next adventure").

**Error state.** Plain-language description of what went wrong; never expose stack traces; retry CTA where applicable; "Message Gyasi" CTA as a fallback escalation path. Inline error color is `md.error` — see Design-System §4.1, which is authoritative for it.

> Colour note, resolved September 2026. This section used to say "Tropical Orange (#E85D2A) for inline error highlights, never red (Storybook Red #8B2020)". Both hexes predate the current palette — the orange token is #E87722 and there is no #8B2020 — so the sentence was describing a palette the system no longer has. Screens 2.1.1–2.1.8 shipped with `md.error`, orange is the brand accent used for overlines and emphasis, and using one colour for both would remove the distinction. The Design System owns error colour; this section no longer contradicts it.

**Permissions / unauthorized state.** When a client tries to access an agent screen, or vice versa, present a clear "You don't have access to this view" with the appropriate redirect.

In addition to those four, three more states apply selectively:

**Offline state (mobile).** Cached content where available; "Offline — last synced X minutes ago" banner; queued-action indicator for things that will sync when reconnected.

**Stale data state.** When the platform knows displayed data may be out of date (e.g., a cached travel API result older than its TTL), show a "Refresh" affordance with the last-updated timestamp.

**Maintenance / read-only mode.** Full-screen banner when the platform is in a deploy or maintenance window; degraded features clearly labeled.

---

## 6. Navigation & Information Architecture (Overview)

### 6.1 Client Web Navigation

**Amended September 2026, built as amended.** A 72px vertical **navigation rail** on the left, not a top nav: Trips, Discover, Messages, Wallet, Documents, Account. The logo sits in a 104px top bar above the content alongside notifications and the account avatar — 104px because the bar carries the real brand lockup, whose legibility floor is 80px (Design-System §11.2).

This contradicts what this section said originally — "Top nav: Logo, Trips, Search, Messages, Profile menu (with Account submenu)" — and the contradiction was settled in the prototype's favour by Gyasi on 2026-09-06. Three reasons it is the better answer, recorded so nobody re-litigates it:

- **The rail is where the design went.** The Claude Design project draws a rail for the authenticated client surface, and a top nav only for the public one. Building the doc's version would have meant a screen that matches no artboard.
- **Six destinations do not fit a top nav beside a logo** at tablet width without collapsing into a menu, and a menu is where destinations go to be forgotten.
- **It matches the agent surface (§6.4)**, so one shell serves both roles as §3.x lands.

Note the destinations are NOT the same set as §6.3's bottom bar, and this is deliberate rather than an inconsistency — see the note there. "Search" is renamed **Discover** on both surfaces: it is a curated catalog at Phase 1, and "Search" promises a query box that does not exist until the Phase 2 API integration.

### 6.2 Client Tablet Navigation
The rail from §6.1, unchanged, from 768px up. There is no top-nav-in-landscape / drawer-in-portrait split: the rail is 72px and costs the same in either orientation, and a drawer would have been a third navigation implementation to keep in step with the other two. The bottom tab bar appears below 768px, which is the §4.1 mobile breakpoint.

### 6.3 Client Mobile Navigation

**Amended September 2026, built as amended.** A **four-tab** bottom bar: Trips, Discover, Messages, Account. Originally five (Home, Trips, Search, Messages, Profile) with a floating "Help" button; both changed, per the same 2026-09-06 decision.

- **Home and Trips collapsed into one tab.** The dashboard (2.2.1) *is* the Trips tab root, and the trip list (2.2.2) is one tap inside it. Two tabs for one idea is how a four-tab bar becomes a five-tab bar becomes a menu.
- **Four rather than six.** Wallet (§2.4) and Documents (§2.5.4) stay on the rail and are reached from the trip screens on mobile. A phone bar wants thumb-reachable targets, and §4.2's 44pt minimum across six tabs leaves nothing for a label.
- **No Help FAB.** The prototype's own bottom bar has none, and a floating button that follows the traveler across every screen is the opposite of §2's "leaves room for rest". Help lives in Account.

`web/lib/client/nav.ts` and `domain/trip/ClientDestinations.kt` are the two implementations of this, held in step by `.github/scripts/check_copy_parity.py`. Both model a **union of six destinations with per-surface inclusion flags** rather than one list with a projection, precisely because §6.1's set and this one differ.

### 6.4 Agent Web Navigation
Left rail: Dashboard, Pipeline, Calendar, Clients, Trips, Leads, Messages, Commissions, Reports, Templates, Settings. Top utility bar: search, quick-add, notifications, profile menu.

### 6.5 Agent Tablet Navigation
Collapsible left rail (icon-only by default, expands on hover/tap); top utility bar present. Landscape behaves like a compressed web layout; portrait collapses to a bottom tab bar with the deeper navigation in a drawer.

### 6.6 Agent Mobile Navigation
The mobile experience for agents at MVP is intentionally narrower than web — designed for on-the-go tasks rather than deep work. Bottom tab bar: Worklist, Clients, Messages, More. The full pipeline, reporting, and template management features remain web-only at MVP.

---

## 7. Open Questions

These are decisions that should be settled before final design and engineering begin.

**Multi-language support.** Many travel clients are bilingual or international. Is Spanish a Phase 1 requirement? It affects how every screen handles text expansion and locale-specific dates/currency.

**Currency display.** USD-first is the default, but suppliers in the Caribbean may quote in EUR or local currency. Should the platform display original currency, convert to USD, or both?

**Client app "lite" experience.** Should there be a read-only access mode for invited co-travelers who have not created accounts (e.g., a magic-link itinerary view)? This affects screens 2.8.2 and 2.8.4.

**Agent-on-mobile scope.** How deep should the agent mobile experience go? The current plan limits it to triage tasks; if agents will be building trips on mobile, several additional screens are needed.

**Whitelabeling.** If Story-Tail Adventures ever offers the platform to other independent advisors (Phase 4+), some screens will need a "brand owner" parameter throughout. Worth keeping this in mind during initial design even if not implementing.

**Notification screen specificity.** Every push notification could deep-link to a unique screen state. The inventory mentions a few of these but a full notification-to-screen map should be authored alongside this document.

---

*Story-Tail Adventures — Making Travel an Adventure*
