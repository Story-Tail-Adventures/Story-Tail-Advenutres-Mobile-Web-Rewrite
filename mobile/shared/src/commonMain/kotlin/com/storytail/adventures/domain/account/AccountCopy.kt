package com.storytail.adventures.domain.account

import com.storytail.adventures.content.public.LegalSlug

/**
 * Screen Inventory §2.5's copy, the Kotlin twin of the ten `content.ts` modules under
 * `web/app/(client)/account/` and `web/app/(client)/documents/`.
 *
 * ONE OBJECT PER WEB MODULE, and every one is registered in
 * `.github/scripts/check_copy_parity.py`. That script's header says why it must be: "a
 * message added on one side and left out of the map is a SILENT gap, not a failure." The web
 * modules each carry a note saying the row lands in the same change that builds the Compose
 * twin — this is that change.
 *
 * ONLY PLAIN STRINGS LIVE INSIDE THESE OBJECTS. The parity script skips a web key whose
 * value is a function or an array, and its Kotlin reader stops at the first closing brace it
 * finds at the start of a line — so a nested `listOf(` or a `fun` inside one of these objects
 * would silently truncate the comparison. The four non-string members are declared below the
 * objects for exactly that reason, not for tidiness.
 *
 * §2.5 IS MOSTLY DEFERRALS, and the wording of a deferral is load-bearing: it is the only
 * thing standing between a reader and the conclusion that the app is broken. Design-System §2
 * governs all of it — see the web modules for the per-string reasoning, which is not repeated
 * here because there would then be two places for it to drift.
 */

/** Screen 2.5.1 Account Overview — the Account tab's root. */
object AccountMessages {
    const val TITLE = "Account"
    const val GROUP_YOU = "YOU"
    const val GROUP_APP = "APP"
    const val GROUP_SUPPORT = "SUPPORT"
    const val PERSONAL = "Personal info"
    const val PERSONAL_SUB = "Name, email, phone, address"
    const val PREFERENCES = "Travel preferences"
    const val PREFERENCES_SUB = "Style, dietary, loyalty"
    const val DOCUMENTS = "Travel documents"
    const val DOCUMENTS_EMPTY_SUB = "Passports, visas, insurance"
    const val NOTIFICATIONS = "Notifications"
    const val SECURITY = "Security"
    const val SECURITY_SUB = "Password and two-factor"
    const val CONNECTED = "Connected accounts"
    const val CONNECTED_SUB = "Google and Apple sign-in"
    const val HELP = "Help & support"
    const val HELP_SUB = "Common questions, or message Gyasi"
    const val PRIVACY = "Privacy & data"
    const val PRIVACY_SUB = "Download a copy of your data"
    const val WALLET = "Payment methods"
    const val COMING_SOON = "Coming with the next release"
    const val SIGN_OUT = "Sign out"
    const val FALLBACK_NAME = "Your account"
}

/** Screen 2.5.2 Personal Info Edit. */
object PersonalMessages {
    const val TITLE = "Personal info"
    const val SUBTITLE = "What Gyasi needs to book without chasing you for paperwork."
    const val IDENTITY_HEADING = "YOUR ACCOUNT"
    const val NAME_LABEL = "Name"
    const val EMAIL_LABEL = "Email"
    const val NOT_SET = "Not set"
    const val IDENTITY_NOTE = "Changing your name or the address you sign in with isn’t something you can do here yet — message Gyasi and he’ll sort it."
    const val SAVE = "Save"
    const val CANCEL = "Cancel"
}

/** Screen 2.5.3 Travel Preferences Edit. */
object AccountPreferencesMessages {
    const val TITLE = "Travel preferences"
    const val SUBTITLE = "None of this is required. It just saves Gyasi asking you twice."
    const val SAVE = "Save"
    const val CANCEL = "Cancel"
}

/** Screen 2.5.4 Travel Documents, the account-wide library. Per-trip is §2.2.6. */
object DocumentLibraryMessages {
    const val TITLE = "Travel documents"
    const val SUBTITLE = "Passports, visas, insurance — everything in one place."
    const val UPLOAD_CTA = "Add a document"
    const val UPLOAD_DEFERRED = "Coming with the next release — for now, add documents from a trip"
    const val EMPTY_TITLE = "Nothing here yet"
    const val EMPTY_BODY = "Documents you or Gyasi add to a trip show up here too, so you always have one place to look."
    const val EMPTY_CTA = "Back to your trips"
    const val PRIVACY_NOTE = "Stored encrypted, and only you and Gyasi can open them. Every time one is opened, it is written down."
}

/** Screen 2.5.6 Notification Preferences — a placeholder, deliberately and in full. */
object NotificationsMessages {
    const val TITLE = "Notifications"
    const val EMPTY_TITLE = "Nothing to set here yet"
    const val EMPTY_BODY = "We haven’t built automatic notifications, so there is nothing to switch on or off. When we do, this is where you’ll choose what reaches you and how."
    const val REACH_YOU = "Until then, anything that matters comes from Gyasi directly — usually by email, always by a person."
}

/** Screen 2.5.7 Security Settings. */
object SecurityMessages {
    const val TITLE = "Security"
    const val SUBTITLE = "How you get in, and how we keep others out."
    const val PASSWORD_TITLE = "Password"
    const val PASSWORD_BODY = "Change it whenever you like — you’ll get a link by email."
    const val PASSWORD_CTA = "Change password"
    const val PASSWORD_DEFERRED = "Coming with the next release — for now, sign out and use “Forgot?” on the sign-in screen."
    const val NO_PASSWORD_TITLE = "How you sign in"
    const val NO_PASSWORD_CTA = "Connected accounts"
    const val MFA_TITLE = "Two-factor authentication"
    const val MFA_ON = "On"
    const val MFA_OFF = "Off"
    const val MFA_BODY = "A six-digit code from your authenticator app, on top of your password."
    const val MFA_ENABLE_CTA = "Turn on two-factor"
    const val MFA_MANAGE_CTA = "Replace your authenticator"
    const val MFA_MANAGE_DEFERRED = "Coming with the next release. Two-factor is on and working in the meantime."
    const val SESSIONS_HEADING = "WHERE YOU ARE SIGNED IN"
    const val SESSIONS_DEFERRED = "We can’t show you your other devices yet. It needs a piece we haven’t built, and a list that is always empty would tell you the wrong thing."
    const val SESSIONS_ADVICE = "If you think someone else has your account: change your password, turn on two-factor, and tell Gyasi. He would rather hear about it early."
}

/** Screen 2.5.8 Connected Accounts. Read-only: neither action has a safe path. */
object ConnectedMessages {
    const val TITLE = "Connected accounts"
    const val SUBTITLE = "How you sign in."
    const val LINKED = "Connected"
    const val NOT_LINKED = "Not connected"
    const val LINK_CTA = "Link"
    const val UNLINK_CTA = "Unlink"
    const val LINK_DEFERRED = "Coming with the next release"
    const val UNLINK_DEFERRED = "Coming with the next release"
    const val EMAIL_ACCOUNT_NOTE = "You sign in with an email address and password. Linking Google or Apple would let you skip the password — that is coming."
    const val OAUTH_ACCOUNT_NOTE = "You sign in through the provider above, so there is no password on this account. Changing it is done in that account, not here."
    const val SAFETY_NOTE = "Unlinking never deletes anything. Your trips, documents and messages stay exactly where they are."
}

/** Screen 2.5.9 Privacy & Data Export. */
object PrivacyMessages {
    const val TITLE = "Privacy & data"
    const val SUBTITLE = "What we hold, and what we don’t."
    const val EXPORT_TITLE = "Download your data"
    const val EXPORT_BODY = "Your profile, your trips, your documents and your messages. It is yours; take a copy whenever you like."
    const val EXPORT_CTA = "Request an export"
    const val EXPORT_DEFERRED = "Coming with the next release"
    const val TRACKING_HEADING = "TRACKING"
    const val TRACKING_BODY = "We don’t run analytics or advertising trackers. The only cookies here are the ones that keep you signed in, and you can clear those any time in your browser."
    const val COOKIES_LINK = "Read the cookie policy"
    const val CLOSE_TITLE = "Close your account"
    const val CLOSE_BODY = "Your trips are archived and your personal details are anonymized. Some records have to be kept for tax reasons — we will show you exactly which before you confirm."
    const val CLOSE_CTA = "Close my account"
}

/** Screen 2.5.10 Account Closure. Every line here is a retention or legal claim. */
object CloseMessages {
    const val TITLE = "Close account"
    const val BACK = "Privacy & data"
    const val HEADING = "Close your account?"
    const val WHAT_HAPPENS_LABEL = "WHAT HAPPENS"
    const val RECONSIDER_BODY = "If something went wrong, Gyasi would rather hear it than lose you. This page will still be here afterwards."
    const val RECONSIDER_CTA = "Message him first"
    const val MAILTO = "mailto:hello@story-tail.com?subject=Before%20I%20close%20my%20account"
    const val REASON_LABEL = "Anything you want to tell us? (optional)"
    const val REASON_PLACEHOLDER = "Only if you feel like it."
    const val CONFIRM_LABEL = "Type your email address to confirm"
    const val CONFIRM_PLACEHOLDER = "you@example.com"
    const val CONFIRM_HINT = "This is the address you sign in with."
    const val CONFIRM_CTA = "Close my account"
    const val KEEP_CTA = "Keep my account"
    const val DEFERRED = "Coming with the next release"
}

/** Screen 2.5.11 Help & Support. */
object HelpMessages {
    const val TITLE = "Help & support"
    const val SUBTITLE = "Quick answers, or talk to Gyasi directly."
    const val ADVISOR_NAME = "Gyasi Story · your advisor"
    const val REPLY_WINDOW = "Usually replies the same day"
    const val ADVISOR_BODY = "Anything about your own trip is quickest this way. There is never a fee for asking."
    const val MESSAGE_CTA = "Message Gyasi"
    const val MAILTO = "mailto:hello@story-tail.com?subject=A%20question"
    const val FAQ_HEADING = "COMMON QUESTIONS"
    const val LEGAL_HEADING = "Legal"
    /** Gyasi's own initials, for the advisor card. Not a photograph — see [InitialsAvatar]. */
    const val ADVISOR_INITIALS = "GS"
}

// ─── The members the parity script cannot compare ─────────────────────────────────────
//
// A function or a list on the web side is skipped by `web_messages`, and a `fun` or a
// `listOf(` INSIDE one of the objects above would truncate the Kotlin reader at the first
// line-leading brace. Both halves of that are why these live out here.

/** `ACCOUNT.memberSince`. The month is already formatted — see [monthAndYear]. */
fun memberSince(month: String): String = "Traveling with Gyasi since $month"

/**
 * "March 2024" from a `created_at` timestamp, or null when it cannot be read.
 *
 * IN UTC, and only the leading `YYYY-MM` is parsed. The web twin passes `timeZone: "UTC"` to
 * `toLocaleDateString` for the same reason: `created_at` is a `timestamptz` and rendering it
 * in the device's zone would move somebody who signed up late on the 31st into the previous
 * month on one stack and not the other. Nothing about "since March 2024" needs an offset.
 *
 * Not `kotlinx.datetime.Instant.parse` — a value this screen merely decorates should not be
 * able to throw on a row Postgres formatted slightly differently.
 */
fun monthAndYear(createdAt: String?): String? {
    val year = createdAt?.take(4)?.toIntOrNull() ?: return null
    val month = createdAt.drop(5).take(2).toIntOrNull() ?: return null
    if (month !in 1..12) return null
    return "${LONG_MONTHS[month - 1]} $year"
}

/**
 * Spelled out, because the web side spells them out.
 *
 * A second copy of the list in `ui/components/client/TripParts.kt`, kept rather than shared:
 * that one is private to the trip formatters and this is `domain`, which must not depend on
 * `ui`. Twelve month names are not a thing that changes.
 */
private val LONG_MONTHS = listOf(
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
)

/**
 * `ACCOUNT.documentsSub`. A count the destination screen must agree with — 2.5.4 renders the
 * same list, and a hub that contradicts it is the cheapest possible bug to ship.
 *
 * NO "expiring soon" half. Neither stack computes one: it needs `travel_document.expires_on`
 * compared against a window, and this hub reads `document`, which has no expiry at all.
 */
fun documentsSub(files: Int): String = "$files ${if (files == 1) "file" else "files"}"

/**
 * `SECURITY.noPasswordBody`. [provider] is the raw `account.auth_provider` value, so the two
 * known ones are given their proper names and anything else is echoed rather than guessed at.
 */
fun noPasswordBody(provider: String): String {
    val label = when (provider) {
        "google" -> "Google"
        "apple" -> "Apple"
        else -> provider
    }
    return "You sign in with $label, so there is no password here to change. " +
        "Manage it in that account."
}

/** `CLOSE.whatHappens`. Card revocation is stated as a consequence, not as an action. */
val CLOSE_WHAT_HAPPENS: List<String> = listOf(
    "Your trips are archived — ask for a final PDF first if you want one",
    "Any card you have saved stops being usable",
    "Your personal details are anonymized",
    "Booking and tax records are kept, because the law requires it",
)

/** `HELP.legal`. The labels are this screen's own, shorter than the documents' own titles. */
val HELP_LEGAL: List<Pair<LegalSlug, String>> = listOf(
    LegalSlug.PRIVACY to "Privacy",
    LegalSlug.TERMS to "Terms",
    LegalSlug.COOKIES to "Cookies",
    LegalSlug.ACCESSIBILITY to "Accessibility",
)
