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
    const val TRIP_DETAIL_DEFERRED = "Trip detail arrives with §3.4."
    // CLIENT_DETAIL_DEFERRED lived here until §3.3.2 shipped. It had no call site on this
    // side either — only TRIP_DETAIL_DEFERRED is rendered, on three worklist sections —
    // and a deferral naming a built section is worse than no sentence.
    const val MESSAGES_DEFERRED = "Agent messaging arrives with §3.10."
    const val QUICK_ADD_TRIP_DEFERRED = "Creating trips arrives with §3.4."
    // QUICK_ADD_CLIENT_DEFERRED lived here until §3.3.9 shipped. It never had a render
    // site on this side — §3.2.1 on Compose has no quick-add at all, by decision — and
    // the web control it paired with is now a link to /agent/clients/new.
    const val LEADS_DEFERRED =
        "There is no Leads inbox. A quote request creates a trip in Inquiry instead — it is in New inquiries above (§3.8)."
    const val AVAILABILITY_DEFERRED =
        "Blocking time arrives with §3.12, which is where the time-off shape gets defined."
}
