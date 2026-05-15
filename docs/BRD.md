# Business Requirements Document
## Story-Tail Adventures — Web & Mobile CRM Platform

**Document Owner:** Gyasi Story, Owner / Travel Advisor — Story-Tail Adventures
**Audience:** Internal (Story-Tail Adventures team)
**Version:** 1.0 — Draft
**Date:** May 14, 2026
**Status:** Initial requirements capture

---

## 1. Executive Summary

Story-Tail Adventures is an independent travel advisory business hosted by Inteletravel. Today the business runs on third-party CRM platforms — historically Travel Joy and most recently Travefy — to manage clients, build trip proposals, deliver itineraries, and collect supplier-payment card authorizations. These tools have served us well, but they constrain branding, force workflows we can't customize, charge ongoing subscription fees, and don't give clients the persistent, self-service portal experience we want them to have.

This document defines the business requirements for building a custom web application and companion mobile app — branded entirely as Story-Tail Adventures — that will replace Travefy and absorb the workflows we relied on from Travel Joy. The platform must serve two primary audiences: **clients** (who want to view trips, authorize payments, search for travel, and manage their travel history) and **travel agents** (who plan trips, manage relationships, handle authentication issues, and track commissions). It must be visually consistent with our brand, easy enough for an independent advisor to operate without a developer on call, and architected to support a small but growing team of advisors.

The current target is to launch a Minimum Viable Product (MVP) that closes the gap with Travefy on the highest-value features, then iterate on self-service search and deeper automation.

---

## 2. Background & Current State

### 2.1 About Story-Tail Adventures

Story-Tail Adventures is a travel advisory business owned and operated by Gyasi Story, hosted by Inteletravel. The brand voice is warm, adventure-forward, and personal — "making travel an adventure" with a focus on Caribbean vacations, cruises, all-inclusive resorts, family travel, group trips, and honeymoons. The website is at adventures.story-tail.com.

**Worldview foundation.** The brand sits on a specific conviction: that **rest is sacred — a gift, and a command** (Genesis 2:2–3, Exodus 20:8, Mark 6:31), and that **creation is given to be enjoyed** (1 Timothy 6:17, Psalm 23, Isaiah 55:12). Vacation is not indulgence; it is participation in something God ordained. Travel is a way of stepping into a world that was made to be beautiful and receiving it with gratitude. This conviction informs the brand's voice, copy, and visual choices across every surface — but it is never used as a screening device. Clients of every background are welcomed; the worldview shapes the founder's *why*, not the gate to service. The Design System (Section 2 "Brand Voice & Worldview") spells out where this shows up in product and how to keep it authentic rather than performative.

Revenue is commission-based: suppliers (resorts, cruise lines, tour operators) pay commissions through Inteletravel, which then pays Gyasi. Per Inteletravel host agency policy, Story-Tail Adventures does **not** charge clients planning, consultation, or service fees — all advisor revenue comes from supplier-paid commissions. The platform must reflect this: there is no client-side billing surface, no invoicing of clients for advisor services, and no merchant-of-record posture for Story-Tail Adventures on any transaction.

### 2.2 Current CRM Stack

We currently use **Travefy** as the primary CRM, having recently migrated from **Travel Joy**. Both tools handle a similar set of jobs but each has strengths we want to preserve:

The CRM jobs-to-be-done today: managing client contact records and trip history; building visually polished trip proposals and itineraries; collecting credit card authorization forms so we can pay suppliers on the client's behalf; communicating with clients via templated emails; and tracking the state of each trip from inquiry through post-travel follow-up. Commission income is currently tracked separately, in spreadsheets, against Inteletravel's reporting.

### 2.3 Why Replace Them

There are several drivers behind this build:

We want full control over the client-facing experience — the look, the navigation, the URLs, and the ability to add features without waiting on a vendor roadmap. We want clients to have a persistent login they recognize as Story-Tail Adventures, not a co-branded vendor portal. We want self-guided search so prospective clients can explore trip ideas on their own time and convert into leads automatically. And we want commission tracking integrated into the same system the trips are booked in, so we're not reconciling spreadsheets against Inteletravel reports.

Replacing two SaaS subscriptions also offers cost savings at scale once the platform is built, though that's a secondary benefit — the primary goal is product differentiation and operational efficiency.

---

## 3. Business Goals & Objectives

The platform must deliver on the following outcomes:

**Replace Travefy as the operational CRM** for client management, trip building, proposals, itineraries, and payment authorization. Every workflow currently performed in Travefy must have an equivalent (or better) workflow in the new platform before Travefy can be cancelled.

**Give clients a branded self-service portal** where they can log in, see all current and past trips, view itineraries, authorize payments, and search for new trip ideas. The portal should feel like an extension of the Story-Tail Adventures brand, not a separate tool.

**Empower agents** (Gyasi today; additional advisors in the future) with a focused workspace inspired by Travel Joy's agent view — fast client lookup, trip pipeline visibility, commission tracking, and the administrative tools needed to support clients (password resets, login troubleshooting, account merges).

**Generate qualified leads via self-guided search** so prospective clients can explore destinations and trip types directly on the website, with their searches and saved favorites flowing into the agent's inbox as leads.

**Track commission accurately** from booking through payment, reconciling against Inteletravel's commission reports.

**Hold supplier-payment card data securely** with the explicit constraint that the platform only stores card data needed to pay suppliers on the client's behalf — never to process direct charges. PCI compliance must be designed in from day one.

---

## 4. Scope

### 4.1 In Scope

The web application (responsive, desktop-and-mobile-browser ready), the mobile application (iOS and Android, client-facing primarily, with light agent functionality), authentication and account management, trip and itinerary management, payment authorization workflows, commission tracking, self-guided trip search backed by real travel APIs, branded email communications, and reporting for the advisor.

### 4.2 Out of Scope (Phase 1)

Direct payment processing where the client is charged by Story-Tail Adventures (we are an advisor — suppliers charge clients; we only hold card auth to pay suppliers). Replacing Inteletravel's role as host agency or booking-of-record. Replacing the public marketing site at adventures.story-tail.com (initially the platform lives at an app subdomain like app.story-tail.com; consolidation can come later). A full agent-to-agent collaboration suite (this is built for a small team to start). Direct integration with every cruise line or tour operator (we'll integrate with aggregators).

### 4.3 Assumptions

We assume the advisor remains hosted by Inteletravel and that Inteletravel continues to be the booking entity of record. We assume clients will continue to receive supplier-facing invoices and confirmations directly from the supplier when applicable, and that Story-Tail's role is curation, advisory, and concierge support. We assume initial scale is one advisor with a backlog of approximately 50–150 active clients and 20–40 active trips at any time, growing 2–3x over the first 18 months.

---

## 5. User Roles & Personas

### 5.1 Client

The end traveler. May be a returning client with multiple past trips, a referral booking their first trip, or a lead who came in through self-guided search. Wants a low-friction way to view their trip, authorize payments, ask questions, and find inspiration for future travel. May travel solo, as a couple, with family, or as part of a group. Comfort with technology varies widely — the experience needs to work for first-time-app-users.

### 5.2 Travel Agent (Advisor)

Currently this is Gyasi only. In the future this may be additional advisors hosted under Story-Tail Adventures. The agent needs efficient tools for prospecting, qualifying leads, building proposals, presenting options, booking trips with suppliers (which still happens through Inteletravel/supplier portals), managing payments, tracking commission, and maintaining client relationships. The agent role inherits the Travel Joy mental model — a worklist of active trips, a client roster, a pipeline view, and quick communication tools.

### 5.3 Administrator

A super-user role for managing the platform itself: user provisioning, agent onboarding, role assignment, audit logs, integration credentials, and platform configuration. Initially this is also Gyasi, but the role should be cleanly separable so it can be delegated.

### 5.4 Supplier (Indirect)

Suppliers do not log into the Story-Tail platform. They are referenced as data — a record of "who is providing this trip component" — and the platform interacts with them only via aggregator APIs and outbound payments authorized by clients.

---

## 6. Functional Requirements — Client Experience

### 6.1 Account & Authentication

Clients can self-register with email and password, or sign up via social login (Google, Apple). Returning clients receive a welcome experience that connects their email to any existing trip records the agent has already created in the system, so they immediately see their travel history on first login. Password reset, email verification, and multi-factor authentication (optional, recommended for users who store payment cards) must be supported.

### 6.2 Trip Dashboard

After logging in, the client sees a personalized dashboard with their upcoming trip prominently featured (a countdown card, key dates, weather expectations, and a "View Itinerary" call to action). Below it are sections for trips in planning, past trips, and saved searches. Each trip card shows a hero image, destination, dates, traveler count, and current status (e.g., "Proposal Ready", "Booked", "Final Payment Due", "Traveling Now", "Past Trip").

### 6.3 Itinerary Viewer

Clients tap into a trip to see a full itinerary — modeled on Story-Tail Adventures' existing itinerary structure (header section with travelers and dates; day-by-day breakdown with morning/afternoon/evening blocks; flight details; resort or ship info; excursions; emergency contacts; packing reminders; insurance details). The itinerary must be viewable on web and mobile, downloadable as PDF, and shareable with co-travelers via a secure link. The agent can update the itinerary at any time and clients see the updates immediately.

### 6.4 Payment Authorization

This is the most security-sensitive feature in the application. The client can authorize a credit card to be used by the advisor to pay a supplier on the client's behalf. The client provides card details through a PCI-compliant payment form (tokenized by the payment processor — see Section 10). The advisor never sees the raw card number; the platform stores only a tokenized reference. The client can see what cards they've authorized, for which trips, with what spending limits, and can revoke authorization at any time. Every use of the card by the advisor generates a notification to the client.

**Important constraint:** the platform does not charge the client directly. The advisor uses the tokenized card to charge the supplier (via Inteletravel or directly via the supplier's portal) — Story-Tail Adventures is never the merchant of record.

### 6.5 Self-Guided Trip Search

Prospective and existing clients can search for trips by destination, dates, traveler count, trip type (resort, cruise, family, romantic, adventure, etc.), and budget range. Results are sourced from integrated travel APIs (see Section 9) and presented in Story-Tail Adventures' branding. The client can save searches, favorite results, and submit a "Quote Request" that creates a lead in the agent workspace with all the context attached. Importantly: clients cannot book directly through the platform — every search converts to an inquiry the advisor responds to, preserving the human-led advisory model.

### 6.6 Messaging & Notifications

Clients can message the advisor in-app, with conversations threaded by trip. Outbound notifications (email and push) include: trip status changes, itinerary updates, payment authorizations needed, payment activity on stored cards, pre-trip reminders (7–14 days before departure), post-trip follow-ups, and marketing opt-ins for hot deals.

### 6.7 Trip History & Documents

Every trip the client has taken with Story-Tail Adventures is preserved in their account — itinerary, photos they choose to upload, confirmation numbers, supplier contacts, and post-trip notes from the advisor. Travel documents (passport scans, visa confirmations, insurance certificates) can be uploaded by the client and stored securely.

### 6.8 Mobile App Specifics

The mobile app delivers the same core client-facing capabilities (dashboard, itinerary, messaging, payment authorization, search) with mobile-native conveniences: push notifications, offline itinerary access for travelers without connectivity at their destination, calendar integration, camera-based document upload, and quick-call buttons for the advisor and emergency contacts.

---

## 7. Functional Requirements — Agent Workspace

This section is inspired heavily by Travel Joy's agent experience, which has historically been the strongest model for an advisor-facing CRM in this market.

### 7.1 Agent Dashboard & Worklist

The agent's home view is action-oriented. It shows: trips in proposal phase awaiting client response; trips with payments due soon; new leads from self-guided search that need first-contact; clients with upcoming travel (next 30 days); recent messages awaiting reply; and commission expected this month. Each item is one click into the relevant record.

### 7.2 Client Management (CRM)

A searchable, filterable client roster. Each client record contains contact info (name, email, phone, address); important dates (birthdays, anniversaries, passport expiration); preferences (preferred destinations, travel style, dietary restrictions, accessibility needs, frequent flyer numbers, loyalty programs); household/travel-companion relationships; communication history; trip history; and notes. The agent can quickly create, update, merge, or archive client records.

### 7.3 Trip Builder

The core agent tool. The agent can create a new trip for a client, choose a trip type (cruise, all-inclusive, multi-destination, group, custom), and assemble itinerary components — flights, hotels, cruises, transfers, excursions, dining reservations. Components can be pulled from integrated APIs (live availability and pricing — Phase 2; see Section 9) or entered manually (Phase 1; the default MVP path). The agent can save the trip as a draft, send a polished proposal to the client, mark it as booked when the client confirms, and manage payment schedules from there. Templates and saved itineraries speed up repeat trip types (e.g., a Sandals honeymoon proposal template).

**Note on "group" trip type vs. Group Trip Coordination:** Trip type `group` is a single-trip designation (one client, agent records the trip as a group event such as "Smith Family Reunion") and is available in Phase 1. This is distinct from the multi-client *Group Trip Coordination* feature (shared itineraries across multiple client accounts, co-traveler invitations, group chat), which is Phase 3 — see Sections 13.3 and 13.4.

### 7.4 Proposal & Itinerary Presentation

The agent generates a branded proposal that the client receives by email and can view in their portal. Once accepted, the proposal converts into a working itinerary with the day-by-day detail expected from Story-Tail Adventures. The agent can edit the itinerary at any time — additions, time changes, supplier confirmations, gate updates — and the client sees those updates with optional notification.

### 7.5 Payment & Card Authorization Management

The agent can request a credit card authorization from a client (which triggers a secure link the client uses to enter card details), see what cards are on file for each trip (tokenized — never raw numbers), set spending limits per card per trip, and log each time a card is used to pay a supplier. The platform records these as authorization events for auditability and client transparency.

### 7.6 Commission Tracking

For every booked trip, the agent records: supplier, gross booking value, commission rate, expected commission, payment terms (commission paid after travel vs. at booking, depending on supplier), and status (expected → invoiced → received). The system rolls these up into monthly, quarterly, and annual views, with comparisons to last year and projections based on bookings in the pipeline. Where possible, the system reconciles against Inteletravel's commission reports (initially via manual import; longer-term via API if Inteletravel offers one).

### 7.7 Login Support & Account Administration

The agent can — for any client they own — initiate a password reset, send a magic-link login, verify an email address, merge duplicate accounts, see recent login activity (for fraud/troubleshooting), and lock/unlock accounts. These are routine support tasks the advisor handles for less-technical clients. (Note: agents can never *see* a client's password; reset workflows always go through the client's verified email.)

### 7.8 Messaging & Templates

Agents have a message inbox grouped by client and trip. Branded email templates (covering new-lead response, trip proposal, booking confirmation, follow-up, pre-trip, post-trip, and payment reminder communications) can be sent from the platform with merge fields auto-populated from the client and trip records.

### 7.9 Reporting

Standard reports the advisor needs: revenue by month, commission by supplier, top destinations, client lifetime value, conversion rate from inquiry to booked trip, average time-to-book, and pipeline value. Reports are viewable in-app and exportable to Excel/CSV for tax prep and business analysis.

### 7.10 Multi-Agent Support (Future-Ready)

The platform must be architected so that adding additional advisors later is straightforward. Each client is owned by exactly one primary agent (with optional secondary agents); commission is attributed correctly; and data partitioning ensures advisors only see their own clients unless explicitly shared.

---

## 8. Functional Requirements — Administrator

The administrator can manage agent accounts (provision, deactivate, reset), manage role permissions, configure integration credentials (API keys for travel APIs, payment processor, email service), view audit logs (who did what when), manage branding assets (logo variants, color palette per the existing brand guide), configure email templates at the platform level, and view platform-wide health metrics (API quota usage, failed payments, error rates).

---

## 9. Travel API Integrations

This is one of the most critical and most cost-sensitive areas of the build. Below is a survey of credible options for each component, with a recommendation for MVP and a path to more sophisticated integration later.

### 9.1 Flights

For flight search and booking, the practical options are the major Global Distribution Systems and a few modern aggregators.

**Amadeus Self-Service APIs** are the most accessible entry point for an independent advisor. The Self-Service tier offers flight search, flight offers price, flight booking, seat maps, airport/airline lookup, and trip purpose prediction with a generous free test tier and pay-as-you-go production pricing. This is the recommended MVP choice for flights.

**Sabre Dev Studio** offers a similar but historically more enterprise-oriented surface. Better choice if Inteletravel already has a Sabre relationship that could be extended.

**Travelport (Galileo / Apollo / Worldspan)** is the third major GDS — typically only worth integrating if there's a specific advantage in fares or content.

**Duffel** is a newer, developer-friendly API that aggregates direct airline NDC content alongside GDS content. Worth evaluating because the developer experience is notably better than the legacy GDS APIs.

**Kiwi.com Tequila API** is another modern option focused on flight search; less suited for full booking workflows.

**Recommendation:** Start with Amadeus Self-Service for flight search and offer display. Defer actual flight booking to the supplier or to Inteletravel's tooling at MVP; offering live flight search is enough to power self-guided exploration and proposal building without taking on the operational and PCI burden of being the booking party.

### 9.2 Hotels & Resorts

For hotel content, three credible aggregators dominate:

**Hotelbeds (now part of HBX Group)** is the largest B2B hotel wholesaler globally. APIs cover content (hotel descriptions, images, amenities), availability, booking, and post-booking modifications. Especially strong for Caribbean and resort inventory — directly relevant to Story-Tail Adventures' specialty.

**Expedia Rapid (formerly EAN)** offers comparable global inventory with strong North American coverage.

**Booking.com Affiliate / Demand API** is more affiliate-oriented but can be useful for breadth and for revenue from clients who self-book.

**Recommendation:** Hotelbeds for primary inventory (best Caribbean fit). Expedia Rapid as a fallback. Display-only initially, with booking workflows going through the supplier portal or Inteletravel — same logic as flights.

### 9.3 Cruises

Cruise APIs are notoriously fragmented. Options:

**Direct cruise line APIs** (Royal Caribbean, Norwegian, Carnival, MSC, Princess) exist but are typically gated behind agency relationships. Inteletravel's existing relationships are the path here.

**Odysseus Solutions** and **Revelex** are the two main third-party cruise booking engines used by travel advisors. Either provides a unified interface to multiple cruise lines.

**Widgety** offers cruise content (itineraries, ship details, deck plans) without booking — useful for display.

**Recommendation:** For MVP, use Widgety or scraped cruise data for *display* in self-guided search; route booking through Inteletravel's existing cruise tools. Integrate Odysseus or Revelex in Phase 2 if cruise volume justifies the cost.

### 9.4 Tours & Activities

**Viator (a Tripadvisor company)** offers a partner API with global tour and activity inventory, commission-friendly for travel advisors.

**GetYourGuide** has a partner API with similar scope; slightly stronger in Europe.

**Klook** is strong in Asia-Pacific.

**Recommendation:** Viator for MVP — best fit for Caribbean and US destinations and a familiar brand to clients.

### 9.5 Transfers & Car Rental

**Rentalcars.com / Booking.com Cars API** for car rental, **HolidayTaxis** or **Suntransfers** for airport transfers. Deprioritize for MVP — these can be added manually to itineraries initially.

### 9.6 Insurance

**Travel Insured International**, **Allianz Travel**, and **Trawick International** all offer agent partner programs with referral or affiliate links. Initially handle as out-of-band referrals; integrate later if volume justifies.

### 9.7 Inteletravel Commission Data

Inteletravel does not currently publish a public API for commission reports. The pragmatic path is to support CSV import of Inteletravel's commission statements and reconcile against the trips recorded in the platform. Revisit if Inteletravel adds API access.

### 9.8 API Cost Considerations

Most travel APIs operate on one of three commercial models:

(1) **Pay-per-call** — Amadeus Self-Service is in this category; expect roughly $0.001 to $0.05 per API call depending on the call type. At low volume this is inexpensive; at scale it adds up.

(2) **Affiliate / commission share** — Booking.com, Viator, and similar share commission with the integrator; effectively free to use but with revenue impact.

(3) **Negotiated agency contracts** — Hotelbeds and the cruise booking engines typically require an agency contract with minimum production commitments; entry pricing for a small advisor may be inaccessible without going through a host like Inteletravel.

A realistic MVP API budget: $50–$200/month at launch volume, scaling linearly with usage.

---

## 10. Payment Processing & PCI Compliance

This area drives several non-negotiable architectural decisions.

### 10.1 Operating Model

Story-Tail Adventures is *not* the merchant of record on client purchases. We are an advisor; we collect card authorization so we can pay suppliers on the client's behalf. This is a meaningful distinction — it means we are not processing client transactions through our own merchant account, but we *are* storing card data with the intent to use it on third-party supplier portals.

This model is consistent with how Travefy operates today. It puts us in the category of "merchant that handles cardholder data" but not "merchant that processes payments directly," and the PCI scope is correspondingly different.

### 10.2 Recommended Payment Processor

**Stripe** is recommended as the platform's tokenization and card-storage partner. Stripe's PaymentMethod object can store card data in a vault, returning a token reference to our application. We can use Stripe Elements or Stripe Checkout to collect card details so the raw PAN never touches our servers — this dramatically reduces PCI scope (qualifying us for the simpler SAQ A self-assessment in most configurations). Stripe also supports **manual capture / authorization-only** flows, which gives us a useful pattern: place an authorization on the card to verify validity and reserve funds, then release or capture as needed — though for the supplier-pay model we will typically not actually capture through Stripe, but rather use the stored card on the supplier's own payment system.

**Authorize.Net** and **Braintree** are credible alternatives with similar capabilities; Stripe is recommended primarily for developer experience and documentation quality.

### 10.3 PCI Scope & Compliance Posture

By using Stripe Elements (so card data never touches our infrastructure) and storing only Stripe tokens, the platform should qualify for **PCI DSS SAQ A** — the lightest self-assessment questionnaire, intended for merchants who fully outsource cardholder data handling to a validated third party. This is a substantially lower compliance burden than building our own vault.

Even with reduced PCI scope, we need: TLS 1.2+ on all endpoints, strong authentication for agents (MFA required), role-based access controls so only authorized agents can use stored cards, complete audit logging of every card use, secure key management for the Stripe API keys, and regular security reviews. The platform must also be transparent with clients about what cards are stored and when they are used — a notification on every use is both good security practice and a trust signal.

### 10.4 The "Supplier Pay" Workflow

When an advisor needs to pay a supplier on a client's behalf, the workflow has two Stripe-side phases and *two distinct supplier realities* the design must accommodate.

**Phase 1 — Collect and vault the card (SetupIntent).** The client authorizes a card via Stripe Elements (web) or the Stripe Mobile SDK (Android/iOS). The platform creates a Stripe `SetupIntent` with `usage: 'off_session'`, which signals that the card will be used later when the client is not present. Stripe tokenizes the card, attaches it as a `PaymentMethod` to a Stripe `Customer`, and returns only the token plus non-sensitive metadata (brand, last 4, expiration). No charge is ever created on Story-Tail's Stripe account. The client also acknowledges a "mandate" (consent text) describing what the card may be used for — this language lives on the Card Authorization screens (Screen Inventory 2.4.2 and 2.4.3).

**Phase 2 — Use the card on a supplier.** Suppliers fall into two categories:

- **API suppliers.** Some suppliers accept payments via API endpoint — Expedia (Stripe explicitly lists `api.ean.com/v3/itineraries` as a supported destination), Hotelbeds, and some cruise lines via aggregators like Odysseus or Revelex. For these, the platform uses Stripe's **Vault and Forward API**: it creates a `ForwardingRequest` that tells Stripe which PaymentMethod to use, which URL to POST to, and which fields in the request body to populate with card data. Stripe substitutes the card details from its vault as the request goes out. The card never touches our servers. We stay in SAQ A.

- **Portal suppliers.** Most travel suppliers — Sandals' TA Portal, Royal Caribbean's CruisingPower, most all-inclusive resort booking portals — only accept payments through web forms an agent enters by hand. There is no API endpoint to forward to. For these, the workflow is: the agent triggers a brief, audited reveal of the PAN through a controlled API path (with MFA step-up per Section 10.3); the PAN is displayed to the agent for a limited time with a copy-to-clipboard action that auto-clears; the agent enters the card details into the supplier portal; every reveal is recorded as a `CardUseEvent` (see Data Model Section 9.4).

The `Supplier.payment_method_kind` field on the Supplier entity (Data Model Section 8.1) records which category each supplier falls into so the agent UI can pick the right flow automatically.

**Future option — third-party vaults.** Services like Spreedly explicitly target the travel-agency-with-portal-suppliers scenario and offer reveal APIs purpose-built for the workflow. They add a vendor and a per-transaction cost but reduce PCI scope further than Stripe-alone for portal-heavy supplier mixes. The decision on whether to add Spreedly is deferred to Phase 2; MVP uses Stripe-only. See the Tech Recommendations document, Section 4, for the rationale.

**What we will not do.** Build our own card vault. Stripe handles tokenization at $0 cost for our model (no transactions are processed through Stripe). Self-hosting would push the platform from SAQ A to SAQ D — an annual QSA audit ($30K–$100K), HSM infrastructure ($13K–$26K), penetration testing ($10K–$30K), plus 1–2 person-years of engineering. The temptation to "just store the card number ourselves" is real and must be resisted. See Tech Recommendations Section 4 for the full cost comparison.

### 10.5 No Client Billing

Story-Tail Adventures is contractually prohibited (per Inteletravel host agency policy) from charging clients planning, consultation, or service fees. The platform therefore has **no client-facing billing surface**: no invoicing, no charge endpoints, no merchant-of-record flows for advisor services. Stripe is used exclusively for card tokenization and supplier-pay vaulting (Sections 10.1–10.4) — never to capture funds from clients. This is a hard product constraint, not an implementation choice, and it should be reflected in the data model (no Invoice entity for client services), the agent UI (no "charge client" actions), and the audit posture (any code path that would initiate a client-side capture is a defect).

---

## 11. Non-Functional Requirements

**Performance.** Page loads under 2 seconds on average broadband; under 4 seconds on a mid-tier mobile device on LTE. API integration calls cached aggressively to avoid latency penalties on travel API roundtrips.

**Availability.** 99.5% uptime target at MVP (acceptable for a non-mission-critical advisory tool); 99.9% target by Phase 2 once clients are dependent on the platform for live itineraries during travel.

**Scalability.** Designed to comfortably support 1,000 active client accounts and 10 concurrent advisors without architectural change.

**Security.** TLS everywhere; MFA available for clients and required for agents; encryption at rest for all PII; least-privilege role-based access; full audit log of agent actions on client records and stored payment methods; OWASP Top 10 considerations addressed; annual security review; secure software development lifecycle (code review, dependency scanning, secrets management).

**Privacy & Data Protection.** Compliant with US privacy regulations (CCPA where applicable); clear privacy policy; client data export available on request; account deletion process that preserves transaction records as required for tax/business purposes while anonymizing personal data.

**Accessibility.** WCAG 2.1 AA compliance — sufficient color contrast, keyboard navigation, screen reader support, alt text on all images. This matters because clients range widely in age and ability.

**Browser & Device Support.** Latest two major versions of Chrome, Safari, Firefox, Edge. iOS 16+ and Android 11+ for the mobile app.

**Branding.** Strict adherence to the existing brand palette (Sunset Gold #F5A623, Ocean Blue #1565C0, Deep Navy #0D2137, plus the documented secondaries and neutrals) and typography (Poppins as primary). Two logo variants supported (tropical logo for dark backgrounds, book/fox logo for light backgrounds).

---

## 12. Data Model — High-Level Sketch

The core entities and relationships:

**Account** (the auth-level identity) — connects to **User** records which can be of type Client, Agent, or Admin.

**Client** — name, contact info, addresses, preferences, important dates, household relationships. One Client → many Trips, many Cards, many Messages, many Documents.

**Agent** — name, contact info, role, commission split configuration, calendar/availability. One Agent → many Clients (primary owner), many Trips.

**Trip** — name, status (Inquiry → Proposal → Booked → In Progress → Completed → Cancelled), travelers, start/end dates, destination(s), trip type, agent owner, total value, commission. One Trip → many TripComponents, many Payments, many Messages, many Documents, many Notes.

**TripComponent** — type (Flight, Hotel, Cruise, Transfer, Excursion, Insurance, Other), supplier, confirmation number, dates, cost, commission rate, source (manual entry vs. API origin), API reference. One Trip → many TripComponents.

**Itinerary** — derived view of the Trip with day-by-day breakdown; either auto-generated from TripComponents or manually authored by the agent.

**PaymentCard** — tokenized payment method (Stripe PaymentMethod ID), last 4 digits, brand, expiration, owning Client, status (Active / Revoked / Expired). Authorization to use a card for a specific trip lives on a separate CardAuthorization entity with its own spending limit and expiry.

**CardAuthorization** — links a PaymentCard to a Trip with a spending limit and expiration, capturing the client's consent. The agent cannot use a card for a trip without an active authorization.

**CardUseEvent** — record of every time a card was used to pay a supplier: which Agent, which Trip, which Supplier, amount, timestamp, justification, notes. Append-only for audit.

**Commission** — expected, invoiced, and received commission per Trip: gross booking value, commission rate, supplier, payment terms, status, reconciliation reference to Inteletravel report.

**Lead** — qualified inquiry from self-guided search: destination, dates, budget, traveler count, source search criteria, status (New / Contacted / Qualified / Converted to Trip / Lost).

**Message** — inbound/outbound communication, threaded by Trip or by Client; channel (in-app, email, eventually SMS).

**Document** — any file attached to a Client or Trip: passport, visa, insurance certificate, supplier confirmation, post-trip photo.

**AuditEvent** — append-only log of significant actions, especially around stored cards, agent administrative actions, and authentication events.

---

## 13. MVP Phasing

Phasing is a strategy concern, not a hard scope statement — this is how we'd sequence the build if we're optimizing for fastest exit from Travefy.

### 13.1 Phase 1 — MVP (Travefy Replacement)

Authentication (client and agent); client management; trip builder with manual component entry; itinerary viewer (web and mobile); payment authorization with Stripe (tokenization, storage, audit); agent worklist and dashboard; basic commission tracking; templated email communications; agent administrative tools (password reset, account merge); web app + mobile app feature parity for client-facing core; brand-faithful styling.

Goal: cancel Travefy.

### 13.2 Phase 2 — Self-Guided Search & API Integrations

Integrate Amadeus (flights), Hotelbeds (hotels), Viator (tours) for self-guided search and lead generation; lead workflow for the agent; advanced commission reporting with Inteletravel reconciliation; cruise content display (Widgety); deeper itinerary auto-generation from API-sourced components.

Goal: start generating leads from the platform itself.

### 13.3 Phase 3 — Booking Workflows, Multi-Agent & Group Trip Coordination

API-driven booking workflows (where commercial terms allow); multi-agent platform support (additional advisors); **Group Trip Coordination** (multi-client shared itineraries, co-traveler invitations, group chat — distinct from the trip type `group` available at MVP, see Section 7.3); enhanced reporting and analytics; SMS and WhatsApp messaging channels; mobile app offline UI (the SqlDelight cache architecture is built in Phase 1, but the offline-specific screens and indicators ship in Phase 3); integration with virtual card services for safer supplier payments.

Goal: scale the platform to support a small team of advisors and increase per-trip efficiency.

### 13.4 Phase 4+ — Future

AI-assisted trip planning, broader social/community features (forums, public reviews), loyalty program, deeper supplier integrations (direct cruise line APIs as agency relationships mature), expanded insurance integration, marketplace for advisor-curated trip ideas.

---

## 14. Rough Effort & Timeline Estimates

These are directional ranges assuming a small experienced product team (1 product lead, 2–3 engineers, 1 designer, working roughly part-time / nights-and-weekends or part-time consulting). Adjust dramatically based on actual team size and dedication.

**Phase 1 (MVP):** 4–7 months. The biggest risks are the payment authorization workflow (because PCI considerations and supplier-pay flow design require care) and reaching real feature parity with Travefy (it does more than it appears to at first glance).

**Phase 2 (Self-Guided Search):** 3–5 months following Phase 1. API integrations are individually straightforward but collectively time-consuming, and tuning search relevance for the trip types Story-Tail specializes in takes real iteration.

**Phase 3 (Booking & Multi-Agent):** 4–6 months. Booking workflows are deceptively complex because of supplier-side variability.

**Total to "fully featured, multi-advisor platform":** 12–18 months end-to-end. MVP launch realistically 4–7 months from project start.

---

## 15. Tech Stack & Cost Considerations

These are recommendations, not requirements — they should be validated by whatever development team builds the platform.

### 15.1 Stack — Kotlin Multiplatform

The platform will be built on **Kotlin Multiplatform (KMP)**. This is a deliberate architectural choice that lets us share business logic, data models, networking code, and validation rules across the web app, the iOS app, and the Android app, with platform-specific UI layers where it makes sense. The benefit is one team, one language, one source of truth for domain logic — critical when an independent advisor's business cannot sustain three parallel client codebases drifting apart.

**Shared module (Kotlin Multiplatform — mobile only):** Domain models (Client, Trip, Itinerary, Card, Commission, etc.), client-side validation rules, API clients that call the backend, and persistence helpers for SqlDelight local caching. Compiles to JVM (for Android) and to native (for iOS). The shared module is the source of truth for type-safe mobile code; it does **not** ship to the backend or the web. Domain types are mirrored to TypeScript via OpenAPI codegen for the web and backend (see below).

**Mobile UI — Compose Multiplatform:** Shared declarative UI across Android and iOS using Compose Multiplatform. Where iOS needs a more platform-native feel (navigation, system pickers, payment sheets), use SwiftUI interop via the iOS-specific source set. Android UI is pure Jetpack Compose. This gives us a single design system implementation that runs on both mobile platforms.

**Web UI — Next.js + React + TypeScript.** The entire web surface — authenticated client portal, agent workspace, and public marketing-adjacent pages — is built on Next.js with React and TypeScript. Why:

- SEO is critical for the Phase 2 self-guided search lead-generation surface (public landing, public search, property/cruise/tour detail). Next.js ships SSR/SSG natively.
- The React + TypeScript ecosystem is the most mature, deeply tooled, and easily-hireable web stack as of 2026.
- Authenticated portal and public pages share components and hosting, simplifying ops.
- Compose Multiplatform for Web (Kotlin/Wasm) was considered. As of 2026 it is in Beta with real production use cases but is not yet at parity with Compose for Android and iOS. SEO via Wasm is harder than SEO via Next.js SSR, the hiring market for Compose-for-Web developers is thin, and the API may still change. The decision is to use the stable, ecosystem-rich React stack for the web surface and revisit only if a clear migration payoff emerges in a future phase.

**Web ↔ KMP integration.** The React app does **not** compile or import the KMP shared module. The React app is a pure TypeScript application that talks to the Ktor backend over REST/JSON. TypeScript types for the API contract are generated from the Kotlin domain types via OpenAPI codegen (or equivalent — `kotlinx.serialization` JSON Schema export, then `quicktype` or similar to TypeScript). This keeps the React side in its native ecosystem while preserving a single source of truth for domain types in the KMP shared module. The mobile apps (Android, iOS) still consume the KMP shared module directly; the backend (JVM target) does as well.

**Backend — Supabase Edge Functions (Deno + TypeScript):** The application backend is **not** a separate Kotlin service. Server-side business logic runs in Supabase Edge Functions — Deno-based TypeScript serverless functions that live alongside the Supabase project. Edge Functions handle: Stripe API calls (SetupIntent, Vault and Forward, PaymentMethod retrieval), travel API integrations (Amadeus, Hotelbeds, Viator, Widgety), webhook handling, complex business logic, and audit middleware. They share TypeScript types with the Next.js web app via a monorepo arrangement, so the API contract is type-safe end-to-end on the web side.

For the mobile clients, Edge Functions expose a REST API. Mobile consumes that API via clients defined in the KMP shared module. Domain types on the mobile side are Kotlin; on the web/backend side they're TypeScript. Both are generated from a single OpenAPI spec (or kotlinx.serialization JSON schema) to keep them in lockstep.

**Database:** PostgreSQL via Supabase. Mobile uses SqlDelight in the shared module for offline cache. Server-side, Supabase exposes the database via PostgREST (auto-generated REST API), via direct SQL from Edge Functions, and via the Supabase JS SDK. Migrations are managed via the Supabase CLI (`supabase db push`, `supabase migration new`) instead of Flyway.

**Caching:** Redis for backend-side caching of travel API responses (TTLs tuned per API — flight search results expire in minutes, hotel content can be cached for hours/days).

**Authentication — Supabase Auth.** Supabase Auth handles signup, signin, password reset, magic links, MFA (TOTP and SMS), and social providers (Google, Apple). The web app uses `@supabase/supabase-js` to obtain a session JWT directly from Supabase. Mobile apps consume Supabase Auth either via the official Kotlin SDK or via REST. Edge Functions verify the JWT on every authenticated call. Auth0 or Clerk remain a fallback if Supabase Auth's MFA story proves insufficient for the agent-required-MFA flow.

**Payments — Stripe:** Stripe has first-class SDKs for Android (Kotlin), iOS (Swift, callable from KMP via expect/actual), and JavaScript for the web. Server-side calls (SetupIntent, Vault and Forward, PaymentMethod retrieval) happen in Supabase Edge Functions using Stripe's Node.js/Deno SDK. The expect/actual pattern in the mobile shared module describes "take a card and tokenize it" abstractly while each platform implements it with the native Stripe SDK. See Section 10 for the full payment design.

**File Storage:** S3 (or compatible — Cloudflare R2 is a strong cheaper alternative) for documents and uploaded images. Signed URLs for client access. Backend uses the AWS SDK from Ktor.

**Email:** Postmark or Resend for transactional email — both have straightforward REST APIs callable from Ktor. Mailchimp or ConvertKit for marketing campaigns (separately, not embedded in the platform).

**Observability:** Sentry has first-class Kotlin and Android SDKs and works for backend and mobile. Structured logging via Kotlin Logging on the backend. Basic uptime monitor (UptimeRobot or BetterStack) from day one.

**Build & Deploy:** A monorepo (e.g., Turborepo or Nx) containing four sub-projects:

- `mobile/` — Gradle multi-module KMP setup with `shared`, `androidApp`, `iosApp`
- `web/` — Next.js + React + TypeScript
- `supabase/` — Supabase project with migrations (`supabase/migrations/`) and Edge Functions (`supabase/functions/`)
- `contracts/` — Shared API contract: OpenAPI spec plus generated TypeScript types and (optionally) Kotlin types for the mobile module

CI/CD via GitHub Actions. Web deploys to Vercel. Mobile apps go through Apple App Store and Google Play. Supabase Edge Functions deploy via `supabase functions deploy`. The Supabase database migrates via `supabase db push`. No separate backend host (no Fly.io, no Cloud Run, no AWS App Runner).

**Why KMP for this specific business.** The advisor business has fundamentally one set of rules — what a trip is, what statuses it can be in, how commission is calculated, when a card can be used — and three places those rules need to be enforced (web, iOS, Android). Without code sharing, those three implementations drift, bugs creep in, and feature parity becomes a perpetual cost. KMP turns "three apps" into "one app with three faces" and is exactly the right shape for the long-term maintenance pattern of this product.

**Considerations & risks of KMP.** Hiring market is thinner than React Native or Next.js — Kotlin developers are common, but specifically Kotlin Multiplatform / Compose Multiplatform experience is rarer. The iOS toolchain story has improved a lot but still has more rough edges than native Swift. Compose Multiplatform for Web/Wasm is the newest area and may need workarounds at MVP timeframe. None of these are blocking — they are budgeted-in cost-of-doing-business — but they should inform contractor selection.

**Alternative — Salesforce Platform (considered, declined).** Given Gyasi's background as a Salesforce team lead, Salesforce Experience Cloud was considered as a build platform. Pros: built-in CRM, identity, sharing model, Apex for business logic. Cons: per-user licensing cost on the client portal side becomes prohibitive at consumer scale; mobile experience is less native-feeling; less flexibility for the consumer-facing self-guided search UX; and code sharing across platforms is not Salesforce's strength. Recommendation: do *not* build on Salesforce for this — the audience (consumers) and the access pattern (frequent, casual, mobile-first) are a poor fit for Salesforce's per-seat economics. KMP is the better strategic fit.

### 15.2 Ongoing Cost Considerations

Indicative monthly cost at MVP launch volume (a few hundred clients, low API usage):

- Supabase (Postgres + Auth + Storage + Realtime + Edge Functions): $0/month on the free tier through MVP; Pro tier is $25/month if/when needed
- Vercel (Next.js web hosting): $0/month on the free tier; Pro is $20/month if needed
- Stripe: $0/month — tokenization and vaulting only; no client-facing transactions are processed
- Travel APIs: $50–$200/month at MVP volume (mostly Amadeus pay-per-call), scaling with usage
- Email (Postmark/Resend): $15/month or free tier (depending on volume)
- Observability (Sentry): $0/month on free tier (5K events/month covers MVP)
- Apple Developer + Google Play: $99/year + $25 one-time
- Domain and SSL: negligible (covered by Vercel + DNS provider)

**Total MVP run-rate: roughly $50–$250/month** at the early stages, scaling up only when traffic justifies. No separate backend hosting because the backend lives inside Supabase Edge Functions.

For comparison: Travefy currently costs roughly $40–$120/month per advisor depending on tier; Travel Joy similar. The custom platform's cost crossover happens once it supports multiple agents or generates meaningful self-guided-search lead flow.

### 15.3 Build Cost (One-Time)

If outsourced to an experienced agency: roughly $80,000–$200,000 for MVP, depending on agency rate and how tightly scoped. Done with a single experienced full-stack contractor and Gyasi's direct involvement: roughly $40,000–$100,000. Done as a long nights-and-weekends project with consulting help on specific items (PCI design, mobile builds): potentially much less in cash but much more in calendar time.

---

## 16. Risks & Open Questions

**Inteletravel API access.** Whether Inteletravel offers any API access for commission data, booking handoff, or supplier connectivity will materially change the design. This needs to be confirmed early.

**PCI scope creep.** The supplier-pay model is unusual and the easy-but-wrong implementation choices (storing raw card numbers, building our own vault) carry massive compliance burden. This area needs an explicit design review before code is written.

**API commercial access.** Hotelbeds, cruise APIs, and similar may not be commercially accessible to a single-advisor business at launch volumes. Inteletravel's existing relationships may be the bridge — or may not be. Need confirmation.

**Mobile app store approval.** Apple in particular scrutinizes apps that handle payment information; app review may impose additional requirements.

**Scope discipline.** Travefy and Travel Joy each support features we'll be tempted to recreate. Some are essential (itinerary builder, payment auth); some are not (every email template, every report variant). Phase 1 must say no to a lot.

**Talent.** Building this requires either a multi-person team, an experienced contractor, or substantial time investment from Gyasi personally. The biggest delivery risk is people, not technology.

---

## 17. Approval

This document is the starting point, not the contract. The next step is to socialize it with any potential development partner(s), validate the assumptions (especially around Inteletravel API access and PCI design), and refine into a project plan with concrete milestones, budget, and team.

| Role | Name | Approval | Date |
|------|------|----------|------|
| Business Owner | Gyasi Story | | |
| Product Lead | _TBD_ | | |
| Engineering Lead | _TBD_ | | |

---

*Story-Tail Adventures — Making Travel an Adventure*
