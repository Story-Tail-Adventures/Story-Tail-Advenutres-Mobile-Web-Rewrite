import { describe, expect, it } from "vitest";
import { LEGAL_DOCS, LEGAL_SLUGS } from "@/content/public/legal";
import { formatLegalDate, LEGAL_PAGE, legalHref } from "./content";

describe("formatLegalDate", () => {
  it("prints the prototype's long en-US form", () => {
    expect(formatLegalDate("2026-05-14")).toBe("May 14, 2026");
    expect(formatLegalDate("2026-09-02")).toBe("September 2, 2026");
  });

  it("does not drift a day in western time zones (formats in UTC)", () => {
    expect(formatLegalDate("2026-01-01")).toBe("January 1, 2026");
    expect(formatLegalDate("2026-01-01T00:00:00Z")).toBe("January 1, 2026");
  });

  it("formats every document's lastUpdated", () => {
    for (const slug of LEGAL_SLUGS) {
      expect(formatLegalDate(LEGAL_DOCS[slug].lastUpdated)).not.toMatch(/Invalid/);
    }
  });
});

describe("legalHref", () => {
  it("builds the footer route for each document", () => {
    for (const slug of LEGAL_SLUGS) expect(legalHref(slug)).toBe(`/legal/${slug}`);
  });
});

describe("LEGAL_PAGE copy", () => {
  it("names the print action the same way in the button and the tip", () => {
    expect(LEGAL_PAGE.tip).toContain(LEGAL_PAGE.print);
  });
});
