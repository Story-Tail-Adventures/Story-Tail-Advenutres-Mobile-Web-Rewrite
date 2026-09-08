/**
 * The copy screens 2.2.11 and 2.2.9 share across both stacks.
 *
 * WHY THESE TWO SCREENS GET A SHARED TABLE when 2.2.6's chrome did not: this is the copy that
 * carries the section's voice. 2.2.11 exists for a feeling — Design-System §2.4 names
 * gratitude as its register — and 2.2.9 is reached from a push notification, which is the
 * one place a traveler meets our words without asking for them. Copy like that drifting
 * between web and native is worse than a layout drifting, and nothing else would catch it.
 *
 * The Kotlin twins are `domain/trip/TripMemories.kt` and `domain/trip/TripStatusChange.kt`,
 * compared by `.github/scripts/check_copy_parity.py`. Flat objects of plain strings, because
 * the checker reads only top-level string keys.
 *
 * Per-screen chrome — page titles, back-link labels, counts that need a number — stays in
 * each screen's own `content.ts`, where the web twin can phrase it for a browser.
 */

export const MEMORIES_MESSAGES = {
  noteOverline: "A note from Gyasi",
  /** The script-face line above Gyasi's own words. */
  noteScript: "You took the rest. That matters.",

  photosEmptyTitle: "No photos here yet",
  photosEmptyBody:
    "When you are ready, the pictures from this one can live here alongside everything else.",
  addPhotos: "Add your photos",
  addPhotosDeferred: "Adding photos arrives with the upload screen",

  snapshotHeading: "Trip snapshot",

  /**
   * A QUESTION, not "leave a review" and not a star widget. §2.2.11 calls it a testimonial
   * submission; Design-System §2.4's framing for this screen is what somebody carried home,
   * not how many stars the service earned.
   */
  reflectionHeading: "What did you carry home from this trip?",
  reflectionBody:
    "Whatever you write comes to Gyasi first. Nothing is published unless you say so.",
  reflectionCta: "Write a reflection",
  reflectionEditCta: "Keep writing",
  reflectionPlaceholder: "There is no wrong way to answer this…",
  reflectionSave: "Save for later",
  reflectionSubmit: "Send it to Gyasi",
  reflectionSaved: "Saved. Come back to it whenever.",
  reflectionSubmittedHeading: "Thank you — this is with Gyasi",
  reflectionSubmittedBody:
    "He will read it himself. If you want to change anything, send him a message and he will sort it out.",
  reflectionFailed: "That did not save. Your words are still here, so try again in a moment.",

  /**
   * "Book a similar trip" repointed. §2.3 is Phase 2, so there is no search to seed — and
   * "Gyasi still has your notes" is both true and the thing a traveler would actually want.
   */
  againHeading: "Somewhere like this again?",
  againBody:
    "Gyasi still has your notes from this one. Tell him roughly when, and he will start looking.",
  againCta: "Message Gyasi",

  documentsCta: "The paperwork from this trip",
  itineraryCta: "The itinerary, as it was",
} as const;
