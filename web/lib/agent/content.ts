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
  // NOT the same state as the line above, and saying so is the point. The sidebar hides
  // paid milestones, so a trip whose balance has cleared has nothing left to list — and
  // reporting "No payments scheduled." there tells an advisor the opposite of the truth
  // about a trip that has been paid for in full.
  tripPaymentsAllSettled: "All payments settled.",
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
  // REPOINTED when §3.3.2 shipped. This said "§3.3.2" and that section is now built —
  // and building it delivered no client preview, because previewing a TRIP as the
  // traveler sees it is §3.5.6 Itinerary Preview, not the client's CRM record. A
  // deferral aimed at the wrong section is worse than a vague one: it comes due and
  // nothing arrives.
  clientPreviewDeferred: "Client preview arrives with §3.5.6.",
  sendProposalDeferred: "Sending a proposal arrives with §3.5.",
  notesStale: "This trip changed since you opened it. Reload and try again.",
  notesFailed: "Could not save the note. Try again in a moment.",
  notesSaveLabel: "Save note",
  notesSavedLabel: "Saved",
  // One sentence for both causes — deleted, and belonging to another advisor — because the
  // accessor deliberately cannot tell them apart, and that is what stops trip ids being
  // enumerated. It must not read as a fault on our side: nothing went wrong and there is
  // nothing to retry.
  tripNotFoundTitle: "No such trip",
  tripNotFoundBody: "It may have been deleted, or it belongs to another advisor.",
  tripNotFoundAction: "Back to the worklist",

  // ── Deferrals. Every one names the section that builds it. ──────────────
  // `tripDetailDeferred` lived here until §3.4.2 shipped. Every worklist section that
  // rendered it now links its rows straight into the trip, so the string had no call site
  // left — a deferral that names a section which has since been built is worse than no
  // sentence at all.
  // Sharpened when §3.3.1 shipped: "§3.3" named a section that now half exists, so each
  // deferral points at the SCREEN that builds it rather than the section it sits in.
  //
  // `clientDetailDeferred` lived here until §3.3.2 shipped. The roster's rows now link
  // straight into the client, so the string had no call site left — and a deferral naming a
  // section which has since been built is worse than no sentence at all. Same removal
  // `tripDetailDeferred` got when §3.4.2 landed.
  messagesDeferred: "Agent messaging arrives with §3.10.",
  quickAddTripDeferred: "Creating trips arrives with §3.4.",
  quickAddClientDeferred: "Creating clients arrives with §3.3.9.",
  // The one that is not "not yet". It explains where the thing actually is.
  leadsDeferred:
    "There is no Leads inbox. A quote request creates a trip in Inquiry instead — it is in New inquiries above (§3.8).",
  availabilityDeferred:
    "Blocking time arrives with §3.12, which is where the time-off shape gets defined.",
  commissionDeferred: "Commission tracking arrives with §3.7.",
  reportsDeferred: "Reporting arrives with §3.11.",
} as const;

/**
 * Screen 3.3.1's strings, kept separate from AGENT_COPY so the roster's copy can be paired
 * with Compose independently — `.github/scripts/check_copy_parity.py` maps one web const to
 * one Kotlin object, and §3.2's table already covers exactly the set both surfaces render.
 *
 * SAME REGISTER AS AGENT_COPY: terse, numerate, Gyasi's own shorthand, named people rather
 * than records. The zero state is the one line that carries any warmth, and it still does
 * not put a call to action underneath itself.
 */
export const CLIENT_COPY = {
  title: "Clients",
  // The prototype's header reads "68 active · 14 in motion · 4 leads to qualify." Those are
  // three live counts, so the sentence is assembled from them rather than stored whole.
  subtitleActive: "active",
  subtitleInMotion: "in motion",
  // "Leads" survives in COPY while the field stays inquiry_count — §3.2's rule. Gyasi says
  // "lead" out loud; the schema must not.
  subtitleToQualify: "leads to qualify",

  searchLabel: "Search clients",
  searchPlaceholder: "Search by name, email, trip…",

  filterStatusLabel: "Status",
  filterActive: "Active",
  filterArchived: "Archived",
  filterTagsLabel: "Tags",
  filterClear: "Clear filters",

  colClient: "Client",
  colLastTrip: "Last trip",
  colNextTrip: "Next trip",
  colLifetime: "Lifetime",
  colTags: "Tags",

  noEmail: "No email on file",
  noTrip: "—",
  noLifetime: "—",
  travellingNow: "Now",

  // The money note §3.2's rule requires wherever one figure stands for several currencies.
  currencyNoteOne:
    "One client banks in more than one currency. Their lifetime figure covers their most-used one.",

  // ── Empty states. The prototype draws none, so all of these are written here. ──
  emptyTitle: "No clients yet",
  emptyBody: "The first one arrives when you add them, or when a quote request comes in.",
  emptyFilteredTitle: "Nothing matches",
  emptyFilteredBody: "Try a different search, or clear the filters.",
  emptyArchivedTitle: "Nothing archived",
  emptyArchivedBody: "Archived clients keep their trips and their history. None are here yet.",

  paginationPrev: "Previous",
  paginationNext: "Next",

  // Named per-action, matching the *Deferred convention: the roster's row menu offers three
  // things and none of them has anywhere to go until §3.3.2 and §3.3.9 land.
  rowOpenDeferred: "Client detail arrives with §3.3.2.",
  rowEditDeferred: "Editing a client arrives with §3.3.10.",
  rowArchiveDeferred: "Archiving a client arrives with §3.3.12.",
  mergeDeferred: "Merging clients arrives with §3.9, alongside the account-admin tools it shares a screen with.",
  bulkDeferred: "Bulk actions arrive with §3.3.9; bulk messaging needs §3.10.",

  // ── §3.3.2 – §3.3.8, the detail surface ────────────────────────────────
  backToRoster: "All clients",
  notFoundTitle: "No such client",
  notFoundBody: "It may have been archived, merged, or it belongs to another advisor.",
  notFoundAction: "Back to clients",
  archivedBanner: "Archived. They keep their trips and their history.",

  // Overview
  snapshotTitle: "Snapshot",
  preferencesTitle: "Preferences",
  householdTitle: "Household",
  emergencyTitle: "In an emergency",
  statLifetime: "Lifetime",
  statTrips: "Trips",
  statCommission: "Commission",
  statLastContact: "Last contact",
  labelPhone: "Phone",
  labelEmail: "Email",
  labelAddress: "Address",
  labelBirthday: "Date of birth",
  labelDates: "Important dates",
  labelBudget: "Budget",
  labelLoyalty: "Loyalty",
  noPreferences: "Nothing recorded yet.",
  noHousehold: "No one else on file.",
  noAddress: "No address on file",
  passportExpiringSoon: "Expires within six months",

  // Trips
  tripsActive: "Active",
  tripsPast: "Past",
  tripsCancelled: "Cancelled",
  tripsEmpty: "No trips yet.",
  tripCommissionPrefix: "Comm",

  // Messages
  threadsEmpty: "No conversations yet.",
  threadUnreadLabel: "unread",

  // Documents
  documentsEmpty: "No documents on file for this client.",
  documentSensitive: "Sensitive",

  // Notes
  noteComposerEyebrow: "NEW NOTE · INTERNAL ONLY",
  noteComposerPlaceholder: "Internal note (the client doesn't see this)…",
  noteSave: "Save note",
  noteSaving: "Saving…",
  noteSaved: "Saved",
  noteEdit: "Edit",
  noteDelete: "Delete",
  noteCancel: "Cancel",
  noteEditedMarker: "edited",
  notesEmpty: "No notes yet. This is where you keep what you'd otherwise try to remember.",
  noteFailed: "That didn't save. Try again in a moment.",
  noteEmptyRefused: "A note needs something in it.",

  // Activity
  activityEmpty: "Nothing recorded yet.",
  activityNote:
    "Sign-ins are on the account's own activity screen, which arrives with §3.9.6.",

  // Per-action deferrals on the detail surface.
  accountAdminDeferred: "Account admin arrives with §3.9.",
  editClientDeferred: "Editing a client arrives with §3.3.10.",
  newTripForClientDeferred: "Creating trips arrives with §3.4.3.",
  messageClientDeferred: "Agent messaging arrives with §3.10.",
  openThreadDeferred: "Opening a thread arrives with §3.10.2.",
  documentDownloadDeferred: "Downloading a document arrives with §3.3.6's upload path.",
} as const;

/** "27 active · 5 in motion · 1 lead to qualify." Assembled, because all three are live. */
export function rosterSubtitle(active: number, inMotion: number, toQualify: number): string {
  const parts = [`${active} ${CLIENT_COPY.subtitleActive}`, `${inMotion} ${CLIENT_COPY.subtitleInMotion}`];
  if (toQualify > 0) {
    parts.push(
      toQualify === 1 ? "1 lead to qualify" : `${toQualify} ${CLIENT_COPY.subtitleToQualify}`,
    );
  }
  return `${parts.join(" · ")}.`;
}

/** The greeting line, derived rather than written. */
export function needsYouLine(count: number): string {
  if (count === 0) return AGENT_COPY.greetingZero;
  if (count === 1) return AGENT_COPY.greetingOne;
  return AGENT_COPY.greetingMany(count);
}
