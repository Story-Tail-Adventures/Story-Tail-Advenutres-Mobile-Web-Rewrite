import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { claim } from "@/content/public/proof";
import { TRIPS } from "@/content/public/trips";
import { advisorTitle, tripBadge } from "./content";

describe("advisorTitle", () => {
  it("uses the registry figure for the trip the prototype counts", () => {
    const title = advisorTitle("sandals-royal-bahamian");
    expect(title).toBe(`Gyasi planned ${claim("plannedRoyalBahamian")} of these`);
    // The number is never typed in the copy module itself — it only ever comes from claim().
    // (__dirname is vitest's shim; import.meta.url is an http: URL under jsdom.)
    const source = readFileSync(join(__dirname, "content.ts"), "utf8");
    expect(source).not.toMatch(/\b14\b/);
  });

  it("falls back to the soft line for every other trip", () => {
    for (const trip of TRIPS.filter((t) => t.slug !== "sandals-royal-bahamian")) {
      expect(advisorTitle(trip.slug)).toBe("Gyasi knows this one well");
    }
  });
});

describe("tripBadge", () => {
  it("joins the type label and the nights", () => {
    expect(tripBadge({ type: "all-inclusive", nights: 7 })).toBe("All-inclusive · 7 nights");
    expect(tripBadge({ type: "cruise", nights: 1 })).toBe("Cruise · 1 night");
  });

  it("omits nights when the catalog has none", () => {
    expect(tripBadge({ type: "hotel" })).toBe("Hotel");
  });
});
