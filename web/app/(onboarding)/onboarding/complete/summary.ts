import {
  COMPLETE_TEXT,
  type ChecklistLine,
  type CompletionSummary,
} from "./state";

/**
 * Turning what is on file into what the screen says.
 *
 * Pure, and separated from the page for the reason `onboardingRedirectFor` was: this is the
 * logic that decides whether a traveler is congratulated for finishing something they
 * skipped, and it should be assertable without a Supabase client.
 */

/**
 * The sentence under the heading, assembled from what was actually saved.
 *
 * A LINKED TRIP COUNTS IN EVERY BRANCH, not only when all three wizard steps are complete —
 * and that is not a corner case. An existing client being moved onto the portal arrives with
 * a trip already attached, by the email match at confirmation or by the code on the step
 * before this one, and neither depends on their having filled in a single form. Skipping all
 * three and still having a trip is the ORDINARY shape for exactly the travelers Gyasi has
 * been working with longest. Telling them "nothing to save yet" three lines above a
 * checklist that reads "your trip with Gyasi, linked" is the contradiction this whole screen
 * exists to avoid.
 */
export function completionSubtitle(summary: CompletionSummary): string {
  const all =
    summary.hasProfile && summary.hasPreferences && summary.hasCompanions;

  if (all) {
    return summary.trip
      ? COMPLETE_TEXT.subWithTrip(summary.trip.title)
      : COMPLETE_TEXT.subNoTrip;
  }

  const saved: string[] = [
    summary.hasProfile ? COMPLETE_TEXT.shortProfile : null,
    summary.hasPreferences ? COMPLETE_TEXT.shortPreferences : null,
    summary.hasCompanions ? COMPLETE_TEXT.shortCompanions : null,
  ].filter((part) => part !== null);

  // Nothing typed at all is a real outcome — every step of this wizard is skippable, and
  // somebody who skipped all of them must not be told their details are saved.
  if (saved.length === 0) {
    return summary.trip
      ? COMPLETE_TEXT.subOnlyTrip(summary.trip.title)
      : COMPLETE_TEXT.subNothing;
  }

  return summary.trip
    ? COMPLETE_TEXT.subPartialWithTrip(listOf(saved), summary.trip.title)
    : COMPLETE_TEXT.subPartial(listOf(saved));
}

/** "A", "A and B", "A, B and C" — an Oxford-comma-free list, which is how Gyasi writes. */
function listOf(parts: readonly string[]): string {
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/**
 * The checklist, which names what was skipped rather than quietly omitting it.
 *
 * A list showing only what succeeded reads as a complete list, and somebody who skipped
 * preferences would never learn the option is still open.
 */
export function completionChecklist(
  summary: CompletionSummary,
): ChecklistLine[] {
  return [
    {
      icon: "user",
      label: summary.hasProfile
        ? COMPLETE_TEXT.profileDone
        : COMPLETE_TEXT.profileSkipped,
      done: summary.hasProfile,
    },
    {
      icon: "heart",
      label: summary.hasPreferences
        ? COMPLETE_TEXT.preferencesDone
        : COMPLETE_TEXT.preferencesSkipped,
      done: summary.hasPreferences,
    },
    {
      icon: "users",
      label: summary.hasCompanions
        ? COMPLETE_TEXT.companionsDone
        : COMPLETE_TEXT.companionsSkipped,
      done: summary.hasCompanions,
    },
    {
      icon: "plane",
      label: summary.trip ? COMPLETE_TEXT.tripDone : COMPLETE_TEXT.tripNone,
      done: summary.trip !== null,
    },
  ];
}
