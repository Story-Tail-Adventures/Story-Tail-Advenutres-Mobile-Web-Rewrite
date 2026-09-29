package com.storytail.adventures.domain.agent

/**
 * Every user-facing string on the agent's mobile surface. The KMP twin of
 * `web/lib/agent/content.ts`, registered in `.github/scripts/check_copy_parity.py` as
 * "agent 3.2".
 *
 * ── THE REGISTER, which is not the client surface's ─────────────────────────────
 *
 * Design-System §2.4 lists nine places the rest-and-creation worldview shows up and every
 * one is client-facing; §2.5 says outright it is "not displayed on every screen". This is
 * one of the more transactional surfaces §2.4 permits. No scripture, no rest framing, no
 * wonder language — Gyasi is not his own customer.
 *
 * What still binds is §2.6 check 5, and it binds hardest here: would he say this out loud?
 * That rules out conversion, funnel velocity, nurture, and every other word a CRM vendor
 * would sell him. And the people in the worklist stay NAMED PEOPLE — the conviction that a
 * trip is a gift shows up on this side as a refusal to abstract the traveler into a row.
 *
 * One line earns the worldview: the zero state. When nothing is urgent, say so and stop.
 *
 * ── FLAT `const val` ONLY, AND THAT IS MECHANICAL ───────────────────────────────
 *
 * check_copy_parity.py's Kotlin reader terminates at the first LINE-LEADING `}`. A `fun`, a
 * `val listOf(...)`, or any nested brace inside this object silently truncates the map and
 * takes every key after it out of the gate — covered, apparently, and unchecked in fact.
 * AccountCopy and WalletCopy both carry this warning. Derivations live in
 * `WorklistSections.kt`, below this object's closing brace and in a different file.
 */
object AgentCopy {
    // Greeting
    //
    // TIME-NEUTRAL, AND THAT IS THE WHOLE POINT OF THE WORDING. This line renders directly
    // under the part-of-day heading the screen computes in the agent's own zone, so
    // "this morning" contradicted an "Afternoon," or "Evening," heading at every hour after
    // noon. Threading PartOfDay in here is not the fix: the parity gate compares flat
    // constants, and WorklistSections.kt documents a clock-free contract.
    const val GREETING_ZERO = "Nothing urgent today."
    const val GREETING_ZERO_SUB = "The book is quiet. That is allowed."
    const val GREETING_ONE = "1 thing needs you today."

    // Sections
    const val PROPOSALS_TITLE = "Proposals awaiting reply"
    const val PROPOSALS_EMPTY = "Nothing out in client court."
    const val PAYMENTS_TITLE = "Payments to settle"
    const val PAYMENTS_EMPTY = "No supplier payments due."
    const val INQUIRIES_TITLE = "New inquiries"
    const val INQUIRIES_EMPTY = "No new inquiries."
    const val DEPARTING_TITLE = "Travelers in next 30 days"
    const val DEPARTING_EMPTY = "Nobody travelling in the next month."
    const val MESSAGES_TITLE = "Recent messages"
    const val MESSAGES_EMPTY = "No messages waiting."

    // Shell
    //
    // NOT REGISTERED IN THE PARITY GATE YET, and deliberately said out loud: the web agent
    // shell has no sign-out of its own (a browser has the client account page one URL away),
    // so there is nothing in `web/lib/agent/content.ts` to pair this with. When one lands it
    // takes this wording and `check_copy_parity.py` gains the row.
    const val SIGN_OUT = "Sign out"

    // KPI states
    const val CYCLE_TIME_UNAVAILABLE =
        "Not enough history yet — this fills in as trips move to Booked."

    // Deferrals. Every one names the section that builds it — and once a section half
    // ships, the SCREEN that builds it: "§3.3" stopped being a useful answer when
    // §3.3.1 landed and the roster existed while detail and create did not.
    // TRIP_DETAIL_DEFERRED lived here until §3.4.2 shipped on Compose. It was the last
    // deferral on this object with a render site — three worklist sections and the client
    // detail Trips tab, four rows that had nowhere to go. All four now push
    // AppRoute.AgentTripDetail, so the sentence has no call site and a deferral naming a
    // section that has since been built is worse than no sentence at all.
    //
    // It was also the string that outlived its web twin: `tripDetailDeferred` went from
    // content.ts when §3.4.2 shipped in the browser, and the parity map records why the
    // pair was broken rather than re-made. That asymmetry is now closed from the other end.
    //
    // CLIENT_DETAIL_DEFERRED lived here until §3.3.2 shipped, and never had a call site.
    const val MESSAGES_DEFERRED = "Agent messaging arrives with §3.10."
    // QUICK_ADD_TRIP_DEFERRED lived here until §3.4.3 shipped, and followed
    // QUICK_ADD_CLIENT_DEFERRED out for the same reason: §3.2.1 on Compose has no quick-add
    // at all, by decision, so neither ever had a render site on this side. The web control
    // they paired with is a two-entry menu now.
    // QUICK_ADD_CLIENT_DEFERRED lived here until §3.3.9 shipped. It never had a render
    // site on this side — §3.2.1 on Compose has no quick-add at all, by decision — and
    // the web control it paired with is now a link to /agent/clients/new.
    const val LEADS_DEFERRED =
        "There is no Leads inbox. A quote request creates a trip in Inquiry instead — it is in New inquiries above (§3.8)."
    const val AVAILABILITY_DEFERRED =
        "Blocking time arrives with §3.12, which is where the time-off shape gets defined."

    // ── Screen 3.4.2 Trip Detail, all eight tabs, read-only ─────────────────────
    //
    // EVERY STRING BELOW IS PAIRED with the same key on AGENT_COPY, because the web build
    // renders every one of them on the same screen. That is unusual on this object — most
    // of §3.2's phone copy has no twin because the desk screen it belongs to is web-only —
    // and it is why §3.4.2 needed no new register: the advisor reads the same words about
    // the same trip on both surfaces, and the only difference is what they can DO there.
    //
    // The eight TAB LABELS are not here. The web reads those from its own registry
    // (`tripTabs.ts`) rather than from AGENT_COPY, exactly as §3.3's six come from
    // `clientTabs.ts` — so there is nothing on that side for the parity map to point at.
    // The Compose registry is AGENT_TRIP_DETAIL_TABS, beside the other derivations.
    const val TRIP_COMPONENTS_EMPTY = "No components added yet."
    const val TRIP_ITINERARY_EMPTY = "No itinerary drafted yet."
    const val TRIP_PAYMENTS_EMPTY = "No payments scheduled."
    // NOT the same state as the line above, and saying so is the point. A trip whose
    // balance has cleared has nothing left to settle, and "No payments scheduled." tells an
    // advisor the opposite of the truth about a trip that has been paid for in full.
    const val TRIP_PAYMENTS_ALL_SETTLED = "All payments settled."
    const val TRIP_DOCUMENTS_EMPTY = "No documents on file for this trip."
    const val TRIP_MESSAGES_EMPTY = "No messages on this trip yet."
    const val TRIP_ACTIVITY_EMPTY = "No activity recorded yet."

    // THE THREE FIGURES, WITHOUT THE CARD TITLE. The desk screen wraps them in a
    // "Cost & commission" card in the sidebar; a phone gets one row under the header, and a
    // heading over three labelled numbers is a line of a 375pt screen spent saying what the
    // labels already say. `costCommissionTitle` therefore has no twin here — the parity map
    // lists only what BOTH surfaces render.
    const val CLIENT_TOTAL_LABEL = "Client total"
    const val PAID_SO_FAR_LABEL = "Paid so far"
    const val COMMISSION_LABEL = "Commission"

    // `glanceTravelers` and `glanceDates` are deliberately absent, for the same reason. The
    // header already reads "Dec 4 – 11 · 6 travelers"; repeating both two inches below it
    // is redundancy a phone cannot afford, and the desk grid has four columns to fill.
    const val GLANCE_TRIP_TYPE = "Trip type"
    const val GLANCE_DESTINATION = "Destination"
    const val GLANCE_CARD_ON_FILE = "Card on file"
    const val GLANCE_LAST_ACTIVITY = "Last activity"
    const val GLANCE_CANCELLATION_REASON = "Cancellation reason"
    const val GLANCE_REFUND_STATUS = "Refund status"
    const val GLANCE_REFUND_DETAIL = "Refund detail"
    const val GLANCE_NOT_SET = "Not set"
    const val GLANCE_NO_CARD = "None on file"
    const val GLANCE_NO_ACTIVITY = "No activity yet"

    // One sentence for both causes — deleted, and belonging to another advisor — because
    // the accessor deliberately cannot tell them apart, and that is what stops trip ids
    // being enumerated. It must not read as a fault on our side.
    const val TRIP_NOT_FOUND_TITLE = "No such trip"
    const val TRIP_NOT_FOUND_BODY = "It may have been deleted, or it belongs to another advisor."
    const val TRIP_NOT_FOUND_ACTION = "Back to the worklist"

    // ── §3.4.2 on a phone only. No web twin, and each says why ──────────────────
    //
    // NOT A DEFERRAL. Every one of these names a screen that is BUILT, in a browser, and
    // that §6.6 keeps there: "The full pipeline, reporting, and template management
    // features remain web-only at MVP." The distinction matters for the wording — a
    // deferral apologises for something missing, and none of this is missing. It is
    // somewhere else on purpose, and an advisor holding a phone should be told where rather
    // than shown a disabled row of buttons.
    const val TRIP_READ_ONLY_NOTE =
        "Building, pricing and cancelling this trip live on the web app. This is the read."
    const val TRIP_ITINERARY_WEB_NOTE = "Writing the day-by-day is §3.4.14, on the web app."
    // The web's Notes tab is a textarea, so its empty state IS the empty box and its
    // placeholder. A read-only tab has no box, so it needs a sentence of its own.
    const val TRIP_NOTES_EMPTY = "Nothing written about this trip yet."
    // The two states of `itinerary.published_at`, which is the fact an advisor most needs
    // before telling a client to go and look. The web derives the same two words inline in
    // `loadItinerary`; they are literals there rather than copy, so there is nothing to
    // pair with and these are the Compose side's own.
    const val ITINERARY_PUBLISHED = "Published"
    const val ITINERARY_DRAFT = "Draft"
    // NOT "Back to the worklist", which TRIP_NOT_FOUND_ACTION already says. This screen is
    // pushed from TWO places — the worklist's three trip sections and the client detail's
    // Trips tab — and `nav.pop()` returns to whichever it was. A label naming one of them
    // would be wrong half the time. The not-found panel is the one place the destination is
    // certain, because there is nothing to stay on, and that is where the specific wording
    // renders.
    const val TRIP_BACK = "Back"
    // THE TOP BAR SAYS "Trip", NOT THE TRIP'S NAME, which is where this diverges from
    // §3.3.2's bar. `AgentTopBar` is `maxLines = 1` with a Sign out button beside it, so
    // "Anniversary Week in Negril" arrives as "Anniversary Week i…" — and the H1 two lines
    // below it already carries the whole thing untruncated. A person's name fits that bar;
    // a trip title does not, and a truncated duplicate is worse than a category.
    const val TRIP_TITLE = "Trip"
}
