import { describe, expect, it } from "vitest";
import { parseSearchParams } from "@/lib/public/search";
import {
  activeFilterCount,
  chipHref,
  chipIsOn,
  chipsFor,
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

describe("chipsFor", () => {
  /**
   * The strip used to be MOBILE_CHIPS unconditionally, so Hotels mode showed
   * "All-inclusive / Cruise / Hotel / Adults-only / Family" over a list of Google hotels —
   * curated filters a hotel search never reads. It is `web:hidden`, so nothing at desktop
   * width could see it.
   */
  it("gives each mode only the axes that mode actually filters by", () => {
    const curated = chipsFor("picks").map((c) => c.param.kind);
    expect(new Set(curated)).toEqual(new Set(["type", "vibe"]));

    const hotels = chipsFor("hotels").map((c) => c.param.kind);
    expect(new Set(hotels)).toEqual(new Set(["star", "amenity", "rate"]));
    expect(hotels).not.toContain("type");
    expect(hotels).not.toContain("vibe");

    // The public cruise catalog has no filter vocabulary yet — same reason FilterRail
    // renders only hidden echoes for it.
    expect(chipsFor("cruises")).toEqual([]);
  });

  it("toggles a hotel chip into the URL and back out without disturbing the search", () => {
    const q = parseSearchParams({ dest: "Aruba", in: "2026-09-20", out: "2026-09-27", mode: "hotels" });
    const spa = chipsFor("hotels").find((c) => c.label === "Spa")!;
    expect(chipIsOn(q, spa)).toBe(false);

    const on = toggleChip(q, spa);
    expect(on.amenities).toContain("10");
    expect(chipIsOn(on, spa)).toBe(true);
    // The search itself survives the toggle — that is what makes it a filter and not a reset.
    expect(on.dest).toBe("Aruba");
    expect(on.checkIn).toBe("2026-09-20");
    expect(on.checkOut).toBe("2026-09-27");

    const href = chipHref(q, spa);
    expect(href).toContain("amenity=10");
    expect(href).toContain("dest=Aruba");
    expect(toggleChip(on, spa).amenities).not.toContain("10");
  });

  it("counts only the active mode's filters", () => {
    const q = parseSearchParams({
      mode: "hotels", in: "2026-09-20", out: "2026-09-27",
      type: "cruise", vibe: "adults-only", star: "5", amenity: "6",
    });
    // Two hotel axes on, two curated ones echoed through — the count is 2, not 4.
    expect(activeFilterCount(q)).toBe(2);
    expect(activeFilterCount(parseSearchParams({ type: "cruise", vibe: "adults-only" }))).toBe(2);
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
