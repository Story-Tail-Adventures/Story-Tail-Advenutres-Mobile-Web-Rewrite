package com.storytail.adventures.domain.onboarding

/**
 * Screen 2.1m.14 Onboarding Complete — turning what is on file into what the screen says.
 *
 * PARALLEL IMPLEMENTATION of web/app/(onboarding)/onboarding/complete/{state,summary}.ts.
 * Pure, and separated from the screen for the same reason `destinationFor` was: this is the
 * logic that decides whether a traveler is congratulated for finishing something they
 * skipped, and it should be assertable without a Supabase client.
 *
 * THE PROTOTYPE'S SUBTITLE IS A FIXED SENTENCE — M2114 says "Profile, preferences,
 * household, and your Sandals trip — all linked." It is true of the artboard and of nobody
 * else. Every step of this wizard is skippable, so the traveler most likely to reach this
 * screen having skipped things is exactly the one a fixed sentence tells they finished
 * everything. What the screen says is assembled from what is actually on file.
 */

/** What the wizard actually collected, read back from the rows rather than assumed. */
data class CompletionSummary(
    val firstName: String? = null,
    val hasProfile: Boolean = false,
    val hasPreferences: Boolean = false,
    val hasCompanions: Boolean = false,
    val trip: LinkedTrip? = null,
)

/** The soonest trip on file, if there is one. */
data class LinkedTrip(val title: String, val startDate: String?)

/** One line of the checklist: what it was, and whether it happened. */
data class ChecklistLine(val label: String, val done: Boolean)

/**
 * The sentence under the heading, assembled from what was actually saved.
 *
 * A LINKED TRIP COUNTS IN EVERY BRANCH, not only when all three wizard steps are complete —
 * and that is not a corner case. An existing client being moved onto the portal arrives with
 * a trip already attached, by the email match at confirmation or by the code on the step
 * before this one, and neither depends on their having filled in a single form. Skipping all
 * three and still having a trip is the ORDINARY shape for exactly the travelers Gyasi has
 * been working with longest. Telling them "nothing to save yet" three lines above a
 * checklist that reads "your trip with Gyasi, linked" is the contradiction this screen
 * exists to avoid.
 */
fun completionSubtitle(summary: CompletionSummary): String {
    val trip = summary.trip
    if (summary.hasProfile && summary.hasPreferences && summary.hasCompanions) {
        return if (trip != null) CompletionCopy.subWithTrip(trip.title)
        else CompletionCopy.SUB_NO_TRIP
    }

    val saved = listOfNotNull(
        CompletionCopy.SHORT_PROFILE.takeIf { summary.hasProfile },
        CompletionCopy.SHORT_PREFERENCES.takeIf { summary.hasPreferences },
        CompletionCopy.SHORT_COMPANIONS.takeIf { summary.hasCompanions },
    )

    // Nothing typed at all is a real outcome — every step of this wizard is skippable, and
    // somebody who skipped all of them must not be told their details are saved.
    if (saved.isEmpty()) {
        return if (trip != null) CompletionCopy.subOnlyTrip(trip.title)
        else CompletionCopy.SUB_NOTHING
    }

    return if (trip != null) CompletionCopy.subPartialWithTrip(joinNaturally(saved), trip.title)
    else CompletionCopy.subPartial(joinNaturally(saved))
}

/**
 * "A", "A and B", "A, B and C" — an Oxford-comma-free list, which is how Gyasi writes.
 *
 * The web twin calls this `listOf`. Kotlin already has that name for building a list, and a
 * file-level overload would quietly win against it for any single-argument call.
 */
private fun joinNaturally(parts: List<String>): String =
    if (parts.size == 1) parts.first()
    else parts.dropLast(1).joinToString(", ") + " and " + parts.last()

/**
 * The checklist, which names what was skipped rather than quietly omitting it.
 *
 * A list showing only what succeeded reads as a complete list, and somebody who skipped
 * preferences would never learn the option is still open.
 */
fun completionChecklist(summary: CompletionSummary): List<ChecklistLine> = listOf(
    ChecklistLine(
        label = if (summary.hasProfile) CompletionCopy.PROFILE_DONE
                else CompletionCopy.PROFILE_SKIPPED,
        done = summary.hasProfile,
    ),
    ChecklistLine(
        label = if (summary.hasPreferences) CompletionCopy.PREFERENCES_DONE
                else CompletionCopy.PREFERENCES_SKIPPED,
        done = summary.hasPreferences,
    ),
    ChecklistLine(
        label = if (summary.hasCompanions) CompletionCopy.COMPANIONS_DONE
                else CompletionCopy.COMPANIONS_SKIPPED,
        done = summary.hasCompanions,
    ),
    ChecklistLine(
        label = if (summary.trip != null) CompletionCopy.TRIP_DONE
                else CompletionCopy.TRIP_NONE,
        done = summary.trip != null,
    ),
)

/**
 * The strings the summary is built from.
 *
 * Pinned against COMPLETE_TEXT by .github/scripts/check_copy_parity.py — these are the ones
 * a traveler would notice differing between their phone and their browser.
 */
object CompletionCopy {
    const val SUB_NO_TRIP =
        "I've saved your profile, how you like to travel, and who travels with you. When a " +
            "trip starts taking shape, it'll show up right here."

    /** Nothing typed, but a trip already on file: an existing client arriving on the portal. */
    const val SUB_NOTHING =
        "Nothing to save yet, and that's completely fine — I can plan around a conversation. " +
            "Add any of it whenever you like."

    const val PROFILE_DONE = "Your details"
    const val PROFILE_SKIPPED = "Your details — skipped, add it any time"
    const val PREFERENCES_DONE = "How you like to travel"
    const val PREFERENCES_SKIPPED = "How you like to travel — skipped, add it any time"
    const val COMPANIONS_DONE = "Who travels with you"
    const val COMPANIONS_SKIPPED = "Who travels with you — skipped, add it any time"
    const val TRIP_DONE = "Your trip with Gyasi, linked"
    const val TRIP_NONE = "No trip linked yet"

    /** Short forms for assembling `subPartial`. Lowercase: they land mid-sentence. */
    const val SHORT_PROFILE = "your details"
    const val SHORT_PREFERENCES = "how you like to travel"
    const val SHORT_COMPANIONS = "who travels with you"

    fun subWithTrip(tripTitle: String) =
        "I've saved your profile, how you like to travel, and who travels with you — and " +
            "your $tripTitle trip is linked and waiting."

    fun subPartial(savedList: String) =
        "I've saved $savedList. The rest can wait — nothing here expires, and you can add " +
            "it any time."

    fun subPartialWithTrip(savedList: String, tripTitle: String) =
        "I've saved $savedList, and your $tripTitle trip is linked and waiting. The rest " +
            "can wait too — nothing here expires."

    fun subOnlyTrip(tripTitle: String) =
        "Your $tripTitle trip is linked and waiting. Everything else can wait — nothing " +
            "here expires, and you can add it any time."
}
