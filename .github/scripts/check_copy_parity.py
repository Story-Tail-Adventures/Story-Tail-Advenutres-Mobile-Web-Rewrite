#!/usr/bin/env python3
"""
Enforce that the user-facing strings duplicated across the Go app and mobile stay identical.

`webgo/` and `mobile/` deliberately hold parallel implementations of the same screens and the
same error taxonomy. CLAUDE.md makes the stack directories a hard boundary, and the KMP shared
module does not run on a server. That duplication is the right call, but nothing stops the two
copies drifting apart, and drift means a traveler sees one wording on their phone and another
in the browser.

The unit tests on each side cover behaviour. This covers wording.

── WHY THIS READS GO AND NOT `web/` ──────────────────────────────────────────────────────────

Until Phase 6 this compared `web/` against `mobile/`. The Go migration replaces the Next app,
so the pairing that matters is now Go against mobile, and this script was re-pointed BEFORE
`web/` was deleted — deliberately, because that is the only moment the re-point could be
verified. While all three trees existed, web<->mobile passed (this job) and Go<->web passed
(the per-area copy tests under webgo/), so Go<->mobile had to pass transitively. Any string
where it did not was real drift that neither of those checks could see on its own. After `web/`
is gone there is nothing left to validate a new extractor against.

── HOW IT CHECKS ─────────────────────────────────────────────────────────────────────────────

The mobile side is unchanged: `object NAME { const val KEY = "value" }`, read out of the Kotlin.

The Go side cannot be read the same way. Web held each screen's copy in one flat object whose
keys matched the Kotlin names; Go holds it as individual `const` identifiers (`labelProposalReady`)
and as static text inside `webgo/pages/**/*.html`, because the page IS the template. So instead
of pairing key to key, each table names the Go files that OWN that screen, and every string
mobile shows must appear verbatim in one of them.

That is weaker in one way and stronger in another. It cannot notice Go holding an extra string
mobile lacks — but neither could the key-map version, which only ever compared what it was told
about. It does catch every way the wording can drift, which is the failure this exists to stop.

**The owner list is the load-bearing part.** Searching the whole Go tree instead would pass on
coincidence: "Turn on", "Done", "Remove" and "Continue" each appear in some unrelated screen,
and four tables were silently satisfied that way before the owners were narrowed. If you add a
string, add it to the file that renders it, or add that file here.

── WHAT THIS DOES NOT CATCH ──────────────────────────────────────────────────────────────────

One Go copy of a string is pinned to mobile: the one in the owner file. Several labels exist
in more than one Go file, because two screens in different areas show the same word, and the
other copies are NOT pinned by this script. The known case is the trip status labels, which
live three times:

    webgo/internal/handlers/client/format.go          <- pinned here, by "trip status"
    webgo/internal/handlers/agent/trips/format.go     <- not pinned
    webgo/internal/handlers/agent/people/clientdetail.go  <- not pinned

Changing the unpinned copies alone passes this check. That was measured, not assumed: editing
`labelProposalReady` in the agent copy produced no failure, while the same edit to the client
copy did. A general "every Go copy agrees" check was considered and not written, because a
substring search cannot tell a real duplicate from a short word appearing inside another
sentence, and a guard built on a measure that noisy reads as coverage without being any.

── not_in_go ─────────────────────────────────────────────────────────────────────────────────

39 strings mobile shows have no Go equivalent at all. They are listed per table with a reason
rather than dropped, because the thing this script is worst at is silence: a key left out of a
map is invisible, and the header of the old version said so. Every entry below is a real gap in
the Go port — mostly empty states, error states and opt-in prompts, which is exactly the set a
screen test never walks. Treat the list as the punch list it is; deleting an entry without
building the string turns a known gap back into a silent one.

Run: python3 .github/scripts/check_copy_parity.py
"""
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]

# The Go half of the auth sentences. webgo/internal/web/messages.go says of itself that
# check_copy_parity.py pins the shared kinds.
GO_AUTH_ERRORS = ROOT / "webgo/internal/web/messages.go"
KMP_ERRORS = ROOT / "mobile/shared/src/commonMain/kotlin/com/storytail/adventures/api/AuthError.kt"

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

KMP_STRING = r'"((?:[^"\\\n]|\\.)*)"'


TABLES = [
    {
        "label": 'agent 3.10',
        "kmp_file": ROOT / 'mobile/shared/src/commonMain/kotlin/com/storytail/adventures/domain/agent/AgentMessages.kt',
        "kmp_object": 'AgentMessagesCopy',
        "go_owners": [
            ROOT / 'webgo/internal/handlers/agent/people/messages.go',
            ROOT / 'webgo/pages/agent/people/messages.html',
            ROOT / 'webgo/internal/handlers/agent/people/messages_page.go',
            ROOT / 'webgo/pages/agent/trips/detail.html',
        ],
        "keys": [
            'ADD_NOTE',
            'ARCHIVED_DONE',
            'ARCHIVED_TAG',
            'ARCHIVE_FAILED',
            'ARCHIVE_THREAD',
            'AUTO_REPLY',
            'BY_EMAIL',
            'CAUGHT_UP',
            'EMAILED_MARK',
            'EMPTY_ARCHIVED',
            'EMPTY_INBOX',
            'EMPTY_NARROWED',
            'EMPTY_THREAD',
            'FILTER_OVERDUE',
            'FILTER_UNREAD',
            'GENERAL_THREAD',
            'INTERNAL_NOTE_TAG',
            'MESSAGE_PLACEHOLDER',
            'NOTE_HINT',
            'NOTE_PLACEHOLDER',
            'NOTE_SWITCH',
            'NOTIFY_REPLY_SENT',
            'NOT_FOUND',
            'OPEN_CLIENT',
            'OPEN_IN_MESSAGES',
            'OPEN_TRIP',
            'OVERDUE',
            'REPLY_LABEL',
            'REPLY_PLACEHOLDER',
            'RESTORED_DONE',
            'RESTORE_THREAD',
            'SEARCH_PLACEHOLDER',
            'SEND',
            'SEND_FAILED',
            'TITLE',
            'VIEW_ARCHIVED',
            'VIEW_INBOX',
            'YOU_PREFIX',
        ],
        # NOT IN GO. The Web Push opt-in card (Screen 3.10.7) is not built in Go. The phone has its
        # own FCM opt-in, so only the browser half is missing.
        "not_in_go": [
            'NOTIFY_BODY',
            'NOTIFY_FAILED',
            'NOTIFY_NOT_NOW',
            'NOTIFY_TITLE',
            'NOTIFY_TURNING_ON',
            'NOTIFY_TURN_ON',
        ],
    },
    {
        "label": 'agent 3.2 + 3.4.2',
        "kmp_file": ROOT / 'mobile/shared/src/commonMain/kotlin/com/storytail/adventures/domain/agent/AgentCopy.kt',
        "kmp_object": 'AgentCopy',
        "go_owners": [
            ROOT / 'webgo/pages/agent/trips/detail.html',
            ROOT / 'webgo/pages/agent/people/worklist.html',
            ROOT / 'webgo/internal/handlers/agent/people/worklist.go',
            ROOT / 'webgo/internal/handlers/agent/trips/detail.go',
            ROOT / 'webgo/pages/agent/people/calendar.html',
        ],
        "keys": [
            'AVAILABILITY_DEFERRED',
            'CLIENT_TOTAL_LABEL',
            'COMMISSION_LABEL',
            'CYCLE_TIME_UNAVAILABLE',
            'DEPARTING_EMPTY',
            'DEPARTING_TITLE',
            'GLANCE_CANCELLATION_REASON',
            'GLANCE_DESTINATION',
            'GLANCE_LAST_ACTIVITY',
            'GLANCE_NOT_SET',
            'GLANCE_NO_ACTIVITY',
            'GLANCE_REFUND_DETAIL',
            'GLANCE_REFUND_STATUS',
            'GLANCE_TRIP_TYPE',
            'GREETING_ONE',
            'GREETING_ZERO',
            'GREETING_ZERO_SUB',
            'INQUIRIES_EMPTY',
            'INQUIRIES_TITLE',
            'MESSAGES_EMPTY',
            'MESSAGES_TITLE',
            'PAID_SO_FAR_LABEL',
            'PAYMENTS_EMPTY',
            'PAYMENTS_TITLE',
            'PROPOSALS_EMPTY',
            'PROPOSALS_TITLE',
            'TRIP_ACTIVITY_EMPTY',
            'TRIP_COMPONENTS_EMPTY',
            'TRIP_DOCUMENTS_EMPTY',
            'TRIP_ITINERARY_EMPTY',
            'TRIP_MESSAGES_EMPTY',
            'TRIP_NOT_FOUND_ACTION',
            'TRIP_NOT_FOUND_BODY',
            'TRIP_NOT_FOUND_TITLE',
            'TRIP_PAYMENTS_ALL_SETTLED',
            'TRIP_PAYMENTS_EMPTY',
        ],
    },
    {
        "label": 'agent 3.4.2 · component kinds',
        "kmp_file": ROOT / 'mobile/shared/src/commonMain/kotlin/com/storytail/adventures/domain/agent/TripDetailSections.kt',
        "kmp_object": 'TripComponentCopy',
        "go_owners": [
            ROOT / 'webgo/internal/handlers/agent/trips/components.go',
        ],
        "keys": [
            'KIND_CRUISE',
            'KIND_CUSTOM',
            'KIND_EXCURSION',
            'KIND_FLIGHT',
            'KIND_HOTEL',
            'KIND_INSURANCE',
            'KIND_TRANSFER',
        ],
    },
    {
        "label": 'agent 3.4.2 · milestone statuses',
        "kmp_file": ROOT / 'mobile/shared/src/commonMain/kotlin/com/storytail/adventures/domain/agent/TripDetailSections.kt',
        "kmp_object": 'TripScheduleCopy',
        "go_owners": [
            ROOT / 'webgo/internal/handlers/agent/trips/payments_logic.go',
        ],
        "keys": [
            'STATUS_OVERDUE',
            'STATUS_PAID',
            'STATUS_SCHEDULED',
            'STATUS_WAIVED',
        ],
    },
    {
        "label": 'agent 3.4.2 · itinerary',
        "kmp_file": ROOT / 'mobile/shared/src/commonMain/kotlin/com/storytail/adventures/domain/agent/TripDetailSections.kt',
        "kmp_object": 'TripItineraryCopy',
        "go_owners": [
            ROOT / 'webgo/internal/handlers/agent/trips/itinerary.go',
            ROOT / 'webgo/pages/agent/trips/itinerary.html',
        ],
        "keys": [
            'BLOCK_AFTERNOON',
            'BLOCK_ALL_DAY',
            'BLOCK_EVENING',
            'BLOCK_MORNING',
            'DAY_EMPTY',
            'TIP_LABEL',
        ],
    },
    {
        "label": 'trip type',
        "kmp_file": ROOT / 'mobile/shared/src/commonMain/kotlin/com/storytail/adventures/domain/trip/TripType.kt',
        "kmp_object": 'TripTypeMessages',
        "go_owners": [
            ROOT / 'webgo/internal/handlers/client/tripdetail.go',
        ],
        "keys": [
            'ALL_INCLUSIVE',
            'CRUISE',
            'CUSTOM',
            'GROUP',
            'MULTI_DESTINATION',
        ],
    },
    {
        "label": 'agent 3.3',
        "kmp_file": ROOT / 'mobile/shared/src/commonMain/kotlin/com/storytail/adventures/domain/agent/ClientCopy.kt',
        "kmp_object": 'ClientCopy',
        "go_owners": [
            ROOT / 'webgo/pages/agent/people/client.html',
            ROOT / 'webgo/internal/handlers/agent/people/roster_page.go',
            ROOT / 'webgo/internal/handlers/agent/people/clientdetail_page.go',
            ROOT / 'webgo/pages/agent/people/clients.html',
            ROOT / 'webgo/pages/agent/people/client-not-found.html',
            ROOT / 'webgo/internal/handlers/agent/people/roster.go',
        ],
        "keys": [
            'ACTIVITY_EMPTY',
            'ACTIVITY_NOTE',
            'ARCHIVED_BANNER',
            'BACK_TO_ROSTER',
            'DOCUMENTS_EMPTY',
            'DOCUMENT_SENSITIVE',
            'EMPTY_ARCHIVED_BODY',
            'EMPTY_ARCHIVED_TITLE',
            'EMPTY_BODY',
            'EMPTY_FILTERED_BODY',
            'EMPTY_FILTERED_TITLE',
            'EMPTY_TITLE',
            'FILTER_ACTIVE',
            'FILTER_ARCHIVED',
            'HOUSEHOLD_TITLE',
            'LABEL_ADDRESS',
            'LABEL_EMAIL',
            'LABEL_PHONE',
            'NOTES_EMPTY',
            'NOTE_EDITED_MARKER',
            'NOT_FOUND_BODY',
            'NOT_FOUND_TITLE',
            'NO_ADDRESS',
            'NO_EMAIL',
            'NO_HOUSEHOLD',
            'NO_LIFETIME',
            'NO_PREFERENCES',
            'NO_TRIP',
            'PASSPORT_EXPIRING_SOON',
            'PREFERENCES_TITLE',
            'SEARCH_LABEL',
            'SEARCH_PLACEHOLDER',
            'SNAPSHOT_TITLE',
            'STAT_COMMISSION',
            'STAT_LAST_CONTACT',
            'STAT_LIFETIME',
            'STAT_TRIPS',
            'SUBTITLE_ACTIVE',
            'SUBTITLE_IN_MOTION',
            'SUBTITLE_TO_QUALIFY',
            'THREADS_EMPTY',
            'TITLE',
            'TRAVELLING_NOW',
            'TRIPS_EMPTY',
            'TRIP_COMMISSION_PREFIX',
        ],
    },
    {
        "label": 'dashboard 2.2.1',
        "kmp_file": ROOT / 'mobile/shared/src/commonMain/kotlin/com/storytail/adventures/ui/screens/dashboard/DashboardUiState.kt',
        "kmp_object": 'DashboardMessages',
        "go_owners": [
            ROOT / 'webgo/pages/client/dashboard.html',
            ROOT / 'webgo/internal/handlers/client/dashboard.go',
        ],
        "keys": [
            'ADVISOR_LABEL',
            'ADVISOR_NAME',
            'ADVISOR_REPLY_TIME',
            'ADVISOR_ROLE',
            'EMPTY_PAST_TITLE',
            'EMPTY_PLANNING_BODY',
            'EMPTY_PLANNING_TITLE',
            'ITINERARY_NOT_READY',
            'MESSAGE_AGENT',
            'NEXT_PAYMENT_LABEL',
            'NEXT_PAYMENT_WHENEVER',
            'OVERLINE_NEUTRAL',
            'OVERLINE_REST',
            'SEE_ALL_TRIPS',
            'START_SOMETHING_NEW',
            'SUBTITLE_TRAVELING',
            'VIEW_ITINERARY',
        ],
        # NOT IN GO. Two empty-state sentences the Go dashboard does not render.
        "not_in_go": [
            'EMPTY_PAST_BODY',
            'SUBTITLE_NO_TRIP',
        ],
    },
    {
        "label": 'trip status',
        "kmp_file": ROOT / 'mobile/shared/src/commonMain/kotlin/com/storytail/adventures/domain/trip/TripStatus.kt',
        "kmp_object": 'TripStatusMessages',
        "go_owners": [
            ROOT / 'webgo/internal/handlers/client/format.go',
        ],
        "keys": [
            'BOOKED',
            'CANCELLED',
            'FINAL_PAYMENT_DUE',
            'INQUIRY',
            'PAST_TRIP',
            'PROPOSAL_READY',
            'TRAVELING_NOW',
        ],
    },
    {
        "label": 'trip documents',
        "kmp_file": ROOT / 'mobile/shared/src/commonMain/kotlin/com/storytail/adventures/domain/trip/TripDocuments.kt',
        "kmp_object": 'DocumentMessages',
        "go_owners": [
            ROOT / 'webgo/internal/handlers/client/documents.go',
            ROOT / 'webgo/pages/client/documents.html',
        ],
        "keys": [
            'ADDED_BY_AGENT',
            'ADDED_BY_YOU',
            'EMPTY_BODY',
            'EMPTY_TITLE',
            'GROUP_CONFIRMATIONS',
            'GROUP_IDENTITY',
            'GROUP_INSURANCE',
            'GROUP_ITINERARY',
            'GROUP_OTHER',
            'GROUP_PHOTOS',
            'OPEN_FAILED',
            'UPLOAD_CTA',
        ],
    },
    {
        "label": 'trip thread',
        "kmp_file": ROOT / 'mobile/shared/src/commonMain/kotlin/com/storytail/adventures/domain/trip/TripThread.kt',
        "kmp_object": 'ThreadMessages',
        "go_owners": [
            ROOT / 'webgo/internal/handlers/client/thread.go',
        ],
        "keys": [
            'ATTACH_LABEL',
            'AUTO_REPLY',
            'COMPOSE_PLACEHOLDER',
            'EMPTY_BODY',
            'EMPTY_TITLE',
            'OPEN_TRIP',
            'QUICK_ADD_PARTNER',
            'QUICK_SCHEDULE_CALL',
            'QUICK_SEND_PASSPORT',
            'QUICK_SOUNDS_GOOD',
            'REPLY_WINDOW',
            'SEND_FAILED',
            'SEND_LABEL',
            'TODAY',
            'YESTERDAY',
        ],
    },
    {
        "label": 'trip memories',
        "kmp_file": ROOT / 'mobile/shared/src/commonMain/kotlin/com/storytail/adventures/domain/trip/TripMemories.kt',
        "kmp_object": 'MemoriesMessages',
        "go_owners": [
            ROOT / 'webgo/pages/client/memories.html',
            ROOT / 'webgo/internal/handlers/client/memories.go',
        ],
        "keys": [
            'ADD_PHOTOS',
            'ADD_PHOTOS_DEFERRED',
            'AGAIN_BODY',
            'AGAIN_CTA',
            'AGAIN_HEADING',
            'DOCUMENTS_CTA',
            'ITINERARY_CTA',
            'NOTE_OVERLINE',
            'NOTE_SCRIPT',
            'PHOTOS_EMPTY_BODY',
            'PHOTOS_EMPTY_TITLE',
            'REFLECTION_BODY',
            'REFLECTION_FAILED',
            'REFLECTION_HEADING',
            'REFLECTION_PLACEHOLDER',
            'REFLECTION_SAVE',
            'REFLECTION_SAVED',
            'REFLECTION_SUBMIT',
            'REFLECTION_SUBMITTED_BODY',
            'REFLECTION_SUBMITTED_HEADING',
            'SNAPSHOT_HEADING',
        ],
        # NOT IN GO. The reflection call to action. Go shows memories but offers no way in.
        "not_in_go": [
            'REFLECTION_CTA',
            'REFLECTION_EDIT_CTA',
        ],
    },
    {
        "label": 'trip status change',
        "kmp_file": ROOT / 'mobile/shared/src/commonMain/kotlin/com/storytail/adventures/domain/trip/TripStatusChange.kt',
        "kmp_object": 'StatusChangeMessages',
        "go_owners": [
            ROOT / 'webgo/internal/handlers/client/statuschange.go',
        ],
        "keys": [
            'CHANGED_UNKNOWN',
            'HEADING_BOOKED',
            'HEADING_CANCELLED',
            'HEADING_COMPLETED',
            'HEADING_INQUIRY',
            'HEADING_PROPOSAL',
            'HEADING_TRAVELLING',
            'ITINERARY_LINE',
            'OVERLINE_HOME',
            'OVERLINE_INQUIRY',
            'OVERLINE_TRAVELLING',
            'OVERLINE_UPDATED',
            'VIEW_ITINERARY',
            'VIEW_MEMORIES',
            'VIEW_PROPOSAL',
            'VIEW_SUMMARY',
            'VIEW_TRIP',
            'WHATS_NEXT',
            'WHAT_CHANGED',
        ],
    },
    {
        "label": 'client nav',
        "kmp_file": ROOT / 'mobile/shared/src/commonMain/kotlin/com/storytail/adventures/domain/trip/ClientDestinations.kt',
        "kmp_object": 'ClientNavMessages',
        "go_owners": [
            ROOT / 'webgo/pages/layout/client.html',
        ],
        "keys": [
            'NOT_YET_ARIA',
            'NOT_YET_LABEL',
        ],
    },
    {
        "label": 'all trips',
        "kmp_file": ROOT / 'mobile/shared/src/commonMain/kotlin/com/storytail/adventures/ui/screens/trip/AllTripsScreen.kt',
        "kmp_object": 'AllTripsMessages',
        "go_owners": [
            ROOT / 'webgo/pages/client/trips.html',
            ROOT / 'webgo/internal/handlers/client/tripslist.go',
        ],
        "keys": [
            'EMPTY_ALL_BODY',
            'EMPTY_ALL_TITLE',
            'EMPTY_FILTERED_BODY',
            'EMPTY_FILTERED_TITLE',
            'ERROR_BODY',
            'SUBTITLE',
            'TAB_ALL',
            'TAB_CANCELLED',
            'TAB_PAST',
            'TAB_PLANNING',
            'TAB_UPCOMING',
            'TITLE',
        ],
        # NOT IN GO. The load-failure heading. The Go page has no error state for this read.
        "not_in_go": [
            'ERROR_TITLE',
        ],
    },
    {
        "label": '2.2.3 pay links',
        "kmp_file": ROOT / 'mobile/shared/src/commonMain/kotlin/com/storytail/adventures/domain/trip/PayLinks.kt',
        "kmp_object": 'PayLinkMessages',
        "go_owners": [
            ROOT / 'webgo/internal/handlers/client/paylink.go',
            ROOT / 'webgo/pages/client/trip.html',
        ],
        "keys": [
            'EMPTY_SCHEDULE',
            'I_HAVE_PAID',
            'I_HAVE_PAID_FAILED',
            'I_HAVE_PAID_THANKS',
            'PAY_DIRECT',
        ],
    },
    {
        "label": 'trip detail',
        "kmp_file": ROOT / 'mobile/shared/src/commonMain/kotlin/com/storytail/adventures/ui/screens/trip/TripDetailScreen.kt',
        "kmp_object": 'TripDetailMessages',
        "go_owners": [
            ROOT / 'webgo/pages/client/trip.html',
            ROOT / 'webgo/internal/handlers/client/trippage.go',
        ],
        "keys": [
            'ADVISOR_LABEL',
            'ADVISOR_NAME',
            'ADVISOR_REPLY_TIME',
            'BACK',
            'CANCELLED_HEADING',
            'CANCELLED_NO_REASON',
            'CANCELLED_REASON',
            'CANCELLED_REFUND',
            'DUE',
            'GLANCE',
            'GLANCE_COMPONENTS',
            'GLANCE_DESTINATION',
            'GLANCE_NIGHTS',
            'GLANCE_TOTAL',
            'GLANCE_TRAVELERS',
            'GLANCE_TRIP_TYPE',
            'MESSAGE',
            'NOTE_HEADING',
            'NOT_FOUND_BODY',
            'OVERDUE',
            'PAID',
            'PAYMENT_TIMELINE',
            'PAYMENT_TIMELINE_NOTE',
            'TILE_DOCUMENTS',
            'TILE_ITINERARY',
            'TILE_ITINERARY_PENDING',
            'TILE_MESSAGES',
            'TILE_PAYMENTS',
            'WAIVED',
        ],
        # NOT IN GO. Empty, cancelled and not-found states the Go trip page does not render.
        "not_in_go": [
            'CANCELLED_AGAIN_BODY',
            'CANCELLED_AGAIN_HEADING',
            'NOTE_PENDING',
            'NOT_FOUND_TITLE',
        ],
    },
    {
        "label": 'itinerary',
        "kmp_file": ROOT / 'mobile/shared/src/commonMain/kotlin/com/storytail/adventures/ui/screens/trip/ItineraryScreen.kt',
        "kmp_object": 'ItineraryMessages',
        "go_owners": [
            ROOT / 'webgo/internal/handlers/client/itinerary.go',
            ROOT / 'webgo/pages/client/itinerary-day.html',
            ROOT / 'webgo/pages/client/itinerary.html',
        ],
        "keys": [
            'BACK',
            'BLOCK_AFTERNOON',
            'BLOCK_ALL_DAY',
            'BLOCK_EVENING',
            'BLOCK_MORNING',
            'CALL',
            'CONFIRMATION',
            'EMERGENCY',
            'EMPTY_ITINERARY_BODY',
            'EMPTY_ITINERARY_TITLE',
            'HEADING',
            'IMPORTANT_INFO',
            'INSURANCE',
            'MARK_DONE',
            'NO_IMPORTANT_INFO',
            'OPEN_IN_MAPS',
            'VISA_UNKNOWN',
            'WEATHER',
        ],
        # NOT IN GO. The largest gap: no PDF download, no not-published state, and no per-section
        # empty states on the Go itinerary viewer.
        "not_in_go": [
            'ASK_GYASI',
            'DOWNLOAD_PDF',
            'EMPTY_DAY_BODY',
            'EMPTY_DINING_BODY',
            'EMPTY_DINING_TITLE',
            'EMPTY_FLIGHTS_BODY',
            'EMPTY_FLIGHTS_TITLE',
            'MARKED_DONE',
            'NOT_PUBLISHED_BODY',
            'NOT_PUBLISHED_TITLE',
            'SHARE_NOTE',
            'TIP',
        ],
    },
    {
        "label": 'auth validation',
        "kmp_file": ROOT / 'mobile/shared/src/commonMain/kotlin/com/storytail/adventures/domain/validation/AuthValidation.kt',
        "kmp_object": 'Messages',
        "go_owners": [
            ROOT / 'webgo/internal/validate/auth.go',
        ],
        "keys": [
            'EMAIL_INVALID',
            'EMAIL_REQUIRED',
            'PASSWORD_NEEDS_DIGIT',
            'PASSWORD_NEEDS_LOWERCASE',
            'PASSWORD_NEEDS_UPPERCASE',
            'PASSWORD_REQUIRED',
            'PASSWORD_TOO_SHORT',
        ],
    },
    {
        "label": 'registration',
        "kmp_file": ROOT / 'mobile/shared/src/commonMain/kotlin/com/storytail/adventures/domain/validation/RegistrationValidation.kt',
        "kmp_object": 'Messages',
        "go_owners": [
            ROOT / 'webgo/internal/validate/registration.go',
        ],
        "keys": [
            'CONFIRM_MISMATCH',
            'CONFIRM_REQUIRED',
            'NAME_INVALID',
            'NAME_REQUIRED',
            'NAME_TOO_LONG',
            'TERMS_REQUIRED',
        ],
    },
    {
        "label": 'mfa',
        "kmp_file": ROOT / 'mobile/shared/src/commonMain/kotlin/com/storytail/adventures/domain/validation/MfaValidation.kt',
        "kmp_object": 'Messages',
        "go_owners": [
            ROOT / 'webgo/internal/validate/mfa.go',
        ],
        "keys": [
            'CODE_REQUIRED',
            'CODE_SHAPE',
        ],
    },
    {
        "label": 'password rule labels',
        "kmp_file": ROOT / 'mobile/shared/src/commonMain/kotlin/com/storytail/adventures/domain/validation/PasswordStrength.kt',
        "kmp_object": 'Labels',
        "go_owners": [
            ROOT / 'webgo/internal/validate/password_strength.go',
        ],
        "keys": [
            'DIGIT',
            'LENGTH',
            'LOWERCASE',
            'UPPERCASE',
        ],
    },
    {
        "label": 'password strength',
        "kmp_file": ROOT / 'mobile/shared/src/commonMain/kotlin/com/storytail/adventures/domain/validation/PasswordStrength.kt',
        "kmp_object": 'Messages',
        "go_owners": [
            ROOT / 'webgo/internal/validate/password_strength.go',
        ],
        "keys": [
            'STILL_NEEDS_PREFIX',
            'STRONG',
        ],
    },
    {
        "label": '2.1.2 registration screen',
        "kmp_file": ROOT / 'mobile/shared/src/commonMain/kotlin/com/storytail/adventures/ui/screens/auth/RegisterScreen.kt',
        "kmp_object": 'RegisterCopy',
        "go_owners": [
            ROOT / 'webgo/pages/auth/register.html',
        ],
        "keys": [
            'APPLE',
            'CONFIRM',
            'DIVIDER',
            'EMAIL',
            'FIRST_NAME',
            'GOOGLE',
            'HAVE_ACCOUNT',
            'LAST_NAME',
            'OVERLINE',
            'PASSWORD',
            'PENDING',
            'SIGN_IN',
            'SOCIAL_DISABLED',
            'SUBMIT',
            'TITLE',
        ],
    },
    {
        "label": '2.1.4 forgot password screen',
        "kmp_file": ROOT / 'mobile/shared/src/commonMain/kotlin/com/storytail/adventures/ui/screens/auth/ForgotPasswordScreen.kt',
        "kmp_object": 'ForgotPasswordCopy',
        "go_owners": [
            ROOT / 'webgo/pages/auth/forgot-password.html',
        ],
        "keys": [
            'EMAIL',
            'OVERLINE',
            'PENDING',
            'SUB',
            'SUBMIT',
            'TITLE',
        ],
    },
    {
        "label": '2.1.5 reset password screen',
        "kmp_file": ROOT / 'mobile/shared/src/commonMain/kotlin/com/storytail/adventures/ui/screens/auth/ResetPasswordScreen.kt',
        "kmp_object": 'ResetPasswordCopy',
        "go_owners": [
            ROOT / 'webgo/pages/auth/reset-password.html',
        ],
        "keys": [
            'CONFIRM',
            'OVERLINE',
            'PASSWORD',
            'PENDING',
            'SUB',
            'SUBMIT',
            'TITLE',
        ],
    },
    {
        "label": '2.1.3 email verification screen',
        "kmp_file": ROOT / 'mobile/shared/src/commonMain/kotlin/com/storytail/adventures/ui/screens/auth/VerifyEmailScreen.kt',
        "kmp_object": 'VerifyEmailCopy',
        "go_owners": [
            ROOT / 'webgo/pages/auth/verify-email.html',
        ],
        "keys": [
            'RESEND',
            'SIGN_OUT',
            'TITLE',
            'WHY_BODY',
            'WHY_TITLE',
        ],
    },
    {
        "label": '2.1.10 profile validation',
        "kmp_file": ROOT / 'mobile/shared/src/commonMain/kotlin/com/storytail/adventures/domain/validation/ProfileValidation.kt',
        "kmp_object": 'Messages',
        "go_owners": [
            ROOT / 'webgo/internal/validate/profile.go',
        ],
        "keys": [
            'ADDRESS_INCOMPLETE',
            'COUNTRY_INVALID',
            'DATE_INVALID',
            'DOB_INVALID',
            'DOB_TOO_EARLY',
            'EMERGENCY_INCOMPLETE',
            'INVALID_CHARS',
            'PASSPORT_INCOMPLETE',
            'PHONE_INVALID',
            'PHONE_NEEDS_COUNTRY_CODE',
            'POSTAL_INVALID',
            'TOO_LONG',
        ],
    },
    {
        "label": '2.1.11 preferences validation',
        "kmp_file": ROOT / 'mobile/shared/src/commonMain/kotlin/com/storytail/adventures/domain/validation/PreferencesValidation.kt',
        "kmp_object": 'Messages',
        "go_owners": [
            ROOT / 'webgo/internal/validate/preferences.go',
        ],
        "keys": [
            'ACCESSIBILITY_NONE_ALONE',
            'BUDGET_UNKNOWN',
            'DESTINATIONS_TOO_MANY',
            'DESTINATION_TOO_LONG',
            'DIETARY_NONE_ALONE',
            'FAVOURITES_TOO_LONG',
            'INVALID_CHARS',
            'LOYALTY_NEEDS_PROGRAM',
            'LOYALTY_NUMBER_SHAPE',
            'LOYALTY_PROGRAM_TOO_LONG',
            'LOYALTY_TOO_MANY',
            'NOTES_TOO_LONG',
            'UNKNOWN_OPTION',
        ],
        # NOT IN GO. Two cross-field messages (a ticked "none" plus a written note)
        # that webgo/internal/validate/preferences.go does not implement.
        "not_in_go": [
            'ACCESSIBILITY_NONE_WITH_NOTE',
            'DIETARY_NONE_WITH_NOTE',
        ],
    },
    {
        "label": '2.1.12 companion validation',
        "kmp_file": ROOT / 'mobile/shared/src/commonMain/kotlin/com/storytail/adventures/domain/validation/CompanionValidation.kt',
        "kmp_object": 'Messages',
        "go_owners": [
            ROOT / 'webgo/internal/validate/companion.go',
        ],
        "keys": [
            'COUNTRY_INVALID',
            'DATE_INVALID',
            'DOB_INVALID',
            'FIRST_NAME_REQUIRED',
            'INVALID_CHARS',
            'LAST_NAME_REQUIRED',
            'NAME_TOO_LONG',
            'PASSPORT_NEEDS_EXPIRY',
            'RELATIONSHIP_TOO_LONG',
        ],
    },
    {
        "label": '2.1.9 welcome screen',
        "kmp_file": ROOT / 'mobile/shared/src/commonMain/kotlin/com/storytail/adventures/ui/screens/onboarding/WelcomeScreen.kt',
        "kmp_object": 'WelcomeCopy',
        "go_owners": [
            ROOT / 'webgo/pages/onboarding/welcome.html',
        ],
        "keys": [
            'OVERLINE',
            'PRIMARY',
            'SECTION',
            'SKIP',
            'SUB',
        ],
    },
    {
        "label": '2.1.10 profile screen',
        "kmp_file": ROOT / 'mobile/shared/src/commonMain/kotlin/com/storytail/adventures/ui/screens/onboarding/ProfileFields.kt',
        "kmp_object": 'ProfileCopy',
        "go_owners": [
            ROOT / 'webgo/pages/onboarding/profile.html',
            ROOT / 'webgo/internal/profileform/profileform.go',
            ROOT / 'webgo/internal/handlers/onboarding/onboarding.go',
        ],
        "keys": [
            'ADDRESS',
            'CITY',
            'COUNTRY',
            'DOB',
            'DOB_HINT',
            'EMERGENCY',
            'EMERGENCY_HINT',
            'EMERGENCY_NAME',
            'EMERGENCY_PHONE',
            'EMERGENCY_RELATIONSHIP',
            'EXPIRES',
            'ISSUING',
            'LINE1',
            'LINE2',
            'OPTIONAL',
            'PASSPORT',
            'PASSPORT_EXPIRED',
            'PASSPORT_HINT',
            'PASSPORT_OPTIONAL',
            'PENDING',
            'PHONE',
            'PHONE_HINT',
            'POSTAL',
            'POSTAL_US',
            'PRIMARY',
            'REGION',
            'REGION_US',
            'SKIP',
            'SUB',
            'TITLE',
        ],
    },
    {
        "label": '2.1.11 preferences screen',
        "kmp_file": ROOT / 'mobile/shared/src/commonMain/kotlin/com/storytail/adventures/ui/screens/onboarding/PreferencesFields.kt',
        "kmp_object": 'PreferencesCopy',
        "go_owners": [
            ROOT / 'webgo/pages/onboarding/preferences.html',
            ROOT / 'webgo/internal/handlers/onboarding/onboarding.go',
        ],
        "keys": [
            'ACCESS',
            'ACCESS_NOTES',
            'BUDGET',
            'BUDGET_HINT',
            'DESTINATIONS',
            'DESTINATIONS_HINT',
            'DESTINATION_OTHER',
            'DIET',
            'DIET_NOTES',
            'LOYALTY',
            'LOYALTY_ADD',
            'LOYALTY_HINT',
            'LOYALTY_NUMBER',
            'LOYALTY_PROGRAM',
            'PENDING',
            'PRIMARY',
            'SKIP',
            'STYLE',
            'STYLE_HINT',
            'SUB',
            'TITLE',
        ],
        # NOT IN GO. The loyalty row's remove control.
        "not_in_go": [
            'LOYALTY_REMOVE',
        ],
    },
    {
        "label": '2.1.12 companions screen',
        "kmp_file": ROOT / 'mobile/shared/src/commonMain/kotlin/com/storytail/adventures/ui/screens/onboarding/CompanionsScreen.kt',
        "kmp_object": 'CompanionsCopy',
        "go_owners": [
            ROOT / 'webgo/pages/onboarding/companions.html',
            ROOT / 'webgo/internal/handlers/onboarding/companions.go',
            ROOT / 'webgo/internal/handlers/onboarding/onboarding.go',
        ],
        "keys": [
            'ADD',
            'CANCEL',
            'DOB',
            'EDIT',
            'EMPTY_BODY',
            'EMPTY_TITLE',
            'EXPIRES',
            'FIRST_NAME',
            'FORM_ADD',
            'FORM_SUB',
            'ISSUING',
            'LAST_NAME',
            'MAX',
            'NO_PASSPORT',
            'PENDING',
            'PRIMARY',
            'RELATIONSHIP',
            'REMOVE',
            'SAVE',
            'SAVING',
            'SKIP',
            'SUB',
            'TITLE',
            'UNFINISHED',
        ],
    },
    {
        "label": '2.1.13 connect screen',
        "kmp_file": ROOT / 'mobile/shared/src/commonMain/kotlin/com/storytail/adventures/ui/screens/onboarding/ConnectScreen.kt',
        "kmp_object": 'ConnectCopy',
        "go_owners": [
            ROOT / 'webgo/pages/onboarding/connect.html',
            ROOT / 'webgo/internal/handlers/onboarding/connect.go',
        ],
        "keys": [
            'FIELD',
            'HELP',
            'PENDING',
            'PRIMARY',
            'PRIMARY_EMPTY',
            'SKIP',
            'SUB',
            'TITLE',
        ],
    },
    {
        "label": '2.1.13 connect banner',
        "kmp_file": ROOT / 'mobile/shared/src/commonMain/kotlin/com/storytail/adventures/domain/onboarding/ConnectBanner.kt',
        "kmp_object": 'ConnectBannerCopy',
        "go_owners": [
            ROOT / 'webgo/pages/onboarding/connect.html',
        ],
        "keys": [
            'NO_MATCH',
        ],
    },
    {
        "label": '2.1.14 complete screen',
        "kmp_file": ROOT / 'mobile/shared/src/commonMain/kotlin/com/storytail/adventures/ui/screens/onboarding/CompleteScreen.kt',
        "kmp_object": 'CompleteCopy',
        "go_owners": [
            ROOT / 'webgo/pages/onboarding/complete.html',
        ],
        "keys": [
            'CHECKLIST',
            'OVERLINE',
            'PENDING',
            'PRIMARY',
        ],
    },
    {
        "label": '2.1.14 completion summary',
        "kmp_file": ROOT / 'mobile/shared/src/commonMain/kotlin/com/storytail/adventures/domain/onboarding/Completion.kt',
        "kmp_object": 'CompletionCopy',
        "go_owners": [
            ROOT / 'webgo/internal/handlers/onboarding/complete.go',
        ],
        "keys": [
            'COMPANIONS_DONE',
            'COMPANIONS_SKIPPED',
            'PREFERENCES_DONE',
            'PREFERENCES_SKIPPED',
            'PROFILE_DONE',
            'PROFILE_SKIPPED',
            'SHORT_COMPANIONS',
            'SHORT_PREFERENCES',
            'SHORT_PROFILE',
            'SUB_NOTHING',
            'SUB_NO_TRIP',
            'TRIP_DONE',
            'TRIP_NONE',
        ],
    },
    {
        "label": '2.5.1 account overview',
        "kmp_file": ROOT / 'mobile/shared/src/commonMain/kotlin/com/storytail/adventures/domain/account/AccountCopy.kt',
        "kmp_object": 'AccountMessages',
        "go_owners": [
            ROOT / 'webgo/internal/handlers/client/account.go',
        ],
        "keys": [
            'COMING_SOON',
            'CONNECTED',
            'CONNECTED_SUB',
            'DOCUMENTS',
            'DOCUMENTS_EMPTY_SUB',
            'FALLBACK_NAME',
            'GROUP_APP',
            'GROUP_SUPPORT',
            'GROUP_YOU',
            'HELP',
            'HELP_SUB',
            'NOTIFICATIONS',
            'PERSONAL',
            'PERSONAL_SUB',
            'PREFERENCES',
            'PREFERENCES_SUB',
            'PRIVACY',
            'PRIVACY_SUB',
            'SECURITY',
            'SECURITY_SUB',
            'SIGN_OUT',
            'TITLE',
        ],
    },
    {
        "label": '2.5.2 personal info',
        "kmp_file": ROOT / 'mobile/shared/src/commonMain/kotlin/com/storytail/adventures/domain/account/AccountCopy.kt',
        "kmp_object": 'PersonalMessages',
        "go_owners": [
            ROOT / 'webgo/internal/handlers/client/personal.go',
        ],
        "keys": [
            'CANCEL',
            'EMAIL_LABEL',
            'IDENTITY_HEADING',
            'IDENTITY_NOTE',
            'NAME_LABEL',
            'NOT_SET',
            'SAVE',
            'SUBTITLE',
            'TITLE',
        ],
    },
    {
        "label": '2.5.3 preferences edit',
        "kmp_file": ROOT / 'mobile/shared/src/commonMain/kotlin/com/storytail/adventures/domain/account/AccountCopy.kt',
        "kmp_object": 'AccountPreferencesMessages',
        "go_owners": [
            ROOT / 'webgo/internal/handlers/client/preferences.go',
        ],
        "keys": [
            'CANCEL',
            'SAVE',
            'SUBTITLE',
            'TITLE',
        ],
    },
    {
        "label": '2.5.4 document library',
        "kmp_file": ROOT / 'mobile/shared/src/commonMain/kotlin/com/storytail/adventures/domain/account/AccountCopy.kt',
        "kmp_object": 'DocumentLibraryMessages',
        "go_owners": [
            ROOT / 'webgo/internal/handlers/client/documents.go',
            ROOT / 'webgo/pages/client/documents.html',
        ],
        "keys": [
            'EMPTY_BODY',
            'EMPTY_CTA',
            'EMPTY_TITLE',
            'PRIVACY_NOTE',
            'SUBTITLE',
            'TITLE',
            'UPLOAD_CTA',
            'UPLOAD_DEFERRED',
        ],
    },
    {
        "label": '2.5.6 notifications',
        "kmp_file": ROOT / 'mobile/shared/src/commonMain/kotlin/com/storytail/adventures/domain/account/AccountCopy.kt',
        "kmp_object": 'NotificationsMessages',
        "go_owners": [
            ROOT / 'webgo/internal/handlers/client/accountpage.go',
        ],
        "keys": [
            'TITLE',
        ],
        # NOT IN GO. The screen is not built, and it is backend work rather than a page:
        # notification_preference has RLS with zero policies and no traveler-facing RPC exists.
        # webgo/internal/handlers/client/accountpage.go says the same thing at the call site.
        "not_in_go": [
            'EMPTY_BODY',
            'EMPTY_TITLE',
            'REACH_YOU',
        ],
    },
    {
        "label": '2.5.7 security',
        "kmp_file": ROOT / 'mobile/shared/src/commonMain/kotlin/com/storytail/adventures/domain/account/AccountCopy.kt',
        "kmp_object": 'SecurityMessages',
        "go_owners": [
            ROOT / 'webgo/internal/handlers/client/security.go',
        ],
        "keys": [
            'MFA_BODY',
            'MFA_ENABLE_CTA',
            'MFA_MANAGE_CTA',
            'MFA_MANAGE_DEFERRED',
            'MFA_OFF',
            'MFA_ON',
            'MFA_TITLE',
            'NO_PASSWORD_CTA',
            'NO_PASSWORD_TITLE',
            'PASSWORD_BODY',
            'PASSWORD_CTA',
            'PASSWORD_DEFERRED',
            'PASSWORD_TITLE',
            'SESSIONS_ADVICE',
            'SESSIONS_DEFERRED',
            'SESSIONS_HEADING',
            'SUBTITLE',
            'TITLE',
        ],
    },
    {
        "label": '2.5.8 connected accounts',
        "kmp_file": ROOT / 'mobile/shared/src/commonMain/kotlin/com/storytail/adventures/domain/account/AccountCopy.kt',
        "kmp_object": 'ConnectedMessages',
        "go_owners": [
            ROOT / 'webgo/internal/handlers/client/connected.go',
        ],
        "keys": [
            'EMAIL_ACCOUNT_NOTE',
            'LINKED',
            'LINK_CTA',
            'LINK_DEFERRED',
            'NOT_LINKED',
            'OAUTH_ACCOUNT_NOTE',
            'SAFETY_NOTE',
            'SUBTITLE',
            'TITLE',
            'UNLINK_CTA',
            'UNLINK_DEFERRED',
        ],
    },
    {
        "label": '2.5.9 privacy',
        "kmp_file": ROOT / 'mobile/shared/src/commonMain/kotlin/com/storytail/adventures/domain/account/AccountCopy.kt',
        "kmp_object": 'PrivacyMessages',
        "go_owners": [
            ROOT / 'webgo/internal/handlers/client/privacy.go',
        ],
        "keys": [
            'CLOSE_BODY',
            'CLOSE_CTA',
            'CLOSE_TITLE',
            'COOKIES_LINK',
            'EXPORT_BODY',
            'EXPORT_CTA',
            'EXPORT_DEFERRED',
            'EXPORT_TITLE',
            'SUBTITLE',
            'TITLE',
            'TRACKING_BODY',
            'TRACKING_HEADING',
        ],
    },
    {
        "label": '2.5.10 account closure',
        "kmp_file": ROOT / 'mobile/shared/src/commonMain/kotlin/com/storytail/adventures/domain/account/AccountCopy.kt',
        "kmp_object": 'CloseMessages',
        "go_owners": [
            ROOT / 'webgo/internal/handlers/client/privacy.go',
        ],
        "keys": [
            'BACK',
            'CONFIRM_CTA',
            'CONFIRM_HINT',
            'CONFIRM_LABEL',
            'CONFIRM_PLACEHOLDER',
            'DEFERRED',
            'HEADING',
            'KEEP_CTA',
            'REASON_LABEL',
            'REASON_PLACEHOLDER',
            'RECONSIDER_BODY',
            'RECONSIDER_CTA',
            'TITLE',
            'WHAT_HAPPENS_LABEL',
        ],
    },
    {
        "label": '2.5.11 help',
        "kmp_file": ROOT / 'mobile/shared/src/commonMain/kotlin/com/storytail/adventures/domain/account/AccountCopy.kt',
        "kmp_object": 'HelpMessages',
        "go_owners": [
            ROOT / 'webgo/pages/client/dashboard.html',
            ROOT / 'webgo/internal/handlers/client/account.go',
        ],
        "keys": [
            'ADVISOR_INITIALS',
            'MESSAGE_CTA',
            'REPLY_WINDOW',
            'TITLE',
        ],
        # NOT IN GO. The screen is not built. It needed public's HowItWorksFAQ/GyasiFAQ, which only
        # became reachable to the traveler area when the public area merged.
        "not_in_go": [
            'ADVISOR_BODY',
            'ADVISOR_NAME',
            'FAQ_HEADING',
            'LEGAL_HEADING',
            'SUBTITLE',
        ],
    },
    {
        "label": '2.0.12 message gyasi',
        "kmp_file": ROOT / 'mobile/shared/src/commonMain/kotlin/com/storytail/adventures/domain/messages/MessageGyasi.kt',
        "kmp_object": 'MessageGyasiCopy',
        "go_owners": [
            ROOT / 'webgo/pages/public/message.html',
            ROOT / 'webgo/internal/handlers/public/message.go',
        ],
        "keys": [
            'ABOUT_PREFIX',
            'BODY',
            'EMAIL',
            'FIRST_NAME',
            'KEEP_EXPLORING',
            'LAST_NAME',
            'MESSAGE',
            'MESSAGE_HINT',
            'OVERLINE',
            'PHONE',
            'PRIVACY_BEFORE',
            'PRIVACY_LINK',
            'SENT_BODY',
            'SENT_TITLE',
            'SUBMIT',
            'THROTTLED',
            'TITLE',
            'UNAVAILABLE',
        ],
        # NOT IN GO. The sending state on the public form.
        "not_in_go": [
            'PENDING',
        ],
    },
    {
        "label": '2.6 messaging',
        "kmp_file": ROOT / 'mobile/shared/src/commonMain/kotlin/com/storytail/adventures/domain/messages/MessagesCopy.kt',
        "kmp_object": 'MessagesMessages',
        "go_owners": [
            ROOT / 'webgo/internal/handlers/client/inbox.go',
        ],
        "keys": [
            'ADVISOR_INITIALS',
            'ADVISOR_NAME',
            'ATTACH_DEFERRED',
            'BACK_TO_MESSAGES',
            'EMPTY_BODY',
            'EMPTY_CTA',
            'EMPTY_TITLE',
            'GENERAL_THREAD_TITLE',
            'NEW_BODY_LABEL',
            'NEW_CTA',
            'NEW_FAILED',
            'NEW_PLACEHOLDER',
            'NEW_SEND',
            'NEW_SENDING',
            'NEW_SUBTITLE',
            'NEW_TITLE',
            'REPLY_WINDOW',
            'SEARCH_EMPTY',
            'SEARCH_PLACEHOLDER',
            'SUBTITLE',
            'THREAD_EMPTY_BODY',
            'TITLE',
        ],
    },
]


def unescape(s: str) -> str:
    return s.replace('\\"', '"').replace("\\'", "'").replace("\\\\", "\\")


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


def kmp_errors() -> dict[str, str]:
    text = KMP_ERRORS.read_text()
    out: dict[str, str] = {}
    for kind, obj in ERROR_KINDS.items():
        entry = re.search(rf"data object {obj} : AuthError \{{(.*?)\n    \}}", text, re.S)
        if not entry:
            continue
        msg = re.search(
            r"override val message\s*=\s*(.*?)(?:\n\s*override|\n\s*\}|$)", entry.group(1), re.S
        )
        if msg:
            out[kind] = "".join(unescape(p) for p in re.findall(KMP_STRING, msg.group(1)))
    return out


def go_haystack(paths: list[pathlib.Path]) -> str:
    """
    The owners' source, with adjacent Go string literals joined.

    `"a " +\n\t"b"` is one sentence in the source and has to read as one here, exactly as the
    Kotlin side joins its own concatenations. Without this, every wrapped sentence in Go —
    which is most of the long ones — reads as absent and reports as drift.

    HTML owners are taken as-is: a page's copy is its text, and the escaping that matters
    (`&amp;`, `&#39;`) is handled by the caller comparing against what the template really says.
    """
    out = []
    for p in paths:
        text = p.read_text(errors="ignore")
        if p.suffix == ".go":
            text = re.sub(r'"\s*\+\s*\n?\s*"', "", text)
        out.append(text)
    return "\n".join(out)


def go_errors() -> dict[str, str]:
    """
    The `Message:` of each entry in `authMessages`, concatenations joined.

    Go keys that map by the exported identifier (`InvalidCredentials`), not by the
    snake_case kind, and ERROR_KINDS already holds that identifier because Kotlin names its
    data object the same thing. Matching on the kind STRING instead finds the `const` block
    at the top of the file, where the kinds are declared, and returns the next declaration
    rather than a sentence — which is what the first version of this did, reporting all nine
    as drift with the Go side showing fragments of the type declarations.
    """
    text = re.sub(r'"\s*\+\s*\n?\s*"', "", GO_AUTH_ERRORS.read_text())
    table = re.search(r"var authMessages = map\[AuthErrorKind\]AuthMessage\{(.*)\n\}", text, re.S)
    if not table:
        return {}
    out: dict[str, str] = {}
    for kind, ident in ERROR_KINDS.items():
        entry = re.search(rf"\n\t{ident}: \{{(.*?)\n\t\}},", table.group(1), re.S)
        if not entry:
            continue
        msg = re.search(r'Message:\s*"((?:[^"\\]|\\.)*)"', entry.group(1))
        if msg:
            out[kind] = unescape(msg.group(1))
    return out


def main() -> int:
    problems: list[str] = []
    checked = 0
    gaps = 0

    for table in TABLES:
        label = table["label"]
        kmp = kmp_messages(table["kmp_file"], table["kmp_object"])
        if not kmp:
            problems.append(
                f"{label}: could not read object {table['kmp_object']} from "
                f"{table['kmp_file'].relative_to(ROOT)} — did it get renamed?"
            )
            continue

        missing_owner = [p for p in table["go_owners"] if not p.exists()]
        if missing_owner:
            problems.append(
                f"{label}: owner file gone — "
                + ", ".join(str(p.relative_to(ROOT)) for p in missing_owner)
            )
            continue

        hay = go_haystack(table["go_owners"])
        for key in table["keys"]:
            value = kmp.get(key)
            if value is None:
                problems.append(f"{label}: '{key}' is no longer in {table['kmp_object']}")
                continue
            if value not in hay:
                owners = ", ".join(str(p.relative_to(ROOT)) for p in table["go_owners"])
                problems.append(
                    f"{label}: '{key}' is not in the Go screen that shows it\n"
                    f"    mobile: {value!r}\n"
                    f"    looked in: {owners}"
                )
            checked += 1

        # A gap that has quietly closed should stop being listed as a gap.
        hay_all = hay
        for key in table.get("not_in_go", []):
            value = kmp.get(key)
            gaps += 1
            if value is not None and value in hay_all:
                problems.append(
                    f"{label}: '{key}' is listed in not_in_go but Go now has it — "
                    f"move it into keys so it is guarded from here on"
                )

    ge, ke = go_errors(), kmp_errors()
    for kind in ERROR_KINDS:
        g, k = ge.get(kind), ke.get(kind)
        checked += 1
        if g is None:
            problems.append(f"auth error: '{kind}' missing in Go")
        elif k is None:
            problems.append(f"auth error: '{kind}' missing on mobile")
        elif g != k:
            problems.append(
                f"auth error: '{kind}' differs\n    go:     {g!r}\n    mobile: {k!r}"
            )

    if problems:
        print("::error::User-facing copy has drifted between the Go app and mobile.")
        for p in problems:
            print(f"  {p}")
        print(
            "\nThese strings are intentionally duplicated (see the header comments in each "
            "file).\nChange them together, or the same person sees different wording on phone "
            "and web."
        )
        return 1

    print(
        f"Copy parity OK — {checked} strings across {len(TABLES)} modules and "
        f"{len(ERROR_KINDS)} auth errors match between Go and mobile."
    )
    print(f"{gaps} strings mobile shows have no Go equivalent yet; see not_in_go in this file.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
