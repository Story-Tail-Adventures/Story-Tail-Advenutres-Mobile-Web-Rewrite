import { describe, expect, it } from "vitest";
import { parseSearchParams } from "@/lib/public/search";
import {
  activeFilterCount,
  chipHref,
  chipIsOn,
  inquiryFields,
  inquirySummary,
  MOBILE_CHIPS,
  toggleChip,
} from "./filters";

const chip = (id: string) => {
  const found = MOBILE_CHIPS.find((c) => c.id === id);
  if (!found) throw new Error(`no chip ${id}`);
  return found;
};

describe("toggleChip", () => {
  it("switches a type on and preserves every other param", () => {
    const q = parseSearchParams({ dest: "Nassau", vibe: "family", travelers: "2", when: "Aug 12 – 19", sort: "rating" });
    const next = toggleChip(q, chip("cruise"));
    expect(next.types).toEqual(["cruise"]);
    expect(next.vibes).toEqual(["family"]);
    expect(next.dest).toBe("Nassau");
    expect(next.when).toBe("Aug 12 – 19");
    expect(next.travelers).toBe(2);
    expect(next.sort).toBe("rating");
  });

  it("switches a type off when it is already on", () => {
    const q = parseSearchParams({ type: ["cruise", "hotel"] });
    expect(toggleChip(q, chip("cruise")).types).toEqual(["hotel"]);
  });

  it("toggles vibes independently of types, and back again", () => {
    const q = parseSearchParams({ type: "cruise" });
    const on = toggleChip(q, chip("family"));
    expect(on.vibes).toEqual(["family"]);
    expect(on.types).toEqual(["cruise"]);
    expect(toggleChip(on, chip("family")).vibes).toEqual([]);
  });

  it("does not mutate its input", () => {
    const q = parseSearchParams({ type: "cruise" });
    toggleChip(q, chip("cruise"));
    toggleChip(q, chip("family"));
    expect(q.types).toEqual(["cruise"]);
    expect(q.vibes).toEqual([]);
  });

  it("chipIsOn mirrors the query", () => {
    const q = parseSearchParams({ type: "hotel", vibe: "adults-only" });
    expect(chipIsOn(q, chip("hotel"))).toBe(true);
    expect(chipIsOn(q, chip("adults-only"))).toBe(true);
    expect(chipIsOn(q, chip("cruise"))).toBe(false);
    expect(chipIsOn(q, chip("family"))).toBe(false);
  });

  it("chipHref round-trips through the URL", () => {
    const q = parseSearchParams({ dest: "Aruba", sort: "price-asc" });
    const href = chipHref(q, chip("cruise"));
    expect(href.startsWith("/explore/results?")).toBe(true);
    const back = parseSearchParams(new URLSearchParams(href.split("?")[1]));
    expect(back.types).toEqual(["cruise"]);
    expect(back.dest).toBe("Aruba");
    expect(back.sort).toBe("price-asc");
  });
});

describe("activeFilterCount", () => {
  it("counts switched-on values across the three groups", () => {
    expect(activeFilterCount(parseSearchParams({}))).toBe(0);
    expect(activeFilterCount(parseSearchParams({ type: ["cruise", "hotel"], vibe: "family", budget: "2k-4k" }))).toBe(4);
    // Free-text and topic are not "filters" the chip counts.
    expect(activeFilterCount(parseSearchParams({ dest: "Nassau", topic: "cruises" }))).toBe(0);
  });
});

describe("inquiryFields / inquirySummary", () => {
  it("falls back to friendly placeholders for an empty query", () => {
    const fields = inquiryFields(parseSearchParams({}));
    expect(fields.map((f) => f.value)).toEqual(["Anywhere", "Flexible dates", "Any group", "Any"]);
    expect(fields.map((f) => f.icon)).toEqual(["map", "calendar", "user", "palm"]);
    expect(inquirySummary(parseSearchParams({}))).toBe("Anywhere · Flexible dates · Any group");
  });

  it("reflects the query, pluralises travelers and names a single trip type", () => {
    const q = parseSearchParams({ dest: "Caribbean", when: "Aug 12 – 19", travelers: "2", type: "cruise" });
    expect(inquiryFields(q).map((f) => f.value)).toEqual(["Caribbean", "Aug 12 – 19", "2 travelers", "Cruise"]);
    expect(inquirySummary(q)).toBe("Caribbean · Aug 12 – 19 · 2 travelers");
    expect(inquiryFields(parseSearchParams({ travelers: "1" }))[2].value).toBe("1 traveler");
    expect(inquiryFields(parseSearchParams({ type: ["cruise", "hotel"] }))[3].value).toBe("Any");
  });
});
