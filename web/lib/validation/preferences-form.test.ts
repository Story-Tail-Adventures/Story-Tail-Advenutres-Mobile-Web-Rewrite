import { describe, expect, it } from "vitest";

import { readLoyalty, readPreferencesForm } from "./preferences-form";

/**
 * These two readers are shared by Screen 2.1.11 (the wizard) and Screen 2.5.3 (the account
 * screen). Both were private to the wizard until §2.5 needed them, and both were briefly
 * hand-copied instead — losing, in each case, the one edge the original was written for.
 * That is what these tests pin.
 */

describe("readLoyalty", () => {
  it("keeps a program whose member number is null", () => {
    // THE REGRESSION. `onboarding-preferences` persists
    // `number: optionalText(row, "number") ?? null`, and optionalText maps "" to null — so
    // this is exactly what "typed a program, left the number blank" is stored as. A reader
    // that demands two strings drops the row, and because the function replaces
    // `loyalty_programs` wholesale, the next save deletes the program from the record.
    expect(readLoyalty([{ program: "AAdvantage", number: null, tier: null }])).toEqual([
      { program: "AAdvantage", number: "" },
    ]);
  });

  it("keeps a number whose program is missing, rather than silently dropping it", () => {
    expect(readLoyalty([{ number: "92214" }])).toEqual([{ program: "", number: "92214" }]);
  });

  it("drops a row only when both halves are empty", () => {
    expect(readLoyalty([{ program: "", number: "" }])).toEqual([]);
    expect(readLoyalty([{ program: null, number: null }])).toEqual([]);
  });

  it("coerces a non-string rather than discarding the row around it", () => {
    // The column has no CHECK, so it eventually holds something else. Losing the number is
    // recoverable; losing the program silently is not.
    expect(readLoyalty([{ program: "IHG Rewards", number: 92214 }])).toEqual([
      { program: "IHG Rewards", number: "" },
    ]);
  });

  it("ignores anything that is not an array of objects", () => {
    expect(readLoyalty(null)).toEqual([]);
    expect(readLoyalty("AAdvantage")).toEqual([]);
    expect(readLoyalty([null, "x", 1, ["nested"]])).toEqual([]);
  });
});

describe("readPreferencesForm", () => {
  it("pairs loyalty rows by index across the two field names", () => {
    const fd = new FormData();
    fd.append("loyaltyProgram", "AAdvantage");
    fd.append("loyaltyNumber", "4ZE82Q");
    fd.append("loyaltyProgram", "IHG Rewards");
    fd.append("loyaltyNumber", "92214");

    expect(readPreferencesForm(fd).loyalty).toEqual([
      { program: "AAdvantage", number: "4ZE82Q" },
      { program: "IHG Rewards", number: "92214" },
    ]);
  });

  it("uses the LONGER of programs and numbers, so a mismatched post is not silently trimmed", () => {
    // A hand-built post with one more number than program should fail with "which program is
    // that number for?", not lose the number.
    const fd = new FormData();
    fd.append("loyaltyProgram", "AAdvantage");
    fd.append("loyaltyNumber", "4ZE82Q");
    fd.append("loyaltyNumber", "orphaned");

    expect(readPreferencesForm(fd).loyalty).toEqual([
      { program: "AAdvantage", number: "4ZE82Q" },
      { program: "", number: "orphaned" },
    ]);
  });

  it("treats a File as absent rather than stringifying it into the field", () => {
    const fd = new FormData();
    fd.append("dietaryNotes", new File(["x"], "notes.txt", { type: "text/plain" }));

    // Without the guard this is the string "[object File]" in the traveler's dietary notes.
    expect(readPreferencesForm(fd).dietaryNotes).toBe("");
  });
});
