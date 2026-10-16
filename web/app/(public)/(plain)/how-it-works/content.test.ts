import { describe, expect, it } from "vitest";
import { HOW_IT_WORKS } from "./content";

describe("how-it-works copy", () => {
  it("says the money goes to suppliers, not billing language", () => {
    // Was the card-limit sentence until 2026-10-16, when §3.6 ruled the app holds no card.
    expect(HOW_IT_WORKS.heart.intro).toContain("your money goes straight to the people hosting you, never through us");
    expect(HOW_IT_WORKS.heart.intro).not.toMatch(/invoice/i);
  });

  it("keeps the desktop three-step structure and the two pillars with their verses", () => {
    expect(HOW_IT_WORKS.title).toBe("You ask. We plan together. You go and rest.");
    expect(HOW_IT_WORKS.steps.map((s) => s.overline)).toEqual(["STEP 01", "STEP 02", "STEP 03"]);
    expect(HOW_IT_WORKS.steps.map((s) => s.title)).toEqual(["Ask", "Plan together", "Go rest"]);
    expect(HOW_IT_WORKS.heart.pillars.map((p) => p.scripture.reference)).toEqual(["MATT 11:28", "GEN 1:31"]);
    expect(HOW_IT_WORKS.heart.title.filter((p) => typeof p !== "string").map((p) => p.em)).toEqual([
      "rest",
      "good",
    ]);
  });

  it("replaces the mobile sticky 'Skip' with 'Sign in'", () => {
    expect(HOW_IT_WORKS.sticky.secondary).toBe("Sign in");
  });

  it("includes the Design-System §2.4 welcome line", () => {
    expect(HOW_IT_WORKS.heart.welcome.strong).toBe("Whatever your faith — you're welcome here.");
  });
});
