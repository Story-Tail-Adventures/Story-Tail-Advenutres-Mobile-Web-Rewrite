import { describe, expect, it } from "vitest";
import {
  WIZARD_STEPS,
  WIZARD_TOTAL,
  previousRoute,
  stepOverline,
  wizardStepIndex,
} from "./steps";

/**
 * The wizard's shape.
 *
 * `wizardStepIndex` exists because the number it returns used to be a constant exported
 * from each screen's own `"use client"` form component — where a server component importing
 * it received a client reference instead of a number, the shell indexed past the end of
 * WIZARD_STEPS, and the step 500'd. Deriving it from the slug is what makes that
 * unrepresentable; these assertions are what keep the list it derives from honest.
 */

describe("WIZARD_STEPS", () => {
  it("starts at the cover page, which has no cursor value", () => {
    // `slug: null` is the same null platform_user.onboarding_step holds before anybody
    // begins — reaching 2.1.9 Welcome is the absence of progress, not a step of it.
    expect(WIZARD_STEPS[0].slug).toBeNull();
    expect(WIZARD_STEPS[0].route).toBe("/welcome");
  });

  it("has exactly one route and one label per step", () => {
    expect(new Set(WIZARD_STEPS.map((s) => s.route)).size).toBe(WIZARD_TOTAL);
    expect(WIZARD_STEPS.every((s) => s.railLabel !== "" && s.pillLabel !== "")).toBe(true);
  });

  it("gives every step after the first a cursor value the database accepts", () => {
    // Must match ONBOARDING_STEPS in supabase/functions/_shared/onboarding.ts and the CHECK
    // in 20260903230000_onboarding_step.sql.
    expect(WIZARD_STEPS.slice(1).map((s) => s.slug)).toEqual([
      "profile",
      "preferences",
      "companions",
      "connect",
      "complete",
    ]);
  });
});

describe("wizardStepIndex", () => {
  it.each([
    ["profile", 1],
    ["preferences", 2],
    ["companions", 3],
    ["connect", 4],
    ["complete", 5],
  ])("puts %s at %i", (slug, index) => {
    expect(wizardStepIndex(slug)).toBe(index);
  });

  it("throws on a slug the wizard does not have, rather than returning -1", () => {
    // -1 would index past the start of the list and render an undefined step, which is the
    // exact failure this function was written to make impossible.
    expect(() => wizardStepIndex("nowhere")).toThrow(/Unknown onboarding step/);
  });
});

describe("previousRoute", () => {
  it("has nowhere to go from the cover page", () => {
    expect(previousRoute(0)).toBeUndefined();
  });

  it("goes one step back from anywhere else", () => {
    expect(previousRoute(wizardStepIndex("preferences"))).toBe("/onboarding/profile");
    expect(previousRoute(wizardStepIndex("profile"))).toBe("/welcome");
  });
});

describe("stepOverline", () => {
  it("counts from one and pads, the way both artboards do", () => {
    expect(stepOverline(0)).toBe("STEP 01 OF 06");
    expect(stepOverline(5)).toBe("STEP 06 OF 06");
  });
});
