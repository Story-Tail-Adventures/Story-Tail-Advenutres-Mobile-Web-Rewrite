/**
 * Screen 2.2.11 copy.
 *
 * This is the one §2.2 screen whose job is a FEELING rather than a task, and Design-System
 * §2.4 names its register as gratitude. So the copy here is warmer than anywhere else in the
 * section, and two things the artboards asked for are deliberately not said:
 *
 *   - "Book a similar trip" / "start a new search seeded with the past trip details" is
 *     §2.3, which is Phase 2. The CTA repoints at the thread instead — that is the plan's
 *     "repoint at what exists" decision, and it is the honest version: Gyasi genuinely does
 *     still have the notes.
 *   - The desktop artboard's "Gyasi has 3 options for fall" is a claim nothing backs. Gone.
 *
 * Most of the strings live in `web/lib/trips/memories.ts` instead, because native renders
 * them too and CI compares the two tables. What is here is what needs a number or a browser:
 * the back-link, the counts, the page's own headings.
 */
import { MEMORIES_MESSAGES } from "@/lib/trips/memories";

export const MEMORIES = {
  back: "Back to my trips",

  noteOverline: MEMORIES_MESSAGES.noteOverline,
  noteFallbackScript: MEMORIES_MESSAGES.noteScript,

  photosHeading: (count: number) =>
    count === 1 ? "Your photos · 1" : `Your photos · ${count}`,
  photosEmptyTitle: MEMORIES_MESSAGES.photosEmptyTitle,
  photosEmptyBody: MEMORIES_MESSAGES.photosEmptyBody,
  addPhotos: MEMORIES_MESSAGES.addPhotos,
  addPhotosDeferred: MEMORIES_MESSAGES.addPhotosDeferred,

  snapshotHeading: MEMORIES_MESSAGES.snapshotHeading,
  snapshotNights: (nights: number) => (nights === 1 ? "1 night" : `${nights} nights`),
  snapshotTravelers: (count: number) => (count === 1 ? "1 traveler" : `${count} travelers`),
  snapshotAllIn: (money: string) => `${money} all-in`,

  reflectionHeading: MEMORIES_MESSAGES.reflectionHeading,
  reflectionBody: MEMORIES_MESSAGES.reflectionBody,
  reflectionCta: MEMORIES_MESSAGES.reflectionCta,
  reflectionEditCta: MEMORIES_MESSAGES.reflectionEditCta,
  reflectionPlaceholder: MEMORIES_MESSAGES.reflectionPlaceholder,
  reflectionSave: MEMORIES_MESSAGES.reflectionSave,
  reflectionSubmit: MEMORIES_MESSAGES.reflectionSubmit,
  reflectionSaved: MEMORIES_MESSAGES.reflectionSaved,
  reflectionSubmittedHeading: MEMORIES_MESSAGES.reflectionSubmittedHeading,
  reflectionSubmittedBody: MEMORIES_MESSAGES.reflectionSubmittedBody,
  reflectionFailed: MEMORIES_MESSAGES.reflectionFailed,

  againHeading: MEMORIES_MESSAGES.againHeading,
  againBody: MEMORIES_MESSAGES.againBody,
  againCta: MEMORIES_MESSAGES.againCta,

  documentsCta: MEMORIES_MESSAGES.documentsCta,
  itineraryCta: MEMORIES_MESSAGES.itineraryCta,
} as const;
