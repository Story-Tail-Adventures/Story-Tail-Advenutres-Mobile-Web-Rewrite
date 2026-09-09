import { describe, expect, it } from "vitest";
import {
  COMPANION_FIELDS,
  COMPANION_LIMITS,
  COMPANION_MESSAGES,
  companionSchema,
  expiresWithinSixMonths,
} from "./companion";
import { flattenIssues } from "./flatten";

/**
 * Screen 2.1.12's rules for one traveler.
 *
 * The form is short, and the two things worth pinning are the two that are easy to get
 * wrong for somebody who is not at the keyboard: both names are required because suppliers
 * need them separately for ticketing, and there is deliberately no minimum age — a
 * household's children have records too.
 */

const BLANK = {
  firstName: "",
  lastName: "",
  relationship: "",
  dateOfBirth: "",
  passportExpiry: "",
  passportCountry: "",
};

const VALID = { ...BLANK, firstName: "Sam", lastName: "Hayes" };

function errors(over: Partial<typeof BLANK> = {}) {
  const result = companionSchema.safeParse({ ...VALID, ...over });
  return result.success ? {} : flattenIssues(result.error, COMPANION_FIELDS);
}

function parsed(over: Partial<typeof BLANK> = {}) {
  const result = companionSchema.safeParse({ ...VALID, ...over });
  if (!result.success) throw new Error("expected a parse");
  return result.data;
}

describe("companionSchema", () => {
  it("accepts a traveler with nothing but a name", () => {
    expect(parsed()).toEqual({
      firstName: "Sam",
      lastName: "Hayes",
      relationship: null,
      dateOfBirth: null,
      passportExpiry: null,
      passportCountry: null,
    });
  });

  it("needs both halves of the name", () => {
    expect(errors({ firstName: "" }).firstName).toEqual([
      COMPANION_MESSAGES.firstNameRequired,
    ]);
    expect(errors({ lastName: "" }).lastName).toEqual([COMPANION_MESSAGES.lastNameRequired]);
  });

  it("refuses a name that is only whitespace, rather than letting the column do it", () => {
    // Both columns are NOT NULL, and a constraint violation reaches the browser as a 500
    // with nothing anybody can act on.
    expect(errors({ lastName: "   " }).lastName).toEqual([
      COMPANION_MESSAGES.lastNameRequired,
    ]);
  });

  it("refuses a name longer than the column", () => {
    expect(errors({ firstName: "x".repeat(COMPANION_LIMITS.name + 1) }).firstName).toEqual([
      COMPANION_MESSAGES.nameTooLong,
    ]);
  });

  it("has no minimum age — a household's children have records too", () => {
    expect(errors({ dateOfBirth: "2019-06-12" })).toEqual({});
  });

  it("refuses a birthday in the future", () => {
    expect(errors({ dateOfBirth: "2999-01-01" }).dateOfBirth).toEqual([
      COMPANION_MESSAGES.dobInvalid,
    ]);
  });

  it("accepts an expired passport — it is the record that triggers the renewal", () => {
    expect(errors({ passportExpiry: "2019-08-14" })).toEqual({});
  });

  it("stores a two-letter country code, uppercased", () => {
    // With an expiry, because a country on its own is refused by the group rule below.
    expect(
      parsed({ passportCountry: "us", passportExpiry: "2031-02-28" }).passportCountry,
    ).toBe("US");
  });

  it("refuses the prototype's three-letter 'USA'", () => {
    expect(errors({ passportCountry: "USA" }).passportCountry).toEqual([
      COMPANION_MESSAGES.countryInvalid,
    ]);
  });

  it("refuses a country of issue with no expiry", () => {
    // The card's meta line keys off the expiry, so a country-only row would render as
    // "No passport details yet" while quietly holding one.
    expect(errors({ passportCountry: "US" }).passportExpiry).toEqual([
      COMPANION_MESSAGES.passportNeedsExpiry,
    ]);
  });

  it("accepts an expiry with no country of issue", () => {
    expect(errors({ passportExpiry: "2031-02-28" })).toEqual({});
  });

  it("leaves relationship free text rather than an enum", () => {
    // Data-Model §6.3 calls it free text, and "Mother-in-law" is a real answer.
    expect(parsed({ relationship: "Mother-in-law" }).relationship).toBe("Mother-in-law");
  });
});

describe("expiresWithinSixMonths", () => {
  const now = new Date("2026-09-04T00:00:00Z");

  it("warns about a passport that runs out inside the window", () => {
    // Six months is the validity most countries want on entry, so a passport good for five
    // is a problem the traveler does not know they have.
    expect(expiresWithinSixMonths("2026-11-30", now)).toBe(true);
  });

  it("says nothing about one with years left", () => {
    expect(expiresWithinSixMonths("2031-02-28", now)).toBe(false);
  });

  it("warns about one that has already expired", () => {
    expect(expiresWithinSixMonths("2020-01-01", now)).toBe(true);
  });

  it("says nothing when there is no expiry to judge", () => {
    expect(expiresWithinSixMonths("", now)).toBe(false);
  });
});
