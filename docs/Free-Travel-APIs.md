# Free & Low-Cost Travel APIs — Integration Reference
## Story-Tail Adventures — Cruise, Hotels, Deals

**Document Owner:** Gyasi Story
**Audience:** Internal — whoever wires up the Phase 2 search and public-deals surface
**Version:** 1.2
**Date:** September 3, 2026
**Status:** Research. **No account in this document has been created and no key has been provisioned.** This is the shopping list, not the receipt.
**Phase:** P2 (self-guided search and lead generation)
**Companion Documents:** `BRD.md` §9 (Travel API Integration Options) and §10.5, `Tech-Recommendations.md` §3, `Screen-Inventory.md` §2.0.3–2.0.5 and §2.3, `Data-Model.md` (TripComponent `source` / `api_reference`)
**Governing external document:** *InteleTravel Training Manual, eighth edition* (US) — §16 Marketing Code of Conduct, §5 Booking Travel, §7 Advisor Website. Not in this repo (third-party material); quoted in §1.3 below. **The binding document is the Independent Contractor Agreement, which the manual repeatedly defers to and which has not been reviewed here.**

---

## 1. How to read this document

`BRD.md` §9 already surveys the *commercial* travel API landscape and lands on Amadeus / Hotelbeds / Viator / Widgety. That survey is still correct and this document does not replace it.

This document is the **free slice** of that landscape: what can be signed up for today with no contract, no minimum production commitment, and no invoice — so the plumbing can be built, tested, and demoed before any money or agency relationship is committed.

### 1.0 The product this is for — confirmed scope

Everything in this document follows from a single decision, confirmed by Gyasi:

> **The public search surface is for discovery, not transaction.** A visitor finds a destination, a resort, or a sailing, picks their dates, and requests a quote. The advisor prices and books it. Nothing on the site quotes a live price or takes a booking.

Concretely, per destination type:

| | What the API must supply | What it must *not* supply |
| --- | --- | --- |
| **Hotels & resorts** | **Location.** Plus images, description, and rating. | No availability. No rates. No booking. Dates are captured on the quote request, not sent to any API. |
| **Cruises** | **Cruise line, ship, itinerary** (ports and sailing dates). Price **optional**. | No cabin availability. No booking. |
| **Tours & activities** | Description, images, location. | No availability. No booking. |

**This is a much smaller ask than the industry sells against, and it is the reason the free tiers are not merely adequate but abundant.** Availability and pricing are the expensive, contract-gated, contentious parts of every travel API — they are the reason Hotelbeds wants a certification, the reason cruise data costs money, and the reason §1.3.4's net-rate prohibition was a problem. **Story-Tail needs none of it.**

Three consequences run through the rest of this document:

1. **The net-rate compliance problem largely evaporates.** If no rate is ever fetched, no rate can be accepted. §3.8 stays as a guardrail rather than a blocker.
2. **Content is static, so it gets *synced*, not proxied.** A hotel's photos and description do not change between page views. Pull them once, store them in Postgres, refresh on a schedule. See §10.1 — this is the single most important architectural consequence, and it changes the quota math from *per visitor* to *per property per refresh*.
3. **The provider shortlist changes.** Rate-bearing endpoints drop out; content endpoints and ratings sources move to the front.

### 1.1 Four kinds of "free"

Vendors use the word loosely. Every entry below is tagged with one of these:

| Tier | What it means | What it costs later |
| --- | --- | --- |
| **A — Open data** | Public-domain or openly licensed datasets. No key or a free key, no commercial restriction beyond attribution. | Nothing. Safe forever. Check the licence for attribution and share-alike terms. |
| **B — Free tier** | Real production access up to a monthly quota, then metered per call. Card sometimes required up front. | Predictable per-call pricing. Budget caps usually available. |
| **C — Free sandbox** | Full API surface against test data. Free forever for development. Production needs a contract, certification, or both. | Unknown until you negotiate. This is the tier most likely to surprise you. |
| **D — Free to call, paid by commission** | No fee at all. The provider earns on bookings; you earn a revenue share. | No cash cost. **But see §1.3 — there is a business-model question here.** |

### 1.2 The constraint that eliminates most "free" hotel APIs

**This is the load-bearing paragraph of the document.** Read it before signing up for anything.

Most modern hotel APIs — LiteAPI, Duffel, RateHawk and their peers — are free *because* their revenue model assumes **you take the booking and you take the payment**. Their free tier is a customer-acquisition cost, recovered on the transaction.

That model makes Story-Tail Adventures the merchant of record, which collides with three separate rules the project already holds:

1. **`BRD.md` §10.5 — no client-facing billing.** Per the Inteletravel host agency agreement, Story-Tail Adventures does not charge clients. There is no invoice entity, no "charge client" action, no merchant-of-record posture on any transaction.
2. **PCI scope.** `Tech-Recommendations.md` §4 keeps the platform in SAQ A by never touching cardholder data. Taking a booking payment through a third-party hotel API blows that scope open.
3. **The advisory model itself.** `BRD.md` §5 is explicit: clients cannot book directly through the platform. Every search converts to an inquiry a human advisor answers.

**Therefore, the rule for every API in this document:**

> Use these APIs for **content, availability, and price display only.** Never call a provider's `/book`, `/prebook`, `/order`, or payment endpoints. Booking stays with Inteletravel and the supplier portals.

This is not a compromise forced by the free tier — it is exactly what `BRD.md` §9.1, §9.2 and §9.3 already recommend ("Display-only initially, with booking workflows going through the supplier portal or Inteletravel"). The free tiers happen to be *more* than sufficient for display-only use, which is why this document exists.

**§1.3 confirms this independently, from the host's own rulebook**, and adds four further constraints that reshape several recommendations below. Read it next.

### 1.3 What the InteleTravel Training Manual settles

The eighth-edition US Training Manual answers most of what §9 of v1.0 of this document listed as open. Five rules govern everything below; the rest of this document cites them as **§1.3.1** through **§1.3.5**. Quotes are from the manual; emphasis added.

**1. An independent website is explicitly permitted — and must be approved before launch.**

> "Websites (not your free personalized InteleTravel website) must be approved prior to launch. Advisors are welcome to purchase another website (using another hosting provider) and create their own. However, **all websites MUST be approved prior to going live**…" — §16, Online Material

The platform itself is allowed. But `adventures.story-tail.com` — including the eleven public landing pages in `Screen-Inventory.md` §2.0 that are already built — is marketing material subject to **mandatory compliance review before it goes live**. This is a hard project gate, not a formality: §16 also says marketing "need[s] to be approved by compliance prior to getting anything printed or published," and §3 extends it to cases where "InteleTravel's logo is not used, but the relationship to the company is obvious."

**2. Bookings must hand off to the personalized InteleTravel website.**

> "…and **any transactions must link to Advisors personalized website for travel bookings**." — §16, Online Material

> "Of course you can go through the work and expense of building your own site and providing a link to your FREE Personalized Travel Website for all the booking functions." — §7

This is §1.2's display-only rule, stated by the host and with the destination named. The platform searches, displays, and captures the inquiry; `<firstname><lastname>.inteletravel.com` takes the transaction. Commission attribution rides on the Advisor PIN embedded in that site (§7), or on the **Register My Bookings** tool for anything booked directly with a Travel Partner — which also carries "a minimal transaction fee… for the manual entry" (§5).

**3. Collecting payment from clients is prohibited — broadly.**

> "Agents cannot collect direct payment from clients for travel or experiences." — §16, Golden Rule

> "InteleTravel Advisors may NOT accept checks or cash from customers… **This includes utilizing PayPal, Square, or any similar service, to receive payments from clients.**" — §5, Payment

This confirms and hardens `BRD.md` §10.5 and `CLAUDE.md` rule #2. Note the reasoning the manual gives in §3: staying out of direct collection is also what keeps the advisor personally outside state Seller of Travel registration, and E&O coverage is contingent on "work[ing] in compliance with our written agreement and training instructions." Stripe-for-tokenization-only remains correct; Stripe-as-merchant would breach the agreement, the E&O position, and possibly Seller of Travel law simultaneously.

**4. Net rates are strictly prohibited. This is the constraint that reshapes the hotel API picture.**

> "Advisors must always pay the gross rate, or the rate including InteleTravel's full commission… **Net Rates are strictly prohibited in your written InteleTravel Independent Contractor Agreement.** If you accept one, even by accident, InteleTravel will hold you responsible for the missing commission… it could result in **termination as an Advisor**." — §5, Beware "Net" Rates

**Hotelbeds and LiteAPI are wholesalers. Wholesale rates are net rates.** That is the whole product. Any integration that surfaces a wholesale rate as a bookable price puts the advisor a single click from a terminable breach. See §3.8.

Related, for the deals surface:

> "…any **agent only deals should not be posted on your social media or mentioned to the general public**." — §16

So the public deals module must never render agent-only, net, or FAM pricing.

**5. Content must be your travel business and nothing else. This rules out affiliate monetisation.**

> "**Website content must ONLY be InteleTravel content and no other content mentioned.** Website may not focus on anything but highlighting your ability to SELL travel to others. **Only your Travel business should be promoted.**" — §16, Online Material

> "You cannot mix businesses – the InteleTravel name and/or selling travel should not be mixed with marketing or selling any other business or products… in any print marketing, online posts, **websites**, linktrees, email signatures or the like." — §16, Golden Rule

**This answers v1.0's biggest open question, and the answer is no.** Publishing a Viator, Booking.com, Travelpayouts, or CruiseDirect affiliate link sends the client to another company's checkout to be another company's customer. It promotes another business, it routes a transaction somewhere other than the personalized website, and it earns revenue outside the host. Every Tier D provider in this document is therefore **content-only**: use the API to describe and display, route the client to a quote request, never publish the commission link.

The practical loss is smaller than it sounds. Viator's content endpoints — the actual value for §2.0.5 — are free either way, and the advisory model was always going to convert search into an inquiry rather than a click-out.

**One caveat on all five.** This is the *Training Manual*, which defers throughout to the *Independent Contractor Agreement* as the binding document. The manual is strong evidence of how compliance will read a given design, not a substitute for the agreement or for a written answer from the compliance office. Where a design decision is expensive to reverse — the compliance submission in §9.1 especially — get it in writing.

---

## 2. Recommended starting stack

Scoped to §1.0 — location, images, descriptions, ratings, cruise itineraries — this is the whole stack, and it is free:

| Need | Pick | Tier | Cost at MVP | Why this one |
| --- | --- | --- | --- | --- |
| **Hotel content** — descriptions, images, amenities, geocodes | **Hotelbeds APItude — Content API** (test key) | C | $0 in sandbox | Purpose-built for exactly this. Deepest Caribbean and all-inclusive coverage in the market — the actual Story-Tail specialty. |
| **Hotel ratings** and review credibility | **Tripadvisor Content API** | B | $0 up to 5,000 calls/month | The rating travellers actually recognise. 5,000/month is enormous under §10.1's sync model. |
| **Hotel catalogue + geo** — properties by city or coordinates | **Amadeus Self-Service — Hotel List** | C → B | $0 in test | Self-serve within the hour, and the same account covers flight inspiration (§5.3). **Hotel List and Hotel Ratings only — skip Hotel Offers.** |
| Hotel breadth where the above are thin | **LiteAPI / Nuitée Connect** — static content | C | $0 | 2M+ properties, easiest signup. Static content endpoints only. |
| **Cruise line, ship, itinerary, ports** | **Widgety** (test key on request) | C | $0 during evaluation | Content, not booking — precisely §1.0's cruise requirement. 60+ lines, ~1,000 ships. |
| Tours & activities content | **Viator Affiliate — Basic Access** | D | $0 | Free content endpoints on signup. **Content only — do not publish the commission link (§1.3.5).** |
| Destinations, ports, weather, FX, advisories | **Open datasets** (§8) | A | $0 forever | Everything that makes a landing page feel researched without a single vendor relationship. |
| Deal merchandising | **Curation** + Travelpayouts Data API for price signal | D | $0 | See §5 — for a commission-based advisory, deals is a curation problem. |

**What is deliberately *not* on this list:** every rates and availability endpoint. Amadeus Hotel Offers, Hotelbeds Booking and Cache, LiteAPI Rates/Prebook/Book, Booking.com Demand, Expedia Rapid. Per §1.0 they are not needed; per §1.2 and §1.3 they are not usable. Leaving them out removes the certification gate, the net-rate exposure, the merchant-of-record risk, and most of the cost.

**Suggested build order.** Start with §8 (open data) and the Amadeus test key — neither needs a card, a contract, or a business conversation. Add the Hotelbeds Content sandbox next; it is the one that carries the Caribbean depth. Request the Widgety test key in parallel, since that one moves at email speed. Tripadvisor last, because it is the only one needing a card.

**One gate applies to all of it, from §1.3.1.** Nothing goes live on `adventures.story-tail.com` until InteleTravel compliance has approved the site (§9.1). That is now the *only* external blocker — §1.0's scope removed the rest.

---

## 3. Hotels & resorts

**Requirement, from §1.0: location, images, description, rating.** No availability, no rates, no dates passed to any API. Read each entry below against that list — most of what these providers sell is surplus here.

The recommended combination is three providers, each doing one job: **Hotelbeds Content** for descriptions and imagery, **Tripadvisor** for the rating, **Amadeus Hotel List** for the property catalogue and geocoding. All three are free at the volume §10.1's sync model implies.

### 3.1 Amadeus Self-Service — Hotel APIs — **Tier C → B**

- **What it gives you:** Hotel List (properties by city or geocode), Hotel Search / Hotel Offers (live prices across 150,000+ properties), Hotel Ratings (sentiment scores), Hotel Name Autocomplete, and Hotel Booking. Same account also covers the flight APIs already chosen in `BRD.md` §9.1.
- **How free:** The test environment is free — you are not billed for test calls, only capped by a monthly quota. On moving to production you **keep the monthly free quota** and pay only for calls above it.
- **The quotas:** They are per-API and they vary. Reported figures include roughly 2,000 free requests/month for Flight Offers Search and 3,000 for Flight Offers Price; per-call pricing above the quota runs roughly $0.003–$0.046 depending on the endpoint. **Confirm the current hotel-endpoint quotas on the official pricing page at signup — these numbers move.**
- **Rate limits:** 10 transactions/second in test, 40 TPS in production.
- **Signup:** Self-serve at `developers.amadeus.com`. No sales call, no contract, no card for test access.
- **The catch:** Test-environment data is a fixed sample set, not live inventory — good enough to build and demo against, not to quote from. Production access to some endpoints requires a short review.
- **Scoped to §1.0:** use **Hotel List** (properties by city or geocode — the catalogue and the "location" requirement), **Hotel Ratings** (sentiment scores), and **Hotel Name Autocomplete** (search box). **Skip Hotel Search / Hotel Offers and Hotel Booking entirely** — those are the rate and transaction endpoints, and §1.0 needs neither. This also sidesteps §9.3's gross-vs-net question completely.
- **Verdict:** **Start here for the catalogue.** Self-serve within the hour, and the same account covers the flight inspiration endpoints in §5.3. Amadeus is thinner than Hotelbeds on resort descriptions and imagery, which is why it pairs rather than competes.

### 3.2 Hotelbeds / HBX Group — APItude — **Tier C**

- **What it gives you:** Booking API (hotels, activities, transfers), Content API (hotel descriptions, images, amenities), and Cache API. Hotelbeds is the largest B2B hotel wholesaler globally and — per `BRD.md` §9.2 — is especially strong on Caribbean and resort inventory.
- **How free:** Registration yields a complimentary API key with an "Evaluation Plan" and a generic key carrying no specific pricing or commission rules. Sandbox testing is free.
- **Signup:** Register at `developer.hotelbeds.com` → complete a commercial profile → get certified (they validate your integration with their API team) → go live.
- **The catch:** The path to production runs through **certification and a commercial profile**, which means an agency relationship and commercial terms. `BRD.md` §12 already flags this as an open risk: Hotelbeds may not be commercially accessible to a single-advisor business at launch volumes, and Inteletravel's existing relationships may or may not be the bridge. The free sandbox is real; the production door is not self-serve.
- **Scoped to §1.0 — and this is the key point:** the **Content API is the entire integration.** Hotel descriptions, images, amenities, categories, board types, and geocodes: that is §1.0's hotel requirement almost exactly, from the provider with the deepest Caribbean and all-inclusive catalogue. The Booking and Cache APIs — the rate-bearing ones that carry §1.3.4's net-rate exposure and the certification gate — are simply **not part of the build.**
- **Does the certification gate still apply?** Unclear, and worth asking: certification exists to validate *booking* integrations. A content-only consumer may face a lighter path, or none. Tracked as §9.6.
- **Verdict:** **The single most valuable signup in this document.** Free sandbox, no card, and it supplies the bulk of what the public property pages need. Scope the integration to Content and the compliance and commercial problems that dominated v1.0 of this document mostly disappear.

### 3.3 LiteAPI / Nuitée Connect — **Tier C, content-only**

- **What it gives you:** A unified REST interface over 2M+ properties — static content, real-time rates and availability, a full prebook/book/cancel flow, loyalty and vouchers, and booking webhooks. Five-plus SDKs, no volume minimums.
- **How free:** Free account with a sandbox key immediately. The core workflow (Rates → Prebook → Book) is free to use; revenue comes from markup/commission on bookings. Metered exceptions: **price index endpoints at $0.05/request** and **places/location endpoints at $0.01/request**. Optional dashboard add-ons run $4.99/month each.
- **The catch — and it is the important one:** LiteAPI is free *because* it expects you to be the merchant. Per **§1.2**, Story-Tail Adventures cannot be. Use LiteAPI for hotel content and rate display on the public search surface; **do not call Prebook or Book.** Also note their search-to-book ratio surcharge (€0.005/request past a 1,500:1 ratio) — a display-only integration will blow past that ratio by definition, so **confirm in writing that display-only usage is permitted under their terms** before shipping it to production.
- **Scoped to §1.0:** static content endpoints only — hotel details, images, facilities. Never Rates, Prebook, or Book. Note that this also disposes of the search-to-book ratio surcharge, which only bills against *rate* requests.
- **Verdict:** **A breadth fallback, not a primary.** Where Hotelbeds and Amadeus are thin — an independent villa, a boutique property outside the wholesale catalogue — LiteAPI's 2M+ property content fills the gap for free. Keep it in reserve rather than integrating it first; three content sources to reconcile is already enough.

### 3.4 Booking.com Demand API — **Tier D**

- **What it gives you:** Accommodation search, availability, and content across Booking.com's inventory.
- **How free:** Booking.com charges no API fee. Access is granted only to approved Affiliate or Connectivity Partners; authentication uses an Affiliate ID and token. Affiliate signup is open to a wide range of applicants including small sites and blogs.
- **The catch:** The newer Demand API beta endpoints are limited to selected pilot affiliate partners and gated behind an account manager. Approval is a real step, not a formality.
- **Verdict:** **Deprioritised.** §1.3.5 rules out publishing the affiliate links that are the whole point of this integration, and Booking.com's own inventory is not the Caribbean-resort strength Story-Tail sells. Revisit only if compliance gives written approval for affiliate content.

### 3.5 Expedia Rapid — **not realistically free**

- Partner-only. Application, approval, and certification required; no self-serve signup. No stated minimum sales volume, but the vetting favours partners with established booking volume, and enrolment with contract negotiation can take months.
- `BRD.md` §9.2 lists Expedia Rapid as the Hotelbeds fallback. That remains correct as a Phase 2+ commercial goal.
- **Verdict:** **Not a free option. Do not plan the build around it.**

### 3.6 Tripadvisor Content API — **Tier B**

- **What it gives you:** Location Search, Location Details (name, address, rating, Tripadvisor URL), Location Photos, and Location Reviews. Covers hotels, restaurants, and attractions.
- **How free:** **First 5,000 API calls per month free**, every month. Billed on a sliding tiered rate above that. You set a maximum daily budget at signup, which caps your daily call volume.
- **The catch:** A credit card is required at signup — overage is charged automatically. Review and photo endpoints return a limited set per location (typically up to 5 each). Production approval expects a working site. **Attribution and display requirements apply** — Tripadvisor is strict about how their content, rating bubbles, and links are rendered; read the display guidelines before designing the property detail page.
- **Scoped to §1.0:** this is the **ratings** source. Location Search maps a property to a Tripadvisor location id, Location Details supplies the rating and ranking, Location Photos supplies imagery where Hotelbeds is thin.
- **Verdict:** **Take it — and note that 5,000 calls/month is not a constraint here, it is abundance.** Under §10.1's sync model one call refreshes one property, so the free tier covers a catalogue of several thousand properties refreshed monthly. A curated Caribbean catalogue will use a small fraction of it. The only real cost is the card on file and the display-guideline compliance work.

### 3.7 Hotels summary

Scored against §1.0's four requirements — **location, images, description, rating** — rather than against the full product each vendor sells:

| Provider | Tier | Card | Location | Images | Description | Rating | Caribbean depth | Role |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **Hotelbeds — Content API** | C | No | ✅ | ✅ **Strong** | ✅ **Strong** | Category only | **Strong** | **Primary content** |
| **Tripadvisor Content** | B | **Yes** | ✅ | ✅ (up to 5) | Short | ✅ **The rating** | Broad | **Ratings** |
| **Amadeus — Hotel List / Ratings** | C → B | No | ✅ **Strong** | Thin | Thin | ✅ Sentiment | Moderate | **Catalogue + geo** |
| LiteAPI — static content | C | No | ✅ | ✅ | ✅ | ✗ | Broad | Breadth fallback |
| Google Places (§3.9) | B | Yes | ✅ | ✅ | Short | ✅ but Enterprise SKU | Broad | Gap-filler only |
| Booking.com Demand | D | No | — | — | — | — | Broad | Deprioritised (§1.3.5) |
| Expedia Rapid | — | — | — | — | — | — | Strong | Not free; out of scope |

**No single provider covers all four columns, and none needs to.** Hotelbeds carries the description and imagery, Tripadvisor carries the rating travellers trust, Amadeus carries the catalogue and coordinates. Three free integrations, reconciled once at sync time (§10.1) rather than at request time.

### 3.8 The net-rate problem — mostly dissolved by §1.0, retained as a guardrail

**Status: no longer blocking.** §1.0 removed rates from the product entirely, and a rate that is never fetched cannot be accepted. This section is retained because the rule still binds the advisor, and because a future "show indicative pricing" request would walk straight back into it.

§1.3.4 was the most consequential finding of v1.1, and it is worth stating plainly because it inverts the obvious plan.

**The best free hotel APIs for a Caribbean specialist are wholesalers, and wholesalers sell net rates. The InteleTravel IC Agreement strictly prohibits accepting net rates, with termination named as a possible consequence.**

The manual's mechanism: the advisor must always pay the **gross** rate — the price including InteleTravel's full commission — and the commission then flows back through InteleTravel after travel. A net rate hands the advisor the commission up front as a discount, which breaks the host's revenue model and the agreement along with it.

What this does and does not block:

| Data | Blocked? | Notes |
| --- | --- | --- |
| Property content — descriptions, images, amenities, geocodes | **No** | Hotelbeds Content API and LiteAPI static content are fine. This is most of what §2.0.5 needs. |
| Rates displayed publicly as indicative pricing | **Unresolved** | Depends on whether display without transaction counts as "accepting" a net rate. It probably does not, but the downside is termination — get it in writing. |
| Rates used to quote or book | **Yes** | This is the prohibited act. |
| Agent-only / FAM / advisor pricing shown publicly | **Yes** | §16 explicitly bars posting agent-only deals to the general public. |

**The path chosen is option 1 below**, which is also §1.0:

1. **Ship content without rates.** ✅ **Adopted.** The public search surface shows properties, photos, amenities, and a "request a quote" action; the advisor prices it through InteleSearch. Needs no ruling from anyone, matches the advisory model in `BRD.md` §5, and — as §1.0 notes — makes every free tier in this document abundant rather than tight.
2. *Get a written ruling on displaying indicative wholesale pricing.* Now optional. Ask only if a future release wants "from $X" pricing on the search surface. Tracked as §9.2, downgraded to low.
3. *Source gross rates instead.* Now moot for hotels, since no rate endpoint is called. Tracked as §9.3, downgraded to low.

**The guardrail that remains:** if a future change adds any rate to any surface, this section becomes blocking again. Enforce it structurally rather than by memory — see §10's `RateVisibility` note.

### 3.9 General-purpose Places APIs — evaluated, not recommended

Once rates come off the table (§1.0), "location, images, ratings" starts to look like a job for a general Places API rather than a travel API. It is worth saying why that turns out not to work, so the option is not re-proposed.

- **Google Places.** Google restructured pricing in March 2025, replacing the flat $200 monthly credit with per-SKU free thresholds — around 10,000 requests/month on Essentials, 5,000 on some Pro SKUs, with pay-as-you-go above. The problem is field-driven SKU escalation: **asking for ratings moves the call to the Enterprise SKU, and asking for reviews moves it again to Enterprise + Atmosphere.** The exact fields §1.0 needs are the ones that cost the most. Under §10.1's sync model the absolute spend would still be modest — you call once per property, not per visitor — so keep Google in reserve as a gap-filler for properties the travel APIs miss. Just don't build the ratings layer on it.
- **Foursquare Places.** 500 free Pro calls/month from June 2026, then $15/1,000. **Photos, ratings, tips, and hours are Premium fields with no free tier at all** — billed from the first request. Wrong shape for this requirement.
- **Geoapify Places / OpenTripMap.** Both are OpenStreetMap-derived, with generous free tiers and clean licensing (OpenTripMap is ODbL). **Neither carries user ratings or photography** — OSM does not have them. Genuinely useful for the *geographic* layer: POIs near a resort, beaches, attractions, "what's around this port." Not a substitute for the hotel content stack.

**Conclusion: the travel-industry content APIs win here**, because a resort's marketing description, room imagery, board basis, and amenity list are travel-trade data that general Places APIs simply do not carry. Hotelbeds Content gives that for free; Google would charge for a thinner version of it. Keep Geoapify or OpenTripMap in mind for §8's geographic layer.

---

## 4. Cruise — the honest answer

### 4.1 There is no free cruise API — but §1.0 asks for the cheap half

Not a gap in this research — a fact about the market. `BRD.md` §9.3 already says cruise APIs are "notoriously fragmented," and the free-tier picture very nearly confirms it. **Of the established cruise-content vendors, none offers a free production tier, a free quota, or open data** — each is a commercial contract with, at best, a free evaluation period. The one exception is a newer entrant, track.cruises (§4.8), whose free tier is real but quota-bound to 1,000 rows a month and covers ten lines rather than sixty.

The structural reason: cruise inventory is controlled by a small number of lines who distribute through agency relationships, not through developer portals. There is no cruise equivalent of Amadeus Self-Service.

**But the expensive part of cruise data is availability and pricing, and §1.0 needs neither.** The requirement is cruise line, ship, itinerary — ports and sailing dates — with price optional. That is *content*, the half of the market that is licensable rather than agency-gated, and it is the half Widgety sells. The distinction matters commercially: a content licence is a smaller, simpler, cheaper conversation than a booking-engine contract, and it does not require production commitments.

It also means the fallback is viable in a way it would not be for availability. A hand-maintained catalogue of the ~30–50 ships Story-Tail actually sells, with their itineraries, is a realistic afternoon's data entry per line — impossible for live cabin inventory, entirely tractable for ports and sailing dates.

### 4.2 Widgety — **Tier C, closest to free**

- **What it gives you:** The largest cruise content API of its kind — itineraries, pricing, availability where the line provides it, ship content, ports visited, deck plans, brochures, trade resources, and tens of thousands of images across 60+ cruise lines and ~1,000 ships. Content, not booking.
- **How free:** **A test API key is available on request.** Their developer site lets you understand and experience the API "without needing to commit or invest in full development."
- **Signup:** Contact Widgety directly and ask for a test key. There is no self-serve portal.
- **The catch:** Production is a paid commercial licence — pricing is not published and will require a conversation.
- **Scoped to §1.0:** Widgety's product *is* the requirement. Cruise line, ship, itinerary, ports, sailing dates, imagery — with pricing and availability as optional extras Story-Tail can simply ignore. There is no scoping-down exercise here as there is for the hotel wholesalers; this is a clean fit.
- **Verdict:** **Request the test key this week.** It moves at email speed, so it is the long pole. `BRD.md` §9.3 already names Widgety for display, and a free test key means the cruise content model, the sync job, and the §2.0.5 detail screen can all be built and validated before spending anything. When the production quote arrives, it is for content only — price it against §4.7's manual fallback, which is a real alternative rather than a bluff.

### 4.3 Traveltek — CruiseConnect / Cruise API — **commercial**

- Real-time itineraries, cabin availability, and current pricing from 27+ cruise suppliers, 30,000+ itineraries, ship descriptions, cabin detail and images. Standard HTTP + JSON, straightforward to integrate.
- No free tier. Commercial contract.
- **Verdict:** The strongest cruise product if cruise volume ever justifies the spend. Phase 2/3 decision, not a Phase 2 starting point.

### 4.4 Odysseus Solutions / Revelex — **commercial, agency-gated**

- The two main third-party cruise booking engines used by travel advisors, per `BRD.md` §9.3. Unified booking interface across multiple lines.
- Agency contract with production commitments. Also relevant to `Tech-Recommendations.md` §4.9 — these are the "API supplier" endpoints the Stripe Vault-and-Forward path targets.
- **Verdict:** Phase 2+ and only via Inteletravel's relationships.

### 4.5 Cruise affiliate programs — **ruled out**

v1.0 of this document listed CruiseDirect (3% of commissionable fare, 45-day cookie) and the cruise programs on Impact / CJ / Awin / ShareASale as the free-to-integrate cruise path, flagged as probably non-compliant.

**§1.3.5 settles it: they are not available.** Sending a cruise client to a competing OTA promotes another business, routes the transaction away from the personalized website, and earns revenue outside the host — three separate violations of the Marketing Code of Conduct in one link. Retained here only so nobody re-proposes it.

### 4.6 Scraping — don't

Several marketplaces sell scrapers for CruiseMapper, Royal Caribbean, and similar sites. `BRD.md` §9.3 mentions "scraped cruise data" as an MVP display option.

**Recommendation: do not build on scraped cruise data.** It breaks the source sites' terms of service, it exposes a commission-based business to a takedown or a relationship problem with the exact cruise lines it depends on, it has no availability or freshness guarantee, and it puts the platform's public SEO surface on top of content it has no right to publish. The reputational downside for a small advisory business dwarfs the data-acquisition saving.

If `BRD.md` §9.3's mention of scraping is meant to stay as a live option, it should be revisited and struck — flagged in §9 below.

### 4.7 The pragmatic Phase 2 cruise plan

Given that no free cruise API exists but §1.0 only needs content, the realistic build:

1. **Request a Widgety test key** and build the cruise content model against it. Line, ship, itinerary, ports, sailing dates, and deck plans are precisely what `Screen-Inventory.md` §2.0.9 (Cruises Landing Page) and §2.0.5 (Public Cruise Detail) need.
2. **Design the schema so the source is swappable.** Model cruise line → ship → sailing → port call as first-class entities populated by a sync job (§10.1), not as a thin wrapper over Widgety's response shape. Then the manual fallback and the Widgety feed write to the same tables, and a future Traveltek licence is a new sync job rather than a rewrite.
3. **Seed manually, and keep curating even after the feed lands.** Manual component entry is already the P1 default (`BRD.md` §6). A curated set of six well-photographed sailings converts better than an unfiltered feed dump, and it sounds like Gyasi rather than like a database. The feed's job is breadth behind the curation, not replacing it.
4. **Route every cruise inquiry to a quote request** — the §2.0.6 sign-up gate — and let the advisor price it through InteleTravel's cruise tools. This is already the model, and §1.3.2 requires it.
5. **Fill the reference layer from open data** (§8): port coordinates, port cities, and ship reference data (Wikidata) are all obtainable free, and they make the itinerary map work even where the feed is sparse.
6. **Defer Traveltek / Odysseus / Revelex** until cruise volume justifies a booking-engine licence. Under §1.0 that may be never — they sell availability, which the product does not use.

**On price being optional.** If a sailing's lead-in fare is available from the feed, showing it as clearly-labelled indicative pricing is a merchandising win. But it re-opens §1.3.4 and §9.2, and it puts a number on the page that goes stale. **Recommendation: launch without it.** Revisit once compliance has ruled on §9.2 and there is a refresh cadence that keeps a displayed fare honest.

### 4.8 track.cruises — Cruise Pricing API — **Tier B, a real free tier**

Added after v1.1. **This is the entry that falsifies §4.1's flat claim** that no cruise data
provider offers a free production tier — one does, and it is the provider this codebase is
building against first.

- **What it gives you:** Nine cruise lines under one normalised schema — `royal-caribbean`,
  `celebrity-cruises`, `disney-cruise-line`, `princess`, `carnival`, `ncl`,
  `holland-america`, `msc`, `costa` — with sailings, ordered port-by-port itineraries, ship
  and port catalogues, destinations, per-market pricing, and a year of daily price history on
  paid tiers. Content and pricing, no availability, no booking.
  *(Their `CompanyEnum` also lists `aida`, but a live `/cruise-lines` returns nine and omits
  it. Their `LocaleEnum` lists eight locales; live responses include a ninth, `pt_BR`, priced
  in BRL. Treat both published enums as approximate — the schema does.)*
- **How free:** **BASIC is $0 with no card**, and it is real production data — the spec is
  explicit that the free tier "returns the same real-time data as paid tiers." The limits are
  what bite: **100 requests/month and 10 rows/request.** `GET /cruises/{id}/price-history`
  returns 403 on BASIC; everything else is reachable.
- **Signup:** Through **RapidAPI** — there is no direct subscription, all tiers relay through
  `cruise-pricing-api1.p.rapidapi.com`. Auth is `X-RapidAPI-Key` + `X-RapidAPI-Host`. The
  OpenAPI 3.1 spec is public and unauthenticated at `https://www.track.cruises/openapi.json`.
- **Paid ladder:** PRO $49/mo (10k requests, 100 rows, price history, webhooks), ULTRA $299
  (100k, 500 rows, 99.5% SLA), MEGA $1,499 (1M, 1000 rows, raw database dumps).
- **Terms — and this is the clause that matters for §10.1:** §4.4 permits caching ("You may
  cache results per your subscription plan") and explicitly permits derivative use to "power
  end-user products (travel agency tools, comparison sites, internal analytics)". What it
  forbids is bulk redistribution of raw responses and building a competing cruise-data API.
  **So storing normalised rows in Postgres is licensed; proxying raw provider responses to a
  client is not.** That is a point in favour of the sync architecture, and it partially
  answers open question §9.10 for this provider.
- **Coverage against the eight lines Story-Tail books** (`web/content/public/cruise-lines.ts`):
  four slugs match exactly (`royal-caribbean`, `princess`, `carnival`, `holland-america`),
  three need mapping (`celebrity-cruises`→`celebrity`, `disney-cruise-line`→`disney`,
  `ncl`→`norwegian`), and **Virgin Voyages is not covered at all.** Three lines are covered
  that Story-Tail does not book (`costa`, `msc` — European markets). So the feed can never be
  the whole catalogue, which is §10.1's "curated content wins" rule arriving as a fact rather
  than a preference.
- **Data quality, observed.** Port names are provider-localised with nothing linking them —
  "Rhodes, Greece", "Rodi, Grecia" and "Rodes, Grécia" are one quay under three names — and
  the catalogue mixes real ports with at-sea positions like "38.6 N 19.8 E - Ionian Sea" and
  some stray quoting. There is no provider port id to reconcile any of it by, which is why
  every shipped sailing scope is `en_US` only and why the coordinates in §4.7 point 5 remain
  the right long-term fix.

**What the free tier can and cannot do — the arithmetic, because it decides the design.**
100 requests × 10 rows is **1,000 rows/month**. The live catalogue reports **245,020 sailings
across the nine lines** (Royal Caribbean 50,051; MSC 62,017; Costa 50,904; Norwegian 26,569;
Celebrity 18,018; Holland America 13,585; Princess 12,029; Carnival 7,231; Disney 4,616).
**Mirroring that on BASIC would take about 20 years.** It is not a batching problem, and no
scheduling cleverness touches it.

The reference catalogue, however, is nearly free, and by a wider margin than expected:
`/cruise-lines`, `/filter-options` and `/coverage` take no `limit` parameter, so **three
requests refresh every line, ship, port, destination, locale and departure-date window** — 12
requests/month at a weekly cadence out of 100.

Measured, not estimated: one `/filter-options` call returned **4,566 ports**. Paging the same
catalogue out of `/ports` at 10 rows a request would cost **457 requests — four and a half
months of quota for data one request already gave.** That single fact is why the shipped
configuration enables the three unpaginated scopes and leaves `/ships` and `/ports` disabled.
Between them the three answer the whole of §1.0's cruise requirement except the sailings.

- **Verdict:** **Build the sync against BASIC now.** It costs nothing, needs no email thread,
  and validates the entire §10.1 content path — schema, mapping, scheduling, quota accounting
  — against real data today, which is exactly what §4.7 point 1 wanted the Widgety test key
  for. It does **not** replace §4.2: Widgety's 60+ lines and ~1,000 ships, its imagery and
  deck plans, and its coverage of Virgin Voyages are all things this provider does not have,
  and imagery in particular is what makes §2.0.9 look like anything. Read this as the cheap
  way to build and prove the pipeline while the Widgety conversation runs — and as evidence
  in that conversation, since §4.7 point 2's swappable schema is now load-bearing rather than
  aspirational. If cruise search earns its keep, PRO at $49/mo lifts the mirror to 1M
  rows/month — the full 245,020-row mirror in about six hours — and the same sync widens by
  configuration rather than by code.

---

## 5. Deals, offers & price signal

### 5.1 Set expectations first

For a commission-based advisory, "deals" is mostly a **curation** problem, not an API problem. The offers that matter to Story-Tail's clients — Sandals resort credits, a cruise line's reduced-deposit window, a wave-season promotion — arrive as supplier emails, PDFs, and portal announcements. There is no API for them. The highest-value "deals" surface is a well-designed, hand-maintained promotions page with the advisor's own framing.

§1.3.4 sharpens this further: **agent-only and net pricing may never appear on a public page.** Whatever the deals module shows must be retail-visible pricing or no pricing at all.

That said, three free sources add real price signal underneath the curation:

### 5.2 Travelpayouts Data API — **Tier D, free**

- **What it gives you:** Flight price trends, popular destinations, a **special-offers endpoint** returning tickets at specific prices, a **price-calendar endpoint** returning the cheapest non-stop / one-stop / two-stop fares for each day of a month, and price-range and popular-direction endpoints. JSON.
- **How free:** The Data API is free. Requires an API key and token, passed in the `X-Access-Token` header or a `token` parameter. Obtain it from the Travelpayouts developer page after creating an affiliate account.
- **Scope:** Travelpayouts is an affiliate network of 90+ travel programs (Trip.com, Booking.com, Agoda, GetYourGuide, RentalCars and more), with APIs currently exposed by ~17 of them across flights, hotels, and car rentals.
- **The catch:** Monetising Travelpayouts means publishing commission links, which §1.3.5 rules out. An account is still needed to obtain the token.
- **Verdict:** **Use the Data API purely as a price signal — never as an affiliate surface.** "Caribbean flights are running about $X from Atlanta in February" is genuinely useful merchandising copy, it costs nothing, and it points the reader at a quote request rather than at someone else's checkout.

### 5.3 Amadeus inspiration endpoints — **Tier B**

Flight Inspiration Search ("where can I go for $400?") and Flight Cheapest Date Search ("when is this route cheapest?") ride the same free Amadeus quota as §3.1. Both are natural fits for a deals or inspiration module on the public landing pages.

### 5.4 Affiliate network product feeds — **Tier D**

Impact, CJ Affiliate, Awin, and ShareASale all provide free product/offer feeds to approved publishers, and most major travel brands run programs on at least one of them. Free to access once approved; §1.3 governs whether they can be published.

### 5.5 Supplier promo feeds — **manual**

Sandals, Beaches, the major cruise lines, and the all-inclusive brands publish promotions through agent portals and email, not APIs. Plan for a lightweight internal "current promotions" entity the advisor maintains by hand, rather than an integration that does not exist.

---

## 6. Tours & activities

### 6.1 Viator Partner API — Affiliate Basic Access — **Tier D, genuinely free**

- **What it gives you:** Full access to the content areas of the Partner API — product catalogue, descriptions, images, availability, pricing, categories, destinations. Global tour and activity inventory from a Tripadvisor company.
- **How free:** **There are no costs to sign up and no costs to get additional API access.** Creating an affiliate account grants **Basic Access immediately.** Higher tiers (full, booking) are available on request, also at no cost.
- **How it works:** Affiliates display Viator content and link out; the customer books on viator.com via a unique URL that sets a commission cookie.
- **The catch:** **The link-out is the part §1.3.5 prohibits.** Viator's content is excellent and free; Viator's monetisation model is not available to an InteleTravel advisor. Use the content endpoints to describe excursions on §2.0.5 and the Caribbean landing page, and route the reader to a quote request — the advisor then books the excursion through InteleSearch or the Travel Partner and earns the normal host commission. Note also that Viator runs an API certification process for higher access levels.
- **Verdict:** **Still the best free content source for tours and activities** — instant access, no card, no contract. Just take the content and leave the commission on the table; the host commission on the same excursion, booked properly, is worth more anyway.

### 6.2 GetYourGuide Partner API — **Tier D**

Available directly through the GetYourGuide partner program and also as one of the Travelpayouts network programs. Comparable model to Viator; useful as a second source for European and cruise-port excursions.

### 6.3 Hotelbeds Activities — **Tier C**

The Hotelbeds Booking and Content APIs cover **activities and transfers** alongside hotels, on the same key from §3.2. If the Hotelbeds sandbox is already set up, activities cost nothing extra to explore.

---

## 7. Flights — adjacent, already decided

`BRD.md` §9.1 already selects **Amadeus Self-Service** for flight search, and §3.1 above covers its free tier. No change recommended.

One alternative worth knowing about:

**Duffel — Tier C.** Sign up at `app.duffel.com/join` in about a minute for instant sandbox access; test tokens are prefixed `duffel_test_`. Test mode runs against their own synthetic airline ("Duffel Airways") with reliable behaviour but unrealistic prices and schedules. Their free Starter plan allows up to 50 bookings/month with no fixed monthly fee.

**But:** Duffel's model makes you the merchant, so §1.2 applies. Duffel is a better developer experience than Amadeus and a worse fit for this business.

---

## 8. Free open data — no key, no contract, no expiry

**Tier A throughout.** This is the layer that makes a public travel page feel researched rather than generated, and none of it requires a vendor relationship. Every one of these is safe to build on permanently.

| Data | Source | Licence / limits | Use on the public surface |
| --- | --- | --- | --- |
| Airports & airport codes | **OurAirports** (downloadable CSV) | Public domain | Airport autocomplete, route labels, "fly into" copy |
| Place names, geo hierarchy, populations | **GeoNames** | CC BY 4.0, free account, ~20k credits/day | Destination pages, region grouping, search disambiguation |
| Country facts, currencies, languages, flags | **REST Countries** | Free JSON, no key | Destination detail, entry-info blocks |
| Currency exchange rates | **Frankfurter** / ECB reference rates | Free, no key | "Roughly $X" price conversions |
| Geocoding & maps | **Nominatim / OpenStreetMap** | Free, but 1 req/sec and a strict usage policy — heavy or commercial use needs a self-hosted instance or a provider like Geoapify or Photon (free tiers available) | Map pins on property and port pages |
| Weather & climate | **Open-Meteo** | ⚠️ **Free tier is non-commercial only** (<10,000 calls/day). Data is CC BY 4.0 with attribution; server code is AGPLv3. **A commercial plan is required for `adventures.story-tail.com`.** Standard/Professional/Enterprise tiers are available. | "Best time to visit" and typical-weather modules |
| US travel advisories | **travel.state.gov RSS** — `https://travel.state.gov/_res/rss/TAsTWs.xml` | Public, no key. Several open-source JSON wrappers exist if you prefer not to parse RSS. | Destination safety notes, trust signal |
| Travel health notices | **CDC travel health notices RSS** | Public, no key | Same |
| Destination editorial | **Wikivoyage / Wikidata** | CC BY-SA — **share-alike: attribution required and derivative text inherits the licence.** Read before using as page copy. | Background facts, port and ship reference data |
| Photography | **Unsplash API** (already in use on the landing pages) | Free. Demo mode is rate-limited (~50 req/hour); production approval raises it substantially (~5,000 req/hour) — confirm current limits at signup. Attribution required. | Hero and card imagery |

**Two cautions on this table.** First, **Open-Meteo's free tier explicitly excludes commercial use** — a business website with a lead-generation funnel does not qualify, so either budget for their commercial plan or self-host. Second, **CC BY-SA content (Wikivoyage, Wikidata) is share-alike**: copying descriptive text into page copy can carry licence obligations onto that page. Use it for structured facts, not for prose. Prose should sound like Gyasi anyway — see `Design-System.md` §2.

---

## 9. Open questions

### 9.0 Answered by the Training Manual

Four of v1.0's eight questions are now closed. Recorded here so they are not re-opened:

| v1.0 # | Question | Answer |
| --- | --- | --- |
| 1 | May Story-Tail earn affiliate commission outside the host? | **No** — §1.3.5. Website content must be the advisor's travel business only; transactions must link to the personalized InteleTravel website. Tier D providers become content-only. |
| — | May Story-Tail run its own website at all? | **Yes, with compliance approval before launch** — §1.3.1. |
| — | May the platform take a client payment? | **No** — §1.3.3, and the prohibition explicitly extends to PayPal, Square, "or any similar service." Confirms `CLAUDE.md` rule #2. |
| 8 | Should `BRD.md` §9.3's scraped-cruise-data mention be struck? | **Yes** — §4.6, now reinforced by the manual's supplier-relationship rules. Tracked as 9.8. |

### 9.1–9.10 Still open

| # | Question | Blocks | Owner | Priority |
| --- | --- | --- | --- | --- |
| 9.1 | **Submit `adventures.story-tail.com` to InteleTravel compliance for pre-launch approval.** Required by §1.3.1 for the whole public surface, including the eleven §2.0 landing pages already built. Ask what the submission needs to contain and how long review takes. | **Public launch of anything** | Gyasi → InteleTravel compliance | **Highest — this gates the launch date** |
| 9.2 | **May indicative wholesale/net rates be *displayed* on an approved advisor site** with a non-bookable disclaimer? | Nothing today — §1.0 ships without rates. Blocks only a future "from $X" feature | Gyasi → InteleTravel compliance | Low — deferred by §1.0 |
| 9.3 | **Are Amadeus Self-Service hotel offers gross or net** for a US agency? | Nothing today — the Offers endpoint is not in scope (§3.1) | Engineering → Amadeus | Low — moot under §1.0 |
| 9.4 | **Does the platform's card authorization flow have to use InteleTravel's official Credit Card Authorization form?** The manual says use it "EVERY TIME you collect credit card information," with chargeback liability and E&O coverage riding on compliance. See §10. | `card_authorization` design; Screen Inventory §3.6 | Gyasi + Engineering | **High — affects the Data Model** |
| 9.5 | **Does InteleTravel offer any API access?** Still open from `BRD.md` §12; the manual describes only InteleSearch, the back office, and Register My Bookings — all human-facing. | Cruise availability, commission reconciliation | Gyasi → InteleTravel | Medium |
| 9.6 | **What does Hotelbeds require for a *content-only* integration?** Certification exists to validate booking integrations; a Content API consumer may face a lighter path or none. Ask before assuming the §3.2 gate applies. | Hotelbeds Content in production (§3.2) | Engineering → Hotelbeds | **High — determines whether the best content source is actually reachable** |
| 9.7 | **What does a Widgety content licence cost** at single-advisor scale, and does the test key allow a public demo? | Cruise content in production (§4.2) | Gyasi → Widgety | **High — the cruise plan's only real cost** |
| 9.8 | **Update `BRD.md`:** strike the scraped-cruise-data option in §9.3, and record the manual's constraints in §9 and §10.5. Per `CLAUDE.md`, docs get updated before code diverges. | Doc consistency | Gyasi | Medium |
| 9.9 | **Attribution, display, caching and billing housekeeping** — Tripadvisor display rules and billing-account owner, GeoNames/Open-Meteo/Wikidata attribution, per-provider rate-caching terms. Likely a shared "data sources" footer page (`Screen-Inventory.md` §2.0.7). | Public launch; proxy tuning | Engineering + Gyasi | Medium |
| 9.10 | **Do provider terms permit *storing* content** in Postgres on the refresh cadence §10.1 assumes? Storage is a different, generally more permissive question than rate caching — but confirm per provider. | Sync architecture (§10.1) | Engineering | Medium |

---

## 10. Integration notes for this codebase

### 10.1 Sync, don't proxy — the architectural consequence of §1.0

**This is the design decision that follows from everything above, and it is worth getting right before the first Edge Function is written.**

`Tech-Recommendations.md` §3 anticipates `travel-api-proxy/{provider}` functions — a request-time proxy, which is the correct shape when a page needs *live* availability and pricing. **Under §1.0, no page does.** A resort's description, photographs, amenities, and star rating are the same at 3pm as they were at 3am. A sailing's ports do not change between visitors.

So the content path is a **scheduled sync**, not a proxy:

```
Scheduled Edge Function (nightly / weekly)
  → provider content API
  → normalise into Postgres (property, cruise_line, ship, sailing, port_call, …)
  → Next.js renders from Postgres, statically where possible
```

**Why this is the right call here, beyond taste:**

| | Proxy per request | Scheduled sync |
| --- | --- | --- |
| Quota math | Per **visitor** — traffic spikes become billing incidents | Per **property per refresh** — bounded, predictable, tiny |
| Tripadvisor's 5,000/month | Could be exhausted by one good week of traffic | Refreshes a multi-thousand-property catalogue monthly |
| Page speed / SEO | Blocked on a third-party call; SSR at the mercy of their latency | Static or near-static — and `BRD.md` §14 makes SEO load-bearing for this surface |
| Provider outage | Public site degrades | Public site unaffected |
| Rate-limit risk | Real (Amadeus 10 TPS, Nominatim 1 req/sec) | Trivially managed inside a batch job |
| Compliance surface | Live third-party data on a compliance-approved page | Content is reviewed, stored, and stable — which is what §9.1's approval assumes |

That last row deserves emphasis: **§1.3.1 requires compliance approval of the site before launch.** A page whose content is synced and stored is a page whose content can actually be reviewed. A page that renders whatever a third party returns at request time is much harder to approve, and arguably changes after approval every time the provider updates a description.

**Practical notes:**

- **Store the provider's payload, then normalise.** Keep the raw response alongside the mapped row so a mapping bug is a re-derivation rather than a re-fetch against a quota.
- **Reconcile three sources per property.** Hotelbeds supplies description and images, Tripadvisor the rating, Amadeus the catalogue entry. Pick a stable internal id and treat provider ids as external references — a property will not have all three.
- **Curated content wins over synced content.** Where Gyasi has written a description or chosen a photo, that beats the feed. Model it as an override layer, not as an edit to the synced row that the next sync will clobber.
- **A request-time proxy is still right for the interactive bits** — search-box autocomplete, for instance. Keep the proxy pattern for those; it is the *content* path that inverts.
- **Cache and licence terms still apply.** Some providers restrict how long content may be stored. Storing content is a different question from caching rates, and generally far more permissive, but read the terms (§9.9).

### 10.2 The rest

When these get wired up, they follow the architecture that is already decided — nothing here is new invention:

- **Proxy every provider through an Edge Function.** `Tech-Recommendations.md` §3 already names `travel-api-proxy/{amadeus,hotelbeds,viator,widgety}`. Add one function per provider from this document, same pattern.
- **Keys are server-side only.** No provider key, token, or affiliate ID reaches the web or mobile client — same rule as Stripe. Store them as Supabase Edge Function secrets, never in `web/` or `mobile/`.
- **Display-only enforcement belongs in the proxy, not in the caller.** The proxy should refuse to forward to any provider path matching book / prebook / order / payment. §1.2 and §1.3.2 are business rules with contractual teeth, so they get enforced where a future screen cannot bypass them.
- **Every booking CTA hands off to the personalized InteleTravel website.** Per §1.3.2, the terminal action on any public search or detail screen is a quote request (`Screen-Inventory.md` §2.0.6) or a link to `<advisor>.inteletravel.com` — never an on-platform checkout. Put the handoff URL in configuration, not inline, so the Advisor PIN attribution has exactly one source of truth.
- **Never render agent-only, net, FAM, or advisor pricing on a public route.** §1.3.4. Under §1.0 no price is fetched at all, so the cleanest enforcement is structural: **give the public content types no price field.** If a future release adds one, a typed `RateVisibility` discriminator or a lint rule should gate it — the failure mode is a contract breach, not a layout bug.
- **The public surface is regulated marketing material.** Per §1.3.1 it needs InteleTravel compliance approval before launch, and re-approval is the safe assumption for material copy changes. Treat the §2.0 route group as change-controlled: it is the one part of the codebase where shipping is gated on an external human review (§9.1).
- **Attribution as an InteleTravel affiliate is mandatory where the relationship is stated or implied.** The manual's required form is "An Independent Travel (Agency, Advisor or Affiliate) of InteleTravel." Also: no InteleTravel name in the domain, handles, or email addresses, no InteleTravel logo beside another logo, and **never publish ARC or CLIA numbers** — worth adding to the existing secret-scanning guards alongside the PAN scanners.
- **Cache aggressively, within terms.** Per §10.1 static content lives in Postgres on a scheduled refresh rather than a TTL cache. There are no live rates to cache, because none are fetched (§1.0). Read each provider's storage terms before choosing a refresh cadence (§9.9).
- **Record provenance.** Every API-sourced component sets `source` and `api_reference` on TripComponent per `Data-Model.md`. Manual entry stays the P1 default; API origin is additive.
- **Rate-limit and circuit-break at the proxy.** Free tiers have hard quotas (Amadeus 10 TPS in test; Tripadvisor's daily budget cap; Nominatim's 1 req/sec). A runaway loop against a metered API is a billing incident. Budget alarms belong in the proxy, not in the vendor dashboard.
- **Consuming screens:** `Screen-Inventory.md` §2.0.3 (Public Search Landing), §2.0.4 (Public Search Results), §2.0.5 (Public Property / Cruise / Tour Detail), §2.0.9 (Cruises Landing Page), and §2.3 (Self-Guided Search).
- **Phase marker:** **P2** on every commit, comment, and PR for this work.
- **Copy from API data still needs the brand voice.** API descriptions read like inventory records. `Design-System.md` §2 governs anything a client sees — an API field is raw material, not finished copy.

**One item that reaches beyond this document.** The manual requires InteleTravel's **official Credit Card Authorization form** every time card details are collected from a customer, and makes the advisor liable for chargebacks where it was not used — with E&O coverage contingent on following the written agreement and training instructions. The platform's `card_authorization` entity and the Screen Inventory §3.6 flow were designed to the PCI requirement, not to this one. **They may need to generate, capture, or attach InteleTravel's form.** That is a `Data-Model.md` and `BRD.md` question rather than a travel-API one; raised as §9.4 so it does not get lost here.

---

## 11. Provisioning checklist

**Do these first, before any provider signup.** They are cheap, they are blocking, and two of them may change what gets built:

| # | Action | Why it comes first |
| --- | --- | --- |
| ☐ 1 | Ask InteleTravel compliance what a **website pre-launch submission** requires and how long it takes (§9.1) | The only remaining external blocker; gates the launch date for work already done |
| ☐ 2 | Ask Hotelbeds what a **content-only integration** requires — certification or not (§9.6) | Decides whether the best hotel content source is reachable |
| ☐ 3 | Request the **Widgety test key** and ask what a content licence costs (§9.7) | Longest lead time — it moves at email speed |
| ☐ 4 | Read the **Independent Contractor Agreement** itself, not just the manual (§1.3 caveat) | The manual is evidence; the agreement is the authority |

§9.2 and §9.3 were on this list in v1.1. **§1.0 removed both from the critical path** — with no rates in the product, neither answer is needed to ship.

**Then provision.** Nothing below has been done yet.

| Provider | Signup | Card? | Account | Key in secrets | Sync job | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Hotelbeds APItude | `developer.hotelbeds.com` | No | ☐ | ☐ | ☐ | **Content API only.** Primary hotel content source |
| Tripadvisor Content | `tripadvisor.com/developers` | **Yes** | ☐ | ☐ | ☐ | **Ratings source.** Set daily budget cap; confirm billing owner |
| Amadeus Self-Service | `developers.amadeus.com` | No | ☐ | ☐ | ☐ | **Hotel List + Ratings only** — skip Offers. Also flight inspiration |
| track.cruises | `rapidapi.com` → Cruise Pricing API | No | ☐ | ☐ | ☐ | **Cruise catalogue.** BASIC is $0, self-serve, immediate. 100 req/mo (§4.8) |
| Widgety | Contact for test key | No | ☐ | ☐ | ☐ | **Cruise content.** Email request — longest lead time |
| Viator Partner API | Viator affiliate signup | No | ☐ | ☐ | ☐ | Basic Access is immediate. **Content only — no commission links** |
| LiteAPI / Nuitée | `liteapi.travel` | No | ☐ | ☐ | ☐ | Static content only. Breadth fallback — defer |
| Travelpayouts | `travelpayouts.com/developers/api` | No | ☐ | ☐ | ☐ | Data API token. **Price signal only.** Optional |
| ~~Booking.com Affiliate~~ | — | — | ⊘ | ⊘ | ⊘ | **Deprioritised — §1.3.5 rules out the affiliate links** |
| GeoNames | `geonames.org` | No | ☐ | n/a | ☐ | Free username |
| Open-Meteo | `open-meteo.com` | Commercial plan | ☐ | ☐ | ☐ | ⚠️ Free tier is non-commercial |
| Unsplash | `unsplash.com/developers` | No | ☐ | ☐ | ☐ | Already used on landing pages |

---

## 12. Sources

Researched September 3, 2026. Free tiers and quotas change — re-verify anything load-bearing at signup.

**Governing**
- *InteleTravel Training Manual, eighth edition* (US), supplied by Gyasi Story. Sections used: §3 (What InteleTravel Advisors Need To Know — PIN and agency codes, Mandatory Independent Marketing Review, licences and Seller of Travel, E&O), §5 (Booking Travel — booking directly with Travel Partners, Register My Bookings, "Beware 'Net' Rates", Payment and the Credit Card Authorization form), §6 (Commissions), §7 (Your Advisor Website), §8 (Sales Tools — logo rules), §16 (Marketing Code of Conduct — Golden Rule, Social Media Marketing Rules, Printed Material, Online Material). **Not committed to this repo** — third-party material; quoted under fair use in §1.3. **The binding document is the Independent Contractor Agreement**, which the manual defers to throughout and which has not been reviewed.

**Hotels**
- [Amadeus for Developers — Hotel APIs](https://developers.amadeus.com/self-service/category/hotels)
- [Amadeus Hotel Search API](https://developers.amadeus.com/self-service/category/hotels/api-doc/hotel-search)
- [Amadeus Self-Service pricing](https://developers.amadeus.com/pricing) · [Pricing developer guide](https://amadeus4dev.github.io/developer-guides/pricing/) · [Test environment data collection](https://developers.amadeus.com/self-service/apis-docs/guides/test-environment-data-collection-746)
- [Hotelbeds Developer portal](https://developer.hotelbeds.com/)
- [LiteAPI / Nuitée Connect](https://liteapi.travel/) · [API pricing & usage costs](https://docs.liteapi.travel/reference/api-pricing-usage-costs) · [Sandbox key guide](https://www.nuitee.com/blog/effortlessly-test-travel-api-integrations-with-liteapis-sandbox-key)
- [Booking.com Demand API](https://developers.booking.com/demand) · [Prerequisites](https://developers.booking.com/demand/docs/getting-started/prerequisites) · [Affiliate API access](https://affiliates.support.booking.com/kb/s/article/API-access)
- [Expedia Rapid — become a partner](https://partner.expediagroup.com/en-us/join-us/rapid-api)
- [Tripadvisor Content API overview](https://tripadvisor-content-api.readme.io/reference/overview) · [FAQ and pricing](https://tripadvisor-content-api.readme.io/reference/faq) · [Developer portal](https://developer-tripadvisor.com/content-api/)

**Cruise**
- [Widgety Cruise API](https://widgety.org/product/cruise-api/) · [Widgety API](https://widgety.org/product/api/)
- [Traveltek Cruise API](https://www.traveltek.com/travel-api-provider/cruise-api/) · [CruiseConnect](https://www.traveltek.com/products/cruiseconnect/)
- [CruiseDirect affiliate program](https://www.cruisedirect.com/affiliates)

**Tours & activities**
- [Viator Partner API docs](https://docs.viator.com/partner-api/) · [Levels of access](https://partnerresources.viator.com/travel-commerce/levels-of-access/) · [Affiliate API](https://partnerresources.viator.com/travel-commerce/affiliate/) · [Certification](https://partnerresources.viator.com/travel-commerce/certification/)

**Deals & price signal**
- [Travelpayouts Data API docs](https://travelpayouts-data-api.readthedocs.io/) · [API reference](https://travelpayouts.github.io/slate/) · [For developers and travel startups](https://support.travelpayouts.com/hc/en-us/articles/212246627-For-developers-and-travel-startups)

**Flights (adjacent)**
- [Duffel test mode](https://duffel.com/docs/api/overview/test-mode/duffel-airways)

**Places APIs (evaluated, §3.9)**
- [Google Places API usage and billing](https://developers.google.com/maps/documentation/places/web-service/usage-and-billing)
- [Foursquare pricing](https://foursquare.com/pricing/) · [upcoming Places API changes](https://docs.foursquare.com/developer/reference/upcoming-changes)
- [Geoapify Places API](https://www.geoapify.com/places-api/) · [OpenTripMap](https://dev.opentripmap.org/product)

**Open data**
- [Open-Meteo pricing](https://open-meteo.com/en/pricing) · [licence](https://open-meteo.com/en/licence) · [terms](https://open-meteo.com/en/terms)
- [US State Department travel advisories RSS](https://travel.state.gov/content/travel/en/rss.html)
