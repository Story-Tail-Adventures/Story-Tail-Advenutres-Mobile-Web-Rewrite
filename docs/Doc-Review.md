# Document Consistency Review
## Story-Tail Adventures — BRD, Screen Inventory, Data Model

**Date:** May 14, 2026
**Reviewer:** Internal review
**Documents reviewed:**
- docs/BRD.md (v1.0)
- docs/Screen-Inventory.md (v1.0)
- docs/Data-Model.md (v1.0)

---

## ✅ Resolution Status — May 14, 2026 (Pass 1 + Pass 2)

**Pass 1 (May 14):** All ten findings (M1–M4 and m5–m10) from the initial cross-document review have been applied. The BRD, Screen Inventory, and Data Model were regenerated with the changes described below.

**Pass 2 (May 14, later):** A second sweep after the addition of the Design System and Tech Recommendations documents — plus the deep conversation on Stripe Vault and Forward, Spreedly, and self-hosted vaults — surfaced five additional gaps. All five have been applied. The detailed findings are listed in section "## Pass 2 Findings (Applied)" near the bottom of this document.

This review document is retained as a historical record of the review passes.

Highlights of what changed:

- **BRD Section 7.3:** Added disambiguation between `trip_type = 'group'` (P1) and Group Trip Coordination (P3); flagged API trip-builder enhancements as P2.
- **BRD Section 13.3/13.4:** Moved Group Trip Coordination from Phase 4 to Phase 3; renamed Phase 3 to include it; replaced "mobile app offline mode" with "mobile app offline UI" and clarified the cache architecture is MVP.
- **BRD Section 7.8 & 12:** Removed internal "client-communications skill" reference; renamed `Card` to `PaymentCard`; added `CardAuthorization` to the data sketch.
- **Screen Inventory 2.0, 2.3, 2.7, 2.8, 3.4, 3.8:** Phase preambles added; Group Trip Coordination retitled "(Phase 3)" with disambiguation paragraph; trip-builder API search tabs flagged Phase 2.
- **Screen Inventory 2.1.6:** MFA setup entry-point phrasing clarified.
- **Screen Inventory 3.1.9:** Removed "client-communications skill" reference.
- **Screen Inventory Section 4.2 & 4.5:** Fixed tablet PWA wording — tablet uses the native Android tablet app, not a PWA.
- **Data Model Section 8.2:** Added explicit disambiguation note for `trip_type = 'group'` vs Group Trip Coordination.
- **Data Model Section 21.5:** Clarified that the offline cache *architecture* is MVP while the offline *UI* is Phase 3.

---

## Summary

The three documents are broadly consistent on the load-bearing decisions: business model (commission-only, no client billing), tech stack (KMP + Compose Multiplatform + Ktor + Postgres + Stripe), PCI posture (SAQ A target, no PAN storage), authentication model (MFA optional for clients, required for agents), Inteletravel relationship (CSV import — no public API), and travel-API recommendations (Amadeus / Hotelbeds / Viator / Widgety).

That said, the review surfaced **four meaningful conflicts** that should be reconciled before the documents go in front of a development partner, plus **six minor inconsistencies and clarifications** worth tightening. None of the issues invalidate the underlying design; most are phasing or terminology drift introduced as scope expanded across iterations.

The full findings are below, sorted by severity.

---

## Major Conflicts

### M1 — Group trip coordination phase: BRD says Phase 4+, others say Phase 3

**BRD (Section 13.4 — Phase 4+):** Lists "social/community features (group trip coordination, shared itineraries)" as Phase 4 / future.

**Screen Inventory (Section 2.8):** Group Trip Coordination is "scoped for Phase 3+."

**Data Model (Section 16):** `TripGroup` and `GroupMember` entities are marked **P3**.

**Why it matters:** A potential dev partner reading the BRD's timeline will plan group coordination as Phase 4 work; reading the data model or screen inventory, they'll plan it as Phase 3. The phase markers should agree.

**Complicating factor:** The BRD's Trip Builder (Section 7.3) includes `group` as a valid trip type in MVP. There are *two* features being confused here:

1. **Single-trip "group" type** — one client, agent records the trip as a group event (e.g., "Smith Family Reunion"). MVP. Covered by `Trip.trip_type = 'group'` in the data model.
2. **Group Trip Coordination** — multiple clients with their own accounts, shared itinerary, co-traveler invitations, group chat. Phase 3 per Screen Inventory and Data Model.

**Proposed resolution:** Move the BRD's Phase 4 wording into Phase 3. Add a one-paragraph note to the BRD distinguishing the two features. Reconcile so all three docs read "Group Trip Coordination — Phase 3."

---

### M2 — Travel API integration in agent trip builder: BRD says manual entry at MVP, Screen Inventory has API search built in

**BRD (Section 13.1 — Phase 1 MVP):** "Trip builder with manual component entry."
**BRD (Section 13.2 — Phase 2):** Travel API integrations (Amadeus, Hotelbeds, Viator).

**Screen Inventory (Sections 3.4.5–3.4.8):**
- 3.4.5 Add Trip Component — Flight: "Add a flight via Amadeus search or manual entry"
- 3.4.6 Add Trip Component — Hotel: "Hotelbeds search or manual entry"
- 3.4.7 Add Trip Component — Cruise: "Widgety display + manual booking detail **at MVP**"
- 3.4.8 Add Trip Component — Excursion: "Viator or manual entry"

**Data Model (Section 8.3):** `TripComponent` has `api_source` and `api_reference` fields in Phase 1.

**Why it matters:** The Screen Inventory implies the agent gets API-powered component pickers at MVP. The BRD says Phase 1 trip builder is manual-only and APIs come in Phase 2. A developer reading the Screen Inventory will scope API integration for MVP; reading the BRD they will not. This is the largest scope-affecting conflict.

**Proposed resolution (recommended):** Update the Screen Inventory to flag the API search tabs on screens 3.4.5–3.4.8 as Phase 2 enhancements. The screens still exist at MVP but the "Search" tab is greyed/disabled and the "Manual" tab is the only working entry method until Phase 2. This preserves the document's role as a comprehensive screen inventory while honoring the BRD's MVP scope.

**Alternative resolution:** Update the BRD to advance Amadeus and Hotelbeds search-only (display, not booking) into Phase 1 for agent trip building. This is plausible because read-only API search is much less complex than booking integration. But it expands MVP scope.

---

### M3 — Mobile offline mode phase: BRD says Phase 3, Screen Inventory and Data Model imply MVP

**BRD (Section 13.3 — Phase 3):** Explicitly lists "mobile app offline mode" as a Phase 3 deliverable.

**Screen Inventory (Section 2.7.1):** Offline Itinerary View described as a "Mobile-Specific Screen" without a phase marker, implying MVP availability. Section 4.5 lists Offline Itinerary as "Full" on mobile/tablet, suggesting it's built in.

**Data Model (Section 21.5):** "SqlDelight is used in the shared module's mobile target to cache the client-facing data (Trip, Itinerary, Conversation, PaymentCard metadata) for offline use." Described as part of the MVP architecture.

**Why it matters:** Offline support is engineering-heavy. Building the local cache (SqlDelight integration, sync logic, conflict resolution) from day one is meaningfully more work than adding it later. If MVP is built without it, retrofitting later is also non-trivial.

**Proposed resolution:** Decide which way to go. A reasonable compromise: design the **caching architecture** in Phase 1 (SqlDelight schema, the data layer's offline-aware abstractions) but ship the **offline UI** in Phase 3 (the Offline Itinerary View, the offline indicators, the "Last synced" timestamps). The data model already implies the architecture is MVP-bound; clarify that the screen-level features ship in Phase 3. Update BRD Section 13.3 to say "mobile app offline UI" and update Screen Inventory 2.7.1 with a Phase 3 marker.

---

### M4 — Self-Guided Search timing not flagged in Screen Inventory

**BRD (Section 13.2 — Phase 2):** Self-Guided Search and lead generation are Phase 2.

**Screen Inventory:** Sections 2.0 (Public / Pre-Auth Surface), 2.3 (Self-Guided Search), and 3.8 (Leads) describe these screens without phase markers, which reads as MVP-included.

**Data Model:** `Lead`, `LeadSource`, `SavedSearch`, and `Favorite` are explicitly P2.

**Why it matters:** Roughly 17 screens (the entire Section 2.0, all of Section 2.3, and Section 3.8) are described as if they're MVP. A reader takes them as in-scope unless they cross-reference with the BRD or Data Model. The Section 2.0 prelude *does* reference the BRD on the marketing-site decision, but it doesn't carry forward the Phase 2 phasing.

**Proposed resolution:** Add a short phase preamble at the top of Sections 2.0, 2.3, and 3.8 of the Screen Inventory: "These screens are scoped for Phase 2 (self-guided search & API integrations) per BRD Section 13.2." Optionally add per-screen phase markers like the Data Model uses.

---

## Minor Inconsistencies & Clarifications

### m5 — "Group" trip type vs. Group Trip Coordination is not disambiguated

Closely related to M1. Even with the phase fix, the documents should explicitly say what `Trip.trip_type = 'group'` (P1) is *not* — i.e., it is not the multi-client coordination feature (P3). One sentence in the BRD's Trip Builder section, the Data Model's Trip section, and the Screen Inventory's Group Trip Coordination preamble would prevent confusion.

### m6 — Quote Request flow (Screen Inventory 2.3.8 → 2.3.9) creates a Lead, which is P2

The Screen Inventory describes Quote Request Form and Confirmation as if they are normal user flows. The Lead entity they create is P2 in the Data Model. Resolution is the same as M4 — flag the phase at the section level.

### m7 — Entity naming: "Card" vs "PaymentCard"

The BRD's high-level data sketch (Section 12) calls the entity "Card." The Data Model uses "PaymentCard." The Screen Inventory uses both. Cosmetic, but easy to fix: update BRD Section 12 to say "PaymentCard."

### m8 — Screen Inventory 3.1.9 leaks an internal "client-communications skill" reference

Screen Inventory section 3.1.9 (Email Signature Setup) references "the client-communications skill" as a source of the default signature. This is a reference to an internal Claude skill file in the user's workspace and shouldn't appear in a deliverable that may go to a development partner. Replace with the actual signature template inline or reference "Story-Tail Adventures email signature standard."

### m9 — Tablet variant introduces a PWA delivery mechanism not in the BRD

Screen Inventory Section 4.5 includes "Full (PWA)" for tablet offline support on the Offline Itinerary row. The BRD doesn't position the tablet experience as a PWA (it positions the platform as web + iOS + Android). If tablet PWA install is intended, the BRD should mention it under Browser & Device Support (Section 11). If it isn't intended, change "Full (PWA)" to reflect what the tablet experience actually does for offline (probably "Full when accessed via the Android tablet app; web tablet uses standard browser caching").

### m10 — Screen Inventory 2.1.6 entry-point phrasing

The MFA Setup entry points list "first login post-launch (optional)" which is cryptic — it means "we may prompt MFA at first login after MVP launches." Either rephrase clearly ("Optional prompt at any login session in MVP") or remove the entry point — Security Settings access is sufficient.

---

## Non-Conflicts (Verified Consistent)

These were checked and are consistent across all three documents:

- **No client billing / no planning fees** — BRD 10.5, Screen Inventory 2.0.2 FAQ, Data Model (no Invoice entity).
- **Story-Tail not merchant of record** — consistently stated in BRD 10.1 and Data Model 18.1.
- **PCI scope: SAQ A target, no PAN stored** — BRD 10.3, Data Model 18.1.
- **Stripe as tokenization vendor** — BRD 10.2, Data Model 9.1 + 21.4.
- **MFA: optional for clients, required for agents** — BRD 6.1 + 11, Screen Inventory 2.1.6 / 3.1.6, Data Model 5.1 (`mfa_required` defaults false, true for agents).
- **Inteletravel: no public API, CSV import** — BRD 9.7 + 16, Screen Inventory 3.7.5, Data Model 10.2.
- **Tech stack: Kotlin Multiplatform + Compose Multiplatform + Ktor + Postgres + Stripe** — BRD 15, Data Model 21 + 22.
- **Trip status enum: Inquiry → Proposal → Booked → In Progress → Completed → Cancelled** — BRD 12, Data Model 8.2, Screen Inventory 3.2.2 (Pipeline columns).
- **Multi-agent platform support as Phase 3** — BRD 13.3, Screen Inventory 3.1 preamble, Data Model `AgentInvitation` P3.
- **Card reveal audit + MFA step-up** — BRD 10.3 + 10.4, Screen Inventory 3.6.4, Data Model 18.4.
- **App subdomain at app.story-tail.com vs marketing site at adventures.story-tail.com** — BRD 4.2, Screen Inventory 2.0 preamble.
- **Travel API recommendations (Amadeus, Hotelbeds, Viator, Widgety)** — BRD Section 9, Screen Inventory components, Data Model `TripComponent.api_source` enum.
- **Brand palette (Sunset Gold #F5A623, Ocean Blue #1565C0, Deep Navy #0D2137)** — BRD 11, Screen Inventory color references in Section 4.

---

## Recommended Actions

Listed in priority order. Each is a small, surgical edit — no major rewrites needed.

1. **(M1)** Move "group trip coordination" from BRD Phase 4 to Phase 3. Add a single sentence to BRD Trip Builder section distinguishing trip-type `group` from Group Trip Coordination.
2. **(M2)** Add a phase note to Screen Inventory sections 3.4.5–3.4.8: the API search tabs are Phase 2; manual entry is the MVP path.
3. **(M3)** Add a phase note to Screen Inventory 2.7.1 (Offline Itinerary): Phase 3. Add a note to Data Model 21.5 distinguishing offline cache architecture (MVP) from offline UI (Phase 3).
4. **(M4)** Add Phase 2 preambles to Screen Inventory sections 2.0, 2.3, and 3.8. Consider adding per-screen phase markers.
5. **(m5–m10)** Minor wording edits as described above.

Total expected edits: roughly 15 surgical changes across the three documents. None require regenerating large sections.

---

## Pass 2 Findings (Applied)

The second sweep focused on whether the deeper payment-workflow discoveries from later in the conversation made it into the documents that depend on them.

### P2-1 — BRD §10.4 was hand-wavy on the supplier-pay workflow ✅ Applied

The original Section 10.4 described the supplier-pay workflow generically ("the advisor can retrieve the card details for legitimate use through a controlled mechanism"). It didn't name Stripe SetupIntent, Stripe Vault and Forward, or the critical API-supplier vs portal-supplier distinction.

**Fix:** Section 10.4 was rewritten to explicitly describe the two-phase workflow (SetupIntent for collection, Vault and Forward + Reveal for use), the two supplier categories, and the future Spreedly option. The section now points to Data Model §8.1 for the `Supplier.payment_method_kind` field and Tech Recommendations §4 for the full rationale.

### P2-2 — Data Model `Supplier` entity didn't track payment method type ✅ Applied

A `Supplier` row could be marked as Sandals or Royal Caribbean, but the data model didn't capture *how that supplier accepts payments*. Without this, the agent UI couldn't pick between the API-forward path and the portal-reveal path automatically.

**Fix:** Added `payment_method_kind` (`api` / `portal` / `unknown`), `payment_api_endpoint`, and `payment_portal_url` fields to Supplier (§8.1). Added the `supplier_payment_kind` enum to §17. This wires the data model to the new BRD §10.4 workflow.

### P2-3 — Agent entity was missing `pronouns` ✅ Applied

Screen 3.1.7 (Agent Profile Setup) lists pronouns as a profile field. The Data Model Agent entity didn't have it.

**Fix:** Added `pronouns` text field (nullable, PII-Public) to Agent (§7.1).

### P2-4 — Tech Recommendations had no Spreedly mention or self-hosted-vault rationale ✅ Applied

The Tech Recommendations §4 covered PCI compliance generally but didn't address:
- The Vault and Forward API specifically
- The two supplier realities (API vs portal)
- When Spreedly becomes worth adding
- Why building our own vault is a bad idea (despite intuitive appeal)

**Fix:** Expanded §4 with three new subsections — 4.7 (Two Supplier Realities), 4.8 (Spreedly: When to Add a Second Vault), 4.9 (Why Not Build Our Own Vault, including the $60K–$180K/year self-hosted cost comparison). §4.10 is the consolidated PCI vendor stack.

### P2-5 — Tech Recommendations open questions missed the supplier payment-method survey ✅ Applied

The supplier classification work (which suppliers are API vs portal) is the single biggest input to the Spreedly decision and hadn't been flagged as a near-term task.

**Fix:** Added an "Supplier payment-method survey" open question to §7 with specific suppliers to classify.

---

## Items NOT Applied (Deferred for User Decision)

These items came up but require business decisions before they can land in the documents:

- **Commit to Spreedly from day one vs at Phase 2.** The documents now describe both paths neutrally. The Tech Recommendations §4.8 recommends Stripe-only at MVP with a Spreedly migration in Phase 2 — but if the user prefers to start with Spreedly, that's a one-paragraph swap.
- **Auth0 vs Supabase Auth final decision.** Tech Recommendations §3.3 recommends Supabase Auth but flags the MFA-for-agents requirement as a validation point. Confirm with a small spike before MVP.

---

## Closing Note (Updated)

The five core documents now form a coherent, cross-referenced design package: BRD + Screen Inventory + Data Model + Design System + Tech Recommendations. Phase markers, entity names, payment-workflow language, and PCI claims are consistent across all five.

The package is now sufficient to put in front of a development partner. The remaining open questions are business-side decisions (Spreedly timing, supplier classification, Inteletravel API discovery), not documentation gaps.

---

*Story-Tail Adventures — Making Travel an Adventure*
