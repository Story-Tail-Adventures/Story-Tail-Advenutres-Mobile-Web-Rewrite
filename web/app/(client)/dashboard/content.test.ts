import { describe, expect, it } from "vitest";
import { DASHBOARD, isLeisure } from "./content";

describe("the leisure conditional", () => {
  it("treats a cruise and an all-inclusive as leisure", () => {
    // Design-System §2.4 wants the rest framing only where the trip is clearly a holiday.
    // There is no `is_leisure` field, so it derives from trip_type — see content.ts.
    expect(isLeisure("cruise")).toBe(true);
    expect(isLeisure("all_inclusive")).toBe(true);
  });

  it("does NOT assume rest for the trip types a wedding or reunion would use", () => {
    // The trip might be a funeral. "You can finally breathe out" would be badly wrong.
    expect(isLeisure("group")).toBe(false);
    expect(isLeisure("multi_destination")).toBe(false);
    expect(isLeisure("custom")).toBe(false);
  });

  it("does not assume rest for a trip type it has never heard of", () => {
    expect(isLeisure("bereavement")).toBe(false);
    expect(isLeisure("")).toBe(false);
  });
});

describe("the hero greeting", () => {
  it("does not say '0 days' or '1 days'", () => {
    expect(DASHBOARD.greetingRest("Jordan", 0)).toBe("Today’s the day, Jordan.");
    expect(DASHBOARD.greetingRest("Jordan", 1)).toBe("One more day, Jordan.");
    expect(DASHBOARD.greetingNeutral("Jordan", 0)).toBe("Today’s the day, Jordan.");
    expect(DASHBOARD.greetingNeutral("Jordan", 1)).toBe("One more day, Jordan.");
  });

  it("uses the rest framing only in the leisure variant", () => {
    expect(DASHBOARD.greetingRest("Jordan", 67)).toContain("breathe out");
    expect(DASHBOARD.greetingNeutral("Jordan", 67)).not.toContain("breathe out");
    expect(DASHBOARD.greetingNeutral("Jordan", 67)).toBe("Hey Jordan — 67 days to go.");
  });

  it("uses typographic apostrophes, not straight quotes", () => {
    const all = [
      DASHBOARD.greetingTraveling("Jordan"),
      DASHBOARD.greetingRest("Jordan", 0),
      DASHBOARD.subtitleNoTrip,
      DASHBOARD.emptyPastBody,
    ];
    for (const s of all) expect(s).not.toMatch(/'/);
  });
});

describe("the advisor reply time", () => {
  it("is the one string already shipped in onboarding, not the artboard's", () => {
    // Three competed: "< 2h" (artboard + proof.ts), "within 48 hours" (proof.ts) and
    // "the same day" (onboarding/complete/state.ts, already live). The shipped one wins.
    expect(DASHBOARD.advisorReplyTime).toBe("Usually replies the same day");
    expect(DASHBOARD.advisorReplyTime).not.toContain("2h");
    expect(DASHBOARD.advisorReplyTime).not.toContain("48");
  });
});
