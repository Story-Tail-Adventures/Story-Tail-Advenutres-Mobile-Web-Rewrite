import { describe, expect, it } from "vitest";

import { INITIALS_FALLBACK, initialsFor } from "./initials";

describe("initialsFor", () => {
  it("takes the first letter of each name", () => {
    expect(initialsFor("Jordan", "Hale")).toBe("JH");
  });

  it("uppercases", () => {
    expect(initialsFor("jordan", "hale")).toBe("JH");
  });

  it("trims before taking the letter", () => {
    expect(initialsFor("  Jordan ", "  Hale")).toBe("JH");
  });

  it("returns one letter when only one name is present", () => {
    expect(initialsFor("Jordan", null)).toBe("J");
    expect(initialsFor(undefined, "Hale")).toBe("H");
  });

  it("returns nothing when neither name is present", () => {
    expect(initialsFor(null, undefined)).toBe("");
    expect(initialsFor("", "   ")).toBe("");
  });

  // handle_new_user() writes these when there is no usable name on the identity. They are
  // placeholders, so "New Traveler" must yield nothing and let the caller fall back.
  it("ignores the provisioning placeholders", () => {
    expect(initialsFor("New", "Traveler")).toBe("");
  });

  it("filters the placeholders per field, not as a pair", () => {
    expect(initialsFor("Jordan", "Traveler")).toBe("J");
    expect(initialsFor("New", "Hale")).toBe("H");
  });

  // Only the exact placeholder is filtered — these are somebody's actual name.
  it("keeps real names that merely resemble a placeholder", () => {
    expect(initialsFor("Newton", "Travers")).toBe("NT");
  });
});

describe("INITIALS_FALLBACK", () => {
  it("is the brand monogram", () => {
    expect(INITIALS_FALLBACK).toBe("ST");
  });
});
