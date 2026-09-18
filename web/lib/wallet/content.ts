/**
 * Copy for Screen Inventory §2.4 Payment & Card Authorization.
 *
 * Pinned against its Kotlin twin `WalletMessages` in
 * `mobile/shared/src/commonMain/kotlin/com/storytail/adventures/domain/wallet/WalletCopy.kt`
 * by `.github/scripts/check_copy_parity.py`. Change a string here and the same change is
 * required there, or CI fails.
 *
 * THIS IS THE MOST COMPLIANCE-SENSITIVE COPY IN THE APP, and three strings below are
 * load-bearing rather than decorative:
 *
 *  · `feeAssurance` states the thing BRD §10.5 makes a hard product constraint: Story-Tail is
 *    contractually prohibited from charging clients planning, consultation or service fees.
 *    It is not marketing reassurance, it is the truth about what the platform can do, and it
 *    is why there is no invoice entity and no charge endpoint anywhere in the schema.
 *
 *  · `consentMandate` is the wording frozen into `card_authorization.consent_payload` at the
 *    moment a traveler agrees. That column is NOT NULL precisely so the text cannot be
 *    rewritten out from under a past agreement — so this string may be superseded by a new
 *    version, never edited. The Edge Function holds its own copy for the same reason and
 *    bumps `CONSENT_VERSION` when it changes.
 *
 *  · `chargedBySupplier` is the sentence that keeps 2.4.6 honest about who took the money.
 *    Story-Tail is not the merchant of record; the supplier charged the card. Getting this
 *    wrong would describe a merchant relationship the business does not have.
 *
 * NOTHING HERE PROMISES A NOTIFICATION. The prototype's consent copy and its 2.4.4 summary
 * both say the traveler will be told every time the card is used. No dispatcher exists on
 * either stack — no transactional email, no push — and `notification_preference` is read and
 * written by nothing. Because the mandate is persisted, shipping that clause would store an
 * undeliverable promise rather than merely display one. It returns as consent version 2.
 */
export const WALLET = {
  title: "Cards on file",
  subtitle:
    "Tokenized by Stripe — we never see the full number. Used only to pay suppliers on your behalf.",

  feeAssurance: "Story-Tail never charges you a service fee.",
  feeAssuranceBody: "Cards are used only to pay suppliers.",

  statusActive: "Active",
  statusRevoked: "Revoked",
  statusExpired: "Expired",
  /** `card_status` has four values, not two — see `cardStatusLabel`. */
  statusFailed: "Needs attention",

  /** 2.4.1's per-card actions. */
  viewActivity: "Activity",
  removeAuthorization: "Remove authorization",

  /**
   * 2.4.2 is deferred. Rendered disabled with the reason on screen — the §2.5 rule, so a
   * list does not grow items under the reader's thumb as sections land.
   */
  addCard: "Add a card",
  addCardDeferred: "Coming with the next release",

  emptyTitle: "No cards on file",
  emptyBody:
    "When a trip needs one, Gyasi will ask — and you will authorize a card for that trip only, with a limit you set.",

  /** 2.4.3. */
  authorizeTitle: "Authorize a card",
  authorizeCardHeading: "Card",
  authorizeNoNewCard: "Adding a new card arrives with the next release.",
  limitHeading: "Spending limit",
  limitBody: "The most Gyasi can put on this card for this trip.",
  limitCustom: "Custom",
  expiresLabel: "Expires",
  expiresHint: "Seven days after the trip ends, so a late supplier charge still goes through.",
  consentMandate:
    "I authorize Story-Tail Adventures to use this card to pay suppliers for this trip, up to the limit shown. Story-Tail does not charge me a planning or service fee.",
  authorizeCta: "Authorize",
  authorizeFailed: "That didn't go through. Nothing was authorized — try again in a moment.",
  consentRequired: "Tick the box to authorize.",

  /** 2.4.4. */
  // The screen's own name, not 2.4.3's. The confirmation used to wear `authorizeTitle` in
  // its chrome — a tab and a top bar reading "Authorize a card" over a page whose first line
  // says the card is already authorized. The artboard draws no top bar here at all, so there
  // was nothing to copy; this is the smallest true thing to put in it.
  confirmedTitle: "Card authorization",
  confirmedOverline: "AUTHORIZED",
  confirmedSummary: "SUMMARY",
  confirmedTrip: "Trip",
  confirmedCard: "Card",
  confirmedLimit: "Limit",
  confirmedExpires: "Expires",
  confirmedBackToTrip: "Back to trip",

  /** 2.4.5 and 2.4.6. */
  activityTitle: "Card activity",
  activitySubtitle:
    "Every time a card on file was used to pay a supplier. Each one is audit-logged.",
  activityEmptyTitle: "Nothing on this card yet",
  activityEmptyBody:
    "When Gyasi pays a supplier with a card you have authorized, it shows up here — the amount, who took it, and when.",
  filterAllCards: "All cards",
  filterAllTrips: "All trips",

  useDetailTitle: "Card use",
  chargedBySupplier: "Charged by the supplier",
  chargedBySupplierBody: "The supplier charged your card directly. Story-Tail never handled the money.",
  detailAmount: "Amount",
  detailCard: "Card",
  detailSupplier: "Supplier",
  detailPaidBy: "Paid by",
  detailTrip: "Trip",
  detailWhen: "When",
  detailReference: "Reference",
  askGyasi: "Ask Gyasi about this",
  /** See the amendment at Screen-Inventory §2.4.6 — the append-only conflict in §9.4. */
  flagUnfamiliar: "Flag as unfamiliar",
  flagDeferred: "Flagging arrives once the activity log can record it.",

  /** 2.4.7. */
  removeTitle: "Remove authorization",
  removeOverline: "CONFIRM",
  removeBodyLead: "Gyasi will not be able to put anything else on this card for this trip.",
  removeBodyPast:
    "Charges already made are unaffected — a supplier cannot be refunded through Story-Tail.",
  removeThisAuthorization: "THIS AUTHORIZATION",
  /** Departure 7: the card stays on file, because removing it here would not remove it from Stripe. */
  removeCardStays:
    "The card stays on file for your other trips. Removing a card entirely arrives with the next release.",
  removeCta: "Yes, remove it",
  removeCancel: "Cancel",
  removeFailed: "That didn't go through. The authorization is unchanged — try again in a moment.",
} as const;
