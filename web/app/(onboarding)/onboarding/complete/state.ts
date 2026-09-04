import type { IconName } from "@/components/ui/Icon";

/**
 * Screen 2.1.14 Onboarding Complete — copy and the shape of what it reports.
 *
 * Copy follows design/source-prototype/screens/client-auth.jsx (`C2114_OnboardingComplete`)
 * and client-auth-mobile.jsx (`M2114_OnboardingComplete`), with one structural departure.
 *
 * THE PROTOTYPE'S SUBTITLE IS A FIXED SENTENCE: "Your profile, preferences, household, and
 * existing trip with Sandals are all linked up." It is true of the artboard and of nobody
 * else. Every step of this wizard is skippable, so the traveler most likely to reach this
 * screen having skipped things is exactly the one told they finished everything. What the
 * screen says is assembled from what is actually on file.
 */

/** What the wizard actually collected, read back from the rows rather than assumed. */
export interface CompletionSummary {
  firstName: string | null;
  hasProfile: boolean;
  hasPreferences: boolean;
  hasCompanions: boolean;
  trip: { title: string; startDate: string } | null;
}

export interface CompleteState {
  error?: string;
}

export const initialCompleteState: CompleteState = {};

export interface ChecklistLine {
  icon: IconName;
  label: string;
  done: boolean;
}

export const COMPLETE_TEXT = {
  metaTitle: "You're all set",
  metaDescription: "Your Story-Tail portal is ready.",
  overline: "YOU'RE ALL SET",
  title: (firstName: string) => `That's everything, ${firstName}.`,
  titleNoName: "That's everything.",

  subWithTrip: (tripTitle: string) =>
    `I've saved your profile, how you like to travel, and who travels with you — and your ` +
    `${tripTitle} trip is linked and waiting.`,
  subNoTrip:
    "I've saved your profile, how you like to travel, and who travels with you. When a " +
    "trip starts taking shape, it'll show up right here.",
  subPartial: (savedList: string) =>
    `I've saved ${savedList}. The rest can wait — nothing here expires, and you can add it ` +
    `any time.`,
  subPartialWithTrip: (savedList: string, tripTitle: string) =>
    `I've saved ${savedList}, and your ${tripTitle} trip is linked and waiting. The rest ` +
    `can wait too — nothing here expires.`,
  /** Nothing typed, but a trip already on file: an existing client arriving on the portal. */
  subOnlyTrip: (tripTitle: string) =>
    `Your ${tripTitle} trip is linked and waiting. Everything else can wait — nothing here ` +
    `expires, and you can add it any time.`,
  subNothing:
    "Nothing to save yet, and that's completely fine — I can plan around a conversation. " +
    "Add any of it whenever you like.",

  checklistHeading: "What we set up",
  profileDone: "Your details",
  profileSkipped: "Your details — skipped, add it any time",
  preferencesDone: "How you like to travel",
  preferencesSkipped: "How you like to travel — skipped, add it any time",
  companionsDone: "Who travels with you",
  companionsSkipped: "Who travels with you — skipped, add it any time",
  tripDone: "Your trip with Gyasi, linked",
  tripNone: "No trip linked yet",

  /** Short forms for assembling `subPartial`. Lowercase: they land mid-sentence. */
  shortProfile: "your details",
  shortPreferences: "how you like to travel",
  shortCompanions: "who travels with you",

  cardTripTitle: "View your upcoming trip",
  cardTripEmptyTitle: "Nothing on the calendar yet",
  cardTripEmptySub: "Tell Gyasi where you'd like to go.",
  cardExploreTitle: "See where people are going",
  cardExploreSub: (count: number) => `${count} trips Gyasi plans often`,
  cardMessageTitle: "Message Gyasi",
  cardMessageSub: "He usually replies the same day",

  primaryCta: "Continue to my trips",
  pending: "Opening your dashboard…",
  // Screen-Inventory §2.1.14's "fine-tune notifications before going to dashboard" is
  // deferred and the doc records why: `notification_preference` has RLS with no policy, no
  // path creates a row for a user, and Screen 2.5.6 that would manage it is unbuilt. A
  // second CTA pointing at none of that would be a button that does nothing.
  error:
    "We couldn't finish that just now — but everything you entered is saved. Try again, or " +
    "head straight to your dashboard.",
  errorEscape: "Go to my dashboard",
} as const;
