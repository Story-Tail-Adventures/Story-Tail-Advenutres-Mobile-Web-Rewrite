#!/usr/bin/env python3
"""
Enforce that the user-facing strings duplicated across web and mobile stay identical.

`web/` and `mobile/` deliberately hold parallel implementations of the same validation
rules and error taxonomy — CLAUDE.md makes the stack directories a hard boundary, and the
KMP shared module does not run on the web. That duplication is the right call, but nothing
stops the two copies drifting apart, and drift means a traveler sees one wording on their
phone and another in the browser.

The unit tests on each side cover behaviour. This covers wording.

Run: python3 .github/scripts/check_copy_parity.py
"""
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]

VALIDATION_DIR = ROOT / "mobile/shared/src/commonMain/kotlin/com/storytail/adventures/domain/validation"
WEB_ERRORS = ROOT / "web/lib/auth-errors.ts"
KMP_ERRORS = ROOT / "mobile/shared/src/commonMain/kotlin/com/storytail/adventures/api/AuthError.kt"
SCREENS_DIR = ROOT / "mobile/shared/src/commonMain/kotlin/com/storytail/adventures/ui/screens/auth"
WIZARD_DIR = ROOT / "mobile/shared/src/commonMain/kotlin/com/storytail/adventures/ui/screens/onboarding"
DOMAIN_DIR = ROOT / "mobile/shared/src/commonMain/kotlin/com/storytail/adventures/domain/onboarding"
WEB_WIZARD = ROOT / "web/app/(onboarding)/onboarding"
TRIP_DOMAIN_DIR = ROOT / "mobile/shared/src/commonMain/kotlin/com/storytail/adventures/domain/trip"
TRIP_SCREENS_DIR = ROOT / "mobile/shared/src/commonMain/kotlin/com/storytail/adventures/ui/screens/trip"

# Each entry is one pair of parallel modules. The key map is the whole point: this script
# only compares what it is told about, so a message added on one side and left out of the
# map is a SILENT gap, not a failure. Add the row when you add the string.
MESSAGE_TABLES = [
    {
        # Screen 2.2.1's copy. Only the plain-string keys are listed: the web side's
        # greeting variants are functions (the "0 days"/"1 day" special cases need one) and
        # web_messages skips anything that is not a string literal, so those are covered by
        # the paired unit tests instead.
        "label": "dashboard 2.2.1",
        "web_file": ROOT / "web/app/(client)/dashboard/content.ts",
        "web_const": "DASHBOARD",
        "kmp_file": ROOT / "mobile/shared/src/commonMain/kotlin/com/storytail/adventures/ui/screens/dashboard/DashboardUiState.kt",
        "kmp_object": "DashboardMessages",
        "keys": {
            "overlineRest": "OVERLINE_REST",
            "overlineNeutral": "OVERLINE_NEUTRAL",
            "subtitleTraveling": "SUBTITLE_TRAVELING",
            "subtitleNoTrip": "SUBTITLE_NO_TRIP",
            "viewItinerary": "VIEW_ITINERARY",
            "itineraryNotReady": "ITINERARY_NOT_READY",
            "actionNeededLabel": "ACTION_NEEDED_LABEL",
            "authorizeCard": "AUTHORIZE_CARD",
            "authorizeCardComingSoon": "AUTHORIZE_CARD_COMING_SOON",
            "advisorName": "ADVISOR_NAME",
            "advisorRole": "ADVISOR_ROLE",
            "advisorReplyTime": "ADVISOR_REPLY_TIME",
            "messageAgent": "MESSAGE_AGENT",
            "emptyPlanningTitle": "EMPTY_PLANNING_TITLE",
            "emptyPlanningBody": "EMPTY_PLANNING_BODY",
            "emptyPastTitle": "EMPTY_PAST_TITLE",
            "emptyPastBody": "EMPTY_PAST_BODY",
            "startSomethingNew": "START_SOMETHING_NEW",
            "seeAllTrips": "SEE_ALL_TRIPS",
        },
    },
    {
        # Two of these seven labels are DERIVED — the trip_status enum has no
        # "Final payment due" and no "Traveling now" — so this is the table most able to
        # drift without anything failing to compile on either side.
        "label": "trip status",
        "web_file": ROOT / "web/lib/trips/status.ts",
        "web_const": "TRIP_STATUS_MESSAGES",
        "kmp_file": TRIP_DOMAIN_DIR / "TripStatus.kt",
        "kmp_object": "TripStatusMessages",
        "keys": {
            "inquiry": "INQUIRY",
            "proposalReady": "PROPOSAL_READY",
            "booked": "BOOKED",
            "finalPaymentDue": "FINAL_PAYMENT_DUE",
            "travelingNow": "TRAVELING_NOW",
            "pastTrip": "PAST_TRIP",
            "cancelled": "CANCELLED",
        },
    },
    {
        # The six group headings §2.2.6 renders. Six names for ten `document_kind` values,
        # with passports and visas sharing one drawer — a mapping this table is the only
        # record of, on either stack.
        "label": "trip documents",
        "web_file": ROOT / "web/lib/trips/documents.ts",
        "web_const": "DOCUMENT_MESSAGES",
        "kmp_file": TRIP_DOMAIN_DIR / "TripDocuments.kt",
        "kmp_object": "DocumentMessages",
        "keys": {
            "groupConfirmations": "GROUP_CONFIRMATIONS",
            "groupIdentity": "GROUP_IDENTITY",
            "groupInsurance": "GROUP_INSURANCE",
            "groupItinerary": "GROUP_ITINERARY",
            "groupPhotos": "GROUP_PHOTOS",
            "groupOther": "GROUP_OTHER",
            "addedByYou": "ADDED_BY_YOU",
            "addedByAgent": "ADDED_BY_AGENT",
            "emptyTitle": "EMPTY_TITLE",
            "emptyBody": "EMPTY_BODY",
            "uploadCta": "UPLOAD_CTA",
            "openFailed": "OPEN_FAILED",
        },
    },
    {
        # The four suggested-reply chips are the interesting half: §2.2.7 lists tapping them
        # as a key action and nothing in the schema produces them, so they are pure copy —
        # and web and native must never offer a traveler two different sets of words to say.
        "label": "trip thread",
        "web_file": ROOT / "web/lib/trips/thread.ts",
        "web_const": "THREAD_MESSAGES",
        "kmp_file": TRIP_DOMAIN_DIR / "TripThread.kt",
        "kmp_object": "ThreadMessages",
        "keys": {
            "composePlaceholder": "COMPOSE_PLACEHOLDER",
            "sendLabel": "SEND_LABEL",
            "attachLabel": "ATTACH_LABEL",
            "openTrip": "OPEN_TRIP",
            "today": "TODAY",
            "yesterday": "YESTERDAY",
            "emptyTitle": "EMPTY_TITLE",
            "emptyBody": "EMPTY_BODY",
            "sendFailed": "SEND_FAILED",
            "quickSoundsGood": "QUICK_SOUNDS_GOOD",
            "quickAddPartner": "QUICK_ADD_PARTNER",
            "quickSendPassport": "QUICK_SEND_PASSPORT",
            "quickScheduleCall": "QUICK_SCHEDULE_CALL",
            "replyWindow": "REPLY_WINDOW",
        },
    },
    {
        # 2.2.11 exists for a feeling — Design-System §2.4 names gratitude as its register —
        # and copy carrying a feeling drifting between stacks is worse than a layout
        # drifting, because nothing else would catch it.
        "label": "trip memories",
        "web_file": ROOT / "web/lib/trips/memories.ts",
        "web_const": "MEMORIES_MESSAGES",
        "kmp_file": TRIP_DOMAIN_DIR / "TripMemories.kt",
        "kmp_object": "MemoriesMessages",
        "keys": {
            "noteOverline": "NOTE_OVERLINE",
            "noteScript": "NOTE_SCRIPT",
            "photosEmptyTitle": "PHOTOS_EMPTY_TITLE",
            "photosEmptyBody": "PHOTOS_EMPTY_BODY",
            "addPhotos": "ADD_PHOTOS",
            "addPhotosDeferred": "ADD_PHOTOS_DEFERRED",
            "snapshotHeading": "SNAPSHOT_HEADING",
            "reflectionHeading": "REFLECTION_HEADING",
            "reflectionBody": "REFLECTION_BODY",
            "reflectionCta": "REFLECTION_CTA",
            "reflectionEditCta": "REFLECTION_EDIT_CTA",
            "reflectionPlaceholder": "REFLECTION_PLACEHOLDER",
            "reflectionSave": "REFLECTION_SAVE",
            "reflectionSubmit": "REFLECTION_SUBMIT",
            "reflectionSaved": "REFLECTION_SAVED",
            "reflectionSubmittedHeading": "REFLECTION_SUBMITTED_HEADING",
            "reflectionSubmittedBody": "REFLECTION_SUBMITTED_BODY",
            "reflectionFailed": "REFLECTION_FAILED",
            "againHeading": "AGAIN_HEADING",
            "againBody": "AGAIN_BODY",
            "againCta": "AGAIN_CTA",
            "documentsCta": "DOCUMENTS_CTA",
            "itineraryCta": "ITINERARY_CTA",
        },
    },
    {
        # 2.2.9 is reached from a push notification — the one place our words arrive without
        # being asked for. Two travelers must not be told different things about one event.
        "label": "trip status change",
        "web_file": ROOT / "web/lib/trips/statusChange.ts",
        "web_const": "STATUS_CHANGE_MESSAGES",
        "kmp_file": TRIP_DOMAIN_DIR / "TripStatusChange.kt",
        "kmp_object": "StatusChangeMessages",
        "keys": {
            "whatChanged": "WHAT_CHANGED",
            "whatsNext": "WHATS_NEXT",
            "overlineUpdated": "OVERLINE_UPDATED",
            "overlineInquiry": "OVERLINE_INQUIRY",
            "overlineTravelling": "OVERLINE_TRAVELLING",
            "overlineHome": "OVERLINE_HOME",
            "headingInquiry": "HEADING_INQUIRY",
            "headingProposal": "HEADING_PROPOSAL",
            "headingBooked": "HEADING_BOOKED",
            "headingTravelling": "HEADING_TRAVELLING",
            "headingCompleted": "HEADING_COMPLETED",
            "headingCancelled": "HEADING_CANCELLED",
            "itineraryLine": "ITINERARY_LINE",
            "viewProposal": "VIEW_PROPOSAL",
            "viewItinerary": "VIEW_ITINERARY",
            "viewTrip": "VIEW_TRIP",
            "viewSummary": "VIEW_SUMMARY",
            "viewMemories": "VIEW_MEMORIES",
            "authorizeCard": "AUTHORIZE_CARD",
            "authorizeDeferred": "AUTHORIZE_DEFERRED",
            "changedUnknown": "CHANGED_UNKNOWN",
        },
    },
    {
        # The rail and bar labels Screen-Inventory §6.1/§6.3 were just amended to match.
        # Six destinations, two surfaces, and the same destination carries a different label
        # per surface — exactly the shape that drifts silently.
        "label": "client nav",
        "web_file": ROOT / "web/lib/client/nav.ts",
        "web_const": "CLIENT_NAV_MESSAGES",
        "kmp_file": TRIP_DOMAIN_DIR / "ClientDestinations.kt",
        "kmp_object": "ClientNavMessages",
        "keys": {
            "notYetLabel": "NOT_YET_LABEL",
            "notYetAria": "NOT_YET_ARIA",
        },
    },
    {
        # The five filter-tab labels and the four empty/error states. A tab that reads
        # "In planning" on web and "Planning" on a phone is the cheapest possible bug to
        # ship and the hardest to notice.
        "label": "all trips",
        "web_file": ROOT / "web/app/(client)/trips/content.ts",
        "web_const": "TRIPS",
        "kmp_file": TRIP_SCREENS_DIR / "AllTripsScreen.kt",
        "kmp_object": "AllTripsMessages",
        "keys": {
            "title": "TITLE",
            "subtitle": "SUBTITLE",
            "tabAll": "TAB_ALL",
            "tabUpcoming": "TAB_UPCOMING",
            "tabPlanning": "TAB_PLANNING",
            "tabPast": "TAB_PAST",
            "tabCancelled": "TAB_CANCELLED",
            "emptyAllTitle": "EMPTY_ALL_TITLE",
            "emptyAllBody": "EMPTY_ALL_BODY",
            "emptyFilteredTitle": "EMPTY_FILTERED_TITLE",
            "emptyFilteredBody": "EMPTY_FILTERED_BODY",
            "errorTitle": "ERROR_TITLE",
            "errorBody": "ERROR_BODY",
        },
    },
    {
        # The biggest per-screen table in §2.2, and it covers 2.2.10 as well — the
        # cancellation summary labels live here. Thirty-four strings that matched by hand
        # and by nothing else until now.
        "label": "trip detail",
        "web_file": ROOT / "web/app/(client)/trips/[tripId]/content.ts",
        "web_const": "TRIP_DETAIL",
        "kmp_file": TRIP_SCREENS_DIR / "TripDetailScreen.kt",
        "kmp_object": "TripDetailMessages",
        "keys": {
            "back": "BACK",
            "tileItinerary": "TILE_ITINERARY",
            "tileItineraryPending": "TILE_ITINERARY_PENDING",
            "tilePayments": "TILE_PAYMENTS",
            "tileDocuments": "TILE_DOCUMENTS",
            "tileMessages": "TILE_MESSAGES",
            "glance": "GLANCE",
            "glanceTripType": "GLANCE_TRIP_TYPE",
            "glanceNights": "GLANCE_NIGHTS",
            "glanceDestination": "GLANCE_DESTINATION",
            "glanceTravelers": "GLANCE_TRAVELERS",
            "glanceTotal": "GLANCE_TOTAL",
            "glanceComponents": "GLANCE_COMPONENTS",
            "noteHeading": "NOTE_HEADING",
            "notePending": "NOTE_PENDING",
            "advisorLabel": "ADVISOR_LABEL",
            "advisorName": "ADVISOR_NAME",
            "advisorReplyTime": "ADVISOR_REPLY_TIME",
            "message": "MESSAGE",
            "paymentTimeline": "PAYMENT_TIMELINE",
            "paymentTimelineNote": "PAYMENT_TIMELINE_NOTE",
            "paid": "PAID",
            "due": "DUE",
            "waived": "WAIVED",
            "overdue": "OVERDUE",
            "noSchedule": "NO_SCHEDULE",
            "cancelledHeading": "CANCELLED_HEADING",
            "cancelledReason": "CANCELLED_REASON",
            "cancelledRefund": "CANCELLED_REFUND",
            "cancelledNoReason": "CANCELLED_NO_REASON",
            "cancelledAgainHeading": "CANCELLED_AGAIN_HEADING",
            "cancelledAgainBody": "CANCELLED_AGAIN_BODY",
            "notFoundTitle": "NOT_FOUND_TITLE",
            "notFoundBody": "NOT_FOUND_BODY",
        },
    },
    {
        # 2.2.4, 2.2.5 and 2.2.8's inline empty states. The §2.2.8 copy is the part
        # worth pinning: those strings are what a traveler reads about a piece of their
        # trip that is not booked yet.
        "label": "itinerary",
        "web_file": ROOT / "web/app/(client)/trips/[tripId]/itinerary/content.ts",
        "web_const": "ITINERARY",
        "kmp_file": TRIP_SCREENS_DIR / "ItineraryScreen.kt",
        "kmp_object": "ItineraryMessages",
        "keys": {
            "heading": "HEADING",
            "back": "BACK",
            "downloadPdf": "DOWNLOAD_PDF",
            "shareNote": "SHARE_NOTE",
            "notPublishedTitle": "NOT_PUBLISHED_TITLE",
            "notPublishedBody": "NOT_PUBLISHED_BODY",
            "blockMorning": "BLOCK_MORNING",
            "blockAfternoon": "BLOCK_AFTERNOON",
            "blockEvening": "BLOCK_EVENING",
            "blockAllDay": "BLOCK_ALL_DAY",
            "confirmation": "CONFIRMATION",
            "tip": "TIP",
            "openInMaps": "OPEN_IN_MAPS",
            "call": "CALL",
            "markDone": "MARK_DONE",
            "markedDone": "MARKED_DONE",
            "importantInfo": "IMPORTANT_INFO",
            "insurance": "INSURANCE",
            "emergency": "EMERGENCY",
            "visaUnknown": "VISA_UNKNOWN",
            "noImportantInfo": "NO_IMPORTANT_INFO",
            "weather": "WEATHER",
            "emptyFlightsTitle": "EMPTY_FLIGHTS_TITLE",
            "emptyFlightsBody": "EMPTY_FLIGHTS_BODY",
            "emptyDiningTitle": "EMPTY_DINING_TITLE",
            "emptyDiningBody": "EMPTY_DINING_BODY",
            "emptyDayBody": "EMPTY_DAY_BODY",
            "askGyasi": "ASK_GYASI",
            "emptyItineraryTitle": "EMPTY_ITINERARY_TITLE",
            "emptyItineraryBody": "EMPTY_ITINERARY_BODY",
        },
    },
    {
        "label": "auth validation",
        "web_file": ROOT / "web/lib/validation/auth.ts",
        "web_const": "AUTH_MESSAGES",
        "kmp_file": VALIDATION_DIR / "AuthValidation.kt",
        "kmp_object": "Messages",
        "keys": {
            "emailRequired": "EMAIL_REQUIRED",
            "emailInvalid": "EMAIL_INVALID",
            "passwordRequired": "PASSWORD_REQUIRED",
            "passwordTooShort": "PASSWORD_TOO_SHORT",
            "passwordNeedsDigit": "PASSWORD_NEEDS_DIGIT",
            "passwordNeedsUppercase": "PASSWORD_NEEDS_UPPERCASE",
            "passwordNeedsLowercase": "PASSWORD_NEEDS_LOWERCASE",
        },
    },
    {
        "label": "registration",
        "web_file": ROOT / "web/lib/validation/registration.ts",
        "web_const": "REGISTRATION_MESSAGES",
        "kmp_file": VALIDATION_DIR / "RegistrationValidation.kt",
        "kmp_object": "Messages",
        "keys": {
            "nameRequired": "NAME_REQUIRED",
            "nameTooLong": "NAME_TOO_LONG",
            "nameInvalid": "NAME_INVALID",
            "termsRequired": "TERMS_REQUIRED",
            "confirmRequired": "CONFIRM_REQUIRED",
            "confirmMismatch": "CONFIRM_MISMATCH",
        },
    },
    {
        "label": "mfa",
        "web_file": ROOT / "web/lib/validation/mfa.ts",
        "web_const": "MFA_MESSAGES",
        "kmp_file": VALIDATION_DIR / "MfaValidation.kt",
        "kmp_object": "Messages",
        "keys": {
            "codeRequired": "CODE_REQUIRED",
            "codeShape": "CODE_SHAPE",
        },
    },
    {
        "label": "password rule labels",
        "web_file": ROOT / "web/lib/validation/password-strength.ts",
        "web_const": "PASSWORD_RULE_LABELS",
        "kmp_file": VALIDATION_DIR / "PasswordStrength.kt",
        "kmp_object": "Labels",
        "keys": {
            "length": "LENGTH",
            "uppercase": "UPPERCASE",
            "lowercase": "LOWERCASE",
            "digit": "DIGIT",
        },
    },
    {
        "label": "password strength",
        "web_file": ROOT / "web/lib/validation/password-strength.ts",
        "web_const": "STRENGTH_MESSAGES",
        "kmp_file": VALIDATION_DIR / "PasswordStrength.kt",
        "kmp_object": "Messages",
        "keys": {
            "strong": "STRONG",
            "stillNeedsPrefix": "STILL_NEEDS_PREFIX",
        },
    },
    # ── Screen copy ────────────────────────────────────────────────────────────
    #
    # Only the strings that must be IDENTICAL on both surfaces. The mobile artboards
    # deliberately write shorter subtitles for a narrower column — 2.1.2's sub is "60
    # seconds. No planning fees, ever." on a phone against "Takes about 60 seconds…" in a
    # browser — and pinning those would be enforcing a similarity nobody asked for. What is
    # pinned is what a person would notice differing: titles, field labels, CTAs, and the
    # explanatory blocks that were written once and copied.
    {
        "label": "2.1.2 registration screen",
        "web_file": ROOT / "web/app/(auth)/register/state.ts",
        "web_const": "REGISTER_TEXT",
        "kmp_file": SCREENS_DIR / "RegisterScreen.kt",
        "kmp_object": "RegisterCopy",
        "keys": {
            "overline": "OVERLINE",
            "title": "TITLE",
            "google": "GOOGLE",
            "apple": "APPLE",
            "socialDisabledTitle": "SOCIAL_DISABLED",
            "divider": "DIVIDER",
            "firstName": "FIRST_NAME",
            "lastName": "LAST_NAME",
            "email": "EMAIL",
            "password": "PASSWORD",
            "confirm": "CONFIRM",
            "submit": "SUBMIT",
            "pending": "PENDING",
            "haveAccount": "HAVE_ACCOUNT",
            "signIn": "SIGN_IN",
        },
    },
    {
        "label": "2.1.4 forgot password screen",
        "web_file": ROOT / "web/app/(auth)/forgot-password/state.ts",
        "web_const": "FORGOT_TEXT",
        "kmp_file": SCREENS_DIR / "ForgotPasswordScreen.kt",
        "kmp_object": "ForgotPasswordCopy",
        "keys": {
            "overline": "OVERLINE",
            "title": "TITLE",
            "sub": "SUB",
            "email": "EMAIL",
            "submit": "SUBMIT",
            "pending": "PENDING",
        },
    },
    {
        "label": "2.1.5 reset password screen",
        "web_file": ROOT / "web/app/(auth)/reset-password/state.ts",
        "web_const": "RESET_TEXT",
        "kmp_file": SCREENS_DIR / "ResetPasswordScreen.kt",
        "kmp_object": "ResetPasswordCopy",
        "keys": {
            "overline": "OVERLINE",
            "title": "TITLE",
            "sub": "SUB",
            "password": "PASSWORD",
            "confirm": "CONFIRM",
            "submit": "SUBMIT",
            "pending": "PENDING",
        },
    },
    {
        "label": "2.1.3 email verification screen",
        "web_file": ROOT / "web/app/(auth)/verify-email/state.ts",
        "web_const": "VERIFY_TEXT",
        "kmp_file": SCREENS_DIR / "VerifyEmailScreen.kt",
        "kmp_object": "VerifyEmailCopy",
        "keys": {
            "title": "TITLE",
            "whyTitle": "WHY_TITLE",
            "whyBody": "WHY_BODY",
            "resend": "RESEND",
            "signOut": "SIGN_OUT",
        },
    },
    # ── Onboarding wizard, §2.1.9–2.1.14 ──────────────────────────────────────
    #
    # The validation rules first. Every message here is one somebody reads under a field
    # they just filled in, and the two surfaces post to the SAME Edge Function — so a rule
    # that differs is a screen accepting what the other rejects, not just a wording drift.
    {
        "label": "2.1.10 profile validation",
        "web_file": ROOT / "web/lib/validation/profile.ts",
        "web_const": "PROFILE_MESSAGES",
        "kmp_file": VALIDATION_DIR / "ProfileValidation.kt",
        "kmp_object": "Messages",
        "keys": {
            "phoneInvalid": "PHONE_INVALID",
            "phoneNeedsCountryCode": "PHONE_NEEDS_COUNTRY_CODE",
            "dobInvalid": "DOB_INVALID",
            "dobTooEarly": "DOB_TOO_EARLY",
            "dateInvalid": "DATE_INVALID",
            "countryInvalid": "COUNTRY_INVALID",
            "postalInvalid": "POSTAL_INVALID",
            "tooLong": "TOO_LONG",
            "invalidChars": "INVALID_CHARS",
            "addressIncomplete": "ADDRESS_INCOMPLETE",
            "emergencyIncomplete": "EMERGENCY_INCOMPLETE",
            "passportIncomplete": "PASSPORT_INCOMPLETE",
        },
    },
    {
        "label": "2.1.11 preferences validation",
        "web_file": ROOT / "web/lib/validation/preferences.ts",
        "web_const": "PREFERENCES_MESSAGES",
        "kmp_file": VALIDATION_DIR / "PreferencesValidation.kt",
        "kmp_object": "Messages",
        "keys": {
            "destinationsTooMany": "DESTINATIONS_TOO_MANY",
            "destinationTooLong": "DESTINATION_TOO_LONG",
            "invalidChars": "INVALID_CHARS",
            "unknownOption": "UNKNOWN_OPTION",
            "dietaryNoneAlone": "DIETARY_NONE_ALONE",
            "dietaryNoneWithNote": "DIETARY_NONE_WITH_NOTE",
            "accessibilityNoneAlone": "ACCESSIBILITY_NONE_ALONE",
            "accessibilityNoneWithNote": "ACCESSIBILITY_NONE_WITH_NOTE",
            "notesTooLong": "NOTES_TOO_LONG",
            "favoritesTooLong": "FAVOURITES_TOO_LONG",
            "loyaltyNeedsProgram": "LOYALTY_NEEDS_PROGRAM",
            "loyaltyNumberShape": "LOYALTY_NUMBER_SHAPE",
            "loyaltyProgramTooLong": "LOYALTY_PROGRAM_TOO_LONG",
            "loyaltyTooMany": "LOYALTY_TOO_MANY",
            "budgetUnknown": "BUDGET_UNKNOWN",
        },
    },
    {
        "label": "2.1.12 companion validation",
        "web_file": ROOT / "web/lib/validation/companion.ts",
        "web_const": "COMPANION_MESSAGES",
        "kmp_file": VALIDATION_DIR / "CompanionValidation.kt",
        "kmp_object": "Messages",
        "keys": {
            "firstNameRequired": "FIRST_NAME_REQUIRED",
            "lastNameRequired": "LAST_NAME_REQUIRED",
            "nameTooLong": "NAME_TOO_LONG",
            "invalidChars": "INVALID_CHARS",
            "relationshipTooLong": "RELATIONSHIP_TOO_LONG",
            "dobInvalid": "DOB_INVALID",
            "dateInvalid": "DATE_INVALID",
            "countryInvalid": "COUNTRY_INVALID",
            "passportNeedsExpiry": "PASSPORT_NEEDS_EXPIRY",
        },
    },
    # Then the screens. Same rule as the auth screens above: only the strings that must be
    # IDENTICAL. Meta titles, aria labels and the desktop-only rail have no mobile twin and
    # are left out rather than faked.
    {
        "label": "2.1.9 welcome screen",
        "web_file": ROOT / "web/app/(onboarding)/welcome/state.ts",
        "web_const": "WELCOME_TEXT",
        "kmp_file": WIZARD_DIR / "WelcomeScreen.kt",
        "kmp_object": "WelcomeCopy",
        "keys": {
            "overline": "OVERLINE",
            "sub": "SUB",
            "sectionHeading": "SECTION",
            "primaryCta": "PRIMARY",
            "secondaryCta": "SKIP",
        },
    },
    {
        "label": "2.1.10 profile screen",
        "web_file": WEB_WIZARD / "profile/state.ts",
        "web_const": "PROFILE_TEXT",
        "kmp_file": WIZARD_DIR / "ProfileScreen.kt",
        "kmp_object": "ProfileCopy",
        "keys": {
            "title": "TITLE",
            "sub": "SUB",
            "optionalNote": "OPTIONAL",
            "labelPhone": "PHONE",
            "hintPhone": "PHONE_HINT",
            "labelDob": "DOB",
            "hintDob": "DOB_HINT",
            "groupAddress": "ADDRESS",
            "labelAddressLine1": "LINE1",
            "labelAddressLine2": "LINE2",
            "labelAddressCity": "CITY",
            "labelAddressRegion": "REGION",
            "labelAddressRegionUs": "REGION_US",
            "labelAddressPostal": "POSTAL",
            "labelAddressPostalUs": "POSTAL_US",
            "labelAddressCountry": "COUNTRY",
            "groupEmergency": "EMERGENCY",
            "hintEmergency": "EMERGENCY_HINT",
            "labelEmergencyName": "EMERGENCY_NAME",
            "labelEmergencyPhone": "EMERGENCY_PHONE",
            "labelEmergencyRelationship": "EMERGENCY_RELATIONSHIP",
            "groupPassport": "PASSPORT",
            "groupPassportOptional": "PASSPORT_OPTIONAL",
            "hintPassport": "PASSPORT_HINT",
            "passportExpiredWarning": "PASSPORT_EXPIRED",
            "labelPassportExpiry": "EXPIRES",
            "labelPassportCountry": "ISSUING",
            "primaryCta": "PRIMARY",
            "pending": "PENDING",
            "secondaryCta": "SKIP",
        },
    },
    {
        "label": "2.1.11 preferences screen",
        "web_file": WEB_WIZARD / "preferences/state.ts",
        "web_const": "PREFERENCES_TEXT",
        "kmp_file": WIZARD_DIR / "PreferencesScreen.kt",
        "kmp_object": "PreferencesCopy",
        "keys": {
            "title": "TITLE",
            "sub": "SUB",
            "sectionDestinations": "DESTINATIONS",
            "hintDestinations": "DESTINATIONS_HINT",
            "labelDestinationOther": "DESTINATION_OTHER",
            "sectionStyle": "STYLE",
            "hintStyle": "STYLE_HINT",
            "sectionDiet": "DIET",
            "labelDietNotes": "DIET_NOTES",
            "sectionAccess": "ACCESS",
            "labelAccessNotes": "ACCESS_NOTES",
            "sectionLoyalty": "LOYALTY",
            "hintLoyalty": "LOYALTY_HINT",
            "labelLoyaltyProgram": "LOYALTY_PROGRAM",
            "labelLoyaltyNumber": "LOYALTY_NUMBER",
            "loyaltyAdd": "LOYALTY_ADD",
            "loyaltyRemove": "LOYALTY_REMOVE",
            "sectionBudget": "BUDGET",
            "hintBudget": "BUDGET_HINT",
            "primaryCta": "PRIMARY",
            "pending": "PENDING",
            "secondaryCta": "SKIP",
        },
    },
    {
        "label": "2.1.12 companions screen",
        "web_file": WEB_WIZARD / "companions/state.ts",
        "web_const": "COMPANIONS_TEXT",
        "kmp_file": WIZARD_DIR / "CompanionsScreen.kt",
        "kmp_object": "CompanionsCopy",
        "keys": {
            "title": "TITLE",
            "sub": "SUB",
            "emptyTitle": "EMPTY_TITLE",
            "emptyBody": "EMPTY_BODY",
            "addCta": "ADD",
            "editAction": "EDIT",
            "removeAction": "REMOVE",
            "passportNone": "NO_PASSPORT",
            "formAddTitle": "FORM_ADD",
            "formSub": "FORM_SUB",
            "formSave": "SAVE",
            "formSaving": "SAVING",
            "formCancel": "CANCEL",
            "labelFirstName": "FIRST_NAME",
            "labelLastName": "LAST_NAME",
            "labelRelationship": "RELATIONSHIP",
            "labelDateOfBirth": "DOB",
            "labelPassportExpiry": "EXPIRES",
            "labelPassportCountry": "ISSUING",
            "unfinishedForm": "UNFINISHED",
            "errorMax": "MAX",
            "primaryCta": "PRIMARY",
            "pending": "PENDING",
            "secondaryCta": "SKIP",
        },
    },
    {
        "label": "2.1.13 connect screen",
        "web_file": WEB_WIZARD / "connect/state.ts",
        "web_const": "CONNECT_TEXT",
        "kmp_file": WIZARD_DIR / "ConnectScreen.kt",
        "kmp_object": "ConnectCopy",
        "keys": {
            "title": "TITLE",
            "sub": "SUB",
            "fieldLabel": "FIELD",
            "fieldHelp": "HELP",
            "primaryCta": "PRIMARY",
            "primaryCtaEmpty": "PRIMARY_EMPTY",
            "pending": "PENDING",
            "secondaryCta": "SKIP",
        },
    },
    {
        "label": "2.1.13 connect banner",
        "web_file": WEB_WIZARD / "connect/state.ts",
        "web_const": "CONNECT_TEXT",
        "kmp_file": DOMAIN_DIR / "ConnectBanner.kt",
        "kmp_object": "ConnectBannerCopy",
        "keys": {"noMatch": "NO_MATCH"},
    },
    {
        "label": "2.1.14 complete screen",
        "web_file": WEB_WIZARD / "complete/state.ts",
        "web_const": "COMPLETE_TEXT",
        "kmp_file": WIZARD_DIR / "CompleteScreen.kt",
        "kmp_object": "CompleteCopy",
        "keys": {
            "overline": "OVERLINE",
            "checklistHeading": "CHECKLIST",
            "primaryCta": "PRIMARY",
            "pending": "PENDING",
        },
    },
    {
        "label": "2.1.14 completion summary",
        "web_file": WEB_WIZARD / "complete/state.ts",
        "web_const": "COMPLETE_TEXT",
        "kmp_file": DOMAIN_DIR / "Completion.kt",
        "kmp_object": "CompletionCopy",
        "keys": {
            "subNoTrip": "SUB_NO_TRIP",
            "subNothing": "SUB_NOTHING",
            "profileDone": "PROFILE_DONE",
            "profileSkipped": "PROFILE_SKIPPED",
            "preferencesDone": "PREFERENCES_DONE",
            "preferencesSkipped": "PREFERENCES_SKIPPED",
            "companionsDone": "COMPANIONS_DONE",
            "companionsSkipped": "COMPANIONS_SKIPPED",
            "tripDone": "TRIP_DONE",
            "tripNone": "TRIP_NONE",
            "shortProfile": "SHORT_PROFILE",
            "shortPreferences": "SHORT_PREFERENCES",
            "shortCompanions": "SHORT_COMPANIONS",
        },
    },
]

# web BY_KIND key -> kotlin data object
ERROR_KINDS = {
    "invalid_credentials": "InvalidCredentials",
    "email_not_confirmed": "EmailNotConfirmed",
    "rate_limited": "RateLimited",
    "account_locked": "AccountLocked",
    "network": "Network",
    "not_configured": "NotConfigured",
    "weak_password": "WeakPassword",
    "session_expired": "SessionExpired",
    "unknown": "Unknown",
}

# A string literal on a single line — never spanning newlines.
#
# BOTH QUOTE STYLES, because TypeScript has both and Prettier picks whichever needs fewer
# escapes: `'"No restrictions" doesn\'t go…'` is single-quoted precisely BECAUSE the copy
# contains double quotes. Matching only double-quoted literals made every such string
# invisible — the key parsed as absent and the script reported it "missing on web" while it
# sat right there, which is the same silent-gap failure mode as the wrapped-string bug.
STRING = r'"((?:[^"\\\n]|\\.)*)"' + r"|'((?:[^'\\\n]|\\.)*)'"

# Kotlin has one string syntax, so the Kotlin side reads double quotes only.
KMP_STRING = r'"((?:[^"\\\n]|\\.)*)"'


def literals(text: str) -> list[str]:
    """Every string literal in `text`, in order, unescaped and with quotes stripped."""
    return [
        unescape(double or single)
        for double, single in re.findall(STRING, text)
    ]


def unescape(s: str) -> str:
    return (
        s.replace('\\"', '"')
        .replace("\\'", "'")
        .replace("\\\\", "\\")
    )


def web_messages(path: pathlib.Path, const_name: str) -> dict[str, str]:
    """
    `export const NAME = { key: "value", ... } as const;`

    A value may be a `"..." +\n    "..."` concatenation, which is how anything longer than
    a line is written. Matching only the first literal — which this did until the screen
    tables were added — silently compares half a sentence against a whole one and reports
    drift that is not there, or worse, agreement that is not either.

    Keys whose value is not a plain string (a function, an array — 2.1.10's
    `title: (name) => …`) are skipped rather than mangled. They are not comparable across
    platforms anyway.
    """
    body = re.search(
        rf"{re.escape(const_name)} = \{{(.*?)\n\}} as const;", path.read_text(), re.S
    )
    if not body:
        return {}

    out: dict[str, str] = {}
    for name, value in re.findall(
        r"^  (\w+):\s*(.*?)(?=\n  \w+:|\n  /|\Z)", body.group(1), re.S | re.M
    ):
        stripped = value.strip()
        # A function or a list is not a string, and joining the literals inside one would
        # produce something that looks comparable and is not.
        if not stripped.startswith('"') and not stripped.startswith("'"):
            continue
        parts = literals(value)
        if parts:
            out[name] = "".join(parts)
    return out


def kmp_messages(path: pathlib.Path, object_name: str) -> dict[str, str]:
    """
    `object NAME { const val KEY = "value" ... }`, at any indentation.

    The value may be a `"..." +\n    "..."` concatenation, which is how any copy longer
    than a line gets written. Joining the literals rather than matching one of them is the
    same thing `kmp_errors` does, and the reason is the same: without it a wrapped string
    reads as absent, and the script reports a missing key for copy that is right there.
    """
    body = re.search(
        rf"object {re.escape(object_name)} \{{(.*?)\n\s*\}}", path.read_text(), re.S
    )
    if not body:
        return {}

    out: dict[str, str] = {}
    # Everything up to the next `const val` or the end of the object is one value.
    # The value ends at the next declaration OR comment. `fun` belongs in that list: a
    # `const val` sitting last before the object's functions otherwise swallowed every
    # function body after it, and reported the concatenation as drift.
    for name, value in re.findall(
        r"const val (\w+) =\s*(.*?)(?=\n\s*(?:const val|fun |private fun |/\*\*|//)|\Z)",
        body.group(1),
        re.S,
    ):
        parts = re.findall(KMP_STRING, value)
        if parts:
            out[name] = "".join(unescape(part) for part in parts)
    return out


def web_errors() -> dict[str, str]:
    """Each BY_KIND entry's `message`, which may be a multi-line string concatenation."""
    text = WEB_ERRORS.read_text()
    body = re.search(r"const BY_KIND[^=]*= \{(.*?)\n\};", text, re.S).group(1)
    out: dict[str, str] = {}
    for kind in ERROR_KINDS:
        entry = re.search(rf"\n  {kind}: \{{(.*?)\n  \}},", body, re.S)
        if not entry:
            continue
        # `,\n` alone misses entries where `message` is the last field — the captured
        # block ends right after the comma with no newline.
        msg = re.search(r"message:\s*(.*?),\s*(?:\n|$)", entry.group(1), re.S)
        if msg:
            out[kind] = "".join(literals(msg.group(1)))
    return out


def kmp_errors() -> dict[str, str]:
    text = KMP_ERRORS.read_text()
    out: dict[str, str] = {}
    for kind, obj in ERROR_KINDS.items():
        entry = re.search(
            rf"data object {obj} : AuthError \{{(.*?)\n    \}}", text, re.S
        )
        if not entry:
            continue
        msg = re.search(r"override val message\s*=\s*(.*?)(?:\n\s*override|\n\s*\}|$)", entry.group(1), re.S)
        if msg:
            out[kind] = "".join(unescape(p) for p in re.findall(KMP_STRING, msg.group(1)))
    return out


def compare(label: str, pairs: list[tuple[str, str | None, str | None]]) -> list[str]:
    problems = []
    for name, web, kmp in pairs:
        if web is None:
            problems.append(f"{label}: '{name}' missing on web")
        elif kmp is None:
            problems.append(f"{label}: '{name}' missing on mobile")
        elif web != kmp:
            problems.append(
                f"{label}: '{name}' differs\n    web:    {web!r}\n    mobile: {kmp!r}"
            )
    return problems


def main() -> int:
    problems: list[str] = []
    checked = 0

    for table in MESSAGE_TABLES:
        web = web_messages(table["web_file"], table["web_const"])
        kmp = kmp_messages(table["kmp_file"], table["kmp_object"])
        if not web:
            problems.append(
                f"{table['label']}: could not read {table['web_const']} from "
                f"{table['web_file'].relative_to(ROOT)} — did it get renamed?"
            )
        if not kmp:
            problems.append(
                f"{table['label']}: could not read object {table['kmp_object']} from "
                f"{table['kmp_file'].relative_to(ROOT)} — did it get renamed?"
            )
        problems += compare(
            table["label"],
            [(w, web.get(w), kmp.get(k)) for w, k in table["keys"].items()],
        )
        checked += len(table["keys"])

    we, ke = web_errors(), kmp_errors()
    problems += compare(
        "auth error",
        [(kind, we.get(kind), ke.get(kind)) for kind in ERROR_KINDS],
    )

    if problems:
        print("::error::User-facing copy has drifted between web and mobile.")
        for p in problems:
            print(f"  {p}")
        print(
            "\nThese strings are intentionally duplicated (see the header comments in "
            "each file).\nChange them together, or the same person sees different wording "
            "on phone and web."
        )
        return 1

    print(
        f"Copy parity OK — {checked} messages across {len(MESSAGE_TABLES)} modules and "
        f"{len(ERROR_KINDS)} auth errors match between web and mobile."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
