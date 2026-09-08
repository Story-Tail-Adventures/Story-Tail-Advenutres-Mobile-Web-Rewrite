package com.storytail.adventures.domain.trip

/**
 * Screen 2.2.11's copy. KOTLIN TWIN of `web/lib/trips/memories.ts`, compared by
 * `.github/scripts/check_copy_parity.py`.
 *
 * WHY THIS SCREEN GETS A SHARED TABLE when 2.2.6's chrome did not: this is the copy that
 * carries the section's voice. 2.2.11 exists for a feeling — Design-System §2.4 names
 * gratitude as its register — and copy like that drifting between web and native is worse
 * than a layout drifting, because nothing else would catch it.
 */
object MemoriesMessages {
    const val NOTE_OVERLINE = "A note from Gyasi"

    /** The script-face line above Gyasi's own words. */
    const val NOTE_SCRIPT = "You took the rest. That matters."

    const val PHOTOS_EMPTY_TITLE = "No photos here yet"
    const val PHOTOS_EMPTY_BODY =
        "When you are ready, the pictures from this one can live here alongside " +
            "everything else."
    const val ADD_PHOTOS = "Add your photos"
    const val ADD_PHOTOS_DEFERRED = "Adding photos arrives with the upload screen"

    const val SNAPSHOT_HEADING = "Trip snapshot"

    /**
     * A QUESTION, not "leave a review" and not a star widget. §2.2.11 calls it a testimonial
     * submission; Design-System §2.4's framing for this screen is what somebody carried
     * home, not how many stars the service earned.
     */
    const val REFLECTION_HEADING = "What did you carry home from this trip?"
    const val REFLECTION_BODY =
        "Whatever you write comes to Gyasi first. Nothing is published unless you say so."
    const val REFLECTION_CTA = "Write a reflection"
    const val REFLECTION_EDIT_CTA = "Keep writing"
    const val REFLECTION_PLACEHOLDER = "There is no wrong way to answer this…"
    const val REFLECTION_SAVE = "Save for later"
    const val REFLECTION_SUBMIT = "Send it to Gyasi"
    const val REFLECTION_SAVED = "Saved. Come back to it whenever."
    const val REFLECTION_SUBMITTED_HEADING = "Thank you — this is with Gyasi"
    const val REFLECTION_SUBMITTED_BODY =
        "He will read it himself. If you want to change anything, send him a message and " +
            "he will sort it out."
    const val REFLECTION_FAILED =
        "That did not save. Your words are still here, so try again in a moment."

    /**
     * "Book a similar trip" repointed. §2.3 is Phase 2, so there is no search to seed — and
     * "Gyasi still has your notes" is both true and the thing a traveler would actually want.
     */
    const val AGAIN_HEADING = "Somewhere like this again?"
    const val AGAIN_BODY =
        "Gyasi still has your notes from this one. Tell him roughly when, and he will " +
            "start looking."
    const val AGAIN_CTA = "Message Gyasi"

    const val DOCUMENTS_CTA = "The paperwork from this trip"
    const val ITINERARY_CTA = "The itinerary, as it was"
}

/** "Your photos · 12". Pluralised here so both stacks count the same way. */
fun photosHeading(count: Int): String = "Your photos · $count"

fun nightsLabel(nights: Int): String = if (nights == 1) "1 night" else "$nights nights"

fun travelersLabel(count: Int): String = if (count == 1) "1 traveler" else "$count travelers"
