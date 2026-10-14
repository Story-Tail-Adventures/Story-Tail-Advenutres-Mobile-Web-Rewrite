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
  // RETIRED 2026-09-28 — §3.4.13 shipped, and this deferral is honoured rather than
  // deleted. Duplicating a trip IS save-as-template then New trip → from template.
  // Two real screens beat a third verb that would need its own client picker.
  saveAsTemplateLabel: "Save as template",

  // ── §3.4.16 Cancel trip ─────────────────────────────────────────────────
  cancelTripOpen: "Cancel trip",
  cancelTripEyebrow: "CANCEL TRIP",
  cancelTripEditEyebrow: "CANCELLATION DETAILS",
  // Says what this does and, more usefully, what it does NOT: the stage can be moved back
  // from the board, and the phone call to the supplier cannot be un-made. An advisor who
  // thinks this button cancels the booking will not go and cancel the booking.
  cancelTripBody:
    "This marks the trip cancelled and tells the client's screen why. It does not contact any supplier, move any money, or release the card — those are still yours to do.",
  // Not "only these details change": since §3.7 Stage 5 this dialog can also mark open
  // commission lines Lost, so the promise would be false whenever it lists any.
  cancelTripEditBody: "Correct what the client reads. The trip stays cancelled.",
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
  // §3.7 Stage 5: the trip's open ledger lines, offered to mark Lost (Gyasi, 2026-10-12:
  // offered, on by default). "Lost" is the ledger's own word for money that will not come,
  // and the help says the one way back, since a supplier sometimes pays on a cancellation.
  cancelLinesTitle: "COMMISSION STILL OPEN",
  // "Left alone", not "never change": a Received line can still be edited in the ledger; this
  // is about what a cancellation does. "A supplier", because the list can name several.
  cancelLinesHelp:
    "Received and Disputed lines are left alone. If a supplier pays after all, you can reopen the line in the ledger.",
  cancelDone: "Done",
  cancelLinesUnavailable:
    "We couldn't check this trip's commission lines just now, so any open ones stay open. You can mark them Lost from the ledger.",

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
  // `commissionDeferred` lived here until §3.7.1 shipped. It had no call site left by then
  // either: the rail renders its own "Arrives with" line from nav.ts.
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
  // clientDetailDeferred got.
  //
  // AND THREE MORE CAME DUE WITH §3.4.13 on 2026-09-28: duplicateTripDeferred (repointed
  // here during §3.4.4 precisely because duplicating and templating are one mechanism),
  // NEW_TRIP_COPY.templateDeferred and BUILDER_COPY.templatesDeferred. All three are gone
  // and all three controls are live.
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
  // LIVE since §3.4.13 shipped 2026-09-28. `templateDeferred` is gone; a deferral that
  // names a shipped section is worse than no sentence at all.
  templateNone: "Start from scratch",
  templateHint:
    "Its bookings and day-by-day come across. Dates are worked out from this trip's own.",
  templateLabel: "Start from a template",

  // A trip is born in `inquiry` and the screen says so, because an advisor who expected
  // "booked" would otherwise go looking for the stage control.
  startsAsInquiry: "New trips start as an inquiry. Move the stage once it firms up.",
} as const;

/**
 * §3.4.1 Trip List.
 *
 * WEB ONLY, and not by the same reasoning §3.3 used. Trips is not one of the four agent
 * tabs on the phone (§6.6), so a trip is reached there from the WORKLIST's rows and this
 * list has no phone twin to pair with.
 *
 * "§3.4 has no phone artboards at all" stood here until 2026-09-30 and is no longer true:
 * `design/source-prototype/screens/agent-trip-mobile.jsx` draws §3.4.2 at two of its eight
 * tabs and the Compose screen shipped with it. THE SECTION has a phone surface now; this
 * SCREEN still does not, which is the narrower claim and the one that holds. Three sibling
 * consts below carried the same sentence and are corrected the same way.
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
 * WEB ONLY — §6.6 keeps the builder and its eight sheets in a browser, which is where an
 * advisor assembles a trip rather than reads one. A seven-button rail over a canvas of
 * component rows is the definition of what a phone is not for.
 *
 * THE SEVEN `kind*` LABELS ARE THE EXCEPTION, and they are paired as of 2026-09-30. §3.4.2
 * on Compose renders them read-only, as the overline on each component row, so they have a
 * twin in `TripComponentCopy` and a row in the copy-parity map. Nothing else here does, and
 * nothing else here should.
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
  // LIVE since §3.4.13 shipped 2026-09-28. The builder's verb is SAVE, not apply: a trip
  // under construction already has bookings, and the RPC refuses a second pattern on one.
  saveAsTemplateLabel: "Save as template",
  // §3.4.13. `seedApplied` is a FUNCTION so check_copy_parity.py skips it and
  // content.test.ts covers it instead — the arrangement every count-pluralising
  // string on this surface has.
  seedApplied: (n: number) =>
    n > 0
      ? `Seeded from a template — ${n} ${n === 1 ? "booking" : "bookings"} added. Adjust anything that does not fit.`
      : "The template added nothing. It has no bookings saved in it.",
  seedFailed:
    "The template did not apply, but the trip is saved. Add its pieces below, or apply the template again from the library.",
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
 * WEB ONLY — the editor is a form, and §6.6 keeps forms in a browser.
 *
 * THE FOUR `status*` LABELS ARE THE EXCEPTION, and they are paired as of 2026-09-30:
 * §3.4.2's Payments tab on Compose renders them read-only. The matching `*Hint` strings are
 * NOT paired, and that is the line — a hint explains a choice to somebody making one, and
 * the phone makes none. The three `kind*` labels are not paired either: the phone's row
 * shows `payment_milestone.label`, which is the advisor's own words for the same thing.
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
 * WEB ONLY — this is the screen where the advisor does the most typing.
 *
 * SIX STRINGS ARE THE EXCEPTION, paired as of 2026-09-30, because §3.4.2's Itinerary tab on
 * Compose reads the same day-by-day: the four `block*` labels, `dayEmpty` and `tipLabel`.
 * `blockAuto` is deliberately not among them — "Work it out from the time" is the empty
 * option on this form's picker, an instruction rather than a label, and the read side
 * renders nothing at all for a null block.
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

/**
 * §3.4.13's copy.
 *
 * Its own module rather than more keys on AGENT_COPY, matching SCHEDULE_COPY and
 * BUILDER_COPY: the template library is a screen, not an action on another one.
 *
 * `savedReceipt` and `appliedReceipt` are FUNCTIONS, so `check_copy_parity.py` skips them
 * and `content.test.ts` covers them instead — the same arrangement the greeting and the
 * cancelled note have, and for the same reason.
 */
export const TEMPLATE_COPY = {
  title: "Trip templates",
  sub: "Reusable starting points for the trips you build again and again.",
  // The prototype's header says "Web-only editing at MVP", which is a statement about the
  // build and not about the work. §6.6 already settles that agent mobile is narrower; a
  // screen does not need to apologise for it.
  navLabel: "Templates",

  saveTitle: "Save as a template",
  saveEyebrow: "NEW TEMPLATE",
  // Says what comes across, because the answer is not obvious and getting it wrong wastes
  // an advisor's afternoon. Dates are the interesting part: a pattern is relative.
  saveBody:
    "Captures this trip's bookings and its day-by-day. Dates are stored as day offsets, so applying it to a March trip produces March dates.",
  // And what does NOT, which matters more. A copied confirmation is the kind of error a
  // client notices before the advisor does.
  saveExcludes:
    "Confirmation numbers and payment schedules are not captured — a booking reference belongs to one booking.",
  saveNameLabel: "Name",
  saveNamePlaceholder: "e.g. Sandals Negril · 7 nights",
  saveDescriptionLabel: "What it is for (optional)",
  saveDescriptionPlaceholder: "e.g. Ocean-view suite, transfer, catamaran, insurance",
  saveConfirm: "Save template",
  cancel: "Cancel",
  saving: "Saving\u2026",
  done: "Done",
  saveNameRequired: "A template needs a name.",
  savedReceipt: (components: number, days: number) =>
    days > 0
      ? `Saved. ${components} ${components === 1 ? "booking" : "bookings"} and ${days} ${days === 1 ? "day" : "days"} captured.`
      : `Saved. ${components} ${components === 1 ? "booking" : "bookings"} captured.`,
  saveFailed: "That did not save. Try again in a moment.",

  applyLabel: "Use",
  // The receipt says what landed, including the case where the day-by-day did not — which
  // is a real outcome for a trip with no dates rather than a failure.
  appliedReceipt: (components: number, days: number) =>
    days > 0
      ? `Added ${components} ${components === 1 ? "booking" : "bookings"} and ${days} ${days === 1 ? "day" : "days"}.`
      : `Added ${components} ${components === 1 ? "booking" : "bookings"}. Give the trip dates and the day-by-day can be generated from them.`,
  alreadyApplied: "This trip already came from a template, so nothing changed.",
  applyFailed: "That did not apply. Try again in a moment.",

  renameLabel: "Rename",
  archiveLabel: "Retire",
  // Retire, not delete. The word matters: trips that used it keep pointing at it.
  archiveConfirmBody:
    "It leaves the library. Trips already built from it are untouched and keep their history.",
  archiveFailed: "That did not save. Try again in a moment.",

  emptyTitle: "No templates yet",
  emptyBody:
    "Open a trip you would build again, then use Save as template. The bookings and the day-by-day come with it.",
  // The payload is a snapshot on purpose, and an advisor who expects otherwise will edit a
  // template and wonder why nothing moved.
  payloadFixedNote:
    "A template is a snapshot of a real trip. To change the shape, save a new one from a trip that has it.",
} as const;

/**
 * §3.7.1 Commission Dashboard and §3.7.2 Commission Ledger.
 *
 * WEB ONLY. Commission is not one of §6.6's four phone tabs, and `a37-commission.html` draws
 * no phone artboards (`mobileScreens={null}`), so there is no Kotlin twin and no row in the
 * copy-parity gate.
 *
 * SAME REGISTER AS AGENT_COPY: terse and numerate, read at a desk. This is the advisor's own
 * money, the most transactional surface in the product — §2.5 is explicit that a screen like
 * this needs facts, not a verse. Plain words over the prototype's shorthand where the
 * shorthand was jargon: "vs last year" rather than "LY", "pts" rather than "pp".
 */
export const COMMISSION_COPY = {
  viewsLabel: "Commission views",

  title: "Commissions",
  // The prototype's subtitle, kept: it is the whole lifecycle in five words, and it names
  // the one counterpart the numbers are checked against.
  subtitle: "Expected → invoiced → received. Reconciled against Inteletravel.",

  // Live since §3.7 Stage 3 (§3.7.5).
  importLabel: "Import CSV",
  // Live since §3.7 Stage 2. Each download writes an audit record (Data-Model §18.3), in the
  // same database call that produces the rows.
  exportLabel: "Export",
  exportFailed: "The export didn't come through. Go back and try again in a moment.",
  addLineLabel: "Add line",

  tileYtd: "YTD received",
  tileUpcoming: "Expected · 90d",
  tileAtRisk: "At risk",
  tileRate: "Avg rate",
  rateUnavailable: "Nothing received yet this year.",
  nothingDisputed: "Nothing disputed",
  // "Nothing priced", not "nothing booked": a booked trip nobody has priced adds no
  // commission and is not counted, so "nothing booked" would be false while one sits there.
  nothingUpcoming: "Nothing priced in the next 90 days",

  trendTitle: "Monthly trend · 12 months",
  trendEmpty: "No commission received in the last 12 months.",
  trendTableCaption: "Commission received by month",
  trendMonth: "Month",
  trendAmount: "Received",

  ledgerTitle: "Commission ledger",
  ledgerSubtitle: "Every booking, every line.",
  // FIVE, NOT THE PROTOTYPE'S FOUR. Its chip row has no Lost, and `commission_status` has
  // five values; a line lost to a cancellation would have no way back onto the screen.
  filterExpected: "Expected",
  filterInvoiced: "Invoiced",
  filterReceived: "Received",
  filterDisputed: "Disputed",
  filterLost: "Lost",
  filterStatusLegend: "Status",
  supplierLabel: "Supplier",
  supplierAll: "All suppliers",
  travelFromLabel: "Travel from",
  travelToLabel: "Travel to",
  applyFilters: "Apply",
  clearFilters: "Clear filters",
  tripFilterPrefix: "One trip:",
  tripFilterUnnamed: "One trip only",
  tripFilterRemove: "Show every trip",

  colTrip: "Trip · client",
  colSupplier: "Supplier",
  colTravel: "Travel",
  colGross: "Gross",
  colRate: "Rate",
  colCommission: "Comm",
  colStatus: "Status",
  noDates: "No dates yet",
  archivedTrip: "Archived",

  emptyTitle: "No commission lines yet",
  // Says where lines actually COME FROM. An earlier draft said a line appears "once a booking
  // is invoiced", which is wrong twice: a line starts life as `expected`, before any invoice,
  // and nothing creates one automatically — entry and import are the only producers.
  emptyBody:
    "Use Add line to enter one, or import a statement from Inteletravel.",
  emptyFilteredTitle: "Nothing matches",
  emptyFilteredBody: "Try another status, supplier or date range.",
  emptyTripTitle: "No lines for this trip yet",
  emptyTripBody: "Its forecast commission still shows on the trip's cost card.",
  ledgerTableLabel: "Commission lines",
  ledgerPagesLabel: "Ledger pages",

  // Trip Detail's cost card, the ledger's second entry point (§3.7.2), and 3.7.4's.
  tripLedgerLink: "Commission lines",
  tripAddLine: "Add commission line",

  // ── 3.7.4 Add ──────────────────────────────────────────────────────────────
  addTitle: "Add commission line",
  addSubtitle: "Add one line per supplier on a trip. Expected is gross × rate, worked out when you save.",
  pickTripTitle: "Which trip is it for?",
  pickTripSearch: "Search trips",
  pickTripPlaceholder: "Trip, destination, or client…",
  pickTripNone: "No trips match that.",
  pickTripChange: "Pick a different trip",
  noSuppliers: "No suppliers on file yet. A line needs one to attach to.",
  tripNotAvailableTitle: "That trip isn't available",
  tripNotAvailableBody: "It may have been archived, or it belongs to another advisor.",

  // ── The line form, shared by 3.7.3 and 3.7.4 ─────────────────────────────
  supplierPlaceholder: "Pick a supplier",
  supplierNoLongerListed: "No longer listed",
  grossLabel: "Gross booking",
  grossHint: "The booking total the rate applies to.",
  rateLabel: "Commission rate",
  rateHint: "A percent, 0 to 100.",
  expectedLabel: "Expected",
  expectedHint: "Gross × rate. Worked out again when you save.",
  termsLabel: "Paid",
  termsAfterTravel: "After travel",
  termsAtBooking: "At booking",
  lagLabel: "Days after",
  statusLabel: "Status",
  statusHint: "Received and Disputed are set with Mark received.",
  referenceLabel: "Inteletravel reference",
  referenceHint: "From the statement, once there is one. A line with one can't be removed.",
  notesLabel: "Notes",
  saveLine: "Save line",
  saving: "Saving…",
  cancel: "Cancel",

  supplierRequired: "Pick a supplier.",
  grossInvalid: "Enter an amount like 6480.00.",
  rateInvalid: "Enter a rate from 0 to 100.",
  lagInvalid: "Enter whole days, 0 to 365.",
  duplicateReference: "That reference is already on another line.",
  supplierGone: "That supplier is no longer on file. Pick another.",
  stale: "This line changed since you opened it. Reload to see what changed.",
  failed: "That didn't save. Try again in a moment.",
  // Moving a paid line back to an unpaid status wipes the recorded payment (audited). The
  // checkbox is required, so the advisor says yes before it happens.
  clearsPayment: "Changing the status clears the payment recorded on this line.",
  clearsPaymentConfirm: "Yes, clear the recorded payment",
  receivedNeedsAmount: "Received needs the amount that arrived. If nothing came, record it as Disputed.",
  signedOut: "You were signed out. Sign in again and retry.",

  // ── 3.7.3 Detail ───────────────────────────────────────────────────────────
  backToLedger: "Back to ledger",
  lineNotFoundTitle: "That line isn't on your ledger",
  lineNotFoundBody: "It may have been removed, or the link is to a line that isn't yours.",
  // The prototype's subtitle, less the Inteletravel link, which waits for §3.7.6.
  detailSubtitle: "Edit terms, mark received, and keep notes for the statement.",
  openTrip: "Open trip",
  archivedTripNote: "This trip is archived. Its commission line stays on the record.",

  markReceived: "Mark received",
  receivedAmountLabel: "Amount received",
  feeLabel: "Processing fee",
  feeHint: "What Inteletravel kept, if anything.",
  receivedOnLabel: "Received on",
  recordAsLabel: "Record as",
  recordReceived: "Received",
  recordDisputed: "Disputed",
  savePayment: "Save payment",
  badDate: "Use today or an earlier date.",
  amountInvalid: "Enter an amount like 970.00.",

  linkInteletravel: "Link Inteletravel row",
  linkDeferred: "Matching a line to a statement row arrives with §3.7.6.",

  expectationTitle: "Payment expectation",
  expectationNoEnd: "No date yet: the trip has no end date.",
  expectationNotBooked: "No date yet: the trip has not been booked.",

  removeLine: "Remove line",
  removeTitle: "Remove this line?",
  removeBody:
    "For a line entered by mistake. It leaves the ledger and your totals, and you can't bring it back from here. A record that it existed is kept.",
  removeConfirm: "Remove",
  removeKeep: "Keep it",
  // Gyasi's rule, said as the rule rather than as one case of it: a disputed or received
  // line was never "invoiced" in the advisor's sense, and the old wording said it was.
  // Gyasi's rule (2026-10-11), stated as history: a line that was ever invoiced, paid or
  // given a reference stays on the record, whatever its status says now.
  removeNotAllowed:
    "Only a line that was never invoiced or given an Inteletravel reference can be removed. You can still edit this one.",
  removeRefused: "That line couldn't be removed. It may have changed since you opened it.",
} as const;

/** "Sandals Resorts · 60 days after travel" — the expectation card's first line. */
export function commissionTermsLine(supplier: string, terms: string, days: number): string {
  const atBooking = terms === "at_booking";
  const span = days === 0
    ? (atBooking ? "paid at booking" : "paid when travel ends")
    : `paid ${days} ${days === 1 ? "day" : "days"} after ${atBooking ? "booking" : "travel"}`;
  return `${supplier} · ${span}`;
}

/** 3.7.3's header, as A373 draws it: "Sandals Resorts · Kyoto in the spring · $1,368 expected". */
export function commissionLineHeading(supplier: string, trip: string, expected: string): string {
  return `${supplier} · ${trip} · ${expected} expected`;
}

/** "Expected around Oct 18, 2026." */
export function commissionExpectedOn(dateLabel: string): string {
  return `Expected around ${dateLabel}.`;
}

/** "Received $1,190 on Feb 21, 2027, after a $12 fee." */
export function commissionPaidLine(amount: string, dateLabel: string, fee: string | null): string {
  return fee ? `Received ${amount} on ${dateLabel}, after a ${fee} fee.` : `Received ${amount} on ${dateLabel}.`;
}

/**
 * What the payment form says about expected − fee − received, live. Zero is reconciled;
 * a shortfall is the thing §3.7.6 exists to chase; more than expected is worth a look too.
 */
export function commissionGapLine(gapCents: number, gapLabel: string): string {
  if (gapCents === 0) return "Matches expected, once the fee is taken out.";
  if (gapCents > 0) return `${gapLabel} short of expected, after the fee. Record it as Disputed to chase it.`;
  return `${gapLabel} more than expected, after the fee.`;
}

/** "Gross and rate filled in from this trip's Sandals Resorts bookings." */
export function commissionPrefilledFrom(supplier: string): string {
  return `Gross and rate filled in from this trip's ${supplier} bookings. Change them if the final figures differ.`;
}

/** "5 trips", "1 trip" — the Expected · 90d tile's second line. */
export function commissionTripCount(count: number): string {
  return count === 1 ? "1 trip" : `${count} trips`;
}

/** "1 disputed" — the At risk tile's second line. */
export function commissionDisputedCount(count: number): string {
  return count === 0 ? COMMISSION_COPY.nothingDisputed : `${count} disputed`;
}

/**
 * A signed change with a true minus sign (not a hyphen, so a fall reads as one at a glance in
 * small type), or "No change" when it rounds to zero. "±0%" was the first draft: a screen
 * reader says "plus or minus zero", and nobody says that out loud.
 */
function signedChange(value: string, isZero: boolean, isFall: boolean, against: string): string {
  if (isZero) return `No change vs ${against}`;
  return `${isFall ? "−" : "+"}${value} vs ${against}`;
}

/** "+24% vs last year" — the same Jan-1-to-today window a year back. */
export function commissionChangeVsLastYear(pct: number): string {
  return signedChange(`${Math.abs(pct)}%`, pct === 0, pct < 0, "last year");
}

/** "+0.4 pts vs last year": a change in a RATE is points, never a percentage of a percentage. */
export function commissionRateChangeVsLastYear(points: number): string {
  const shown = Math.abs(points).toFixed(1);
  return signedChange(`${shown} pts`, shown === "0.0", points < 0, "last year");
}

/**
 * The trend chip: the chart's twelve months against the twelve before them. Worded apart
 * from the tiles' "vs last year" on purpose — that is a calendar-year window, this is a
 * rolling one, and the same words would invite comparing two different numbers.
 */
export function commissionTrendChange(pct: number): string {
  return signedChange(`${Math.abs(pct)}%`, pct === 0, pct < 0, "the 12 months before");
}

/**
 * §3.7.5 Import statement and §3.7.6 Reconcile.
 *
 * WEB ONLY, like the rest of §3.7: no phone artboards, no Kotlin twin, no copy-parity row.
 * Same register as COMMISSION_COPY: facts first, read at a desk. The one promise these
 * screens make, and so say more than once, is that NOTHING IN THE LEDGER CHANGES until the
 * advisor marks the statement reconciled, and that a line they already marked paid never
 * changes at all (Gyasi, 2026-10-11).
 */
export const STATEMENT_COPY = {
  importTitle: "Import Inteletravel statement",
  importSubtitle:
    "Upload the CSV from Inteletravel. Your ledger stays the same until you mark the statement reconciled.",
  whereFileLabel: "Where do I get this file?",
  // Deliberately general: no real statement has been seen yet, so this names no menu that
  // might not exist.
  whereFileBody:
    "Download your commission statement from Inteletravel as a CSV file. If it opens in Excel, use Save As and choose CSV.",

  step1Title: "Step 1 · Upload",
  dropTitle: "Choose your statement",
  dropHint: "Inteletravel statement · CSV · up to 512 KB",
  fileLabel: "Statement file",
  uploadButton: "Upload statement",
  uploading: "Uploading…",
  noFile: "Choose a CSV file first.",
  tooBig: "That file is larger than 512 KB. Check it's the statement.",
  notCsv: "That isn't a CSV file. If it's an Excel file, save it as CSV and upload that.",
  duplicate: "You've already imported this file.",
  duplicateOpen: "Open that statement",
  uploadFailed: "The upload didn't come through. Try again in a moment.",
  useDifferentFile: "Use a different file",

  step2Title: "Step 2 · Map columns",
  step2Waiting: "Upload a statement and its columns show up here.",
  mapIntro: "Say what each column holds. Guesses are filled in and marked Auto.",
  mapTableLabel: "Statement columns",
  autoChip: "Auto",
  manualChip: "Manual",
  ignoreColumn: "Ignore this column",
  fieldReference: "Booking reference",
  fieldSupplier: "Supplier",
  fieldTraveler: "Traveler name",
  fieldGross: "Gross booking",
  fieldReceived: "Commission paid",
  fieldFee: "Fee withheld",
  fieldPaidOn: "Paid on",
  statementDateLabel: "Paid on, for every row",
  statementDateHint: "No column holds the paid-on date, so use the date on the statement.",
  mapNeedsReceived: "Choose the column that holds the commission paid.",
  mapNeedsDate: "Choose the paid-on column, or enter the date the statement paid.",
  remapWarning: "Changing the columns clears the choices you've made on this statement.",
  mapFailed: "That didn't save. Try again in a moment.",
  changeColumns: "Change columns",

  pastTitle: "Past statements",
  pastEmpty: "No statements yet. Your first one will show up here.",
  pastTableLabel: "Past statements",
  statusMapping: "Needs columns",
  statusReview: "Ready to review",
  statusReconciled: "Reconciled",

  colStatementRow: "Inteletravel row",
  colMatch: "Ledger match",
  colConfidence: "Confidence",
  colAmount: "Amount",
  colAction: "Action",
  rowsTableLabel: "Statement rows",
  confidenceHigh: "High",
  confidenceMedium: "Medium",
  confidenceLow: "Low",

  auto: "Auto-matched",
  matched: "Matched",
  newLine: "New line",
  setAside: "Set aside",
  alreadyRecorded: "Already recorded",
  resolve: "Resolve",
  change: "Change",
  noMatch: "No match found",
  possibleNew: "Possible new booking. Create a line?",
  duplicateRow: "Same booking as an earlier row. Only one row can pay a booking, so choose what to do with this one.",
  checkSuggestion: "Check this match before it counts.",

  markReconciled: "Mark as reconciled",
  reconcileConfirmTitle: "Mark this statement reconciled?",
  reconcileKeep: "Not yet",
  reconcileFailed: "That didn't save. Nothing in your ledger changed. Try again in a moment.",
  // When the call failed with no answer, the reconcile may have committed: say only what is known.
  reconcileUnsure: "That didn't finish. Reload the page to see where the statement stands, then try again.",
  rowNeedsYouAgain: "A row needs you again. It's at the top of the table.",
  discardLabel: "Discard statement",
  discardTitle: "Discard this statement?",
  discardBody: "Nothing in your ledger has changed. You can upload the file again afterward.",
  discardConfirm: "Discard",
  discardKeep: "Keep it",
  discardFailed: "That didn't go through. Try again in a moment.",
  working: "Working…",

  stale: "This statement changed since you opened it. Reload the page and try again.",
  notOpen: "This statement is already reconciled or discarded, so it can't change.",
  notFoundTitle: "Statement not found",
  notFoundBody: "It may have been discarded. Your other statements are on the import page.",
  backToImport: "Back to statements",
  backToStatement: "Back to the statement",

  resolveTitle: "Resolve a statement row",
  useSuggestionTitle: "Use the suggested match",
  useSuggestion: "Use this match",
  matchTitle: "Match a different line",
  matchHint: "Lines that aren't paid yet, closest first.",
  matchButton: "Match this line",
  candidatesEmpty: "No unpaid lines to match. Create a new line instead.",
  createTitle: "Create a new line",
  createHint: "The line is added when you mark the statement reconciled. It starts out paid, using this row's amount.",
  createTripLabel: "Trip",
  createTripSearch: "Find a trip",
  createTripPlaceholder: "Trip or client name",
  createTripChange: "Choose a different trip",
  createTripNone: "No trips match that search.",
  createSupplierLabel: "Supplier",
  createGrossLabel: "Gross booking",
  createRateLabel: "Commission rate (%)",
  createButton: "Create line when reconciled",
  ignoreTitle: "Set it aside",
  ignoreHint: "Nothing is recorded for this row. You can still add a line by hand later.",
  ignoreButton: "Set aside",
  lineUnavailable: "That line can't take this payment anymore. It's been paid, or another row already matches it.",
  tripGone: "That trip isn't available anymore. Pick another.",
  supplierGone: "That supplier isn't available anymore. Pick another.",
  notAllowed: "That choice isn't available for this row.",
  resolveFailed: "That didn't save. Try again in a moment.",
  createNeedsTrip: "Choose a trip first.",
  createNeedsGross: "Enter the gross booking, like 6480.00.",
  tripNotAvailable: "That trip isn't available. Find another below.",
  createNeedsRate: "Enter a commission rate from 0 to 100.",
} as const;

/** "Uploaded: april.csv · 38 rows found". */
export function statementUploadedLine(filename: string, rows: number): string {
  return `Uploaded: ${filename} · ${rows.toLocaleString("en-US")} ${rows === 1 ? "row" : "rows"} found`;
}

/** "Import 38 rows". */
export function statementImportRows(rows: number): string {
  return `Import ${rows.toLocaleString("en-US")} ${rows === 1 ? "row" : "rows"}`;
}

/** "Example: SRB-220119" under a column, or nothing when the sample cell is blank. */
export function statementSample(value: string): string {
  return `Example: ${value}`;
}

/** "Fee withheld is chosen for two columns. Pick one." */
export function statementFieldTwice(field: string): string {
  return `${field} is chosen for two columns. Pick one.`;
}

/** "Reconcile · April 2026 statement". */
export function statementReconcileTitle(label: string): string {
  return `Reconcile · ${label}`;
}

/** "April 2026 statement" when every paid date is in one month. */
export function statementMonthLabel(month: string): string {
  return `${month} statement`;
}

/** "38 imported · 35 matched · 3 to resolve", the prototype's subtitle in plain words. */
export function statementSummary(total: number, matched: number, toResolve: number, setAside = 0): string {
  const parts = [`${total} imported`, `${matched} matched`];
  if (setAside > 0) parts.push(`${setAside} set aside`);
  parts.push(toResolve === 0 ? "nothing to resolve" : `${toResolve} to resolve`);
  return parts.join(" · ");
}

/** "Resolve 3 more rows to reconcile." Beside a disabled Mark as reconciled: what to do. */
export function statementStillNeedYou(count: number): string {
  return `Resolve ${count} more ${count === 1 ? "row" : "rows"} to reconcile.`;
}

/** The reconcile confirmation: what is about to change, and what will not. */
export function statementReconcileBody(paid: number, created: number): string {
  const what: string[] = [];
  if (paid > 0) what.push(`records ${paid} ${paid === 1 ? "payment" : "payments"}`);
  if (created > 0) what.push(`adds ${created} new ${created === 1 ? "line" : "lines"}`);
  const head = what.length ? `This ${what.join(" and ")} in your ledger.` : "Nothing in your ledger changes.";
  return `${head} Lines you already marked paid stay as they are.`;
}

/** "Reconciled Oct 12, 2026: 35 payments recorded, 2 new lines." */
export function statementReconciledLine(date: string, paid: number, created: number): string {
  return `Reconciled ${date}: ${paid} ${paid === 1 ? "payment" : "payments"} recorded, ${created} new ${created === 1 ? "line" : "lines"}.`;
}

/**
 * "Expected $1,212.36. Paid $1,100.00 plus a $50.00 fee. That's $62.36 short, so it'll be
 * marked Disputed." The fee is named when there is one, so the three numbers add up on the
 * page (the first draft said "after the fee" whether or not there was one, and left it out
 * of the sum it showed). Past tense once the statement is reconciled.
 */
export function statementShortNote(
  expected: string,
  paid: string,
  fee: string | null,
  gap: string,
  done = false,
): string {
  const paidPart = fee ? `Paid ${paid} plus a ${fee} fee.` : `Paid ${paid}.`;
  return `Expected ${expected}. ${paidPart} That's ${gap} short, so it ${done ? "was" : "will be"} marked Disputed.`;
}

/** "$20.00 more than expected." */
export function statementOverNote(gap: string): string {
  return `${gap} more than expected.`;
}

/** The prototype's "Sandals applied 14% not 15%", from the amounts rather than a guess. */
export function statementRateNote(paidPct: string, linePct: string): string {
  return `Paid at about ${paidPct} of the booking, not ${linePct}.`;
}

/**
 * A row matched to a line already received or disputed: what the ledger holds, and that this
 * import will not change it (Gyasi, 2026-10-11).
 */
export function statementAlreadyNote(
  status: "received" | "disputed",
  ledgerAmount: string | null,
  statementAmount: string | null,
): string {
  const marked = status === "disputed" ? "Disputed" : "Received";
  if (ledgerAmount && statementAmount && statementAmount !== ledgerAmount) {
    return `Your ledger says ${ledgerAmount}; this statement says ${statementAmount}. If the ledger's wrong, fix it on the line.`;
  }
  return ledgerAmount
    ? `Already marked ${marked} (${ledgerAmount}). This import won't change it.`
    : `Already marked ${marked} on your ledger. This import won't change it.`;
}

/** "Row 4" — the resolve page's heading and the row's name in the table. */
export function statementRowName(n: number): string {
  return `Row ${n}`;
}

/** A candidate line's second line: "Sandals Resorts · Carter · expected $614". */
export function statementCandidateMeta(supplier: string, client: string, expected: string): string {
  return `${supplier} · ${client} · expected ${expected}`;
}

/**
 * §3.7.7 Commission Forecast.
 *
 * WEB ONLY, like the rest of §3.7. Facts first: this is a projection, and it says so plainly
 * (weights are a guess until there is history, Data-Model §7.4) without hedging every number.
 */
export const FORECAST_COPY = {
  title: "Commission forecast",
  subtitle: "Expected commission by stage, each counted at a percent you can adjust.",
  scopeChip: "All open trips",

  weightedTitle: "Weighted forecast",
  stagesLabel: "Forecast by stage",
  stageInquiry: "Inquiry",
  stageProposal: "Proposal",
  stageBooked: "Booked",
  stageTraveling: "Traveling",
  adjust: "Adjust weights",
  save: "Save weights",
  cancel: "Cancel",
  saving: "Saving…",
  weightLabel: "Weight (%)",
  weightsHint: "Saving also changes the confidence on your worklist's Commission expected.",
  weightsInvalid: "Each weight is a whole number from 0 to 100.",
  stale: "These weights were changed somewhere else, so yours weren't saved. Reload the page and try again.",
  saveFailed: "That didn't save. Try again in a moment.",
  nothingYet: "No open trips have commission yet. It shows up here once you add a booking that earns commission.",

  calendarTitle: "Cash-in calendar",
  calendarLabel: "Expected commission by month",
  overdue: "Overdue",
  later: "Later",
  undated: "No travel dates yet",
  noTermsNote: "Bookings with no payment terms on file are expected 60 days after the trip ends.",
} as const;

/** The cancel dialog's checkbox: "Mark this line as Lost" / "Mark these 2 lines as Lost". */
export function cancelLinesCheckbox(n: number): string {
  return n === 1 ? "Mark this line as Lost" : `Mark these ${n.toLocaleString("en-US")} lines as Lost`;
}

/**
 * The receipt a save leaves on screen when it named any commission lines; null when it named
 * none, and the dialog then closes as it always has. It leads with the trip, because the
 * receipt replaces the whole form and is the only thing left to read.
 *
 *  - `skipped`: moved since the page loaded (paid, edited, removed) and left alone.
 *  - Named but in neither count (an Edge Function too old to know the list, say) is said as
 *    unconfirmed, never as closed: the box was ticked, so silence would read as done.
 */
export function cancelReceipt(r: {
  /** This save cancelled the trip, rather than correcting one already cancelled. */
  cancelled: boolean;
  named: number;
  closed: number;
  skipped: number;
}): string | null {
  if (r.named <= 0) return null;
  const n = (k: number) => k.toLocaleString("en-US");
  const parts = [r.cancelled ? "Trip cancelled." : "Details saved."];
  if (r.closed > 0) {
    parts.push(`${n(r.closed)} commission ${r.closed === 1 ? "line" : "lines"} marked Lost.`);
  }
  if (r.skipped > 0) {
    parts.push(
      r.skipped === 1
        ? "1 line changed since the page loaded, so it was left alone."
        : `${n(r.skipped)} lines changed since the page loaded, so they were left alone.`,
    );
  }
  const unconfirmed = r.named - r.closed - r.skipped;
  if (unconfirmed > 0) {
    parts.push(
      unconfirmed === 1
        ? "We couldn't confirm 1 line was marked Lost. Check it in the ledger."
        : `We couldn't confirm ${n(unconfirmed)} lines were marked Lost. Check them in the ledger.`,
    );
  }
  return parts.join(" ");
}

/**
 * "Of $11,101 across 11 open trips · 94% confidence": the worklist's "Commission expected"
 * tile, in its own words. That tile shows the unweighted total and this confidence; the big
 * number here is the weighted one, and this line is how the two screens are seen to agree.
 */
export function forecastAcross(rawTotal: string, trips: number, confidencePct: number | null): string {
  const head = `Of ${rawTotal} across ${trips.toLocaleString("en-US")} open ${trips === 1 ? "trip" : "trips"}`;
  return confidencePct === null ? head : `${head} · ${confidencePct}% confidence`;
}

/** "3 trips" under a stage. */
export function forecastTripCount(n: number): string {
  return `${n.toLocaleString("en-US")} ${n === 1 ? "trip" : "trips"}`;
}

/** "$200 of the forecast is already received, so the calendar leaves it out." */
export function forecastReceivedNote(amount: string): string {
  return `${amount} of the forecast is already received, so the calendar leaves it out.`;
}

/** While editing: "New total: $10,411 · 94% confidence". */
export function forecastNewTotal(total: string, confidencePct: number | null): string {
  return confidencePct === null ? `New total: ${total}` : `New total: ${total} · ${confidencePct}% confidence`;
}

// ── §3.10 Messaging (Stage 1: inbox and thread) ─────────────────────────────
// The advisor's own tool, so plain and quick. "Overdue" is Gyasi's rule (2026-10-13): one
// business day, Sundays never count, so a day of rest never reads as late.
export const AGENT_MESSAGES_COPY = {
  title: "Messages",
  inboxLabel: "Message threads",
  caughtUp: "All caught up",
  filterUnread: "Unread",
  filterOverdue: "Overdue",
  viewArchived: "Archived",
  viewInbox: "Inbox",
  searchLabel: "Search messages",
  searchPlaceholder: "Name, trip or message",
  searchSubmit: "Search",
  oneClient: "This client",
  oneTrip: "This trip",
  clearFilter: "Show all",
  emptyInbox: "No messages yet. When a client writes to you, it shows up here.",
  emptyNarrowed: "No threads match these filters.",
  emptyArchived: "Nothing archived.",
  pickThread: "Pick a thread to read it here.",
  generalThread: "General",
  youPrefix: "You: ",
  overdue: "Overdue",
  unreadLabel: "unread",
  pagesLabel: "Inbox pages",
  newer: "Newer",
  older: "Older",
  selectLabel: "Select",
  selectedLabel: "Selected threads",
  archiveSelected: "Archive",
  restoreSelected: "Move to inbox",
  archiveFailed: "That didn't save. Try again in a moment.",
  // Thread
  backToInbox: "All messages",
  openTrip: "Open trip",
  openClient: "Open client",
  openInMessages: "Open in Messages",
  archiveThread: "Archive",
  restoreThread: "Move to inbox",
  archivedTag: "Archived",
  archivedDone: "Archived",
  restoredDone: "Moved to inbox",
  internalNoteTag: "Internal note · only you can see this",
  senderYou: "You",
  truncated: "Showing the latest 500 messages.",
  emptyThread: "No messages in this thread yet.",
  // Reply
  replyLabel: "Reply",
  replyPlaceholder: "Write a reply…",
  messageLabel: "Message",
  messagePlaceholder: "Write a message…",
  notePlaceholder: "Write a note only you can see…",
  noteSwitch: "Internal note",
  noteHint: "Only you can see this note.",
  send: "Send",
  addNote: "Add note",
  sending: "Sending…",
  sent: "Sent",
  noteAdded: "Note added",
  sendFailed: "That didn't send. Try again in a moment.",
  // New message (from Client Detail / Trip Detail)
  newTitle: "New message",
  notFound: "That client isn't one of yours, or they've been archived.",
} as const;

/** "3 unread · 1 overdue", or "All caught up". */
export function messagesHeadline(unreadThreads: number, overdueThreads: number): string {
  const parts: string[] = [];
  if (unreadThreads > 0) parts.push(`${unreadThreads.toLocaleString("en-US")} unread`);
  if (overdueThreads > 0) parts.push(`${overdueThreads.toLocaleString("en-US")} overdue`);
  return parts.length > 0 ? parts.join(" · ") : AGENT_MESSAGES_COPY.caughtUp;
}

/** "Reply by end of Mon": the day a reply falls due, before it is overdue (the thread header). */
export function messagesReplyBy(day: string): string {
  return `Reply by end of ${day}`;
}

/** "Reply by Mon": the same, short enough for an inbox row. */
export function messagesReplyByShort(day: string): string {
  return `Reply by ${day}`;
}

/** Under the reply box when the client has no login yet. */
export function messagesNoLogin(firstName: string): string {
  return `${firstName} hasn't set up a login yet. This will be waiting for them.`;
}

/** What a bulk archive (or bring-back) did, for the list's status line. */
export function messagesMoved(n: number, archived: boolean): string {
  return `${n.toLocaleString("en-US")} ${archived ? "archived" : "moved to inbox"}`;
}

/** "Message Kai", Client Detail's header button. */
export function messageClientLabel(firstName: string): string {
  return `Message ${firstName}`;
}

/** "Message Maya", the new-thread page's heading. */
export function messagesNewTo(firstName: string): string {
  return `Message ${firstName}`;
}

/** "2 selected" in the inbox's bulk bar. */
export function messagesSelected(n: number): string {
  return `${n.toLocaleString("en-US")} selected`;
}
