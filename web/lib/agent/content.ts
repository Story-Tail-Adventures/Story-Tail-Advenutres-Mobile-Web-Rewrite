/**
 * Every user-facing string on the agent surface.
 *
 * ── THE REGISTER IS DIFFERENT AND THAT IS DELIBERATE ────────────────────────────
 *
 * Design-System §2.4 lists nine places the rest-and-creation worldview shows up and every
 * one of them is client-facing; §2.5 says outright that it is "not displayed on every
 * screen". The agent surface is one of the more transactional ones §2.4 permits. No
 * scripture, no rest framing, no wonder language — Gyasi is not his own customer.
 *
 * Four of §2.6's five checks still bind, and the fifth is the strongest here:
 *
 *   "a friend who's done this 100 times" becomes GYASI'S OWN SHORTHAND — terse, concrete,
 *   numerate, imperative. "Would he say this out loud?" rules out conversion, funnel
 *   velocity, nurture, and every other word a CRM vendor would sell him.
 *
 *   The people in the worklist are NAMED PEOPLE, not records. "Maya & Daniel Carter", never
 *   "Opportunity #4821". The conviction that a trip is a gift shows up on this side as a
 *   refusal to abstract the traveler into a row.
 *
 * One place the worldview genuinely earns a line: the zero state. When nothing is urgent,
 * the honest agent-side expression of "rest is sacred" is to say so and stop — and then not
 * put a call to action underneath it.
 *
 * ── EVERY DEFERRAL NAMES ITS SECTION ────────────────────────────────────────────
 *
 * `*Deferred` keys are greppable on purpose, the way `WalletCopy` and `AccountCopy` are, so
 * the unbuilt set can be listed rather than remembered. `content.test.ts` asserts that every
 * one of them names a `§`.
 *
 * ── IN THE COPY-PARITY GATE ─────────────────────────────────────────────────────
 *
 * `.github/scripts/check_copy_parity.py` pairs this file with `AgentCopy.kt` under the
 * "agent 3.2" row, so every plain string listed there is compared BYTE FOR BYTE against its
 * Kotlin twin. Editing one side alone turns CI red — which is the point. The four function
 * entries (the greeting count, the currency note, the cancelled note, the excluded note)
 * take a count and pluralise, so the gate skips them and `content.test.ts` holds them
 * instead.
 *
 * The gate's key list is also SHORTER than this object on purpose: the pipeline and calendar
 * strings belong to screens §6.6 keeps web-only at MVP, so they have no Kotlin twin to
 * compare against. Adding one here does not oblige `AgentCopy.kt` to grow a matching
 * constant; moving one into the gate's list does.
 */

export const AGENT_COPY = {
  // ── Greeting ────────────────────────────────────────────────────────────
  // TIME-NEUTRAL ON PURPOSE. It renders on the line directly under the computed part of
  // day, so "this morning" sat beneath an "Afternoon," or "Evening," heading every hour
  // after noon. The zero state still says so and stops; it just no longer names an hour
  // the line above it has already contradicted.
  greetingZero: "Nothing urgent today.",
  greetingZeroSub: "The book is quiet. That is allowed.",
  greetingOne: "1 thing needs you today.",
  greetingMany: (n: number) => `${n} things need you today.`,

  // ── Sections ────────────────────────────────────────────────────────────
  proposalsTitle: "Proposals awaiting reply",
  proposalsEmpty: "Nothing out in client court.",
  paymentsTitle: "Payments to settle",
  paymentsEmpty: "No supplier payments due.",
  // "New inquiries", NOT "New leads". A quote request creates a trip in `inquiry` status
  // (BRD §6.5, amended 2026-09-09); the lead domain is specified and deliberately unbuilt.
  inquiriesTitle: "New inquiries",
  inquiriesEmpty: "No new inquiries.",
  departingTitle: "Travelers in next 30 days",
  departingEmpty: "Nobody travelling in the next month.",
  messagesTitle: "Recent messages",
  messagesEmpty: "No messages waiting.",

  // ── KPI states ──────────────────────────────────────────────────────────
  // Data-Model §8.8: the figure accumulates forward. An empty tile says why rather than
  // showing a zero-day average, which would be a claim where an absence is the truth.
  cycleTimeUnavailable: "Not enough history yet — this fills in as trips move to Booked.",
  // `others` IS A COUNT OF CURRENCIES, NOT OF TRIPS. It comes from `currency_count - 1`,
  // and the old sentence ("3 trips are priced in another currency") claimed a trip count
  // the caller has never held — three other currencies could be thirty trips. Say what the
  // number actually is.
  currencyNote: (dominant: string, others: number) =>
    `${dominant} only. Trips priced in ${others} other ${others === 1 ? "currency" : "currencies"} are not counted here.`,

  // ── Pipeline ────────────────────────────────────────────────────────────
  pipelineTitle: "Pipeline",
  pipelineSub: "Move a trip with the stage menu. Totals are summed live.",
  pipelineEmptyColumn: "Nothing here.",
  cancelledNote: (n: number) =>
    `${n} cancelled ${n === 1 ? "trip is" : "trips are"} not on the board. Cancelled is a status, not a stage.`,
  // What one COLUMN total left out, and it counts TRIPS — where `currencyNote`, which sits
  // above the whole board, counts CURRENCIES. Two numbers of different kinds on one screen
  // is why this one names its unit and stays to five words: the page-level sentence has
  // already explained the rule, so this only has to say how much of this column is missing
  // from this figure. It lived as a literal inside pipeline/page.tsx, where neither the
  // parity script nor `content.test.ts` could see it.
  excludedNote: (n: number) =>
    `+${n} ${n === 1 ? "trip in another currency" : "trips in other currencies"}`,
  stageMenuLabel: "Move stage",
  // THE 409 FALLBACK, and the only thing it is for. A conflict normally arrives with the
  // Edge Function's own sentence in `detail` and that sentence is preferred — it is written
  // next to the rule. This is what the agent reads when the 409 body is not parseable, and
  // a generic "try again in a moment" there would tell them to retry a write that will keep
  // failing until they reload. Its one consumer is `changeTripStage` in
  // `app/(agent)/agent/pipeline/actions.ts`, which must select it off `result.conflict` —
  // the typed flag `lib/supabase/edge.ts` carries — and never off a substring of `detail`.
  stageStale: "This trip moved since the board was loaded. Reload and try again.",
  stageFailed: "Could not move the trip. Try again in a moment.",

  // ── Calendar ────────────────────────────────────────────────────────────
  calendarTitle: "Calendar",
  calendarEmpty: "Nothing on the calendar this month.",
  calendarMonthLabel: "Month",
  calendarAgendaLabel: "Agenda",

  // ── Trip detail (§3.4.2) ────────────────────────────────────────────────
  tripComponentsEmpty: "No components added yet.",
  tripItineraryEmpty: "No itinerary drafted yet.",
  tripPaymentsEmpty: "No payments scheduled.",
  tripDocumentsEmpty: "No documents on file for this trip.",
  tripMessagesEmpty: "No messages on this trip yet.",
  tripActivityEmpty: "No activity recorded yet.",
  // A PLACEHOLDER, NOT AN EMPTY STATE, which is why it does not read like the six above.
  // Every placeholder in this codebase is one example-driven clause with a trailing ellipsis
  // — "Add a place — or a few, separated by commas", "Where were you, and what made it
  // stick?" — because it has to show the kind of thing that goes in the box. This key used
  // to open "No notes yet", which narrates a state the empty box has already made obvious
  // and costs the one line available to prompt anything.
  tripNotesPlaceholder: "Flight changes, a promise you made them, anything worth remembering…",

  // ── Trip detail · the two sidebar cards and the at-a-glance grid ────────
  costCommissionTitle: "Cost & commission",
  clientTotalLabel: "Client total",
  paidSoFarLabel: "Paid so far",
  commissionLabel: "Commission",
  glanceTripType: "Trip type",
  glanceDestination: "Destination",
  glanceTravelers: "Travelers",
  glanceDates: "Dates",
  glanceCardOnFile: "Card on file",
  glanceLastActivity: "Last activity",
  glanceCancellationReason: "Cancellation reason",
  glanceRefundStatus: "Refund status",
  glanceNotSet: "Not set",
  glanceNoCard: "None on file",
  glanceNoActivity: "No activity yet",
  // Each names what it is waiting on, matching the *Deferred convention above — these are
  // per-action, not per-section, because §3.4.2's header offers four buttons and only one
  // (Mark booked, via the existing stage-change write) has anywhere to go yet.
  duplicateTripDeferred: "Duplicating a trip arrives with §3.4.4.",
  clientPreviewDeferred: "Client preview arrives with §3.3.2.",
  sendProposalDeferred: "Sending a proposal arrives with §3.5.",
  notesStale: "This trip changed since you opened it. Reload and try again.",
  notesFailed: "Could not save the note. Try again in a moment.",
  notesSaveLabel: "Save note",
  notesSavedLabel: "Saved",

  // ── Deferrals. Every one names the section that builds it. ──────────────
  // `tripDetailDeferred` lived here until §3.4.2 shipped. Every worklist section that
  // rendered it now links its rows straight into the trip, so the string had no call site
  // left — a deferral that names a section which has since been built is worse than no
  // sentence at all.
  clientDetailDeferred: "Client detail arrives with §3.3.",
  messagesDeferred: "Agent messaging arrives with §3.10.",
  quickAddTripDeferred: "Creating trips arrives with §3.4.",
  quickAddClientDeferred: "Creating clients arrives with §3.3.",
  // The one that is not "not yet". It explains where the thing actually is.
  leadsDeferred:
    "There is no Leads inbox. A quote request creates a trip in Inquiry instead — it is in New inquiries above (§3.8).",
  availabilityDeferred:
    "Blocking time arrives with §3.12, which is where the time-off shape gets defined.",
  commissionDeferred: "Commission tracking arrives with §3.7.",
  reportsDeferred: "Reporting arrives with §3.11.",
} as const;

/** The greeting line, derived rather than written. */
export function needsYouLine(count: number): string {
  if (count === 0) return AGENT_COPY.greetingZero;
  if (count === 1) return AGENT_COPY.greetingOne;
  return AGENT_COPY.greetingMany(count);
}
