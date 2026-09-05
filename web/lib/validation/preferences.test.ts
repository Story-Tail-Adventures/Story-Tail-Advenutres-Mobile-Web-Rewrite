import { describe, expect, it } from "vitest";
import {
  PREFERENCES_MESSAGES,
  PREFERENCE_LIMITS,
  TRAVEL_STYLE_OPTIONS,
  parsePreferences,
  type PreferencesInput,
} from "./preferences";

/**
 * Screen 2.1.11's rules.
 *
 * Two of these matter more than the rest. The "Honeymoon" chip must store `romantic`, which
 * is what Data-Model §6.2, the Screen Inventory and the CHECK constraint all call it and
 * what no artboard shows. And the `none` sentinel must never travel with a real answer: on
 * the dietary group that is the difference between a resort kitchen being told there is
 * nothing to worry about and being told about a nut allergy.
 */

const BLANK: PreferencesInput = {
  destinations: [],
  destinationOther: "",
  travelStyles: [],
  dietary: [],
  dietaryNotes: "",
  accessibility: [],
  accessibilityNotes: "",
  loyalty: [],
  budgetBand: "",
  favoritePastTrips: "",
};

function parse(over: Partial<PreferencesInput> = {}) {
  return parsePreferences({ ...BLANK, ...over });
}

function payload(over: Partial<PreferencesInput> = {}) {
  const result = parse(over);
  if (!result.ok) {
    throw new Error(`expected a parse, got ${JSON.stringify(result.fieldErrors)}`);
  }
  return result.payload;
}

function errors(over: Partial<PreferencesInput> = {}) {
  const result = parse(over);
  return result.ok ? {} : result.fieldErrors;
}

describe("parsePreferences", () => {
  it("accepts an entirely untouched form", () => {
    expect(payload()).toEqual({
      destinations: [],
      travelStyles: [],
      dietary: [],
      dietaryNotes: null,
      accessibility: [],
      accessibilityNotes: null,
      loyalty: [],
      budgetBand: null,
      favoritePastTrips: null,
    });
  });

  it("sends every key even when empty, so a cleared group actually clears", () => {
    // The Edge Function reads an absent key as "leave it alone".
    expect(Object.keys(payload()).sort()).toEqual([
      "accessibility",
      "accessibilityNotes",
      "budgetBand",
      "destinations",
      "dietary",
      "dietaryNotes",
      "favoritePastTrips",
      "loyalty",
      "travelStyles",
    ]);
  });
});

describe("travel styles", () => {
  it("stores `romantic` for the chip that reads Honeymoon", () => {
    const honeymoon = TRAVEL_STYLE_OPTIONS.find((o) => o.label === "Honeymoon");
    expect(honeymoon?.value).toBe("romantic");
    expect(payload({ travelStyles: ["romantic"] }).travelStyles).toEqual(["romantic"]);
  });

  it("refuses the prototype's own label as a value", () => {
    // A straight transcription of the artboard would send this, and there is a CHECK
    // constraint waiting for it.
    expect(errors({ travelStyles: ["Honeymoon"] }).travelStyles).toEqual([
      PREFERENCES_MESSAGES.unknownOption,
    ]);
  });

  it("refuses a value nobody could have clicked", () => {
    expect(errors({ travelStyles: ["backpacking"] }).travelStyles).toBeTruthy();
  });
});

describe("the none sentinel", () => {
  it("keeps `none` when it is the only answer — that is not the same as saying nothing", () => {
    expect(payload({ dietary: ["none"] }).dietary).toEqual(["none"]);
  });

  it("refuses no-restrictions beside a real restriction", () => {
    expect(errors({ dietary: ["none", "halal"] }).dietary).toEqual([
      PREFERENCES_MESSAGES.dietaryNoneAlone,
    ]);
  });

  it("refuses the same contradiction on accessibility", () => {
    expect(errors({ accessibility: ["none", "mobility"] }).accessibility).toEqual([
      PREFERENCES_MESSAGES.accessibilityNoneAlone,
    ]);
  });

  it("refuses no-restrictions beside a note, which is the likelier contradiction", () => {
    // The vocabulary has no slug for an allergy, so a real one arrives in the note. Ticking
    // the reassuring chip and then typing the truth underneath is the ordinary way somebody
    // produces a row that tells a resort kitchen two opposite things.
    expect(
      errors({ dietary: ["none"], dietaryNotes: "Severe shellfish allergy" }).dietary,
    ).toEqual([PREFERENCES_MESSAGES.dietaryNoneWithNote]);
  });

  it("refuses the same pairing on accessibility", () => {
    expect(
      errors({ accessibility: ["none"], accessibilityNotes: "CPAP by the bed" })
        .accessibility,
    ).toEqual([PREFERENCES_MESSAGES.accessibilityNoneWithNote]);
  });

  it("allows a note when the sentinel is not ticked", () => {
    expect(errors({ dietary: [], dietaryNotes: "Severe shellfish allergy" })).toEqual({});
  });

  it("leaves an empty group empty, which means the question was never asked", () => {
    expect(payload({ dietary: [] }).dietary).toEqual([]);
  });
});

describe("destinations", () => {
  it("merges the chips with what somebody typed", () => {
    expect(
      payload({ destinations: ["Caribbean"], destinationOther: "Kenya, New Zealand" })
        .destinations,
    ).toEqual(["Caribbean", "Kenya", "New Zealand"]);
  });

  it("does not list a place twice because the casing differs", () => {
    expect(
      payload({ destinations: ["Caribbean"], destinationOther: "caribbean" }).destinations,
    ).toEqual(["Caribbean"]);
  });

  it("refuses more than a dozen", () => {
    const many = Array.from(
      { length: PREFERENCE_LIMITS.destinations + 1 },
      (_, i) => `Place ${i}`,
    );
    expect(errors({ destinations: many }).destinations).toEqual([
      PREFERENCES_MESSAGES.destinationsTooMany,
    ]);
  });

  it("refuses a control character in a typed place name", () => {
    expect(errors({ destinationOther: "Ken\u0007ya" }).destinations).toEqual([
      PREFERENCES_MESSAGES.invalidChars,
    ]);
  });
});

describe("loyalty programs", () => {
  it("drops the repeater's blank rows", () => {
    expect(
      payload({
        loyalty: [
          { program: "AAdvantage", number: "4ZE82Q" },
          { program: "", number: "" },
        ],
      }).loyalty,
    ).toEqual([{ program: "AAdvantage", number: "4ZE82Q" }]);
  });

  it("asks which program a lone number belongs to", () => {
    expect(errors({ loyalty: [{ program: "", number: "4ZE82Q" }] }).loyalty).toEqual([
      PREFERENCES_MESSAGES.loyaltyNeedsProgram,
    ]);
  });

  it("keeps a two-word program name whole", () => {
    // The prototype's single "Marriott Bonvoy 123" text box is exactly what this replaces:
    // splitting on the last space credits the miles to a program called "Marriott".
    expect(
      payload({ loyalty: [{ program: "Marriott Bonvoy", number: "123" }] }).loyalty,
    ).toEqual([{ program: "Marriott Bonvoy", number: "123" }]);
  });

  it("refuses a membership number that is a paste accident", () => {
    expect(
      errors({ loyalty: [{ program: "AAdvantage", number: "4ZE 82Q!" }] }).loyalty,
    ).toEqual([PREFERENCES_MESSAGES.loyaltyNumberShape]);
  });

  it("accepts a program with no number yet", () => {
    expect(payload({ loyalty: [{ program: "IHG Rewards", number: "" }] }).loyalty).toEqual([
      { program: "IHG Rewards", number: "" },
    ]);
  });
});

describe("budget band", () => {
  it("stores the slug, never the dollar label", () => {
    expect(payload({ budgetBand: "premium" }).budgetBand).toBe("premium");
  });

  it("treats 'Not sure yet' — an empty value — as no answer", () => {
    expect(payload({ budgetBand: "" }).budgetBand).toBeNull();
  });

  it("refuses a band outside the documented four", () => {
    expect(errors({ budgetBand: "lavish" }).budgetBand).toEqual([
      PREFERENCES_MESSAGES.budgetUnknown,
    ]);
  });
});

describe("free text", () => {
  it("keeps the notes out of the slug arrays", () => {
    // Their own columns, so a consumer reading dietary_restrictions can still assume a
    // closed vocabulary — see the migration comment in 20260904124903.
    const sent = payload({
      dietary: ["pescatarian"],
      dietaryNotes: " Severe tree nut allergy ",
    });
    expect(sent.dietary).toEqual(["pescatarian"]);
    expect(sent.dietaryNotes).toBe("Severe tree nut allergy");
  });

  it("stores an emptied note as null rather than an empty string", () => {
    expect(payload({ dietaryNotes: "   " }).dietaryNotes).toBeNull();
  });

  it("refuses a note longer than the column expects", () => {
    expect(
      errors({ dietaryNotes: "x".repeat(PREFERENCE_LIMITS.notes + 1) }).dietaryNotes,
    ).toEqual([PREFERENCES_MESSAGES.notesTooLong]);
  });
});
