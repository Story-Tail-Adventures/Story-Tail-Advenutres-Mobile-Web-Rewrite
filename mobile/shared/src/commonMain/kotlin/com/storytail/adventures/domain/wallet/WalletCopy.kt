package com.storytail.adventures.domain.wallet

/**
 * Copy for Screen Inventory §2.4 Payment & Card Authorization.
 *
 * The twin of `web/lib/wallet/content.ts`'s `WALLET`, compared key by key by
 * `.github/scripts/check_copy_parity.py`. Change a string here and the same change is
 * required there, or CI fails.
 *
 * FLAT `const val` ONLY — the parity script's Kotlin parser terminates at the first
 * line-leading `}`, so a nested function or list declared inside this object would silently
 * truncate the map and take every key after it out of the gate.
 *
 * THIS IS THE MOST COMPLIANCE-SENSITIVE COPY IN THE APP, and three strings are load-bearing
 * rather than decorative:
 *
 *  · [FEE_ASSURANCE] states what BRD §10.5 makes a hard product constraint: Story-Tail is
 *    contractually prohibited from charging clients planning, consultation or service fees.
 *    It is not reassurance, it is the truth about what the platform can do, and it is why
 *    there is no invoice entity and no charge endpoint anywhere in the schema.
 *
 *  · [CONSENT_MANDATE] is the wording frozen into `card_authorization.consent_payload` at the
 *    moment a traveler agrees. That column is NOT NULL precisely so the text cannot be
 *    rewritten out from under a past agreement — so this string may be SUPERSEDED by a new
 *    version, never edited. `card-authorization/index.ts` holds its own copy for the same
 *    reason and bumps CONSENT_VERSION when it changes.
 *
 *  · [CHARGED_BY_SUPPLIER_BODY] keeps 2.4.6 honest about who took the money. Story-Tail is
 *    not the merchant of record; the supplier charged the card. Getting it wrong would
 *    describe a merchant relationship the business does not have.
 *
 * NOTHING HERE PROMISES A NOTIFICATION. The prototype's consent copy and its 2.4.4 summary
 * both say the traveler will be told every time the card is used. No dispatcher exists on
 * either stack, and because the mandate is PERSISTED, shipping that clause would store an
 * undeliverable promise rather than merely display one. It returns as consent version 2.
 */
object WalletMessages {
    const val TITLE = "Cards on file"
    const val SUBTITLE =
        "Tokenized by Stripe — we never see the full number. Used only to pay suppliers on your behalf."

    const val FEE_ASSURANCE = "Story-Tail never charges you a service fee."
    const val FEE_ASSURANCE_BODY = "Cards are used only to pay suppliers."

    const val STATUS_ACTIVE = "Active"
    const val STATUS_REVOKED = "Revoked"
    const val STATUS_EXPIRED = "Expired"

    /** 2.4.1's per-card actions. */
    const val VIEW_ACTIVITY = "Activity"
    const val REMOVE_AUTHORIZATION = "Remove authorization"

    /**
     * 2.4.2 is deferred. Rendered disabled with the reason on screen — the §2.5 rule, so a
     * list does not grow items under the reader's thumb as sections land.
     */
    const val ADD_CARD = "Add a card"
    const val ADD_CARD_DEFERRED = "Coming with the next release"

    const val EMPTY_TITLE = "No cards on file"
    const val EMPTY_BODY =
        "When a trip needs one, Gyasi will ask — and you will authorize a card for that trip only, with a limit you set."

    /** 2.4.3. */
    const val AUTHORIZE_TITLE = "Authorize a card"
    const val AUTHORIZE_CARD_HEADING = "Card"
    const val AUTHORIZE_NO_NEW_CARD = "Adding a new card arrives with the next release."
    const val LIMIT_HEADING = "Spending limit"
    const val LIMIT_BODY = "The most Gyasi can put on this card for this trip."
    const val LIMIT_CUSTOM = "Custom"
    const val EXPIRES_LABEL = "Expires"
    const val EXPIRES_HINT =
        "Seven days after the trip ends, so a late supplier charge still goes through."
    const val CONSENT_MANDATE =
        "I authorize Story-Tail Adventures to use this card to pay suppliers for this trip, up to the limit shown. Story-Tail does not charge me a planning or service fee."
    const val AUTHORIZE_CTA = "Authorize"
    const val AUTHORIZE_FAILED =
        "That didn't go through. Nothing was authorized — try again in a moment."
    const val CONSENT_REQUIRED = "Tick the box to authorize."

    /** 2.4.4. */
    /** The screen's own name — see the note on the web twin's `confirmedTitle`. */
    const val CONFIRMED_TITLE = "Card authorization"
    const val CONFIRMED_OVERLINE = "AUTHORIZED"
    const val CONFIRMED_SUMMARY = "SUMMARY"
    const val CONFIRMED_TRIP = "Trip"
    const val CONFIRMED_CARD = "Card"
    const val CONFIRMED_LIMIT = "Limit"
    const val CONFIRMED_EXPIRES = "Expires"
    const val CONFIRMED_BACK_TO_TRIP = "Back to trip"

    /** 2.4.5 and 2.4.6. */
    const val ACTIVITY_TITLE = "Card activity"
    const val ACTIVITY_SUBTITLE =
        "Every time a card on file was used to pay a supplier. Each one is audit-logged."
    const val ACTIVITY_EMPTY_TITLE = "Nothing on this card yet"
    const val ACTIVITY_EMPTY_BODY =
        "When Gyasi pays a supplier with a card you have authorized, it shows up here — the amount, who took it, and when."
    const val FILTER_ALL_CARDS = "All cards"
    const val FILTER_ALL_TRIPS = "All trips"

    const val USE_DETAIL_TITLE = "Card use"
    const val CHARGED_BY_SUPPLIER = "Charged by the supplier"
    const val CHARGED_BY_SUPPLIER_BODY =
        "The supplier charged your card directly. Story-Tail never handled the money."
    const val DETAIL_AMOUNT = "Amount"
    const val DETAIL_CARD = "Card"
    const val DETAIL_SUPPLIER = "Supplier"
    const val DETAIL_PAID_BY = "Paid by"
    const val DETAIL_TRIP = "Trip"
    const val DETAIL_WHEN = "When"
    const val DETAIL_REFERENCE = "Reference"
    const val ASK_GYASI = "Ask Gyasi about this"

    /** See the amendment at Screen-Inventory §2.4.6 — the append-only conflict in §9.4. */
    const val FLAG_UNFAMILIAR = "Flag as unfamiliar"
    const val FLAG_DEFERRED = "Flagging arrives once the activity log can record it."

    /** 2.4.7. */
    const val REMOVE_TITLE = "Remove authorization"
    const val REMOVE_OVERLINE = "CONFIRM"
    const val REMOVE_BODY_LEAD =
        "Gyasi will not be able to put anything else on this card for this trip."
    const val REMOVE_BODY_PAST =
        "Charges already made are unaffected — a supplier cannot be refunded through Story-Tail."
    const val REMOVE_THIS_AUTHORIZATION = "THIS AUTHORIZATION"

    /** Departure 7: the card stays on file, because removing it here would not remove it from Stripe. */
    const val REMOVE_CARD_STAYS =
        "The card stays on file for your other trips. Removing a card entirely arrives with the next release."
    const val REMOVE_CTA = "Yes, remove it"
    const val REMOVE_CANCEL = "Cancel"
    const val REMOVE_FAILED =
        "That didn't go through. The authorization is unchanged — try again in a moment."
}

/**
 * The two-to-four characters that fit on a brand plate, and the brand as a word in a sentence.
 *
 * `payment_card.brand` holds Stripe's lowercase token. A naive `take(4)` renders "mastercard"
 * as MAST, and dropping the raw token into prose gives "Your visa is ready" — the web build
 * shipped both to a browser before screenshots caught them. Kept OUTSIDE the object above
 * because the parity parser stops at the first line-leading `}`.
 */
private val BRAND_CHIPS = mapOf(
    "visa" to "VISA",
    "mastercard" to "MC",
    "amex" to "AMEX",
    "discover" to "DISC",
    "diners" to "DINE",
    "jcb" to "JCB",
    "unionpay" to "UP",
)

private val BRAND_WORDS = mapOf(
    "visa" to "Visa",
    "mastercard" to "Mastercard",
    "amex" to "Amex",
    "discover" to "Discover",
    "diners" to "Diners Club",
    "jcb" to "JCB",
    "unionpay" to "UnionPay",
)

fun brandChip(brand: String): String =
    BRAND_CHIPS[brand.lowercase()] ?: brand.take(4).uppercase()

fun brandName(brand: String): String =
    BRAND_WORDS[brand.lowercase()] ?: brand.lowercase().replaceFirstChar { it.uppercase() }

/** "VISA •••• 4242". */
fun cardLabel(brand: String, last4: String): String = "${brand.uppercase()} •••• $last4"

/** "11/29" — the two-digit month and year a card face shows. */
fun cardExpiry(expMonth: Int, expYear: Int): String =
    "${expMonth.toString().padStart(2, '0')}/${expYear.toString().takeLast(2)}"
