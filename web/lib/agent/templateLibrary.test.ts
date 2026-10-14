import { describe, expect, it } from "vitest";

import { groupTemplates, knownTags, matchesSearch, toTemplate, type MessageTemplate } from "./templateLibrary";

const t = (id: string, category: string, name: string, tags: string[] = [], body = ""): MessageTemplate =>
  toTemplate(
    { template_id: id, category, name, body, tags, archived: false, updated_at: "2026-10-14T23:30:00Z" },
    "America/Chicago",
  );

describe("templateLibrary", () => {
  it("groups in the library's order, A to Z inside each, empty groups left out", () => {
    const groups = groupTemplates([
      t("1", "pre_trip", "Pre-trip · 7 days"),
      t("2", "other", "zebra"),
      t("3", "lead_response", "Lead response"),
      t("4", "pre_trip", "Pre-trip · 14 days"),
      t("5", "other", "Apple"),
    ]);
    expect(groups.map((g) => [g.label, g.templates.map((x) => x.name)])).toEqual([
      ["Lead response", ["Lead response"]],
      ["Pre-trip", ["Pre-trip · 14 days", "Pre-trip · 7 days"]],
      ["Other", ["Apple", "zebra"]],
    ]);
  });

  it("an unknown category files under Other rather than vanishing", () => {
    expect(t("1", "newsletter", "x").category).toBe("other");
  });

  it("Last edited is the day in the advisor's zone", () => {
    // 23:30 UTC on the 14th is still the 14th in Chicago.
    expect(t("1", "other", "x").lastEditedLabel).toBe("Last edited Oct 14");
  });

  it("search needs every word, in the name, a tag or the body", () => {
    const x = t("1", "other", "Lead response", ["Honeymoon"], "Thanks for reaching out");
    expect(matchesSearch(x, "")).toBe(true);
    expect(matchesSearch(x, "honeymoon thanks")).toBe(true);
    expect(matchesSearch(x, "lead cruise")).toBe(false);
  });

  it("tag suggestions are A to Z, first spelling kept", () => {
    expect(knownTags([t("1", "other", "a", ["Beach", "honeymoon"]), t("2", "other", "b", ["beach", "Cruise"])])).toEqual([
      "Beach",
      "Cruise",
      "honeymoon",
    ]);
  });
});
