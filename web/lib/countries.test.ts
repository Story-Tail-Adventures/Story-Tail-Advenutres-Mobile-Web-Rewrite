import { describe, expect, it } from "vitest";
import { COUNTRIES, DEFAULT_COUNTRY, isCountryCode, usesUsAddressLabels } from "./countries";

/**
 * The frozen country table.
 *
 * The reason it is frozen is in the module comment: reading names from `Intl.DisplayNames`
 * at render time broke hydration, because Node's ICU and the browser's disagree about
 * several of them. These assertions guard the properties the columns depend on — a
 * `char(2)` will take the first two characters of anything longer without complaint.
 */

describe("COUNTRIES", () => {
  it("has every code exactly once", () => {
    expect(new Set(COUNTRIES.map((c) => c.code)).size).toBe(COUNTRIES.length);
  });

  it("is all two-letter uppercase codes, because the column is char(2)", () => {
    const wrong = COUNTRIES.filter((c) => !/^[A-Z]{2}$/.test(c.code));
    expect(wrong).toEqual([]);
  });

  it("names every one of them", () => {
    expect(COUNTRIES.filter((c) => c.name.trim() === "")).toEqual([]);
  });

  it("includes the Caribbean destinations the practice actually sells", () => {
    const codes = new Set(COUNTRIES.map((c) => c.code));
    for (const code of ["JM", "BS", "TC", "LC", "AG", "BB", "DO", "AW"]) {
      expect(codes.has(code)).toBe(true);
    }
  });

  it("offers the default the forms start on", () => {
    expect(COUNTRIES.some((c) => c.code === DEFAULT_COUNTRY)).toBe(true);
  });
});

describe("isCountryCode", () => {
  it("accepts an assigned code", () => {
    expect(isCountryCode("US")).toBe(true);
  });

  it("refuses the prototype's three-letter 'USA'", () => {
    expect(isCountryCode("USA")).toBe(false);
  });

  it("is case-sensitive, so callers have to uppercase first", () => {
    // The schema does. Accepting 'us' here would let a lowercase value reach a column that
    // every other read expects to be uppercase.
    expect(isCountryCode("us")).toBe(false);
  });

  it("refuses a well-shaped code that is not assigned", () => {
    expect(isCountryCode("XX")).toBe(false);
  });
});

describe("usesUsAddressLabels", () => {
  it("says State and ZIP only for the US", () => {
    expect(usesUsAddressLabels("US")).toBe(true);
    expect(usesUsAddressLabels("CA")).toBe(false);
    expect(usesUsAddressLabels("GB")).toBe(false);
  });
});
