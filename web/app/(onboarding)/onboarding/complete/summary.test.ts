import { describe, expect, it } from "vitest";
import { COMPLETE_TEXT, type CompletionSummary } from "./state";
import { completionChecklist, completionSubtitle } from "./summary";

/**
 * What the last screen of the wizard tells somebody they did.
 *
 * The whole reason this is a function rather than a fixed sentence: every step here is
 * skippable, so the traveler most likely to reach this screen having skipped things is
 * exactly the one a hard-coded "your profile, preferences and household are all saved"
 * would lie to. These assertions are the guard on that.
 */

function summary(over: Partial<CompletionSummary> = {}): CompletionSummary {
  return {
    firstName: "Jordan",
    hasProfile: false,
    hasPreferences: false,
    hasCompanions: false,
    trip: null,
    ...over,
  };
}

const ALL = { hasProfile: true, hasPreferences: true, hasCompanions: true };

describe("completionSubtitle", () => {
  it("celebrates everything only when everything is actually there", () => {
    expect(completionSubtitle(summary(ALL))).toBe(COMPLETE_TEXT.subNoTrip);
  });

  it("names the trip when one is linked", () => {
    expect(
      completionSubtitle(summary({ ...ALL, trip: { title: "Negril", startDate: "2026-11-10" } })),
    ).toBe(COMPLETE_TEXT.subWithTrip("Negril"));
  });

  it("lists only what was saved when steps were skipped", () => {
    expect(completionSubtitle(summary({ hasProfile: true, hasCompanions: true }))).toBe(
      COMPLETE_TEXT.subPartial("your details and who travels with you"),
    );
  });

  it("joins three the way a person would", () => {
    // Reaching this branch needs a trip-less partial; two saved reads as "A and B".
    expect(completionSubtitle(summary({ hasProfile: true, hasPreferences: true }))).toBe(
      COMPLETE_TEXT.subPartial("your details and how you like to travel"),
    );
  });

  it("says nothing was saved when nothing was, rather than congratulating them", () => {
    expect(completionSubtitle(summary())).toBe(COMPLETE_TEXT.subNothing);
  });

  it("does not claim a trip is linked just because the profile is complete", () => {
    const text = completionSubtitle(summary(ALL));
    expect(text).not.toContain("linked and waiting");
  });

  it("names the trip even when every step was skipped", () => {
    // The ordinary shape for a client Gyasi has had for years: the trip arrived by the
    // email match or by an invite code, and neither needs a form filled in. Saying
    // "nothing to save yet" here would contradict the checklist three lines below it.
    expect(completionSubtitle(summary({ trip: { title: "Negril", startDate: "" } }))).toBe(
      COMPLETE_TEXT.subOnlyTrip("Negril"),
    );
  });

  it("names the trip alongside a partial list", () => {
    expect(
      completionSubtitle(
        summary({ hasProfile: true, trip: { title: "Negril", startDate: "" } }),
      ),
    ).toBe(COMPLETE_TEXT.subPartialWithTrip("your details", "Negril"));
  });

  it("never says nothing was saved while a trip is on file", () => {
    // The guard on the whole class of bug, whatever the branch structure becomes.
    for (const over of [{}, { hasProfile: true }, { hasProfile: true, hasCompanions: true }]) {
      const text = completionSubtitle(
        summary({ ...over, trip: { title: "Negril", startDate: "" } }),
      );
      expect(text).toContain("Negril");
    }
  });
});

describe("completionChecklist", () => {
  it("lists all four steps whatever happened, so a skip is visible", () => {
    // Omitting the skipped ones would make the list read as complete, and somebody who
    // skipped preferences would never learn the option is still open.
    expect(completionChecklist(summary())).toHaveLength(4);
  });

  it("says 'skipped' in words, not only in an icon", () => {
    const skipped = completionChecklist(summary()).filter((line) => !line.done);
    expect(skipped).toHaveLength(4);
    for (const line of skipped.slice(0, 3)) {
      expect(line.label).toContain("skipped");
    }
  });

  it("marks what was done", () => {
    const lines = completionChecklist(
      summary({ ...ALL, trip: { title: "Negril", startDate: "" } }),
    );
    expect(lines.every((line) => line.done)).toBe(true);
    expect(lines.map((line) => line.label)).toEqual([
      COMPLETE_TEXT.profileDone,
      COMPLETE_TEXT.preferencesDone,
      COMPLETE_TEXT.companionsDone,
      COMPLETE_TEXT.tripDone,
    ]);
  });

  it("says there is no trip rather than leaving the line off", () => {
    const trip = completionChecklist(summary(ALL)).at(-1);
    expect(trip?.label).toBe(COMPLETE_TEXT.tripNone);
    expect(trip?.done).toBe(false);
  });
});
