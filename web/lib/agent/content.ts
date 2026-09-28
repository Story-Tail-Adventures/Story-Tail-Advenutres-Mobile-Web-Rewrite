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
  // ── Pipeline ────────────────────────────────────────────────────────────
  pipelineTitle: "Pipeline",
  pipelineSub: "Move a trip with the stage menu. Totals are summed live.",
  pipelineEmptyColumn: "Nothing here.",
  cancelledNote: (n: number) =>
    `${n} cancelled ${n === 1 ? "trip is" : "trips are"} not on the board. Cancelled is a status, not a stage.`,
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
  glanceRefundDetail: "Refund detail",
  glanceNotSet: "Not set",
  glanceNoCard: "None on file",
  glanceNoActivity: "No activity yet",
  // §3.4.4. "Build" rather than "Edit components", which is what the Screen Inventory calls
  // the entry point: an advisor opening an empty trip is not editing anything yet, and the
  // word that covers both is the shorter one.
  openBuilder: "Build",
  editComponents: "Edit components",
  editSchedule: "Edit schedule",
  editItinerary: "Write the itinerary",
  // Each names what it is waiting on, matching the *Deferred convention above — these are
  // per-action, not per-section, because §3.4.2's header offers four buttons and only one
  // (Mark booked, via the existing stage-change write) has anywhere to go yet.
  // REPOINTED when §3.4.4 shipped, for exactly the reason the note under
  // `clientPreviewDeferred` gives. This said "§3.4.4", and §3.4.4 is the builder — its
  // Screen-Inventory entry lists add, reorder, edit, save draft and preview proposal, and
  // not one word about duplicating. The screen that copies a trip is §3.4.13, whose entry
  // says "create from existing trip" in as many words. A deferral aimed at the wrong
  // section comes due and nothing arrives.
  duplicateTripDeferred: "Duplicating a trip arrives with §3.4.13, alongside the template library it shares the mechanism with.",

  // ── §3.4.16 Cancel trip ─────────────────────────────────────────────────
  cancelTripOpen: "Cancel trip",
  cancelTripEyebrow: "CANCEL TRIP",
  cancelTripEditEyebrow: "CANCELLATION DETAILS",
  // Says what this does and, more usefully, what it does NOT: the stage can be moved back
  // from the board, and the phone call to the supplier cannot be un-made. An advisor who
  // thinks this button cancels the booking will not go and cancel the booking.
  cancelTripBody:
    "This marks the trip cancelled and tells the client's screen why. It does not contact any supplier, move any money, or release the card — those are still yours to do.",
  cancelTripEditBody:
    "Correct what the client reads. The trip stays cancelled; only these details change.",
  // MANDATORY, and the reason is in the label rather than discovered on submit. The Edge
  // Function refuses a cancellation with no reason because §2.2.10 renders it to the
  // traveler, and a cancellation that cannot say why is a worse row than none.
  cancelReasonLabel: "Reason — the client sees this",
  cancelReasonPlaceholder: "e.g. Family schedule conflict",
  cancelReasonRequired: "A cancelled trip needs a reason. The client's screen shows it.",
  cancelRefundLabel: "Refund (optional)",
  cancelRefundUnset: "Not stated yet",
  cancelRefundDetailLabel: "Refund detail (optional)",
  cancelRefundDetailPlaceholder: "e.g. Refunded $1,640 on Feb 12; $240 credit through Dec 2027",
  // Why the detail box exists beside a four-option picker, said once where it is used.
  cancelRefundDetailHelp:
    "\u201cPartial\u201d cannot carry an amount, a date or a credit that expires. This can.",
  cancelImpactTitle: "WHAT THIS CHANGES",
  cancelImpactNone: "Nothing is attached to this trip yet, so nothing else changes.",
  cancelConfirm: "Cancel trip",
  cancelSaveDetails: "Save details",
  cancelKeep: "Keep trip",
  cancelSaving: "Saving\u2026",
  cancelFailed: "That did not save. Try again in a moment.",
  cancelStale: "This trip moved since the page loaded. Reload and try again.",

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

  // ── Empty states. The prototype draws none, so all of these are written here. ──
  emptyTitle: "No clients yet",
  emptyBody: "The first one arrives when you add them, or when a quote request comes in.",
  emptyFilteredTitle: "Nothing matches",
  emptyFilteredBody: "Try a different search, or clear the filters.",
  emptyArchivedTitle: "Nothing archived",
  emptyArchivedBody: "Archived clients keep their trips and their history. None are here yet.",

  paginationPrev: "Previous",
  paginationNext: "Next",

  // FOUR DEFERRALS CAME DUE AND ARE GONE, not rewritten: `rowOpenDeferred`,
  // `rowEditDeferred`, `rowArchiveDeferred` and `bulkDeferred` all named sections that now
  // exist, and none had a call site left once the rows became links and the bulk bar shipped.
  // Same removal `clientDetailDeferred` got. `mergeDeferred` stays because §3.9 really is
  // still ahead.
  mergeDeferred: "Merging clients arrives with §3.9, alongside the account-admin tools it shares a screen with.",

  // ── §3.3.1's bulk-tag bar ──────────────────────────────────────────────
  bulkSelectAll: "Select every client on this page",
  bulkSelectRow: "Select this client",
  bulkLegend: "Tag the clients you've ticked",
  bulkTagLabel: "Tag",
  bulkTagPlaceholder: "vip, honeymoon, repeat…",
  bulkAdd: "Add tag",
  bulkRemove: "Remove tag",
  bulkWorking: "Saving…",
  bulkNoSelection: "Tick at least one client first.",
  bulkNoTag: "Type a tag first.",
  bulkFailed: "That didn't save. Try again in a moment.",

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
  messageClientDeferred: "Agent messaging arrives with §3.10.",
  openThreadDeferred: "Opening a thread arrives with §3.10.2.",
  documentDownloadDeferred: "Downloading a document arrives with §3.3.6's upload path.",

  // ── §3.3.9 / §3.3.10 / §3.3.12, the write path ─────────────────────────
  newClientTitle: "New client",
  newClientSub: "Required: a name and an email. Everything else can be added later.",
  editClientTitle: "Edit",
  editClientSub: "Email and phone changes are what the portal and every update use.",
  formSave: "Save",
  formSaving: "Saving…",
  formCancel: "Cancel",
  saveFailed: "That didn't save. Nothing's lost — give it another try.",
  saveStale: "This client changed since you opened it. Reload and try again.",
  duplicateEmail: "You already have a client with that email.",
  duplicateEmailLink: "Open the record you already have",

  groupBasics: "Who they are",
  groupContact: "How to reach them",
  groupAddress: "Mailing address",
  groupTags: "Tags",
  groupDates: "Dates worth remembering",
  groupNotes: "A note to yourself",

  labelFirstName: "First name",
  labelLastName: "Last name",
  labelPreferredName: "Goes by",
  hintPreferredName: "What you'd actually call them. Used everywhere their name appears.",
  labelDateLabel: "What it is",
  labelDateValue: "Date",
  labelDateRecurring: "Every year",
  addDate: "Add a date",
  removeDate: "Remove",
  hintDates: "Birthdays, anniversaries, a passport renewal — anything worth a nudge.",
  hintTags: "Your own shorthand. Type a new one or pick one you've used before.",
  addTag: "Add",
  newTagPlaceholder: "New tag",
  hintNotes: "Only you see this. It shows on their Snapshot card.",

  // The prototype draws a live "Send a portal invitation with welcome template?" toggle.
  // Nothing in the repository creates a client_invite row and no email provider is wired,
  // and issuing a portal invitation is handing out a bearer credential — it wants its own
  // expiry, revocation and rate-limit thinking rather than a checkbox on a create form.
  inviteDeferred:
    "Sending a portal invitation arrives with §3.9.3, where emailing a client a one-time link gets built.",
  inviteLabel: "Send a portal invitation",
  // FOUR DEFERRALS CAME DUE WITH §3.4.3 AND ARE DELETED, not reworded: quickAddTripDeferred,
  // newTripForClientDeferred, saveAndTripDeferred and newTripDeferred all named a screen
  // that now exists, and every one of their controls is live. Same removal
  // clientDetailDeferred got. `duplicateTripDeferred` stays, repointed at §3.4.13 — see
  // its own note; §3.4.4 shipped without a duplicate action because it never owned one.
  saveAndTrip: "Save & create trip",

  archiveTitle: "Archive",
  archiveEyebrow: "ARCHIVE CLIENT",
  archiveBody:
    "Hides them from the active roster. Past trips and the audit log remain. You can restore anytime.",
  archiveReasonLabel: "Reason (optional)",
  archiveReasonPlaceholder: "e.g. Cold lead · no reply for six months",
  archiveConfirm: "Archive",
  restoreTitle: "Restore",
  restoreEyebrow: "RESTORE CLIENT",
  restoreBody: "Puts them back on the active roster. Nothing else about the record changes.",
  restoreConfirm: "Restore",
  moreActions: "More actions",
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

/**
 * §3.4.3 Create New Trip.
 *
 * FIVE TYPES, NOT THE PROTOTYPE'S SIX. `A343_NewTripType` draws a "Honeymoon" tile and
 * `trip_type` has no such value — a honeymoon is an all-inclusive or a custom trip. Third
 * invented field found in §3.4, after the dining component sheet and Trip Detail's
 * "Booking source".
 */
export const NEW_TRIP_COPY = {
  title: "New trip",
  subtitle: "Pick a shape and a client. Everything else comes next.",

  typeLabel: "What kind of trip?",
  typeCruise: "Cruise",
  typeCruiseHint: "A sailing, with or without flights around it.",
  typeAllInclusive: "All-inclusive resort",
  typeAllInclusiveHint: "One property, one price. Honeymoons usually live here.",
  typeMultiDestination: "Multi-destination",
  typeMultiDestinationHint: "More than one stop, stitched together.",
  typeGroup: "Group trip",
  typeGroupHint: "Several households travelling as one party.",
  typeCustom: "Custom",
  typeCustomHint: "Anything the other four do not describe.",

  clientLabel: "Who is it for?",
  clientHint: "Search your own clients by name or email.",
  clientPlaceholder: "Start typing a name…",
  clientRequired: "Pick a client first.",
  clientMissing: "That client is not on your book any more. Pick another.",
  noClients: "No clients match that.",

  titleLabel: "What should it be called?",
  titleHint: "The advisor-facing name. The traveler sees the itinerary title, not this.",
  titlePlaceholder: "Sandals honeymoon · Aug 2026",
  titleRequired: "Give the trip a name.",

  travelersLabel: "Travelers",
  travelersHint: "A starting guess. The builder corrects it.",

  submit: "Create trip",
  submitting: "Creating…",
  cancel: "Cancel",
  failed: "That didn't save. Try again in a moment.",

  // §3.4.13 is Stage 4 and `trip_template` has no rows, so the prototype's "12 templates"
  // counts have nothing behind them. Disabled with its reason rather than offering an empty
  // list — §3.2.1's rule.
  templateDeferred: "Starting from a template arrives with §3.4.13.",
  templateLabel: "Start from a template",

  // A trip is born in `inquiry` and the screen says so, because an advisor who expected
  // "booked" would otherwise go looking for the stage control.
  startsAsInquiry: "New trips start as an inquiry. Move the stage once it firms up.",
} as const;

/**
 * §3.4.1 Trip List.
 *
 * WEB ONLY, and not by the same reasoning §3.3 used. Trips is not one of the four agent
 * tabs on the phone (§6.6), and §3.4 has no phone artboards at all — so there is no Kotlin
 * twin for these and nothing for the copy-parity map to pair them with.
 */
export const TRIP_COPY = {
  title: "Trips",
  subtitle: "Every trip you own or assist with.",

  searchLabel: "Search trips",
  searchPlaceholder: "Trip, destination, or client…",

  // THE LAST TWO ARE NOT IN THE PROTOTYPE. Its chip row draws four; `trip_status` has six,
  // and on the seed 13 of 26 trips are completed — half the book with no way to reach it.
  filterInquiry: "Inquiry",
  filterProposal: "Proposal",
  filterBooked: "Booked",
  filterTraveling: "Traveling",
  filterCompleted: "Completed",
  filterCancelled: "Cancelled",
  filterAll: "All",
  filterLive: "In motion",

  colTrip: "Trip",
  colClient: "Client",
  colTravel: "Travel",
  colStage: "Stage",
  colValue: "Value",
  colCommission: "Comm",

  noDates: "No dates yet",
  noCommission: "—",
  noDestination: "—",

  pipelinePrefix: "Pipeline",

  emptyTitle: "No trips yet",
  emptyBody: "The first one arrives when you build it, or when a quote request comes in.",
  emptyFilteredTitle: "Nothing matches",
  emptyFilteredBody: "Try a different search, or a different stage.",


  // ── The bulk status bar ────────────────────────────────────────────────
  bulkSelectAll: "Select every trip on this page",
  bulkSelectRow: "Select",
  bulkLegend: "Move the trips you've ticked to",
  bulkApply: "Move",
  bulkWorking: "Moving…",
  bulkNoSelection: "Tick at least one trip first.",
  bulkNoStatus: "Pick a stage first.",
  bulkFailed: "That didn't save. Try again in a moment.",
  // §3.4.16 owns cancelling: it has an impact list and a mandatory reason, and neither
  // survives a checkbox column.
  bulkCancelRefused: "Cancelling a trip is one at a time — it needs a reason and the impact review.",
} as const;

/**
 * What the bulk status bar says afterwards.
 *
 * THE COUNT IS WHAT MOVED, NOT WHAT WAS PICKED, and the gap has a meaning worth naming
 * here that §3.3's bulk tag did not have: a trip is skipped when its stage CHANGED since
 * the page rendered. That is not a no-op, it is a refusal to overwrite somebody — so the
 * sentence says "already moved on" rather than "already as you wanted them".
 */
export function bulkStatusResult(label: string, moved: number, requested: number): string {
  if (moved === 0) {
    return `Nothing moved — every trip you picked had already changed stage.`;
  }
  const who = moved === 1 ? "1 trip" : `${moved} trips`;
  const head = `Moved ${who} to ${label}.`;
  const rest = requested - moved;
  if (rest === 0) return head;
  return rest === 1
    ? `${head} The other one had already moved on.`
    : `${head} The other ${rest} had already moved on.`;
}

/**
 * What the bulk-tag bar says afterwards.
 *
 * THE COUNT IS WHAT MOVED, NOT WHAT WAS ASKED FOR, and the difference is deliberate. A
 * client already carrying the tag, one at the 20-tag cap, and one belonging to another
 * advisor all land in the same gap — the SQL function returns nothing for any of them on
 * purpose, so that a stranger's id cannot be confirmed by the answer. Saying "4 of 6" is the
 * honest version of that; saying "tagged 6" would be a lie the advisor could check.
 */
export function bulkTagResult(tag: string, changed: number, requested: number, added: boolean): string {
  if (changed === 0) {
    return added
      ? `Every client you picked already had "${tag}".`
      : `None of the clients you picked had "${tag}".`;
  }

  const who = changed === 1 ? "1 client" : `${changed} clients`;
  const head = added ? `Added "${tag}" to ${who}.` : `Removed "${tag}" from ${who}.`;

  const rest = requested - changed;
  if (rest === 0) return head;

  // Both halves pluralise. "The other 1 were" is the sentence a count-shaped template writes
  // when nobody checks the singular, and it was on screen before this line existed.
  const tail = added
    ? `The other ${rest} ${rest === 1 ? "was" : "were"} already tagged.`
    : `The other ${rest} ${rest === 1 ? "wasn't" : "weren't"} tagged.`;
  return `${head} ${tail}`;
}

/** The greeting line, derived rather than written. */
export function needsYouLine(count: number): string {
  if (count === 0) return AGENT_COPY.greetingZero;
  if (count === 1) return AGENT_COPY.greetingOne;
  return AGENT_COPY.greetingMany(count);
}

/**
 * §3.4.4 Trip Builder Workspace, and §3.4.5 – §3.4.12's sheets behind it.
 *
 * WEB ONLY, for the reason `TRIP_COPY` gives: §3.4 has no phone artboards, so there is no
 * Kotlin twin and nothing for the copy-parity map to pair these with.
 *
 * THE FIELD LABELS ARE THE ADVISOR'S WORDS, NOT THE COLUMN'S. `location` is "Route" on a
 * flight and "Pickup" on a transfer; `confirmation_number` is "PNR", "Booking #" and
 * "Policy #". One column, three sheets, three names, because nobody calls a policy number
 * a confirmation number out loud.
 */
export const BUILDER_COPY = {
  title: "Trip builder",
  backToTrip: "Back to the trip",

  // ── The rail ───────────────────────────────────────────────────────────
  addHeading: "Add to this trip",
  kindFlight: "Flight",
  kindHotel: "Hotel or resort",
  kindCruise: "Cruise",
  kindExcursion: "Tour or activity",
  kindTransfer: "Transfer",
  kindInsurance: "Insurance",
  kindCustom: "Something else",

  // NO SUPPLIER NAMES ON THE BUTTONS. The prototype's rail reads "Flight · Amadeus",
  // "Hotel · Hotelbeds", "Cruise · Widgety", "Tour · Viator". All four are Phase 2
  // integrations and none of them is wired, so every one of those labels is a promise the
  // button cannot keep — the same thing a deferral line naming a shipped section does,
  // pointed the other way.
  searchDeferred: "Searching a supplier's live inventory arrives with Phase 2. Everything here is typed by hand for now.",
  templatesDeferred: "Starting from a template arrives with §3.4.13.",
  templatesLabel: "Templates",

  // ── The canvas ─────────────────────────────────────────────────────────
  componentsHeading: "What's in the trip",
  emptyTitle: "Nothing in it yet",
  // NO DIRECTION IN THIS SENTENCE. It said "from the left", which is true at `xl` and
  // false at every width below it, where the add rail sits above the canvas rather than
  // beside it. A pointer to somewhere the thing is not is worse than no pointer.
  emptyBody: "Start with whatever you have. A flight, a room, a day out — in whatever order they come to you.",

  moveUp: "Move up",
  moveDown: "Move down",
  edit: "Edit",
  editHeading: "Edit",
  remove: "Remove from trip",
  removeConfirm: "Remove this from the trip? The itinerary keeps its place until you edit that too.",

  totalLabel: "Trip total",
  commissionLabel: "Your commission",
  countLabel: "pieces",
  countLabelOne: "piece",
  // The total is a sum the database keeps, not one this page adds up. Saying so stops an
  // advisor wondering why a figure they can see the parts of came out different.
  totalHint: "Adds up every piece below. Payments and deposits live on the trip's own screen.",

  // ── The sheet ──────────────────────────────────────────────────────────
  addFlight: "Add a flight",
  addHotel: "Add a hotel or resort",
  addCruise: "Add a cruise",
  addExcursion: "Add a tour or activity",
  addTransfer: "Add a transfer",
  addInsurance: "Add travel insurance",
  addCustom: "Add something else",

  supplierLabel: "Supplier",
  supplierHint: "Optional. Picking one fills in their usual commission rate.",
  // The airline, the resort, the provider — all of it is the supplier, picked above rather
  // than typed into the name. `trip_component.supplier_id` is the column for it.
  supplierNone: "Not on file",

  // THE NAME FIELD IS THE ITINERARY LINE, not the airline or the provider. Seven labels
  // rather than one "Name", because "Stay" and "Sailing" are the words for the thing, and
  // one shared hint underneath says whose eyes it is for.
  nameHint: "The line the client reads on their itinerary.",
  flightName: "Flight",
  flightFrom: "Departs from",
  flightDeparts: "Departs",
  flightArrives: "Arrives",
  flightArrivesOn: "Arrives on",
  flightPnr: "Booking reference",
  flightNumber: "Flight number",
  flightCabin: "Cabin",
  flightSeats: "Seat",

  hotelName: "Stay",
  hotelWhere: "Where",
  hotelCheckIn: "Check-in",
  hotelCheckInTime: "Check-in time",
  hotelCheckOut: "Check-out",
  hotelCheckOutTime: "Check-out time",
  hotelRoomType: "Room type",
  hotelBoard: "Board basis",

  cruiseName: "Sailing",
  cruisePort: "Departs from",
  cruiseSails: "Sails",
  cruiseReturns: "Returns",
  cruiseBoarding: "Boarding",
  cruiseDisembark: "Disembark",
  cruiseBooking: "Booking number",
  cruiseShip: "Ship",
  cruiseItinerary: "Itinerary",
  cruiseCabin: "Cabin",
  cruiseDining: "Dining seating",
  cruiseGratuities: "Gratuities included",

  transferName: "Transfer",
  transferPickup: "Pickup",
  transferTime: "Pickup time",
  transferArrives: "Arrives",
  transferDropoff: "Drop-off",
  transferVehicle: "Vehicle",

  excursionName: "Tour or activity",
  excursionMeet: "Meeting point",
  excursionStarts: "Starts",
  excursionEnds: "Ends",
  excursionEndsOn: "Ends on",
  excursionDuration: "How long",

  insuranceName: "Policy",
  insuranceFrom: "Covered from",
  insuranceTo: "Covered to",
  insurancePolicy: "Policy number",
  insurancePlan: "Plan",
  insuranceCoverage: "Coverage",

  customName: "What is it?",

  fieldDate: "Date",
  fieldTime: "Time",
  fieldWhere: "Where",
  fieldEndDate: "Ends",
  fieldEndTime: "Ends at",
  fieldConfirmation: "Confirmation number",
  fieldNotes: "Notes",
  fieldCost: "Cost",
  fieldCommissionPct: "Commission rate",
  fieldCommission: "Commission",
  // The one rule worth stating out loud, because the field fills itself in and a number
  // that appears on its own is unsettling if you do not know why.
  commissionHint: "Leave this blank and the rate fills it in. Type an amount and yours wins.",
  costHint: "What the client pays for this piece.",

  save: "Save",
  saving: "Saving…",
  cancel: "Cancel",

  nameRequired: "Give it a name — it's the line the client reads.",
  costNotANumber: "That doesn't look like an amount.",
  pctOutOfRange: "A rate is between 0 and 999.",
  endBeforeStart: "That's before it starts.",
  failed: "That didn't save. Try again in a moment.",
  stale: "This trip changed in another tab. Reload and try again.",
  // The Edge Function answers "no such trip", "not your trip" and "that piece isn't on this
  // trip" identically, so ids cannot be probed. One sentence covers all three, and every
  // one of them means the same thing to the advisor: go back and look again.
  gone: "That's not on this trip any more. Reload and take another look.",

  savedAdded: "Added.",
  savedUpdated: "Saved.",
  savedNoop: "Nothing to change.",
  savedRemoved: "Removed.",
} as const;

/**
 * §3.4.15 Trip Payment Schedule.
 *
 * WEB ONLY, for the reason `TRIP_COPY` gives: §3.4 has no phone artboards, so there is no
 * Kotlin twin and nothing for the copy-parity map to pair these with.
 *
 * THE VOICE HERE IS CAREFUL, and Design-System §2 is the reason. These rows are what a
 * supplier expects and when — BRD §10.5 prohibits client-facing billing, so nothing on this
 * screen is a bill from us and nothing here may read like a demand. "Due" is the supplier's
 * date; "on file" is money we have a record of. No "amount owing", no "outstanding", no
 * "pay now", because none of those is a thing this business does.
 */
export const SCHEDULE_COPY = {
  title: "Payment schedule",
  subtitle: "What the supplier expects, and when.",
  backToTrip: "Back to the trip",

  kindDeposit: "Deposit",
  kindInterim: "Interim payment",
  kindFinal: "Final balance",

  statusScheduled: "Scheduled",
  statusScheduledHint: "Not paid yet.",
  statusPaid: "Paid",
  statusPaidHint: "The money has moved.",
  statusOverdue: "Overdue",
  statusOverdueHint: "Past its date and still unpaid. Leave it scheduled if the supplier has given more time.",
  statusWaived: "Waived",
  // The distinction §9.5 exists for, said out loud where the advisor picks it.
  statusWaivedHint: "The supplier let it go. Not a payment — this doesn't count toward what's been paid.",

  addHeading: "Add a payment",
  editHeading: "Edit this payment",
  kindLabel: "What kind",
  labelLabel: "What the client sees",
  labelPlaceholder: "Deposit",
  labelRequired: "Give it a name — it's the line the client reads.",
  amountLabel: "Amount",
  amountHint: "What the supplier expects on this date.",
  amountNotANumber: "That doesn't look like an amount.",
  amountRequired: "A payment needs an amount.",
  dueLabel: "Due",
  dueHint: "Leave it blank until the supplier sets one.",

  markLabel: "Mark this",
  markPaidAmount: "Amount that arrived",
  markPaidAmountHint: "Leave blank to record the whole amount. Partial payments happen.",
  markApply: "Save",
  markWorking: "Saving…",

  save: "Save",
  saving: "Saving…",
  cancel: "Cancel",
  edit: "Edit",
  remove: "Remove",
  // A hard delete, and the copy says so rather than implying it can be undone.
  removeHint: "Removing a payment takes it off the schedule for good.",

  colLabel: "Payment",
  colDue: "Due",
  colAmount: "Amount",
  colPaid: "On file",
  colStatus: "Status",

  totalExpected: "Scheduled",
  totalPaid: "On file",
  totalTrip: "Trip total",
  // The one figure that needs explaining: a schedule need not add up to the trip, because a
  // supplier may not have set every date yet.
  totalsHint: "A schedule doesn't have to add up to the trip total — suppliers set their dates when they set them.",

  emptyTitle: "No schedule yet",
  emptyBody: "Add the deposit when the supplier confirms it. The rest can follow.",

  failed: "That didn't save. Try again in a moment.",
  gone: "That's not on this trip any more. Reload and take another look.",

  // §3.10 is agent messaging and nothing exists to send on. The Screen Inventory's
  // "trigger reminder" and "reminder cadence toggle" both wait on it — a button that
  // silently sends nothing would be worse than one that says why it is off.
  remindLabel: "Remind the client",
  remindDeferred: "Sending a reminder arrives with §3.10, where agent messaging gets built.",
} as const;

/**
 * §3.4.14 Itinerary Editor.
 *
 * WEB ONLY, for the reason `TRIP_COPY` gives: §3.4 has no phone artboards.
 *
 * THIS IS THE ONE SCREEN WHERE THE ADVISOR IS WRITING FOR THE CLIENT, so the labels name
 * the reader. "What the client reads" rather than "Title"; "Gyasi's Tip" verbatim, because
 * Design-System §2 makes it a named thing and not a generic callout. The auto-generate copy
 * says what the button will and will not touch, because an advisor who has spent an hour
 * writing needs to know that before pressing it — not after.
 */
export const ITINERARY_COPY = {
  title: "Itinerary",
  subtitle: "The trip, told day by day.",
  backToTrip: "Back to the trip",

  publishedLabel: "Published",
  draftLabel: "Draft",
  dayCount: "days",
  dayCountOne: "day",
  activityCount: "entries",
  activityCountOne: "entry",

  // ── Auto-generate ──────────────────────────────────────────────────────
  generateLabel: "Fill in from the trip",
  generateWorking: "Filling in…",
  // The promise the button makes, stated before it is pressed.
  generateHint: "Adds a day for every date and an entry for anything booked that isn't here yet. Never changes what you've already written.",
  generatedSome: "Filled in what was missing.",
  generatedNothing: "Already up to date — nothing to add.",
  generateNoDates: "Give the trip a start and end date first, then this can lay out the days.",
  generateFailed: "That didn't run. Try again in a moment.",

  // ── Days ───────────────────────────────────────────────────────────────
  addDay: "Add a day",
  editDay: "Edit this day",
  dayDateLabel: "Date",
  dayLabelLabel: "What to call it",
  dayLabelPlaceholder: "Seven Mile Beach",
  dayLabelHint: "A few words the client sees above the day.",
  daySummaryLabel: "Set the scene",
  daySummaryHint: "Optional. A sentence or two about the shape of the day.",
  dayDateRequired: "A day needs a date.",
  dayEmpty: "Nothing on this day yet.",

  // ── Activities ─────────────────────────────────────────────────────────
  addActivity: "Add something",
  addToDay: "Add to this day",
  editActivity: "Edit this entry",
  activityTitleLabel: "What the client reads",
  activityTitlePlaceholder: "Catamaran to Booby Cay",
  activityTitleRequired: "Give it a name — it's the line the client reads.",
  activityBodyLabel: "Tell them about it",
  activityBodyHint: "Optional. The part that makes it feel like a trip rather than a booking.",
  blockLabel: "When in the day",
  blockAuto: "Work it out from the time",
  blockMorning: "Morning",
  blockAfternoon: "Afternoon",
  blockEvening: "Evening",
  blockAllDay: "All day",
  startsLabel: "Starts",
  endsLabel: "Ends",
  whereLabel: "Where",
  addressLabel: "Address",
  phoneLabel: "Phone",
  confirmationLabel: "Confirmation number",
  // Named, not "note" — Design-System §2 makes this a branded thing.
  tipLabel: "Gyasi's Tip",
  tipHint: "The bit only someone who's been there would know.",

  fromBooking: "From a booking",
  fromBookingHint: "This entry came from something on the trip. Editing it here doesn't change the booking.",

  moveUp: "Move up",
  moveDown: "Move down",
  edit: "Edit",
  remove: "Remove",
  removeHint: "Removing an entry takes it off the itinerary. The booking it came from stays.",

  save: "Save",
  saving: "Saving…",
  cancel: "Cancel",

  emptyTitle: "Nothing written yet",
  emptyBody: "Fill it in from the trip to get the days laid out, then make it yours.",

  failed: "That didn't save. Try again in a moment.",
  stale: "This day changed in another tab. Reload and try again.",
  gone: "That's not on this itinerary any more. Reload and take another look.",

  // §3.5.6 owns the client-facing preview and §3.5 the sending. Neither exists.
  previewDeferred: "Previewing what the client sees arrives with §3.5.6.",
  previewLabel: "Preview",
} as const;
