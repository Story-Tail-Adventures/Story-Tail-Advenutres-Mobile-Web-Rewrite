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
 * ── NOT YET IN THE COPY-PARITY GATE ─────────────────────────────────────────────
 *
 * `.github/scripts/check_copy_parity.py` pairs a web module with a KMP one. There is no
 * agent Compose surface yet; when §3.2's mobile Worklist lands, this file and its
 * `AgentCopy.kt` twin get a `MESSAGE_TABLES` row. Until then `content.test.ts` is the only
 * thing holding these strings, and the gate's own header warns that an unregistered module
 * is a silent gap rather than a covered one.
 */

export const AGENT_COPY = {
  // ── Greeting ────────────────────────────────────────────────────────────
  greetingZero: "Nothing urgent this morning.",
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
  currencyNote: (dominant: string, others: number) =>
    `${dominant} only. ${others} ${others === 1 ? "trip is" : "trips are"} priced in another currency and not counted here.`,

  // ── Pipeline ────────────────────────────────────────────────────────────
  pipelineTitle: "Pipeline",
  pipelineSub: "Move a trip with the stage menu. Totals are summed live.",
  pipelineEmptyColumn: "Nothing here.",
  cancelledNote: (n: number) =>
    `${n} cancelled ${n === 1 ? "trip is" : "trips are"} not on the board. Cancelled is a status, not a stage.`,
  stageMenuLabel: "Move stage",
  stageStale: "This trip moved since the board was loaded. Reload and try again.",
  stageFailed: "Could not move the trip. Try again in a moment.",

  // ── Calendar ────────────────────────────────────────────────────────────
  calendarTitle: "Calendar",
  calendarEmpty: "Nothing on the calendar this month.",
  calendarMonthLabel: "Month",
  calendarAgendaLabel: "Agenda",

  // ── Deferrals. Every one names the section that builds it. ──────────────
  tripDetailDeferred: "Trip detail arrives with §3.4.",
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
